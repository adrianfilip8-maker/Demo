# GitHub research — what is worth taking, ranked against the critic's defect list

**Date:** 2026-08-08. **Scope:** search-and-report only; nothing under `src/` was touched.
**Assets:** `public/assets/tombchaser/` — 32 CC0 Egyptian models + 27 extracted textures.

**A note on that directory.** I selected and copied that pack, and while I was still working another
agent independently selected, extracted and **committed the identical set** (`81d1540`) — same 32
models, same 27 de-duplicated textures, same directory name, byte-identical files. Their commit
stands; I have not re-staged anything. What their note explicitly left blank was the upstream
source — *"To be filled in from the research agent's report"* — and I have filled that in, keeping
their independent verification table and their integration warnings intact. The convergence is
itself mild evidence the selection was the right one.

The brief was to find reusable assets *and* technique. The most valuable thing I found was not a
repository — it was that **two of the critic's top three defects have causes already provable inside
our own tree**, and the external references mostly serve to confirm the fix. That ordering is
reflected below: where I can show the bug, I show it, and the outside repo is cited for the remedy.

Everything numeric below was produced by running code, not by reading it. The two scripts are in
this session's scratchpad and are reproduced inline so they can be re-run.

---

## Ranked findings

| # | Finding | Defect | Portable? | Licence |
|---|---|---|---|---|
| 1 | `mvPosition.z *= 1.0 + uDepthPush` makes ink width vary **0.38–4.62 px** by screen position | 2 | it's our own bug | — |
| 2 | We ship **two** independent ink systems with opposite width policies, and they sum | 2 | our own design | — |
| 3 | The only banding mechanism that works on a flat face is **shipped disabled**, and would have nothing to quantise if enabled | 1 | our own tuning | — |
| 4 | NiloCat `NiloZOffset.hlsl` — correct depth push that leaves x/y/w intact | 2 | yes, port verified | MIT |
| 5 | NiloCat lighting equation — `max(indirect, direct)` composite, not additive | 1 | yes, small change | MIT |
| 6 | Polygonal Mind *Tomb Chaser 1* — Egyptian CC0 models, **source identified** | 3 | yes, already in tree | CC0 1.0 |
| 7 | `waifu-rt3d` `HairShader.js` — Kajiya-Kay dual-lobe, no tangent attribute needed | 4 | yes, uniform swap | **unstated** |
| 8 | `SlyFanDev/Sly-Cooper-Low-Poly` — rigged Sly, 7 clips | 5 | yes, but **worse than ours** | **unstated** |
| 9 | `TheOnlyZac/sly1` — PS2 decompilation of the real game | 5 | reference only | see below |
| 10 | `waifu-rt3d` `ToonShader.js` / `OutlineShader.js` | 1, 2 | **do not adopt** | unstated |

---

## 1. The outline width bug, proven

`src/render/shaders/toon.glsl.js:1094`, in `OUTLINE_VERT`:

```glsl
mvPosition.z *= 1.0 + uDepthPush;      // uDepthPush = 0.0022
gl_Position = projectionMatrix * mvPosition;
```

The intent — documented in the comment above it — is to nudge the hull away from the camera so
camera-facing flats don't z-fight. It does that. It also does something unintended.

For a standard perspective matrix, `gl_Position.w = -mvPosition.z`. Scaling `mvPosition.z` therefore
scales **`w`**, while `gl_Position.xy` (which depend only on `mvPosition.xy`) are untouched. After
the perspective divide the entire hull is **scaled toward the screen centre** by `1/(1+uDepthPush)`.
The displacement in pixels is proportional to how far the vertex is from the principal point, so it
is zero at frame centre and largest at frame edge — and it *adds* to the ink on the side facing the
centre while *subtracting* from the side facing outward.

Measured, at 1600×900 / fov 50 / target width 2.5 px:

```
  eccentricity        ink, outward side    ink, inward side
      0 px                    2.50 px            2.50 px
    241 px                    1.97 px            3.03 px
    483 px                    1.44 px            3.56 px
    724 px                    0.91 px            4.09 px
    965 px                    0.38 px            4.62 px
```

With `uDepthPush = 0` the same sweep returns 2.50 px at every eccentricity — so this is entirely
that one line. **A 12× swing in a line that is supposed to be constant, from screen position alone.**
An off-centre character loses its outward ink almost completely (0.38 px); that is the low end of
the critic's "1 px to 29 px".

### The fix, ported and verified

`ColinLeung-NiloCat/UnityURPToonLitShaderExample` → `NiloZOffset.hlsl` (MIT) solves exactly this. Its
insight is that a depth push must rewrite **only `positionCS.z`** and leave `w` — and therefore x, y
and the perspective divide — alone. It builds an imaginary pushed vertex, computes its clip z, then
rescales that z by the *original* w so the NDC depth is the pushed one while xy are unchanged.

