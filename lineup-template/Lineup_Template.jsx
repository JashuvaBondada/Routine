// Lineup_Template.jsx
// After Effects: File > Scripts > Run Script File... and pick this file.
//
// Builds a 1080x1920 project:
//   MAIN            = SLIDE_01 -> SLIDE_02_LINEUP (+ optional music, + a marker on every shift)
//   SLIDE_02_LINEUP = grey background, black box that jumps to a new size/position on every beat,
//                     a different footage precomp plays inside the box on every jump, artist text on top
//   FOOTAGE_PRECOMPS/FOOTAGE_01..NN = open one, drop your clip in, delete the placeholder. Done.
//
// Beat times come from beats.txt (made by beats.py from your song) or, if you skip that, from BPM below.

(function () {
    // ---------- settings ----------
    var W = 1080, H = 1920, FPS = 30;
    var SLIDE1_DUR = 2.0;        // seconds of slide 1 before the lineup slide starts
    var SLIDE2_DUR = 8.0;        // lineup slide length when using BPM (beats.txt sets its own length)
    var BPM = 120;               // used only when no beats.txt is loaded
    var BEATS_PER_SHIFT = 1;     // 1 = box jumps every beat, 2 = every other beat ...
    var SNAP_FRAMES = 3;         // frames the box takes to slide into place (0 = hard cut on the beat)
    var MAX_SHIFTS = 64;

    var BG_COLOR = [26 / 255, 26 / 255, 26 / 255];
    var BOX_COLOR = [0, 0, 0];
    var FONT = "Arial-BoldMT";   // swap for a wide display face, e.g. "MonumentExtended-Ultrabold"
    var FONT_SIZE = 80;
    var TEXT_STRETCH = 140;      // horizontal scale % to get the extended look
    var ARTISTS = [              // [text, y centre]
        ["DJ SNAKE", 774],
        ["THE CHAIN\rSMOKERS", 929],
        ["SEBASTIAN\rINGROSSO", 1117]
    ];

    // box rectangles [centre x, centre y, width, height]; cycled, one per shift.
    // First one matches the reference slide.
    var RECTS = [
        [540, 960, 740, 1520],
        [540, 900, 620, 1100],
        [420, 1010, 780, 980],
        [660, 930, 700, 1300],
        [540, 1040, 940, 760],
        [540, 960, 540, 960],
        [470, 880, 820, 1180],
        [600, 1000, 660, 1420]
    ];

    // ---------- helpers ----------
    function pad(n) { return (n < 10 ? "0" : "") + n; }

    function hsv(i, n) {
        var h = (i / Math.max(n, 1)) * 6, x = 1 - Math.abs(h % 2 - 1), c = [0, 0, 0];
        var k = Math.floor(h) % 6;
        var t = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][k];
        for (var j = 0; j < 3; j++) c[j] = 0.25 + 0.45 * t[j];
        return c;
    }

    function styleText(layer, size, stretch) {
        var src = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var td = src.value;
        td.resetCharStyle();
        td.fontSize = size;
        td.fillColor = [1, 1, 1];
        td.applyFill = true;
        td.applyStroke = false;
        try { td.font = FONT; } catch (e) {}
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        try { td.autoLeading = false; td.leading = Math.round(size * 0.82); } catch (e2) {}
        src.setValue(td);
        layer.property("ADBE Transform Group").property("ADBE Scale").setValue([stretch, 100]);
        var r = layer.sourceRectAtTime(0, false);
        layer.property("ADBE Transform Group").property("ADBE Anchor Point")
            .setValue([r.left + r.width / 2, r.top + r.height / 2]);
    }

    function ease(prop) {
        var dims = prop.propertyValueType == PropertyValueType.TwoD ? 2 : 1;
        var e = [];
        for (var d = 0; d < dims; d++) e.push(new KeyframeEase(0, 85));
        for (var k = 1; k <= prop.numKeys; k++) {
            if (SNAP_FRAMES > 0) {
                prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER);
                prop.setTemporalEaseAtKey(k, e, e);
            } else {
                prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD);
            }
        }
    }

    function addBox(comp, name, shifts) {
        var l = comp.layers.addShape();
        l.name = name;
        var grp = l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var contents = grp.property("ADBE Vectors Group");
        var rect = contents.addProperty("ADBE Vector Shape - Rect");
        var fill = contents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(BOX_COLOR);
        var size = rect.property("ADBE Vector Rect Size");
        var pos = l.property("ADBE Transform Group").property("ADBE Position");
        var snap = SNAP_FRAMES / FPS;
        for (var i = 0; i < shifts.length; i++) {
            var r = RECTS[i % RECTS.length], t = shifts[i];
            if (i > 0) {
                var p = RECTS[(i - 1) % RECTS.length];
                var t0 = Math.max(t - snap, shifts[i - 1] + 1 / FPS);
                if (t0 < t) {
                    size.setValueAtTime(t0, [p[2], p[3]]);
                    pos.setValueAtTime(t0, [p[0], p[1]]);
                }
            }
            size.setValueAtTime(t, [r[2], r[3]]);
            pos.setValueAtTime(t, [r[0], r[1]]);
        }
        ease(size);
        ease(pos);
        return l;
    }

    function readBeats() {
        if (!confirm("Load beats.txt made by beats.py?\n\nNo = use " + BPM + " BPM, a shift every " +
                     BEATS_PER_SHIFT + " beat(s).")) return null;
        var f = File.openDialog("Select beats.txt");
        if (!f || !f.open("r")) return null;
        var out = [];
        while (!f.eof) {
            var v = parseFloat(f.readln());
            if (!isNaN(v)) out.push(v);
        }
        f.close();
        return out.length ? out : null;
    }

    // ---------- shift times, in lineup-slide time ----------
    var shifts = [];
    var beats = readBeats();
    if (beats) {
        for (var b = 0; b < beats.length; b++) {
            var t = beats[b] - SLIDE1_DUR;
            if (t >= -0.001) shifts.push(Math.max(t, 0));
        }
        if (shifts.length < 2) { alert("beats.txt has fewer than 2 beats after slide 1. Using BPM instead."); shifts = []; }
        else {
            if (shifts[0] > 0.05) shifts.unshift(0);
            else shifts[0] = 0;
            if (shifts.length > MAX_SHIFTS) shifts.length = MAX_SHIFTS;
            var n = shifts.length;
            SLIDE2_DUR = shifts[n - 1] + (shifts[n - 1] - shifts[n - 2]);
        }
    }
    if (!shifts.length) {
        var step = 60 / BPM * BEATS_PER_SHIFT;
        var count = Math.min(Math.round(SLIDE2_DUR / step), MAX_SHIFTS);
        for (var s = 0; s < count; s++) shifts.push(s * step);
        SLIDE2_DUR = count * step;
    }

    app.beginUndoGroup("Lineup Template");
    var proj = app.project || app.newProject();

    var root = proj.items.addFolder("LINEUP_TEMPLATE");
    var footFolder = proj.items.addFolder("FOOTAGE_PRECOMPS");
    footFolder.parentFolder = root;

    // ---------- footage precomps (one per shift) ----------
    var footComps = [];
    for (var i = 0; i < shifts.length; i++) {
        var end = i < shifts.length - 1 ? shifts[i + 1] : SLIDE2_DUR;
        var c = proj.items.addComp("FOOTAGE_" + pad(i + 1), W, H, 1, Math.max(end - shifts[i] + 1, 2), FPS);
        c.parentFolder = footFolder;
        c.bgColor = [0, 0, 0];
        c.layers.addSolid(hsv(i, shifts.length), "PLACEHOLDER - put your clip above me, then delete me",
                          W, H, 1, c.duration);
        var lbl = c.layers.addText("FOOTAGE " + pad(i + 1));
        lbl.name = "PLACEHOLDER label - delete me";
        styleText(lbl, 90, 100);
        lbl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2]);
        footComps.push(c);
    }

    // ---------- box content: precomps sequenced on the shifts ----------
    var content = proj.items.addComp("BOX_CONTENT (auto-sequenced)", W, H, 1, SLIDE2_DUR, FPS);
    content.parentFolder = root;
    for (i = 0; i < footComps.length; i++) {
        var e2 = i < shifts.length - 1 ? shifts[i + 1] : SLIDE2_DUR;
        var fl = content.layers.add(footComps[i]);
        fl.startTime = shifts[i];
        fl.inPoint = shifts[i];
        fl.outPoint = e2;
    }

    // ---------- slide 2: lineup ----------
    var s2 = proj.items.addComp("SLIDE_02_LINEUP", W, H, 1, SLIDE2_DUR, FPS);
    s2.parentFolder = root;
    s2.layers.addSolid(BG_COLOR, "BG", W, H, 1, SLIDE2_DUR);
    addBox(s2, "BOX (black, shows if a precomp is empty)", shifts);
    var contentLayer = s2.layers.add(content);
    var matte = addBox(s2, "BOX MATTE", shifts);
    matte.moveBefore(contentLayer);
    contentLayer.trackMatteType = TrackMatteType.ALPHA;
    for (var a = 0; a < ARTISTS.length; a++) {
        var tl = s2.layers.addText(ARTISTS[a][0]);
        tl.name = "TEXT - " + ARTISTS[a][0].replace(/\r/g, " ");
        styleText(tl, FONT_SIZE, TEXT_STRETCH);
        tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, ARTISTS[a][1]]);
    }

    // ---------- slide 1: placeholder ----------
    var s1 = proj.items.addComp("SLIDE_01", W, H, 1, SLIDE1_DUR, FPS);
    s1.parentFolder = root;
    s1.layers.addSolid([0, 0, 0], "SLIDE 1 PLACEHOLDER - replace", W, H, 1, SLIDE1_DUR);
    var s1t = s1.layers.addText("SLIDE 1");
    styleText(s1t, FONT_SIZE, TEXT_STRETCH);
    s1t.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2]);

    // ---------- main ----------
    var main = proj.items.addComp("MAIN", W, H, 1, SLIDE1_DUR + SLIDE2_DUR, FPS);
    main.parentFolder = root;
    var l2 = main.layers.add(s2);
    l2.startTime = SLIDE1_DUR;
    main.layers.add(s1);
    for (i = 0; i < shifts.length; i++) {
        main.markerProperty.setValueAtTime(SLIDE1_DUR + shifts[i], new MarkerValue("shift " + pad(i + 1)));
    }
    if (confirm("Import the music track into MAIN now?")) {
        var mf = File.openDialog("Select the song (same file you ran beats.py on)");
        if (mf) {
            var audio = proj.importFile(new ImportOptions(mf));
            audio.parentFolder = root;
            var al = main.layers.add(audio);
            al.moveToEnd();
        }
    }

    app.endUndoGroup();
    main.openInViewer();
    alert("Done: " + shifts.length + " shifts.\n\nOpen LINEUP_TEMPLATE > FOOTAGE_PRECOMPS > FOOTAGE_01..." +
          pad(shifts.length) + ", drop a clip in each, delete the placeholder layers.");
})();
