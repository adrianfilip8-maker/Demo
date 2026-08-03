/**
 * Frame-wide luma / mean b-r per arm, plus the delta each arm buys against its shot's `base`.
 *
 * Statistic is identical to tools/bmr.mjs (the instrument §111 quotes), recomputed here so the
 * per-arm table and the published tx7/char12 numbers are on the same definition.
 *
 * NOT localised: a frame mean cannot say WHERE a change landed, and §104.2 is the standing
 * example of a colour statistic over the wrong population. The per-shot crops and the sphinx
 * ROI carry that half.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readdirSync, existsSync } from 'node:fs';

const DIR = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift/frames';
const ORDER = ['base', 'fill0', 'sbm20', 'teal0', 'rim205', 'bloom155', 'fill0sbm20', 'tx7all', 'base2'];
/* Reference points, measured here off the archived captures with this exact statistic.
   `hero` reproduces §111's published pair to 4dp (tx7 0.2721/-0.0292, char12 0.2956/+0.0119),
   which is what licenses using the same instrument for the two shots §111 quotes only as
   "0.04 to 0.10". tx7 = shots/tx7 (report.json sha 7dc4442, dirty:false); today =
   shots/arris2-off2 (sha ad1b3a5), the most recent capture holding all three shots.

   NOTE THE LUMA COLUMN — it does not move together. hero +0.0236, interior +0.0009,
   temple -0.0259. A single global brightening term cannot produce that; a luminance-matched
   HUE rotation can, and both prime suspects are luma-matched by construction. */
const REF = {
  hero:     { tx7: [0.2721, -0.0292], today: [0.2957, +0.0121] },
  temple:   { tx7: [0.3314, -0.0456], today: [0.3055, +0.0526] },
  interior: { tx7: [0.2357, +0.0162], today: [0.2366, +0.0748] },
};

function stat(f) {
  const im = readPNG(f), ch = im.data.length / (im.w * im.h), N = im.w * im.h;
  let L = 0, bmr = 0;
  for (let i = 0, p = 0; i < N; i++, p += ch) {
    L += (0.2126 * im.data[p] + 0.7152 * im.data[p + 1] + 0.0722 * im.data[p + 2]) / 255;
    bmr += (im.data[p + 2] - im.data[p]) / 255;
  }
  return { L: L / N, bmr: bmr / N, w: im.w, h: im.h };
}

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.png')) : [];
const shots = [...new Set(files.map((f) => f.replace(/-[^-]+\.png$/, '')))];

for (const shot of shots) {
  const have = ORDER.filter((a) => files.includes(`${shot}-${a}.png`));
  if (!have.length) continue;
  const base = stat(`${DIR}/${shot}-base.png`);
  console.log(`\n=== ${shot} ===   base luma ${base.L.toFixed(4)}  b-r ${base.bmr >= 0 ? '+' : ''}${base.bmr.toFixed(4)}`);
  if (REF[shot]) {
    const [tl, tb] = REF[shot].tx7, [cl, cb] = REF[shot].today;
    console.log(`    §111 reference:  tx7 ${tl.toFixed(4)} / ${tb.toFixed(4)}    char12 ${cl.toFixed(4)} / +${cb.toFixed(4)}    swing to close: d(b-r) ${(tb - cb).toFixed(4)}`);
  }
  console.log('arm          luma      d(luma)    b-r       d(b-r)    % of the tx7->HEAD swing closed');
  const target = REF[shot] ? REF[shot].tx7[1] - REF[shot].today[1] : null;
  for (const a of have) {
    const s = stat(`${DIR}/${shot}-${a}.png`);
    const db = s.bmr - base.bmr, dl = s.L - base.L;
    const share = target ? `${(100 * db / target).toFixed(0)}%` : '';
    console.log(`${a.padEnd(12)} ${s.L.toFixed(4)}  ${(dl >= 0 ? '+' : '') + dl.toFixed(4)}   ${(s.bmr >= 0 ? '+' : '') + s.bmr.toFixed(4)}  ${(db >= 0 ? '+' : '') + db.toFixed(4)}   ${share}`);
  }
  if (files.includes(`${shot}-base2.png`)) {
    const b2 = stat(`${DIR}/${shot}-base2.png`);
    const ok = Math.abs(b2.L - base.L) < 1e-9 && Math.abs(b2.bmr - base.bmr) < 1e-9;
    console.log(`SELF-CONTROL base2 vs base: ${ok ? 'IDENTICAL — poke/restore path is clean' : `DRIFTED dL ${(b2.L - base.L).toExponential(2)} dbmr ${(b2.bmr - base.bmr).toExponential(2)} — arms are NOT independent`}`);
  }
}
