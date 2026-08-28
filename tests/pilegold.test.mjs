/**
 * pilegold.test.mjs — §724: "For the gold pile asset, apply a gold coloring to it."
 *
 * What §724 shipped, pinned here:
 *
 *   1. The treasure pile's UV windows SCATTER across `gold_leaf`'s tile instead of all 149
 *      items sampling the same ~1.6% origin-corner patch (the below-median seam window
 *      `tools/pilepatch.mjs` measured at albedo L 104 against the tile's 134). The sampling
 *      SCALE does not move — windows translate, they do not stretch — so §712.3's refused
 *      one-tile-per-face regression cannot come back through this door.
 *   2. The pile's `COLOR_0` carries the exact linear inverse of `MATERIALS.gold.color`, so
 *      `color x map x vColor = map`: the hoard wears the texture's own authored gold once,
 *      not gold-times-gold. Every OTHER vertex in the merged `props_gold` mesh is EXACT
 *      white — a multiply by one (§719.5 measured that identity for this mechanism).
 *   3. `?pile=faded` (globalThis.__PILE_AB from a test) restores the pre-§724 state: windows
 *      back on the corner, `COLOR_0` all white — and the attribute stays BOUND, because the
 *      material keeps `vertexColors` and an unbound attribute multiplies to black (§719).
 *   4. `Pickups._coinMat` asks the SHADING factory for the badge variant through the option
 *      bag instead of mutating the factory's cached answer. The mutation was invisible to
 *      `pickups` C4 — in plain Node the factory is absent and every `_mat` call is fresh —
 *      and in the browser it put the badge, at white, on all four treasures (measured live,
 *      `tools/pileshot.mjs` at `defcf63`: `{shares:true, badge:true, color:#ffffff}` x4).
 *      G4 runs the separation question under a factory that CACHES like the browser's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { PILE_FADED, PILE_UNTINT } from '../src/world/Props.js';
import { Pickups } from '../src/world/Pickups.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* The pile's authored footprint — the same selection `tools/pilepatch.mjs` and
 * `tools/pileshot.mjs` use: `_treasurePile(L.vault.x + 2.9, L.vault.y, L.vault.z + 1.2)`,
 * coins to horizontal r 1.5 + coin radius, ingots to jitter 1.0. Nothing else gold is within
 * 1.75 m (the gilded Ra is 4.0 m away, the coffin lid 3.1 m). */
const inPile = (x, y, z) => {
  const dx = x - 2.9, dz = z + 70.8;
  return dx * dx + dz * dz < 1.75 * 1.75 && y > -12.10 && y < -11.20;
};

async function bootLevel() {
  globalThis.self = globalThis;
  const { bootKayKit } = await import('./_kaykitboot.mjs');
  const { engine } = await bootKayKit({ withLevel: true });
  engine.scene.updateMatrixWorld(true);
  let gold = null;
  engine.scene.traverse((o) => { if (o.isMesh && o.name === 'props_gold') gold = o; });
  assert.ok(gold, 'no props_gold in the booted level');
  return gold;
}

/* ------------------------------------------------------------------------------------- G1 */

test('G1 §724: the un-tint is the exact linear inverse of the house gold, derived not typed', () => {
  /* The colour is scraped from the entry itself, so a moved house gold moves this test's
   * input with it — the identity then holds or fails on the DERIVATION, which is the thing
   * being pinned (§719's guard-on-both-constants pattern). */
  const src = readFileSync(path.join(ROOT, 'src/world/Props.js'), 'utf8');
  const m = src.match(/gold:\s*\{[^}]*color: (0x[0-9a-fA-F]{6})/);
  assert.ok(m, 'MATERIALS.gold declares no colour to invert');
  const c = new THREE.Color(parseInt(m[1], 16));
  const lin = [c.r, c.g, c.b];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(lin[i] * PILE_UNTINT[i] - 1) < 1e-9,
      `channel ${i}: ${lin[i]} x ${PILE_UNTINT[i]} != 1 — the un-tint is not this entry's inverse`);
  }
  /* Shape: the house gold is warm, so the inverse must rise R -> G -> B, all above one. */
  assert.ok(PILE_UNTINT[0] > 1 && PILE_UNTINT[1] > PILE_UNTINT[0] && PILE_UNTINT[2] > PILE_UNTINT[1],
    `inverse (${PILE_UNTINT}) does not have the warm-gold shape`);
  /* FAIL input (§418.3): the identity discriminates — a different colour breaks it. */
  const wrong = new THREE.Color(0xffffff);
  assert.ok(Math.abs(wrong.r * PILE_UNTINT[0] - 1) > 0.1,
    'the identity accepted a colour that is not the house gold — it discriminates nothing');
});

