/**
 * vaulturn.test.mjs — §730: the treasure room's canopic jars, and NOTHING ELSE, come back.
 *
 * The owner: *"The urns in the treasure room can be put back"*, then, seconds later, *"By urns,
 * I mean canopic jars."* §729 had swapped every generated destructible for a KayKit body at the
 * owner's own "in all locations", and its KINDS note records the fact that makes this the right
 * ask: **the pack holds no jar, pot or basket model**, so a `jar` slot took `barrel_small`. A
 * barrel reads fine on a dock and wrong beside an offering table.
 *
 * So §730 is a PER-LOCATION policy, and the whole risk it carries is that it is not — that it
 * quietly becomes a second global revert, or that selecting spots by position perturbs the
 * placement rng and moves the rest of the level. Both are what this file is aimed at.
 *
 * The claims, each against the input that would falsify it:
 *
 *   V1  ONE VOLUME. `EgyptLevel.inCrypt` is Architecture's shipped portal-gate box, not a
 *       second opinion about where the vault is — evaluated over a grid that straddles every
 *       face, and against the room's own landmarks.
 *   V2  THE CENSUS. What the shipped seed actually put in that room, stated as a number, and
 *       which of those spots the policy claims. "The urns" is only precise once this exists.
 *   V3  RNG-NEUTRAL. Every placement in the level is bit-identical across the default arm,
 *       `?vault=barrels` and `?smash=gen`. This is §730's §418.3 fail arm.
 *   U1  THE URN ROW is the `?smash=gen` arm's own `jar` row, field for field — read out of a
 *       child running that token, never restated here.
 *   U2  THE BODY. The urn slot renders the procedural canopic jar on the clay material, and
 *       the barrel is still on the atlas for every jar outside the room.
 *   U3  IT BREAKS AS CLAY. Through the real resolve: an urn publishes `stone`, the crate
 *       standing beside it still publishes `wood`, and both catalogues follow the tag.
 *   U4  THE TOKEN. `?vault=barrels` restores §729 exactly; `?smash=gen` makes the policy moot.
 *
 * Children carry the token arms because the flags are module-load state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { CRYPT, inCrypt, L as LEVEL } from '../src/world/EgyptLevel.js';
import {
  KINDS, URN, URN_SLOT, Smashables, authorSmashables, isUrn,
} from '../src/world/Smashables.js';
import { smashFor, SMASH } from '../src/fx/Emitters.js';
import { stepFor } from '../src/audio/Sfx.js';
import { rng, WORLD_SEED } from '../src/core/Rand.js';
import { primeKayKitAssets } from './_kaykitboot.mjs';

/* The shipped path: imported bodies everywhere the policy does not claim. */
primeKayKitAssets();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

/** The real route, scraped from the level's own literal — smashables.test.mjs's method. */
const ROUTE = (() => {
  const m = SRC('src/world/EgyptLevel.js').match(/api\.route\s*=\s*\[([\s\S]*?)\n\s*\];/);
  const out = [];
  if (!m) return out;
  const re = /\[\s*'([^']+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
  let w;
  while ((w = re.exec(m[1]))) out.push([w[1], +w[2], +w[3], +w[4]]);
  return out;
})();

/** The module's own placement stream, from its own seed — `Smashables.constructor`'s line. */
const freshRng = () => rng(WORLD_SEED ^ 0x5346);

function fakeEngine(modules = {}) {
  const events = new Map();
  return {
    scene: new THREE.Scene(),
    log: [],
    on(evt, fn) {
      if (!events.has(evt)) events.set(evt, new Set());
      events.get(evt).add(fn);
      return () => events.get(evt)?.delete(fn);
    },
    emit(evt, payload) { this.log.push({ evt, payload }); for (const fn of events.get(evt) ?? []) fn(payload); },
    get(k) { return modules[k] ?? null; },
    has(k) { return k in modules; },
    warn() {},
  };
}

async function boot() {
  const engine = fakeEngine({ architecture: { api: { route: ROUTE } } });
  const sm = new Smashables(engine);
  await sm.init();
  return { engine, sm };
}

