"""Title overlays (RGBA). Same function feeds the preview render and the
alpha .mov clips that sit on V3 in Premiere."""
import os, sys, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps
from timeline import *
from fxlib import shake, ease_out, ease_in_out

FONTS = "/usr/share/fonts/opentype/inter/"
GOLD = (242, 201, 76)
WHITE = (255, 255, 255)
ASSETS = os.path.join(ROOT, "assets")

def text_sprite(text, size, font, color, tracking):
    """Render tracked caps to a tight RGBA sprite."""
    f = ImageFont.truetype(FONTS + font, size)
    widths = [f.getlength(ch) for ch in text]
    tr = tracking * size
    w = int(sum(widths) + tr * (len(text) - 1) + size)
    asc, desc = f.getmetrics()
    im = Image.new("RGBA", (w, asc + desc + size // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im); x = size / 2
    for ch, cw in zip(text, widths):
        d.text((x, size // 4), ch, font=f, fill=color + (255,)); x += cw + tr
    return np.array(im.crop(im.getbbox()))

def logo_sprite(path, max_w, max_h, invert=False):
    im = Image.open(path).convert("RGBA")
    if invert:  # black logo -> white, keep alpha
        a = im.getchannel("A"); im = Image.merge("RGBA", (*Image.new("RGB", im.size, WHITE).split(), a))
    im = im.crop(im.getbbox()); im.thumbnail((max_w, max_h), Image.LANCZOS)
    return np.array(im)

_cache = {}
def sprites(T):
    if T["id"] in _cache: return _cache[T["id"]]
    k = T["kind"]; sc = T.get("scale", 1.0)
    if k == "sub":
        sp = [text_sprite(T["lines"][0], int(46 * sc), "InterDisplay-SemiBold.otf", GOLD, 0.32)]
        if len(T["lines"]) > 1:
            sp.append(text_sprite(T["lines"][1], int(46 * sc), "InterDisplay-SemiBold.otf", GOLD, 0.32))
    elif k == "slam":
        sp = [text_sprite(T["lines"][0], 92, "InterDisplay-Bold.otf", WHITE, 0.16)]
    elif k == "name":
        sp = [text_sprite(T["lines"][0], 190, "InterDisplay-Black.otf", WHITE, 0.08)]
    elif k == "logo":
        sp = [logo_sprite(os.path.join(ASSETS, T["logo"]), 1000, 330, T.get("invert", False))]
    elif k == "slate":
        sp = [logo_sprite(os.path.join(ASSETS, T["logo"]), 1400, 790)]
    _cache[T["id"]] = sp
    return sp

def place(canvas, spr, cx, cy, scale=1.0, alpha=1.0, blur=0.0):
    if alpha <= 0.003: return
    s = spr
    if abs(scale - 1) > 1e-3:
        s = cv2.resize(spr, (max(1, int(spr.shape[1] * scale)), max(1, int(spr.shape[0] * scale))),
                       interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    s = s.astype(np.float32) / 255
    if blur > 0.3:
        k = int(blur * 3) | 1
        s = cv2.GaussianBlur(s, (k, k), blur)
    h, w = s.shape[:2]; x0 = int(cx - w / 2); y0 = int(cy - h / 2)
    xa, ya = max(0, x0), max(0, y0); xb, yb = min(W, x0 + w), min(H, y0 + h)
    if xb <= xa or yb <= ya: return
    src = s[ya - y0:yb - y0, xa - x0:xb - x0]
    a = src[..., 3:4] * alpha
    dst = canvas[ya:yb, xa:xb]
    out_a = a + dst[..., 3:4] * (1 - a)
    rgb = (src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)) / np.maximum(out_a, 1e-6)
    dst[..., :3] = rgb; dst[..., 3:4] = out_a

def glow(canvas, strength=0.6, radius=18, tint=None):
    a = canvas[..., 3]
    g = cv2.GaussianBlur(a, (0, 0), radius) * strength
    col = np.array(tint if tint else (1, 1, 1), np.float32)
    na = g * (1 - a)
    out_a = a + na
    canvas[..., :3] = (canvas[..., :3] * a[..., None] + col * na[..., None]) / np.maximum(out_a, 1e-6)[..., None]
    canvas[..., 3] = out_a

def shade(canvas, strength=0.5, radius=36):
    """Add a soft dark halo underneath existing content (behind the text)."""
    a = canvas[..., 3]
    g = np.clip(cv2.GaussianBlur(a, (0, 0), radius) * 2.2, 0, 1) * strength
    out_a = a + g * (1 - a)
    canvas[..., :3] = canvas[..., :3] * (a / np.maximum(out_a, 1e-6))[..., None]
    canvas[..., 3] = out_a

def rgb_split(canvas, px):
    if px < 1: return
    px = int(px)
    r = np.roll(canvas, -px, 1); b = np.roll(canvas, px, 1)
    a = np.maximum(canvas[..., 3], np.maximum(r[..., 3], b[..., 3]))
    out = canvas.copy()
    out[..., 0] = np.where(a > 0, (r[..., 0] * r[..., 3] + canvas[..., 0] * canvas[..., 3] * 0.0001) / np.maximum(a, 1e-6), 0)
    out[..., 2] = np.where(a > 0, (b[..., 2] * b[..., 3] + canvas[..., 2] * canvas[..., 3] * 0.0001) / np.maximum(a, 1e-6), 0)
    out[..., 1] = np.where(a > 0, canvas[..., 1] * canvas[..., 3] / np.maximum(a, 1e-6), 0)
    out[..., 3] = a
    canvas[:] = out

def render(T, t):
    """RGBA float frame for title T at timeline time t (None if not visible)."""
    if not (T["start"] <= t < T["end"]): return None
    lt = t - T["start"]; dur = T["end"] - T["start"]; rem = T["end"] - t
    c = np.zeros((H, W, 4), np.float32)
    sp = sprites(T); k = T["kind"]
    cx, cy = W / 2, H / 2
    if k == "sub":
        a = ease_in_out(lt / 0.35) * ease_in_out(rem / 0.25)
        drift = 1.0 + 0.04 * (lt / dur)                     # slow tracking-out feel
        blur = 6 * (1 - ease_out(lt / 0.4))
        if len(sp) == 1:
            place(c, sp[0], cx, cy, drift, a, blur)
        else:
            a2 = ease_in_out((lt - 0.25) / 0.35) * ease_in_out(rem / 0.25)
            place(c, sp[0], cx, cy - 34 * T.get("scale", 1), drift, a, blur)
            place(c, sp[1], cx, cy + 34 * T.get("scale", 1), drift, a2, blur)
        glow(c, 0.35, 10, (1.0, 0.8, 0.3))
        shade(c, 0.55, 38)              # soft dark halo keeps gold legible on bright shots
    elif k in ("slam", "logo", "name"):
        punch = 1.0 + 0.22 * (1 - ease_out(lt / 0.18, 4))
        push = 1.0 + (0.06 if k != "slam" else 0.03) * (lt / dur)
        flick = 0.0 if (k != "logo" and int(lt * FPS) in (1, 3)) else 1.0
        a = min(1.0, lt / 0.04) * flick * ease_in_out(rem / 0.15)
        sx, sy = shake(t, 10)
        place(c, sp[0], cx + sx, cy + sy, punch * push, a, 3 * (1 - ease_out(lt / 0.12)))
        glow(c, 0.55 if k != "slam" else 0.4, 22)
        rgb_split(c, 14 * (1 - ease_out(lt / 0.35)))
    elif k == "slate":
        a = ease_in_out(lt / 0.5)
        place(c, sp[0], cx, cy, 1.04 - 0.04 * ease_out(lt / 1.5), a, 10 * (1 - ease_out(lt / 0.6)))
    return c

def export(T):
    out = os.path.join(PROJECT, "titles", f"{T['id']}.mov")
    n = round((T["end"] - T["start"]) * FPS)
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "qtrle", "-pix_fmt", "argb", out], stdin=subprocess.PIPE)
    for f in range(n):
        fr = render(T, T["start"] + (f + 0.001) / FPS)
        p.stdin.write((np.clip(fr, 0, 1) * 255).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait(); print("wrote", out)

if __name__ == "__main__":
    from concurrent.futures import ProcessPoolExecutor
    ids = sys.argv[1:]
    todo = [T for T in TITLES if not ids or T["id"] in ids]
    with ProcessPoolExecutor(4) as ex: list(ex.map(export, todo))
