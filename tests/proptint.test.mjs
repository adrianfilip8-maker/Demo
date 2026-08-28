/**
 * proptint.test.mjs — §727: "Fix the coloring issue on the props."
 *
 * What §727 shipped, pinned here:
 *
 *   1. Three `Props.MATERIALS` entries drop the residual double tint §724.1 named — the
 *      `color ×` multiply over a texture that is already final art:
 *        wood       `wood_old` × 0x6b4a2c drove the whole tile to luma 0.103, HALF the
 *                   `rampFloor(TIMBER_CREV)` hard minimum (0.2096) the recipe carries
 *                   specifically because "below the line it stops rendering as dark wood and
 *                   starts rendering as the shader's flat violet";
 *        lapis      `lapis_inlay` × 0x1f4f96 — the tint IS `PAL.lapis`, the hex the texture's
 *                   stone cells are built from (lapis × lapis, §712.2's shape), and it turned
 *                   the gold cloisonné wire (58% of texels, authored hue 41.7°) hue 162.8°
 *                   TEAL-GREEN while driving the cells under the inlay `rampFloor` invariant;
 *        carnelian  `carnelian_inlay` × 0xb8452c — the tint IS `PAL.carnelian`, same
 *                   double-paint, gold wire repainted dark red, cells to L 30.
 *      White through `diffuseColor = color × map` is a multiply by one: the props wear the
 *      texture the recipes authored, once. No attribute, no program variant, no draw.
 *   2. The other textured entries KEEP their tints, deliberately: stone/lime read within a
 *      few L of the arch walls that wear the same textures through the same mechanism
 *      (owner-passed across every playtest), gold is §724's settled split, bronze is the same
 *      dark-ground-metal policy as gold ("the same three ingredients the gold policy is
 *      built on, at bronze values"), rope/cloth measured in-family at both grades.
 *   3. `?props=tinted` (globalThis.__PROPS_AB from a test) restores the shipped double grade
 *      on exactly the three entries — a data flip, same programs, byte-identical frames to
 *      the pre-§727 build.
 *   4. `Smashables._mat` mirrors `Props.MATERIALS` BY DESIGN ("so this does not become a
 *      fourth clay") — its crate wears whatever wood resolves to, in both arms, so the fix
 *      cannot open a crate-vs-scaffold divergence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PROPS_TINTED, MATERIALS } from '../src/world/Props.js';
import { Smashables } from '../src/world/Smashables.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* The shipped second grades, as data: what the token must restore, byte for byte. */
const SHIPPED = { wood: 0x6b4a2c, lapis: 0x1f4f96, carnelian: 0xb8452c };
/* The leave decisions, as data: §727 measured these and left them, so a silent change to any
 * of them is a change to a recorded decision, not a drive-by. */
const LEFT = {
  stone: 0x9c8278, lime: 0xd4c19a, gold: 0xe8b942, bronze: 0x8a6a3a,
  rope: 0xa8875c, cloth: 0xe8ddc4,
};

function smashMat(kind) {
  const s = new Smashables({ get: () => null });
  return s._mat(kind);
}

/* ------------------------------------------------------------------------------------- T1 */

test('T1 §727: the three convicted entries resolve to white; the left entries keep their exact tints', () => {
  assert.equal(PROPS_TINTED, false, 'this arm must run without the revert token');
  for (const key of Object.keys(SHIPPED)) {
    assert.equal(MATERIALS[key].color, 0xffffff,
      `MATERIALS.${key} still multiplies a tint over its texture — the §727 un-tint is gone`);
  }
  /* FAIL inputs, in-arm (§418.3): the un-tint must NOT have leaked to the entries §727
   * measured and left. A whitewash of the whole table would pass the loop above and is the
   * §442 wrong-subject failure this arm exists to catch. */
  for (const [key, hex] of Object.entries(LEFT)) {
    assert.equal(MATERIALS[key].color, hex,
      `MATERIALS.${key} is 0x${MATERIALS[key].color.toString(16)}, expected 0x${hex.toString(16)} — `
      + '§727 recorded a LEAVE for this entry; changing it needs its own section');
  }
  /* The untextured and dead entries are out of this mechanism entirely. */
  assert.equal(MATERIALS.dark.tex, null, 'dark grew a texture — it is outside §727\'s audit');
  assert.equal(MATERIALS.cork.color, 0x8a6a42,
    'cork moved — it has zero users (clueBottle folds every part into glass) and §727 left it as a record');
});

