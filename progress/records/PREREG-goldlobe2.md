# PREREG-goldlobe2 — the curvature successor: re-steepen the relief tilt the glint already sees (`uGlintSharp`), with a port-proven over-lobe KB

**Owner:** SHADING (`src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`).
**Date sealed:** 2026-08-05. **Status:** REGISTERED, offline — capture on dispatch after this
seal, behind the current lock chain. No `src/**` touched by this task; the seam pre-edit is
defined in §6 and lands in-ticket before chunk 1. Every number is printed by the committed
instruments — `banda-diag.mjs gold2` (new mode, extended not forked; runs behind the same
drift guard + state/grade anchors), `tools/texlab.mjs` (fresh run at this tree), and
measurements on the committed `goldlobe1/` frames — or quoted from committed records.

**Inherited verdict** (RESULT-goldlobe, P-F1 REVERT): the glint term is live, dose-ordered,
inert at 0, and reaches **abs L 244.3 inside the 239–244 reference aim on the CURVED
hook-ring** — while 99 % of the flat-faceted `hieroglyph_gilded` ROI moved < 4.3 L. "The
port's error was area, not amplitude." **Binding obligations:** (a) the successor's KB must
provably over-lobe IN-FRAME, verified in the CPU port BEFORE sealing (KB-chrome failed LOW,
an outcome the old port never checked); (b) bands carried: B1′ [30,400] aim 84–146, B-p99
[222,252], B4 ≤ 0.65 revert-regardless.

---

## 1. Diagnosis — three mechanisms, measured, one chosen

**(i) Texel normal variation — wiring already exists, structure already exists, drive is
what's missing. CHOSEN.**

- *Wiring (source):* the glint's `R = reflect(−V, Nw)` uses `Nw = slyWN`, which is the
  geometric normal **plus the material normalMap** (TOON_DETAIL is injected after three's
  normal-map resolution) **plus the triplanar detail layer** (toon.glsl.js:259, 284–286,
  314, 538). Texel relief reaches the glint today — no re-plumbing needed.
- *Authored tilt (texlab, this tree, size-256 catalogue row):* `hieroglyph_gilded` tiltP
  **[p50 1.15°, p90 17.72°, p99 26.89°]** at 25 mm/texel, slopeScale 3.36 — the tilt lives
  in a thin structured crest tail (glyph-stroke bevels), not the body.
- *Frame structure (committed goldlobe1 frames, exclusion rects applied, 8-conn):* the cand
  arm's ΔL ≥ +10 movers form **20–32 px compact components on the beams** ((448,194) 9×7,
  (574,115) 6×13, (289,205) 8×8 …) and KB-chrome's wider cone chained the same relief into
  **45–62 px stroke-shaped components** (33×3, 27×5 lines). The in-cone population is
  **structured, not single-texel glitter** — components already at the B1′ floor's scale.
- *The drive gap (gold2 inversion through the anchored chain):* movers' implied off-axis
  angles are **θ p02 20° / p10 26° / p25 28° / p50 31°** against a lobe window needing
  θ ≲ 15° (display ≥ 0.92·max ≈ 212) — while face-class θ0 sits at **pz p50 68.7°
  (p10 47.3°), nx 84.4°, px 90°**. The movers are the p90–p99-tilt crest texels of the
  best faces, stopped ~10–16° short of the window.

**(ii) Broadened lobe (pow → wide) — REFUTED as the candidate.** KB-chrome measured it
(broad wash, p99 191, no 0.92·max component), and the gold2 port now shows why: a wide cone
lifts the flat **body** first (pow 2 puts 33.2 % of visible-face body rays over L160) — it
is the shape of the KB, not of a compact lobe.

**(iii) Micro-curvature geometry — not needed for the bands.** beadRoll's arris is the 5 px
line B1′ keeps finding; a molding-scale rebuild is GEOMETRY's option if the coordinator
later demands the 84–146 aim specifically rather than the [30,400] band. Routed, not chosen.

**The chosen lever, from the gold2 forward table** (first-order re-steepening: a texel whose
relief rotated R from its face's θ0 to θ carries δ = θ0−θ; `uGlintSharp` s scales the
perturbation so θ′ = |θ0 − s·δ|; chain-ported display at gain 2.6 / pow 20):

| texel class | s=1.0 | **s=1.5** | s=2.0 | s=2.5 |
|---|---|---|---|---|
| mover p02 (θ 20°) | 186 | **222** | 150 | 126 |
| mover p10 (θ 26°) | 161 | **221** | 198 | 129 |
| mover p25 (θ 28°) | 153 | **218** | 209 | 137 |
| flat body (δ 2.3° = 2×tiltP50) | 126 | **126** | 126 | 126 |

