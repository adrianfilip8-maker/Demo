import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SlyModel, RIG3, TUNE } from '../src/player/SlyModel3.js';

/**
 * Structural guards on the shipped character's geometry.
 *
 * `SlyModel3.js` builds the whole character procedurally — lofts, tubes, blobs, a splined tail —
 * and `init()` touches no DOM and no renderer, so the entire mesh builds in plain Node in
 * milliseconds: 2,801 vertices, 4,782 triangles, with normals and skin attributes. That surface was
 * previously reachable only through a browser boot holding the capture lock, which is why none of
 * it has ever been checked.
 *
 * The idea is from PauliusOS/pallet-town-3d (MIT), whose `sculpt.test.mjs` guards its procedural
 * geometry against inverted winding and describes the failure as one where "the whole model lights
 * against the inside of its own skin — which reads as flat, washed-out shading rather than as an
 * obvious error." That is precisely the failure this project cannot see: every instrument here is a
 * screenshot, and washed-out shading is what a screenshot looks like when it is working badly.
 *
 * ── The winding metric that had to be thrown away ──────────────────────────────────────
 * The obvious test is to compare each triangle's geometric normal (from its winding) against the
 * average of its three vertex normals, and flag the negatives. Run on this mesh it reports **123 of
 * 4,754 triangles inverted**, worst dot −0.9991, and — more seductively — the flags are not
 * scattered: 107 of them land on the four tail bones at 9–14% of each, and the rest on `chest`. The
 * tail is critic pass 7's outstanding "rebuild the tail" defect, so the number arrives looking like
 * the explanation.
 *
 * It is not. `SlyModel3.js:554` calls `computeVertexNormals()` on the merged geometry, so every
 * normal is area-weighted-smoothed across shared vertices. The tail deliberately jitters alternate
 * bands outward by 7% (`jitv`) for a fur hint, and the torso deliberately doubles rings at each
 * colour seam. Both create sharp steps, and a smoothed normal at a sharp step legitimately opposes
 * the step face's own winding. **The metric cannot separate an inverted triangle from correct
 * geometry that is smooth-shaded across a crease** — it measures the shading model, not the winding.
 *
 * What replaced it assumes nothing about normals, curvature or convexity: in a consistently wound
 * mesh, every interior edge is traversed in *opposite* directions by the two triangles that share
 * it. One flipped triangle makes its three edges traverse the same way twice. That is topology, and
 * it is decidable. It reports **zero conflicts** across 6,721 interior edges — the mesh is clean,
 * and the 123 were an artefact of asking the wrong question.
 *
 * Kept as a comment rather than deleted because the wrong version was convincing, localized, and
 * agreed with a defect already on the books. Those are the three properties that make a broken
 * instrument expensive (KNOWN_ISSUES §210.2, §211.1).
 */

const stubEngine = { warn: () => {}, get: () => null, emit: () => {} };

/** Built once — `init()` is deterministic and costs a few ms. */
const model = new SlyModel(stubEngine);
await model.init();
const geo = model.mesh.geometry;
const pos = geo.attributes.position;
const nor = geo.attributes.normal;
const skinIndex = geo.attributes.skinIndex;
const skinWeight = geo.attributes.skinWeight;
const index = geo.index;
const BONE_COUNT = RIG3.BONE_ORDER.length;

test('character: the mesh builds, and builds something', () => {
  /* Every test below is a loop over this data. If the build silently produced an empty mesh they
     would all pass having inspected nothing — the §211.1 failure. Assert the subject exists first. */
  assert.ok(model.mesh, 'init() produced no mesh');
  assert.ok(pos.count > 1000, `only ${pos.count} vertices`);
  assert.ok(index && index.count > 3000, 'geometry is not indexed, or is nearly empty');
  assert.ok(nor && skinIndex && skinWeight, 'missing normal or skinning attributes');
});

test('character: every position and normal is finite, and normals are unit length', () => {
  /* A NaN here propagates through the skinning matrix and collapses the mesh to a point. */
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)),
      `vertex ${i} has a non-finite position`);
    const L = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
    assert.ok(Math.abs(L - 1) < 1e-3, `vertex ${i} normal has length ${L}`);
  }
});

test('character: every skinIndex names a real bone', () => {
  /* THE live hazard in this file. `bi(name)` is `BONE_ORDER.indexOf(name)`, called ~100 times with
     a string literal, and `indexOf` returns **-1** on a typo. -1 does not throw: it either binds the
     part to garbage or silently to bone 0, the hips — a limb that drags with the pelvis and animates
     plausibly enough that only a side-by-side would show it. */
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < skinIndex.count; i++) {
    for (const k of ['X', 'Y', 'Z', 'W']) {
      const v = skinIndex[`get${k}`](i);
      if (v < min) min = v;
      if (v > max) max = v;
      assert.ok(Number.isInteger(v) && v >= 0 && v < BONE_COUNT,
        `vertex ${i} skinIndex.${k} = ${v}, outside [0, ${BONE_COUNT})`);
    }
  }
  assert.ok(min === 0 && max === BONE_COUNT - 1,
    `skin indices span ${min}..${max} of ${BONE_COUNT} bones — a bone at an end may have lost its geometry`);
});

