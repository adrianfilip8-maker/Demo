#!/usr/bin/env node
/* caneswap — score PREREG-caneswap.md: the §294 cane swap, verified on real pixels.
 *
 * ONE boot, two shots (sly-closeup, sly-key), every snap `setShot(..., { dt: 0 })` (§251).
 * B1 reads the live scene (geometry counts, boot warn line, decoded albedo); B2 is the
 * canegold I3 mask pattern — recolour the cane material, count moved pixels, restore, prove
 * the restore is bit-exact. Frames land in shots/caneswap/ for the B3 LOOK (prose, in the
 * RESULT, read by a human-shaped eyeball — this tool does not score B3).
 *
 * usage: node tools/caneswap.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withGame, ROOT } from './harness.mjs';

const SHOTS = ['sly-closeup', 'sly-key'];
const OUT = path.join(ROOT, 'shots/caneswap');
mkdirSync(OUT, { recursive: true });

const out = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  /* ---- I1 / B1: the boot and the live scene ---------------------------------------- */
  const boot = {
    warnDrop: info.warnings.find((w) => w.includes('staff submesh dropped')) || null,
    warnAsset: info.warnings.filter((w) => w.includes('CaneAsset:')),
    consoleErrors: info.consoleErrors.slice(),
    renderer: info.renderer,
  };

  const probe = await page.evaluate(() => {
    let cane = null;
    window.__ENGINE.scene.traverse((o) => { if (o.name === 'cane') cane = o; });
    if (!cane) return { err: 'no mesh named "cane" in the scene' };
    const g = cane.geometry;
    const mats = Array.isArray(cane.material) ? cane.material : [cane.material];
    const m = mats.find((x) => x && x.name === 'slydlrig:cane') || mats[0];
    g.computeBoundingBox();
    return {
      pos: g.attributes.position.count,
      idx: g.index ? g.index.count : null,
      groups: g.groups?.length ?? 0,
      bbox: { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() },
      matName: m?.name ?? null,
      hasMap: !!m?.map,
      mapW: m?.map?.image?.width ?? null,
      mapH: m?.map?.image?.height ?? null,
    };
  });

  /* ---- in-page rig: snap + diff + tag, the canegold shapes ------------------------- */
  await page.evaluate(() => {
    const W = window;
    W.__CAP = {};
    W.__mats = (name) => {
      const out = [];
      W.__ENGINE.scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) if (m && m.name === name) out.push(m);
      });
      return out;
    };
    W.__tagColor = (name, hex) => {
      const out = [];
      for (const m of W.__mats(name)) { out.push(m.color.getHex()); m.color.setHex(hex); }
      return out;
    };
    W.__restoreColor = (name, hexes) => { let i = 0; for (const m of W.__mats(name)) m.color.setHex(hexes[i++]); };
    W.__snap = async (key, shot) => {
      await W.__GAME.setShot(shot, { dt: 0 });
      const url = W.__GAME.capture('image/png', 1.0, 0);
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      W.__CAP[key] = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      return url;
    };
    W.__diff = (a, b) => {
      const A = W.__CAP[a], B = W.__CAP[b];
      let n = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        if (A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2]) n++;
      }
      return n;
    };
  });

  /* ---- B2 per shot: base -> tag -> restore ------------------------------------------ */
  const shots = {};
  for (const shot of SHOTS) {
    const baseUrl = await page.evaluate(([s]) => window.__snap('base', s), [shot]);
    writeFileSync(path.join(OUT, `${shot}.png`), Buffer.from(baseUrl.slice(baseUrl.indexOf(',') + 1), 'base64'));
    await page.evaluate(([s]) => {
      window.__HEX = window.__tagColor('slydlrig:cane', 0xff00ff);
      return window.__snap('tag', s);
    }, [shot]);
    const mask = await page.evaluate(() => window.__diff('base', 'tag'));
    await page.evaluate(([s]) => {
      window.__restoreColor('slydlrig:cane', window.__HEX);
      return window.__snap('restore', s);
    }, [shot]);
    const restore = await page.evaluate(() => window.__diff('base', 'restore'));
    shots[shot] = { mask, restore };
    console.log(`${shot}: cane mask ${mask} px, restore diff ${restore} px  -> ${path.join('shots/caneswap', `${shot}.png`)}`);
  }
  return { boot, probe, shots };
});

/* ================= score PREREG-caneswap §2 ================= */
console.log(`\nrenderer: ${out.boot.renderer}`);
console.log(`boot warn: ${out.boot.warnDrop}`);
if (out.boot.warnAsset.length) console.log(`CaneAsset warnings: ${JSON.stringify(out.boot.warnAsset)}`);
console.log(`console errors (${out.boot.consoleErrors.length}): ${JSON.stringify(out.boot.consoleErrors)}`);
console.log(`cane probe: ${JSON.stringify(out.probe)}\n`);

const caneFetchBroken = out.boot.warnAsset.length > 0
  || out.boot.consoleErrors.some((e) => /sly-cane/i.test(e));
const bars = {
  I1_boot: !out.probe.err && !caneFetchBroken,
  B1a_geometry: out.probe.pos === 306 && out.probe.idx === 774,
  B1b_warnline: /sly-cane\.glb \(§294\) socketed to handR/.test(out.boot.warnDrop || ''),
  B1c_albedo: out.probe.hasMap === true && out.probe.mapW === 1024,
  'B2_mask_sly-closeup': out.shots['sly-closeup'].mask > 200 && out.shots['sly-closeup'].mask < 40000,
  'B2_mask_sly-key': out.shots['sly-key'].mask > 200 && out.shots['sly-key'].mask < 40000,
  'B2_restore_sly-closeup': out.shots['sly-closeup'].restore === 0,
  'B2_restore_sly-key': out.shots['sly-key'].restore === 0,
};
for (const [k, v] of Object.entries(bars)) console.log(`  ${k.padEnd(24)} ${v ? 'PASS' : 'FAIL'}`);
const voided = !bars.I1_boot || !bars['B2_restore_sly-closeup'] || !bars['B2_restore_sly-key'];
const mech = bars.B1a_geometry && bars.B1b_warnline && bars.B1c_albedo
  && bars['B2_mask_sly-closeup'] && bars['B2_mask_sly-key'];
console.log(voided ? '\nVOID (instrument) — fix and rerun; B3 not scored'
  : mech ? '\nmechanical bars PASS — B3 (LOOK) is scored by reading the frames, in the RESULT'
    : '\nNOT-VERIFIED on the mechanical bars — see FAILs above; B3 moot until they hold');
