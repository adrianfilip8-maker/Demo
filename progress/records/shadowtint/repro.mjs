/**
 * repro.mjs — reproduce the r13 critic's two quoted courtyard pixels on the frames that exist.
 *
 * `shots/r13/` is GONE. It was gitignored working output (.gitignore ignores every `shots`
 * subdirectory except `pass1`/`pass2`), it was
 * captured 08-15 01:02, and the container rollback that §325/§329 document wiped it. The newest
 * roster capture on disk is `shots/r12/` (08-13 23:20-23:46). Substituting r12 is legitimate for
 * a SHADING reading and §328 is the authority for saying so, not me: it records that r13
 * "reproduces the r12 calibration to three decimals", and every `src` commit between the two
 * captures is an inert mechanism plus a props dedupe (verified here by `git log -- src/`:
 * cef6a5b, 677b914, 273cca1, 11b852c, 7a06bf1 — the last shipping change before both captures
 * is 0525d5e, 08-13 22:51, ahead of r12's own frames).
 *
 * The substitution is still a substitution, so it is CHECKED rather than assumed: this finds the
 * clean patch nearest each critic hex inside the right colossus and reports the distance.
 */
import { readPNG } from '../../../tools/png.mjs';
import { hsv, lum } from './measure.mjs';
import { scan } from './patches.mjs';
import { vig, hsvLin } from './space.mjs';
import { unGrade } from './invchain.mjs';

const im = readPNG(process.argv[2] ?? 'shots/r12/courtyard.png');
const list = scan(im, 870, 250, 300, 370, 10, 3.0);
const h2 = (h) => { const v = Number.parseInt(h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };

for (const [hexS, label] of [['ba5244', 'critic LIT   #ba5244 (h 7, s 0.63)'], ['563d43', 'critic SHADE #563d43 (h 345, s 0.29)']]) {
  const t = h2(hexS);
  let best = null, bd = 1e9;
  for (const p of list) {
    const d = Math.hypot(...p.mean.map((x, i) => x - t[i]));
    if (d < bd) { bd = d; best = p; }
  }
  const { scene, flags } = unGrade(best.mean.map((x) => x / vig(best.x, best.y, im.w, im.h)));
  console.log(`${label}`);
  console.log(`   nearest clean 10x10 patch @(${best.x},${best.y})  #${best.mean.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}` +
    `  h ${hsv(best.mean).h.toFixed(1)}  s ${hsv(best.mean).s.toFixed(3)}  L ${lum(best.mean).toFixed(1)}   [RGB distance to the quoted hex: ${bd.toFixed(1)}/255]`);
  console.log(`   -> scene-linear ${scene.map((x) => x.toFixed(4)).join(' ')}  h ${hsvLin(scene).h.toFixed(1)}  R/G ${(scene[0] / scene[1]).toFixed(2)}  B/G ${(scene[2] / scene[1]).toFixed(2)}${flags.length ? '  ' + flags : ''}`);
  const { scene: sq } = unGrade(t);
  console.log(`   the QUOTED hex itself, inverted (vignette 1.0): ${sq.map((x) => x.toFixed(4)).join(' ')}  h ${hsvLin(sq).h.toFixed(1)}  R/G ${(sq[0] / sq[1]).toFixed(2)}  B/G ${(sq[2] / sq[1]).toFixed(2)}\n`);
}
