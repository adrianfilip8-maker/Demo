/**
 * PREREG-subjhold.md §2 — five boots, composed frames, the run-4 instrument.
 *
 * closeup/hero/interior: [base, hold(=1)] pairs (+ hero's REPORT-ONLY hold+neutralFill=1
 * diagnostic). temple/night: [base, hold] pairs whose stats are frame-diff based (PROT-ARCH /
 * PROT-NIGHT); night also writes LOOK crops around the changed-pixel bbox.
 *
 * Pokes: shading.tune.subjShadowHold (+ live uniform readback after step — it is republished
 * per frame at setKeyLight); neutralFill via tune AND uniform (latched at construction).
 * C-DRIFT per boot. Rows append to shots/subjhold/arms.json per pair.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { readPNG } from './png.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/subjhold';
const SHOTS = (process.argv[2] || 'sly-closeup,hero,interior,temple,night').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const FLOOR = Number(process.env.SANDS_FLOOR || 9);

const CONDS_BY_SHOT = {
  'sly-closeup': [{ cond: 'base', hold: null, nf: null }, { cond: 'hold', hold: 1, nf: null }],
  hero: [{ cond: 'base', hold: null, nf: null }, { cond: 'hold', hold: 1, nf: null },
    { cond: 'holdnf', hold: 1, nf: 1 }],
  interior: [{ cond: 'base', hold: null, nf: null }, { cond: 'hold', hold: 1, nf: null }],
  temple: [{ cond: 'base', hold: null, nf: null }, { cond: 'hold', hold: 1, nf: null }],
  night: [{ cond: 'base', hold: null, nf: null }, { cond: 'hold', hold: 1, nf: null }],
};

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
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* Face ROIs — PREREG-coolskew-grade verbatim, banda's live bands applied by the scorer.
   L is Rec.709 display luma; CAL-FACE-BASE turns any interpretation drift into
   VOID-INSTRUMENT rather than a verdict. */
const roiBR = (im, rects, lLo, lHi) => {
  const v = [];
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * im.w + x) * im.ch;
      const L = 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];
      if (L < lLo || L > lHi) continue;
      v.push(im.data[o + 2] - im.data[o]);
    }
  }
  return { n: v.length, br: med(v) };
};

