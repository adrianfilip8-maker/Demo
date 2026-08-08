import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';

import { SlyModel as SlyModel3, RIG3 } from '../src/player/SlyModel3.js';
import { SHOTS, SHOT_NAMES } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';
import { TUNE as RAMP } from '../src/render/ToonMaterial.js';

/**
 * The eyes, on the character that ships. Two separate questions, one subject.
 *
 * ── Q1. Can the shipped character carry pupil bones? (KNOWN_ISSUES §211.3) ────────────
 * `hurt` and `ko` both scale `pupilL`/`pupilR`. Neither exists in `RIG3`, and `RIG3` is the
 * skeleton the shipped character binds to whatever mesh rides on it (§216 —
 * `SlyModelDLRig.js:39` imports it and builds its bones from `RIG3.SKELETON`), so
 * `PoseBuffer.addScale`'s `if (cur === undefined) return` makes both tracks silent no-ops.
 * The feature is real: specced (`SPEC-startle-pupils.md`), implemented on the legacy model,
 * and sealed at ΔdarkFrac **+0.726 / +0.731** against a ≥0.12 band (§27.2) — roughly 5×. It
 * even has its own canonical shot, `sly-startle`, whose camera was re-authored specifically so
 * the two eyes present equally while it is judged. §211.3's "no screenshot in the suite freezes
 * either" is wrong on that last point, and the correction matters: this is not two frames
 * nobody looks at, it is a shot in `Shots.js` and in three offline tools.
 *
 * The tests below establish that the shipped mesh nevertheless **cannot** carry it, by
 * measurement rather than by assertion, and the decision that follows is recorded at
 * `RIG3 must not grow pupil bones` near the bottom of this file.
 *
 * ── Q2. §2198's split-lit pair, on a character that has only just met a terminator ────
 * `SlyModel.js:2198` records the legacy pair measuring **145 luma apart** — "one headlight and
 * one socket" — because with `bands: 3` the two lenses sat at N·L **0.8349** and **0.3463**,
 * either side of `termHi`, so one eye received exactly twice the key of the other. The legacy
 * fix is a shading-normal bias with no X component and no mirroring (`shadeN = (0, 0.15, 1)`,
 * `SlyModel.js:2236`), so both eyes present the identical normal to the key at every sun angle.
 * §213 has just put the shipped character on `toon()` for the first time in the project's life,
 * so this is the first moment the question is even askable of `SlyModelDLRig`. It is measured
 * below, at every shipped shot and across a 72-yaw sweep, with three calibration arms.
 *
 * ── How the shipped module is loaded offline ──────────────────────────────────────────
 * Same three mechanical rewrites as `tests/dlrig.test.mjs`, for the same reason: the one
 * character path that ships is the one path plain Node could not reach, which is exactly why
 * §213's `shading.make` typo and critic pass 7's #5 and #6 all lived in it. This file loads the
 * real source, not a replica.
 */

/* ============================ loading the shipped module ============================ */

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/player/SlyModelDLRig.js');
const EYE_PNG = path.join(ROOT, 'src/assets/sly-dl/sly_eyeball.png');
const SHIM = path.join(ROOT, 'node_modules/.eyes-test');

class FakeImg {
  constructor() { this.width = 1; this.height = 1; }
  addEventListener() {} removeEventListener() {}
  set src(_v) {} get src() { return ''; }
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => new FakeImg(), createElement: () => new FakeImg() };
}
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class { constructor(t, i = {}) { this.type = t; Object.assign(this, i); } };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  if (url.startsWith('file:')) return new Response(readFileSync(new URL(url)), { status: 200 });
  return realFetch(input, init);
};

