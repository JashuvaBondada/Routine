#!/usr/bin/env python3
"""Render a number count-up animation as a transparent video for Premiere Pro.

The output is a ProRes 4444 .mov with an alpha channel: drop it on a track
above your footage and the background stays see-through.

Examples:
    python3 countup.py --end 10000 --out countup_10k.mov
    python3 countup.py --start 0 --end 99.9 --decimals 1 --suffix "%" --duration 2
    python3 countup.py --end 2500000 --prefix "$" --color "#FFD54A" --ease linear
"""
import argparse
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

DEFAULT_FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"

EASINGS = {
    "linear": lambda t: t,
    "ease-out": lambda t: 1 - (1 - t) ** 3,
    "ease-in-out": lambda t: 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2,
}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--start", type=float, default=0)
    p.add_argument("--end", type=float, default=1000)
    p.add_argument("--duration", type=float, default=3.0, help="seconds spent counting")
    p.add_argument("--hold", type=float, default=1.0, help="seconds to hold the final number")
    p.add_argument("--fps", type=float, default=30)
    p.add_argument("--width", type=int, default=1920)
    p.add_argument("--height", type=int, default=1080)
    p.add_argument("--decimals", type=int, default=0)
    p.add_argument("--separator", default=",", help="thousands separator ('' for none)")
    p.add_argument("--prefix", default="")
    p.add_argument("--suffix", default="")
    p.add_argument("--font", default=DEFAULT_FONT, help="path to a .ttf/.otf file")
    p.add_argument("--size", type=int, default=220, help="font size in pixels")
    p.add_argument("--color", default="#FFFFFF")
    p.add_argument("--ease", choices=EASINGS, default="ease-out")
    p.add_argument("--align", choices=["center", "left", "right"], default="center")
    p.add_argument("--out", default="countup.mov")
    return p.parse_args()


def format_number(value, args):
    text = f"{value:,.{args.decimals}f}"
    if args.separator != ",":
        text = text.replace(",", args.separator)
    return f"{args.prefix}{text}{args.suffix}"


def char_advance(font, ch, digit_width):
    # Every digit gets the same width so the number doesn't wobble while counting.
    return digit_width if ch.isdigit() else font.getlength(ch)


def render_frame(text, font, digit_width, args):
    img = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    total = sum(char_advance(font, ch, digit_width) for ch in text)
    margin = args.width * 0.08
    x = {"center": (args.width - total) / 2, "left": margin, "right": args.width - margin - total}[args.align]
    y = args.height / 2
    for ch in text:
        adv = char_advance(font, ch, digit_width)
        # Center each glyph in its cell, vertically anchored on the middle of the line.
        draw.text((x + adv / 2, y), ch, font=font, fill=args.color, anchor="mm")
        x += adv
    return img


def main():
    args = parse_args()
    font = ImageFont.truetype(args.font, args.size)
    digit_width = max(font.getlength(d) for d in "0123456789")
    ease = EASINGS[args.ease]

    count_frames = max(1, round(args.duration * args.fps))
    hold_frames = round(args.hold * args.fps)

    ffmpeg = subprocess.Popen(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgba",
            "-s", f"{args.width}x{args.height}", "-r", str(args.fps), "-i", "-",
            "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
            "-vendor", "apl0", args.out,
        ],
        stdin=subprocess.PIPE,
    )

    last_text, last_bytes = None, None
    for i in range(count_frames + hold_frames):
        t = min(1.0, i / count_frames)
        value = args.start + (args.end - args.start) * ease(t)
        text = format_number(value, args)
        if text != last_text:
            last_text = text
            last_bytes = render_frame(text, font, digit_width, args).tobytes()
        ffmpeg.stdin.write(last_bytes)

    ffmpeg.stdin.close()
    if ffmpeg.wait() != 0:
        sys.exit("ffmpeg failed")
    print(f"Wrote {args.out} ({count_frames + hold_frames} frames, final value {last_text})")


if __name__ == "__main__":
    main()
