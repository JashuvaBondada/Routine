"""FX overlay clips (alpha): flashes on hits, fade from black, film-frame
border, vignette. Each is its own clip in Premiere so it can be moved/deleted."""
import os, subprocess
import numpy as np, cv2
from timeline import *

OUT = os.path.join(PROJECT, "fx"); os.makedirs(OUT, exist_ok=True)

def vignette():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    a = np.clip((d - 0.55) / 0.85, 0, 1) ** 1.6 * 0.75
    v = np.zeros((H, W, 4), np.float32); v[..., 3] = a
    return v

def film_border(t):
    """Rounded 'projected film' frame like the reference's city shot."""
    m = np.zeros((H, W), np.uint8)
    inset, r = 34, 38
    cv2.rectangle(m, (inset + r, inset), (W - inset - r, H - inset), 255, -1)
    cv2.rectangle(m, (inset, inset + r), (W - inset, H - inset - r), 255, -1)
    for cx, cy in ((inset + r, inset + r), (W - inset - r, inset + r), (inset + r, H - inset - r), (W - inset - r, H - inset - r)):
        cv2.circle(m, (cx, cy), r, 255, -1)
    j = np.random.default_rng(int(t * FPS)).integers(-2, 3, 2)     # gate weave
    m = np.roll(m, tuple(j), (0, 1))
    a = 1 - cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 3)
    v = np.zeros((H, W, 4), np.float32); v[..., 3] = a
    v[..., :3] = 0.02
    return v

def flash(lt, strength):
    a = strength * np.exp(-lt / 0.09)
    v = np.zeros((H, W, 4), np.float32); v[..., :3] = 1.0; v[..., 3] = min(1.0, a)
    return v

def fade_black(lt, dur):
    v = np.zeros((H, W, 4), np.float32); v[..., 3] = 1 - np.clip(lt / dur, 0, 1); return v

FX = [dict(id=f"FX_flash_{i + 1:02d}", start=h, end=min(h + 0.5, DUR), fn=lambda lt, s=s: flash(lt, s))
      for i, (h, s) in enumerate(HITS) if s >= 0.5 or h == 0.30]
FX.append(dict(id="FX_fade_from_black", start=0.0, end=0.6, fn=lambda lt: fade_black(lt, 0.6)))
FX.append(dict(id="FX_film_border", start=15.42, end=17.42, fn=lambda lt: film_border(15.42 + lt)))
VIGNETTE = os.path.join(OUT, "FX_vignette.png")

def render(F, t):
    if not (F["start"] <= t < F["end"]): return None
    return F["fn"](t - F["start"])

def export(F):
    n = round((F["end"] - F["start"]) * FPS)
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "qtrle", "-pix_fmt", "argb",
                          os.path.join(OUT, F["id"] + ".mov")], stdin=subprocess.PIPE)
    for f in range(n):
        p.stdin.write((np.clip(F["fn"](f / FPS), 0, 1) * 255).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait()

if __name__ == "__main__":
    v = (vignette() * 255).astype(np.uint8)
    cv2.imwrite(VIGNETTE, cv2.cvtColor(v, cv2.COLOR_RGBA2BGRA))
    for F in FX: export(F); print("wrote", F["id"])
