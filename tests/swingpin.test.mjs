import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE, SWING_PINNED } from '../src/player/Controller.js';
import { SURF_GAIT } from '../src/player/Moveset.js';

/**
 * §723A — "have the whole character pivot about the top point so that the cane stays attached
 * to the ring during the swinging while the feet swing."
 *
 * What ships: during `hookSwing` the DRAWN hierarchy is re-anchored per frame — pose first,
 * then the cane `hookPoint` read out of the posed hierarchy, then the root rotated by the
 * pendulum angle about that point and translated so it lands on the ring (`Controller.
 * _swingDraw`). The capsule's pendulum, the `CaneSwing` clip, its binding and the donor cane
 * track are all untouched. This file measures the claim on the REAL stack: the shipped
 * `SlyModelDLRig` (loaded the way `dlrig.test.mjs` loads it), the real `Animation` bound to it,
 * the real `Controller` on the real level, the sample FLOWN into courtyard ring 3 with the
 * stick held (`magreach`'s §435.4 pattern — never teleported into the state).
 *
 * ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────────
 * passes on : the shipped default — at full pin weight the crook seat sits on the ring's point
 *             to numerical zero across a driven arc of ≥ 25°, and the release pays the offset
 *             off in equal steps with no drawn-root step beyond what flight velocity explains.
 * fails  on : RUN IN A CHILD — `?swing=loose` (the revert) on the same drive, where the same
 *             instrument must reproduce the detachment the owner reported: the crook a metre
 *             and more off the ring, swinging with the body (mean 1.66 m measured). A second
 *             child sets BOTH tokens (`?swing=loose&surf=apex`) and must land on the same loose
 *             numbers — §723's two arms revert independently or a failure cannot be attributed.
 * does NOT  : judge the PIXELS (shots/swing723 and the §723 section carry the frames, camDot-
 * discrim.    checked, clip asserted at the shutter), the camera's containment, or grips —
 *             `gripgap` stays report-only.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/player/SlyModelDLRig.js');
const SHIM = path.join(ROOT, 'node_modules/.swingpin-test');

/* ---- the same three transport shims dlrig.test.mjs documents, so the SHIPPED character loads
   offline: a canvas-less Image, a file: fetch, and ProgressEvent. ---- */
class FakeImg { constructor() { this.width = 1; this.height = 1; } addEventListener() {} removeEventListener() {} set src(_v) {} get src() { return ''; } }
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

async function loadDLRig() {
  let src = readFileSync(SRC, 'utf8');
  src = src.replace(/import\.meta\.glob\([^;]*?\);/, '{};');
  src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));
  src = src.replace(/(\bfrom\s+')(\.\.?\/[^']+)(')/g, (_m, a, spec, cq) =>
    a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + cq);
  mkdirSync(SHIM, { recursive: true });
  const out = path.join(SHIM, `m${process.pid}.mjs`);
  writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

/**
 * Fly the sample into `hook-main-3` (§720's own leg), swing 2.2 s under a held stick, release
 * with jump, and measure — AFTER the pose, in the manifest's own order (animation before
 * movement) — the crook seat's distance to the ring and the drawn root's step per frame.
 */
