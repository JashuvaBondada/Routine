/*  PosterMotion.jsx  (Adobe After Effects 2020 or newer)
 *
 *  File > Scripts > Run Script File... and pick this file. A dialog asks for:
 *    - the layered poster PSD (leave empty to animate the comp that's open)
 *    - a song, and the time in the song to start from (e.g. 1:23.5 or 83.5)
 *  It imports everything and animates the poster in this order:
 *    black -> artist photo -> red frame draws around -> diagonal line + red half box
 *    -> location logo + date -> top and bottom logos -> artist name rolls in
 *    letter by letter -> hold, with the song fading out at the end.
 *
 *  Layers are recognised by where they sit on the poster and what kind of layer
 *  they are (photo, multiply fill, full-frame border, text...), so layer names
 *  don't matter. Tick "Let me check which layer is which" to review the picks.
 *  Everything is one undo step (Edit > Undo).
 */

// Sorts poster layers into roles from their position and type.
// items: [{ name, x0, y0, x1, y1, blend ("multiply"...), adjustment, kind }], in comp pixels.
function classifyPosterLayers(items, W, H) {
    var R = { background: null, person: null, border: null, redBox: null, location: null,
              date: [], name: [], live: null, subtitle: null, top: [], bottom: [] };
    var SKIP = /gradient map|adjust|curves|levels|hue|saturation|brightness|black & white|photo filter|vibrance|exposure|channel mixer|color lookup/i;
    var rest = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.adjustment || SKIP.test(it.name) || it.kind === "audio") continue;
        it.w = it.x1 - it.x0; it.h = it.y1 - it.y0;
        it.cx = (it.x0 + it.x1) / 2 / W; it.cy = (it.y0 + it.y1) / 2 / H;
        it.full = it.w >= 0.95 * W && it.h >= 0.95 * H;
        rest.push(it);
    }
    function take(pred) {
        for (var j = 0; j < rest.length; j++) if (pred(rest[j])) return rest.splice(j, 1)[0];
        return null;
    }
    // The red half box: a multiply layer or a colour fill spanning the width.
    R.redBox = take(function (L) { return L.blend === "multiply" && L.w >= 0.9 * W; }) ||
               take(function (L) { return /color fill|colour fill|red|box|diagonal/i.test(L.name) && L.w >= 0.9 * W; });
    // Full-frame layers: the lowest is the background, the next one up is the red frame.
    R.background = take(function (L) { return /^background$/i.test(L.name); });
    var fulls = [];
    for (var f = 0; f < rest.length; f++) if (rest[f].full) fulls.push(rest.splice(f--, 1)[0]); // items are bottom-up
    if (!R.background && fulls.length) R.background = fulls.shift();
    if (fulls.length) R.border = fulls[0];
    // Photo: the biggest remaining layer.
    var big = -1, bi = -1;
    for (var p = 0; p < rest.length; p++) { var a = rest[p].w * rest[p].h; if (a > big) { big = a; bi = p; } }
    if (bi >= 0 && big > 0.2 * W * H) R.person = rest.splice(bi, 1)[0];

    // Everything else by height on the poster.
    var locs = [], names = [];
    for (var q = 0; q < rest.length; q++) {
        var L = rest[q];
        if (L.cy < 0.12) R.top.push(L);
        else if (L.cy < 0.195) locs.push(L);
        else if (L.cy < 0.25) R.date.push(L);
        else if (L.cy >= 0.86) R.bottom.push(L);
        else if (L.cy >= 0.6) names.push(L);
    }
    function byX(a, b) { return a.cx - b.cx; }
    R.top.sort(byX); R.bottom.sort(byX);
    locs.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
    R.location = locs[0] || null;
    for (var e = 1; e < locs.length; e++) R.date.push(locs[e]);
    // In the name area: tall text is the name, a small block on the right is (LIVE),
    // and the rest is the subtitle line.
    names.sort(function (a, b) { return b.h - a.h; });
    for (var n = 0; n < names.length; n++) {
        var t = names[n];
        if (t.h >= 0.05 * H) R.name.push(t);
        else if (!R.live && t.cx > 0.7 && t.w < 0.12 * W) R.live = t;
        else if (!R.subtitle) R.subtitle = t;
        else R.name.push(t);
    }
    return R;
}

