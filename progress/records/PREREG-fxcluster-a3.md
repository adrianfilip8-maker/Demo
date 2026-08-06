# PREREG-fxcluster-a3 — sub-arm A, third letter: same heading lever, re-sited instrument + pinned clock

**Owner:** FX. **Date sealed:** 2026-08-06, before any a3 capture exists.
**Parent:** `PREREG-fxcluster` §A (first letter: UNSCOREABLE, noise gates breached) →
`PREREG-fxcluster-a2` (second letter: UNSCOREABLE again by its own P-A2a, and the contaminant
named in source). **Both parent verdicts stand untouched.** This seal changes ONLY the viewing
design and the capture clock. The lever is the parents', port-proven and unchanged:
`debug.guardTowardCamera = −0.20` through the committed Guard.js seam (`src/ai/Guard.js:1832`).

**Registration tree:** `adb5629032309d19` (convention: `find src -name '*.js' | sort | xargs
sha256sum | sha256sum`, §121.4 — NOT comparable to git-ls-files hashes). Differs from a2's
`be5c1da17ca5bad4` because other owners committed in between; the five files this seal quotes
are verified byte-identical to HEAD at sealing and carry no working-tree diff:
`src/ai/Guard.js` 350dece5a1b13fb7, `src/ai/Patrol.js` 0db2a92e3fe5269d,
`src/core/Engine.js` 33fc5fc88c7fe644, `src/core/Debug.js` afd8cba658498d35,
`src/fx/Particles.js` ef1a7dd4711d69df.

**Standing on:** `KNOWN_ISSUES.md` §177 finding 1 (an absolute-time animation term defeats any
state wipe) and finding 2 (a no-harm gate can pass by being structurally unable to move).
This seal is the successor §177 routes to the next FX window.

---

## 0. The design choice, made by measurement before sealing

§177 names two successors and asks that the choice be made by measurement. Both were computed
on the **committed a2 frames** by `fxcluster1/a3-choose.mjs` → `a3-choose.json`, run before this
seal was written. Conventions stated (§122.1, §128.2): `L = 0.2126R + 0.7152G + 0.0722B` on
8-bit sRGB bytes; **effect** = statistic on `base → cand`; **mirror** = `cand → restore`;
**noise** = `max(|base→base2|, |base→restore|)` — the same worst-case rule a2's gates used;
**E/N** = |effect| / noise, and the §13 3× clause is satisfiable iff **E/N ≥ 3**.
`static%` = share of the rect's pixels bit-identical across all four a2 arms — the §177
finding-2 number.

### The two named successors, measured (ΔmedL form)

| candidate | effect | mirror | b→b2 | b→rest | noise | **E/N** | static% |
|---|---|---|---|---|---|---|---|
| **§177 successor 1 — re-site onto the ground pool** (0,400,560,700) | **−59.84** | **+56.35** | −1.49 | −3.49 | 3.49 | **17.15** | 1.7 % |
| §177 successor 2 — signed spatial contrast, the a2 letter's literal form (ROI left cell − ROI middle) | −24.19 | +22.26 | −0.93 | −1.93 | 1.93 | **12.53** | 2.4 / 0.1 % |
| §177 successor 2, pool-sited variant (pool left − pool right) | −26.40 | +20.48 | −1.43 | −5.92 | 5.92 | **4.46** | 0.3 / 3.4 % |
| *control* — a2's own registered ROI (340,280,700,350) | +6.27 | −1.64 | +1.36 | +4.63 | 4.63 | **1.35** | 0.5 % |

**Successor 1 wins, 17.15 vs 12.53, and both beat the registered instrument's 1.35.** The
control row is the calibration §141.1 demands: the new statistic is not "uncontaminated
arbitrary" — it is 12.7× the E/N of the quantity that has now failed twice, on the same frames.

Four further pool rects were measured for parameter sensitivity (E/N 15.8–17.2 on ΔmedL,
14.1–65.8 on ΔmeanL — `a3-choose.json` §level). **This seal registers the rect §177 and the a2
letter named — (0,400,560,700) — not the scan maximum.** One contrast pair (pool upper half
minus pool lower half) scored E/N 266 on ΔmedL off a 0.21 L denominator; it is recorded in
`a3-choose.json` and deliberately **not** registered, because registering the maximum of a
22-cell scan off a two-sample denominator is the fishing §13 exists to prevent.

### Why the contrast family loses on mechanism too, not only on the number

§177 finding 1 named **one** absolute-time term. Reading `src/ai/Guard.js` for this seal found
**three**, and the two new ones are why a signed contrast cannot cancel them:

1. `:1588` `bright *= 1 + TUNE.beamFlicker * sin(t * 6.3 + g.senses.phase)` — ±9 % (`:97`),
   **spatially uniform** per instance. This is the term §177 names, and the only one a contrast
   could cancel.
2. `:278-279` BEAM_FRAG `dust = 0.84 + 0.16 * sin(t*21 − uTime*1.55 + vSeed) * sin(t*7.3 +
   uTime*0.72 − vSeed*0.5)` — ±19 % relative, and **spatially structured**: two incommensurable
   frequencies in `t` (distance along the beam), so it is a travelling wave, not a scalar.
3. `:347` POOL_FRAG `a *= 0.88 + 0.12 * sin(vT*11 − uTime*1.2 + vSeed)` — ±13.6 % relative,
   **spatially structured** along the pool (≈1.75 cycles across the wedge).

A signed left−right contrast subtracts a *scalar* multiplier. It does nothing to (2) or (3),
which change the *shape* of the contribution. The measurement agrees with the mechanism: the
pool-sited contrast, whose two regions sit at different `vT` and are therefore on opposite
phases of term (3), is the **worst** candidate in the table (E/N 4.46).

**Recorded as a source finding beyond §177:** `src/fx/Particles.js:2600-2612` and
`src/render/Lighting.js:568-571` each re-base their animation clock at the `shot` event, and
both carry a comment saying why — *"engine time at the moment `setShot` stops the rAF loop is a
function of how long the boot took"*. **The guard cone is the one animated subsystem that never
got that re-base**: `Guard.js:1537-1538` feeds absolute `t` straight into `uTime`, and `:1588`
uses absolute `t` in the CPU flicker. §177's finding is a documented project rule with exactly
one exception, and that exception is the shot under test.

### Pinning the clock — reachable without a src edit, so it is registered

The dispatch asks whether the flicker phase is settable from a debug hook without a src edit.
**It is** — `g.senses.phase` is a plain writable property (`src/ai/Patrol.js:398`), reachable at
`__ENGINE.get('guards').guards[i].senses.phase`. **But pinning the phase is the wrong hook**: it
addresses term (1) only and leaves (2) and (3) running. The right hook is one level up and
equally reachable with no src edit: **`engine.time`** is a plain property (`src/core/Engine.js:87`,
advanced at `:254`, passed to every module at `:259`), and `Debug.step(n, 0)` is documented to
freeze it (`src/core/Debug.js:152-167`). Setting `engine.time` to a fixed constant at the head of
**every** arm pins all three terms at once, and — because Particles and Lighting re-base *after*
that point, at the `shot` event — leaves their relative clocks exactly as they already were.

**No in-ticket token is needed for the pin**; it is a runtime poke on the same footing as the
lever. The ticket is needed for the capture lock, as always.

Blast radius, stated: the other absolute-`engine.time` readers are `HUD.js:801` (not in shot
frames), `CameraRig.js:370/891/901` (camera is shot-locked), `Moveset.js:195/712/932` (player is
not on a rail in this shot), `GuardAnim` (its own clock). `Decals.js:86-96` stamps births on
FX's re-based clock, not the engine's, so there is no born-in-the-future hazard. **And the pin is
applied identically in all four arms, so any residue of it is common-mode and cancels in the A/B.**

---

## 1. The arm — lever identical to both parents

`debug.guardTowardCamera = −0.20` (shipped 0.35), poked in the cand arm only, through the
committed `Guard.js:1832` seam (debug read + widened clamp; verified present before boot, **no
src edits**). Staging per arm, identically, in this order:

1. **clock pin** — `engine.time = 1000.0` (a constant above any natural boot value, so the first
   set is forward);
2. the a2/c2-proven **pool wipe** (non-looping `Batch` rings + `Decals` zeroed) — kept because a2
   measured it removing the *other*, real contaminant (base→base2 2.06 → 1.36);
3. flag poke (cand sets, restore deletes);
4. `setShot('guard')` — rebuilds staged content through shipped code and re-bases the FX and
   Lighting clocks onto the pinned engine clock;
5. `step(10, 0)` — frames advance, world clock does not;
6. probe, then capture.

Arms, one boot, guard only: **base → base2 → cand → restore** (base2 = full pipeline repeat with
no poke — the in-run noise sample; restore deletes the flag).

## 2. Bands — every gate registered with its measured response on the a2 known-bad/base pairs

§177 finding 2: *a guard that cannot fail is not a guard.* The last column is each gate's value
on committed a2 frames, so **no gate below licenses a reading without first being shown able to
move.** POOL ROI = **(0,400,560,700)**; GUARD LIVE = **(852,220,990,300)**.