async function drive() {
  const { engine, c } = await realWorld();
  const { Animation } = await import('../src/player/Animation.js');
  const mod = await loadDLRig();
  const charEngine = { warn() {}, get: () => undefined, scene: null };
  const model = new mod.SlyModel(charEngine);
  await model.init();
  assert.ok(model.cane?.hookPoint && model.cane?.object, 'the shipped character built without a cane — nothing to pin');
  const animEngine = { warn() {}, emit() {}, on() { return () => {}; }, get: (k) => (k === 'character' ? model : null) };
  const a = new Animation(animEngine);
  c.character = model;
  c.anim = a;

  const hp = new THREE.Vector3();
  const prevRoot = new THREE.Vector3();
  const hash = createHash('sha256');
  const rows = [];
  let t = 0, frame = 0;
  const step = (script) => {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script?.(engine.input);
    a.update(DT, t);
    engine.time = t; c.update(DT, t);
    t += DT; frame++;
    model.root.updateMatrixWorld(true);
    hp.copy(model.cane.hookPoint); model.cane.object.localToWorld(hp);
    const rootStep = frame > 1 ? model.root.position.distanceTo(prevRoot) : 0;
    prevRoot.copy(model.root.position);
    /* pendulum deviation from vertical, off the capsule the state integrates */
    const d = c.position.distanceTo(c.anchor) || 1;
    const dev = Math.acos(Math.max(-1, Math.min(1, (c.anchor.y - c.position.y) / d))) * 180 / Math.PI;
    rows.push({ f: frame, st: c.stateName, w: c._swingW ?? 0, c2r: hp.distanceTo(c.anchor), rootStep, dev });
    hash.update(Buffer.from(Float64Array.from([c.position.x, c.position.y, c.position.z]).buffer));
  };

  hardReset(engine, c, new THREE.Vector3(4.2, 12.4, 1.2), 0);
  c.position.set(4.2, 13.2, 1.6); c.velocity.set(0, 1.0, 5.5); c.grounded = false;
  c.sm.set('fall');
  let caught = -1;
  for (let i = 0; i < 40 && caught < 0; i++) {
    step((inp) => { inp.move.y = 1; engine.camera.rotation.set(0, Math.PI, 0, 'YXZ'); engine.camera.updateMatrixWorld(true); });
    if (c.stateName === 'hookSwing') caught = frame;
  }
  assert.ok(caught > 0, 'the sample never caught the ring — the drive is broken, not the pin');
  for (let i = 0; i < 132; i++) {
    step((inp) => { inp.move.y = 1; engine.camera.rotation.set(0, Math.PI, 0, 'YXZ'); engine.camera.updateMatrixWorld(true); });
  }
  const releaseAt = frame + 1;
  step((inp) => { inp.hold('jump'); });
  for (let i = 0; i < 40; i++) step();

  const pinned = rows.filter((r) => r.st === 'hookSwing' && r.w >= 1);
  const allSwing = rows.filter((r) => r.st === 'hookSwing');
  const post = rows.filter((r) => r.f >= releaseAt && r.f < releaseAt + 16);
  const ws = post.map((r) => r.w);
  return {
    caught,
    fullFrames: pinned.length,
    pinMax: pinned.length ? Math.max(...pinned.map((r) => r.c2r)) : null,
    swingMean: allSwing.reduce((x, r) => x + r.c2r, 0) / Math.max(1, allSwing.length),
    swingMax: allSwing.length ? Math.max(...allSwing.map((r) => r.c2r)) : null,
    devSpan: allSwing.length ? Math.max(...allSwing.map((r) => r.dev)) - Math.min(...allSwing.map((r) => r.dev)) : 0,
    releaseMaxStep: Math.max(...post.map((r) => r.rootStep)),
    wMonotone: ws.every((w, i) => i === 0 || w <= ws[i - 1] + 1e-9),
    wEnd: ws[ws.length - 1],
    posSha: hash.digest('hex'),
  };
}

/* ── CHILD MODE — the revert arms run this same driver under their tokens (§720.5's shape). ── */
if (process.env.SWING_CHILD) {
  const want = JSON.parse(process.env.SWING_CHILD);
  assert.equal(globalThis.__SWING_AB, want.swing ?? undefined,
    'child ran without the swing token set before import');
  const out = await drive();
  out.SWING_PINNED = SWING_PINNED;
  out.SURF_GAIT = SURF_GAIT;
  process.stdout.write(`\n__SWING_RESULT__${JSON.stringify(out)}\n`);
  process.exit(0);
}

test.after(() => { try { rmSync(SHIM, { recursive: true, force: true }); } catch { /* best effort */ } });

