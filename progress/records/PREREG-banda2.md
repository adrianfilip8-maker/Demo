# PREREG-banda2 — the banda successor: same day levers, the night collision closed by a named gate, KB-warmmud frame-recalibrated, warm share promoted to registered quantities

**Owner:** SHADING (`src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`).
**Date sealed:** 2026-08-05. **Status:** REGISTERED before capture. No `src/**` touched by
this seal or its capture; the candidate's src shape is defined below and ships only on a PASS
verdict, by the coordinator. Every number here is produced by the committed drift-guarded
instrument — `banda-diag.mjs` modes `state` / `cal2` (calibration from the predecessor's
committed `banda1/` frames) — or quoted from committed records. Src tree at sealing:
`3be168ae28832f69` (banda1 captured at `820ace395b9664ae`; the two intervening src commits —
goldlobe scaffold at `uGoldGlint 0.0`, fxcluster debug-gated seams — are both registered
look-inert at shipped defaults by their own seals' null/base arms; **the base gates below
arbitrate**, per P-F3).

**Inherited obligations, discharged into this design (RESULT-banda routing):**

- **(a) The 63-px night leak is localized and traced** — `banda2-nightleak.md`. One cluster,
  bbox (369,77)–(381,96), warm-ward (+R,−G/−B): the **`rooftop_run` guard** (Patrol.js
  ROSTER #7) standing on the roof parapet against the moon. Mechanism: `vSlySkin = 1.0` on
  **every** SkinnedMesh (ToonMaterial.js:1140), guards are SkinnedMesh (GuardModel.js:1896)
  with ToonMaterial-family materials (Guard.js:1088–1091), and `uSubjWarmShade` warms both
  shade lights on all of them (toon.glsl.js:436, 446–447). L2 eliminated by banda1's own
  readback: night `uShadowColor`/`uShadowColorLit` bit-identical to full float precision
  across base/AB/restore. The predecessor's P7 box assumed the skinned population was Sly;
  guards enter frames by **patrol timing, not staging** — so any box-scoped night gate is
  structurally unsound. This seal's night gate is **frame-wide** (§3).
- **(b) KB-warmmud recalibrated from frames, not the port.** The port predicted wall satP50
  drops of 40–55 %; the frames delivered **13.0 / 23.2 / 26.6 %** (`cal2`, banda1 arms, wall-
  body convention: body = L ≥ rect medL, sat ≥ 0.04). The gap is the §18-family error
  RESULT-banda named: the port's number is one clean texel's sat; the frame's body median
  mixes part-lit pixels, FXAA edge blends and AO gradients that dilute a relative sat drop
  ~2×. The KB signature is re-registered against the **frame anchors** (§6), which is what
  §141.1's calibration rule wanted all along.

---

## 1. What this candidate claims and does not claim (CRITIC-sbs2 alignment)

CRITIC-sbs2 §4.1: the warm half decides all three remaining Odyssey losses — hero beam now
232° (teal-cool, not violet) but **lit bible-sandstone is 0.75 % of the beam**; interior frame
warm share **fell to 7.2 % vs the ref's 31.0 %**. The goal is warm SHARE, not hue rotation.

What banda1 measured about these levers (all PASS, P-F4-clean boots): they warm the skinned
population's shade register (P1/P2), lift daylight shadow L (+4.4 on interior walls, −2.4 pp
hero <L40), hold the hue family — and **move frame warm share by ≈ nothing** (interior
−0.21 pp, hero −0.11 pp; `cal2`). This seal therefore:

- **Claims** the character-warm and shadow-transparency restoration (P1–P5, same bands the
  predecessor passed — re-verified on the current tree), with the collision guarantee now
  arithmetic (§3).
- **Registers warm share as gated quantities (W1–W3)** at the candidate's honest scale
  (must-not-regress + small-positive bands sized from banda1's measured arms), locking
  CRITIC's conventions (interior frame warm% base 7.52; hero beam litWarm 0.75 % —
  reproduced to the digit by `cal2`).
- **Does not claim the torch gap.** The un-claimed remainder to the ref's 31.0 % is
  ≈ 23.5 pp, and the `cal2` luma decomposition shows why it is not a grade lever: our warm
  pixels above L100 are 2.14 % of frame — the missing warm is **lit-area coverage** (sconce
  pool radius/energy → **FX**, enclosure → **LIGHTING**, staged night lights → **GEOMETRY**),
  exactly the seal-L-C/CRITIC routing. This file gives the next FX/LIGHTING candidate its
  scale: every +1 m² of torch-lit wall at L>40 warm-hue is measurable on W1's instrument.

