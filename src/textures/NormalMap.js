/**
 * NormalMap — turns a height field into the maps a shader actually samples.
 *
 * Nothing here copies the albedo. Normal, AO and roughness are all *derived from the same
 * `Float32Array` height buffer* the recipe carved, which is why a chiselled glyph catches a
 * grazing sun on its upper bevel and goes black in its lower one instead of looking printed.
 *
 * Conventions
 * -----------
 * • Tangent space is OpenGL / three.js: +R = +U, +G = +V, +B = out of the surface. A `DataTexture`
 *   has `flipY = false`, so data row 0 is v = 0 and +V is +row — green therefore encodes
 *   `-dH/drow`. Get this backwards and every carving reads as an embossment.
 * • Height is stored 0..1; the material's `bump` (peak-to-peak relief in metres) and `tile`
 *   (physical size of one repeat in metres) convert it to a real slope, so a 6 mm chisel groove
 *   and a 40 cm block step produce correctly *proportioned* normals rather than arbitrary ones.
 * • Roughness/AO/metalness ship packed into one RGBA texture in glTF order (R = AO, G = roughness,
 *   B = metalness). That halves texture memory versus three separate maps and is exactly what
 *   three.js expects — `aoMap` reads `.r`, `roughnessMap` reads `.g`, `metalnessMap` reads `.b`.
 */

import { blurWrap, sat, clamp } from './Canvas2D.js';

/* ------------------------------------------------------------------------- */
/*  normal                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Sobel the height field into a tangent-space normal map.
 * @param {Float32Array} h height 0..1
 * @param {number} size edge length
 * @param {number} strength slope scale = bumpMetres * size / tileMetres
 * @returns {Uint8Array} RGBA
 */
