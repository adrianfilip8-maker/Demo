# PREREG — the queued "hull + kerb" item: recovered, split, one arm registered

Written 2026-08-05 against tree `ed1667a` (session checkout `47de8f1` + the coordinator's two
sweeps). No capture has run for this seal; the lock is held by fx22 (pid 24278, verified alive
against `/proc`) and nothing here queues until this file is committed. Every number below is
either measured in this session by a named instrument in this directory, or is explicitly
labelled a citation with its ledger section.

---

## 0. What the queued item actually is — and the part that cannot be recovered

**The exact queue wording is not recoverable from the tree.** The task list lives outside the
repo and rolls back with the container (§161 lost #18–#22 outright); no file in `progress/`,
`src/` or the ledger pairs the words "hull" and "kerb". What the record *does* support, each
half verified against the current tree in §1:

- **HULL** — Task #28's registered follow-up. The six-key prop hull was captured and
  **REJECTED** (§155.4); `HULL_KEYS` is an empty `Set` — dormant, not deleted — and the verdict
  at the site (`src/world/Props.js:111–134`) ends by naming the one thing worth one more arm:
  *"A `gold`-only gate is therefore worth one arm — but it is NOT shipped here … It needs its
  own prereg and its own capture."* **This file is that prereg** (§2).
- **KERB** — ambiguous among **three** referents that all carry the word, with three different
  states. §3 disposes of each with citations. Summary: the shader-floor lever is SHADING's and
  was closed NO SHIP at §69; the `guard` cyan line stands at "symptom absent, cause
  unattributed" (§152.4) with its one remaining attribution arm being SHADING's; the only
  open GEOMETRY thread is the §24.3 `hero` band's *moulding-radius* lever, which has never
  been registered — and it is **not armed here**. It gets a zero-cost liveness rider on this
  capture (§3.3) and arms only if the band is still alive on the tree that capture sees.

An honest reading of the pairing: both halves needed the same scarce thing — one capture
window — and were queued together for that reason. That is a reconstruction, not a record,
and nothing below depends on it.

## 1. Anchors: what the record claimed vs what the tree says today

| claim (source) | verified against tree | result |
|---|---|---|
| `Shading.applyOutlines()` has no call sites (§129.2, DIGEST) | grep `src/**` | **HOLDS** — defined `ToonMaterial.js:1207`, zero callers. (`Guard.js:1142` `_applyOutlines` is Guard's own method calling the per-mesh `outline()`, not the walker.) |
| AGENTS §2.1 requires hulls on "characters AND hero props" | `AGENTS.md:98–99` | **HOLDS** — never shipped for props (set is empty). |
| `HULL_KEYS` emptied after REJECT, dormant not deleted (§155.4) | `Props.js:135` `new Set()`; mechanism intact at `:574–586` | **HOLDS**, verdict recorded at site. |
| cloth `outline: 0` is a topology refusal | `Props.js:35–47` | **HOLDS** — open single-layer grid, shell backface-culled/occluded from every angle; weight was dead anyway (no call sites) and was zeroed so wiring the walker later cannot surface it. |
| 6-key price "+6 draws / +55,718 tris" (PREREG-propshull, tool dead) | **re-derived**: `hullgold-price.mjs` (new, this session) | **REPRODUCED EXACT** — 6-key sum 55,718. The dead `hullprice.mjs` and this instrument agree to the digit, and the §159-era `Props.js`/`Kit.js`/`EgyptLevel.js` edits did not move Props' merged counts. |
| hull is 2.5 px on PostFX's 1.5 px line (§132.5) | `ToonMaterial.js:548` `inkPx: 2.5`, `Outline.js:230` per-material `uThickness`; PostFX 1.5 px base per `Props.js:81` | **HOLDS** (PostFX figure is a documented citation, not re-measured here). |
| `rimShadowFloorArch` ships at no-op 0.55 (§69) | `ToonMaterial.js:533–536` | **HOLDS**, with the site comment pointing at PREREG-kerb. |
| kerb-band instrument calibration (PREREG-kerb: 1,691/1,692 causal, 1,704 non-causal) | **re-derived**: `kerbband2.mjs` (new, this session) | causal **1,691 EXACT** on `shots/rim2`, and lift p50 **110.9 = recorded 102.9 + 8** to the decimal. The 1,704 target's reference frame (`shots/bud34/`) no longer exists; the surviving different-run `shots/bud/hero.png` reads 1,680 — reported as a cross-check, **not** a calibration (§158.5: framing shares are not stable across trees). |
| REJECT landed on the canopic jars; P4 confirmed on the gilded Ra | `Props.js:338` pushes jars as **`'lime'`**; `Statues.js:432` adds the sun disc as **`'gold'`** | **DECISIVE FOR §2**: the rejected look and the confirmed gain sit on **different keys**. A gold-only gate removes the shell from the REJECT site entirely and keeps it exactly where P4 confirmed it earns its draw. Evidence gathered after unblinding (§155.4 said so) — which is why this is a prereg and an arm, not a ship. |
| propshull frames / kerb2 frames | `shots/` | **GONE** (§161 rollback). Verdicts survive in committed records; the two uninspected `kerbline` clusters (§155.5) died with the frames and can only be re-generated by a new capture. |

## 2. THE HULL ARM — gold-only `HULL_KEYS`, registered before any frame exists

### 2.1 The change

`src/world/Props.js:135`: `HULL_KEYS = new Set()` → `new Set(['gold'])`. One line, one
variable. The edit is made **only inside my own planted capture ticket** (§150.1 — the edit
itself becomes a lock-holder; §159.1: a per-arm-navigating harness re-reads the tree, so an
edit outside a held window can void a neighbour's arms, which is precisely what my §159-era
edits did to `tuftbias`).

### 2.2 Price, measured, against unchanged budgets — counted vs scored stated

**+1 draw / +11,972 tris** (`hullgold-price.mjs`, calibrated EXACT against the dead tool's
recorded 55,718 — a shell is its host's triangles drawn once more, so the price is exact by
construction, and identical on every canonical camera: these meshes are merged level-wide and
frustum culling removes none of them).

- Baseline **quoted from the SCORED main-view column**: 71 draws / 0.572 M tris — a
  **citation** (§153.1, measured live three times Aug 2–3, not by me; the counted
  `report.json` column has been misquoted against the budget five times — §130.3, §146.2,
  §149.4, §153.1, §155.6 — and is not used here for anything).
- Delta against limits: 72 / 250 draws (28.8 %), 0.584 M / 1.2 M tris (48.7 %). Even if the
  scored baseline drifted 50 % since Aug 3, headroom absorbs +1 / +12 k by two orders of
  magnitude. The per-arm `__GAME.stats` the runner prints are the **counted** column and are
  used only as an arm-to-arm sanity delta, never against 250 / 1.2 M.
- **§1.2 applies**: the 30 fps target does not raise these limits and is claimed as licence
  for nothing here.

### 2.3 Arms — one boot, dt pinned to 0, toggled by detach/attach

`base → base2 → hull → hull3x → restore` on the decisive shots. Detach/attach of
`userData.propsHull`-tagged shells, **never `.visible`** (`setOutlinesVisible` rewrites it
every frame via `beginNormalPass`/`endNormalPass` — §143, and `propshull.mjs` already
implements the stash/restore with moved-count printouts so an arm cannot silently no-op).

**`hull3x` is the §13 calibration arm, and it needs one new mechanic.** The ink material is
cached and **shared** by `(px|colour|opacity)` key (`ToonMaterial.js:1165–1176`), so poking
`uThickness` on the shared instance could thicken any same-key shell elsewhere (Sly's own
hull plausibly shares `thickness 1.0` defaults). The runner therefore **clones the material
onto the tagged shells once before the arm loop** and pokes `uThickness` 2.5 → 7.5 on the
clone for `hull3x` only, printing the readback per arm. A 7.5 px hull on a 1.5 px line is a
known-bad by construction: it MUST read as heavy/doubled. If `hull` and `hull3x` are
indistinguishable at the registered ROIs, the viewing condition cannot score this question
and the registered outcome is **UNSCOREABLE** (§141) — revert, no ship, no re-threshold.

Runner: derive `propshull2.mjs` from `progress/records/propshull.mjs` with exactly three
deltas — the material clone, the `hull3x` arm, and the §2.5 ride-alongs. Tree hash stamped
per arm (`srcTree` discipline, §160.5). Launch detached via `tools/launch.sh`; ticket via
`tools/lock.mjs` FIFO behind fx22 — never hand-created files in `/tmp/sands-of-ra/`
(§156.1/§161.4).

### 2.4 Shots and predictions — falsifiers revert, not defend

Shots: **`interior` decisive, `courtyard` collateral guard.** Carried forward from the
propshull addendum, registered again before frames: **a clean `courtyard` does not rescue a
null or dirty `interior`.**

- **P1** `base` vs `base2` = 0 px. Else the boot is noisy: **VOID**, nothing else is read.
- **P2** `restore` vs `base` = 0 px. Else the toggle is dirty: **VOID**.
- **P3** `hull` vs `base` diff confined to silhouette edges of `props_gold` meshes; zero
  changed pixels on surface interiors, and — new, free by construction — **zero changed
  pixels on the canopic jars** (`lime`, now shell-less). Broad-area change = mechanism broken:
  **VOID and revert**, not a negative result.
- **P4** the gilded Ra's sun disc regains the clean continuous dark ring §155.4 confirmed
  (same shell, same weight as the arm that produced it). If the ring is ABSENT the tree has
  moved under the recorded evidence since Aug 2: **VOID-AND-INVESTIGATE**, no ship — this
  prediction is not defended by pointing at the old record.
- **P5 (the question).** On both decisive shots, at 1:1 and 4× on named crops (Ra disc; the
  gold hook rings; any gold at grazing angle), the gold hull shows **none** of the three
  registered REJECT conditions: sticker edge, visible doubling against the PostFX line,
  grazing-angle crawl — **with `hull3x` beside it as the calibrated known-bad** and
  `crops/hull-obelisk-085-courtyard.png` (architecture at 0.85, one clean 2–3 px line) as the
  in-repo reference for what "sound at a nearby weight" looks like.

**Ship rule:** ACCEPT (`HULL_KEYS = {'gold'}` stays) iff P1–P4 clean AND P5 clean. Any P5
condition present → **REJECT: revert the one line to `new Set()`** and close the Task #28
lineage as *two widths tried, both dead — no third arm without new mechanism evidence*.
There is no "tune the thickness" middle outcome; a different weight is a different prereg.

### 2.5 Zero-cost ride-alongs (scored offline, no extra lock time)

`guard` and `night` ride as base/hull pairs exactly as the existing runner already captures
them; `hero` rides at `base` only (five frames total):

- **R1** `kerbline.mjs` scan of `guard`/`night`, both arms — re-generates the §155.5 cluster
  inspection that died with the frames, and answers for free whether the *gold* hull
  introduces anything at those junctions (the scanner's own documented dual purpose).
  Reporting language is fixed in advance: *"signature present at (coords)"* or *"not located
  in the regions inspected"* — never "not present in the frame", because the detector is
  width-blind by construction (§152.3).
- **R2** `kerbband2.mjs` non-causal count on `hero` `base` — the §3.3 liveness gate.

### 2.6 Reference imagery (new §1.1) — attempted, blocked, recorded

The optional real-Sly trim measurement was attempted this session: the agent proxy's gateway
answers **403 to CONNECT** for the candidate image hosts (riotpixels, mobygames, wikia,
upload.wikimedia.org — `recentRelayFailures` names the policy denial). No reference frame was
fetched; nothing was committed or shipped either way. P5's standard therefore rests on the
in-repo obelisk crop and the hull3x known-bad. If a later session holds reference frames in
the scratchpad, the §7.4 procedure applies and the measured quantity to extract is: **ink
line width ÷ subject screen height for architectural trim vs hero objects** — the hierarchy
this change claims to implement.

## 3. THE KERB HALF — disposition, by referent

### 3.1 The §24.3 `hero` band via the shader floor — SHADING's, closed, not reopened

`PREREG-kerb.md`'s sweep ran as `kerb2` and was closed **NO SHIP at §69**: the ladder
reproduced the seal's prediction (106.8 → 87.8 → 65.5 → 42.5 L), only `f10` clears V1's ≤ 45
gate, and on `night`'s own residual `f10` still reads 97.4 L "prominent" — *the floor moves
night's residual without owning it* (≈39 % of night's kerb rim arrives through the `1.0` leg
the floor cannot reach). The lever ships at its no-op 0.55 (`ToonMaterial.js:536`, verified).
**The file, the lever and any re-arm are SHADING's. I stop at the boundary** (AGENTS §3);
this section exists so the next reader does not route it to GEOMETRY again.

### 3.2 The `guard` cyan line — "symptom absent, cause unattributed" stands

State re-verified against the record: apron candidate **retired for `guard` on visibility
grounds without a capture** (§155.5 — no part of the apron is in the frame; the scored arris
lies buried inside the west temenos wall footprint); my crest/roll fix is real geometry
(16 → 0 strips, §157.2) and **falsified as the cause** by its own displacement control (dy=0
sits mid-distribution); candidate 2 (the camera framing error) remains best-evidenced with
the only matched coordinate (§152.1). The one remaining attribution arm is **candidate 3 on
this frame — SHADING's `uRimShadowFloorArch`/`norim` arm** (§152.5), which §156.2 confirmed
did not fall out of pnight1 for free. **Proposed to SHADING, not reached into.** GEOMETRY's
residue is exactly R1 above.

### 3.3 The §24.3 band's GEOMETRY lever — the only open kerb thread that is mine, gated, not armed

§24.3's own text names it: *"the band's world width scales with the moulding radius."* A
radius cut is a **look change** to the most deliberate edge treatment in the level — the same
chamfer/roll work whose key-catch lines §146.3 verified working — to shrink a band **both rim
gates pass correctly**. §157.4's precedent applies (a look change to a large visible surface
class, correctly not shipped unverified), and the band's liveness on the *current* tree is
unknown: last measured 1,704 (Aug 1 ~08:15 frame, now deleted); the surviving Aug 1 16:55
frame reads 1,680 by the calibrated instrument; the tree has since taken the chisel pass, the
Task #28 revert and the §159-era world edits.

**Registered gate on R2's count (bands partition [0,∞), chosen now as fractions of the 1,704
record — registered-arbitrary per §133.1):**

