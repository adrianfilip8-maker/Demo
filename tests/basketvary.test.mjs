/**
 * basketvary.test.mjs — pins PREREG-basketvary's shipped seal (a).
 *
 * The complaint was a set-dressing clone: eight `ropeCoil` placements, ONE silhouette, seven of
 * them inside the `courtyard` frustum (critic r12: "the same coil basket appears three times in
 * one frame" / "the seventh appearance ... reads as set-dressing autopilot").
 *
 * These assertions are the bars, re-derived from the shipped source the same way the sealed
 * scorer derives them — by wrapping `Props._push`, which every prop passes through in world
 * space before the per-material merge erases prop identity. No boot, no lock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { Props } from '../src/world/Props.js';
import { Architecture } from '../src/world/Architecture.js';

const PIECES = [];
const REG = [];
const orig = Props.prototype._push;
Props.prototype._push = function (key, geo) {
  if (geo?.attributes?.position) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    PIECES.push({ key, min: bb.min.clone(), max: bb.max.clone(), tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 });
  }
  return orig.call(this, key, geo);
};
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: () => {}, get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  registerCollider: (m, o) => REG.push(o?.tag ?? null),
};
const A = new Architecture(engine); await A.init();
const P = new Props(engine); await P.init();

const coils = PIECES.filter((p) => p.key === 'rope' && p.max.y < 1.2);
const S10 = (v) => Math.round(v / 0.10);
const sig = (p) => `${S10(p.max.x - p.min.x)}x${S10(p.max.y - p.min.y)}x${S10(p.max.z - p.min.z)}`;

test('A3: the courtyard rope coils are authored, and there are no more of them than before', () => {
  assert.equal(coils.length, 6, 'six authored coils replaced eight scattered ones');
});

test('A2b: every coil is its own silhouette — the clone family is gone', () => {
  const sigs = new Set(coils.map(sig));
  assert.equal(sigs.size, coils.length, `expected ${coils.length} distinct silhouettes, got ${sigs.size}: ${[...sigs]}`);
  assert.ok(sigs.size >= 5, 'PREREG-basketvary A2b: >= 5 distinct silhouettes');
});

test('A2: the coils vary in size, not just in yaw (bbox-diagonal CV >= 0.12)', () => {
  const d = coils.map((p) => Math.hypot(p.max.x - p.min.x, p.max.y - p.min.y, p.max.z - p.min.z));
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const cv = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length) / mean;
  assert.ok(cv >= 0.12, `CV ${cv.toFixed(4)} < 0.12 (HEAD before this seal measured 0.0025)`);
});

test('A1: no registered camera sees two coils of the same silhouette', () => {
  const box = new THREE.Box3();
  for (const [name, s] of Object.entries(SHOTS)) {
    const cam = new THREE.PerspectiveCamera(s.fov, 1280 / 720, 0.1, 600);
    cam.position.fromArray(s.pos);
    cam.lookAt(new THREE.Vector3().fromArray(s.target));
    if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const f = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const seen = new Map();
    for (const p of coils) if (f.intersectsBox(box.set(p.min, p.max))) seen.set(sig(p), (seen.get(sig(p)) || 0) + 1);
    const worst = Math.max(0, ...seen.values());
    assert.ok(worst <= 2, `${name} sees ${worst} identical coils (bar <= 2; HEAD before this seal: courtyard 7, dunes 8)`);
  }
});

test('P-A1: a rope coil is set dress and carries no gameplay volume', () => {
  /* The registration totals are the pin. If a later change gives a coil a collider, a hazard or
     a contact decal, this is where it surfaces rather than in a frame nobody diffs. */
  assert.equal(REG.length, 272, 'collider registrations unchanged by this seal');
  assert.equal(P.stats.decals, 46, 'contact decals unchanged by this seal');
  assert.equal(P._fx.length, 24, 'fx emitters unchanged');
  assert.equal(P._lights.length, 24, 'lights unchanged');
});

test('P-A2: the seal is triangle-negative', () => {
  const tris = PIECES.reduce((s, p) => s + p.tris, 0);
  assert.ok(tris <= 76288, `prop triangles ${tris} > the 76288 measured before this seal`);
});
