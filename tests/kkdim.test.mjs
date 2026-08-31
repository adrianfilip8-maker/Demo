/**
 * kkdim.test.mjs — §740: the axis eight rounds never scored.
 *
 * The owner, on the §739 build: the canopic jars are fixed, and *"All the imported kit kay props
 * still appear to be washed out compared to everything else"*, then *"Only the imported props from
 * that pack seem to be having the issue, nothing else."* So the jars standing on the same table
 * under the same lights are a control he has explicitly accepted, and measured against them the
 * imported props are at SATURATION PARITY and 11 % (day) / 32 % (night) LIGHTER, with 15 of 19
 * bodies above the lightest approved jar at both grades. "Washed out" is bright-and-unsaturated
 * and only the second half of it had ever been measured.
 *
 *   D1  THE DIM IS LINEAR — a light-transport scale belongs in linear, and doing it on the sRGB
 *       bytes would darken the dark channel far more than the bright one and rotate the hue. The
 *       arithmetic is re-derived here by an independent implementation, and the hue is asserted
 *       to survive.
 *   D2  §736's DERIVATION SURVIVES INTACT — `KK_GRADE_BASE` is still 0xe6b073 (K3 re-derives that
 *       from the shipped bytes) and `KK_GRADE` is that value dimmed. §740 changed the derivation's
 *       TARGET, not its arithmetic, and keeping the two apart is what lets K3 keep working.
 *   D3  THE TOKEN REVERTS THIS ALONE — `?kk=nodim` restores §736's grade and leaves the hold; the
 *       four `?kk=` findings compose in any combination. All arms RUN.
 *   D4  THE SCONCES KEEP THE UNDIMMED GRADE, and it does not breach §729 — the rule forbids one
 *       BODY appearing in two grades, and `torch_mounted` has one call site. They are also the one
 *       imported population without the defect: already at or below the masonry on lightness.
 *   D5  `?kk=flat` STILL WINS OVER EVERY OVERRIDE — it is §736's whole-population revert and must
 *       reproduce the pre-§736 bag for every consumer, sconces included.
 *   D6  THE VALUE IS THE SWEPT ONE, and the sweep's shape is on record — including that raising
 *       `KK_HOLD` instead moves lightness the WRONG way, which is what makes this the lever.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
globalThis.self = globalThis;

async function loadKayKit(arm, tokens = {}) {
  const before = globalThis.__KK_AB;
  globalThis.__KK_AB = tokens.kk ?? null;
  const mod = await import(`../src/world/KayKit.js?dimarm=${arm}`);
  globalThis.__KK_AB = before;
  return mod;
}
function recorder() {
  const bags = [];
  return { bags, engine: { get: (k) => (k === 'shading' ? { make: (o) => { bags.push(o); return { isMaterial: true, name: o.name }; } } : null) } };
}
const FAKE_ATLAS = { isTexture: true, uuid: 'fake', name: 'atlas' };
const KKSRC = fs.readFileSync(path.join(ROOT, 'src/world/KayKit.js'), 'utf8');

/* An independent sRGB transfer, so a shared misunderstanding cannot pass. */
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const chan = (h, i) => ((h >> (16 - 8 * i)) & 255) / 255;

/* ------------------------------------------------------------------------------------- D1 */

test('D1 §740: the dim is a LINEAR scale and it does not rotate the hue', async () => {
  const kk = await loadKayKit('d1');
  for (const k of [1, 0.7, 0.5, 0.25]) {
    const got = kk.dimGrade(0xe6b073, k);
    for (let c = 0; c < 3; c++) {
      const want = Math.round(255 * Math.max(0, Math.min(1, l2s(s2l(chan(0xe6b073, c)) * k))));
      assert.equal((got >> (16 - 8 * c)) & 255, want, `channel ${c} at k=${k}`);
    }
  }
  assert.equal(kk.dimGrade(0xe6b073, 1), 0xe6b073, 'k = 1 is an exact identity — §418.3\'s passing input');

  /* The hue must survive, or this is a tint and not a dim. Linear ratios are preserved exactly
     by a scalar multiply; the 8-bit round trip is what this bounds. */
  const dim = kk.dimGrade(0xe6b073, kk.KK_DIM);
  const lin = (h) => [0, 1, 2].map((c) => s2l(chan(h, c)));
  const [ar, ag, ab] = lin(0xe6b073), [br, bg, bb] = lin(dim);
  assert.ok(Math.abs(ag / ar - bg / br) < 0.01, 'G/R ratio must survive the dim');
  assert.ok(Math.abs(ab / ar - bb / br) < 0.01, 'B/R ratio must survive the dim');

  /* §418.3's FAILING input, RUN — and the threshold is the MEASURED magnitude, not a guessed one.
     My first draft of this arm asserted the naive sRGB-space dim rotates the ratios by > 0.03 and
     it went red: at the shipped k = 0.70 the shift is B/R 0.0142 and G/R 0.0071. Real, and four
     times the linear path's own 8-bit rounding, but a third of what I claimed. Asserted at the
     shipped k against the true figure, and again at a deep dim where it is unmissable (k = 0.30:
     B/R 0.0658), because the distortion GROWS as the dim deepens and the next reader may want a
     darker one. */
  const naiveAt = (k) => {
    const nl = [0, 1, 2].map((c) => s2l(Math.round(255 * chan(0xe6b073, c) * k) / 255));
    return { gr: nl[1] / nl[0], br: nl[2] / nl[0] };
  };
  const linErr = Math.abs(ab / ar - bb / br);
  const n70 = naiveAt(0.70), n30 = naiveAt(0.30);
  assert.ok(Math.abs(ab / ar - n70.br) > 4 * linErr && Math.abs(ab / ar - n70.br) > 0.010,
    `the naive dim must shift B/R materially more than the linear path's rounding `
    + `(naive ${Math.abs(ab / ar - n70.br).toFixed(4)} vs linear ${linErr.toFixed(4)})`);
  assert.ok(Math.abs(ab / ar - n30.br) > 0.05,
    'and at a deep dim the naive path is unmistakably a tint rather than a dim');
});

