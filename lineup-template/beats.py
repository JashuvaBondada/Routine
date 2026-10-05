"""Detect beats in a song and write beats.txt for Lineup_Template.jsx.

    pip install librosa
    python beats.py song.mp3                      # every beat
    python beats.py song.mp3 --every 2            # box shifts every 2nd beat
    python beats.py song.mp3 --start 2 --end 12   # only beats between 2 s and 12 s of the song

Times in beats.txt are seconds from the start of the song, so put the song at 0 in MAIN.
"""
import argparse

import librosa


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--every", type=int, default=1, help="beats per box shift")
    ap.add_argument("--start", type=float, default=0.0, help="ignore beats before this second")
    ap.add_argument("--end", type=float, default=None, help="ignore beats after this second")
    ap.add_argument("--offset", type=float, default=0.0, help="nudge every beat by this many seconds")
    ap.add_argument("-o", "--out", default="beats.txt")
    args = ap.parse_args()

    y, sr = librosa.load(args.audio, sr=None, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr)
    times = librosa.frames_to_time(frames, sr=sr) + args.offset
    times = [t for t in times if t >= args.start and (args.end is None or t <= args.end)]
    times = times[:: max(args.every, 1)]

    with open(args.out, "w") as f:
        f.write("\n".join(f"{t:.3f}" for t in times) + "\n")
    bpm = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
    print(f"{bpm:.1f} BPM, {len(times)} shifts -> {args.out}")


if __name__ == "__main__":
    main()
