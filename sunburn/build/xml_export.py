"""Write the Premiere Pro sequence as FCP7 XML (xmeml v4): File > Import."""
import json, os, subprocess
from xml.sax.saxutils import escape
from timeline import *
import fx
from comp import EDL, clip_name, scale_keys

PKG = "SUNBURN26_Premiere"
BASE = f"file://localhost/Users/Shared/{PKG}/"     # Mac default; relink once elsewhere
fr = lambda s: int(round(s * FPS))
RATE = f"<rate><timebase>{FPS}</timebase><ntsc>FALSE</ntsc></rate>"

def probe(path):
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                             capture_output=True, text=True).stdout)
    return d

_files = {}
def file_el(rel, kind, dur_frames, sr=48000):
    """Full <file> the first time a file is used, a reference afterwards."""
    if rel in _files: return f'<file id="{_files[rel]}"/>'
    fid = f"file-{len(_files) + 1}"; _files[rel] = fid
    name = escape(os.path.basename(rel)); url = BASE + rel.replace(" ", "%20")
    media = ""
    if kind in ("video", "still"):
        media += f"<video><samplecharacteristics>{RATE}<width>{W}</width><height>{H}</height>" \
                 f"<pixelaspectratio>square</pixelaspectratio><anamorphic>FALSE</anamorphic>" \
                 f"<fielddominance>none</fielddominance></samplecharacteristics></video>"
    if kind == "audio":
        media += f"<audio><samplecharacteristics><depth>16</depth><samplerate>{sr}</samplerate>" \
                 f"</samplecharacteristics><channelcount>2</channelcount></audio>"
    return (f'<file id="{fid}"><name>{name}</name><pathurl>{escape(url)}</pathurl>{RATE}'
            f"<duration>{dur_frames}</duration><timecode>{RATE}<string>00:00:00:00</string><frame>0</frame>"
            f"<displayformat>NDF</displayformat></timecode><media>{media}</media></file>")

_cid = [0]
def clip(name, rel, kind, start, end, src_in, src_dur, filters="", enabled=True, sr=48000, extra=""):
    _cid[0] += 1
    st = "<stillframe>TRUE</stillframe>" if kind == "still" else ""
    src = ""
    if kind == "audio":
        src = "<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>"
    return (f'<clipitem id="clipitem-{_cid[0]}"><name>{escape(name)}</name>'
            f"<enabled>{'TRUE' if enabled else 'FALSE'}</enabled><duration>{src_dur}</duration>{RATE}"
            f"<start>{start}</start><end>{end}</end><in>{src_in}</in><out>{src_in + end - start}</out>{st}"
            f"{file_el(rel, kind, src_dur, sr)}{src}{filters}{extra}</clipitem>")

def motion(keys, base_in=0):
    k = "".join(f"<keyframe><when>{base_in + f}</when><value>{v:.2f}</value></keyframe>" for f, v in keys)
    return ("<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory>"
            "<effecttype>motion</effecttype><mediatype>video</mediatype>"
            "<parameter authoringApp=\"PremierePro\"><parameterid>scale</parameterid><name>Scale</name>"
            f"<valuemin>0</valuemin><valuemax>1000</valuemax><value>{keys[0][1]:.2f}</value>{k}</parameter>"
            "</effect></filter>")

def levels(value, keys=None, base_in=0):
    k = "".join(f"<keyframe><when>{base_in + f}</when><value>{v:.4f}</value></keyframe>" for f, v in (keys or []))
    return ("<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid>"
            "<effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype>"
            "<mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name>"
            f"<valuemin>0</valuemin><valuemax>3.98109</valuemax><value>{value:.4f}</value>{k}</parameter>"
            "</effect></filter>")

def track(items, extra=""): return f"<track>{''.join(items)}{extra}<enabled>TRUE</enabled><locked>FALSE</locked></track>"

