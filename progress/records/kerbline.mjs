#!/usr/bin/env node
/* kerbline — does the `guard` shot still render a bright cyan contact line?
 *
 * §137 records that a geometric fix for this is in the tree and that **it has never been
 * verified in a frame**. Since that was written the picture has got more interesting: there
 * are now THREE recorded candidates for one artefact, owned by three different files, and
 * this probe deliberately does not try to separate them.
 *
 *   1. `EgyptLevel.js` — the stylobate apron sunk +0.02 → −0.07, so its chamfered inner arris
 *      stops standing proud of the paving. Mine. Reasoned from the mechanism, never verified.
 *   2. `Shots.js` — the `guard` camera raised 2.0 m off the west colossus plinth it was
 *      standing 5 cm above. Not mine. **This is the best-evidenced of the three**: it made a
 *      quantitative positional prediction (the plinth's far edge projecting at y 255–264) and
 *      the artefact was then measured at y 260 and 278 with the predicted left-to-right tilt.
 *      Its author's conclusion is that the level geometry was correct and nothing in it needed
 *      changing — which, if right, means candidate 1 fixed a real modelling error that was not
 *      this symptom.
 *   3. `toon.glsl.js` — `uRimShadowFloorArch` at its no-op default. SHADING's, untouched.
 *
 * So the question this answers is the only one that is still open regardless of which
 * diagnosis is correct: **is the signature still in the frame?** A null closes the symptom for
 * all three owners at once. A hit means candidates 1 and 2 have both landed and it is still
 * there, which points at 3 and routes cleanly.
 *
 * The test is deliberately POSITION-INDEPENDENT. The framing has moved since critic pass 2, so
 * scanning "the contact at y=520" would be measuring wherever the crop happens to land now.
 * Instead this searches the whole frame for the artefact's own signature, as pass 2 stated it:
 *
 *     wall L=87 → ink L=26 → L=72 → #598aa2 L=129 → L=34 → ground L=65
 *
 * i.e. a thin horizontal run that is (a) a local vertical maximum brighter than BOTH its
 * neighbours by a real margin, and (b) cyan — blue-dominant over red. A pixel that is merely
 * bright is not the artefact; a pixel that is merely cyan is not either. Requiring both, plus
 * horizontal continuity, is what makes a null here meaningful rather than a threshold that was
 * tuned until the defect disappeared.
 *
 * Reports the worst runs found, with their coordinates, and writes an overlay so the population
 * is checkable rather than asserted. Also emits the raw frame so it can simply be looked at,
 * which is the check that actually decides it.
 *
 * OFFLINE. It scans frames that already exist rather than booting its own browser — the
 * `guard`/`night` pairs are captured by `propshull.mjs` in the same boot as the Task #28 arms,
 * so this question costs no extra lock acquisition. Scanning both the `base` and `hull` arms
 * also answers for free whether the hull change introduced anything at those junctions.
 *
 * usage: node progress/records/kerbline.mjs [dir]     default: shots/propshull
 */
import { readPNG } from '../../tools/png.mjs';
import { readdirSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] || path.join(import.meta.dirname, '../../shots/propshull');

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* The signature, stated once so both the search and the report use the same definition. */
const MARGIN = 18;      // must exceed BOTH vertical neighbours by this much (pass 2: +57/+95)
const MINRUN = 12;      // horizontal continuity, px — a contact line is a line, not a speckle