s = 1.5 lifts the measured mover percentiles into the lobe window and the B-p99 band while
the flat body **does not move at all** — the selectivity is structural (small-δ texels stay
far off-axis at any s). The model also says the optimum is narrow (s ≥ 2.5 over-rotates
past-axis): hence a bracket arm at 1.25 and dose-ordering gates rather than a point bet.
First-order caveats stated: per-mover θ0 is a face mixture, base texel L varies, azimuth is
collapsed — the bands below carry the slack and the bracket arm measures the real response.

## 2. The candidate — exact GLSL and values

Replace the two glint lines inside the `uMetal > 0.001` branch (toon.glsl.js:546–549) with:

```glsl
/* goldlobe2: re-steepen the mip/authoring-attenuated relief tilt for the glint's R only.
   nonPerturbedNormal = three's pre-normal-map view-space normal (r185 normal_fragment_begin),
   still in scope here; Nw carries normalMap + triplanar detail. uGlintSharp 1.0 = the
   predecessor's exact arithmetic; the whole add stays ×0.0-inert at uGoldGlint 0.0. */
vec3 NgW = normalize( slyToWorldDir( nonPerturbedNormal ) );
vec3 Ns  = normalize( mix( NgW, Nw, uGlintSharp ) );
vec3 Rg  = reflect( - slyToWorldDir( V ), Ns );
float slyGlint = pow( max( dot( Rg, uKeyDir ), 0.0 ), uGlintPow );
metalEnv += ( alb * 1.4 + uSpecColor * 0.45 )
          * ( uGoldGlint * slyGlint * slyMetal * mix( 0.25, 1.0, sh ) * ao );
```

Plumbing: `TUNE.glintSharp: 1.0` + shared uniform `uGlintSharp` beside the existing
uGoldGlint/uGlintPow (ToonMaterial.js:543–544, :767–768 pattern). Inertness surface is
unchanged — the add is multiplied by exactly 0.0 at the shipped `TUNE.goldGlint 0.0`;
`mix(a,b,t>1)` extrapolation is well-defined GLSL.

**Candidate values (cand arm): goldGlint 2.6, glintPow 20, glintSharp 1.5.** Bracket arm
A-s: 2.6 / 20 / **1.25**. Named and rejected: raising gain instead (brightens the wash long
before forming a lobe — RESULT §5.3's measured two-direction failure); lowering pow (the KB's
own shape); glintSharp ≥ 2.5 (past-axis in the model — a future value needs its own table).

## 3. Registered quantities (bands verbatim; scorer = the committed goldlobe pipeline —
`matmask.mjs` fresh masks, `gildlit.mjs`, `goldgap.py` with a goldlobe2 jobs file, occluder
re-derived per the goldtraversal §6 procedure; conventions unchanged from PREREG-goldlobe)

**Gates (P-F3, VOID):** G-0a share (eroded-2 within ±20 % of 12.94 %), G-0base (base tail
∈ [1.2, 3.0] %, largest lobe ≤ 20 px), G-0c registration look, occluder positive control —
all carried verbatim.

| band | quantity (cand arm, traversal, occluded gilded ROI) | interval |
|---|---|---|
| **B1′** | largest 4-conn component of L ≥ 0.92·ROImax | **[30, 400] px** — carried; aim 84–146 quoted as aim; **honest prediction 30–120** (mover-cluster scale measured 20–62 px; membership window widens as max rises) |
| **B2′** | gild share over L160 | **[3, 20] %** — carried (combat same-boot re-anchor > 20 % separator carried) |
| **B3′** | gild p50 / sandstone_worn p50 | [0.85, 1.8] |
| **B4** | ring p05 / gold body p50 | **≤ 0.65 — REVERT REGARDLESS** (carried verbatim; predecessor measured 0.32 twice) |
| **B5** | px past lobe edge | [0, 40] |
| **B-p99** | gold ROI p99 | **[222, 252]** — carried; predicted 218–230 (edge risk stated: below 222 ⇒ REVERT per the carried clause, and the two-dose data prices exactly one re-seal) |
| **Cane guard** | combat cane region share L ≥ 250 ≤ 2 %, cane named in a look note | carried |
| **Dose order** | base < A-s(1.25) < cand(1.5) on tail-over-160 and p99 | monotone, else the first-order model is falsified in the small-s regime it predicts monotone ⇒ VOID + re-diagnose |

