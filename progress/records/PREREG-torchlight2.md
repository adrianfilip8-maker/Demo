# PREREG-torchlight2 — same candidate bytes, honest instruments: seven emitters, one session, a candidate tree that cannot be HEAD

**Lane:** LIGHTING (second seal on the torchlight candidate; parent `PREREG-torchlight.md`,
diagnosis `RESULT-torchlight.md`, ledger §301). **Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/torchlight2/` does not exist at the
time of writing and no frame of any arm has been rendered.** Runner (`torchlight2.mjs`),
scorer (`torchlight2-score.mjs`) and the FAR-derivation tool (`torchlight2-far.mjs`, whose
printed numbers §5 quotes) are committed with this file, before the capture.

**What this seal is.** Run 4 was a VOID capture (PF3+PF4) that vindicated its own
instruments: the mechanism performed on every same-boot bar (pool +24.3 L / +92.4 R−B / 89%
warm, dose ×1.64, exact restore, exact null-recompile) and every failure traced to exactly
three instrument defects. This file re-registers those three instruments and NOTHING else:

1. **Candidate-tree independence** — v1 derived the cand arm from HEAD; HEAD now carries the
   registered fallback (`localToon: 0.0`, commit `1824ea2`). §3.
2. **One run = one session** — the manifest resume converted same-tree bars into
   cross-session bars and D1 caught it. §6.
3. **Seven emitters** — the interior staging's nearest-guard carried torch
   (`Guard.js:1479` `addLocalLight`) is a real seventh underground emitter; v1's slot table
   and F1 band were derived over six. §4 and §5.

The candidate bytes are IDENTICAL to the parent seal's (`f4056f4`). Every bar not named in
§7's table changes is **carried verbatim from PREREG-torchlight.md §5** and is cited, not
restated. ROIs (§3 there), the frozen-clock discipline, the §186 lock machinery with the
amended verify-at-lock-grant (§4 there, amendment block), PF1–PF6's shapes and the §7 look
declaration all carry. Where the parent seal says "HEAD", read "CAND" per §3 below.

## 1. Ownership and discipline

Unchanged from the parent (§ ownership disclosure there). This lane's src surface is the
three registered files, installed only inside the runner's lock window from git refs and
restored before release; no other `src/**` byte moves (§186), no src commit while any capture
runs (§296), bars sealed before candidate frames, no post-hoc threshold moves (§141.1),
fail-closed, `ringPainter` untouched.

## 2. The candidate — unchanged

The parent seal's §2 verbatim: one term, one gate (`slyWorldPos(...).y < -0.5`), one gain
(`TUNE.localToon: 2.5`), one cap (`SLY_LOCAL_CAP 1.6`), across
`src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js`, `src/render/Lighting.js`.
The exactness spellings (branch-untaken at 0.0; gated adds are exactly +0.0) carry.

## 3. Tree pins — the fix for defect 1

- **CAND = `f4056f4`** ("torchlight candidate: tomb sconces light the toon set").
  Its `src/` content hash, verified today by `git archive f4056f4 src` +
  `tools/treestate.mjs srcHash`: **`f9a77726b2a5ece0`** — byte-identical to every cand-boot
  row of run 4's manifest (`torchlight1-void-run4/`). Its `Lighting.js` carries
  `localToon: 2.5` (line 242), the value under test.
- **BASE = `926f0ee`** = `f4056f4^`, archive src hash `18a2e1e292b8ac2b` (= run 4's base
  rows). Its three files predate the term (no `localToon`, no `uLocalToon` anywhere).
- **Registered candidate diff:** `git diff --name-only 926f0ee..f4056f4 -- src/` is exactly
  the three §2 files. Verified today; the runner re-verifies at launch and aborts otherwise
  (PF6).
- **Carrier tree:** both arms boot TODAY'S HEAD tree with the three files swapped in from the
  refs above — boot A/A2 get `BASE:file`, boot B gets `CAND:file`, bytes exact (`gitRaw`, no
  trim), so the A/B delta is exactly the registered candidate diff and **HEAD's
  `localToon: 0.0` can never leak into any arm** (HEAD's `Lighting.js` is replaced in every
  boot). At seal time HEAD is `1824ea2` and
  `git diff --name-only f4056f4..HEAD -- src/` = exactly
  `{src/render/Lighting.js, src/render/PostFX.js}` (the registered fallback flip §301 + the
  shipped character-bloom gate §299). The runner requires exactly that set at launch — any
  other src landing between seal and launch is PF6-v2 (abort unscored, re-derive). This is
  the honest disclosure that v2 measures the candidate on today's carrier (which now includes
  the bloom gate on BOTH sides of the A/B), not on the 2026-08-12 tree.
- Runner argv is `BASE_SHA CAND_SHA` and the runner additionally pins them to the two shas
  above and to the CAND archive hash — a wrong operator argv aborts before any boot.

Expected per-boot src hashes are derived at launch from `git archive HEAD` plus the swapped
files (the parent's amendment machinery, carried): at seal time they compute to
base `ecac375018f22205`, cand `80ca393a9b620830`; the launch log prints the live values and
the manifest header records them; V4 scores against the manifest header.

## 4. The slot table — the fix for defect 3, part 1 (V1-v2)

**Mechanism, re-verified on today's tree.** `Lighting._buildLocalPool` allocates
`localCap.high = 6` slots; `_updateLocalLights` promotes the **6 nearest enabled emitters by
distance to the camera** (insertion sort on `distanceToSquared`, cull 68 m). Registered
underground emitters at the `interior` camera (3.2, −9.2, −60): the six sconces
(±4.35, −9.05, −62/−68/−74; `Props.js:583`, I 3.4, r 9, flicker 0.55, 0xffb060) **plus the
nearest guard's carried torch** — `Guard._registerLights` gives every non-scarab guard a
handle and `_updateSpill` enables exactly one, the camera-nearest, at
`g.position + forward·2.2 + (0, eyeHeight·0.55, 0)` with I 4.2·amp, r 8.5, flicker 0.12,
colour 0xfff0c2 (colPatrol; the tod-set snap at `Guard.js:1521` holds the interior's tod 0.5
day grade, so the night lerp is exactly 0). The camera-nearest guard at this staging is
roster #8, the heavy on `tomb_vault` (east aisle x ≈ 9.2, z −61.5..−74.5, `Patrol.js:376`) —
every other guard is ≥ 15 m away above ground.

**Camera distances** (handle positions): R−62 2.31, L−62 7.81, R−68 8.08, guard ≈ 8.9,
L−68 11.0, R−74 14.05, **L−74 15.94**. Seven emitters, six slots ⇒ the pool keeps the five
nearest sconces + the guard torch and **drops L−74 (−4.35, −9.05, −74), the camera-farthest**.
Run 4's readbacks show exactly this table in all three boots.

**Is the guard slot deterministic at the staged clock? NO — verified, and here is the
mechanism.** With `{dt:0}` staging, nothing advances after the FIRST `setShot` stops the rAF
loop (`Debug.js:131 stopLoop`); but between `engine.start()` (main.js) and that first call
the loop runs LIVE — a wall-clock window (page readiness polling, evaluate RTT) in which
guards walk their routes with live dt. From the committed patrol data (`buildRoutes(0x9a2d10)`
imported and evaluated offline): spawn stand `route.at(0.20)` = (9.110, −12, −64.123), yaw
−3.125 (facing south, mid-walk toward the u 0.4208 stop at z ≈ −67.0, dwell 1.54 s) ⇒ spawn
handle (9.073, ·, −66.322). Run 4 measured the slot at **(9.09, −8.78, −66.57)** in boots A
and B and **(9.09, −8.78, −66.62)** in boot A2: a live-window walk of 0.25–0.30 m with
**5 cm cross-boot scatter** — quantized by however many live frames each boot happened to
render. A position that depends on boot latency is not a registered constant, so per the
RESULT's disposition the slot is registered as the **fallback form**, not a 0.35 m ball:

> **V1-v2 (all six `interior` arms: base, base2, cand, null0, kbover, restore):** exactly
> 6 visible slots; **five** match the five promoted sconce handles {R−62, L−62, R−68, L−68,
> R−74} within 0.35 m each (the tolerance absorbs the deterministic phase-0 flicker wobble,
> ≤ 0.121 m/axis at flicker 0.55); **L−74 matches no slot** (it is the displaced one); the
> **sixth slot matches no sconce, has y < −0.5, and lies inside the tomb box**
> x ∈ [−15, 15], y ∈ [−12.5, −2], z ∈ [−79, −55] — the guard's carried torch, underground.
> Anything else ⇒ **VOID** (PF3). The slot's exact position is RECORDED per arm
> (calibrate-then-accept disclosure: run 4 put it at (9.09, −8.78, −66.6) ± 0.05) and its
> cross-boot delta is printed as the D1 attribution aid, but it is not gated to a point.

Two disclosed derivations that bound it anyway: (a) the patrol envelope of the handle —
x ∈ [6.75, 11.65] (route x 9.2 ± 0.22 jitter ± 2.2·|sin yaw| ± wobble), z ∈ [−76.95, −59.05],
y ∈ [−11.0, −8.5] — is what F2 (§5) leans on, and the measured slots sit inside it;
(b) "config B" — the guard walking far enough north that his handle exceeds L−74's 15.94 m
and HE is the dropped emitter (all six sconces promote) — needs an ~8 m walk in a sub-second
live window and is unreachable; if it ever appears, V1-v2 reads it as "sixth slot matches a
sconce = L−74 present" ⇒ VOID, not an alternate pass (PF8). One honest anomaly, recorded:
the measured handle y −8.78 is 2.16 m above the floor-standing arithmetic
(−12 + 1.92·0.55 = −10.94); nothing in this seal depends on which is right (both are inside
the envelope and both are ≥ 11 m from every FAR surface — §5), but the tomb guard's actual
stand height is flagged for the STAGING lane alongside the RESULT's "does a guard belong in
the tomb at all" routing.

## 5. F1 re-derived — the fix for defect 3, part 2 (arithmetic over seven emitters, stated in full)

**Method** (`torchlight2-far.mjs`, committed with this seal; run it to reproduce every number
below). Ray-trace the registered FAR ROI [380, 30, 560, 120] from the shipped interior camera
(pos (3.2, −9.2, −60), target (−1.5, −11.5, −74), fov 52, 1280×720) against the committed
vault geometry (`EgyptLevel.js` L.tomb {x ±14, z −78..−56, floor −12, ceil −2}: wall inner
faces x ±12.1 / z −76.1, ceiling underside −2.85, piers 2.2² at (±5.5, −62/−68/−74) rising to
−3.2, beams, sarcophagus). For each surface point, evaluate the candidate term per emitter
exactly as the shader does: `radiance = colorLin · I · att(d) · max(0, N·L)` with three
r185's `att = (1/d²)·(1−(d/r)⁴)²` clamped (decay 2, **exactly 0 at d ≥ r**), then
`add_lin = albedo_ch · min(Σ radiance_ch · 2.5, 1.6)`. No occlusion term on either side —
the shader has none (point lights cast no shadows here, parent §7).

**What the FAR ROI actually sees** (the parent's error, named): 83% of the rect is the
**west −74 pier's upper shaft** — south face (z −72.9, 54%) and east face (x −4.4, 29%) at
y −6.8..−4.7 — and 17% is north wall (z −76.1, x −9.05..−4.14, y −6.33..−4.35). The parent
derived F1 as if the band were all far wall "≥ 7.3 m from every sconce"; a pier face 6–8 m
from a promoted sconce, square-on, stands in it. Its measured warm lift was **legitimate
candidate light on tomb stone** — the exact thing the dispatch asked for — landing in a rect
whose band was sized for ambient.

**Per-emitter decomposition over the ROI** (worst case: per-channel albedo (0.50, 0.45,
0.40), flicker amp 1.385 = 1 + 0.55·0.7, each emitter moved 0.13 m — its max wobble — toward
the surface):

| emitter | ROI-mean Y_lin add | note |
|---|---|---|
| **L−68** (−4.35, −9.05, −68) | **0.02669** | the only promoted emitter that reaches; square-on to the pier south face at 6–8 m |
| L−74 (dropped) | (0.01548) | mounted ON that pier — absent from the promoted set; its absence is why config B would break this table (PF8) |
| R−74 and all others | 0.00000 | ≥ radius or back-facing |
| **guard torch, entire patrol envelope** | **0.00000 exactly** | min distance envelope→ROI surface = **11.14 m ≥ its 8.5 m radius** (fine grid over x [6.75, 11.65] × y [−11, −8.5] × z [−76.95, −59.05]); run 4's measured slot: 15.04 m. Three's cutoff makes this an exact zero, not a small number |

So the arithmetic says: **the guard's torch cannot warm the FAR ROI from anywhere his patrol
permits** — the widening is owed to the SCONCES' legitimate reach into the pier half of the
rect, which v1 never modelled. The guard's torch legitimately warms only east-aisle surfaces
(floor, pier east faces, east wall), all of which project screen-right of the ROI.

**Display conversion, registered before any v2 frame.** Linear→display slope for the L band:
S_L = 170 display-L per unit linear luma — the ceiling of the parent's own model family
(its pool model 0.19 lin → +15..25 display implies 79–132; its far figure implies ~165;
run 4's POOL measured 128–162). Channel split for the R−B band: run 4's POOL — a
calibration measured on a DIFFERENT rect for a different bar, disclosed here per the
RESULT's calibrate-then-accept convention — showed Δ(R−B)/ΔL = 92.4/24.3 = **3.80** through
the real grade (the naive equal-slope model gives only 1.66; the tomb's cool base splits the
channel slopes). Registered K_RB = 800 ≈ 3.80 · 162 · 1.3 margin, display-(R−B) per unit
linear luma.

**The registered bands** (ceilings 170·0.02669 = 4.54 and 800·0.02669 = 21.4, rounded out;
lower edges carried from the parent — drops stay legal):

> **F1 (FAR [380, 30, 560, 120]):** ΔmeanL (cand − base) ∈ **[−8, +5.0]** ∧
> Δmean(R−B) ∈ **[−8, +22]**.
>
> **F1b (FAR-N [480, 30, 560, 120]) — the ambient claim the dispatch actually made:** the
> maximal right-aligned sub-rect of FAR in which EVERY column's worst-case add is
> < 0.1 display L (the lit pier south face exits the columns by px 480; what remains — pier
> east face, grazing, plus the whole north-wall band ≥ 9 m from every promoted emitter — has
> arithmetic ceiling ΔL ≤ 0.06, ΔR−B ≤ 0.30). Band: ΔmeanL ∈ **[−8, +1.0]** ∧
> Δmean(R−B) ∈ **[−8, +2.0]** (the top pads the ~0 ceiling against the model's named blind
> spots — see the dry-run disclosure below; a real ambient lift fails it). "Far-ambient
> drops **or holds**" is scored HERE.
>
> **F2 (validity for F1/F1b):** the guard-torch slot recorded in each interior arm must sit
> **≥ 8.5 m** (its radius) from every FAR surface point (grid exported by
> `torchlight2-far.mjs`; scorer recomputes it from the same constants). Nearer ⇒ the bands
> above were derived for a configuration that did not stage ⇒ **VOID**, re-run. Expected
> margin ≈ +2.6 m (envelope) / +6.5 m (measured run 4).

**Instrument dry-run, disclosed (before any v2 frame exists; run 4's ARCHIVED void frames,
same candidate bytes).** The committed v2 scorer, pointed at `torchlight1-void-run4/`,
measures: V1-v2 PASS on all six interior arms (exactly the §4 table; guard stand delta
A2-vs-A 5.0 cm printed by the attribution aid), F2 = 15.04 m, F1 = +2.24 / +12.06 — inside
the bands above, which were derived from the geometry arithmetic without these numbers —
and F1b = **+0.27 / +1.39**, i.e. ~4.5× the axis-aligned arithmetic ceiling. The model's
named blind spots are that size, not zero: masonry batter/chip relief versus flat faces,
FXAA bleed across the lit-pier boundary at px ≈ 474–480, and grade nonlinearity at the dark
operating point. The registered F1b top is therefore set at ~1.4–3.7× that archived evidence
(+1.0 L / +2.0 R−B), not at the bare arithmetic; the FULL-FAR warm signal is 6–9× larger, so
a real ambient lift still fails F1b cleanly. D1/B-bars/N1/V4 correctly FAIL/VOID on that
foreign manifest — the §7/§8 cascade fires as registered.

**Forecast, written down:** at typical albedo (0.3) and phase-0 amps (0.97–1.15 measured in
run 4's readbacks), expected F1 ≈ ΔmeanL +1.5..+2.5, Δ(R−B) +7..+13 — bracketing run 4's
measured +2.24/+12.06 — and expected F1b ≈ +0.3 / +1.4 (the dry-run values, which a valid
one-session capture at the same bytes and staging should reproduce closely).
For the carried pool bars: the promoted set is 5 sconces + guard, so POOL loses L−74's
~4.7% side-light versus the parent's six-sconce model — noted, and swallowed whole by P1's
[+10, +80] and KO1's ratio form (same set at both gains). Run 4 measured POOL +24.3 in
exactly this configuration.

## 6. Arms and boots — the fix for defect 2 (runner `torchlight2.mjs`; frames → `progress/records/torchlight2/`)

Carried from the parent §4 (quality high, 1280×720, `setShot(name, {dt:0})` → `step(3,0)` →
`renderFrame(0)`, roster order, readbacks per arm, the amended install machinery: src clean
at launch AND at every lock grant, expected hash verified under the lock BEFORE vite spawns,
abort restores the checkout) with these registered changes:

1. **ONE RUN = ONE SESSION.** Fresh out-dir `progress/records/torchlight2/`. If it exists
   non-empty at launch the runner ABORTS and tells the operator to archive it. There is no
   manifest resume of any kind: a killed run is re-launched from an archived-empty state and
   re-runs ALL its boots. All boots happen in one process lifetime or the capture is void by
   construction.
2. **Both sides install from refs** (§3): boot A and A2 install the three files at BASE,
   boot B installs them at CAND; `onReleasing` restores HEAD after every boot. PF5 recovery
   is unchanged (`git checkout HEAD -- <the three files>`).
3. **Warm-up boot 0** (new, disclosed): before boot A, one full boot of the untouched HEAD
   tree that captures NOTHING. Run 4's odd boot was the first after a container restart —
   a cold boot's longer live window is exactly the §4 guard-stand quantizer, and a cold
   SwiftShader also pays first-compile costs inside the measured boots. One throwaway boot
   makes A/A2/B uniformly warm for ~4 minutes of wall clock. It installs nothing and
   captures nothing; it still requires src/ clean at its lock grant.
4. **Attribution columns**: every manifest row records its capture `ordinal` within the boot
   and an ISO timestamp, so a D1 failure can be split between §296-f3-style sag (ordinal- or
   time-shaped, global) and the guard stand (slot delta, local) mechanically. The manifest
   header records BASE/CAND/HEAD shas, the expected per-boot hashes, and launch time.

Boot order and shots, as v1: **A** (base, 16 shots) → **A2** (base, `interior` + `hero`) →
**B** (cand, 16 shots; while `interior` is staged: poke `debug.localToon` 0 → `null0`, 6.0 →
`kbover`, 2.5 → `restore`, then clear).

## 7. Registered bars (scored by `torchlight2-score.mjs` through `tools/gate.mjs`; VOID is not PASS; ship = every row PASS)

Carried **verbatim** from PREREG-torchlight.md §5: **BG1** (base gates), **D1** (boot A2 vs
boot A, `interior` + `hero`, [0,0] each, else PF4 voids every cross-boot [0,0] bar),
**P1** [+10, +80], **P2** (ΔR−B ≥ +12 ∧ warm% ≥ 35), **B1–B15** ([0,0] each), **N1** ([0,0],
cross-boot), **R1** ([0,0], within-boot), **KO1** (≥ 1.35× ∧ ≥ +5 L), **V2** (daylight cand
arms read uLocalToon 2.5), **V3** (18 base-side rows read uLocalToon null), **V4** (one src
hash per side, differing — scored against the manifest header's expected hashes).

Changed/new rows, registered here:

| id | quantity | band |
|---|---|---|
| **V1-v2** | slot table on all six interior arms, per §4 | 5 promoted sconces @0.35 m + L−74 absent + 1 no-match slot (y < −0.5, tomb box) — else **VOID** |
| **F1** | FAR ΔmeanL ∧ Δ(R−B) | **[−8, +5.0]** ∧ **[−8, +22]** (§5 derivation) |
| **F1b** | FAR-N [480, 30, 560, 120] ΔmeanL ∧ Δ(R−B) | **[−8, +1.0]** ∧ **[−8, +2.0]** — the ambient holds-or-drops claim |
| **F2** | guard slot distance to every FAR surface point | **≥ 8.5 m** — else F1/F1b **VOID** |

## 8. Falsifiers — revert, do not defend

**PF1–PF5** carried verbatim from the parent §6 (PF1 now includes F1b in its list; PF3 now
reads "BG1, V1-v2 or F2 out ⇒ capture VOID, re-run after diagnosis"). Changed/new:

- **PF6-v2** — `git diff --name-only BASE..CAND -- src/` ≠ exactly the three §2 files, or
  argv shas ≠ the §3 pins, or CAND's archive hash ≠ `f9a77726b2a5ece0`, or CAND's
  `Lighting.js` lacks `localToon: 2.5`, or `git diff --name-only CAND..HEAD -- src/` ≠
  exactly {Lighting.js, PostFX.js} ⇒ **abort before any boot**, unscored.
- **PF7** — out-dir exists non-empty at launch ⇒ **abort**: the operator archives it (e.g.
  `mv torchlight2 torchlight2-void-runN`) and relaunches. No resume, ever.
- **PF8** — the slot table shows six sconces (config B, guard beyond the pool) or any other
  non-registered table ⇒ VOID via V1-v2, not an alternate pass.

## 9. §17 look-change declaration

Carried from the parent §7, with one addition now REGISTERED instead of surprising: the west
−74 pier's upper shaft and the adjacent wall band warm by up to ~+5 display L mean over the
old FAR rect (§5) — sconce light landing on high stone is part of the intended look. The
ambient floor of the vault (F1b's rect) does not rise. Every non-interior canonical frame is
bit-identical (B1–B15), and the night braziers stay un-enrolled.

## 10. Expected outcome, written down in advance

**SHIP at 2.5.** Same-boot instruments all passed in run 4 at these exact candidate bytes;
the F1 family is now derived over the real geometry and all seven emitters; V1-v2 registers
the table run 4 actually staged three boots in a row. The honest uncertainty is D1 again —
cross-boot bit-identity on a SwiftShader recompile, now defended by one-session + warm-up +
attribution columns rather than assumed. If D1 fails, PF4 voids the cross-boot bars and the
manifest says which mechanism (sag vs stand) to fix next; the candidate neither ships nor
dies on a void — it re-runs. PF1/PF2 remain the registered no-ship reverts.

## 11. SCORING RECIPE (for the coordinator; exact commands)

The runner is DETACHED (`tools/launch.sh`; §298.3 rule). Do not wait on it interactively.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/torchlight2-run1.log` —
   the last line of a completed run is `DONE. Score with: node
   progress/records/torchlight2-score.mjs`. `ABORT`/`VOID` lines mean PF5/PF6/PF7 fired; the
   log says which and what to do. Liveness, if needed:
   `pgrep -f 'torchlight[2].mjs'` (bracket pattern) or check the pid in
   `/tmp/sands-of-ra/torch2run1.pid` against `/proc`.
2. **If the runner died mid-boot** (PF5): `git status` shows the three files modified ⇒
   `git checkout HEAD -- src/render/Lighting.js src/render/ToonMaterial.js
   src/render/shaders/toon.glsl.js`, archive the out-dir, relaunch.
3. **Score:** `cd /home/user/Demo && node progress/records/torchlight2-score.mjs`
   (exit 0 = every row PASS). It prints the tri-state table and the verdict line.
4. **Outcome branches** (write `RESULT-torchlight2.md` + a KNOWN_ISSUES § in every branch):
   - **PASS (ship):** in ONE commit, citing RESULT-torchlight2: flip
     `src/render/Lighting.js` `TUNE.localToon` 0.0 → 2.5 (delete the "AT THE FALLBACK"
     paragraph, keep the contract note) AND update `tests/torchlight.test.mjs`'s pin — the
     assertion at line ~111 whose message says exactly that it "moves to a nonzero value
     only alongside a PASS under PREREG-torchlight2" — to expect 2.5 (both the `TUNE` pin
     and the publish expectation `seen.at(-1)`/fallback-clear values 0.0 → 2.5). §296: do
     NOT commit while any capture holds or queues on the FIFO lock; take the post-queue
     window (§299's pattern). Run `node --test "tests/*.test.mjs"` (475 green) before the
     push. Critic r11 unblocks per §301.
   - **PF1** (P1/P2/F1/F1b/KO1 out on a valid capture): the value does not ship;
     `localToon` stays 0.0; record the finding. No retune toward a band.
   - **PF2** (any B-bar ≠ 0): stays 0.0 regardless of the interior; N1 attributes.
   - **PF3/PF8** (BG1/V1-v2/F2): VOID — diagnose from the recorded slots, archive the
     out-dir, re-run.
   - **PF4** (D1 ≠ 0): cross-boot bars VOID; use the ordinal/timestamp/slot columns to name
     the mechanism before any re-run.
5. The frames and manifest stay in `progress/records/torchlight2/` (archive as
   `torchlight2-void-runN/` on any VOID before relaunching — PF7 enforces this).