/* ------------------------------------------------------------------------------------- D2 */

test('D2 §740: §736\'s derivation is untouched; §740 dimmed its RESULT, not its arithmetic', async () => {
  const kk = await loadKayKit('d2');
  assert.equal(kk.KK_GRADE_BASE, 0xe6b073, '§736\'s derived grade must stay exactly where K3 re-derives it');
  assert.equal(kk.KK_GRADE, kk.dimGrade(kk.KK_GRADE_BASE, kk.KK_DIM));
  assert.ok(kk.KK_GRADE !== kk.KK_GRADE_BASE, 'and the shipped grade is actually dimmed');

  /* The record of WHY, at the value, so a later reader does not restore §736's target by
     "simplifying" the two constants back into one. */
  assert.match(KKSRC, /the brightest stone in the room/,
    'KK_GRADE must keep the note that §736 targeted paving_courtyard and that was the defect');
});

/* ------------------------------------------------------------------------------------- D3 */

test('D3 §740: ?kk=nodim reverts the dim alone, and all four findings compose', async () => {
  const on = await loadKayKit('d3on');
  const nodim = await loadKayKit('d3nodim', { kk: 'nodim' });
  assert.equal(on.KK_NODIM, false);
  assert.equal(nodim.KK_NODIM, true, '?kk=nodim must be read — RUN');
  assert.equal(nodim.KK_GRADE, nodim.KK_GRADE_BASE, 'and restore §736\'s grade exactly');
  assert.equal(nodim.KK_HOLD, on.KK_HOLD, 'while leaving §738\'s hold alone');

  const all = await loadKayKit('d3all', { kk: 'nodim,nohold' });
  assert.equal(all.KK_NODIM, true);
  assert.equal(all.KK_NOHOLD, true);
  assert.equal(all.KK_GRADE, all.KK_GRADE_BASE);

  const other = await loadKayKit('d3other', { kk: 'nohold' });
  assert.equal(other.KK_NODIM, false, '?kk=nohold must NOT revert the dim');
  assert.ok(other.KK_GRADE !== other.KK_GRADE_BASE);
});

/* ------------------------------------------------------------------------------------- D4 */

test('D4 §740: the sconces keep the undimmed grade; every other consumer takes the dim', async () => {
  const kk = await loadKayKit('d4');
  const r = recorder();
  kk.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'kaykit:atlas');
  kk.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'props:kaykit');
  kk.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'smash:kaykit');
  kk.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'props:kaykit:torch', { shadeHold: kk.TORCH_HOLD, color: kk.TORCH_GRADE });
  const [atlas, props, smash, torch] = r.bags;
  for (const b of [atlas, props, smash]) assert.equal(b.color, kk.KK_GRADE, `${b.name} takes the dim`);
  assert.equal(torch.color, kk.KK_GRADE_BASE, 'the sconces keep §736\'s grade');
  assert.equal(kk.TORCH_GRADE, kk.KK_GRADE_BASE);

  /* §729's rule is that one BODY may not appear in two grades. The three set-dress consumers
     place the same models as each other and must agree; `torch_mounted` has one call site. */
  const strip = (o) => { const { name, ...rest } = o; return rest; };
  assert.deepEqual(strip(smash), strip(atlas), 'the destructibles must not drift from the set dress');
  assert.deepEqual(strip(props), strip(atlas), 'nor Props\' statics');
  const diff = Object.keys(atlas).filter((k) => k !== 'name' && atlas[k] !== torch[k]);
  assert.deepEqual(diff.sort(), ['color', 'shadeHold'],
    'the sconces may differ on the grade and the hold and on NOTHING else');
});

/* ------------------------------------------------------------------------------------- D5 */

test('D5 §740: ?kk=flat still wins over every per-consumer override', async () => {
  const flat = await loadKayKit('d5', { kk: 'flat' });
  const r = recorder();
  flat.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'a');
  flat.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'b', { shadeHold: flat.TORCH_HOLD, color: flat.TORCH_GRADE });
  assert.equal(r.bags[0].color, 0xffffff);
  assert.equal(r.bags[1].color, 0xffffff,
    '§736\'s whole-population revert must reach the sconces too, or ?kk=flat stops meaning what it says');
});

/* ------------------------------------------------------------------------------------- D6 */

test('D6 §740: the dim is the swept value, and the record says why the hold was NOT the lever', async () => {
  const kk = await loadKayKit('d6');
  assert.equal(kk.KK_DIM, 0.70, 'the G070 arm — measured, not interpolated between arms');
  assert.ok(kk.KK_DIM > 0 && kk.KK_DIM <= 1);
  assert.match(KKSRC, /THE VALUE IS SWEPT, NOT INTERPOLATED/,
    'the swept-ness has to stay recorded at the value: §738.8 and §739.9 both record this lane '
    + 'shipping a provisional literal before its sweep, and in §739 that literal was inside a dip');
  assert.match(KKSRC, /0\.540 → 0\.623/,
    'and so does the measurement that killed the other lead — raising KK_HOLD moves prop lightness '
    + 'the WRONG way, so a later reader does not "free up" the cap and undo this');
});
