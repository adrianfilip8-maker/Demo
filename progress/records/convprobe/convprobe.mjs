/**
 * convprobe.mjs — does something converge across successive renderFrame() calls at dt:0?
 *
 * litbleach's brackets failed unevenly: traversal 0 px, combat 2 px (±1 LSB), sly-key 1120 px in
 * a coherent 467x51 band whose mean signed delta was r -2.71 / g -1.10 / b +0.58 — a directional
 * shift, not noise. The arms run off -> on -> ko -> back, so `back` is the 4th render. If some
 * effect settles over renders rather than over world time, off-vs-back drifts while nothing about
 * the candidate is involved.
 *
 * This probe does NOTHING but render the same frame repeatedly with the lever untouched at 0, and
 * reports each render against the first and against its predecessor. If the deltas shrink toward
 * zero, convergence is real and a warm-up fixes the bracket. If they stay flat, the drift is
 * something else and a warm-up would be a placebo.
 *
 * No candidate, no bars, no verdict — this is instrument calibration, not an experiment, so it
 * carries no seal.
 *
 *   bash tools/launch.sh <abs>/convprobe.mjs <abs log> <abs pid> <shot>
 */
import { withGame } from '../../../tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/convprobe1');
const SHOT = process.argv[2] || 'sly-key';
const N = 8;

mkdirSync(OUT, { recursive: true });

const RENDER = async () => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  sh.uniforms.uSubjLitHold.value = 0.0;      // lever pinned off for every render
  sh.debugTerm(0);
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return c.toDataURL('image/png');
};

const rows = [];
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000 },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    await page.evaluate(async (n) => { await window.__GAME.setShot(n, {}); }, SHOT);
    console.log(`-- staged ${SHOT} LIVE (dt undefined, roster path)`);
    for (let i = 0; i < N; i++) {
      const png = await page.evaluate(RENDER);
      const buf = Buffer.from(png.split(',')[1], 'base64');
      const file = `${SHOT}.r${i}.png`;
      writeFileSync(path.join(OUT, file), buf);
      const sha = createHash('sha256').update(buf).digest('hex');
      rows.push({ i, file, sha256: sha });
      console.log(`  r${i}  sha ${sha.slice(0, 16)}`);
    }
    writeFileSync(path.join(OUT, `manifest.${SHOT}.json`), JSON.stringify({ probe: 'convprobe', shot: SHOT, n: N, rows }, null, 2));
  }
);
console.log(`\n${rows.length} renders -> ${OUT}`);
console.log('analyse with: node progress/records/convprobe/convprobe-read.mjs');
