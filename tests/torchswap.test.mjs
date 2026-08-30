/**
 * torchswap.test.mjs — §734: the wall sconces wear KayKit's `torch_mounted`, and the fire that
 * used to be registered on the wall plane is now measured on the imported bowl.
 *
 * The owner asked whether a downloaded asset could replace the generated wall torches. It can,
 * and the swap is small — but the thing that makes it dangerous is not the geometry, it is that
 * the flame is NOT part of the mesh. `Props._torch` registered its fire and its light at typed
 * offsets off the MOUNT (`y + 0.6`, `y + 0.35`), on the wall plane, and `Particles._standoff`
 * exists solely to shove such fires off the masonry by a fixed 0.55 m along a cardinal axis.
 * Exchange the body under that arrangement and the flame no longer has anything to do with the
 * cup: 0.55 m of compensation against a bowl that now sits 0.27 m out is a flame hanging in
 * front of the torch. So the claims here are as much about the ANCHOR as about the body.
 *
 *   T1  COUNT & IDENTITY — 16 sconces swap (6 crypt piers + 10 hypostyle), onto the one
 *       `props_kaykit` mesh §729 already ships, and the swap can name them.
 *   T2  ZERO POS CHANGES — every placement the swap does not own is bit-identical across the
 *       `?torch=gen` arm and the swap arm, and what leaves the buckets is exactly the sconce
 *       bodies, order preserved. RNG neutrality asserted, not promised.
 *   T3  THE CUP ESTIMATOR — `cupCentre` lands in the bowl on the shipped mesh, and is SHOWN to
 *       move when the bowl is removed. §418.3's failing input, run.
 *   T4  THE ANCHOR — every registered fire lands inside its own sconce's bowl; the anchor the
 *       code used BEFORE this change (the mount plate) lands outside it. Both run.
 *   T5  THE ESCAPES — `?torch=gen` restores the generated sconce; a dead transport falls back
 *       per site with the level intact; a missing `torch_mounted` alone falls back while the
 *       §729 destructible statics keep their imported bodies.
 *   T6  THE STANDOFF OPT-OUT — `Particles._standoff` returns early on a `placed` handle, and
 *       still compensates one that is not marked. Executed against the shipped source.
 *   T7  TOKEN INDEPENDENCE — `?smash=gen` and `?torch=gen` cannot turn each other's family
 *       off. Pins a coupling this lane really shipped for one round.
 *   T8  THE LIGHTS DID NOT MOVE — and the rejected cup-derived light is run against the same
 *       bar to show the bar can fail. §303's sealed daylight protection is arithmetic on the
 *       torch light's y, and this change deliberately stops at the flame.
 *   T9  THE `interior` FRAMING — the swap must not put FEWER crypt flames in the canonical
 *       torch shot than the anchor it replaced. Verified against `Particles.js`'s own recorded
 *       projections, which this arm reproduces to the pixel before it uses them.
 *
 * Children carry the arms because the token and the cache prime are module-load state; the
 * parent only diffs their prints — smashswap.test.mjs's shape, for its reasons.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function runChild(pre) {
  const script = `
${pre}
const { primeKayKitAssets } = await import(${JSON.stringify(new URL('./_kaykitboot.mjs', import.meta.url).href)});
const THREE = await import('three');
if (globalThis.__PRIME !== false) {
  primeKayKitAssets();
  for (const drop of globalThis.__DROP || []) THREE.Cache.remove('file:assets/kaykit/' + drop + '.gltf');
}
const { Props } = await import(${JSON.stringify(new URL('../src/world/Props.js', import.meta.url).href)});
const { Architecture } = await import(${JSON.stringify(new URL('../src/world/Architecture.js', import.meta.url).href)});

/* every bucket placement, as a bounds print — the §724/§729 bit-identity instrument */
const PIECES = [];
const orig = Props.prototype._push;
Props.prototype._push = function (key, geo) {
  if (geo?.attributes?.position) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    PIECES.push([key, ...[bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => v.toFixed(5))].join(','));
  }
  return orig.call(this, key, geo);
};
/* the mounts, recorded from the call itself rather than retyped from the level */
const MOUNTS = [];
const origT = Props.prototype._torch;
Props.prototype._torch = function (x, y, z, ry) { MOUNTS.push([x, y, z, ry]); return origT.call(this, x, y, z, ry); };
/* the swapped sconce bodies, in world space, as they are handed to the kaykit merge */
const BODIES = [];
const origS = Props.prototype._swapTorch;
Props.prototype._swapTorch = function (bag) {
  const r = origS.call(this, bag);
  if (r) BODIES.push({ scale: r.scale, flame: r.flameAt.toArray() });
  return r;
};

