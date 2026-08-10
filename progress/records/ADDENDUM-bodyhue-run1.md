# ADDENDUM-bodyhue run 1 — VOID on the instrument, not on the candidate

Run 1 of `PREREG-bodyhue.md` is **VOID**. No threshold in the seal is touched, and none may be.

## What happened

`timeout 1500` killed the capture after two of the four registered shots — `sly-closeup` and
`sly-perch`, the two character shots. That alone would only make the run *incomplete*. Scoring the
two that did land is what showed the run is **unscoreable in principle**.

## The instrument is contaminated, and the reason is structural

The seal's instrument is a definitional mask: *only the body texture differs between arms, so
`costumeMask = { p : A(p) ≠ B(p) }` is exactly the pixels the costume reaches.* The premise is
false in this experiment.

`BODY_MODE` is read at **module load**, so each arm needs its own page load. Two page loads are not
bit-identical — §269 already recorded 2.69% of `dunes` pixels differing across boots from
alpha-tested vegetation and sparkle FX. So the mask captures *boot-to-boot noise plus the costume*,
with no way to separate them.

Measured, per-pixel maximum channel difference between arms:

| shot | differing px | ≤2 | 3–8 | 9–24 | 25–64 |
|---|---|---|---|---|---|
| `sly-closeup` | 28 783 | 12.0 % | 8.2 % | 22.8 % | **56.9 %** |
| `sly-perch` | 227 559 | **85.6 %** | 4.8 % | 2.5 % | 7.2 % |

A 21° hue rotation at these saturations moves a channel by *tens* of levels. `sly-perch`'s mask is
**85.6 % one-or-two-level noise** covering 24.69 % of the frame — that is not a costume, and the
scorer's own circular-median guard fired on it because the contaminated set spans reds as well as
blues.

`sly-closeup` is mostly genuine (56.9 % in the 25–64 band), and that difference between the two
shots is itself the tell: the same instrument behaved completely differently on two frames, which a
sound one would not.

## The numbers, recorded and INADMISSIBLE

`sly-closeup` read hue A 229.0° → B 210.8°, a shift of −18.2°; `sly-perch` read 195.0° → 195.0°.

These are **not evidence** and must not be quoted as a result: the first was computed over a
partly-contaminated mask flagged invalid by the straddle guard, and the second is meaningless.

They are written down anyway rather than suppressed, and doing so is safe for a specific reason:
**the thresholds are already sealed in a pushed commit (`e52e3d1`) and cannot move.** Seeing a void
number cannot change a bar that is immutable and public. Hiding it would be the worse practice,
because the next reader would not know what the broken instrument produced.

## What run 2 must change — instrument, not thresholds

The fix is to put both arms in **one boot**, which restores the definitional mask's premise:

- Load both body textures at character build time and expose an in-page swap
  (`engine.debug.bodyTex = 'raw' | 'fix'`) that reassigns `material.map`, in the shape
  `debug.liftScale` and `debug.grainScale` already use.
- Then A and B are two renders of one page, the only difference between them is the texture, and
  boot noise is definitionally absent.

That is a `src/` change and a genuinely different instrument, so it needs a **new seal**, not an
amendment to this one. `PREREG-bodyhue.md`'s CAL-1, CAL-2, P1, F1, P2 and F2 stay exactly as
written; the new seal may reuse them verbatim, which is the honest way to carry them forward, but
it must be re-registered before run 2 captures anything.

**Do not** "fix" run 1 by adding a minimum-difference cutoff to the mask. Choosing a cutoff now,
having seen the histogram above, is precisely the §141.1 move this project exists to refuse.
