# PREREG-torchlight — the tomb sconces get their missing consumer: a gated local-light term in the toon shader

**Lane:** LIGHTING (critic round 10 dispatch: `interior` 4.5/10, "torches are bloomy orbs that
cast nothing; floor and piers sit in uniform cool ambient; no pool of warm light anywhere").
**Date sealed:** 2026-08-12. **Status: REGISTERED before any capture. `progress/records/torchlight1/`
does not exist at the time of writing and no frame of any arm has been rendered.**
Runner (`torchlight.mjs`), scorer (`torchlight-score.mjs`) and link probe (`torchlink.mjs`)
are committed with this file, before the capture.

**Ownership disclosure, up front.** The dispatch names LIGHTING the owner of this fix and
`NOTE-torchpool.md` (FX, 2026-08-06) already traced the break to one missing term in the toon
shader: PROPS registers real lights (`Props.js:583` — six tomb sconces at (±4.35, −9.05,
−62/−68/−74), color `0xffb060`, I 3.4, radius 9, flicker 0.55), LIGHTING pools, flickers and
uploads them correctly every frame (`_updateLocalLights`), and `ToonMaterial._patch` deletes the
three.js accumulation that would have consumed them — so **every `THREE.PointLight` in the game
contributes exactly zero to every toon surface**, and what the critic sees at a sconce is the
additive flame sprite plus emissive. The fix therefore has to touch two SHADING files. The diff
there is minimal and quoted in §2 verbatim; LIGHTING keeps the data, the gate policy, the TUNE
value and the per-frame publish. The alternative — LIGHTING string-splicing SHADING's composed
shader at runtime, the way the CSM patch splices three's — was considered and rejected: it
couples to SHADING's exact GLSL text silently, which is worse for SHADING than a reviewed diff.

## 1. Investigation results this seal is built on (all re-verified on today's tree)

1. **No existing sconce/emissive channel can do this.** Every light-bearing uniform in
   `toon.glsl.js` is `uKeyDir/uKeyColor/uKeyIntensity/uSkyColor/uBounceColor/uShadowColor*` —
   one key, one hemi fill, one shadow light. Emissive lights nothing but itself. The torch
   *cones* (`Lighting._rebuildCones`) are FX volumes in the air, not irradiance on stone, and
   NOTE-torchpool measured the whole FX-side ceiling at ≤ ~2 pp of a ~24 pp warm gap.
2. **The punctual helpers survive the patch.** `_patch` cuts only `lights_physical_fragment`,
   `lights_fragment_begin/maps/end`, `aomap_fragment`. `lights_pars_begin` — which declares
   `pointLights[NUM_POINT_LIGHTS]`, `getPointLightInfo()` (view-space), `getDistanceAttenuation()`
   — still resolves into every toon program, and the renderer still uploads the light uniforms
   (that is how the CSM directional lookups in TOON_SHADE already work). Verified against
   `node_modules/three` r185: transform order is resolveIncludes → replaceLightNums →
   unrollLoops (`WebGLProgram.js:794-799`), so `NUM_POINT_LIGHTS` in injected text becomes a
   literal and `#pragma unroll_loop_start` behaves exactly as in three's own chunks.
3. **Geometry bounds the blast radius.** All six tomb sconce lights sit at y = −9.05 with
   radius 9: three's cutoff attenuation is exactly 0 at d ≥ radius, so they cannot reach any
   surface at y ≥ −0.05 — no above-ground pixel is reachable even before gating. Conversely
   every other registered fire is above ground (8 courtyard braziers y 1.15, 10 hall torches
   y 4.55, guard spills at guard origin y ≈ 0). Underground (y < 0) is this file's own
   established convention for "tomb" (`Lighting.js` cones, `Props` mounts).
4. **Slots.** Capture quality is `high` → `localCap` 6. From the `interior` camera
   (3.2, −9.2, −60) the six tomb torches are the six nearest registered lights (2.31–15.9 m;
   nearest above-ground competitor ≥ ~19 m), so all six promote and `NUM_POINT_LIGHTS` = 6.
5. **Near-field hazard.** 1/d² at the torch head/bracket (< 0.5 m) reaches ~28 radiance —
   that would re-feed §25's bloom (threshold 2.20 scene-linear) at the exact spot the critique
   calls "bloomy orbs". The term is therefore capped (see §2) at 1.6 scene-linear per pixel —
   below bloom threshold even at albedo 1, so the new term alone can never push a pixel into
   bloom.
6. **The ambient half of the critique is not re-litigated.** "ambient dropped to near-dark
   cool" was bracketed by the enclosure fan (Lighting TUNE.encloseStrength note): a 10× sky-fill
   cut moves the tomb 14% and makes pool:floor contrast *worse*, because the tomb's floor light
   is the sun-pinned shadow floor (SHADING's `_refreshShadowColor`), not the fill. The dispatch
   bar is "far-ambient ROI DROPS **or holds**"; this seal registers **holds** and buys the
   contrast on the warm side, where NOTE-torchpool located the missing ~22 pp.

## 2. The candidate — one term, one gate, one gain, one cap

Files (the complete src surface of this seal — nothing else under `src/**` moves):

- **`src/render/shaders/toon.glsl.js`** — declare `uniform float uLocalToon;` (+ a
  `SLY_LOCAL_CAP` const, 1.6) in TOON_PARS; in TOON_SHADE, immediately after `diff` is composed
  and before the metal reduction:

  ```glsl
  #if NUM_POINT_LIGHTS > 0
      if ( uLocalToon > 0.0 ) {
          vec3 slyLocalAcc = vec3( 0.0 );
          IncidentLight slyLocalL;
          float slyLocalY;
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
              getPointLightInfo( pointLights[ i ], slyViewPos, slyLocalL );
              slyLocalY = slyWorldPos( pointLights[ i ].position ).y;
              slyLocalAcc += slyLocalL.color
                  * ( clamp( dot( N, slyLocalL.direction ), 0.0, 1.0 )
                    * ( slyLocalY < -0.5 ? 1.0 : 0.0 ) );
          }
          #pragma unroll_loop_end
          diff += alb * min( slyLocalAcc * uLocalToon, vec3( SLY_LOCAL_CAP ) );
      }
  #endif
  ```

  Placement before `diff *= mix(1.0, 0.20, slyMetal)` on purpose: gilding keeps its 0.20
  diffuse discipline under torchlight too. Lambert only — no wrap (wrap widens the no-shadow
  leak), no ramp quantise (the 1/d² falloff is already the pool's shape; banding it is a look
  decision for a later seal, not this one). AO deliberately not applied: house rule is AO is
  ambient-only ("letting it touch the key is the classic way to make cel look like dirty PBR")
  and this is a direct light.

- **`src/render/ToonMaterial.js`** — shared uniform `uLocalToon: { value: 0.0 }` (0 = branch
  untaken, the pre-seal build); `setKeyLight` gains a `local` field: written only when
  `typeof local === 'number'` (the poke-sticks contract for every other uniform is preserved
  when a publisher omits it).

- **`src/render/Lighting.js`** — `TUNE.localToon: 2.5`; `_publishKeyLight` sends
  `p.local = engine.debug.localToon ?? TUNE.localToon` (the `fillScale` in-page lever pattern,
  so every arm below is a debug poke in one boot, no src arm).

**Exactness spellings, registered:** at `uLocalToon = 0.0` the branch is untaken (test on the
uniform, quad-uniform, the `uSpecNormPow` standard). At gain > 0 with every in-range light
gated (above-ground): each contribution multiplies by exactly `0.0`, the accumulator stays
`vec3(0.0)`, `min(0·g, 1.6) = 0`, and `diff += alb * 0.0` adds exactly `+0.0` to a
non-negative `diff` — bit-identical output. **Whether a *recompiled* program with new untaken
text is bit-identical on SwiftShader is not assumed — it is what B1–B15/N1/D1 measure.**

**Why gain 2.5.** Model at the registered constants (I 3.4, decay 2, cutoff 9, torch colour
linear ≈ (1, 0.434, 0.117), floor 2.95 m below the light, sandstone-family albedo ≈ lin 0.3
luma, base tomb floor ≈ lin 0.28 luma — the enclosure bracket's own figure): directly under a
sconce the term adds ≈ 0.19 linear luma at 2.5 → the pool reads ≈ +15–25 display L with a
strongly R-dominant channel split (ΔR ≈ 12× ΔB before grading), fading smoothly to nothing by
d = 9. Gain 1.0 models at ≈ +8 display L — under the registered visibility bar; 6.0 is the
registered overdose arm. 2.5 is the smallest modelled value that clears P1 with ≥ 1.8×
margin. The cap keeps the sconce mount faces at ≤ 1.6·albedo — a hot warm halo that whitens
at the clip like an ember core (per-channel min, deliberate), never a bloom feed.

## 3. Registered ROIs (1280×720, x0,y0,x1,y1 half-open; anchors from projecting the shipped
`interior` camera: pos (3.2,−9.2,−60), target (−1.5,−11.5,−74), fov 52)

- **POOL** = **[292, 432, 392, 490]** — floor under the (−4.35, −9.05, −68) sconce (floor
  point projects to px (310,448), pool centre pulled 1 m into the nave projects to (369,455)).
  Chosen clear of the canopic-jar cluster (enters at x ≈ 397) and of Sly (x 600–730).
- **FAR** = **[380, 30, 560, 120]** — upper far-wall band; every surface point in it is
  ≥ 7.3 m from every sconce light, where the term's possible add is ≤ ~+1.5 display L.
- Sly's subject box and the R-side pool are reported descriptively, not gated.

r10 anchors (58e3f49 frames, stale tree — used to size bands only, never scored): POOL
meanL 68.6, mean(R−B) −16.7, warm% 4.5. FAR meanL 62.1, mean(R−B) −26.4, warm% 1.2.
Statistics convention: display bytes, L = Rec.709; warm% = (R > B+10 ∧ L > 40) share of the
whole rect (CRITIC's predicate); differing px = any |Δ| ≥ 1 in any of R,G,B on decoded pixels.

## 4. Arms and boots (runner `torchlight.mjs`; frames → `progress/records/torchlight1/`)

BASE ref: the parent of the candidate src commit, passed to the runner explicitly.
**Precondition (VOID otherwise): `git diff --name-only BASE..HEAD -- src/` is exactly the three
files in §2.** All captures: `quality high`, 1280×720, `setShot(name, {dt:0})`, step(3,0),
renderFrame(0) — the §251 frozen-clock discipline, so flicker/FX phase is staging-anchored and
identical across arms and boots.

- **Boot A (base tree):** §186-shaped — the runner passes `onLocked` to `withGame`, which
  writes the BASE versions of the three files (from `git show`) after the FIFO lock is granted
  and before vite spawns; `onReleasing` restores HEAD with `git checkout` before the lock
  releases. Captures all 16 canonical shots in roster order → `<shot>.base.png`.
- **Boot A2 (base tree, same install):** `interior` + `hero` only → `<shot>.base2.png` —
  the cross-boot determinism control.
- **Boot B (HEAD, no install):** all 16 in the same roster order → `<shot>.cand.png`. When
  `interior` comes up, while it is still staged: poke `debug.localToon` 0 → `interior.null0.png`,
  6.0 → `interior.kbover.png`, 2.5 → `interior.restore.png`, then clear the debug override.

Per-arm readbacks recorded in the manifest: `treeState()` (content hash of `src/` as booted),
`uniforms.uLocalToon.value` (must be `null`/absent on base arms — the term does not exist
there), `debug.localToon`, and the visible local-light slots as `{worldY, intensity}` —
`interior` must show exactly 6, all y < −0.5 (V1); daylight cand arms must show gain 2.5 live
(V2) so B1–B15 are measured against the *shipped* configuration, not an accidentally-off one.

## 5. Registered bars (scored by `torchlight-score.mjs`, tri-state via `tools/gate.mjs` —
VOID is not PASS; ship = every row PASS)

| id | quantity | band |
|---|---|---|
| **BG1** | base gates: base POOL warm% ≤ 12 ∧ base POOL meanL ∈ [40,100] ∧ base FAR meanL ∈ [35,95] | in → else **VOID** (tree/staging is not the diagnosed one) |
| **D1** | boot A2 vs boot A, decoded differing px, `interior` and `hero` | **[0,0]** each — else every cross-boot [0,0] bar below is **VOID** (see PF4) |
| **P1** | POOL ΔmeanL (cand − base) | **[+10, +80]** |
| **P2** | POOL Δmean(R−B) ≥ **+12** ∧ cand POOL warm% ≥ **35** | both |
| **F1** | FAR ΔmeanL ∈ **[−8, +2.5]** ∧ FAR Δmean(R−B) ∈ **[−8, +2.5]** | "drops or holds" |
| **B1–B15** | every canonical shot except `interior`: cand vs base differing px | **[0,0]** each |
| **N1** | `interior.null0` vs `interior.base` differing px | **[0,0]** (recompile-with-branch-untaken exactness, cross-boot) |
| **R1** | `interior.restore` vs `interior.cand` differing px | **[0,0]** (poke-path exactness; ≠0 ⇒ null0/kbover arms VOID, not the candidate) |
| **KO1** | POOL ΔmeanL at gain 6.0 ≥ **1.35 ×** ΔmeanL at 2.5, and ≥ ΔmeanL(2.5) + 5 L | dose-monotonicity — the instrument must see the lever's dose (§141.1) |
| **V1** | `interior` arms: exactly 6 visible slots, all worldY < −0.5, positions within 0.35 m of the six registered sconces | else **VOID** |
| **V2** | daylight cand arms: live `uLocalToon` readback = 2.5 | else **VOID** (B-bars would be testing the wrong config) |

## 6. Falsifiers — revert, do not defend

- **PF1** P1/P2/F1/KO1 out of band on the cand arm ⇒ the value does **not** ship:
  `TUNE.localToon` → 0.0 (the mechanism stays as a default-off lever), finding recorded. No
  post-hoc retune toward a band; a different gain is a different prereg.
- **PF2** any B-bar ≠ 0 ⇒ same revert to default-off, regardless of how good the interior
  looks. N1 attributes it: N1 = 0 with some B ≠ 0 says the *taken* branch's zero-adds are not
  exact (gate arithmetic); N1 ≠ 0 says the recompile itself moved pixels.
- **PF3** BG1 or V1 out ⇒ capture VOID, re-run after diagnosis; no verdict either way.
- **PF4** D1 ≠ 0 ⇒ cross-boot determinism is broken on today's tree; every cross-boot [0,0]
  bar is VOID and the A/B must be redesigned (the file-swap *is* the only honest old-tree
  comparison, so this outcome blocks ship until re-run — it cannot be waved through).
- **PF5** the runner is killed mid-boot ⇒ `git status` shows the three files modified;
  `git checkout HEAD -- <files>` restores; every frame of that boot is discarded.
- **PF6** `git diff --name-only BASE..HEAD -- src/` ≠ exactly the three §2 files ⇒ VOID
  (another lane landed src between seal and capture; re-run against the new parent).

## 7. §17 look-change declaration

`interior` (the only camera that can see y < −0.5 geometry): warm pools appear on the floor
and pier bases within ~4–5 m of each of the six sconces, breathing with the existing flicker;
each sconce's mount face gains a capped warm halo that whitens toward the clip like an ember
core; Sly's torch-side surfaces pick up a warm kiss (he stands 4.6 m from the nearest sconce).
Because point lights cast no shadows here (Lighting: VSM/point note), the light leaks through
pier volumes within its 9 m radius — accepted: the vault is the only underground camera and no
leak can reach daylight geometry (radius geometry, §1.3). **Every other canonical frame is
arithmetically unchanged (B1–B15 verify bit-identity), and night braziers are deliberately NOT
enrolled** — extending the gate to night fires (`max(underground, nightGate)`) is a follow-up
seal with its own night non-regression, not a rider on this one.

## 8. Expected outcome, written down in advance

**SHIP at 2.5.** The falloff model has ≥ 1.8× margin on P1 and the exact-zero argument plus
the tomb portal gate (`Architecture` hides tomb meshes from every above-ground camera) covers
B1–B15; the honest uncertainty is D1/N1 — whether a SwiftShader recompile of a changed source
reproduces untouched shots bit-for-bit across boots. banda2/litwarm measured 0-px
restores within a boot; cross-boot bit-identity at a *changed program* is this seal's new
claim, which is exactly why it is a measured bar and not an assumption. If it fails, PF2/PF4
ship the mechanism default-off and the finding — either way the round produces a verdict.
