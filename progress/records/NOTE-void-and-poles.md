# Findings — void.mjs NaN DDA fix + pole-spline warning diagnosis

Tree: `f026ef3`. SRC FREEZE respected: the only file edited is `tools/void.mjs`
(standalone tool, zero importers — verified below). No lock interaction, no capture
started, no src/ edits. Executable evidence: `voidproof.mjs` in this scratchpad.

---

## 1. tools/void.mjs — §21's 0*Infinity NaN DDA bug: **fixed in place, proven**

### Freeze-safety check first (per §14's fourth refinement)

Import chains of everything queued, read from disk:

- `scratchpad/goldhalo.mjs` → `tools/harness.mjs` (+ node builtins) → `tools/lock.mjs`,
  `playwright`, node builtins.
- `tools/shot.mjs` → `tools/lock.mjs`, `playwright`, node builtins.
- `grep -rn "from ['\"].*void"` over `tools/`, `src/`, and the scratchpad (excluding
  vite dep caches): **zero importers of void.mjs anywhere.** It is a leaf script.

So editing it cannot race a queued boot; fixed in place per instructions.

### The bug, reproduced in the on-disk code before touching it

`voidproof.mjs` textually extracts `rayTri` + `cast` from `tools/void.mjs` (so it always
tests the real file, not a transcription) and runs them against a synthetic solid wall
quad at z = −2 spanning x ∈ [−8, 8], CELL = 4. Before the fix:

```
FAIL known-bad: axis-aligned ray, origin on cell plane, wall ahead: false
ok   null: same degenerate ray pointing away — miss
ok   control: off-plane origin hits the wall
strip: holes at [-4, 0, 4]          <- exactly every CELL: the §21 signature
FAIL strip: hole count: 3 (want 0)
```

Mechanism in void.mjs is the same 0*Infinity as §21 but surfaces one line later than in
horizon.mjs's original: `tx = (nb − o.x) * inv(d.x)` goes NaN; the branch chooser never
selects it (NaN comparisons all false), but `cellEnd = Math.min(tx, ty, tz)` is **NaN**,
so `best <= cellEnd + 1e-3` rejects every genuine hit forever — the cast walks through
solid stone to maxT and reports a clean miss. Exactly the dangerous silence §21 predicted:
a void probe that misses everything says "no leak".

### The fix

Same guard the main walk got in `horizon.mjs` (guard the zero direction directly; the
sign test cannot see a NaN), applied to `tools/void.mjs` `cast()`:

```js
const t0=(b,o1,d1)=>Math.abs(d1)<1e-12?Infinity:(()=>{const t=(b-o1)/d1;return t<0?Infinity:t;})();
let tx=t0(nb(ci,si),o.x,d.x);   // was: (nb(ci,si)-o.x)*inv(d.x); if (tx<0) tx=Infinity;
let ty=t0(nb(cj,sj),o.y,d.y);
let tz=t0(nb(ck,sk),o.z,d.z);
```

After the fix, same proof run:

```
ok  known-bad: axis-aligned ray, origin on cell plane, wall ahead  (hit at t = 8.000)
ok  null: same degenerate ray pointing away — miss
ok  control: off-plane origin hits the wall
strip: holes at []   ok  strip: hole count: 0
```

Known-bad hits at the exact analytic distance, the null still misses (the failure mode of
a bad fix here would be NaN→spurious hits), the control is unchanged. `node --check`
passes on the whole file. A full end-to-end `void.mjs` run (builds the level headless,
144k rays) is **deferred until the queue drains** — it is pure CPU and would compete with
bud35's render; nothing in the fix touches anything outside `cast()`'s three setup lines.

---

## 2. The two pole-spline boot warnings — diagnosis

`Collision._warn` dedupes on exact message text (`Collision.js:290`), so two warnings do
not mean two poles — they mean two distinct *names*, each covering a population:

### 2a. `pole "proxy:pole"` — ~17 authored poles, fallback **behaviorally identical**. Demote.

Every `poleProxy()` in `EgyptLevel.js` (line 162) produces a proxy named `proxy:pole`
(name assigned in `Architecture.proxy` from the tag). Call sites at f026ef3: the obelisk
(L366), 2 cable masts (L770), 8 nave papyrus columns (L981), 4 aisle columns (L1001),
2 roof pinnacles (L1141) — all one deduped warning.

