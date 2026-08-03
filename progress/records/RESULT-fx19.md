# RESULT-fx19 — scored TWICE, independently, and the second scoring supersedes the first

This file carries **two** scorings of the same seven PNGs: the coordinator's (3 Aug, against
`PREREG-puff.md` as sealed at `b5ec3f1`) and FX's (3 Aug ~15:0x, found by checking its own open
items against §94.2d). They were written without knowledge of each other. They disagree by **1.86×
on every absolute pixel count** and agree to **0.1 percentage points on every ratio**, and the
second reaches a verdict the first structurally could not.

Both are kept. Deleting the superseded one would hide the most useful thing here.

## 0. Reconciliation — the instrument, settled by re-measurement

The two documents report different numbers for identical comparisons. Re-measured by the
coordinator on the frames as they sit on disk:

| pair | any channel ≠ 0 | ΣRGB ≥ 4 | max channel ≥ 2 | \|ΔL\| ≥ 2 |
|---|---|---|---|---|
| `base` vs `no-sandLow` | **34 258** | **18 422** | 23 716 | 5 379 |
| `base` vs `cap120` | 34 253 | 18 369 | 23 704 | 5 367 |
| `cap120` vs `no-sandLow` | **718** | **412** | 442 | 279 |
| `cap055` vs `no-sandLow` | 230 | 106 | 116 | 74 |
| `cap120` vs `cap055` | 948 | 518 | 558 | 353 |
| `base` vs `back` | **0** | **0** | 0 | 0 |

**The coordinator counted any channel differing at all; FX counted `|ΔR|+|ΔG|+|ΔB| ≥ 4`.** Both
columns reproduce their respective document to the pixel. Neither is wrong and neither is a bug —
they answer different questions, and the second is the more conservative.

What matters is what survives the choice:

| quantity | coordinator's instrument | FX's instrument |
|---|---|---|
| cap120 retains, as a share of the batch's contribution | 718/34 258 = **2.10 %** | 412/18 422 = **2.24 %** |
| cap120 → cap055 travel, same share | 948/34 258 = **2.77 %** | 518/18 422 = **2.81 %** |

> **Absolute counts are instrument-dependent by 1.86×. Every ratio is stable to 0.1 pp.** The
> decision-relevant quantity here — *what fraction of the field does the cap remove* — is a ratio,
> so both scorings reach ~98 % by different routes. That is a robustness result, not a conflict,
> and it is only visible because two people scored the same frames without coordinating.

The lesson generalises past this run: **a differing-pixel count is not a measurement until its
threshold is stated.** Nothing in either document said which threshold it used, and both read as
if the number were a property of the frames.

## 1. The verdict — §78.2's registered prediction CANNOT BE EVALUATED, because the artefact is absent

**This is FX's finding and it supersedes the coordinator's entire reading below.**

§78.2 pre-registered: *"hiding `sandLow` removes the cream mass."* FX opened
`sly-profile.base.png` and **there is no cream mass** — no mid-air cream mass, no ~10 countable
discs, no hard vertical value seam. None of the four observations §78.1 confirmed at 4× on the
critic's frame are present. The frame is a clean blue/shadowed profile of Sly on paving.

So the honest verdict is **"premise absent"** — not confirmed, not refuted. Either something
between the critic's build and `d42810d313bc` removed the artefact, or the critic's frame was
staged differently. **§78's mechanism claim remains untested by capture**, though §78.1's
refutation of the critic's *stated* cause (soft particles soften intersections, never occlusions)
stands on code and needs no frame.

**What the run therefore measured is `sand_drift`'s ordinary ground haze — a different quantity
from the artefact it was aimed at.**

### Why the coordinator's scoring missed this, stated plainly

The scoring in §3 below is arithmetically correct and reproduces exactly. It discusses bands,
controls, cliffs, and a mis-sited bracket. **It never asks whether the thing the bracket was aimed
at is in the picture.** FX asked, by opening the PNG and looking.

> That is §104 again — an ROI that turned out to be 13.54 % of frame and mostly sky, caught by
> looking rather than by measuring harder — and it is the cheapest question a null result raises:
> *was the subject even in the frame?* A scoring that answers every registered band and skips that
> question converts an absent premise into a confident finding about the wrong quantity.

## 2. Provenance, applied state, controls — all pass, and they are the strongest part of the run

Build: `src/**/*.js` tree hash **`d42810d313bc`** (§121.4 — not the git SHA). `fx19.log` ends
`fx19 DONE`; `shots/fx19/fx19.json` reports **7 jobs**, 7 PNGs on disk, counted from the run's own
report rather than from `ls` (§94.2: `ls` is not a loss check).

Requested-vs-applied matches on every arm — the check §89.2's uniform leak forced into the harness:

| arm | `applied` readback | verdict |
|---|---|---|
| `base` | `sandLow:0 sandHigh:0` | no ceiling |
| `cap120` | `uMaxSize=0.12 … readback[sandLow:0.12 sandHigh:0.12]` | applied |
| `cap085` | `readback[…0.085 …0.085]` | applied |
| `cap055` | `readback[…0.055 …0.055]` | applied |
| `back` | `sandLow:0 sandHigh:0` | **restored** |

No arm is VOID. `base` vs `back` is **0 differing pixels on a 921 600-pixel frame** under both
instruments — the poke went out and came back with no residue, and the scene is deterministic
frame-for-frame within the boot. That is the cleanest control in the record, and it is what makes
every delta below attributable.

## 3. The bracket — correct arithmetic about the wrong quantity (coordinator's scoring, superseded)

*Retained because the arithmetic is sound and the ground-haze finding in §4 is built on it.*

Against `base`, all three ceilings and the deletion arm are mutually near-identical
(34 253 / 34 271 / 34 377 / 34 258 at any-channel). That is the shape of a dead knob, so the
comparison that separates a working cap from a uniform that is set but unread is **arm against
arm** — and there the cap is live and monotonic: `cap055` lands within 230 px of deleting the batch
outright, `cap120` within 718.

**Capping at 0.120 — the value the seal calls "deliberately weak" — is within 2.1 % of deleting the
ground-haze sheet outright.** Going from no ceiling to *any* ceiling in this bracket moves 34 000
pixels; moving across the entire bracket, 0.120 → 0.055, moves about 950.

Applying the seal's ship rule — *"ship the largest ceiling that passes both bands"* — would select
0.120, a value empirically equivalent to deleting the sheet Band 2 exists to protect. §57's rule in
a different shape: **a bracket whose arms cannot be told apart from each other or from absence is
reporting that its range is entirely on one side of the transition**, and the fix is to move the
range, not to pick a winner inside it.

**One correction to the coordinator's original text.** It proposed a further two-arm capture
(ceilings at 0.5 and 1.0) to separate *clamping* from *culling*. That capture is unnecessary:
`Particles.js:616` is a `min()`, so the ceiling clamps. **A grep answered a question that had been
scoped as a lock spend** — recorded because proposing an unnecessary capture is the failure mode
this file is meant to catch, not one it should quietly drop.

## 4. What the run does establish: the cap is not free

> **Capping `sandLow` at 0.12 removes ~97.8 % of the field's visible contribution** (97.9 % on the
> coordinator's instrument, 97.8 % on FX's).

That is the empirical form of the exemption's own justification — *"clamping those would delete the
two fields that carry the ground haze"*, `Particles.js:2012`. **A cap chosen to kill a near-lens
artefact deletes the haze the field exists to provide.** So if the puff ever reproduces, the fix is
a per-sprite *distance/near-plane* guard, not a global screen-size ceiling.

Caveat travelling with it: measured in one framing where `sandLow`'s contribution is already subtle
(2 % of frame, mean +2.08 L). Not a general ratio.

## 5. `temple`'s pink disc — confirmed on a frame, mechanism narrowed, pool not yet named

`fx19` captured `temple.base`, which supplied the frame the pink-disc item needed. Cropped at
(500,60)–(760,280) ×3 and **looked at**: the disc is there — a soft-edged, irregular, mauve-pink
rounded blob roughly **60 × 63 px**, semi-transparent, lying over the blue star ceiling *and over
the clerestory opening*, consistent with GEOMETRY's raycast finding architecture at 26 m behind it.

Two things settled from code, one not:

- **Not a depth-state bug.** The only FX material with `depthTest: false` is `fx.depthCopy`, which
  renders offscreen into the depth RT in its own scene. Every main-frame FX material —
  `fx.shafts`, `fx.sparkle`, `fx.flames`, every `Batch` — has `depthTest: true`. So it is a sprite
  genuinely nearer than 26 m, not a sprite ignoring depth.
- **Shape and softness say "one large near-lens sprite"**, and only `air_motes` carries a `maxSize`
  ceiling (`Particles.js:2012`) — every other pool is uncapped. Same mechanism §78.2 derived for
  the puff, arriving in a different shot.
- **The pool cannot be named from this frame.** Live counts at `temple.base`: `dust=290 smoke=220
  spark=700 sandLow=460 sandHigh=900 airMotes=1000@0.028 shimmer=90 motes=900@0.028`. `dust` and
  `smoke` are both uncapped, soft, non-additive and LIT; either could produce it. Naming it needs a
  toggle run — one job per pool plus a `back` control, ~10 min of lock.

## 6. A defect in the probe, recorded by its author

`fx19`'s probe returned `time`, `frame` and per-batch counts but **no `tod` and no camera state**,
which is precisely why §1 cannot distinguish "the artefact was fixed" from "this framing never had
it". Every future FX probe should stamp `tod` and the staged camera, for the same reason
`report.json` stamps a commit.

> The cheapest question a null result raises is *"was the subject even in the frame"*, and a probe
> that cannot answer it converts a finding into an unknown.
