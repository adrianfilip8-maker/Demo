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
/* §730 moved the four vault jars off the swap, so the arms below split in two. `barrels` is
   the `?vault=barrels` child, which is §729's shipped state EXACTLY — every number this file
   asserted before §730 is still asserted, under the token that restores it. `hole` therefore
   also runs under that token: its whole job is to drop the two BASKET models and watch the
   jars swap anyway, and there is nothing to watch if the jars are urns. */
const barrels = runChild(`globalThis.__VAULT_AB = 'barrels';`);
const hole = runChild(`globalThis.__VAULT_AB = 'barrels'; globalThis.__DROP = ['barrel_large', 'barrel_small_stack'];`);

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

test('W1 §729/§730: 7 courtyard baskets swap, the 4 vault jars stay urns, and the token swaps all 11', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: the swap child — kaykit {jars:0, baskets:7, urns:4}, a props_kaykit mesh, one
   *            more draw; AND the `?vault=barrels` child, which is §729's shipped state
   *            {jars:4, baskets:7, urns:0} on the same mesh and the same +1 draw.
   * FAILS ON:  run — the gen child, where all three are absent; and the dead-transport child,
   *            where the swap is armed and still all three are absent. Both asserted in W3.
   *
   * §730's owner instruction is what splits this row: "the urns in the treasure room can be
   * put back … by urns, I mean canopic jars". The offering table's four ARE canopic jars, so
   * they leave the swap; the courtyard baskets are 40 m away and outside `EgyptLevel.CRYPT`,
   * so they do not. The token arm proves the way back is byte-exact rather than approximate.
   */
  assert.deepEqual(swap.kaykit, { jars: 0, baskets: 7, urns: 4 },
    `the static swap took ${JSON.stringify(swap.kaykit)} — §730 keeps the 4 vault jars generated and swaps the 7 courtyard baskets`);
  assert.deepEqual(barrels.kaykit, { jars: 4, baskets: 7, urns: 0 },
    `?vault=barrels took ${JSON.stringify(barrels.kaykit)} — the revert must reproduce §729's 4 + 7 exactly`);
  for (const [name, arm] of [['swap', swap], ['barrels', barrels]]) {
    assert.ok(arm.kkTris > 0, `no props_kaykit mesh was built in the ${name} arm`);
    assert.equal(arm.draws, gen.draws + 1,
      `the ${name} arm costs ${arm.draws - gen.draws} draws — the design is ONE merged mesh, +1`);
    assert.ok(arm.reg.includes('props_kaykit:ground:wood'),
      `the ${name} arm's swapped statics lost their solid-ground registration — a barrel you sink through`);
  }
  /* §730's collider consequence, stated as an assertion rather than as prose: a restored urn is
     a CLAY jar, so it goes back into the `lime` bucket and its collider is that mesh's own
     merged bounds registered as stone — it does not keep the barrel's wood registration. */
  assert.ok(swap.reg.includes('props_lime:ground:stone'),
    'the restored offering-table urns are not on a stone-registered collider');
  assert.ok(barrels.kkTris > swap.kkTris,
    'the token arm did not add the four jars back onto the kaykit mesh');
});

test('W2 §729/§730: zero pos changes — the unswapped world is bit-identical, and the removed set is exactly the swapped sites', () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: gen vs swap — swap's bucket stream is an ordered subsequence of gen's, and the
   *            difference is exactly 7 pieces: 4 lime + 3 stone, the courtyard baskets alone,
   *            because §730 leaves the 4 vault jars in the `lime` bucket where gen put them.
   *            AND gen vs barrels — the same relation with §729's original 11 (lime 8 / stone
   *            3), so the token restores the exact bucket stream this file was written on.
   * FAILS ON:  run — gen vs the HOLE child (`?vault=barrels` plus both basket models dropped):
   *            the difference there is exactly 4 (jars only), so the instrument demonstrably
   *            tracks WHICH sites swapped rather than passing on any two boots. A same-arm
   *            re-boot equality is S6's determinism claim one file over; this is the cross-arm
   *            version.
   *
   * The §730 line that matters most is the FIRST assertion in each pair: `removed()` returns
   * null the moment the surviving stream stops being an ordered subsequence of gen's, so a
   * per-location policy that perturbed the rng — or moved one prop by a micron — cannot pass
   * here. That is §730's RNG-neutrality claim for the static half, asserted rather than argued.
   */
  for (const [name, arm, n, byKeyWant] of [
    ['swap', swap, 7, { lime: 4, stone: 3 }],
    ['barrels', barrels, 11, { lime: 8, stone: 3 }],
  ]) {
    const gone = removed(gen.pieces, arm.pieces);
    assert.ok(gone, `the ${name} arm REORDERED or MOVED unswapped placements — not a body swap, a layout change`);
    assert.equal(gone.length, n, `${gone.length} pieces left the buckets in the ${name} arm, expected ${n}`);
    const byKey = {};
    for (const p of gone) { const k = p.split(',')[0]; byKey[k] = (byKey[k] || 0) + 1; }
    assert.deepEqual(byKey, byKeyWant,
      `the ${name} arm removed ${JSON.stringify(byKey)}, expected ${JSON.stringify(byKeyWant)}`);
    /* colliders: identical but for the one designed addition */
    assert.deepEqual(arm.reg.filter((r) => r !== 'props_kaykit:ground:wood'), gen.reg,
      `a collider other than props_kaykit moved in the ${name} arm`);
    /* every swapped static still grounds a contact decal where the generated one did */
    assert.equal(arm.decals, gen.decals,
      `ground decals moved ${gen.decals} -> ${arm.decals} in the ${name} arm — a swapped basket lost (or doubled) its contact`);
  }

  /* §730: the four pieces the default arm KEEPS relative to §729 are the vault jars, and they
     are still in `lime` — the bucket whose flush registers stone. Derived as a set difference
     between the two arms' removals rather than by index, so a reseed cannot make it lie. */
  const goneSwap = removed(gen.pieces, swap.pieces);
  const goneBarrels = removed(gen.pieces, barrels.pieces);
  const kept = goneBarrels.filter((p) => !goneSwap.includes(p));
  assert.equal(kept.length, 4, `${kept.length} pieces stayed generated under §730 — expected the 4 offering-table urns`);
  assert.ok(kept.every((p) => p.startsWith('lime,')), 'a kept urn is not in the lime (clay) bucket');

  /* the failing input, run: with both basket models dropped AND the jars swapped by the token,
     only the jars leave the stream */
  const goneHole = removed(gen.pieces, hole.pieces);
  assert.ok(goneHole, 'the hole arm reordered unswapped placements');
  assert.equal(goneHole.length, 4,
    `dropping both basket models removed ${goneHole.length} pieces — expected exactly the 4 jars`);
  assert.ok(goneHole.every((p) => p.startsWith('lime,')), 'the hole arm removed something that is not a vault jar');
  assert.deepEqual(hole.kaykit, { jars: 4, baskets: 0, urns: 0 });
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
