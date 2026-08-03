# PREREG-hgarris2 — sealed before either arm boots

TEXTURES. Re-seal of the arris that `PREREG-txab` P1 failed and reverted (KNOWN_ISSUES §90.2).
Sealing tree: `52d4a43` + this session's `src/textures/**` edits, uncommitted. Both arms are that
one tree; nothing in `src/` is edited between them.

## Why a re-seal is legitimate, and what is different this time

§90.2 recorded its own criticism of the failed seal: the ring covers ~20 % of the mask and a
**median over the whole mask cannot see a 20 %-coverage feature**, so the primary was the wrong
statistic. That observation was post-hoc and its author ruled it licenses *re-sealing, not
keeping*. This is that re-seal. **Two things changed, and the second matters more than the first.**

### 1. The framings were wrong, and there was no instrument in the repo to notice

`progress/records/ringpx.mjs` (new, tracked) measures **surface mm/px per material per framing** —
the divisor every "is this feature sub-pixel" question in this file needs, quoted per shot for two
sections with nothing behind it. It reproduces §90.2's own figure for `interior` (20.6 recorded,
**20.3** measured).

The failed seal chose `traversal` and `interior`. Measured across all fourteen framings, those are
**the two where this feature is smallest**:

| recipe | framing | share of frame | mm/px p50 |
|---|---|---|---|
| `hieroglyph_wall` | `traversal` | **33.1 %** | 34.3 |
| `hieroglyph_wall` | `interior` | 14.3 % | 20.3 |
| `hieroglyph_gilded` | **`hero`** | **29.0 %** | 13.5 |
| `column_papyrus` | **`temple`** | **54.1 %** | 19.9 |
| `hieroglyph_gilded` | `guard` | 21.0 % | 2.9 |
| `relief_figures` | *nowhere* | **0 px in all 14** | — |

`column_papyrus` was written off as "absent from both captured shots" — true, and a fact about the
shots: it is **54.1 % of `temple`**, the largest single-material share of any framing in the set.
`relief_figures` carries an arris and renders **zero pixels in every framing**, which agrees with
this file's own PREWARM note that it has no consumer; it is unscoreable by construction and is
excluded from every prediction below rather than quietly counted.

### 2. The lip was ~2 texels wide, not 6, and it was painted on the bevel

Profiling luma against **texels outside the cut** (arm-independent: taken from `s.h`, which the
arris never writes — asserted in the instrument, not assumed) showed where the ring actually landed.
`hieroglyph_wall`, 10.16 mm/texel, control → old arris:

```
d texels     1       2       3       4       5       6       8      10     field 0.4926
off       0.4533  0.4791  0.4779  0.4771  0.4790  0.4819  0.4864  0.4913
old on    0.4772  0.5145  0.5074  0.4973  0.4902  0.4867  0.4870  0.4917
```

It cleared the field only at d = 2..4. **Above-field support was 20–41 mm — 1.0–1.5 px at
`interior` and 0.6–0.9 px at `traversal`** — so the first seal was asking a frame to show a feature
that is sub-pixel at the framing holding a third of it. The recorded "61 mm" is the support of the
ring *term*; most of that support sits **below** the field because `sat((cb − cut) * 3.0)` puts its
weight on the first two texels outside the cut, which is the **bevel wall the same loop is sinking**.

Fixed in `carve()` by two changes taken from that profile: gate the ring on `(1 − r)` — the same
ramp that sinks the bevel, so the two cannot fight — and take it from a blur of twice the bevel
radius. New profile:

```
new on    0.4679  0.5074  0.5105  0.5084  0.5055  0.5031  0.4982  0.4960
new − fld -0.0280 +0.0115 +0.0146 +0.0125 +0.0096 +0.0072 +0.0023 +0.0001
```

**Above-field support 20 → 102 mm (~8 texels): 4.0 px at `interior`, 2.4 px at `traversal`.**

Texture-side, `hgarris` arm vs shipped, at each framing's own mm/px:

