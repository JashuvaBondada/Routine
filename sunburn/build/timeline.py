"""Single source of truth for the Sunburn 2026 headliner teaser.

Every renderer (audio mix, visuals, Premiere XML) reads from here, so the
timing in the rendered preview always matches the Premiere sequence.
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOADS = "/root/.claude/uploads/cad1b182-ebce-56d8-b600-abd277ca5e99"
PROJECT = os.path.join(ROOT, "project")

W, H, FPS, DUR = 2048, 858, 24, 40.0

# --- Music: 4 x 10s, each chosen so its drop/hook lands on a text beat -------
# src_in = where in the original song the 10s window starts (seconds).
# drop   = timeline time where the song's drop/hook hits.
SONGS = [
    dict(key="RELOAD", artist="SEBASTIAN INGROSSO", title="Reload (Radio Edit)",
         file="Reload - Sebastian Ingrosso.mp3",
         upload="fe06d032-Sebastian_Ingrosso__Tommy_Trash_feat._John_Martin_-_Reload_Radio_Edit_-_Dr4g0n98.mp3",
         start=0.0, src_in=72.36, drop=6.0, bpm=129.2, gain_db=-3,
         hue=(255, 178, 60), hue2=(255, 120, 30)),       # golden era: amber/gold
    dict(key="ATT", artist="THE CHAINSMOKERS", title="ALL THE TIME (Extended Mix)",
         file="All The Time - John Summit, The Chainsmokers, Ilsey.mp3",
         upload="291dc9ad-John_Summit_The_Chainsmokers__Ilsey_-_ALL_THE_TIME_Extended_Mix_-_Groove_Bassment.mp3",
         start=10.0, src_in=54.88, drop=11.0, bpm=136.0, gain_db=-3,
         hue=(70, 140, 255), hue2=(170, 80, 255)),       # electric blue/violet
    dict(key="JALEBI", artist="JASON DERULO", title="Jalebi Baby",
         file="Jalebi Baby - Tesher x Jason Derulo.mp3",
         upload="6a3b7879-Tesher_x_Jason_Derulo_-_Jalebi_Baby_Official_Video_-_TesherVEVO.mp3",
         start=20.0, src_in=169.83, drop=20.0, bpm=92.3, gain_db=1,
         hue=(255, 90, 140), hue2=(255, 160, 60)),       # warm pink/saffron
    dict(key="MAGENTA", artist="DJ SNAKE", title="Magenta Riddim",
         file="Magenta Riddim - DJ Snake.mp3",
         upload="75f71400-DJ_Snake_-_Magenta_Riddim_-_Trap_City.mp3",
         start=30.0, src_in=110.26, drop=33.0, bpm=136.0, gain_db=-3,
         hue=(255, 30, 160), hue2=(255, 40, 60)),        # magenta/red
]
SEG = 10.0
XFADE = 0.25           # audio overlap between songs
for s in SONGS:
    s["end"] = s["start"] + SEG

# Song fades (timeline seconds, linear gain 0..1 keyframes) — mirrored in XML
def song_gain_keys(i):
    s = SONGS[i]
    a, b = s["start"], s["end"]
    if i == 0:
        keys = [(a, 0.0), (a + 0.35, 1.0)]
    elif i == 2:   # Jalebi enters on its beat — quick fade-in
        keys = [(a, 0.0), (a + 0.04, 1.0)]
    else:
        keys = [(a, 0.0), (a + 0.06, 1.0)]
    if i == 3:
        keys += [(b - 1.6, 1.0), (b, 0.0)]
    elif i == 2:   # pull Jalebi down into the silence before the Magenta drop
        keys += [(b - 0.4, 1.0), (b + XFADE, 0.0)]
    else:
        keys += [(b - 0.15, 1.0), (b + XFADE, 0.0)]
    return keys

# --- Sound design (file, timeline start, gain dB) ---------------------------
SFX = [
    ("impact_soft.wav",        0.30, -7),
    ("whoosh_fast.wav",        2.10, -9),
    ("whoosh_fast.wav",        3.90, -9),
    ("reverse_cymbal_1s.wav",  5.00, -6),
    ("impact_big_drop.wav",    6.00, -3),
    ("sub_drop.wav",           6.00, -7),
    ("riser_2s.wav",           8.00, -9),
    ("glitch_stutter.wav",     9.75, -12),
    ("impact_cinematic.wav",  11.00, -4),
    ("light_hit.wav",         11.00, -9),
    ("whoosh_slow.wav",       14.90, -9),
    ("whoosh_fast.wav",       17.30, -10),
    ("reverse_cymbal_2s.wav", 18.00, -7),
    ("impact_cinematic.wav",  20.00, -5),
    ("whoosh_fast.wav",       24.80, -10),
    ("riser_3s.wav",          27.00, -9),
    ("impact_soft.wav",       30.00, -5),
    ("tension_drone.wav",     30.00, -8),
    ("reverse_cymbal_1s.wav", 32.00, -5),
    ("impact_big_drop.wav",   33.00, -2),
    ("sub_drop.wav",          33.00, -6),
    ("light_hit.wav",         33.00, -7),
    ("whoosh_fast.wav",       36.30, -10),
    ("impact_cinematic.wav",  38.00, -6),
    ("downlifter.wav",        38.00, -11),
]

# --- Titles (one overlay clip each) -----------------------------------------
# kind: reveal = tracking-in fade; slam = punch-in with RGB split; logo = PNG
TITLES = [
    # sub = reference style: small gold caps, wide tracking, soft fade
    dict(id="T01_golden_era",  start=0.30, end=2.40, kind="sub",  lines=["THE GOLDEN ERA OF EDM."]),
    dict(id="T02_big_stage",   start=2.40, end=4.20, kind="sub",  lines=["BACK ON THE BIG STAGE."]),
    dict(id="T03_4_headliners",start=4.20, end=6.00, kind="slam", lines=["4 HEADLINERS. 2 DAYS."]),
    dict(id="T04_ingrosso",    start=6.00, end=10.00, kind="logo", logo="SEB LOGO MAIN WHITE.png"),
    dict(id="T05_chainsmokers",start=11.00, end=15.40, kind="logo", logo="logo_white_updated.png"),
    dict(id="T06_one_city",    start=15.40, end=17.40, kind="sub",  lines=["ONE CITY."]),
    dict(id="T07_massive_wknd",start=17.40, end=20.00, kind="slam", lines=["ONE MASSIVE WEEKEND."]),
    dict(id="T08_derulo",      start=20.00, end=24.80, kind="name", lines=["JASON DERULO"]),
    dict(id="T09_dates_venue", start=24.80, end=29.40, kind="sub",
         lines=["18 – 19 DECEMBER", "MAHALAXMI RACECOURSE, MUMBAI"]),
    dict(id="T10_sunburn_2026",start=30.00, end=33.00, kind="sub",  lines=["SUNBURN FESTIVAL 2026"], scale=1.5),
    dict(id="T11_djsnake",     start=33.00, end=36.40, kind="logo", logo="Asset 1.png", invert=True),
    dict(id="T12_tickets",     start=36.40, end=38.00, kind="sub",
         lines=["TICKETS LIVE EXCLUSIVELY ON", "BOOKMYSHOW"]),
    dict(id="T13_end_slate",   start=38.00, end=40.00, kind="slate", logo="ILU26_ILU26.png"),
]

# Hard hits: white flash + camera shake (timeline seconds, strength 0..1)
HITS = [(0.30, 0.25), (6.00, 1.0), (11.00, 0.85), (20.00, 0.7),
        (30.00, 0.35), (33.00, 1.0), (38.00, 0.5)]