## 2. The candidate — two carried levers plus the gate

- **L1 `subjWarmShade` 0.50 → 0.65** (unchanged from PREREG-banda; creamfix-anchored).
- **L2 `shadowTintPeak` 0.52 → 0.62** (unchanged; kUsed math re-verified on today's tree:
  day kAsked 3.37–5.10 vs maxK 3.139→3.744, night kAsked 0.4685 « either cap).
- **G — the night gate (the new term).** `uSubjWarmShade` becomes **published per frame** at
  the existing `nightAmount` consumer site: `setKeyLight` (ToonMaterial.js:1280–1287) already
  receives `nightAmount` from LIGHTING's payload (Lighting.js:1837) and consumes it for
  `setInkNight`. The gate adds, beside that consumer:

  ```
  TUNE.subjWarmShadeNightPin = 0.50   // the predecessor ship value: night keeps today's look
  u.uSubjWarmShade.value = lerp( TUNE.subjWarmShade, TUNE.subjWarmShadeNightPin, nightAmount )
  ```

  `nightAmount` is **exactly 1.000 at `night`/`guard` and exactly 0.000 at every other
  canonical shot** (`state` mode rows; ToonMaterial.js:1441's own record) — so the gate's
  output on every canonical shot is exactly one of two TUNE constants, and **a capture on the
  committed tree emulates the gated candidate exactly by poking the gate's per-shot output**:
  day arms poke subjW 0.65, the night arm pokes subjW **0.50**. No src edit is needed to
  produce the evidence; the src change ships only on PASS (TUNE value + pin + one publish
  line; the drift guard gains an assertion for the publish line at ship time).

**Named and rejected, so nobody spends an arm** (carried from PREREG-banda §3, still true on
today's tree): `shadowBounceMixLit` (measured dead); `shadowBounceMix` as a candidate (it is
the KB); `fillSkyMix` back-off (re-opens violet); `shadowFloor` raise (night's live knob);
`shadowWash` raise (albedo-independent coat); and **raising `shadowTintPeak` past 0.62 buys
almost nothing outside `interior`** — day kAsked 3.37–3.56 is already the binding limit at
0.62 on golden shots (floor-limited past ≈0.56), only interior (kAsked 5.10) has headroom,
and a 0.75 probe is a different look change than the one declared here.

## 3. The night claim, arithmetically justified — [0,0] FRAME-WIDE, not re-asserted

Registered: **P7-fw = night `ABg`-vs-`base`, same boot, differing px at ΣRGB ≥ 4, counted
over the whole 1280×720 frame = [0, 0].** No subject box — the leak proved box-scoped night
gates unsound (the skinned population is mobile). The [0,0] is arithmetic, from the localized
mechanism, term by term:

1. **L1's night path is pinned to base.** The leak's entire mechanism is
   `uSubjWarmShade × vSlySkin` (banda2-nightleak.md §3). The night arm pokes subjW = 0.50 =
   the base arm's value — the uniform is **numerically identical** to base, so every
   vSlySkin-scoped term is identical **on every skinned draw, wherever patrol timing put
   it** — no population enumeration needed, which is the point of frame-wide.
2. **L2's night path is cap-dead.** kAsked 0.4685 « maxK 3.744 at 0.62 — kUsed is the
   floor-limited value at either setting. Proven live, not just ported: banda1's
   readback-C.json prints night `uShadowColor` AND `uShadowColorLit` bit-identical to full
   float precision across base/AB/restore. This capture re-reads both per arm (P-F7 asserts).
3. **The boot is deterministic at equal uniforms.** banda1 measured restore-vs-base = **0 px
   on all five chunks** (P-F4 table in RESULT-banda) after the settle protocol — poking
   values back reproduces the frame bit-exactly within a settled boot.

1+2+3 ⇒ predicted night ABg-vs-base = 0 px frame-wide. Any nonzero px is a mechanism this
arithmetic does not cover ⇒ **P-F6 fires and the candidate does not ship on this seal**
(unchanged discipline). The smoke test already run and quoted in §4: `score2` on the
predecessor's frames scores its ungated AB **FAIL at 2,130 px** — the metric sees the failure
this gate must remove.

**Emulation-exactness guard (new, P-F7):** the runner reads the live per-frame night value
(`sh._inkNight`, the stored `setKeyLight(nightAmount)` — republished every frame from
LIGHTING's payload) at every shot after staging. It must print **exactly 1 at `night` and
exactly 0 at every day shot**; anything else and the poke-emulation is not the gate ⇒ that
chunk is VOID (not FAIL — the candidate was never actually tested).

## 4. Registered quantities — BANDS2, sealed (duplicated verbatim in `banda-diag.mjs score2`;
a mismatch voids the scoring, not the seal)

Conventions §122.1-stated: Rec.709 luma 0–255; b−r medians on coolskew L-filtered ROIs;
body = L ≥ rect medL with sat ≥ 0.04; differing px at ΣRGB ≥ 4; warm% = R > B+10 ∧ L > 40;
litWarm% = hue ∈ [15,60] ∧ L > 100 (CRITIC-sbs2's predicate). Arms: `base`, `A` (L1 only),
`B` (L2 only), `ABg` (the gate-emulated candidate: day 0.65/0.62, night 0.50/0.62),
`KBwarmmud`, `KBoverwarm`, `restore`.

**Base gates (P-F3, VOID not FAIL):** sly-closeup creamROI b−r ∈ [−28, −12], rings ∈
[+15, +35]; hero arch <L40 ∈ [30, 46]; interior wall medL ∈ [44, 58]. (banda1 rerun base
read −20 / +27 / 37.6 / 51.5–50.0 — the diagnosed staging.)

| id | quantity | band | anchor (banda1 measured) |
|---|---|---|---|
| P1 | creamROI b−r (A and ABg) | **[−58, −30]** | −45 |
| P1 | rings b−r (A and ABg) | **[+5, +45]** | +13 |
| P2 | tail body R−B (A and ABg) | **[−4, +18]** | +0.37/+0.46 |
| P3 | hero arch Δ<L40 pp (B and ABg) | **[−6.0, −0.5]** | −2.43/−2.42 |
| P4 | interior wall ΔmedL, both rects (B and ABg) | **[+1.0, +8.0]** | +4.36/+4.37 |
| P5 | wall-body hue, every non-KB arm, all wall rects | **[200, 246]** | 207–225 |
| **P7-fw** | **night ABg-vs-base Δpx, frame-wide** | **[0, 0]** | ungated AB scored 2,130 (63 off-box + 2,067) — must go to 0 |
| W1 | interior frame warm% Δpp (ABg vs base) | **[−0.5, +2.0]** | −0.21 (base 7.52; ref 31.0 quoted, not claimed) |
| W2 | hero arch warm% Δpp (ABg vs base) | **[−0.5, +2.0]** | −0.11 (base 9.08) |
| W3 | hero beam litWarm% Δpp (ABg vs base) | **[−0.2, +2.0]** | +0.01 (base 0.75 — CRITIC's digit reproduced) |
| P8 | combat figure warm% ratio ABg/base | **[0.85, 1.15]** | 1.00 |
| P-F4 | restore-vs-base Δpx, every chunk | **[0, 0]** | 0 on all five banda1 chunks |
| P-F5 | arm-A architecture invariance px (WALL-SHADOW box) | **[0, 0]** | 0 |

W1–W3 are **gated** (P-F1 applies), sized from the measured predecessor arms — they are
must-not-regress honesty gates, not warm-restoration claims; §1 states what would be
dishonest to band here and routes it. P6-style reporting stays in the table `score2` prints.

**Known-bad arms (§13/§141.1 — the metric must see both failure directions):**

- **KB-warmmud** (`shadowBounceMix`/`Lit` 0.20/0.20, **day shots only, NEVER at night** —
  it is the one arm that would move night, port +4.1° on pnightcal's own axis): must read as
  its own failure via **wall-body satP50 relative drop ≥ 10 % on ≥ 2 of 3 wall rects**
  (hero.beam, interior wall0/wall1). Frame-calibrated: KB anchors 13.0/23.2/26.6 %,
  candidate arms −1.2…+1.9 % — the 10 % line sits 1.3× below the weakest KB anchor and 5.3×
  above the strongest candidate movement (separation 6.8×). The port's 35 %-of-40–55 %
  prediction is retired per obligation (b).
- **KB-overwarm** (`subjWarmShade` 1.0, sly-closeup): TAIL-DARK rings b−r must fall **below
  +5** (banda1 measured −20 — the navy identity collapses; unchanged).
- Either KB failing to read as its own failure ⇒ **UNSCOREABLE** (P-F2), no verdict either way.

## 5. P-falsifiers — revert, do not defend

- **P-F1** any gated band (P1–P5, W1–W3, P8) outside on the ABg arm ⇒ candidate REVERTED.
  No post-hoc retune toward a band; a new value is a new prereg.
- **P-F2** a KB arm fails to read as its own failure ⇒ UNSCOREABLE.
- **P-F3** base gate out ⇒ capture VOID (tree/staging is not the diagnosed one).
- **P-F4** restore ≠ base (> 0 px at ΣRGB ≥ 4) on any chunk ⇒ every arm number in that boot
  void (banda1's voidA precedent; the settle protocol is in the runner).
- **P-F5** arm-A architecture invariance ≠ 0 px ⇒ FAIL (the `mix(x,y,0)` exactness pin).
- **P-F6** P7-fw ≠ 0 ⇒ candidate does not ship on this seal regardless of everything else.
- **P-F7** (new) live `nightAmount` readback ≠ exactly 1 at `night` or ≠ exactly 0 at a day
  shot ⇒ that chunk VOID — the gate-emulation premise (lerp endpoints only) failed, so the
  gated candidate was never actually on screen.

## 6. §17 look-change declaration

Day: identical to PREREG-banda §7 — L2 brightens every daylight cast-shadow/enclosure
register ~2–5 display L (the §2.1 transparency direction); L1 warms the skinned population's
shade register (Sly **and guards**, architecture bit-identical by construction and P-F5).
**Night: explicitly unchanged, by construction** — the gate pins night to today's shipped
0.50, so the predecessor's 2,067-px night warm-ward movement on Sly does NOT ship. That is a
deliberate scope cut, not a loss: night's palette is pnightcal's sealed territory and §2.2's
cool flip; a night-side subject-warm value is a separate art decision for a separate prereg.
Ships only through this A/B, lands with its own KNOWN_ISSUES entry quoting this file.

## 7. Capture plan (§163/§164 chunked; arms are live pokes; runner `banda2.mjs`)

Runner: `progress/records/banda2.mjs` — banda1.mjs template (idempotent per-chunk resume, own
FIFO lock hold per chunk via tools/harness.mjs → tools/lock.mjs, settle = 10 frozen frames +
throwaway capture after every setShot, per-arm poke → `_refreshShadowColor()` → step(1,0) →
readback → capture) **plus** the per-shot `_inkNight` readback (P-F7) and per-shot arm poke
tables (ABg's subjW differs by shot class — that is the gate emulation, §2). Frames land
incrementally at `progress/records/banda2/<shot>.<arm>.png` + `readback-<chunk>.json`.
Launched detached via `tools/launch.sh` (node at ppid 1 proven), ABSOLUTE log path
`progress/records/logs/banda2.log`, pidfile in the scratchpad. No git — coordinator sweeps.

Chunks, in order (night FIRST — it is the decider, ledger precedent):

- **N** `night`: base, ABg, restore (3 frames — P7-fw + P-F4 + P-F7).
- **A** `sly-closeup`: base, A, ABg, KBoverwarm, restore (5 — P1/P2/P-F5/KB-overwarm).
- **B1** `hero`: base, B, ABg, KBwarmmud, restore (5 — P3/P5/W2/W3/KB anchor).
- **B2** `interior`: base, B, ABg, KBwarmmud, restore (5 — P4/P5/W1/KB anchors).
- **D1** `temple`, **D2** `combat`: base, ABg, restore each (optional, lock permitting —
  P5 temple, P8 combat).

Scoring at first wake after DONE (§163.2):
`node progress/records/banda-diag.mjs score2 progress/records/banda2` → table verbatim into
`RESULT-banda2.md`. Verdict rule: PASS = every gated band in-band on ABg (and A/B where
scoped), both KBs reading as their own failures, P-F3–P-F7 clean, **P7-fw = 0**. Ship
decision is the coordinator's; the ship diff is the §2 src shape exactly.

## 8. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/banda2-nightleak.md` — obligation (a), sealed before this file.
- `progress/records/banda-diag.mjs` — extended with `cal2` + `score2` (BANDS2 verbatim;
  smoke test on banda1: P7-fw FAIL 2,130, all other rows PASS — the separation property).
- `progress/records/PREREG-banda2.md` — this file.
- `progress/records/banda2.mjs` — the runner (committed before capture).
- Then per capture chunk: `progress/records/banda2/*.png` + `readback-*.json`, and
  `progress/records/logs/banda2.log`.
- Scratchpad only: nightdiff.mjs, crops, smoke-test output.
