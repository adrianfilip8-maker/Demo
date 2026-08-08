# RESULT-cel1 — UNSCOREABLE by its own seal, and it found something bigger

Runs `PREREG-cel1.md`. **Verdict: UNSCOREABLE.** The calibration arm failed, and the seal says that
makes every other number void — including the one I wanted.

## The registered outcome

| id | quantity | band | measured | |
|---|---|---|---|---|
| **KB** | character meanL, `KB` vs `cand` | ≥ 15 L on ≥3 of 4 ROIs | **0.0, 0.0, 0.0, 0.0** | **FAIL → UNSCOREABLE** |
| P1 | character ΔFLAT, `cand`−`base` | ≥ +10 pp | **+30.61 pp** | not claimable |
| P2 | KayKit ΔFLAT | ≥ +8 pp | +1.84 pp | not claimable |
| P3 | world ΔFLAT / ΔL | <3 pp, <4 L | +0.08 pp / 0.02 L, −0.02 pp / 0.06 L | PASS |
| P4 | `restore` vs `cand` | <1 L | all < 1 L | PASS |
| C1 | character median ΔL | not < −25 | +70.0, +102.7, +0.2, +71.4 | ok (brighter, not darker) |
| C3 | character max L | ≤ 235 | 169, 169, 178, 184 | ok |

**P1 is +30.61 pp and I am not claiming it.** That is the entire purpose of sealing a calibration arm
in advance: the number I wanted came back three times its band, and the arm that certifies the
instrument came back zero. A result that survives only by discarding its own control is not a result.

## What the failure actually localizes to — and it is not the alias

The KB arm moved `uTermHi` 0.52 → 0.95, which should collapse the lit band across the whole frame.
It moved **nothing, anywhere** — including `temple/column_R`, which is `Architecture` geometry built
through `shading.toon()` and is unambiguously a toon material, and which sat at FLAT 1.4 / meanL
169.6 in both arms.

So the ramp lever does not reach the shader **on any surface**. That is §210.2 arriving a second
time, on a different uniform in the same shared block, and it is now confirmed by *pixels* rather
than by an API read.

**The alias, meanwhile, demonstrably worked.** The runner's boot probe — written before the capture
and not a threshold — reports:

```
boot A (cel=off): shading.make = undefined   character material isToon = false
boot B (cel=on):  shading.make = function    character material isToon = TRUE
```

and P3 shows the world unchanged between boots, so the +30.61 pp on the character is not cross-boot
drift. The evidence that §213's fix reaches the character is strong. It is simply not *this run's*
evidence, because this run voided itself.

## My error in designing the seal

I built the calibration arm on `setRampTuning` — **the one uniform path this project had already
documented as broken.** §210.2 is titled "`debugTerm` does not reach the shader" and `uDebugTerm`
lives in the same shared block as `uTermHi`. I read that entry, wrote it, and then chose a lever
from inside the known-broken subsystem to certify an unrelated fix.

The arm did its job — it refused to certify — but a calibration arm that cannot fire is worth less
than no arm at all, because it converts an unmeasurable run into an apparently rigorous void.

## The mechanism is NOT established, and I am not guessing at it

`rampwire.mjs` probed the live page. What it establishes:

- `sh.uniforms.uTermHi` exists, and the setter writes it: **0.52 → 0.95**, persisting across renders.
- The rendered frame does not change.

What it does **not** establish, despite appearances: it reported `uTermHi` absent from every
material's uniform bag and `nUniforms: 0` on four compiled programs. **A compiled program cannot have
zero uniforms**, so that accessor is wrong — `userData.slyUniforms` is the per-material `own` bag
(which carries `uTermSoft`, not `uTermHi`), and `currentProgram.getUniforms().seq` was not read
correctly either. That is the third probe in this project to return a confident, plausible, wrong
null on this exact subsystem (§210.2, §211.4). I am reporting the pixel fact and explicitly not the
mechanism.

## Consequences

1. **Task #25 (the `termHi` 0.52 → 0.62 A/B) is BLOCKED.** Its entire lever is `setRampTuning`. It
   cannot be run until this is fixed — and had cel1 not carried this arm, #25 would have run, moved
   nothing, and been written up as "the terminator move does nothing", which is false.
2. **§213 needs a re-run with a calibration arm that does not touch the shared uniform block.** The
   boot probe (`isToon` true/false) is structural evidence and should be promoted to a registered
   gate; the pixel calibration needs a lever known to move the frame.
3. §210.2 is upgraded from "a debug channel is broken" to "**the shared uniform block does not reach
   the shader**", which is a live rendering defect affecting `setRampTuning`, `debugTerm`, and
   anything else written through `Shading.uniforms` after material construction.
