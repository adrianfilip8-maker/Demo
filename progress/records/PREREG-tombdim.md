# PREREG-tombdim — the interior ambient hierarchy: the tomb goes dark so §303's pools can light it

**Lane:** LIGHTING/grade (critic r11 queue item 1, RESULT-critic11.md family 1's interior
re-read — "evenly lit lavender storeroom… pools of warm torchlight falling into deep violet
darkness"; parents in evidence: §303 the shipped pools, RESULT-twilight §300 the
no-new-coloured-fills lesson, Lighting.js's encloseStrength bracket, §261/§221 the floor
arithmetic). **Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/gradetrio1/` does not exist at
the time of writing and no frame of any arm has been rendered.** Runner
`progress/records/gradetrio/gradetrio.mjs` and scorer
`progress/records/gradetrio/tombdim-score.mjs` are committed with this file, before the
capture, together with the INERT mechanism (`TUNE.tombAmb: 1.0`, gate untaken) and its pin
test (`tests/tombdim.test.mjs`). The runner is SHARED with PREREG-goldenrake and
PREREG-nightfloor (one boot, one lock window, per-shot poke arms — the
fxghost/fxink/seamglint shape, 693681d); the three seals register, score and ship
INDEPENDENTLY — this file's verdict consumes only the rows named here.

## 0. What this seal is, and what it is licensed NOT to do

r11 re-scored `interior` 4 with §303's pool mechanism LIVE: the pool shipped into an
ambient that flattens it (RESULT-critic11 §"Comparison"). The mechanism chain is already in
the record, measured:

- The tomb's light is the SUN's: `_refreshShadowColor` scales the shadow light by
  `floor × lum(uKeyColor) × uKeyIntensity`, and `interior` runs the game's brightest key
  (tod 0.5, ×4.05, keyLum 3.642) — it is the ONLY shot the `shadowTintPeak` cap still
  binds (§261: k asked 5.100, used 3.742). Twelve metres underground, that floor IS the
  lighting (Lighting.js encloseStrength note), plus the midday sky fill
  (`uAmbIntensity` 0.586).
- The fill half alone is proven insufficient: the encloseStrength bracket cut hemi ×10 and
  moved the tomb floor 14% while the pool:floor ratio got WORSE. The missing half is the
  floor, and `ToonMaterial` is its named owner.
- §300 (twilight): recoloured ambients tint lit and shade alike and REDUCE dispersion.
  This seal therefore adds NO colour anywhere: it REDUCES the existing ambient family and
  lets the already-shipped warm pools (localToon 2.5, §303) and the gold's own material
  carry the warm side of §2.2's tension.

The lever: **`TUNE.tombAmb`** (ToonMaterial.js) multiplies the ambient family — the
published `ambient.intensity` on arrival in `setKeyLight` AND the floor feeding
`_refreshShadowColor`'s k — scoped by CAMERA height: weight = smoothstep(−0.5, −2.5,
camera.y). §8.1's only space below y −0.5 is the tomb; the staged interior camera sits at
y −9.2 (weight exactly 1, factor == tombAmb exactly by the registered `x + 0` spelling);
all fifteen other canonical cameras sit at y ≥ 1.15 (weight exactly 0 — the `camY < −0.5`
branch is untaken and the factor is exactly 1, so their frames are bit-identical BY
CONSTRUCTION and bar-verified below). The pools (uLocalToon term), emissive, rim and spec
are untouched. What this seal does NOT claim: any change to the pool's own radiance
(that shipped in §303), any new fill colour (§300), or any daylight/night pixel.

Underground at night (non-canonical) the dim COMPOUNDS the nightfloor lift by registered
order (night lift first, then the dim — `_refreshShadowColor`'s comment): a night-time
tomb stays dim.

## 1. Ownership and discipline

This lane's src surface for this seal is ONE file (`src/render/ToonMaterial.js`) plus its
pin test, committed INERT (bit-identical at the default; the pin test proves the spelling)
before any frame. **The capture installs nothing**: HEAD is the tree, and the arms are
`debug.tombAmb` pokes — recomputed per publish, so poke/restore are exact by construction
(pinned). No live-value src commit while any capture runs or queues (§296); bars sealed
and pushed before any candidate frame; no post-hoc threshold moves (§141.1); fail-closed
tri-state via `tools/gate.mjs`; `ringPainter` untouched; runner launched detached via
`tools/launch.sh` (§298.3). **Sequencing disclosure (§296):** at seal time the FIFO holds
redkey then fxartifact, whose runners pin launch-time whole-src hashes — so this trio's
single commit (three inert mechanisms + seals) lands only AFTER both runs release, and all
three launches follow the commit; nothing renders before the seal is pushed.

## 2. The candidate

One TUNE key, one per-publish factor, two consumers — `src/render/ToonMaterial.js` only:

- `TUNE.tombAmb` (default **1.0**): gate spelled `tombAmb < 1` — at 1.0 the block is
  UNTAKEN (the keySatMax standard). Below 1, a second gate `camY < −0.5` keeps every
  above-ground publish arithmetic-free.
- In-branch factor `f = tombAmb + (1 − tombAmb) × (1 − w)`, w = smoothstep(−0.5, −2.5,
  camY) — at the staged tomb camera w == 1 and f == tombAmb EXACTLY (x + 0), so the
  scorer asserts `uAmbIntensity(on) == uAmbIntensity(off) × 0.30` with equality.
- Consumers: `u.uAmbIntensity` (the toon fill — §221: the ONLY fill a toon surface sees)
  and `floorEff` in `_refreshShadowColor` (the shadow light's k). The dim releases the
  §261 cap: k asked drops 5.100 → 1.53, so the shadow light falls to ×0.409 of shipped
  (not ×0.30) — the model number the VB bar checks against readbacks.
- `debug.tombAmb` overrides live per publish (null = TUNE).

**Candidate value under test: 0.30.** Dose arm (`bko`): 0.15, `interior` only. Registered
fallback: 1.0 (mechanism stays, dim off).

Model (progress/records/gradetrio/gtmodel.mjs, validated per §4): at 0.30 the tomb's
ambient-OWNED class falls ×0.57–0.67 in display (the FAR/VAULT rects; the floor between
pools falls only by its ambient leg — D5), the darkness COOLS (B−max grows 6 → 12 —
violet darkness, from subtraction not addition), and pool-over-ambient display separation
grows (the pool's radiance is additive and untouched; the tone curve is concave).

## 3. Tree — HEAD, no install

HEAD at seal time carries the three gradetrio mechanisms inert (this commit). The runner
records the launch-time `git archive HEAD` src hash and requires every manifest row's
`treeState().src` to equal it (V4; per-capture stamps). PF6 launch pins: working src/
clean; `HEAD:src/render/ToonMaterial.js` carries `tombAmb: 1.0` + `debug?.tombAmb`
(a flipped default means a ship write landed and this seal is stale); roster = the 16
canonicals.

## 4. ROIs and statistics (registered; derived by looking at base-tree frames — the
shadowhold rule; bars use the off arm)

Display bytes; Rec.709 L; statistics as spelled once in `gradetrio-lib.mjs`.

| ROI | rect | derivation (fresh HEAD `interior.off`, redkey run 2 — pools LIVE) |
|---|---|---|
| FAR | [380, 30, 560, 120] | torchlight2-far's vault rect, carried by citation — ambient-owned: L 64.1, R−B −14.5 |
| VAULT | [560, 10, 900, 90] | second ambient-owned rect, upper vault: L 74.1, R−B −14.9 |
| POOL | [292, 432, 392, 490] | torchlight POOL, carried by citation — pool-owned: L 95.0, R−B +75.4 |
| CTRL | [150, 560, 520, 700] | floor between pools — at the shipped §303 state this is a pool+ambient MIX (L 84.8, R−B +35.9 warm; its r10 pre-pool value was L 73.4 cool), so it gates the floor-darkening direction (D5), not the ambient ratio |
| SARC | [600, 120, 840, 300] | the sarcophagus + dais (the §2.3 hero read): L 72.2 |

Derivation note, recorded before any candidate frame: the six §303 pools reach essentially
ALL floor visible from this camera (every visible floor point sits inside some sconce's
9 m radius), so there is no pool-free floor rect to gate ambient on — the ambient-owned
population is the UPPER WALLS/VAULT (FAR, VAULT: cool, R−B ≈ −15, matching torchlight3's
F1b "the vault's ambient floor does not rise"). D1/D4/KO gate there; the pool statistics
gate pool-vs-ambient separation (D2) and floor direction (D5).

Model derivation record: `scratchpad gtmodel` drives the REAL `evalAtmosphere` +
`Shading.setKeyLight` + the transcribed TOON_SHADE diff assembly through the validated
display chain (`tonecurve.mjs`, grey-row worst 0.35 L), and reproduces §261's clamp2 k
table 5/5 (hero 3.392, temple 3.560, dunes 2.639, interior capped 3.742, night 0.468)
before any candidate number is read off it. Its (b) rows: floor class off L 148.6 model
vs 61.8 measured (albedo/AO dilution ≈ ×0.55, band margins set accordingly); ratios at
0.30: ×0.67 (fill-lit floor) to ×0.63 (walls); cap-release shadow-light ratio 0.409.

## 5. Arms and the boot (shared runner `gradetrio.mjs`; frames → `progress/records/gradetrio1/`)

Carried mechanics from PREREG-redkey §5 verbatim where applicable: quality high, 1280×720,
`setShot(name, {dt:0})` → `step(3,0)` → `renderFrame(0)` staging (§251), roster order,
per-arm readbacks, PF7 fresh out-dir, no retries, no manifest resume. **ONE boot, HEAD
tree, no install.** All three levers are set to their defaults before the first staging
(uniform staging disclosure); every arm assigns ALL THREE levers (restore-first, the
fxartifact ARM shape), so `back` is the `off` assignment repeated and diff(off, back)
brackets every intervening poke of the shot.

Arms consumed by THIS seal, per shot: `off` (all defaults), `bon` (tombAmb 0.30),
`interior` only `bko` (0.15), `back`. The `con`/`cko`/`don`/`dko` arms between them belong
to the sibling seals; the shared R bar brackets them all. Captured arms across the trio:
16×5 + 3 = **83 frames**.

**Lock-hold price (§298.3): ~60–100 min** — one boot 6–9 min, 16 stagings ≈ 10–55 min
(redkey's run-2 stagings measured 15–50 s), 83 poke arms ≈ 35–55 min.

## 6. Registered bars (scored by `tombdim-score.mjs` through `tools/gate.mjs`; VOID is not
PASS; ship = every row PASS **and** the LOOK gate §8)

| id | quantity | band |
|---|---|---|
| **R1–R16** (`R_<shot>`) | diff(`off`, `back`) decoded differing px | **[0,0]** each — nonzero VOIDs that shot's rows for all three seals (PF4) |
| **B_<shot>** ×15 | diff(`off`, `bon`) decoded differing px, every non-interior shot | **[0,0]** each — the above-ground factor-is-1 claim, same-boot |
| **BG_b** | off-arm gates: POOL meanRB ≥ +40 ∧ POOL meanL ∈ [75, 115] (the §303 pools LIVE) ∧ FAR meanL ∈ [45, 85] ∧ FAR meanRB ≤ −5 ∧ CTRL meanL ∈ [65, 105] | in → else **VOID** (staging/tree not the diagnosed one) |
| **D1** | ambient dims: FAR meanL ratio (`bon`/`off`) ∈ [0.42, 0.82] ∧ VAULT ratio ∈ [0.42, 0.85] | both |
| **D2** | pool separation S = POOL−FAR: S(`bon`) ≥ S(`off`) + 6 ∧ ≥ 1.15 × S(`off`) | both |
| **D3** | SARC retention meanL(`bon`)/meanL(`off`) ≥ 0.55 (prominence over FAR reported) | in |
| **D4** | FAR ΔmeanRB (`bon` − `off`) ∈ [−30, +2] ∧ FAR meanRB(`bon`) ≤ −10 | in — the darkness must not WARM (§300 watched) |
| **D5** | CTRL ΔmeanL (`bon` − `off`) ∈ [−34, −3] | in — the darkening reaches the floor's ambient leg |
| **KO_b** | FAR ratio(`bko`) ≤ FAR ratio(`bon`) − 0.08 | dose monotone |
| **VB** | readbacks: echoes 1.0/0.30/0.15; interior `tombF` == 0.30 exact, camY < −2.5, uAmbIntensity(bon) == off × 0.30 exact, uShadowColor lum ratio ∈ [0.38, 0.44] (cap release); non-interior rows: tombF == 1 ∧ uAmbIntensity/uShadowColor triples == off exactly | else **VOID** |
| **V4** | 83 rows, ONE src hash == the launch-derived HEAD archive hash | else **VOID** |
| **LOOK** | binding looking at §8's crops | a look failure is **NO-SHIP** regardless of bars |

Fail-closed gating: D1–D5/KO_b are VOID unless `R_interior` ∧ BG_b PASSED; each `B_<shot>`
VOID unless its `R_<shot>` PASSED; KO_b VOID unless the bko row exists.

## 7. Falsifiers — revert, do not defend

- **PF1** — D1/D2/D3/D4/D5/KO_b out of band on a valid capture ⇒ **no ship**: `TUNE.tombAmb`
  stays 1.0, finding recorded. No retune toward a band; a different dim is a different
  prereg.
- **PF2** — any B ≠ 0 (its R PASSED) ⇒ **no ship** regardless of the interior bars: the
  above-ground exactness (weight-0 branch) failed — a mechanism defect, not tuning.
- **PF3** — BG_b/VB/V4 out ⇒ capture **VOID**, diagnose from readbacks, archive
  (`gradetrio1-void-runN`), re-run.
- **PF4** — any R ≠ 0 ⇒ that shot's rows VOID for all three seals (within-boot sag would
  be a NEW finding — name it from ordinals/timestamps before any re-run).
- **PF5** — runner killed mid-boot ⇒ nothing installed, nothing to restore; archive the
  out-dir, relaunch.
- **PF6** — launch pins fail (dirty src, flipped default, roster drift) ⇒ abort unscored.
- **PF7** — out-dir exists non-empty ⇒ abort; archive; relaunch.

## 8. §17 look-change declaration and the LOOK gate crops (binding)

Intended change, `interior` only: the even lavender wash drops to a deep violet-teal
darkness (still transparent — §2.1.3's "read detail inside them" bounded by D1's 0.42
floor); the six sconce pools become the room's light; the sarcophagus gold under them
becomes the single brightest read (§2.3's "one hero read"); torch flames/bloom unchanged.
Every other canonical frame is bit-identical (B bars). Crops to look at, off vs bon:
full frame at 1×; POOL+CTRL band [80, 400, 1200, 710] at 2×; SARC [560, 80, 880, 340] at
2×. "The room reads as a cave with no legible walls" or "the props glow against dead
walls" (unpatched-material hierarchy risk, §0) are look failures — NO-SHIP.

## 9. Registered forecast (ledger entering 5/18)

**SHIP at 0.30.** Grounds: the mechanism chain is measured end-to-end in the record (§0);
the model reproduces the live k-table 5/5 and every band carries ≥ ×1.5 margin against its
model number; the poke lever class is 0-px-proven same-boot (§302/§303); the B bars rest
on an arithmetic identity (weight exactly 0), the strongest protection form this project
has. Honest uncertainties, named: (a) **the unpatched-material residue** — scene-light-lit
props (if any survive in the tomb) do not consume `uAmbIntensity` and will not dim; if the
LOOK gate reads "props glow against dead walls", that is NO-SHIP and routes to a
LIGHTING-side enclosure publish (the wired-but-inert `encloseStrength` path). (b) D2's +6
band assumes the pool's display gain grows on a darker base (concave tone curve) — if
bloom/FXAA couplings eat it, D2 FAILS and the finding is "the dim needs a pool-gain
partner seal" (PF1, recorded). (c) A B-bar failure would be a weight-gate surprise (PF2);
nothing in the spelling permits it. If the capture VOIDs, the candidate neither ships nor
dies — it re-runs.

## 10. SCORING RECIPE (for the coordinator; exact commands, every branch)

The runner is DETACHED (`tools/launch.sh`; §298.3). Do not wait on it interactively; the
FIFO may hold it behind other lanes.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/gradetrio-run1.log` — a
   completed run ends `DONE. Score with:` + the three scorer paths. `ABORT`/`VOID` lines
   mean PF5/PF6/PF7 fired; the log says which and what to do. Liveness:
   `pgrep -f 'gradetri[o].mjs'` or check `/tmp/sands-of-ra/gradetrio1.pid` against
   `/proc`.