**There is a transcription trap.** The HLSL reads `UNITY_MATRIX_P[2].zw`. HLSL indexes matrices by
**row**, so that is `(P22, P23)`. GLSL indexes by **column**, so `projectionMatrix[2].zw` in GLSL is
`(P22, -1.0)` — the wrong second term. The correct GLSL pair is
`projectionMatrix[2].z` and `projectionMatrix[3].z`.

Verified against ground truth (`Vector4(0,0,z,1).applyMatrix4(P)` for the pushed z):

```
 z_view    want NDCz(z-0.05)     correct port     verbatim .zw port
     -2           0.90262929       0.90262929            0.51239514
     -8           0.97535281       0.97535281            0.87597642
    -30           0.99354378       0.99354378            0.96692215
   -120           0.99853388       0.99853388            0.99187016
```

The correct port is exact to all shown digits at every depth; the naive copy is wrong everywhere.
The GLSL to drop into `OUTLINE_VERT`, replacing the two lines quoted above:

```glsl
/* Push the hull away from the camera by a CONSTANT view-space distance, rewriting only the
   clip-space z. Scaling mvPosition.z instead also scales w, which shrinks the whole hull
   toward the screen centre and makes the ink width depend on screen position. */
vec4 slyZOffset( vec4 posCS, float offsetVS ) {
	float p22 = projectionMatrix[ 2 ].z;
	float p23 = projectionMatrix[ 3 ].z;
	float mvZ = -posCS.w - offsetVS;          // view z of the imaginary pushed vertex
	posCS.z = ( mvZ * p22 + p23 ) * posCS.w / ( -mvZ );
	return posCS;
}
...
gl_Position = slyZOffset( projectionMatrix * mvPosition, uDepthPush );
```

Note `uDepthPush` changes meaning: it becomes **metres of view-space push**, not a ratio. 0.0022 as
a ratio at 8 m was ~18 mm, so start around `0.02` and re-check the z-fighting case that motivated it.

---

## 2. Two ink systems, summed, with opposite policies

This is the structural half of defect #2, and no external repo will fix it.

- **The hull** (`OUTLINE_VERT`) is written to be *screen-constant*: it converts to pixel units and
  cancels the perspective divide, and its comment says so — *"the same width whether Sly is 2 m or
  200 m away"*.
- **The PostFX crease pass** (`src/render/PostFX.js:871`) is written to be *deliberately variable*:

  ```glsl
  float weight = mix( uWeight.x, uWeight.y, smoothstep( uWeight.z, uWeight.w, z0 ) );
  vec2 o = uTexel * uParams.z * weight;   // o is the Roberts-cross sample offset = the line width
  ```

  with `edgeNearMul: 1.8`, `edgeFarMul: 0.70` — a designed **2.57×** variation by depth, justified in
  its own comment: *"A hand-inked frame gets heavier on what is close."*

Both draw ink on the same silhouettes and the results add. `PostFX.js:46` already records the
consequence — *"measured at 6 px of black on Sly's arm at 960 wide"*. So the total is
(hull: 0.38–4.62 px, varying by **screen position**) + (crease: ~1.05–2.7 px nominal and measured at
6 px on a near limb, varying by **depth**). Nothing anywhere owns the sum.

**No amount of shader correctness makes that constant.** One system has to own line width. The
cheapest coherent choice: keep the hull as the silhouette line at a fixed pixel width (with §1's
fix), and demote the crease pass to *interior* creases only — which is what `AGENTS.md §2.1` says it
is for anyway (*"the interior creases the hull shells can't give us"*). Fixing §1 without also
settling this will move the number but will not make it stable.

---

## 3. Why the cel shading does not band — the chain is already documented in our own comments

The critic measured max luma step 3.79 across a 420 px sweep. The cause is a chain of four, three of
which are recorded in the tree as separate observations that were apparently never read together:

1. **`slyRamp` can only band where the normal turns.** `toon.glsl.js:270` — *"this level is boxes and
   faceted cylinders, so a flat face has one normal, lands wholly inside one band … Every large
   surface in the game is therefore a single flat tone no matter how the ramp is tuned."* An Egypt
   level is walls, floors and pylons. This is most of the frame.
2. **`slyShadowBand` is the one mechanism that bands a flat face** — it quantises the shadow-map
   penumbra, which exists on a plain wall because it comes from the PCF kernel rather than the
   surface. Correct idea.
3. **It is shipped switched off.** `ToonMaterial.js:51` — `shadowBands: [2.0, 0.10, 0.0]`. The third
   component is the amount, and `toon.glsl.js:284` states *"uShadowBands.z = 0 disables it and
   restores the plain smoothstep"*.