let shipped = null;
async function shippedModel() {
  if (shipped) return shipped;
  let src = readFileSync(SRC, 'utf8');
  const globRe = /import\.meta\.glob\([^;]*?\);/;
  assert.equal((src.match(new RegExp(globRe.source, 'g')) || []).length, 1,
    'expected exactly one import.meta.glob in SlyModelDLRig.js');
  src = src.replace(globRe, '{};');
  assert.ok(src.includes('import.meta.url'), 'expected import.meta.url in SlyModelDLRig.js');
  src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));
  const relRe = /(\bfrom\s+')(\.\.?\/[^']+)(')/g;
  assert.ok(src.match(relRe), 'expected relative imports in SlyModelDLRig.js');
  src = src.replace(relRe, (_m, a, spec, c) =>
    a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + c);
  mkdirSync(SHIM, { recursive: true });
  const out = path.join(SHIM, `m${process.pid}.mjs`);
  writeFileSync(out, src);
  const mod = await import(pathToFileURL(out).href);
  const engine = { warn: () => {}, get: () => undefined, scene: null };
  const model = new mod.SlyModel(engine);
  await model.init();
  shipped = model;
  return shipped;
}
test.after(() => { try { rmSync(SHIM, { recursive: true, force: true }); } catch { /* best effort */ } });

let m3 = null;
async function model3() {
  if (m3) return m3;
  m3 = new SlyModel3({ get: () => null, warn: () => {}, scene: null });
  await m3.init();
  return m3;
}

/* ============================ the eyeball texture ============================ */

/** Minimal PNG reader — the asset is the evidence, so it is read rather than described. */
function readPNG(file) {
  const buf = readFileSync(file);
  let off = 8; const idat = []; let w = 0, h = 0, bd = 0, ct = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  assert.ok(ct === 6 || ct === 2, `sly_eyeball.png colour type ${ct} — this reader handles RGB/RGBA only`);
  assert.equal(bd, 8, 'sly_eyeball.png is not 8-bit');
  const chan = ct === 6 ? 4 : 3, bpp = chan, stride = w * chan;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++], line = raw.subarray(pos, pos + stride); pos += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, chan, stride, out };
}
const PNG = readPNG(EYE_PNG);
const texel = (x, y) => {
  const o = y * PNG.stride + x * PNG.chan;
  return [PNG.out[o], PNG.out[o + 1], PNG.out[o + 2]];
};
/** Amber iris body: saturated and not blown out. The pupil and its outline are the black. */
function classify(x, y) {
  const [r, g, b] = texel(x, y);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const s = (Math.max(r, g, b) - Math.min(r, g, b)) / (Math.max(r, g, b) || 1);
  if (L < 50) return 'black';
  if (s > 0.35 && L < 200) return 'amber';
  return L > 200 ? 'white' : 'other';
}
const isEyeInk = (u, v) => {
  const x = Math.min(PNG.w - 1, Math.max(0, Math.floor(u * PNG.w)));
  const y = Math.min(PNG.h - 1, Math.max(0, Math.floor((1 - v) * PNG.h)));
  const c = classify(x, y);
  return c === 'amber' || c === 'black';
};

/* ============================ shared geometry helpers ============================ */