`poleProxy` sets `userData.top/bottom/axis` but not `userData.spline`. The synthesiser
(`Collision._synthCurve`, line 864) has two branches, and these poles take the **first**:
`Number.isFinite(ud.top) && Number.isFinite(ud.bottom)` → straight vertical from
`(x, bottom, z)` to `(x, top, z)` using the proxy's world position — i.e. built from the
**authored §8.1 numbers**, not from bounds (the message text "from its bounds" is wrong
for this branch). The CatmullRom through the three collinear, equally-spaced points
`[a, mid, b]` is affine-exact: every sampled point lies on the authored segment, and
uniform parameterisation makes u→y exactly linear. `_addSplineEntry` then resamples at
0.5 m, identically to how an authored 2-point curve (cf. `Props._pole`, which does author
one) would be resampled. Tangents are vertical everywhere either way.

Note the leaning nave/aisle columns don't change this: their `poleProxy` is authored
vertical at (cx, cz) on purpose (the abacus *ledge* proxies travel with the lean; the
pole axis does not), and the synth reproduces that vertical exactly.

**Verdict: behaviorally identical everywhere, reachable or not. Demote the warning for
the top/bottom branch** — or, the one-line post-freeze fix in my file, which kills the
warning honestly at its source, in `EgyptLevel.js` `poleProxy()`:

```js
m.userData.spline = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z)]);
```

Either is correct; the demote (warn only when `_synthCurve` falls to its bounds branch)
is the better one because it keeps the warning meaningful for cases like 2b.

### 2b. `pole "unnamed"` — palm trunks, fallback **NOT identical: a phantom pole in the courtyard**. Real defect.

The unnamed registrant is `Vegetation.js:383`: the palm-trunk **InstancedMesh** (three of
them, one per height variant — deduped to one warning), registered
`{ tag: 'pole', climbable: true }` with no name and no `userData.spline`.

For these, `_synthCurve` falls to its **bounds** branch — and the bounds of an
InstancedMesh here are `geometry.boundingBox × matrixWorld`, which ignores instances
entirely (the code even knows this: `frustumCulled = false // the per-mesh bounds lie`).
The vegetation group sits at identity, and each trunk variant's geometry is a single
trunk at the local origin: base r ≈ 0.5 m, height 7.4 / 9 / 11 m, crown bend ≤
`palmLean 0.30 × h × 0.42` ≈ 1.4 m horizontal. Longest axis is y, so the synthesised
spline is a vertical line at the bbox centre — **within ~1 m of world (0, ·, 0), spanning
y ≈ 0 to 7.4–11 m. Three phantom climbable poles in the open courtyard**, on the paving
between the obelisk terrace (z ≥ 2.6) and the hall front (z −16), squarely on the
spawn→hall walking route.

Behavioral consequences, both real:
1. **The phantom is mountable.** `Moveset.PoleClimb.canEnter` attaches within
   `poleMount 1.9 m` when moving toward the pole (auto), or `2.85 m` on interact
   (`Controller.js:102`, `Moveset.js:796-800`). Walking near the world origin and
   pressing interact — or just sprinting through it toward the hall — latches Sly onto
   invisible air, ~11 m of it.
2. **No actual palm is climbable.** The stated intent at the registration site ("a palm
   by a wall is a legitimate route up") does not function: the per-instance trunks are
   solid in the BVH (BVH.js expands instances correctly, line 326-331) but have no spline
   affordance at any real palm position.

**One-line post-freeze fix** (mitigation, owner VEGETATION), `Vegetation.js:383`:

```js
this.engine.registerCollider(trunks, { tag: 'misc', material: 'wood' });
```

`misc` is in `SOLID_TAGS`, so trunks stay solid to the capsule exactly as today; the
bogus line affordance and the phantom mount vanish. It costs palm climbability — which
does not currently exist anyway (defect 2, above), so nothing real is lost. Restoring
*actual* palm climbing needs per-instance spline registration (one collider per palm spot
with an authored 2-point spline — the spot list is right there in `_scatterPalms`); that
is a small loop, not a one-liner, and is Vegetation's call.

### Routing summary

| warning | population | fallback vs authored | action |
|---|---|---|---|
| `pole "proxy:pole"` | ~17 EgyptLevel poles | identical (built from authored top/bottom) | demote warning (or 1-line spline in `poleProxy`) |
| `pole "unnamed"` | 3 palm-trunk InstancedMeshes | phantom pole ≤1 m from world origin, y 0–11; palms not climbable | real defect → VEGETATION; 1-line mitigation: tag `misc` |
