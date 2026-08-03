/**
 * Discriminating arm for the teal sphinxes: ToonMaterial TUNE.shadowTeal 0.15 -> 0.
 *
 * Same instrument shape §104 used to kill the rim: define the accused population on the BASE
 * arm, then measure RETENTION of that exact population with the knob off, against a self-control
 * that re-applies the base setting.
 *
 * ROI: spatial box x 0..440, y 230..500 (the region the routing named), which I cropped and
 * looked at first - it is filled by the near west-row sphinxes. Accused = pixels in that box
 * that are actually teal on the base arm (hue 150..240, sat > 0.15, luma 30..200), which excludes
 * the warm sky above and the near-black ink lines. The accused bbox and a mask overlay are
 * emitted so the population is checkable rather than asserted (§104.2).
 *
 * CONTROL REGION: a sandstone box on the pylon (x 700..900, y 120..430) measured the same way,
 * so a global grade shift cannot be mistaken for a sphinx-specific one.
 *
 * dt=0 on every step so animation phase cannot contaminate the comparison.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const SCR = process.env.SANDS_OUT || 'shots/tealarm';

mkdirSync(SCR, { recursive: true });
const res = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 300000 }, async ({ page }) => {
  await page.evaluate(async () => { await window.__GAME.setShot('dunes'); });

  const arm = async (val, tag) => page.evaluate(async ([v, t]) => {
    const eng = window.__ENGINE;
    const sh = eng.get('shading');
    let applied = null;
    if (v !== null) {
      if (sh?.tune) { sh.tune.shadowTeal = v; sh._refreshShadowColor?.(); applied = sh.tune.shadowTeal; }
    } else applied = sh?.tune?.shadowTeal ?? null;
    await window.__GAME.step(3, 0);
    eng.renderFrame(0);
    const src = eng.canvas;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const IW = c.width, IH = c.height, d = g.getImageData(0, 0, IW, IH).data;
    const sx = IW / 1280, sy = IH / 720;
    const at = (x, y) => {
      const i = ((Math.min(IH - 1, Math.round(y * sy))) * IW + Math.min(IW - 1, Math.round(x * sx))) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    return { tag: t, applied, IW, IH, at: null,
      // ship the two boxes back as raw arrays; scoring happens in node
      sphinxBox: (() => { const o = []; for (let y = 230; y < 500; y++) for (let x = 0; x < 440; x++) o.push(at(x, y)); return o; })(),
      stoneBox: (() => { const o = []; for (let y = 120; y < 430; y++) for (let x = 700; x < 900; x++) o.push(at(x, y)); return o; })(),
      png: c.toDataURL('image/png'),
    };
  }, [val, tag]);

  const base = await arm(null, 'base (shipped)');
  const off = await arm(0, 'shadowTeal = 0');
  const ctl = await arm(0.15, 'self-control 0.15');
  return { base, off, ctl };
});

const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const isTeal = ([r, g, b]) => {
  const h = hueOf(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0, lum = (r + g + b) / 3;
  return h >= 150 && h <= 240 && sat > 0.15 && lum > 30 && lum < 200;
};
const W = 440, X0 = 0, Y0 = 230;

// accused population defined on BASE
const acc = [];
base_loop: {
  const b = res.base.sphinxBox;
  for (let i = 0; i < b.length; i++) if (isTeal(b[i])) acc.push(i);
}
let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
for (const i of acc) {
  const x = X0 + (i % W), y = Y0 + Math.floor(i / W);
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
}
const stat = (boxArr, idx) => {
  let n = 0, hs = [], ls = [], ss = [];
  for (const i of idx) {
    const p = boxArr[i]; if (isTeal(p)) n++;
    hs.push(hueOf(...p));
    const mx = Math.max(...p), mn = Math.min(...p);
    ss.push(mx ? (mx - mn) / mx : 0); ls.push((p[0] + p[1] + p[2]) / 3);
  }
  const md = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  return { retain: +(100 * n / idx.length).toFixed(1), hue: Math.round(md(hs)), sat: +md(ss).toFixed(2), lum: Math.round(md(ls)) };
};

console.log(`accused population: ${acc.length} px  (${(100 * acc.length / res.base.sphinxBox.length).toFixed(1)}% of the ROI box)`);
console.log(`accused bbox: x ${bx0}..${bx1}  y ${by0}..${by1}`);
console.log('');
console.log('arm                    applied |  retain%  medHue  medSat  medLuma');
for (const a of [res.base, res.off, res.ctl]) {
  const s = stat(a.sphinxBox, acc);
  console.log(`${a.tag.padEnd(22)} ${String(a.applied).padStart(6)} |  ${String(s.retain).padStart(6)}  ${String(s.hue).padStart(6)}  ${String(s.sat).padStart(6)}  ${String(s.lum).padStart(7)}`);
}
// sandstone control region, scored on its own accused set (should barely move)
const sacc = [];
for (let i = 0; i < res.base.stoneBox.length; i++) if (isTeal(res.base.stoneBox[i])) sacc.push(i);
console.log(`\nsandstone control box: ${sacc.length} teal px on base`);
if (sacc.length > 50) {
  for (const a of [res.base, res.off, res.ctl]) {
    const s = stat(a.stoneBox, sacc);
    console.log(`${a.tag.padEnd(22)}        |  ${String(s.retain).padStart(6)}  ${String(s.hue).padStart(6)}  ${String(s.sat).padStart(6)}  ${String(s.lum).padStart(7)}`);
  }
}
for (const [k, a] of [['base', res.base], ['off', res.off], ['ctl', res.ctl]]) {
  writeFileSync(`${SCR}/a2-${k}.png`, Buffer.from(a.png.split(',')[1], 'base64'));
}
console.log(`\nframes -> ${SCR}/a2-{base,off,ctl}.png`);