const vkey = (p, i) => `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;

/** Weld a vertex range by position and return one representative index per unique position. */
function weld(pos, start, count, filter) {
  const seen = new Set(), out = [];
  for (let i = start; i < start + count; i++) {
    if (filter && !filter(i)) continue;
    const k = vkey(pos, i);
    if (seen.has(k)) continue;
    seen.add(k); out.push(i);
  }
  return out;
}

/** Triangles of a selection, with centroid, smoothed normal and area. Non-indexed or indexed. */
function trianglesOf(geo, keep, uvKeep) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  const idx = geo.index ? geo.index.array : null;
  const N = idx ? idx.length : pos.count;
  const out = [];
  for (let t = 0; t + 2 < N; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
    if (!keep(a) || !keep(b) || !keep(c)) continue;
    if (uvKeep) {
      let u = 0, v = 0;
      for (const k of [a, b, c]) { u += uv.getX(k); v += uv.getY(k); }
      if (!uvKeep(u / 3, v / 3)) continue;
    }
    const A = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
    const B = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
    const C = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
    const area = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).length() * 0.5;
    if (!(area > 0)) continue;
    const n = new THREE.Vector3();
    for (const k of [a, b, c]) n.add(new THREE.Vector3(nrm.getX(k), nrm.getY(k), nrm.getZ(k)));
    n.normalize();
    out.push({ c: A.clone().add(B).add(C).divideScalar(3), n, area });
  }
  return out;
}

/* ====================================================================================== */
/*  Q1 — what the shipped eye is made of                                                  */
/* ====================================================================================== */

test('shipped eye: two artist domes, every vertex of both weighted to `head`', async () => {
  const model = await shippedModel();
  const g = model.mesh.geometry;
  /* Build order is body, eyeball, head, tail (`partOf`), so group 1 is the eyeball submesh. */
  const gr = g.groups[1];
  assert.equal(gr.count, 2880, 'the eyeball submesh changed size — every number in this file is about the old one');
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;

  /* Every gram of eyeball weight is on `head`: the asset's own `LF_eyeball` / `RT_eyeball` are
     absent from BONE_MAP, so `resolve()` folds them into their nearest mapped ancestor,
     `base_head`. That is the whole of why a `pupilL` scale reaches nothing here. */
  const acc = new Map();
  let inspected = 0;
  for (let i = gr.start; i < gr.start + gr.count; i++) {
    for (let k = 0; k < 4; k++) {
      const w = sw.array[i * 4 + k];
      if (!(w > 0)) continue;
      inspected++;
      acc.set(RIG3.BONE_ORDER[si.array[i * 4 + k]], (acc.get(RIG3.BONE_ORDER[si.array[i * 4 + k]]) || 0) + w);
    }
  }
  assert.ok(inspected > 2000, `only ${inspected} influences inspected`);
  assert.deepEqual([...acc.keys()], ['head'], `the eyeball is no longer rigid to head: ${[...acc.keys()]}`);

  /* Two connected components, one per eye, 242 welded vertices each. */
  const verts = weld(pos, gr.start, gr.count);
  assert.equal(verts.length, 484);
  const L = verts.filter((i) => pos.getX(i) > 0).length;
  assert.equal(L, 242, `left eye has ${L} welded vertices, not 242`);
  assert.equal(verts.length - L, 242);
});

test('shipped eye: the pupil is PAINT on a uniformly unwrapped dome — there is nothing to re-skin', async () => {
  const model = await shippedModel();
  const g = model.mesh.geometry, gr = g.groups[1];
  const pos = g.attributes.position, uv = g.attributes.uv;

  /* The eye is drawn into a 64² texture: an amber iris ringed and cored in black, on white. */
  assert.equal(`${PNG.w}x${PNG.h}`, '64x64', 'sly_eyeball.png resolution changed');
  const count = { black: 0, amber: 0, white: 0, other: 0 };
  for (let y = 0; y < PNG.h; y++) for (let x = 0; x < PNG.w; x++) count[classify(x, y)]++;
  assert.ok(count.amber > 400, `only ${count.amber} amber texels — the iris is not in this texture`);
  assert.ok(count.black > 200, `only ${count.black} black texels — the pupil is not in this texture`);

  /* Both eyes share the whole UV square, and the vertices are spread across all of it — the
     unwrap knows nothing about where the iris was painted. Count how many land on it at all. */
  const eyeL = weld(pos, gr.start, gr.count, (i) => pos.getX(i) > 0);
  const onInk = eyeL.filter((i) => isEyeInk(uv.getX(i), uv.getY(i))).length;
  assert.ok(onInk > 0, 'no vertex samples the painted eye — the UV probe is broken, not the asset');
  /* 46 of 242. The painted iris is ~28 texels across of 64, so it covers ~19 % of the square and
     collects ~19 % of a uniformly spread vertex set: about SEVEN vertices across its diameter,
     none of them on its boundary. A bone scaling a UV-selected patch of that drags a ragged
     polygon of surface, not a concentric disc, and creases the dome at an arbitrary edge. */
  const across = 2 * Math.sqrt(onInk / Math.PI);
  assert.ok(onInk < 60, `${onInk} vertices on the painted eye — re-check whether a pupil loop now exists`);
  assert.ok(across < 9, `~${across.toFixed(1)} vertices across the iris`);

  /* The decisive quantity, and the bar on it is a physical identity rather than a choice.
   *
   * Constricting a painted disc by moving vertices means the vertices have to be able to FOLLOW
   * its painted edge. So compare the two resolutions directly: the length of the pupil's painted
   * boundary in texels, against the number of vertices anywhere on it. Below one vertex per texel
   * the geometry is coarser than the paint and cannot track the edge at all; the bar is therefore
   * 1, which is not a number anyone gets to tune.
   *
   * (The first draft of this test asserted a guessed "at most a couple of vertices on the painted
   * boundary". It read 4, and on the stricter 8-neighbour classification below, 9. Moving that bar
   * to 10 would have been fitting a threshold to a result — §218's rule, and in the direction that
   * saved the conclusion. It is replaced, not relaxed, and both raw counts are printed.) */
  const blackEdge = new Set();
  let blackInterior = 0;
  for (let y = 1; y < PNG.h - 1; y++) {
    for (let x = 1; x < PNG.w - 1; x++) {
      if (classify(x, y) !== 'black') continue;
      let solid = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (classify(x + dx, y + dy) !== 'black') solid = false;
      if (solid) blackInterior++; else blackEdge.add(`${x},${y}`);
    }
  }
  assert.ok(blackEdge.size > 100, `only ${blackEdge.size} boundary texels on the painted pupil — the probe is not reading the art`);
  const texelOf = (i) => `${Math.min(PNG.w - 1, Math.max(0, Math.floor(uv.getX(i) * PNG.w)))},`
    + `${Math.min(PNG.h - 1, Math.max(0, Math.floor((1 - uv.getY(i)) * PNG.h)))}`;
  const onEdge = eyeL.filter((i) => blackEdge.has(texelOf(i))).length;
  const texelsPerVertex = blackEdge.size / Math.max(1, onEdge);
  const read = `painted pupil: ${blackInterior} interior + ${blackEdge.size} boundary texels; `
    + `vertices on the boundary ${onEdge}, on the iris ${onInk} of ${eyeL.length}, `
    + `~${across.toFixed(1)} across; ${texelsPerVertex.toFixed(1)} boundary texels per vertex`;
  assert.ok(texelsPerVertex > 1,
    `the mesh now samples the pupil's painted boundary at or above texture resolution — a vertex `
    + `deformation could follow the painted edge, so §211.3 is re-openable. ${read}`);
  /* Recorded: 302 boundary texels against 9 vertices — 33.6 texels per vertex, i.e. the geometry
     is thirty-three times coarser than the paint it would have to move. */
});

