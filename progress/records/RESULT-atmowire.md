# RESULT-atmowire — atmowire1 vs PREREG-atmowire.md

**STATUS: SCORED. Run 1 (2026-08-05 22:17–22:20) = CAPTURE VOID by its own runner gate
(§VOID-1, stands). Re-run (2026-08-05 23:14–23:40, tree `be5c1da17ca5bad4` both chunks,
scored 2026-08-06 at the identical tree) = complete, 13 frames, all arms applied and
verified. VERDICT: NO SHIP — base-gate VOID (Q-W1 base 1.61 vs [2.5, 5.0]: the baseline
drifted under the queued seal, sky-side) + P-A3 UNSCOREABLE (KB-dense breached neither
registered gate) + both dose arms out of band anyway (CT40 28.96 vs [+8, +22] overshoot;
Q-CPX corridor breached at both doses). The MECHANISM is proven and banked: Q-DIR, Q-ORD,
Q-DOME, Q-NEAR, P-F4 (0 px ×3, sha256-identical), noise gate all PASS — the curve port is
correct, isolated to world pixels, and fully reversible. §2 C3's "P-A1 if neither" routes to
ONE successor re-seal; the measured three-point dose response puts s′ ≈ 0.65–0.70. Full
adjudication in §VERDICT below. The C1 seam stays in-tree (8591a20), inert at wire 0 —
proven again by this run's own restore identity.**

