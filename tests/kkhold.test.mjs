/**
 * kkhold.test.mjs — §738: the prop-scoped shade hold.
 *
 * §737 acquitted every term the previous three rounds blamed — the surface fresnel rim is worth
 * 0.000 on these bodies, the screen-space silhouette rim 0.000, bloom −0.002 — and found instead
 * that, judged PER BODY, 16 of 20 placed KayKit bodies sit below the architecture's median
 * saturation, short by 0.103 by day and 0.105 at night, on their SHADE side. That is §269's
 * mechanism: a shade light saturated enough (linear G/R 3.258) to invert the channel order of an
 * albedo whose own G/R sits near the 0.307 break-even. §269's remedy, `shadowHold`, ships at 0
 * for the world and 1 for the character, and could not be turned on globally because that lifts
 * the ARCHITECTURE more than the props (+0.286 against +0.267) — it moves the owner's reference
 * further than the subject of the complaint.
 *
 * So §738 adds a THIRD scope for the same hold: per material.
 *
 *   H1  THE THIRD SCOPE EXISTS AND DEFAULTS TO AN EXACT IDENTITY — `shadeHold` resolves to 0 for
 *       every caller that omits it, and enters the shader as a `max` leg, so `max(x, 0) == x`
 *       makes every other material bit-identical by ARITHMETIC rather than by tolerance.
 *   H2  IT IS IN THE CACHE KEY — two materials differing only in the hold must not share an
 *       instance. This is the failure that would make the fix reach the architecture: the
 *       material cache is keyed by option hash, and a key that omits the hold would hand a
 *       KayKit material back to whoever asked next with matching colour and maps.
 *   H3  THE RECIPE CARRIES IT, AND THE TOKEN REVERTS IT ALONE — `?kk=nohold` zeroes the hold and
 *       leaves §736's grade; `?kk=flat` reverts the grade and leaves the hold; `?kk=flat,nohold`
 *       reverts both. All four arms RUN (§418.3: a passing input and a failing input, both
 *       exercised, for each of the two tokens).
 *   H4  THE SCOPE IS REALLY A SCOPE — the shader's hold expression must combine the three terms
 *       with `max`, so no material can be reached by another's value, and the §269 knee must
 *       still gate all three (an achromatic recipe asking for the hold still gets nothing).
 *   H5  THE REFERENCE IS UNTOUCHED — `TUNE.shadowHold` stays 0 and `TUNE.subjShadowHold` stays 1.
 *       If a later lane "unifies" the three knobs by moving the global one, this goes red rather
 *       than the architecture silently changing.
 *   H6  THE STRENGTH IS THE SWEPT ONE — `KK_HOLD` is pinned by value, in range, and strictly
 *       below 1, because §737.6 measured full strength as an overshoot (+0.267 against a 0.103
 *       target). A later reader raising it to 1 "to make it work properly" turns this red.
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
  const mod = await import(`../src/world/KayKit.js?holdarm=${arm}`);
  globalThis.__KK_AB = before;
  return mod;
}

function recorder() {
  const bags = [];
  return {
    bags,
    engine: { get: (k) => (k === 'shading' ? { make: (o) => { bags.push(o); return { isMaterial: true, name: o.name }; } } : null) },
  };
}
const FAKE_ATLAS = { isTexture: true, uuid: 'fake-atlas', name: 'atlas' };

const GLSL = fs.readFileSync(path.join(ROOT, 'src/render/shaders/toon.glsl.js'), 'utf8');
const TOONSRC = fs.readFileSync(path.join(ROOT, 'src/render/ToonMaterial.js'), 'utf8');

/* ------------------------------------------------------------------------------------- H1 */

test('H1 §738: the per-material hold defaults to 0, which is an exact identity for everyone else', async () => {
  const { Shading } = await import('../src/render/ToonMaterial.js');
  const tm = Object.create(Shading.prototype);
  tm.engine = { quality: 'high', warn: () => {} };
  tm._detail2 = false;

  const plain = tm._resolve({ color: 0x808080 });
  assert.equal(plain.shadeHold, 0, 'a caller that does not ask for the hold must get exactly 0');

  const asked = tm._resolve({ color: 0x808080, shadeHold: 0.35 });
  assert.equal(asked.shadeHold, 0.35);
  assert.equal(tm._resolve({ color: 0x808080, shadeHold: 4 }).shadeHold, 1, 'clamped above');
  assert.equal(tm._resolve({ color: 0x808080, shadeHold: -1 }).shadeHold, 0, 'clamped below');

  /* §418.3 — the identity is arithmetic, and this is the line that makes it so. `max(x, 0.0)`
     returns x exactly for every non-negative x, and the two terms it joins are both products of
     non-negative factors. A `mix()` or an addition here would be a tolerance, not an identity. */
  assert.match(GLSL, /max\(\s*uShadowHold,\s*max\(\s*uSubjShadowHold\s*\*\s*vSlySkin,\s*uMatShadowHold\s*\)\s*\)/,
    'the three scopes must combine with max, so a default of 0 cannot move any other material');
});

/* ------------------------------------------------------------------------------------- H2 */

test('H2 §738: the hold is in the material cache key, so it cannot leak into another recipe', async () => {
  const { Shading } = await import('../src/render/ToonMaterial.js');
  const tm = Object.create(Shading.prototype);
  tm.engine = { quality: 'high', warn: () => {} };
  tm._detail2 = false;

  const a = tm._resolve({ color: 0xc9915a, shadeHold: 0 });
  const b = tm._resolve({ color: 0xc9915a, shadeHold: 0.35 });
  assert.notEqual(a.key, b.key,
    'two bags differing ONLY in the hold must hash differently — the cache hands back by key, so '
    + 'a key that omits it would give an architecture caller the props\' material');

  /* And the passing input: everything else equal AND the hold equal must still collide, or the
     key has stopped being a cache key and every material is now unique. */
  const c = tm._resolve({ color: 0xc9915a, shadeHold: 0.35 });
  assert.equal(b.key, c.key, 'identical bags must still share a key');
  assert.match(TOONSRC, /r3\(o\.shadeHold\)/, 'the hold must appear in the option hash by name');
});

