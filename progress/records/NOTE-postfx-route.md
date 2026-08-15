# NOTE — the POSTFX route, settled from code before any seal

Offline. Written after §333 re-routed §277/§312 from SHADING to POSTFX, to answer the one
question that gates the successor's design: **where in the chain can a subject-scoped chroma hold
sit so that AgX does not undo it?**

## The composite ordering, read from `src/render/PostFX.js`

```glsl
c = mix( c, c * tone, uSplitStrength );          // split toning
c = mix( vec3( l ), c, uSaturation );            // SATURATION 1.30  — LINEAR HDR
c = SLY_PIVOT * pow( c / SLY_PIVOT, uContrast ); // contrast, log space
c = slyAgX( c, 1.0, uToneShoulder );             // TONEMAP
c = slyLinearToSrgb( c );                        // encode
// ---- everything below is DISPLAY space ----
// silhouette rim, ink, vignette, dither
```

## Two things this settles

**1. `saturation: 1.30` is not the cause — it is already compensation.** It runs *before* AgX and
`mix(vec3(l), c, 1.30)` extrapolates past `c`, i.e. it *boosts* chroma. The costume still arrives
at display 0.205 from a linear 0.873 (§333). **AgX is what removes the chroma**, and the grade is
already pushing the other way. Reaching for `saturation` would be turning up a knob that is
fighting the problem, not causing it — and turning it up globally to fix one character is exactly
the whole-look change §7 of PREREG-linchroma forbade without a blind round.

**2. There is a landing site that AgX cannot undo: after `slyLinearToSrgb`.** Anything applied
there is in display space, downstream of the tonemap, so it cannot be crushed by it. This is not a
novel placement — **the silhouette rim already lives there**, and `PostFX.js` (~654) records the
decision to keep it there after testing the alternative: moving that rim pre-encode "recreates the
surface rim's failure shape and inflates the edge-rim population +25.6% / +58.5% / +28.6%". The
precedent is measured, not assumed.

## The subject mask is already available at that point

The composite shader declares `uniform sampler2D uNormal; // normal prepass; alpha = 1 - subject
(ledger #31, inverted)`, and `uRimFloorOffCut` in the same shader already performs a
subject-scoped operation with it. So a subject-scoped hold needs **no new plumbing** — no new
render target, no new mask pass, no new uniform wiring beyond its own scalar.

Its population is the skinned-character family (Sly, guards, Carmelita); the cane is **not**
masked, the same documented boundary `bloomSubjectCut` and `rimSkinExempt` carry. That boundary
must be stated in the seal, because the cane sits inside the traversal rect.

## The candidate this implies

A **display-space, subject-scoped chroma restore**, applied after `slyLinearToSrgb`, mixing the
pixel toward its own hue at constant luminance — the same luminance-exact shape `subjLitHold`
used, which was never the part that failed. `subjLitHold` was correct in form and wrong in
*place*: it ran where the chroma had not yet been lost. Moving that identical arithmetic
downstream of AgX puts it where the loss actually happens.

Sealing requirements, carried from what has already been proven to work:
- INERT at 0.0 in HEAD, branch untaken, pin-tested (the `localToon`/`uSpecNormPow` standard).
- Live-settle-then-freeze staging (§328), warm-up 2 (§331), 0-px bracket, chunked, force-added
  (§329.1), `PF_COSTUME` as a hard gate (§332), `PF_STAGE` unchanged.
- Acceptance in **display space**, where the defect is: traversal from 0.205 toward the 0.54–0.79
  the r13 critic measured on the close-ups.
- A protection bar on the control shot, and `PROT_ENV` against off-subject movement — noting
  litbleach2's unresolved **1-px** leak, which this seal inherits as an open question rather than
  a solved one.

## What is NOT claimed here

That the fix will work. This note settles *where* a fix can go and *why the previous three
attempts could not have worked from where they sat*. Whether a display-space hold produces a
costume that reads blue without flattening its shading bands is a question for a sealed capture
with a binding LOOK gate — a chroma restore applied after the tonemap can plausibly look like a
sticker, and that risk belongs in the seal's forecast rather than in a hope.
