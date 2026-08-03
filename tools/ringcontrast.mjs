import { readPNG } from '/home/user/Demo/tools/png.mjs';
/* Ring contrast: the luma separation between the light and dark bands of the tail, measured the
   same way in the authored artefact and the delivered frame.
   P20/P80 rather than a bimodal mode-fit: robust, assumption-free, and it does not need the two
   populations to be equal in area (they are not — the crops frame different amounts of each). */
const stat = (f, label, alphaCut) => {
  const im = readPNG(f), ch = im.data.length / (im.w * im.h);
  const L = [];
  for (let i = 0, p = 0; i < im.w * im.h; i++, p += ch) {
    if (ch === 4 && im.data[p + 3] < 128) continue;        // artefact is on transparent background
    const l = 0.2126 * im.data[p] + 0.7152 * im.data[p + 1] + 0.0722 * im.data[p + 2];
    if (alphaCut && l > 245) continue;                      // drop pure-white matte if not alpha'd
    L.push(l);
  }
  L.sort((a, b) => a - b);
  const q = (t) => L[Math.min(L.length - 1, Math.max(0, Math.round(t * (L.length - 1))))];
  const p20 = q(0.20), p50 = q(0.50), p80 = q(0.80);
  console.log(`${label.padEnd(22)} n=${String(L.length).padStart(7)}  P20 ${p20.toFixed(1).padStart(6)}  `
    + `P50 ${p50.toFixed(1).padStart(6)}  P80 ${p80.toFixed(1).padStart(6)}  `
    + `SEPARATION P80-P20 ${(p80 - p20).toFixed(1).padStart(6)}  `
    + `Weber (P80-P20)/P50 ${((p80 - p20) / p50).toFixed(3)}`);
  return { p20, p50, p80, sep: p80 - p20, weber: (p80 - p20) / p50 };
};
const S = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad';
const art = stat(`${S}/tailart.png`, 'AUTHORED (flat-lit)', true);
const del = stat(`${S}/tail13.png`, 'DELIVERED (char13)', false);
console.log(`\nabsolute separation retained: ${(100 * del.sep / art.sep).toFixed(1)}%`);
console.log(`Weber contrast retained:      ${(100 * del.weber / art.weber).toFixed(1)}%`);
console.log('\nThe artefact is FLAT-LIT and the frame is scene-lit at a specific time of day, so');
console.log('some loss is legitimate rather than a defect. The question this answers is how much');
console.log('is left, not whether any was lost.');