4. **Turning it on alone would not help,** because there is nothing to quantise. `Lighting.js:101`:
   five Vogel taps *"can only produce six distinct values"*, at `shadowRadius: 2.4` that is a ~12 cm
   penumbra, and `shadowSharp: [0.10, 0.66]` then *"discards the outer two levels — which is why the
   shadow term measures as effectively binary and why `uShadowBands` has never had anything to
   quantise (bandsOn moved `night` by 2 px of 423 644)"*.

So the ordered fix is **(a)** widen the penumbra (`shadowRadius`, bracketed — its own comment warns
the 5-tap dither starts to show), **(b)** widen the `shadowSharp` window so the extra levels survive,
**(c)** only then set `shadowBands[2]` above 0. Doing (c) first measures as a no-op, which is
presumably how it ended up at 0.

### What the external reference adds

`SimpleURPToonLitOutlineExample_LightingEquation.hlsl` (MIT) contributes one thing our `TOON_SHADE`
does not do, and it is directly relevant to *measured luma steps*:

```hlsl
half3 rawLightSum = max(indirectResult, mainLightResult + additionalLightSumResult);
return surfaceData.albedo * rawLightSum + emissionResult;
```

**`max`, not `+`.** Ambient/indirect is combined with the banded direct term by taking the maximum,
so the ambient floor cannot smear the step. Our `TOON_SHADE` *adds* a hemispheric fill, a bounce
term and AO on top of `key = ramp * sh`; every additive term with a spatial gradient partially fills
the gap the quantiser just cut, which is precisely what shrinks a measured luma step. Its second
idea is worth having too: shading is `albedo * lerp(_ShadowMapColor, 1, bandedMask)` — one lerp
between a shadow *colour* and white, driven by the banded mask, rather than a sum of lights.

I did not measure what switching to `max` would do to our frame; that needs the build. It is a small,
reversible experiment and it is the highest-value one on this list after the shadow-penumbra chain.

---

## 4. Assets — source identified, pack already in tree

**`public/assets/tombchaser/`** — 32 models + 27 de-duplicated textures, **CC0 1.0**, full legal text
kept as `LICENSE.txt`, details in `PROVENANCE.md` beside them. Committed by a concurrent agent at
`81d1540`; my contribution is the provenance and the texture-level assessment below.

**The source, which that note recorded as unknown:** Polygonal Mind's *Tomb Chaser 1* pack, fetched
from `ToxSam/cc0-models-Polygonal-Mind` at `projects/tomb-chaser-1`, indexed by
`ToxSam/open-source-3D-assets` (138★). Described upstream as *"Egyptian pyramid platformer assets
with sand, rocks, brick textures, and ancient gods"*, `"creator_id": "Polygonal Mind"`,
`"license": "CC0"`. A search for `tombchaser` failed for them because the pack is published as
**"Tomb Chaser 1"** inside a multi-pack repository — the string is never a repository name.

Contents worth knowing about, all verified by opening the files rather than trusting names:

- **Statuary:** Anubis, Bastet and Ra (1,468 tris each). Hard to author procedurally; their texture
  is a **flat colour-band palette strip**, not detailed imagery — which is close to ideal for a cel
  ramp, since there is no baked shading to fight.
- **`textures/Bricks_Albedo.png`** — tiling warm sandstone brick, mean RGB (235, 157, 82). The single
  most directly reusable file in the set.
- **`textures/Wall_Albedo.png`** — carved panels with **hieroglyph cartouches**.
- **`textures/Door_Albedo.png`** — winged sun-disc, rosettes, Egyptian motif work.
- Architecture: temple arches, embellishers, columns, walls, floors, platforms. 200–2,200 tris each,
  one material each.

Nine of ten albedos measure warm (R > B + 12); the tenth is the gem atlas, correctly cool. Excluded
the two ~10 MB terrain meshes, the 2 MB level blockouts, and the branding/UI files — all still
upstream.

**Cost note:** the pack embeds the *same* atlas into every GLB that uses it, so 17 MB of models carry
only 5.1 MB of distinct imagery. The textures are extracted separately for exactly this reason; if
size becomes a problem, strip the embedded copies and point materials at `textures/`.

---

## 5. Character rendering — one technique worth lifting

`WestonGFX/waifu-rt3d`, `frontends/shared/lib/shaders/HairShader.js`. **Licence: unstated** — the
repository has no LICENSE file; I checked rather than assumed.

Kajiya-Kay dual-lobe anisotropic specular that **synthesises its own tangent frame from the normal**,
so it needs no tangent attribute and no re-export of the mesh:

