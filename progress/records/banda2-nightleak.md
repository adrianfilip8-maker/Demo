# banda2-nightleak — the 63-px P7 leak localized and traced to its term

**Owner:** SHADING (successor to the banda candidate; RESULT-banda routed this as obligation
(a)). **Date:** 2026-08-05. **No `src/**` touched; no lock taken** — this is offline diffing of
the committed `progress/records/banda1/` frames plus source reading. Threshold stated per
§122.1: differing px = ΣRGB ≥ 4, the seal's own P7 convention.

**What was owed.** PREREG-banda P7 registered night off-subject differing px = [0,0]; the
capture read **63** (in-subject 2,067, allowed). The seal's §6 arithmetic claimed zero by
construction; P-F6 fired and the candidate did not ship. RESULT-banda: "some term in the
shadowTintPeak/subjWarmShade pair reaches night off-subject pixels through a path the
arithmetic did not cover." This file names the path.

## 1. Localization — one cluster, one object

Diff of `banda1/night.AB.png` vs `banda1/night.base.png` (same boot, chunk C) reproduces
RESULT-banda exactly: **63 off-subject / 2,067 in-subject** at ΣRGB ≥ 4.

- The 63 px are **a single 8-connected cluster, bbox (369,77)–(381,96)** — 13×20 px, ~1,150 px²
  of frame area, of which 63 crossed threshold.
- Mean Δ(R,G,B) = **(+2.0, −0.7, −1.2)**, max Σ|Δ| = 13 — a small **warm-ward** move
  (R up, G/B down), the documented direction of `uSubjWarmShade` (both shade lights mixed
  toward luma-matched `wrapWarm`).
- The in-subject movement (bbox (663,388,768,476)) is Sly, mean ΔR +2.7 / ΔB −3.9 — same
  signature, expected and allowed by the seal.
- The cluster sits **on the roof parapet line against the moon disc** — the "figure on the
  ridge against the full disc, top-left" CRITIC-sbs2 §3 (night) describes. At 5× crop it is a
  small figure with a spear, lower body cut by the parapet lip.

## 2. Identification — the `rooftop_run` guard

The figure is **guard #7 of the roster, the temple guard on `rooftop_run`**
(`src/ai/Patrol.js` ROSTER entry `{ type: 'temple', route: 'rooftop_run', u: 0.15, speed: 1.12 }`;
route: closed loop, `baseY 17.0`, points (±16, −22)–(±16, −45)).

Projection check (THREE PerspectiveCamera, the `night` staging verbatim from
`src/core/Shots.js:293-296` — pos (−13.4, 8.4, 22.0), target (2.0, 6.0, 2.0), fov 48,
1280×720): a 1.75 m figure on the roof deck's north leg (y 17, z −22) projects head pixels
through **(327–402, 82–93)** for world x ∈ [0, 4] — the leak bbox (369–381, 77–96) sits on
that line at world x ≈ 2, ~48 m from camera, ~30 px tall with the legs occluded by the
parapet (projected feet ~117–126 land below the ridge line, matching the crop). Elimination:
every other roster body projects elsewhere or nowhere — courtyard ground routes
(`south_gate`/`courtyard_ring`/`obelisk_watch`) project to (591–1195, 513–848) low-right and
are terrace-occluded at this camera; `architrave_ledge` projects x ≥ 1133 to off-frame right;
`sphinx_avenue` is behind the camera; `hall_weave`/`tomb_*` are indoors. The measured diff
has exactly one off-subject cluster, consistent.

## 3. Mechanism — named lines

The chain the seal's §6 arithmetic did not cover:

1. **`src/render/ToonMaterial.js:1140`** — the vertex patch:
   `vSlySkin = 1.0` under `#ifdef USE_SKINNING`, `0.0` otherwise. The "subject" scope is
   **every SkinnedMesh**, not Sly.
2. **`src/ai/GuardModel.js:1896`** — `new THREE.SkinnedMesh(asset.geometry, materials)` —
   all 11 garrison bodies are SkinnedMesh.
3. **`src/ai/Guard.js:1088-1091`** (`_buildMaterials` → `_mat` → `shading.toon`) — guard
   `body`/`metal` materials are ToonMaterial-family and **share the `uSubjWarmShade`
   uniform** (declared ToonMaterial.js:736).
4. **`src/render/shaders/toon.glsl.js:436`** —
   `float slySubjT = clamp( uSubjWarmShade, 0.0, 1.0 ) * vSlySkin;` then lines 446–447 mix
   **both shade lights** toward the luma-matched warm target by `slySubjT`.

So arm AB's poke `subjWarmShade 0.50 → 0.65` warmed the shade register of **every skinned
draw in the frame** — Sly (in-subject, 2,067 px, expected) **and the rooftop guard**
(off-subject, 63 px, the leak). Sign (+R, −G/−B) and smallness (night shade lights are tiny:
`uShadowColor` (0.0129, 0.0468, 0.0781)) both match.

**The other lever is eliminated by the capture's own readback.** `banda1/readback-C.json`
records `uShadowColor` AND `uShadowColorLit` **bit-identical to full float precision**
(0.012895755468330918, 0.04676854125689067, 0.07805322250511793) across base / AB / restore —
the seal's cap arithmetic (night kAsked 0.4685 « maxK 3.139/3.744) held exactly. L2
(`shadowTintPeak`) moved nothing at night; the leak is **L1 alone**.

## 4. Why the seal missed it

PREREG-banda §6 proved two true statements — L2 cannot reach night (cap arithmetic, confirmed
above) and L1 cannot reach **architecture or sky** (`mix(x,y,0)` exact at vSlySkin 0, confirmed:
zero architecture pixels moved) — and §7 even *named* the warmed population correctly ("Sly
and guards; architecture bit-identical"). The failure was the **population geometry of P7's
gate**: "0 px outside the subject box" assumed the only skinned pixels in the night frame were
Sly's. Guards enter frames by **patrol timing, not staging** — `rooftop_run` walks a skinned
body across the night camera's sky line, outside any box drawn around Sly. The collision
arithmetic was right about the levers and wrong about where the levers' population stood.

## 5. Consequence for the successor (PREREG-banda2 will carry this)

- A night gate scoped by a subject box is **structurally unsound** — the skinned population
  is mobile. The successor must make the night claim **frame-wide**, which requires the
  night-side lever value to be **bit-equal to ship** at night.
- The engine already delivers the gating signal to the exact publish site:
  `ToonMaterial.setKeyLight` **receives `nightAmount` per frame**
  (`src/render/ToonMaterial.js:1280-1287`, payload from `Lighting.js:1837`), and
  ToonMaterial.js:1441 records `nightAmount` as **exactly 1.000 at `night`/`guard` and 0.000
  at every other canonical shot** — a lerp gate published there
  (`uSubjWarmShade = lerp(TUNE.subjWarmShade, nightPin, nightAmount)` with nightPin = the
  shipped 0.50) is **exact** at every canonical tod, so a capture on the committed tree can
  emulate it exactly by poking the gate's per-shot output (day arms 0.65, night arm 0.50).
  At night the uniform is then numerically identical to base, every skinned draw included —
  the [0,0] band becomes arithmetic, not assertion.

## 6. Files

- This note: `progress/records/banda2-nightleak.md` (the only repo file this step writes;
  coordinator sweeps — no git run by this task).
- Scratchpad only: `banda2/nightdiff.mjs` (the diff/cluster dump), `banda2/nightleak-crop.png`,
  `banda2/nightleak-wide.png` (5× crops with the bbox marked).
