# PREREG — §38.4 shadow hue / task #16 chain half: which term owns the G-suppression

**Sealed before any capture.** SHADING (`ToonMaterial.js`, `toon.glsl.js`) + POSTFX (`PostFX.js`).
Instrument: `scratchpad/t16f.mjs`, the chain transcription, extended this session. Nothing tuned,
nothing committed.

---

## 0. Headline, stated first because it changes the task

**No chain term owns the G-suppression. The albedo *multiply* owns it** — 88.4% of shadow-side
radiance is multiplied by a warm albedo and therefore arrives carrying the **albedo's** channel
order, not the light's. Every cool constant I own is correctly `G ≥ R` and it does not matter.

And, registered before any pixel: **the acceptance line on the ledger (hue ≤ 226° at comparable
saturation) is not reachable with any lever in my files.** Both halves of it cannot hold at once.
Detail and arithmetic below; a re-set target is proposed in §6.

---

## 1. Instrument validation, before any attribution row is believed

- **uShadowColor replication vs `washcap`'s LIVE GPU readback** at `hero` (tod 0.79):
  model `(0.1416, 0.1892, 0.4232)`, live `(0.1416, 0.1892, 0.4232)`, **max abs err 4.7e-5**. PASS.
- **Composite vs TEXTURES' measured frame medians** (`eye1/sly-closeup`, shadow split L < 90):
  model reproduces the *signature* — B-max with R > G — on all three materials, and the hue within
  8–24°: worn 266 (frame 274), block 259 (282), paving 237 (261).

Scope stamp (§11) — transforms between this model and the renderer, **not** implemented: haze
(≤1.3% at 25 m), screen AO (occ = 0), bloom, vignette, FXAA, grain, normal-map perturbation of
`ndl` (irrelevant at key = 0), torch lights, screen-space rim and ink (`edge.g = 0` mid-wall),
per-texel albedo distribution (mean tile albedo stands in).

---

## 2. The decomposition — sandstone_worn wall, tod 0.80, `shadowMix` 1

| term | linear RGB | luma share | G/R | B/max(R,G) | multiplied by albedo? |
|---|---|---|---|---|---|
| fill | (0.0268, 0.0211, 0.0183) | 31.1% | 0.787 | 0.685 | **yes** |
| shadow multiply | (0.0468, 0.0378, 0.0519) | 57.3% | 0.808 | 1.109 | **yes** |
| wash | (0.0060, 0.0080, 0.0178) | 11.6% | **1.336** | 2.238 | **no** |
| SUM | (0.0795, 0.0668, 0.0881) | 100% | 0.840 | 1.107 | |

- `shadowLight` = `(0.142, 0.189, 0.423)`, **G/R 1.336** — cool, `G ≥ R`, exactly as §2.2 intends.
- sandstone albedo = `(0.418, 0.202, 0.074)`, **G/R 0.483**; after `shadowSat −0.35` → **0.605**.

The wash is the **only** shadow-side term that is additive, and it is the only one that arrives at
the light's own G/R. The other 88.4% arrives at the *product*. That is the whole mechanism.

---

## 3. The controlling inequality, and the claim it makes about night

`G ≥ R` on the surface ⟺ **(albShadow G/R) × (light G/R) ≥ 1**.

| regime | albShadow G/R | light G/R | product | verdict |
|---|---|---|---|---|
| day 0.80 (`hero`, `sly-closeup`) | 0.605 | 1.336 | **0.808** | fails by 19% |
| `interior` 0.50 | 0.605 | 1.383 | 0.837 | fails |
| `night` 0.02 | 0.605 | **1.658** | **1.003** | **passes by 0.3%** |

Computed, not captured. It makes an independent falsifiable claim: **the violet is a daylight-only
signature, and `night` has been on the correct side of the line all along** — same two constants,
opposite verdicts, because at night the hemisphere bounce being mixed into the tint is moonlit and
cool instead of warm sand. TEXTURES measured day frames only. Model `night` = hue 231, `G ≥ R`.

**This is the first thing to re-measure**, per the coordinator: night is what the cool terms pay
for, and if night comes back violet the mechanism above is wrong and the rest of this seal falls.

---

## 4. What is ruled out as a lever, with numbers

Single-stage toggles on the shipped state (display hue, sandstone_worn, base = 266):

```
wash -> 0         277      fill -> 0    244      mult -> 0      242
split off         278      sat 1.0      265      AgX bypass     274
split+sat off     277
```

Every downstream grade stage moves hue by ≤ 12° **and mostly the wrong way**. They are downstream
of the product and cannot change a sign the multiply created. Specifically ruled out: the
split-tone cool leg, `aoTint`, `saturation`, AgX.

**A correction to how §8 will otherwise be read.** §8 says "tuning `shadowWash`, `shadowSat`,
`shadowBounceMix` or `shadowFloor` against a daylight frame is tuning behind a clamp". That is true
of shadow **magnitude** and false of shadow **hue**. `shadowTintPeak` clamps the scalar `k` (pinned
at 3.914 in every daylight shot); `shadowBounceMix` changes the light's *direction* and moves G/R
**1.336 → 2.147** with `k` pinned throughout. The hue levers are live. `shadowFloor` remains dead.

---

## 5. The two levers that do reach it, and the exchange rate

Only two knobs enter the product, both `ToonMaterial.TUNE`:

- **`shadowSat`** raises factor 1 by desaturating a warm albedo toward luma:
  `−0.35 → 0.605`, `−0.45 → 0.648`, `−0.55 → 0.696`, `−0.65 → 0.749`, `−1.00 → 1.000` (grey).
- **`shadowBounceMix`** raises factor 2 by putting less warm sand bounce in the tint:
  `0.20 → 1.336`, `0.15 → 1.478`, `0.10 → 1.652`, `0.05 → 1.869`, `0.00 → 2.147`.