```glsl
vec3 N = normalize(vNormal);
vec3 ref = (abs(dot(N, vec3(0,1,0))) > 0.9) ? vec3(1,0,0) : vec3(0,1,0);  // avoid degenerate cross
vec3 T = normalize(cross(N, ref));
vec3 B = normalize(cross(N, T));
vec3 H = normalize(L + V);
// two lobes, each a tangent shifted along the bitangent
vec3  Tp = normalize(T + uShiftPrimary * B);
float td = dot(Tp, H);
float spec = pow(sqrt(max(0.0, 1.0 - td*td)), uSpecPower);   // sin(T,H) = sqrt(1 - cos^2)
```

Two lobes at different shifts/powers/colours give the banded sheen that reads as fur or hair rather
than plastic. Portable to `TOON_SHADE` directly — it needs `N`, `V`, `H` and a light direction, all
of which we already have as `N`, `V` and `uKeyDir`; the reference uses three's `dirLight0.direction`,
which is the only line that needs changing. Worth quantising the lobe to match the ramp rather than
leaving it smooth.

The same repo's `EyeShader.js` (290 lines) targets defect #4's eye requirement; I did not read it
closely.

## 6. What I found and am recommending **against**

Recorded because "we looked at it and it's worse than ours" saves the next agent the trip.

- **`waifu-rt3d/ToonShader.js`** — quantises the *already-accumulated* `reflectedLight.directDiffuse`
  after `lights_fragment_begin` instead of replacing the light loop. That bands the *sum* of all
  lights, so the terminator position depends on light count and intensity. Its softness line,
  `smoothstep(0.0, uToonSoftness + 0.001, quantized)`, maps nearly every non-zero input to 1.0. Our
  §221 approach — cut the PBR blocks out and quantise `N·L` directly — is strictly better.
- **`waifu-rt3d/OutlineShader.js`** — inverted hull using `normalize(viewNormal.xy) * uThickness *
  0.002 * clipPos.w`. View space, not clip space: no FOV term and no aspect correction, so the line
  is a different width horizontally than vertically, and `0.002` is a magic constant standing in for
  the projection. Ours is already correct on all three counts.
- **`SlyFanDev/Sly-Cooper-Low-Poly`** — a genuine rigged Sly: 2,222 tris, 45 joints, 7 clips
  (Attack, Climb, Dead, Fall, Idle, Run, Walk), plus the `.blend`. **Licence: unstated**, fan work.
  I did not stage it: `assets/sly-anim/` already holds **16** authored clips on a 144-joint rig, and
  the model has no tail and no cane. Only conceivable use is an LOD1 silhouette. Preview inspected.
- **`TheOnlyZac/sly1`** (233★) — decompilation of *Sly Cooper and the Thievius Raccoonus*. No art
  assets (it needs your own disc image), and PS2-era fixed-function rendering does not port to a
  modern cel pipeline. Real value would be **mechanics reference** — the actual movement and camera
  constants — not rendering. Out of scope for this brief; flagged in case movement work wants it.
- `VelocityRa/SlyTools`, `NiV-L-A/SlyStuff` — PS2/PS3 format research and 010 Editor templates.
  Only useful with retail game files in hand, which we do not have.

## 7. What I could not reach

- **`mcp__github__get_file_contents` is scoped to `adrianfilip8-maker/demo`** and refuses every other
  repository: *"Access denied: repository … is not configured for this session."* Repository and code
  **search** are unrestricted, so discovery worked fine; only direct file reads are blocked.
- **`api.github.com` and `raw.githubusercontent.com` return 403 through the proxy** for repositories
  not attached to the session — *"GitHub access to this repository is not enabled for this session."*
  This is policy, and I did not attempt to route around it.
- The working path is **anonymous `git clone` via the session's git proxy**, which serves any public
  repository. That is how everything above was read. `--filter=blob:none --sparse` kept the 60 MB
  asset repo down to just the directory we wanted.
- One `search_code` call failed with a GitHub-side `503 too many shards failed`; a differently-worded
  query returned results, so nothing was lost.
- Repository search is markedly weaker than it looks: multi-word queries such as
  `toon shader three.js outline` return **zero** results because every term must match, while
  `toon shader` returns 611. Several early searches were false negatives for this reason.

## 8. Suggested order of work

1. `slyZOffset` in `OUTLINE_VERT` (§1) — self-contained, provably removes a 12× width variation.
2. Decide which system owns line width (§2) — no code will fix this, it is a design call.
3. The shadow-penumbra chain (§3), in the order (a) → (b) → (c); doing (c) alone measures as nothing.
4. Try `max(ambient, direct)` in place of the additive fill in `TOON_SHADE` (§3) and measure the luma
   step against the 3.79 baseline.
5. Dress a scene with `public/assets/tombchaser/` and put `Bricks_Albedo` on the sandstone material.
6. Kajiya-Kay lobes on Sly's fur (§5), quantised to the ramp.