| # | registered quantity | band | shown able to move? (a2 committed frames) |
|---|---|---|---|
| **Q-A3-1** | ΔmedL cand−base over POOL ROI | **[−100.0, −15.0]** | **moves −59.84**; rect is 1.7 % static |
| **Q-A3-1m** | mirror ΔmedL restore−cand, POOL ROI, as a fraction of \|Q-A3-1\| | **[+0.60, +1.40]** | a2 pool **0.94 → in band**; a2's *registered ROI* control **0.26 → out of band**. The gate discriminates on committed data. |
| **N-1** | noise \|base2−base\| medL, POOL ROI | **≤ 4.0** | reads **1.49** unpinned — non-zero, not pinned |
| **N-2** | noise \|restore−base\| medL, POOL ROI | **≤ 4.0** | reads **3.49** unpinned |
| **§13** | \|Q-A3-1\| ≥ 3 × max(N-1, N-2) | binds at **≥ 12.0** at the gate ceiling | a2's registered ROI **failed** this clause 6.27 vs 13.89 |
| **Q-A3-2** | no-harm: Δ mean\|∇L\| cand−base over GUARD LIVE | **≥ −3.0** | **moves −2.08 and mirrors +2.56**; rect 0.9 % static |
| **L-2** | Q-A3-2 licence: same-state \|Δ mean∇L\| over GUARD LIVE | **≤ 1.0**, else Q-A3-2 is **UNCERTIFIABLE** | reads **2.40** unpinned — the licence is a live constraint, not a formality |
| **V-1** | clock pin: whole-frame px differing base vs base2 (any channel \|Δ\| ≥ 1) | **≤ 20 000** of 921 600 | a2 unpinned reads **507 830 (55.1 %)** — a 25× demand against a measured known-bad |
| **V-2** | `engine.time` at capture, all four arms | **identical to 1e−6** | a2 did not pin it; probe records before/after/at-capture |
| **V-3** | `beamCol0` bit-identical across base/base2/restore | **exact** | a2 read 0.2440 / 0.2531 / 0.2630 — term (1) directly visible |
| C-1 | context, not a gate: ΔmeanL cand−base, POOL ROI | report | a2 −38.41, E/N 60.97 |
| C-2 | context, not a gate: ΔmedL over a2's ROI (340,280,700,350) | report | a2 +6.27 — carried so the letters stay comparable |
| C-3 | context, not a gate: Q-A3-2 on a2's untrimmed figure rect (852,220,990,700) | report | a2 ΔmedL **exactly 0.00**, 82.9 % static — the §177 finding-2 exhibit, carried as a control |

**Why Q-A3-2 is a gradient and not a level.** All four no-harm forms were measured
(`a3-choose.json` §harm). On the guard's live band, ΔmedL / ΔmeanL / ΔIQR all fail the mirror
test on committed frames — `base→cand` and `cand→restore` come back with the *same* sign
(−18.47 then −22.44 for medL), i.e. they are reading the drifting flicker, not the lever. **Only
mean |∇L| reverses** (−2.08 then +2.56). A level also cannot tell the two failure modes apart:
the beam throat washing his silhouette out (harm) and the throat *stopping* washing it out (the
point of the lever) move a median the same way. Both failure modes collapse local contrast, so a
gradient is the form that matches the §17 risk. Base scale: mean |∇L| = 10.97, so the −3.0 band
is a 27 % contrast-loss ceiling.

