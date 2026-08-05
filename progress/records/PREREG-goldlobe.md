# PREREG-goldlobe — the gold specular lobe needs a SHADING-side term; the shipped assembly's ceiling is proven short, and the candidate is a sun-glint leg in the metal branch

**Owner:** SHADING (`src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js`).
**Date sealed:** 2026-08-05. **Status:** REGISTERED, capture NOT run (offline task; no lock).
No `src/**` touched yet — §3's scaffold is specified here and lands as its own default-inert
commit before the capture window. Numbers from `progress/records/banda-diag.mjs gold`
(drift-guarded port; grade anchor 0.35 L worst, state anchors PASS) plus the committed
`gold1` scoring.

**The finding under repair** (`gold1/RESULT-goldtraversal.md`, gates run 2026-08-05): largest
warm specular lobe **5 px (5×1)** across 119 k gold pixels vs **84–146 px** on real
Odyssey/Sly gold (Odyssey flag 84 px on a 28 px ball, Sly 2 dome 95, Sly 3 hook 146); gild
tail over L160 **2.10 %** vs the 3 % floor; highlight ceiling **p99 185.1 / max 230.4** vs
reference p99 **239–244**; and the hottest gild pixels are a 1–2 px rim-lit arris line, not a
lobe. §136 measured `metalAmount` lowering as a regression; GEOMETRY's `spec` is
upstream-blocked on SHADING's diff-assembly question. The lobe most plausibly needs a
SHADING-side term first — this seal is that term.

---

## 1. Diagnosis — the ceiling is arithmetic, so the routing is proven, not plausible

Port of the shipped spec assembly (toon.glsl.js:518–527) on `hieroglyph_gilded`
(color 0xdcae5e, spec 0.55, gloss 64, rough 0.55, metal 0.85 — Architecture.js:63,207) at
the traversal light state, swept to the lobe core:

| ndh | lobe = ndh^42.9 | scene | display L |
|---|---|---|---|
| 0.95 | 0.111 | 0.256 | 139.4 |
| 0.97 | 0.271 | 0.430 | 165.7 |
| 0.985 | 0.523 | 1.128 | 207.5 |
| 1.000 | 1.000 | 1.128 | **207.5 — the ceiling** |

`specStep` saturates at 1.35 and `specAmt` at 0.98 for these material constants, so **display
L 207.5 is the maximum the shipped term can produce on this surface at ANY geometry** — the
reference p99 239–244 is unreachable through it. No arris re-profiling, bead, or normal work
can close a gap the term's own saturation sets; that is why the bead moved area-in-lobe and
not the frame (§128), and why the gold1 tail sat at 2.10 % vs 2.11 % across three
geometry/texture landings. The measured gold1 numbers are consistent with the port: p99 185.1
< 207.5 (the beams rarely reach lobe core — flat faces put whole facets in or out of a
knife-edge glossP 42.9 window; the 0.92·max detector then finds only the arris rim line).

**Why the lobe is 5 px**, named: (a) flat beam faces → ndh constant per facet → the smoothstep
window is binary per facet and almost never lands inside; (b) the triplanar detail jitter
decorrelates per-texel → speckle, not a connected component; (c) the one curved population
(beadRoll arris) is 1–2 px wide by construction → the "lobe" IS the arris line. A term keyed
on `dot(R, uKeyDir)` with a broad exponent is the standard stylised-metal answer: it paints a
connected sun-aligned patch whose size is set by the exponent, not by facet luck.

**The §136.3 diff-assembly question, answered with numbers so GEOMETRY's `spec` unblocks.**
Relocating the wash outside `diff *= mix(1.0, 0.20, slyMetal)` (the physically-motivated
proposal) at the shipped metal 0.85, dark-gild texel (sh 0, ndl −0.2):

| | display L | R−B |
|---|---|---|
| shipped (wash inside) | 55.4 | −35.4 |
| relocated (wash outside) | **64.4** | **−47.7** |

