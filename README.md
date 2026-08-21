# Sly Cooper: Sands of Ra

A stealth-platformer in **Three.js**, starring Sly Cooper, set in a Temple of Ra complex on the
edge of the Nile. Keyboard and mouse, runs in the browser.

**The build is self-contained: it fetches nothing.** No CDN, no runtime asset download, no network
step in `npm run build` — pull the cable after `npm install` and every pixel is identical.

Almost all of it is **generated in code**: the sandstone, the carved hieroglyphs, the gold leaf,
Sly's fur, the dunes, the palm fronds, the character rig and every animation clip are built
procedurally at load time, which is what makes each visual decision a tunable number rather than an
opaque binary. That remains the house style. Where an external source is genuinely better than code
can honestly fake, it is **baked in before the build** — committed under `src/assets/` and bundled,
never fetched (see `AGENTS.md` §1.1). Reference imagery used while developing stays out of the repo
entirely.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Controls

Keyboard/mouse and a PS4 controller both work, together — the game follows whichever you touched
last (HUD prompts switch with it). The pad column is the Sly 2: Band of Thieves layout (per the
GameFAQs control listings for the PS2 release); on the pad, stick pressure gives the genuine
walk-to-run the keyboard cannot.

| Keyboard / mouse | PS4 | |
|---|---|---|
| `W A S D` | left stick / d-pad | move (camera-relative) |
| Mouse | right stick | look · scroll / — to zoom |
| `Space` | Cross | jump · double jump · wall jump · spire jump — hold for height |
| `Shift` | L1 | sneak |
| `Ctrl` | L2 | crouch · tap while running to roll |
| Left Mouse / `F` | Square · Triangle | cane combo · in air, dive attack (Sly 2's X-then-Triangle dive) |
| Right Mouse | R2 (hold) | Thief-o-Vision and hook lock-on |
| `E` | Circle | interact · pickpocket · grab hook · mount rail |
| `Q` | R1 (hold) | paraglide — Sly 2's own X + R1 |
| `Tab` | — | Binocucom (not in this demo) |
| `R` | R3 | recentre camera |
| `F1` `F2` `F3` | — | debug overlay · quality · collider view |

Sly 2 puts gadgets on L1/L2/R2 and the Binocucom on R3; this demo has neither system, so those
slots carry the sneak/crouch/vision modifiers and the camera recentre instead — the gaps are
documented in `src/core/Input.js`, not silently rebound. The on-screen button glyphs are from
Kenney's CC0 Input Prompts pack (provenance: `public/assets/prompts/PROVENANCE.md`).

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
