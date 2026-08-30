/**
 * limehold.test.mjs — §739: the canopic jars take a hold of their own, and the sconces give
 * theirs back.
 *
 * Owner on the §738 build: *"It looks a little better, but still a little washed out."* The chest
 * and coin stacks came up; two populations did not, and this section is both of them.
 *
 *   J1  THE JARS OPT IN, AND ONLY THE JARS — `MATERIALS.lime` carries `LIME_HOLD` and every other
 *       recipe in the table resolves to 0, which reaches the shader as `max(x, 0.0)` and is an
 *       exact identity. A second entry taking the hold turns this red.
 *   J2  THE JAR TOKEN IS ON `?props=`, NOT `?kk=` — and the two keys still cannot reach each
 *       other. This is the separation §736 and §737 each paid a round to establish and K5 pins
 *       from the other side; here it is pinned from this one. Both arms RUN.
 *   J3  `?props=` COMPOSES — `nolime` next to a mode, in either order, and a bare mode still
 *       parses. This is the arm the comma-list change could break silently: before §739 the key
 *       was compared whole, so `?props=tinted,nolime` would have fallen through to 'chroma' and
 *       A/B'd something other than what was asked for.
 *   J4  THE SCONCES ARE SCOPED, NOT REVERTED — the torch bucket gets `TORCH_HOLD` while the set
 *       dress keeps `KK_HOLD`, and the two bags are otherwise IDENTICAL, so §729's "the imported
 *       set cannot drift into two looks" survives on every axis except the one §738/§739
 *       measured a reason to split. `?kk=torchhold` cancels the scope; `?kk=nohold` zeroes both.
 *   J5  THE STRENGTHS ARE THE SWEPT ONES, with the shape of the sweep recorded — `LIME_HOLD` is
 *       full strength because everything below 0.80 is inside a neutral dip, and `TORCH_HOLD` is
 *       0 because §738 measured what a non-zero costs an owner-approved fixture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
globalThis.self = globalThis;

/** A fresh Props.js with the tokens set as given — the token is module-load state. */
async function loadProps(arm, tokens = {}) {
  const before = { props: globalThis.__PROPS_AB, kk: globalThis.__KK_AB };
  globalThis.__PROPS_AB = tokens.props ?? null;
  globalThis.__KK_AB = tokens.kk ?? null;
  const mod = await import(`../src/world/Props.js?limearm=${arm}`);
  globalThis.__PROPS_AB = before.props; globalThis.__KK_AB = before.kk;
  return mod;
}
async function loadKayKit(arm, tokens = {}) {
  const before = { props: globalThis.__PROPS_AB, kk: globalThis.__KK_AB };
  globalThis.__KK_AB = tokens.kk ?? null;
  globalThis.__PROPS_AB = tokens.props ?? null;
  const mod = await import(`../src/world/KayKit.js?limearm=${arm}`);
  globalThis.__PROPS_AB = before.props; globalThis.__KK_AB = before.kk;
  return mod;
}
function recorder() {
  const bags = [];
  return { bags, engine: { get: (k) => (k === 'shading' ? { make: (o) => { bags.push(o); return { isMaterial: true, name: o.name }; } } : null) } };
}
const FAKE_ATLAS = { isTexture: true, uuid: 'fake', name: 'atlas' };
const PROPSRC = fs.readFileSync(path.join(ROOT, 'src/world/Props.js'), 'utf8');

/* ------------------------------------------------------------------------------------- J1 */

test('J1 §739: the jar recipe opts into the hold and no other recipe in the table does', async () => {
  const on = await loadProps('j1');
  assert.ok(on.LIME_HOLD > 0, 'the jars must carry a hold by default');

  /* Read the TABLE, not a built material: this is the line a later lane would widen. */
  const optIns = [...PROPSRC.matchAll(/^\s*(\w+):\s*\{[^}]*\bshadeHold\b/gm)].map((m) => m[1]);
  assert.deepEqual(optIns, ['lime'], 'exactly one recipe opts in, and it is the ceramic one');

  /* And the forwarding defaults to 0 rather than to undefined — `undefined` would resolve
     through `num(opts.shadeHold, 0)` to the same place today, but it is the kind of thing a
     later refactor of _resolve would silently change. */
  assert.match(PROPSRC, /shadeHold: spec\.shadeHold \?\? 0/,
    'Props._mat must forward an explicit 0 for every recipe that does not ask');
});

/* ------------------------------------------------------------------------------------- J2 */

test('J2 §739: the jar revert is on ?props= and the two token families cannot reach each other', async () => {
  const on = await loadProps('j2on');
  const off = await loadProps('j2off', { props: 'nolime' });
  assert.equal(on.PROPS_NOLIME, false);
  assert.equal(off.PROPS_NOLIME, true, '?props=nolime must be read — RUN');
  assert.equal(off.LIME_HOLD, 0, 'and it must zero the jars\' hold');

  /* §418.3's failing input for the SEPARATION, run both ways. */
  const kkTok = await loadProps('j2kk', { kk: 'nohold' });
  assert.equal(kkTok.PROPS_NOLIME, false,
    '?kk=nohold must NOT reach the procedural jars — K5 pins the same independence from the '
    + 'other side, and §736/§737 each spent a round establishing it');
  assert.ok(kkTok.LIME_HOLD > 0);

  const propTok = await loadKayKit('j2kk2', { props: 'nolime' });
  assert.equal(propTok.KK_NOHOLD, false, '?props=nolime must not reach the imported recipe');
  assert.ok(propTok.KK_HOLD > 0);
});

