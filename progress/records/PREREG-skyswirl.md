# PREREG-skyswirl — the residual low-sky streak/swirl class is projection compression, not warp; candidate = one elevation-gated cover term

**Owner:** SKY (`src/render/Sky.js`). **Date sealed:** 2026-08-05.
**Status:** REGISTERED, capture NOT run (offline task; no lock, no `src/**` edit made).
Successor to `PREREG-skynoise.md` / `RESULT-skynoise.md`: the predecessor's gates PASSED
honestly and its six TUNE.decks numbers SHIPPED (they are in today's `Sky.js:118-120`).
This seal targets the NEW, smaller defect CRITIC-sbs2 named — it re-litigates nothing.

**The finding under repair** (CRITIC-sbs2 gap #3): with the shipped decks, courtyard's
clean sky reads hf 4.00 (3.3× ref, passable in the pair) but `dunes`' worst clean-sky band
reads **8.05 unmasked = 14.6× ref 0.55** with "the same fine liquid-streak class round 1
flagged" visible at 1:1, and `night` keeps a **"liquid swirl"** flavor (swirl band 4.98 =
6.7× ref 0.74; "read as oily in the blind viewing"). All diagnosis below is from committed
frames + committed source via `progress/records/skynoise-diag.mjs` (AMENDED 2026-08-05 —
recorded amendment in its header, not a fork: sbs2 baselines, `swirl`/`sweep`/`swirlcrops`/
`swirlscore` modes; the predecessor's baselines and score tables are byte-untouched).

---

## 1. Baselines on the committed sbs2 frames (shipped tree, 16a3817+dirty, 2026-08-05)

Metric conventions are the predecessor's (hf = hf_x + hf_y, Rec.709 0–255) with ONE
amendment: CRITIC-sbs2's numbers are **UNMASKED**, and reproduce to the digit at
`thresh:null`. Masking cannot replace placement on the night staging — the architecture
silhouette (p50 L 11.6) and the deep swirl sky (p25 L 11.3) OVERLAP in luma. So the scored
rects below are geometry-free **by placement**, verified on boosted crops (obelisk
x≈785-880 full height, roof x≈880-1050, rings y≤60, all invisible at 1×):

| rect | value | note |
|---|---|---|
| dunes `critic2` (760,0,1120,45) | hf **8.05** (x 2.79 + y 5.27) | CRITIC's number, verbatim rect — but it CONTAINS the pylon-top ink corner (mask<60 drops it to 5.48) and birds. Not a pure sky number. |
| dunes `clean` (920,0,1115,45) | hf **4.68** (x 1.87 + y 2.81), sd 6.43 | the sky-only worst band: 0% of pixels under L60. THE scored dunes rect. |
| night `critic2` (750,0,1250,220) | hf **4.98** (x 2.01 + y 2.96) | CRITIC's verbatim rect; contains hidden geometry (above). Correspondence only. |
| night `cleanR` (1150,90,1275,205) | hf **3.83** (x 1.12 + y 2.71), sd 8.25 | open swirl sky by placement; carries FX petals (pale motes, unmodelled by the sim, frozen per-boot). THE scored night rect. |
| courtyard `critic2` (850,0,1150,55) | hf **4.00** | the now-clean day control, 0% under L60. |
| hero (340,2,700,50) mask<60 | hf **3.78** | floor (grain arithmetic 3.76); 27% masked on this staging. Regression watch. |

The liquid class is hf_y-dominated everywhere it appears (dunes clean 2.81 y vs 1.87 x) —
horizontal filaments of fine **vertical** period. Both scored bands sit at grazing
elevation: dunes clean rect spans **9.6–11.8°**, night cleanR **4.5–10.8°**.

## 2. Diagnosis — measured per-term at the SHIPPED values (sim, `swirl` mode)

Sim floor (nodecks) 3.77/3.82 ≈ grain arithmetic 3.76. Deck residual := full − nodecks.
Sim/frame ratios on these rects, quoted per R3: courtyard 1.03, dunes 1.12 (totals);
excess-basis calibration frame/sim ≈ 0.62 (dunes: frame excess 0.90 vs sim 1.46),
≈ 0.65 (courtyard 0.22 vs 0.34), night bracketed 0.66–0.86 from the predecessor's
scored capture (their §"findings" #3).

**dunes clean rect: residual +1.46 → deck0 +1.27 (87%), deck1 +0.29, deck2 +0.07.**
**night cleanR: residual +2.64 → deck0 +1.52, deck1 +0.66, deck2 +0.78** — deck2 is the
large-structure "oily" carrier (solo sd 7.38, PD9 5.80 vs deck0's 6.21/3.87).

Candidate mechanisms, each measured:

1. **The pre-named warp lever (R2: deck2 warp 1.25 → 0.7) is DEAD for this class —
   verified before sealing, as owed.** night 6.46 → 6.23 (−0.23 of +2.64 = 9%); dunes
   5.23 → 5.27 (+0.04). Warp-off entirely: night −0.70 (27%), dunes −0.06. And on
   courtyard warp-off REGRESSES the pass state (4.11 → 4.27, sd 7.07 → 10.97): the warp
   is load-bearing for the day wisps' softness. R2's lever is refuted as this fix and
   MUST NOT be spent an arm on. (Its night-solo prereg option lapses with this seal.)
2. **Streak anisotropy is not the mechanism.** deck0 streak 3.4 → 1.0: dunes −0.27
   (18%), night 0.00. It shapes the filaments' aspect but does not carry the class,
   and it would restyle cirrus at every elevation.
3. **The texture seam (R1) contributes ≈ nothing in these bands.** The wrap steps are
   real and large in the texture itself — measured mean boundary step 21.8× interior (R),
   12.3× (G), 5.8× (A), 3.5× (B) — but a border-feathered-texture ablation moves the
   rects by −0.08/−0.01, and drift t=300 s changes content by only ±0.3 (translation
   variance). R1 stays a separately-owed term fix; it is NOT this candidate and cannot
   be blamed for this class.
4. **Low-elevation projection compression IS the mechanism.** `t = H/d.y`
   (Sky.js:285-287) compresses vertical screen period ∝ sin²(elev): deck0's fundamental
   P6y is 19–29 px across the dunes band (aniso 9.7–12.1 with streak) and 9–55 px across
   the night band, against 132–487 px on courtyard's 26.5–29.8° control — **the same
   content that reads as wisps overhead IS the liquid filament field at 5–12°.** Every
   elevation-gated probe moves the residual; nothing else does; and all of them leave
   courtyard's control at ±0.00 exactly.

**The elevation-dependent term is therefore REQUIRED** (the seal's own precondition:
warp alone measured unable to express the dunes fix — 0–9% of the residual). One more
fact fixes the term's SHAPE: the region CRITIC praised on dunes ("soft stratus banding
near the horizon", P7 PASS) and the defect band are the same deck content — below ~6°
the existing far-haze/alpha fades wash it into bands that read as stratus; at 6–15° it
survives at compressed period and reads as liquid. The shipped design already dissolves
decks toward the horizon (`alpha smoothstep(0.004, 0.085, d.y)`, far-haze
`smoothstep(0.55, 0.03, d.y)`); it draws the dissolve too low. The candidate extends the
design's own idiom upward, rather than adding a new visual idea.

Shape shootout (sweep + tall crops, scratchpad): elevation-gated **cover lift** removes
the class (dunes −74%, night −97% of residual at the chosen values; night matches the
clean Odyssey night reference); mip-bias and soft-widening only soften it (−25–40% /
−37–68%) and the residue still reads oily in the night crops. Cover lift is the candidate.

## 3. The candidate — one gated term, three numbers, default-inert

This candidate requires a **src change landed BEFORE the capture boot** (uniforms cannot
express an elevation gate today). The change is default-inert by IEEE arithmetic:

```glsl
// SKY_FRAG, with the other deck uniforms:
uniform vec3 uGraze;   // (coverLift, dyLo, dyHi)
// cloudDeck(), before the deckDensity calls (d.y already available):
float cov = cover + uGraze.x * (1.0 - smoothstep(uGraze.y, uGraze.z, d.y));
// ...then `cov` replaces `cover` in BOTH deckDensity calls (dens and densL).
```
```js
// Sky.js init(), in this._u:
uGraze: { value: new THREE.Vector3(TUNE.graze.lift, TUNE.graze.dyLo, TUNE.graze.dyHi) },
// TUNE addition (shipped defaults — the INERT state):
graze: { lift: 0.0, dyLo: 0.10, dyHi: 0.30 },
```

At `lift = 0.0`: `cov = cover + 0.0 * s == cover` bit-exact, so the edited tree at
defaults renders the shipped frames. `_refresh()` does not touch `uGraze`, so pokes
survive; the `uCloudCover` shared-reference trap does not apply (fresh Vector3).

**Candidate values: `uGraze = (0.15, 0.10, 0.30)`** — decks dissolve into the haze
below 17.5° elevation, fully below 5.7°. **Over-corrected known-bad: `(0.60, 0.10, 0.45)`.**

Sim table at the shipped decks (rects of §1, unmasked; `swirl` mode prints it):

| arm | dunes clean | night cleanR | courtyard control |
|---|---|---|---|
| full (shipped = base) | 5.23 (sd 5.49, PD9 2.82) | 6.46 (sd 9.32, PD9 6.41) | 4.11 (sd 7.07, PD9 5.72) |
| CANDSW (0.15, .10, .30) | **4.15** (sd 2.75, PD9 1.16) | **3.91** (sd 1.93, PD9 0.59) | **4.11 / 7.07 / 5.72 — identical to the digit** |
| KBOVER (0.60, .10, .45) | 3.77 = nodecks exactly | 3.82 = nodecks exactly | 4.11 (−0.01 sd — epsilon, see P5 note) |
| nodecks (floor) | 3.77 | 3.82 | 3.77 |

Side effects, declared: hero rect sim 4.49 → 4.09 (−0.40; hero's frame value is already
FXAA-floored at 3.78), traversal band sim 4.47 → 4.08 (−0.39). Courtyard is **bit-exact**
under the candidate: its rect spans d.y 0.446–0.497 and `smoothstep` clamps to 1 at
d.y ≥ 0.30, so the term contributes exactly +0.0 there — a registerable zero, not a
statistical one. (KBOVER's hi=0.45 does graze courtyard's 0.446 edge — epsilon-level;
the KB arm makes no courtyard claim.)

## 4. Registered predictions — bands sealed before any new frame

**Arms per scored shot, one boot: `base` (uGraze 0,.10,.30) → `cand` (0.15,.10,.30) →
`kb` (0.60,.10,.45) → `restore` (re-poke 0,.10,.30).** Primary scored quantity:
**excess := hf(arm) − hf(kb), same boot, same shot, same rect** — the KB arm doubles as
the in-band floor (measured ≡ nodecks on both scored rects in sim), cancelling the dither
floor AND the frozen FX petals on both sides. Frame-side predictions scale sim excesses
by the calibration ratios of §2 and carry boot-content variance (drift translation ±0.3,
petal placement) per §133.1.

**BASE gates (known-bad reproduced — else P-F3 VOID):**
- dunes clean hf ∈ **[4.2, 5.2]** (sbs2 4.68) AND base − kb ≥ **0.55** (predicted ≈0.90)
- night cleanR hf ∈ **[3.3, 4.4]** (sbs2 3.83) AND base − kb ≥ **0.80** (predicted 1.6–2.1)

**KB arm (over-corrected known-bad — must fail as its own failure):**
- dunes kb hf ∈ [3.4, 4.2]; night kb hf ∈ [1.4, 2.6] (frame-side floors; outside ⇒ floor
  model wrong — excesses stay computable, RESULT must say so)
- **P7-KB: the dunes KB frame at 1× must read as an empty poster gradient** (the §2.3
  failure, the predecessor's flat-arm reading) — this arm existing as a REJECT state is
  the point. If KB does NOT read poster on dunes, or kb excess overlaps cand excess so
  the three arms fail to separate, **UNSCOREABLE is the registered outcome** (P-F7).

**CANDIDATE arm:**
- P1 dunes excess (cand − kb) ∈ **[0.08, 0.55]** (sim 0.38; ratio-scaled ≈0.24). The
  floor 0.08 is the anti-poster clause: the band must keep real deck content above the
  KB state.
- P2 dunes total: cand ≤ base − **0.35** (the class must measurably leave the band;
  predicted drop ≈0.55–0.90).
- P3 night excess (cand − kb) ∈ **[0.00, 0.45]** (sim 0.09). Night's floor is 0.00 BY
  DESIGN: the comparand night sky is clean (ref 0.74), so in-band poster is the correct
  night look; the not-empty duty at night transfers to P7's veil clause, not to hf.
  AND night total: cand ≤ **0.75 × base**.
- P4 structure ORDERING only (the predecessor's PD9-absolute gates are frame-invalid,
  their RESULT finding #2; orderings survived in their own capture): PD9(kb) ≤
  **0.6 × PD9(base)** on both scored shots, and on dunes PD9(kb) < PD9(cand) < PD9(base)
  strictly. No absolute PD9 number is registered for any arm.
- P5 courtyard null (chunk B): cand-vs-base differing pixels INSIDE (850,0,1150,55) =
  **0 px at ΣRGB ≥ 4** (threshold stated per §122.1) — the bit-exact scope claim of §3.
  Pixels below the d.y = 0.30 line elsewhere in the frame are EXPECTED to differ.
- P6 hero regression (chunk B): base hf(340,2,700,50 mask<60) ∈ [3.5, 4.1] (sbs2 3.78);
  cand ∈ **[3.2, 4.1]** (may drop toward floor, must not ADD noise above 4.1).
- P7 eyeball, registered words, stated zoom, scored by the capture owner with crops:
  - dunes cand at 1× and 2×: **no "liquid", "marble", "water", "static"**; the band
    reads as warm-to-blue haze gradient with sparse soft wisps; the pyramid still
    separates chromatically. NOT the KB poster read — if cand and KB read the same at
    1×, P1's floor has failed in the eyeball channel: revert.
  - night cand at 1× and 2×: the swirl band reads as clean night gradient + stars;
    **"oily"/"watery" absent at both zooms** (the sbs2 blind-read word was "oily" —
    that word failing to apply IS the win condition); moon-band veils REMAIN visible
    somewhere above the band (they thin ~10–30%, declared — their total absence is a
    P7 fail even with P3 passing).

## 5. P-falsifiers — revert, do not defend

- **P-F1** P1 or P3 above its band top ⇒ candidate REVERTED. No post-hoc retune toward
  the band; a new value set is a new prereg.
- **P-F2** P1 below 0.08, or dunes P7 reads poster on the cand arm ⇒ over-correction
  shipped as the fix ⇒ REVERTED (passing night numbers cannot rescue it).
- **P-F3** any base gate fails ⇒ capture VOID, no verdict (tree under capture is not the
  tree diagnosed — includes the case where the uGraze edit failed to be inert).
- **P-F4** restore differs from base by > 0 px at ΣRGB ≥ 4 on any shot ⇒ every arm number
  in that boot is void (poke/restore leak; skynoise1 proved 0 px is achievable 4/4).
- **P-F5** cand-vs-base in the non-sky proxy zone (rows y ≥ 400) > 0.2% of zone at
  ΣRGB ≥ 4 ⇒ unexpected coupling ⇒ investigate before any verdict ships.
- **P-F6** P5's courtyard null fails (any differing px in the rect) ⇒ the term is not
  scoped as designed ⇒ REVERTED even if P1–P3 pass — surgical scope is the candidate's
  licence to exist next to the predecessor's shipped pass.
- **P-F7** KB fails to separate (no poster read on dunes, or kb excess ≥ cand excess)
  ⇒ metric void ⇒ **UNSCOREABLE is the registered outcome** (PREREG-pnight discipline).
- **P-F8** a straight full-height sky discontinuity in any cand frame ⇒ the R1 seam
  surfaced through the thinner cover: frame still scores, seam logged with crop as its
  own defect; if it dominates the 1× read the candidate does not ship until the torus
  fix lands (predecessor's P-F6, carried unchanged).

## 6. §17 look-change declaration

A look change arriving as a look change, declared before capture: the candidate thins
cloud-deck density in **every canonical frame's sky below ~17.5° elevation** — `dunes`
most (its entire visible sky spans 0–11.8°), `night`'s low bands strongly with mild
(~10–30%) thinning of the 12–16° moon-band veils, `hero`/`traversal` wedges mildly
(sim −0.40/−0.39, both FXAA-floored in frame), `temple`/`combat`/`guard`/closeup
backgrounds wherever their sky dips under 17.5°. Courtyard's scored band is bit-exactly
unchanged. The base arms are the before-record. The shipped state is not a bug in the
code's own terms; it loses the 1:1 read (CRITIC-sbs2 §3). Ships only through this A/B,
lands with its own KNOWN_ISSUES entry quoting this file, never as a drive-by. The src
edit itself (uniform + two lines, §3) is part of this declaration: landed for the
capture, inert at defaults, and REMOVED again (or defaulted) if the candidate reverts —
whichever the coordinator prefers, recorded either way.

## 7. Registered residual risks

- **R1 (carried)** — the texture still does not tile (`hash2(6,y) ≠ hash2(0,y)`;
  R/Worley at 2.52/8.1 cyc cannot tile). Measured boundary steps 3.5–21.8× interior;
  measured contribution to THESE bands ≈ nil (−0.08 feather ablation). Still owed its
  own term fix; a long boot can park a warped seam mid-frame (P-F8).
- **R2′** — night upper-sky veils: the gate taper reaches 17.5°, so the moon-adjacent
  veils thin. If P7 fails on veil absence with P1–P4 passing, the outcome is REVERT,
  not a defense that "the numbers passed".
- **R3′** — sim fidelity: no FXAA/bloom/vignette/FX in the sim; per-rect ratios quoted
  in §2 (totals 1.03/1.12/1.69; excess-basis 0.62–0.86). If measured excesses land
  consistently outside 0.5–1.0× of sim-scaled predictions, recompute the ratios in the
  RESULT before any next candidate borrows this sim.
- **R4′** — the src-edit risk class: an edit that is not actually inert at defaults.
  Guards: IEEE argument (§3), the base gates (P-F3), the courtyard null (P-F6), and the
  drift guard of `skynoise-diag.mjs` — after the edit lands, its deck/literal parses
  must still pass unchanged (the uGraze lines add, they do not modify parsed patterns).

## 8. Capture plan (§163/§164; one boot for the scored pair, chunked commits)

Runner: pattern `skynoise1.mjs` (poke arms on a live page, `step(1, dt=0)` between arms,
readback JSON per arm, src-tree hash stamped before AND after each chunk, §121.4).

- **Pre-boot, once:** land the §3 src edit (uniform + `cov` lines + TUNE.graze defaults),
  commit; `skynoise-diag.mjs grain` must still print "drift guard OK".
- **Chunk A (one boot, the scored pair):** `dunes` → setShot, settle, arms
  base/cand/kb/restore (poke `sky._u.uGraze.value.set(...)` AFTER setShot settles,
  capture immediately, never re-setShot inside an arm); then `night` → setShot (this
  re-runs `_refresh`; uGraze is untouched by it, but re-verify via readback), same four
  arms. Commit 8 frames + readbacks to `progress/records/skyswirl1/A/` before releasing
  anything. Conditions: 1280×720, harness quality high (the sbs2 baseline conditions).
  If the boot budget cannot hold 8 captures, the registered fallback is A=dunes,
  A2=night as separate boots — same arms, same gates, stated in the RESULT.
- **Chunk B (second boot, the null pair):** `courtyard` base/cand/restore (P5: bit-null
  inside the rect), `hero` base/cand/restore (P6). Commit to `skyswirl1/B/`.
- **Scoring:** first wake after DONE (§163.2), offline:
  `node progress/records/skynoise-diag.mjs swirlscore progress/records/skyswirl1`
  → prints per-shot/arm hf, excess-vs-kb, PD9 orderings, and every gate of §4 verbatim;
  verdict table lands in `RESULT-skyswirl.md` quoting the bands. P7/P-F8 are human steps
  with crops (zoom stated).

## 9. Files of this seal

- `progress/records/PREREG-skyswirl.md` — this file.
- `progress/records/skynoise-diag.mjs` — amended in place (recorded amendment, header
  documents scope): sbs2 FRAMES rows, thresh:null support, graze probes in the sim,
  `swirl` / `sweep` / `swirlcrops` / `swirlscore` modes, SEAL2 table. Predecessor
  sections byte-untouched.
- Working images stayed in the scratchpad (boosted crops of committed frames, sim tall
  crops and montages), never committed, per AGENTS §1.1 rule 3.