/* ------------------------------------------------------------------------------------- G2 */

test('G2 §724: the hoard scatters its windows and carries the un-tint; all other gold is exact white', async () => {
  assert.equal(PILE_FADED, false, 'this arm must run without the revert token');
  const gold = await bootLevel();
  const { position: pos, uv, color: col } = gold.geometry.attributes;
  assert.ok(col && col.itemSize === 3,
    'props_gold has no COLOR_0 — with vertexColors declared this draws BLACK (§719)');
  assert.equal(col.count, pos.count, 'COLOR_0 is not per-vertex');
  assert.equal(gold.material.vertexColors, true, 'the material does not read the attribute');

  let pileN = 0, otherN = 0;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (inPile(x, y, z)) {
      pileN++;
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(col.getComponent(i, k) - PILE_UNTINT[k]) < 1e-5,
          `pile vertex ${i} channel ${k}: ${col.getComponent(i, k)} is not the un-tint ${PILE_UNTINT[k]}`);
      }
      const u = uv.getX(i), v = uv.getY(i);
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    } else {
      otherN++;
      /* EXACT white — this is the multiply-by-one that keeps the Ra statue, the colossus
       * trims and both finials bit-identical. Any tolerance here would hide a leak. */
      assert.ok(col.getComponent(i, 0) === 1 && col.getComponent(i, 1) === 1 && col.getComponent(i, 2) === 1,
        `non-pile gold vertex ${i} at (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}) is tinted`);
    }
  }
  assert.ok(pileN > 4000, `pile selection found only ${pileN} verts — the hoard moved or shrank`);
  assert.ok(otherN > 5000, `only ${otherN} non-pile gold verts — the domain half of this arm is empty`);

  /* The windows SCATTER (before §724 this bbox was 0.16 x 0.09, the origin corner)... */
  assert.ok(uMax - uMin > 0.9 && vMax - vMin > 0.9,
    `pile UV bbox ${(uMax - uMin).toFixed(3)} x ${(vMax - vMin).toFixed(3)} — the windows did not scatter`);

  /* ...and they TRANSLATE, never stretch: no triangle's UV diameter exceeds what its own
   * geometry projects at UV_PER_M. A 0..1 remap (§712.3's refused regression) would put cap
   * triangles at ~0.5 here. */
  const idx = gold.geometry.index;
  let maxDiam = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
    if (!(inPile(pos.getX(i0), pos.getY(i0), pos.getZ(i0))
       && inPile(pos.getX(i1), pos.getY(i1), pos.getZ(i1))
       && inPile(pos.getX(i2), pos.getY(i2), pos.getZ(i2)))) continue;
    for (const [a, b] of [[i0, i1], [i1, i2], [i0, i2]]) {
      const d = Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b));
      if (d > maxDiam) maxDiam = d;
    }
  }
  assert.ok(maxDiam > 0, 'no pile triangles found for the scale check');
  assert.ok(maxDiam < 0.25,
    `a pile triangle spans ${maxDiam.toFixed(3)} UV — the windows were scaled, not translated`);
});

/* ------------------------------------------------------------------------------------- G3 */

