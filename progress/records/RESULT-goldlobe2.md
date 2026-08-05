# RESULT-goldlobe2 — registered scoring of the goldlobe2 capture (PREREG-goldlobe2.md)

Scored by SHADING, 2026-08-05, per `PREREG-goldlobe2.md` exactly as sealed (seal committed at
67367ac with the extended `banda-diag.mjs gold2` diagnosis). **Written incrementally
(§163/§164); an abrupt end means a rollback took the session, not that scoring stopped.**

**STATUS: COMPLETE — VERDICT: P-F6′ VOID + RE-DIAGNOSE. KB-widelobe read LOW a second time
(B2′ 3.58 % against the >20 % port-proven explosion line), which the seal registered as a
definite-claim contradiction ⇒ the capture is VOID for candidate purposes and the port's
population model is falsified. The re-diagnosis is quantified below (§6): the port modeled a
full-metal lit texel; the frame's metal-reachable population is 24.1 % of the ROI (per-texel
`slyMetal` ORM leaf gating), and the predecessor's movers are geometry-curvature texels the
sharp lever cannot amplify. Nothing ships, nothing needs reverting (runtime pokes; scaffold
inert at `TUNE.goldGlint 0.0`, P-F2-proven to the pixel).**

## Evidence and provenance (filled as steps land)

