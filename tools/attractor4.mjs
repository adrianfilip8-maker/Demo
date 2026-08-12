/**
 * §286 hunt / PREREG-attractor4.md — scene-side term lattice on the codebase's own
 * attribution arms, every pair through debugRaw('scene').
 *
 * Pokes follow the rimGain/rimsweep2 both-poke rule (tune AND live uniform — neutralFill /
 * neutralShadow are latched at construction; subjWarmShade is republished per frame from
 * tune). Readback comes from the LIVE uniforms after the step, never from tune (the
 * contact-term lesson at PostFX.js ~1722). All pokes restored per condition; C-DRIFT
 * re-renders base arm A last, still through the rawscene channel.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { readPNG } from './png.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/attractor4';
const SHOTS = (process.argv[2] || 'sly-closeup,hero,interior').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const FLOOR = Number(process.env.SANDS_FLOOR || 9);

const CONDS = [
  { cond: 'base',        fill: null, shad: null, warm: null },
  { cond: 'neutfill',    fill: 1,    shad: null, warm: null },
  { cond: 'neutshadow',  fill: null, shad: 1,    warm: null },
  { cond: 'nowarmshade', fill: null, shad: null, warm: 0 },
];

const ARMS = `${OUT}/arms.json`;
const results = existsSync(ARMS) ? JSON.parse(readFileSync(ARMS, 'utf8')) : [];
const done = new Set(results.map((r) => `${r.shot}/${r.cond}`));

const NOW = treeState();
console.log(`target src tree ${NOW.src} (HEAD ${NOW.head})  floor ${FLOOR}`);

const hueOf = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};
const circmed = (a) => {
  if (!a.length) return null;
  let sx = 0, sy = 0;
  for (const h of a) { const r = h * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); }
  const mean = Math.atan2(sy, sx) * 180 / Math.PI;
  const shift = 180 - ((mean % 360) + 360) % 360;
  const rot = a.map((h) => (((h + shift) % 360) + 360) % 360).sort((x, y) => x - y);
  return (((rot[Math.floor(rot.length / 2)] - shift) % 360) + 360) % 360;
};

for (const shot of SHOTS) {
  if (CONDS.every((c) => done.has(`${shot}/${c.cond}`))) { console.log(`${shot}: all conditions scored, skipping`); continue; }

  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => page.evaluate(async (args) => {
      const { shot, conds } = args;
      const eng = window.__ENGINE;
      await window.__GAME.setShot(shot, { dt: 0 });

      let swap = null;
      eng.scene.traverse((o) => { if (o.userData && o.userData.slySwapBodyTex) swap = o.userData.slySwapBodyTex; });
      if (!swap) return { error: 'slySwapBodyTex not found — VOID' };
      const pf = eng.get('postfx'), sh = eng.get('shading');
      if (!pf || !sh || typeof pf.debugRaw !== 'function') return { error: 'postfx/shading missing — VOID' };
      const U = sh.uniforms;
      if (!U || !U.uNeutralFill || !U.uNeutralShadow || !U.uSubjWarmShade) return { error: 'attribution uniforms missing — VOID' };
      const orig = {
        fillT: sh.tune.neutralFill, shadT: sh.tune.neutralShadow, warmT: sh.tune.subjWarmShade,
        fillU: U.uNeutralFill.value, shadU: U.uNeutralShadow.value,
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

      pf.debugRaw(true, 'scene');
      const out = { pairs: [], orig };
      for (const c of conds) {
        sh.tune.neutralFill = c.fill == null ? orig.fillT : c.fill;
        U.uNeutralFill.value = c.fill == null ? orig.fillU : c.fill;
        sh.tune.neutralShadow = c.shad == null ? orig.shadT : c.shad;
        U.uNeutralShadow.value = c.shad == null ? orig.shadU : c.shad;
        sh.tune.subjWarmShade = c.warm == null ? orig.warmT : c.warm;
        const modeA = await swap('raw');
        const A = await shoot();
        const readback = {
          fill: U.uNeutralFill.value, shad: U.uNeutralShadow.value, warm: U.uSubjWarmShade.value,
          debugRaw: pf._debugRaw, debugSrc: pf._debugSrc,
        };
        const modeB = await swap('fix');
        const B = await shoot();
        out.pairs.push({ cond: c.cond, A, B, modeA, modeB, readback });
      }
      sh.tune.neutralFill = orig.fillT; U.uNeutralFill.value = orig.fillU;
      sh.tune.neutralShadow = orig.shadT; U.uNeutralShadow.value = orig.shadU;
      sh.tune.subjWarmShade = orig.warmT;
      await swap('raw');
      out.drift = await shoot();
      pf.debugRaw(false);
      return out;
    }, { shot, conds: CONDS }));

  if (got.error) { console.log(`${shot}: ${got.error}`); continue; }

  const png = (dataUrl, file) => {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(file, buf);
    return { file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  };

  let baseA = null;
  for (const p of got.pairs) {
    const a = png(p.A, `${OUT}/${shot}-${p.cond}-A.png`);
    const b = png(p.B, `${OUT}/${shot}-${p.cond}-B.png`);
    if (p.cond === 'base') baseA = a;

    const ia = readPNG(a.file), ib = readPNG(b.file);
    const hA = [], hB = [];
    let n = 0;
    for (let i = 0, px = ia.w * ia.h; i < px; i++) {
      const o = i * ia.ch, q = i * ib.ch;
      const dm = Math.max(Math.abs(ia.data[o] - ib.data[q]), Math.abs(ia.data[o + 1] - ib.data[q + 1]),
        Math.abs(ia.data[o + 2] - ib.data[q + 2]));
      if (dm < FLOOR) continue;
      n++;
      const a1 = hueOf(ia.data[o], ia.data[o + 1], ia.data[o + 2]);
      const b1 = hueOf(ib.data[q], ib.data[q + 1], ib.data[q + 2]);
      if (a1 != null) hA.push(a1);
      if (b1 != null) hB.push(b1);
    }
    const row = {
      shot, cond: p.cond, tree: NOW, floor: FLOOR,
      modeA: p.modeA, modeB: p.modeB, readback: p.readback, orig: got.orig,
      'A': { file: a.file, sha: a.sha }, 'B': { file: b.file, sha: b.sha },
      n, cov: n / (ia.w * ia.h), hueA: circmed(hA), hueB: circmed(hB),
    };
    results.push(row);
    writeFileSync(ARMS, JSON.stringify(results, null, 1));
    const swing = row.hueA != null && row.hueB != null ? ((row.hueB - row.hueA + 540) % 360) - 180 : null;
    console.log(`${shot.padEnd(12)} ${p.cond.padEnd(11)} mask ${String(n).padStart(6)} (${(100 * row.cov).toFixed(2)}%)  `
      + `hueA ${row.hueA?.toFixed(1)}°  hueB ${row.hueB?.toFixed(1)}°  swing ${swing?.toFixed(1)}°  `
      + `rb f=${p.readback.fill} s=${p.readback.shad} w=${p.readback.warm} raw=${p.readback.debugRaw}/${p.readback.debugSrc}`);
  }

  const drift = png(got.drift, `${OUT}/${shot}-drift-A.png`);
  const d0 = readPNG(baseA.file), d1 = readPNG(drift.file);
  let leaked = 0;
  for (let i = 0, px = d0.w * d0.h; i < px; i++) {
    const o = i * d0.ch, q = i * d1.ch;
    const dm = Math.max(Math.abs(d0.data[o] - d1.data[q]), Math.abs(d0.data[o + 1] - d1.data[q + 1]),
      Math.abs(d0.data[o + 2] - d1.data[q + 2]));
    if (dm >= FLOOR) leaked++;
  }
  results.push({ shot, cond: 'DRIFT', leaked, sha: drift.sha, vsSha: baseA.sha });
  writeFileSync(ARMS, JSON.stringify(results, null, 1));
  console.log(`${shot.padEnd(12)} DRIFT     ${leaked} px >= ${FLOOR} vs base A  ${leaked === 0 ? 'CLEAN' : 'LEAKED'}`);
}

console.log('\nscore per PREREG-attractor4 §4');