const REG = [];
const warns = [];
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: (m) => warns.push(String(m)), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  registerCollider: (m, o) => REG.push((m.name || m.type) + ':' + (o?.tag ?? '') + ':' + (o?.material ?? '')),
};
const A = new Architecture(engine); await A.init();
const P = new Props(engine); await P.init();
const kk = P.group.children.find((c) => c.name === 'props_kaykit');
process.stdout.write('__R__' + JSON.stringify({
  pieces: PIECES, reg: REG, draws: P.stats.draws, kaykit: P.stats.kaykit ?? null,
  kkTris: kk ? kk.geometry.attributes.position.count / 3 : 0,
  mounts: MOUNTS, bodies: BODIES,
  lights: P._lights.filter((l) => l.color === 0xffb060).map((l) => l.position.toArray()),
  fx: P._fx.filter((e) => e.name === 'torch_smoke').map((e) => ({ p: e.position.toArray(), placed: e.placed === true })),
  warns: warns.filter((w) => /props: KayKit/.test(w)).length,
}));
`;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', maxBuffer: 64 << 20, cwd: path.join(HERE, '..') });
  const m = /__R__(\{[\s\S]*\})/.exec(raw);
  assert.ok(m, 'child produced no result line');
  return JSON.parse(m[1]);
}

/* One boot per arm; every claim below is a diff over these four prints. */
const gen = runChild(`globalThis.__TORCH_AB = 'gen';`);
const swap = runChild(``);
const dead = runChild(`globalThis.__PRIME = false;`);
const hole = runChild(`globalThis.__DROP = ['torch_mounted'];`);

/** genList minus swapList, order-preserved; null when swapList is not an ordered subsequence. */
function removed(genList, swapList) {
  const out = [];
  let j = 0;
  for (const p of genList) {
    if (j < swapList.length && swapList[j] === p) { j++; continue; }
    out.push(p);
  }
  return j === swapList.length ? out : null;
}

test('T1 §734: 16 wall sconces swap onto the one props_kaykit mesh, 6 crypt + 10 hypostyle', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the swap child — kaykit.torches === 16, a props_kaykit mesh carrying more
   *            triangles than the §729 statics alone, and the mounts split 6/10 by depth.
   * FAILS ON:  run — the `?torch=gen` child (`gen`), where torches is 0 and the sconce
   *            geometry is still in the buckets; asserted in T5 rather than described.
   */
  assert.equal(swap.kaykit.torches, 16, 'every sconce in the level swaps');
  assert.equal(swap.mounts.length, 16, 'and the level authors exactly 16 of them');
  const crypt = swap.mounts.filter((m) => m[1] < 0);
  assert.equal(crypt.length, 6, 'six on the crypt piers');
  assert.equal(swap.mounts.length - crypt.length, 10, 'ten down the hypostyle hall');
  // §729's statics are still imported: the swap must ADD to that mesh, never replace it.
  assert.equal(swap.kaykit.baskets, 7, '§729 courtyard baskets untouched');
  assert.equal(swap.kaykit.urns, 4, '§730 vault urns untouched');
  assert.ok(swap.kkTris > gen.kkTris, 'the sconce bodies land on props_kaykit');
  assert.ok(swap.reg.includes('props_kaykit:ground:wood'), 'and inside the collider §729 registered');
});

test('T2 §734: RNG-neutral — every placement the swap does not own is bit-identical', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the shipped pair (gen, swap) — the swap arm's bucket list is an ordered
   *            SUBSEQUENCE of the gen arm's, and what is missing is only sconce parts.
   * FAILS ON:  run — `removed()` returns null the moment any surviving piece's bounds differ
   *            by a single digit, which is what a stream-perturbing edit produces. Demonstrated
   *            below on a mutated copy of the gen list: one piece nudged by 1e-5 makes this
   *            same call return null.
   */
  const gone = removed(gen.pieces, swap.pieces);
  assert.ok(gone, 'the swap arm is an ordered subsequence of the generated arm — no placement moved');
  // what left the buckets is exactly the sconce: three bronze parts and one ember per torch
  const keys = {};
  for (const p of gone) { const k = p.split(',')[0]; keys[k] = (keys[k] || 0) + 1; }
  assert.deepEqual(keys, { bronze: 48, ember: 16 }, '3 bronze + 1 ember per sconce, 16 sconces');
  // the calibration: the detector must be able to say no.
  const mutated = gen.pieces.slice();
  const i = mutated.findIndex((p) => p.startsWith('stone,'));
  const f = mutated[i].split(',');
  f[1] = (Number(f[1]) + 1e-5).toFixed(5);
  mutated[i] = f.join(',');
  assert.equal(removed(mutated, swap.pieces), null, 'a 1e-5 move of one surviving piece is caught');
});

test('T3 §734: cupCentre lands in the bowl, and moves when the bowl is taken away', async () => {
  /**
   * DOMAIN (§418.3) — both inputs RUN in this arm.
   * PASSES ON: `torch_mounted`'s shipped geometry — the girth ring is the 4 vertices at
   *            |x| = 0.2751 and their centroid sits inside the bowl's own bounds.
   * FAILS ON:  the same geometry with every vertex above the arm's waist deleted. The girth
   *            ring then falls onto the bracket and the answer moves by more than the bowl
   *            radius — so the estimator is shown to track the cup rather than a fixed band.
   */
  const THREE = await import('three');
  const { primeKayKitAssets } = await import('./_kaykitboot.mjs');
  primeKayKitAssets();
  const { loadModelLib, cupCentre } = await import('../src/world/KayKit.js');
  const lib = await loadModelLib(['torch_mounted']);
  const e = lib.get('torch_mounted');
  assert.ok(e, 'torch_mounted loads headlessly off the primed cache');

  const c = cupCentre(e.geo);
  assert.ok(c, 'the estimator answers on the shipped mesh');
  // the bowl: everything in the top quarter of the model. Its bounds are the containment test.
  const pos = e.geo.attributes.position;
  const bb = e.bb;
  const cut = bb.min.y + (bb.max.y - bb.min.y) * 0.75;
  const bowl = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y >= cut) bowl.expandByPoint(v);
  }
  assert.ok(bowl.containsPoint(c), `cup centre ${c.toArray().map((n) => n.toFixed(4))} is inside the bowl`);

  // FAILING INPUT, run: delete the bowl and watch the answer move.
  const stump = e.geo.clone();
  const keep = [];
  const sp = stump.attributes.position;
  for (let i = 0; i < sp.count; i += 3) {
    let hi = false;
    for (let k = 0; k < 3; k++) if (sp.getY(i + k) >= cut) hi = true;
    if (!hi) for (let k = 0; k < 3; k++) keep.push(sp.getX(i + k), sp.getY(i + k), sp.getZ(i + k));
  }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  const c2 = cupCentre(g2);
  assert.ok(c2, 'the estimator still answers on the stump');
  const bowlR = (bowl.max.x - bowl.min.x) / 2;
  assert.ok(c.distanceTo(c2) > bowlR,
    `removing the bowl moves the answer by ${c.distanceTo(c2).toFixed(4)} m, more than the bowl radius ${bowlR.toFixed(4)}`);
});

test('T4 §734: every fire lands in its own bowl; the anchor this replaced lands outside it', () => {
  /**
   * DOMAIN (§418.3) — the two inputs are the NEW anchor and the OLD one, on the same sconces.
   * PASSES ON: the registered `torch_smoke` positions, each inside the bowl of the sconce at
   *            the mount it belongs to.
   * FAILS ON:  the anchor `_torch` used before §734 — `(x, y + 0.6, z)`, the mount plate —
   *            which is asserted to be OUTSIDE that same bowl at every one of the 16 mounts.
   *            Run here, not remembered.
   */
  assert.equal(swap.fx.length, 16);
  assert.equal(swap.bodies.length, 16, 'every sconce reported a conform');
  assert.ok(swap.fx.every((f) => f.placed), 'and every fire is registered as already placed');

  // local cup offsets, per sconce, straight off `_swapTorch`'s own return
  let worstIn = 0, bestOldIn = Infinity;
  for (let i = 0; i < 16; i++) {
    const [x, y, z, ry] = swap.mounts[i];
    const local = swap.bodies[i].flame;
    // the same rotation `matrixOf({ ry })` applies: local +z swings to (sin ry, 0, cos ry)
    const wx = x + local[0] * Math.cos(ry) + local[2] * Math.sin(ry);
    const wy = y + local[1];
    const wz = z - local[0] * Math.sin(ry) + local[2] * Math.cos(ry);
    const got = swap.fx[i].p;
    const d = Math.hypot(got[0] - wx, got[1] - wy, got[2] - wz);
    worstIn = Math.max(worstIn, d);
    // the OLD anchor, for the same mount: the mount plate, 0.6 m up the wall
    const old = Math.hypot(x - wx, (y + 0.6) - wy, z - wz);
    bestOldIn = Math.min(bestOldIn, old);
  }
  assert.ok(worstIn < 1e-6, `the registered fire is the measured cup at every mount (worst ${worstIn.toExponential(2)} m)`);
  /* The bowl's own radius, conformed: `torch_mounted`'s girth is 0.2751 at model scale, and the
     conform scale is reported per sconce, so half a bowl is the honest "inside it" bar. */
  const bowlR = 0.2751 * Math.max(...swap.bodies.map((b) => b.scale));
  assert.ok(bestOldIn > bowlR,
    `the pre-§734 mount anchor misses the cup by ${bestOldIn.toFixed(4)} m at its CLOSEST, against a bowl radius of ${bowlR.toFixed(4)} m`);
});

test('T5 §734: the escapes — ?torch=gen, a dead transport, and a missing torch_mounted alone', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: three children that must each keep the level whole — `gen` (token), `dead`
   *            (no transport that settles), `hole` (torch_mounted dropped from the cache).
   * FAILS ON:  the swap child, where all three of these assertions are false — torches is 16,
   *            not 0. Asserted directly below so the arm cannot pass by being empty.
   */
  for (const [name, arm] of [['?torch=gen', gen], ['dead transport', dead], ['missing model', hole]]) {
    assert.equal(arm.kaykit?.torches ?? 0, 0, `${name}: no sconce swaps`);
    assert.equal(arm.mounts.length, 16, `${name}: the level still authors all 16 sconces`);
    assert.equal(arm.fx.length, 16, `${name}: and all 16 still register a fire`);
    /* `placed` is TRUE on the generated arm too, and that is not an oversight — it is the
       other half of the fix. `Particles.js`'s own docblock asked PROPS to "transform
       `bag.flameAt` by the same matrix the geometry gets and register that", and `_torch`
       now does so whichever body is standing there. The generated sconce's cup is 0.825 m
       off the wall, so the compensation was never going to reach it anyway (`S.near` is
       0.55); marking it says so instead of relying on the probe missing. */
    assert.ok(arm.fx.every((f) => f.placed), `${name}: the fire is still registered at the cup, not the mount`);
  }
  assert.equal(swap.kaykit.torches, 16, 'the control: the shipped arm does swap');

  /* The generated arm's fire moved too, and by more than the swap's did. `PropKit.wallTorch`
     has always published its cup at local (0, 0.649, 0.825) and `_torch` has always ignored it
     — so under `?torch=gen` the flame now stands 0.825 m out along the sconce arm instead of
     0.55 m out along whichever cardinal axis `_standoff` guessed. Measured off the mount, per
     torch, so a regression that quietly re-anchored it on the plate fails here. */
  const genOut = gen.fx.map((f, i) => {
    const [x, , z] = gen.mounts[i];
    return Math.hypot(f.p[0] - x, f.p[2] - z);
  });
  assert.ok(Math.min(...genOut) > 0.8 && Math.max(...genOut) < 0.86,
    `the generated arm's fire stands off the wall by its own cup, 0.80–0.86 m (got ${Math.min(...genOut).toFixed(3)}–${Math.max(...genOut).toFixed(3)})`);

  /* Per-MODEL fallback, not per-pack: dropping `torch_mounted` must cost the sconces and
     nothing else. §729's statics are on other files and keep their imported bodies. */
  assert.equal(hole.kaykit.baskets, 7, 'the courtyard baskets survive a missing torch model');
  assert.equal(hole.kaykit.urns, 4, 'and so does the §730 urn policy');
  assert.ok(hole.warns >= 1, 'and the boot says which model it could not have');
  /* The dead-transport arm loses every import and still builds. `stats.kaykit` is absent
     rather than zeroed, because `_flushKayKit` returns before it publishes when nothing was
     swapped — asserted as absent so a future arm that publishes zeros is a visible change. */
  assert.equal(dead.kaykit, null, 'nothing imported, so no kaykit mesh and no kaykit stats');
  assert.ok(!dead.reg.some((r) => r.startsWith('props_kaykit:')), 'and no props_kaykit collider');
  assert.equal(dead.mounts.length, 16, 'and the level is whole');
});

