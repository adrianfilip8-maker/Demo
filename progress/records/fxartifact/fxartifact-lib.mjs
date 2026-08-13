/**
 * Shared instrument code for the three fxartifact seals (PREREG-fxghost / PREREG-fxink /
 * PREREG-seamglint). Pure PNG arithmetic — no lock, no boot. Each scorer imports from here so
 * the three seals' numbers share one implementation of each statistic; the BANDS live in the
 * scorers (one per seal), never here.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DIR = path.join(ROOT, 'progress/records/fxartifact1');

export const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function loadRun() {
  const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
  const img = (shot, arm) => {
    const r = row(shot, arm);
    if (!r) return null;
    const f = path.join(DIR, r.file);
    return existsSync(f) ? readPNG(f) : null;
  };
  return { manifest, row, img };
}

/** Strict differing-pixel count (any RGB byte differs) — the R-bar statistic. */
export function diffPx(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let d = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1]
      || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}

export function roiMeanL(im, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = (y * im.w + x) * im.ch;
    s += L(im.data[o], im.data[o + 1], im.data[o + 2]); n++;
  }
  return s / n;
}

/** Sum|dL| and count over pixels whose |dL| >= thr (whole frame or ROI). */
export function contribution(a, b, thr = 2, roi = null) {
  const [x0, y0, x1, y1] = roi ?? [0, 0, a.w - 1, a.h - 1];
  let n = 0, sum = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * a.w + x) * a.ch, j = (y * b.w + x) * b.ch;
    const dl = L(a.data[i], a.data[i + 1], a.data[i + 2]) - L(b.data[j], b.data[j + 1], b.data[j + 2]);
    if (Math.abs(dl) >= thr) { n++; sum += Math.abs(dl); }
  }
  return { n, sum };
}

/** Cool-glint predicate (kerbband family): bright cool speck on a warm/dim face. */
export function coolGlint(im, [x0, y0, x1, y1], lMin, brMin) {
  let n = 0, sL = 0;
  const set = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    const l = L(r, g, b);
    if (b > r && b - r >= brMin && l >= lMin && b >= g - 4) { n++; sL += l; set.push(y * im.w + x); }
  }
  return { n, meanL: n ? sL / n : 0, set };
}

/** Local-contrast speck predicate (night/guard family): L >= median(11x11 subsample)+lift, cool. */
export function speck(im, [x0, y0, x1, y1], lift = 14) {
  let n = 0;
  const set = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    if (b < r) continue;
    const l = L(r, g, b);
    const vals = [];
    for (let dy = -5; dy <= 5; dy += 2) for (let dx = -5; dx <= 5; dx += 2) {
      const xx = Math.min(im.w - 1, Math.max(0, x + dx)), yy = Math.min(im.h - 1, Math.max(0, y + dy));
      const oo = (yy * im.w + xx) * im.ch;
      vals.push(L(im.data[oo], im.data[oo + 1], im.data[oo + 2]));
    }
    vals.sort((p, q) => p - q);
    if (l >= vals[(vals.length / 2) | 0] + lift) { n++; set.push(y * im.w + x); }
  }
  return { n, set };
}

/** Mean L drop (a - b) evaluated over a frozen pixel set (indices into the frame). */
export function meanDropOverSet(a, b, set) {
  if (!set.length) return null;
  let s = 0;
  for (const p of set) {
    const i = p * a.ch, j = p * b.ch;
    s += L(a.data[i], a.data[i + 1], a.data[i + 2]) - L(b.data[j], b.data[j + 1], b.data[j + 2]);
  }
  return s / set.length;
}

/**
 * Containment: fraction of `changed` px (|dL| >= thrC between armA/armB) lying within the
 * r-dilated footprint (|dL| >= thrF between ref pair). Returns {changed, contained, frac}.
 */
export function containment(off, on, refOff, refHid, { thrC = 2, thrF = 1, r = 6 } = {}) {
  const w = off.w, h = off.h;
  const foot = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = i * refOff.ch, b = i * refHid.ch;
    const dl = L(refOff.data[a], refOff.data[a + 1], refOff.data[a + 2])
             - L(refHid.data[b], refHid.data[b + 1], refHid.data[b + 2]);
    if (Math.abs(dl) >= thrF) foot[i] = 1;
  }
  /* dilate by r (chebyshev) via two-pass max — cheap and exact enough for a containment gate */
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!foot[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        dil[yy * w + xx] = 1;
      }
    }
  }
  let changed = 0, contained = 0;
  for (let i = 0; i < w * h; i++) {
    const a = i * off.ch, b = i * on.ch;
    const dl = L(off.data[a], off.data[a + 1], off.data[a + 2])
             - L(on.data[b], on.data[b + 1], on.data[b + 2]);
    if (Math.abs(dl) < thrC) continue;
    changed++;
    if (dil[i]) contained++;
  }
  return { changed, contained, frac: changed ? contained / changed : 1 };
}

/* ── crop writer (nearest zoom) for the LOOK gates ──────────────────────────────────────── */
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function writeCrop(im, [x, y, w, h], zoom, outFile) {
  const W = w * zoom, H = h * zoom;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let yy = 0; yy < H; yy++) {
    const rowO = yy * (1 + W * 3);
    raw[rowO] = 0;
    for (let xx = 0; xx < W; xx++) {
      const sx = Math.min(im.w - 1, x + ((xx / zoom) | 0)), sy = Math.min(im.h - 1, y + ((yy / zoom) | 0));
      const o = (sy * im.w + sx) * im.ch;
      raw[rowO + 1 + xx * 3] = im.data[o];
      raw[rowO + 2 + xx * 3] = im.data[o + 1];
      raw[rowO + 3 + xx * 3] = im.data[o + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, png);
}

/** Readback check: every lever at its commanded value for this arm, everything else at base. */
export function readbackOK(rowObj, expect) {
  const rb = rowObj?.readback;
  if (!rb) return false;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const base = { uLitMix: 0.52, sandVis: true, fxRootVis: true, uFxInkCut: 0, uRimShadowFloorArch: 0.55, uRimShadowFloor: 0.45 };
  const want = { ...base, ...expect };
  return near(rb.uLitMix, want.uLitMix) && rb.sandVis === want.sandVis
    && rb.fxRootVis === want.fxRootVis && near(rb.uFxInkCut, want.uFxInkCut)
    && near(rb.uRimShadowFloorArch, want.uRimShadowFloorArch)
    && near(rb.uRimShadowFloor, want.uRimShadowFloor);
}

/** Tree stamps: one src content hash across every row, equal to the manifest's expected
    install hash (the candidate tree). The content hash covers the installed file byte-exactly;
    a foreign src landing mid-run changes it and VOIDs here (§296 per-capture stamps). */
export function stampsOK(manifest) {
  const want = manifest.expect.cand;
  for (const r of manifest.rows) if (r.tree?.src !== want) return false;
  return manifest.rows.length > 0;
}

export const ARM_EXPECT = {
  off: {}, back: {},
  ahide: { sandVis: false },
  a26: { uLitMix: 0.26 }, a13: { uLitMix: 0.13 }, a00: { uLitMix: 0.0 },
  bfx0: { fxRootVis: false }, bon: { uFxInkCut: 1.0 },
  c20: { uRimShadowFloorArch: 0.20 }, c10: { uRimShadowFloorArch: 0.10 },
  s10: { uRimShadowFloor: 0.10 },
};
