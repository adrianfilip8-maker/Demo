# PREREG-guardart — the garrison into the art pipeline: §2.2 dress + the skin-index contract fix

**Lane:** GUARDS. **Parents:** DESIGN-guardpass.md (the probe evidence), RESULT-critic12
family 3 / RESULT-critic11 family 3, §291 (channel contract), §302/§303 (the one-boot poke
form). **Date sealed:** 2026-08-14.
**Status: REGISTERED before any capture. `progress/records/guardpass1/` does not exist at
the time of writing and no frame of any arm has been rendered.** Runner
(`progress/records/guardpass/guardpass.mjs`), shared lib (`guardpass-lib.mjs`) and scorer
(`guardart-score.mjs`) are committed with this file, before the capture.

## 1. Ownership and discipline

GUARDS' registered surface this seal: `src/ai/Guard.js`, `src/ai/CarmelitaGuard.js` (regions
metadata only), `tests/guardart.test.mjs`. **The capture installs nothing** — HEAD is the
tree; both mechanisms ship inert (`GUARD_TUNE.guardArt 0`, `guardSkin 0`, pin-tested) and the
arms are live pokes of `guards.TUNE` + `applyArt()`, each direction exactly reversible
(pure-function roundtrips pinned byte-exact in the suite). Bars sealed and pushed before any
frame; per-shot poke arms with back-validity ONLY (§302 — no cross-boot bar exists anywhere
in this seal; the off-arm ≡ HEAD identity is the recorded analytic premise, torchlight3 §4
form: at the defaults `applyArt()` touches no attribute, no material, no shell — the branch
is untaken in JS, stronger than a shader gate). No post-hoc threshold moves (§141.1);
fail-closed; `ringPainter` untouched; launch detached via `tools/launch.sh`; the FIFO
serializes with other lanes; no src commit while any capture runs or queues (§296).

## 2. The candidate

One switch, two levers, applied by `Guards.applyArt()` (DESIGN-guardpass §A carries the
full derivation; `GUARD_DRESS` in Guard.js is the palette table):

- `TUNE.guardSkin 1` — `shiftGuardSkin(geo, true)`: +1 on every skinIndex of the shared
  Carmelita geometry. The defect is measured and headless-reproducible (DESIGN §broken.3):
  `instantiate()` prepends `root`; the import indexed a root-less order; crown reads `neck`,
  hands `lowerArm`, hips `root`. Exact integers, flagged, reversible.
- `TUNE.guardArt 1` — `paintGuardRegions(geo, regions, GUARD_DRESS)`: the §2.2 dress into
  the vertex-colour channel (bronze/lapis on warm linen, jackal fur, lapis nemes over the
  hair mass, gold wesekh collar; ±5.5% deterministic jitter), the head block out of bronze
  lacquer (`[body, body]` material array — draw count unchanged), ink shell ensured
  (bookkept; restore removes only what it added).

Candidate arm `aon` = both levers (the shipping configuration). Attribution arm `askin`
(`guard` shot only) = guardSkin alone.

## 3. Arms and the boot (shared with PREREG-guardcone; runner `guardpass.mjs`)

One boot, HEAD tree, no install. Quality high, 1280×720, `setShot(name,{dt:0})` →
`step(3,0)` → `renderFrame(0)` staging (§251), roster order, no retries, no resume (PF7:
non-empty `progress/records/guardpass1/` at launch aborts).

Per canonical shot: stage once (NOT captured), then arms — each arm ASSIGNS the full lever
tuple (restore-first, the fxartifact ARM shape), settles `step(2,0)` + `renderFrame(0)`,
captures + readbacks + probe:

| arm | guardArt/guardSkin | cone tuple (PREREG-guardcone §2) | shots |
|---|---|---|---|
| `off` | 0 / 0 | defaults | all 16 |
| `askin` | 0 / 1 | defaults | `guard` only |
| `aon` | 1 / 1 | defaults | all 16 |
| `bon` | 0 / 0 | candidate | all 16 |
| `blamp` | 0 / 0 | candidate minus lamp (lampToon 0) | `guard` only |
| `abon` | 1 / 1 | candidate | all 16 |
| `back` | 0 / 0 | defaults | all 16 |

