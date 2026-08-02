# Sly Cooper: Sands of Ra — Engineering & Art Bible

> **Every agent working on this repo MUST read this file top to bottom before writing code.**
> It is the single source of truth for architecture, interfaces, art direction, and quality bar.

---

## 0. The Goal

A **Three.js** stealth-platformer starring Sly Cooper, set in **Ancient Egypt**, whose visuals stand
next to *Super Mario Odyssey / Bowser's Fury* and *Zelda: Breath of the Wild / Tears of the Kingdom*
without embarrassment — while remaining unmistakably **Sly Cooper**: comic-book noir cel shading,
inked silhouettes, saturated complementary palettes, exaggerated cartoon anatomy, and a world built
entirely out of traversal affordances.

Runs in a browser, keyboard + mouse, 60 fps at 1080p on a mid-range GPU.

**The bar:** a hostile art director compares a screenshot of this game, blind, against a screenshot of
Mario Odyssey or a Sly Cooper HD remaster, and picks ours. Anything less is not done.

---

## 1. Hard Constraints

| Constraint | Rule |
|---|---|
| **No external asset downloads** | The network is not guaranteed. **Every texture, mesh, animation, and sound is generated procedurally in code.** No `.glb`, no `.png` fetches, no CDNs. This is a feature — it makes the repo self-contained and infinitely tweakable. |
| **Three.js only** | `three` + `three/examples/jsm/*`. No physics engines, no game frameworks. Physics is hand-rolled (see §6). |
| **Module ownership** | You edit **only the files assigned to you** (§3). Need a change elsewhere? Extend the shared interface, don't reach in. |
| **No `import` of another agent's internals** | Talk through the interfaces in §4 only. |
| **60 fps budget** | ≤ 250 draw calls, ≤ 1.2M triangles visible, ≤ 350 MB texture memory. Instance everything repeated. |
| **Deterministic** | All randomness goes through `rng(seed)` from `src/core/Rand.js`. The same seed must always build the same level — the screenshot critic depends on it. |

---

## 2. Art Direction Bible

### 2.1 The Sly Cooper look — non-negotiable ingredients

1. **Cel shading with a banded ramp.** Diffuse is quantised into 3 bands (shadow / mid / light) with a
   *hard but slightly softened* terminator (`smoothstep` width ≈ 0.03). Not a smooth Lambert. Not a
   single hard step either — Sly's shading has a thin mid-tone.
2. **Ink outlines, two kinds, both required:**
   - **Inverted-hull shells** on characters and hero props — a backface-rendered, normal-extruded
     duplicate in near-black. Thickness scales with view distance so lines stay ~2.5 px on screen.
   - **Post-process edge detect** on depth + normals for interior creases and architectural edges.
   Lines are **not pure black** — they are a very dark, slightly *warm* brown in sunlight
   (`#1a1210`) and a dark *violet* in shadow (`#161022`). Pure black reads cheap.
3. **Saturated complementary palette.** Every shot holds a warm/cool tension: gold sandstone against
   deep teal shadow, orange sun against violet sky. Shadows are never grey — they are *coloured*
   (violet, teal, or deep cyan) and they are *transparent* (you can read detail inside them).
4. **Exaggerated cartoon proportions.** Nothing is architecturally realistic. Pylons lean. Columns are
   fat at the base and taper hard. Statues are top-heavy. Ledges are chunky and obviously grabbable.
5. **Rim light on everything.** A strong fresnel rim in the complementary hue of the key light
   separates every silhouette from the background. This is the single biggest "AAA" tell.
6. **Sly's blue sparkle language.** Interactive traversal points — spire tips, hooks, rails, poles,
   pickpocket targets — carry the iconic **blue-white diamond sparkle** (`#8fd8ff` core,
   `#2a7fd4` glow). This is Sly's UI grammar and it must be present.
7. **Painterly textures, not photoreal.** Textures carry visible *brush/chisel* character, hand-placed
   grime in crevices, and colour variation between blocks. No tiling that reads as tiling.

