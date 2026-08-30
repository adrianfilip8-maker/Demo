/**
 * kkbleachmask.mjs — the SCORER half of §737's instrument, kept in its own module so that a
 * mask captured once can be re-scored against any PNG, including one that is already on disk,
 * WITHOUT the capture lock.
 *
 * ── What this measures, and why the previous two rounds could not see the defect ────────────
 *
 * §727 scored the wrong POPULATION (the procedural set-dress table). §736 scored the right
 * population with a WHOLE-POPULATION average — `satMid`, saturation over the population's own
 * middle luma half, pooled across every KayKit body in the frame — and reported near-parity
 * (props 0.363 vs architecture 0.397) on a frame in which hand-sampled patches on individual
 * props read 0.02-0.33 against architecture at 0.36-0.44.
 *
 * A pooled average over a population cannot see this defect for a reason that is structural
 * rather than a matter of tuning: **the defect is not uniform across the population.** The
 * chest, a box, renders at sat 0.557 — MORE saturated than the architecture. The canopic jar,
 * a small rounded body, renders at 0.02-0.19. Both wear the same material, the same atlas and
 * the same `KK_GRADE`, in the same room, under the same lights. Pool them and the box pays for
 * the jar; the mean lands near the architecture and reports a problem that is not there while
 * hiding one that is. That is §442's shape a third time: the right quantity on the wrong
 * subject, under a label that says otherwise.
 *
 * So the subject here is **one object**, never a population:
 *
 *   · the mask is per-BODY, not per-mesh. KayKit merges its 36 placements into three meshes
 *     (KayKit.js:716), so a per-mesh mask would be a population mask wearing an object's label —
 *     §442 rebuilt. `kkbleach.mjs` splits each merged geometry into connected components and
 *     gives every welded body its own id, rendered on the GPU in the same boot that renders the
 *     frames, so registration is by identity rather than by agreement;
 *   · every statistic is reported per object, and the population row is a footnote;
 *   · each object carries TWO measured shape variables rather than a hand-assigned label —
 *     `disp` (angular dispersion of its own visible normals, the variable a SURFACE fresnel
 *     keys on) and `edgeFrac` (its silhouette fraction, the variable a SCREEN-SPACE term keys
 *     on). They are not the same shape and conflating them is how a hypothesis survives a test
 *     it should not have.
 *
 * ── The confound the hand patches could not control ────────────────────────────────────────
 * A chest and a canopic jar differ in shape AND in which patch of the atlas they wear, so
 * "rounder bodies read duller" and "these particular bodies are painted duller" are the same
 * comparison until something separates them. `kkbleach.mjs`'s KKUNI arm gives every body ONE
 * albedo through the real material; a shape correlation that does not survive KKUNI was the
 * texture all along.
 *
 * ── The mask format ────────────────────────────────────────────────────────────────────────
 * `{ shot, w, h, stride, gw, gh, objects: [{ id, mesh, mat, pop }], ids: b64(Int32Array),
 *    nrm: b64(Int8Array x127, view space, 3 per cell), fres: b64(Uint8Array x255) }`
 * one entry per GRID cell (`gw*gh`, cell (gx,gy) = pixel (gx*stride, gy*stride)); `id` -1 = no
 * hit. Normals are the INTERPOLATED shading normals (MeshNormalMaterial), not flat face
 * normals, because that is the normal the shader's fresnel consumes and a low-poly rounded body
 * is smooth-shaded — a face normal would report a barrel as a set of flat panels.
 */
import { readFile } from 'node:fs/promises';
import { readPNG } from './png.mjs';

/** sRGB byte triple -> HSV. `sat` is (max-min)/max, the same quantity the hand patches used. */
export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: mx > 0 ? d / mx : 0, v: mx / 255 };
}

/** Mean of an angular quantity, taken on the unit circle — a hue mean cannot be arithmetic. */
export function meanHue(hs) {
  let x = 0, y = 0;
  for (const h of hs) { const r = (h * Math.PI) / 180; x += Math.cos(r); y += Math.sin(r); }
  if (!hs.length) return { h: 0, r: 0 };
  x /= hs.length; y /= hs.length;
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { h, r: Math.hypot(x, y) };      // r = concentration; r ~ 0 means "no hue at all"
}

const b64ToBuf = (s) => Buffer.from(s, 'base64');

export async function loadMask(file) {
  const m = JSON.parse(await readFile(file, 'utf8'));
  const n = m.gw * m.gh;
  const ids = new Int32Array(b64ToBuf(m.ids).buffer.slice(0), 0, n);
  const nrm = new Int8Array(b64ToBuf(m.nrm).buffer.slice(0), 0, n * 3);
  const fres = new Uint8Array(b64ToBuf(m.fres).buffer.slice(0), 0, n);
  return { ...m, ids, nrm, fres };
}

