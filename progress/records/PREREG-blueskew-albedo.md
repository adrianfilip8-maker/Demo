# PREREG-blueskew-albedo — authored-albedo side of the cap5 cool-character skew

Registered by TEXTURES, blind to SHADING's grade-side registration (coordinator holds both).
Written under SRC FREEZE: no edits, no lock, no commits. Tree **f026ef3**; verdict frames
`shots/cap5/sly-closeup.png` + `sly-key.png` (boot **7b0e3f8 dirty:false** per
`progress/records/cap5-report.json`). Checked, not assumed: `git diff 7b0e3f8..f026ef3`
touches no albedo file (`src/player/SlyModel.js` unchanged) and **none of the modelled
constants** (shadowTeal / shadowBounceMix / shadowTintPeak / fillSkyMix / shadowWash /
bounceGain / saturation / splitStrength / lift / gain / exposure) moved — the frames and the
constants below are the same era.

Instrument: `scratchpad/blueskew.mjs` (frozen with this note). Scope stamp per §11 — the
transforms it does NOT implement: model parts carry no shadow map, no AO pass, no bloom, no
AgX (grade modelled as split-tone + saturation in scene-linear only; AgX sign behaviour cited
from §23/§24.6 records, not recomputed). Measurement masks are the CPU-skinned authored pose
projected through the shot camera (interiorink machinery; tailC/tailD only — the population
whose mask was overlay-verified on this exact frame, `ii-cap5-overlay.png`), 3-px erode, **no
occlusion test** — cross-contamination between the two tail material groups where tufts
overlap is possible and is carried as a caveat where it matters (ρ below).

The observation under attribution (RESULT-cap5.md, end of K4, sealed as observation-only):
*"in both frames the character's overall cast skews cool blue — the tail reads light-blue
with dark bands rather than grey."*

---

## 1. Inventory — the deliberate blue in the committed character palette

`src/player/SlyModel.js` PAL @ f026ef3 (unchanged since before cap5). sRGB bytes | linear
B/max(R,G) | display b−r at native value:

| entry | bytes | B/max lin | b−r | authored intent |
|---|---|---|---|---|
| furMid | (122,139,168) | 1.517 | +46 | **cool by design** — §2.1 "slate blue-grey" |
| furShadow | (83,98,124) | 1.650 | +41 | cool by design |
| furLight | (162,180,205) | 1.338 | +43 | cool by design |
| tailDark | (42,49,66) | 1.774 | +24 | cool by design — the rings |
| shirt / shirtDark | (47,127,196)/(27,79,124) | 2.60/2.58 | +149/+97 | cyan by design (§2.1 cap+shirt) |
| ink | (16,19,25) | 1.493 | +9 | cool by design — efb2e79 hue-flip, luma-matched |
| sclera eff. | lin (0.087,0.138,0.261) | 1.892 | — | pale blue **on purpose** (authored cool to arrive white under the warm chain — its own note) |
| **cream** | (228,223,203) | **0.770** | **−25** | **warm** — muzzle, chest V, **tail light bands** |
| gold | (232,185,66) | 0.068 | −166 | warm |
| eyeWhite | (247,243,230) | 0.851 | −17 | warm-neutral |

Also authored on the character, cool: material `rim` 0.53–0.71 per group with rimColor
`#7fd4ff` — **silhouette-gated** (§24.1: rimSil 93–99% on the character band, 0 on interiors);
the 3-px erode keeps its ~1–3 px band out of every ROI here. Authored warm counter-terms:
`furSSS 0.38` with wrapColor `#ffb07a` — **sh-gated** (`toon.glsl.js:423`), so it is dead on
the shade side and cannot rescue the floor. Eye emissive 0x363636 is neutral and eye-only.

Verified neutral by contract and by code (my side of the ledger): `makeFurMaps` albedo
modulation is a grey texture ("stays near white: it multiplies the authored fur colour",
Body.js:632), and `furTint` vertex jitter is a neutral multiplier — the **only** colorAt that
passes a colour shift is the sclera's. **No blue enters from `src/textures/**` or from the
fur maps: the character's authored chroma lives entirely in the PAL table above.**

So "authored ink doing its job" is a real hypothesis, not a straw man — 7 of 10 entries are
cool on purpose. But the K4 observable is the **tail light band**, and that is `cream`, the
warm exception.

## 2. The authored floor — what the committed albedos produce under identity grade