/* ------------------------------------------------------------------------------------- T2 */

function runChild(token) {
  const script = `
globalThis.__PROPS_AB = ${JSON.stringify(token)};
const { PROPS_TINTED, MATERIALS } = await import(${JSON.stringify(new URL('../src/world/Props.js', import.meta.url).href)});
const { Smashables } = await import(${JSON.stringify(new URL('../src/world/Smashables.js', import.meta.url).href)});
const crate = new Smashables({ get: () => null })._mat('crate');
const basket = new Smashables({ get: () => null })._mat('basket');
process.stdout.write('__R__' + JSON.stringify({
  tinted: PROPS_TINTED,
  colors: Object.fromEntries(['wood','lapis','carnelian','stone','lime','gold','bronze','rope','cloth'].map(k => [k, MATERIALS[k].color])),
  crate: crate.color.getHex(), basket: basket.color.getHex(),
}));
`;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', maxBuffer: 32 << 20, cwd: ROOT });
  const m = /__R__(\{.*\})/.exec(raw);
  assert.ok(m, `the ${JSON.stringify(token)} child produced no result line`);
  return JSON.parse(m[1]);
}

test('T2 §727: `?props=tinted` restores the shipped double grade on exactly the three entries, in a child', () => {
  /* The token is read at Props module load, so one process cannot hold both arms — the
   * pilegold G3 / §726.7 child pattern. */
  const r = runChild('tinted');
  assert.equal(r.tinted, true, 'the child did not see the token');
  for (const [key, hex] of Object.entries(SHIPPED)) {
    assert.equal(r.colors[key], hex,
      `reverted MATERIALS.${key} is 0x${r.colors[key].toString(16)}, not the shipped 0x${hex.toString(16)}`);
  }
  /* The left entries are IDENTICAL in both arms — the token flips only what §727 changed. */
  for (const [key, hex] of Object.entries(LEFT)) {
    assert.equal(r.colors[key], hex, `the token moved MATERIALS.${key}, which §727 never touched`);
  }
});

test('T2b §727: a wrong token value changes nothing — the parser discriminates', () => {
  /* FAIL input for the token itself (§418.3): `?props=bogus` must leave the fix in place.
   * A reader that tests truthiness instead of the value would go tinted here. */
  const r = runChild('bogus');
  assert.equal(r.tinted, false, 'a bogus token value armed the revert');
  for (const key of Object.keys(SHIPPED)) {
    assert.equal(r.colors[key], 0xffffff, `MATERIALS.${key} reverted under a bogus token value`);
  }
});

/* ------------------------------------------------------------------------------------- T3 */

test('T3 §727: the Smashables mirror stays a mirror in both arms', () => {
  /* Smashables' own header: "mirroring Props.MATERIALS so this does not become a fourth
   * clay." A crate is a wood prop standing beside the scaffold; if the fix reached one and
   * not the other, §727 would have CREATED the divergence it exists to close. */
  const crate = smashMat('crate');
  assert.equal(crate.color.getHex(), MATERIALS.wood.color,
    `smash:wood 0x${crate.color.getHex().toString(16)} != MATERIALS.wood 0x${MATERIALS.wood.color.toString(16)}`);
  const basket = smashMat('basket');
  assert.equal(basket.color.getHex(), MATERIALS.rope.color,
    'smash:wicker no longer mirrors MATERIALS.rope — rope was LEFT, so the basket must keep the rope tint');
  const jar = smashMat('jar');
  assert.equal(jar.color.getHex(), MATERIALS.lime.color,
    'smash:clay no longer mirrors MATERIALS.lime — lime was LEFT, so the jar must keep the lime tint');

  /* And in the tinted arm (checked through T2's child): the crate follows the wood revert. */
  const r = runChild('tinted');
  assert.equal(r.crate, SHIPPED.wood, 'the reverted crate does not wear the shipped wood tint');
  assert.equal(r.basket, LEFT.rope, 'the reverted basket moved — rope has no §727 arm to revert');
});
