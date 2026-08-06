# NOTE-torchpool — FX torch pools: diagnosis, and why no PREREG follows

**Owner:** FX. **Date:** 2026-08-06. **Requested by:** coordinator dispatch §174 (the warm-share
remainder banda2 routed three ways). **OFFLINE** — committed frames only, no capture, no lock,
**no `src/**` modified**, no git.
**Instrument:** `progress/records/fxcluster1/torchdiag.mjs` → `torchdiag.json`.
**Tree note:** this diagnosis was traced at `src/**` tree `adb5629032309d19` and re-verified at
`85bab2d30f5f7b59` after SHADING/ARCHITECTURE landed `PREREG-litwarm` L1 mid-task (the `sss`
0.0 → 0.30 and the `sssNightPin` scaffold). **The finding is unaffected and the line numbers
below are the post-landing ones** — the deleted includes are still deleted, at their new
`ToonMaterial.js:1124-1131`. Neither changed file was touched by this task.

**Headline: the torch pools do not light the tomb, and they cannot be made to from `src/fx/**`.**
Every `THREE.PointLight` the local pool allocates contributes **exactly zero** to every
toon-shaded surface in the game, because the shader that would consume it has had the consuming
code **deleted**. The FX-owned share of the ~24 pp warm gap is **≤ ~2 pp**, measured. The
remaining ~22 pp is blocked by one missing term in `src/render/**`. **Routed to SHADING, with
LIGHTING's data already in place and correct.**

---

## 1. The chain of custody, traced end to end

The dispatch said to find who writes their light and not to assume `Lighting.js` owns it. Three
files own three parts, and the break is in the third:

1. **PROPS registers the lights.** `src/world/Props.js:527` (`_torch`) pushes
   `{ color 0xffb060, intensity 3.4, radius 9, flicker 0.55 }`; `:515` (`_brazier`) pushes
   `{ 0xff9a4a, 5.5, radius 13, flicker 0.45 }`. `_registerLightsAndFx` (`:653`) hands each to
   `lighting.addLocalLight`. **Correct and live.**
2. **LIGHTING pools and drives them.** `Lighting.js:719` builds `localCap` slots
   (`{low:2, med:4, high:6, ultra:8}`, `:178`); `:1676` does distance-cull + nearest-N promotion,
   two-octave flicker in intensity *and* position, distance fade, then writes
   `L.intensity`, `L.distance = h.radius`, `L.decay = 2` (`:1745-1749`). **Correct and live.**
3. **SHADING's material throws the result away.** `ToonMaterial._patch` (`ToonMaterial.js:1124-1131`)
   **deletes these includes from the shader source before compilation**:

   ```js
   const cuts = [
     '#include <lights_physical_fragment>',
     '#include <lights_fragment_begin>',
     '#include <lights_fragment_maps>',
     '#include <lights_fragment_end>',
     '#include <aomap_fragment>',
   ];
   for (const c of cuts) s = s.split(c).join('');
   ```

   Those four includes *are* three.js's punctual-light accumulation — where `pointLights[i]`
   is read and summed into `totalDiffuse`. With them removed, `totalDiffuse` is never computed.
   `_patch` then replaces `vec3 outgoingLight = totalDiffuse + totalSpecular +
   totalEmissiveRadiance;` with `TOON_SHADE`, whose entire light budget is
   (`toon.glsl.js:468-471`, `:791`):

   ```glsl
   vec3 diff = alb * keyRad * key * mix(1.0, ao, uAoKey)   // uKeyDir — the ONE directional light
             + albAmb * slyFillX * ao                       // uSkyColor / uBounceColor hemi fill
             + albShadow * slyShadX * shadowMix * ...        // uShadowColor* 
             + slyShadX * uShadowWash * shadowMix * ao;
   outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm;
   ```

   **There is no point-light term anywhere in it**, and no `uLocal*` uniform exists to carry one
   (checked: every light-bearing uniform in `toon.glsl.js` is `uKeyDir`, `uKeyColor`,
   `uKeyIntensity`, `uSkyColor`, `uBounceColor`, `uShadowColor`, `uShadowColorLit`).

