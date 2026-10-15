/* Count Up: frame layout and drawing. No Premiere or Node dependencies, so the
 * same code drives the live preview and the final PNG render. */
(function (root) {
  "use strict";

  var EASINGS = {
    "linear": function (t) { return t; },
    "ease-out": function (t) { return 1 - Math.pow(1 - t, 3); },
    "ease-in-out": function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    "ease-out-back": function (t) { var c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };

  var NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
  var UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var LOWER = "abcdefghijklmnopqrstuvwxyz";
  var DIGITS = "0123456789";
  var SYMBOLS = "#$%&*+?!@";

  // Split text into static pieces and numbers that can count.
  function parseSegments(text) {
    var segs = [], last = 0, m;
    NUMBER_RE.lastIndex = 0;
    while ((m = NUMBER_RE.exec(text))) {
      if (m.index > last) segs.push({ type: "text", text: text.slice(last, m.index) });
      var raw = m[0];
      var dot = raw.indexOf(".");
      segs.push({
        type: "num",
        value: parseFloat(raw.replace(/,/g, "")),
        decimals: dot >= 0 ? raw.length - dot - 1 : 0,
        separator: raw.indexOf(",") >= 0
      });
      last = m.index + raw.length;
    }
    if (last < text.length) segs.push({ type: "text", text: text.slice(last) });
    return segs;
  }

  function hasNumber(text) {
    NUMBER_RE.lastIndex = 0;
    return NUMBER_RE.test(text);
  }

  function formatNumber(v, decimals, separator) {
    var s = Math.abs(v).toFixed(decimals);
    if (separator) {
      var parts = s.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      s = parts.join(".");
    }
    return (v < 0 ? "-" : "") + s;
  }

  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function randomCharFor(ch, a, b) {
    var pool = DIGITS.indexOf(ch) >= 0 ? DIGITS
      : UPPER.indexOf(ch) >= 0 ? UPPER
      : LOWER.indexOf(ch) >= 0 ? LOWER
      : SYMBOLS;
    return pool.charAt(Math.floor(hash(a, b) * pool.length));
  }

  function resolveMode(opts) {
    if (opts.mode !== "auto") return opts.mode;
    return hasNumber(opts.text) ? "count" : "roll";
  }

  // Returns the text to draw on a frame as lines of cells. Each cell is
  // { ch: what to draw, w: the character whose width the cell reserves }.
  function frameCells(opts, frame, totalCountFrames) {
    var t = Math.min(1, frame / Math.max(1, totalCountFrames));
    var e = EASINGS[opts.ease] || EASINGS["ease-out"];
    var mode = resolveMode(opts);
    var text = opts.text;

    if (mode === "count") {
      var p = e(t), from = opts.from || 0, out = "";
      parseSegments(text).forEach(function (s) {
        if (s.type === "text") out += s.text;
        else out += formatNumber(t >= 1 ? s.value : from + (s.value - from) * p, s.decimals, s.separator);
      });
      return toCells(out, null);
    }

    var chars = text.split("");
    var visible = chars.filter(function (c) { return !/\s/.test(c); }).length;

    if (mode === "type") {
      var shown = Math.floor(e(t) * visible + 1e-9), seen = 0, typed = "";
      for (var i = 0; i < chars.length; i++) {
        if (!/\s/.test(chars[i])) { if (seen >= shown) break; seen++; }
        typed += chars[i];
      }
      return toCells(typed, text);
    }

    // roll: every letter cycles through random characters, then they land one by one.
    var tick = Math.floor(frame / 2), idx = 0, rolled = "";
    for (var j = 0; j < chars.length; j++) {
      var c = chars[j];
      if (/\s/.test(c)) { rolled += c; continue; }
      var settleAt = visible > 1 ? 0.3 + 0.7 * idx / (visible - 1) : 1;
      rolled += t >= settleAt ? c : randomCharFor(c, j, tick);
      idx++;
    }
    return toCells(rolled, text);
  }

  // finalText (when given) fixes each cell's width to the final character so
  // rolling letters don't make the line jitter.
  function toCells(current, finalText) {
    var curLines = current.split("\n");
    var finLines = finalText ? finalText.split("\n") : curLines;
    return finLines.map(function (finLine, li) {
      var cur = curLines[li] || "";
      var len = finalText ? finLine.length : cur.length;
      var cells = [];
      for (var k = 0; k < len; k++) {
        cells.push({ ch: k < cur.length ? cur.charAt(k) : "", w: finalText ? finLine.charAt(k) : cur.charAt(k) });
      }
      return cells;
    });
  }

  function fontString(opts, scale) {
    return (opts.italic ? "italic " : "") + opts.weight + " " + (opts.size * scale) + "px " + quoteFamily(opts.font);
  }

  function quoteFamily(f) {
    return f.split(",").map(function (s) {
      s = s.trim();
      return /^["']|^(serif|sans-serif|monospace)$/.test(s) ? s : '"' + s + '"';
    }).join(", ") + ", sans-serif";
  }

  // Draws one frame. scale lets the preview reuse this at a smaller size.
  function drawFrame(ctx, width, height, cells, opts, scale) {
    scale = scale || 1;
    ctx.clearRect(0, 0, width, height);
    ctx.font = fontString(opts, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = opts.color;
    if (opts.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = opts.size * 0.12 * scale;
      ctx.shadowOffsetY = opts.size * 0.04 * scale;
    } else {
      ctx.shadowColor = "transparent";
    }

    var digitW = 0;
    for (var d = 0; d < 10; d++) digitW = Math.max(digitW, ctx.measureText(String(d)).width);
    var tracking = (opts.tracking || 0) * opts.size * scale / 100;
    function cellWidth(c) { return (/\d/.test(c.w) ? digitW : ctx.measureText(c.w).width) + tracking; }

    var lineH = opts.size * scale * 1.15;
    var blockTop = height * (opts.posY / 100) - (cells.length * lineH) / 2;
    var margin = width * 0.06;

    cells.forEach(function (line, li) {
      var total = 0;
      line.forEach(function (c) { total += cellWidth(c); });
      total -= tracking;
      var x = opts.align === "left" ? margin
        : opts.align === "right" ? width - margin - total
        : width * (opts.posX / 100) - total / 2;
      var y = blockTop + lineH * (li + 0.5);
      line.forEach(function (c) {
        var w = cellWidth(c);
        // A rolling placeholder letter is squeezed into the final letter's slot.
        if (c.ch && c.ch !== c.w) ctx.fillText(c.ch, x + (w - tracking) / 2, y, Math.max(1, w - tracking));
        else if (c.ch) ctx.fillText(c.ch, x + (w - tracking) / 2, y);
        x += w;
      });
    });
  }

  function cellsKey(cells) {
    return cells.map(function (l) { return l.map(function (c) { return c.ch; }).join(""); }).join("\n");
  }

  root.CountUpRender = {
    EASINGS: EASINGS,
    frameCells: frameCells,
    drawFrame: drawFrame,
    cellsKey: cellsKey,
    resolveMode: resolveMode,
    formatNumber: formatNumber,
    parseSegments: parseSegments
  };
})(typeof window !== "undefined" ? window : this);
