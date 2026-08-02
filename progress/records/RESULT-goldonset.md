# RESULT — goldonset: the run has no power to decide its own question, and the registered stop-band must NOT be applied

Scored against `progress/records/PREREG-goldonset.md`, frozen reader
`scratchpad/goldonset-read.mjs` (frozen before any frame existed, per `NOTE-readers-frozen.md`).

**Provenance.** Boot tree `656818b`, `dirty:false`, 2026-08-02T14:29:04Z. The four commits
between boot and now (`0900705`, `4d9bb82`, `a47e2cd`, `d0f781c`) touch **no `src/` file** —
verified with `git diff --name-only 656818b..HEAD -- src/` (empty). The frames represent current
source exactly.

Ten frames, one boot: `hero` and `temple` × `c0, c070, c085, c100, c0b`.

---

## Headline

**F0 PASSES. Every pixel-based verdict — MECH, DG, TGT — is UNDECIDABLE from this run.** The
FX-phase noise between two captures at the *identical* setting is larger than the effect of the
knob, on every population measured. The registered MECH stop-band
(*"lift ≤ +1.0 → the onset formulation is not the lever either; §25's routing is wrong twice —
say so, stop"*) reads as satisfied and **must not be applied**: it is the false-negative branch
of a run that could not have detected a positive.

Nothing ships. §25's routing is **not** refuted; it is untested.

---

## 1. What is valid

- **F0 — arm applied: PASS.** `tune == uniform == commanded cut`, `gain == 0`, at all ten
  arm-captures. This is a readback verdict, not a pixel verdict, so the phase problem below does
  not touch it.
- **F1' — bracket-native state leak: PASS.** unstable-near-gilded share 21.7% `hero` / 4.9%
  `temple`, bar [0,40]. Both land within a point or two of RESULT-goldhalo's independently
  measured *pure-time* figures (22.8% / 4.2%). Read correctly, **F1' passing is the first
  evidence that this run is dominated by time**, not a reassurance about state.

## 2. The measurement that voids the rest

The registered temporal mask is built from `c0` vs `c0b`. It therefore **nulls `c0b` by
construction** and cannot null the independent phases of `c070`, `c085`, `c100`. Measured on the
gilded-architecture mask (static geometry — no props, no FX), raw arm-vs-`c0`:

| shot | arm | moved px | ΣΔL | max ΔL |
|---|---|---|---|---|
| `hero` | c070 | 9,954 | 2,289 | 45 |
| `hero` | c085 | 14,475 | 8,464 | 74 |
| `hero` | c100 | 17,527 | 10,961 | 72 |
| `hero` | **c0b (phase floor — same cut as c0)** | **17,787** | **10,098** | **79** |
| `temple` | c100 | 3,739 | −474 | 32 |
| `temple` | **c0b (phase floor)** | **4,362** | **−610** | **31** |

**`c0b` moves more pixels than `c100`, with comparable total lift, at an identical setting.**
Signal-to-phase is below 1 on both shots. No statistic computed over these frames can attribute
a difference to the knob.

Corroborating, on the temporally-masked "stable" annulus, the effect is **non-monotone** in cut
(`hero` moved-px 122 / 92 / 53 and mean ΔL 5.91 / 19.54 / 8.27 across c070 / c085 / c100). The
mechanism under test is monotone by construction — a lower threshold cannot feed *less* bloom —
so non-monotonicity is itself the tell. The prereg anticipated exactly this and required the
undercoverage diagnosis before any verdict; this is that diagnosis, and it comes back positive.

## 3. The null image — and a misreading it caught, which was mine

Cropping on the *measured* strongest change rather than on the LOOK box centre, the ×8 amplified
`c100 − c0` difference showed two tight, compact, warm elliptical blobs: textbook §7.3 "tight
coloured halo, not a grey wash". **I read that as the mechanism working.** It is not.

The same crops rendered as `c0` vs `c0b` — *both cut = 0* — reproduce **the same blobs, at the
same positions, at the same amplitude**. Files:
`scratchpad/NULL-{hero,temple}-*-c0_vs_c0b-x8.png` beside `scratchpad/L2-*-diffx8.png`.

The entire visible effect is FX phase. The lesson is §13's in its sharpest form: *a difference
image is not evidence until the same image has been rendered on a known-null pair.* The blobs
were persuasive precisely because they had the shape the prereg predicted.

This also disposes of an intermediate inference of mine that was wrong: I argued the moved pixels
were static (they survived the temporal mask) and therefore could not be animated FX. The 2-phase
mask makes that inference invalid — a pixel can agree at the two bracket phases and differ at the
three between them.

## 4. Two prereg design faults, independent of phase, to fix in the next seal

Both would have degraded this run even with perfect phase control:

1. **MECH's statistic cannot see MECH's effect.** The registered statistic is p95 display-L over
   the whole stable annulus (`hero` n = 45,984). The effect population is ~50–130 px. The 95th
   percentile sits at rank ~2,299, so an effect two orders of magnitude smaller than the ROI is
   invisible **by construction**, whatever its amplitude. This is §12/§24.3 arriving from the
   metric side: the ROI was scoped to where the halo *should* be, and the statistic was scoped to
   the whole of it. Next seal: report the moved-subpopulation count and its ΔL distribution, with
   the percentile as a secondary.
2. **F2' cannot see the leak it is for.** It samples the *brightest 1,000* non-metal px ≥200 px
   from gilded. The moved population is not the brightest; a frame-wide scan finds 1,072 moved px
   at ≥200 px on `hero` and 346 on `temple` that F2' never sampled. Its PASS (mean |ΔL| 0.000) is
   true as written and does **not** establish "no scope leak". Next seal: select the population by
   *movement*, then classify it, rather than selecting by brightness and measuring movement.

## 5. The fix for the next run — the drift is injected by `step()`, and it is a one-token change

**Where the phase drift comes from, exactly.** Two frame-advance paths exist and they differ:

| path | call | effect on `engine.time` |
|---|---|---|
| `__GAME.capture()` | `engine.renderFrame(0)` (`Debug.js:139`) | `dt = 0` → **no advance** |
| `__GAME.step(n)` | `engine.renderFrame(1/60)` (`Debug.js:125–127`, default `dt = 1/60`) | **+n/60 s** |

`renderFrame` sets `this.dt = Math.min(raw, 1/20) * timeScale; this.time += this.dt`
(`Engine.js:251–254`). So every `step(n)` a runner makes between arms advances the world clock,
and each arm is captured at a **different** `engine.time` — which is precisely the per-arm phase
the bracket then measures. Nothing else is needed to explain the whole result.

Every animated term rides that clock: `grep -rn 'performance.now()\|Date.now()' src/fx/
src/render/` returns **nothing**, and `Particles.update(dt, t)` publishes `t` straight into every
`uTime` uniform (`src/fx/Particles.js:2586–2620`).

**Preferred fix — surgical, no global state:** call **`__GAME.step(n, 0)`** instead of
`__GAME.step(n)`. Frames still advance (so a poked uniform still propagates through the per-frame
republish, since `update()` is called either way), but `dt = 0` so `engine.time` — and every FX
phase — is frozen. One extra argument in the runner; no `src/` change; nothing to restore.

**Equivalent alternative:** `engine.debug.paused = true`, which forces `dt = 0` in `renderFrame`
regardless of the passed value (`Engine.js:253`). Same result, but it mutates engine state and
must be restored.

Either is strictly stronger than §24.4's registered remedy (duplicate-arm bracket + emitter
mask), which *estimates* the noise where this *removes* it. Keep the `c0`/`c0b` bracket as the
falsifier: with the phase pinned it must go to **exactly zero moved pixels** — a bit-identity
check, and a far sharper instrument than a 40% band.

Recommended re-run: same ten arms, `debug.paused` set, `c0`/`c0b` bit-identity as F0b. If `c0b`
is not bit-identical to `c0`, the pin failed and nothing else in the run may be read.

## 6. What is still true from §25, and what is now open

- §25's finding that the *gain* formulation is inert (RESULT-goldhalo) is untouched by this run.
- §25's routing of the gold-hot line to the *onset* formulation is **neither confirmed nor
  refuted**. It is the open question the re-run exists to answer.
- The registered TGT expectation (no stable halo px ≥ L235; upper bound 201) was *reported* as
  met, but rests on the same voided population and should not be quoted. The §7.3 "gold-hot"
  line does **not** close on this evidence.
- DG (`temple` architrave px newly ≥ L200 = 0) is consistent with no stone blowout and the
  crops show no surrounding wash — but it is a threshold test over a voided population, so it is
  reported as "no evidence of a distance-guard failure", not as a PASS that licenses a ship.
