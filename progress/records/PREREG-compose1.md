# PREREG-compose1 — §119.4 composition, and two routed items whose premises moved

Author: SHADING. Sealed before any arm renders. Tree fact to stamp: `src/**/*.js` hash
(NOT the git SHA — §121.4: three arms stamped three SHAs on a byte-identical tree).

Scope: `src/render/PostFX.js`, `src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`.
`src/render/Outline.js` added under AGENTS.md §3 (SHADING owns it) for item B only.

---

## A. §119.4 — uniform `shadowBounceMix` ≈ 0.10 composed with `fillSkyMix`

### A.0 The headline figure is a LINEAR SUM, and that is the whole risk

§119.4 quotes "together ≈ 73 / 44 / 41 %". Decomposed against §115.1 that is exactly
addition, with no composition term:

| shot | uniform ~0.10 leg | `fillSkyMix` leg | quoted "together" |
|---|---|---|---|
| hero | 41 % | 32 % | **73 %** |
| temple | 20 % | 24 % | **44 %** |
| sly-closeup | 26 % | 15 % | **41 %** |

So the brief's number assumes additivity. **That assumption is already contradicted by data
in the file**, which is why this seal exists.

### A.1 Composition has in fact been measured once — §115.1's `all six` row

Drift denominators, recovered from §115.1's own percentages
(hero 0.0487/1.20, temple 0.0578/0.65, closeup 0.0625/0.74):

    drift(hero) = 0.0406   drift(temple) = 0.0889   drift(closeup) = 0.0845

`hero` is the only shot with every leg measured:

    legs: −0.0487 (sbm) −0.0131 (fillSky) +0.0040 (shadowTeal) −0.0000 (bloom)
          −0.0010 (rim) +0.0000 (AgX)          linear sum = −0.0588
    measured `all six`                                     = −0.0456

**Composition factor = 0.0456 / 0.0588 = 0.776.** Adding five legs worth −0.0101 of linear
sum to `shadowBounceMix` alone moved the total *down*, 120 % → 112 %. The same ratio computed
against the two documented legs on the other shots gives 0.69 (temple) and 0.69 (closeup).

> **Subadditive composition is the prior, not a hypothesis.** ~0.70–0.78 of the linear sum.

### A.2 Registered bands

Predicted composite = 0.776 × linear sum, widened upward because the subadditivity mechanism
is most likely saturating (AgX shoulder + the shared shade-side pixel population). A *smaller*
two-leg excursion compresses less than the six-leg full-excursion arm the factor came from, so
the true factor should sit **between 0.776 and 1.0**, not below it.

| shot | linear sum (brief) | point prediction | **registered band** |
|---|---|---|---|
| hero | 73 % | 57 % | **52 – 76 %** |
| temple | 44 % | 34 % | **30 – 46 %** |
| sly-closeup | 41 % | 32 % | **28 – 43 %** |

**Falsified** if any shot lands outside its band. Bands are one-sided-informative: the lower
edge is the saturating prior, the upper edge is the brief's own additive claim.

### A.3 What each outcome MEANS — registered in advance, both directions