### 2.2 The Egypt palette

```
KEY LIGHT   sun        #ffd9a0   (late-afternoon, 22° elevation, low and raking)
FILL        sky bounce #6fa8d8
BOUNCE      sand GI    #e8a852
RIM         complement #7fd4ff  (cool) / #ff9a5c (warm variant for night)

SANDSTONE   light #e6b878  mid #c9915a  dark #8a5a38  crevice #4a2f22
LIMESTONE   light #f0e3c8  mid #d4c19a  dark #9a8462
GOLD        light #ffe9a8  mid #e8b942  dark #966a18  spec #fffbe8
LAPIS       #1f4f96   TURQUOISE #2fa8a0   CARNELIAN #b8452c   MALACHITE #2f8f5a
PAINT       ochre #d4823a  red #a83828  black #241a16  white #f2e8d4
SHADOW HUE  #2a3f66  (violet-teal, ~14% of key luminance, never below)
SKY         zenith #3f7fc4  horizon #f0c88a  haze #e8b878
```

Everything else derives from these. If a colour is not in this list or a blend of it, justify it.

### 2.3 Composition rules for every screenshot

- **Silhouette first.** Squint at the frame: the shapes must read.
- **Depth in three planes.** Dark foreground frame (an arch, a ledge, a palm frond), lit mid-ground
  hero geometry, hazed background (pyramid/dunes) at ≥ 60% atmospheric blend.
- **One hero read.** A single brightest thing — usually gold — draws the eye.
- **Volumetric light shafts** raking through at least one opening in every interior/courtyard.
- **No empty sky.** Layered clouds, birds, dust haze, or a pyramid silhouette.
- **Colour blocking.** Large simple areas of colour, detail concentrated at focal points.

---

## 3. File Ownership Map

**Edit only your files.** `[LOCKED]` = owned by the lead, do not edit; propose changes instead.

```
AGENTS.md, README.md, index.html, vite.config.js, package.json   [LOCKED]
src/main.js                                                      [LOCKED]
src/core/**                                                      [LOCKED]  Engine, Input, Rand, Registry, Debug
tools/**                                                         [LOCKED]  screenshot + progress harness

src/render/ToonMaterial.js  src/render/Outline.js                 → agent: SHADING
src/render/PostFX.js                                             → agent: POSTFX
src/render/Sky.js  src/render/Atmosphere.js                       → agent: SKY
src/render/Lighting.js                                            → agent: LIGHTING

src/textures/**                                                  → agent: TEXTURES
src/world/Architecture.js  src/world/EgyptLevel.js                → agent: ARCHITECTURE
src/world/Props.js  src/world/Statues.js                          → agent: PROPS
src/world/Terrain.js  src/world/Vegetation.js                     → agent: TERRAIN
src/world/Collision.js                                            → agent: COLLISION

src/player/SlyModel.js                                           → agent: CHARACTER
src/player/Rig.js  src/player/Animation.js  src/player/Clips.js   → agent: ANIMATION
src/player/Controller.js  src/player/Moveset.js                   → agent: MOVEMENT
src/player/CameraRig.js                                           → agent: CAMERA

src/fx/Particles.js  src/fx/Decals.js  src/fx/Trails.js           → agent: FX
src/ai/Guard.js  src/ai/GuardModel.js                             → agent: GUARDS
src/ui/HUD.js                                                     → agent: HUD
src/audio/**                                                      → agent: AUDIO
```

---

## 4. Shared Interfaces (the contract)

### 4.1 Module shape

Every gameplay/visual module is a class with this lifecycle. Nothing else is called on it.

```js
export class MyModule {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {}
  /** Build geometry/materials. May be async. Add to engine.scene yourself. */
  async init() {}
  /** Per-frame. dt in seconds (already clamped to ≤ 1/20). t = seconds since start. */
  update(dt, t) {}
  /** Free GPU resources. */
  dispose() {}
}
```

