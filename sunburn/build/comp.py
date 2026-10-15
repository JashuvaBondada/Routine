"""Final composite = exactly the Premiere stack:
V1 footage (scale keyframes) -> V2 grade LUT -> V3 vignette -> V4 titles -> V5 FX,
plus film grain, muxed with the mix."""
import json, os, subprocess, sys
import numpy as np, cv2
from timeline import *
import titles, fx

EDL = json.load(open(os.path.join(ROOT, "build", "edl.json")))
PH = os.path.join(PROJECT, "footage", "placeholders")
LUT = os.path.join(PROJECT, "grade", "SUNBURN26_cinematic_warm.cube")

def clip_name(i, c): return f"V1_{i + 1:02d}_{c['start']:05.2f}s_{c['mood']}.mp4"

def scale_keys(c):
    """(frame offset, scale %) — written verbatim into the XML Basic Motion."""
    n = round((c["end"] - c["start"]) * FPS)
    if c["punch"]:
        return [(0, 114.0), (min(5, n - 1), 100.0), (n - 1, 102.0)] if n > 6 else [(0, 110.0), (n - 1, 100.0)]
    return [(0, 100.0), (n - 1, 104.0)]

def scale_at(c, f):
    k = scale_keys(c)
    return float(np.interp(f, [a for a, _ in k], [b for _, b in k])) / 100

def footage_stream():
    """Graded footage frames for 0..38s (concat of placeholders + LUT), then black."""
    lst = os.path.join(ROOT, "build", "concat.txt")
    with open(lst, "w") as f:
        for i, c in enumerate(EDL): f.write(f"file '{os.path.join(PH, clip_name(i, c))}'\n")
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst,
                          "-vf", f"lut3d=file='{LUT}'", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         stdout=subprocess.PIPE)
    sz = W * H * 3
    while True:
        b = p.stdout.read(sz)
        if len(b) < sz: break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)

def over(base, o):
    if o is None: return base
    a = o[..., 3:4]; return base * (1 - a) + o[..., :3] * a

def main(out):
    vig = cv2.cvtColor(cv2.imread(fx.VIGNETTE, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA).astype(np.float32) / 255
    n_total = round(DUR * FPS)
    starts = [round(c["start"] * FPS) for c in EDL]
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-i", os.path.join(ROOT, "build", "mix_preview.wav"),
                            "-vf", "noise=c0s=7:c1s=3:c2s=3:allf=t", "-c:v", "libx264", "-crf", "18",
                            "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k",
                            "-movflags", "+faststart", "-shortest", out], stdin=subprocess.PIPE)
    src = footage_stream()
    for f in range(n_total):
        t = (f + 0.001) / FPS
        idx = max([i for i, s in enumerate(starts) if s <= f], default=None)
        frame = next(src, None) if f < round(EDL[-1]["end"] * FPS) else None
        if frame is None:
            img = np.zeros((H, W, 3), np.float32)
        else:
            c = EDL[idx]; s = scale_at(c, f - starts[idx])
            img = frame.astype(np.float32) / 255
            if s != 1.0:
                M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
                img = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        img = over(img, vig)
        for T in TITLES: img = over(img, titles.render(T, t))
        for F in fx.FX: img = over(img, fx.render(F, t))
        enc.stdin.write((np.clip(img, 0, 1) * 255).astype(np.uint8).tobytes())
        if f % 96 == 0: print(f"{t:5.1f}s", flush=True)
    enc.stdin.close(); enc.wait(); print("wrote", out)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "SUNBURN26_Headliners_Teaser_40s_PREVIEW.mp4"))