def build():
    n = fr(DUR)
    # V1 footage
    v1 = []
    for i, c in enumerate(EDL):
        s, e = fr(c["start"]), fr(c["end"])
        v1.append(clip(clip_name(i, c), f"footage/placeholders/{clip_name(i, c)}", "video", s, e, 0, e - s,
                       motion(scale_keys(c))))
    v2 = [clip("FX_vignette.png", "fx/FX_vignette.png", "still", 0, n, 0, n)]
    v3 = [clip(T["id"], f"titles/{T['id']}.mov", "video", fr(T["start"]), fr(T["end"]), 0,
               fr(T["end"]) - fr(T["start"])) for T in TITLES]
    v4 = [clip(F["id"], f"fx/{F['id']}.mov", "video", fr(F["start"]), fr(F["end"]), 0,
               fr(F["end"]) - fr(F["start"])) for F in sorted(fx.FX, key=lambda F: F["start"])]
    # A1-A4 songs: original files, in-point at the chosen timestamp, fades as level keyframes
    songs = []
    for i, s in enumerate(SONGS):
        keys = song_gain_keys(i)
        a, b = keys[0][0], keys[-1][0]
        src_in = fr(s["src_in"] + (a - s["start"]))
        g = 10 ** (s["gain_db"] / 20)
        kf = [(fr(t) - fr(a), v * g) for t, v in keys]
        dur = fr(probe(os.path.join(PROJECT, "music", s["file"])))
        songs.append(track([clip(f"{s['artist']} - {s['title']} [{int(s['src_in'] // 60)}:{s['src_in'] % 60:05.2f}]",
                                 f"music/{s['file']}", "audio", fr(a), fr(b), src_in, dur,
                                 levels(g, kf, src_in), sr=44100)]))
    # A5-A7 SFX: greedy lanes so nothing overlaps on a track
    lanes = [[], [], []]; lane_end = [0, 0, 0]
    for f, t0, db in sorted(SFX, key=lambda x: x[1]):
        d = fr(probe(os.path.join(PROJECT, "sfx", f)))
        s = fr(t0); e = min(s + d, n)
        li = next(i for i in range(3) if lane_end[i] <= s)
        lanes[li].append(clip(f, f"sfx/{f}", "audio", s, e, 0, d, levels(10 ** (db / 20))))
        lane_end[li] = e
    ref = track([clip("MIX_reference (enable if needed)", "reference/MIX_reference.wav", "audio", 0, n, 0, n,
                      levels(1.0), enabled=False)])
    markers = "".join(f"<marker><name>{escape(m)}</name><comment></comment><in>{fr(t)}</in><out>-1</out></marker>"
                      for t, m in [(0, "RELOAD build — Sebastian Ingrosso"), (6.0, "DROP — Reload"),
                                   (10.0, "All The Time"), (11.0, "DROP — All The Time"),
                                   (15.4, "ONE CITY"), (20.0, "Jalebi Baby"), (30.0, "Magenta Riddim — tension"),
                                   (33.0, "DROP — Magenta Riddim"), (38.0, "END SLATE")])
    fmt = (f"<format><samplecharacteristics>{RATE}<width>{W}</width><height>{H}</height>"
           "<anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio>"
           "<fielddominance>none</fielddominance><colordepth>24</colordepth></samplecharacteristics></format>")
    afmt = "<format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>"
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">'
           f'<sequence id="sequence-1"><name>SUNBURN26 Headliners Teaser 40s</name><duration>{n}</duration>{RATE}'
           f"<timecode>{RATE}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>"
           f"<media><video>{fmt}{track(v1)}{track(v2)}{track(v3)}{track(v4)}</video>"
           f"<audio><numOutputChannels>2</numOutputChannels>{afmt}{''.join(songs)}"
           f"{''.join(track(l) for l in lanes)}{ref}</audio></media>{markers}</sequence></xmeml>\n")
    out = os.path.join(PROJECT, "SUNBURN26_Headliners_Teaser.xml")
    open(out, "w").write(xml); print("wrote", out, len(_files), "files,", _cid[0], "clips")

if __name__ == "__main__":
    build()