- **Subadditive (composite < 73/44/41, i.e. inside the band's lower half).** Expected. The two
  legs compete for the same shade-side pixels: once the bounce has stopped suppressing green,
  the fill leg has less green deficit left to remove. Consequence: **the pair does not close the
  drift**, and the residual is not recoverable by pushing either knob, because the ledger
  ceiling on the uniform knob is ~0.10 (temple binds, §119.4). A third term or a moved ledger
  line would be required, and that is a new brief, not an amendment to this one.
- **Superadditive (composite > 73/44/41).** This is the **dangerous** outcome, not the good one.
  It would mean a shared downstream nonlinearity amplifies the pair — both legs pushing the same
  pixels through the same band edge or shoulder together where neither could alone. The hue line
  was verified **per leg** (§119.3 P5: `sbm085` passes at 213–217°). A superadditive composite can
  therefore cross the ≤226° ledger line **even though each leg passes alone**. If A.4 shows
  superadditivity, the required action is to re-check the hue line and back the composite off —
  explicitly **not** to bank the extra drift closure.
- **Additive within noise.** The §115.1 factor was a six-leg artefact and does not generalise;
  record that and the brief's arithmetic stands.

### A.4 Acceptances that gate any ship

- **P-null.** Composite arm with both knobs at ship values must be **bit-identical to base, 0 px**,
  all shots. §119.3's P1 discipline; a falsified fix and a dead fix look identical without it.
- **P-hue.** Shadowed architecture hue **≤ 226°** (blue side of the G ≥ R line) at comparable
  saturation on all three shots. Report R/G **and** B/max **and** per-channel means together —
  §8's green-suppression residual and §3's blue inversion are the same trap from opposite sides,
  and either statistic alone calls the other one solved.
- **P-night FIRST.** `night` is re-measured **before** the day arms, not after. §32 records it as
  the one genuinely weak shot (+1.69, negative inward) and §119.3's P6 has the gate moving night
  by 0.11 % / Δb−r −0.0000 — so night is the shot the cool terms are paid for and the one a
  warm-ward composite can break. A night regression voids the arm regardless of day results.
- **P-frame.** Every arm is **looked at**, not only counted. §3's standing note: this defect has
  twice produced on-target numbers over a plainly wrong image.

---

## B. `Outline.js` per-group weight (§113.4, §116.3) — routed correctly, and cheaper than described

### B.1 The premise checked, and it holds

`SlyModel.js:808` builds `new THREE.SkinnedMesh(geo, mats)` — **one skinned mesh, an ARRAY of
materials, i.e. real geometry groups**. `SlyModel.js:3729` then calls `shading.outline(this.mesh,
{thickness: TUNE.outline / 0.0034})` **once**, and `Outline.buildOutlineShell` builds the shell with
a **single** material. three renders a non-array material as one draw over the whole geometry, so
the shell ignores the groups entirely. §116.3's "one shell at one thickness for the whole body" is
**confirmed true**.

### B.2 The plumbing already exists and is simply not reached

- `ToonMaterial.js:949` — `toon()` already accepts `outline:` per material.
- `ToonMaterial.js:1064` — already stores it: `mat.userData.outline = o.outline`.
- `ToonMaterial.js:1215` — `outlineAll()` already honours it: `thickness * want`.

So **every group's material already carries its own outline weight**; the single-material shell
throws it away. `outlineAll()` is not the path Sly takes.

### B.3 The fix, entirely inside SHADING's files, zero draw-call cost

Add a per-vertex `slyInk` float attribute, written by `Outline.js` from `geometry.groups` +
`mesh.material[i].userData.outline`, and multiply the clip-space extrusion by it in
`OUTLINE_VERT`. This is structurally identical to the existing `slyNormal` attribute, which
`OUTLINE_VERT` already declares and consumes — so the pattern is proven in this exact shader.

- **No `src/player/**` change required** to land the mechanism (weights are read off materials
  that already carry them).
- **No extra draw calls** — one float stream, versus one-draw-per-group if the shell were given a
  material array instead.
- CHARACTER then needs only to pass `outline: <k>` on the fur-card group. §116.3 exhausted
  CHARACTER's *card geometry*; passing a scalar is not that lever.

**Registered prediction, to be scored before tuning:** at `outline: 0` on the fur group the ink
attributable to fur cards goes to zero and total figure ink falls by **more** than §116.3's
widening raised it (+38 %), because a 2.5 px border on every edge of an 18–26 px card is ~40 % of
its footprint before overlap. **Falsified** if fur-group ink removal moves total ink by < 20 %.

**Not implemented in this pass.** It is a live shader change to the one pass that draws every
silhouette in the game, and §118 is the record of committing a live shader change unread. It wants
its own arm with a bit-identity null at `k = 1`.

---

## C. §8's `ao` term — the routed premise is a WITHDRAWN statistic

### C.1 The numbers in the routing message were withdrawn at §34

The item was routed as: *"authored dark occlusion … a 2.1:1 span, AO p5 0.247 / p50 0.408 …
lost downstream, because `ao` never multiplies the key term."*

`toon.glsl.js:416–421` — written at the declaration site per §34/§41 — withdraws exactly this:

> texlab emits **p1/p5/p50**, so the authored **median is 0.992** and 0.412 was the 5th
> percentile; the two figures in that sentence were the same statistic labelled twice. And
> nothing reads AO out of a frame, so "renders with a frame median" described a measurement that
> does not exist.

Independently confirmed at KNOWN_ISSUES.md:4440 — "§34 (`aoP` p1/p5/p50 read as p5/p50/p95)".

**There is no authored 2.1:1 broad value span to recover.** The authored AO is ≈ 1.0 across the
median and dark only in a sparse p1–p5 crevice tail.

### C.2 The structural half survives, and the A/B knob already exists

`ao` genuinely does not multiply the key term — that is textual, not inferred. The knob is
already shipped as scaffolding: `toon.glsl.js:449`,
`diff = alb * keyRad * key * mix(1.0, ao, uAoKey)`, with `TUNE.aoKey = 0.0`
(`ToonMaterial.js:522`). No code change is needed to run the arm.

### C.3 Offline sizing — this makes the capture unnecessary for the routed claim

`uAoStrength = num(opts.ao, 1) * TUNE.bakedAO = 0.55` (`ToonMaterial.js:940`, `:1031`), and
`ao = mix(1.0, aoTex, 0.55) = 1 − 0.55·(1 − aoTex)`. With `uAoKey: 0 → 1` the key term is scaled
by exactly that `ao`:

| authored `aoTex` | shaded `ao` | change to key term |
|---|---|---|
| p50 = 0.992 | 0.9956 | **−0.44 %** |
| p5 = 0.412 | 0.6766 | −32 % |
| p1 = 0.247 | 0.5859 | −41 % |

> **Prediction: turning `uAoKey` on darkens the median sunlit pixel by under half a percent and
> is confined to the sparsest few percent of texels.** It cannot deliver "the dark half of gold"
> as a value span, because the authored input has no such span. What it *does* deliver is
> occlusion in crevices — which is a different §7.3 line ("No ambient occlusion in crevices /
> where forms meet") and a legitimate one.

**Registered falsifier:** if an arm at `uAoKey = 1` moves the whole-frame midtone median by more
than **1 %**, this arithmetic is wrong and the authored-AO percentiles must be re-read off the
built texture before anything ships. Per the shader's own standing instruction, the arm must
measure **whole-frame midtones**, not the gilded mask — it darkens every crevice in every sunlit
surface in the game.

**Recommendation: do not spend a capture on the routed claim.** Spend one on the crevice claim if
§7.3's AO line is the target, and score it on midtones.
