# PREREG — `TUNE.tuftShadeMix` two-arm capture (0.82 ship vs 0.40)

Written **before** the arm is queued, and before `char-ink` has landed. Nothing below may be
edited after a frame exists; corrections go in a RESULT file underneath.

Owner: CHARACTER. Files touched: `src/player/SlyModel.js` only (one constant).

---

## 1. What is being tested, and why it is not the knob three generations tuned

`Body.addTuft` blends each fur-clump vertex normal toward the **host surface normal** by
`shadeMix`, default `0.82`, previously hardcoded inside the helper and now surfaced as
`TUNE.tuftShadeMix` (behaviour-identical). One attribute — the vertex normal — is then read by
**two consumers**:

| consumer | what it does with the normal | which direction it wants the bias |
|---|---|---|
| **cel ramp** (SHADING) | `N·L` → band index | **HIGH.** At 0.82 no clump can land in a different band from the skin beside it. That is the entire reason the bias exists. |
| **inverted hull** (`Outline.js`) | extrudes vertices along the normal | **LOW.** At 0.82 every vertex of a card moves in nearly the *same* direction, so the shell **translates bodily instead of inflating** — a card-sized black offset, not a border. |

This is the mechanism I registered in `SlyModel.js` before measuring, and the flat-albedo sweep
then confirmed the half of it that a flat-albedo instrument can see:

```
tuftShadeMix   ink px   ink frac   visible CARD px
  0.82 (ship)   14048     0.2125         3124
  0.40           8166     0.1241         7155
  0.00           7942     0.1207         7380
(no cards at all, for scale:  8341 ink)
```

`tuftInk` moved ink 105 px; this moves it 5882 — **56×**. Density 2.2 → 1.05 → 0.46, card width
and roll width were all downstream of it.

**Why that table cannot decide the question.** `furheld.mjs` renders **flat albedo**. It can see
the hull and is *structurally blind to the cel ramp* — i.e. blind to the one thing the bias is
for. Shipping 0.40 on it would be §36 exactly: rigorous apparatus, wrong layer.

---

## 2. Arms

Two boots, one shot each, `sly-closeup` (33° bearing — the framing where the cheek row is
largest and where a face-on card population is most exposed).

- **Arm A** `tuftShadeMix: 0.82` — ship value, the control.
- **Arm B** `tuftShadeMix: 0.40` — the sweep's inflection; 0.00 is excluded deliberately (it
  removes the clump's own form entirely and is the strictly more dangerous end of the same axis).

Judged on the **frame**, at a head crop, by eye. Statistics are reported alongside but do not
rule — that is the whole point of running this in a renderer.

---

## 3. Registered outcomes — BOTH directions, in advance

### 3.1 What a BETTER SILHOUETTE looks like (the win I am hoping for)

- Cheek and chest clumps read as **lobes with an edge**: a thin ink border that follows the
  clump's own outline, rather than a filled black shape.
- The head's outer contour becomes **serrated** — the clumps break the capsule at the
  silhouette edge, which is §7.3's actual fur test.
- Black area *inside* the lit cheek falls. The chips stop being ink and become fur.

### 3.2 What a WORSE CEL-RAMP READ looks like (the loss this arm can cause) — REGISTERED

The coordinator's requirement, and it is the outcome I consider **more likely than not** for
arm B. Specific observable signatures, any one of which counts as the loss landing:

- **Speckle / measles in the lit band.** Clumps on the *face* of the cheek — not at its edge —
  taking a darker band than the skin around them, so the lit cheek reads as stippled or dirty.
  This is precisely what the 0.82 bias was authored to prevent.
- **A ragged terminator.** The cheek's band boundary, currently a clean curve, breaking into a
  dotted or scalloped line as individual clumps flip band across it.
- **Clumps reading as detached objects** — a clump whose value no longer belongs to the surface
  it grows from reads as debris stuck to the fur, not as fur.
- **Loss of form on the tail rings**, where the clump rows are dense and a per-clump band flip
  would turn a ring into noise.

### 3.3 The decision rule, written before the frames exist

- **B better on silhouette AND no signature from 3.2** → ship 0.40. (I do not expect this.)
- **B better on silhouette AND any signature from 3.2** → **do not ship either value.** Report
  the trade as priced and hand it to the structural fix in §4. Interpolating to 0.6 to split
  the difference is explicitly **out of scope for this arm** — it buys half a win and half a
  loss on an axis where I will have just demonstrated that no value wins both, and it is how a
  fourth tuning generation gets spent downstream of the same coupling.
- **B worse on silhouette** → the mechanism in my `SlyModel.js` note is *wrong rather than
  mistuned*, the same disposition I registered for `tuftInk`. Say so, and stop treating the
  normal bias as the lever.
- **No visible difference at all** → the hull weight and the bias are both near-inert in a real
  frame, and the ink the critic is seeing comes from somewhere I have not identified. That
  would retire the whole clump-ink hypothesis rather than refine it.

