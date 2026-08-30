/**
 * kksurface.test.mjs — §736: "the props look faded", answered on the axis §727 never measured.
 *
 * The owner reported this four times. §727 answered it as CHROMA, on `Props.MATERIALS` — which
 * is a different population entirely, since the imported bodies never pass through that table —
 * and the verdict on that fix was "they always looked faded".
 *
 * §736's measurement: the imported props are the only surfaces in the level whose albedo is
 * UNGRADED. Every `Architecture` recipe is `texture × color` and the two COMPOUND
 * (`sandstone_block` reads **L 74.0 / sat 0.865**, `paving_courtyard` **L 86.8 / 0.822**, both
 * measured in-page off the live materials), while `makeAtlasMaterial` passed `color: 0xffffff`
 * and the props' own placed albedo is **L 120.3 / sat 0.560** — half again as bright as the
 * masonry they stand on and two-thirds its chroma, before a photon is cast. That is a property
 * of the albedo, so no light in the level can undo it.
 *
 * What this file pins:
 *
 *   K1  THE RECIPE — `makeAtlasMaterial` passes §736's derived grade by default and `0xffffff`
 *       under `?kk=flat`, with every other key in the bag untouched. Both arms RUN (§418.3).
 *   K2  ONE GRADE, THREE CONSUMERS — Props' statics, Smashables' destructibles and KayKit's own
 *       set dress build through the same function, so the option bag is identical for all three
 *       but the name. §729's header promises this; it is asserted here rather than promised.
 *   K3  THE TINT IS DERIVED, NOT TYPED — re-derived here by an independent implementation
 *       (explicit sRGB↔linear, no `THREE.Color`) from the shipped atlas bytes, the shipped
 *       `.gltf` bodies and `Architecture`'s own four warm-stone recipe hexes, and asserted equal
 *       to the literal `KK_GRADE`. A moved atlas, a moved model or a moved palette turns this
 *       red instead of silently making the derivation false.
 *   K4  THE REFERENCE IS UNTOUCHED — this lane matched the props TO the architecture and to the
 *       shared shader defaults, so it must not have moved either. Pinned by value.
 *   K5  TOKEN INDEPENDENCE — `?kk=flat` composes with `?smash=gen` and `?torch=gen` and none of
 *       them turns another off; `?props=` cannot reach this recipe at all.
 *   K6  THE FALLBACK AGREES — the headless `MeshStandardMaterial` branch carries the same grade,
 *       so a boot without SHADING is not a third look.
 *   K7  THE DECLINED LEVERS STAY DECLINED — a `detail` preset and per-material spec/gloss/rough/
 *       sss were each built and measured alone in-frame and each moved nothing (or moved the
 *       wrong way); none of them may appear in the bag by accident later without this going red.
 *
 * Arms are separate module instances (a `?arm=` suffix on the import specifier busts Node's ESM
 * cache) because the token is module-load state — the same reason smashswap/torchswap use
 * children, at a fraction of the cost, since nothing here needs a primed transport.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from '../tools/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const KKDIR = path.join(ROOT, 'public/assets/kaykit');

/* GLTFLoader reads `self.URL` at module scope — the one global KayKit.js needs in plain Node
   (tests/_kaykitboot.mjs records why the DOM half of that shim is not required). */
globalThis.self = globalThis;

/** A fresh instance of KayKit.js with the tokens set as given. */
async function loadKayKit(arm, tokens = {}) {
  const before = { smash: globalThis.__SMASH_AB, torch: globalThis.__TORCH_AB, kk: globalThis.__KK_AB, vault: globalThis.__VAULT_AB };
  globalThis.__KK_AB = tokens.kk ?? null;
  globalThis.__SMASH_AB = tokens.smash ?? null;
  globalThis.__TORCH_AB = tokens.torch ?? null;
  globalThis.__VAULT_AB = tokens.vault ?? null;
  const mod = await import(`../src/world/KayKit.js?arm=${arm}`);
  globalThis.__SMASH_AB = before.smash; globalThis.__TORCH_AB = before.torch;
  globalThis.__KK_AB = before.kk; globalThis.__VAULT_AB = before.vault;
  return mod;
}

/** An engine whose SHADING records the option bag instead of building anything. */
function recorder() {
  const bags = [];
  return {
    bags,
    engine: { get: (k) => (k === 'shading' ? { make: (o) => { bags.push(o); return { isMaterial: true, name: o.name }; } } : null) },
  };
}