/** One child boot per token arm; prints the placements and what the boot says it did. */
function runChild(pre) {
  const script = `
${pre}
const { primeKayKitAssets } = await import(${JSON.stringify(new URL('./_kaykitboot.mjs', import.meta.url).href)});
primeKayKitAssets();
const THREE = await import('three');
const S = await import(${JSON.stringify(new URL('../src/world/Smashables.js', import.meta.url).href)});
const ROUTE = ${JSON.stringify(ROUTE)};
const events = new Map();
const engine = {
  scene: new THREE.Scene(), log: [],
  on(e, f) { if (!events.has(e)) events.set(e, new Set()); events.get(e).add(f); return () => {}; },
  emit(e, p) { this.log.push({ evt: e, payload: p && p.material ? { material: p.material, scale: p.scale } : null });
               for (const f of events.get(e) || []) f(p); },
  get: (k) => (k === 'architecture' ? { api: { route: ROUTE } } : null),
  has: () => false, warn: () => {},
};
const sm = new S.Smashables(engine); await sm.init();
const meshes = [];
for (const c of sm.root.children) {
  c.geometry.computeBoundingBox();
  const bb = c.geometry.boundingBox;
  meshes.push({
    name: c.name, count: c.count, mat: c.material.name || '(none)',
    verts: c.geometry.attributes.position.count,
    h: +(bb.max.y - bb.min.y).toFixed(5),
    w: +(bb.max.x - bb.min.x).toFixed(5),
  });
}
process.stdout.write('__R__' + JSON.stringify({
  pos: sm.props.map((p) => [p.kind, p.slot, p.pos.x, p.pos.y, p.pos.z, p.ry].join(',')),
  urns: sm.urns, info: sm.debugInfo(), meshes,
  kindsJar: S.KINDS.jar, urnRow: S.URN,
}));
`;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', maxBuffer: 64 << 20, cwd: path.join(HERE, '..') });
  const m = /__R__(\{[\s\S]*\})/.exec(raw);
  assert.ok(m, 'child produced no result line');
  return JSON.parse(m[1]);
}

const dflt = runChild('');
const barrels = runChild(`globalThis.__VAULT_AB = 'barrels';`);
const gen = runChild(`globalThis.__SMASH_AB = 'gen';`);

/* ============================================================================================
   V1 — one volume, and it is the one that already shipped
============================================================================================ */

test('V1 §730: inCrypt IS Architecture\'s portal-gate box, and it holds the room\'s own landmarks', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: `Architecture.js`'s `sealed` expression, scraped at test time and evaluated
   *            beside `inCrypt` over a 6-face grid that straddles every bound at ±1 cm — the
   *            two agree on all of it; and the vault's own landmarks, all inside.
   * FAILS ON:  run — the same grid against a box with ONE face moved 10 cm (the gate face,
   *            z1), which disagrees on the straddle samples. So the grid demonstrably has the
   *            resolution to catch a moved face rather than passing on any two boxes.
   *
   * This is the arm that keeps §730 from inventing a second vault. Architecture asks "may the
   * desert be hidden from this camera"; §730 asks "is this prop in the treasure room". Same
   * question about the same room, and the moment they are two expressions they will drift.
   */
  const arch = SRC('src/world/Architecture.js');
  assert.match(arch, /const sealed = inCrypt\(p\);/,
    'Architecture no longer calls inCrypt — the portal gate and the urn policy have forked');
  assert.equal(arch.match(/p\.x > -13\.5|p\.z < -59\.3/g), null,
    'Architecture still restates the crypt box literally somewhere — that is the second copy');

  /* Every face, straddled, plus the interior and a far exterior. */
  const grid = [];
  for (const [k, lo, hi] of [['x', CRYPT.x0, CRYPT.x1], ['y', CRYPT.y0, CRYPT.y1], ['z', CRYPT.z0, CRYPT.z1]]) {
    for (const v of [lo - 0.01, lo, lo + 0.01, hi - 0.01, hi, hi + 0.01]) {
      const p = { x: 0, y: -12, z: -70 };
      p[k] = v;
      grid.push(p);
    }
  }
  grid.push({ x: 0, y: -12, z: -70 }, { x: 0, y: 0, z: 30 }, { x: 0.4, y: -12, z: -57.6 });
  const ref = (p) => p.x > -13.5 && p.x < 13.5 && p.y > -12.6 && p.y < -2.5 && p.z > -78.5 && p.z < -59.3;
  for (const p of grid) {
    assert.equal(inCrypt(p), ref(p), `inCrypt disagrees with §409's box at (${p.x}, ${p.y}, ${p.z})`);
  }

  /* The failing input, RUN: one face moved 10 cm and the same grid separates them. */
  const moved = (p) => p.x > -13.5 && p.x < 13.5 && p.y > -12.6 && p.y < -2.5 && p.z > -78.5 && p.z < -59.2;
  assert.ok(grid.some((p) => inCrypt(p) !== moved(p)),
    'the grid cannot tell a 10 cm face move apart — it is not evidence for agreement either');

  /* The room's own furniture, from the sources that place it. */
  const V = { x: 0, y: -12, z: -72 };                        // Props.L.vault
  const inside = {
    sarcophagus:    { x: LEVEL.tomb.sarc[0], y: LEVEL.tomb.sarc[1], z: LEVEL.tomb.sarc[2] },
    'treasure pile': { x: V.x + 2.9, y: V.y, z: V.z + 1.2 }, // Props._treasurePile's own call
    'eye of ra':     { x: V.x, y: V.y, z: V.z - 3.2 },       // Statues.falconRa's mount
    'offering table': { x: V.x - 1.7, y: V.y, z: V.z + 2.4 },
  };
  for (const [name, p] of Object.entries(inside)) {
    assert.ok(inCrypt(p), `the ${name} is not inside the treasure room volume`);
  }
  /* And the things that are NOT the treasure room, by name, including the one whose name lies. */
  const outside = {
    'vault-floor waypoint': { x: 0.4, y: -12, z: -57.6 },     // stairwell, south of the gate face
    'descent landing':      { x: 0, y: 0, z: -57 },
    'inner gate':           { x: 0, y: 0, z: -52 },
    spawn:                  { x: 0, y: 0, z: 30 },
  };
  for (const [name, p] of Object.entries(outside)) {
    assert.ok(!inCrypt(p), `${name} was counted as inside the treasure room`);
  }
});

