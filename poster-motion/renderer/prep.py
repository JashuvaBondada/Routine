import sys
from PIL import Image
import numpy as np, cv2
src = Image.open(sys.argv[1]).convert("RGB")
a = np.asarray(src).copy()
H, W = a.shape[:2]
mn = a.astype(int).min(axis=2)
alpha = np.clip((mn - 20) / 200.0, 0, 1)

REGIONS = [(60,120,1020,205),(315,255,790,370),(350,375,728,437),
           (255,1298,890,1585),(360,1585,720,1625),(420,1675,700,1785)]
keep = np.zeros((H, W), bool)
for x0,y0,x1,y1 in REGIONS: keep[y0:y1, x0:x1] = True
alpha = np.where(keep, alpha, 0)

over = np.zeros((H, W, 4), np.uint8)
over[..., :3] = 255
over[..., 3] = (alpha * 255).round().astype(np.uint8)
Image.fromarray(over, "RGBA").save("overlay.png")

mask = ((alpha > 0.04) * 255).astype(np.uint8)
mask = cv2.dilate(mask, np.ones((9, 9), np.uint8))
plate = cv2.inpaint(cv2.cvtColor(a, cv2.COLOR_RGB2BGR), mask, 9, cv2.INPAINT_TELEA)
plate = cv2.cvtColor(plate, cv2.COLOR_BGR2RGB)
# Logos above the photo sit on flat near-black: fill those boxes with the
# surrounding colour rather than inpainting, which leaves faint ghosts.
for x0,y0,x1,y1 in REGIONS[:3]:
    ring = np.concatenate([a[y0-6:y0, x0:x1].reshape(-1,3), a[y1:y1+6, x0:x1].reshape(-1,3)])
    plate[y0-4:y1+4, x0-4:x1+4] = np.median(ring, axis=0).astype(np.uint8)
B = 22  # red frame thickness at this scale
plate[:B] = 0; plate[-B:] = 0; plate[:, :B] = 0; plate[:, -B:] = 0
Image.fromarray(plate).save("plate.png")
print("border colour", a[H//2, 5], "done")