### 4.2 `Engine` — what you get

```js
engine.renderer      // THREE.WebGLRenderer  (WebGL2, sRGB output, ACES-ish custom tonemap)
engine.scene         // THREE.Scene
engine.camera        // THREE.PerspectiveCamera  (owned by CAMERA agent at runtime)
engine.clock, engine.time, engine.dt
engine.width, engine.height, engine.pixelRatio
engine.get('shading') // fetch another module by key (see §4.3). May return null — guard it.
engine.on(evt, fn) / engine.emit(evt, payload)     // event bus
engine.registerCollider(mesh, opts)                // hand geometry to COLLISION
engine.quality       // 'low' | 'med' | 'high' | 'ultra'  — respect it
engine.debug         // { freeCam, showColliders, wireframe, timeOfDay }
```

### 4.3 Module keys for `engine.get(key)`

`shading` `postfx` `sky` `lighting` `textures` `architecture` `props` `terrain`
`collision` `character` `animation` `movement` `camera` `fx` `guards` `hud` `audio`

### 4.4 The two interfaces everyone touches

**SHADING** exposes the material factory. Every visible surface in the game goes through it, so the
whole scene shares one lighting model:

```js
const shading = engine.get('shading');
shading.toon({
  color: 0xc9915a,          // base albedo
  map, normalMap, roughnessMap, aoMap, emissiveMap,   // all optional
  bands: 3,                 // diffuse quantisation steps
  rim: 0.55,                // rim light strength 0..1
  rimColor: 0x7fd4ff,
  spec: 0.25, gloss: 32,    // hard-stepped specular
  outline: 1.0,             // inverted-hull thickness multiplier, 0 = none
  sss: 0.2,                 // warm wrap-around for fur/skin/cloth
  detail: 'sandstone',      // triplanar detail layer key, or null
  emissive: 0x000000, emissiveIntensity: 0,
  transparent: false, side: THREE.FrontSide,
});
// → returns a THREE.ShaderMaterial-derived material. Cached by option hash.
```

**COLLISION** — anything walkable/climbable must be registered, with a *surface tag* so MOVEMENT knows
what move tech it enables:

```js
engine.registerCollider(mesh, {
  tag: 'ground',   // ground | wall | ledge | rail | pole | hook | spire | vent | water | hazard
  climbable: false,
  material: 'stone',   // stone | sand | wood | metal | cloth  (footstep sfx + particles)
  oneWay: false,       // platform you can jump up through
});
```

Tag semantics — these are the traversal affordances the level is *built out of*:

| tag | meaning | move tech it unlocks |
|---|---|---|
| `ground` | walkable, slope ≤ 50° | walk, run, land, roll |
| `wall` | slope > 70° | wall run, wall jump, wall cling |
| `ledge` | thin walkable edge | tiptoe/sneak-walk, ledge hang below it |
| `rail` | thin line geometry | rail slide, rail walk (balance) |
| `pole` | vertical cylinder | pole climb, pole slide, pole swing |
| `hook` | hook/ring point | cane hook, swing |
| `spire` | pointed tip | Ninja Spire Landing (balance on point) |
| `vent` | crawl space | crawl |
| `hazard` | damage volume | knockback |

Rails/poles/hooks/spires additionally publish a **spline or point** so MOVEMENT can snap to them:
`mesh.userData.spline = THREE.CatmullRomCurve3` (rails) or `mesh.userData.point = THREE.Vector3`
(hooks, spires).

### 4.5 Screenshot hooks — **required**, the critic depends on them

`src/core/Debug.js` exposes `window.__GAME`. Your module must not break these:

```js
window.__GAME.ready          // true once every module's init() resolved and 3 frames rendered
window.__GAME.setShot(name)  // pose camera + world for a named canonical shot (§7.2)
window.__GAME.shots          // list of shot names
window.__GAME.setQuality(q)
window.__GAME.stats          // { fps, drawCalls, triangles, programs }
window.__GAME.warnings       // string[] — push a message here instead of throwing
```

