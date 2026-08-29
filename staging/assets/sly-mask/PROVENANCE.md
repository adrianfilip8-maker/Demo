# sly-mask — the Cooper insignia used by §731.3's health readout

| | |
|---|---|
| source repo | the reference Godot project, HEAD `a312a99` |
| source path | `Assets/Textures/Icons/Life_Icon_V2_-_Sly_Cooper_A_Thief_In_Paris.png` |
| source size | 1898 x 1195, 8-bit RGBA, 110266 bytes |
| coverage | 78.1% opaque, 21.9% transparent |
| licence | **NONE STATED** in that repository |
| shipped as | `src/ui/MaskBadge.js`, 128 x 81, 10328 byte PNG inlined as base64 |
| baked by | `tools/godot2mask.mjs` |

Sampled palette (share of opaque texels):

- `#262671` — 34.1%
- `#c5c5c5` — 20.8%
- `#242424` — 14.1%

The owner photographed this mark and asked for the health readout to look like it. It is used as
a HUD pip and nothing else; it is not mapped onto any mesh and drives no behaviour. The same
directory in that repository also holds `Health_Meter_V1/V2` and their `PROGRESS_BAR_HP`/`POW`
fill layers, which compose into a radial FILL meter — a functional readout, evaluated and not
shipped, because the owner asked for visual only. See §731.4.

Nothing under that repository's audio directories is read, referenced or named by this project.