The relocation raises the blue wash on dark gild from 0.32× to 1.00× — **+9 L of blue and
−12 R−B on exactly the population §130.5/§136 convicted** (167 k of 271 k gild px below L50).
It is a measured regression at the shipped metal value, while on every non-metal texel it is
arithmetically bit-identical (`mix(1,0.20,0)=1`). **Registered answer: the diff assembly does
NOT change under this seal.** The clean alternative that makes `metalAmount` mean what its
name says without the regression — scale the wash by `(1 − slyMetal)` ("atmospheric hue
support is not a metal surface's term") — is named here for a future seal if GEOMETRY's
`metalAmount` arms need it; it is NOT part of this candidate. GEOMETRY's `spec: 0.55` sizing
can proceed against the shipped assembly plus this seal's glint leg; the two compose
additively (`spec` feeds `specAmt`, the glint is a separate add).

## 2. The candidate — a sun-glint leg in the metal branch, default-inert scaffold

**Site:** toon.glsl.js, inside the existing `if ( uMetal > 0.001 )` metal-environment branch
(lines 535–542) — `R` is already computed there, control flow stays uniform, and non-metal
materials skip the whole block unchanged.

```glsl
/* after: metalEnv = alb * env * ( slyMetal * uMetalGain * ef ) * mix( 0.35, 1.0, sh ) * ao; */
float slyGlint = pow( max( dot( R, uKeyDir ), 0.0 ), uGlintPow );
metalEnv += ( alb * 1.4 + uSpecColor * 0.45 )
          * ( uGoldGlint * slyGlint * slyMetal * mix( 0.25, 1.0, sh ) * ao );
```

Tint follows the file's own gold rule (derived from albedo + a small pale core — "sun-times-
gold, arrived at without any palette entry"); `slyMetal` scoping means the ORM blue-channel
gilding masks gate it per-texel; `mix(0.25, 1.0, sh)` keeps it out of occlusion shadow (B4);
`ao` respects baked occlusion. **Scaffold plumbing:** `uGoldGlint { value: TUNE.goldGlint }`
and `uGlintPow { value: TUNE.glintPow }` join the shared uniforms (ToonMaterial.js
constructor) + `uniform float uGoldGlint; uniform float uGlintPow;` in TOON_PARS, with
`TUNE.goldGlint: 0.0` (INERT — the add is multiplied by exactly 0) and `TUNE.glintPow: 20.0`.
The scaffold commit lands BEFORE the capture window, so every chunk in the window shares one
tree hash (§121.4); its inertness is proven in-boot by the base-vs-restore null (§5) and by
the base arm reproducing gold1's quantities (§4 gate).

**Candidate values, from the port sweep (rows printed by `gold` mode):** `uGoldGlint 2.6,
uGlintPow 20` — half-width acos(0.5^(1/20)) ≈ **15.0°**; lobe-core display (pre-bloom)
**L 223** (A-lo 1.6/20 row: L 209; chrome 2.6/5 row: L 223 core but still L 208 at 26° off-axis
— the over-lobe shape), i.e. core scene ≈ 2.3–2.6, which is past PostFX's metal-aware bloom
onset (Tmetal 1.20, fed via the SLY_METAL_TAG alpha the composite already reads) — the bloom
completion is what reaches the 239–244 reference window. The port does not model bloom
(stated); the p99 band below carries that uncertainty on its stated side.

## 3. Gates (void conditions on the capture's own base arm, before scoring)

- **G-0a share** (goldtraversal convention): fresh `matmask.mjs` +`gildlit.mjs` eroded-2 share
  within ±20 % of 12.94 %. Outside ⇒ VOID.
- **G-0base defect-present anchor:** base-arm gild tail over L160 ∈ **[1.2, 3.0] %** and
  largest lobe ≤ 20 px (gold1: 2.10 % / 5 px). If the base already clears 3 % or carries a
  ≥ 30 px lobe, the tree under capture is not the diagnosed one ⇒ VOID.
- **G-0c registration look:** tinted-mask crop over the exact base capture (goldtraversal §0.3
  procedure; no numeric form). Misregistration ⇒ VOID.
- **Occluder map re-derived on this capture** (goldtraversal §6 procedure, exclusion rects
  stamped into the jobs file; the FX-glow positive control must return a lobe with exclusion
  lifted and ≤ ~5 px with it applied).

## 4. Registered predictions — goldgap.py convention (mask ROI, occluder-excluded, `lobe_min_rmb −5`)

On the **cand arm (2.6 / 20)**, `traversal`:

- **B1' lobe area:** largest 4-connected component of L ≥ 0.92·ROImax ∈ **[30, 400] px**
  (the goldtraversal B1 band verbatim; the reference 84–146 px is the aim inside it).
- **B2' tail:** gild share over L160 ∈ **[3 %, 20 %]** (the registered defect floor becomes
  the pass floor; combat same-boot re-anchor must stay > 20 % — the blown-frame separator).
- **B3' body guard:** gild p50 / same-frame `sandstone_worn` p50 ∈ **[0.85, 1.8]** — the
  glint must not wash the body (it is lobe-shaped by construction; a body-wide lift here
  means the exponent/geometry model failed).