---

### 4.6 COLLISION query API — binding contract

`COLLISION` owns the BVH and answers these. `MOVEMENT` calls nothing else. All positions are
world-space `THREE.Vector3`. **Every query must accept a scratch out-param or return a pooled
object — zero allocation per call**, because MOVEMENT does dozens of these per frame.

```js
collision.add(rec)                       // { mesh, tag, material, climbable, oneWay } — from engine.registerCollider
collision.build()                        // (re)build the BVH; called once after init
collision.ready                          // bool

/** Swept capsule. The workhorse — MOVEMENT resolves all motion through this. */
collision.capsuleSweep(from, to, radius, height, opts?)
  // → { hit:bool, position:Vec3, normal:Vec3, distance:num, tag:str, material:str, rec }
  // opts: { ignoreTags:[], onlyTags:[], skipOneWay:bool }

/** Downward probe for grounding. `slope` in radians from vertical. */
collision.groundCheck(pos, radius, maxDist)
  // → { hit:bool, y:num, normal:Vec3, slope:num, tag:str, material:str, rec }

collision.raycast(origin, dir, maxDist, opts?)
  // → { hit:bool, point:Vec3, normal:Vec3, distance:num, tag:str, rec }

/** Overlap test — used for hazard volumes and vent detection. */
collision.overlap(pos, radius, tags?)    // → rec[]  (pooled array, don't retain it)

/**
 * Find the nearest traversal affordance of a given tag. This is how the whole moveset
 * discovers what it can attach to.
 * For 'rail'/'pole' returns the closest point on rec.mesh.userData.spline.
 * For 'hook'/'spire' returns rec.mesh.userData.point.
 */
collision.nearest(pos, tag, maxDist, opts?)
  // → { rec, point:Vec3, t:num, tangent:Vec3, distance:num } | null
  // opts: { facing:Vec3, maxAngle:rad }  — prefer affordances in front of the player

/** Everything of a tag within radius, sorted near→far. For lock-on UI and Thief-o-Vision. */
collision.query(pos, radius, tags)       // → [{ rec, point, distance }]
```

Slope thresholds that define the tags (§4.4) live in COLLISION and are exported as
`collision.SLOPE = { walkable: 50°, wall: 70° }` so MOVEMENT doesn't hardcode them.

### 4.7 ANIMATION contract — binding

`MOVEMENT` describes *what Sly is doing*; `ANIMATION` decides *what that looks like*. MOVEMENT
never touches a bone.

```js
animation.play(clip, { fade = 0.12, loop = true, speed = 1, weight = 1, lock = false })
animation.stop(clip, fade)
animation.isPlaying(clip)

/** Continuous locomotion state, pushed every frame. ANIMATION blends the tree from this. */
animation.setLocomotion({
  speed,          // horizontal m/s
  maxSpeed,       // for normalising the walk→run blend
  grounded, sneaking, crouching, airborne,
  verticalVelocity,
  turnRate,       // signed rad/s — drives lean and the turn-in-place clips
  slope,          // ground slope, radians
  surface,        // material tag under foot, for footstep events
})

/** Additive layers, so a look-at or a flinch doesn't fight the base clip. */
animation.setLookAt(worldPos | null)
animation.addImpulse({ bone, dir, strength, decay })   // hit reactions, landing jolts

animation.freezePose(name)     // screenshot harness — hold one frame of a clip
animation.unfreezePose()
animation.clipNames()          // → string[]

/** ANIMATION emits these; FX and AUDIO subscribe. */
animation.onEvent(name, fn)    // 'footstep' {surface,foot} · 'cane_hit' {index} · 'land' {force}
```

**Required clip names.** `Shots.js` freezes on some of these, so these exact strings must exist:

