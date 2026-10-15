"""Cut each EDL slot out of the placeholder master as its own 2048x858 clip."""
import json, os, subprocess
from concurrent.futures import ThreadPoolExecutor
from timeline import *
EDL = json.load(open(os.path.join(ROOT, "build", "edl.json")))
SRC = os.path.join(PROJECT, "footage", "PLACEHOLDER_footage_master.mp4")
OUT = os.path.join(PROJECT, "footage", "placeholders"); os.makedirs(OUT, exist_ok=True)

def name(i, c): return f"V1_{i + 1:02d}_{c['start']:05.2f}s_{c['mood']}.mp4"

def cut(args):
    i, c = args
    dur = c["end"] - c["start"]; n = round(dur * FPS)
    vf = (f"crop={W}:{H}:0:{(1152 - H) // 2},setpts=(PTS-STARTPTS)/{c['speed']},"
          f"fps={FPS},tpad=stop_mode=clone:stop_duration=1")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{c['src_in']:.4f}",
                    "-t", f"{c['src_len'] + 0.2:.4f}", "-i", SRC, "-vf", vf, "-frames:v", str(n),
                    "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-g", "6",
                    "-pix_fmt", "yuv420p", os.path.join(OUT, name(i, c))], check=True)

if __name__ == "__main__":
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    with ThreadPoolExecutor(4) as ex: list(ex.map(cut, enumerate(EDL)))
    print(len(EDL), "placeholder clips in", OUT)