| `hieroglyph_wall` | old ring | **new ring** |
|---|---|---|
| fineMed @ 20.3 (`interior`) | +8.4 % | **+16.2 %** |
| fineMed @ 34.3 (`traversal`) | **−3.4 %** | **+8.6 %** |
| fineP90 @ 20.3 | +22.4 % | +15.0 % |
| fineP90 @ 34.3 | +17.3 % | +15.9 % |
| squint sd 1/8 (busy guard) | −0.4 % | **+1.8 %** |
| mean albedo | +1.5 % | +2.2 % |
| `ring − field` | −0.0177 → +0.0032 | −0.0177 → **+0.0047** |

The sign flip at the coarse framing is the point: the old lip *lost* fine energy at `traversal`,
which is why the failed seal read +0.3 % there.

`column_papyrus` @ 19.9: fineP90 +8.2 %, fineMed +1.0 %. `hieroglyph_gilded` @ 13.5: fineP90
**+0.5 %** — an albedo null, see P5.

Catalogue invariants re-checked on the candidate tree (`texlab --all`, 44 recipes): **0 joint-sign
violations, `darkTail` 0.0000 on every stone and carved recipe.**

## Arms

| run | `VITE_TEX_AB` | out | what it is |
|---|---|---|---|
| control | `hgarris` | `shots/arris2-off/` | **the current shipped tree** — layout on, lip off. §90's revert state, which has never been captured. |
| shipped | *(unset)* | `shots/arris2-on/` | the candidate: same tree, new gated ring |

`hgarris` disables the albedo lip **and nothing else** — the layout jitter (`hglayout`), the granite
frosting (`granite`) and the paving crack (`pavecrack`) are all live in both arms. §90.6's
correction does not apply: `hgarris` changes no `rand()` consumption, so unlike `hgrelief` this is a
surgical one-knob isolation.

A run whose `report.json` lacks `textures: A/B CONTROL BUILD` **is not the control**, whatever the
directory is called.

Shots: `traversal`, `interior`, `temple`, `hero`. 1280×720, quality high.

## Predictions and falsifiers

`matflat.mjs`, architecture mask eroded 3 px, per material. **Control → shipped**, same commit.

- **P1 — PRIMARY. `hieroglyph_wall` fineP90 on `traversal` and `interior`.**
  Bar: **≥ +2.5 % on both**, *and* ≥ 3 × the largest |Δ| among P6's nulls.
  The bar is derived, not chosen: texture-side is +15.9 % / +15.0 %, and this family's two measured
  texture→frame transfers are **0.28** (§90.2) and **0.23** (§90.4), so the expectation is
  **+3.5 % to +4.5 %**. §90.2's failure was a bar set *above* its own expectation from a borrowed
  coefficient; +2.5 % sits below the expectation band and above the ±1.0 % floor §90.1 measured.
  **Registered upper bound: > +9 % is not a better result, it is a reason to suspect the frame
  moved for another reason** (§68.4) — check P3 before claiming it.
  *Falsifier: under the bar with P6 holding ⇒ report as a null and set all four `arris` values to 0
  permanently. Do not defend it with the texture number.*

- **P2 — BUSY GUARD, overrides P1.** Squint sd at 1/8 inside the `hieroglyph_wall` mask must not
  rise more than **+5 %** on either shot. Texture-side is +1.8 %; the historic ashlar blotching
  state moves it +49 %. *Fail ⇒ revert regardless of P1.* This recipe's history is fixing one §7.3
  condition by breaking the other, and this clause is why the change is measured on both.

- **P3 — BRIGHTNESS CONFOUND, and it can only make the primary unquotable.** `hieroglyph_wall`
  in-frame `lumaMed` must not move more than **±0.010**. §74.5 measured **r = −0.88** between
  Δcov1 and Δmedian-luma across 17 untouched (material, framing) pairs, at −0.72 points per 0.01
  luma — so a brightness shift *alone* manufactures a coverage delta. Texture-side mean albedo is
  **+2.2 %**, so this is a live risk, not a formality. *Fail ⇒ P1 is **unquotable, not passed**.*

