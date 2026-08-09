# PREREG-heroread — the hero reads as a background element (critic 9 D4), and his face is off-model (D11)

Registered **before** any frame of the candidate exists. Two independent claims share one seal
because they share one capture; they are scored separately and either may fail alone.

Everything below that is a *frame* number is registered blind. Everything that is an *albedo*
number is already known and is stated as such — it is the input to the design, not its result,
and no gate is written on it.

---

## 1. What is claimed

### D4 — the subject is too small, and in `hero` he is not even standing on anything

Measured on `shots/r9/*.png` at 1280x720 with a 10 px ruler overlay, crown row to lowest boot row
of the rendered figure, ink hull in, cane out. Read by eye, ±4 px; the six rows critic 9 also
measured agree with his to within 6 px, which is this instrument's calibration.

| frame | px | % of frame | critic 9 |
|---|---|---|---|
| `courtyard` | 41 | **5.7 %** | 40 px / 5.6 % |
| `night` | 90 | 12.5 % | 84 px / 11.7 % |
| `temple` | 89 | 12.4 % | 88 px / 12.2 % |
| `hero` | 113 | **15.7 %** | 128 px / 17.8 % |
| `interior` | 150 | 20.8 % | — |
| `dunes` | 157 | 21.8 % | 156 px / 21.7 % |
| `traversal` | 157 | 21.8 % | 158 px / 21.9 % |
| `combat` | 245 | 34.0 % | — |
| `sly-perch` | ~500 | ~69 % | — |
| `sly-closeup` | 519 | 72.1 % | — |

Reference, same ruler on `sly3-venice.jpg` (647 rows): cap-ear tips **y 333** to the extended
boot **y 532** = 199 px = **30.8 %** of frame; including the tail, which lies lowest at y 555,
**34.3 %**. Critic 9's 34.0 % is the tail-inclusive figure. So the reference band is **30–34 %**
and `combat` already sits in it.

A second finding, not in critic 9 and not previously recorded anywhere: **`hero` stages the
character 3.80 m above the surface under his own xz.** A downward ray at (2.2, 8.4) against
Architecture+Props finds `arch:court:paving_courtyard` at y 5.20; the gilded architrave at y 9.0
spans only x 2.75–4.25 there, and he stands at x 2.2. `shots/r9/hero.png` at 7x shows the boot
tip ending in air over a cornice that recedes behind it, with no contact and no contact shadow.

### D11 — the nose, and a refutation

Critic 9: *"there is no black nose"*, *"the mask has become a pair of round wire-rimmed
spectacles"*, and *"the reference mask is a broad pale bandit band across the eyes"*.

- **No black nose: CONFIRMED.** 146 head triangles form the muzzle-tip blob; their UV footprint
  is 5 098 texels and the artist's mean colour there is (89, 81, 74) — plain fur. The geometry
  exists and was never painted.
- **"The reference mask is pale": REFUTED, and acting on it would have inverted the character.**
  The pale band critic 9 measured in `sly3-venice.jpg` (L 85–145 against L 45–70 around it) is
  Sly's **head fur**, not his mask. `public/assets/sly-godot/sly-head.png` — a different artist's
  Sly, already in this repo — paints a **near-neutral pale head** (mean (117.9, 117.5, 120.2),
  HSV sat 0.043, R/B 0.981) carrying a **solid black** bandit mask, a small **black nose dot** and
  a thin dark mouth line. `src/player/SlyModel.js` reached the same conclusion from the same
  reference and authored "the black domino mask".
- **The mask cannot be darkened.** Its albedo in `sly_head.png` is already 0x000000. It renders
  at L 55–70 in `shots/r9/sly-closeup.png` because the frame's black point is lifted, which is
  critic 9's own D5 and another agent's lane. **The spectacles read is therefore not an albedo
  defect of the mask** — it is the head FUR being a warm brown (mean (135.2, 123.2, 111.3), HSV
  sat 0.182, R/B 1.215 over the 99 762 texels the mesh samples) where the reference is neutral,
  at a median luma within 3 L of it. A black mask on a pale neutral head is a graphic shape; the
  same mask on a warm mid-brown head has far less separation from its own sockets.

