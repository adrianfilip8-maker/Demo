/**
 * pnight1 — PREREG-pnight.md §3. `night` calibration ONLY.
 *
 * PREREG-pnight §3.2's two known-bads plus the composite, so the P-night line can be set as a
 * FRACTION OF A DEMONSTRATED SEPARATION rather than chosen. §13: a metric never shown to move
 * on a state known to have the defect is not evidence about that defect in either direction.
 *
 * A hero-prop-hull A/B was drafted into this file and REMOVED before it ever ran. Two reasons,
 * and the second is the one worth carrying:
 *   1. It is not mine. `PREREG-propshull.md` + `progress/records/propshull.mjs` are already
 *      registered by the owner of `Props.js`, whose call site this tests.
 *   2. My arm toggled `shell.visible`, and `propshull.mjs`'s header records why that is wrong:
 *      PostFX's `setOutlinesVisible()` rewrites `.visible` on every shell in ToonMaterial's
 *      `_shells` list every frame, so a per-shell `.visible = false` is reverted before the
 *      frame is drawn. The "off" arm would not have been off, and the run would have reported
 *      a confident null for a toggle that did nothing — §7's "a knob that reports success is
 *      not a knob that did anything", caught by reading another owner's instrument rather than
 *      by my own shell count, which would have printed a healthy-looking 6.
 *
 * WHAT THIS IS NOT (§11 — the suffix between this and the published claim):
 *   - Arms are live pokes of a running page, not rebuilds. Arm-vs-arm deltas are valid even
 *     while another owner edits src/world; the ABSOLUTE frames are of the stamped tree.
 *   - `base2` / `propsbase2` are self-controls, NOT treatments. If either is not bit-identical
 *     to its base, the poke/restore path leaked and every number here is void.
 *   - This file PRODUCES FRAMES. It scores nothing. The night hue line is carried by
 *     huescore.mjs on roi-night.json (roigen.mjs night 4); the prop-hull question is a
 *     LOOKED-AT judgement (§2.3 P-frame), not a statistic, and is registered that way.
 *   - The prop A/B toggles shell VISIBILITY, so it cannot answer "should these exist at this
 *     draw budget" — only "does the line they draw look right". The draw-cost half is
 *     GEOMETRY's and is already priced at ~6 draws / ~50k tris.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1/frames';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

/* §121.4: stamp the SOURCE TREE, not the git SHA — three arms once stamped three SHAs on a
   byte-identical tree. Re-read after the run; src/world is edited live by another owner. */
const treeHash = () => execSync(
  `find /home/user/Demo/src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();
const renderHash = () => execSync(
  `find /home/user/Demo/src/render -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();

const PROV = {
  startedAt: new Date().toISOString(),
  sha: execSync('git -C /home/user/Demo rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  dirty: execSync('git -C /home/user/Demo status --porcelain', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  srcTreeBefore: treeHash(),
  renderTreeBefore: renderHash(),
};
log(`provenance sha ${PROV.sha}  srcTree ${PROV.srcTreeBefore}  renderTree ${PROV.renderTreeBefore}  dirty ${PROV.dirty.length} file(s)`);

/* Ship values, restated so a readback mismatch is loud rather than silent. */
const SHIP = { fillSkyMix: 0.70, shadowBounceMix: 0.05, shadowBounceMixLit: 0.05, rimShadowFloorArch: 0.55 };
const UNI = 0.10;   // §119.4's ledger ceiling on the uniform knob (temple binds)
const BAD = 0.40;   // 4x that ceiling — known-bad by the ledger's own commitment, not by eye

/* PREREG-pnight §3.2. `rimfloor0` attacks §7.3's rim condition on ARCHITECTURE only
   (toon.glsl.js:731 mixes to a fixed 0.55 on skinned geometry, so the character is untouched);
   `sbm040` is the SAME LEVER as the treatment, pushed past the ledger line. */
const NIGHT_ARMS = [
  ['base', {}],
  ['rimfloor0', { rimShadowFloorArch: 0.0 }],
  ['sbm040', { shadowBounceMix: BAD, shadowBounceMixLit: BAD }],
  ['compose', { shadowBounceMix: UNI, shadowBounceMixLit: UNI, fillSkyMix: 0.0 }],
  ['base2', {}],
];

const rows = [];
const save = () => writeFileSync(
  path.join(OUT, '..', 'pnight1.json'),
  JSON.stringify({ prov: PROV, ship: SHIP, uniform: UNI, bad: BAD, rows }, null, 1),
);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 3 * 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — ${info.renderer || '?'}  warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`  WARN ${w}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 240)}`); });

  /* The lever must be proven present and live before any arm is believed — §7's standing
     lesson that reading what code is specified to do is not evidence that it does it. */
  const lever = await page.evaluate(() => {
    const sh = window.__ENGINE.get('shading');
    return {
      hasUniform: !!sh?.uniforms?.uRimShadowFloorArch,
      shipValue: sh?.uniforms?.uRimShadowFloorArch?.value,
      hasFill: !!sh?.uniforms?.uFillSkyMix,
      tuneSbm: sh?.tune?.shadowBounceMix,
    };
  });
  log(`LEVER PROBE ${JSON.stringify(lever)}`);
  PROV.lever = lever;
  if (!lever.hasUniform) { log('FATAL: uRimShadowFloorArch absent — night calibration void'); }
  save();

  /* ---------------- item 1: night calibration ---------------- */
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
    writeFileSync(path.join(OUT, `night-${name}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    log(`  ${name.padEnd(11)} ${((Date.now() - ta) / 1000).toFixed(0)}s  sbm ${r.readback.shadowBounceMix} fill ${r.readback.fillSkyMix} rimFloor ${r.readback.rimShadowFloorArch}  ${mism.length ? 'MISMATCH ' + mism.join(',') : 'applied ok'}`);
    rows.push({ kind: 'night', shot: 'night', arm: name, ...r.readback, mismatch: mism });
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