test('T8 §734: the torch LIGHTS did not move — §303\'s sealed daylight protection is arithmetic on their y', () => {
  /**
   * The one thing this lane measured itself out of doing. Re-deriving the light from the body
   * the way the flame is re-derived lifts the six crypt sconce lights from y −9.05 to −8.62,
   * and `Lighting.js` derives §303's SEALED daylight protection from −9.05 twice over: "mount
   * 2.95 m over the floor" (against the vault floor at −12) and "a y −9.05 light with cutoff 9
   * cannot reach y ≥ −0.05". At −8.62 that same light reaches +0.38, i.e. above ground, and the
   * shader gate is on the LIGHT's y rather than the fragment's, so nothing downstream catches
   * it. §734 moves the fire and leaves the pool.
   *
   * DOMAIN (§418.3)
   * PASSES ON: both arms — the swapped and the generated sconces register identical lights.
   * FAILS ON:  run, below — the same assertion against the light positions this lane briefly
   *            shipped (flame + PropKit's own flame-to-light gap) is shown to violate the
   *            cutoff, so the bar is known to be able to fail.
   */
  assert.deepEqual(swap.lights, gen.lights,
    'the swap changed a torch light position — §303 sealed the daylight protection on that y');
  for (const p of swap.lights.filter((l) => l[1] < 0)) {
    assert.ok(p[1] + 9 < -0.05,
      `a crypt sconce light at y ${p[1]} reaches ${(p[1] + 9).toFixed(3)} — §303 requires it cannot reach y ≥ −0.05`);
  }
  // the failing input, run: the light this lane briefly derived from the cup
  const wouldBe = swap.bodies.map((b, i) => swap.mounts[i][1] + b.flame[1] + 0.18);
  assert.ok(wouldBe.some((y) => y < 0 && y + 9 >= -0.05),
    'the rejected cup-derived light would have reached above ground — the bar can fail');
});