/* ------------------------------------------------------------------------------------- J3 */

test('J3 §739: ?props= composes as a comma list and a bare mode still parses', async () => {
  const bare = await loadProps('j3bare', { props: 'tinted' });
  assert.equal(bare.PROPS_MODE, 'tinted', 'a bare mode is unchanged by the list parse');
  assert.equal(bare.PROPS_NOLIME, false);

  const both = await loadProps('j3both', { props: 'tinted,nolime' });
  assert.equal(both.PROPS_MODE, 'tinted', 'the mode survives a second token');
  assert.equal(both.PROPS_NOLIME, true, 'and the second token is read');
  assert.equal(both.LIME_HOLD, 0);

  const rev = await loadProps('j3rev', { props: ' NoLime , Plain ' });
  assert.equal(rev.PROPS_MODE, 'plain', 'order and spacing and case do not matter');
  assert.equal(rev.PROPS_NOLIME, true);

  const junk = await loadProps('j3junk', { props: 'wat' });
  assert.equal(junk.PROPS_MODE, 'chroma', 'an unknown word falls back rather than throwing');
  assert.equal(junk.PROPS_NOLIME, false);
});

/* ------------------------------------------------------------------------------------- J4 */

test('J4 §739: the sconces are scoped off the hold, and differ from the set dress on NOTHING else', async () => {
  const on = await loadKayKit('j4');
  const r = recorder();
  on.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'props:kaykit');
  on.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'props:kaykit:torch', { shadeHold: on.TORCH_HOLD });
  const [dress, torch] = r.bags;
  assert.equal(dress.shadeHold, on.KK_HOLD);
  assert.equal(torch.shadeHold, 0, 'the sconces keep their pre-§738 shade');
  assert.equal(on.TORCH_HOLD, 0);

  /* The whole of §729's promise, asserted as a set difference rather than key by key, so a new
     key added to the recipe is covered without editing this arm. */
  const diff = Object.keys(dress).filter((k) => k !== 'name' && dress[k] !== torch[k]);
  assert.deepEqual(diff, ['shadeHold'],
    '§729 forbids the imported set drifting into two looks; the shade hold is the ONE axis '
    + '§738/§739 measured a reason to split, and every other key must still be identical');

  /* Both escapes RUN. */
  const back = await loadKayKit('j4back', { kk: 'torchhold' });
  const rb = recorder();
  back.makeAtlasMaterial(rb.engine, FAKE_ATLAS, 't', { shadeHold: back.TORCH_HOLD });
  assert.equal(rb.bags[0].shadeHold, back.KK_HOLD, '?kk=torchhold puts the sconces back — RUN');

  const none = await loadKayKit('j4none', { kk: 'nohold' });
  const rn = recorder();
  none.makeAtlasMaterial(rn.engine, FAKE_ATLAS, 'a');
  none.makeAtlasMaterial(rn.engine, FAKE_ATLAS, 'b', { shadeHold: none.TORCH_HOLD });
  assert.equal(rn.bags[0].shadeHold, 0, '?kk=nohold zeroes the set dress');
  assert.equal(rn.bags[1].shadeHold, 0, 'and the sconces stay at zero too');
});

/* ------------------------------------------------------------------------------------- J6 */

test('J6 §739: the vault\'s DESTRUCTIBLE jars take the same hold as the static urns beside them', async () => {
  /* §730 left four static urns on the offering table and two destructible jars three metres
     away, and they are the same object to look at. `Smashables._mat` builds `smash:clay` from
     `PROP_MATERIALS.lime` — its header says the mirror exists "so this does not become a fourth
     clay" — so the hold has to cross with the colour or §739 puts a seam between a pair.
     DOMAIN: passes on the shipped source; fails on a `smash:clay` bag that omits the mirror,
     which is what the first draft of this lane shipped for one commit. */
  const src = fs.readFileSync(path.join(ROOT, 'src/world/Smashables.js'), 'utf8');
  assert.match(src, /shadeHold: PROP_MATERIALS\.lime\.shadeHold/,
    'smash:clay must mirror lime\'s hold, not just its colour');
  assert.match(src, /shadeHold: spec\.shadeHold \?\? 0/,
    'and the other two kinds (wicker, wood) must still resolve to an explicit 0');

  const { MATERIALS } = await import('../src/world/Props.js?j6');
  assert.ok(MATERIALS.lime.shadeHold > 0, 'the source of the mirror carries a hold to mirror');
  for (const k of ['rope', 'wood']) {
    assert.equal(MATERIALS[k].shadeHold, undefined,
      `${k} must not opt in — smash:wicker and smash:wood mirror those and would follow`);
  }
});

/* ------------------------------------------------------------------------------------- J5 */

test('J5 §739: the strengths are the swept ones, and the sweep\'s SHAPE is on record', async () => {
  const p = await loadProps('j5');
  assert.equal(p.LIME_HOLD, 1.0,
    'full strength is the only value that arrives: everything below 0.80 is inside the neutral '
    + 'dip the day sweep measured, and 0.20 leaves the jars FLATTER than shipped');
  assert.match(PROPSRC, /The day row DIPS before it rises/,
    'the dip is the reason for the value and must stay recorded at it — a later reader lowering '
    + 'LIME_HOLD "to be safe" would make the jars worse, not safer');

  const k = await loadKayKit('j5k');
  assert.equal(k.TORCH_HOLD, 0);
  assert.ok(k.KK_HOLD > 0, 'and the set dress keeps §738\'s gain — this is a scope, not a revert');
});