test('G3 §724: `?pile=faded` restores the corner windows and an all-white BOUND attribute, in a child', () => {
  /* The token is read at Props module load, so one process cannot hold both arms — the same
   * reason `?mag=wide` runs in a child (tests/magvolume.test.mjs). */
  const script = `
globalThis.__PILE_AB = 'faded';
globalThis.self = globalThis;
const { PILE_FADED } = await import(${JSON.stringify(new URL('../src/world/Props.js', import.meta.url).href)});
const { bootKayKit } = await import(${JSON.stringify(new URL('./_kaykitboot.mjs', import.meta.url).href)});
const { engine } = await bootKayKit({ withLevel: true });
let gold = null;
engine.scene.traverse((o) => { if (o.isMesh && o.name === 'props_gold') gold = o; });
const { position: pos, uv, color: col } = gold.geometry.attributes;
const inPile = (x, y, z) => { const dx = x - 2.9, dz = z + 70.8; return dx * dx + dz * dz < 1.75 * 1.75 && y > -12.10 && y < -11.20; };
let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9, pileN = 0, nonWhite = 0;
for (let i = 0; i < pos.count; i++) {
  if (col.getComponent(i, 0) !== 1 || col.getComponent(i, 1) !== 1 || col.getComponent(i, 2) !== 1) nonWhite++;
  if (!inPile(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
  pileN++;
  const u = uv.getX(i), v = uv.getY(i);
  if (u < uMin) uMin = u; if (u > uMax) uMax = u;
  if (v < vMin) vMin = v; if (v > vMax) vMax = v;
}
process.stdout.write('__R__' + JSON.stringify({
  faded: PILE_FADED, pileN, nonWhite,
  hasColor: !!col, colCount: col ? col.count : 0, posCount: pos.count,
  vertexColors: gold.material.vertexColors === true,
  uSpan: uMax - uMin, vSpan: vMax - vMin,
}));
`;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', maxBuffer: 32 << 20, cwd: ROOT });
  const m = /__R__(\{.*\})/.exec(raw);
  assert.ok(m, 'the faded child produced no result line');
  const r = JSON.parse(m[1]);
  assert.equal(r.faded, true, 'the child did not see the token');
  assert.ok(r.pileN > 4000, `child pile selection found ${r.pileN} verts`);
  /* The corner window, verbatim: before §724 the whole pile spanned 0.163 x 0.094. */
  assert.ok(r.uSpan < 0.2 && r.vSpan < 0.12,
    `reverted UV bbox ${r.uSpan.toFixed(3)} x ${r.vSpan.toFixed(3)} — the token did not restore the corner window`);
  /* White everywhere, and BOUND: vertexColors stays on, so the revert is a multiply by one,
   * never the unbound-attribute black (§719's trap). */
  assert.equal(r.nonWhite, 0, `${r.nonWhite} verts are tinted under the revert token`);
  assert.ok(r.hasColor && r.colCount === r.posCount, 'the reverted arm dropped COLOR_0 — unbound multiplies to black');
  assert.equal(r.vertexColors, true, 'the reverted arm turned vertexColors off — the arms now differ by a program');
});

/* ------------------------------------------------------------------------------------- G4 */

/** A shading factory that CACHES BY OPTION KEY, as the browser's `toon()` does — the property
 * the old `_coinMat` mutation was invisible without (plain Node has no factory at all, so C4's
 * arm hands out fresh materials and cannot see sharing). */
function cachingShading() {
  const cache = new Map();
  return {
    cache,
    make(opts) {
      const key = JSON.stringify(opts, (_k, v) => (v && v.isTexture ? `tex:${v.uuid}` : v));
      if (cache.has(key)) return cache.get(key);
      const m = new THREE.MeshStandardMaterial({
        color: opts.color ?? 0xffffff, map: opts.map || null, vertexColors: !!opts.vertexColors,
      });
      cache.set(key, m);
      return m;
    },
  };
}

function fakeEngine(modules = {}) {
  const events = new Map();
  return {
    scene: new THREE.Scene(),
    on(evt, fn) { if (!events.has(evt)) events.set(evt, new Set()); events.get(evt).add(fn); return () => events.get(evt)?.delete(fn); },
    emit() {},
    get(k) { return modules[k] ?? null; },
    has(k) { return k in modules; },
    warn() {},
  };
}