test('CALIBRATION: the same probe on SlyModel3, whose pupil IS geometry, separates the two cases', async () => {
  /* The test above says "there is nothing to re-skin". An assertion nobody has watched succeed on
     the opposite case is an assertion of unknown strength (§211.1). SlyModel3 builds its pupil as
     its own `blob()`, so the same question — "does the pupil have vertices of its own?" — must
     come back with a completely different answer on the same probe. */
  const m = await model3();
  assert.ok(Array.isArray(m.eyeRanges) && m.eyeRanges.length === 6,
    'SlyModel3 stopped publishing eyeRanges — this control cannot run');
  const pupils = m.eyeRanges.filter((r) => r.part === 'pupil');
  assert.equal(pupils.length, 2);
  for (const p of pupils) {
    const n = p.v1 - p.v0;
    assert.equal(n, 30, `SlyModel3's pupil blob is ${n} vertices, not 30`);
  }
  /* 30 vertices that are 100 % pupil and nothing else, against the shipped mesh's ~0 vertices
     that are pupil at all. That is the difference between "re-weight the pupil to a bone" being
     a two-line change and being impossible. */
  const geo = m.mesh.geometry, col = geo.attributes.color;
  const black = new THREE.Color(0x141414);
  for (const p of pupils) {
    let match = 0;
    for (let i = p.v0; i < p.v1; i++) {
      if (Math.abs(col.getX(i) - black.r) < 0.002 && Math.abs(col.getY(i) - black.g) < 0.002
        && Math.abs(col.getZ(i) - black.b) < 0.002) match++;
    }
    assert.equal(match, p.v1 - p.v0, 'a tagged pupil range is not the pupil colour');
  }
});

