/**
 * analyse3 — score the gate1 sweep against PREREG-gate1 (+ its amendment).
 *
 * WHAT THIS IS NOT (§11 — the suffix not implemented):
 *   - `archShade` is roigen's GEOMETRIC population: architecture whose normal faces away from
 *     the sun. Per amendment A1 that means ramp = 0, key = 0, shadowMix = 1 EXACTLY, so the
 *     gate is switched off there by construction. It is the ledger's line, and it is NOT a
 *     test of the gate. Reported to show the line still holds, never as evidence the gate works.
 *   - The `changed` population IS the gate's real subject: pixels the renderer drew differently
 *     from `base`. A mask the renderer draws beats a projected one (§11's charview lesson).
 *   - Frame b-r is a whole-frame mean and localises nothing; changed% is collateral SIZE, not
 *     merit (§8: 83.8% changed, defect bit-intact).
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/gate/frames';
const R = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift';
const ARMS = ['base', 'gate20_70', 'gate20_85', 'gate20_95', 'gate35_85', 'sbm20', 'sbm085', 'sbm175', 'base2'];
const SHOTS = process.argv.slice(2).length ? process.argv.slice(2) : ['hero', 'temple', 'sly-closeup', 'night'];

const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function writePNG(file, w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** stats over an explicit point list */
function statsAt(im, pts) {
  const hs = [], ss = [];
  let bmr = 0, L = 0, gd = 0;
  for (const [x, y] of pts) {
    const [r, g, b] = px(im, x, y);
    hs.push(hueOf(r, g, b));
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    ss.push(mx ? (mx - mn) / mx : 0);
    bmr += (b - r) / 255; L += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (g < r && g < b) gd++;
  }
  const n = pts.length || 1;
  return { hue: med(hs), sat: med(ss), bmr: bmr / n, L: L / n, gd: 100 * gd / n, n: pts.length };
}

for (const shot of SHOTS) {
  if (!existsSync(`${F}/${shot}-base.png`)) { console.log(`\n### ${shot}: no frames yet`); continue; }
  const base = readPNG(`${F}/${shot}-base.png`);
  const W = base.w, H = base.h, N = W * H;

  console.log(`\n################ ${shot}  (${W}x${H}) ################`);
  console.log('--- whole frame ---');
  console.log('arm            b-r      d(b-r)     luma    d(luma)   changed%  maxCh');
  let bB = 0, lB = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(base, x, y); bB += (b - r) / 255; lB += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
  bB /= N; lB /= N;
  const masks = {};
  for (const arm of ARMS) {
    const p = `${F}/${shot}-${arm}.png`;
    if (!existsSync(p)) continue;
    const im = readPNG(p);
    let bmr = 0, L = 0, diff = 0, maxd = 0; const pts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b] = px(im, x, y);
      bmr += (b - r) / 255; L += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const [r2, g2, b2] = px(base, x, y);
      const d = Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2));
      if (d) { diff++; if (d > maxd) maxd = d; if (arm !== 'base') pts.push([x, y]); }
    }
    bmr /= N; L /= N; masks[arm] = pts;
    console.log(`${arm.padEnd(13)} ${bmr.toFixed(4).padStart(7)}  ${((bmr - bB) >= 0 ? '+' : '') + (bmr - bB).toFixed(4)}   ${L.toFixed(4)}  ${((L - lB) >= 0 ? '+' : '') + (L - lB).toFixed(4)}   ${(100 * diff / N).toFixed(2).padStart(6)}%   ${String(maxd).padStart(3)}`);
    if (arm === 'base2') console.log(`  P1 NULL: base2 vs base -> ${diff} px differ (max delta ${maxd})  ${diff === 0 ? 'PASS bit-identical' : 'FAIL — poke/restore leaked, numbers VOID'}`);
  }

  /* ---- the population the gate actually changes (amendment A2) ---- */
  const probe = 'gate20_85';
  if (masks[probe]?.length) {
    const pts = masks[probe];
    console.log(`\n--- CHANGED population for ${probe} (${pts.length} px, ${(100 * pts.length / N).toFixed(2)}% of frame) — the gate's real subject ---`);
    console.log('arm            hueP50  satP50   mean b-r   meanL   G-darkest%');
    for (const arm of ['base', probe, 'sbm20', 'sbm085']) {
      const p = `${F}/${shot}-${arm}.png`; if (!existsSync(p)) continue;
      const s = statsAt(readPNG(p), pts);
      console.log(`${arm.padEnd(13)} ${s.hue.toFixed(0).padStart(5)}   ${s.sat.toFixed(3)}   ${(s.bmr >= 0 ? '+' : '') + s.bmr.toFixed(4)}   ${s.L.toFixed(1).padStart(5)}    ${s.gd.toFixed(1).padStart(5)}%`);
    }
    /* overlay: where is it? derive the region, then LOOK at it (§114.6) */
    const rgb = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(base, x, y); const i = (y * W + x) * 3; const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.45; rgb[i] = L; rgb[i + 1] = L; rgb[i + 2] = L; }
    for (const [x, y] of pts) { const i = (y * W + x) * 3; rgb[i] = 255; rgb[i + 1] = 40; rgb[i + 2] = 200; }
    writePNG(`${F}/../mask-${shot}-${probe}.png`, W, H, rgb);
    console.log(`  overlay -> mask-${shot}-${probe}.png (magenta = changed)`);
  }

  /* ---- archShade: the ledger line. Per A1 the gate is inert here BY CONSTRUCTION. ---- */
  const roiPath = `${R}/roi-${shot}.json`;
  if (!existsSync(roiPath)) { console.log(`  (no roi-${shot}.json — ledger line not scored)`); continue; }
  const roi = JSON.parse(readFileSync(roiPath, 'utf8'));
  for (const pop of ['archShade', 'archLit', 'sky']) {
    const pts = roi[pop]; if (!pts?.length) continue;
    const isLedger = pop === 'archShade';
    console.log(`\n--- ${pop} (${pts.length} samples)${isLedger ? '   [ledger: hue<=226, G-darkest<50% | A1: gate MUST be inert here]' : ''} ---`);
    console.log('arm            hueP50  satP50   mean b-r   meanL   G-darkest%  verdict');
    let baseS = null;
    for (const arm of ARMS) {
      const p = `${F}/${shot}-${arm}.png`; if (!existsSync(p)) continue;
      const s = statsAt(readPNG(p), pts);
      if (arm === 'base') baseS = s;
      let verdict = isLedger ? (s.hue <= 226 && s.gd < 50 ? 'pass' : 'FAIL') : '';
      if (isLedger && arm.startsWith('gate') && baseS) {
        verdict += Math.abs(s.bmr - baseS.bmr) < 1e-9 && Math.abs(s.hue - baseS.hue) < 1e-9 ? '  A1:inert' : '  A1:MOVED';
      }
      console.log(`${arm.padEnd(13)} ${s.hue.toFixed(0).padStart(5)}   ${s.sat.toFixed(3)}   ${(s.bmr >= 0 ? '+' : '') + s.bmr.toFixed(4)}   ${s.L.toFixed(1).padStart(5)}    ${s.gd.toFixed(1).padStart(5)}%     ${verdict}`);
    }
  }
}