2. **If the runner died mid-boot** (PF5): nothing was installed — verify `git status`
   shows src/ clean (a dirty tree is ANOTHER lane's residue: report, do not touch),
   archive the out-dir (`mv progress/records/gradetrio1
   progress/records/gradetrio1-void-runN`), relaunch:
   `bash tools/launch.sh progress/records/gradetrio/gradetrio.mjs
   /home/user/Demo/progress/records/logs/gradetrio-runN.log
   /tmp/sands-of-ra/gradetrio1.pid`.
3. **Score:** `cd /home/user/Demo && node progress/records/gradetrio/tombdim-score.mjs`
   (exit 0 = every row PASS). The sibling scorers run independently; a VOID in one seal's
   private bars does not touch the others.
4. **LOOK gate (binding, before any ship write):** open `progress/records/gradetrio1/
   interior.off.png` vs `interior.bon.png` at §8's crops; record the verdict prose in
   RESULT-tombdim.md.
5. **Outcome branches** (write RESULT-tombdim.md + a KNOWN_ISSUES § in every branch):
   - **PASS + LOOK pass (ship).** §296 first: confirm `/tmp/sands-of-ra/capture.lock`
     absent AND `/tmp/sands-of-ra/queue/` empty immediately before touching src. Then in
     ONE commit citing RESULT-tombdim:
     1. `src/render/ToonMaterial.js`: `TUNE.tombAmb` `1.0` → `0.30`; in the TUNE comment
        replace "Ships below 1.0 only on PREREG-tombdim's PASS; 1.0 is the registered
        fallback (mechanism stays, dim off)." with "SHIPPED at 0.30 per RESULT-tombdim.md
        — shared gradetrio one-boot poke A/B (above-ground protection [0,0] ×15, dim/pool
        -contrast/gold-retention green, cap-release ratio confirmed)." — keep the rest of
        the contract note intact.
     2. `tests/tombdim.test.mjs`: flip the first pin to `assert.equal(TUNE.tombAmb, 0.30,
        'shipped by RESULT-tombdim — a later seal moves this only with its own RESULT
        cited')`; in the "at 1.0 the gate is untaken" test construct
        `new Shading({ debug: { tombAmb: 1.0 }, ... })` where it relied on the default;
        update the null-falls-back assertion to expect the TUNE dim
        (`uAmbIntensity == 0.586 * 0.30`).
     Run `node --test "tests/*.test.mjs"` (the full suite green — 499+ after this trio's
     18 pins) before the push. Push `git push -u origin
     claude/sly-cooper-ancient-egypt-0koo0u`.
   - **PF1** (any D/KO FAIL on a valid capture): no ship; tombAmb stays 1.0; record the
     finding (a D2-only failure routes to "pool-gain partner seal" explicitly).
   - **PF2** (any B ≠ 0 with its R PASSED): no ship; mechanism defect — record WHICH shot
     leaked (readbacks say whether uAmbIntensity/uShadowColor moved) and fix under a new
     seal.
   - **PF3** (BG_b/VB/V4): VOID — diagnose from readbacks, archive, re-run.
   - **PF4** (any R ≠ 0): affected rows VOID for all three seals — name the mechanism
     from ordinals/timestamps before re-running.
6. Frames and manifest stay in `progress/records/gradetrio1/` (archive as
   `gradetrio1-void-runN/` on any VOID before relaunching — PF7 enforces this).