test('shipped eye: the head carries a socket, so the one bone the asset offers drives the wrong feature', async () => {
  /* The tempting one-line "fix": map `LF_eyeball` / `RT_eyeball` to `pupilL` / `pupilR` in
     BONE_MAP. The asset really does give each eye its own bone carrying 100 % of that eye. But
     that bone owns the WHOLE eyeball, sclera included, and the head mesh does not close behind
     it — so at the authored 0.35 it does not constrict a pupil, it opens a socket. */
  const model = await shippedModel();
  const g = model.mesh.geometry, eye = g.groups[1], head = g.groups[2];
  const pos = g.attributes.position, nrm = g.attributes.normal;

  const eyeL = weld(pos, eye.start, eye.count, (i) => pos.getX(i) > 0);
  const cen = new THREE.Vector3();
  for (const i of eyeL) cen.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  cen.divideScalar(eyeL.length);
  const outward = new THREE.Vector3();
  for (const i of eyeL) outward.add(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
  outward.normalize();

  const headV = weld(pos, head.start, head.count)
    .map((i) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
    .filter((v) => v.distanceTo(cen) < 0.15);
  assert.ok(headV.length > 300, `only ${headV.length} head vertices near the eye — probe radius is wrong`);

  const angle = (v) => THREE.MathUtils.radToDeg(Math.acos(
    THREE.MathUtils.clamp(v.clone().sub(cen).normalize().dot(outward), -1, 1)));
  const headInFront = headV.filter((v) => angle(v) < 40).length;
  const eyeInFront = eyeL.filter((i) => angle(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))) < 40).length;
  assert.equal(headInFront, 0,
    `${headInFront} head vertices sit in front of the eye — the socket has closed and this argument needs redoing`);
  assert.ok(eyeInFront > 10, `only ${eyeInFront} eyeball vertices in the socket aperture`);

  /* The size of the hole the eyeball is plugging, and therefore of the hole a 0.35 scale opens. */
  const ext = (ax) => {
    let lo = Infinity, hi = -Infinity;
    for (const i of eyeL) {
      const d = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(cen).dot(ax);
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return hi - lo;
  };
  const wide = ext(new THREE.Vector3(1, 0, 0)), tall = ext(new THREE.Vector3(0, 1, 0));
  assert.ok(wide > 0.07 && tall > 0.11,
    `eyeball ${(wide * 1000).toFixed(0)} x ${(tall * 1000).toFixed(0)} mm — the socket figures below assume the old size`);
});

/* ====================================================================================== */
/*  Q1 — the decision                                                                     */
/* ====================================================================================== */

test('RIG3 must NOT grow pupilL / pupilR, and this is the reason', () => {
  /* THE RESOLUTION OF §211.3, asserted so that the wrong fix cannot land quietly.
   *
   * `RIG3` is the SHIPPED skeleton. Adding `pupilL`/`pupilR` to it would make
   * `PoseBuffer.addScale` find the names, so `hurt`/`ko`'s two tracks would stop being orphans
   * — and on `SlyModelDLRig` they would move exactly zero pixels, because (see the three tests
   * above) no vertex of the shipped mesh can be weighted to them. The tracks would go from
   * LOUD and dead to SILENT and dead, and `tests/rig.test.mjs`'s exact-orphan assertion — the
   * only artefact in this tree that knows the feature is broken on the path that ships — would
   * go green while nothing changed on screen.
   *
   * That is §213's failure mode reproduced on purpose: a guard converting a defect into a
   * permanent silent pass on a subject that renders perfectly plausibly. So the tracks are
   * retired from `Clips.js` instead, and this assertion stands guard over the alternative.
   *
   * To reverse this decision you need a shipped mesh whose pupil has vertices of its own. The
   * three tests above are what would have to change first. */
  for (const n of ['pupilL', 'pupilR']) {
    assert.ok(!RIG3.BONE_ORDER.includes(n),
      `RIG3 grew a "${n}" bone. On the shipped mesh it carries no skin weight, so this silences `
      + 'the §211.3 orphan assertion without reviving the feature. Read this test before proceeding.');
  }
  /* And the shipped skeleton is still the one described above. */
  assert.equal(RIG3.BONE_ORDER.length, 31);
});

/* ====================================================================================== */
/*  Q2 — §2198's split-lit pair, measured on the cel ramp                                 */
/* ====================================================================================== */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / ((b - a) || 1e-6)); return t * t * (3 - 2 * t); };
/** `slyRamp` with the shipped constants: 0 / 0.5 / 1 across two smoothstepped terminators. */
const ramp = (nl) => (sstep(RAMP.termLo - RAMP.termSoft, RAMP.termLo + RAMP.termSoft, nl)
  + sstep(RAMP.termHi - RAMP.termSoft, RAMP.termHi + RAMP.termSoft, nl)) / (RAMP.bands - 1);

