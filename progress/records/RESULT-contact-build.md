# RESULT — the contact term is built, offline-verified, and SHIPS OFF

Answers `PREREG-contact.md`'s "build it". **No rendered frame has been captured with it on**, so
this record deliberately does not claim the critic's finding is fixed. It claims exactly four
things, each measured.

Files touched: `src/render/PostFX.js` only. Nothing committed.
Instrument: `scratchpad/compositecheck.mjs` (~4 min, **does not take the capture lock**).

---

## 1. What was built

`TUNE.contact = [radiusWorld, strength, minPx, maxPx]` and `TUNE.contactRise = [loM, hiM]`, a
`slyContact()` in `COMPOSITE_FRAG`, and one combined occlusion multiply in the composite.

The design follows the seal's §5 constraints: full resolution, no blur, own tight world radius,
composited on the **PostFX AO path** (so it darkens toward `uAOTint` per §2.1.3, never toward
grey, and inherits the shadow-hue work rather than fighting it), and independent of the shadow
map. `AOPass.tune.radius` was **not touched**, per the seal's out-of-scope declaration.

**The signal is the negative lobe of the rim gate's own planarity test.** Under perspective,
`1/a + 1/b − 2/z0` is identically zero across any plane at any grazing angle; the rim gate keeps
the *positive* lobe (background falling away behind a silhouette) and throws the negative one
away. The negative lobe is a neighbourhood rising toward the eye — a concave corner, or something
standing on this surface. Reusing it is why the term is exactly zero on open floor, which is the
property the whole rim-gate investigation was about.

Two implementation notes worth carrying:

- **The deviation is not halved, and that was a real bug for about ten minutes.** Averaging the
  two taps reports *half* the occluder's step height, which would have needed a window at half
  the scale its name says — and `TUNE.contactRise` would then have meant something other than
  "occluder step height in metres". In the case the term exists for, exactly one tap is on the
  occluder and the affine identity cancels the other, so the undivided sum *is* the step.
- **The pixel-radius clamp is explicit and read back**, because "radius quantised to a texel
  floor" is §40's failure mode exactly: a term whose taps all land in the centre texel returns a
  null indistinguishable from a decisive one.

---

## 2. What was measured, and the scope of it

`compositecheck.mjs` extracts `COMPOSITE_FRAG` from source text, resolves its interpolations, and
compiles the **character-for-character** string the renderer builds, on the same
ANGLE/SwiftShader the capture harness uses. Depth is **synthetic**: an analytic ground plane
running away from a 1.6 m eye, with a 4 cm step on a 30 cm disc at 4 m — geometry whose right
answer is known in closed form.

Baseline ref **`9c5edf8`** — the last commit before the term existed. Not `HEAD`; see §2.1.

| test | result |
|---|---|
| LINK_STATUS / VALIDATE_STATUS | **true / true**, empty info log |
| darkening beside the 4 cm step (36 px ring) | **18.39 L** |
| **open grazing plane, 1084 px** | **exactly 0.000** |
| pixels changed in a 4096 px frame | **32** — a tight band, not a blob |
| null control (`strength 0`) vs itself | **0 px** differ |
| **shipped default vs `9c5edf8`**, AO live, full grade | **0 px, max channel delta 0** |
| positive control: `strength 0.85` vs `9c5edf8` | **96 px differ** — the row above is not vacuous |

### 2.1 The baseline ref had to become an argument, and that is §18 arriving live

The check originally diffed against `HEAD`. It came back **`FAIL: HEAD already contains
slyContact`** — because the coordinator's sweep committed this term, mid-edit, as `d5fa62e`. So
`HEAD` had stopped being a pre-term baseline *while the instrument was being written*, and an
instrument that hardcodes `HEAD` would have silently compared the term against itself and
reported a no-op. That is §18's stale-reference failure in miniature: **a validation number tells
you the model matches its reference; it cannot tell you the reference is current.** `BASE_REF` is
now an argument and the check refuses to run if the ref already contains the term.