Executor: SKY (per §174 dispatch). Seal: `PREREG-atmowire.md` (SHADING's; authoritative).
Ownership flags per the seal: C1 shader seam = SHADING's files, C2 publisher line = SKY's
file, C3 fog-target dose = FX's file — every ship decision is the coordinator's.

## VOID-1 — run 1 adjudication (registered outcome: VOID with mechanism, not defended)

**What happened:** both chunks fataled at the runner's own W1 premise gate before any
capture: `_fogSynced at boot is undefined, expected false (side-door active)`. Chunk A
fataled, the loop proceeded to chunk B, which fataled identically; the runner released the
lock cleanly. Zero arms captured; `readback-{A,B}.json` hold the lever probes.

**The mechanism, diagnosed from committed source + the run's own readbacks:**

1. `ToonMaterial.js` has exactly THREE `_fogSynced` sites: the writer
   (`this._fogSynced = true` inside `setAtmosphere()`, :1403) and two falsy-readers
   (`if (!this._fogSynced)`, :1663 and :1766). **There is no constructor initializer — the
   field is `undefined` at every boot by design**, and the side-door runs precisely because
   `!undefined` is true. "Side-door active" is encoded in the tree as *falsy-until-first-
   `setAtmosphere`*, not as a literal `false`.
2. The runner's gate demanded the literal: `lever.fogSynced !== false → FATAL`. That check
   fails on every healthy boot of this tree — including a boot of the pre-seam shipped tree.
   The premise the gate meant to test was TRUE at both boots: the same lever readback shows
   `uHazeDensity 0.012215773 = max(fog.density 0.00469837 × 2.6, 0.004)` — the side-door's
   own arithmetic (ToonMaterial.js:1657 family), live on the page at probe time.
3. The coordinator's other two hypotheses are excluded by the same readbacks: not the seam
   (`hasWire true, wire 0`, all three published-param uniforms present, and the side-door
   arithmetic live — the seam at defaults changed nothing, as designed); not an interaction
   with the shipped skyswirl `uGraze` (Sky.js-only change; the probe's atmosphere values
   are ordinary for the boot tod, and nothing in the fatal path touches Sky).

**Verdict on run 1:** VOID by the runner's own gate, and the gate was wrong — the seal's W1
premise (side-door live, single `_fogSynced` writer ⇒ pokes durable) was satisfied. No
P-falsifier of the seal fired; no seal amendment is needed (the seal never demanded a
boot-time literal `false`; the runner invented it). §141 discipline: the instrument's
failure is reported as the instrument's failure.

**The corrected re-run needs exactly one change (runner-local, applied at
`atmowire1.mjs`):** the premise gate now (a) fatals only on a TRUTHY `_fogSynced` (a
publisher already ran = genuine premise break), and (b) asserts the side-door mechanism
positively — `uHazeDensity == max(fog.density × 2.6, 0.004)` within 1e-9 at boot (§143.1:
gate the mechanism, not a flag literal). Nothing else changed: same arms, same pokes, same
WBANDS scorer, same seam (already in-tree; the runner's idempotent apply verifies it
verbatim and skips).

**Note for P-F4 readers of the coming re-run:** the restore arm sets `_fogSynced = false`
explicitly while base leaves it `undefined`. Both are falsy; the side-door takes the same
branch with the same inputs, so restore-vs-base pixel identity is unaffected — the
readbacks will show `undefined` (serialized as absent) at base and `false` at restore, and
that difference is bookkeeping, not state.

## Provenance of run 1 (for the record)

- Seam applied inside the FIFO hold at 22:17:29: pre-seam tree `dfa198283676610f` → seamed
  `a8925573a9ec3ff6` (the tree had moved past the seal's diagnosis tree `3be168ae28832f69`
  via the skyswirl ship ace14f3 and other owners' commits — expected; the seal's base gates
  exist to arbitrate exactly this). Pristine copies: `atmowire1/*.pre-seam`.
- Seam anchors applied exactly-once, verified pre-launch on the live tree; the seam is the
  seal §2 C1 design verbatim (uniform decls in SLY_COMMON reach surface AND ink programs;
  `applyAerial`'s blend and haze-colour forms ported exactly; `setAtmosphere` accepts
  `heightFalloff`/`inscatter`/`tint`, inert while `uAtmoWire` is 0).
- Both boots: SwiftShader/ANGLE Vulkan; lever probes identical across chunks (as expected —
  same tree, same defaults).

## Re-run provenance (chunk A 23:14:42–23:23:09, chunk B 23:23:09–23:40:21 UTC, 2026-08-05)

- **Premise gate: RESOLVED exactly as §VOID-1 prescribed.** The corrected runner
  (`atmowire1.mjs:246-256`) fatals only on TRUTHY `_fogSynced` and positively asserts the
  side-door arithmetic; both boots passed it: lever `uHazeDensity 0.012215773002083015` =
  `max(fog.density 0.00469837423157039 × 2.6, 0.004)` to 1e-9, `wire 0`, `_fogSynced`
  absent-at-boot (serialized absent at dunes/hero base; `false` at every restore and at
  night.base, which inherits hero.restore's explicit write inside the shared chunk-B boot —
  both falsy, same branch, exactly the §VOID-1 bookkeeping note). Wired arms read back
  `_fogSynced true` + `uAtmoWire 1` + published params verbatim (density = fogAnchor.density,
  hf 54.619, ins 0.6764 at dunes); every poke `mismatch: false`.
- **Tree:** `srcTreeBefore == srcTreeAfter == be5c1da17ca5bad4` on BOTH chunks (§121.4), and
  the tree at scoring time is the same `be5c1da17ca5bad4` — capture and scoring share one
  tree. The seal's diagnosis tree was `3be168ae28832f69`; the drift between them is other
  owners' landed ships (incl. skyswirl ace14f3), which is what the base gates arbitrate —
  and this time they fired (below).
- **Determinism:** dunes.base = dunes.base2 = dunes.restore **sha256-identical**
  (89507427ea0f…), hero.base = hero.restore (07577e8b…), night.base = night.restore
  (8490cf10…). Noise gate trivially 0.00.
- **Scorer:** `node progress/records/fxcluster-diag.mjs WSCORE` (WBANDS = seal §3 verbatim,
  checked against the prereg line-by-line before running). Every load-bearing number was
  **re-derived independently** (second implementation, pillow/numpy, same registered
  conventions: half-open rects, upper median, Rec.709 on 0–255) and **reproduced to the
  digit** — the §122.1 hazard does not bite (medians and 0-px counts, not threshold counts).
- Chunk A booted with 289 s settle; stats at dunes: 272 draws / 1.62 M tris / 41 fps
  (all-pass column figures, not the scored main-view budget line — §130.3's distinction).
- The re-run's `run.log` was **not committed** (the b0adf2f sweep carried frames +
  readbacks; the log died with a container rollback). The readbacks + frames are the
  registered record; nothing in the seal gates on the log.
- Commit archaeology, for anyone repeating my first confusion: the C1 seam's sweep commit
  **8591a20's message names only goldlobe2** — the sweep bundled two staying scaffolds
  (uGlintSharp AND uAtmoWire) in one commit; `git log -S uAtmoWire` confirms it.

## §VERDICT — every registered quantity, measured beside its band (WSCORE + independent re-derivation)

### Base gates (registered VOID-not-FAIL) — **ONE FIRED → CAPTURE VOID as a candidate adjudication**

| gate | band | measured | reading |
|---|---|---|---|
| Q-W1 base | [2.5, 5.0] (sealed at 3.7/4.6) | **1.61** | **VOID — fired** |
| complex medL | [100, 120] | 109.8 | pass |
| nearGround medL | [70, 85] | 77.5 | pass |
| skyLeft medL | [156, 168] | 159.6 | pass |

The drift is **sky-side and specific**: pyrInterior 158.0 vs 158.1 at seal time (moved
≤ 0.1 L), skyLeft 161.8 → 159.6 (**−2.2 L**). The one intervening sky-side ship is
skyswirl **ace14f3** ("grazing skies dissolve to haze", Sky.js-only) — attribution by
elimination, not by an isolating arm. Two consequences, stated plainly: (1) the seal's W5
dose table was computed against a base separation of ~3.7 that no longer exists — the dose
arms below measured against a **worse** baseline; (2) the defect under repair **deepened
while the seal sat queued** (1.7-class → 1.61 clean-rect at a darker sky): the CRITIC-sbs2
dunes loss is now larger than when it was routed. Urgency up, not down.

### Falsifier checklist, in the seal's §4 order

| falsifier | condition | measured | fired? |
|---|---|---|---|
| P-A6 noise | \|Q-W1(base2)−Q-W1(base)\| ≤ 1.0 | 0.00 (bit-identical) | no |
| P-A5 dome | any arm \|Δ\| > 1.0 on 3 sky rects | max **0.1** (18 checks, 6 arms × 3) | no — world-only premise HELD |
| P-A4 restore | restore ≠ base | **0 px** ΣRGB≥4, ×3 chunks; sha256-identical | no |
| P-A3 KB-dense | passes the gates it must breach | complex 101.4 ≥ 70 AND \|Δnear\| 0.00 ≤ 4.0 | **YES → UNSCOREABLE** |
| P-A2 Q-DIR | wire-only fails to collapse separation | Q-W1(W) **−1.67** < +1.0 | no — curve port CORRECT |
| P-A1 dose | CT40 below +8 with Q-ORD intact | CT40 **above** +22 (28.96), Q-ORD intact | not in its written form; §2 C3's "P-A1 if neither" routes the successor (below) |

**P-A3's mechanism, from this run's own pixels (report-not-defend):** at 3× density the
mid-ground saturates *toward the haze colour*, and the CT40-family haze colour displays at
~100–130 (warm tan; KBdense pyr 130.0 ≈ blend→1 endpoint) — **above** the de-hazed complex
(70.4). So more density moves complex **up** through the corridor (Δ **−8.4**, shallow
side), not down through the 70 floor; and the nearGround rect sits close enough (≲ 15 m)
that even 3× density leaves blend ≈ 0 (Δ **0.00**). The arm is anything but subtle — pyr
−28.0 L, the whole far field floods tan (see dunes.KBdense.png) — the instrument *sees* the
known-bad (31 L from CT40 in the complex rect alone), but not through either registered
breach gate. The breach-direction prediction was wrong, not the capture. Successor note:
this run's own data says the ×3-density signature is **Δcomplex outside the corridor on the
shallow side**; a KB gate of "Δcomplex ∉ corridor (either side)" would have read correctly
here. §141 discipline: UNSCOREABLE is the registered outcome and it stands.

### Registered bands, dunes (chunk A) — measured beside band, all arms

| id | arm | quantity | band | measured | reading |
|---|---|---|---|---|---|
| Q-W1 | CT40 | skyLeft − pyrInterior medL | **[+8, +22]** | **+28.96** | **FAIL — overshoot (revert-not-defend)** |
| Q-W1b | CT55 | same | [+1, +9] | **+18.99** | OUT (bracket point; informs s′) |
| Q-ORD | — | base ≤ CT55 < CT40 | monotone | 1.61 ≤ 18.99 < 28.96 | **PASS** |
| Q-DIR | W (s 1.0) | Q-W1 | < +1.0 | **−1.67** (pyr 161.4 LIFTS above sky 159.7) | **PASS** — the two-lever theory on pixels |
| Q-CPX | W | Δcomplex; floor | [−35, −12]; ≥ 70 | −27.7; 82.1 | PASS |
| Q-CPX | CT55 | same | same | **−36.4**; 73.4 | **FAIL** (corridor, by 1.4) |
| Q-CPX | CT40 | same | same | **−39.4**; 70.4 | **FAIL** (corridor, by 4.4; floor by 0.4 only) |
| Q-NEAR | W / CT55 / CT40 | \|ΔnearGround\| | ≤ 4.0 | 0.96 / 1.72 / 2.04 | **PASS ×3** |
| Q-DOME | all 6 non-base arms | \|Δ\| skyTopLeft/Right/skyLeft | ≤ 1.0 each | max 0.1 | **PASS ×18** |
| KB-dense | wire+s0.40+dens×3 | breach Q-CPX floor or Q-NEAR | must breach | complex 101.4, Δnear 0.00 | **FAIL → P-A3** |
| P-F4 | restore | differing px vs base | [0, 0] | **0** | **PASS** (sha256-identical) |

Arm panel (medL): base/base2/restore sky 159.6 pyr 158.0 complex 109.8 near 77.5 · W sky
159.7 pyr 161.4 complex 82.1 near 76.6 · CT55 sky 159.6 pyr 140.6 complex 73.4 near 75.8 ·
CT40 sky 159.6 pyr 130.7 complex 70.4 near 75.5 · KBdense sky 159.6 pyr 130.0 complex 101.4
near 77.5.

### Q-SEAM (REPORTED honesty row, crop committed) — the port *improves* the horizon

Skyline strips x 1030–1150 (dome y 230–238 / world y 268–276): base step **2.2 L** →
CT55 **1.0** → CT40 **0.2**. The published curve converges the world to the dome's own haze
at the skyline — the seamless-horizon contract *fulfilled*, no dome `haze` co-move needed.
Crop: `atmowire1/crop-QSEAM-horizon.png` (rows base/CT55/CT40, 3×).

### Q-REG (REPORTED, chunk B) — declared §17 radius, one rect-name caveat

- **hero** (tod 0.79): far [200,300,900,600] Δ **−0.04** (47.3 → 47.3) — the framing is
  near-field, exactly the seal's ≤ 30 m claim. The executor's "skyCtrl" rect [340,2,700,50]
  moved **−26.51** (162.9 → 136.4) — **that rect is not dome sky in hero's framing**: it
  holds distant city blocks above the wall, hazed-to-cream at base (the pyramid defect's
  second instance) and de-hazed to legible grey-green structure at CT40. Treated world in a
  rect named as a control — the exact instrument lesson this seal recorded from Q-E1, biting
  a REPORTED row this time (it gates nothing; Q-DOME, which does gate, held ≤ 0.1 on real
  dome rects). Crop: `atmowire1/crop-QREG-hero-topband.png`. Look-wise it reads as depth
  restored, at full-dose magnitude; a shipping dose re-measures it.
- **night** (tod 0.02, night anchors): far Δ **−1.55** (23.7 → 22.2), skyCtrl Δ **0.00**.
  Visually near-indistinguishable (moon, sky field, structures unmoved) — the declared
  night-radius regression is mild at even this overshoot dose.

### What this run PROVES (banked, dose-independent — each internal to its own boot, so the base-gate drift does not touch them)

1. **The curve port is correct and complete** (Q-DIR): wire-only *inverts* the separation
   (−1.67; the pyramid lifts above its sky) — the seal's two-lever arithmetic ("more blend
   alone lifts the landform the wrong way") observed on pixels. P-A2 did not fire.
2. **Dose-response is monotone** (Q-ORD) with a measured three-point curve:
   s 1.00 → −1.67, s 0.55 → +18.99, s 0.40 → +28.96 (convex; ~−45.9 Q-W1 per unit s on the
   upper segment, −66.5 on the lower).
3. **The wire reaches only world pixels** (Q-DOME ≤ 0.1 across 18 checks) and **spares the
   near field** (Q-NEAR ≤ 2.04): scope exactly as designed.
4. **The seam scaffold is inert and the pokes are fully reversible** (P-F4 0 px ×3,
   sha256-identical; base2 bit-identical ⇒ deterministic boot).
5. **The horizon seam improves under the port** (2.2 → 0.2 L): no FX dome co-move owed.
6. **The look defect responds hugely at pixel level**: dunes pyramid separation 1.61 →
   18.99/28.96 against CRITIC-sbs2's ref-territory 21.4 — the mechanism can buy the whole
   gap; only the dose is wrong. Crop: `atmowire1/crop-QW1-pyramid-band.png`
   (base/W/CT55/CT40 — the base row's near-invisible pyramid is the routed defect, and the
   CT rows separate it). The collateral cost at these doses is also visible and measured:
   the mid-ground complex overshoots its declared de-haze corridor (−36.4/−39.4 vs
   [−35, −12]) and reads cold grey-slate against base's warm sandstone.

### VERDICT: NO SHIP from this capture. One successor re-seal licensed (§2 C3 "P-A1 if neither").

No arm passed its gates under any reading: CT40 overshot the decisive band (28.96 > +22)
and breached Q-CPX; CT55 — whose decisive-quantity value 18.99 *does* sit inside [+8, +22],
the strongest signal for where s′ lives — is OUT of its own registered Q-W1b [1, 9] and
breached Q-CPX (−36.4). On top: base-gate VOID and P-A3 UNSCOREABLE. Revert-not-defend =
nothing ships; nothing needs reverting (all arms were pokes; restore proven bit-identical;
the staying seam is inert).

**The successor re-seal owns** (one, per the seal's own limit; SHADING's to write):
- re-anchored base gates at the current tree (base Q-W1 ≈ 1.6 at skyLeft ≈ 159.6 —
  re-measure at seal time);
- s′ from THIS run's three measured points, not the refuted display model: interpolation
  puts **s′ ≈ 0.65–0.70** (predicted Q-W1 ≈ +12–14, Δcomplex ≈ −33…−35 — inside the old
  corridor but hugging its wall, so the corridor wants re-derivation against the new base,
  not inheritance);
- a KB gate the ×3-density arm actually crosses (this run measured its signature:
  Δcomplex −8.4, outside the corridor on the shallow side, near 0.00);
- Q-REG hero rects that separate dome from distant world (this run's crops locate both).

### Ship shape per this outcome (ownership flags per seal; the coordinator ships — nothing below is an instruction to edit today)

| candidate | owner / file | this outcome | would-be edit on a future PASS (for the record) |
|---|---|---|---|
| C1 shader seam | SHADING — `toon.glsl.js`, `ToonMaterial.js` | **STAYS as committed** (8591a20), inert at `uAtmoWire 0` — no edit | flip the `uAtmoWire` default 0.0 → 1.0 (`ToonMaterial.js:755`); `setAtmosphere` deliberately does not flip the wire |
| C2 publisher | SKY — `Sky.js` | **does NOT ship** (PASS-only per seal §2) | one call in the refresh path: `engine.get('shading')?.setAtmosphere({ color, density, heightFalloff, inscatter, tint, gain: 1.0 })` |
| C3 fog dose | FX — `Atmosphere.js` | **does NOT ship** | day-family `fogColor`/`fogTint` × s′ — **s′ unresolved by this run** (no arm in band); the successor seal resolves it from the measured response |

All three remain one coordinated commit, or none — unchanged from the seal's §5.

## Files

- `progress/records/atmowire1.mjs` — runner (corrected gate; header documents the fix)
- `progress/records/atmowire1/` — re-run frames `dunes.{base,base2,W,CT55,CT40,KBdense,restore}.png`,
  `hero.{base,CT40,restore}.png`, `night.{base,CT40,restore}.png`; `readback-A/B.json`
  (re-run lever probes + per-arm uniform readbacks), `seam-state.json`,
  `toon.glsl.js.pre-seam`, `ToonMaterial.js.pre-seam` (run-1 `run.log` was lost to a
  rollback before any sweep; the re-run's log was likewise never committed — readbacks +
  frames are the record)
- `progress/records/atmowire1/crop-QW1-pyramid-band.png`,
  `crop-QSEAM-horizon.png`, `crop-QREG-hero-topband.png` — verdict crops (scoring agent,
  2026-08-06; NEW, uncommitted — coordinator sweep)
- `progress/records/fxcluster-diag.mjs` — WSCORE amendment (WBANDS verbatim; seam strips
  validated against the sbs2 dunes skyline: soft segment x 1030-1150, base step 2.2 L)
- `progress/records/fxcluster-diag-out.json` — MODIFIED by the scoring run (WSCORE section
  written; coordinator sweep)
- `progress/records/RESULT-atmowire.md` — this file (verdict block written 2026-08-06 by
  the scoring agent)
- `src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js` — carry the C1 seam
  (STAYS per seal §6, fxcluster §1 pattern; inert at `uAtmoWire 0`; committed in 8591a20,
  whose message names only goldlobe2 — the sweep bundled both staying scaffolds)