/**
 * Erode a per-object mask by `r` GRID cells.
 *
 * This is the single most load-bearing line in the instrument and it is why the hand patches
 * and the pooled average disagree. An un-eroded per-object mask includes the object's
 * silhouette pixels, and a silhouette pixel is a blend of the object, its ink outline and
 * whatever stands behind it. On a small rounded prop the silhouette is a large fraction of the
 * footprint, so an un-eroded mask measures the BACKGROUND as much as the object. At stride 2,
 * r = 2 removes a 4 px collar, which clears both the 0.0034 ink shell and the FXAA blend.
 */
export function erode(mask, gw, gh, r) {
  const o = new Uint8Array(gw * gh);
  for (let y = r; y < gh - r; y++) {
    for (let x = r; x < gw - r; x++) {
      if (!mask[y * gw + x]) continue;
      let ok = 1;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) if (!mask[(y + dy) * gw + x + dx]) { ok = 0; break; }
      }
      if (ok) o[y * gw + x] = 1;
    }
  }
  return o;
}

/**
 * Score one PNG against one mask. Returns a row per object plus the pooled population rows,
 * so the two can be printed side by side and the pooling loss is visible rather than argued.
 *
 * `minPix` exists because a 6-cell object is noise; rows below it are returned but flagged, in
 * the shape §736's own 127 px courtyard-night row asked for (quoted because it exists, not
 * because it carries weight).
 */
export async function score(pngFile, mask, { erodeR = 2, minPix = 24 } = {}) {
  const img = await readPNG(pngFile);
  if (img.w !== mask.w || img.h !== mask.h) {
    throw new Error(`size mismatch: ${pngFile} is ${img.w}x${img.h}, mask is ${mask.w}x${mask.h}`);
  }
  const { gw, gh, stride, ids, nrm, fres } = mask;
  const rows = [];
  for (const obj of mask.objects) {
    const m = new Uint8Array(gw * gh);
    let raw = 0;
    for (let i = 0; i < gw * gh; i++) if (ids[i] === obj.id) { m[i] = 1; raw++; }
    if (!raw) continue;
    const e = erode(m, gw, gh, erodeR);
    /* SILHOUETTE FRACTION — how much of this body is within `edgeR` cells of its own outline.
       This, not normal dispersion, is the shape variable the screen-space rim and the ink
       outline actually key on: both fire at a DEPTH DISCONTINUITY, so what matters is an
       object's perimeter against its area, and a small body is nearly all perimeter while a
       wall is nearly none. Normal dispersion is the right variable for the SURFACE fresnel and
       the wrong one for a screen-space term, and the two are not the same shape at all — a flat
       card seen edge-on has zero dispersion and is all silhouette. Both are reported. */
    const inner = erode(m, gw, gh, 3);
    let innerN = 0;
    for (let i = 0; i < gw * gh; i++) if (inner[i]) innerN++;
    const edgeFrac = raw > 0 ? 1 - innerN / raw : 1;
    const S = [], V = [], H = [], F = [];
    const N = [];
    let sumR = 0, sumG = 0, sumB = 0, n = 0;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const gi = gy * gw + gx;
        if (!e[gi]) continue;
        const px = gx * stride, py = gy * stride;
        const p = (py * img.w + px) * img.ch;
        const r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
        const c = hsv(r, g, b);
        S.push(c.s); V.push(c.v); H.push(c.h); F.push(fres[gi] / 255);
        N.push([nrm[gi * 3] / 127, nrm[gi * 3 + 1] / 127, nrm[gi * 3 + 2] / 127]);
        sumR += r; sumG += g; sumB += b; n++;
      }
    }
    if (!n) continue;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    // Measured curvature: mean angle between each visible normal and the object's mean normal.
    let mx = 0, my = 0, mz = 0;
    for (const v of N) { mx += v[0]; my += v[1]; mz += v[2]; }
    const ml = Math.hypot(mx, my, mz) || 1; mx /= ml; my /= ml; mz /= ml;
    let disp = 0;
    for (const v of N) {
      const d = Math.max(-1, Math.min(1, v[0] * mx + v[1] * my + v[2] * mz));
      disp += (Math.acos(d) * 180) / Math.PI;
    }
    disp /= N.length;
    const mh = meanHue(H);
    rows.push({
      id: obj.id, mesh: obj.mesh, mat: obj.mat, pop: obj.pop,
      raw, n, thin: n < minPix,
      rgb: [Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n)],
      sat: mean(S), val: mean(V), hue: mh.h, hueR: mh.r,
      fres: mean(F), disp, edgeFrac,
    });
  }
  return rows;
}

/** Pooled population row — the statistic §736 published, computed here so the loss is shown. */
export function pool(rows, pop) {
  const r = rows.filter((x) => x.pop === pop && !x.thin);
  if (!r.length) return null;
  let n = 0, s = 0, v = 0;
  const hs = [];
  for (const x of r) { n += x.n; s += x.sat * x.n; v += x.val * x.n; for (let i = 0; i < x.n; i++) hs.push(x.hue); }
  return { pop, objects: r.length, n, sat: s / n, val: v / n, hue: meanHue(hs).h };
}

export default { hsv, meanHue, loadMask, erode, score, pool };
