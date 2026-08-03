# ADDENDUM — `tone1` did not lose its frames to the rollback. It never rendered one.

Owner: SHADING/POSTFX. Written before `tone2` lands, because this correction is independent of
`tone2`'s outcome and is the more expensive thing to lose.

## The claim being corrected

§91 lists `tone1` among "every capture frame rendered since the last restart — `fx18`'s 13 arms,
`char11`, `tone1`, `txab-off`, `txab-on`, `geofix`" as **lost to the container restart**. The
coordinator's re-brief repeats it: *"`tone1`'s frames are gone; the seal and its log survive, so
re-running it is cheap."*

**`tone1` rendered zero frames.** There was nothing for the restart to take.

## The evidence, and it is the artefact §88 exists to protect

`progress/records/logs/tone1.log` — preserved by `tools/keeplog.sh`, the tool written in §88
*for this run*, and rescued from `.gitignore` by §89.5. Its last lines:

```
· waiting for capture lock (2101s, held by pid 7370)

=== hero ===
file:///…/scratchpad/tone1.mjs:26
    await page.evaluate((s) => window.__GAME.setShot(s), shot);
               ^
TypeError: page.evaluate is not a function
    at withGame (file:///home/user/Demo/tools/harness.mjs:121:18)
```

So the run **waited 2101 s (35 minutes) for the lock, acquired it, booted, and died on its first
`setShot`** — before the first shot of the first arm.

`harness.mjs:121` is `return await fn({ page, info });`. The harness passes a **single object**.
`tone1.mjs` took that object as `page`. One missing pair of braces in the callback signature.

## Why this matters more than the lost frames

1. **A re-run that copies the old script fails identically.** The bug is in the runner, not in the
   knob, the seal, or the tree. "Re-running it is cheap" is true only once the callback signature is
   fixed — which is the whole reason this is written down rather than silently repaired.
2. **`RESULT-tone1.md` §5 says "Frame verdict — PENDING", which is correct — but not for the
   reason a reader would infer.** Read next to §91, "PENDING" looks like "we had frames and lost
   them". It should read "the capture never produced an image". Sections 1–4 of that document are
   arithmetic and stand; nothing in it was ever scored against a frame, and nothing in it claims to
   have been.
3. **35 minutes of exclusive capture lock were spent on a run that could not have produced
   anything**, while three other agents queued behind it. The failure was in the first line of work
   after the wait, so the entire wait was dead.

## The general shape, and it is §11's rule pointed at the runner

§11 is about a *probe* whose header describes a prefix of the pipeline it does not implement. This
is the same failure one level out: **the run log's 2101 lines of `waiting for capture lock` look
exactly like a successful long run.** Every line of that log up to the last five is indistinguishable
from a healthy capture. A reader — including §91's author, and me — scanning for "did it run" sees
35 minutes of activity and concludes it ran.

> **A queue wait is not progress, and a log that is 99.8 % queue wait is not evidence of a capture.**
> The only lines that carry information are the ones after the lock is taken.

`shot.mjs` and the harness already stamp provenance into `report.json` (§10, §11). **A run that
produces no `report.json` at all produced no frames**, and that is the cheap check nobody ran:
`ls shots/tone1/` would have answered it in a second, at any point in the last five hours.

## What `tone2` changes so this cannot recur silently

`scratchpad/tone2.mjs` is the rebuilt runner. Three guards, all cheap:

- **Correct destructure**, `async ({ page, info }) => …`, which is the actual fix.
- **A pre-flight inside the same boot**, before any arm is captured, that proves *both* knob paths
  reach the shader and aborts without spending the lock if they do not (§52's "the check that pays
  runs before"). It also records the trap below as data rather than as a comment.
- **Incremental writes**: every arm's PNG and a cumulative `manifest.json` are written as the arm
  completes, so a run killed at any point yields everything up to that point. `tone1` was
  all-or-nothing and got nothing.

## A second trap found while building the runner, and it cuts both ways

§80.5 records `uRimGain` becoming a per-frame write, so poking the *uniform* is silently reverted.
Checking the two knobs `tone2` needs found **the same hazard and its exact inverse, in one file**:

| knob | written every render? | poking the uniform | poking `tune` |
|---|---|---|---|
| `uInkStrength` | **yes** — `PostFX.js:1794`, from `tune.inkStrength` | silently reverted | **works** |
| `uToneShoulder` | **no** — only `:1322` init and `:1523` setter | works | **silently does nothing** |

So the correct poke for one is the broken poke for the other. Getting either backwards produces a
full run of arms that are all silently the shipped value — §40's failure, which is the reason
`PREREG-tone1.md` demands a `toneState()` readback per arm in the first place. `setToneShoulder`'s
own docstring already warns about this, and it is right; the point here is that **"poke `tune`, not
the uniform" is not a general rule in this file, and stating it as one is itself a hazard.**
`tone2` asserts requested-vs-applied per arm and marks the arm VOID on mismatch rather than
trusting either rule.
