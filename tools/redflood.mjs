/**
 * §290 / PREREG-redflood.md — what blows the twilight walls. One boot per shot, five
 * conditions, ONE render each (no swap). Pokes on tune + live uniforms with post-step
 * readbacks; conditions restore; C-DRIFT base re-render closes each boot. Scores the WALL
 * ROI stats inline (mean HSV saturation, luma std) and appends rows per condition.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { readPNG } from './png.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/redflood';
const SHOTS = (process.argv[2] || 'sly-perch,sly-arm').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const FLOOR = 9;
const ROI = {
  'sly-perch': { wall: [900, 60, 1260, 330], left: [40, 260, 260, 480] },
  'sly-arm': { wall: [900, 40, 1260, 300], left: [40, 260, 260, 480] },
};

const CONDS = [
  { cond: 'base', haze: null, split: null, sat: null },
  { cond: 'haze0', haze: 0, split: null, sat: null },
  { cond: 'split0', haze: null, split: 0, sat: null },
  { cond: 'sat1', haze: null, split: null, sat: 1 },
  { cond: 'alloff', haze: 0, split: 0, sat: 1 },
];

const ARMS = `${OUT}/arms.json`;
const results = existsSync(ARMS) ? JSON.parse(readFileSync(ARMS, 'utf8')) : [];
const done = new Set(results.map((r) => `${r.shot}/${r.cond}`));

const NOW = treeState();
console.log(`target src tree ${NOW.src} (HEAD ${NOW.head})`);

const stats = (im, [x0, y0, x1, y1]) => {
  let n = 0, sSum = 0, lSum = 0, l2Sum = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sSum += mx ? (mx - mn) / mx : 0;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lSum += L; l2Sum += L * L;
    n++;
  }
  const mL = lSum / n;
  return { S: sSum / n, T: Math.sqrt(Math.max(0, l2Sum / n - mL * mL)), n };
};

for (const shot of SHOTS) {
  if (CONDS.every((c) => done.has(`${shot}/${c.cond}`))) { console.log(`${shot}: all conditions scored, skipping`); continue; }

  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => page.evaluate(async (args) => {
      const { shot, conds } = args;
      const eng = window.__ENGINE;
      await window.__GAME.setShot(shot, { dt: 0 });

      const pf = eng.get('postfx'), sh = eng.get('shading');
      if (!pf || !sh) return { error: 'postfx/shading missing — VOID' };
      const U = sh.uniforms;
      const orig = {
        hazeT: sh.tune.hazeDensity, hazeU: U?.uHazeDensity?.value,
        split: pf.tune.splitStrength, sat: pf.tune.saturation,
      };

      const shoot = async () => {
        await window.__GAME.step(3, 0);
        eng.renderFrame(0);
        const src = eng.canvas;
        const c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
        return c.toDataURL('image/png');
      };

      const out = { frames: [], orig };
      for (const c of conds) {
        sh.tune.hazeDensity = c.haze == null ? orig.hazeT : c.haze;
        if (U?.uHazeDensity) U.uHazeDensity.value = c.haze == null ? orig.hazeU : c.haze;
        pf.tune.splitStrength = c.split == null ? orig.split : c.split;
        pf.tune.saturation = c.sat == null ? orig.sat : c.sat;
        const png = await shoot();
        const readback = {
          haze: U?.uHazeDensity?.value ?? sh.tune.hazeDensity,
          split: pf.tune.splitStrength, sat: pf.tune.saturation,
        };
        out.frames.push({ cond: c.cond, png, readback });
      }
      sh.tune.hazeDensity = orig.hazeT;
      if (U?.uHazeDensity) U.uHazeDensity.value = orig.hazeU;
      pf.tune.splitStrength = orig.split;
      pf.tune.saturation = orig.sat;
      out.drift = await shoot();
      return out;
    }, { shot, conds: CONDS }));

  if (got.error) { console.log(`${shot}: ${got.error}`); continue; }

  const png = (dataUrl, file) => {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(file, buf);
    return { file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  };

  let baseFile = null;
  for (const f of got.frames) {
    const p = png(f.png, `${OUT}/${shot}-${f.cond}.png`);
    if (f.cond === 'base') baseFile = p;
    const im = readPNG(p.file);
    const wall = stats(im, ROI[shot].wall);
    const left = stats(im, ROI[shot].left);
    const row = {
      shot, cond: f.cond, tree: NOW, readback: f.readback, orig: got.orig,
      file: p.file, sha: p.sha,
      wallS: wall.S, wallT: wall.T, leftS: left.S, leftT: left.T,
    };
    results.push(row);
    writeFileSync(ARMS, JSON.stringify(results, null, 1));
    console.log(`${shot.padEnd(9)} ${f.cond.padEnd(7)} wall S ${wall.S.toFixed(3)} T ${wall.T.toFixed(1)}  `
      + `left S ${left.S.toFixed(3)} T ${left.T.toFixed(1)}  rb h=${f.readback.haze} sp=${f.readback.split} sa=${f.readback.sat}`);
  }

  const drift = png(got.drift, `${OUT}/${shot}-drift.png`);
  const d0 = readPNG(baseFile.file), d1 = readPNG(drift.file);
  let leaked = 0;
  for (let i = 0, px = d0.w * d0.h; i < px; i++) {
    const o = i * d0.ch, q = i * d1.ch;
    const dm = Math.max(Math.abs(d0.data[o] - d1.data[q]), Math.abs(d0.data[o + 1] - d1.data[q + 1]),
      Math.abs(d0.data[o + 2] - d1.data[q + 2]));
    if (dm >= FLOOR) leaked++;
  }
  results.push({ shot, cond: 'DRIFT', leaked });
  writeFileSync(ARMS, JSON.stringify(results, null, 1));
  console.log(`${shot.padEnd(9)} DRIFT   ${leaked} px >= ${FLOOR}  ${leaked === 0 ? 'CLEAN' : 'LEAKED'}`);
}

console.log('\nscore per PREREG-redflood §3: E(c) = [S(base)-S(c)] + [T(c)-T(base)]/64');