- **Pre-edit** (seal §2/§6): the `uGlintSharp` scaffold — TUNE.glintSharp 1.0 + uniform +
  the 4-line GLSL swap (glint's R from a re-steepened `Ns = normalize(mix(NgW, Nw, s))`,
  `NgW` from three r185's unconditional `nonPerturbedNormal`) — applied ONLY inside a held
  ticket by `apply-goldlobe2.py` (dry-run verified on copies first: anchors matched exactly
  once each, no backticks inserted, node --check + module import + exported-strings check all
  green). **Inert-by-gain at the shipped `TUNE.goldGlint 0.0` — the add is ×0.0 exact.**
  Like its predecessor, the scaffold STAYS in the tree after the capture (the seal registers
  it as a staying scaffold); **commit is the coordinator's.** The applier verifies it
  actually holds `capture.lock` before touching src (acquire's timeout path returns unheld —
  guarded), and restores both files from byte copies on any verify failure.
- **Runner:** `progress/records/goldlobe2.mjs` (committed; goldlobe1 template + settle
  protocol + three-uniform readback; idempotent resume). Chain launcher (scratchpad,
  `goldlobe2-chain.mjs`): pre-edit ticket → release → the runner's own withGame ticket.
  Launched detached via `tools/launch.sh`, pid 20155 verified ppid 1; log
  `progress/records/logs/goldlobe2.log`; pidfile in scratchpad.
- Arms per the seal §6: base (0/20/1) / As (2.6/20/1.25) / cand (2.6/20/1.5) /
  KBwidelobe (5.2/2/1) / null (0/20/1 = P-F2+P-F4) — traversal then combat, one boot.
- Frames + readback land incrementally at `progress/records/goldlobe2/`.

## The port proofs this scoring will be read against (sealed before capture)

- Sharp forward table (gold2): s=1.5 lifts measured mover percentiles to display 218–222
  (lobe window ≈ 212; B-p99 band [222,252]); flat body (δ 2.3°) pinned at 126 at every s.
- **KB-widelobe port proof: 33.2 % of visible-face body rays ≥ L160 vs the 20 % B2′
  explosion line** — the predecessor's binding obligation, discharged in-port. A KB low-read
  in-frame is **P-F6′: VOID + re-diagnose** (the port made a definite claim), not
  UNSCOREABLE.

## Chunk log

- **Pre-edit:** ticket HELD 21:44:41 (verified in capture.lock — the applier aborts if
  acquire's timeout path returned unheld), patch applied + verified (anchors ×1 each, no
  backticks, node --check ×2, module import, exported-strings), ticket released. Scaffold
  committed by the coordinator at 8591a20 (staying, per seal).
- **Chunk G2:** one boot 21:44:42–22:38:01, srcTree at boot `dfa198283676610f`. LEVER probe:
  hasSharp true, boot values 0 / 20 / 1 (inert). Traversal tod 0.77 / 252 draws / 1.751 M
  tris; combat tod 0.74 / 222 draws / 1.542 M tris — the goldlobe1 staging reproduced.
  Settle 379 s / 354 s. All ten arms `applied ok`, `mismatch: []` × 10.
- **Mid-boot tree move, identified (§121.4/§124.4):** srcTree after = `a8925573a9ec3ff6` —
  the skyswirl uGraze edit (`src/render/Sky.js` only, committed ace14f3) landed on disk
  during the boot window. Inert to this boot (the bundler read the tree at 21:44); **no
  `src/world/**` or `Shots.js` change between boot and scoring** (git log over the window:
  Sky.js + this seal's own scaffold files only), so the scoring-time masks describe exactly
  the captured geometry/camera.

## Scores — gates and structure first

- **G-0a PASS, Δ = 0.0 %:** fresh masks at scoring tree — traversal gilded eroded-2
  **12.94 % / 119,251 px** (registered 12.94 %); combat gilded raw 5.81 % — both reproduce
  the predecessor to the digit; gilded maskid 7 / sandstone_worn 3.
- **G-0base PASS:** base tail over L160 **2.03 %** on the occluded ROI (∈ [1.2, 3.0]);
  largest base lobe **5 px (5×1) at (885,157)** — the same arris component as gold1 and
  goldlobe1. (Mask-only pre-occlusion tail 2.49 %, max 255 = the FX glow, expected.)
- **G-0c PASS:** tinted overlay — magenta rides the gilded architrave/cornice bands and
  stops at silhouettes, green tight on sandstone jambs, no tint on sky
  (`goldlobe2/reg-tinted-overview.png`, `reg-crop-1to1.png`).
- **Occluder derivation (this capture's own):** pass 1 raw-mask max 255.0, **325 hot px all
  in one region bbox (582,198)–(601,262)** — the FX glow behind Sly (per-boot phase spread);
  sparkle diamonds at x≈488 and the rooftop guard to y≈105 measured in crops. Derived rects
  **[480,150,740,400] + [860,0,945,110]** (wider than goldlobe1's, from this boot's own
  evidence). Pass 2: ROI 101,025 px, max 232.0, 148 survivors = the 1–2 px arris rim line
  (x183–1159). **Positive control PASS:** exclusion lifted → the detector returns the
  **170 px (17×15) FX glow lobe at (594,256)**; applied → 5 px.
- **P-F2 + P-F4 PASS, exact:** null vs base = **0 px at ΣRGB ≥ 1** (not just ≥ 4), both
  shots — the uGlintSharp scaffold is inert at gain 0 and the poke path restores bit-exactly.
- Arm liveness (ΣRGB ≥ 4 vs base): traversal As 13,516 / cand 14,310 / KB **86,397**;
  combat 5,094 / 5,096 / 23,533 — the lever is live and the KB's footprint is 6× the cand's.

## Scores — the registered table (recorded; P-F6′ below voids the candidate scoring)

| band | seal | cand (2.6/20/1.5) measured | note |
|---|---|---|---|
| B1′ | [30, 400] px, aim 84–146 | **5 px (5×1) at (885,157)** — the base component, unchanged | FAIL-below (recorded) |
| B2′ | [3, 20] % over L160 | **2.12 %** (base 2.03 %) | FAIL-below (recorded) |
| B3′ | gild p50 / worn p50 ∈ [0.85, 1.8] | **1.36** (88.4 / 64.9) | held |
| B4 | ring p05 / body p50 ≤ 0.65 REVERT-REGARDLESS | **0.317** (28.0 / 88.4), contrast 8.3 | held — the winning half again |
| B5 | px past lobe edge [0, 40] | **0** | held |
| B-p99 | [222, 252] | **185.8** (base 184.3) | FAIL-below (recorded) |
| cane | combat cane region ≥ L250 ≤ 2 % | **0.000 %** all four arms, region max 249.5 (the FX spark, arm-invariant) | held |
| order | base < As < cand on tail/p99 | over160 2.03 < 2.12 ≈ 2.12; ΔL max 61.0 < 81.6 | ordered at the extreme tail only — the sharp lever moves ~10² px, not the ported 10³ |

**KB-widelobe (5.2 / pow 2 / sharp 1.0) — the deciding row:** over L160 **3.58 %** (base
2.03 %), B1′ 22 px (6×4 at (304,205)), p99 201.0, max 240.1, ΔL p99 +84.1 —
**against the port-proven claim of 33.2 % ≥ L160 and the registered > 20 % explosion line.
KB READ LOW. P-F6′ FIRES: capture VOID for candidate purposes + re-diagnose.**

## 6. The re-diagnosis P-F6′ demands — done on this capture's own pixels

1. **The port modeled a texel; the frame is a population, and the population is 24 %
   metal.** Under the maximal cone (pow 2 — every visible facet in-cone at half-peak), the
   ROI pixels that moved AT ALL (ΔL ≥ 2) are **24.1 %**; the KB's ΔL **p50 is 0.0** — the
   median gilded-ROI pixel received zero glint at gain 5.2. Mechanism, named: the glint is
   scoped `× slyMetal` per-texel, and `hieroglyph_gilded` is **leaf over stone** — the ORM
   blue-channel gilding mask gates metal to the leaf strokes; the stone between glyphs is
   slyMetal 0. The gold2 KB proof multiplied a **metal-0.85 lit texel over 100 % of the
   ROI**; the reachable set is a quarter of it, and dimmer (sh/ao) — the same §18-family
   error as the predecessor's KB-chrome, now measured instead of suspected. The 33.2 %
   in-port claim was falsified exactly as P-F6′ anticipated it could be.
2. **The predecessor's movers are geometry-curvature texels, and the sharp lever cannot
   reach them.** `uGlintSharp` amplifies only `(Nw − nonPerturbedNormal)` — texture relief +
   detail. In-boot, sharp 1.25 → 1.5 moved the ROI ΔL p99 from +4.5 to +5.6 and the max
   mover from +61 to +82: real, monotone, and **~100× smaller in population terms than the
   §1 forward table predicted** (which attributed the movers' full θ-offset to texture
   tilt). The movers therefore sit on **geometric** curvature — the beadRoll arris (the
   eternal 5 px line) and the `gold_leaf` ring — whose normals live in `nonPerturbedNormal`
   and pass through the sharp untouched. Corollary: the texture-relief tilt actually
   reaching the shader at this framing is far below texlab's mip-0 distribution
   (p90 17.7°); the surviving delta is small enough that ×1.5 of it stays sub-lobe.
3. **What survives of the mechanism family:** the glint term itself remains live,
   dose-ordered, correctly scoped and inert at 0 (P-F2 exact); B4/B5/B3′/cane held in every
   arm of both captures. The compact-lobe-on-flat-`hieroglyph_gilded` goal is now bounded by
   **three measured walls**: population 24.1 % metal-reachable, texture tilt mip-dead at
   the framing, geometric curvature confined to 1–2 px arrises. The evidence-backed routes
   for a successor are (a) **GEOMETRY meso-curvature** (bead/roll radius at molding scale —
   the only structure all three captures keep finding at 0.92·max), and/or (b)
   **re-registering the lobe where the curvature is** (`gold_leaf` ring/disc — outside this
   ROI by mask construction; the ring hit the 239–244 reference aim in goldlobe1 and moved
   again here, crops committed). A TEXTURES amplitude raise would amplify a mip-filtered
   near-zero and should not be attempted without an at-mip in-frame tilt measurement first.
   Routing is the coordinator's; this RESULT registers the walls.

## Verdict

```
G-0a PASS 12.94 % Δ0.0    G-0base PASS 2.03 % / 5 px    G-0c PASS    occluder + control PASS
P-F2 PASS 0 px (ΣRGB≥1)   P-F4 PASS (same arm)          cane guard PASS 0.000 %
B4 0.317 ≤ 0.65 — revert-regardless does NOT fire
KB-widelobe: B2′ 3.58 % vs registered >20 % — READ LOW
⇒ P-F6′ VOID + RE-DIAGNOSE (the seal's own clause; re-diagnosis in §6, quantified)
cand bands recorded, not adjudicated: B1′ 5 px / B2′ 2.12 % / B-p99 185.8 (all FAIL-below)
```

**No ship, no revert needed:** all arms were runtime pokes; the tree ships
`TUNE.goldGlint 0.0` and the staying scaffold (`uGlintSharp` plumbing, 8591a20) is proven
inert to the pixel by P-F2. The gain ship decision was the coordinator's and the registered
answer is **VOID — the candidate was never validly tested because the metric's separation
power failed low again; the §6 walls are the deliverable.**

## Files of this scoring (coordinator sweep list — no git run by this task)

- `progress/records/RESULT-goldlobe2.md` (this file, completed).
- `progress/records/goldlobe2/` — 10 frames + `readback-G2.json` (committed at 1396aee) plus
  the scoring evidence written now: `goldgap-jobs-goldlobe2.json`, `reg-tinted-overview.png`,
  `reg-crop-1to1.png`, `occluder-rects-derived.png`, and six crops
  (`crops-kb-cluster-{base,cand,KBwidelobe}.png`, `crops-cand-maxmover-*.png`).
- `progress/records/goldlobe2.mjs` (runner), `progress/records/logs/goldlobe2.log`.
- Src: the staying scaffold (8591a20) — unchanged by scoring.
- Scratchpad only (regenerable): mask bins (`matmask.mjs` at the scoring tree; shares in §Scores),
  `apply-goldlobe2.py`, `goldlobe2-chain.mjs`, occluder/diff one-liners, `g2-*.png` crops.