82 frames. The probe (every arm, every shot) records: per-guard projected body bbox, beam
footprint rect + apex/axis screen points, pool-ahead disc, spill-sphere rect; live TUNE and
uniform readbacks (`uConeShape`, `uGuardLampPos.w`, `uLocalToon`); on `guard` additionally
the crown-vertex dominant bone NAME through the live skeleton (the off-by-one measured in
frame), material names + `userData.sly`, shell presence/visibility, and a Hair_LP
colour-attribute sample. **Lock price ≈ 2–2.5 h** (16 stagings ≈ 55 min + 82 arms at
17–45 s + boot ~8 min), priced per §298.3.

## 4. Registered bars (scored by `guardart-score.mjs` through `tools/gate.mjs`; VOID is not PASS; ship = every gate row PASS + LOOK)

Statistics: display bytes, Rec.709 L, HSV S/hue as in gradetrio-lib; differing px = any
|Δ| ≥ 1 in R,G,B. "Subject bbox" = the probe's body bbox for the SHOT_POSE guard on `guard`;
"core" = that bbox eroded 15% per side. Hue bands: warm [15°, 60°], lapis [190°, 240°].

| id | quantity | band |
|---|---|---|
| **R_<shot>** ×16 | diff(`off`,`back`) differing px | **[0,0]** each — nonzero VOIDs that shot's blocks (PF4), fail-closed |
| **AV1** | probe, `guard`: crown bone = `neck` at `off` AND = `head` at `askin`/`aon`; toon material live (`userData.sly`) both slots; shell present+visible at `aon`; Hair sample ≈[1,1,1] at `off`, lapis-family at `aon` (LINEAR b > 0.22 ∧ b > 2r — lapis #1f4f96 lands ≈[0.014, 0.083, 0.303] linear, ±5.5% jitter) | all — else **VOID** |
| **AP1** | `guard.aon` core: mean S; share of px (S ≥ 0.06 ∧ hue ∈ warm∪lapis) | **≥ 0.12** ∧ **≥ 0.45** |
| **AP2** | `kaykit`: union of probe guard bboxes ≥6px wide: mean S `aon` vs `off` | **≥ off + 0.04** ∧ **≥ 0.10** |
| **AC1** | `guard.aon` core luma: flat share (8-neigh max |ΔL| < 2.5); 16-bin modes ≥ 10% mass separated ≥ 16 L | **≥ 0.40** ∧ **≥ 2 modes** |
| **AI1** | shells on every humanoid at `aon` (probe) ∧ dark-ring share (L ≤ 40) in the bbox perimeter band (outer 12%) on `guard.aon` | shells **all** ∧ **≥ 0.06** |
| **AR1** | `guard.aon` bbox px with (B−R ≥ 10 ∧ L ≥ 96) | **≥ 200** |
| **AS1** | diff(`off`,`askin`) on `guard`: differing px inside bbox_off ∪ bbox_askin; outside | **≥ 4000** ∧ **≤ 900** |
| **PROT-A_<shot>** ×15 | classification rule §5 | clean ⇒ **[0,0]**; affected ⇒ outside-container differing px **≤ 900** |
| **V-TREE** | 82 rows, ONE src hash = manifest expect (git-archive HEAD) | else **VOID** |
| **LOOK-A** | `guard`/`kaykit`/`temple`/`night` `aon` vs `off`, my eyes, specifics recorded in the RESULT | **binding** |

## 5. The protection classification rule (registered NOW, evaluated from off-arm probe data)

For each shot except `guard`: if the `off` arm's probe shows NO guard body bbox intersecting
the viewport ⇒ the shot is CLEAN and `diff(off, aon)` must be [0,0]. Otherwise it is
AFFECTED and the delta must be CONTAINED: differing px outside the union of (guard bboxes
from `off` and `aon`, each dilated 32 px) ≤ 900. Expected classes, recorded for the
mismatch report (the probe rules, not this list): affected — kaykit, hero, temple,
traversal, night, courtyard, interior, combat; clean — the six sly-*, dunes. A strict-zero
failure that comes WITH a probe-recorded in-frame guard is a mis-registration of this list
(VOID that bar, diagnose, note the true class); one WITHOUT is a real leak ⇒ NO-SHIP.
Cast-shadow leaks land outside bboxes by construction and are exactly what the ≤900/[0,0]
bars exist to catch — fail-closed, not explained away.

## 6. Falsifiers — revert, do not defend

- **PF1** — any of AP1/AP2/AC1/AI1/AR1/AS1 out of band on a valid capture ⇒ guardArt/
  guardSkin stay 0, finding recorded. No post-hoc retune; a different dress is a new prereg.
- **PF2** — any PROT-A out (per §5's rule) ⇒ NO-SHIP regardless of the target bars.
- **PF3** — AV1/V-TREE out ⇒ capture VOID; diagnose from the probe columns, archive
  (`mv guardpass1 guardpass1-void-runN`), re-run.
- **PF4** — any R ≠ 0 ⇒ that shot's dependent bars VOID (fail-closed). Twelve-for-twelve
  same-day precedent says 0 px; a within-boot nonzero is a NEW finding, named before re-run.
- **PF5** — runner killed mid-boot ⇒ nothing was installed; nothing to restore in src;
  archive the out-dir, relaunch.
- **PF6** — launch pins: src/ clean; HEAD `Guard.js` carries `guardArt: 0`, `guardSkin: 0`,
  `coneShape: 0`, `lampToon: 0.0`, `beamCoreScale: 1.0` and the legacy shader spellings
  (the guardart test's regex set); HEAD `toon.glsl.js` carries the `uGuardLampPos.w > 0.0`
  gate; roster exact ⇒ else abort unscored.
- **PF7** — out-dir exists non-empty ⇒ abort; archive; relaunch. No resume.

## 7. §17 look-change declaration

At `aon`: the nine humanoid guards stop being paper-white mannequins — warm linen bodies,
lapis head-cloth mass, gold collar, bronze hardware, jackal-fur limbs, ink silhouettes,
and their animated stance stops collapsing (joints drive their own flesh). Scarabs
byte-identical. Every shot without a visible guard byte-identical. No draw-count change.

## 8. Registered forecast (ledger entering 5/18)

**SHIP.** Grounds: the paint writes a channel §291 proved multiplies through; the skin fix
is measured arithmetic; every lever roundtrips byte-exact in the suite. Honest
uncertainties, named: (a) AC1 on a moon-lit subject (bands may be < 2 modes at night
key — a miss records "banding needs a daylight subject bar", not a defense); (b) containment
on temple/hero where guards are small and shadows long (a shadow outside the dilated bbox
fails PROT honestly); (c) the head block's linen map over face UVs may read as cloth-faced
(LOOK's call). A VOID re-runs; only PF1/PF2 on a valid capture are verdicts.

## 9. SCORING RECIPE (for the coordinator; exact commands)

The runner is DETACHED. Do not wait interactively.

1. **Done?** `tail -5 /home/user/Demo/progress/records/logs/guardpass-run1.log` — last line
   of a completed run is `DONE. Score with: node progress/records/guardpass/guardart-score.mjs
   && node progress/records/guardpass/guardcone-score.mjs`. Liveness:
   `pgrep -f 'guardpas[s].mjs'` or the pid in `/tmp/sands-of-ra/guardpass1.pid` vs `/proc`.
2. **Killed mid-boot?** Nothing was installed — `git status` must show src/ clean; archive
   `progress/records/guardpass1` → `guardpass1-void-runN`, relaunch:
   `bash tools/launch.sh progress/records/guardpass/guardpass.mjs
   /home/user/Demo/progress/records/logs/guardpass-runN.log /tmp/sands-of-ra/guardpass1.pid`.
3. **Score:** `cd /home/user/Demo && node progress/records/guardpass/guardart-score.mjs`
   (exit 0 = every gate row PASS). Tri-state table + verdict line printed.
4. **LOOK:** open `guardpass1/guard.{off,askin,aon}.png`, `kaykit.{off,aon}.png`,
   `temple.{off,aon}.png`, `night.{off,aon}.png` and judge §7's declaration. LOOK is
   binding: a numeric PASS with a failed look is NO-SHIP, recorded with specifics.
5. **Outcome branches** (write `RESULT-guardart.md` + a KNOWN_ISSUES § in every branch):
   - **PASS + LOOK (ship).** §296 first (no capture lock/queue), then ONE commit citing
     RESULT-guardart: `src/ai/Guard.js` TUNE `guardArt: 0` → `1`, `guardSkin: 0` → `1`
     (update both TUNE comments to cite the RESULT); `tests/guardart.test.mjs` flip the two
     pins + message to cite the RESULT. Suite (`node --test "tests/*.test.mjs"`, 507+
     green) before push.
   - **PF1/PF2:** stays 0/0; record; the finding routes the next prereg (dress v2 or a
     containment fix).
   - **PF3 (VOID):** archive, diagnose, re-run — the candidate neither ships nor dies.
   - **PF4:** affected blocks VOID; name the mechanism from ordinal/timestamp/probe columns
     before re-run.
6. Frames + manifest stay in `progress/records/guardpass1/` (archive on VOID per PF7).