- **B4 occlusion contrast, carried forward and non-negotiable:** ring p05 / gold body p50
  ≤ **0.65** (gold1: 0.32, contrast 8.4 — ours wins there; port worst-case ring texel moves
  +0.1 L under the glint). **> 0.65 ⇒ REVERT regardless of B1–B3** (goldtraversal's own rule).
- **B5 bloom halo:** px past lobe edge ∈ **[0, 40]** (march convention as committed).
- **B-p99 ceiling:** gold ROI p99 ∈ **[222, 252]**, reference window **239–244** named as the
  aim; p99 < 222 ⇒ the term under-delivers ⇒ REVERT (a bigger gain is a NEW prereg, not a
  live retune); p99 > 252 or max pinned 255 over > 0.5 % of ROI ⇒ clip ⇒ REVERT.
- **Cane/metal-population guard (§17's cost):** on the same-boot `combat` frames, the cane
  region share over L250 must stay ≤ 2 % and the look note names the cane explicitly (the
  cane runs uMetal 1.0 — the strongest glint in the game; gold_leaf/bronze inherit too).

**Known-bad calibration arms, same boot:**
- **KB-chrome (2.6 / 5)** — half-width ≈ 29.5°: must read as its own failure: **B1' > 400 px**
  (facet-wide over-lobe) OR B2' > 20 %. If it lands inside the pass bands, the area metric
  has not separated a known over-lobe ⇒ **UNSCOREABLE registered outcome**.
- **A-lo (1.6 / 20)** — dose row: every scored quantity must order base < A-lo < cand on the
  tail axis (G3-style dose check; port cores L 209 / 223).
- **Null (0 / 20)** = base by arithmetic; scored under P-F2.

**Registered risk R-G1 (named now, not post-hoc):** the flat-face binary risk — if the sun/
camera geometry aligns a whole beam facet within the 15° cone, the lobe arrives facet-shaped
and B1' fails high even at the candidate exponent. That is a legitimate FAIL (revert, re-derive
with a higher exponent under a new seal), not a scoring artefact; the chrome arm exists to
prove the metric sees exactly this failure shape at a dose where it is certain.

## 5. P-falsifiers — revert, do not defend

- **P-F1** any B-band out on the cand arm ⇒ REVERT (`TUNE.goldGlint` back to 0.0 — one
  constant; the scaffold stays, inert, for the next candidate's prereg).
- **P-F2** null-arm (poke 0) vs base differing px > 0 at ΣRGB ≥ 4 ⇒ the scaffold is not
  inert or the poke path leaked ⇒ every arm in the boot void.
- **P-F3** G-gates ⇒ VOID (no verdict).
- **P-F4** restore-vs-base > 0 px at ΣRGB ≥ 4 ⇒ boot void.
- **P-F5** B4 > 0.65 ⇒ REVERT regardless of everything else (the winning half is not for sale).
- **P-F6** KB-chrome passes ⇒ UNSCOREABLE.

## 6. §17 look-change declaration

A sun-aligned glint appears on **every metal surface in every shot** (population = uMetal > 0
× ORM blue mask: gilded architecture, gold_leaf, bronze, the cane, guard fittings), strongest
where metal is 1.0 (the cane). This is the §2.1 "stylised metal, not a mirror" register moving
toward its reference; it ships only through this A/B, with the cane guard above, its own
KNOWN_ISSUES entry quoting this file, and the base arms as the before record.

## 7. Capture plan

**Ordering:** the scaffold commit (default-inert, §2's exact diff) lands FIRST, before any
chunk of the shared window, so banda's chunks and this one stamp one src-tree hash. Then:

- **Chunk E** (own boot; can ride the same lock window as PREREG-banda's chunks — different
  shots, no shared pokes): `traversal` + `combat` staged sequentially, arms per shot:
  base (glint 0) → A-lo (1.6/20) → cand (2.6/20) → KB-chrome (2.6/5) → null (0/20) →
  restore-check. Pokes: `sh.uniforms.uGoldGlint.value = X; sh.uniforms.uGlintPow.value = Y;`
  (+ `sh.tune.*` for hygiene), readback after a step (§40). Frames + stamps JSON committed to
  `progress/records/goldlobe1/` per chunk (§163/§164).
- **Scoring**, first wake after DONE: fresh masks (`matmask.mjs`), gates, occluder derivation,
  then `goldgap.py` with a `goldgap-jobs-goldlobe1.json` copying the gold1 job structure
  (exclusion rects re-derived, positive control included) + `gildlit.mjs` for B2'/B3'/G-0a;
  verdict table quoting this file's bands verbatim into `RESULT-goldlobe.md`.
- If the window closes early: chunk E is self-contained; nothing in banda's chunks depends on
  it (and vice versa).

## 8. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/PREREG-goldlobe.md` — this file.
- `progress/records/banda-diag.mjs` — the port whose `gold` mode produced §1–§2's numbers
  (shared with PREREG-banda; drift-guarded).
- Committed conventions reused, unchanged: `progress/records/goldgap.py`,
  `progress/records/gold1/goldgap-jobs-gold1.json` (structure), `matmask.mjs`, `gildlit.mjs`.
- The scaffold src commit is NOT part of this session (offline task): it is specified in §2
  and owed by the capture session, default-inert, before chunk E.