/* ============================================================================================
   V2 — the census, because "the urns" is a guess without one
============================================================================================ */

test('V2 §730: the shipped seed puts 3 destructibles in the treasure room — 2 jars, 1 crate, 0 baskets', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the shipped seed — 3 spots inside `CRYPT`, census {jar:2, crate:1}, all three at
   *            the `sarcophagus` waypoint, and exactly the 2 jars claimed as urns.
   * FAILS ON:  run — the same selection with the crate's kind forced to `jar`, which claims 3;
   *            and the `vault-floor` cluster, whose three spots are 1.19–2.13 m OUTSIDE the
   *            gate face despite the waypoint's name, and which the selection does not claim.
   *
   * The count is asserted rather than an index list on purpose: a reseed moves which spots land
   * where, and a hardcoded `props[19]` would keep passing while pointing at a terrace.
   */
  const spots = authorSmashables(ROUTE);
  const inRoom = spots.filter((s) => inCrypt(s));
  assert.equal(inRoom.length, 3,
    `${inRoom.length} destructibles stand in the treasure room — the shipped seed places 3`);
  const census = {};
  for (const s of inRoom) census[s.kind] = (census[s.kind] || 0) + 1;
  assert.deepEqual(census, { jar: 2, crate: 1 },
    `the treasure room census is ${JSON.stringify(census)} — expected 2 jars and 1 crate`);
  assert.ok(inRoom.every((s) => s.at === 'sarcophagus'),
    'a treasure-room spot came from a waypoint other than `sarcophagus`');

  const claimed = spots.filter((s) => isUrn(s.kind, s));
  assert.equal(claimed.length, 2, `${claimed.length} spots claimed as urns — expected the 2 vault jars`);
  assert.ok(claimed.every((s) => s.kind === 'jar' && inCrypt(s)), 'a claimed urn is not a jar in the room');
  /* The crate standing beside them is NOT claimed — the owner named urns. */
  assert.ok(inRoom.some((s) => s.kind === 'crate' && !isUrn(s.kind, s)),
    'the vault crate was claimed too — §730 is scoped to canopic jars');

  /* The waypoint whose NAME says vault and whose position says stairwell. Zero jars there, so
     the boundary does not change the answer — recorded because that is what makes it safe. */
  const vf = spots.filter((s) => s.at === 'vault-floor');
  assert.equal(vf.length, 3);
  assert.ok(vf.every((s) => !inCrypt(s)), '`vault-floor` is south of the gate face — it is the stairwell');
  assert.equal(vf.filter((s) => s.kind === 'jar').length, 0,
    'the `vault-floor` cluster now holds a jar — the room boundary has become load-bearing and wants re-stating');
  const margin = Math.min(...vf.map((s) => Math.abs(s.z - CRYPT.z1)));
  assert.ok(margin > 1.0, `the nearest outside spot is only ${margin.toFixed(3)} m from the gate face`);

  /* The failing input, RUN: force the crate to a jar and the selection claims 3. */
  const forced = spots.map((s) => (s.at === 'sarcophagus' && s.kind === 'crate' ? { ...s, kind: 'jar' } : s));
  assert.equal(forced.filter((s) => isUrn(s.kind, s)).length, 3,
    'making the vault crate a jar did not change the claim — the selection is not reading kind');
});