```
idle_confident  idle_bored  idle_look        perch_idle      balance_idle
walk  run  run_fast  sneak_idle  sneak_walk  crouch_idle  crouch_walk  crawl
turn_l  turn_r  skid_stop  roll
jump_rise  jump_apex  jump_fall  double_jump  land_soft  land_hard  land_roll
wall_run_l  wall_run_r  wall_jump  wall_cling
ledge_hang  ledge_shimmy_l  ledge_shimmy_r  ledge_climb
hook_grab  hook_swing  hook_release
rail_slide  rail_walk  pole_climb  pole_slide  pole_swing
spire_land  spire_balance
cane_combo_1  cane_combo_2  cane_combo_3  dive_attack  dive_impact
pickpocket  paraglide  hurt  ko  victory
```

## 5. Coding Conventions

- ES modules, no build-step magic beyond Vite. No TypeScript.
- `import * as THREE from 'three';`
- **Dispose everything** you create in `dispose()`.
- Allocate zero objects in `update()` — hoist scratch `Vector3`/`Quaternion` to module scope.
- Geometry built once at init, merged/instanced. `BufferGeometryUtils.mergeGeometries` is your friend.
- Comments explain *why* (an art or feel decision), never *what*.
- Never `throw` at runtime after init — push to `window.__GAME.warnings` and degrade gracefully.
- Name tunable feel constants in a single `const TUNE = {...}` block at the top of the file so the
  critic loop can adjust feel without archaeology.

---

## 6. Physics & Feel Spec (MOVEMENT agent, but everyone should know it)

Hand-rolled kinematic capsule, swept against the collision BVH. Units: **metres, seconds**. Sly is
**1.8 m** tall. Gravity **-24 m/s²** (heavier than real — platformers need snap).

```
walk speed            2.6 m/s      sneak speed        1.4 m/s
run speed             7.2 m/s      run accel          38 m/s²   decel 26 m/s²
air control           0.55 of ground accel
jump apex height      2.5 m  (v0 = 11.0 m/s)
double jump height    1.9 m        variable jump: release cuts vy by 55%
apex hang             vy scaled ×0.72 while |vy| < 2.2  — the float that makes it feel good
coyote time           110 ms       jump buffer        140 ms
land squash           0.82 scale-y over 90 ms, ease-out back
ledge snap            assist 0.45 m toward a ledge if the jump would just miss
turn rate             ground 14 rad/s, air 8 rad/s
rail slide speed      9.5 m/s, gravity-driven along spline, balance sway ±6°
wall run              4.8 m/s along wall, 1.4 s max, gravity ×0.25
pole climb            3.0 m/s up, 8.0 m/s slide down
hook swing            pendulum, L = 2.2 m, release keeps tangential velocity ×1.15
spire land            snap to point, idle balance wobble, jump from it gets ×1.25 height
dive attack           downward 18 m/s, 1.2 m radius impact, camera shake 0.35
```

**The full Sly moveset — all of it ships:**

run · sneak · crouch · roll · jump · double-jump (cane twirl) · triple-jump-from-spire ·
wall run · wall jump · wall cling · ledge hang · ledge shimmy · ledge climb ·
cane hook + swing · rail slide · rail walk (balance) · pole climb · pole slide · pole swing ·
Ninja Spire Landing · tiptoe on narrow ledges · crawl (vents) · paraglide ·
cane combo (3-hit ground) · dive attack (Cane Slam) · enemy bounce · pickpocket ·
Thief-o-Vision (highlight interactables, slow-mo)

### 6.1 Controls (PC — keyboard + mouse)

```
W A S D        move (camera-relative)
Mouse          look (pointer lock).  Scroll = zoom.
Space          jump / double jump / spire jump / wall jump  (hold = higher)
Shift (hold)   sneak
Ctrl           crouch · tap while running = roll
Left Mouse     cane attack (combo) · in air = dive attack
Right Mouse    hold = Thief-o-Vision + hook lock-on
E              interact / pickpocket / grab hook / mount rail
Q (hold)       paraglide
Tab            Binocucom
R              recentre camera
F1             free camera (debug)
Esc            release pointer lock
```