---

## 4. What this arm CANNOT close, stated up front

**A good result on either arm does not close §7.3's fur condition.** The trade exists only
because `slyNormal` is one attribute serving the ramp and the hull. The move that wins both is
**a separate hull normal attribute** — bias the shading normal 0.82 toward the host *and* keep an
un-biased normal for the shell to inflate along. That is `src/render/Outline.js` +
`ToonMaterial.js`, i.e. **SHADING's**, already routed with this framing, and held pending this
capture. If arm B shows the predicted split (better silhouette, worse ramp), that is not a
disappointing result — it is the **positive evidence** that the attribute split is worth
SHADING's time, because it demonstrates both jobs are live and in conflict on the same data.

---

## 5. Instrument and provenance caveats carried forward

- `furheld.mjs` is flat-albedo. Its numbers appear in the RESULT for continuity **only**; they
  cannot adjudicate §3.2 and must not be quoted as if they had.
- Capture provenance: `report.json` stamps the commit. Five agents are editing live. Before
  scoring, diff `src/player/**` between the intended tree and the booted commit and confirm any
  delta is behaviour-identical — as was done for `char-ink` (the `spec.ink` publication already
  existed on the shading path at `831f6de`; HEAD only added the fallback).
- Arm A must be **re-captured in the same session as arm B**, not compared against an older
  `char*` directory. TEXTURES landed a non-inert chisel change at `c54e41f`/`6e1fb05`; an
  A-vs-old-capture comparison would confound the character knob with an architecture texture.

## 5b. ADDENDUM, added 15:50 — BEFORE `char-ink` landed, and it closes one branch of §3.3

SHADING's in-page probe (`compose1/run.log`, boot at 15:48, real renderer, not a proxy) reports:

```
INK PROBE {"ok":true,"count":8454,"min":0.40,"max":1,"groups":11,"mats":11,
           "weights":[1,1,1,1,1,1,1,1,0.4,0.4,0.4],"hasShell":true}
```

Eleven material groups, **three of them carrying 0.40** — the three `furTuft*` groups — across
8454 shell vertices, with `hasShell: true`. So `TUNE.tuftInk` is **verified live in the real
renderer**, independently of me and independently of `char-ink`.

This is not a small bookkeeping note; it **removes the "dead knob" explanation in advance**.
§3.3's last branch ("no visible difference → the knob is near-inert") can no longer be read as a
delivery failure. If `char-ink` shows unchanged chips, the weight *was* applied at 0.40 to the
right vertices and the chips survived it — which is the translation-not-inflation mechanism, i.e.
the registered prediction, confirmed rather than merely unfalsified. §36's usual escape ("your
apparatus never reached the thing") is closed here before the frame exists.

## 5c. A THIRD LEVER, registered now so it is not later mistaken for a post-hoc idea

Recorded at 15:53, before any `char-ink` frame exists, and **deliberately not implemented** —
touching `src/player/**` while a capture is queued to boot would change the tree it renders and
destroy the provenance of the run I am about to score.

Looking at `furheld.mjs`'s card-highlight proxy (`held4/y-sly-closeup-A-ship.png`, cards in
magenta), the chip-producing population is visibly **the cards lying face-on** — chest, thigh,
forearm, near cheek — not the cards at the contour. That matches the on-face/edge split already
measured per row (`headR` 0% on-face in all four framings, `headL` 95.5/97.4/84.6/61.5%).

Both levers now on the table act on the *hull* (`tuftInk`) or on the *normal* (`tuftShadeMix`).
A third acts on the **geometry**: a clump's `dir`. A clump extruded along the surface normal is,
on the near face, a compact foreshortened blob — a chip. A clump swept **tangentially** (laid
back along the surface rather than standing off it) is nearly invisible face-on and still breaks
the contour at the limb's edge, because at the edge the tangential direction is the one that
projects at full length. `Body.addTuft` already takes `dir`, `bend` and `bendDir`, so this is a
placement change, not new geometry.

**Why it is not obviously right, stated now rather than after it fails:** a fully tangential
clump may simply disappear into the surface and return the smooth capsule of the no-cards arm
(`held4/y-sly-closeup-C-none.png`, which reads as unmistakable plastic). There is likely a
sweep angle that keeps contour serration while flattening the near-face blobs, and there is
equally likely not. It is a **third arm, after the bias arm resolves**, not a parallel change —
running it concurrently would confound the one variable this capture exists to isolate.

## 6. Plane caveat on any pose measurement quoted alongside this

The line-of-action figures I have reported (`perch_idle` 0.045 / 0.082 / 0.045 m hips/chest/head)
are **lateral displacement only**. That measure is blind to the sagittal plane — it scores
`cane_combo_3`'s 0.88 m stride as zero. **Any pose number I quote from here on names its plane**,
and a pose is not "stiff" on the strength of a lateral-only figure.
