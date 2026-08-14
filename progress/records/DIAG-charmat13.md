# DIAG-charmat13 — the tail-ring and shirt-facet complaints, diagnosed offline BEFORE any capture. Both critic attributions are REFUTED; both symptoms are real and re-aimed.

CHARMAT, 2026-08-14. Read-only, no boot, no lock, no src edit. Every number below comes from
the two scripts committed beside this file, run against the **shipped** tree:

```
  node progress/records/charmat13/normdiag.mjs     # (c) normal continuity on the shipped rig
  node progress/records/charmat13/yawdiag.mjs      # (b) per-yaw tail ring contrast in the albedo
                                                   # (c) per-triangle normal spread
  node progress/records/charmat13/hookderive.mjs   # (a) the r12 hook baselines — PREREG-canegold3 §3
```

The rig is loaded through `tests/dlrig.test.mjs`'s three mechanical rewrites, so this measures
the module that ships, not a replica (its own header explains why that distinction is
load-bearing here). The load reproduces the pinned boot line — `relaxed 6070 glove vertices` —
which is the agreement that licenses every other number.

This file exists because **two of the three character-material items I was sent to fix turn
out to be aimed at the wrong asset**, and spending a capture on either would have burned a
boot to change something that is already correct. Recording the falsification is the product.

---

## (c) SHIRT FACETS — "unsmoothed normals leaking through the quantised bands" is FALSE

r12 verbatim: *"the toon ramp breaks into visible polygon facets on the shirt and shoulders —
unsmoothed normals leaking through the quantised bands"*.

### The normals are smooth. Measured three ways, all agreeing.

Vertices at coincident positions (bucketed at 0.1 mm) and the maximum angle between their
normals — this is the definition of a hard/split normal seam:

```
  population            groups   > 1 deg      mean     p50    p90    p99      max
  ALL                    6 575    35 (0.5%)   0.24     0.00   0.02   0.02   108.38
  slydlrig:body          4 112    28 (0.7%)   0.25     0.00   0.02   0.02   108.38
  slydlrig:head          1 740     1 (0.1%)   0.03     0.00   0.02   0.02    41.61
  slydlrig:tail            245     0 (0.0%)   0.01     0.00   0.02   0.02     0.02
  slydlrig:eyeball         484     0 (0.0%)   0.01     0.00   0.02   0.02     0.02
  SHOULDER/CHEST band      718    14 (1.9%)   0.91     0.00   0.02  43.44    92.20
    (body, y 62-82% of the character's height — the exact region named)
```

p99 is **0.02 degrees** on the body and in the shoulder band alike: 98 % of shared positions
carry a normal agreeing to within a fiftieth of a degree. The residual 0.5–1.9 % are genuine
UV/material island borders (where a split normal is correct) plus the top-4 skin-weight
truncation in the conform.

And per triangle, the direct test for flat shading:

```
  per-triangle FLAT normals (all three corners == the face normal):
      8 / 13 057 tris  (0.1 %)          body only: 8 / 8 187  (0.1 %)
```

**Eight triangles out of thirteen thousand.** There is no flat-shaded shirt, no missing
smoothing group, and no `flatShading` anywhere in the material path. The attribution is dead.

### What the facets actually are: 41 degrees of normal inside one triangle

The same script measures the **corner-normal spread per triangle** — how much the interpolated
normal turns across a single face:

```
  population                     n      corner-normal spread, deg        mean tri edge
                                        p50     p90     p99     max
  body ALL                    8 193    41.1    65.8    95.0   151.2      26.9 mm
  body SHOULDER/CHEST 62-82%  1 429    32.2    51.3    84.7    97.6      31.2 mm
  body SHOULDER 70-80%          748    33.6    53.9    90.0    97.6      29.8 mm
  head ALL                    3 432    29.3    67.1    92.3   140.3      17.9 mm
  tail ALL                      478    26.7    39.6    77.1    77.5      66.3 mm
```

The median shirt triangle spans **33–41 degrees of normal**. The ramp's terminators sit at
`N·L` 0.14 and 0.52 with `termSoft` 0.024 (≈ 0.05 total width) — a band edge is therefore a
**sub-triangle** feature crossing faces that each turn by a third of a right angle.

