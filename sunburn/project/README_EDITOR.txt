SUNBURN FESTIVAL 2026 - 4 HEADLINERS - 40s TEASER
2048 x 858 (2.39:1 cinema scope) - 24 fps - 48 kHz stereo
==================================================================

OPEN IN PREMIERE PRO
--------------------
1. Copy this whole folder to:   /Users/Shared/SUNBURN26_Premiere   (Mac)
   -> every file links automatically.
   On Windows / any other location: import anyway, Premiere shows
   "Link Media" -> locate ONE file -> tick "Relink others automatically".
2. File > Import > SUNBURN26_Headliners_Teaser.xml
3. Open the sequence "SUNBURN26 Headliners Teaser 40s".
4. GRADE (one step, XML can't carry Lumetri):
   File > New > Adjustment Layer (2048x858) -> drop it on a new track
   directly ABOVE V1, 00:00 - 00:38 -> Lumetri Color > Creative > Look >
   Browse -> grade/SUNBURN26_cinematic_warm.cube   (Intensity ~100)
5. Optional film grain: Effects > Noise (2-4%) on the same adjustment layer.

TRACK LAYOUT
------------
V1  Footage - 53 PLACEHOLDER clips, beat-cut. Each has Scale keyframes
    (punch-zoom 114%->100% on drop beats, slow 100->104% push elsewhere).
V2  Vignette (still)
V3  Titles - one alpha clip per line (ProRes-free QuickTime Animation)
V4  FX - white flashes on the hits, fade from black, film-frame border
A1  Reload - Sebastian Ingrosso          (src 1:12.36, drop 1:18.36 -> 0:06)
A2  All The Time - Chainsmokers          (src 0:54.88, drop 0:55.88 -> 0:11)
A3  Jalebi Baby - Jason Derulo           (src 2:49.83, chorus)       -> 0:20
A4  Magenta Riddim - DJ Snake            (src 1:50.26, drop 1:53.26 -> 0:33)
A5-A7  SFX (impacts, risers, reverse cymbals, sub drops, whooshes)
A8  MIX_reference.wav - DISABLED. The exact mix of the preview. Enable it
    (and mute A1-A7) if anything sounds different after import.
Markers on the sequence ruler mark every drop / section.

The songs reference the ORIGINAL full mp3s, so you can slip any song
(Slip tool, Y) to use a different part of it. Fades are Audio Level
keyframes on each song clip.

REPLACING THE PLACEHOLDER FOOTAGE  (keeps timing, zooms and grade)
--------------------------------------------------------------------
The footage on V1 is TEMPORARY - cut from the style reference video only
to show the rhythm. It must be replaced before publishing.
Every slot is its own file, named by position + mood:
    V1_23_17.79s_energy.mp4   = clip 23, starts at 17.79s, wants an energy shot
Fast way:  Project panel -> right-click the placeholder -> Replace Footage
           -> pick your Motion Array clip. (Then Clip > Video Options >
           Set to Frame Size if it's 4K.)
Or on the timeline: select clip, Alt/Option-drag new clip onto it.

Mood guide: moody = haze/silhouettes/slow; energy = lasers, CO2, crowd
jumping, wides; dj = DJ hands/decks/close-ups; people = faces, dancing;
city = Mumbai skyline/aerials; tunnel = speed/travel transition.

TEXT
----
Titles are rendered clips (Premiere's XML import can't carry editable
Essential Graphics text). To change wording: retype it with the Type
tool in Essential Graphics using the style below, or ask for a re-render.
  Subtitles (gold): Inter Display SemiBold, 46 px, tracking ~320,
                    colour #F2C94C, soft glow, 9-frame fade in.
  Headlines/Name:   Inter Display Bold/Black, white, tracking 80-160,
                    4-frame punch-in 122% -> 100% + RGB split.
  Logos:            source PNGs in logos/ (DJ Snake inverted to white).
