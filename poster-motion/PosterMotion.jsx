/*  PosterMotion.jsx  (Adobe After Effects)
 *
 *  Animates an event poster in this order:
 *    black background -> person -> red frame stroke draws around -> diagonal
 *    line + red box wipe -> location logo + date -> artist name rolls in
 *    letter by letter (with "(LIVE)" and the subtitle) -> top logos -> bottom logos.
 *
 *  How to use:
 *    1. Import the layered poster (PSD or AI) as "Composition - Retain Layer Sizes"
 *       and open that comp.
 *    2. File > Scripts > Run Script File... and pick this file.
 *  Layers are found by name (not case sensitive), so it helps if they are
 *  called something like the words in LAYERS below. Anything it can't find is
 *  listed at the end, and the rest is still animated.
 *  For the letter roll, the artist name, "(LIVE)" and subtitle must be editable
 *  text layers. Rasterised text gets a slide-up reveal instead.
 */
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the poster's composition first, then run the script."); return; }

    var LAYERS = {
        background: ["background", "bg", "backdrop"],
        person:     ["person", "artist photo", "photo", "model", "portrait", "giorgia photo", "image"],
        border:     ["border", "frame", "stroke", "outline"],
        redBox:     ["red box", "red", "diagonal", "panel", "triangle", "box"],
        location:   ["the location", "location", "venue"],
        date:       ["date", "30th", "oct"],
        name:       ["giorgia", "angiuli", "artist name", "name", "headliner"],
        live:       ["(live)", "live"],
        subtitle:   ["halloween", "weekend", "subtitle"],
        topLogos:   ["pinnacle", "dynamo", "flub"],
        bottomLogos:["heineken", "dsk"]
    };
    var W = comp.width, H = comp.height;
    var missing = [], used = {};

    function lower(s) { return String(s).toLowerCase(); }
    function find(keys) {
        for (var k = 0; k < keys.length; k++) {
            for (var i = 1; i <= comp.numLayers; i++) {
                var L = comp.layer(i);
                if (!used[L.index] && lower(L.name).indexOf(keys[k]) >= 0) { used[L.index] = true; return L; }
            }
        }
        return null;
    }
    function findAll(keys) {
        var out = [];
        for (var k = 0; k < keys.length; k++) { var L = find([keys[k]]); if (L) out.push(L); }
        return out;
    }
    function need(L, label) { if (!L) missing.push(label); return L; }

    function ease(prop) {
        var e = new KeyframeEase(0, 80);
        for (var i = 1; i <= prop.numKeys; i++) {
            var dims = prop.keyValue(i) instanceof Array ? prop.keyValue(i).length : 1;
            if (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL) dims = 1;
            var arr = []; for (var d = 0; d < dims; d++) arr.push(e);
            prop.setTemporalEaseAtKey(i, arr, arr);
        }
    }
    function keys(prop, times, values) {
        for (var i = 0; i < times.length; i++) prop.setValueAtTime(times[i], values[i]);
        ease(prop);
    }
    function tr(L, name) { return L.property("ADBE Transform Group").property(name); }

    function fadeIn(L, t0, t1) { keys(tr(L, "ADBE Opacity"), [t0, t1], [0, 100]); }
    function slide(L, t0, t1, dx, dy) {
        var p = tr(L, "ADBE Position"), v = p.value;
        var from = v.length === 3 ? [v[0] + dx, v[1] + dy, v[2]] : [v[0] + dx, v[1] + dy];
        keys(p, [t0, t1], [from, v]);
    }
    function scaleKeys(L, times, pct) {
        var s = tr(L, "ADBE Scale"), out = [];
        for (var i = 0; i < pct.length; i++) out.push([pct[i], pct[i], 100]);
        keys(s, times, out);
    }

    // Letter roll on a text layer: each letter spins through random letters, then lands.
    function rollText(L, t0, perLetter, rollFor) {
        var st = L.property("ADBE Text Properties") && L.property("ADBE Text Properties").property("ADBE Text Document");
        if (!st) return false;
        var finalText = st.value.text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
        st.expression =
            'var finalText = "' + finalText + '";\n' +
            'var t0 = ' + t0 + ', step = ' + perLetter + ', roll = ' + rollFor + ';\n' +
            'var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", digits = "0123456789";\n' +
            'var out = "", n = 0;\n' +
            'for (var i = 0; i < finalText.length; i++) {\n' +
            '  var c = finalText.charAt(i);\n' +
            '  if (c == " " || c == "\\r" || c == "\\n") { out += c; continue; }\n' +
            '  var start = t0 + n * step * 0.5, land = t0 + roll + n * step;\n' +
            '  if (time < start) out += " ";\n' +
            '  else if (time >= land) out += c;\n' +
            '  else {\n' +
            '    seedRandom(i * 7 + Math.floor(time * 15), true);\n' +
            '    var pool = digits.indexOf(c) >= 0 ? digits : (abc.indexOf(c.toUpperCase()) >= 0 ? abc : c);\n' +
            '    out += pool.charAt(Math.floor(random(pool.length)));\n' +
            '  }\n' +
            '  n++;\n' +
            '}\n' +
            'out;';
        return true;
    }

    function shapeLayer(name) {
        var L = comp.layers.addShape();
        L.name = name;
        return L;
    }
    function strokeGroup(L, pathMaker, color, width) {
        var root = L.property("ADBE Root Vectors Group");
        var g = root.addProperty("ADBE Vector Group");
        var v = g.property("ADBE Vectors Group");
        pathMaker(v);
        var s = v.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(color);
        s.property("ADBE Vector Stroke Width").setValue(width);
        var trim = v.addProperty("ADBE Vector Filter - Trim");
        return { stroke: s, trim: trim };
    }

    app.beginUndoGroup("Poster Motion");

    var RED = [148 / 255, 2 / 255, 3 / 255];
    if (comp.duration < 9.5) comp.duration = 9.5;

    // Find every poster layer before adding any, since adding layers renumbers them.
    var bg = find(LAYERS.background);
    var person = need(find(LAYERS.person), "person / photo");
    var border = find(LAYERS.border);
    var loc = need(find(LAYERS.location), "location logo");
    var date = need(find(LAYERS.date), "date");
    var nameLayers = [];
    var n1 = find(LAYERS.name);
    if (n1) { nameLayers.push(n1); var n2 = find(LAYERS.name); if (n2) nameLayers.push(n2); }
    if (!nameLayers.length) missing.push("artist name");
    var liveL = find(LAYERS.live), subL = find(LAYERS.subtitle);
    var top = findAll(LAYERS.topLogos);
    if (!top.length) missing.push("top logos");
    var bottom = findAll(LAYERS.bottomLogos);
    if (!bottom.length) missing.push("bottom logos");
    var redBox = need(find(LAYERS.redBox), "red diagonal box"); // last, since "red" and "box" are loose matches

    // 1. Black background under everything.
    var black = comp.layers.addSolid([0, 0, 0], "Black BG", W, H, comp.pixelAspect, comp.duration);
    black.moveToEnd();
    if (bg) fadeIn(bg, 0.4, 1.5);

    // 2. Person: fade in with a slow push.
    if (person) {
        fadeIn(person, 0.4, 1.5);
        scaleKeys(person, [0.4, 2.4, comp.duration], [110, 100, 102.5]);
    }

    // 3. Frame: a thin red line draws around, then thickens.
    var frameW = Math.round(W * 22 / 1080);
    if (border) border.enabled = false; // replaced by the drawn stroke
    var frame = shapeLayer("Frame Stroke");
    var fr = strokeGroup(frame, function (v) {
        var r = v.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue([W - frameW, H - frameW]);
    }, RED, 4);
    keys(fr.trim.property("ADBE Vector Trim Start"), [1.2, 2.4], [50, 0]);
    keys(fr.trim.property("ADBE Vector Trim End"), [1.2, 2.4], [50, 100]);
    keys(fr.stroke.property("ADBE Vector Stroke Width"), [2.3, 2.8], [4, frameW]);

    // 4. Diagonal line draws, then the red box wipes in behind it.
    var diag = shapeLayer("Diagonal Line");
    var y0 = H * 1489 / 1920, y1 = H * (1489 - 0.792 * 1080) / 1920;
    var dl = strokeGroup(diag, function (v) {
        var p = v.addProperty("ADBE Vector Shape - Group");
        var sh = new Shape();
        sh.vertices = [[-W / 2, y0 - H / 2], [W / 2, y1 - H / 2]];
        sh.closed = false;
        p.property("ADBE Vector Shape").setValue(sh);
    }, [225 / 255, 20 / 255, 26 / 255], Math.max(2, Math.round(W * 4 / 1080)));
    keys(dl.trim.property("ADBE Vector Trim End"), [2.3, 2.95], [0, 100]);
    keys(tr(diag, "ADBE Opacity"), [3.4, 3.8], [100, 0]);

    if (redBox) {
        var wipe = redBox.property("ADBE Effect Parade").addProperty("ADBE Linear Wipe");
        // Wipe edge runs parallel to the diagonal; reveal travels up toward the line.
        wipe.property("ADBE Linear Wipe-0002").setValue(180 + Math.atan(0.792) * 180 / Math.PI);
        keys(wipe.property("ADBE Linear Wipe-0001"), [2.75, 3.55], [100, 0]);
    }

    // 5. Location logo rises in, date pops.
    if (loc) { fadeIn(loc, 3.4, 3.8); slide(loc, 3.4, 4.1, 0, H * 0.035); }
    if (date) { fadeIn(date, 3.8, 4.05); scaleKeys(date, [3.8, 4.15, 4.35], [50, 108, 100]); }

    // 6. Artist name, (LIVE) and subtitle roll in.
    function textIn(L, label, t0, step, roll) {
        if (!need(L, label)) return;
        if (!rollText(L, t0, step, roll)) { fadeIn(L, t0, t0 + 0.4); slide(L, t0, t0 + 0.6, 0, H * 0.03); }
    }
    for (var i = 0; i < nameLayers.length; i++) textIn(nameLayers[i], "artist name", 4.0 + i * 0.25, 0.07, 0.55);
    textIn(liveL, "(LIVE)", 5.15, 0.08, 0.3);
    textIn(subL, "subtitle (Halloween Weekend)", 5.0, 0.04, 0.3);

    // 7. Top logos drop in, then bottom logos rise in.
    for (var t = 0; t < top.length; t++) { fadeIn(top[t], 6.0 + t * 0.12, 6.6 + t * 0.12); slide(top[t], 6.0 + t * 0.12, 6.6 + t * 0.12, 0, -H * 0.016); }
    for (var b = 0; b < bottom.length; b++) { fadeIn(bottom[b], 6.7 + b * 0.12, 7.3 + b * 0.12); slide(bottom[b], 6.7 + b * 0.12, 7.3 + b * 0.12, 0, H * 0.016); }

    app.endUndoGroup();

    var msg = "Poster Motion applied. Press the spacebar to preview.";
    if (missing.length) msg += "\n\nCouldn't find layers for:\n - " + missing.join("\n - ") +
        "\n\nRename those layers (see the list at the top of the script) and run it again after Edit > Undo.";
    alert(msg);
})();
