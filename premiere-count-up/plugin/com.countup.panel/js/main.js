/* Count Up: panel UI, live preview, and rendering frames to disk. */
(function () {
  "use strict";

  var R = window.CountUpRender;
  var cep = window.__adobe_cep__;
  var nodeRequire = window.cep_node ? window.cep_node.require : (typeof require === "function" ? require : null);

  var $ = function (id) { return document.getElementById(id); };
  var preview = $("preview");
  var pctx = preview.getContext("2d");
  var seqW = 1920, seqH = 1080, seqFps = 30;
  var PREVIEW_FPS = 30;

  function readOptions() {
    return {
      text: $("text").value,
      mode: $("mode").value,
      from: parseFloat($("from").value) || 0,
      duration: Math.max(0.2, parseFloat($("duration").value) || 3),
      hold: Math.max(0, parseFloat($("hold").value) || 0),
      ease: $("ease").value,
      font: $("font").value || "Arial",
      weight: $("weight").value,
      size: Math.max(8, parseFloat($("size").value) || 200),
      color: $("color").value,
      tracking: parseFloat($("tracking").value) || 0,
      align: $("align").value,
      posX: 50,
      posY: parseFloat($("posY").value),
      italic: $("italic").checked,
      shadow: $("shadow").checked
    };
  }

  function setStatus(msg, isError) {
    var el = $("status");
    el.textContent = msg || "";
    el.className = "status" + (isError ? " error" : "");
  }

  function updateHint() {
    var o = readOptions();
    var names = { count: "Numbers count up; other text stays put.", roll: "Letters spin through random characters, then land one by one.", type: "Letters appear one at a time." };
    var mode = R.resolveMode(o);
    $("modeHint").textContent = (o.mode === "auto" ? "Auto: " : "") + names[mode];
    $("from").disabled = mode !== "count";
  }

  function sizePreview() {
    preview.width = 640;
    preview.height = Math.round(640 * seqH / seqW);
  }

  // Looping preview, drawn at the sequence's aspect ratio.
  var startTime = performance.now();
  function tick(now) {
    var o = readOptions();
    var countFrames = Math.round(o.duration * PREVIEW_FPS);
    var loopFrames = countFrames + Math.round(Math.max(o.hold, 0.6) * PREVIEW_FPS);
    var frame = Math.floor((now - startTime) / 1000 * PREVIEW_FPS) % loopFrames;
    R.drawFrame(pctx, preview.width, preview.height, R.frameCells(o, frame, countFrames), o, preview.width / seqW);
    requestAnimationFrame(tick);
  }

  function evalScript(script) {
    return new Promise(function (resolve) { cep.evalScript(script, resolve); });
  }

  function refreshSequence() {
    if (!cep) return Promise.resolve(false);
    return evalScript("countup_getSequenceInfo()").then(function (res) {
      if (!res || res === "NO_SEQUENCE" || res.indexOf(",") < 0) return false;
      var p = res.split(",");
      seqW = parseInt(p[0], 10); seqH = parseInt(p[1], 10); seqFps = parseFloat(p[2]);
      sizePreview();
      return true;
    });
  }

  function canvasToBuffer(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error("Could not encode PNG"));
        // FileReader rather than blob.arrayBuffer(): older CEP builds lack the latter.
        var reader = new FileReader();
        reader.onload = function () { resolve(nodeRequire("buffer").Buffer.from(reader.result)); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsArrayBuffer(blob);
      }, "image/png");
    });
  }

  function outputFolder(path, os, fs) {
    var base = path.join(os.homedir(), "Documents", "Count Up Renders");
    var stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    var tag = "countup_" + stamp + "_" + Math.floor(Math.random() * 1e4);
    var dir = path.join(base, tag);
    [path.join(os.homedir(), "Documents"), base, dir].forEach(function (d) {
      if (!fs.existsSync(d)) fs.mkdirSync(d);
    });
    return { dir: dir, tag: tag };
  }

  function addToTimeline() {
    if (!cep || !nodeRequire) {
      setStatus("Open this panel inside Premiere Pro (Window > Extensions > Count Up) to add it to a timeline.", true);
      return;
    }
    var o = readOptions();
    if (!o.text.trim()) { setStatus("Type some text first.", true); return; }

    var fs = nodeRequire("fs"), path = nodeRequire("path"), os = nodeRequire("os");
    $("add").disabled = true;
    setStatus("Checking sequence…");

    refreshSequence().then(function (hasSeq) {
      if (!hasSeq) throw new Error("Open a sequence in the timeline first.");
      var out = outputFolder(path, os, fs);
      var canvas = document.createElement("canvas");
      canvas.width = seqW; canvas.height = seqH;
      var ctx = canvas.getContext("2d");
      var countFrames = Math.max(1, Math.round(o.duration * seqFps));
      var total = countFrames + Math.round(o.hold * seqFps);
      var lastKey = null, lastFile = null, i = 0;

      function fileFor(n) { return path.join(out.dir, "countup_" + ("00000" + n).slice(-5) + ".png"); }

      function step() {
        if (i >= total) return Promise.resolve();
        var cells = R.frameCells(o, i, countFrames);
        var key = R.cellsKey(cells);
        var file = fileFor(i);
        var work;
        if (key === lastKey) {
          fs.copyFileSync(lastFile, file); // unchanged frame, skip re-encoding
          work = Promise.resolve();
        } else {
          R.drawFrame(ctx, seqW, seqH, cells, o, 1);
          work = canvasToBuffer(canvas).then(function (buf) { fs.writeFileSync(file, buf); });
        }
        return work.then(function () {
          lastKey = key; lastFile = file; i++;
          $("progress").style.width = (100 * i / total) + "%";
          if (i % 10 === 0) setStatus("Rendering frame " + i + " of " + total + "…");
          return step();
        });
      }

      return step().then(function () {
        setStatus("Importing into Premiere…");
        var name = "Count Up - " + o.text.replace(/\s+/g, " ").slice(0, 40);
        var call = "countup_importAndPlace(" + [JSON.stringify(fileFor(0)), JSON.stringify(out.tag), seqFps, total, JSON.stringify(name)].join(",") + ")";
        return evalScript(call);
      });
    }).then(function (res) {
      res = String(res || "");
      var bar = res.indexOf("|");
      var kind = bar >= 0 ? res.slice(0, bar) : "ERR";
      var msg = bar >= 0 ? res.slice(bar + 1) : "Unexpected reply from Premiere: " + res;
      setStatus(msg, kind === "ERR");
    }).catch(function (err) {
      setStatus(err.message || String(err), true);
    }).then(function () {
      $("add").disabled = false;
      setTimeout(function () { $("progress").style.width = "0"; }, 800);
    });
  }

  ["text", "mode", "from", "duration", "hold", "ease", "font", "weight", "size", "color", "tracking", "align", "posY", "italic", "shadow"]
    .forEach(function (id) {
      $(id).addEventListener("input", function () { updateHint(); startTime = performance.now(); });
    });
  $("add").addEventListener("click", addToTimeline);

  sizePreview();
  updateHint();
  refreshSequence();
  requestAnimationFrame(tick);
})();