---

## 2. What ships, and what it must NOT change

**`tools/slyface.mjs`** derives `src/assets/sly-dl/sly_head_fix.png` from the supplied
`sly_head.png`: the nose blob painted `(17,16,20)`, the fur white-balanced with the tilt solved
off the Godot head at unchanged per-texel luma. Drawn black (mask, mouth, ear line) untouched.
Albedo result, already known: sat 0.182 → 0.031, R/B 1.215 → 0.981, median luma drift 0.0.
`?face=raw` restores the supplied texture.

**`src/core/Shots.js`** — **two canonical shots change their staged player. NO CAMERA MOVES.**
`pos`, `target`, `fov`, `tod` and `roll` are byte-identical on all twelve shots. Only `hero` and
`courtyard` change `player.pos` and `player.yaw`.

| | `hero` | `courtyard` |
|---|---|---|
| pos | `[2.2, 9.0, 8.4]` → `[4.0, 8.99, 13.2]` | `[-6.6, 5.12, 12.4]` → `[2.4, 0.02, 26.4]` |
| yaw | 5.72 → 5.889 | 5.08 → 5.341 |
| surface under him | paving 3.80 m below | terrace, on it |
| after | `hieroglyph_gilded` at 8.99, float 0.00 | `paving:court` at 0.02, float 0.00 |
| predicted px | 113 → **202** (15.7 → **28.1 %**) | 41 → **77** (5.7 → **10.7 %**) |
| view° / sun° | 70 / −64 → 73 / −73 | 77 / −21 → **36 / −36** |
| visible (66 rays) | 100 % → 100 % | 82 % → **100 %** |
| feet NDC | (−0.01, 0.14) → (−0.32, −0.09) | (−0.33, −0.09) → (0.17, −0.69) |

Predicted px is the r9 ruler read carried through the two-point projection at the new stand — no
figure height is assumed anywhere; it is *derived* per shot as `r9px / (1 m projected at the
shipped stand)`, giving 1.466 m for `perch_idle` and 1.671 m for `run`.

**This moves the baseline for every other agent's before/after on `hero` and `courtyard`.** It is
announced here, in the commit, in the report and in KNOWN_ISSUES. `hero`'s registered ROI in
`PREREG-shadowhold.md` is `(930, 500, 1275, 715)`; the new figure occupies roughly x 380–500,
y 190–395, so it does not enter that ROI — but the cast shadow moves and that is not checked.

---

## 3. Instrument

One runner, `tools/heroread.mjs`, two boots, 1280x720, quality `high`.

- **Boot A**: `?face=raw`. Renders `sly-closeup`.
- **Boot B**: default. Renders `sly-closeup`; then `hero` and `courtyard` twice each, with
  `SHOTS[name].player` poked in-page to the OLD values and then the NEW ones, capturing a
  `debugTerm(8)` frame and a beauty frame at each. The poke is read back and printed.

Character pixels are `debugTerm(8)`'s **B channel > 127** — `vSlySkin`, 1.0 on a SkinnedMesh and
0.0 otherwise, so it quantises to 255/0. The cane is a plain `THREE.Mesh` and is excluded, which
matches the ruler read. Guards are skinned, so the figure is the **largest 4-connected
component** of that mask and its pixel bbox is the measurement.

ROIs, frozen here, in `sly-closeup` pixels — that shot's camera and staging do not move, so they
are stable by construction:

| name | box |
|---|---|
| `NOSE` | (582, 165)–(622, 205) |
| `CHEEK` | (600, 188)–(660, 212) |
| `HEAD` | (588, 118)–(710, 216) |
| `BG` | (40, 40)–(240, 240) |

---

## 4. Gates

### Calibration — MUST FIRE. If either fails, the whole D11 half is VOID, not FAIL.

