# Sly Cooper: Sands of Ra

A stealth-platformer in **Three.js**, starring Sly Cooper, set in a Temple of Ra complex on the
edge of the Nile. Keyboard and mouse, runs in the browser.

Every asset in this repository is **generated in code**. There are no downloaded meshes, no
downloaded textures, no downloaded animation clips, no audio files. The sandstone, the carved
hieroglyphs, the gold leaf, Sly's fur, the dunes, the palm fronds, the character rig and every
animation clip are all built procedurally at load time. That constraint keeps the repo
self-contained and makes every visual decision a tunable number rather than an opaque binary.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Controls

| | |
|---|---|
| `W A S D` | move (camera-relative) |
| Mouse | look · scroll to zoom |
| `Space` | jump · double jump · wall jump · spire jump — hold for height |
| `Shift` | sneak |
| `Ctrl` | crouch · tap while running to roll |
| Left Mouse | cane combo · in air, dive attack |
| Right Mouse | hold for Thief-o-Vision and hook lock-on |
| `E` | interact · pickpocket · grab hook · mount rail |
| `Q` | paraglide (hold) |
| `Tab` | Binocucom |
| `R` | recentre camera |
| `F1` `F2` `F3` | debug overlay · quality · collider view |

## The moveset

Run, sneak, crouch, roll, jump, double-jump, wall run, wall jump, wall cling, ledge hang, shimmy
and climb, cane hook and swing, rail slide, rail walk, pole climb, pole slide, pole swing, Ninja
Spire Landing, tiptoe, crawl, paraglide, a three-hit cane combo, the Cane Slam dive attack, enemy
bounce, pickpocket, and Thief-o-Vision.

The level is designed around all of it. Every walkable, climbable, grabbable or slidable surface
carries a tag (`ground`, `wall`, `ledge`, `rail`, `pole`, `hook`, `spire`, `vent`, `hazard`) and the
moveset discovers what it can attach to by querying those tags — so the temple isn't scenery with
collision bolted on, it's the moveset made physical.

## Architecture

```
src/core/       engine, input, seeded noise, canonical camera shots, debug hooks   [foundation]
src/textures/   procedural material library — every texel generated in JS
src/render/     cel-shading model, ink outlines, sky, lighting, post-processing
src/world/      the temple complex, terrain, props, collision BVH
src/player/     Sly's mesh and rig, animation clips, controller and moveset, camera
src/fx/         particles, decals, trails
src/ai/         guards
src/ui/         HUD
tools/          headless capture harness, visual-critic capture, progress page generator
```

Modules are discovered at boot with `import.meta.glob` and registered in a fixed update order —
producers before consumers. A module that fails to load or throws during init is isolated and the
game still renders, which is what lets many of them be developed in parallel.

`AGENTS.md` is the engineering and art bible: the palette, the shading rules, the module
interfaces, the physics constants, and the level's coordinate contract. Read it before changing
anything.

## Visual development

The look is Sly Cooper's comic-book noir: banded cel shading with a hard terminator, ink outlines
(inverted-hull shells on characters, screen-space depth+normal edge detection for interior
creases), saturated complementary palettes, coloured and transparent shadows, and a fresnel rim
light separating every silhouette.

Because "does it look good" can't be unit-tested, the repo ships a capture-and-critique loop:

```bash
npm run shot                       # render the ten canonical shots to shots/
node tools/critic.mjs --label r4 --crops   # a full-res review set with 2x detail crops
node tools/progress.mjs            # regenerate the progress page
```

`src/core/Shots.js` defines ten fixed camera setups — `hero`, `temple`, `sly-closeup`,
`courtyard`, `dunes`, `interior`, `night`, `traversal`, `combat`, `guard` — each chosen to prove
one thing. They're deliberately fixed so frames stay comparable across commits. `tools/CRITIC.md`
is the standing adversarial-review brief the frames are judged against; `AGENTS.md §7.3` is the
fail-list, where any single condition being true fails the shot.

The capture harness boots Vite, drives headless Chromium, and reads the framebuffer back off the
canvas with the render loop halted, so captures are deterministic frame-for-frame. This container
has no GPU, so WebGL runs on SwiftShader and a single frame takes seconds — the harness's timeouts
are generous on purpose, and timings from it say nothing about real performance.

## Determinism

All randomness routes through `rng(seed)` in `src/core/Rand.js`. The same seed always rebuilds the
identical level, which is what makes screenshot comparison across commits meaningful.