test('§723A swing pin: the crook sits on the ring to numerical zero across a real arc, and the release pays off in equal steps', async () => {
  assert.ok(SWING_PINNED, 'the default regime is not pinned — the section shipped the wrong default');
  const r = await drive();
  assert.ok(r.fullFrames > 60, `only ${r.fullFrames} full-weight swing frames — the drive did not swing`);
  assert.ok(r.pinMax < 0.02,
    `crook seat ${(r.pinMax * 100).toFixed(1)} cm off the ring at full pin weight — the transform is not pinning`);
  assert.ok(r.devSpan > 25,
    `the pendulum only swept ${r.devSpan.toFixed(1)}° — attachment was measured on a hang, not a swing`);
  /* The release bound is measured, not aspirational: the honest flight step at this drive's
     arrival speed is 0.52 m/frame (|v|·dt near maxFall), identical in the loose arm, and the
     pin's own ramp-out contributes ≤ 0.13 m/frame on top of a body already moving. A hard cut
     — the frozen offset paid in one frame — would read ≥ 1 m here. */
  assert.ok(r.releaseMaxStep < 0.7,
    `drawn root stepped ${r.releaseMaxStep.toFixed(3)} m in one frame after the release — the pin is snapping off`);
  assert.ok(r.wMonotone && r.wEnd === 0,
    'the pin weight did not decay monotonically to zero after the release');
  console.log(`[§723A] caught f${r.caught}; pin max ${(r.pinMax * 100).toFixed(2)} cm over ${r.fullFrames} frames; `
    + `arc span ${r.devSpan.toFixed(1)}°; release max step ${r.releaseMaxStep.toFixed(3)} m; swing mean ${r.swingMean.toFixed(3)} m`);
});

test('§723A token: `?swing=loose` reproduces the detachment, is independent of `?surf`, and the capsule is byte-identical across arms', async () => {
  const { execFileSync } = await import('node:child_process');
  const url = new URL(import.meta.url);
  const run = (tokens) => {
    const pre = Object.entries(tokens)
      .map(([k, v]) => `globalThis.${k === 'swing' ? '__SWING_AB' : '__SURF_AB'} = ${JSON.stringify(v)};`).join('\n');
    const src = `${pre}\nawait import(${JSON.stringify(url.href)});\n`;
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', src],
      { env: { ...process.env, SWING_CHILD: JSON.stringify(tokens) }, encoding: 'utf8', maxBuffer: 32 << 20 });
    const m = /__SWING_RESULT__(\{.*\})/.exec(raw);
    assert.ok(m, `the child ${JSON.stringify(tokens)} produced no result line`);
    return JSON.parse(m[1]);
  };

  const def = await drive();                       // the default arm, in this process
  const loose = run({ swing: 'loose' });
  const both = run({ swing: 'loose', surf: 'apex' });

  /* FAIL INPUT — the revert must reproduce the DEFECT the owner reported: the crook rides the
     body around the arc, a metre and more off the ring (headless measure 1.66 m mean). */
  assert.equal(loose.SWING_PINNED, false);
  assert.equal(loose.fullFrames, 0, 'the loose arm still reached full pin weight — the token is not reverting');
  assert.ok(loose.swingMean > 1.0,
    `?swing=loose measured the crook only ${loose.swingMean.toFixed(2)} m off the ring on average — the shipped detachment did not reproduce`);
  assert.ok(loose.swingMax > 2.0,
    `?swing=loose crook max ${loose.swingMax?.toFixed(2)} m — the arc's far extreme is missing from the fail arm`);

  /* INDEPENDENCE — §723's two arms share test surfaces; an entangled revert cannot be
     attributed. Both tokens together must land on the same loose swing numbers, with arm B's
     own constant reading reverted in the same process. */
  assert.equal(both.SURF_GAIT, false, 'the surf token did not reach the combined child');
  assert.equal(both.SWING_PINNED, false);
  assert.ok(Math.abs(both.swingMean - loose.swingMean) < 1e-9 && both.fullFrames === 0,
    `?surf=apex changed the swing measure (${both.swingMean} vs ${loose.swingMean}) — the arms are entangled`);

  /* DRAWN ONLY, asserted rather than promised: the same drive in every arm must put the CAPSULE
     in exactly the same place on every frame. */
  assert.equal(def.posSha, loose.posSha, 'the capsule trace differs between ?swing arms — the pin leaked into the simulation');
  assert.equal(def.posSha, both.posSha, 'the capsule trace differs under the combined tokens');

  console.log(`[§723A token] default pin ${(def.pinMax * 100).toFixed(2)} cm · ?swing=loose crook mean ${loose.swingMean.toFixed(2)} m `
    + `max ${loose.swingMax.toFixed(2)} m · both-tokens identical ${both.swingMean === loose.swingMean} · capsule sha equal ${def.posSha === loose.posSha}`);
});
