"""Bake the reference-style grade into a 33-point .cube LUT (for Lumetri)."""
import numpy as np, subprocess, os
from timeline import PROJECT
N = 33
GRADE = ("curves=r='0/0.02 0.25/0.20 0.5/0.52 0.8/0.86 1/0.97':"
         "g='0/0.02 0.25/0.19 0.5/0.49 0.8/0.82 1/0.95':"
         "b='0/0.05 0.25/0.21 0.5/0.46 0.8/0.76 1/0.90',"
         "colorbalance=rs=-0.04:bs=0.06:rm=0.05:gm=0.01:bm=-0.04:rh=0.06:gh=0.02:bh=-0.06,"
         "eq=saturation=1.08:contrast=1.06")
g = np.linspace(0, 1, N)
b, gg, r = np.meshgrid(g, g, g, indexing="ij")          # .cube order: R fastest
lat = np.stack([r, gg, b], -1).reshape(N * N, N, 3)
img = (lat * 65535).round().astype("<u2")
raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{N}x{N*N}",
                      "-i", "-", "-vf", GRADE, "-f", "rawvideo", "-pix_fmt", "rgb48le", "-"],
                     input=img.tobytes(), capture_output=True, check=True).stdout
out = np.frombuffer(raw, "<u2").reshape(-1, 3) / 65535
path = os.path.join(PROJECT, "grade", "SUNBURN26_cinematic_warm.cube")
with open(path, "w") as f:
    f.write('TITLE "SUNBURN26 cinematic warm"\nLUT_3D_SIZE 33\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
    for v in out: f.write(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
print("wrote", path, len(out))
