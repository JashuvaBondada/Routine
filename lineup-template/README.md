# Lineup slide template (After Effects, 1080x1920)

Slide 2 = artist lineup over a black box. On every beat the box jumps to a new size/position and a
different footage precomp plays inside it. `preview.mp4` shows the motion with placeholder footage.

1. Beats from your song (optional, otherwise the script uses 120 BPM):
   `pip install librosa` then `python beats.py song.mp3 --start 2` (`--every 2` = shift every other beat).
2. After Effects: **File > Scripts > Run Script File… > `Lineup_Template.jsx`**, pick `beats.txt` and the song when asked.
3. Open `LINEUP_TEMPLATE/FOOTAGE_PRECOMPS/FOOTAGE_01…`, drop a clip in each, delete the placeholder layers.
4. Render `MAIN`. Using Premiere: import the `.aep` (Dynamic Link) or render `MAIN` and drop it on your timeline.

Tweak at the top of the script: `SLIDE1_DUR`, `SNAP_FRAMES` (0 = hard cut), `RECTS` (box positions), `FONT`, `ARTISTS`.