**Direction of Q-A3-1 is predicted, not fitted.** The pool basis is built from `g.forward`
(`Guard.js:1603-1611`); at −0.20 the forward vector turns from (−0.069, 0, 0.998) to
(−0.588, 0, 0.809) (a2's probe, matching the committed port), sweeping the pool **out of** the
bottom-left quadrant. The registered band is therefore negative. Per-arm a2 medL over the POOL
ROI: base 87.97, base2 86.48, cand **28.13**, restore 84.48.

**Honesty note about the band's provenance.** The a2 frames were captured with this same lever,
so Q-A3-1's approximate size is already known; the band is registered wide ([−100, −15]) and is
falsifiable at both ends. **This letter's registered question is not "is there an effect"** — a2
proved that structurally. It is: *does an instrument sited and shaped by measurement certify it
under gates that are each shown able to fail?* The gates that can end this run are N-1/N-2, §13,
V-1, L-2 and Q-A3-2, none of which the effect's size can rescue.

## 3. Falsifiers (revert-not-defend; the lever is a runtime poke, nothing to revert)

- **P-A3a** — V-1 breach (base2 vs base > 20 000 px) → the clock pin did not take, or staging is
  non-deterministic under it → **UNSCOREABLE**; record `engine.time` per arm and the pair
  structure; no design iteration mid-run (§141).
- **P-A3b** — N-1 or N-2 breach, or the §13 clause fails → **UNSCOREABLE**; the re-sited
  instrument is contaminated too, and the recorded pool-rect pair structure is the finding.
- **P-A3c** — Q-A3-1 outside [−100, −15] → the heading does not move the pool as the port
  predicts → **no ship**; the cone item rides the parent's §4-R1 route to COORDINATOR alone.
- **P-A3d** — Q-A3-1m outside [0.60, 1.40] → whatever moved is not the flag, because deleting
  the flag does not undo it → **no ship**, re-diagnose from probes.
- **P-A3e** — Q-A3-2 breach (< −3.0) with its licence L-2 held → the heading costs the guard's
  read → **no ship** (the shot's subject is the guard first).
- **P-A3f** — L-2 breach → Q-A3-2 is **UNCERTIFIABLE** and cannot license a no-harm reading;
  Q-A3-1 may still be reported, but **nothing ships on an uncertified no-harm gate.**
- **Capture dies mid-run** → record what landed, stop (dispatch hard rule).

**§17 declaration (both parents', carried):** the guard's body yaw turns ~30° lens-away in the
cand arm; `SHOT_POSE.guard.look` compensation exists and is **not** part of this arm — one lever.
**Also declared:** the clock pin is a capture-protocol change, not a treatment; it is applied to
every arm including base, and V-1/V-2/V-3 exist so that its effect is separately visible rather
than folded into the result.

## 4. Chunk plan — one boot, guard only

Runner `fxcluster1/a3rerun.mjs` (a2 pattern: seam verify with no-edit abort; FIFO lock via
`withGame` — an sbs3 capture holds the lock at sealing, so it queues politely; incremental
`a3-guard.<arm>.png` + `a3-readback.json` per arm; idempotent resume if frames exist).
Probes per arm: a2's guard probe (pos / yaw / forward / `_light` / uOpacity / beamCol0 / flag),
plus **`engine.time` before pin, after pin, and at capture**, plus `senses.phase`, plus pool
stats before/after wipe, playerPos, tod, camera, `srcAtArm`.
**Scorer:** `fxcluster1/a3score.mjs` — thresholds transcribed from §2, statistics computed by the
same code paths `a3-choose.mjs` used on the a2 frames (transcription, not judgement). Outputs
`a3-scores.json` + `a3-pairstruct.json`.

## 5. Decision table

| outcome | action |
|---|---|
| Q-A3-1 in band + Q-A3-1m in band + N-1/N-2 + §13 + V-1/V-2/V-3 + Q-A3-2 with L-2 held | **ship = `src/ai/Guard.js:158`, `SHOT_POSE.guard.towardCamera: 0.35 → −0.20` (the widened clamp at `:1832` stays) — named for the COORDINATOR, who owns the edit** |
| P-A3a / P-A3b | UNSCOREABLE — pair structure + clock probes recorded, nothing ships |
| P-A3c / P-A3d | no ship — cone → COORDINATOR (parent §4-R1) |
| P-A3e | no ship |
| P-A3f | no ship (no-harm uncertified); Q-A3-1 reported for the record |

## 6. Files of record

`progress/records/PREREG-fxcluster-a3.md` (this seal); `fxcluster1/a3-choose.mjs` +
`a3-choose.json` (the pre-seal design measurement quoted in §0/§2); `fxcluster1/a3rerun.mjs`,
`a3score.mjs`; `fxcluster1/a3-scorer-control.json` + `a3-scorer-control.txt` (see §7);
`fxcluster1/a3-guard.{base,base2,cand,restore}.png`, `a3-readback.json`,
`a3-scores.json`, `a3-pairstruct.json`, `logs/a3rerun-r1.log`; verdict **appended** to
`RESULT-fxcluster.md` (earlier letters never struck).

## 7. Scorer control — run BEFORE the capture, against a known answer

`a3score.mjs` was run on the **committed a2 frames** before any a3 frame existed
(`a3-scorer-control.json` / `.txt`). Two things it establishes, both of them the DIGEST's
"validate a tracer against a control before trusting it":

- **It reproduces every value in §0's table to the last digit** — pool medL 87.97 / 86.48 /
  28.13 / 84.48, Q-A3-1 −59.84, mirror 0.94, N-1 1.49, N-2 3.49, Q-A3-2 −2.08, C-1 −38.41,
  C-2 +6.27, C-3 exactly 0.00 — although it is a separate implementation from `a3-choose.mjs`.
- **On unpinned frames it FAILS L-2 (2.40 vs ≤1.0) and V-1 (507 830 vs ≤20 000) while passing
  the rest.** The two gates that carry the clock pin are therefore verified able to fail, on
  real committed pixels, before the run that they will judge. A scorer that could only print
  PASS is the §143.1/§177-2 defect; this one is shown printing FAIL.