export function heightToNormal(h, size, strength = 6) {
  const out = new Uint8Array(size * size * 4);
  const k = clamp(strength, 0.25, 64);
  for (let y = 0; y < size; y++) {
    const y0 = ((y - 1 + size) % size) * size;
    const y1 = y * size;
    const y2 = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const x0 = (x - 1 + size) % size;
      const x2 = (x + 1) % size;

      const h00 = h[y0 + x0], h10 = h[y0 + x], h20 = h[y0 + x2];
      const h01 = h[y1 + x0], h21 = h[y1 + x2];
      const h02 = h[y2 + x0], h12 = h[y2 + x], h22 = h[y2 + x2];

      // Sobel / 8 == central difference with a little cross-axis smoothing.
      const du = ((h20 + 2 * h21 + h22) - (h00 + 2 * h01 + h02)) * 0.125;
      const dv = ((h02 + 2 * h12 + h22) - (h00 + 2 * h10 + h20)) * 0.125;

      let nx = -du * k, ny = -dv * k, nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv; ny *= inv; nz = inv;

      const o = (y1 + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (nz * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/*  ambient occlusion                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Multi-scale height-field AO. For each radius we ask "how far above me does the neighbourhood
 * average sit, relative to how far away it is?" — a cheap horizon estimate. Summing four radii
 * gives both the tight contact darkening in a mortar joint and the broad softening under a
 * projecting course, which is what the critic means by "AO in crevices / where forms meet".
 *
 * @returns {Float32Array} 0..1
 */
export function heightAO(h, size, o = {}) {
  const { bump = 0.02, tile = 2.0, strength = 1.0, occ = null, floor = 0.16 } = o;
  const n = size * size;
  const ao = new Float32Array(n);
  ao.fill(1);

  const px = tile / size;                       // metres per texel
  const radii = [2, 5, 13, 30];
  const weights = [0.34, 0.30, 0.22, 0.14];

  for (let ri = 0; ri < radii.length; ri++) {
    const r = Math.max(1, Math.round((radii[ri] * size) / 512));
    const b = blurWrap(h, size, r, 2);
    // Convert the height difference into a slope toward the horizon at this radius.
    const gain = (bump / (r * px)) * 1.55 * weights[ri] * strength;
    for (let i = 0; i < n; i++) {
      const d = b[i] - h[i];
      if (d > 0) ao[i] -= sat(d * gain * 4.0);
    }
  }

  for (let i = 0; i < n; i++) {
    let v = ao[i];
    if (occ) v *= occ[i];
    // Never crush to black: AGENTS §2.1.3 wants readable detail inside shadow.
    ao[i] = floor + (1 - floor) * sat(v);
  }
  return ao;
}

/* ------------------------------------------------------------------------- */
/*  roughness                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Authored roughness plus a micro-detail term: sharp height detail scatters light, so freshly
 * broken/chiselled texels get rougher and worn-flat ones get glossier for free.
 */
export function refineRoughness(rough, h, size, o = {}) {
  const { micro = 0.10, polishFlat = 0.05 } = o;
  const n = size * size;
  const sm = blurWrap(h, size, Math.max(1, Math.round(size / 256)), 1);
  const out = new Float32Array(n);
  let mx = 1e-6;
  const dev = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = Math.abs(h[i] - sm[i]); dev[i] = d; if (d > mx) mx = d; }
  for (let i = 0; i < n; i++) {
    const d = dev[i] / mx;
    out[i] = sat(rough[i] + d * micro - (1 - d) * polishFlat * 0.35);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/*  packing                                                                  */
/* ------------------------------------------------------------------------- */

export function packAlbedo(s) {
  const n = s.n;
  const out = new Uint8Array(n * 4);
  const { r, g, b, a } = s;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = sat(r[i]) * 255;
    out[o + 1] = sat(g[i]) * 255;
    out[o + 2] = sat(b[i]) * 255;
    out[o + 3] = a ? sat(a[i]) * 255 : 255;
  }
  return out;
}

export function packEmissive(s) {
  if (!s.em) return null;
  const n = s.n, [er, eg, eb] = s.em;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = sat(er[i]) * 255;
    out[o + 1] = sat(eg[i]) * 255;
    out[o + 2] = sat(eb[i]) * 255;
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Pack AO / roughness / metalness into one RGBA buffer, optionally box-downsampling by `div`.
 * These three channels are all low-frequency compared with albedo and normal, so half resolution
 * is free quality-wise and pays for itself in the 350 MB budget.
 */
export function packORM(ao, rough, metal, size, div = 2) {
  const d = Math.max(1, div | 0);
  const os = Math.max(4, Math.floor(size / d));
  const out = new Uint8Array(os * os * 4);
  const inv = 1 / (d * d);
  for (let y = 0; y < os; y++) {
    for (let x = 0; x < os; x++) {
      let sa = 0, sr = 0, sm = 0;
      for (let j = 0; j < d; j++) {
        const row = Math.min(size - 1, y * d + j) * size;
        for (let i = 0; i < d; i++) {
          const k = row + Math.min(size - 1, x * d + i);
          sa += ao[k]; sr += rough[k]; sm += metal[k];
        }
      }
      const o = (y * os + x) * 4;
      out[o] = sat(sa * inv) * 255;
      out[o + 1] = sat(sr * inv) * 255;
      out[o + 2] = sat(sm * inv) * 255;
      out[o + 3] = 255;
    }
  }
  return { data: out, size: os };
}

/** Height as an 8-bit R channel — handy for parallax or for a displacement pass later. */
export function packHeight(h, size, div = 2) {
  const d = Math.max(1, div | 0);
  const os = Math.max(4, Math.floor(size / d));
  const out = new Uint8Array(os * os);
  for (let y = 0; y < os; y++) {
    for (let x = 0; x < os; x++) {
      let s = 0;
      for (let j = 0; j < d; j++) {
        const row = Math.min(size - 1, y * d + j) * size;
        for (let i = 0; i < d; i++) s += h[row + Math.min(size - 1, x * d + i)];
      }
      out[y * os + x] = sat(s / (d * d)) * 255;
    }
  }
  return { data: out, size: os };
}

/* ------------------------------------------------------------------------- */
/*  one-call derivation                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Everything a material needs, from one Surface.
 * @param {import('./Canvas2D.js').Surface} s
 * @returns {{albedo:Uint8Array, normal:Uint8Array, orm:{data:Uint8Array,size:number},
 *            emissive:?Uint8Array, size:number}}
 */
export function derive(s, o = {}) {
  const {
    bump = 0.02, tile = 2.0, normalScale = 1.0,
    aoStrength = 1.0, aoFloor = 0.16,
    micro = 0.10, ormDiv = 2, smoothH = 0,
  } = o;
  const size = s.size;

  const h = smoothH > 0 ? blurWrap(s.h, size, smoothH, 1) : s.h;

  const strength = (bump * size) / Math.max(0.05, tile) * normalScale;
  const normal = heightToNormal(h, size, strength);
  const ao = heightAO(h, size, { bump, tile, strength: aoStrength, occ: s.occ, floor: aoFloor });
  const rough = refineRoughness(s.rough, h, size, { micro });
  const orm = packORM(ao, rough, s.metal, size, ormDiv);

  return {
    albedo: packAlbedo(s),
    normal,
    orm,
    emissive: packEmissive(s),
    size,
    normalStrength: strength,
  };
}