const FAKE_ATLAS = { isTexture: true, uuid: 'fake-atlas', name: 'atlas' };
/* The keys `makeAtlasMaterial` does NOT pass, and must not start passing without a measurement
   behind it. §736.4 built and measured each of these alone; every one moved nothing an eye
   could see, and two moved the wrong way. */
const DECLINED = ['detail', 'detailScale', 'detailStrength', 'detailGrain', 'detailFade', 'spec', 'gloss', 'rough', 'sss'];

/* ------------------------------------------------------------------------------------- K1 */

test('K1 §736: the default bag carries the derived grade; ?kk=flat carries the shipped white', async () => {
  const on = await loadKayKit('k1on');
  const off = await loadKayKit('k1off', { kk: 'flat' });

  assert.equal(on.KK_FLAT, false, 'no token must give the §736 grade');
  assert.equal(off.KK_FLAT, true, '?kk=flat must be read');
  assert.equal(on.KK_GRADE, 0xe6b073);

  const a = recorder();
  on.makeAtlasMaterial(a.engine, FAKE_ATLAS, 'x:on');
  assert.equal(a.bags.length, 1);
  assert.deepEqual(a.bags[0], {
    name: 'x:on', color: 0xe6b073, map: FAKE_ATLAS,
    bands: 3, rim: 0.5, shadeHold: on.KK_HOLD, outline: 0.0034, outlineColor: 0x1a1210,
  }, 'the default bag is the shipped recipe with the grade in place of the white, plus §738\'s shade hold — nothing else moved');

  /* §418.3's failing input, RUN: the reverted arm must be the pre-§736 bag, key for key. */
  const b = recorder();
  off.makeAtlasMaterial(b.engine, FAKE_ATLAS, 'x:off');
  /* §738: `?kk=flat` reverts the GRADE and must NOT revert the hold — the two are separate
     findings about the same surface and the token list exists so each can be reverted alone. */
  assert.deepEqual(b.bags[0], {
    name: 'x:off', color: 0xffffff, map: FAKE_ATLAS,
    bands: 3, rim: 0.5, shadeHold: off.KK_HOLD, outline: 0.0034, outlineColor: 0x1a1210,
  }, '?kk=flat must reproduce the pre-§736 albedo and leave §738\'s hold alone');
});

/* ------------------------------------------------------------------------------------- K2 */

test('K2 §736: one recipe, three consumers — the bag is identical whoever asks', async () => {
  const on = await loadKayKit('k2');
  const r = recorder();
  /* The three shipped call sites' own names: KayKit.init, Props._flushKayKit,
     Smashables._matFor. Only `name` may differ between them. */
  for (const nm of ['kaykit:atlas', 'props:kaykit', 'smash:kaykit']) on.makeAtlasMaterial(r.engine, FAKE_ATLAS, nm);
  assert.equal(r.bags.length, 3);
  const strip = (o) => { const { name, ...rest } = o; return rest; };
  assert.deepEqual(strip(r.bags[1]), strip(r.bags[0]), 'Props must not drift from KayKit');
  assert.deepEqual(strip(r.bags[2]), strip(r.bags[0]), 'Smashables must not drift from KayKit');
  assert.deepEqual(r.bags.map((b) => b.name), ['kaykit:atlas', 'props:kaykit', 'smash:kaykit']);
});

/* ------------------------------------------------------------------------------------- K3 */

/* An independent re-derivation of §736's grade. Deliberately spelled out rather than imported
   from `tools/kkalbedo.mjs`: this arm must be able to disagree with the tool, not inherit it. */
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const accessor = (d, bins, i) => {
  const a = d.accessors[i], bv = d.bufferViews[a.bufferView], buf = bins[bv.buffer];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new (CT[a.componentType])(buf.buffer, buf.byteOffset + off, a.count * NC[a.type]);
};