/* ============================================================================================
   V3 — the fail arm: nothing outside the vault moved, at all
============================================================================================ */

test('V3 §730: every placement in the level is bit-identical across all three arms', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the default arm vs `?vault=barrels` vs `?smash=gen` — all 23 positions and
   *            rotations identical to the last bit; only the `slot` column differs, and only
   *            on the 2 spots the policy claims.
   * FAILS ON:  run — the same comparison against a boot whose rng draws one extra value before
   *            authoring, which moves every position from the first cluster onward. So the
   *            comparison demonstrably detects a perturbed stream rather than passing on any
   *            two boots.
   *
   * This is the claim §730 lives or dies on. §724's precedent: a per-item change that draws
   * zero `this.rng` values keeps the world. The mechanism is in `_loadBodies` — the urn body is
   * the geometry §729 already builds to measure the conform, KEPT instead of disposed — and the
   * only way to know the mechanism held is to diff the placements.
   */
  const strip = (rows) => rows.map((r) => { const c = r.split(','); return [c[0], ...c.slice(2)].join(','); });
  assert.equal(dflt.pos.length, 23, `${dflt.pos.length} spots authored — the shipped seed places 23`);
  assert.deepEqual(strip(dflt.pos), strip(barrels.pos),
    '?vault=barrels moved a placement — the policy is perturbing the rng stream');
  assert.deepEqual(strip(dflt.pos), strip(gen.pos),
    '?smash=gen moved a placement — §729\'s own determinism claim has been broken by §730');

  /* The slot column is the ONLY difference, and only on the claimed spots. */
  const slotDiff = dflt.pos.filter((r, i) => r !== barrels.pos[i]);
  assert.equal(slotDiff.length, 2, `${slotDiff.length} rows differ between the arms — expected the 2 urns`);
  assert.ok(slotDiff.every((r) => r.split(',')[1] === URN_SLOT), 'a differing row is not an urn slot');
  assert.equal(dflt.urns, 2);
  assert.equal(barrels.urns, 0, '?vault=barrels still claimed urns');
  assert.equal(gen.urns, 0, '?smash=gen still claimed urns — the policy must be moot when all is generated');

  /* The failing input, RUN: one extra draw before authoring moves everything. Same seed, same
     route, same function — the ONLY difference is one value taken off the stream first, which
     is exactly the damage a placement-perturbing policy would do. */
  const base = authorSmashables(ROUTE, { rng: freshRng() });
  const perturbed = (() => {
    const R = freshRng();
    R();                                   // one extra value, before a single spot is authored
    return authorSmashables(ROUTE, { rng: R });
  })();
  assert.deepEqual(base.map((s) => `${s.x},${s.z}`), dflt.pos.map((r) => { const c = r.split(','); return `${c[2]},${c[4]}`; }),
    'the local stream disagrees with the booted one — the control for this arm is not the shipped layout');
  assert.notDeepEqual(
    base.map((s) => `${s.x},${s.z}`), perturbed.map((s) => `${s.x},${s.z}`),
    'an extra rng draw did not move any placement — this comparison cannot detect a perturbed stream',
  );
});

/* ============================================================================================
   U1 — the urn row is the gen arm's own jar row
============================================================================================ */

