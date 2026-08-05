/**
 * banda1 — the registered capture for PREREG-banda.md §8. SHADING owner.
 *
 * §164 chunks, each its OWN withGame boot (own FIFO lock hold via tools/harness.mjs →
 * tools/lock.mjs, released between chunks), arms as sealed — live pokes of a running page,
 * never rebuilds (§124.4: the bundle is fixed at boot; a mid-boot tree edit is inert):
 *
 *   A  sly-closeup   base / A / AB / KBoverwarm / restore
 *   B  hero+interior base / B / AB / KBwarmmud / restore   (per shot, one boot)
 *   C  night         base / AB / restore                    (P7 collision proof; no KB at night)
 *   D  temple+combat base / AB / restore                    (optional; lock permitting)
 *
 *   base       shipped TUNE, untouched (known-bad #1 by the seal's base gates)
 *   A          subjWarmShade 0.65 (tune + uniform)
 *   B          shadowTintPeak 0.62 (tune; _refreshShadowColor re-reads per publish)
 *   AB         both
 *   KBwarmmud  shadowBounceMix/Lit 0.20/0.20 — NEVER at a night tod (seal §6)
 *   KBoverwarm subjWarmShade 1.0
 *   restore    0.50 / 0.52 / 0.05 / 0.05 poked back; P-F4: must be 0 px vs base at ΣRGB≥4
 *
 * Readback per arm (§40: score what the shader got): uSubjWarmShade, the four TUNE values,
 * and the uShadowColor triple — the seal's §6 pnightcal cap-arithmetic proof is THIS runner
 * printing night uShadowColor bit-equal across base/AB, and day uShadowColor moving by
 * ×kUsed(0.62)/kUsed(0.52) on B/AB.
 *
 * Ordering (sealed): setShot FIRST, then read originals, then poke; poke → explicit
 * _refreshShadowColor() → step(1, dt=0) → readback → capture. Never re-setShot inside an
 * arm; the next shot in a multi-shot chunk is staged only after that shot's restore.
 *
 * Durability (§163/§164): every frame + readback JSON lands at
 * progress/records/banda1/<shot>.<arm>.png (FLAT — the layout banda-diag.mjs `score` reads)
 * the moment it exists. Idempotent resume per chunk. No git — the coordinator sweeps.
 *
 * Scoring is NOT here (pnight1's rule): node progress/records/banda-diag.mjs score
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/banda1';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* PREREG-banda §3/§4 — the registered arm values. SHIP restated so drift is loud. */
const SHIP = { subjW: 0.50, tintPeak: 0.52, sbm: 0.05, sbmLit: 0.05 };
const ARM_POKES = {
  base: { ...SHIP },
  A: { ...SHIP, subjW: 0.65 },
  B: { ...SHIP, tintPeak: 0.62 },
  AB: { ...SHIP, subjW: 0.65, tintPeak: 0.62 },
  KBwarmmud: { ...SHIP, sbm: 0.20, sbmLit: 0.20 },
  KBoverwarm: { ...SHIP, subjW: 1.0 },
  restore: { ...SHIP },
};

const CHUNKS = [
  { id: 'A', shots: [{ shot: 'sly-closeup', arms: ['base', 'A', 'AB', 'KBoverwarm', 'restore'] }] },
  { id: 'B', shots: [
    { shot: 'hero', arms: ['base', 'B', 'AB', 'KBwarmmud', 'restore'] },
    { shot: 'interior', arms: ['base', 'B', 'AB', 'KBwarmmud', 'restore'] },
  ] },
  { id: 'C', shots: [{ shot: 'night', arms: ['base', 'AB', 'restore'] }] },
  { id: 'D', shots: [
    { shot: 'temple', arms: ['base', 'AB', 'restore'] },
    { shot: 'combat', arms: ['base', 'AB', 'restore'] },
  ] },
];

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

