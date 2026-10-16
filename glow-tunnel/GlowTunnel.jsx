/*  GlowTunnel.jsx  (Adobe After Effects 2020 or newer)
 *
 *  Story-size (1080x1920) glowing text tunnel: the word sits sharp in the middle
 *  while copies of it stream toward you on a floor and a ceiling, smeared into
 *  light streaks, tinted and glowing, with a gentle sway and film grain.
 *
 *  File > Scripts > Run Script File... and pick this file. The dialog asks for:
 *    - a PSD to take the text and font from (or type the text yourself)
 *    - the colour (orange by default), a song, where in the song to start,
 *      and the video length
 *
 *  Everything stays editable afterwards on the "CONTROLS" layer in the new comp:
 *    Color, Glow, Streaks, Squeeze, Speed, Growth, Stretch, Sway, Grain.
 *  To change the word later, edit "Main Text" and run the script again (the copies
 *  are duplicates made at build time).
 *  The whole run is one Edit > Undo.
 */
(function () {
    var W = 1080, H = 1920, FPS = 30;
    var DEFAULT_FONT = "Futura-CondensedExtraBold";
    var warnings = [];

    // ---------------- dialog ----------------
    function askInputs() {
        var d = new Window("dialog", "Glow Tunnel");
        d.orientation = "column"; d.alignChildren = ["fill", "top"];
        function row(label) { var g = d.add("group"); g.add("statictext", undefined, label).preferredSize.width = 95; return g; }
        function fileRow(label, filter) {
            var g = row(label);
            var path = g.add("edittext", undefined, ""); path.preferredSize.width = 290;
            g.add("button", undefined, "Browse...").onClick = function () {
                var f = File.openDialog("Choose " + label.toLowerCase(), filter); if (f) path.text = f.fsName;
            };
            return path;
        }
        var psd = fileRow("Text from PSD", "*.psd;*.psb");
        var g1 = row("or type text"); var text = g1.add("edittext", undefined, ""); text.preferredSize.width = 290;
        var g2 = row("Font"); var font = g2.add("edittext", undefined, ""); font.preferredSize.width = 290;
        d.add("statictext", undefined, "Font is the PostScript name; leave empty to use the PSD's font (or " + DEFAULT_FONT + ").");
        var caps = d.add("checkbox", undefined, "ALL CAPS"); caps.value = true;
        var g3 = row("Colour"); var color = g3.add("edittext", undefined, "#FF6A00"); color.preferredSize.width = 90;
        g3.add("statictext", undefined, "hex, e.g. #FF6A00 (orange)");
        var song = fileRow("Song", "*.mp3;*.wav;*.aif;*.aiff;*.m4a;*.aac");
        var g4 = row("Start song at"); var start = g4.add("edittext", undefined, "0:00"); start.preferredSize.width = 90;
        g4.add("statictext", undefined, "(m:ss or seconds)");
        var g5 = row("Video length"); var len = g5.add("edittext", undefined, "10"); len.preferredSize.width = 90;
        g5.add("statictext", undefined, "seconds");
        var rq = d.add("checkbox", undefined, "Add to Render Queue when done"); rq.value = true;
        var b = d.add("group"); b.alignment = "right";
        b.add("button", undefined, "Cancel", { name: "cancel" });
        b.add("button", undefined, "Create", { name: "ok" });
        if (d.show() !== 1) return null;
        return { psd: psd.text, text: text.text, font: font.text, caps: caps.value, color: color.text,
                 song: song.text, start: start.text, length: len.text, renderQueue: rq.value };
    }

    function parseTime(s) {
        s = String(s).replace(/\s/g, "");
        if (!s) return 0;
        var parts = s.split(":"), t = 0;
        for (var i = 0; i < parts.length; i++) { var v = parseFloat(parts[i]); if (isNaN(v)) return NaN; t = t * 60 + v; }
        return t;
    }
    function parseHex(s) {
        var m = String(s).replace(/\s/g, "").match(/^#?([0-9a-f]{6})$/i);
        if (!m) return null;
        var n = parseInt(m[1], 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    // ---------------- small helpers ----------------
    var EASE = new KeyframeEase(0, 75);
    function keys(prop, times, values) {
        prop.setValuesAtTimes(times, values);
        var dims = (values[0] instanceof Array && prop.propertyValueType !== PropertyValueType.TwoD_SPATIAL &&
                    prop.propertyValueType !== PropertyValueType.ThreeD_SPATIAL) ? values[0].length : 1;
        var e = []; for (var d = 0; d < dims; d++) e.push(EASE);
        for (var i = 1; i <= prop.numKeys; i++) prop.setTemporalEaseAtKey(i, e, e);
    }
    function tr(L, name) { return L.property("ADBE Transform Group").property(name); }

    // Adds the first effect this AE version knows, names it, and lets `setup` configure it
    // straight away (adding another effect later invalidates references to this one).
    function addEffect(L, matchNames, name, setup) {
        var fx = L.property("ADBE Effect Parade");
        for (var i = 0; i < matchNames.length; i++) {
            if (!fx.canAddProperty(matchNames[i])) continue;
            var e = fx.addProperty(matchNames[i]);
            if (name) e.name = name;
            if (setup) setup(e);
            return true;
        }
        warnings.push("Effect not available: " + name);
        return false;
    }
    // Sets an effect parameter found by any of its names; notes it instead of failing.
    function setParam(effect, names, value, expr) {
        for (var i = 0; i < names.length; i++) {
            var p = null;
            try { p = effect.property(names[i]); } catch (e) { p = null; }
            if (!p) continue;
            try {
                if (value !== undefined && value !== null) p.setValue(value);
                if (expr) p.expression = expr;
                return p;
            } catch (e2) { warnings.push(effect.name + " > " + names[i] + ": " + e2.message); return null; }
        }
        warnings.push("Couldn't find " + effect.name + " > " + names[0]);
        return null;
    }
    function ctl(name) { return 'thisComp.layer("CONTROLS").effect("' + name + '")(1)'; }

    // ---------------- text ----------------
    function styleText(L, s, font, size, tracking) {
        var st = L.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = st.value;
        doc.text = s;
        try { doc.font = font; } catch (e) { warnings.push("Font \"" + font + "\" isn't installed; using the default font."); }
        doc.fontSize = size;
        doc.applyFill = true; doc.fillColor = [1, 1, 1];
        doc.applyStroke = false;
        doc.justification = ParagraphJustification.CENTER_JUSTIFY;
        if (tracking !== undefined) doc.tracking = tracking;
        st.setValue(doc);
    }
    // Puts the anchor in the middle of the visible text and the text at (x, y).
    function centreText(L, x, y) {
        var r = L.sourceRectAtTime(0, false);
        tr(L, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr(L, "ADBE Position").setValue([x, y]);
        return r;
    }
    // Reads text and font from the PSD's text layer, converting it to editable text.
    function textFromPSD(path) {
        var f = new File(path);
        if (!f.exists) throw new Error("PSD not found:\n" + path);
        var io = new ImportOptions(f);
        if (io.canImportAs(ImportAsType.COMP_CROPPED_LAYERS)) io.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        var comp = app.project.importFile(io);
        if (!(comp instanceof CompItem)) throw new Error("Couldn't import the PSD as a composition.");
        // The text is the smallest visible layer that isn't the full-size background.
        var best = null, bestArea = 1e12;
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (!L.enabled || !(L instanceof AVLayer)) continue;
            var r = L.sourceRectAtTime(0, false), area = r.width * r.height;
            if (r.width >= comp.width * 0.95 && r.height >= comp.height * 0.95) continue;
            if (area < bestArea) { best = L; bestArea = area; }
        }
        if (!best) throw new Error("Couldn't find a text layer in the PSD.");
        var out = { text: best.name, font: "", tracking: undefined, comp: comp };
        try {
            var cmd = app.findMenuCommandId("Convert to Editable Text");
            if (cmd) {
                comp.openInViewer();
                for (var j = 1; j <= comp.numLayers; j++) comp.layer(j).selected = false;
                best.selected = true;
                app.executeCommand(cmd);
                var sel = comp.selectedLayers;
                if (sel.length && sel[0].property("ADBE Text Properties")) {
                    var doc = sel[0].property("ADBE Text Properties").property("ADBE Text Document").value;
                    out.text = doc.text; out.font = doc.font; out.tracking = doc.tracking;
                }
            }
        } catch (e) { warnings.push("Couldn't read the PSD text style, so only its text was used."); }
        return out;
    }

    // ---------------- build ----------------
    function build(opts) {
        var src = { text: "", font: "", tracking: undefined, comp: null };
        if (opts.psd) src = textFromPSD(opts.psd);
        var word = opts.text || src.text;
        word = String(word).replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");
        if (!word) throw new Error("Pick a PSD or type the text.");
        if (opts.caps) word = word.toUpperCase();
        var font = opts.font || src.font || DEFAULT_FONT;
        var color = parseHex(opts.color) || [1, 106 / 255, 0];
        var total = Math.max(3, parseFloat(opts.length) || 10);

        if (src.comp) src.comp.parentFolder = app.project.items.addFolder(word + " - PSD source");
        var cx = W / 2, cy = H / 2;

        // Measure the word: sized to 62% of the width.
        var main = app.project.items.addComp(word + " - Glow Tunnel", W, H, 1, total, FPS);
        // CONTROLS first: every expression below reads from it, and After Effects checks
        // an expression as soon as it is set.
        var c = main.layers.addNull(total);
        c.name = "CONTROLS";
        addEffect(c, ["ADBE Color Control"], "Color", function (e) { e.property(1).setValue(color); });
        function slider(name, v) { addEffect(c, ["ADBE Slider Control"], name, function (e) { e.property(1).setValue(v); }); }
        slider("Glow", 100);    // %
        slider("Streaks", 40);  // zoom blur amount
        slider("Squeeze", 0.5); // pinch strength (Bulge height)
        slider("Speed", 0.8);   // copies per second flowing outward
        slider("Growth", 1.6);  // each copy this much bigger than the last
        slider("Stretch", 25);  // % taller per copy
        slider("Sway", 3);      // degrees
        slider("Grain", 7);     // %
        var text = main.layers.addText(word);
        text.name = "Main Text";
        styleText(text, word, font, 200, src.tracking);
        var r = text.sourceRectAtTime(0, false);
        var size = Math.max(20, Math.round(200 * 0.62 * W / Math.max(1, r.width)));
        styleText(text, word, font, size, src.tracking);
        r = centreText(text, cx, cy);
        var th = r.height;

        // Background.
        main.layers.addSolid([0, 0, 0], "Black", W, H, 1, total).moveToEnd();

        // Copies of the word flowing outward above and below it. Copy k is Growth^k the size,
        // stretched taller by Stretch% per step; Speed is copies per second.
        var C = 'var c = thisComp.layer("CONTROLS"), g = Math.max(1.01, c.effect("Growth")(1)), ' +
                'sp = c.effect("Speed")(1), st = c.effect("Stretch")(1) / 100; ';
        function kExpr(i) { return 'var k = ' + i + ' + (time * sp) % 1; '; }
        var N_COPIES = 5;
        for (var i = 0; i < N_COPIES; i++) {
            for (var sgn = -1; sgn <= 1; sgn += 2) {
                var cp = text.duplicate();
                cp.name = "Copy " + (sgn < 0 ? "Up " : "Down ") + (i + 1);
                tr(cp, "ADBE Scale").expression = C + kExpr(i) +
                    'var s = Math.pow(g, k) * 100; [s, s * (1 + st * k)];';
                tr(cp, "ADBE Position").expression = C + kExpr(i) +
                    'var s = Math.pow(g, k), sy = s * (1 + st * k), th = ' + th.toFixed(2) + '; ' +
                    'var d = th * (0.1 + 0.95 * (s - 1) / (g - 1)) + th * 0.45 * sy; ' +
                    '[' + cx + ', ' + cy + ' + (' + sgn + ') * d];';
                tr(cp, "ADBE Opacity").expression = C + kExpr(i) +
                    'Math.min(1, k / 0.5) * 100 * ease(time, 0, 0.6, 0, 1);';
            }
        }

        // Squeeze + light streaks on everything below: a pulsing pinch (Bulge with negative
        // height), then a fast zoom blur from the centre (much quicker than Radial Blur).
        var streaks = main.layers.addSolid([1, 1, 1], "Squeeze + Streaks", W, H, 1, total);
        streaks.adjustmentLayer = true;
        addEffect(streaks, ["ADBE Bulge"], "Squeeze", function (e) {
            setParam(e, ["Horizontal Radius", "ADBE Bulge-0001"], W * 0.8);
            setParam(e, ["Vertical Radius", "ADBE Bulge-0002"], H * 0.5);
            setParam(e, ["Bulge Center", "ADBE Bulge-0003"], [cx, cy]);
            setParam(e, ["Bulge Height", "ADBE Bulge-0004"], null,
                "-" + ctl("Squeeze") + " * (1 + 0.4 * Math.sin(time * 2 * Math.PI * 0.45))");
        });
        var streakExpr = ctl("Streaks") + " * ease(time, 0, 1.2, 2, 1)";
        if (!addEffect(streaks, ["CC Radial Fast Blur"], "Zoom Streaks", function (e) {
            setParam(e, ["Center"], [cx, cy]);
            setParam(e, ["Amount"], null, streakExpr);
        })) {
            addEffect(streaks, ["ADBE Radial Blur"], "Zoom Streaks", function (e) {
                setParam(e, ["ADBE Radial Blur-0002", "Center"], [cx, cy]);
                setParam(e, ["ADBE Radial Blur-0003", "Type"], 2);
                setParam(e, ["ADBE Radial Blur-0001", "Amount"], null, "Math.min(100, " + streakExpr + ")");
            });
        }

        // Hourglass: darkens the side wedges, pinched toward the middle.
        var shade = main.layers.addSolid([0, 0, 0], "Hourglass Shade", W, H, 1, total);
        var m = shade.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        m.maskMode = MaskMode.SUBTRACT;
        var hg = new Shape();
        hg.vertices = [[0, 0], [W, 0], [cx + 0.27 * W, cy], [W, H], [0, H], [cx - 0.27 * W, cy]];
        hg.closed = true;
        shade.property("ADBE Mask Parade").property(1).property("ADBE Mask Shape").setValue(hg);
        shade.property("ADBE Mask Parade").property(1).property("ADBE Mask Feather").setValue([150, 150]);
        tr(shade, "ADBE Opacity").setValue(90);

        // Main word on top of the tunnel: scales in and fades up.
        text.moveToBeginning();
        keys(tr(text, "ADBE Scale"), [0, 1.0], [[130, 130, 100], [100, 100, 100]]);
        keys(tr(text, "ADBE Opacity"), [0, 0.5], [0, 100]);
        // A slight breathing squeeze on the main word, in time with the pinch.
        tr(text, "ADBE Scale").expression = "var q = " + ctl("Squeeze") + " * 4 * Math.sin(time * 2 * Math.PI * 0.45); [value[0] - q, value[1] + q * 1.5, value[2]];";

        // Look: sway, colour, glow, grain over everything.
        var look = main.layers.addSolid([1, 1, 1], "Look (colour + glow)", W, H, 1, total);
        look.adjustmentLayer = true;
        look.moveToBeginning();
        addEffect(look, ["ADBE Geometry2"], "Sway", function (e) {
            setParam(e, ["ADBE Geometry2-0001", "Anchor Point"], [cx, cy]);
            setParam(e, ["ADBE Geometry2-0002", "Position"], [cx, cy]);
            setParam(e, ["Rotation", "ADBE Geometry2-0007"], null, "Math.sin(time * 0.9) * " + ctl("Sway"));
        });
        addEffect(look, ["ADBE Tint"], "Colour", function (e) {
            setParam(e, ["ADBE Tint-0001", "Map Black To"], [0, 0, 0]);
            setParam(e, ["ADBE Tint-0002", "Map White To"], null, ctl("Color"));
        });
        addEffect(look, ["ADBE Glo2"], "Glow Wide", function (e) {
            setParam(e, ["Glow Threshold", "ADBE Glo2-0002"], 35);
            setParam(e, ["Glow Radius", "ADBE Glo2-0003"], 110);
            setParam(e, ["Glow Intensity", "ADBE Glo2-0004"], null, "1.4 * " + ctl("Glow") + " / 100");
        });
        addEffect(look, ["ADBE Glo2"], "Glow Tight", function (e) {
            setParam(e, ["Glow Threshold", "ADBE Glo2-0002"], 55);
            setParam(e, ["Glow Radius", "ADBE Glo2-0003"], 22);
            setParam(e, ["Glow Intensity", "ADBE Glo2-0004"], null, "1.0 * " + ctl("Glow") + " / 100");
        });
        addEffect(look, ["ADBE Noise"], "Grain", function (e) {
            setParam(e, ["Amount of Noise", "ADBE Noise-0001"], null, ctl("Grain"));
            setParam(e, ["Use Color Noise", "ADBE Noise-0002"], 0);
        });

        c.moveToBeginning();
        return main;
    }

    function addSong(comp, path, startAt) {
        var f = new File(path);
        if (!f.exists) throw new Error("Song not found:\n" + path);
        var item = app.project.importFile(new ImportOptions(f));
        if (!item.hasAudio) throw new Error("That file has no audio:\n" + path);
        if (startAt >= item.duration) throw new Error("The start time is past the end of the song (" + Math.floor(item.duration) + " s).");
        var L = comp.layers.add(item);
        L.name = "Song";
        L.startTime = -startAt;
        L.inPoint = 0;
        L.outPoint = Math.min(comp.duration, item.duration - startAt);
        var end = L.outPoint, fade = Math.min(1.5, end / 3);
        L.property("ADBE Audio Group").property("ADBE Audio Levels")
            .setValuesAtTimes([0, 0.3, end - fade, end], [[-48, -48], [0, 0], [0, 0], [-48, -48]]);
        L.moveToEnd();
    }

    // ---------------- run ----------------
    var opts = askInputs();
    if (!opts) return;
    var startAt = parseTime(opts.start);
    if (isNaN(startAt) || startAt < 0) { alert("Couldn't read the start time \"" + opts.start + "\". Use m:ss (1:23.5) or seconds (83.5)."); return; }
    if (opts.color && !parseHex(opts.color)) warnings.push("Couldn't read the colour \"" + opts.color + "\", so orange was used.");

    var failed = null, comp = null;
    app.beginUndoGroup("Glow Tunnel");
    try {
        comp = build(opts);
        if (opts.song) addSong(comp, opts.song, startAt);
        comp.openInViewer();
        comp.time = 2;
        if (opts.renderQueue) app.project.renderQueue.items.add(comp);
    } catch (err) {
        failed = err;
    }
    app.endUndoGroup();

    if (failed) {
        alert("Glow Tunnel stopped:\n" + failed.message + (failed.line ? " (script line " + failed.line + ")" : "") + "\n\nEdit > Undo removes anything it added.");
        return;
    }
    var msg = "Done. Change the colour, glow, streaks, squeeze, speed and more on the CONTROLS layer.";
    if (warnings.length) msg += "\n\nNotes:\n - " + warnings.join("\n - ");
    alert(msg);
})();
