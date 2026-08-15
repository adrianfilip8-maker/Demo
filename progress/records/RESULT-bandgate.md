# RESULT-bandgate — VOID on `PF_LIT`. The gate caught my own mis-aimed control before it produced a verdict

Scored against `PREREG-bandgate.md` (f3d314d). 4 frames, no `src` change, force-added before
scoring.

```
V_ROWS  4 rows (want 4)                                    PASS
CAL  (64,128,191) over 23.5% (want >= 5%)                  PASS
R  off-vs-back 0 px (want 0)                               PASS
CLIP 0.0% of terminator px at 255 (want < 5%)              PASS
PF_LIT  lit control mean ramp 0.561 (want >= 0.8)          FAIL

ramp  LIT control  : 0.561
ramp  TERMINATOR   : 0.079
ndl   TERMINATOR   : 0.029    key: 0.033   (context, not bars)
bands: SHADOW <= 0.20  ·  MID >= 0.35   (TUNE.bands 3)

==> VOID — a validity gate failed; NOTHING is claimed in either direction.
```

## 1. Why it VOIDed, and why that is the seal working

`PF_LIT` required a surface the frame shows in full sun to report `ramp >= 0.80`. It reports
**0.561**. Per §5 that VOIDs the run: *"if the control is not lit, the channel is not what I think
it is, and no reading over the terminator means anything."*

**The terminator reads 0.079** — which is inside the sealed `SHADOW <= 0.20` band and would have
been read as *"the item is ALIVE"*. **I am not claiming that.** The whole purpose of a fail-closed
control is that it outranks the number I wanted, and this is the case it was written for.

## 2. What actually went wrong — my control, not the instrument

The instrument looks healthy: `CAL` passed at 23.5% against a 5% floor, `CLIP` is 0.0%, the
bracket is 0 px, and the three channels are sensibly ordered (`ramp` 0.079 > `ndl` 0.029 ≈ `key`
0.033 on a shadowed face).

`toon.glsl.js:495-502` explains 0.561. With `TUNE.bands: 3` the ramp's mid band is *"half key"*,
and the top band is reached only at `ndl >= termHi` (0.52) — the goldenrake comment spells this
out: a 22° sun *"puts floors and decks in the top band instead of arithmetically capping them at
half key… the top band otherwise needs el >= 33°."* Shipped `rakeTrack: 1.0` then adds
`(S_new − S_old)/steps`, which lifts the value slightly off the nominal level.

So **0.561 is the MID band plus goldenrake's increment.** The rect I labelled "LIT control" — the
brightest face of the colossus, display L 101.6 — is not in the ramp's top band at all.

**My §3 verification checked the right thing and drew the wrong conclusion from it.** I confirmed
the rect reproduced §336's *display* colour, which it did exactly. Display brightness is not band
membership, and I sealed a bar as though it were. That is the same class as §332's ROI lesson —
*prove the ROI is on the material you are measuring* — one level up: **prove the control is in the
state you are asserting it is in.**

## 3. What this run establishes anyway

Nothing about the verdict. But two things are now known that were not:

- **The colossus's brightest face is not in the top band.** Whatever bar a re-seal uses, it cannot
  assume a sunlit-looking architectural face reads ~1.0.
- **The channel is readable and the arms are valid** — `CAL`, `CLIP` and `R` all passed, so a
  re-seal inherits a working instrument and needs only a correctly-aimed control.

## 4. Disposition

- **VOID.** No band moves (§141.1). The re-seal is a **NEW file**, not an edit.
- The re-seal must either (a) choose a control rect provably in the top band — which on this shot
  may not exist, since the brightest face is mid — or (b) drop the absolute `PF_LIT` bar in favour
  of an **ordering** control: `ramp(lit) > ramp(terminator)` by a sealed margin, which tests that
  the channel discriminates without asserting which band either rect occupies.
  (b) is the better instrument and it is what I would seal now — it is testable on this shot, and
  it does not require me to know in advance something the seal exists to find out.
- The bands themselves should be re-derived from `slyRamp`'s actual output levels rather than
  assumed to be 0 / 0.5 / 1.0, since `rakeTrack` demonstrably offsets them.