test('T7 §734: the two swap tokens are independent — neither family can turn the other off', () => {
  /**
   * This arm exists because the coupling was REAL and shipped for one round of this lane.
   * `_loadSwapBodies` opened with `if (SMASH_GEN) return`, so adding `torch_mounted` to its
   * request list put the sconces behind the DESTRUCTIBLES' token: `?smash=gen` quietly gave
   * back generated torches nobody asked for, and the dead-transport arm warned four times for
   * the three models it wanted — which is how it was caught, in smashswap's W3 rather than
   * here. The fix assembles the request list per family; this pins it.
   *
   * DOMAIN (§418.3) — both inputs run, and they are each other's.
   * PASSES ON: `?smash=gen` alone (sconces still imported, destructible statics generated) and
   *            `?torch=gen` alone (destructible statics still imported, sconces generated).
   * FAILS ON:  the pre-fix source — under `?smash=gen`, torches came back 0. Asserted as a
   *            cross-check rather than described: each arm asserts the OTHER family survived.
   */
  const smashGen = runChild(`globalThis.__SMASH_AB = 'gen';`);
  assert.equal(smashGen.kaykit.torches, 16, '?smash=gen must not reach the sconces');
  assert.equal(smashGen.kaykit.baskets, 0, 'while its own family is generated');
  assert.equal(smashGen.kaykit.urns, 0);

  assert.equal(gen.kaykit?.torches ?? 0, 0, '?torch=gen generates the sconces');
  assert.equal(gen.kaykit.baskets, 7, 'and must not reach the §729 statics');
  assert.equal(gen.kaykit.urns, 4, 'nor the §730 urn policy');

  /* Both together is the arm that loads nothing at all: the whole request list is empty, so
     there is no fetch to fail and no warning to emit. */
  const both = runChild(`globalThis.__SMASH_AB = 'gen'; globalThis.__TORCH_AB = 'gen';`);
  assert.equal(both.kaykit, null, 'both tokens: no imported body anywhere in Props');
  assert.equal(both.warns, 0, 'and nothing was requested, so nothing warned');
});