- **P4 — `column_papyrus` fineP90 on `temple`.** Bar **≥ +2.0 %** (texture-side +8.2 %, transfer
  0.25 → +2.1 %). Registered as the weakest read of the three: 54.1 % of frame, but its lip is
  narrower (`bevelPx` 2.4, rb = 2) and its above-field support is thin. **A null here does not kill
  P1** — it is scored and reported on its own, and if it is null this recipe's `arris` goes to 0
  while the wall's is decided on the wall's evidence.

- **P5 — `hieroglyph_gilded` on `hero`: a prediction of NO EFFECT, on both of its routes.**
  |ΔfineP90| expected **< +2.0 %** (texture-side +0.5 % at 13.5 mm/px). Registered in advance
  because a null is the *expected* result and must not be read later as a failure of P1.

  **AMENDED 10:34 UTC, before either arm booted** (this file's mtime is the receipt; the capture's
  `report.json` timestamp is later) (§81.3's discipline: amend and timestamp, never
  adjust afterwards). The gilded recipe's second route is `arrisPolish 0.08`, a roughness notch
  feeding a `spec 0.55 / gloss 64 / metal true` material — §7.3's "hard spec" — and the albedo lab
  was structurally blind to it. It is now measured rather than left as a caveat: lip roughness
  (d 1–4 outside the cut) **0.6565 → 0.6345**, field bit-stable at 0.6493. Through
  `specAmt ∝ (1 − 0.75·rgh)` that is **+3.1 % on the specular amount**, against a recipe this
  file has already measured at **0.38 % of its gild mask over the bloom onset** at `spec 0.55`.
  **So the roughness route is predicted null in the image too**, and P5 now predicts *both*.
  *If both land null, gilded's `arris` goes to 0 and stays there* — the value would then be
  decoration, and the record should say so rather than carry it.

- **P6 — NULLS, and they are the error bar.** `sandstone_block`, `sandstone_worn`,
  `paving_courtyard`, `granite_pink`, `limestone_polished`, `mudbrick`, `ceiling_stars` are
  untouched by `hgarris` and therefore **bit-identical between the arms by construction**. Whatever
  fineP90 spread they show is boot-to-boot render noise and is the floor every delta above must
  clear. §90.1 measured that floor for fineMed (±1.0 %); **fineP90's floor has never been measured
  and this run measures it.** A large null spread does not invalidate the run — it raises the bar.

- **P7 — THE IMAGE, and it is not subordinate to any number above.** At 4× and 8×: the glyphs on
  `interior` and `traversal` must read as **cut** — a lighter lip around a darker recess — and must
  not read as a glow or a halo (the failure `cw` at 244 mm was rejected for). At squint the masses
  must stay clean and each wall must still read as one shape. Both, or the change fails.
  *A number on target with a wrong frame is this project's most repeated failure* (§67.2 killed the
  highest-scoring candidate for reading as wood grain; §3's "after" column is on the record as
  lavender).

## Not claimed

- Nothing here addresses recess **occlusion**: §8 establishes `ao` never multiplies the key term and
  SHADING has ruled `aoKey = 0` final (§85), so the authored gradient cannot reach a lit wall
  whatever this file does. The arris is the albedo substitute for it.
- Nothing here addresses §68.1/§70.2's tone-curve crush, which §85.2 has since proved **no curve**
  fixes — only a brightness trade. That is a look call and is not TEXTURES'.
- Nothing here is a claim about the pass-6 score. Both arms are one commit; the run answers "what
  does this one knob do", and no other question.
- `relief_figures` is excluded from every prediction: 0 px in all fourteen framings.

## Provenance

Written and timestamped **before either arm boots**. `report.json` in both runs carries a later
timestamp than this file's mtime, and the control run carries the `A/B CONTROL BUILD` warning while
the shipped run does not. `tools/keeplog.sh` is run on each arm **when it lands and before it is
scored** (§88, §90.9 — the run that most needed a log was the one that lost it).
