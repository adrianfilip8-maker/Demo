# Known issues

State as of the last session. Written so the next person doesn't re-derive what's already
been eliminated — on this container a single capture takes 2–5 minutes, so each ruled-out
hypothesis below cost real time.

---

## 1. No cast shadows in any shot — **unresolved, highest-value fix**

Under a 22° golden-hour sun the courtyard should be crossed by long raking shadows. There are
none, anywhere. This is the single biggest remaining gap between the current frames and the
AAA bar: raking shadows are most of what sells a low-sun read, and `AGENTS.md §7.3` depends
on them for form.

**Ruled out** (each verified, don't redo):

- Geometry flags. `Architecture.js`, `Terrain.js`, `Vegetation.js` and `SlyModel.js` all set
  `castShadow`/`receiveShadow` correctly.
- Light config. Cascade lights have `castShadow = true`, real `mapSize`, and `shadow.camera`
  near/far set (`Lighting.js` ~line 261).
- Cascade fitting. `_fitCascades()` runs every frame from `update()` and re-fits to the live
  `engine.camera`, so the posed screenshot camera is tracked correctly.
- Shader sampling. `toon.glsl.js` genuinely reads shadows:
  `float sh = smoothstep( uShadowSharp.x, uShadowSharp.y, getShadowMask() );`
- Shadow map type. Switched `VSMShadowMap` → `PCFSoftShadowMap` in `Engine.js` on the theory
  that VSM light-bleeding was presenting as "everything lit". **It changed nothing** — the
  hypothesis was wrong. The switch was kept because PCF is the more robust choice here
  regardless, but it is not the fix.

**Leading untested hypothesis.** `Lighting.js` (~lines 85–110) patches the shadow term
directly into three.js's lighting loop for its cascade setup, injecting
`directLight.color *= ... getShadow(...)`. The toon shader separately calls `getShadowMask()`.
If that patch displaces or bypasses the chunk that `getShadowMask()` depends on, the function
would return 1.0 (fully lit) everywhere while every other part of the system looks correct —
which matches the symptom exactly.

Next step: dump `getShadowMask()` straight to `gl_FragColor` in the toon shader and capture.
If the frame is uniformly white, the mask is the problem and the fix is in how `Lighting.js`
patches the chunk, not anywhere in the shadow plumbing.

---

## 2. Frame reads busy — texture detail overwhelms large shapes

`AGENTS.md §7.3`'s squint test still fails: at a glance the masonry reads as high-frequency
rectangular noise rather than as coherent stone, so the big architectural shapes stop reading.

Partly addressed — `Materials.js` gained a `VARIATION` damping factor (0.42) on per-block
ashlar colour, which was previously swinging ±0.8 around the midpoint and taking neighbouring
blocks from fully dark to fully light. Still more to do: the derived normal strength
(`derive()`'s `bump` per recipe) is the next suspect, and the hieroglyph recipes tile at a
high enough frequency on large walls to read as pattern noise rather than carving.

---

## 3. Warm/cool balance is bracketed but not settled

`PAL.shadowBounceMix` in `ToonMaterial.js` controls how much warm sand bounce mixes into the
shadow light. Both failure modes are established by capture:

- `0.00` — warm albedo multiplied by pure blue sky; every shaded face goes mauve
- `0.45` — cool removed entirely; frame turns monochrome orange, losing §2.3's warm/cool tension

Currently `0.20`. It is defensible but was not itself A/B'd against neighbours; worth a sweep
once shadows work, since real shadows will change what the right value is.

---

## 4. Modules still absent

`props` and `guards` have supporting files (`Statues.js`, `PropKit.js`, `GuardModel.js`,
`GuardAnim.js`, `Patrol.js`) but no module entry point, so `main.js` reports them absent.
They need `src/world/Props.js` exporting `Props` and `src/ai/Guard.js` exporting `Guards`.

---

## 5. One shader still fails to link

Every capture logs a single `THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false`.
The frame renders, so it is not on the critical path, but it has not been identified. Worth
capturing with `--verbose` and reading the full program log.

---

## 6. The critic loop has never run a scoring pass

`tools/critic.mjs` and `tools/CRITIC.md` are built and working, but no adversarial review
pass has actually scored the ten canonical shots against the §7.3 fail-list. Everything above
is my own assessment, not a critic's.