2-D sweep, frame-predicted hue (model + per-material offset) / shadow saturation:

```
                      worn        block       courtyard   shadow sat vs base
sSat -0.35 mix 0.20   274/0.21    282/0.26    261/0.21      (shipped)
sSat -0.35 mix 0.05   242/0.27    256/0.33    244/0.37        +32%
sSat -0.55 mix 0.10   237/0.33    252/0.39    245/0.41        +62%
sSat -0.65 mix 0.05   231/0.42    246/0.47    241/0.49       +104%
sSat -1.00 mix 0.05   225/0.55      —           —            +166%   <- grey albedo
```

**No cell reaches frame-hue ≤ 226 on all three materials.** The only cell that reaches it on *one*
material requires `shadowSat −1.00` — a **grey albedo in shadow**, which deletes §2.2's "shadows
are transparent, you can read detail inside them" and stone identity in shade. That is the bound,
not a candidate.

**The additive alternative, bounded.** `shadowWash` is the only term not multiplied by albedo, so
its hue arrives undiluted, and it is the one lever that buys hue *without* chroma:

```
wash   0.00   0.05(shipped)   0.15    0.30    0.60    1.00
hue     285        274         263     255     244     240
sat    0.194      0.206       0.209   0.208   0.211   0.216
L      0.308      0.331       0.369   0.414   0.485   0.550
```

Saturation is flat — but shadow **level** rises 0.331 → 0.550, i.e. it buys hue by turning shadows
into mid-grey. And **240° is its asymptote**: the wash can at best deliver the light's own hue, so
even an unbounded wash cannot reach 226.

---

## 6. Therefore: re-set the acceptance rather than chase it

**Proposed target, derived rather than asserted: hue ≤ 240° with `G ≥ R`.** That is the line at
which a shaded surface stops being magenta-violet and becomes genuinely blue; it is the line the
arithmetic has a lever for; and `night` already sits there, which is the existence proof.

226° came from the chain's cool *constants* (`aoTint` and the split cool leg both sit at 225.5°).
Scoring a **surface** against a **light** spec is the category error §8 already records once — a
pixel is light × albedo, and sandstone's own G/R puts a floor under it that no light hue clears.

---

## 7. PRE-REGISTERED PREDICTIONS

**Candidate A/B: `shadowSat −0.35 → −0.55`, `shadowBounceMix 0.20 → 0.10`.** Chosen as the cell
that crosses the product line on all three materials at the smallest chroma cost (product 1.149).
Arms: `base` · `candidate` · `sSat-only` · `mix-only` · `back` (must equal `base` bit-identically).
Single boot, frozen clock (§28), `renderFrame(0)` ×3 (§19). **Each arm reads back the live
uniform values the shader received** and prints them beside its score; equal applied state between
two arms is reported COLLAPSED and scores nothing (§40).

**Order: `night` first.**

### WOULD move
- shadowed `sandstone_worn` frame hue **274 → 237**; `sandstone_block` **282 → 252**;
  `paving_courtyard` **261 → 245**.
- channel order on shadowed stone **R > G → G ≥ R**. *This is the claim.* It is a sign flip, not a
  magnitude, which is what makes it a clean pass/fail.
- `interior` shadowed wall **287 → 232** — out-of-band to in-band. Interior is the worst shot and
  must move the most; if it does not, the mechanism is wrong.
- shadow chroma **+62%**. **Declared in advance as a COST, not a win.**

### WOULD NOT move
- **The lit side, at all.** Neither knob appears in the key term (`alb * keyRad * key`), so the lit
  wall stays `rgb 236,173,121` hue 27.1 sat 0.487 **by construction**. Any frame A/B that moves the
  lit side has a second cause and the run is void.
- **The whole-frame two-window hue statistic, by much.** Three shots are 83–98% stone and stone has
  one authored hue; this changes stone's *shadow* hue from one bin to an adjacent bin — it does not
  add hue variety, which is a different owner's fix. Expect the *shaded-column* 1.000 to fall
  (authored hue now survives to a shaded surface) while the whole-frame 0.867 moves a few points.
  **Stated before the capture, per §38.4's own practice**, so a small number is a confirmed
  prediction and not something to explain away.
- **`night`'s verdict.** It passes now and must keep passing: hue 231 → 226, sat 0.661 → 0.769.

### Falsifiers — any one voids the fix
- lit-side hue moves > 3°.
- `night` hue leaves [205°, 240°], or `night` loses > 25% of its saturation.
- `interior` goes green/olive (hue < 200°).
- shadowed stone chroma more than **doubles** anywhere — §3's tripwire, and the failure mode it
  records verbatim ("overwhelmingly lavender-grey… two-tone orange/indigo with no middle").
- any shot's shadowed architecture fails to move **at least 15° cooler**. That would mean the
  mechanism is wrong, not that the knob is small.
- **Look at every frame.** §3 has twice produced numbers on target while the image was plainly
  wrong; a hue that passes on a frame that reads worse is a failure of this test.

---

## 8. Calibration caveat, stated so it cannot be quoted away

Frame-predicted hue = model hue + a per-material offset measured on the shipped state
(**+8** worn, **+23** block, **+24** courtyard). Those offsets are the model's residual, they are
**not equal across materials**, and nothing guarantees they are additive-invariant under the fix.

**Robust: the mechanism, the inequality, the ordering, and the night/day split.**
**Not robust: any absolute frame hue, which carries ±24°.**

The model reproduces `uShadowColor` to 4.7e-5 and the qualitative signature exactly; it is not
calibrated to predict an absolute frame hue better than that, and no band in §7 should be read as
if it were.
