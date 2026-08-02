# PREREG — `hero` silhouette: the cane hook is inside the torso (SRC-FROZEN prep)

Sealed BEFORE any implementation edit. `src/player/**` at seal time is **4d9bb82**, verified
byte-identical to HEAD `d0f781c` (`git diff --stat 4d9bb82 d0f781c -- src/player/` empty), and
the freeze is intact — the instrument reproduces the same numbers against a `git archive` of
4d9bb82 as against the working tree, digit for digit.

---

## The premise I was given was stale, and the measurement says so

The task was "`perch_idle` has no line of action (hips 0.000, chest 0.006, head −0.007)". That
figure is in KNOWN_ISSUES §9 and was re-transcribed into `RESULT-cap6-verdicts.md` today. **It
describes a tree that stopped existing at commit 5d0441e** ("Ledger #17: … perch lateral line by
roll opposition"), which authored the lateral S-curve and recorded its own measured-after
values.

`node tools/poseprobe.mjs perch_idle`, current tree:

```
S-curve   hips x 0.045   chest x 0.082   head x 0.046
```

+3.7 cm out on the lower segment, −3.6 cm back on the upper. **The line of action is present and
landed.** What was never done is *verifying it in pixels*, which is a different task with a
different remedy, and authoring a second lateral lean on top of the first would have doubled it.

This is §18's shape (a model validated against a dead tree) arriving through a relay: the record
was right when written, and three commits later it was a confident number about nothing.

## What is actually wrong with `hero`, measured

`$SCRATCH/silmerge.mjs` (frozen at this seal, copied to `progress/records/silmerge.mjs`) renders
the figure at the size `hero` really delivers — **120 px at 720 rows** — with every pixel tagged
by which part owns it, and reports how much of the union *outline* each signifier owns and how
much of each part's own boundary is buried inside the figure. §7.3's silhouette condition names
cap / mask / tail / cane; this gives three of them a threshold (mask is colour, not outline, and
is out of scope here — `shotsil`'s own header records why a black silhouette cannot test it).

Baseline, `hero` / `perch_idle` / 720 rows / tree 4d9bb82:

| | px | % of union outline | own boundary buried |
|---|---|---|---|
| cane **hook** | 190 | **5.5%** | **41.2%** |
| cane shaft | 238 | 11.9% | 21.6% |
| tail | 1355 | 19.2% | 28.2% |
| head+cap **cluster** | 903 | 11.0% | 39.4% |
| hook aperture (1 − px/hull) | | **0.235** | |
| widest background channel at the neck | | **5 px** | |

Looked at before any of this was counted (`base-hero-parts6x.png`, `sil6x`, `sil1x`): the tail is
a big ragged C and reads; the shaft reads cleanly against sky; **the hook sits in the middle of
the torso**, a small blob on a grey mass, and what little of it reaches the outline is a bump.
The brief's "if the cane hook is not clear in silhouette, it is not doing its job" is failing,
and it is failing by *position*, not by shape or size.

**Two hypotheses tested and killed before the fix was chosen** — both cheap, both would have been
plausible in a write-up:

- *"The aim cannot move the hook; the grip does, as with `CANE.plant`'s tip height."* False. A
  6-aim probe moves the hook centroid over 42 px of a 134 px canvas. The tip-height invariance
  is about a fixed radius from a fixed grip and does **not** generalise to screen position.
- *"The right arm is the lever."* False, and backwards: all five arm variants tried made hook
  burial worse (41.2% → 47.9–77.4%). The shipped arm is the best of them.

## The change (cane aim only)

`perch_idle`'s cane aim `[-40, 40, 80]` → **`[-20, 30, 130]`**, delta **(+20, −10, +50)**.

Per §9's orphaned-key trap — these are **absolute** angles and every breath key carries its own
copy — the same delta applies to all four cane keys, preserving the ±4° breath swing about the
new centre:

```
t 0     [-40, 40, 80]  ->  [-20, 30, 130]
t 0.8   [-36, 36, 80]  ->  [-16, 26, 130]
t 1.7   [-44, 44, 80]  ->  [-24, 34, 130]
t 3.2   [-40, 40, 80]  ->  [-20, 30, 130]
```

Nothing else moves. **The tail is explicitly not touched**, and that is a finding rather than
caution — see "what the co-sweep killed" below.

Predicted (in-memory override, identity-controlled: re-stating the base aim through the override
path reproduces the baseline to the digit, so the deltas below are the change and not the
mechanism):

| metric | baseline | predicted |
|---|---|---|
| hook % of union outline | 5.5% | **9.1%** |
| hook boundary buried | 41.2% | **24.7%** |
| hook aperture | 0.235 | **0.492** |
| neck channel | 5 px | **12 px** |
| tail % of outline | 19.2% | 17.8% |
| head+cap cluster buried | 39.4% | 39.4% |
| cane tip, model y vs lowest boot | **−0.063 vs −0.061 (in the ledge)** | +0.059 (clear) |

Cost: **0 triangles** (an aim, not geometry) — so §27.3's ×2 ink-shell multiplier does not apply
here. Stated because a character prereg that does not mention it is now assumed to have forgotten.

Blast radius, per §26.4 (a lever must be evaluated everywhere it reaches): `perch_idle` is used
by **exactly one** canonical shot — `grep perch_idle src/core/Shots.js` returns `hero` alone. It
is also the in-game perch state, which no capture covers; that is unmeasured, not fine.

## What the co-sweep killed, and why it is the most important line here

The obvious second fix was to sweep the tail so the cap stops being welded to it — per-part
numbers said cap burial was **74%**. A 96-row joint sweep over tail yaw × cane aim says do not:

1. **The 74% was an instrument artefact.** Scored per part, the cap/skull seam counts as
   "burial", but that seam is *internal to one blob* and invisible in a silhouette. Re-scored on
   the **head+cap cluster**, baseline burial is **39.4%**, not 74%. A band built on the per-part
   number would have optimised a line nobody can see. The cluster metric is the sealed one.
2. **The two fixes are not independent.** Tail sweep + cane aim together drives hook outline
   ownership to **1.5%** and burial to **88.2%** — worse than baseline on the condition being
   fixed. The tail swings into the screen region the hook had just been moved into.
3. With the corrected metric, **every candidate that beats baseline is cane-only, tail
   untouched.** The tail arc — which KNOWN_ISSUES documents as re-aimed five times and fragile
   at the reach limit — should not be touched for this.

Had these been sealed as two independent preregs, both would have "passed" their own band and
the frame would have got worse.

## Instrument, and its baseline (§27.1)

`silmerge.mjs`, frozen at this seal. It derives **every ROI from live source** — part membership
from skin weights and material groups, the hook/shaft split from `cane.hookPoint` and
`CANE_TUNE.hookRadius × 1.6`. It therefore **cannot measure an old PNG**, and its baseline is not
a stored image: it is this file re-run against `git archive 4d9bb82` (already extracted to
`$SCRATCH/base-4d9bb82`, reproduction verified). Both endpoints name their sha or neither counts.

Transforms between this number and the renderer, stated as the gap (§11): no foot IK, no level
occlusion, no ink shell, no shader/PostFX. Shape only.

**The ink-shell correction is the size of some of these effects, so it is stated rather than
skipped** (§26.4's second half). The inverted hull dilates the outline ~2.5 px per side, which
*closes* thin gaps and *fills* small apertures:

- neck channel 5 px → closes in frame; 12 px → ~7 px survives. The band is set at ≥8 px offline
  for that margin, not at >0.
- hook aperture encloses ~59 px of background at baseline (≈8.7 px across → would close) against
  ~235 px predicted (≈17 px across → ~12 px survives).
- outline-ownership *ratios* are far more robust than either, since dilation applies to all parts.

## Registered bands — every metric partitions its outcome line (§26.1)

Measured on **`silmerge.mjs`, `hero`, 720 rows**, post-change tree, against the 4d9bb82 baseline
above.

**H1 — hook share of union outline (real ≥ 0), the primary:**
- FAIL-regressed: [0, 5.5) — below baseline
- FAIL-unmet: [5.5, 7.0) — no material gain
- IMPROVED-not-met: [7.0, 8.0) — direction right; routes to a second aim iteration
- PASS: [8.0, 100]

**H2 — hook boundary buried (%, 0–100):**
- PASS: [0, 30]
- IMPROVED-not-met: (30, 36]
- FAIL-unmet: (36, 100]

**H3 — hook aperture (real, 0–1):**
- FAIL-unmet: [0, 0.35)
- PASS: [0.35, 0.85]
- FAIL-degenerate: (0.85, 1] — a nearly-hidden hook scatters few pixels over a large hull and
  scores a *high* aperture. Named as its own band because it is the one way this metric is
  gameable, and it is caught by H1's floor besides.

**H4 — neck background channel (integer px ≥ 0):**
- FAIL-unmet: [0, 8)
- PASS: [8, ∞)

**Deletion guards (gates, not adjectives — no PASS may be claimed unless all hold):**
- tail share of union outline ≥ **17.0%** (baseline 19.2). The tail is half the silhouette and
  the brief says so; a hook fix that eats the tail is not a fix.
- head+cap **cluster** burial ≤ **42.0%** (baseline 39.4).
- visible hook ≥ **150 px** (baseline 190) — the anti-degeneracy floor under H3.
- cane tip model y ≥ lowest boot y (baseline **fails** this at −0.063 vs −0.061; the predicted
  aim clears it at +0.059). Recorded as a gate on the new value, not as a claim about the old.
- 52/52 clips present, `missing []`, zero new warnings.

Gate failure ⇒ no H verdict; routes as "band removed — aim regression", a named outcome.

**H-look (binding, judged FIRST, before any number is read):** house rule — view `hero` at 1×,
then the figure at 6×, before opening the table. The look criterion is mechanical so it cannot
diverge from the bands the way §26.2's "materially brighter" did: **in the pure-black silhouette
the crook must be identifiable as an open C with visible background inside its curve, and must
be traceable to its own shaft without crossing the torso mass.** Anything else is recorded as
observation and is non-binding.

## Verdict procedure

One `hero` frame, 1280×720, from the coordinator's post-freeze queue. Verdict frame:
**`<cap>/hero.png`**. `silmerge` is re-run on the post-change tree for the bands (it needs source,
not the PNG); the PNG carries H-look and is the authority on whether the offline shape survived
the ink shell, the level and the grade.

The offline instrument decides the bands; the capture can only **falsify** them — if the frame
shows the crook closed or buried where `silmerge` says it is open, the frame wins and the seal
records an instrument failure, not a pose failure.

## Outcome routing

- All bands PASS + gates: the `hero` cane condition closes. Residual §7.3 silhouette work on this
  shot is then head+cap cluster burial at 39.4%, which this change does not address and which no
  cane aim can.
- H1 IMPROVED-not-met: named next aim is **`[0, 30, 130]`** (measured 8.3% / 28.4% / 0.49 / 11 px,
  the runner-up in the same sweep) — one iteration, not a re-sweep.
- H2/H3 fail with H1 PASS: the crook reaches the outline but does not read as a C; next lever is
  the crook's *roll* about the shaft (the `[-40,40,80]` change already rolled it +110 for this
  reason), not its position.
- H4 fail alone: neck channel is a side effect here, not the target; record and route to a
  separate head/neck seal rather than re-aiming the cane to chase it.
- Any gate fails: revert the aim wholesale. It is four numbers in one clip; there is no partial.

**Remedy written as a function of state, not of schedule (§26.3):** if the verdict FAILs, the
aim does not remain in the tree — whether that means withholding a patch or reverting a commit
depends on where the queue put the capture, and either way the tree ends at `[-40, 40, 80]`.