- **C1** mean |ΔRGB| over `HEAD`, boot A vs boot B: **≥ 4.0**.
  *A failure means `?face=raw` did not switch the texture and both arms are the same picture.*
- **C2** (null) mean |ΔRGB| over `BG`, boot A vs boot B: **≤ 1.5**.
  *A failure means the two boots differ off the character, so nothing measured on the character
  can be attributed to the texture. Cross-boot determinism is not assumed (§263.3); it is tested.*

### D11

- **F1** count of pixels with L < 60 inside `NOSE`: **B − A ≥ +100**.
- **F2** mean R/B over `CHEEK`: **B ≤ 0.90 × A**. Premise check: if **A < 1.40** the frame is not
  warm to begin with and F2 is **VOID**, not passed.
- **F3** mean L over `CHEEK`: **|B − A| ≤ 12**. The correction is a hue move; if the value moves
  this much the tilt is doing something it was not designed to do.

### D4

Per shot, A = old staging, B = new staging, both in boot B.

- **H1** MUST FIRE, per shot: **|height_B − height_A| ≥ 20 px** and **|centroid_x_B − centroid_x_A|
  ≥ 30 px**. *A failure means the in-page poke of `SHOTS` did not take and the run is VOID.*
- **H2** `hero` height_B **≥ 180 px** (25.0 % of 720). Predicted 202.
- **H3** `hero` bbox inside the frame: **top ≥ 8** and **bottom ≤ 712**.
- **H4** `hero` area_B **≥ 2.2 ×** area_A. Predicted ratio (202/113)² = 3.2.
- **H5** `courtyard` height_B **≥ 65 px** (9.0 %). Predicted 77.
- **H6** `courtyard` area_B **≥ 2.2 ×** area_A.

Reported, not gated: height_A for both shots against the r9 ruler reads of 113 and 41 px. The
tree has moved since r9, so a disagreement is information about the instruments, not a failure.

---

## 5. Falsifiers, stated as outcomes I will publish

- C1 fails → **VOID**. No D11 claim is made and the texture does not ship on this evidence.
- C2 fails → **VOID**, same.
- F1 fails → the nose did not arrive in the frame. The albedo change is real (it is measurable in
  the PNG) but it does not reach the picture, and I report that the fix is inert.
- F2 fails with A ≥ 1.40 → the white balance does not survive the lighting chain, i.e. the head's
  warmth in-frame is the grade's and not the albedo's. That is a refutation of my own mechanism
  and it will be reported as one.
- F3 fails → the tilt moved value as well as hue; the texture is withdrawn and re-derived.
- H1 fails → **VOID**.
- H2 fails → the staging move did not buy the size the projection predicted; I report the
  measured number against the predicted 202 and do not re-scope the threshold.
- H3 fails → the new stand clips him. Ships reverted.
- H4/H6 fail while H2/H5 pass → the height grew but the area did not, i.e. he is being occluded
  or clipped somewhere the bbox cannot see. Reported as such.

**No threshold in this file moves after a candidate frame exists (§141.1), and no frame is
re-scoped out of a gate after seeing which one failed.**

## 6. Explicitly out of scope

- The mask's shape, extent and value. Not touched, and §2's refutation is why.
- The tail. Critic 9's own §3 says its rings are in the asset and are lost to lighting.
- The hands. Verified at 6x on `sly-perch`: they ARE blue gloves with gold cuffs, rendering
  violet because of D2's costume-hue swing. The "starfish with claws" read is splayed fingers
  with per-finger ink, i.e. a hand POSE, not a glove asset. Reported, not fixed.
- `night` and `temple`, both under the reference band. `night`'s defect is D8's duotone, and
  `temple`'s camera pitches up so moving the subject toward it pushes his feet off the bottom
  edge — neither is fixable by the lever used here.
- The ink line. Making the figure larger **lowers** the ink-to-figure ratio, because ink width is
  specified in device pixels (§255). No ink claim is made in either direction.
