/**
 * §281 / PREREG-attractor.md — which rim is the mid-distance blue, by same-boot toggle lattice.
 *
 * One boot per shot; four conditions (base / noscreen / nosurf / norim), each an A(raw)/B(fix)
 * swap pair. Toggles are poked on the live TUNE objects — `postfx.tune.rimStrength` and
 * `shading.tune.rimGain` — because the uniforms are re-asserted from TUNE on every frame, so a
 * naked uniform poke is silently reverted by the next step (ToonMaterial.js "HARNESS AUTHORS"
 * note). Readback happens AFTER a step for the same reason. After the last condition the
 * toggles are restored and base arm A is re-rendered: C-DRIFT demands zero pixels ≥ the mask
 * floor against the first base A, or the whole boot is void (leaked state).
 *
 * Rows append to shots/attractor/arms.json per pair, so a mid-run rebuild loses only the boot
 * in flight. Scores nothing: tools/attractorscore.mjs applies the seal.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { readPNG } from './png.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/attractor';
const SHOTS = (process.argv[2] || 'hero,interior').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const FLOOR = Number(process.env.SANDS_FLOOR || 9);   // §282 rule, current pair (RESULT-bodyhue5)

const CONDS = [
  { cond: 'base',     screen: null, surf: null },
  { cond: 'noscreen', screen: 0,    surf: null },
  { cond: 'nosurf',   screen: null, surf: 0 },
  { cond: 'norim',    screen: 0,    surf: 0 },
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
      if (!pf || !sh) return { error: `module missing: postfx=${!!pf} shading=${!!sh} — VOID` };
      const orig = { screen: pf.tune.rimStrength, surf: sh.tune.rimGain };

      const shoot = async () => {
        await window.__GAME.step(3, 0);
        eng.renderFrame(0);
        const src = eng.canvas;
        const c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
        return c.toDataURL('image/png');
      };

      const out = { pairs: [], orig };
      for (const c of conds) {
        pf.tune.rimStrength = c.screen == null ? orig.screen : c.screen;
        sh.tune.rimGain = c.surf == null ? orig.surf : c.surf;
        const modeA = await swap('raw');
        const A = await shoot();
        /* readback AFTER the step that preceded the render, i.e. now — the live values the
           frame actually used, not the ones we asked for */
        const readback = { screen: pf.tune.rimStrength, surf: sh.tune.rimGain };
        const modeB = await swap('fix');
        const B = await shoot();
        out.pairs.push({ cond: c.cond, A, B, modeA, modeB, readback });
      }
      /* restore, then C-DRIFT: base arm A again — zero mask-visible residue or the boot voids */
      pf.tune.rimStrength = orig.screen;
      sh.tune.rimGain = orig.surf;
      await swap('raw');
      out.drift = await shoot();
      return out;
    }, { shot, conds: CONDS }));

  if (got.error) { console.log(`${shot}: ${got.error}`); continue; }

  const png = (dataUrl, file) => {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(file, buf);
    return { file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16), buf };
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
    console.log(`${shot.padEnd(9)} ${p.cond.padEnd(9)} mask ${String(n).padStart(6)} (${(100 * row.cov).toFixed(2)}%)  `
      + `hueA ${row.hueA?.toFixed(1)}°  hueB ${row.hueB?.toFixed(1)}°  swing ${swing?.toFixed(1)}°  `
      + `rb screen=${p.readback.screen} surf=${p.readback.surf}`);
  }

  /* C-DRIFT */
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
  console.log(`${shot.padEnd(9)} DRIFT     ${leaked} px >= ${FLOOR} vs base A  ${leaked === 0 ? 'CLEAN' : 'LEAKED'}`);
}

console.log('\nscore with: node tools/attractorscore.mjs');
