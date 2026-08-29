/**
 * proptint.test.mjs — §727: "Fix the coloring issue on the props."
 *
 * The section shipped in two movements, both pinned here:
 *
 *   1. The pure un-tint (`8feb051`): wood/lapis/carnelian dropped the residual double tint
 *      §724.1 named (each was `texture × the very PAL stop the texture is built from` —
 *      §712.2's shape). Convicted on the recipes' own floor invariants and the frames (the
 *      scaffold reading BLUE at 6 m in daylight; carnelian VIOLET on the tomb's brightest
 *      authored shape). That state survives as `?props=plain`.
 *   2. The chroma correction, after the owner's verdict on (1) — "they always looked faded"
 *      (their word covers both the old dark crush and the pure un-tint's distance-neutral
 *      wash): the DEFAULT grade wears each shipped tint's chromaticity max-normalized in
 *      linear (brightest channel = 1 — no flat luminance crush) and blended from white at
 *      the per-entry strength `tools/proptint.mjs --sweep` measured (W727). `rope` joins
 *      here under the drab-texture chroma clause — a different lever than the L-crush its
 *      §727.2 row declined.
 *
 *   ?props=tinted → the original double grade;  ?props=plain → movement (1);
 *   default        → movement (2).  All three are data flips: same programs, no attribute.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PROPS_MODE, PROPS_TINTED, MATERIALS, chroma727 } from '../src/world/Props.js';
import { Smashables } from '../src/world/Smashables.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* The shipped double grades (what `?props=tinted` restores, byte for byte) and the measured
 * per-entry chroma strengths — both as DATA: a silent change to either is a change to a
 * recorded §727 decision. */
const SHIPPED = { wood: 0x6b4a2c, rope: 0xa8875c, lapis: 0x1f4f96, carnelian: 0xb8452c };
const W = { wood: 0.55, rope: 0.55, lapis: 1.0, carnelian: 0.7 };
/* The `?props=plain` intermediate's fix set — rope was NOT in it. */
const PLAIN_WHITE = ['wood', 'lapis', 'carnelian'];
/* The leave decisions: §727 measured these against the arch controls / settled surfaces. */
const LEFT = { stone: 0x9c8278, lime: 0xd4c19a, gold: 0xe8b942, bronze: 0x8a6a3a, cloth: 0xe8ddc4 };

/* An INDEPENDENT re-derivation — explicit sRGB↔linear, no THREE.Color — so this arm also
 * pins the ColorManagement assumption `chroma727` leans on (Color.r/g/b are linear). */
function deriveIndependently(hex, w) {
  const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l2s = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  const lin = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(s2l);
  const mx = Math.max(...lin) || 1;
  const out = lin.map((v) => 1 + (v / mx - 1) * w).map(l2s);
  return (out[0] << 16) | (out[1] << 8) | out[2];
}

function smashMat(kind) {
  return new Smashables({ get: () => null })._mat(kind);
}

/* ------------------------------------------------------------------------------------- T1 */

test('T1 §727: the default grade is the DERIVED chroma correction; the left entries keep their exact tints', () => {
  assert.equal(PROPS_MODE, 'chroma', 'this arm must run without a token');
  assert.equal(PROPS_TINTED, false);
  for (const [key, hex] of Object.entries(SHIPPED)) {
    const want = deriveIndependently(hex, W[key]);
    assert.equal(MATERIALS[key].color, want,
      `MATERIALS.${key} 0x${MATERIALS[key].color.toString(16)} != independent derivation 0x${want.toString(16)} — `
      + 'either chroma727 or the ColorManagement space it assumes has moved');
    assert.equal(MATERIALS[key].color, chroma727(hex, W[key]), `chroma727 disagrees with the table for ${key}`);
    /* Shape: max-normalization guarantees the brightest channel is full at ANY w — the whole
     * point is chroma without the flat crush. */
    const c = MATERIALS[key].color;
    assert.equal(Math.max((c >> 16) & 255, (c >> 8) & 255, c & 255), 255,
      `${key}'s corrected tint has no full channel — the L-crush is back`);
    /* FAIL inputs, in-arm (§418.3): the derivation discriminates its inputs. */
    assert.notEqual(c, 0xffffff, `${key} resolved plain white — w collapsed to 0`);
    assert.notEqual(c, hex, `${key} resolved the shipped tint — the token fell through`);
    const wProbe = W[key] + 0.15 <= 1 ? W[key] + 0.15 : W[key] - 0.15;   // entries at the ceiling probe downward
    assert.notEqual(c, deriveIndependently(hex, wProbe),
      `${key}'s pin cannot tell w=${W[key]} from w=${wProbe} — it discriminates nothing`);
  }
  for (const [key, hex] of Object.entries(LEFT)) {
    assert.equal(MATERIALS[key].color, hex,
      `MATERIALS.${key} moved — §727 recorded a LEAVE for it; changing it needs its own section`);
  }
  assert.equal(MATERIALS.cork.color, 0x8a6a42,
    'cork moved — zero users (clueBottle folds every part into glass); left as a record');
});