**And the tomb is toon-shaded.** `Architecture.mat()` (`Architecture.js:156-233`) routes every
recipe through `shading.toon()`; the `MeshStandardMaterial` branch at `:233` is an explicit
no-SHADING fallback ("the work must always be visible"). SHADING is present in every canonical
capture, so no architecture surface in `interior` is on the fallback path.

**This is the mechanism behind CRITIC-sbs1 §3's "their light dies within ~2 m of each sconce."**
It does not die at 2 m. It was never emitted onto stone at all. What is visible near a sconce is
the additive flame sprite and the torch head's own `emissiveTerm` — both of which survive the
patch, which is exactly why the observation reads as "a little light, very close in".

## 2. What the frame says (`torchdiag.json`)

Predicates stated (§122.1): **warm = R > B+10 ∧ L > 40** (CRITIC-sbs3's own frame predicate);
**flame core = L > 170 ∧ R > B+40**, deliberately strict so "flame" cannot annex warm wall.

| frame | warm % | lit % | flame-core % | flame-core px |
|---|---|---|---|---|
| **`sbs3/interior.png` (current)** | **7.05** | 85.78 | **0.188** | 1 734 |
| `cand1/frames/interior.base.png` | 7.35 | 83.68 | 0.181 | 1 669 |
| `banda2/interior.base.png` | 7.31 | 83.37 | 0.181 | 1 671 |

**CRITIC-sbs3's 7.05 % reproduces exactly**, and the history confirms banda2 left it alone
(7.31 → 7.05) — as expected from a subject-scoped lever.

**Reach profile, measured outward from the flame sprites themselves** (no camera port needed —
the sprites locate themselves):

| annulus from flame (px) | warm % of annulus | mean R−B |
|---|---|---|
| 0–10 | **78.88** | **+39.81** |
| 10–20 | 37.80 | +12.33 |
| **20–30** | 19.74 | **−0.68** ← neutral already |
| 30–40 | 13.06 | −8.69 |
| 60–80 | 9.84 | −19.65 |
| 120–160 | 1.01 | −29.15 |

**Warmth crosses neutral ~25 px from the sprite edge** — roughly one sprite-diameter out — and
is 30 R−B units *cool* by 150 px. That is the signature of an additive billboard falling off,
not of a 9 m-radius light: a real 1/d² point light with a 9 m cutoff would still be delivering
a third of its 1 m value at 3 m and would decay smoothly across hundreds of pixels. *(px→m is
not convertible offline without the interior camera; the profile's **shape** is the finding and
it is scale-free.)*

**Warm attribution — how much of the frame's warm is flame-adjacent at all:**

| | px | % of frame | % of the warm population |
|---|---|---|---|
| within 10 px of a flame | 8 141 | 0.88 | 12.5 |
| within 40 px | 18 009 | **1.95** | 27.7 |
| within 160 px | 32 582 | 3.54 | 50.2 |

## 3. How much can FX honestly buy? ≤ ~2 pp of 24

FX owns the emitted sprites (`Emitters.js` `fire_body` / `torch_smoke` / `embers`) and nothing
else in this chain. The entire flame-adjacent warm population is **1.95 % of the frame** at a
40 px radius. To close 24 pp we would need **+221 000 warm pixels**; the whole FX-owned
population is **18 009**.

Even a physically absurd change — quadrupling flame sprite area, which puts ~2 m fireballs in a
tomb and would fail §7.3's "bloom is a grey wash" and the mote-clamp rails at once — scales that
population to roughly 4 % of frame, i.e. **about +2 pp**. **FX's ceiling on this gap is under a
tenth of it, and buying even that costs a look regression.** That is the honest answer the
dispatch asked for, including the possibility that it is "little".

**No `PREREG-torchpool.md` is sealed.** A prereg here would register a lever that cannot reach
the registered quantity — the §141.1 defect (a number that does not depend on the thing it
claims to measure) committed in advance, on purpose. The measurement does not support a
candidate, so none is offered.

## 4. Where the ~22 pp actually lives, and what it would take

**Route: SHADING** (`src/render/shaders/toon.glsl.js` + `src/render/ToonMaterial.js`). The
missing work is a local-light term in `TOON_SHADE`. LIGHTING's half is **already built and
correct** — the pool promotes, flickers, fades and writes real `PointLight`s every frame; the
data is sitting in the uniforms three.js already uploads.

**Sizing input, so whoever seals it does not have to re-derive it.** three.js punctual falloff
at the registered parameters (`I/d² · saturate(1−(d/R)⁴)²`, `decay = 2`, cutoff = radius):

| distance | wall torch (I 3.4, R 9) | brazier (I 5.5, R 13) |
|---|---|---|
| 1 m | 3.399 | 5.500 |
| 2 m | 0.846 | 1.373 |
| 3 m | 0.369 | 0.608 |
| 5 m | 0.111 | 0.210 |
| 8 m | 0.007 | 0.063 |

So the registered lights would carry meaningful warmth to **~4–5 m (torch)** and **~8 m
(brazier)** — several times the ~25 px the sprites currently reach, across surfaces that are
85.8 % lit-band already and currently sitting at mean R−B −20 to −29.

**Three cautions for that seal, from this diagnosis:**
1. `localCap` is **6 at `high`** (`Lighting.js:178`) — the interior has more sconces than slots,
   so a naive term will light some and not others. Whether that reads as inconsistent is a look
   question that must be in the §17 declaration.
2. Point lights **cast no shadows** here (`Lighting.js:726`, "VSM does not support point
   shadows"), so a local term will leak through walls unless it is gated on something.
3. The toon pipeline is deliberately one-light. Adding a second directional input is a real look
   change to every torch-lit surface in the game, not a knob — it belongs in a seal with a
   night/interior gate, exactly as `PREREG-litwarm` gates its own term.

**Not routed to LIGHTING.** Their enclosure share may still be real, but on this specific
mechanism their code is correct and complete; the break is downstream of them.

## 5. Coordination with `PREREG-litwarm` — no pixel collision

Read before writing this (`PREREG-litwarm.md`, sealed 2026-08-06). Its candidate is
**`sss` on architecture 0.0 → 0.30** (`Architecture.js:222`), a wrap term
`alb * uSssColor * keyRad * (sssAmt * uSss * 2.4 * sh)` — **multiplied by `keyRad` and by `sh`**.
It therefore lives only where the **key** reaches and the shadow map is open, near the
terminator. A local-light term lives where the key does **not** reach — the interior of a tomb
with, per litwarm's own §1.2 port, no sun blade in the frame at all. **Disjoint by construction,
and the two must not be merged.**

One thing to hand SHADING explicitly: **litwarm §1.4 surveys the shader for warm terms and
concludes `sss` is "the only warm, key-scaled term… that survives where the ramp has gone to
zero".** That is true *as stated* — and the qualifier is load-bearing. The survey was scoped to
key-scaled terms, so it could not have found this: the missing term is not scaled by the key at
all. **§1.4's conclusion is not contradicted; its scope simply did not cover the local path.**

## 6. Files

`progress/records/NOTE-torchpool.md` (this note);
`progress/records/fxcluster1/torchdiag.mjs` + `torchdiag.json` (instrument and output).
Frames read, all previously committed: `sbs3/interior.png`, `cand1/frames/interior.base.png`,
`banda2/interior.base.png`. (`sbs2/interior.base.png` is absent from the tree; `sbs2/` holds no
interior frame — noted so it is not re-hunted.)
Source read for constants only, nothing modified: `src/world/Props.js`, `src/world/Architecture.js`,
`src/render/Lighting.js`, `src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`.
