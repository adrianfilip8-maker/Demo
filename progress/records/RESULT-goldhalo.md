# RESULT — goldhalo: metal-aware bloom feed A/B, scored against the committed prereg

Scored verbatim against `progress/records/PREREG-goldhalo.md` with the frozen
`goldhalo-read.mjs`. Frames: `shots/goldhalo/` (hero+temple × a0/a4/a12/a24/a0b, one boot).
Provenance from the run's own `report.json`: tree `4ef5f44` **clean**, SwiftShader/ANGLE,
live uniform readback matches the commanded gain at every arm (`tune`/`uniform` agree,
threshold [2.2, 0.3] constant). No capture was launched for this read (src-freeze sequencing
respected); frames were on disk.

## Reconstruction deltas, declared

1. **Reader crash-fix, one token.** The frozen reader indexes `meta.materials`; the masks
   rebuilt on the capture tree (13:07) store the list under `mats`. Run copy
   `goldhalo-read.run.mjs` differs from the frozen file by exactly that one line
   (`meta.materials.indexOf` → `meta.mats.indexOf`); no threshold, population, or verdict
   logic touched. The frozen original is untouched on disk for audit.
2. **F3 superset** (already declared in the reader's own header): registered F3 named the
   kiosk lintel cluster; the spec1 cluster mask died with the 11:33 restart, so F3 is scored
   on the full gilded halo annulus. Shown immaterial below: a localized re-read on the halo
   of bright gilded body px (a0 L≥180, the kiosk glint row — diagnosis instrument, not the
   sealed score) is *exactly* as flat as the superset.

## Sealed verdicts, as the frozen reader printed them

| | hero | temple |
|---|---|---|
| **F1** a0 vs a0b bit-identical | **FAIL** — 120,709 px differ (max ch delta 148) → RUN INVALID per prereg letter | **FAIL** — 253,717 px differ (max 150) → RUN INVALID per prereg letter |
| **F2** non-metal control mean\|dL\| < 0.5 | **PASS** (0.099 / 0.124 / 0.139) | **FAIL** (0.298 / 0.682 / **1.170**) |
| **F3** annulus monotone + a24 p95 ≥ +6 L | **FAIL** — monotone NO; p95 lift **+0.2 L** (mean 70.61/70.65/70.63/70.64) | n/a (registered on hero) |
| **TGT** first arm with annulus px ≥ L235 | **none** — no arm reaches L235 in the halo | — |
| **DG** architrave px newly ≥ L200 at a24 | — | **PASS** (9, bar < 50) |

The sealed verdicts stand as printed. Everything below is diagnosis, not a re-score.

## Diagnosis 1 — every FAIL that tracks *arm order* is time, not gain

Arms were captured sequentially in one boot, so **arm order = gain order = time order**; the
run's own a0/a0b bracket is the discriminator (both gain 0, maximum time separation).

- **F1 is RESULT-combatrim's temporal-FX class, not a state leak.** The diff between the two
  *gain-0* arms cannot be gain by construction (readback 0/0). Its shape is animated-overlay
  FX: hero 120,709 px (13.1% of frame) spread across paving/walls/gilded/(none) at mean|dL|
  2.57 with hot cores (max 148); temple 253,717 px (27.5%) dominated by columns/walls under
  the light-shaft volume, hot core = the torch flame at (302,503) — crops
  `gh-temple-a0-fx2x.png` vs `gh-temple-a0b-fx2x.png` show the flame/glow phase change,
  `gh-hero-a0-fx2x.png`/`a0b` the low-amplitude drift. Only 22.8% (hero) / 4.2% (temple) of
  diff px are within 12 px of gilded — a gain-state leak would concentrate there.
- **Temple F2's fail is pure time.** The control (brightest 1000 non-metal px, chosen on a0
  with no temporal exclusion) inevitably lands on shaft/torch FX in temple. Raw mean|dL| vs
  a0: a4 0.298, a12 0.682, a24 1.170, **a0b 1.246** — the gain-0 twin moves *more* than gain
  24. Temporal-masked (exclude px where a0≠a0b): a4 0.040, a12 0.037, a24 0.036 — flat with
  gain, 14× under the bar. Hero same shape (raw a0b 0.159 > a24 0.139; masked 0.005–0.008,
  non-monotone in gain — undercoverage of a 2-phase mask, not a term).
- **The frame-hot trend is the torch.** Temple px ≥ L235: a0 2 → a24 9 → **a0b 9, max 250.3
  (the highest)** — all at the flame core (302,503), an alpha-1 FX path the gain cannot touch
  by the fail-closed encoding.
