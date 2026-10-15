"""Beat-synced edit decision list: which placeholder shot sits in which slot.

Each slot becomes its own clip on V1 in Premiere, so any shot can be swapped
for real footage (Replace With Clip) without touching timing or effects.
"""
import json, os
import numpy as np
from timeline import *
from fxlib import beats

MASTER = "PLACEHOLDER_footage_master.mp4"
MASTER_OFFSET = 23.5          # master t=0 is t=23.5s in the reference video
CUTS = [float(x) for x in open(os.path.join(ROOT, "build", "cuts_master.txt")).read().split()]

# (reference-video start, end, mood) — read off the timestamped contact sheet
POOL_RAW = [
    (24.02, 24.60, "city"), (24.67, 25.27, "city"), (25.30, 25.95, "moody"),
    (27.67, 28.30, "city"), (28.36, 28.95, "tunnel"), (29.00, 30.95, "moody"),
    (31.02, 31.95, "energy"), (32.30, 32.95, "energy"), (32.98, 33.55, "energy"),
    (33.95, 34.30, "people"), (34.35, 35.30, "moody"), (35.35, 36.28, "energy"),
    (36.70, 37.95, "moody"), (38.33, 39.30, "dj"), (39.33, 39.62, "people"),
    (40.33, 40.95, "people"), (41.67, 42.00, "moody"), (42.30, 42.95, "energy"),
    (43.00, 43.30, "people"), (44.30, 44.60, "dj"), (44.95, 45.30, "people"),
    (45.33, 46.05, "people"), (46.30, 46.62, "energy"), (46.67, 47.28, "dj"),
    (47.33, 47.62, "people"), (47.67, 47.95, "people"), (48.67, 48.95, "people"),
    (49.00, 49.30, "energy"), (49.67, 49.95, "energy"), (50.00, 50.30, "people"),
    (50.33, 50.95, "dj"), (51.33, 51.62, "energy"), (52.00, 52.95, "dj"),
    (53.00, 53.30, "people"), (53.33, 53.62, "people"), (53.67, 53.95, "energy"),
    (54.00, 54.30, "people"), (54.33, 55.30, "moody"), (55.67, 56.00, "people"),
]

def snap(a, b, edge=0.3):
    """Pull [a,b] (master time) inside any cut detected near its edges."""
    pad = 1 / FPS
    near_a = [c for c in CUTS if a - 0.05 <= c < a + edge]
    near_b = [c for c in CUTS if b - edge < c <= b + 0.05]
    if near_a: a = max(near_a)
    if near_b: b = min(near_b)
    return a + pad, b - pad

POOL = []
for i, (a, b, mood) in enumerate(POOL_RAW):
    s, e = snap(a - MASTER_OFFSET, b - MASTER_OFFSET)
    if e - s >= 0.25:
        POOL.append(dict(id=i, src_in=s, src_out=e, mood=mood, used=0))

def beat_cuts(key, t0, t1, every):
    b = beats(key); b = b[(b > t0 + 0.2) & (b < t1 - 0.2)]
    return list(b[::every])

def q(t):  # quantise to frames
    return round(t * FPS) / FPS

# --- cut plan: (start, end, preferred moods, punch-zoom?) --------------------
SECTIONS = [
    # Reload build: slow + atmospheric, accelerating into the drop
    ([0.0, 2.0, 3.1], 4.2, ["moody"], False),
    (beat_cuts("RELOAD", 4.2, 6.0, 2), 6.0, ["moody", "energy"], False),
    # Reload drop
    ([6.0] + beat_cuts("RELOAD", 6.0, 8.8, 2) + beat_cuts("RELOAD", 8.8, 10.0, 1), 10.0, ["energy", "dj", "people"], True),
    # transition: speed tunnel into the city
    ([10.0, 10.55], 11.0, ["tunnel", "city"], False),
    # Chainsmokers drop
    ([11.0] + beat_cuts("ATT", 11.0, 15.4, 2), 15.4, ["energy", "dj", "people"], True),
    # ONE CITY
    ([15.4, 15.9, 16.4, 16.9], 17.4, ["city", "tunnel", "energy"], False),
    (beat_cuts("ATT", 17.4, 20.0, 2), 20.0, ["people", "energy"], True),
    # Jalebi groove: people & faces, cut on the beat
    ([20.0] + beat_cuts("JALEBI", 20.0, 29.4, 1), 29.4, ["people", "dj"], True),
    # tension before the DJ Snake drop
    ([29.4, 30.0, 31.5], 33.0, ["moody"], False),
    # DJ Snake drop: fastest cutting of the film
    ([33.0] + beat_cuts("MAGENTA", 33.0, 35.0, 1) + beat_cuts("MAGENTA", 35.0, 38.0, 2), 38.0, ["energy", "dj", "people"], True),
]

MIN_SPEED = 0.5

def build():
    for p in POOL: p["used"] = 0
    slots = []
    for cuts, end, moods, punch in SECTIONS:
        cuts = sorted(set(q(c) for c in cuts if c < end))
        if not cuts: continue
        if cuts[0] > slots[-1]["end"] + 1e-6 if slots else False:
            cuts = [slots[-1]["end"]] + cuts
        if slots and abs(cuts[0] - slots[-1]["end"]) > 1e-6:
            cuts = [slots[-1]["end"]] + cuts
        for a, b in zip(cuts, cuts[1:] + [q(end)]):
            slots.append(dict(start=a, end=b, moods=moods, punch=punch))
    # assign shots: matching mood, least used; a shot shorter than its slot is
    # slowed down (speed >= MIN_SPEED) so every placeholder fills its beat.
    edl, prev = [], None
    for s in slots:
        need = s["end"] - s["start"]
        fits = lambda p: p["src_out"] - p["src_in"] >= need * MIN_SPEED - 1e-6 and p is not prev
        cand = [p for p in POOL if p["mood"] in s["moods"] and fits(p)] or [p for p in POOL if fits(p)]
        rank = {m: i for i, m in enumerate(s["moods"])}
        p = min(cand, key=lambda p: (p["used"], rank.get(p["mood"], 9), -(p["src_out"] - p["src_in"])))
        length = p["src_out"] - p["src_in"]
        speed = min(1.0, length / need)
        src_len = need * speed
        off = 0.5 * (length - src_len) if p["used"] % 2 else 0.0   # reuse a different part
        edl.append(dict(start=s["start"], end=s["end"], src_in=round(p["src_in"] + off, 4),
                        src_len=round(src_len, 4), speed=round(speed, 4), shot=p["id"],
                        mood=p["mood"], punch=s["punch"]))
        p["used"] += 1; prev = p
    return edl

EDL = build()

if __name__ == "__main__":
    for i, c in enumerate(EDL):
        print(f"{i:02d} {c['start']:6.3f}-{c['end']:6.3f} ({c['end']-c['start']:.2f}s) shot {c['shot']:2d} {c['mood']:7s} speed {c['speed']:.2f}")
    json.dump(EDL, open(os.path.join(ROOT, "build", "edl.json"), "w"), indent=1)
    print(len(EDL), "clips; last end", EDL[-1]["end"])
