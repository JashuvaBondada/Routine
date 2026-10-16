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
| 4.3 – 5.1 | Top logos (Pinnacle, Dynamo, FLUB) drop in while the bottom logos (Heineken 0.0, dsk) rise in |
| 5.1 – 6.6 | GIORGIA ANGIULI letters roll through random letters, then land one by one |
| 6.1 – 7.0 | HALLOWEEN WEEKEND and (LIVE) roll in |
| 7.0 – 9.5 | Hold |

## After Effects script

`PosterMotion.jsx` builds the same animation in After Effects from your layered
PSD, with music:

1. **File → Scripts → Run Script File…** → `PosterMotion.jsx`.
2. In the dialog, pick the **Poster PSD**, the **Song**, the time in the song to
   **start from** (`1:23.5` or `83.5`), and the **video length** (at least 9.5 s).
3. Click **Animate**.

It imports the PSD as *Composition – Retain Layer Sizes*, animates it, lines up
the song so the chosen moment plays at 0:00 (with a short fade in and out),
opens the comp and adds it to the Render Queue. Leave the PSD empty to animate
the comp that's already open.

Layer names don't matter: each layer is recognised by where it sits on the
poster and what kind of layer it is. The photo is the biggest layer, the red
half box is the multiply fill, the red frame is the full-size layer above the
background, then by height on the poster: top logos, location, date, name /
(LIVE) / subtitle, bottom logos. Tick **Let me check which layer is which** to
review or change the picks. On this poster's PSD the picks are:

| Part | PSD layer |
|---|---|
| Artist photo | Curly-haired woman in silver mesh outfit |
| Red frame (hidden, then drawn) | Layer 2 |
| Red half box | Color Fill 2 |
| Location | Vector Smart Object (the one at the top-centre) |
| Date | Rectangle 1 + 30th oct - 01st nov |
| Top logos | Pinnacle black logo, IMG_4792, Vector Smart Object |
| Bottom logos | IMG_4771 (1), dsk logo blanco |
| Name / (LIVE) / subtitle | giorgia angiuli, (live), halloween weekend |

As in the video, only the top half of the photo shows at first; the red box
and the bottom half sweep in together along the diagonal. PSD text is converted
to editable text so the letter roll works, and the whole run is one Edit → Undo.

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