- **Prereg design note** (same family as §26's findings): F1's bit-identical bar is
  unattainable on any shot with animated FX — it would have failed at gain-arm count zero.
  RESULT-combatrim's own recommendation is what the bracket is for: use a0/a0b as a
  **temporal mask**, not as a bit-identity gate. Whether the run stands is the coordinator's
  call; every statistic this A/B needs survives under the mask, and is reported so below.

## Diagnosis 2 — the substantive result: the gain is inert in-frame at every arm

With the temporal mask applied, the gain arms are **bit-stable on every population measured**:

```
hero   annulus(all)        n=49974  mean 69.71/69.75/69.78/69.74  p95 170.2 =  max 190.8 =  (a0/a4/a12/a24)
hero   annulus(bright-loc) n=1997   mean 117.98 = = =             p95 174.4 =  max 176.2 =
hero   body(bright L>=180) n=304    mean 192.56 = = =             p95 207.5 =  max 226.4 =
hero   body(all gilded)    n=246605 mean 51.01/51.01/51.03/51.03  p95  98.8 =  max 226.4 =
temple annulus(all)        n=10947  mean 101.19 = = =             p95 177.2 =
whole-frame hero max L     226.4 at (606,105), identical at a0/a4/a12/a24;  px>=235: 0 at every arm
```

Gain 24 — a ×25 feed multiplier on full-metal pixels — changed **nothing** outside the
temporal-FX population. The visual check agrees: `gh-hero-a0-gild3x.png` vs
`gh-hero-a24-gild3x.png` (kiosk lintel glint row at 3×) are indistinguishable. The reader's
apparent hero annulus max rise (190.8 → 204.8, monotone with arm) is temporal px inside the
annulus; masked, max is flat at 190.8.

**Why, and the arithmetic closes.** Live onset: threshold 2.20, knee 0.30 → feed begins at
scene 1.90 (6f1d1f4's bloom1 raise). §25's routing sentence — "the responsive cluster feeds
~2.2–3.6 scene against the 1.90 onset" — quotes the **ndh=1 bound**, not a frame measurement;
§25's own frame measurement says nothing in hero exceeds display L 226.4, which by §25's own
log-fit (L ≈ 203.9 + 21.7·log2(0.05+u)) is scene ≈ **2.0**. At u = 2.0 the soft-knee weight is
w = (0.1²/1.2)/2.0 ≈ **0.004**; ×25 at gain 24 gives 0.10, then ×bloomIntensity 0.5 and the
mip blur — sub-quantization on a ~300 px population. The observed zero is what the shipped
constants predict. To clear F3's +6 L bar this term would need gain ≈ 60–70, at which point it
is amplifying a 0.1-scene-unit sliver of margin on ~300 px — noise amplification, not a lever.

**Per the prereg's own F3 instruction: the bloom feed *as built* (a gain on `w`) is not "the
lever with headroom", and §25's routing conclusion does not hold at the shipped onset.** Said
plainly rather than re-tuned. The no-op contract is meanwhile re-confirmed end to end: at
gain 0 the patch changes nothing, and even at gain 24 no stable RGB moved (strongest possible
in-frame evidence that scene alpha has no other consumer).

## TGT / ship

**No ship candidate** (registered shape: no arm puts any annulus px ≥ L235; hero has zero
px ≥ L235 frame-wide at every arm, so §25's "235 is reachable in the halo" precondition never
had material to work with in this framing). **`bloomMetalGain` stays 0.**

If the gold-hot line is still wanted, the redesign with actual headroom is a **metal-aware
onset**, not a metal gain: per-pixel threshold `mix(T, Tmetal, metal)` with Tmetal ≈ 1.2–1.5.
Hero's bright gilded cohort (u ≈ 0.9–2.0) then feeds at w up to ~0.3 while temple's architrave
body (display p95 168.7 ↔ u ≈ 0.5) stays below any Tmetal ≥ 0.7 — the DG guard holds by the
same arithmetic that closed this run. Needs its own prereg and a green-lit capture; not
implemented, nothing edited. The alternative is to accept §25's residual: the glint row at
display 226 is already a correct hard-spec gold read, and the missing 9 L to "hot" may not be
worth a second mechanism — art call, not mine.

## ROUTING — the cane crook and the feed population (coordinator's ask)

**The crook IS SLY_METAL_TAGged in canonical boots — there is no one-line tag fix to route.**
Chain, verified in source: cane uses `_matSpec('gold')` (per RESULT-hookmerge), whose spec
carries `metal: true` (SlyModel.js:2837), passed as `metal: 1` through the `shading.toon()`
path (SlyModel.js:3003, the comment there records the historical drop as fixed); toon opaque
materials all get `SLY_METAL_TAG` (ToonMaterial.js:849). Two caveats worth one line each:

- SlyModel's **fallback** gold path (`_fallbackMaterial`, SlyModel.js:3052) is a
  `MeshStandardMaterial` — untagged, alpha 1, decodes metal 0. Fail-closed and irrelevant
  while SHADING is registered (it is in every canonical boot), but if a capture ever boots
  without SHADING, gold silently leaves the feed population.
- **Bloom is not the crook's lever regardless of tagging.** Hookmerge measures the crook at
  median L54 (closeup) / L38-backdrop (hero) — scene radiance far below any onset; no bloom
  term can brighten a dark surface. The gunmetal read is the value chain (`diff *= mix(1.0,
  0.20, slyMetal)` strips 80% of albedo at metal 1, spec is sh-gated and
  orientation-dependent, cool grade on top) — the lever is CHARACTER's `_matSpec('gold')`
  values with SHADING coordination, exactly as hookmerge already routed it.

## Files

- Verdicts: this file. Run copy `goldhalo-read.run.mjs` (one-line delta from frozen
  `goldhalo-read.mjs`, diff in §"Reconstruction deltas").
- Diagnosis instrument: `goldhalo-diag.mjs` (temporal mask from the a0/a0b bracket; D1–D5 in
  its header, §11 scope: display-space PNGs only, no scene-radiance access — the scene-u
  figures above come from §25's committed log-fit, not from measurement here).
- Crops looked at, kept: `gh-hero-a0-gild3x.png` / `gh-hero-a24-gild3x.png` (kiosk, no halo
  change), `gh-hero-a0-fx2x.png` / `gh-hero-a0b-fx2x.png`, `gh-temple-a0-fx2x.png` /
  `gh-temple-a0b-fx2x.png` (the temporal class, incl. the torch core that owns temple's
  frame-hot trend).
- Nothing committed, no src file touched, no capture launched.
