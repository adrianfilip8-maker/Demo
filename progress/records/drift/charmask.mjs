/**
 * Character ROI derived BY THE RENDERER, not by projection.
 *
 * `subjWarmShade` is vSlySkin-scoped in toon.glsl.js — it multiplies into the shade-side lights
 * on skinned draws only, and for vSlySkin = 0 the expression is algebraically unchanged. So the
 * pixels where `<shot>-base.png` and `<shot>-subjwarm0.png` differ ARE the skinned draws.
 *
 * Why this rather than a projected silhouette: §11 records three probes that produced confident
 * wrong numbers from projection — charview's "in frame is not visible", shotsil's missing foot
 * IK, and the night eye box over cheek fur. A mask the renderer itself drew has no such gap.
 *
 * SCOPE — what this mask is NOT: it is "pixels the subject-scoped knob changed", which is the
 * character MINUS any character pixel the knob happens not to move (a fully key-lit pixel has
 * no shade-side term to warm, so it will be missing) PLUS any bloom the change widened. It is
 * therefore a conservative interior sample of the character, not his silhouette. Do not quote
 * it as a pixel count of the character.
 *
 *   node charmask.mjs <shot> <arm> [arm ...]
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';

const DIR = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift/frames';
const SHOT = process.argv[2], ARMS = process.argv.slice(3);
const THRESH = 2;   // display levels; below this is PNG/rounding noise, not the knob

const a = readPNG(`${DIR}/${SHOT}-base.png`), b = readPNG(`${DIR}/${SHOT}-subjwarm0.png`);
const W = a.w, H = a.h;
const mask = new Uint8Array(W * H);
let n = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = px(a, x, y), q = px(b, x, y);
  if (Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])) >= THRESH) {
    mask[y * W + x] = 1; n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
console.log(`${SHOT}: subject mask ${n} px (${(100 * n / (W * H)).toFixed(2)}% of frame)  bbox x ${x0}..${x1} y ${y0}..${y1}`);
if (!n) { console.log('EMPTY — subjWarmShade moved nothing, so either it is not reaching the shader or the subject is not in this frame. Do not read the rows below.'); process.exit(0); }

const hue = (r, g, b2) => { const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b2) / d) % 6 : mx === g ? (b2 - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; };
const medn = (v) => { const q = [...v].sort((p, r) => p - r); return q[q.length >> 1]; };

console.log('\narm          hueP50  satP50   mean b-r   mean L    R/G');
for (const arm of ARMS) {
  let im; try { im = readPNG(`${DIR}/${SHOT}-${arm}.png`); } catch { continue; }
  const hs = [], ss = []; let bmr = 0, L = 0, R = 0, G = 0, c = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    const [r, g, b2] = px(im, x, y);
    hs.push(hue(r, g, b2)); const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2);
    ss.push(mx ? (mx - mn) / mx : 0);
    bmr += (b2 - r) / 255; L += 0.2126 * r + 0.7152 * g + 0.0722 * b2; R += r; G += g; c++;
  }
  console.log(`${arm.padEnd(12)} ${medn(hs).toFixed(0).padStart(5)}   ${medn(ss).toFixed(3)}   ${(bmr / c >= 0 ? '+' : '') + (bmr / c).toFixed(4)}    ${(L / c).toFixed(1).padStart(5)}   ${(R / G).toFixed(3)}`);
}