for (const chunk of CHUNKS) {
  if (only && chunk.id !== only) continue;
  const allDone = chunk.shots.every((s) => s.arms.every((a) => existsSync(path.join(OUT, `${s.shot}.${a}.png`))));
  if (allDone) { log(`chunk ${chunk.id}: all frames present — skipping (idempotent resume)`); continue; }

  const report = {
    prereg: 'PREREG-banda.md', chunk: chunk.id,
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(),
    shipExpected: SHIP, shots: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk.id}.json`), JSON.stringify(report, null, 1));
  save();
  log(`chunk ${chunk.id}: srcTree ${report.srcTreeBefore} — booting (own lock hold)`);

  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 30 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });

    /* Lever probe BEFORE anything is believed (§7: specified is not live). */
    const lever = await page.evaluate(() => {
      const sh = window.__ENGINE?.get?.('shading');
      return {
        hasShading: !!sh, hasTune: !!sh?.tune, hasSubjU: !!sh?.uniforms?.uSubjWarmShade,
        hasRefresh: typeof sh?._refreshShadowColor === 'function',
        subjW: sh?.tune?.subjWarmShade, tintPeak: sh?.tune?.shadowTintPeak,
        sbm: sh?.tune?.shadowBounceMix, sbmLit: sh?.tune?.shadowBounceMixLit,
        uSubjW: sh?.uniforms?.uSubjWarmShade?.value,
        uShadowColor: sh?.uniforms?.uShadowColor?.value?.toArray?.(),
      };
    });
    report.lever = lever;
    log(`  LEVER ${JSON.stringify(lever)}`);
    save();
    if (!lever.hasShading || !lever.hasSubjU || !lever.hasRefresh) {
      log(`  FATAL: shading levers absent — chunk ${chunk.id} void, no captures taken`);
      report.fatal = 'shading levers absent'; save(); return;
    }
    if (Math.abs(lever.subjW - SHIP.subjW) > 1e-9 || Math.abs(lever.tintPeak - SHIP.tintPeak) > 1e-9
      || Math.abs(lever.sbm - SHIP.sbm) > 1e-9 || Math.abs(lever.sbmLit - SHIP.sbmLit) > 1e-9) {
      log(`  WARNING: shipped TUNE differs from the seal's SHIP values — tree drift; base gates will arbitrate`);
    }

    for (const { shot, arms } of chunk.shots) {
      const sRec = { shot, arms: [] };
      report.shots.push(sRec);
      const t1 = Date.now();
      const staged = await page.evaluate(async (n) => {
        const r = await window.__GAME.setShot(n);
        return { stats: r?.stats, tod: window.__ENGINE.debug.timeOfDay };
      }, shot);
      sRec.setShot = staged;
      log(`  setShot(${shot}) ${((Date.now() - t1) / 1000).toFixed(0)}s  tod ${staged.tod}  draws ${staged.stats?.drawCalls} tris ${staged.stats?.triangles}`);
      save();

      let baseShadow = null;
      for (const arm of arms) {
        const ta = Date.now();
        const p = ARM_POKES[arm];
        const r = await page.evaluate(async (p) => {
          const sh = window.__ENGINE.get('shading');
          sh.tune.subjWarmShade = p.subjW;
          sh.uniforms.uSubjWarmShade.value = p.subjW;
          sh.tune.shadowTintPeak = p.tintPeak;
          sh.tune.shadowBounceMix = p.sbm;
          sh.tune.shadowBounceMixLit = p.sbmLit;
          sh._refreshShadowColor();
          await window.__GAME.step(1, 0);          // dt=0: world clock frozen between arms
          const dataUrl = window.__GAME.capture('image/png');
          return {
            readback: {
              subjW: sh.tune.subjWarmShade, uSubjW: sh.uniforms.uSubjWarmShade.value,
              tintPeak: sh.tune.shadowTintPeak, sbm: sh.tune.shadowBounceMix, sbmLit: sh.tune.shadowBounceMixLit,
              uShadowColor: sh.uniforms.uShadowColor.value.toArray(),
              uShadowColorLit: sh.uniforms.uShadowColorLit.value.toArray(),
            },
            dataUrl,
          };
        }, p);
        const rb = r.readback;
        const mism = [];
        if (Math.abs(rb.uSubjW - p.subjW) > 1e-9) mism.push('uSubjW');
        if (Math.abs(rb.tintPeak - p.tintPeak) > 1e-9) mism.push('tintPeak');
        if (Math.abs(rb.sbm - p.sbm) > 1e-9) mism.push('sbm');
        if (Math.abs(rb.sbmLit - p.sbmLit) > 1e-9) mism.push('sbmLit');
        const file = path.join(OUT, `${shot}.${arm}.png`);
        writeFileSync(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
        if (arm === 'base') baseShadow = rb.uShadowColor;
        /* The seal §6 proof lines, printed per arm: night uShadowColor must be bit-equal to
           base on every arm; day B/AB should move by kUsed ratio (~1.08 golden / ~1.19 interior). */
        let shadowNote = '';
        if (baseShadow) {
          const equal = rb.uShadowColor.every((v, i) => v === baseShadow[i]);
          const ratio = rb.uShadowColor.map((v, i) => baseShadow[i] ? v / baseShadow[i] : 1);
          shadowNote = equal ? 'uShadowColor ≡ base (bit-equal)' : `uShadowColor ×[${ratio.map((v) => v.toFixed(4)).join(',')}] vs base`;
        }
        log(`  ${shot}.${arm.padEnd(10)} ${((Date.now() - ta) / 1000).toFixed(0)}s  subjW ${rb.uSubjW} peak ${rb.tintPeak} sbm ${rb.sbm}/${rb.sbmLit}  uShadow (${rb.uShadowColor.map((v) => v.toFixed(6)).join(', ')})  ${shadowNote}  ${mism.length ? 'POKE MISMATCH ' + mism.join(',') : 'applied ok'}`);
        sRec.arms.push({ arm, requested: p, readback: rb, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
        save();
      }
    }

    report.srcTreeAfter = treeHash();
    report.finishedAt = new Date().toISOString();
    log(`  chunk ${chunk.id} done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
    save();
  });
  log(`chunk ${chunk.id}: lock released`);
}
log('ALL DONE');
