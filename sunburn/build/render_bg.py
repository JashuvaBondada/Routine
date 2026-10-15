"""Procedural concert-stage backgrounds: volumetric beams, haze, stage lights,
particles — beat-synced to each song. One clip per song segment (V1)."""
import numpy as np, subprocess, os, sys
from scipy.ndimage import gaussian_filter, zoom
from timeline import *
from fxlib import *

HW, HH = W // 2, H // 2                     # render at half res, upscale in ffmpeg
Y, X = np.mgrid[0:HH, 0:HW].astype(np.float32)
rng = np.random.default_rng(3)

def noise_tex(h, w, sig, oct=3):
    n = np.zeros((h, w), np.float32)
    for o in range(oct):
        n += gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), sig / 2 ** o, mode="wrap") * (0.55 ** o)
    n -= n.min(); return n / n.max()
HAZE1 = noise_tex(HH * 2, HW * 2, 38)
HAZE2 = noise_tex(HH * 2, HW * 2, 22)

NP = 520
P0 = np.stack([rng.uniform(0, HW, NP), rng.uniform(0, HH, NP)], 1)
PV = np.stack([rng.uniform(-6, 6, NP), rng.uniform(-22, -4, NP)], 1)
PS = rng.uniform(0.3, 1.0, NP)

def haze(t):
    a = HAZE1[int(t * 9) % HH: int(t * 9) % HH + HH, int(t * 14) % HW: int(t * 14) % HW + HW]
    b = HAZE2[int(t * 5) % HH: int(t * 5) % HH + HH, (HW - int(t * 22) % HW): (HW - int(t * 22) % HW) + HW]
    return 0.35 + 0.65 * (0.6 * a + 0.4 * b)

def beam(ox, oy, ang, width, spread, length):
    dx, dy = np.sin(ang), np.cos(ang)
    vx, vy = X - ox, Y - oy
    al = vx * dx + vy * dy
    pp = np.abs(vx * dy - vy * dx)
    wdt = width + np.maximum(al, 0) * spread
    v = np.exp(-(pp / wdt) ** 2) * np.exp(-np.maximum(al, 0) / length)
    return v * (al > 0)

def frame(t):
    s = song_at(t); key = s["key"]
    E = energy(t); be = beat_env(t, key, 0.16 if s["bpm"] > 100 else 0.22)
    bi = beat_index(t, key)
    c1 = np.array(s["hue"], np.float32) / 255; c2 = np.array(s["hue2"], np.float32) / 255
    hz = haze(t)
    img = np.zeros((HH, HW, 3), np.float32)
    # base: deep stage glow from the bottom
    g = np.exp(-((HH - Y) / (HH * 0.55)) ** 2)
    img += (g * 0.10 * (0.4 + E))[..., None] * c2 * hz[..., None]
    # beams from a truss above the frame
    nb = int(3 + 9 * E)
    tl = t - s["start"]
    for i in range(nb):
        u = (i + 0.5) / nb
        ox = HW * (0.05 + 0.9 * u); oy = -30
        sweep = 0.55 * np.sin(tl * (0.6 + 1.4 * E) + i * 1.7) + (0.25 * np.sin(bi * 0.9 + i) if E > 0.7 else 0)
        ang = (u - 0.5) * -0.9 + sweep * 0.6
        col = c1 if i % 2 == 0 else c2
        inten = (0.18 + 0.55 * E) * (0.55 + 0.45 * be) * (1.0 if (bi + i) % 2 or E < 0.7 else 0.55)
        img += (beam(ox, oy, ang, 2.5, 0.07 + 0.03 * E, 700) * inten * hz)[..., None] * col
    # crossing beams from floor level after drops
    if E > 0.7:
        for i in range(4):
            ox = HW * (0.15 + 0.7 * i / 3); ang = np.pi + 0.5 * np.sin(tl * 1.3 + i * 2.1)
            img += (beam(ox, HH + 20, ang, 2, 0.05, 520) * 0.45 * be * hz)[..., None] * (c2 if i % 2 else c1)
    # stage light row (par cans) at bottom edge
    for i in range(14):
        cx = HW * (i + 0.5) / 14; on = 0.4 + 0.6 * (be if (i + bi) % 3 else 1 - be)
        d2 = ((X - cx) ** 2 + ((Y - HH - 6) * 1.6) ** 2)
        img += (np.exp(-d2 / 260) * 1.3 + np.exp(-d2 / 4000) * 0.25)[..., None] * c1 * on * (0.25 + 0.75 * E)
    # strobe on beats after drops
    if E > 0.9 and be > 0.85 and bi % 4 == 0:
        img += 0.18 * hz[..., None]
    # particles / dust in the light
    p = P0 + PV * t; p[:, 0] += 8 * np.sin(t * 0.7 + PS * 9)
    p[:, 0] %= HW; p[:, 1] %= HH
    pb = np.zeros((HH, HW), np.float32)
    np.add.at(pb, (p[:, 1].astype(int), p[:, 0].astype(int)), PS * (0.6 + 0.8 * be))
    pb = gaussian_filter(pb, 0.8) * 2.2
    img += (pb * (0.3 + 0.7 * E))[..., None] * (0.6 + 0.4 * c1)
    # hit burst: brightness + chromatic aberration + shake
    he = hit_env(t)
    img *= 1 + 1.4 * he
    sx, sy = shake(t, 8)
    img = np.roll(img, (int(sy), int(sx)), (0, 1))
    if he > 0.05:
        k = int(1 + 6 * he)
        img[..., 0] = np.roll(img[..., 0], k, 1); img[..., 2] = np.roll(img[..., 2], -k, 1)
    # transition glitch slices in the last 0.2s of each segment
    if s is not SONGS[-1] and s["end"] - t < 0.2:
        r = np.random.default_rng(int(t * 100))
        for _ in range(7):
            y0 = r.integers(0, HH - 20); hgt = r.integers(4, 30)
            img[y0:y0 + hgt] = np.roll(img[y0:y0 + hgt], r.integers(-60, 60), 1)
    # filmic tonemap
    img = 1 - np.exp(-img * 1.6)
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)

def render(i):
    s = SONGS[i]
    out = os.path.join(PROJECT, "backgrounds", f"BG_{i + 1:02d}_{s['key'].lower()}.mp4")
    vf = (f"scale={W}:{H}:flags=lanczos,noise=c0s=9:c1s=4:c2s=4:allf=t,"
          f"vignette=angle=PI/4.2")
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{HW}x{HH}", "-r", str(FPS), "-i", "-", "-vf", vf,
                          "-c:v", "libx264", "-crf", "14", "-preset", "medium",
                          "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    n = int(SEG * FPS)
    for f in range(n):
        p.stdin.write(frame(s["start"] + f / FPS).tobytes())
    p.stdin.close(); p.wait(); print("wrote", out)

if __name__ == "__main__":
    for i in (map(int, sys.argv[1:]) if len(sys.argv) > 1 else range(4)):
        render(i)