---

## 7. The Quality Loop

### 7.1 How to iterate

1. Implement / improve your module.
2. `npm run shot` — renders the canonical shots to `shots/<name>.png`.
3. **Look at the PNG.** Read it with the Read tool. Actually look at it.
4. Compare against the bar in §2 and §7.3. Be brutal.
5. Fix the worst thing. Repeat. Do not stop at "fine".

### 7.2 Canonical shots

| name | what it proves |
|---|---|
| `hero` | The money shot: Sly on a temple ledge, sun raking, pyramid behind. Overall AAA read. |
| `temple` | Architecture: hypostyle hall, columns, light shafts, hieroglyph walls. |
| `sly-closeup` | Character: cel shading, outlines, fur, cloth, cane, face. |
| `courtyard` | Composition + props: obelisk, statues, braziers, palms. |
| `dunes` | Terrain + sky + atmosphere at distance. |
| `interior` | Lighting: torch-lit tomb, warm/cool tension, volumetrics. |
| `night` | Palette flip: moonlit stealth, rim light, blue sparkles. |
| `traversal` | Motion tech: Sly mid-swing on a cane hook over a gap. |
| `combat` | Cane combo impact frame with FX. |
| `guard` | Guard character + patrol light cone. |

### 7.3 The critic's checklist (a shot fails if ANY of these is true)

**Shading & line**
- [ ] Diffuse ramp reads as smooth/realistic instead of banded-cel
- [ ] Outlines missing, uniform-thickness regardless of depth, or pure `#000000`
- [ ] No rim light separating silhouettes from the background
- [ ] Shadows are grey/black instead of coloured, or crush to zero detail

**Materials**
- [ ] Any surface reads as flat vertex colour with no texture detail
- [ ] Visible texture tiling repetition
- [ ] No normal-map relief on stone; carvings look painted-on rather than chiselled
- [ ] Gold doesn't read as metal (needs hard spec + bloom + dark occlusion)

**Form & composition**
- [ ] Architecture reads as boxes; proportions realistic instead of exaggerated-cartoon
- [ ] Geometry silhouettes are straight/symmetric everywhere (no hand-built irregularity)
- [ ] Empty sky, or background not atmospherically hazed
- [ ] No dark foreground framing element; flat depth
- [ ] No single hero focal read

**Atmosphere & FX**
- [ ] No volumetric light shafts anywhere they'd be motivated
- [ ] No airborne particulate (sand drift, dust motes)
- [ ] Bloom is a grey wash instead of a tight coloured halo on bright things
- [ ] No ambient occlusion in crevices / where forms meet

**Character**
- [ ] Sly's proportions are realistic instead of ~1:5 head:body cartoon
      **head:body = standing height ÷ head height, where head height is chin to top of cranium
      in `idle_confident`, EXCLUDING cap and ears. Target 5.0; fails outside 4.5–5.5.**
      Reproduce with `tools/headratio.mjs` (no arguments needed). The definition is here because without it the
      condition could not be scored: three numbers were in circulation for one figure — 4.44
      (chin to cap/ear tip), 6.73 (a profile-table skull span narrower than the rendered head)
      and a quoted 5.29 — and they *bracket* "~1:5" rather than test it. Current rig **5.72**,
      so this condition is FAILING by ~0.7 head. See KNOWN_ISSUES §58.3, §59.2, §65.
- [ ] Silhouette not instantly readable as Sly (cap, mask, tail, cane)
- [ ] Fur reads as smooth plastic
- [ ] Pose is A-pose/T-pose/stiff instead of a confident line-of-action

**Overall**
- [ ] Placed blind next to Mario Odyssey / Sly 4, an art director picks the other one

---

## 8. The Level: "Sands of Ra"

