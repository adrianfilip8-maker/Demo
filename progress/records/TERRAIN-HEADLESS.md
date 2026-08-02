# `Terrain` will not build headless — diagnosis, patch, verification

**Owner:** WORLD. **Status:** diagnosed, patched out-of-tree, verified headless. Browser-side
equality check scored in `SEAL-terrain-headless.md`. **No `src/` edit applied** — task #23 holds.

Deliverables in this directory:

| file | what it is |
|---|---|
| `hunk1-headless-canvas.patch` | **the fix.** `git apply` against `src/world/Terrain.js` |
| `hunk2-failure-isolation.patch` | optional, applies on top of hunk 1 |
| `SEAL-terrain-headless.md` | pre-registered bands + verdict for the equality check |
| `terrain-headless-probe.mjs` | headless builder/measurer (`--noshim` reproduces the bug) |
| `terrain-browser-ref.mjs` | browser reference, boot-only, takes the capture lock |
| `score-seal.mjs` | applies the sealed bands to the two JSON outputs |

---

## 1. Why it needs `document` — confirmed, not assumed

One reference, and only one, in the whole of `src/world/`:

```
src/world/Terrain.js:682   const c = document.createElement('canvas');
```

The coordinator's guess was right — it is a canvas, and it is used for procedural raster
generation. The call chain, reproduced live rather than read off:

```
Terrain.init()                        Terrain.js:505
  └ _buildTextures()                  Terrain.js:656
      └ _makeRippleNormal(512)        Terrain.js:721
          └ _canvas(512)              Terrain.js:682  ← ReferenceError: document is not defined
```

`_makeMacroAlbedo(256, 1100)` at line 672→758 is the second caller, reached only when TEXTURES
has not supplied `sand_fine`. Both bake pixel data into an `ImageData` and wrap it in a
`THREE.CanvasTexture`.

## 2. The failure is worse than "Terrain is missing"

This is the part that matters for instrument trust, and it is not what the report implied.

`init()` runs four stages inside **one** try/catch:

```js
try {
  this._buildCache();
  this._buildTextures();      // ← throws headless
  this._buildSand();
  this._buildPyramids();
  this.engine.scene.add(this.group);
} catch (err) {
  this.engine.warn(`terrain: sand build failed — ${err?.message || err}`);
}
```

So the *cosmetic* stage in the middle takes out the two that matter. Measured on the current
shipped file, headless (`terrain-headless-probe.mjs --noshim`, `control.json`):

| | control (shipped, headless) | with the canvas satisfied |
|---|---|---|
| `terrain.group` in scene | **false** | true |
| sand rings | **0** | 4 |
| collision proxy | **absent** | present |
| pyramids | **0** | 2 |
| meshes present | 9 (vegetation + water only) | 17 |
| total triangles | 21,446 | 130,626 |
| warnings | 1 | **0** |
| `init()` rejected? | **no — it resolved** | no |
| `heightAt(0, 79)` | **18.012178 — correct** | 18.012178 |

Three consequences a headless instrument would not notice:

1. **`init()` resolves successfully.** The module reports itself present. Nothing upstream
   fails. The only signal is one warning string among however many others a boot produces.
2. **Vegetation and water still build** — their `init()`s are in *separate* try/catch blocks
   further down — and they are added to `terrain.group`, which is never parented. So there are
   21k triangles of palms and Nile surface hanging off a detached node, plus **4 colliders
   registered** (`nile` and three unnamed) pointing at geometry outside the scene graph.
3. **`heightAt()` works perfectly.** `_buildCache()` is the stage *before* the throw, so the
   cached height field is complete and correct. A probe that queries the analytic API gets the
   right ground; a probe that ray-casts the scene gets no ground. Two instruments measuring
   "the terrain" disagree, and neither errors.

That third point is the live hazard the coordinator was pointing at. It also means SHADING's
existing instrument was on firmer footing than it knew for anything using `heightAt`, and on no
footing at all for anything ray-casting the sand.

## 3. Is it separable? Yes — proven, not argued

The geometry path never touches a canvas. `_buildCache`, `_buildRingGeometry`,
`_stitchedHeight`, `_pyramidGeometry` and `_buildCollisionProxy` are pure arithmetic over
`rawHeight()` plus THREE buffer construction. The two baked maps are consumed only as
`map` / `normalMap` arguments to `this.mat({...})` — material parameters. Nothing reads them
back, and no vertex position, index or colour depends on them.

The fix is therefore the coordinator's second option: **an injectable raster backend**.

## 4. The patch

### Hunk 1 — `hunk1-headless-canvas.patch` (the fix)

Adds a module-scope `makeHeadlessCanvas(size)` and one branch in `_canvas()`:

```js
_canvas(size) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }
  return makeHeadlessCanvas(size);
},
```

`makeHeadlessCanvas` implements exactly the four operations the two bakes perform —
`width`/`height`, `getContext('2d')`, `createImageData`, `putImageData` — and **throws** on
anything else, so it can never silently half-support a future canvas use and hand back a blank
map. `createImageData` zero-fills like the spec; both bakes write all four channels of every
pixel unconditionally, so the fill value cannot change their output.

