/**
 * banda2 — the registered capture for PREREG-banda2.md §7. SHADING owner.
 *
 * banda1.mjs template (per-chunk own boot + FIFO lock hold, live pokes, idempotent resume,
 * settle = 10 frozen frames + throwaway capture after every setShot) with the successor's
 * two additions:
 *
 *   1. GATE EMULATION (seal §2): the ABg arm pokes the night gate's OUTPUT per shot —
 *      day shots subjW 0.65, night shots subjW 0.50 (= TUNE.subjWarmShadeNightPin = the
 *      shipped value). Exact because nightAmount is exactly {0,1} on canonical shots.
 *   2. P-F7 READBACK: after every setShot settle, read the live per-frame night value
 *      (shading._inkNight — the stored setKeyLight(nightAmount), republished every frame
 *      from LIGHTING's payload). Must be exactly 1 at `night`, exactly 0 at day shots;
 *      anything else voids the chunk (the emulation premise failed).
 *
 * Chunks (night FIRST — the decider):
 *   N   night        base / ABg / restore            (P7-fw frame-wide [0,0]; NO KB at night)
 *   A   sly-closeup  base / A / ABg / KBoverwarm / restore
 *   B1  hero         base / B / ABg / KBwarmmud / restore
 *   B2  interior     base / B / ABg / KBwarmmud / restore
 *   D1  temple       base / ABg / restore            (optional)
 *   D2  combat       base / ABg / restore            (optional)
 *
 * Frames + readbacks land incrementally at progress/records/banda2/. Scoring is NOT here:
 *   node progress/records/banda-diag.mjs score2 progress/records/banda2
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/banda2';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* PREREG-banda2 §2/§4 — the registered arm values. SHIP restated so drift is loud. */
const SHIP = { subjW: 0.50, tintPeak: 0.52, sbm: 0.05, sbmLit: 0.05 };
const NIGHT_SHOTS = new Set(['night', 'guard']);
/* ABg = the gate-emulated joint arm: subjW is the gate's output at the shot's nightAmount. */
const armPokes = (shot, arm) => {
  const night = NIGHT_SHOTS.has(shot);
  switch (arm) {
    case 'base': return { ...SHIP };
    case 'A': return { ...SHIP, subjW: 0.65 };
    case 'B': return { ...SHIP, tintPeak: 0.62 };
    case 'ABg': return { ...SHIP, subjW: night ? 0.50 : 0.65, tintPeak: 0.62 };
    case 'KBwarmmud':
      if (night) throw new Error('SEAL VIOLATION: KB-warmmud at a night tod (PREREG-banda2 §4)');
      return { ...SHIP, sbm: 0.20, sbmLit: 0.20 };
    case 'KBoverwarm': return { ...SHIP, subjW: 1.0 };
    case 'restore': return { ...SHIP };
    default: throw new Error(`unknown arm ${arm}`);
  }
};

const CHUNKS = [
  { id: 'N', shots: [{ shot: 'night', arms: ['base', 'ABg', 'restore'] }] },
  { id: 'A', shots: [{ shot: 'sly-closeup', arms: ['base', 'A', 'ABg', 'KBoverwarm', 'restore'] }] },
  { id: 'B1', shots: [{ shot: 'hero', arms: ['base', 'B', 'ABg', 'KBwarmmud', 'restore'] }] },
  { id: 'B2', shots: [{ shot: 'interior', arms: ['base', 'B', 'ABg', 'KBwarmmud', 'restore'] }] },
  { id: 'D1', shots: [{ shot: 'temple', arms: ['base', 'ABg', 'restore'] }] },
  { id: 'D2', shots: [{ shot: 'combat', arms: ['base', 'ABg', 'restore'] }] },
];

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