(function () {
    if (typeof app === "undefined") return; // loaded outside After Effects (tests)

    var ANIM_END = 9.5; // seconds; the comp is at least this long
    var RED = [148 / 255, 2 / 255, 3 / 255];
    var step = "starting";

    // ---------------- dialogs ----------------
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
        var psd = fileRow("Poster PSD", "*.psd;*.psb");
        var song = fileRow("Song", "*.mp3;*.wav;*.aif;*.aiff;*.m4a;*.aac");
        var g2 = d.add("group"); g2.add("statictext", undefined, "Start song at").preferredSize.width = 90;
        var start = g2.add("edittext", undefined, "0:00"); start.preferredSize.width = 80;
        g2.add("statictext", undefined, "(m:ss or seconds)");
        var g3 = d.add("group"); g3.add("statictext", undefined, "Video length").preferredSize.width = 90;
        var len = g3.add("edittext", undefined, "15"); len.preferredSize.width = 80;
        g3.add("statictext", undefined, "seconds (min " + ANIM_END + ")");
        d.add("statictext", undefined, "Leave Poster PSD empty to animate the comp that is open now.");
        var check = d.add("checkbox", undefined, "Let me check which layer is which");
        var rq = d.add("checkbox", undefined, "Add to Render Queue when done"); rq.value = true;
        var b = d.add("group"); b.alignment = "right";
        b.add("button", undefined, "Cancel", { name: "cancel" });
        b.add("button", undefined, "Animate", { name: "ok" });
        if (d.show() !== 1) return null;
        return { psd: psd.text, song: song.text, start: start.text, length: len.text, check: check.value, renderQueue: rq.value };
    }

    function reviewRoles(R, layers) {
        var ROLES = [
            ["background", "Poster background"], ["person", "Artist photo"],
            ["border", "Red frame (hidden, it gets drawn)"], ["redBox", "Red half box"],
            ["location", "Location logo"], ["date.0", "Date 1"], ["date.1", "Date 2"],
            ["name.0", "Artist name"], ["live", "(LIVE)"], ["subtitle", "Subtitle"],
            ["top.0", "Top logo 1"], ["top.1", "Top logo 2"], ["top.2", "Top logo 3"],
            ["bottom.0", "Bottom logo 1"], ["bottom.1", "Bottom logo 2"]
        ];
        function get(key) { var k = key.split("."); return k.length > 1 ? (R[k[0]][+k[1]] || null) : R[key]; }
        var labels = ["(none)"];
        for (var i = 0; i < layers.length; i++) labels.push(layers[i].index + ". " + layers[i].name);
        var d = new Window("dialog", "Poster Motion - check the layers");
        d.orientation = "column"; d.alignChildren = ["fill", "top"];
        d.add("statictext", undefined, "Fix any wrong picks. (none) skips that part.");
        var drops = [];
        for (var r = 0; r < ROLES.length; r++) {
            var g = d.add("group");
            g.add("statictext", undefined, ROLES[r][1]).preferredSize.width = 210;
            var dd = g.add("dropdownlist", undefined, labels); dd.preferredSize.width = 260;
            var cur = get(ROLES[r][0]), sel = 0;
            for (var j = 0; j < layers.length; j++) if (cur && layers[j] === cur.layer) sel = j + 1;
            dd.selection = sel;
            drops.push(dd);
        }
        var bt = d.add("group"); bt.alignment = "right";
        bt.add("button", undefined, "Cancel", { name: "cancel" });
        bt.add("button", undefined, "Animate", { name: "ok" });
        if (d.show() !== 1) return null;
        var out = { date: [], name: [], top: [], bottom: [] };
        for (var k = 0; k < ROLES.length; k++) {
            var s = drops[k].selection ? drops[k].selection.index : 0;
            var v = s > 0 ? { layer: layers[s - 1] } : null;
            var key = ROLES[k][0].split(".");
            if (key.length > 1) { if (v) out[key[0]].push(v); } else out[key[0]] = v;
        }
        // Keep any extra name lines the automatic pass found.
        for (var e = 1; e < R.name.length; e++) out.name.push(R.name[e]);
        return out;
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
    var E = new KeyframeEase(0, 80);
    // Sets all keyframes in one call, then eases them.
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

    // Layer bounds in comp pixels (no rotation assumed, which is how PSDs import).
    function boundsOf(L) {
        var r = L.sourceRectAtTime(0, false);
        var p = tr(L, "ADBE Position").value, a = tr(L, "ADBE Anchor Point").value, s = tr(L, "ADBE Scale").value;
        var sx = s[0] / 100, sy = s[1] / 100;
        var x0 = p[0] + (r.left - a[0]) * sx, y0 = p[1] + (r.top - a[1]) * sy;
        return { x0: x0, y0: y0, x1: x0 + r.width * sx, y1: y0 + r.height * sy };
    }
    function describe(comp) {
        var items = [], layers = [];
        for (var i = comp.numLayers; i >= 1; i--) { // bottom to top
            var L = comp.layer(i);
            if (!(L instanceof AVLayer) && !(L instanceof TextLayer) && !(L instanceof ShapeLayer)) continue;
            var it = { layer: L, name: L.name, adjustment: L.adjustmentLayer, kind: (L.hasVideo ? "video" : "audio"),
                       blend: L.blendingMode === BlendingMode.MULTIPLY ? "multiply" : "" };
            try { var b = boundsOf(L); it.x0 = b.x0; it.y0 = b.y0; it.x1 = b.x1; it.y1 = b.y1; } catch (e) { continue; }
            items.push(it);
        }
        for (var j = 1; j <= comp.numLayers; j++) layers.push(comp.layer(j));
        return { items: items, layers: layers };
    }

    // PSD text arrives as pixels; turn it into a text layer so it can roll.
    function editableText(comp, L) {
        if (L.property("ADBE Text Properties")) return L;
        try {
            var cmd = app.findMenuCommandId("Convert to Editable Text");
            if (!cmd) return null;
            comp.openInViewer();
            for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            L.selected = true;
            app.executeCommand(cmd);
            var sel = comp.selectedLayers;
            return (sel.length && sel[0].property("ADBE Text Properties")) ? sel[0] : null;
        } catch (e) { return null; }
    }

    function rollText(L, t0, step, roll) {
        var st = L.property("ADBE Text Properties").property("ADBE Text Document");
        var finalText = st.value.text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
        st.expression = [
            'var f = "' + finalText + '", t0 = ' + t0 + ', step = ' + step + ', roll = ' + roll + ';',
            'var up = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lo = "abcdefghijklmnopqrstuvwxyz", dig = "0123456789", out = "", n = 0;',
            'for (var i = 0; i < f.length; i++) {',
            '  var c = f.charAt(i);',
            '  if (c == " " || c == "\\r" || c == "\\n") { out += c; continue; }',
            '  if (time < t0 + n * step * 0.5) out += " ";',
            '  else if (time >= t0 + roll + n * step) out += c;',
            '  else { seedRandom(i * 7 + Math.floor(time * 15), true);',
            '    var p = dig.indexOf(c) >= 0 ? dig : up.indexOf(c) >= 0 ? up : lo.indexOf(c) >= 0 ? lo : c;',
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

    // ---- the diagonal edge of the red box: y = H*(1489 - 0.792*x*1080/W)/1920 ----
    function diagY(x, W, H) { return H * (1489 - 0.792 * x * 1080 / W) / 1920; }
    function toLayer(L, pt) {
        var p = tr(L, "ADBE Position").value, a = tr(L, "ADBE Anchor Point").value, s = tr(L, "ADBE Scale").value;
        return [(pt[0] - p[0]) / (s[0] / 100) + a[0], (pt[1] - p[1]) / (s[1] / 100) + a[1]];
    }
    function polyShape(L, pts) {
        var sh = new Shape(), v = [];
        for (var i = 0; i < pts.length; i++) v.push(toLayer(L, pts[i]));
        sh.vertices = v; sh.closed = true;
        return sh;
    }
    function addMask(L, name, mode) {
        var masks = L.property("ADBE Mask Parade");
        var m = masks.addProperty("ADBE Mask Atom");
        m.name = name; m.maskMode = mode;
        return m.propertyIndex;
    }
    // Area below the diagonal, pushed down by `off` pixels (off = H hides it all).
    function belowDiagonal(L, W, H, off) {
        var m = 60;
        return polyShape(L, [[-m, diagY(-m, W, H) + off], [W + m, diagY(W + m, W, H) + off], [W + m, H * 3], [-m, H * 3]]);
    }
    function aboveDiagonal(L, W, H) {
        var m = 60;
        return polyShape(L, [[-m, -m], [W + m, -m], [W + m, diagY(W + m, W, H)], [-m, diagY(-m, W, H)]]);
    }
    // Sweeps the area below the diagonal in from the bottom-right corner.
    function diagonalWipe(L, W, H, t0, t1, keepTop) {
        var masks = L.property("ADBE Mask Parade");
        var had = masks.numProperties;
        if (keepTop) masks.property(addMask(L, "Top half", MaskMode.ADD)).property("ADBE Mask Shape").setValue(aboveDiagonal(L, W, H));
        // Photo: top half OR swept area. Red box: its own PSD mask AND the swept area.
        var idx = addMask(L, "Diagonal wipe", (had && !keepTop) ? MaskMode.INTERSECT : MaskMode.ADD);
        var path = L.property("ADBE Mask Parade").property(idx).property("ADBE Mask Shape");
        keys(path, [t0, t1], [belowDiagonal(L, W, H, H), belowDiagonal(L, W, H, 0)]);
    }

    // ---------------- main ----------------
    function animate(comp, opts, missing) {
        var W = comp.width, H = comp.height;
        var total = Math.max(ANIM_END, parseFloat(opts.length) || 0);
        comp.duration = total;
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).outPoint < total) comp.layer(i).outPoint = total;

        step = "recognising layers";
        var info = describe(comp);
        var R = classifyPosterLayers(info.items, W, H);
        if (opts.check) { R = reviewRoles(R, info.layers); if (!R) throw new Error("Cancelled."); }
        function L(e) { return e ? e.layer : null; }
        function needOne(e, label) { if (!e) missing.push(label); return L(e); }
        function needAll(list, label) { if (!list.length) missing.push(label); var o = []; for (var k = 0; k < list.length; k++) o.push(list[k].layer); return o; }
        var bg = L(R.background), person = needOne(R.person, "artist photo"), border = L(R.border);
        var redBox = needOne(R.redBox, "red half box"), loc = needOne(R.location, "location logo");
        var dates = needAll(R.date, "date"), names = needAll(R.name, "artist name");
        var live = L(R.live), sub = L(R.subtitle);
        var top = needAll(R.top, "top logos"), bottom = needAll(R.bottom, "bottom logos");

        // 1. Black, then the artist photo (only its top half until the red box arrives).
        step = "black background and photo";
        comp.layers.addSolid([0, 0, 0], "Black BG", W, H, comp.pixelAspect, total).moveToEnd();
        if (bg) fadeIn(bg, 0.4, 1.5);
        if (person) {
            // The PSD's gradient map may not survive import; Tint keeps the photo black and white either way.
            person.property("ADBE Effect Parade").addProperty("ADBE Tint");
            diagonalWipe(person, W, H, 2.75, 3.55, true);
            fadeIn(person, 0.4, 1.5);
            scaleKeys(person, [0.4, 2.4, total], [110, 100, 100 + 2.5 * total / ANIM_END]);
        }

        // 2. Red frame: hidden at first, a thin line draws around, then thickens.
        step = "red frame";
        var fw = Math.round(W * 22 / 1080);
        if (border) border.enabled = false;
        var fr = strokeShape(comp, "Frame Stroke", function (v) {
            v.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([W - fw, H - fw]);
        }, RED, 4);
        keys(fr.trim.property("ADBE Vector Trim Start"), [1.2, 2.4], [50, 0]);
        keys(fr.trim.property("ADBE Vector Trim End"), [1.2, 2.4], [50, 100]);
        keys(fr.stroke.property("ADBE Vector Stroke Width"), [2.3, 2.8], [4, fw]);
        fr.layer.inPoint = 1.2;

        // 3. Diagonal line draws, then the red half box sweeps in up to it.
        step = "diagonal line and red box";
        var dl = strokeShape(comp, "Diagonal Line", function (v) {
            var sh = new Shape();
            sh.vertices = [[-W / 2, diagY(0, W, H) - H / 2], [W / 2, diagY(W, W, H) - H / 2]];
            sh.closed = false;
            v.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
        }, [225 / 255, 20 / 255, 26 / 255], Math.max(2, Math.round(W * 4 / 1080)));
        keys(dl.trim.property("ADBE Vector Trim End"), [2.3, 2.95], [0, 100]);
        keys(tr(dl.layer, "ADBE Opacity"), [3.4, 3.8], [100, 0]);
        dl.layer.inPoint = 2.3;
        if (redBox) diagonalWipe(redBox, W, H, 2.75, 3.55, false);

        // 4. Location rises, date pops.
        step = "location and date";
        if (loc) { fadeIn(loc, 3.4, 3.8); slide(loc, 3.4, 4.1, H * 0.035); }
        for (var d = 0; d < dates.length; d++) { fadeIn(dates[d], 3.8, 4.05); scaleKeys(dates[d], [3.8, 4.15, 4.35], [50, 108, 100]); }

        // 5. Top logos drop in while the bottom logos rise in.
        step = "logos";
        for (var t = 0; t < top.length; t++) { var a = 4.3 + t * 0.12; fadeIn(top[t], a, a + 0.6); slide(top[t], a, a + 0.6, -H * 0.016); }
        for (var b = 0; b < bottom.length; b++) { var c = 4.4 + b * 0.12; fadeIn(bottom[b], c, c + 0.6); slide(bottom[b], c, c + 0.6, H * 0.016); }

        // 6. Last: artist name, (LIVE) and subtitle roll in.
        step = "artist name roll";
        function textIn(layer, t0, stp, roll) {
            if (!layer) return;
            var T = editableText(comp, layer);
            if (T) rollText(T, t0, stp, roll);
            else { fadeIn(layer, t0, t0 + 0.4); slide(layer, t0, t0 + 0.6, H * 0.03); }
        }
        for (var j = 0; j < names.length; j++) textIn(names[j], 5.1 + j * 0.25, 0.07, 0.55);
        textIn(live, 6.25, 0.08, 0.3);
        textIn(sub, 6.1, 0.04, 0.3);
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
        L.startTime = -startAt; // the chosen moment in the song plays at 0:00
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
        // "Composition - Retain Layer Sizes" keeps each layer's own bounds.
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

    var missing = [], failed = null;
    app.beginUndoGroup("Poster Motion");
    try {
        step = "importing the PSD";
        var comp = opts.psd ? importPoster(opts.psd) : app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Pick a PSD, or open the poster's composition before running the script.");
        if (opts.psd) comp.name = File(opts.psd).displayName.replace(/\.[^.]+$/, "") + " - Motion";
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
    if (missing.length) msg += "\n\nCouldn't recognise: " + missing.join(", ") +
        ".\nEdit > Undo, run it again and tick \"Let me check which layer is which\".";
    alert(msg);
})();