/**
 * One eye's mean cel band, weighted by PROJECTED area from the shot's own camera.
 *
 * Projected area is the only weighting that answers the question §2198 asks — "does one eye read
 * brighter than the other" is about screen pixels, and `area · (n·view)` is screen area. A plain
 * surface average is not merely coarser, it is blind on some eyes: SlyModel3's eye is three
 * CLOSED concentric ellipsoids, so each eye presents the entire unit sphere of normals and the
 * mirror maps that distribution onto itself — L and R come out bit-identical at every sun angle
 * and every yaw. Measured, before this weighting was adopted: |Δband| = 0.0000 across all 16
 * shots and all 72 yaws. That is a instrument reporting zero because it cannot see, and it is
 * the reason the SlyModel3 arm at the bottom of this file is recorded as VOID rather than as a
 * clean result.
 *
 * Poses are bind poses. A clip that turns the head changes these numbers, which is exactly what
 * the yaw sweep generalises over: the key is directional, so a head yaw and a body yaw are the
 * same variable here (§210.3 swept 72 head yaws for the same reason).
 */
function pairBand(L, R, yaw, origin, cam, light) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const n = new THREE.Vector3(), p = new THREE.Vector3(), view = new THREE.Vector3();
  const band = [], seen = [];
  for (const tris of [L, R]) {
    let A = 0, s = 0;
    for (const t of tris) {
      n.copy(t.n).applyQuaternion(q);
      p.copy(t.c).applyQuaternion(q).add(origin);
      view.subVectors(cam, p).normalize();
      const f = n.dot(view);
      if (f <= 0) continue;                                  // back-facing: not on screen
      const w = t.area * f;
      A += w; s += ramp(Math.max(0, n.dot(light))) * w;
    }
    band.push(A > 0 ? s / A : 0); seen.push(A);
  }
  return { L: band[0], R: band[1], d: Math.abs(band[0] - band[1]), aL: seen[0], aR: seen[1] };
}

/** Collapse a set to a single lens normal — §2198's own geometry, rebuilt from this asset. */
function flatten(tris) {
  const m = new THREE.Vector3();
  for (const t of tris) m.addScaledVector(t.n, t.area);
  if (m.lengthSq() < 1e-12) return null;      // a closed surface has no mean normal; see VOID below
  m.normalize();
  return tris.map((t) => ({ c: t.c, n: m.clone(), area: t.area }));
}

async function shippedIris() {
  const model = await shippedModel();
  const g = model.mesh.geometry, gr = g.groups[1], pos = g.attributes.position;
  const inEye = (i) => i >= gr.start && i < gr.start + gr.count;
  return {
    L: trianglesOf(g, (i) => inEye(i) && pos.getX(i) > 0, isEyeInk),
    R: trianglesOf(g, (i) => inEye(i) && pos.getX(i) < 0, isEyeInk),
  };
}

const ATMO = createAtmosphereState();
const shotList = SHOT_NAMES.filter((n) => SHOTS[n].player);

/**
 * The worst shipped shot, pinned EXACTLY rather than as a ceiling.
 *
 * `tests/shading.test.mjs`'s `KNOWN_NEAR_TERMINATOR` established the pattern and the reason: an
 * upper bound quietly absorbs drift, and every number here is a function of the eye normals, the
 * two terminators, `termSoft`, each shot's tod and each shot's player yaw. If any of those move,
 * this must be re-read, not re-fitted. The value is the measurement, not a target.
 */
