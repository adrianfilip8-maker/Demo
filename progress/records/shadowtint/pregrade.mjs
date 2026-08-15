/**
 * pregrade.mjs — close the door on the only two POSTFX terms that run UPSTREAM of the grade.
 *
 * The inverse in `invchain.mjs` recovers the radiance entering `c = scene * uExposure`. Between
 * the toon shader and that point PostFX does exactly three things (PostFX.js ~1372-1421):
 *
 *   1. chromatic aberration   — TUNE.chroma is 0.0; the three taps collapse to one texel.
 *   2. AO / contact multiply  — `scene *= mix(1, uAOTint * uAODepth, occ)`.
 *   3. bloom add              — `scene += bloom * uBloomIntensity`.
 *
 * If either (2) or (3) could be putting the red into courtyard's terminator, the miss would be
 * POSTFX after all, just earlier in the pass than §333 looked. Both are checked here rather than
 * waved off:
 *
 *   AO   — `aoTint` is 0x2a3f66, the §2.2 BLUE shadow hue, normalised by `tintColor` so the
 *          multiply can only ever subtract light. It moves a pixel TOWARD blue. It is
 *          arithmetically incapable of raising R/G, which is the defect's whole signature.
 *   BLOOM— gated by `bloomThreshold` in scene-linear. So: invert the BRIGHTEST clean patch in
 *          each frame and compare against that threshold. If the frame's own maximum radiance
 *          is below the threshold, no pixel in it feeds the pyramid and the bloom add is
 *          identically zero everywhere in that frame.
 */
import { readFileSync } from 'node:fs';
import { readPNG } from '../../../tools/png.mjs';
import { lum } from './measure.mjs';
import { scan } from './patches.mjs';
import { vig } from './space.mjs';
import { unGrade } from './invchain.mjs';

const postfx = readFileSync('/home/user/Demo/src/render/PostFX.js', 'utf8');
const g = (re) => Number(postfx.match(re)[1]);
const TH = g(/\n\s*bloomThreshold:\s*([\d.]+)/), KNEE = g(/\n\s*bloomKnee:\s*([\d.]+)/);
const AOTINT = postfx.match(/\n\s*aoTint:\s*0x([0-9a-fA-F]+)/)[1];
console.log(`bloomThreshold ${TH}  bloomKnee ${KNEE}  ->  a pixel feeds the pyramid only above ${(TH - KNEE).toFixed(2)} scene-linear`);
console.log(`aoTint 0x${AOTINT}  (§2.2 shadow BLUE) — the AO multiply moves pixels toward blue, it cannot raise R/G\n`);

const DIR = process.argv[2] ?? 'shots/r12';
for (const shot of ['courtyard', 'kaykit', 'hero', 'dunes']) {
  const im = readPNG(`${DIR}/${shot}.png`);
  const list = scan(im, 0, 0, im.w, im.h, 10, 4.0);
  const top = list.slice(-25);
  let maxLin = 0, at = null;
  for (const p of top) {
    const { scene } = unGrade(p.mean.map((x) => x / vig(p.x, p.y, im.w, im.h)));
    const m = Math.max(...scene);
    if (m > maxLin) { maxLin = m; at = p; }
  }
  /* And the single brightest PIXEL in the frame, which the sd filter would have thrown away —
     a specular speck is exactly the thing that could feed the pyramid unnoticed. */
  let best = null, bestL = -1, clipped = 0;
  for (let i = 0, p = 0; i < im.data.length; i += im.ch, p++) {
    const c = [im.data[i], im.data[i + 1], im.data[i + 2]];
    if (c.every((x) => x >= 254)) clipped++;
    const L = lum(c);
    if (L > bestL) { bestL = L; best = { c, x: p % im.w, y: (p / im.w) | 0 }; }
  }
  const bp = unGrade(best.c.map((x) => x / vig(best.x, best.y, im.w, im.h)));
  const bmax = Math.max(...bp.scene);
  console.log(`${shot.padEnd(10)} brightest clean patch @(${at.x},${at.y}) display L ${lum(at.mean).toFixed(1)} ` +
    `-> peak scene-linear ${maxLin.toFixed(3)}   vs bloom onset ${(TH - KNEE).toFixed(2)}  ` +
    `${maxLin < TH - KNEE ? 'BELOW' : 'ABOVE'}`);
  console.log(`${''.padEnd(10)} brightest single PIXEL @(${best.x},${best.y}) rgb ${best.c.join(',')} L ${bestL.toFixed(1)} ` +
    `-> scene-linear peak ${bmax.toFixed(3)} ${bp.flags.length ? '(' + bp.flags.join(',') + ')' : ''}  ` +
    `${bmax < TH - KNEE ? 'BELOW onset — bloom feed is identically zero in this frame' : 'ABOVE onset'}` +
    `   [white-clipped px in frame: ${clipped}]`);
}
