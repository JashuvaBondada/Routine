"""Preview of the glow-tunnel look, built the way the AE script builds it:
rows of text corner-pinned into a floor and ceiling, zoom blur, tint, glow, grain."""
import sys, math
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 1080, 1920, 30, 6.0
TEXT, FONT = sys.argv[1], sys.argv[2]
OUT = sys.argv[3]
COLOR = np.array([1.0, 0.42, 0.06])  # orange, linear-ish RGB 0..1
cx, cy = W / 2, H / 2

# Size the word to ~62% of the width, like the script does.
size = 200
f = ImageFont.truetype(FONT, size)
tw = f.getlength(TEXT)
size = int(size * 0.62 * W / tw)
f = ImageFont.truetype(FONT, size)
bb = f.getbbox(TEXT, anchor="mm")
tw, th = bb[2] - bb[0], bb[3] - bb[1]

def word_img():
    im = Image.new("L", (W, int(th * 1.6)), 0)
    ImageDraw.Draw(im).text((W / 2, im.height / 2), TEXT, font=f, fill=255, anchor="mm")
    return np.asarray(im, np.float32) / 255

WORD = word_img()
PITCH = int(th * 1.5)

def rows(offset):
    """Rows of the word filling W x H, scrolled by offset px (wraps every PITCH)."""
    canvas = np.zeros((H + 2 * PITCH, W), np.float32)
    off = int(offset % PITCH)
    y = -PITCH + off
    while y < H + PITCH:
        y0 = y + PITCH
        a = max(0, y0 - WORD.shape[0] // 2); b = min(canvas.shape[0], a + WORD.shape[0])
        canvas[a:b] = np.maximum(canvas[a:b], WORD[: b - a])
        y += PITCH
    return canvas[PITCH:PITCH + H]

GAP = th * 0.42
GROW, STRETCH, SPEED, N_COPIES = 1.6, 0.25, 0.8, 5
NEAR_HALF, FAR_HALF = W * 0.52, W * 3.0  # rows are word-wide, so the sides stay dark
def pin(img, ul, ur, ll, lr):
    src = np.float32([[0, 0], [W, 0], [0, H], [W, H]])
    M = cv2.getPerspectiveTransform(src, np.float32([ul, ur, ll, lr]))
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_LINEAR)

def zoom_blur(img, amount, n=28):
    """Average of copies scaled about the centre (what a zoom/radial blur does)."""
    acc = np.zeros_like(img)
    for i in range(n):
        s = 1 + amount * i / n
        M = np.float32([[s, 0, cx * (1 - s)], [0, s, cy * (1 - s)]])
        acc += cv2.warpAffine(img, M, (W, H))
    return acc / n

# Hourglass matte: dark wedges at the sides, pinched to 36% of the width at the middle.
_m = np.zeros((H, W), np.uint8)
cv2.fillPoly(_m, [np.int32([[0, 0], [W, 0], [cx + 0.27 * W, cy], [W, H], [0, H], [cx - 0.27 * W, cy]])], 255)
HOURGLASS = cv2.GaussianBlur(_m.astype(np.float32) / 255, (0, 0), 60)
# Pinch ("squeeze"): like AE Bulge with negative height. Samples further from the
# centre near the waist, so content there is pulled in and the rows curve.
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_dx, _dy = _xx - cx, _yy - cy
_r2 = (_dx / (W * 0.8)) ** 2 + (_dy / (H * 0.5)) ** 2
_FALL = np.where(_r2 < 1, (1 - _r2) ** 2, 0).astype(np.float32)
def pinch(img, k):
    f = 1 + k * _FALL
    return cv2.remap(img, cx + _dx * f, cy + _dy * f, cv2.INTER_LINEAR)
rng = np.random.default_rng(1)
proc = None
FRAMES = [int(x) for x in sys.argv[4].split(",")] if len(sys.argv) > 4 else range(int(DUR * FPS))
for fr in FRAMES:
    t = fr / FPS
    intro = min(1, t / 1.0)
    speed = 260
    # Copies flow outward: copy k is GROW**k the size and stretched taller as it goes.
    stack = np.zeros((H, W), np.float32)
    flow = (t * SPEED) % 1
    for i in range(N_COPIES):
        k = i + flow
        sc = GROW ** k; sy = sc * (1 + STRETCH * k)
        d = th * (0.1 + 0.95 * (GROW ** k - 1) / (GROW - 1)) + th * 0.45 * sy
        alpha = min(1, k / 0.5) * 0.75
        for sgn in (-1, 1):
            # Scale + stretch about the word centre, then twist each copy a little more.
            ang = math.radians(sgn * k * 4 + math.sin(t * 0.9) * 3)
            ca, sa = math.cos(ang), math.sin(ang)
            A = np.float32([[ca * sc, -sa * sy], [sa * sc, ca * sy]])
            c0 = np.float32([cx, WORD.shape[0] / 2])
            tgt = np.float32([cx, cy + sgn * d])
            M = np.hstack([A, (tgt - A @ c0)[:, None]]).astype(np.float32)
            stack = np.maximum(stack, cv2.warpAffine(WORD, M, (W, H)) * alpha)
    floor = ceil = stack
    streak = 0.42 + 0.5 * (1 - intro)
    squeeze = 0.28 + 0.12 * math.sin(t * 2 * math.pi * 0.45)
    tunnel_raw = zoom_blur(pinch(np.maximum(floor, ceil), squeeze), streak) * 1.6 * min(1, t / 0.6)
    tunnel = tunnel_raw * HOURGLASS
    # Centre word: scales 130% -> 100% and fades in.
    s = 1.3 - 0.3 * (1 - (1 - intro) ** 3)
    M = np.float32([[s, 0, cx * (1 - s)], [0, s, cy * (1 - s) + (cy - WORD.shape[0] / 2) ]])
    centre = cv2.warpAffine(WORD, np.float32([[s, 0, cx * (1 - s)], [0, s, cy - s * WORD.shape[0] / 2]]), (W, H)) * min(1, t / 0.5)
    lum = np.clip(np.maximum(tunnel, centre), 0, 1)
    # Sway the whole frame a few degrees.
    R = cv2.getRotationMatrix2D((cx, cy), math.sin(t * 0.9) * 3, 1.0)
    lum = cv2.warpAffine(lum, R, (W, H))
    # Tint: black -> black, white -> COLOR, with whites pushing toward white-hot.
    rgb = lum[..., None] * COLOR[None, None] + (lum[..., None] ** 5) * (1 - COLOR)[None, None] * 0.7
    # Glow: blurred bright parts added back on top.
    glow = cv2.GaussianBlur(rgb, (0, 0), 40) * 0.55 + cv2.GaussianBlur(rgb, (0, 0), 9) * 0.45
    out = 1 - (1 - rgb) * (1 - np.clip(glow, 0, 1))  # screen
    out += rng.normal(0, 0.035, (H, W, 1)).astype(np.float32)
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(f"{OUT}/f_{fr:04d}.png")
print("size", size, "tw", tw, "th", th)