const WORST_SHOT = { name: 'sly-profile', d: 0.3741 };

test('ramp: §2198 pair — the constants and staging these numbers are a function of', () => {
  assert.equal(RAMP.bands, 3);
  assert.equal(RAMP.termLo, 0.14);
  assert.equal(RAMP.termHi, 0.52);
  assert.equal(RAMP.termSoft, 0.024);
  assert.ok(shotList.length >= 16, `only ${shotList.length} shots stage a player`);
  assert.equal(SHOTS['sly-profile'].tod, 0.80);
  assert.equal(SHOTS['sly-profile'].player.yaw, 5.24);
});

test('§2198 on the SHIPPED character: the pair splits, worst at `sly-profile`', async () => {
  const { L, R } = await shippedIris();
  assert.ok(L.length > 50 && R.length > 50, `iris triangles L ${L.length} R ${R.length} — the UV selection is empty`);

  const rows = [];
  for (const name of shotList) {
    const s = SHOTS[name];
    const at = evalAtmosphere(s.tod, ATMO);
    const r = pairBand(L, R, s.player.yaw, new THREE.Vector3(...s.player.pos), new THREE.Vector3(...s.pos), at.keyDir);
    rows.push({ name, ...r, vis: Math.min(r.aL, r.aR) / (Math.max(r.aL, r.aR) || 1) });
  }
  const report = rows.map((r) => `  ${r.name.padEnd(13)} band ${r.L.toFixed(4)} / ${r.R.toFixed(4)}`
    + `  |Δ| ${r.d.toFixed(4)}  both-eyes-visible ${r.vis.toFixed(2)}`).join('\n');

  /* No shot is scored on a sliver: the far eye is never less than half the near one on screen,
     so none of these differences is an artefact of one eye being edge-on. */
  const thin = rows.filter((r) => r.vis < 0.5).map((r) => r.name);
  assert.deepEqual(thin, [], `an eye went nearly edge-on, so its band average is not a read:\n${report}`);

  const worst = rows.reduce((a, b) => (b.d > a.d ? b : a));
  assert.equal(worst.name, WORST_SHOT.name, `the worst-split shot moved:\n${report}`);
  assert.ok(Math.abs(worst.d - WORST_SHOT.d) < 0.02,
    `${worst.name} splits ${worst.d.toFixed(4)}, recorded ${WORST_SHOT.d}:\n${report}`);

  /* The legacy failure is a FULL band step — 0.5 here, "exactly twice the key light". The
     shipped pair reaches 75 % of that at `sly-profile` (0.4408 against 0.0667) and never the
     whole of it, because the FBX eye is a 50 mm-deep dome rather than the flattened lens
     §2198 measured: the terminator crosses each iris instead of running between the pair.
     Registered, NOT fixed here — the fix is a shading-normal bias on the shipped character's
     eyes, which moves shipped pixels and therefore wants the sealed A/B §213 got, not a
     drive-by from a test file. */
  for (const r of rows) {
    assert.ok(r.d < 0.5, `${r.name} has the two eyes a full band apart — §2198 in full:\n${report}`);
  }
});