**Why the browser is safe.** The lines executed when `document` exists are, whitespace-trimmed,
character-identical to the current shipped lines — verified mechanically, not by eye. The only
change inside that branch is two spaces of indentation. `makeHeadlessCanvas` is a function
declaration with no side effects that is never called in a browser. `typeof document !==
'undefined'` is the standard SSR-safe idiom; Vite/Rollup do not constant-fold it.

Chosen over "skip the bakes headless" deliberately: skipping would create a second code path
that can drift from the shipped one. This keeps one path. Cost is 1.7 s of the 4.8 s headless
build (1401 ms for the 512² ripple map, 292 ms for the 256² macro albedo).

**Deliberate limitation, documented at the call site:** headless, the resulting `CanvasTexture`
is CPU-side only — its `image` is a plain object, not an `HTMLCanvasElement`, so binding it to
a real GL context would fail. Nothing headless has a GL context to bind it to. If a future
instrument ever pairs headless Terrain with `headless-gl`, this is the thing that will break,
and it will break loudly.

### Hunk 2 — `hunk2-failure-isolation.patch` (optional, recommended)

Splits `init()`'s single try/catch into three, so a raster failure can never again cost the
ground, and each warning names what was actually lost:

- height cache fails → warns, `heightAt()` falls back to the analytic field (slower, correct)
- textures fail → warns "surfaces will be untextured", geometry still builds
- sand/pyramids fail → warns "**THE WORLD HAS NO GROUND**"

Call order is unchanged (`cache → textures → sand → pyramids → scene.add`), so on a successful
boot — the only path that exists in the browser — behaviour is identical. It is observable only
on a throwing path. **Independently declinable**; hunk 1 stands alone.

This hunk is what stops the class of bug rather than the instance. Without it, the next host
dependency added to `_buildTextures` silently deletes the ground again.

## 5. Verification

Per the coordinator's requirement 3, verification is a real build compared against a browser
boot — not an import check.

**Headless side.** `srcmirror/world/Terrain.js` is the fully patched file, imported with its
real dependencies (`../core/Rand.js`, `Vegetation.js`, `Water.js` symlinked to the live tree)
and **no global `document` shim** — so what is exercised is the patch's own branch, not a test
harness. Result: builds, `group` parented, **zero warnings**, 73,306 verts / 130,626 tris,
geometry hash-identical to the earlier global-shim run.

Sanity check that the shim is not vacuous: both baked maps contain real data — ripple normal
map 512², 100 % non-zero pixels, R 1–254 / G 1–254 / B 18–255; macro albedo 256², 100 %
non-zero, R 201–255. A blank-map shim would have passed the geometry check and failed this one.

**Hunk 1 stands alone.** Built from a mirror carrying hunk 1 only: builds, parented, zero
warnings, 73,306 verts / 130,626 tris — mesh-for-mesh hash-identical to hunk 1 + hunk 2. Hunk 2
changes no geometry whatsoever; it is purely defensive.

**Hunk 2 earns its place.** With `_canvas` forced to throw — standing in for any future raster
or host dependency added to the cosmetic stage:

| | ground meshes | group parented | triangles | warning |
|---|---|---|---|---|
| hunk 1 only | **0 of 7** | **false** | 21,446 | `sand build failed — …` |
| hunk 1 + hunk 2 | **7 of 7** | true | 130,626 | `sand maps failed, surfaces will be untextured — …` |

Without hunk 2 the ground still vanishes on any raster failure, and the warning still blames
"sand build" for what was a texture problem. That is the same misdirection that made this bug
expensive to find the first time.

**Browser side — verdict EXACT.** Bands were registered before the browser reference existed;
full scoring in `SEAL-terrain-headless.md` / `SCORE-terrain-headless.txt`.

All 7 ground meshes match the browser boot (`q=high`, ANGLE/SwiftShader) on vertex count,
triangle count, bounding box **and** an FNV-1a hash over the raw position bytes — every delta
exactly zero, not merely within tolerance. Totals 73,306 verts / 130,626 tris both sides. The
unbound population (vegetation, water) matched exactly too, though nothing was claimed for it
in advance.

The browser boot had the **real TEXTURES module** loaded (its one boot warning was
`textures: prewarm took 27.3s at size 1024`) while the headless side ran `engine.get() → null`.
The geometry matched anyway — so this is not two stripped builds agreeing on a fallback path,
it is positive evidence that TEXTURES/SHADING do not reach the geometry.

Per the coordinator's instruction — *"if they differ at all, say so and stop"* — they do not
differ at all, so there is nothing to stop for.

## 6. For whoever writes the next headless depth instrument

- Terrain needs a **stub engine**: `{ scene, quality, maxAniso, get(), warn(), registerCollider(), on() }`.
  `get()` returning `null` is the supported path — Terrain has documented fallbacks for absent
  TEXTURES and SHADING.
- **Set `quality` to match the capture you are comparing against.** It is the only engine input
  the geometry reads (`INNER_STEP`), and it changes the inner ring's vertex count. `high` → 0.8 m
  cells → `sand_ring0` is 193² = 37,249 verts. Getting this wrong is the easiest way to measure
  a different ground than the one on screen.
- `src/core/Engine.js` uses `document`/`window` at lines 20, 25–26, 119, 125, 289–290, 316. It is
  **not** headless-capable and is not mine. Stub it, as SHADING already does.
- Cost: ~4.8 s for a full headless Terrain versus ~90 s for a browser boot, and no capture lock.
