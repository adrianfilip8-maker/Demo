# ADDENDUM to PREREG-creamfix — V3's "0 px" bar needs a phase falsifier, registered BEFORE frames

**Written while `shots/creamfix/` is empty and creamfix holds the capture lock** (booted
14:48:50Z at `d0f781c`; the only dirt in its provenance stamp is my own untracked
`PREREG-rimstarve.md`, a records file, no `src/` change). Nothing below re-tunes a sealed band.
It adds one falsifier and one scoring rule that the seal's V3 needs and does not have.

## Why this is being added now

`RESULT-goldonset.md` (scored ~20 min ago, same batch) established that **a two-phase
duplicate-arm bracket detects FX-phase noise but cannot remove it.** The temporal mask is built
from `c0` vs `c0b`, so it nulls the bracket arm *by construction* while leaving the intermediate
arms at their own independent phases. On goldonset the phase floor exceeded the knob's entire
effect: `c0b` moved **more** pixels than `c100` at an identical setting.

PREREG-creamfix's **V3** reads:

> `base` vs each `fXXX` arm must differ on **0 px** outside the subject … Any nonzero masked
> off-subject diff → vSlySkin scope leak → **run invalid for ship** regardless of V1.

That bar is exactly the shape goldonset just broke. `night` carries torches, shafts and
sparkles; if any of them drifts in phase between arms, the stable mask will undercover, the
off-subject diff will be nonzero, and **V3 will report a `vSlySkin` scope leak that is really
FX phase** — invalidating a run whose fix may be perfectly scoped. The seal's own mechanism
argument (architecture is bit-identical because `vSlySkin = 0` makes the blend factor exactly 0)
would be overturned by an artefact.

## The falsifier — free, already in the run, decides which scoring rule applies

The run already captures `base` and `baseB` on **both** shots. Score this first, per shot:

**PHASE — `base` vs `baseB`, whole frame, raw (no mask):**

- **bit-identical (0 px)** → that shot has no phase drift. V3's "0 px" bar is sound as sealed,
  and any nonzero off-subject diff on that shot is a **real scope leak**. Score V3 verbatim.
- **not bit-identical (n > 0 px)** → that shot has phase drift the 2-phase mask cannot remove.
  V3 is then scored as **"off-subject moved px ≤ PHASE floor, and no off-subject cluster absent
  from the `base`/`baseB` null image"**, not as "0 px". A V3 exceedance is only called a scope
  leak if it **survives the null image** (§3 below).

The seal predicts `sly-closeup` has no animated emitters — so `sly-closeup` PHASE = 0 px is the
*expected* outcome and, if it holds, the verdict frame's V3 keeps its full sealed strength. This
addendum changes nothing in that case. It only supplies the branch for `night`, where the seal
itself acknowledges torch/shaft FX.

## The null image, mandatory before any V3 exceedance is called a leak

Any off-subject population V3 flags must be rendered **twice**: once as `base` vs `fXXX`, once as
`base` vs `baseB` (identical settings), same crop, same amplification, side by side. This is the
control that caught goldonset's misreading — two tight warm blobs that looked exactly like the
predicted mechanism and reproduced identically at an unchanged setting.

*A difference image is not evidence until the same image has been rendered on a known-null pair.*

## Scope of this addendum

- It does **not** touch V1, V2, V4 or V5, or any band, ROI or threshold in them.
- It does **not** weaken V3 where the falsifier passes; it makes V3 conditional on an
  instrument check the seal assumed rather than measured.
- V4's night off-subject clause ("arch/cones/sparkles untouched — 0 px") inherits the identical
  branch, for the identical reason. `night` is the shot most likely to need it.
- If PHASE is nonzero on `sly-closeup` — contradicting the seal's "no animated emitters" — that
  is itself a finding and is reported as one, because the verdict frame would then be noisier
  than its seal assumed.

## Standing recommendation, carried from RESULT-goldonset §5

Both of these runs would be sharper with the phase **pinned** rather than bracketed. The drift is
injected by one default: `__GAME.step(n)` advances `engine.time` by `n/60` s
(`Debug.js:125–127`, `dt = 1/60`), while `__GAME.capture()` uses `renderFrame(0)` and advances
nothing (`Debug.js:139`). Every animated term rides `engine.time` — no `performance.now()` or
`Date.now()` anywhere in `src/fx` or `src/render`.

**The fix is one extra argument: `__GAME.step(n, 0)`.** Frames still advance and poked uniforms
still propagate (`update()` runs either way), but the clock is frozen, so all arms share one FX
phase. Pinned, the `base`/`baseB` bracket must go to **exactly zero** moved pixels — turning it
from a 40%-band estimate into a bit-identity check. Runner change, not a `src/` change. Not
applied to creamfix, which is already in flight; registered for the next seal in this family.