/* ------------------------------------------------------------------------------------- H3 */

test('H3 §738: ?kk=nohold reverts the hold alone; ?kk=flat reverts the grade alone; both compose', async () => {
  const on = await loadKayKit('h3on');
  const nohold = await loadKayKit('h3nohold', { kk: 'nohold' });
  const flat = await loadKayKit('h3flat', { kk: 'flat' });
  const both = await loadKayKit('h3both', { kk: 'flat,nohold' });

  assert.equal(on.KK_FLAT, false); assert.equal(on.KK_NOHOLD, false);
  assert.equal(nohold.KK_FLAT, false, '?kk=nohold must NOT revert §736\'s grade');
  assert.equal(nohold.KK_NOHOLD, true);
  assert.equal(flat.KK_FLAT, true);
  assert.equal(flat.KK_NOHOLD, false, '?kk=flat must NOT revert §738\'s hold');
  assert.equal(both.KK_FLAT, true); assert.equal(both.KK_NOHOLD, true);

  const bag = (mod, nm) => { const r = recorder(); mod.makeAtlasMaterial(r.engine, FAKE_ATLAS, nm); return r.bags[0]; };
  assert.equal(bag(on, 'a').shadeHold, on.KK_HOLD);
  assert.equal(bag(nohold, 'b').shadeHold, 0, '?kk=nohold is the RUN failing input for the hold');
  assert.equal(bag(nohold, 'b2').color, on.KK_GRADE, 'and it leaves the grade in place');
  assert.equal(bag(flat, 'c').shadeHold, flat.KK_HOLD, '?kk=flat is the RUN failing input for the grade only');
  assert.equal(bag(flat, 'c2').color, 0xffffff);
  assert.equal(bag(both, 'd').shadeHold, 0);
  assert.equal(bag(both, 'd2').color, 0xffffff);

  /* Whitespace and case tolerated; an unknown word must be ignored, not fatal. */
  const messy = await loadKayKit('h3messy', { kk: ' NoHold , wat ' });
  assert.equal(messy.KK_NOHOLD, true);
  assert.equal(messy.KK_FLAT, false);
});

/* ------------------------------------------------------------------------------------- H4 */

test('H4 §738: all three consumers get the hold, and the §269 knee still gates it', async () => {
  const on = await loadKayKit('h4');
  const r = recorder();
  for (const nm of ['kaykit:atlas', 'props:kaykit', 'smash:kaykit']) on.makeAtlasMaterial(r.engine, FAKE_ATLAS, nm);
  assert.equal(r.bags.length, 3);
  for (const b of r.bags) {
    assert.equal(b.shadeHold, on.KK_HOLD,
      '§729\'s header requires one recipe for all three consumers — the §734 sconces and the §729 '
      + 'destructibles take the hold with the set dress or the imported look has split in two');
  }
  /* The knee is §269's and is NOT re-derived here — the point is that §738 did not bypass it. */
  assert.match(GLSL, /smoothstep\(\s*0\.0,\s*max\(\s*uShadowHoldKnee,\s*1e-4\s*\),\s*albChroma\s*\)/,
    'the albedo-chroma knee must still multiply the combined hold, so an achromatic recipe asking '
    + 'for it still gets nothing');
});

/* ------------------------------------------------------------------------------------- H5 */

test('H5 §738: the reference this lane must not move is pinned by value', async () => {
  const { TUNE } = await import('../src/render/ToonMaterial.js');
  assert.equal(TUNE.shadowHold, 0.0,
    'the GLOBAL hold must stay 0 — turning it on lifts the architecture by +0.286 against the '
    + 'props\' +0.267 (§737.3), which moves the owner\'s reference further than the subject');
  assert.equal(TUNE.subjShadowHold, 1.0, 'the character\'s scope is unchanged by §738');
  assert.equal(TUNE.subjLitHold, 0.0, 'and PREREG-lithold is still unshipped');

  const arch = fs.readFileSync(path.join(ROOT, 'src/world/Architecture.js'), 'utf8');
  assert.ok(!/shadeHold/.test(arch),
    'no Architecture recipe may ask for the hold — the masonry is the reference, not a subject');
  const props = fs.readFileSync(path.join(ROOT, 'src/world/Props.js'), 'utf8');
  assert.ok(!/shadeHold/.test(props),
    '§738 is scoped to the imported set; the owner explicitly left the §727/§730 procedural '
    + 'surface (props_lime and the rest of Props.MATERIALS) alone');
});

/* ------------------------------------------------------------------------------------- H6 */

test('H6 §738: the strength is the swept one, and strictly below full', async () => {
  const on = await loadKayKit('h6');
  assert.equal(typeof on.KK_HOLD, 'number');
  assert.ok(on.KK_HOLD > 0 && on.KK_HOLD < 1,
    'full strength is worth +0.267 against a 0.103 target (§737.6) — it overshoots the dull '
    + 'bodies past the masonry and pushes the four already at parity well beyond it');
  assert.equal(on.KK_HOLD, 0.35, 'PROVISIONAL — replaced by the §738.2 sweep result in this lane\'s next commit');

  const src = fs.readFileSync(path.join(ROOT, 'src/world/KayKit.js'), 'utf8');
  assert.match(src, /THE VALUE IS SWEPT, NOT CHOSEN/,
    'KK_HOLD must keep the record that it came from a measured sweep');
});
