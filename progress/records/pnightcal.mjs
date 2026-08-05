/**
 * pnightcal — PREREG-pnightcal.md §8. The successor P-night capture: `night` only, five
 * arms, one boot.
 *
 * This is progress/records/pnight1.mjs with FOUR changes, enumerated (§122.1):
 *   1. ARM TABLE per PREREG-pnightcal §4: `rimfloor0` is GONE (a rim-removal state is
 *      blind-spot bait for a hue statistic — §156.2's whole finding) and `sbm020` is added,
 *      so both known-bads sit on the SAME AXIS as the acceptance, at 2x and 4x the §119.4
 *      ledger ceiling (~0.10, temple binds). The compose arm is unchanged
 *      (PREREG-compose1's values: sbm/Lit 0.10, fillSkyMix 0).
 *   2. OUT is durable: progress/records/pnightcal/frames/. §161.1 — the pnight1 run
 *      survived the rollback only because its frames had been swept; this one cannot need
 *      sweeping. The blast radius of a rollback is fixed before the capture starts.
 *   3. The lever probe drops the uRimShadowFloorArch liveness assertion down to a report
 *      (no arm pokes it; ship 0.55 is asserted in readback instead) and keeps the
 *      fill/sbm probes that the arms DO use.
 *   4. Provenance carries the prereg name and the arm md5s, so the scorer can bind frames
 *      to this exact run.
 *
 * Everything else — withGame (which serialises via tools/lock.mjs's FIFO acquire), the
 * absolute-values-per-arm poke (order-independent), per-arm readback with a loud mismatch
 * list (V2), dt=0 stepping, the ship-value restore, and the src-tree stamps (§121.4: hash
 * the tree, not the SHA) — is pnight1.mjs verbatim. This harness NAVIGATES ONCE, so §124.4
 * applies in its §159.1-qualified form: arms are live pokes of one page and a mid-run tree
 * edit cannot enter them; V4 stamps it anyway.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/pnightcal/frames';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  `find /home/user/Demo/src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();
const renderHash = () => execSync(
  `find /home/user/Demo/src/render -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();

const PROV = {
  prereg: 'PREREG-pnightcal.md',
  startedAt: new Date().toISOString(),
  sha: execSync('git -C /home/user/Demo rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  dirty: execSync('git -C /home/user/Demo status --porcelain', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  srcTreeBefore: treeHash(),
  renderTreeBefore: renderHash(),
};
log(`provenance sha ${PROV.sha}  srcTree ${PROV.srcTreeBefore}  renderTree ${PROV.renderTreeBefore}  dirty ${PROV.dirty.length} file(s)`);

/* Ship values, restated so a readback mismatch is loud rather than silent. */
const SHIP = { fillSkyMix: 0.70, shadowBounceMix: 0.05, shadowBounceMixLit: 0.05, rimShadowFloorArch: 0.55 };

/* PREREG-pnightcal §4. Known-bads by the LEDGER'S commitment (§119.4 ceiling ~0.10), on the
   acceptance's own axis; the treatment; two bit-identity controls. */
const NIGHT_ARMS = [
  ['base', {}],
  ['sbm020', { shadowBounceMix: 0.20, shadowBounceMixLit: 0.20 }],
  ['sbm040', { shadowBounceMix: 0.40, shadowBounceMixLit: 0.40 }],
  ['compose', { shadowBounceMix: 0.10, shadowBounceMixLit: 0.10, fillSkyMix: 0.0 }],
  ['base2', {}],
];