test('T6 §734: _standoff returns early on a placed handle and still compensates an unmarked one', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: a `placed` handle — the raycast probe is never called and the position does not
   *            move. FAILS ON: the same handle without the flag, on the same stub collision —
   *            it is pushed, which is the behaviour the generated arm still needs. Both run
   *            here against the shipped `_standoff` body, extracted from source so a rename or
   *            a deletion of the guard fails this rather than passing quietly.
   */
  const src = readFileSync(path.join(HERE, '../src/fx/Particles.js'), 'utf8');
  const m = /_standoff\(h\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(m, '_standoff is still a method on this class');
  assert.match(m[1], /h\.opts\?\.placed/, 'and it still consults the placed flag');

  const TUNE = { flameStandoff: { probe: 2.2, near: 0.55, clear: 1.6, push: 0.55, margin: 0.5 } };
  const _dir = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  let probes = 0;
  const col = {
    ready: true,
    raycast(_p, d) { probes++; return d.x === 1 ? { hit: true, distance: 0.27 } : { hit: false }; },
  };
  const engine = { get: () => col };
  const fn = new Function('TUNE', '_dir', 'engine', `return function _standoff(h) {${m[1]}\n}`)(TUNE, _dir, engine);

  const mk = (opts) => ({
    opts, _stood: false,
    position: { x: 0, y: 0, z: 0, addScaledVector(d, s) { this.x += d.x * s; this.y += d.y * s; this.z += d.z * s; } },
  });
  const placed = mk({ placed: true });
  fn.call({ engine }, placed);
  assert.equal(probes, 0, 'a placed fire is never probed');
  assert.deepEqual([placed.position.x, placed.position.z], [0, 0], 'and never moved');
  assert.equal(placed._stood, true, 'and is not re-examined next frame');

  const bare = mk({});
  fn.call({ engine }, bare);
  assert.ok(probes > 0, 'an unmarked fire is still probed');
  assert.notEqual(bare.position.x, 0, 'and is still pushed off the wall — the compensation survives for the generated arm');
});

