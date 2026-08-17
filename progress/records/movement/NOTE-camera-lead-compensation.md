# Camera lead: the full-compensation question, with numbers and no decision

**For the lane driving the game with real input.** This is an arbitration package, not a proposal.
Everything below is measured on the live `CameraRig` against a stub player held at constant
velocity until settled; nothing is derived from a formula except where it says so.

Background is `KNOWN_ISSUES.md` §422.3 and the comment on `_pivotGoal`. The short version:

- `FRAMES.lead` is applied to the follow **goal**. What reaches the frame is the goal minus the
  follow spring's own trail, and a critically damped `smoothDamp` tracking a constant-velocity
  target settles exactly `smoothTime × v` behind it, where `smoothTime` is `followTimeH × stiff`.
- So **`f.stiff` silently subtracts from `f.lead`**, and `leadMax` bounds the lead while nothing
  bounds the trail — so past a crossover speed the net lead changes sign.
- A **floor** shipped (commit `48d786d`): the lead is raised to the trail when the authored value
  is smaller. That corrects the sign and touches nothing that was already leading.
- **Full compensation** — making `FRAMES.lead` deliver what it says — is the open question.

---

## The three-way, measured

`lead` is the signed distance from the player to the look-at pivot **along travel**, in metres;
positive means the pivot is ahead of him. `ndcY` is the vertical screen position of Sly's mid-body
(−1 = bottom edge, 0 = centre, +1 = top). `camDist` is camera-to-subject in metres, which is what
apparent size is inversely proportional to.

```
                              |            lead (m)            |         ndcY          |  apparent size
  framing        key       v  |  PRE-FLOOR   SHIPPED     FULL   |  PRE    SHIP   FULL   |  FULL vs SHIPPED
  ────────────────────────────────────────────────────────────────────────────────────────────────────
  move          idle      7.2 |    -0.939    -0.043     0.386   | -0.148 -0.216 -0.256  |   +7.6 %
  hookSwing     hook_swing 8.0|    -0.207    -0.037     1.713   | -0.258 -0.268 -0.397  |  +25.4 %
  railSlide     rail_slide 9.5|     0.511     0.511     1.727   | -0.067 -0.067 -0.149  |  +22.5 %
  railSlide@max rail_slide 15 |    -0.148     0.022     1.772   | -0.034 -0.042 -0.152  |  +32.6 %
  railWalk      balance    2.4|    -0.614    -0.081     0.000   | -0.366 -0.425 -0.434  |   +0.9 %
  fall          air       7.2 |     0.217     0.217     1.426   | -0.256 -0.256 -0.389  |  +22.7 %
  paraglide     glide     5.6 |     0.207     0.207     1.372   | -0.330 -0.330 -0.445  |  +14.3 %
  sneak         sneak     1.4 |    -0.250    -0.089     0.030   | -0.161 -0.184 -0.201  |   +3.1 %
  wallRun       wall_run  4.8 |     0.308     0.308     1.000   | -0.302 -0.302 -0.376  |  +12.1 %
```

**PRE-FLOOR** is the rig as it shipped before `48d786d`, reproduced with the framing-routing fix
held constant so the two changes are not conflated (a scratch copy of the current file with only
the two floor lines removed). **FULL** is the shipped rig fed the `TUNE` values that make its own
arithmetic land on full compensation, per framing — no second implementation of `_pivotGoal`, so
the numbers cannot drift from the code they describe.

---

## The thing to notice before looking at any frame

**Ordinary ground running is the smallest change of the nine.** +7.6 % apparent size and 2 % of
frame height lower. If the question is "does full compensation help", running is the case least
able to answer it.

The decision lives in the airborne framings — `hookSwing` +25.4 %, `railSlide` at top speed
+32.6 %, `fall` +22.7 % — and it lives there for a structural reason rather than a coincidental
one: those are the framings with both a large authored `lead` **and** a high speed, so they are
the ones where `leadMax` was already clipping the raw lead while the trail kept growing. That is
the defect at its worst and also the change at its largest.

## What to watch for, phrased so a frame can refute it

1. **Running (`move`, 7.2 m/s).** Predicted to read as no change or a mild improvement. If it
   reads as *worse* — Sly too close, too low — then the shipped floor is already at the right
   place and full compensation is refused on the case it barely touches, which would be a strong
   result.
2. **Hook swing.** The authored comment is *"Lead frames the landing"*. Under SHIPPED it delivers
   −3.7 cm; under FULL it delivers 1.713 m and Sly drops from ndcY −0.268 to −0.397. The question
   is whether the landing is now framed or whether Sly is falling out of the bottom of the shot.
   `ledge_hang` and `balance` already sit at −0.42 to −0.44 without complaint, so −0.397 is inside
   the range this camera already uses — but at 25 % larger.
3. **Rail slide at `railMax` 15 m/s.** The largest change in the table. Also the shortest-lived
   state, so it may be the least worth optimising for.
4. **Paraglide.** Already the lowest-framed state at −0.330; FULL takes it to −0.445, the lowest
   number in the table. This is the one most likely to look wrong.

## The cost side, which is why this is not a constant edit

To deliver the authored lead at every row above, the **raw** cap would have to reach **4.845 m**
(railSlide at railMax) against today's `leadMax` 1.75. Keeping the delivered lead capped at the
current 1.75 instead means the cap has to be applied in *net* space — `leadMax + trail(v)` in raw
terms, which is speed-dependent:

```
  framing        authored (s)   trail (s)   leadMax binds above   raw cap needed at the row's v
  idle              0.0595       0.1840          29.4 m/s                 0.428 m
  hook_swing        0.2720       0.2400           6.43                    2.176
  rail_slide        0.3230       0.1280           5.42                    3.069  (4.845 at railMax)
  balance           0.0340       0.2560          51.5                     0.082
  air               0.2040       0.1680           8.58                    1.469
  glide             0.2550       0.2080           6.86                    1.428
  sneak             0.0850       0.2000          20.6                     0.119
  wall_run          0.2210       0.1440           7.92                    1.061
```

So the change is **not "raise `leadMax`"**. It is *"`leadMax` stops being a bound on the lead and
becomes a bound on the lead net of the trail"*, which changes what the constant means. Four of the
eight framings never reach their bind speed in this game and are unaffected either way; four do.

That structural point is the whole reason this was not landed with the floor. §422.3: a correct
measurement that forces a feel re-derivation is not a one-line fix.

## Reproducing

The instrument is `tests/camlead.test.mjs`'s `settledLead()` — same harness, same stub, same
14 seconds to settle. The FULL column is produced by setting, per framing:

```
  TUNE.leadTime = leadTime0 + (followTimeH * stiff) / lead
  TUNE.leadMax  = leadMax0  + (followTimeH * stiff) * v
```

which makes the shipped code compute full compensation without being modified. The PRE-FLOOR
column needs the two floor lines in `_pivotGoal` removed; everything else is stock.