const rows = [];
const save = () => writeFileSync(
  path.join(OUT, '..', 'pnightcal.json'),
  JSON.stringify({ prov: PROV, ship: SHIP, rows }, null, 1),
);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 3 * 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — ${info.renderer || '?'}  warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`  WARN ${w}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 240)}`); });

  /* Lever probe — the knobs the arms actually poke must exist and read ship values. */
  const lever = await page.evaluate(() => {
    const sh = window.__ENGINE.get('shading');
    return {
      hasFill: !!sh?.uniforms?.uFillSkyMix,
      shipFill: sh?.uniforms?.uFillSkyMix?.value,
      tuneSbm: sh?.tune?.shadowBounceMix,
      tuneSbmLit: sh?.tune?.shadowBounceMixLit,
      rimFloorShip: sh?.uniforms?.uRimShadowFloorArch?.value,
    };
  });
  log(`LEVER PROBE ${JSON.stringify(lever)}`);
  PROV.lever = lever;
  if (!lever.hasFill) log('FATAL: uFillSkyMix absent — compose arm cannot apply; run void');
  save();

  log('===== night =====');
  const stn = await page.evaluate(async () => {
    const t = performance.now(); const r = await window.__GAME.setShot('night');
    return { ms: performance.now() - t, stats: r?.stats };
  });
  log(`  staged ${(stn.ms / 1000).toFixed(0)}s  draws ${stn.stats?.drawCalls} tris ${stn.stats?.triangles}`);

  for (const [name, poke] of NIGHT_ARMS) {
    const ta = Date.now();
    const r = await page.evaluate(async ([SHIP, poke]) => {
      const sh = window.__ENGINE.get('shading');
      const v = { ...SHIP, ...poke };
      sh.tune.shadowBounceMix = v.shadowBounceMix;
      sh.tune.shadowBounceMixLit = v.shadowBounceMixLit;
      sh.tune.fillSkyMix = v.fillSkyMix;
      sh._refreshShadowColor();                 // shadow knobs only reach the uniform here
      sh.uniforms.uFillSkyMix.value = v.fillSkyMix;
      sh.uniforms.uRimShadowFloorArch.value = v.rimShadowFloorArch;
      await window.__GAME.step(1, 0);           // dt = 0: no sim advance between arms
      const dataUrl = window.__GAME.capture('image/png');
      return {
        requested: v,
        readback: {
          fillSkyMix: sh.uniforms.uFillSkyMix.value,
          shadowBounceMix: sh.tune.shadowBounceMix,
          shadowBounceMixLit: sh.tune.shadowBounceMixLit,
          rimShadowFloorArch: sh.uniforms.uRimShadowFloorArch.value,
        },
        dataUrl,
      };
    }, [SHIP, poke]);

    const mism = Object.keys(r.requested).filter((k) => Math.abs(r.readback[k] - r.requested[k]) > 1e-9);
    const buf = Buffer.from(r.dataUrl.split(',')[1], 'base64');
    writeFileSync(path.join(OUT, `night-${name}.png`), buf);
    const md5 = createHash('md5').update(buf).digest('hex').slice(0, 12);
    log(`  ${name.padEnd(8)} ${((Date.now() - ta) / 1000).toFixed(0)}s  sbm ${r.readback.shadowBounceMix}/${r.readback.shadowBounceMixLit} fill ${r.readback.fillSkyMix} rimFloor ${r.readback.rimShadowFloorArch}  md5 ${md5}  ${mism.length ? 'MISMATCH ' + mism.join(',') : 'applied ok'}`);
    rows.push({ kind: 'night', shot: 'night', arm: name, ...r.readback, md5, mismatch: mism });
    save();
  }

  /* Restore ship values so the page is left as it was found. */
  await page.evaluate(async (SHIP) => {
    const sh = window.__ENGINE.get('shading');
    sh.tune.shadowBounceMix = SHIP.shadowBounceMix;
    sh.tune.shadowBounceMixLit = SHIP.shadowBounceMixLit;
    sh.tune.fillSkyMix = SHIP.fillSkyMix;
    sh._refreshShadowColor();
    sh.uniforms.uFillSkyMix.value = SHIP.fillSkyMix;
    sh.uniforms.uRimShadowFloorArch.value = SHIP.rimShadowFloorArch;
    await window.__GAME.step(1, 0);
  }, SHIP);

  PROV.srcTreeAfter = treeHash();
  PROV.renderTreeAfter = renderHash();
  PROV.finishedAt = new Date().toISOString();
  log(`srcTree after ${PROV.srcTreeAfter} (${PROV.srcTreeAfter === PROV.srcTreeBefore ? 'STABLE' : 'MOVED'})  renderTree after ${PROV.renderTreeAfter} (${PROV.renderTreeAfter === PROV.renderTreeBefore ? 'STABLE' : 'MOVED'})`);
  save();
});
log('done');
