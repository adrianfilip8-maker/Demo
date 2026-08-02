# PREREG — the lofted sphinx body, read off a `dunes` capture

Sealed **before any `dunes` frame exists** and before the capture is queued. Tree under test:
`src/` at `8795030` (byte-identical to `d542055` and to `aaff769`; the only commits between
them touch `KNOWN_ISSUES.md`, which the game does not load). Working tree under `src/world/`
is clean at seal time.

Written because §51.1's lofted body is the one item in the project that is a **shipped `src`
change with zero in-engine verification**, which is a worse state than an unshipped one.

## What is under test, and the measurement that was never taken

`sphinx()` (`Statues.js:242`) replaced three stacked `chunkAt` slabs with a single `loft()`
mass (`PropKit.js:406`), eight stations, `arc: 9`, `wobble: 0.035`, `belly` at its **default
0.06**. Cost: +2,240 triangles level-wide, 0.19% of budget.

The recorded numbers are **82.1% → 72.1%** swept-normal area — and those are for the
**flat-flank** loft, i.e. the version *before* `belly` existed. `belly` was added precisely to
repay that deficit.

> **No measurement of the shipped `belly` loft exists anywhere in the record.** The claim that
> it repays the deficit rests on a construction argument in a source comment — "the normal
> leaves the base tilted ~9° outward-and-down and arrives at the spring line horizontal". That
> is the *specified* behaviour, not the measured one.

Closing on a source comment is exactly §51.4, §50 and §18. It is my own defect, one section
after I reopened someone else's for the same reason, and L1 exists to stop it shipping twice.

## Where it lands in `dunes` — computed, not estimated

Camera `dunes`: `pos [26.0, 19.5, 84.0]`, `target [-2.0, 9.0, 18.0]`, `fov 42`, `tod 0.83`.
Half-angles **21.0° vertical, 34.3° horizontal** at 16:9. Avenue: `sphinx()` at x ±7,
z ∈ {40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84}, `ry ∓90°`.

That rotation is the reason `dunes` is the right frame: it maps the sphinx's local ±X — **the
lofted flank, the largest single area on the animal and the surface `belly` acts on** — onto
world ±Z, facing the camera. Measured at 1280×720 (`scratchpad/loftframe.mjs`):

| side | z | dist | off-axis | in frustum | flank len px | flank h px | belly band px |
|---|---|---|---|---|---|---|---|
| +X | 40 | 51.2 m | 12.2° | **IN** | 55 | 29 | 12 |
| +X | 46.3 | 45.9 m | 15.1° | **IN** | 60 | 32 | 14 |
| +X | 52.6 | 40.8 m | 19.3° | **IN** | **64** | **37** | **16** |
| −X | 40…58.9 | 45–58 m | 16.6–32.2° | **IN** ×4 | 44–47 | 26–37 | 11–16 |
| either | 65.2…84 | 26–42 m | 39–68° | **out** | — | — | — |

**Seven sphinxes in frustum; the four nearest are outside it.** The largest available flank is
`+X z 52.6` at 40.8 m: 64 × 37 px, of which the barrelled sub-spring band is ~16 px.

**This is a weak instrument for `belly` and an adequate one for the terminator.** 16 px against
a 3-band ramp admits at most one band edge. Registered now so that a null on L1-at-dunes is not
later read as evidence the geometry is flat.

## Registered clauses — bands partition; provenance of each stated

Marked **[SEEN]** where I have already looked at the quantity offline, **[OPEN]** where I have
not. Per the coordinator's instruction, and because a prediction one has already seen is worth
more than a hope only if the record says which it is.

- **L1 — swept-normal area of the shipped `belly` loft vs the three `chunkAt` slabs it
  replaced. [OPEN — never measured, and measurable offline without the lock.]**
  Same instrument and same figure population that produced 82.1% / 72.1%.
  **≥82.1% → PASS**, the loft repays what it removed · **72.1–82.1% → PARTIAL**, `belly`
  helped but the replacement is still worse than the original, and `belly` wants raising
  before anything else is claimed · **≤72.1% → FAIL**, `belly` buys nothing and the honest
  move is to raise it or revert the loft to slabs.
  **This clause does not need the capture and must be run before it.** If L1 fails, the
  `dunes` lock should be spent on something else.
- **L2 — a terminator exists on the flank at avenue scale. [OPEN at this scale.]** celraster
  showed a curved terminator sweeping haunch and flank on the built mesh at close range; that
  says nothing about 26–37 px. Count in-frustum sphinxes whose flank carries ≥1 band
  transition: **≥4 of 7 → PASS** · **2–3 → MARGINAL** · **≤1 → FAIL**, the loft's gradient does
  not survive the avenue and the work is only defensible on the silhouette.
- **L3 — the terminator is curved, not a straight vertical edge. [SEEN offline, close range;
  OPEN at avenue scale.]** Deviation of the band edge from a straight line fitted to its own
  endpoints, over the flank height: **≥3 px → PASS** · **1–3 px → MARGINAL** · **<1 px → FAIL**,
  it is reading as a hard arris and is indistinguishable from the slabs it replaced.