- **n ≤ 170** (≤ 10 %) *and* the 4× ROI crop shows no continuous cyan bar → the band died
  with the tree's evolution: **referent C closes**, no radius prereg, no window ever spent.
  (Both clauses required: PREREG-kerb measured that this count can read 0 while an obvious
  ~L132 bar is on screen — the crop rules, per the standing picture-over-statistic rule.)
- **170 < n < 850** → reduced: crops to the coordinator, judgement call whether a look-change
  arm is worth a contended window at all.
- **n ≥ 850** (≥ 50 %) → live: the radius arm gets **its own prereg**, which must contain
  (i) a retention condition on the intended key-catch arris line (§146.3's verified feature),
  (ii) a radius→0 hard-edge known-bad as its §13 calibration arm, (iii) the look-change
  declaration §17/§24.3 demand. Not sealed here; sealing a second arm against numbers this
  capture will produce would be registering after the fact.

### 3.4 `sliver.mjs` — no action

Its own header already carries the §142.1 correction (suspect generator, not a scorer; the
11,913 are mostly deliberate chamfers). The crest suspect it generated is fixed and
falsified as the `guard` cause (§157.2). Nothing further.

---

## 4. Files this seal touches, and when

| file | when | what |
|---|---|---|
| `progress/records/PREREG-hullkerb.md` | now | this seal |
| `progress/records/hullgold-price.mjs` | committed (`ed1667a`) | price re-derivation, calibrated EXACT |
| `progress/records/kerbband2.mjs` | committed (`ed1667a`) | §24.3 band instrument, calibrated on the causal record |
| `progress/records/propshull2.mjs` | at capture prep, before the ticket | runner: propshull.mjs + clone/`hull3x`/ride-alongs |
| `src/world/Props.js:135` | **only inside my planted ticket** | `new Set()` → `new Set(['gold'])`; reverted on REJECT |

The capture queues behind fx22 via `tools/lock.mjs` and launches detached via
`tools/launch.sh`. Durable outputs (arms.json, crops, the scored verdict) go under
`progress/records/` before any verdict is claimed — §161.1: the blast radius of a rollback
is fixed by what has been swept *before* the capture starts.