Inside a triangle the shading normal is `normalize(barycentric lerp of three corner normals)`.
That field is C0 across an edge and **not C1**: its gradient jumps at every shared edge. So an
iso-line of `N·L` is a smooth curve *within* each face and **kinks at every edge it crosses**.
With a hard 3-band quantiser the kinked iso-line is drawn as a visible boundary, and the
boundary therefore traces the triangulation. That is precisely, and only, "the toon ramp breaks
into visible polygon facets". It is a **tessellation-vs-band-width** defect, not a normals
defect, and it will reproduce on any perfectly-smooth-normalled mesh at this density.

### Consequences, stated plainly

* No material, texture or shading-value change fixes it. There is nothing to smooth: the
  normals are already smooth to 0.02 degrees.
* Widening `termSoft` would hide it — that is the "blur the ramp" fix the brief forbids, and it
  would spend the cel look to hide a mesh-density problem.
* The real levers are **mesh density on the shirt/shoulders** (Loop or per-region subdivision,
  which lands squarely on the §1 triangle-budget item the same critic rounds have raised in
  15/16 shots) or **curvature-corrected shading normals** (a quadratic normal term, i.e. new
  per-vertex data plus a shader term — a SHADING seal, not a CHARACTER one).
* **Registered mechanical bar for whoever takes it**, so the next lane does not have to invent
  one: *median corner-normal spread over the body group's 62–82 % height band must fall from
  the measured **32.2 deg** to **≤ 16 deg** (one subdivision level halves it) with the group's
  triangle count stated in the same table.* The measurement is `yawdiag.mjs`'s `spreadBand`,
  offline, no capture needed to score a candidate mesh.

**Verdict: NO CANDIDATE, NO CAPTURE, NO SHIP from this lane.** The complaint is real, its
stated cause is refuted with numbers, its true cause is sized, and it is routed with a bar.

---

## (b) TAIL RINGS ALL-YAW — "the rings must exist in the albedo" is ALREADY TRUE at every yaw

r12/r11 verbatim: *"the tail from behind is a white/orange sack with no rings"* · *"rings only
exist where lighting flatters them"*. The brief routed this as TEXTURES: put the ring bands in
the albedo so they read from every yaw.

### §282 pre-flight: which file, which island — done first, and it matters

```
  sly_tail.png   128 x 128 RGBA          sly_body.png / _fix.png   512 x 512 RGBA
  sly_head.png   512 x 512 RGBA          sly_eyeball.png           (unused here)

  merged geometry, group order and UV extents on the SHIPPED rig:
    group 0  slydlrig:body      8 193 tris   u[-0.017,0.996]  v[ 0.004,0.998]
    group 1  slydlrig:eyeball     960 tris   u[-0.039,1.050]  v[-0.067,1.100]
    group 2  slydlrig:head      3 432 tris   u[ 0.019,1.000]  v[-0.003,1.003]
    group 3  slydlrig:tail        478 tris   u[ 0.051,0.992]  v[ 0.114,1.504]
```

The tail is its **own material on its own 128² file** — it does **not** share the body texture,
so the §282-class hazard the brief warned about (editing `sly_body*.png` and moving the
costume) does not arise. Two facts that would have broken a naive edit anyway: the tail island
runs to **v = 1.504**, i.e. half a tile past the edge, and both maps are `RepeatWrapping`
(`SlyModelDLRig.js:583-584`), so the overrun tiles rather than clamping. The island covers
**12 805 of 16 384 texels (78.2 %)** of `sly_tail.png`.

### The rings are in the albedo, and they are in it from every yaw

`sly_tail.png` along v, over the covered texels (mean luma per line, 60 samples):

```
 137 137 137 136 136 112  79  70  68  68  68  68  68  68  68  68  68  68  69  69
  70  88 104 119 133 138 138 138 138 137 137 137 137 137 137 137 137 137 137 116
  87  70  68  68  68  68  68  68  68  68  66  63  63  64  65  66 134
```

Two full ring cycles, light 137 against dark 63–70 — a **2.0:1 band ratio in the albedo**, and
with v running to 1.504 under repeat wrapping the tail carries about three rings along its
length.

The decisive test is per-yaw. For each view direction, take the tail triangles facing the
camera (`n·dir > 0.10`), sample the albedo at each triangle's UV centroid, and take
**area-weighted** luma percentiles over exactly the texels that yaw can see:

```
  yaw                 visTris  visArea   albedo L: p05    p50    p95   span   Michelson  p90/p10
  FRONT   (+Z)          192    0.4407           56.0  113.5  159.5  103.6     0.480      2.37
  PROFILE-R (+X)        219    0.4532           52.9   79.8  156.5  103.6     0.495      2.62
  REAR    (-Z)          207    0.4360           52.9   65.9  140.5   87.6     0.453      2.24
  PROFILE-L (-X)        212    0.5159           52.9   92.1  156.5  103.6     0.495      2.62
  REAR-3Q (-Z+X)        224    0.4519           52.9   65.9  141.5   88.6     0.456      2.60
  ABOVE   (+Y)          230    0.5724           65.9   94.1  159.5   93.6     0.415      2.37
```

**Six yaws, Michelson contrast 0.415–0.495, band ratio 2.24–2.62. The rear is the weakest and
it still carries 92 % of the profile's Michelson and 85 % of its span.** There is no yaw at
which the ring bands are absent from the albedo.

So the sealed job — "the ring bands must exist in the albedo so they read from every yaw" —
describes a state the asset is **already in**. A texture-regeneration candidate here would have
been a §282 error at the scale of the whole seal: a defect observed in one context (the frame)
and aimed at another (the albedo) without re-deriving in the second.

### Where the rings are actually lost — and it is two different places

The frames say the same thing once you separate them:

* `shots/r12/sly-profile.png` — the rings **read**, clearly, cream against dark, and r11 said
  so unprompted (*"genuinely matches the reference — proves the team can hit the reference when
  a part is actually authored"*). Same albedo, same 2.62 band ratio.
* `shots/r12/sly-perch.png`, `sly-arm.png` — the tail is a flat **orange** sack. These are the
  tod-0.80 salmon-flood shots. §305 CLOSED this from both ends: at tod 0.80 the albedo
  illegibility is unrecoverable by any lighting or grade lever, and the remaining question is
  the Option-A staging decision, **OWNER**. This half of the complaint is not a texture item
  and not a CHARMAT item.
* `shots/r12/sly-key.png`, `sly-closeup.png` — rear-ish yaw, ordinary key. The tail reads as a
  soft brown mass with the bands barely separated even though the visible albedo carries a
  2.24–2.60 ratio. **This is the only genuinely open half**, and its candidate mechanism is the
  render, not the map: the tail material runs `sss 0.228` with a warm `wrapColor` and `rim
  0.62`, and those are **additive** terms — they add the same amount to a dark ring and a light
  ring and compress the ratio, exactly the arithmetic `NOTE-tailpalette` §2 predicted ("rings
  surviving as hue-only inside the shadow band is what a 3-band cel ramp does").

### Routing and the bar for it

Re-aimed to a **render-side, same-boot A/B** (SHADING/CHARACTER, not TEXTURES), with the
instrument already specified: tag `slydlrig:tail`, difference to get the exact tail mask,
and score the **in-frame** band ratio on that mask against the **albedo** band ratio for the
same yaw, which this file has now published for all six yaws. The bar writes itself and is
falsifiable in both directions:

> in-frame `p90/p10` on the tail mask must reach **≥ 0.70 x the albedo `p90/p10` for that
> yaw** — i.e. `≥ 1.57` at rear (2.24) and `≥ 1.83` at profile (2.62) — with `sly-profile`
> as the positive control, since it is the yaw the critic already scored as correct.

Arms worth one boot, in order of the arithmetic: `sss 0.228 → 0`, `rim 0.62 → 0`, both. If the
in-frame ratio does not move, the additive-term hypothesis is dead and the remaining suspect is
the tonemap/grade, which is family 1 and already owned.

**Verdict: NO TEXTURE CANDIDATE, NO CAPTURE, NO SHIP from this lane.** The albedo is correct
at every yaw and is left byte-identical. `sly_tail.png`, `sly_body.png`, `sly_body_fix.png`,
`sly_head*.png` are untouched by this lane; `tools/slybody.mjs` was not run.

---

## What this frees, and what it costs

One boot was budgeted for three seals. Two of the three are answered offline for free and
without a lock, so the whole capture budget goes to **(a) the gold cane** — the one item where
a real, untried candidate cell exists (`PREREG-canegold3.md` §1: every arm canegold ever ran
carried `metal > 0`; the dielectric cell has never been rendered).

The cost, stated so it is not lost: both critics rank the tail and the shirt in their top
family, and this lane ships nothing for either. What it ships instead is that neither is a
CHARACTER-material defect, with the numbers to stop the next lane re-deriving them, and a
registered bar apiece so the owner of each can score a candidate without a new seal.

— CHARMAT. No `src/**` and no `src/assets/**` file is modified by this record.