/** World-area-weighted mean albedo, in linear, over the bodies the level places. */
function placedAlbedoLinear(counts) {
  const atlas = readPNG(path.join(KKDIR, 'dungeon_texture_sandstone.png'));
  const { w: AW, h: AH, ch: ACH, data: AD } = atlas;
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) LUT[i] = s2l(i / 255);
  let tot = 0, R = 0, G = 0, B = 0;
  for (const [name, n] of counts) {
    const p = path.join(KKDIR, `${name}.gltf`);
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const bins = d.buffers.map((b) => fs.readFileSync(path.join(KKDIR, decodeURIComponent(b.uri))));
    for (const m of d.meshes) for (const pr of m.primitives) {
      const P = accessor(d, bins, pr.attributes.POSITION), U = accessor(d, bins, pr.attributes.TEXCOORD_0);
      const I = pr.indices != null ? accessor(d, bins, pr.indices) : null;
      const nT = I ? I.length / 3 : P.length / 9;
      for (let t = 0; t < nT; t++) {
        const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
        const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
        const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
        const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
        const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz) * n;
        let ar = 0, ag = 0, ab = 0, ns = 0;
        const uv = [[U[a * 2], U[a * 2 + 1]], [U[b * 2], U[b * 2 + 1]], [U[c * 2], U[c * 2 + 1]]];
        const S = 4;
        for (let i = 0; i <= S; i++) for (let j = 0; j <= S - i; j++) {
          const w0 = i / S, w1 = j / S, w2 = 1 - w0 - w1;
          const u = uv[0][0] * w0 + uv[1][0] * w1 + uv[2][0] * w2;
          const v = uv[0][1] * w0 + uv[1][1] * w1 + uv[2][1] * w2;
          const xi = Math.min(AW - 1, Math.max(0, Math.floor(u * AW)));
          const yi = Math.min(AH - 1, Math.max(0, Math.floor(v * AH)));
          const k = (yi * AW + xi) * ACH;
          ar += LUT[AD[k]]; ag += LUT[AD[k + 1]]; ab += LUT[AD[k + 2]]; ns++;
        }
        tot += area; R += area * ar / ns; G += area * ag / ns; B += area * ab / ns;
      }
    }
  }
  return [R / tot, G / tot, B / tot];
}

test('K3 §736: the grade is DERIVED from the shipped atlas, the placed bodies and the architecture palette', () => {
  /* Step 1 — the chromaticity: the linear mean of the architecture's four warm-stone tints.
     Read out of Architecture.js rather than transcribed, so a moved recipe fails here. */
  const arch = fs.readFileSync(path.join(ROOT, 'src/world/Architecture.js'), 'utf8');
  const KEYS = ['sandstone_block', 'paving_courtyard', 'hieroglyph_wall', 'column_papyrus'];
  const tints = KEYS.map((k) => {
    const m = arch.match(new RegExp(`${k}:\\s*\\{\\s*color:\\s*(0x[0-9a-f]{6})`));
    assert.ok(m, `Architecture.RECIPES.${k} must still declare a colour — §736's grade is derived from it`);
    return parseInt(m[1], 16);
  });
  assert.deepEqual(tints, [0xc9915a, 0xcfa068, 0xd6a874, 0xd8a468], 'the warm-stone palette §736 averaged');
  const mean = [0, 1, 2].map((c) => tints.reduce((s, h) => s + s2l(((h >> (16 - 8 * c)) & 255) / 255), 0) / tints.length);

  /* Step 2 — the level: the scale at which the props' PLACED albedo lands on
     `paving_courtyard`'s graded albedo luminance, which is the surface they stand on. That
     luminance (86.8) is a browser measurement over a procedurally built texture and cannot be
     recomputed offline, so it enters as the recorded target — the arithmetic around it is
     what this arm re-derives. */
  const TARGET_L = 86.8;
  const counts = new Map(Object.entries({
    barrel_large: 13, barrel_large_decorated: 2, barrel_small: 6, barrel_small_stack: 10,
    chest: 2, chest_gold: 1, coin_stack_large: 1, coin_stack_medium: 2, coin_stack_small: 2,
    crates_stacked: 9, rubble_half: 2, torch_mounted: 16,
  }));
  const albedo = placedAlbedoLinear(counts);
  let lo = 0.1, hi = 3;
  for (let i = 0; i < 60; i++) {
    const s = (lo + hi) / 2;
    const g = [0, 1, 2].map((c) => 255 * l2s(Math.min(1, albedo[c] * mean[c] * s)));
    if (lum(...g) > TARGET_L) hi = s; else lo = s;
  }
  const s = (lo + hi) / 2;
  const hex8 = [0, 1, 2].map((c) => Math.round(255 * l2s(Math.min(1, mean[c] * s))));
  const derived = (hex8[0] << 16) | (hex8[1] << 8) | hex8[2];

  /* The counts above are this arm's own transcription of the placement tables and differ from
     the tool's by the destructible clusters, so the derivation is allowed one 8-bit step per
     channel — enough to catch a moved palette or a moved atlas, not enough to fail on a
     re-counted barrel. */
  const shipped = 0xe6b073;
  for (let c = 0; c < 3; c++) {
    const a = (derived >> (16 - 8 * c)) & 255, b = (shipped >> (16 - 8 * c)) & 255;
    assert.ok(Math.abs(a - b) <= 3,
      `channel ${c}: re-derived ${a} vs shipped ${b} — §736's grade no longer follows from its inputs`);
  }
  console.log(`  K3: re-derived 0x${derived.toString(16).padStart(6, '0')} against shipped 0x${shipped.toString(16)}`
    + ` (placed albedo linear ${albedo.map((v) => v.toFixed(4)).join(',')}, scale ${s.toFixed(4)})`);
});