/* -------------------------------------------------------------------------------- children */

function runChild(token) {
  const script = `
globalThis.__PROPS_AB = ${JSON.stringify(token)};
const { PROPS_MODE, MATERIALS } = await import(${JSON.stringify(new URL('../src/world/Props.js', import.meta.url).href)});
const { Smashables } = await import(${JSON.stringify(new URL('../src/world/Smashables.js', import.meta.url).href)});
const crate = new Smashables({ get: () => null })._mat('crate');
const basket = new Smashables({ get: () => null })._mat('basket');
process.stdout.write('__R__' + JSON.stringify({
  mode: PROPS_MODE,
  colors: Object.fromEntries(['wood','rope','lapis','carnelian','stone','lime','gold','bronze','cloth'].map(k => [k, MATERIALS[k].color])),
  crate: crate.color.getHex(), basket: basket.color.getHex(),
}));
`;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', maxBuffer: 32 << 20, cwd: ROOT });
  const m = /__R__(\{.*\})/.exec(raw);
  assert.ok(m, `the ${JSON.stringify(token)} child produced no result line`);
  return JSON.parse(m[1]);
}

test('T2 §727: `?props=tinted` restores the shipped double grade on exactly the four entries, in a child', () => {
  const r = runChild('tinted');
  assert.equal(r.mode, 'tinted');
  for (const [key, hex] of Object.entries(SHIPPED)) {
    assert.equal(r.colors[key], hex,
      `reverted MATERIALS.${key} is 0x${r.colors[key].toString(16)}, not the shipped 0x${hex.toString(16)}`);
  }
  for (const [key, hex] of Object.entries(LEFT)) {
    assert.equal(r.colors[key], hex, `the token moved MATERIALS.${key}, which §727 never touched`);
  }
});

test('T2b §727: a wrong token value lands on the default grade — the parser discriminates', () => {
  const r = runChild('bogus');
  assert.equal(r.mode, 'chroma', 'a bogus token value left the default grade');
  for (const [key, hex] of Object.entries(SHIPPED)) {
    assert.equal(r.colors[key], deriveIndependently(hex, W[key]),
      `MATERIALS.${key} is not the chroma grade under a bogus token value`);
  }
});

test('T2c §727: `?props=plain` reproduces the 8feb051 intermediate exactly — whites on three, rope still tinted', () => {
  const r = runChild('plain');
  assert.equal(r.mode, 'plain');
  for (const key of PLAIN_WHITE) {
    assert.equal(r.colors[key], 0xffffff, `plain arm: MATERIALS.${key} is not white`);
  }
  /* rope was NOT in the intermediate's fix set — the plain arm must show the SHIPPED rope
   * tint, or the arm no longer reproduces the state the owner judged. */
  assert.equal(r.colors.rope, SHIPPED.rope, 'plain arm: rope moved — the intermediate is no longer reachable');
  for (const [key, hex] of Object.entries(LEFT)) {
    assert.equal(r.colors[key], hex, `plain arm moved MATERIALS.${key}`);
  }
});

/* ------------------------------------------------------------------------------------- T3 */

test('T3 §727: the Smashables mirror stays a mirror in every arm', () => {
  /* Smashables' header: "mirroring Props.MATERIALS so this does not become a fourth clay" —
   * structural since §727 (it reads the table). NOTE for the destructibles-swap lane, which
   * owns Smashables.js as of §727's close: this arm only READS the generated kinds; when the
   * imported set replaces them, updating or retiring this arm belongs to that lane's section. */
  assert.equal(smashMat('crate').color.getHex(), MATERIALS.wood.color, 'smash:wood no longer mirrors MATERIALS.wood');
  assert.equal(smashMat('basket').color.getHex(), MATERIALS.rope.color, 'smash:wicker no longer mirrors MATERIALS.rope');
  assert.equal(smashMat('jar').color.getHex(), MATERIALS.lime.color, 'smash:clay no longer mirrors MATERIALS.lime');
  const r = runChild('tinted');
  assert.equal(r.crate, SHIPPED.wood, 'the reverted crate does not wear the shipped wood tint');
  assert.equal(r.basket, SHIPPED.rope, 'the reverted basket does not wear the shipped rope tint');
});