test('§2198 on the SHIPPED character: 72-yaw sweep, and the three calibration arms', async () => {
  const { L, R } = await shippedIris();
  const sc = SHOTS['sly-closeup'];
  const at = evalAtmosphere(0.80, ATMO);
  const el = at.sunElevation * Math.PI / 180;
  const origin = new THREE.Vector3(...sc.player.pos);
  const rel = new THREE.Vector3(...sc.pos).sub(origin);      // camera bearing, held relative
  const flatL = flatten(L), flatR = flatten(R);
  assert.ok(flatL && flatR, 'the shipped iris has no mean normal — it is not an open cap');

  let sweep = 0, armA = 0, armB = 0, armC = 0;
  for (let k = 0; k < 72; k++) {
    const d = k * 5 * Math.PI / 180, yaw = sc.player.yaw + d;
    const cam = rel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), d).add(origin);
    sweep = Math.max(sweep, pairBand(L, R, yaw, origin, cam, at.keyDir).d);
    /* ARM A — the key placed dead on the character's facing. Mirror symmetry says the pair
       cannot split, so this is the null: it reads what the instrument reports when there is
       nothing to report. */
    const on = new THREE.Vector3(Math.cos(el) * Math.sin(yaw), Math.sin(el), Math.cos(el) * Math.cos(yaw));
    armA = Math.max(armA, pairBand(L, R, yaw, origin, cam, on).d);
    /* ARM B — the key at 90° to the facing, the worst case an off-axis sun can produce. */
    const a2 = yaw + Math.PI / 2;
    const side = new THREE.Vector3(Math.cos(el) * Math.sin(a2), Math.sin(el), Math.cos(el) * Math.cos(a2));
    armB = Math.max(armB, pairBand(L, R, yaw, origin, cam, side).d);
    /* ARM C — each eye collapsed to a single lens normal. This is not a hypothetical: it is
       §2198's geometry, rebuilt out of this asset. If the instrument is live it must reproduce
       the legacy failure exactly — a full band step — when handed the legacy configuration. */
    armC = Math.max(armC, pairBand(flatL, flatR, yaw, origin, cam, at.keyDir).d);
  }

  const read = `sweep ${sweep.toFixed(4)} · ARM A ${armA.toFixed(4)} · ARM B ${armB.toFixed(4)} · ARM C ${armC.toFixed(4)}`;
  assert.ok(armA < 0.02, `ARM A (null) reads ${armA.toFixed(4)} — the instrument sees a split where symmetry forbids one. ${read}`);
  assert.ok(armB > armA * 5, `ARM B moved ${armB.toFixed(4)} against a null of ${armA.toFixed(4)} — the lever is dead. ${read}`);
  assert.ok(armC > 0.45, `ARM C reads ${armC.toFixed(4)}: handed §2198's own flat-lens geometry the instrument `
    + `does not reproduce §2198's full band step, so it cannot be trusted to have found its absence. ${read}`);
  /* Recorded: 0.2512 on the sweep against a 0.0000 null and a 0.5000 reconstruction. */
  assert.ok(sweep > 0.15 && sweep < 0.35, `72-yaw sweep max |Δband| ${sweep.toFixed(4)}, recorded 0.2512. ${read}`);
});

test('VOID: this instrument cannot answer §2198 on SlyModel3, and here is the arm that says so', async () => {
  /* §2198 flags SlyModel3 as a candidate for the same defect — zero `biasNormals` calls, eyes
     built as mirrored blobs. Run, it reports |Δband| ≤ 0.0062 at every shot and every yaw, which
     reads like a clean bill of health. It is not one.
     SlyModel3's eye is three CLOSED concentric ellipsoids per side. A closed surface has no mean
     normal, so ARM C — the arm that must produce the biggest split any geometry can — cannot
     even be built, and the projected-area average over a full sphere is very nearly invariant to
     both orientation and mirroring. Null 0.0038, lever 0.0061: the arm that must move moves by
     1.6× the noise. Four runs were voided this session for exactly this (§218), so this one is
     voided here rather than quoted, and the test asserts the BLINDNESS so nobody later cites the
     0.006 as evidence. Answering the question on `?char=model3` needs a different instrument. */
  const m = await model3();
  const geo = m.mesh.geometry;
  const pick = (side) => {
    const s = new Set();
    for (const r of m.eyeRanges) if (r.side === side && r.part !== 'sclera') for (let i = r.v0; i < r.v1; i++) s.add(i);
    return trianglesOf(geo, (i) => s.has(i));
  };
  const L = pick(1), R = pick(-1);
  assert.ok(L.length > 50 && R.length > 50, `model3 iris triangles L ${L.length} R ${R.length}`);
  const mean = new THREE.Vector3();
  for (const t of L) mean.addScaledVector(t.n, t.area);
  const total = L.reduce((s, t) => s + t.area, 0);
  assert.ok(mean.length() / total < 0.05,
    `SlyModel3's eye now has a mean normal (${(mean.length() / total).toFixed(3)} of its area) — it is no `
    + 'longer a closed ball, so ARM C is buildable and this VOID should be replaced by a real measurement');
});
