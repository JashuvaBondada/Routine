/*  PosterMotion.jsx  (Adobe After Effects 2020 or newer)
 *
 *  File > Scripts > Run Script File... and pick this file. A dialog asks for:
 *    - the layered poster PSD (leave empty to animate the comp that's open)
 *    - a song, and the time in the song to start from (e.g. 1:23.5 or 83.5)
 *  It then imports everything and animates the poster in this order:
 *    black -> person -> red frame stroke draws around -> diagonal line + red box
 *    wipe -> location logo + date -> artist name rolls in letter by letter
 *    -> top logos -> bottom logos -> hold, with the song fading out at the end.
 *
 *  Layers are found by name, including inside PSD groups (see LAYERS below).
 *  PSD text is converted to editable text automatically so the letter roll works.
 *  Everything is one undo step (Edit > Undo).
 */
(function () {
    var LAYERS = {
        background: ["background", "bg", "backdrop"],
        person:     ["person", "artist photo", "photo", "model", "portrait", "image"],
        border:     ["border", "frame", "stroke", "outline"],
        location:   ["the location", "location", "venue"],
        date:       ["date", "30th", "oct"],
        name:       ["giorgia", "angiuli", "artist name", "name", "headliner"],
        live:       ["(live)", "live"],
        subtitle:   ["halloween", "weekend", "subtitle"],
        topLogos:   ["pinnacle", "dynamo", "flub"],
        bottomLogos:["heineken", "dsk"],
        redBox:     ["red box", "diagonal", "panel", "triangle", "red", "box"] // loosest, matched last
    };
    var ANIM_END = 9.5; // seconds; the comp is at least this long
    var RED = [148 / 255, 2 / 255, 3 / 255];

    // ---------------- dialog ----------------
    function askInputs() {
        var d = new Window("dialog", "Poster Motion");
        d.orientation = "column"; d.alignChildren = ["fill", "top"];

        function fileRow(label, filter) {
            var g = d.add("group"); g.add("statictext", undefined, label).preferredSize.width = 90;
            var path = g.add("edittext", undefined, ""); path.preferredSize.width = 300;
            var btn = g.add("button", undefined, "Browse...");
            btn.onClick = function () { var f = File.openDialog("Choose " + label.toLowerCase(), filter); if (f) path.text = f.fsName; };
            return path;
        }
        var psd = fileRow("Poster PSD", "*.psd;*.psb;*.ai");
        var song = fileRow("Song", "*.mp3;*.wav;*.aif;*.aiff;*.m4a;*.aac");

        var g2 = d.add("group"); g2.add("statictext", undefined, "Start song at").preferredSize.width = 90;
        var start = g2.add("edittext", undefined, "0:00"); start.preferredSize.width = 80;
        g2.add("statictext", undefined, "(m:ss or seconds)");

        var g3 = d.add("group"); g3.add("statictext", undefined, "Video length").preferredSize.width = 90;
        var len = g3.add("edittext", undefined, "15"); len.preferredSize.width = 80;
        g3.add("statictext", undefined, "seconds (min " + ANIM_END + ")");

        d.add("statictext", undefined, "Leave Poster PSD empty to animate the comp that is open now.");
        var rq = d.add("checkbox", undefined, "Add to Render Queue when done"); rq.value = true;

        var b = d.add("group"); b.alignment = "right";
        b.add("button", undefined, "Cancel", { name: "cancel" });
        b.add("button", undefined, "Animate", { name: "ok" });
        if (d.show() !== 1) return null;
        return { psd: psd.text, song: song.text, start: start.text, length: len.text, renderQueue: rq.value };
    }

    function parseTime(s) {
        s = String(s).replace(/\s/g, "");
        if (!s) return 0;
        var parts = s.split(":"), t = 0;
        for (var i = 0; i < parts.length; i++) {
            var v = parseFloat(parts[i]);
            if (isNaN(v)) return NaN;
            t = t * 60 + v;
        }
        return t;
    }

    // ---------------- helpers ----------------
    function lower(s) { return String(s).toLowerCase(); }

    // Every layer in the comp and in nested PSD-group precomps, gathered once.
    function collect(comp, out, seen) {
        seen[comp.id] = true;
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            out.push({ layer: L, comp: comp, name: lower(L.name) });
            if (L.source instanceof CompItem && !seen[L.source.id]) collect(L.source, out, seen);
        }
        return out;
    }
    function makeFinder(all) {
        var used = [];
        function one(keys) {
            for (var k = 0; k < keys.length; k++)
                for (var i = 0; i < all.length; i++)
                    if (!used[i] && all[i].name.indexOf(keys[k]) >= 0) { used[i] = true; return all[i]; }
            return null;
        }
        function each(keys) {
            var out = [];
            for (var k = 0; k < keys.length; k++) { var r = one([keys[k]]); if (r) out.push(r); }
            return out;
        }
        return { one: one, each: each };
    }

    var E = new KeyframeEase(0, 80);
    // Sets all keyframes in one call (much faster than one call per key), then eases them.
    function keys(prop, times, values) {
        prop.setValuesAtTimes(times, values);
        var vt = prop.propertyValueType;
        var spatial = vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL;
        var dims = (!spatial && values[0] instanceof Array) ? values[0].length : 1;
        var e = []; for (var d = 0; d < dims; d++) e.push(E);
        for (var i = 1; i <= prop.numKeys; i++) prop.setTemporalEaseAtKey(i, e, e);
    }
    function tr(L, name) { return L.property("ADBE Transform Group").property(name); }
    function fadeIn(L, t0, t1) { keys(tr(L, "ADBE Opacity"), [t0, t1], [0, 100]); }
    function slide(L, t0, t1, dy) {
        var p = tr(L, "ADBE Position");
        if (p.dimensionsSeparated) { var y = tr(L, "ADBE Position_1"); keys(y, [t0, t1], [y.value + dy, y.value]); return; }
        var v = p.value, from = v.slice(0); from[1] += dy;
        keys(p, [t0, t1], [from, v]);
    }
    function scaleKeys(L, times, pct) {
        var out = [];
        for (var i = 0; i < pct.length; i++) out.push([pct[i], pct[i], 100]);
        keys(tr(L, "ADBE Scale"), times, out);
    }

    // PSD text arrives as pixels; turn it into a text layer so it can roll.
    function editableText(entry) {
        var L = entry.layer;
        if (L.property("ADBE Text Properties")) return L;
        try {
            var cmd = app.findMenuCommandId("Convert to Editable Text");
            if (!cmd) return null;
            entry.comp.openInViewer();
            for (var i = 1; i <= entry.comp.numLayers; i++) entry.comp.layer(i).selected = false;
            L.selected = true;
            app.executeCommand(cmd);
            var sel = entry.comp.selectedLayers;
            return (sel.length && sel[0].property("ADBE Text Properties")) ? sel[0] : null;
        } catch (e) { return null; }
    }

    function rollText(L, t0, step, roll) {
        var st = L.property("ADBE Text Properties").property("ADBE Text Document");
        var finalText = st.value.text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
        st.expression = [
            'var f = "' + finalText + '", t0 = ' + t0 + ', step = ' + step + ', roll = ' + roll + ';',
            'var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", dig = "0123456789", out = "", n = 0;',
            'for (var i = 0; i < f.length; i++) {',
            '  var c = f.charAt(i);',
            '  if (c == " " || c == "\\r" || c == "\\n") { out += c; continue; }',
            '  if (time < t0 + n * step * 0.5) out += " ";',
            '  else if (time >= t0 + roll + n * step) out += c;',
            '  else { seedRandom(i * 7 + Math.floor(time * 15), true);',
            '    var p = dig.indexOf(c) >= 0 ? dig : (abc.indexOf(c.toUpperCase()) >= 0 ? abc : c);',
            '    out += p.charAt(Math.floor(random(p.length))); }',
            '  n++;',
            '}',
            'out;'
        ].join("\n");
    }

    function strokeShape(comp, name, makePath, color, width) {
        var L = comp.layers.addShape(); L.name = name;
        var v = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
        makePath(v);
        v.addProperty("ADBE Vector Graphic - Stroke");
        v.addProperty("ADBE Vector Filter - Trim");
        // Adding a property invalidates earlier references to its siblings, so look them up afresh.
        var s = v.property("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(color);
        s.property("ADBE Vector Stroke Width").setValue(width);
        return { layer: L, stroke: s, trim: v.property("ADBE Vector Filter - Trim") };
    }

    // Guesses a layer for each part of the poster by name, then lets you correct
    // the guesses. Returns { role: entry } or null if cancelled.
    function matchLayers(comp, all) {
        var F = makeFinder(all), guess = {};
        // Guess order matters: loose words like "red" and "box" go last.
        guess.background = F.one(LAYERS.background);
        guess.person = F.one(LAYERS.person);
        guess.border = F.one(LAYERS.border);
        guess.location = F.one(LAYERS.location);
        guess.date = F.one(LAYERS.date);
        guess.name1 = F.one(LAYERS.name);
        guess.name2 = guess.name1 ? F.one(LAYERS.name) : null;
        guess.live = F.one(LAYERS.live);
        guess.subtitle = F.one(LAYERS.subtitle);
        var tops = F.each(LAYERS.topLogos), bots = F.each(LAYERS.bottomLogos);
        for (var i = 0; i < 3; i++) guess["top" + (i + 1)] = tops[i] || null;
        for (var j = 0; j < 2; j++) guess["bottom" + (j + 1)] = bots[j] || null;
        guess.redBox = F.one(LAYERS.redBox);

        var ROLES = [
            ["background", "Poster background"], ["person", "Person / photo"],
            ["border", "Red frame (hidden, it gets drawn)"], ["redBox", "Red diagonal box"],
            ["location", "Location logo"], ["date", "Date"],
            ["name1", "Artist name (line 1)"], ["name2", "Artist name (line 2)"],
            ["live", "(LIVE)"], ["subtitle", "Subtitle"],
            ["top1", "Top logo 1"], ["top2", "Top logo 2"], ["top3", "Top logo 3"],
            ["bottom1", "Bottom logo 1"], ["bottom2", "Bottom logo 2"]
        ];
        var labels = ["(none)"];
        for (var a = 0; a < all.length; a++)
            labels.push((all[a].comp === comp ? "" : all[a].comp.name + "  >  ") + all[a].layer.name);
        function indexOf(entry) { for (var b = 0; b < all.length; b++) if (all[b] === entry) return b + 1; return 0; }

        var d = new Window("dialog", "Poster Motion - check the layers");
        d.orientation = "column"; d.alignChildren = ["fill", "top"];
        d.add("statictext", undefined, "These are the layers the script guessed. Fix any that are wrong. Anything set to (none) is skipped.", { multiline: true }).preferredSize.width = 460;
        var drops = {};
        for (var r = 0; r < ROLES.length; r++) {
            var g = d.add("group");
            g.add("statictext", undefined, ROLES[r][1]).preferredSize.width = 200;
            var dd = g.add("dropdownlist", undefined, labels);
            dd.preferredSize.width = 250;
            dd.selection = indexOf(guess[ROLES[r][0]]);
            drops[ROLES[r][0]] = dd;
        }
        var bt = d.add("group"); bt.alignment = "right";
        bt.add("button", undefined, "Cancel", { name: "cancel" });
        bt.add("button", undefined, "Animate", { name: "ok" });
        if (d.show() !== 1) return null;

        var out = {};
        for (var key in drops) {
            var sel = drops[key].selection ? drops[key].selection.index : 0;
            out[key] = sel > 0 ? all[sel - 1] : null;
        }
        return out;
    }

    // ---------------- main ----------------
    function animate(comp, opts, missing) {
        var W = comp.width, H = comp.height;
        var total = Math.max(ANIM_END, parseFloat(opts.length) || 0);
        comp.duration = total;
        // The PSD's groups become precomps; stretch them and every layer to the full length.
        var all = collect(comp, [], {});
        for (var i = 0; i < all.length; i++) {
            var src = all[i].layer.source;
            if (src instanceof CompItem && src.duration < total) src.duration = total;
            if (all[i].layer.outPoint < total) all[i].layer.outPoint = total;
        }

        // Find every poster layer before adding any (adding layers renumbers them).
        var R = matchLayers(comp, all);
        if (!R) throw new Error("Cancelled.");
        function need(key, label) { if (!R[key]) missing.push(label); return R[key] ? R[key].layer : null; }
        function list(prefix, n) { var out = []; for (var k = 1; k <= n; k++) if (R[prefix + k]) out.push(R[prefix + k]); return out; }
        var bg = R.background, person = need("person", "person / photo"), border = R.border;
        var loc = need("location", "location logo"), date = need("date", "date");
        var names = list("name", 2);
        if (!names.length) missing.push("artist name");
        var live = R.live, sub = R.subtitle;
        var top = list("top", 3), bottom = list("bottom", 2);
        if (!top.length) missing.push("top logos");
        if (!bottom.length) missing.push("bottom logos");
        var redBox = need("redBox", "red diagonal box");

        // 1. Black background, then the poster's own background and the person.
        step = "black background and person";
        comp.layers.addSolid([0, 0, 0], "Black BG", W, H, comp.pixelAspect, total).moveToEnd();
        if (bg) fadeIn(bg.layer, 0.4, 1.5);
        if (person) { fadeIn(person, 0.4, 1.5); scaleKeys(person, [0.4, 2.4, total], [110, 100, 100 + 2.5 * total / ANIM_END]); }

        // 2. Red frame: thin line draws around, then thickens.
        step = "red frame stroke";
        var fw = Math.round(W * 22 / 1080);
        if (border) border.layer.enabled = false;
        var fr = strokeShape(comp, "Frame Stroke", function (v) {
            v.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([W - fw, H - fw]);
        }, RED, 4);
        keys(fr.trim.property("ADBE Vector Trim Start"), [1.2, 2.4], [50, 0]);
        keys(fr.trim.property("ADBE Vector Trim End"), [1.2, 2.4], [50, 100]);
        keys(fr.stroke.property("ADBE Vector Stroke Width"), [2.3, 2.8], [4, fw]);
        fr.layer.inPoint = 1.2; // nothing on screen until the line starts drawing

        // 3. Diagonal line draws, then the red box wipes in.
        step = "diagonal line and red box";
        var ya = H * 1489 / 1920, yb = H * (1489 - 0.792 * 1080) / 1920;
        var dl = strokeShape(comp, "Diagonal Line", function (v) {
            var sh = new Shape(); sh.vertices = [[-W / 2, ya - H / 2], [W / 2, yb - H / 2]]; sh.closed = false;
            v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
        }, [225 / 255, 20 / 255, 26 / 255], Math.max(2, Math.round(W * 4 / 1080)));
        keys(dl.trim.property("ADBE Vector Trim End"), [2.3, 2.95], [0, 100]);
        keys(tr(dl.layer, "ADBE Opacity"), [3.4, 3.8], [100, 0]);
        dl.layer.inPoint = 2.3;
        if (redBox) {
            var wipe = redBox.property("ADBE Effect Parade").addProperty("ADBE Linear Wipe");
            wipe.property("ADBE Linear Wipe-0002").setValue(180 + Math.atan(0.792) * 180 / Math.PI);
            keys(wipe.property("ADBE Linear Wipe-0001"), [2.75, 3.55], [100, 0]);
        }

        // 4. Location rises, date pops.
        step = "location and date";
        if (loc) { fadeIn(loc, 3.4, 3.8); slide(loc, 3.4, 4.1, H * 0.035); }
        if (date) { fadeIn(date, 3.8, 4.05); scaleKeys(date, [3.8, 4.15, 4.35], [50, 108, 100]); }

        // 5. Name, (LIVE) and subtitle roll in.
        step = "artist name roll";
        function textIn(entry, label, t0, step, roll) {
            if (!entry) { missing.push(label); return; }
            var T = editableText(entry);
            if (T) rollText(T, t0, step, roll);
            else { fadeIn(entry.layer, t0, t0 + 0.4); slide(entry.layer, t0, t0 + 0.6, H * 0.03); }
        }
        for (var j = 0; j < names.length; j++) textIn(names[j], "artist name", 4.0 + j * 0.25, 0.07, 0.55);
        textIn(live, "(LIVE)", 5.15, 0.08, 0.3);
        textIn(sub, "subtitle (Halloween Weekend)", 5.0, 0.04, 0.3);

        // 6. Top logos drop in, then bottom logos rise in.
        step = "logos";
        for (var t = 0; t < top.length; t++) { var a = 6.0 + t * 0.12; fadeIn(top[t].layer, a, a + 0.6); slide(top[t].layer, a, a + 0.6, -H * 0.016); }
        for (var b = 0; b < bottom.length; b++) { var c = 6.7 + b * 0.12; fadeIn(bottom[b].layer, c, c + 0.6); slide(bottom[b].layer, c, c + 0.6, H * 0.016); }
        return total;
    }

    function addSong(comp, path, startAt, total) {
        var f = new File(path);
        if (!f.exists) throw new Error("Song not found:\n" + path);
        var item = app.project.importFile(new ImportOptions(f));
        if (!item.hasAudio) throw new Error("That file has no audio:\n" + path);
        if (startAt >= item.duration) throw new Error("The start time is past the end of the song (" + Math.floor(item.duration) + " s).");
        var L = comp.layers.add(item);
        L.name = "Song";
        L.startTime = -startAt;          // the chosen moment in the song plays at 0:00
        L.inPoint = 0;
        L.outPoint = Math.min(total, item.duration - startAt);
        var end = L.outPoint, fade = Math.min(1.5, end / 3);
        L.property("ADBE Audio Group").property("ADBE Audio Levels")
            .setValuesAtTimes([0, 0.3, end - fade, end], [[-48, -48], [0, 0], [0, 0], [-48, -48]]);
        L.moveToEnd();
    }

    function importPoster(path) {
        var f = new File(path);
        if (!f.exists) throw new Error("PSD not found:\n" + path);
        var io = new ImportOptions(f);
        // "Composition - Retain Layer Sizes" keeps each layer's own bounds and anchor point.
        if (io.canImportAs(ImportAsType.COMP_CROPPED_LAYERS)) io.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        else if (io.canImportAs(ImportAsType.COMP)) io.importAs = ImportAsType.COMP;
        var item = app.project.importFile(io);
        if (!(item instanceof CompItem)) throw new Error("Couldn't import the PSD as a composition.");
        return item;
    }

    var opts = askInputs();
    if (!opts) return;
    var startAt = parseTime(opts.start);
    if (isNaN(startAt) || startAt < 0) { alert("Couldn't read the start time \"" + opts.start + "\". Use m:ss (1:23.5) or seconds (83.5)."); return; }

    var missing = [], failed = null, step = "importing the PSD";
    app.beginUndoGroup("Poster Motion");
    try {
        var comp = opts.psd ? importPoster(opts.psd) : app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Pick a PSD, or open the poster's composition before running the script.");
        if (opts.psd) comp.name = File(opts.psd).displayName.replace(/\.[^.]+$/, "") + " - Motion";
        step = "finding layers";
        var total = animate(comp, opts, missing);
        step = "adding the song";
        if (opts.song) addSong(comp, opts.song, startAt, total);
        comp.openInViewer();
        comp.time = 0;
        if (opts.renderQueue) app.project.renderQueue.items.add(comp);
    } catch (err) {
        failed = err;
    }
    app.endUndoGroup();

    if (failed && failed.message === "Cancelled.") { alert("Cancelled. Edit > Undo removes the imported PSD."); return; }
    if (failed) { alert("Poster Motion stopped while " + step + ":\n" + failed.message + (failed.line ? " (script line " + failed.line + ")" : "") + "\n\nEdit > Undo removes anything it added."); return; }
    var msg = "Done. Press the spacebar to preview." + (opts.renderQueue ? "\nThe comp is in the Render Queue." : "");
    if (missing.length) msg += "\n\nCouldn't find layers for:\n - " + missing.join("\n - ") +
        "\n\nRename them (see LAYERS at the top of the script), Edit > Undo, and run it again.";
    alert(msg);
})();
