/**
 * smashswap.test.mjs — §729's STATIC half: the destructible models' twins in `Props.js`.
 *
 * The owner's "in all locations" covers more than Smashables' clusters: the vault's
 * offering-table canopic jars (4) and the courtyard wall baskets (7 of the 26-loop's draws at
 * the shipped seed) are the SAME generated bodies, placed as set dress. This file holds the
 * three claims the swap makes about them, each against the failure that would falsify it:
 *
 *   1. COUNT & IDENTITY — exactly 4 + 7 statics swap onto ONE `props_kaykit` mesh, and the
 *      swap can name them.
 *   2. ZERO POS CHANGES — every placement the swap does NOT own is bit-identical across the
 *      gen arm, the swap arm and the transport-dead arm; the 11 it does own leave the buckets
 *      as exactly the 11 the gen arm placed there (order preserved). This is the §724 pattern
 *      ("bit-identical in both arms and under the token") asserted rather than promised, and
 *      the §704.9b class of damage — a concurrent-world edit moving someone else's geometry —
 *      is what it would catch.
 *   3. THE ESCAPES WORK — `?smash=gen` restores the generated statics; a dead transport
 *      (unprimed headless — the never-settling relative fetch `CarmelitaGuard.js:330` records)
 *      falls back per SITE with the level intact; a single missing MODEL falls back per MODEL
 *      (jars swap while every basket keeps its weave) — all three RUN, not described (§418.9).
 *
 * Children carry the arms because the token and the prime are module-load state; the parent
 * only diffs their prints. Architecture is booted in-child so `_maybeLedge`/collider parity
 * sees the same world basketvary's harness builds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
  pieces: PIECES, reg: REG, decals: P.stats.decals, draws: P.stats.draws,
  kaykit: P.stats.kaykit ?? null,
  kkTris: kk ? kk.geometry.attributes.position.count / 3 : 0,
  warns: warns.filter((w) => /props: KayKit/.test(w)).length,
}));
`;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', maxBuffer: 64 << 20, cwd: path.join(HERE, '..') });
  const m = /__R__(\{[\s\S]*\})/.exec(raw);
  assert.ok(m, 'child produced no result line');
  return JSON.parse(m[1]);
}

/* One boot per arm, shared by every test below — a Props+Architecture boot is the expensive
 * part, and the claims are all diffs over the same four prints. */
const gen = runChild(`globalThis.__SMASH_AB = 'gen';`);
const swap = runChild(``);
const dead = runChild(`globalThis.__PRIME = false;`);
const hole = runChild(`globalThis.__DROP = ['barrel_large', 'barrel_small_stack'];`);

/** genList minus swapList, order-preserved: what the swap took OUT of the buckets. */
function removed(genList, swapList) {
  const out = [];
  let j = 0;
  for (const p of genList) {
    if (j < swapList.length && swapList[j] === p) { j++; continue; }
    out.push(p);
  }
  return j === swapList.length ? out : null;   // null: swapList is NOT an ordered subsequence
}

test('W1 §729: the statics swap counts 4 jars + 7 baskets onto one props_kaykit mesh', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the swap child — kaykit {jars:4, baskets:7}, a props_kaykit mesh, one more draw.
   * FAILS ON:  run — the gen child, where all three are absent; and the dead-transport child,
   *            where the swap is armed and still all three are absent. Both asserted in W3.
   */
  assert.deepEqual(swap.kaykit, { jars: 4, baskets: 7 },
    `the static swap took ${JSON.stringify(swap.kaykit)} — the shipped seed places 4 vault jars and 7 courtyard baskets`);
  assert.ok(swap.kkTris > 0, 'no props_kaykit mesh was built');
  assert.equal(swap.draws, gen.draws + 1,
    `the swap costs ${swap.draws - gen.draws} draws — the design is ONE merged mesh, +1`);
  assert.ok(swap.reg.includes('props_kaykit:ground:wood'),
    'the swapped statics lost their solid-ground registration — a barrel you sink through');
});

test('W2 §729: zero pos changes — the unswapped world is bit-identical, the 11 removed are the right 11', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: gen vs swap — swap's bucket stream is an ordered subsequence of gen's, and the
   *            difference is exactly 11 pieces: 8 lime (4 jars + 4 barrel_large-slot baskets)
   *            and 3 stone. Colliders and ground-decal counts match to the one designed +1.
   * FAILS ON:  run — gen vs the HOLE child (two basket models dropped): the difference there is
   *            exactly 4 (jars only), so the instrument demonstrably tracks WHICH sites
   *            swapped rather than passing on any two boots. A same-arm re-boot equality is
   *            S6's determinism claim one file over; this arm is the cross-arm version.
   */
  const gone = removed(gen.pieces, swap.pieces);
  assert.ok(gone, 'the swap arm REORDERED or MOVED unswapped placements — not a body swap, a layout change');
  assert.equal(gone.length, 11, `${gone.length} pieces left the buckets, expected the 11 swapped statics`);
  const byKey = {};
  for (const p of gone) { const k = p.split(',')[0]; byKey[k] = (byKey[k] || 0) + 1; }
  assert.deepEqual(byKey, { lime: 8, stone: 3 },
    `the removed pieces are ${JSON.stringify(byKey)} — expected lime 8 (4 jars + 4 baskets) / stone 3 (baskets)`);

  /* colliders: identical but for the one designed addition */
  assert.deepEqual(swap.reg.filter((r) => r !== 'props_kaykit:ground:wood'), gen.reg,
    'a collider other than props_kaykit moved under the swap');
  /* every swapped static still grounds a contact decal where the generated one did */
  assert.equal(swap.decals, gen.decals,
    `ground decals moved ${gen.decals} -> ${swap.decals} — a swapped basket lost (or doubled) its contact`);

  /* the failing input, run: with both basket models dropped, only the jars leave the stream */
  const goneHole = removed(gen.pieces, hole.pieces);
  assert.ok(goneHole, 'the hole arm reordered unswapped placements');
  assert.equal(goneHole.length, 4,
    `dropping both basket models removed ${goneHole.length} pieces — expected exactly the 4 jars`);
  assert.ok(goneHole.every((p) => p.startsWith('lime,')), 'the hole arm removed something that is not a vault jar');
  assert.deepEqual(hole.kaykit, { jars: 4, baskets: 0 });
  assert.equal(hole.warns, 2, 'dropping two models should warn twice (once per model)');
});

test('W3 §729: the token and the dead transport both restore the generated statics, RUN', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the gen child (token) and the dead child (no transport): both bucket streams
   *            bit-identical to each other, no props_kaykit, no swap stats, base draw count —
   *            and the dead child says so out loud (three fallback warns, §592's opposite).
   * FAILS ON:  run — the swap child, whose stream differs from gen's in exactly the 11 pieces
   *            W2 names; asserted here as the discriminating contrast so this arm cannot pass
   *            on a broken differ.
   */
  assert.deepEqual(dead.pieces, gen.pieces,
    'a dead transport left a different world than the token — the fallback is not the revert');
  assert.equal(gen.kaykit, null);
  assert.equal(dead.kaykit, null);
  assert.equal(gen.kkTris, 0);
  assert.equal(dead.kkTris, 0);
  assert.equal(dead.draws, gen.draws);
  assert.equal(dead.warns, 3, `${dead.warns} warns from the dead transport — expected one per model`);
  assert.equal(gen.warns, 0, 'the token arm warned — it must not even try to load');
  assert.notEqual(JSON.stringify(swap.pieces), JSON.stringify(gen.pieces),
    'the swap arm equals the gen arm — the differ this file leans on distinguishes nothing');
});