**KB-widelobe (gain 5.2, pow 2, sharp 1.0) — the obligation, discharged in-port BEFORE
sealing:** the gold2 proof table shows, with body texels only (crest movers only add),
**33.2 % of visible-face rays ≥ L160 against the 20 % B2′ explosion line** (pz face p50
68.7° → display 183; the pow-2 half-peak half-width is 45°, so the best half of the pz
population sits in-cone). Registered failure signature: **B2′ > 20 %** (B1′ > 400 px counts
too if the near-clip movers chain). The same table records what the predecessor's port never
checked: KB-chrome's pow-5 body prediction was ≤ 187 even at the best face — the low failure
was foreseeable, and this KB is dosed past it on the measured geometry.

## 4. P-falsifiers — revert, do not defend

- **P-F1** any of B1′/B2′/B3′/B5/B-p99 out on cand ⇒ REVERT (`TUNE.goldGlint` stays 0.0 —
  runtime pokes, nothing shipped). A new dose/sharp is a NEW prereg fed by the bracket data.
- **P-F2** null arm (0 / 20 / 1.0) vs base ≠ 0 px at ΣRGB ≥ 4 ⇒ scaffold not inert ⇒ boot
  void (predecessor precedent: measured 0 px twice).
- **P-F3** any G-gate out ⇒ capture VOID.
- **P-F4** restore ≠ base ⇒ boot void (null arm doubles as restore, carried).
- **P-F5** B4 > 0.65 ⇒ REVERT regardless of everything else (carried).
- **P-F6′** KB-widelobe reads LOW (B2′ ≤ 20 % and B1′ ≤ 400) ⇒ **the port's geometry model
  is falsified a second time ⇒ capture VOID + re-diagnose** (not merely UNSCOREABLE — the
  §3 proof table made a definite in-frame claim this outcome would contradict).
- **P-F7′** KB-widelobe lands inside the cand pass bands ⇒ UNSCOREABLE (metric failed to
  separate).

## 5. §17 look-change declaration

Deliberate: sun-aligned gilded **crest glints** — the relief's stroke bevels light as
compact warm sparks on the beams/cornices where the sun cone allows (the "intended scatter"
Materials.js's own header names, finally driven); the gold_leaf ring/Ra-disc and the cane
inherit the sharpened R (ring already reaches 244 — the clip clause and cane guard are the
rails). Flat gilded body and all non-metal pixels: unchanged by construction (×slyMetal,
×0.0 at gain 0; body table row flat at every s). Ships only through this A/B with a
KNOWN_ISSUES entry quoting this file.

## 6. Capture plan (on dispatch, behind the current lock chain; §164 one-boot chunk)

- **Pre-edit** (in-ticket, before the boot; the goldlobe1 scaffold pattern): §2's GLSL swap +
  `uGlintSharp` plumbing, default-inert by gain. Applied by a dry-run-verified patch script;
  commit is the coordinator's.
- **Chunk G2** (one boot): `traversal` then `combat`, arms per shot:
  base → **A-s** (2.6/20/1.25) → **cand** (2.6/20/1.5) → **KB-widelobe** (5.2/2/1.0) →
  **null** (0/20/1.0 = restore) — per-arm readback of all three uniforms + TUNE mirrors;
  frames to `progress/records/goldlobe2/<shot>.<arm>.png`; runner `goldlobe2.mjs` from the
  goldlobe1.mjs template (idempotent, launch.sh, absolute log path, pidfile to scratchpad).
- Scoring at first wake after DONE: fresh masks, occluder re-derivation, `goldgap.py` jobs
  file `goldgap-jobs-goldlobe2.json`, table verbatim into `RESULT-goldlobe2.md`.

## 7. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/banda-diag.mjs` — extended with `gold2` (θ0 geometry, ΔL→θ inversion,
  sharp forward table, KB port proof; behind the existing drift guard + anchors).
- `progress/records/PREREG-goldlobe2.md` — this file.
- (on dispatch, not this task: the §6 pre-edit, `goldlobe2.mjs`, `progress/records/goldlobe2/`
  frames + readbacks, `RESULT-goldlobe2.md`.)
- Scratchpad only: texlab-gild.json (fresh texlab row quoted in §1), the mover-component
  one-liner's output (method stated in §1: 8-conn, ΔL thresholds, exclusion rects
  [500,190,740,400] + [870,0,940,100] — reproducible from the committed frames).
