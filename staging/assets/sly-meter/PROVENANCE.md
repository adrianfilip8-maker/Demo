# sly-meter — the health meter behind §731.5's readout

| | |
|---|---|
| source repo | the reference Godot project, HEAD `a312a99` |
| plate | `Assets/Textures/Icons/Health_Meter_V1_-_A_Thief_in_Paris.png` — 1920 x 1195, 141377 bytes |
| fill | `Assets/Textures/Icons/Health_Meter_V1_PROGRESS_BAR_HP.png` — 1920 x 1195, 46320 bytes |
| licence | **NONE STATED** in that repository |
| shipped as | `src/ui/HealthMeter.js`, 320 x 175, plate 25467 B + fill mask 9197 B, inlined base64 |
| baked by | `tools/godot2meter.mjs` |

Plate palette (share of opaque texels):

- `#7f7f7f` — 57.8%
- `#262671` — 13.7%
- `#c5c5c5` — 8.4%

**V1 chosen over V2.** Both are plate+fill pairs. V2's fill is pale cyan `#97fdfd` and composites
at full to a partial crescent with no track outline; V1's is mid blue `#4aa0d0` and composites to a
complete outlined oval with the mask on it, which is what the owner pointed at. V1's plate also
carries the POW track (its own bronze `PROGRESS_BAR_POW` layer, a second stat this project does not
have); since §731 is visual-only and pinned at full, that track is included in the fill silhouette
so the meter reads full.

**The fill colour is NOT baked.** It ships as an alpha silhouette and the HUD paints it with
`PAL.blue` imported from `src/player/SlyModel3.js` — the owner asked for the character's own blue,
and that file's G1 rule makes it one named constant across cap, shirt, gloves and boots. Burning a
hex here would let the meter drift from the outfit.

Nothing under that repository's audio directories is read, referenced or named by this project.