test('U1 §730: URN equals the ?smash=gen arm\'s KINDS.jar, field for field', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the `?smash=gen` child's `KINDS.jar`, read out of that boot rather than restated
   *            here — `{material:'stone', scale:1, value:3, h:0.58}`.
   * FAILS ON:  run — the DEFAULT arm's `KINDS.jar`, which is the barrel row (`wood`, plus a
   *            `model`), and which the same comparison rejects.
   *
   * Written this way so a retuned jar cannot leave the urn behind: if someone moves `h` or the
   * value ladder in the gen row, this arm goes red until `URN` follows.
   */
  assert.deepEqual(URN, gen.kindsJar,
    `URN ${JSON.stringify(URN)} has drifted from the gen arm's jar row ${JSON.stringify(gen.kindsJar)}`);
  assert.deepEqual(dflt.urnRow, URN, 'the shipped boot disagrees with the module-level URN row');
  /* the failing input, run */
  assert.notDeepEqual(URN, dflt.kindsJar,
    'URN equals the shipped (barrel) jar row — the comparison above distinguishes nothing');
  assert.equal(KINDS.jar.material, 'wood', 'the shipped jar row is no longer the imported one');
  assert.equal(URN.material, 'stone', 'an urn no longer reports clay');
  /* the numbers that must NOT move: same place, same pay, same event mid-height */
  for (const k of ['scale', 'value', 'h']) {
    assert.equal(URN[k], KINDS.jar[k], `URN.${k} diverged from the shipped jar row — §730 moves the BODY only`);
  }
});

/* ============================================================================================
   U2 — the body actually rendered
============================================================================================ */

test('U2 §730: the urn slot renders the procedural jar on clay, and every other jar keeps the barrel', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the default arm — a `smashable_jar_urn` mesh with 2 instances on `smash:clay`,
   *            a `smashable_jar` mesh with the other 5 on `smash:kaykit`, and the two
   *            geometries differing in both vertex count and width.
   * FAILS ON:  run — the `?vault=barrels` arm, where the urn mesh is absent and the jar mesh
   *            carries all 7; and `?smash=gen`, where there is no atlas material at all.
   */
  const byName = (arm) => Object.fromEntries(arm.meshes.map((m) => [m.name, m]));
  const d = byName(dflt);
  const urn = d.smashable_jar_urn;
  assert.ok(urn, `no urn mesh was built — got ${dflt.meshes.map((m) => m.name).join(', ')}`);
  assert.equal(urn.count, 2, `the urn mesh carries ${urn.count} instances — expected the 2 vault jars`);
  assert.equal(urn.mat, 'smash:clay', `the urns wear "${urn.mat}" — a clay pot is not on the wood atlas`);
  const jar = d.smashable_jar;
  assert.ok(jar, 'the non-vault jars lost their mesh');
  assert.equal(jar.count, 5, `${jar.count} jars kept the imported body — expected the 5 outside the room`);
  assert.equal(jar.mat, 'smash:kaykit', 'the non-vault jars left the atlas material — §729 was reverted');
  assert.equal(urn.count + jar.count, 7, 'the jar population changed — the policy is not a partition');

  /* The two bodies are genuinely different objects, not the same geometry twice. */
  assert.notEqual(urn.verts, jar.verts, 'the urn and the barrel have identical vertex counts');
  assert.ok(Math.abs(urn.h - jar.h) < 0.02,
    `urn ${urn.h} m vs barrel ${jar.h} m — §729 conforms the import to the jar's height, so these must match`);
  assert.ok(urn.w < jar.w, `the urn (${urn.w} m) is not narrower than the barrel (${jar.w} m)`);

  /* the failing inputs, run */
  const b = byName(barrels);
  assert.equal(b.smashable_jar_urn, undefined, '?vault=barrels still built an urn mesh');
  assert.equal(b.smashable_jar.count, 7, `?vault=barrels put ${b.smashable_jar.count} jars on the barrel — expected all 7`);
  assert.equal(b.smashable_jar.mat, 'smash:kaykit');
  const g = byName(gen);
  assert.equal(g.smashable_jar_urn, undefined, '?smash=gen built an urn mesh — the policy must be moot there');
  assert.equal(g.smashable_jar.mat, 'smash:clay', '?smash=gen is not on the generated clay material');
});

/* ============================================================================================
   U3 — it breaks as clay, through the real resolve
============================================================================================ */

