/**
 * fx21 falsifier-power check (§144.1 applied to my own gate).
 *
 * The registered falsifier fires when an EXTERIOR carries a component with ΔL >= 8 over a
 * backdrop of luma < 60 AND R/B < 0.5. It did not fire. This asks the question that separates
 * "did not fire because sandHigh behaves" from "did not fire because the precondition is
 * absent outdoors" — i.e. whether the silence is evidence or an empty test.
 *
 * Reports, per shot, over the FULL component population (not the printed top 6):
 *   n components, how many meet luma<60, how many meet R/B<0.5, how many meet BOTH,
 *   and the max |ΔL| among the both-qualifying set.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { existsSync } from 'node:fs';

const D = '/home/user/Demo/shots/fx21';
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

for (const shot of ['dunes', 'hero', 'courtyard', 'temple']) {
  const fa = `${D}/${shot}.base.png`, fb = `${D}/${shot}.no-sandHigh.png`;
  if (!existsSync(fa) || !existsSync(fb)) { console.log(`${shot}: missing`); continue; }
  const A = readPNG(fa), B = readPNG(fb);
  const W = A.w, H = A.h, mask = new Uint8Array(W * H), lift = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * A.ch;
    if (Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o + 1] - B.data[o + 1]) + Math.abs(A.data[o + 2] - B.data[o + 2]) < 4) continue;
    mask[i] = 1; lift[i] = L(A.data, o) - L(B.data, o);
  }
  const seen = new Uint8Array(W * H);
  let nComp = 0, nDark = 0, nBlue = 0, nBoth = 0, maxBoth = 0, maxBothDesc = '';
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1; const px = [];
    let c = 0, s = 0;
    while (st.length) {
      const j = st.pop(); c++; s += lift[j]; if (px.length < 6000) px.push(j);
      const jx = j % W, jy = (j / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    if (c < 40) continue;
    nComp++;
    // backdrop = the no-sandHigh frame under the component's own pixels
    let br = 0, bg = 0, bb = 0;
    for (const j of px) { const o = j * B.ch; br += B.data[o]; bg += B.data[o + 1]; bb += B.data[o + 2]; }
    const n = px.length, R = br / n, G = bg / n, Bl = bb / n;
    const luma = 0.2126 * R + 0.7152 * G + 0.0722 * Bl, rb = R / Math.max(Bl, 1e-6);
    const dl = s / c;
    const dark = luma < 60, blue = rb < 0.5;
    if (dark) nDark++;
    if (blue) nBlue++;
    if (dark && blue) {
      nBoth++;
      if (Math.abs(dl) > Math.abs(maxBoth)) { maxBoth = dl; maxBothDesc = `${c}px luma ${luma.toFixed(1)} R/B ${rb.toFixed(2)}`; }
    }
  }
  const tag = shot === 'temple' ? '(interior anchor)' : '(EXTERIOR — falsifier applies here)';
  console.log(`${shot.padEnd(10)} ${tag}`);
  console.log(`   components>=40px ${nComp}   backdrop luma<60: ${nDark}   R/B<0.5: ${nBlue}   BOTH: ${nBoth}`);
  console.log(`   max |ΔL| among BOTH-qualifying: ${nBoth ? maxBoth.toFixed(2) + '  (' + maxBothDesc + ')' : 'n/a — precondition never met'}`);
}
console.log('\nReading: the falsifier can only fire where the BOTH column is non-zero. Where that');
console.log('column is 0 for every exterior, its silence is NOT independent confirmation — it is');
console.log('the precondition being absent, which is itself the registered mechanism (§144.1).');
