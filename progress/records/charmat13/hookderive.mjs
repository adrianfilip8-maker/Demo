/* hookderive — derive the r12 hook-ROI baseline for PREREG-canegold3's bars.
   The r12 crops are the CENTRE HALF at 1:1 (tools/critic.mjs): crop(cx,cy) -> frame(320+cx,180+cy).
   Read-only on shots/r12/*.png. */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
const F = (n) => readPNG(`/home/user/Demo/shots/r12/${n}.png`);
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
/* hook ROI read off the crops at 1x and translated to frame space. Generous: it contains the
   whole crook plus the top of the shaft, and nothing of the character. */
const ROI = {
  'sly-closeup': { x0: 355, y0: 260, x1: 505, y1: 430 },
  'sly-key':     { x0: 355, y0: 260, x1: 505, y1: 430 },
  'sly-profile': { x0: 510, y0: 230, x1: 620, y1: 400 },
};
for (const [name, r] of Object.entries(ROI)) {
  const im = F(name); const { w, h, ch, data } = im;
  const Ls = [], hues = [], sats = [];
  let n = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const o = (y * w + x) * ch;
    const R = data[o], G = data[o + 1], B = data[o + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    Ls.push(L(data, o)); sats.push(mx ? (mx - mn) / mx : 0);
    let hu = 0; const d = mx - mn;
    if (d) { if (mx === R) hu = 60 * (((G - B) / d) % 6); else if (mx === G) hu = 60 * ((B - R) / d + 2); else hu = 60 * ((R - G) / d + 4); }
    hues.push((hu + 360) % 360);
    n++;
  }
  Ls.sort((a, b) => a - b);
  const q = (p) => Ls[Math.min(Ls.length - 1, Math.floor(p * Ls.length))];
  const cnt = (t) => Ls.filter((v) => v >= t).length;
  console.log(`\n${name}  ROI ${r.x1 - r.x0 + 1}x${r.y1 - r.y0 + 1} = ${n} px  (frame ${w}x${h})`);
  console.log(`  L: p50 ${q(0.5).toFixed(1)}  p90 ${q(0.9).toFixed(1)}  p99 ${q(0.99).toFixed(1)}  p999 ${q(0.999).toFixed(1)}  max ${Ls[Ls.length - 1].toFixed(1)}`);
  console.log(`  count L>=200: ${cnt(200)}   >=210: ${cnt(210)}   >=220: ${cnt(220)}   >=230: ${cnt(230)}   >=240: ${cnt(240)}   >=250: ${cnt(250)}`);
  /* cream-cane subpopulation: high L, low sat */
  let cane = 0, caneL = [], caneH = [], caneS = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const o = (y * w + x) * ch;
    const R = data[o], G = data[o + 1], B = data[o + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), s = mx ? (mx - mn) / mx : 0;
    const l = L(data, o);
    if (l >= 150 && s <= 0.35) { cane++; caneL.push(l); caneS.push(s);
      let hu = 0; const d = mx - mn;
      if (d) { if (mx === R) hu = 60 * (((G - B) / d) % 6); else if (mx === G) hu = 60 * ((B - R) / d + 2); else hu = 60 * ((R - G) / d + 4); }
      caneH.push((hu + 360) % 360); }
  }
  caneL.sort((a, b) => a - b); caneH.sort((a, b) => a - b); caneS.sort((a, b) => a - b);
  const qq = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN;
  console.log(`  cream-cane proxy (L>=150 & sat<=0.35): ${cane} px  L p50 ${qq(caneL, 0.5).toFixed(1)} p99 ${qq(caneL, 0.99).toFixed(1)}  hue p50 ${qq(caneH, 0.5).toFixed(1)}deg  sat p50 ${qq(caneS, 0.5).toFixed(3)} p90 ${qq(caneS, 0.9).toFixed(3)}`);
}
