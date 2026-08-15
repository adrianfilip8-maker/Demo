/**
 * linchroma.mjs — PREREG-linchroma's runner. 4 frames, one chunk, NO src change.
 * Measures the costume's chroma in LINEAR (pre-tonemap) via PostFX.debugRaw('scene'),
 * with debugTerm(4)'s (64,128,191) control proving the bypass in the same boot.
 * Warm-up 2 discarded renders after staging (§331).
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/linchroma1');
const SHOT = 'traversal';
const WARMUP = 2;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const die = (m) => { console.error(m); process.exit(2); };
{ const d = git('status', '--porcelain', '--', 'src/'); if (d) die(`PF6: src/ dirty:\n${d}`); }
if (existsSync(OUT) && readdirSync(OUT).length) die(`PF7: ${OUT} non-empty — archive before relaunch.`);
mkdirSync(OUT, { recursive: true });
const HEAD = git('rev-parse', 'HEAD');
const EXPECT_SRC = srcHash();
console.log(`HEAD ${HEAD.slice(0, 12)} verified; expected src hash ${EXPECT_SRC}`);
console.log(`frames -> ${OUT}`);

/* Each arm sets BOTH the raw-bypass and the debug term, so poke and restore share one path. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  const px = eng.get('postfx');
  if (cfg.raw) { px.debugRaw('scene'); sh.debugTerm(cfg.term || 0); }
  else { sh.debugTerm(0); px.debugRaw(false); }
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return { png: c.toDataURL('image/png'), rb: { term: sh.uniforms.uDebugTerm?.value, raw: px.isDebugRaw?.() ?? null } };
};
const WARM = async () => {
  const eng = window.__ENGINE; const sh = eng.get('shading'); const px = eng.get('postfx');
  sh.debugTerm(0); px.debugRaw(false);
  await window.__GAME.step(2, 0); eng.renderFrame(0);
};

const rows = [];
const onLocked = async () => {
  const t = treeState();
  if (t.src !== EXPECT_SRC) throw new Error(`V-TREE: src moved (${t.src} != ${EXPECT_SRC})`);
  console.log(`tree verified under the lock — src ${t.src}`);
};
await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    const st = await page.evaluate(async (n) => { const r = await window.__GAME.setShot(n, {}); return r.warnings.length; }, SHOT);
    console.log(`-- staged ${SHOT} LIVE (dt undefined, roster path); ${st} warning(s)`);
    for (let w = 0; w < WARMUP; w++) await page.evaluate(WARM);
    console.log(`-- warm-up ${WARMUP} render(s) discarded (§331)`);
    const arms = [['off', {}], ['raw', { raw: true, term: 0 }], ['cal', { raw: true, term: 4 }], ['back', {}]];
    let n = 0;
    for (const [arm, cfg] of arms) {
      const r = await page.evaluate(ARM, cfg);
      const buf = Buffer.from(r.png.split(',')[1], 'base64');
      const file = `${SHOT}.${arm}.png`;
      writeFileSync(path.join(OUT, file), buf);
      const sha = createHash('sha256').update(buf).digest('hex');
      rows.push({ shot: SHOT, arm, file, sha256: sha, readback: r.rb });
      console.log(`  #${++n} ${(SHOT + '.' + arm).padEnd(18)} sha ${sha.slice(0, 16)}  term=${r.rb.term} raw=${r.rb.raw}`);
    }
    const t1 = treeState();
    if (t1.src !== EXPECT_SRC) die(`V-TREE: src moved DURING capture`);
    writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
      seal: 'PREREG-linchroma', head: HEAD, srcHash: EXPECT_SRC, warmup: WARMUP,
      shot: SHOT, expectRows: 4, capturedAt: new Date().toISOString(), rows,
    }, null, 2));
  });
console.log(`\n${rows.length} frames -> ${OUT}`);
console.log('score with: node progress/records/linchroma/linchroma-score.mjs');