One coherent, connected playspace — a moonlit-to-golden-hour **Temple of Ra complex** on the Nile's
edge, built as a traversal jungle gym:

1. **Approach** — dune ridge, sphinx avenue, banners, first rail slide down into the complex.
2. **Great Courtyard** — obelisk (pole climb), colossal seated statues, braziers, guard patrols,
   hook rings strung between pylons.
3. **Hypostyle Hall** — forest of fat papyrus-capital columns, light shafts through clerestory slots,
   ledge tiptoe circuit around the architrave.
4. **Pylon Ascent** — the vertical set piece: wall runs, spire tips, swinging hooks, up the pylon face.
5. **Tomb Interior** — torch-lit, false doors, sarcophagus vault, crawl vents, the treasure.
6. **Rooftop Run** — the payoff traversal line across the whole complex, silhouetted against sunset.

Every surface in it is tagged per §4.4. **The level is not scenery — it is the moveset made physical.**

### 8.1 Coordinate contract — **binding on ARCHITECTURE / TERRAIN / PROPS**

The canonical camera shots in `src/core/Shots.js` are fixed. Build the level so these cameras
frame what they're named for. Axes: **+X east, +Y up, +Z south (toward the viewer/approach)**.
Courtyard floor is **y = 0**. The Nile and the setting sun are to the **west (−X)**.

| landmark | footprint | height | notes |
|---|---|---|---|
| **Great Courtyard** floor | x ∈ [−26, 26], z ∈ [−16, 34] | y = 0 | main playspace, paved |
| **Obelisk** | at (0, ·, 11), base 2.6 m² | 22 m | `pole` tag, climbable full height |
| **Colossi** (seated, ×2) | (±9.5, ·, 25) | 13 m | knees at y≈4.5 are landable `ledge` |
| **Entry pylon** (×2 towers) | (±14, ·, 34), each 11×6 m | 26 m | battered walls, `wall` run surface |
| **Courtyard architrave** ledge | ring at x ±23, z −14…32 | y = 9.0 | the `ledge` Sly perches on in `hero` |
| **Hypostyle Hall** | x ∈ [−24, 24], z ∈ [−52, −16] | floor 0, roof 17 | column grid 8 m spacing |
| **Columns** | 12 of them, r = 1.9 base → 1.4 | 14 m + capital | papyrus capitals, `pole`-tagged |
| **Clerestory slots** | in roof, z every 8 m | y = 15.5 | motivate the light shafts |
| **Inner pylon** (ascent) | (0, ·, −52), 22×7 m | 34 m | the vertical set piece; spires at top |
| **Spire tips** | 4 at (±6, 27, −50), (±16, 21, −50) | — | `spire` tag, Ninja Spire Landing |
| **Hook rings** | strung z −10…30 at y 11–15 | — | `hook` tag, swing chain across courtyard |
| **Rooftop deck** | hall roof, x ∈ [−24,24], z ∈ [−52,−16] | y = 17 | the rooftop run line |
| **Tomb descent** | stair at (0, ·, −56) | 0 → −12 | leads below the hall |
| **Tomb vault** | x ∈ [−14, 14], z ∈ [−78, −56] | floor −12, ceil −2 | torch-lit, sarcophagus at (0,−12,−72) |
| **Sphinx avenue** | x = ±7, z = 40…84 | sphinx 3.5 m | 8 pairs, flanking the approach |
| **Approach ridge** | z ∈ [70, 96] | crest y ≈ 16 | dune the `dunes` camera sits on |
| **Great Pyramid** | centre (−150, ·, −190) | 105 m | background silhouette, heavily hazed |
| **Second pyramid** | centre (95, ·, −250) | 72 m | staggers the horizon |
| **Nile** | x < −70 | water y = −3 | westward, catches the sun |

Sly spawns at **(0, 0, 30)** facing north (−Z, yaw = π), looking through the entry pylon at the
obelisk and the hall beyond. Everything the player can see from spawn should say "climb me".