test('G4 §724: the badge separation holds under a factory that caches like the browser\'s', async () => {
  const shading = cachingShading();
  /* A two-point route so the trail places coins and `_coinMat` actually runs — the subject of
   * this arm is the COIN badge material, and a bootless coin set would skip it silently. */
  const engine = fakeEngine({ shading, architecture: { api: { route: [['w', 0, 1, 0], ['w', 12, 1, 0]] } } });
  const pk = new Pickups(engine);
  await pk.init();

  const coinMat = pk._coinMesh?.material;
  assert.ok(coinMat, 'no coin mesh');
  assert.ok(coinMat.map, 'the coin lost its badge');
  assert.equal('#' + coinMat.color.getHexString(), '#ffffff', 'the badge is being re-tinted');

  let inspected = 0;
  for (const t of pk.treasures) {
    if (!t.mesh) continue;
    inspected++;
    assert.notEqual(t.mesh.material, coinMat,
      `treasure ${t.id} shares the coin's material — the browser-cache collision is back`);
    assert.ok(!t.mesh.material.map, `treasure ${t.id} is wearing the coin badge`);
    assert.equal(t.mesh.material.vertexColors, true, `treasure ${t.id} cannot read its COLOR_0`);
    const col = t.mesh.geometry.attributes.color;
    assert.ok(col, `treasure ${t.id} has no COLOR_0 — with vertexColors on it draws black (§719)`);
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(col.getComponent(0, k) - PILE_UNTINT[k]) < 1e-5,
        `treasure ${t.id} channel ${k} is not the un-tint`);
    }
  }
  assert.ok(inspected >= 3, `§211.1: inspected ${inspected} treasures`);

  /* FAIL input (§418.3), in-arm: the OLD shape — mutate the factory's cached answer — against
   * this same factory. The mutation reaches the next same-key call, which is exactly the
   * mechanism that put the badge on the Eye of Ra in the shipped browser build. If this stops
   * failing, the fake factory no longer caches and G4's green means nothing. */
  const probe = { name: 'probe', color: 0x123456 };
  const a = shading.make(probe);
  const marker = new THREE.Texture();
  marker.uuid = 'marker';
  a.map = marker;
  const b = shading.make({ name: 'probe', color: 0x123456 });
  assert.equal(b.map, marker,
    'the caching factory did not return the mutated instance — this arm can no longer discriminate');
});

/* ------------------------------------------------------------------------------------- G5 */

test('G5 §724: the treasures\' own windows scatter too, without stretching', async () => {
  const shading = cachingShading();
  const pk = new Pickups(fakeEngine({ shading }));
  await pk.init();

  const eye = pk.treasures.find((t) => t.id === 'eye');
  assert.ok(eye?.mesh, 'no Eye mesh');
  const uv = eye.mesh.geometry.attributes.uv;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u < uMin) uMin = u; if (u > uMax) uMax = u;
    if (v < vMin) vMin = v; if (v > vMax) vMax = v;
  }
  /* Two discs, two windows: at the origin both sat inside one +-0.17 patch (span 0.34). Two
   * R2-offset windows cannot both fit in it. */
  assert.ok(uMax - uMin > 0.45 || vMax - vMin > 0.45,
    `Eye UV bbox ${(uMax - uMin).toFixed(3)} x ${(vMax - vMin).toFixed(3)} — its windows did not move apart`);

  /* Translation only: each disc is r 0.34 at UV_PER_M 0.5, so no single UV edge may exceed
   * that projection. A 0..1 remap would show ~1.0 here. */
  const idx = eye.mesh.geometry.index;
  const pos = eye.mesh.geometry.attributes.position;
  assert.ok(idx && pos, 'Eye geometry is not indexed');
  let maxDiam = 0;
  for (let t = 0; t < idx.count; t += 3) {
    for (const [a, b] of [[idx.getX(t), idx.getX(t + 1)], [idx.getX(t + 1), idx.getX(t + 2)], [idx.getX(t), idx.getX(t + 2)]]) {
      const d = Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b));
      if (d > maxDiam) maxDiam = d;
    }
  }
  assert.ok(maxDiam < 0.45,
    `an Eye triangle spans ${maxDiam.toFixed(3)} UV — the window was scaled, not translated`);

  /* Distinct treasures land on distinct patches — the point of scattering. */
  const meanUV = (mesh) => {
    const u2 = mesh.geometry.attributes.uv;
    let su = 0, sv = 0;
    for (let i = 0; i < u2.count; i++) { su += u2.getX(i); sv += u2.getY(i); }
    return [su / u2.count, sv / u2.count];
  };
  const others = pk.treasures.filter((t) => t.mesh && t.id !== 'eye');
  assert.ok(others.length >= 2, 'not enough treasures to compare');
  const e = meanUV(eye.mesh);
  for (const t of others) {
    const o = meanUV(t.mesh);
    assert.ok(Math.hypot(e[0] - o[0], e[1] - o[1]) > 0.05,
      `treasure ${t.id} landed on the Eye's own patch — the sequence collapsed`);
  }
});