- **L4 — falsifier, registered to fail.** If the animals now read **inflated, blobby, or
  balloon-like** — if the slab-sidedness that `n: 2.6` exists to preserve is gone, or the critic's
  next pass reaches for "soft" / "inflated" / "rubbery" rather than "carved" — that is a **loss**
  and is not to be absorbed as "smoother is better". The §7.3 condition in play is the same one
  N4 names: *"Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon"*,
  failed from the over-rounded side. `belly` and `n` are both levers that can overshoot.

## What a `dunes` capture cannot answer, stated now so it is not claimed later

- **The four nearest sphinxes are out of frustum.** Any claim about the avenue's *near* read is
  unsupported by this frame.
- **`belly` at 16 px is at the edge of what a 3-band ramp can express.** A null on L2/L3 is
  consistent with both "the gradient is absent" and "the gradient is present and unresolvable at
  40 m". Only L1 separates those, and L1 is offline.
- The **head, nemes and plinth** on the sphinx are the same shared helpers geo3's `courtyard`
  already answered on the colossi at ~4× the pixel width. `dunes` adds nothing there and should
  not be read as a second opinion on them.

## Requested capture

**One lock, one boot, two arms:**
1. `dunes` at its **existing framing, unchanged** — the honest canonical read, and the one the
   critic will score.
2. One **staged close arm** on `+X z 52.6` (the largest in-frustum flank), camera overridden
   in-page after `setShot('dunes')`. This needs **no edit to `src/core/Shots.js`**, which is not
   mine — the override is a scratchpad probe, the same pattern `bandprobe.mjs` already uses.
   Arm 2 is what actually resolves L2/L3 if arm 1 is a null.

`src/world/` should stay **frozen from seal to capture**, as it was for geo3, so the frames
describe a nameable tree.

### Amendment, 21:52Z — added BEFORE any `dunes` frame exists; no clause or threshold altered

The freeze clause above is **insufficient, and it was insufficient as written.** It names
`src/world/` — the module I own — and the hazard arrived from the module that decides where
band edges fall.

While this run sat in the capture queue, SHADING was mid-edit and uncommitted on
`src/render/shaders/toon.glsl.js` and `src/render/ToonMaterial.js`. **L2 counts band
transitions and L3 measures a band edge's deviation from a straight line; `toon.glsl.js` is
the file that decides where those edges fall.** `harness.mjs` loads modules when a run
*acquires* the lock, not when it queues, so a ticket placed before the edit landed would have
booted it — quantising with an unnamed shader against a seal written for a different one, with
`report.json` recording only `dirty: true`. The frame would have been unnameable in exactly the
respect the freeze exists to prevent, from outside the module the freeze covers.

**The rule this seal should have been written to, and the one the next seal gets:** *name the
modules the measurement depends on, not the modules you own.* For a band-transition
measurement that set is `src/world/` (the geometry), `src/render/` (the quantiser),
`src/textures/` (the albedo the luma is read from) and `src/core/Shots.js` (the framing the
pixel table above is computed against).

This is now enforced in code rather than by vigilance: `scratchpad/dunesloft.mjs` refuses to
queue while any of those four carries a tracked uncommitted modification, and logs what it is
waiting on. Either resolution clears it — the edit is held (tree unchanged) or landed (tree
changed but named by a sha). Only the third case, a tree no sha describes, is refused.

### Arm 2's viewpoint is constrained by the avenue itself — found before the capture, not after

The seal asks for "one staged close arm on `+X z 52.6`" without fixing a viewpoint, and the
obvious one does not work. **A close camera looking straight down +Z at that flank is occluded
by its own neighbour.** The row is 6.3 m apart in z and each animal is 3.44 m long in x (world
x 5.74…9.18 for the +X row, since ry −90° maps local z onto world x), so a sight line from
z 62.5 to the z 52.6 flank crosses the z 58.9 animal's near face at **x 8.11 — inside its
footprint**. That frame would have been a picture of the wrong sphinx.

Arm 2 is therefore a **dolly along the canonical bearing**: camera placed 10.5 m from the flank
centre along the line the `dunes` camera already occupies. The same sight line crosses the
z 58.9 near face at **x 10.65, outside 9.18 — clear**. This is also the better instrument, and
for the reason `hero` uses the same trick: the bearing is unchanged, so the sun-to-flank and
view-to-flank relationships are identical to arm 1 and arm 2 is *"arm 1, closer"* rather than a
second, differently-lit opinion that would confound L3. The run additionally raycasts the live
scene from the arm-2 camera to the flank and records the first three hits, so the frame carries
its own proof of clearance instead of my arithmetic.

Resolution of record: SHADING landed at `1d9bd65`. The change is a rim shadow-floor knob
scoped to non-skinned geometry, shipping at `0.55`, where `mix(0.55, 0.55, x)` makes it
value-identical to the previous expression — verified numerically by the coordinator over
200,000 random `sh` samples at both `vSlySkin` values, difference exactly 0. **So L2/L3 score
the same quantiser this seal was written against.** Recorded as value identity, not as a claim
about compiled bytes.