test('U3 §730: an urn publishes `stone` and the crate beside it still publishes `wood`', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: a swing resolved against the vault cluster through `caneHit` — the two urns
   *            publish `material: 'stone'`, and the crate standing 0.9 m away in the same
   *            swing publishes `wood`. One event per prop, nothing hand-poked.
   * FAILS ON:  run — a jar at the terrace, resolved through the identical path, publishes
   *            `wood`: the tag follows the LOCATION, which is the whole claim, and a policy
   *            that had gone global would fail this half.
   *
   * The sound and the shards are the same fact: `Sfx.stepFor` and `Particles.smashFor` both key
   * on this one tag, so the assertions below walk it into both catalogues rather than trusting
   * that they still agree.
   */
  const { engine, sm } = await boot();
  const vault = sm.props.filter((p) => inCrypt(p.pos));
  assert.equal(vault.length, 3, 'the boot no longer has the 3 vault spots V2 counted');

  /* One swing, standing among them, through the real subscriber. */
  const c = vault[0].pos;
  engine.emit('caneHit', { index: 1, pos: { x: c.x, y: c.y, z: c.z - 0.6 }, dir: { x: 0, y: 0, z: 1 } });
  const breaks = engine.log.filter((e) => e.evt === 'propSmashed');
  assert.ok(breaks.length >= 3, `the swing broke ${breaks.length} of the 3 vault props`);

  const mats = breaks.map((b) => b.payload.material).sort();
  assert.deepEqual(mats, ['stone', 'stone', 'wood'],
    `the vault cluster broke as ${JSON.stringify(mats)} — expected two clay urns and one wooden crate`);
  for (const b of breaks) {
    assert.ok(Number.isFinite(b.payload.pos.y), 'a break published a non-finite height');
    assert.ok(SMASH[b.payload.material], `no SMASH recipe for "${b.payload.material}"`);
  }

  /* Both catalogues, walked rather than assumed — this is the shard and the SOUND. */
  assert.equal(stepFor('stone'), 'step_stone');
  assert.equal(stepFor('wood'), 'step_wood');
  assert.notEqual(stepFor('stone'), stepFor('wood'),
    'stone and wood resolve to the same transient — a broken urn would sound like a barrel');
  assert.notDeepEqual(smashFor('stone').col, smashFor('wood').col,
    'stone and wood throw the same debris colours — the urn would shed wood chips');
  assert.equal(smashFor('stone'), SMASH.stone);

  /* the failing half, RUN: the same path at a terrace cluster still says wood */
  const { engine: e2, sm: sm2 } = await boot();
  const far = sm2.props.find((p) => p.kind === 'jar' && !inCrypt(p.pos));
  assert.ok(far, 'no jar outside the vault to contrast with');
  e2.emit('caneHit', { index: 1, pos: { x: far.pos.x, y: far.pos.y, z: far.pos.z - 0.6 }, dir: { x: 0, y: 0, z: 1 } });
  const farJar = e2.log.filter((e) => e.evt === 'propSmashed');
  assert.ok(farJar.length >= 1, 'the control swing broke nothing');
  assert.ok(farJar.some((b) => b.payload.material === 'wood'),
    'a jar outside the treasure room published clay — the policy has gone global');
});

/* ============================================================================================
   U4 — the token, and the self-report
============================================================================================ */

test('U4 §730: ?vault=barrels restores §729, and every boot can say what it did', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the token child — 0 urns, no urn mesh, and `debugInfo().vault` reporting the
   *            same 3-spot / 2-jar census as the default arm (the room does not move under a
   *            body token).
   * FAILS ON:  run — the default child, where `urns` is 2 and the mesh exists; asserted here as
   *            the discriminating contrast so this arm cannot pass on a broken reader.
   */
  for (const [name, arm] of [['default', dflt], ['barrels', barrels], ['gen', gen]]) {
    assert.equal(arm.info.vault.spots, 3, `${name}: the room census moved to ${arm.info.vault.spots}`);
    assert.deepEqual(arm.info.vault.byKind, { jar: 2, crate: 1 }, `${name}: census drifted`);
    assert.deepEqual(arm.info.vault.box, CRYPT, `${name}: the reported room is not CRYPT`);
    assert.equal(arm.info.placed, 23, `${name}: placed ${arm.info.placed}`);
  }
  assert.equal(dflt.info.vault.urns, 2);
  assert.equal(barrels.info.vault.urns, 0, '?vault=barrels reported urns');
  assert.equal(gen.info.vault.urns, 0, '?smash=gen reported urns');
  /* §729's self-report is untouched by §730: the three kinds still swap in the default arm. */
  assert.deepEqual(dflt.info.swap.swapped.map((s) => s.kind).sort(), ['basket', 'crate', 'jar'],
    'a kind stopped swapping — §730 must not remove a body from the imported set');
  assert.deepEqual(dflt.info.swap.swapped, barrels.info.swap.swapped,
    'the conforms differ between the arms — §730 changed which body a kind wears globally');
  assert.equal(dflt.info.swap.armed, true);
  assert.equal(gen.info.swap.armed, false);
});
