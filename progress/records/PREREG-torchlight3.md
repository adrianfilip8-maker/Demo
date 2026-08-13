# PREREG-torchlight3 — the one-boot poke A/B: same candidate bytes, third seal; the cross-boot bar is deleted, not re-attempted

**Lane:** LIGHTING (third seal on the torchlight candidate; parents `PREREG-torchlight.md` →
`PREREG-torchlight2.md`; dispositions `RESULT-torchlight.md` and `RESULT-torchlight2.md`;
ledger §301–§302). **Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/torchlight3/` does not exist at
the time of writing and no frame of any arm has been rendered.** Runner (`torchlight3.mjs`)
and scorer (`torchlight3-score.mjs`) are committed with this file, before the capture. The
FAR-derivation module is v2's `torchlight2-far.mjs`, UNCHANGED — the v3 scorer imports it, so
the F-bars and their derivation keep sharing one truth.

**What this seal is: a RE-INSTRUMENTATION, not a re-derivation.** Two prior captures VOIDed
on the same bar. D1 (boot A2 vs boot A, decoded differing px, bar [0,0]) measured 49k/80k
across a 3 h session gap (run 4, §301), then 28k/51k with NO gap, warm boots, one session,
identical installed bytes on both sides (v2, §302). The session-gap attribution is dead:
**boot identity is the drift boundary** (§296-f3's luma-sag samples at a different process
age per boot), so a cross-boot [0,0] bar is an unachievable bar on this renderer (§296.3
class, measured twice under two escalating disciplines). Meanwhile every within-boot
instrument held exactly: R1 (poke restore) 0 px in both runs, and the same-day
c10postfx2/twilight blocks held per-shot backs at strict 0 px on every block
(RESULT-critic10-postfx2 V1 ×5, RESULT-twilight golden protection ×4). So per
RESULT-torchlight2's disposition the ENTIRE A/B moves into ONE boot of the CAND tree, with
the arms as `debug.localToon` pokes — the lever both prior runs proved exact — and the one
irreducibly cross-tree claim becomes a RECORDED ANALYTIC PREMISE (§4), stated with its
citations, not measured as a pixel bar. **No cross-boot bar exists anywhere in this seal;
D1 and N1 are deleted, not re-attempted.**

Everything v2 validated carries verbatim BY CITATION, because v2's VOID vindicated those
instruments on these exact candidate bytes: the ROIs (parent §3), the seven-emitter slot
table (v2 §4), the F1/F1b bands and the F2 guard (v2 §5, derived by geometry arithmetic
independent of boot structure and then confirmed by v2's measured +2.14/+11.96 and
+0.16/+1.27 inside them), P1/P2/KO1/BG1 (parent §5 via v2 §7), the §251 frozen-clock
discipline, the §186 lock machinery with verify-at-lock-grant, and the §7 look declaration.
Where a carried bar names "base arm", read "the `off` arm" (§6); where it names "cand arm",
read "the `on` arm".

## 1. Ownership and discipline

Carried verbatim from v2 §1: this lane's src surface is the three registered files, installed
only inside the runner's lock window from git refs and restored before release; no other
`src/**` byte moves (§186), no src commit while any capture runs or queues (§296), bars
sealed and pushed before any candidate frame, no post-hoc threshold moves (§141.1),
fail-closed, `ringPainter` untouched, runner launched detached via `tools/launch.sh`
(§298.3).

## 2. The candidate — unchanged, third time

Parent §2 verbatim: one term, one gate (`slyWorldPos(...).y < -0.5`), one gain
(`TUNE.localToon: 2.5`), one cap (`SLY_LOCAL_CAP 1.6`), across
`src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js`, `src/render/Lighting.js`.
The candidate bytes are IDENTICAL to both parents' (`f4056f4`). The exactness spellings
(branch-untaken at 0.0; gated adds are exactly +0.0) carry and are now load-bearing twice:
once inside the B-bars (§7) and once inside the premise (§4).

## 3. Tree pins — one installed tree

- **CAND = `f4056f4`**, archive src hash **`f9a77726b2a5ece0`**; its `Lighting.js` carries
  `localToon: 2.5` (the value under test). **BASE = `926f0ee`** = `f4056f4^`, the pre-term
  tree (no `localToon`/`uLocalToon` anywhere) — retained as argv and as the premise's
  referent; the runner's PF6 checks on it carry verbatim, but NO base arm boots.
- **Registered candidate diff:** `git diff --name-only 926f0ee..f4056f4 -- src/` = exactly
  the three §2 files. Re-verified today; the runner re-verifies at launch (PF6).
- **Carrier tree:** the one boot is TODAY'S HEAD tree with the three files swapped in from
  CAND (`gitRaw`, no trim). At seal time HEAD is `a28a101` and
  `git diff --name-only f4056f4..HEAD -- src/` = exactly
  `{src/render/Lighting.js, src/render/PostFX.js}` (the registered fallback flip §301 + the
  shipped bloom gate §299) — the runner requires exactly that set at launch; any other src
  landing between seal and launch is PF6 (abort unscored, re-derive §3). HEAD's
  `localToon: 0.0` can never leak into the boot: HEAD's `Lighting.js` is replaced.
- **Expected installed hash**, derived at launch from `git archive HEAD` + the swapped files
  (v2 §3 machinery): at seal time it computes to **`80ca393a9b620830`** — byte-identical to
  v2's boot B tree, which is exactly what licenses carrying v2's bands: v3 renders the same
  installed bytes v2's cand boot rendered. The runner also computes the expected RESTORE
  hash (`git archive HEAD` untouched; at seal time **`290a10079d192a5d`**) and verifies the
  post-release checkout against it — install and restore are both sha-verified.
- Runner argv is `BASE_SHA CAND_SHA`, pinned to the two shas above and to CAND's archive
  hash — a wrong operator argv aborts before any boot.

## 4. The recorded analytic premise (replaces D1/N1 — stated, cited, NOT measured)

> **PREMISE:** the CAND tree rendered at `uLocalToon = 0.0` is the same picture function as
> the BASE tree — so the `off` arms of §6 stand in for base frames, and
> BASE ≡ CAND@0.0 (this premise) plus CAND@0.0 ≡ CAND@2.5 above ground (the measured B-bars)
> compose into the original protection claim.

Its grounds, all in the record already:

1. **Branch-untaken at 0.0.** The whole term sits behind `if ( uLocalToon > 0.0 )` — at 0.0
   no term arithmetic executes at all (parent §2's registered spelling, pinned against drift
   by `tests/torchlight.test.mjs`).
2. **Exactly +0.0 even if it executed.** Every contribution multiplies by the uniform:
   `min( slyLocalAcc · 0.0, 1.6 ) = 0` and `diff += alb · 0.0` adds exactly `+0.0` — IEEE 754
   `x·0 = 0` for the finite inputs guaranteed here (the accumulator is finite under the 1.6
   cap and three r185's clamped attenuation). This is the TUNE comment's own contract at the
   fallback ("ToonMaterial ships the uniform at 0, so a build whose LIGHTING never publishes
   is bit-identical to the pre-seal one") and v2's null0-arm semantics.
3. **The lever is exact where it CAN be measured.** Within a boot, poke/restore reproduced
   bit-identical frames in both prior runs (R1 = 0 px twice); v3's own R-bars (§7) re-measure
   that exactness per shot, every shot.
4. **Why the residue is not measurable here.** The only part of the premise a frame bar could
   add is "a recompiled program with untaken new text is bit-identical ACROSS BOOTS on
   SwiftShader" — and v2 proved that no two boots are bit-identical even at IDENTICAL
   installed bytes (D1 28k/51k px, same tree both sides). A pixel bar on the premise
   necessarily measures boot identity, not program identity; it is the §296.3 unachievable
   class. The premise is stated as the analytic claim it always was, falsifiable against the
   registered GLSL text (the test suite pins the spelling), and is NOT scored from frames.

Consequences for the bar table: **D1 is deleted** (nothing cross-boot remains to guard) and
**N1 is deleted** (its question — "is the branch-untaken build the base picture?" — is this
premise; its v2 measurement was VOID both runs for the same cross-boot reason).

## 5. Carried bars — citations, and what changed in their inputs

- **ROIs** carried: POOL [292, 432, 392, 490], FAR [380, 30, 560, 120],
  FAR-N [480, 30, 560, 120] (parent §3; FAR/FAR-N via `torchlight2-far.mjs`). Statistics
  convention carried (display bytes, Rec.709 L, CRITIC warm predicate, differing px = any
  |Δ| ≥ 1 in R,G,B).
- **BG1** (base gates) carried from parent §5, computed on `interior.off`: POOL warm% ≤ 12 ∧
  POOL meanL ∈ [40,100] ∧ FAR meanL ∈ [35,95] — else VOID (staging/tree not the diagnosed
  one). v2 measured 2.3 / 70.7 / 61.8 on the base arm; under §4 the off arm is that picture.
- **P1** [+10, +80] and **P2** (ΔR−B ≥ +12 ∧ warm% ≥ 35) carried from parent §5, now
  computed `on − off` in one boot. The bands were derived from the falloff model, not from
  any boot structure; v2 measured +24.3 / +92.4 / 89.2% across boots — the same-boot
  statistic removes boot noise from the delta and moves nothing else.
- **F1** [−8, +5.0] ∧ [−8, +22] and **F1b** [−8, +1.0] ∧ [−8, +2.0] carried from v2 §5
  (arithmetic over seven emitters + registered display conversion — no boot term anywhere in
  the derivation), computed `on − off`. v2 measured F1 +2.14/+11.96, F1b +0.16/+1.27.
- **F2** carried from v2 §5: every interior arm's guard-torch slot ≥ 8.5 m from every FAR
  surface point (grid from `torchlight2-far.mjs`), else F1/F1b VOID. v2 measured 15.03 m.
- **V1-v2 slot table** carried verbatim from v2 §4 — exactly 6 visible slots; five match the
  promoted sconce handles {R−62, L−62, R−68, L−68, R−74} within 0.35 m; L−74 matches no
  slot; the sixth slot matches no sconce, has y < −0.5, and lies inside the tomb box
  x ∈ [−15, 15], y ∈ [−12.5, −2], z ∈ [−79, −55]; anything else VOID (PF3/PF8) — now
  evaluated on the FOUR interior arms of §6 (`off`, `on`, `ko`, `back`) instead of six
  cross-boot arms. The slot position is RECORDED per arm (v2 measured (9.09, −8.78, −66.6)
  ± 0.05 across boots; within one staging it was bit-stable), and the off-vs-back slot delta
  is printed as a staging-stability aid.
- **KO1** carried from parent §5: POOL ΔmeanL at gain 6.0 ≥ 1.35 × ΔmeanL at 2.5 ∧
  ≥ ΔmeanL(2.5) + 5 L — the 6.0 arm is now the `ko` poke on `interior` only (v2's `kbover`).
  v2 measured 39.8 vs 24.3 (×1.64).
- **V2** carried: every `on` arm (all 16 shots now, interior included — the poke path is the
  publish path) reads `uLocalToon = 2.5` live, else VOID (the B-bars would be testing the
  wrong configuration).
- **Treestamps** carried (§296): every manifest row records `treeState()`, capture ordinal
  and ISO timestamp; the manifest header records BASE/CAND/HEAD shas, the expected
  install/restore hashes and launch time.
- **V3 (parent form) is inapplicable** — there are no base-tree rows to read `null` from.
  Its role (prove each arm rendered the configuration its bar assumes) is re-registered as
  **V3-v3**: every `off` and `back` row reads `uLocalToon = 0` (the poked value, live), and
  `interior.ko` reads 6 — else VOID.
- **V4 (parent form) re-registered as V4-v3**: ONE src hash across ALL rows, equal to the
  manifest header's expected install hash (`80ca393a9b620830` at seal time). "Two hashes,
  differing" is gone with the second tree.

## 6. Arms and the boot (runner `torchlight3.mjs`; frames → `progress/records/torchlight3/`)

Carried mechanics: quality high, 1280×720, `setShot(name, {dt:0})` → `step(3,0)` →
`renderFrame(0)` staging (§251 — flicker/FX phase is staging-anchored), roster order,
readbacks per arm, install under the lock with verify-before-vite, abort restores the
checkout, PF5 recovery unchanged (`git checkout HEAD -- <the three files>`).

**ONE boot, CAND installed once.** No warm-up boot: its v2 purpose was cross-boot
uniformity, and no cross-boot comparison remains. No manifest resume of any kind: if
`progress/records/torchlight3/` exists non-empty at launch the runner ABORTS (PF7) and the
operator archives it (`mv torchlight3 torchlight3-void-runN`) before relaunching.

**Per canonical shot (all 16, roster order), while the shot stays staged:**

1. stage once (`setShot {dt:0}`, `step(3,0)`, `renderFrame(0)`) — NOT captured;
2. poke `debug.localToon = 0.0` → settle `step(2,0)` + `renderFrame(0)` → capture
   **`<shot>.off.png`**;
3. poke `2.5` → same settle → capture **`<shot>.on.png`**;
4. `interior` only: poke `6.0` → same settle → capture **`interior.ko.png`**;
5. poke `0.0` → same settle → capture **`<shot>.back.png`**.

The poke/settle/capture body is v2's POKE function verbatim (the c10postfx2/twilight per-shot
poke/back pattern). `{dt:0}` everywhere; the world clock never advances; **no retries**.
`debug.localToon` is set to `0.0` before the first staging (so all 16 shots stage under the
same published value — without this, shot 1 would stage at TUNE's 2.5 and shots 2–16 at the
previous back-poke's 0.0; the uniform cannot touch world state, but uniform staging is the
cleaner disclosure) and cleared to `null` after the last shot. Because `back` re-pokes the
value `off` poked, diff(off, back) brackets EVERY intervening poke of that shot — on
`interior` that includes the 6.0 ko arm.

Captured arms: 16×3 + 1 = **49 frames**, one manifest row each (`arm` ∈ off/on/back/ko),
with per-row tree hash, ordinal, timestamp, uniform readbacks and visible slots.

**Lock-hold price, stated per §298.3:** ~**80–100 min**. Arithmetic: one vite/page boot
6–9 min (v2's per-boot overhead), 16 stagings ≈ 55 min (v2's boot A/B measured 54.5/58 min
for the same 16 stagings), 49 poke arms at 17–60 s each ≈ 14–40 min (v2 measured 16–17 s per
interior poke; the ceiling covers PNG encode on the heaviest daylight frames). No retries
are registered; there is no world-clock advance anywhere in the run.

## 7. Registered bars (scored by `torchlight3-score.mjs` through `tools/gate.mjs`; VOID is not PASS; ship = every row PASS)

| id | quantity | band |
|---|---|---|
| **BG1** | base gates on `interior.off` (§5) | in → else **VOID** |
| **R1–R16** (`R_<shot>`, all 16) | diff(`off`, `back`) decoded differing px, per shot | **[0,0]** each — a nonzero VOIDs that shot's block (PF4-v3), fail-closed |
| **B1–B15** (`B_<shot>`, every shot except `interior`) | diff(`off`, `on`) decoded differing px | **[0,0]** each — the y-gate protection claim, same-boot |
| **P1** | POOL ΔmeanL (`on` − `off`) | **[+10, +80]** |
| **P2** | POOL Δmean(R−B) ≥ **+12** ∧ `on` POOL warm% ≥ **35** | both |
| **F1** | FAR ΔmeanL ∧ Δmean(R−B) (`on` − `off`) | **[−8, +5.0]** ∧ **[−8, +22]** (v2 §5) |
| **F1b** | FAR-N ΔmeanL ∧ Δmean(R−B) | **[−8, +1.0]** ∧ **[−8, +2.0]** (v2 §5) |
| **F2** | guard slot distance to every FAR surface point, all 4 interior arms | **≥ 8.5 m** — else F1/F1b **VOID** |
| **KO1** | POOL ΔmeanL (`ko` − `off`) vs (`on` − `off`) | ≥ **1.35×** ∧ ≥ **+5 L** |
| **V1-v2** | slot table on the 4 interior arms, per §5 | 5 promoted sconces @0.35 m + L−74 absent + 1 no-match underground slot in the tomb box — else **VOID** |
| **V2** | every `on` arm reads `uLocalToon` = **2.5** live | else **VOID** |
| **V3-v3** | every `off`/`back` arm reads `uLocalToon` = **0**; `interior.ko` reads **6** | else **VOID** |
| **V4-v3** | one src hash across all 49 rows = manifest header's expected install hash | else **VOID** |

Fail-closed gating, registered: `B_<shot>` is VOID unless `R_<shot>` PASSED; P1/P2/F1/F1b/KO1
are VOID unless `R_interior` PASSED; F1/F1b are VOID unless F2 PASSED (v2 §7). There is no
D1 row and no N1 row (§4).

## 8. Falsifiers — revert, do not defend

- **PF1** — P1/P2/F1/F1b/KO1 out of band on a valid capture ⇒ the value does **not** ship:
  `TUNE.localToon` stays 0.0, finding recorded. No post-hoc retune toward a band; a
  different gain is a different prereg.
- **PF2** — any B-bar ≠ 0 (with its R-bar PASSED) ⇒ stays 0.0 regardless of the interior.
  Attribution is now direct: same boot, same program, only the uniform moved — a nonzero B
  is the taken branch's zero-add arithmetic (the y-gate) failing on that shot, not a
  recompile artifact. There is no N1 to consult and none is needed.
- **PF3** — BG1, V1-v2, V2, V3-v3, V4-v3 or F2 out ⇒ capture VOID, re-run after diagnosis.
- **PF4-v3** — any R-bar ≠ 0 ⇒ that shot's dependent bars are VOID (fail-closed, §7). Any
  VOID block blocks ship ⇒ archive the out-dir, diagnose from the ordinal/timestamp columns
  (a time-shaped residue is §296-f3 sag INSIDE one boot — a new finding — vs a staging
  defect, which the recorded slots attribute), re-run. The registered expectation from
  twelve-for-twelve same-day blocks is 0 px everywhere.
- **PF5** — the runner is killed mid-boot ⇒ `git status` shows the three files modified;
  `git checkout HEAD -- src/render/Lighting.js src/render/ToonMaterial.js
  src/render/shaders/toon.glsl.js` restores; archive the out-dir; relaunch.
- **PF6** — carried verbatim from v2: argv shas ≠ §3 pins, `CAND^` ≠ BASE,
  `git diff --name-only BASE..CAND -- src/` ≠ exactly the three §2 files, CAND archive hash
  ≠ `f9a77726b2a5ece0`, CAND `Lighting.js` lacks `localToon: 2.5`, BASE `Lighting.js` knows
  `localToon`, HEAD `Lighting.js` not at the 0.0 fallback, or
  `git diff --name-only CAND..HEAD -- src/` ≠ exactly {Lighting.js, PostFX.js} ⇒ **abort
  before any boot**, unscored.
- **PF7** — out-dir exists non-empty at launch ⇒ **abort**; archive, relaunch. No resume,
  ever.
- **PF8** — the slot table shows six sconces (config B) or any other non-registered table ⇒
  VOID via V1-v2, not an alternate pass.

## 9. §17 look-change declaration

Carried verbatim from v2 §9 (itself from parent §7): warm pools on the tomb floor and pier
bases breathing with the flicker, capped ember-core mounts, the west −74 pier's upper shaft
warms by up to ~+5 display L over the old FAR rect, the vault's ambient floor (F1b's rect)
does not rise, every non-interior canonical frame is bit-identical (B1–B15), night braziers
stay un-enrolled.

## 10. Registered forecast (held loosely; ledger entering 4/17)

v2's §10 registered SHIP and the capture VOIDed on its own named honest uncertainty (D1) —
counted a miss: 4/16 (RESULT-twilight) → **4/17**. This seal's forecast: **SHIP at 2.5.**
Every effect number is twice-replicated at these exact bytes (+24.3 L pool, +92.4 R−B, 89%
warm, dose ×1.64, F1 +2.14/+11.96, F1b +0.16/+1.27 — all inside the carried bands); the
B-bars now rest on the within-boot exactness this environment has held at 0 px
twelve-for-twelve today (c10postfx2 ×5, twilight ×4, v2's own R1 and interior pokes); the
slot table staged identically in four consecutive boots across two runs. The honest
uncertainties, named: (a) a per-shot back ≠ 0 on some daylight shot — §296-f3 sag has only
ever been measured ACROSS boots, and a within-boot recurrence would be a new finding that
VOIDs that block (PF4-v3), not a verdict; (b) config B on the guard walk (PF8, measured
unreachable). If the capture VOIDs, the candidate neither ships nor dies — it re-runs; only
PF1/PF2 on a valid capture are verdicts.

## 11. SCORING RECIPE (for the coordinator; exact commands)

The runner is DETACHED (`tools/launch.sh`; §298.3). Do not wait on it interactively.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/torchlight3-run1.log` —
   a completed run's last line is `DONE. Score with: node
   progress/records/torchlight3-score.mjs`. `ABORT`/`VOID` lines mean PF5/PF6/PF7 fired; the
   log says which and what to do. Liveness, if needed: `pgrep -f 'torchlight[3].mjs'`
   (bracket pattern) or check the pid in `/tmp/sands-of-ra/torch3run1.pid` against `/proc`.
2. **If the runner died mid-boot** (PF5): `git status` shows the three files modified ⇒
   `git checkout HEAD -- src/render/Lighting.js src/render/ToonMaterial.js
   src/render/shaders/toon.glsl.js`, archive the out-dir
   (`mv progress/records/torchlight3 progress/records/torchlight3-void-runN`), relaunch.
3. **Score:** `cd /home/user/Demo && node progress/records/torchlight3-score.mjs`
   (exit 0 = every row PASS). It prints the tri-state table and the verdict line.
4. **Outcome branches** (write `RESULT-torchlight3.md` + a KNOWN_ISSUES § in every branch):
   - **PASS (ship).** §296 first: confirm no capture holds or queues on the FIFO lock
     (`/tmp/sands-of-ra/capture.lock` absent AND `/tmp/sands-of-ra/queue/` empty, §299's
     post-queue window) BEFORE touching src. Then in ONE commit, citing RESULT-torchlight3:
     1. `src/render/Lighting.js`: `TUNE.localToon` `0.0` → `2.5`; in the TUNE comment,
        replace the "AT THE FALLBACK per RESULT-torchlight.md: …" paragraph with a sentence
        citing RESULT-torchlight3 (e.g. "SHIPPED at 2.5 per RESULT-torchlight3.md —
        one-boot poke A/B under PREREG-torchlight3; B-protection same-boot [0,0] ×15,
        pool/dose/far/validity green.") and update "Ships at 2.5 only on PREREG-torchlight's
        PASS" to cite PREREG-torchlight3's PASS; keep the rest of the contract note intact.
     2. `tests/torchlight.test.mjs`: the pin whose message says it "moves to a nonzero value
        only alongside a PASS under PREREG-torchlight2" — set the expected `TUNE.localToon`
        to `2.5` and rewrite that message to cite the RESULT-torchlight3 PASS (it guards the
        SHIPPED value now); flip the two publish expectations `seen.at(-1)` from `0.0` to
        `2.5` (the "payload does not carry TUNE.localToon" line and the "clearing the
        override must fall back to TUNE" line). The `local: 0` write-on-number and
        override assertions stay as they are.
     Run `node --test "tests/*.test.mjs"` (475 green) before the push. Critic r11 unblocks
     per §301.
   - **PF1** (P1/P2/F1/F1b/KO1 out on a valid capture): the value does not ship;
     `localToon` stays 0.0; record the finding. No retune toward a band.
   - **PF2** (any B ≠ 0 with its R PASSED): stays 0.0 regardless of the interior; the
     finding is a y-gate exactness defect on that shot's population, attributed same-boot.
   - **PF3/PF8** (BG1/V1-v2/V2/V3-v3/V4-v3/F2): VOID — diagnose from the recorded slots and
     readbacks, archive the out-dir, re-run.
   - **PF4-v3** (any R ≠ 0): the affected blocks are VOID — use the ordinal/timestamp
     columns to name the mechanism (within-boot sag would be new; staging drift shows in the
     slots) before any re-run. No cross-boot bar exists to void.
5. The frames and manifest stay in `progress/records/torchlight3/` (archive as
   `torchlight3-void-runN/` on any VOID before relaunching — PF7 enforces this).