for (const shot of SHOTS) {
  const CONDS = CONDS_BY_SHOT[shot];
  if (CONDS.every((c) => done.has(`${shot}/${c.cond}`))) { console.log(`${shot}: all conditions scored, skipping`); continue; }

  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => page.evaluate(async (args) => {
      const { shot, conds } = args;
      const eng = window.__ENGINE;
      await window.__GAME.setShot(shot, { dt: 0 });

      let swap = null;
      eng.scene.traverse((o) => { if (o.userData && o.userData.slySwapBodyTex) swap = o.userData.slySwapBodyTex; });
      if (!swap) return { error: 'slySwapBodyTex not found — VOID' };
      const sh = eng.get('shading');
      if (!sh) return { error: 'shading missing — VOID' };
      const U = sh.uniforms;
      if (!U || !U.uSubjShadowHold || !U.uNeutralFill) return { error: 'uniforms missing — VOID' };
      const orig = { holdT: sh.tune.subjShadowHold, nfT: sh.tune.neutralFill, nfU: U.uNeutralFill.value };

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
        sh.tune.subjShadowHold = c.hold == null ? orig.holdT : c.hold;
        sh.tune.neutralFill = c.nf == null ? orig.nfT : c.nf;
        U.uNeutralFill.value = c.nf == null ? orig.nfU : c.nf;
        const modeA = await swap('raw');
        const A = await shoot();
        const readback = { hold: U.uSubjShadowHold.value, nf: U.uNeutralFill.value };
        const modeB = await swap('fix');
        const B = await shoot();
        out.pairs.push({ cond: c.cond, A, B, modeA, modeB, readback });
      }
      sh.tune.subjShadowHold = orig.holdT;
      sh.tune.neutralFill = orig.nfT; U.uNeutralFill.value = orig.nfU;
      await swap('raw');
      out.drift = await shoot();
      return out;
    }, { shot, conds: CONDS }));

  if (got.error) { console.log(`${shot}: ${got.error}`); continue; }

  const png = (dataUrl, file) => {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(file, buf);
    return { file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  };

  let baseA = null;
  const imOf = {};
  for (const p of got.pairs) {
    const a = png(p.A, `${OUT}/${shot}-${p.cond}-A.png`);
    const b = png(p.B, `${OUT}/${shot}-${p.cond}-B.png`);
    if (p.cond === 'base') baseA = a;

    const ia = readPNG(a.file), ib = readPNG(b.file);
    imOf[p.cond] = { A: ia, B: ib };
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
      modeA: p.modeA, modeB: p.modeB, readback: p.readback,
      'A': { file: a.file, sha: a.sha }, 'B': { file: b.file, sha: b.sha },
      n, cov: n / (ia.w * ia.h), hueA: circmed(hA), hueB: circmed(hB),
    };
    if (shot === 'sly-closeup') {
      row.face = {
        cream: roiBR(ib, [[802, 306, 862, 356]], 90, 200),
        rings: roiBR(ib, [[802, 306, 862, 356], [820, 250, 880, 300]], 26, 55),
      };
    }
    results.push(row);
    writeFileSync(ARMS, JSON.stringify(results, null, 1));
    const swing = row.hueA != null && row.hueB != null ? ((row.hueB - row.hueA + 540) % 360) - 180 : null;
    console.log(`${shot.padEnd(12)} ${p.cond.padEnd(7)} mask ${String(n).padStart(6)} (${(100 * row.cov).toFixed(2)}%)  `
      + `hueA ${row.hueA?.toFixed(1)}°  hueB ${row.hueB?.toFixed(1)}°  swing ${swing?.toFixed(1)}°  `
      + `rb hold=${p.readback.hold} nf=${p.readback.nf}`
      + (row.face ? `  cream ${row.face.cream.br} (n${row.face.cream.n})  rings ${row.face.rings.br} (n${row.face.rings.n})` : ''));
  }

  /* PROT-ARCH / PROT-NIGHT diffs: hold-A vs base-A. */
  if (imOf.base && imOf.hold && (shot === 'temple' || shot === 'night')) {
    const d0 = imOf.base.A, d1 = imOf.hold.A;
    const corners = [[0, 0], [d0.w - 200, 0], [0, d0.h - 200], [d0.w - 200, d0.h - 200]];
    let total = 0, corner = 0;
    const brs = [];
    let x0 = d0.w, y0 = d0.h, x1 = 0, y1 = 0;
    for (let y = 0; y < d0.h; y++) for (let x = 0; x < d0.w; x++) {
      const i = y * d0.w + x, o = i * d0.ch, q = i * d1.ch;
      const dm = Math.max(Math.abs(d0.data[o] - d1.data[q]), Math.abs(d0.data[o + 1] - d1.data[q + 1]),
        Math.abs(d0.data[o + 2] - d1.data[q + 2]));
      if (dm < FLOOR) continue;
      total++;
      brs.push(d1.data[q + 2] - d1.data[q]);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [cx, cy] of corners) if (x >= cx && x < cx + 200 && y >= cy && y < cy + 200) corner++;
    }
    const diffRow = { shot, cond: 'HOLDDIFF', total, corner, bbox: total ? [x0, y0, x1, y1] : null, brMed: med(brs) };
    results.push(diffRow);
    writeFileSync(ARMS, JSON.stringify(results, null, 1));
    console.log(`${shot.padEnd(12)} HOLDDIFF total ${total}  corners ${corner}  bbox ${JSON.stringify(diffRow.bbox)}  brMed ${diffRow.brMed}`);
    if (shot === 'night' && total) {
      /* LOOK crops: the changed bbox padded 40 px, base beside hold. */
      const pad = 40;
      const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
      const cx1 = Math.min(d0.w, x1 + pad), cy1 = Math.min(d0.h, y1 + pad);
      const cw = cx1 - cx0, chh = cy1 - cy0;
      const crop = Buffer.alloc(cw * 2 * chh * 3);
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
        const si = ((cy0 + y) * d0.w + (cx0 + x));
        for (let k = 0; k < 3; k++) {
          crop[(y * cw * 2 + x) * 3 + k] = d0.data[si * d0.ch + k];
          crop[(y * cw * 2 + cw + x) * 3 + k] = d1.data[si * d1.ch + k];
        }
      }
      writeFileSync(`${OUT}/night-look.ppm`, Buffer.concat([Buffer.from(`P6\n${cw * 2} ${chh}\n255\n`), crop]));
      console.log(`${shot.padEnd(12)} wrote ${OUT}/night-look.ppm (base | hold)`);
    }
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

console.log('\nscore with: node tools/subjholdscore.mjs');