test('character: skin weights sum to 1 at every vertex', () => {
  /* Linear blend skinning does not renormalise. Weights summing to 0.8 shrink that vertex toward
     the origin by 20% of its bone-space offset every frame it is posed — a dent that only appears
     in motion, and only where the weights are wrong. */
  for (let i = 0; i < skinWeight.count; i++) {
    const s = skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i);
    assert.ok(Math.abs(s - 1) < 1e-3, `vertex ${i} weights sum to ${s}`);
  }
});

test('character: winding is topologically consistent', () => {
  /* See the header. Purely topological: weld by position so independently built parts share their
     seams, then require every interior edge to be traversed once in each direction. Normals,
     curvature and convexity do not enter into it. */
  const q = (v) => Math.round(v * 1e5);
  const weld = new Map();
  const vid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
    if (!weld.has(k)) weld.set(k, weld.size);
    vid[i] = weld.get(k);
  }

  const dir = new Map();
  let degenerate = 0, triangles = 0;
  for (let t = 0; t < index.count; t += 3) {
    const v = [vid[index.getX(t)], vid[index.getX(t + 1)], vid[index.getX(t + 2)]];
    if (v[0] === v[1] || v[1] === v[2] || v[2] === v[0]) { degenerate++; continue; }
    triangles++;
    for (let e = 0; e < 3; e++) {
      const k = `${v[e]}>${v[(e + 1) % 3]}`;
      dir.set(k, (dir.get(k) || 0) + 1);
    }
  }

  let conflicts = 0, interior = 0;
  const seen = new Set();
  for (const [k, c] of dir) {
    const [a, b] = k.split('>');
    const rk = `${b}>${a}`;
    if (seen.has(k) || seen.has(rk)) continue;
    seen.add(k);
    const r = dir.get(rk) || 0;
    if (c > 1 || r > 1) conflicts++;
    else if (r === 1) interior++;
  }

  assert.ok(triangles > 3000, `only ${triangles} triangles inspected`);
  assert.ok(interior > 3000, `only ${interior} interior edges — the weld found nothing to share`);
  assert.equal(conflicts, 0, `${conflicts} edges are traversed twice in the same direction — a part is wound inside out`);

  /* Degenerate triangles are expected here and bounded rather than banned. The torso makes its hard
     colour seams by doubling a ring at the same height AND the same radius (the blue|gold collar at
     `collarLo`), which duplicates the vertices so the colour can jump without interpolating; the
     connecting quads then have zero area by construction. They never rasterize. Measured: 28 of
     4,782, all on `chest`. The bound catches a builder that starts emitting them everywhere. */
  assert.ok(degenerate / (triangles + degenerate) < 0.02,
    `${degenerate} degenerate triangles of ${triangles + degenerate} — above the 2% seam allowance`);
});

test('character: the mesh matches the height the collision capsule assumes', () => {
  /* `Controller.TUNE.height` is 1.80 and the capsule is built from it. If a builder change rescales
     the mesh, the character starts floating or sinking and every shot is subtly wrong — the kind of
     thing that gets diagnosed as a camera or a terrain bug for a day. */
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = bb.max.y - bb.min.y;
  assert.ok(Math.abs(h - TUNE.height) / TUNE.height < 0.05,
    `mesh is ${h.toFixed(3)} m against a spec'd ${TUNE.height} m`);
  /* Feet sit on the origin plane. A little below is deliberate — it hides the seam on uneven
     ground — but a mesh that starts well under the floor means the rig moved. */
  assert.ok(bb.min.y > -0.05 && bb.min.y < 0.05, `mesh floor is at y=${bb.min.y.toFixed(3)}`);
});

test('character: bind pose is laterally symmetric', () => {
  /* Sly is built symmetric, part by part, with an L and an R call for each limb. A missing or
     mistyped mirror shows up here as a lopsided bound long before it shows up in a frame — and
     `-1` from `bi()` would land a whole limb on the centre line. */
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  assert.ok(Math.abs(bb.max.x + bb.min.x) < 0.02,
    `bounds span x ${bb.min.x.toFixed(3)}..${bb.max.x.toFixed(3)} — not centred`);
  /* The tail sweeps behind him, so Z is deliberately asymmetric; assert only that it does sweep. */
  assert.ok(bb.min.z < -0.5, `nothing extends behind the character (min z ${bb.min.z.toFixed(3)}) — is the tail built?`);
});