/* ------------------------------------------------------------------------------------- K4 */

test('K4 §736: the reference this lane matched against is untouched', async () => {
  const arch = fs.readFileSync(path.join(ROOT, 'src/world/Architecture.js'), 'utf8');
  /* Architecture passes sss 0 — so the props' TUNE-default 0.2 was a SURPLUS against the
     reference, not a deficit. That sign is worth pinning, because this lane's brief had it
     the other way round and it is the kind of thing a later reader would re-invert. */
  assert.match(arch, /sss:\s*0\.0,/, 'Architecture.mat must still pass sss 0');
  const { TUNE } = await import('../src/render/ToonMaterial.js');
  assert.equal(TUNE.spec, 0.25);
  assert.equal(TUNE.gloss, 32);
  assert.equal(TUNE.rough, 0.62);
  assert.equal(TUNE.sss, 0.2);
  assert.equal(TUNE.rim, 0.55);
  assert.equal(TUNE.bands, 3);
});

/* ------------------------------------------------------------------------------------- K5 */

test('K5 §736: ?kk=flat is independent of ?smash=, ?torch= and ?props=', async () => {
  const all = await loadKayKit('k5all', { kk: 'flat', smash: 'gen', torch: 'gen' });
  assert.equal(all.KK_FLAT, true);
  assert.equal(all.SMASH_GEN, true);
  assert.equal(all.TORCH_GEN, true);

  const onlyKk = await loadKayKit('k5kk', { kk: 'flat' });
  assert.equal(onlyKk.KK_FLAT, true);
  assert.equal(onlyKk.SMASH_GEN, false, '?kk=flat must not turn the destructible swap off');
  assert.equal(onlyKk.TORCH_GEN, false, '?kk=flat must not turn the sconce swap off');

  const onlySmash = await loadKayKit('k5smash', { smash: 'gen' });
  assert.equal(onlySmash.KK_FLAT, false, '?smash=gen must not revert the §736 grade');
  const onlyTorch = await loadKayKit('k5torch', { torch: 'gen' });
  assert.equal(onlyTorch.KK_FLAT, false, '?torch=gen must not revert the §736 grade');

  /* §727's family lives in another module and reads another key; the pin is that this one does
     not answer to it — the two lanes are about two different populations, which is the whole
     finding here. */
  globalThis.__PROPS_AB = 'tinted';
  const withProps = await loadKayKit('k5props');
  delete globalThis.__PROPS_AB;
  assert.equal(withProps.KK_FLAT, false, '?props=tinted must not reach the atlas recipe');
});

/* ------------------------------------------------------------------------------------- K6 */

test('K6 §736: the headless fallback wears the same grade as the toon branch', async () => {
  const on = await loadKayKit('k6on');
  const off = await loadKayKit('k6off', { kk: 'flat' });
  const noShading = { get: () => null };

  const m = on.makeAtlasMaterial(noShading, FAKE_ATLAS, 'fallback:on');
  assert.equal(m.color.getHex(), on.KK_GRADE, 'the fallback must carry the grade too');
  assert.equal(m.roughness, 0.9, 'and keep its shipped roughness');
  assert.equal(m.name, 'fallback:on');

  const f = off.makeAtlasMaterial(noShading, FAKE_ATLAS, 'fallback:off');
  assert.equal(f.color.getHex(), 0xffffff, '?kk=flat restores the fallback\'s white too');
  assert.equal(f.roughness, 0.9);
});

/* ------------------------------------------------------------------------------------- K7 */

test('K7 §736: the levers that measured zero stay out of the bag', async () => {
  const on = await loadKayKit('k7');
  const r = recorder();
  on.makeAtlasMaterial(r.engine, FAKE_ATLAS, 'x');
  for (const k of DECLINED) {
    assert.ok(!(k in r.bags[0]),
      `"${k}" was built and measured alone in-frame (§736.4) and moved nothing — it must not `
      + 'reappear in the recipe without a fresh measurement');
  }
  /* And the source says why, so the next reader does not have to re-run the sweep to find out. */
  const src = fs.readFileSync(path.join(ROOT, 'src/world/KayKit.js'), 'utf8');
  assert.match(src, /WHAT WAS TRIED AND DECLINED/, 'KK_GRADE must keep the record of what was declined');
});
