"""Shared timing helpers: beat envelopes, hit shake/flash, easing."""
import numpy as np, librosa, os
from timeline import *

_beats = {}
def beats(key):
    """Beat times of a song, mapped onto the timeline."""
    if key not in _beats:
        s = next(x for x in SONGS if x["key"] == key)
        cache = os.path.join(ROOT, "build", f"beats_{key}.npy")
        if os.path.exists(cache):
            b = np.load(cache)
        else:
            y, sr = librosa.load(os.path.join(PROJECT, "music", s["file"]), sr=22050,
                                 offset=s["src_in"] - 2, duration=SEG + 4)
            _, fr = librosa.beat.beat_track(y=y, sr=sr, start_bpm=s["bpm"])
            b = librosa.frames_to_time(fr, sr=sr) + s["src_in"] - 2
            np.save(cache, b)
        _beats[key] = b - s["src_in"] + s["start"]
    return _beats[key]

def song_at(t):
    for s in SONGS:
        if s["start"] <= t < s["end"]:
            return s
    return SONGS[-1]

def beat_env(t, key, decay=0.14):
    b = beats(key); b = b[b <= t]
    return float(np.exp(-(t - b[-1]) / decay)) if len(b) else 0.0

def beat_index(t, key):
    b = beats(key); return int((b <= t).sum())

def hit_env(t, decay=0.22):
    v = 0.0
    for h, s in HITS:
        if t >= h:
            v = max(v, s * np.exp(-(t - h) / decay))
    return v

def shake(t, amp=16):
    """Camera shake offset (px at full res) — decays after each hit."""
    e = hit_env(t, 0.28)
    rng = np.random.default_rng(int(t * FPS) + 11)
    return (rng.uniform(-1, 1) * amp * e, rng.uniform(-1, 1) * amp * e * 0.6)

def energy(t):
    """Overall scene intensity 0..1 (drives beam count/brightness)."""
    if t < 6.0:  return 0.22 + 0.35 * (t / 6.0) ** 2
    if t < 10.0: return 1.0
    if t < 11.0: return 0.3
    if t < 20.0: return 0.95
    if t < 30.0: return 0.8 if t < 29.0 else 0.8 - 0.6 * (t - 29.0)
    if t < 33.0: return 0.12 + 0.1 * ((t - 30) / 3) ** 3
    if t < 38.0: return 1.0
    return 0.45

def ease_out(x, p=3): x = np.clip(x, 0, 1); return 1 - (1 - x) ** p
def ease_in_out(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)