for (const chunk of CHUNKS) {
  if (only && chunk.id !== only) continue;
  const allDone = chunk.shots.every((s) => s.arms.every((a) => existsSync(path.join(OUT, `${s.shot}.${a}.png`))));
  if (allDone) { log(`chunk ${chunk.id}: all frames present — skipping (idempotent resume)`); continue; }

  const report = {
    prereg: 'PREREG-banda2.md', chunk: chunk.id,
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(),
    shipExpected: SHIP, shots: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk.id}.json`), JSON.stringify(report, null, 1));
  save();
  log(`chunk ${chunk.id}: srcTree ${report.srcTreeBefore} — booting (own lock hold)`);

  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });

    /* Lever probe BEFORE anything is believed (§7: specified is not live). */
    const lever = await page.evaluate(() => {
      const sh = window.__ENGINE?.get?.('shading');
      return {
        hasShading: !!sh, hasTune: !!sh?.tune, hasSubjU: !!sh?.uniforms?.uSubjWarmShade,
        hasRefresh: typeof sh?._refreshShadowColor === 'function',
        hasInkNight: typeof sh?._inkNight === 'number',
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
    if (!lever.hasInkNight) {
      log(`  FATAL: shading._inkNight absent — P-F7 unverifiable, chunk ${chunk.id} void (seal §3)`);
      report.fatal = '_inkNight absent'; save(); return;
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

      /* Settle (banda1's voidA lesson): absorb program compiles AND the one-off async settle
         BEFORE any scored frame — 10 frozen frames + a thrown-away capture. */
      const t2 = Date.now();
      await page.evaluate(async () => {
        await window.__GAME.step(10, 0);
        window.__GAME.capture('image/png');   // throwaway: warms the capture path too
      });
      log(`  settle(${shot}) ${((Date.now() - t2) / 1000).toFixed(0)}s (10 frozen frames + throwaway capture)`);
      sRec.settleSecs = Math.round((Date.now() - t2) / 1000);

      /* P-F7 — the gate-emulation premise, read from the live page (seal §3): the per-frame
         published nightAmount must be exactly 1 at night shots, exactly 0 at day shots. */
      const inkNight = await page.evaluate(() => window.__ENGINE.get('shading')._inkNight);
      sRec.nightAmount = inkNight;
      const wantNight = NIGHT_SHOTS.has(shot) ? 1 : 0;
      if (inkNight !== wantNight) {
        log(`  P-F7 FIRED: ${shot} live nightAmount ${inkNight} ≠ ${wantNight} — chunk VOID per the seal; no arms captured for this shot`);
        sRec.pf7 = `VOID: nightAmount ${inkNight} != ${wantNight}`;
        save();
        continue;
      }
      log(`  P-F7 ok: ${shot} live nightAmount ${inkNight} (= ${wantNight} exactly)`);
      save();

      let baseShadow = null;
      for (const arm of arms) {
        const ta = Date.now();
        const p = armPokes(shot, arm);
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
              inkNight: sh._inkNight,
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
        /* Seal §3 proof lines per arm: night uShadowColor must stay bit-equal to base on
           EVERY arm (L2 cap-dead); day B/ABg move by the kUsed ratio. */
        let shadowNote = '';
        if (baseShadow) {
          const equal = rb.uShadowColor.every((v, i) => v === baseShadow[i]);
          const ratio = rb.uShadowColor.map((v, i) => baseShadow[i] ? v / baseShadow[i] : 1);
          shadowNote = equal ? 'uShadowColor ≡ base (bit-equal)' : `uShadowColor ×[${ratio.map((v) => v.toFixed(4)).join(',')}] vs base`;
        }
        log(`  ${shot}.${arm.padEnd(10)} ${((Date.now() - ta) / 1000).toFixed(0)}s  subjW ${rb.uSubjW} peak ${rb.tintPeak} sbm ${rb.sbm}/${rb.sbmLit} inkNight ${rb.inkNight}  uShadow (${rb.uShadowColor.map((v) => v.toFixed(6)).join(', ')})  ${shadowNote}  ${mism.length ? 'POKE MISMATCH ' + mism.join(',') : 'applied ok'}`);
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
