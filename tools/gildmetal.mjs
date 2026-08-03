#!/usr/bin/env node
/* gildmetal — the `hieroglyph_gilded` metalness arm. Pre-registered in PREREG-gild.md.
 *
 * ONE boot, three arms, poked live on `uMetal` of the material named `arch:hieroglyph_gilded`
 * (ToonMaterial keeps the per-material uniform object on `mat.userData.slyUniforms`, and
 * onBeforeCompile Object.assigns that same object into the program, so a poke is live).
 *
 * Why within-boot: two boots can differ for reasons that have nothing to do with the knob.
 * Why `step(n, 0)`: Debug.js's own warning — at the default dt two arms in one boot render at
 * different animation phases, and a gold-bloom sweep was already voided when its DUPLICATE arm
 * moved more pixels than its strongest real arm (KNOWN_ISSUES §28). Every step here pins dt=0,
 * and arm `base2` exists solely to prove that pin held: it must differ from `base` by 0 px.
 *
 * Arms: base 0.85 -> base2 0.85 (noise floor) -> lo 0.45 -> restore 0.85 (must re-equal base).
 *
 * usage: node tools/gildmetal.mjs [shot]        default: hero
 */
import { withGame, grab, ROOT } from './harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SHOT = process.argv[2] || 'hero';
const OUT = path.join(ROOT, 'shots', 'gild');
const TARGET = 'arch:hieroglyph_gilded';
const BASE = 0.85, LO = 0.45;

/* Materials that MUST NOT move — the pre-registered bit-identity control. */
const CONTROL = ['arch:gold_leaf', 'arch:bronze_dark', 'props_gold', 'props_bronze'];

await mkdir(OUT, { recursive: true });

const res = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  /* ---- inventory: never poke a name without proving it exists and what it holds ---- */
  const inv = await page.evaluate(() => {
    const seen = new Map();
    window.__ENGINE.scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) {
        if (!m?.name || seen.has(m.name)) continue;
        seen.set(m.name, {
          hasSly: !!m.userData?.slyUniforms,
          metal: m.userData?.slyUniforms?.uMetal?.value ?? null,
          spec: m.userData?.slyUniforms?.uSpec?.value ?? null,
          rim: m.userData?.slyUniforms?.uRim?.value ?? null,
          hasMetalMap: !!m.metalnessMap,
        });
      }
    });
    return Object.fromEntries(seen);
  });

  console.log('\nmaterial inventory (metal-bearing):');
  for (const [k, v] of Object.entries(inv)) {
    if (v.metal == null || v.metal === 0) continue;
    console.log(`  ${k.padEnd(26)} uMetal ${String(v.metal).padEnd(6)} uSpec ${String(v.spec).padEnd(6)} uRim ${String(v.rim ?? '-').padEnd(7)} metalnessMap ${v.hasMetalMap}`);
  }
  if (!inv[TARGET]) throw new Error(`${TARGET} not present — nothing to poke`);
  if (!inv[TARGET].hasSly) throw new Error(`${TARGET} has no slyUniforms (toon factory absent?) — the poke would be a silent no-op`);
  console.log(`\ntarget ${TARGET}: uMetal ${inv[TARGET].metal}, metalnessMap ${inv[TARGET].hasMetalMap}`);
  if (!inv[TARGET].hasMetalMap) {
    console.log('  !! no metalnessMap — slyMetal is UNMASKED, so this poke moves the whole material,');
    console.log('     not the 11% gild mask. The population claim in PREREG-gild.md would not hold.');
  }

  /* Poke returns the value it actually set, read back from the uniform. */
  const poke = (v) => page.evaluate((val) => {
    let n = 0, got = null;
    window.__ENGINE.scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) {
        if (m?.name !== 'arch:hieroglyph_gilded') continue;
        const u = m.userData?.slyUniforms?.uMetal;
        if (!u) continue;
        u.value = val; got = u.value; n++;
      }
    });
    return { n, got };
  }, v);

  await page.evaluate(async (s) => { await window.__GAME.setShot(s); }, SHOT);
  // Settle with the clock PINNED so nothing phase-dependent moves between arms.
  await page.evaluate(async () => { await window.__GAME.step(6, 0); });

  const arms = [];
  const shoot = async (label, value) => {
    if (value !== null) {
      const p = await poke(value);
      if (p.n === 0) throw new Error(`poke(${value}) matched 0 materials`);
      if (p.got !== value) throw new Error(`poke(${value}) read back ${p.got}`);
    }
    await page.evaluate(async () => { await window.__GAME.step(3, 0); });
    const r = await page.evaluate(() => ({
      png: window.__GAME.capture(),
      stats: { ...window.__ENGINE.stats },
      metal: (() => { let v = null; window.__ENGINE.scene.traverse((o) => {
        const m = o.material; if (m?.name === 'arch:hieroglyph_gilded') v = m.userData?.slyUniforms?.uMetal?.value; }); return v; })(),
    }));
    const file = path.join(OUT, `${SHOT}-${label}.png`);
    await writeFile(file, Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`  ✓ ${label.padEnd(8)} uMetal ${String(r.metal).padEnd(6)} draws ${r.stats.drawCalls} tris ${(r.stats.triangles / 1000) | 0}k -> ${path.relative(ROOT, file)}`);
    arms.push({ label, file, metal: r.metal });
  };

  console.log(`\ncapturing ${SHOT} (dt pinned to 0 on every step):`);
  await shoot('base', BASE);
  await shoot('base2', null);          // noise floor: must be 0 px vs base
  await shoot('lo', LO);
  await shoot('restore', BASE);        // must re-equal base

  return { arms, inv, warnings: info.warnings, consoleErrors: info.consoleErrors };
});

await writeFile(path.join(OUT, 'arms.json'), JSON.stringify(res, null, 2));
console.log(`\n→ ${path.relative(ROOT, OUT)}/  (${res.arms.length} arms)`);
console.log('next: node tools/gilddiff.mjs');
