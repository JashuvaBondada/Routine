# Glow Tunnel (After Effects)

`GlowTunnel.jsx` builds a story-size (1080×1920) glowing text animation in the
style of the reference video: the word sits sharp in the middle while copies of
it stream outward above and below, each one bigger and taller than the last,
pinched toward the middle (the "squeeze"), smeared into light streaks, tinted
orange and glowing, with a gentle sway and film grain.

`alesso_glow_preview.mp4` is a preview of the look, rendered outside After
Effects with Anton standing in for Futura Condensed ExtraBold.

## Run it

1. **File → Scripts → Run Script File…** → `GlowTunnel.jsx`.
2. Pick the PSD (the text and font are taken from it) or type the text.
3. Set the colour (`#FF6A00` orange by default), the song, where in the song to
   start (`1:23.5` or `83.5`) and the video length. Click **Create**.

It makes a new comp, `<TEXT> - Glow Tunnel`, opens it and adds it to the
Render Queue. Everything is one Edit → Undo.

## Change the look afterwards

Select the **CONTROLS** layer in the comp and use Effect Controls:

| Control | What it does | Default |
|---|---|---|
| Color | The tint of everything, change it any time | orange `#FF6A00` |
| Glow | Glow strength, % | 100 |
| Streaks | Length of the light streaks (zoom blur) | 60 |
| Squeeze | How hard the middle pinches in; it pulses | 0.5 |
| Speed | Copies per second flowing outward | 0.8 |
| Growth | Each copy is this much bigger than the last | 1.6 |
| Stretch | Each copy is this % taller than the last | 25 |
| Sway | How far everything rocks, degrees | 3 |
| Twist | Extra turn per copy, degrees (breaks up straight lines) | 4 |
| Copies | Opacity of the copies, % | 75 |
| Grain | Film grain, % | 7 |

## How it's built

| Layer | Job |
|---|---|
| CONTROLS | Null with the controls above |
| Glow + Grain | Adjustment: two Glows, Noise (grain) |
| Colour (set on CONTROLS) | Full-frame shape filled with Color, Multiply blend: white becomes the colour |
| Main Text | The word, sharp, scales in and breathes with the squeeze |
| Hourglass Shade | Black solid with a feathered hourglass mask, darkens the side wedges |
| Squeeze + Streaks | Adjustment: Bulge with negative height (pinch), CC Radial Fast Blur (streaks) |
| Copy Up/Down 1–5 | Duplicates of the word driven by expressions (size, stretch, position, twist, fade) |
| Black, Song | Background and the music |

CC Radial Fast Blur is used for the streaks because it renders far faster than
Radial Blur; the script falls back to Radial Blur only if it's missing. If an
effect or setting isn't available in your version, the script still finishes
and lists what it skipped. At the end it also checks every expression in the
comp; anything that needs attention is shown and saved to
`GlowTunnel report.txt` on your Desktop. The font is the PSD's (Futura-CondensedExtraBold); if
it isn't installed, After Effects uses its default font and the script says so.

To change the word later, run the script again with the new text (the copies
are made at build time).
