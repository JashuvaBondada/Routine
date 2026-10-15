/* Count Up: Premiere Pro side (ExtendScript). */

var TICKS_PER_SECOND = 254016000000;

// "width,height,fps" of the active sequence, or "NO_SEQUENCE".
function countup_getSequenceInfo() {
    var seq = app.project.activeSequence;
    if (!seq) return "NO_SEQUENCE";
    var fps = TICKS_PER_SECOND / parseFloat(seq.timebase);
    return seq.frameSizeHorizontal + "," + seq.frameSizeVertical + "," + fps;
}

function countup_findBin(name) {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var c = root.children[i];
        if (c.type === ProjectItemType.BIN && c.name === name) return c;
    }
    return root.createBin(name);
}

function countup_findImported(bin, folderTag) {
    for (var i = bin.children.numItems - 1; i >= 0; i--) {
        var c = bin.children[i];
        var p = "";
        try { p = c.getMediaPath(); } catch (e) {}
        if (p && p.replace(/\\/g, "/").indexOf(folderTag) >= 0) return c;
    }
    return null;
}

// Lowest video track with nothing between start and end (seconds), or null.
function countup_freeTrack(seq, start, end) {
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        if (t === 0 && track.clips.numItems > 0) continue; // keep V1 for footage
        var busy = false;
        for (var j = 0; j < track.clips.numItems; j++) {
            var clip = track.clips[j];
            if (clip.start.seconds < end - 0.0001 && clip.end.seconds > start + 0.0001) { busy = true; break; }
        }
        if (!busy) return track;
    }
    return null;
}

// Imports the numbered PNG sequence and places it at the playhead.
function countup_importAndPlace(firstFile, folderTag, fps, frameCount, name) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return "ERR|Open a sequence first.";

        var bin = countup_findBin("Count Up");
        if (!app.project.importFiles([firstFile], true, bin, true)) return "ERR|Premiere could not import the rendered frames.";

        var item = countup_findImported(bin, folderTag);
        if (!item) return "ERR|Imported, but could not find the clip in the Count Up bin.";
        try { item.name = name; } catch (e1) {}
        try {
            var interp = item.getFootageInterpretation();
            interp.frameRate = fps;
            item.setFootageInterpretation(interp);
        } catch (e2) {}

        var start = seq.getPlayerPosition().seconds;
        var track = countup_freeTrack(seq, start, start + frameCount / fps);
        if (!track) return "OK_NOTRACK|Added to the Count Up bin. Every video track is busy at the playhead, so drag it onto the timeline yourself (or add a track and click again).";

        track.overwriteClip(item, start);
        return "OK|Placed on " + track.name + " at the playhead.";
    } catch (err) {
        return "ERR|" + err.toString();
    }
}