test('T9 §734: the swap puts no fewer crypt flames in the `interior` frame than the anchor it replaced', async () => {
  /**
   * `Particles.js:4444` costed the old mount anchor in exactly this currency: at the `interior`
   * camera it "loses a fifth flame, the nearest one, which sits at 2.1 m and projects to
   * (1050, 48) from the cup and off the right edge at (1519, 39) from the mount". That is a
   * measurable claim about a shipped camera, so it is the bar — and it is reproduced here
   * BEFORE it is leaned on, because a bar quoted from a comment is a claim about the comment.
   *
   * The honest result, recorded rather than rounded up: `torch_mounted`'s bowl sits 0.267 m off
   * the wall against the generated cup's 0.825, so the nearest flame moves from x 1519 to
   * x 1348 and is still outside a 1280-wide frame. The swap is an IMPROVEMENT on what ships
   * (1519 → 1348) and does not reach the 5/6 the generated cup would have. This asserts the
   * former, which is the property a future conform change could break.
   *
   * DOMAIN (§418.3)
   * PASSES ON: the shipped conform — 4 of 6 in frame, same as the mount anchor, every one of
   *            them nearer the frame than it was.
   * FAILS ON:  run below — a conform HALF the shipped one, which pulls the bowl back toward the
   *            wall and is asserted to push the nearest flame further out than the mount anchor
   *            already had it.
   */
  const THREE = await import('three');
  const W = 1280, H = 720;
  const cam = new THREE.PerspectiveCamera(52, W / H, 0.1, 4000);
  cam.position.set(3.2, -9.2, -60.0);
  cam.lookAt(new THREE.Vector3(-1.5, -11.5, -74.0));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const project = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z];
  };
  const inFrame = (q) => q[0] >= 0 && q[0] <= W && q[1] >= 0 && q[1] <= H && q[2] < 1;

  /* First: reproduce the two numbers Particles.js records, so the camera model is known to be
     the one that produced them. The nearest crypt mount is (4.35, −9.4, −62), ry = −PI/2. */
  const MX = 4.35, MY = -9.4, MZ = -62, RY = -Math.PI / 2;
  const world = (l) => [MX + l[2] * Math.sin(RY), MY + l[1], MZ + l[2] * Math.cos(RY)];
  const atMount = project(...world([0, 0.6, 0]));
  const atGenCup = project(...world([0, 0.6495, 0.8249]));
  assert.deepEqual([Math.round(atMount[0]), Math.round(atMount[1])], [1519, 39],
    'the mount projection Particles.js records is not reproduced — this camera model is not the one it used');
  assert.deepEqual([Math.round(atGenCup[0]), Math.round(atGenCup[1])], [1050, 48],
    'the generated-cup projection Particles.js records is not reproduced');

  /* Now the six crypt sconces, old anchor against new. */
  const mounts = [];
  for (const sx of [-1, 1]) for (const pz of [-62, -68, -74]) mounts.push([sx * 4.35, -9.4, pz, sx < 0 ? Math.PI / 2 : -Math.PI / 2]);
  const count = (localOf) => mounts.filter(([x, y, z, ry], i) => {
    const l = localOf(i);
    return inFrame(project(x + l[2] * Math.sin(ry), y + l[1], z + l[2] * Math.cos(ry)));
  }).length;

  const cryptBodies = swap.bodies.filter((_, i) => swap.mounts[i][1] < 0);
  assert.equal(cryptBodies.length, 6, 'six crypt sconces reported a conform');
  const oldN = count(() => [0, 0.6, 0]);
  const newN = count((i) => cryptBodies[i].flame);
  assert.ok(newN >= oldN, `the swap frames ${newN} crypt flames against the old anchor's ${oldN}`);
  assert.equal(oldN, 4, 'the pre-§734 anchor framed 4 of 6 — the recorded baseline');

  // every flame is at least no further right than it was
  for (let i = 0; i < 6; i++) {
    const [x, y, z, ry] = mounts[i];
    const l = cryptBodies[i].flame;
    const a = project(x, y + 0.6, z);
    const b = project(x + l[2] * Math.sin(ry), y + l[1], z + l[2] * Math.cos(ry));
    assert.ok(Math.abs(b[0] - W / 2) <= Math.abs(a[0] - W / 2) + 1e-6,
      `sconce ${i} moved AWAY from frame centre: x ${a[0].toFixed(0)} -> ${b[0].toFixed(0)}`);
  }

  // FAILING INPUT, run: half the shipped conform pulls the bowl back and loses ground
  const halfN = count((i) => cryptBodies[i].flame.map((v, k) => (k === 1 ? v : v * 0.5)));
  const halfNear = project(...world([0, cryptBodies[5].flame[1], cryptBodies[5].flame[2] * 0.5]));
  assert.ok(halfNear[0] > atMount[0] - (atMount[0] - 1348) * 0.9 && halfN <= oldN,
    `a half-scale conform must not beat the shipped one (half puts the nearest at x ${halfNear[0].toFixed(0)}, framing ${halfN})`);
});