Floor = neutral light + identity grade ⇒ pixel chroma = albedo chroma, bounded by the one
in-shader albedo modifier that applies (`albShadow = mix(luma, alb, 1+uShadowSat)`,
uShadowSat −0.35):

- **tail light band (cream): b−r ∈ [−25, −16], B/max_lin 0.77–0.85 — warm at every point of
  the range. A neutral chain cannot produce a positive b−r on this material.**
- tail rings (tailDark): b−r ∈ [+16, +24] at native value, B/max_lin 1.50–1.77 — mildly cool.
- Authored tail read at grade identity: **cream with navy rings** (value ladder 0.87 vs 0.19,
  a 4.5:1 step). "Light-blue with dark bands" is not producible from this authoring.
- Ratio-of-ratios ρ = B/max(light band) ÷ B/max(rings): albedo-governed ⇒ **0.43–0.65**;
  incident-light-governed ⇒ **≈ 1.0**.

Committed-chain model (the actual expressions, per §25's rule — `toon.glsl.js:372–400`
transcribed, `_refreshShadowColor` @ ToonMaterial.js:1240–1322 with shadowTeal 0.15,
shadowBounceMix 0.05, shadowTintPeak 0.52; **transcription validated**: it reproduces the
file's own recorded "daylight shadow light = 11.6% of key luminance" exactly):

- daylight uShadowColor = lin (0.096, 0.313, 0.497), B/max 1.59, G/R 3.26 (identical in every
  daylight shot — the peak cap still binds at tod 0.80, keyLum 2.42).
- fill on a shade-side surface (fillSkyMix 0.70, bounceGain 0.42, hemi at Ny 0.2): B/max ~1.5.
- shade-side cream arrives at scene B/max **1.40–1.44** before the grade, ~2.0 after
  split-tone (#2a3f66 cool leg, strength 0.16) + saturation 1.30.
- per-term B share on the shade-side cream (Ny 0.2, ao 0.9): **shadowMul 65.8% · fill 29.4% ·
  wash 4.8%** — registered for reading single-knob legs (non-binding, model figures).
- same cream albedo under the key: scene B/max 0.31 — warm. The chain flips the same
  material's chroma with illumination; an albedo cannot.

## 3. Measured baseline on the cap5 frames (blueskew.mjs --measure, medians on eroded masks)

| population | closeup | sly-key |
|---|---|---|
| tail cream ALL — b−r / coolFrac / B/max / L | **+57** / 94.4% / 1.826 / 39.7 | **+37** / 91.3% / 1.826 / 39.9 |
| tail rings ALL — b−r / B/max / L | +30 / 1.864 / 38.6 | +30 / 1.864 / 38.6 |
| cream SUNPATCH (L≥180, the key-lit tip) | **−66**, coolFrac **0.0%**, B/max 0.712 (n 26) | **−60**, coolFrac 0.0% (n 79) |
| cream SHADE (L<110) | +35 / 94.5% | +33 / 95.4% |
| ρ = B/max(cream)/B/max(rings) | 0.980 | 0.980 |
| frame control b−r: whole / lit region (L≥110) | +27 / **−126** | +27 / **−129** |

What this already settles, before any toggle (findings, not the registered verdict):

1. **The light band's blue is not authorable.** Shade-side cream measures b−r +35..+57
   against a floor of −25..−16 — and +57 exceeds the maximum authorable b−r of *every*
   material in the tail's construction (tailDark +24), so no mask cross-contamination between
   the two tail groups can explain it. Only the shirt (+149) authors more blue, and it is
   nowhere near the tail-tip mask.
2. **The same albedo flips sign with illumination inside one frame** — sun patch −66/−60 at
   coolFrac 0.0% vs shade +35..+57 at ~95%. Same material, same frame, same grade. That is
   the §23-style differing prediction settled by nature's own A/B: an albedo-borne skew
   cannot flip sign with illumination; a light-borne one must.
3. **The chain is warm where the key lands** (lit-region control −126/−129), reproducing
   §23's wall-vs-subject argument on these very frames: a global display-chain term cannot be
   warm on the lit field and cool on the subject. The blue arrives with the *incident
   fill/shadow light* (and whatever the grade does to pixels in that regime), upstream of any
   global display multiply.
4. ρ = 0.980 (both frames) vs albedo-governed 0.43–0.65 — the tail's chroma is
   light-governed. Caveat attached: the furDark mask has no occlusion test and overlapping
   cream tufts can leak in, pushing ρ toward 1 mechanically; ρ is secondary evidence, the
   sign results above are the load-bearing ones.
5. Observation for the record (not scored here): the authored 4.5:1 band value ladder
   delivers ΔL ≈ 1 (39.7 vs 38.6) on the shade side — the ring structure survives as hue and
   ink edge, not value. If the bands are meant to band in shadow, that is a legibility
   question for the shadow/grade regime, not for the albedo ladder.

**Authored-floor answer to the coordinator's question 2: if the grade were identity, the tail
band would read b−r −25..−16 (warm cream), the rings +16..+24 (navy). The measured shade-side
light band sits 51–82 display counts of b−r above the top of its authored range. None of that
excess is authorable from the committed palette; the palette's contribution to the K4 read is
confined to the rings (≤ +24 of their +30) and to the genuinely-slate fur elsewhere on the
body (+41..+46 floors — that part IS ink doing its job).**

## 4. Registered differing prediction — the settling observable for the post-freeze toggle

Designed for SHADING's queue; I do not pick their knobs. This prereg binds to any arm that
**neutralises the chroma of the character-incident fill/shadow light and the shadow-regime
grade at matched luminance** ("neutral arm"). Arm-effectiveness gate (a gate, not a verdict):
in the neutral arm a shadowed-paving ROI's b−r must land in [−15, +15] and the cream-mask
median L must stay within ±40% of shipped (39.7). If the gate fails, bands below do not
apply; single-knob legs that fail the gate are read against the model's per-term shares
(shadowMul 66% / fill 29% / wash 5%) as partial attributions, not against the bands.

**Settling observable:** median b−r on the frozen cream tail mask (tailC/D ∩ furCream, erode
3, `blueskew.mjs` as committed with this note), shot `sly-closeup`, neutral arm.

The two hypotheses predict differently — registered before any toggle frame exists:

- **H-albedo ("authored ink doing its job"):** the blue is in the authoring, so it survives
  grade/light neutralisation ⇒ cream-mask b−r stays **≥ +10**.
- **H-light/grade ("chain pushing past intent"):** the blue is carried by the incident
  fill/shadow light and the shadow-regime grade ⇒ cream-mask b−r falls to the authored floor,
  **[−34, −6]**; rings land in **[+8, +30]** (their floor survives — that part is authored);
  ρ falls to **≤ 0.75**.

Verdict bands on neutral-arm cream-mask median b−r — they partition ℝ (§26.1):

| band | verdict |
|---|---|
| (−∞, −34) | anomaly — arm added warmth or ROI drift; instrument check, no attribution verdict |
| [−34, −6] | **authored floor confirmed; the light-band blue is entirely light/grade-borne.** TEXTURES/CHARACTER albedo owes nothing to K4's tail read beyond the rings' authored +16..+24 |
| (−6, +10) | partial — residual cool beyond both the floor and the neutralised chain; a **finding**: split further (ordered suspects: incomplete arm, bloom bleed into the ROI (§20), AgX red-pin residue §23/§24.6 — bounded 0–6% on the tail) before any knob moves |
| [+10, ∞) | **H-albedo survives ⇒ my inventory is falsified** — a non-PAL blue term exists on the authored side; re-audit maps/vertex colours/material flags (all currently verified neutral, so I stake the inventory on this band staying empty) |

Same-frame ring-mask control bands (also partitioning): < +8 ⇒ arm over-neutralised chroma
globally (arm invalid for the cream verdict too); [+8, +30] ⇒ expected; > +30 ⇒ arm left
cool light on the subject — judge cream against the rings instead: albedo-governed requires
cream ≥ 30 counts *below* rings (shipped frames have cream 27 counts *above*).

Every adjective above carries a number (§26.2); the only non-binding lines are the ones
marked model figures/findings.

## 5. Routing

- The measured baseline already contradicts H-albedo's sign on the light band; I still
  register both branches — the toggle frame is what may settle it, per §23's rule that a
  contributing term is not thereby the cause.
- If [−34, −6] lands: nothing to change on the authored side for the *blue*. One residual
  authored question then remains, and it is CHARACTER's file, not mine: K4 says "rather than
  **grey**" — a neutral chain will deliver the tail bands as warm **cream** (that is the
  committed `PAL.cream` on the tail), and whether Sly's tail light band should be cream or
  grey-taupe is an art call in `src/player/SlyModel.js` (flagged, not recommended either way).
- `src/textures/**` (my tree): no change indicated in any branch — the fur maps and vertex
  tints are verified neutral; there is nothing on my side that could move the tail's chroma.
