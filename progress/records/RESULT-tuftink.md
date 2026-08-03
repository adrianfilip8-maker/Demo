# RESULT — `char-ink`: scoring `TUNE.tuftInk = 0.40` against the seal

Scores the `char-ink` capture against the registered note at `src/player/SlyModel.js`
(`tuftInk`) and against `PREREG-tuftbias.md` §5b/§3.3. Written after looking at the frames.

Frames: `shots/char-ink/sly-closeup.png`, `shots/char-ink/hero.png`, `shots/char-ink/charink.json`.
Crops and instruments: `$SCRATCH/ink-score/` (`A-full-1x.png`, `A-head-2x.png`, `A-roi-4x.png`,
`A-tail-4x.png`, `A-torso-4x.png`, `A-hero-1x.png`, `A-hero-char-4x.png`, `roicheck.mjs`,
`darkparts.mjs`).

Provenance from `charink.log`: `player` tree **STABLE** across the whole run
(`614df6b775f6392f` before and after), `srcTree` MOVED — other agents edited during the boot.
So the character module that rendered is the intended one; everything else in the frame is not
a controlled comparison. `sly-closeup` 383 s, `hero` 223 s, 1 warning (texture prewarm).

---

## 1. The verdict, against the sentence I registered

> **"Do not read the capture as confirming this note unless the chips visibly shrink."**
> — `SlyModel.js`, `tuftInk` note

**The chips did not visibly shrink.** The capture therefore does **not** confirm the note. By the
note's own wording — *"if the chips survive at 1.0 px, the mechanism is not hull share and this
whole note is wrong rather than mistuned"* — the hull-share hypothesis is **refuted, not
mistuned**, and `tuftInk` is confirmed **near-inert in a real shaded frame**.

This is the registered null. Per §5b it is **confirmatory rather than merely un-falsifying**,
because the dead-knob escape was closed before the frame existed and this run re-stamped it in
its own boot:

```
INK PROBE {"ok":true,"count":8454,"min":0.40,"max":1,"groups":11,"mats":11,
           "weights":[1,1,1,1,1,1,1,1,0.4,0.4,0.4],"hasShell":true}
  cards: furTuft=0.4(1296v) furTuftCream=0.4(648v) furTuftDark=0.4(540v)  2484 indices / 3 groups
```

The weight was applied, at 0.40, to the right vertices, in the renderer that drew this frame, and
the chips survived it. That is the translation-not-inflation mechanism — the hull moves the card
bodily along a normal already biased 82% toward the host, so scaling the translation does not
shrink a card-sized black silhouette.

**What the frame shows** (`A-tail-4x.png` is the clearest):

- The cards **do** break the contour — the tail's upper silhouette is genuinely serrated, and the
  cheek carries thin fur wisps. The geometry side is working.
- Every one of those serrations renders as a **solid black filled wedge with no interior**. On the
  tail they read as notches bitten out of the silhouette rather than as fur catching light. At the
  jaw and neck (`A-roi-4x.png`) the same shapes read as black wedges; on the trousers
  (`A-torso-4x.png`) as black patches stuck to blue cloth.
- Not one card reads as the note's target — *"a lobe with an edge"*. They read as blots.

## 2. `chipscore.mjs` against the corrected baseline — and what that number contains

```
baseline (corrected)   dark<46 27.81%   verydark<28 17.76%
char-ink               dark<46 28.10%   verydark<28 18.10%      meanL 71.9
delta                        +0.29 pp         +0.34 pp
```

No shrinkage; a marginal **increase**. But the delta is not the finding — **the statistic cannot
resolve the question**, and this is §147.1 exactly.

`darkparts.mjs` decomposes the dark count into connected components (4-connected, hard threshold;
biased toward fewer/larger components, so it under-counts free-standing chips, never over-counts):

| ROI | dark px | largest component | chip-scale (≤60 px) share |
|---|---|---|---|
| jaw/chest `600,170 130x150` | 5479 (28.10%) | **3722 px = 67.9%**, bbox 114x150 | **2.7%** |
| tail `690,250 220x150` | 14591 (44.22%) | **14182 px = 97.2%**, bbox 220x150 | **1.1%** |
| hero figure `580,180 140x140` | 6407 (32.69%) | **5860 px = 91.5%**, bbox 140x130 | **2.6%** |

One fused mass — bandit mask + body ink outline + cast shadow + shadowed backdrop — is 68–97% of
every numerator. Anything chip-sized is **1–3%**. A change that shrank every chip by 60% moves
this statistic by well under a percentage point, i.e. **less than the +0.29 pp of drift already
present from other agents' work between the two captures.** `chipscore.mjs` is the fifth instance
of DIGEST's recurring shape: a number that does not depend on the thing it claims to measure. It
is admissible as a null-corroborator here **only** because the frame independently says the same
thing.

There is a second reading of that fusion which is not an artefact: at the silhouette a chip and
the body outline *are* one connected black mass, and that is the visual defect itself. A card
whose hull inflated would be a lit island inside a thin border — a separate component. The
merging is the measurement.

**§135.1 dilution, quantified rather than asserted.** Per-column profile across the jaw/chest ROI
(`roicheck.mjs` plus the column dump): character occupies x 600–~695 at 19–69% dark; x 700–729 is
backdrop wall at 7–17% dark, 5–9% very dark. Shadowed backdrop is ≈9% of the ROI's dark budget —
real, not dominant. The heavier dilution is the mask and the outline, above.

## 3. `hero` — UNTESTABLE for fur, and that is a verdict, not a pass (§144.1)

The figure is ~110 px tall in a 720 px frame and is **unlit** — a near-uniform dark blue mass
against a lit backdrop (`A-hero-char-4x.png`). Cap, ears and tail rings read; torso, arms and cane
shaft merge into one mass, as already recorded (§131.6, `perch_idle`'s cane aim, ANIMATION's).
Individual cards are 1–2 px. **No fur judgement of any kind can be taken from this frame**, and
the null here must not be counted as evidence about the bias. `sly-closeup` alone rules.

Separately and not mine: the `hero` character receives almost no key or rim — he is the darkest
object in a golden-hour frame. That is a LIGHTING/staging observation, recorded not chased.

## 4. Disposition

- `tuftInk: 0.40` **stays** — refuted as a fix, but it is provably free (groups that author no
  `ink` are untouched; cost is three draw calls) and 0 is the other failure mode (§2.1 wants
  inked silhouettes). Reverting it would buy nothing and lose the thin line on cards.
- The lever is confirmed to be the **normal bias**, `Body.addTuft` / `TUNE.tuftShadeMix` —
  CHARACTER's, not SHADING's. Next arm is `PREREG-tuftbias.md` as sealed: two boots, `sly-closeup`
  only, **judged against a frame, not against a statistic**, with §3.2's worse-cel-ramp signatures
  (speckle in the lit band, ragged terminator, detached clumps, loss of tail-ring form) named in
  advance and `chipscore.mjs` demoted to a corroborator by §2 above.
- The `hero` fur null is discarded as uninformative rather than recorded as a pass.
