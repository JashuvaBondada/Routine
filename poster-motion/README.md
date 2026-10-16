# Giorgia Angiuli poster – motion graphic

`giorgia_angiuli_motion.mp4` is a 1080×1920, 30 fps, 9.5 s animation built
from the flat poster. It ends on the finished poster.

## Timing

| Time (s) | What happens |
|---|---|
| 0.0 – 0.4 | Black |
| 0.4 – 2.4 | Person fades in with a slow push (110% → 100%, then drifts to 102.5%) |
| 1.2 – 2.4 | Thin red line draws around the frame from the top centre |
| 2.3 – 2.8 | Frame line thickens to the full red border |
| 2.3 – 2.95 | Bright line draws along the diagonal |
| 2.75 – 3.55 | Red box wipes in up to the diagonal |
| 3.4 – 4.1 | "the location" logo rises in |
| 3.8 – 4.35 | Date pill pops in (slight overshoot) |
| 4.0 – 5.5 | GIORGIA ANGIULI letters roll through random letters, then land one by one |
| 5.0 – 5.9 | HALLOWEEN WEEKEND and (LIVE) roll in |
| 6.0 – 6.85 | Top logos (Pinnacle, Dynamo, FLUB) drop in, left to right |
| 6.7 – 7.4 | Bottom logos (Heineken 0.0, dsk) rise in |
| 7.4 – 9.5 | Hold |

## After Effects script (for the layered file)

`PosterMotion.jsx` rebuilds the same sequence in After Effects on your layered
PSD/AI, so you can edit everything:

1. Import the layered poster as **Composition – Retain Layer Sizes** and open the comp.
2. **File → Scripts → Run Script File…** → `PosterMotion.jsx`.

It finds layers by name (e.g. "person", "border", "red box", "location",
"date", "giorgia", "live", "halloween", "pinnacle", "dynamo", "flub",
"heineken", "dsk"; see the `LAYERS` list at the top of the script). At the
end it lists any layer it couldn't find. The letter roll needs the name,
(LIVE) and subtitle to be live text layers; rasterised text gets a slide-up
instead. It adds a black background, a drawn frame stroke (Trim Paths), a
diagonal line, a Linear Wipe on the red box, and keyframes with easing on
everything else. Everything is in one undo step.

## Re-rendering the video

`renderer/` holds the pipeline used for the MP4: `prep.py` splits the flat
poster into a clean plate and a text/logo overlay; `anim.html` animates them
on a canvas; `render.js` captures frames with Playwright. Then:

```bash
python3 prep.py poster.png            # writes plate.png and overlay.png
node render.js "$PWD" "$PWD/frames"   # needs: npm i playwright
ffmpeg -framerate 30 -i frames/f_%04d.png -c:v libx264 -crf 15 -pix_fmt yuv420p out.mp4
```

Timings are at the bottom of `anim.html` (`renderFrame`). The rolling letters
use Anton (SIL Open Font License, `anton.woff2`).