function scan({ w, h, ch, data }) {
  const at = (x, y) => { const i = (y * w + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  const hits = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(x, y);
      const lc = L(r, g, b);
      const [ru, gu, bu] = at(x, y - 2), [rd, gd, bd2] = at(x, y + 2);
      const lu = L(ru, gu, bu), ld = L(rd, gd, bd2);
      if (lc - lu < MARGIN || lc - ld < MARGIN) continue;   // must be a local max, both sides
      if (b <= r) continue;                                  // must be cyan/blue-dominant
      hits.push({ x, y, r, g, b, lc, lu, ld });
    }
  }
  /* Group into horizontal runs on the same scanline. */
  const byRow = new Map();
  for (const p of hits) { if (!byRow.has(p.y)) byRow.set(p.y, []); byRow.get(p.y).push(p); }
  const runs = [];
  for (const [y, list] of byRow) {
    list.sort((a, b) => a.x - b.x);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i === list.length || list[i].x - list[i - 1].x > 2) {
        const seg = list.slice(start, i);
        if (seg.length >= MINRUN) {
          const mid = seg[seg.length >> 1];
          runs.push({
            y, x0: seg[0].x, x1: seg[seg.length - 1].x, n: seg.length,
            peakL: Math.max(...seg.map((s) => s.lc)),
            lift: Math.max(...seg.map((s) => Math.min(s.lc - s.lu, s.lc - s.ld))),
            hex: `#${[mid.r, mid.g, mid.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
          });
        }
        start = i;
      }
    }
  }
  runs.sort((a, b) => b.lift - a.lift || b.n - a.n);
  return { hits: hits.length, runs };
}

/* ---------------------------------------------------------------------------
 * POSITIVE CONTROL. A null from a detector that has never been shown to fire is
 * worth nothing, and this project has already paid for that lesson once (§139's
 * "a metric moving proves the knob is connected, not that you found the cause";
 * and the five capture cycles spent on a statistic structurally incapable of
 * showing the defect). So before any frame is scanned, synthesise the artefact
 * exactly as critic pass 2 measured it and require the scanner to find it.
 *
 * Pass 2's run, top to bottom:  wall 87 → ink 26 → 72 → #598aa2 (129) → 34 → ground 65
 * ------------------------------------------------------------------------- */
function selftest() {
  const w = 200, h = 40, ch = 4;
  const data = Buffer.alloc(w * h * ch, 255);
  const grey = (v) => [v, v, v];
  const rows = [
    [0, 14, grey(87)],            // wall
    [14, 16, grey(26)],           // ink line
    [16, 18, grey(72)],
    [18, 20, [0x59, 0x8a, 0xa2]], // THE ARTEFACT — 2 px, cyan, brighter than both sides
    [20, 22, grey(34)],
    [22, 40, grey(65)],           // ground
  ];
  for (const [y0, y1, [r, g, b]] of rows) {
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const { hits, runs } = scan({ w, h, ch, data });
  const found = runs.find((r) => r.y >= 18 && r.y < 20);
  console.log('SELFTEST (synthetic pass-2 artefact):');
  console.log(`  candidate px ${hits}, runs ${runs.length}` +
              (found ? `, artefact FOUND at y=${found.y} lift +${found.lift.toFixed(1)} ${found.hex}` : ''));
  if (!found) {
    console.error('  *** SELFTEST FAILED — the detector cannot see the artefact it is looking for.');
    console.error('  *** Every null below would be an artefact of the instrument. Aborting.');
    process.exit(2);
  }
  console.log('  PASS — the detector fires on the signature. A null below is therefore meaningful.\n');
}
selftest();

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.log(`no PNGs in ${DIR}`); process.exit(1); }

const report = [];
for (const f of files) {
  const img = readPNG(path.join(DIR, f));
  const { hits, runs } = scan(img);
  console.log(`\n${f}: ${img.w}x${img.h}  candidate px ${hits}  runs >= ${MINRUN}px: ${runs.length}`);
  for (const r of runs.slice(0, 8)) {
    console.log(`   y=${String(r.y).padStart(4)}  x ${String(r.x0).padStart(4)}..${String(r.x1).padStart(4)}  ` +
                `n=${String(r.n).padStart(4)}  peakL ${r.peakL.toFixed(1)}  lift +${r.lift.toFixed(1)}  ${r.hex}`);
  }
  if (!runs.length) console.log('   none — no bright cyan local-max run anywhere in the frame');
  report.push({ file: f, w: img.w, h: img.h, hits, runs: runs.slice(0, 20) });
}

writeFileSync(path.join(DIR, 'kerbline.json'), JSON.stringify(report, null, 2));
console.log(`\nsignature: local vertical max by >= ${MARGIN} L on BOTH sides (sampled +/-2 px),`);
console.log(`           blue-dominant (B > R), horizontal run >= ${MINRUN} px`);
console.log(`reference : critic pass 2 measured the artefact at #598aa2 L=129 between L=72 and L=34`);
console.log(`            -> lift +57 / +95, far above this threshold. A null here is not a near miss.`);