Two other hardening changes fell out of the same moment: the check now reads `TUNE.contact` and
`TUNE.contactRise` **out of source** rather than restating them, so it cannot validate arithmetic
the renderer is not using — it had already drifted one revision (`[0.008, 0.22]` against a shipped
`[0.006, 0.20]`).

**TRANSFORMS THIS SKIPS vs a capture (§11 — the suffix not implemented):** the whole world; the
real depth buffer; PostFX's own uniform plumbing (`contactState`, the per-frame
`cu.uContact.value.set`), since the material is built from extracted text — a wiring bug in
`PostFX.js` would pass here and fail in a capture. **It can say the shader is broken or the
arithmetic is wrong. It cannot say the frame is right.** The 18.29 L is on a white synthetic
scene and is *not* a prediction of the M12 ΔL.

The last two rows exist because the ledger says repeatedly that reading what code is specified to
do is not evidence that it does it. "Bit-identical because the block is branch-guarded and
`mix(vec3(1),x,0)` is a multiply by exactly 1.0" was a source reading; it is now a measurement,
with a positive control so that a pass cannot come from nothing being connected.

---

## 3. Why it ships at `strength = 0`

**§17's precedent, applied.** That section records the rim-gain plumbing landing defaulted to a
no-op with the look change held as its own pre-registered A/B, and the reason: a change that
moves a shipped look, arriving as a correctness fix, is a change wearing a fix's clothes. This
term would darken a band under every figure and at every wall/floor junction in all ten shots,
on the strength of a synthetic depth buffer. §3 records this project twice producing on-target
numbers over a plainly wrong image.

So: `contact[1] = 0.0` ships. **The A/B value is 0.85.** The composite re-reads the uniform every
frame, so turning it on is a one-line poke in a live boot — no rebuild, and `back` arms are free.

---

## 4. How to run the A/B (nothing here needs re-deriving)

```js
const pfx = window.__GAME.engine.get('postfx');
pfx.tune.contact[1] = 0.85;        // ON.  0.0 = the shipped null arm, bit-identical to base
console.log(pfx.contactState(zUnderBoot));   // MANDATORY, every arm — see below
```

`contactState(refZ)` reads back **the live uniform values the shader received**, never
`this.tune`, per the seal's §6.1 and §40: applied `radiusM`, `strength`, `appliedPx` vs `rawPx`,
the render-target dimensions actually sampled, and a **`clamped` flag**. Pass the view distance of
the floor under the boot, because the screen radius is per-pixel.

Worked example: at `refZ = 6 m`, 720-high frame, 50° fovY, `radiusM 0.045` → **5.79 px**, well
clear of both the 1.2 px floor and the 24 px ceiling, so `clamped: false`. At ~30 m the same
radius falls to ~1.2 px and `clamped` goes **true** — which is the honest report, not a failure:
past that range the term is sampling a texel floor and no number from it describes `radiusM`.

**Two arms with equal applied state are COLLAPSED and score nothing.** That line is the cheapest
in the seal and it is the one that would have saved the §40 run.

Bands, counter-risks and falsifiers are unchanged in `PREREG-contact.md` §7–8. Score with
`scratchpad/m12.mjs --validate` (it reproduces critic5's published table to 0.12 L and exits
non-zero on fidelity failure); **re-locate the sole on this run's own baseline first**, and if the
baseline column is no longer flat, report NOT COMPARABLE rather than a number.

---

## 5. One prediction I will register now, against my own term

Counter-risk 2 in the seal asks that the `guard` wall/ground contact ROI stay under 20 artefact
px. **This term will fire at that junction** — a wall meeting a floor is concave and that is the
signal by construction. I expect it to *pass the band anyway*, because the ROI counts **bright**
cool pixels and this term only ever darkens, so it cannot manufacture one.

Stated in advance so that a pass is a confirmed prediction rather than a lucky null — and so that
if the count *rises*, that is a genuine surprise pointing at a second cause, not something to
explain away. What would actually falsify the design at that junction is the **halo** band
(counter-risk 1): if `d ≥ 20 px` columns move ≥ 2.0 L, the radius is not doing what its name says.
