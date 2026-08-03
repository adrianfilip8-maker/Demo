/**
 * gildlit — is a material's on-screen population LIT, in an existing capture?
 *
 * Written for one decision: §158.5 named `guard` as the closest gilded view in the canonical set
 * (23.18 % of frame, 2–3 mm/px, 3.8x closer than `hero`) and proposed a gold seal on it. §7.3's
 * gold condition is "hard spec + bloom + dark occlusion", and a *hard specular* is a property of a
 * surface under a strong key. `guard` is staged at `tod 0.10`. So before any capture is spent, the
 * question is whether that framing presents a lit gilded surface at all — the same class of
 * question that made `temple` untestable for tiling (RESULT-hgchisel-frame §1.1), asked before the
 * frame rather than discovered in it.
 *
 * It crosses an architecture material mask (`matmask.mjs`) with an already-captured PNG and reports
 * the luma distribution, the highlight tail, and the chroma of the material's own pixels — plus the
 * same figures for a reference material in the same frame, so "dark" can be read as "dark for this
 * frame" rather than "dark in absolute terms".
 *
 * SCOPE — the transforms between this and what the renderer drew, i.e. the suffix NOT implemented
 * (KNOWN_ISSUES §11):
 *   - THE MASK IS ARCHITECTURE-ONLY. Props, terrain, character, FX and sky are not in it, so any
 *     pixel one of those covers in the real frame is still attributed here to the masonry behind
 *     it. The mask is eroded by `--erode` texels to keep silhouette-adjacent pixels out, and every
 *     statistic below is a percentile rather than a mean for the same reason.
 *   - The PNG is a *finished* frame: tonemap, grade, split-tone, bloom and ink are all in it. This
 *     measures what the viewer sees, not the shading term. It cannot attribute a dark pixel to
 *     albedo vs shadow vs exposure.
 *   - PROVENANCE: the mask comes from the CURRENT tree, the PNG from whatever tree captured it. If
 *     architecture has moved since, the mask is misregistered. Pass `--sha` to record the capture's
 *     provenance in the output; it is not verified here.
 *
 *   node gildlit.mjs <shot> <capture.png> <mask.bin> [--mat arch:hieroglyph_gilded]
 *                    [--ref arch:sandstone_worn] [--erode 2] [--sha <note>]
 */
import { readFileSync } from 'node:fs';
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const [shot, pngPath, maskPath] = argv;
const MAT = opt('mat', 'arch:hieroglyph_gilded');
const REF = opt('ref', 'arch:sandstone_worn');
const ERODE = parseInt(opt('erode', '2'), 10);
const SHA = opt('sha', '(unrecorded)');

const im = readPNG(pngPath);
const mask = new Uint8Array(readFileSync(maskPath));
const side = JSON.parse(readFileSync(`${maskPath}.json`, 'utf8'));
const names = side.mats || side.materials || side.names || side;
const idxOf = (nm) => names.indexOf(nm);

const W = side.W || side.w || im.w, H = side.H || side.h || im.h;
if (W !== im.w || H !== im.h) { console.error(`size mismatch: mask ${W}x${H} png ${im.w}x${im.h}`); process.exit(1); }

/** Erode a material's mask by `r` so pixels adjacent to another material (where props, the
 *  character or the ink pass are most likely to intrude) drop out. */
function eroded(id, r) {
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = mask[i] === id ? 1 : 0;
  if (r <= 0) return m;
  let cur = m;
  for (let pass = 0; pass < r; pass++) {
    const nx = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        nx[i] = cur[i] && cur[i - 1] && cur[i + 1] && cur[i - W] && cur[i + W] ? 1 : 0;
      }
    }
    cur = nx;
  }
  return cur;
}

const pct = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];

function stats(id) {
  const m = eroded(id, ERODE);
  const L = [], C = [], RmB = [];
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const o = i * im.ch;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    L.push(r * 0.2126 + g * 0.7152 + b * 0.0722);
    C.push(Math.max(r, g, b) - Math.min(r, g, b));
    RmB.push(r - b);
    n++;
  }
  if (!n) return null;
  L.sort((a, b) => a - b); C.sort((a, b) => a - b); RmB.sort((a, b) => a - b);
  const over = (t) => +((L.filter((v) => v >= t).length / n) * 100).toFixed(2);
  return {
    px: n, shareOfFrame: +((n / (W * H)) * 100).toFixed(2),
    L: { p01: +pct(L, 0.01).toFixed(1), p05: +pct(L, 0.05).toFixed(1), p50: +pct(L, 0.5).toFixed(1), p95: +pct(L, 0.95).toFixed(1), p99: +pct(L, 0.99).toFixed(1), max: +L[n - 1].toFixed(1) },
    /* The specular tail is what "reads as metal" means: a small population far above the body of
     * the distribution. Reported as share-over-threshold, not as a mean, because a mean cannot
     * distinguish a hard highlight from a generally bright surface. */
    tail: { over160: over(160), over200: over(200), over230: over(230) },
    span: +(pct(L, 0.95) / Math.max(1, pct(L, 0.05))).toFixed(2),
    chroma: { p50: +pct(C, 0.5).toFixed(1), p95: +pct(C, 0.95).toFixed(1) },
    RmB: { p50: +pct(RmB, 0.5).toFixed(1) },
  };
}

const out = { shot, png: pngPath, capturedAt: SHA, erode: ERODE, size: `${W}x${H}` };
for (const nm of [MAT, REF]) {
  const id = idxOf(nm);
  out[nm] = id < 0 ? 'ABSENT FROM MASK' : stats(id);
}
console.log(JSON.stringify(out, null, 1));
