# Number count-up for Premiere Pro

Premiere's own effect presets (`.prfpset`) can only store keyframes for effect
settings. They can't change what a text layer says over time, so a counting
number can't be saved as a `.prfpset`. This folder gives you two ways to get
the effect instead.

## Option 1: ready-made transparent clips (works right away)

`clips/` contains ProRes 4444 `.mov` files with a transparent background
(1920×1080, 30 fps, 3 s count with ease-out plus a 1 s hold):

| File | Counts |
|---|---|
| `countup_0-10000.mov` | 0 → 10,000 |
| `countup_0-100_percent.mov` | 0% → 100% |
| `countup_0-1M_dollars.mov` | $0 → $1,000,000 |

**Install / use:** import the `.mov` into your Premiere project and place it on
a track above your footage (e.g. V2). The background is transparent. To
reposition, scale, add a drop shadow or glow, use Effect Controls → Motion and
the Effects panel as you would on any clip.

To speed it up or slow it down, use right-click → Speed/Duration.

### Make your own numbers

Requirements: Python 3, Pillow (`pip install pillow`), and ffmpeg.

```bash
python3 countup.py --end 5000 --out my_count.mov
python3 countup.py --start 0 --end 99.9 --decimals 1 --suffix "%" --duration 2
python3 countup.py --end 250000 --prefix "$" --color "#FFD54A" --font /path/to/Font.ttf
python3 countup.py --end 1200 --width 1080 --height 1920 --fps 25   # vertical / Reels
```

Options: `--start`, `--end`, `--duration`, `--hold`, `--fps`, `--width`,
`--height`, `--decimals`, `--separator`, `--prefix`, `--suffix`, `--font`,
`--size`, `--color`, `--ease` (`linear`, `ease-out`, `ease-in-out`), `--align`.
Run `python3 countup.py --help` for details. Digits use equal widths, so the
number doesn't wobble while it counts.

## Option 2: editable Motion Graphics Template (needs After Effects)

If you want to type the start/end numbers directly inside Premiere's Essential
Graphics panel, build a `.mogrt` once in After Effects:

1. In AE, create a 1920×1080 comp and add a text layer.
2. Add an Effect → Expression Controls → **Slider Control** to the text layer,
   and rename it `End`. Add a second slider called `Start`. Add a third
   slider called `Decimals`.
3. Alt/Option-click the stopwatch on **Text → Source Text** and paste:

   ```js
   var s = effect("Start")("Slider");
   var e = effect("End")("Slider");
   var d = Math.round(effect("Decimals")("Slider"));
   var dur = 3; // seconds spent counting
   var t = ease(time, inPoint, inPoint + dur, 0, 1);
   var v = s + (e - s) * t;
   var parts = v.toFixed(d).split(".");
   parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
   parts.join(".");
   ```

4. Window → Essential Graphics: drag the `Start`, `End` and `Decimals`
   sliders (and Source Text, if you want font control) into the panel, then
   click **Export Motion Graphics Template**.
5. **Install in Premiere:** Window → Essential Graphics → Browse → right-click
   → *Install Motion Graphics Template…* and pick the `.mogrt`. Drag it onto
   your timeline, then change the numbers in the Edit tab.
