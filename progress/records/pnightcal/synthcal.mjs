/**
 * O2 — PREREG-pnightcal §6. Synthetic §13 state: the instrument must move, by a predicted
 * amount, on a state CONSTRUCTED to carry the defect quantity.
 *
 * Takes the durable `night-base.png` (pnight1, Aug-3 tree — fine: O2 calibrates the
 * STATISTIC, not the tree) and produces:
 *   - `rot0`  : decode -> encode, bytes untouched. Every population's dHue must be exactly
 *               0.000 — the noise floor is a real zero, not a small number (§160.3's
 *               pattern: the null arm licenses reading the table).
 *   - `rot1/2/5/13` : per-pixel HSV hue rotation of +delta degrees, whole frame, then
 *               8-bit re-quantisation. Registered prediction: archShade AND sky dHue in
 *               [0.7*delta, 1.3*delta], sign positive, for every delta. G4 binds at
 *               delta=+1 (below L1's 1.40 deg line).
 *
 * Whole-frame deliberately: a rotation confined to archShade sample coordinates would be
 * "localised" by bookkeeping — the metric only reads sampled points — and prove nothing.
 * The sky half is what earns its place: gain >= 0.7 there means a global warm drift of
 * >= 0.43 deg trips L2's 0.30 deg band, i.e. the control can actually catch the failure
 * class it exists for.
 *
 * Scoring is the sealed statistic verbatim (hueOf/med/dHue copied from pnighthue.mjs,
 * §122.1), against the durable stride-4 roi-night.json — the same instrument the new
 * capture will be scored with (on a regenerated ROI).
 *
 * Synth frames land in the scratchpad: they are 2 MB apiece and bit-reproducible from the
 * durable base frame plus this file; the durable output is the printed table, carried into
 * RESULT-pnightcal.md.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const BASE = '/home/user/Demo/progress/records/pnight1/frames/night-base.png';
const ROI_FILE = '/home/user/Demo/progress/records/pnight1/roi-night.json';
const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnightcal-synth';
mkdirSync(OUT, { recursive: true });

const DELTAS = [0, 1, 2, 5, 13];
const GAIN_LO = 0.7, GAIN_HI = 1.3;

/* ---- minimal PNG writer: 8-bit, filter 0 every row ---- */
const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, body) => {
  const b = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const out = Buffer.alloc(b.length + 8);
  out.writeUInt32BE(body.length, 0); b.copy(out, 4); out.writeUInt32BE(crc32(b), b.length + 4);
  return out;
};
function writePNG(file, im) {
  const { w, h, ch, data } = im;
  const stride = w * ch, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 3 ? 2 : 6; // truecolor / +alpha
  writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ---- hue rotation, RGB->HSV->RGB, 8-bit in and out ---- */
function rotateHue(im, deg) {
  const out = { w: im.w, h: im.h, ch: im.ch, data: Buffer.from(im.data) };
  const d = out.data, n = im.w * im.h, ch = im.ch;
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    const r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
    if (df === 0) continue;                                  // grey stays grey
    let hh = mx === r ? ((g - b) / df) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4;
    hh = (hh * 60 + deg) % 360; if (hh < 0) hh += 360;
    const s = mx === 0 ? 0 : df / mx, v = mx;
    const c = v * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c;
    let rr, gg, bb;
    if (hh < 60) [rr, gg, bb] = [c, x, 0]; else if (hh < 120) [rr, gg, bb] = [x, c, 0];
    else if (hh < 180) [rr, gg, bb] = [0, c, x]; else if (hh < 240) [rr, gg, bb] = [0, x, c];
    else if (hh < 300) [rr, gg, bb] = [x, 0, c]; else [rr, gg, bb] = [c, 0, x];
    d[o] = Math.round((rr + m) * 255); d[o + 1] = Math.round((gg + m) * 255); d[o + 2] = Math.round((bb + m) * 255);
  }
  return out;
}

/* ---- sealed statistic, verbatim ---- */
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const dHue = (h, ref) => { let d = h - ref; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };

const roi = JSON.parse(readFileSync(ROI_FILE, 'utf8'));
const scorePop = (im, pts) => med(pts.map(([x, y]) => { const [r, g, b] = px(im, x, y); return hueOf(r, g, b); }));

console.log('O2 synthetic calibration — sealed statistic on constructed defect states');
console.log(`base: ${BASE}`);
console.log(`roi:  stride ${roi.STRIDE}  archShade ${roi.archShade.length}  sky ${roi.sky.length}\n`);

const base = readPNG(BASE);
const ref = { archShade: scorePop(base, roi.archShade), sky: scorePop(base, roi.sky) };
console.log(`reference hueP50  archShade ${ref.archShade.toFixed(3)}  sky ${ref.sky.toFixed(3)}\n`);
console.log('delta   pop        hueP50    dHue     gain    predicted band     verdict');

let g4pass = null; let allOk = true;
for (const delta of DELTAS) {
  const im = delta === 0 ? { ...base, data: Buffer.from(base.data) } : rotateHue(base, delta);
  const f = path.join(OUT, `night-rot${delta}.png`);
  writePNG(f, im);
  const back = readPNG(f);                                   // score the ENCODED file — full path
  for (const pop of ['archShade', 'sky']) {
    const h = scorePop(back, roi[pop]);
    const dh = dHue(h, ref[pop]);
    if (delta === 0) {
      const ok = dh === 0;
      allOk &&= ok;
      console.log(`+0     ${pop.padEnd(10)} ${h.toFixed(3).padStart(8)} ${dh.toFixed(3).padStart(8)}     —     exactly 0.000       ${ok ? 'PASS' : 'FAIL — floor is not a real zero'}`);
    } else {
      const gain = dh / delta;
      const ok = dh > 0 && gain >= GAIN_LO && gain <= GAIN_HI;
      allOk &&= ok;
      if (delta === 1 && pop === 'archShade') g4pass = ok;
      console.log(`+${String(delta).padEnd(5)} ${pop.padEnd(10)} ${h.toFixed(3).padStart(8)} ${dh.toFixed(3).padStart(8)} ${gain.toFixed(3).padStart(7)}   [${(GAIN_LO * delta).toFixed(2)}, ${(GAIN_HI * delta).toFixed(2)}]        ${ok ? 'PASS' : 'FAIL'}`);
    }
  }
}
console.log(`\nG4 (gain in [0.7,1.3] at delta=+1 on archShade): ${g4pass ? 'PASS — L1 at 1.40 deg is above the instrument resolution' : 'FAIL — P-night UNSCOREABLE at the 1.40 deg line'}`);
console.log(`O2 overall: ${allOk ? 'PASS' : 'FAIL'}`);
