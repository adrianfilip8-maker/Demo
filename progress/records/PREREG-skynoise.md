# PREREG-skynoise — the marbled sky is the deck-noise stack cut at mid-histogram; candidate = deck scale+soft retune

**Owner:** SKY (`src/render/Sky.js`, `src/render/Atmosphere.js`). **Date sealed:** 2026-08-05.
**Status:** REGISTERED, capture NOT run (lock busy; this task is offline by instruction).
No `src/**` was touched. All evidence below is from committed frames and committed source,
produced by `progress/records/skynoise-diag.mjs` (the instrument this seal scores with).

**The finding under repair** (CRITIC-sbs1 gap #1): marbled luma noise at hf 5.3–7.8/px-step in
every sky where reference skies measure 0.36–1.33 — up to 21× — in ~15–25 px cells, uniform
across the visible band, no cloud shapes, no scale gradient. It poisons `courtyard`
(rect 620,10,1200,110, hf 7.76), `dunes` (100,10,280,120, hf 5.28 — sitting on the pyramid
silhouette), `night` (hf 7.51, "reads as water"), and grazes every other exterior frame.

---

## 1. Baselines on committed frames, and the metric convention recovered

CRITIC's frames (2026-08-01, `shots/`) are lost to rollback and its measure script stayed in
the lost scratchpad. The instrument reproduces the metric on the committed frames and recovers
the convention: **hf = mean|ΔL(x)| + mean|ΔL(y)|** (sum of directional mean absolute luma
gradients, Rec.709 luma 0–255, stated rects, dark-mask per header). Correspondence:

| rect (mask) | committed frame | this instrument | CRITIC (their lost frame) |
|---|---|---|---|
| courtyard (620,10,1200,110) m<60 | `cand1/frames/courtyard.base.png` | **7.91** (sd 17.2) | 7.76 (sd 16.1) |
| dunes (100,10,280,120) m<60 | `cand1/frames/dunes.base.png` | **5.28** | 5.28 |
| night (900,8,1270,112) m<22 | `cand1/frames/night.base.png` | **7.39** | 7.51 (rect unstated) |
| traversal (80,5,700,55) m<60 | `gold1/traversal.png` (newest tree) | **4.72** | — |

Three independent reproductions to 0.2–2%. The committed `cand1` base frames are statistically
the same sky as CRITIC judged; the defect persists on the newest committed frame (`gold1`).
Cell size measured (per-row/col-detrended Pearson ACF): courtyard vertical first-zero at
12–13 px (cell radius) with horizontal streaks 3–6× longer — CRITIC's "15–25 px cells",
measured as anisotropic cells ~25 px tall by ~80–150 px wide.

## 2. Diagnosis — the defect named at its lines

The noise is **the cloud-deck stack in `src/render/Sky.js`**, four compounding decisions:

1. **Three decks at ONE angular frequency.** `TUNE.decks` (Sky.js:117-121): scale·h =
   0.00030·2600 = **0.780**, 0.00052·1450 = **0.754**, 0.00088·760 = **0.669** — within 17%.
   The plane projection (`t = H/d.y; uv = d.xz·t·scale`, Sky.js:285-287) makes screen
   frequency ∝ scale·h/sin²(elev), so all three decks deposit at the same screen period:
   no parallax separation, no scale gradient, 3× the energy in one band.
2. **The texture contains nothing larger than 1/6 repeat.** `buildCloudTexture`
   (Sky.js:159-195) samples every channel at base frequency **6 cycles/repeat**
   (Sky.js:166, `fx = u * 6`). The largest feature ANY deck parameter can show is that
   fundamental. Through the real shot cameras (instrument `project` mode): at courtyard's
   rect elevations (24–30°) its vertical period is 33–57 px → **half-period cells 17–28 px**;
   the Worley alpha channel (8.1 cells/repeat, sampled at 1.7×, Sky.js:183/270) adds
   **13–25 px cells**; n2/n3 at 2.31×/5.7× (Sky.js:268-269) add 8–15 px and 3–6 px. That IS
   CRITIC's "15–25 px cells". At dunes' 6–11° the same terms compress to 6–12 px vertical ×
   40–92 px horizontal — the measured streak field; at night's 13–18°, 11–23 px "waves".
3. **A mid-histogram threshold cut with a steep edge.** `deckDensity` (Sky.js:265-275):
   `raw = 0.58·n1 + 0.30·n2 + 0.16·n3 + 0.20·puff`, then
   `smoothstep(cover, cover+soft, raw)`. Day cover 0.59–0.72 (Atmosphere.js:195) sits ON the
   G-channel mean 0.491/raw mean ≈0.62, i.e. the cut crosses the histogram where edge density
   is maximal, and deck soft 0.16/**0.09** (decks 1–2) gives edge slope 1.5/soft ≈ 9–17:
   near-binary cells at opacity 0.86/0.97.
4. **The domain warp is the marble signature.** Sky.js:289-291: `uv += (tex@0.31uv−.5)·warp·0.9`
   → ±0.45·warp repeats of displacement (±0.51 for deck 2) — ±3 fundamental features:
   it shreds cell edges into the observed swirl. Sim ablation: warp off drops courtyard sim hf
   10.37 → 8.88 and coarsens cells (ACF min 18→34 px).

**Attribution measured, not inferred** (instrument `sim` mode — CPU re-render through the real
cameras, bit-identical texture build, grade chain ported; per-shot sim/frame ratio 1.31–1.64
stated as calibration): courtyard sim full **10.37** vs no-decks **3.77** — the deck stack is
+6.6 of it; each deck alone +2.7–3.8 (all three at the same period, they stack); night full
12.14 vs no-decks 3.87. The no-decks sim floor equals the frames' flattest-tile floor
(3.5–4.1) and hero's cloudless haze wedge (**3.80**), which is exactly the…

**…dither floor, which is NOT sky's.** PostFX.js:622 ships `grain: 0.016`, applied at
PostFX.js:1148 as ±2.04 display-luma of IGN; the IGN adjacent-pixel mean|Δ| is 0.493/0.427
(designed decorrelation), so the arithmetic floor is **hf 3.76** — and hero's cloud-free frame
rect measures 3.80 (FXAA passes the dither at day luma; at night luma it attenuates to a
measured floor16 of ~1.9). **Total sky hf is floor-saturated.** The reference skies' 0.36–1.33
were measured on JPEG captures whose compression floor is ~0.1–0.3. Raw-total parity with the
references is therefore not reachable by ANY Sky.js change while the dither ships — the scored
quantity below is the paired excess over the same-boot flat arm, which cancels the floor on
both sides of the comparison. (Whether 0.016 dither is the right price for banding is a
POSTFX question, named here and NOT smuggled into this candidate.)

**Ruled out as sources** (read + sim): PostFX AO (skips sky via `slyIsSky`), ink/rim (edge-mask
bound, sky interior has no depth/normal edges), bloom (threshold 2.20 scene-linear, sky band
far from the disc), night star field (point spikes, not 15–25 px cells), Milky Way dust
(horizontally smooth, band-masked). The defect is Sky.js's deck stack. This prereg therefore
stays where the task scoped it; nothing is routed away.

## 3. The candidate — six numbers on two lines of TUNE

Edit **only** `TUNE.decks` scale and soft (Sky.js:118-120), h/drift/opacity/warp/streak and
all shader literals untouched:

```
                 scale                soft         scale·h
deck0 cirrus     0.00030 → 0.000105   0.30 → 0.36  0.780 → 0.273
deck1 mid        0.00052 → 0.000138   0.16 → 0.38  0.754 → 0.200
deck2 cumulus    0.00088 → 0.000105   0.09 → 0.40  0.669 → 0.080
```

Mechanism: scale·h separation (0.273/0.200/0.080) makes the cumulus deck carry a FEW LARGE
soft masses (fundamental ~250–500 px at courtyard) under finer cirrus — a scale hierarchy
instead of one cell field; soft 0.36–0.40 drops the threshold-edge slope from 9–17 to ~4,
so the fine samples (n3@5.7×, worley@1.7×) ride inside the ramp instead of flipping it.
Chosen by offline iteration in the sim (v1 scale-only failed: hf 10.37→6.56 with cells merely
enlarged — scale alone does not fix it; v3 = this set). Sim results, current vs candidate:

| shot (rect as §1) | sim full | sim candidate | sim cand, grain off | sim no-decks (=flat) |
|---|---|---|---|---|
| courtyard | 10.37 | **4.28** (sd 7.6, PD9 6.2) | 1.40 | 3.77 (PD9 0.42) |
| dunes     | 7.76  | **4.60** (PD9 4.1) | 2.03 | 3.78 (PD9 0.46) |
| night     | 12.14 | **5.94** (PD9 9.3) | 3.53 | 3.87 (PD9 0.48) |
| hero      | 7.47  | **4.49** | 1.91 | 3.77 (PD9 0.21) |

The grain-off row is the candidate sky's own content: courtyard 1.40 — at the top of the
reference range. Sim crops eyeballed at 2× (scratchpad, non-durable, described per the crop
tool's rule): courtyard = a few large soft wisps on blue, reads as sky; dunes = soft stratus
bands; night = larger, softer, still swirl-flavoured (risk R2 below).

## 4. Registered predictions — intervals, sealed before any new frame

Scoring rects/masks/definitions are §1's, computed by `skynoise-diag.mjs score <dir>` on the
capture's committed frames. **Primary scored quantity: excess := hf(arm) − hf(flat arm), same
boot, same shot, same rect.** Reference bracketing, stated honestly: the reference range
0.36–1.33 rides JPEG floors of ~0.1–0.3, so the references' own excess is ≈0.1–1.2; the
candidate bands below bracket that region. Raw-total predictions are also given — they do NOT
reach 0.36–1.33 and §2 says why (3.76 dither floor, POSTFX-owned, invisible at 1×).

**BASE arm (known-bad calibration — the shipped state, measured):**
- gates: courtyard hf ≥ 6.5, dunes(clean rect 320,12,1000,85) ≥ 4.8, night ≥ 6.2
  (committed-frame values 7.91 / 5.64 / 7.39). Base outside its gate ⇒ the tree under capture
  is not the tree diagnosed ⇒ **capture VOID, no verdict** (P-F3).

**FLAT arm (over-corrected known-bad — poster sky, cover poked +9, decks fully suppressed):**
- **PD9 < 1.2 on all three shots** (sim 0.42–0.48; a real cloudless frame patch measures
  0.96). This arm existing as its own failure is the point: *a sky with hf ≈ floor and no
  structure is a registered REJECT state, not a win* — real skies carry low-frequency
  structure. If the flat arm's PD9 lands ≥ 1.2, or the candidate's lands < 2.2 (below), the
  two known-bads have failed to separate from the candidate and the metric is void ⇒
  **UNSCOREABLE is the registered outcome** (PREREG-pnight's discipline).
- flat hf (floor check): courtyard/dunes ∈ [3.0, 4.4] (grain arithmetic 3.76 ± FXAA/vignette),
  night ∈ [1.4, 3.2] (FXAA active at night luma; measured night floor16 1.94). Outside ⇒ the
  floor model is wrong; excesses remain computable (paired) but the RESULT must say so.

**CANDIDATE arm (the six numbers of §3, poked live):**
- P1 courtyard excess ∈ **[0.05, 1.30]** (sim excess 0.51; ratio-scaled ≈0.32)
- P2 dunes excess ∈ **[0.08, 1.40]** (sim 0.82; ≈0.40)
- P3 night excess ∈ **[0.30, 2.40]** (sim 2.07; ≈1.30)
- P4 structure floor (anti-poster): PD9(cand) ≥ 2.2 on courtyard and night, ≥ 1.6 on dunes;
  and ≤ 14 on all (above today's marble PD9 ⇒ something else appeared).
- P5 totals (secondary): hf(cand) ≤ 0.62 × hf(base) on courtyard and night. Dunes is exempt
  from the total gate — its base excess is only ~1.9 over a 3.76 floor, so a total ratio there
  measures the dither, not the fix; dunes is carried by P2 + P4 + P7.
- P6 hero regression watch: hf(cand, hero rect 340,2,700,50) ∈ [3.2, 5.0] (base 3.80 — hero's
  sky is already at floor; the candidate must not ADD noise to it).
- P7 eyeball, registered words, stated zoom: at 1× and 2×, courtyard/dunes read as cloud
  masses/bands and night as a cloudy night sky; the REJECT vocabulary is "marble", "static",
  "cells", "water". Scored by the capture owner in the RESULT with crops; CRITIC's next §7.4
  pass remains the final arbiter of the pair verdicts themselves.

**Prediction intervals are bands, not points (§133.1),** sized from: sim value, sim/frame
calibration ratio spread (1.31–1.64 across shots), and FXAA's differential treatment of wide
vs 1-px edges (unmodelled, direction known).

## 5. P-falsifiers — revert, do not defend

- **P-F1** any of P1–P3 above its band top ⇒ candidate REVERTED. Do not retune toward the
  band post-hoc; a new candidate is a new prereg.
- **P-F2** P4 fails low on any shot ⇒ the fix over-corrected into the poster failure ⇒
  REVERTED (passing hf cannot rescue a flat sky; the flat arm exists to make that concrete).
- **P-F3** base gate fails ⇒ VOID capture (no verdict about the candidate at all).
- **P-F4** restore arm differs from base by > 0 px at ΣRGB ≥ 4 (threshold stated per §122.1;
  bit-identity is expected because `setShot` freezes rAF/uTime per KNOWN_ISSUES §19, so drift
  cannot move clouds between arms) ⇒ the poke/restore path leaked ⇒ **every arm number in the
  boot is void** (pnight1's own recorded failure mode).
- **P-F5** sky-only claim: diff(cand, base) outside the sky/dome pixels > 0.2% of frame at
  ΣRGB ≥ 4 ⇒ unexpected coupling (fog/bloom/outline) ⇒ investigate before any verdict ships.
- **P-F6** a straight full-height discontinuity in any candidate sky ⇒ risk R1 surfaced (see
  §7); the frame still scores, but the seam is logged as its own defect with the crop, and if
  it dominates the 1× read the candidate does not ship until the tiling fix lands.

## 6. §17 look-change declaration

This candidate is **a look change arriving as a look change**, declared before capture:
it alters the sky of **every canonical shot whose frame contains dome pixels** — the three
scored shots `courtyard`, `dunes`, `night` change most (their skies are the finding), and
`hero`, `traversal`, `temple` (227 sky samples), `combat`, `guard`, `sly-closeup`/`sly-key`/
`sly-profile` backgrounds change wherever sky shows. The base arm in the same boot is the
"before" record. No correctness claim is made for the pixels themselves — the shipped marble
is not a bug in the code's own terms; it is a look that loses the side-by-side. Per §17 the
change ships only through this A/B, lands with its own KNOWN_ISSUES entry quoting this file,
and never as a drive-by inside an unrelated fix.

## 7. Registered residual risks (named now so they cannot become post-hoc excuses)

- **R1 — the texture does not actually tile.** `buildCloudTexture`'s comment (Sky.js:165)
  says "sample on a torus"; the code does not wrap the lattice — `hash2(6,y) ≠ hash2(0,y)`,
  and R/Worley channels use non-integer frequencies (2.52/15.6, 8.1) that cannot tile —
  so every integer uv boundary is a value seam. Drift (`drift·t·scale·26`) sweeps seams
  through frame during a boot; today's marble hides them; the candidate's soft masses may
  not (sim probe CAND-t300: a full-height warp-shredded discontinuity, plausible-deniable as
  a cloud edge). Handled by P-F6. The real fix is a torus-wrapped lattice — a TERM change,
  deliberately NOT in this candidate, owed its own before/after per the file's own header note.
- **R2 — night may still read watery.** The warp swirl signature survives at night (sim PD9
  9.3, biggest excess band). If P7 fails on `night` alone with P1–P4 passing, the registered
  follow-up lever is deck warp 1.25 → ~0.7 (Sky.js:120) as its OWN prereg arm — not a live
  retune of this one.
- **R3 — sim fidelity.** No FXAA/bloom/vignette/FX-particles in the sim; per-shot sim/frame
  ratios 1.31–1.64 absorbed into band widths. If measured excesses land consistently at ~2×
  the sim's, the calibration section of the RESULT must recompute the ratios before anyone
  reuses this sim for a next candidate.

## 8. Capture plan (§163/§164 chunked; lock cost ~8–10 min per chunk)

Runner: `progress/records/skynoise1.mjs`, patterned on `pnight1.mjs` (one boot per chunk,
arms are **live pokes of a running page, not rebuilds** — §124.4 makes mid-boot tree edits
inert, so pokes are the only valid arm mechanism):

- poke handles: `sky = engine.get('sky')`; candidate = `sky._u.uDeckScale.value.set(0.000105,
  0.000138, 0.000105)` + `sky._u.uDeckSoft.value.set(0.36, 0.38, 0.40)`; flat =
  `sky._u.uCloudCover.value.set(9,9,9)`; restore = set the saved originals back.
- **Ordering trap, stated:** `setShot` emits `timeOfDay` → `Sky._refresh()` rewrites
  `uCloudCover` (shared Vector3 with the atmosphere state). Poke AFTER `setShot` settles,
  capture immediately, never re-`setShot` inside an arm.
- Chunk A: `courtyard` — capture `base`, `cand`, `flat`, `restore`; commit frames + stamp
  JSON (src-tree hash per §121.4, tod, quality, 1280×720, match cand1 conditions) to
  `progress/records/skynoise1/A/` before releasing anything else.
- Chunk B: `night` — same four arms, commit to `skynoise1/B/`.
- Chunk C: `dunes` — same, `skynoise1/C/`.
- Chunk D (only if the lock is quiet): `hero` — `base`, `cand`, `restore`, `skynoise1/D/`.
- Scoring: first wake after DONE (§163.2), offline:
  `node progress/records/skynoise-diag.mjs score progress/records/skynoise1` → prints per
  shot/arm hf, excess, PD9, gate verdicts against THIS file's bands; verdict table lands in
  `RESULT-skynoise1.md` quoting the bands verbatim.

## 9. Files of this seal

- `progress/records/skynoise-diag.mjs` — instrument (frames/grain/project/sim/cand/score).
- `progress/records/PREREG-skynoise.md` — this file, the registered seal.
- Working images stayed in the scratchpad (crops of committed frames + sim renders), never
  committed, per AGENTS §1.1 rule 3.
