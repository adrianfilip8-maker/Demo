/**
 * pnightbr — frame-wide b-r on the pnight1 arms.
 *
 * PREREG-pnight 3.1: frame-wide Δb−r "is retained and reported ONLY as the continuity link to
 * §133.2's published figure, and is explicitly not the acceptance." This file computes exactly
 * that and nothing else. The acceptance is `huescore` on archShade; see pnighthue.mjs.
 *
 * §133.2 published, for night: Δb−r = −0.0033 on a base of +0.1605 (2.1% warm-ward),
 * Δluma +0.0004. Reproducing those two numbers here is a CONTINUITY CHECK on the pipeline and
 * the frames, not evidence about the acceptance: §115.2 is the standing record that frame-wide
 * b−r cannot localise anything and cannot see green at all, which is the channel §8's live
 * residual actually moves.
 *
 * Channels are read as 8-bit sRGB and divided by 255, matching how §133.2's figure was formed.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { existsSync } from 'node:fs';

const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnight1/frames';
const ARMS = ['base', 'rimfloor0', 'sbm040', 'compose', 'base2'];
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

let ref = null;
console.log('arm          mean(b-r)     d(b-r)    %ofbase   mean luma   d luma');
for (const arm of ARMS) {
  const f = `${F}/night-${arm}.png`;
  if (!existsSync(f)) continue;
  const im = readPNG(f);
  let sbr = 0, sl = 0;
  const n = im.w * im.h;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const [r, g, b] = px(im, x, y);
    sbr += (b - r) / 255;
    sl += L(r, g, b) / 255;
  }
  const br = sbr / n, lu = sl / n;
  if (arm === 'base') ref = { br, lu };
  const d = br - ref.br, dl = lu - ref.lu;
  console.log(`${arm.padEnd(11)} ${br.toFixed(4).padStart(9)} ${(d >= 0 ? '+' : '') + d.toFixed(4)}`.padEnd(34) +
    `${(100 * d / Math.abs(ref.br)).toFixed(2).padStart(7)}%  ${lu.toFixed(4).padStart(9)}   ${(dl >= 0 ? '+' : '') + dl.toFixed(4)}`);
}
console.log('\n§133.2 published for night: base b-r +0.1605, d(b-r) -0.0033 (2.1% warm-ward), d luma +0.0004');
console.log('A match here says the frames and the reader agree with the ledger. It says NOTHING');
console.log('about P-night, which is scored on archShade hue (PREREG-pnight 3.1/3.3).');
