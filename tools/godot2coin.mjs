#!/usr/bin/env node
/**
 * godot2coin.mjs — the reference project's coin badge → a baked, canvas-free module.
 *
 * ── READ THIS FIRST: the repository has NO coin texture ──────────────────────────────────────
 * The instruction this tool serves was *"substitute out the texture of the coins with the coin
 * texture from the godot repo"*, and the premise is false as stated. Established by reading the
 * scene graph rather than by matching filenames, which is this project's standing rule for that
 * repository (see `public/assets/sly-godot/PROVENANCE.md`):
 *
 *   Scenes/Design Tools/pickup_coin.tscn
 *     └─ CylinderMesh          top_radius 0.25  bottom_radius 0.25  height 0.1
 *     └─ StandardMaterial3D    albedo_color (0.926704, 0.754991, 0.193364, 1)
 *                              emission     (0.925490, 0.756863, 0.192157, 1)
 *                              roughness 0.5 · rim_enabled · clearcoat_enabled
 *                              **no albedo_texture, no texture of any kind**
 *
 * `Assets/Models/Pickups/` holds `BOTTLE.glb` and `diamond.glb` and no coin model. Their 3D coin
 * is a procedural, untextured cylinder and that is the whole of it.
 *
 * What DOES exist is **one** coin image in the entire repository:
 * `Assets/Textures/Icons/Badge_Coin_V2_-_Sly_Cooper_A_Thief_In_Paris.png`, 339x346 RGBA — a gold
 * coin with an embossed five-pointed star. It is filed as a **UI icon**, not as a 3D material,
 * and this tool records that plainly rather than dressing it up: it is the only coin image the
 * repository has and it is a coin FACE, which is why it is the reading that ships. Anyone who
 * meant something else can redirect from here cheaply.
 *
 * ── What it produces ─────────────────────────────────────────────────────────────────────────
 * `src/world/CoinBadge.js` — the badge as a base64 PNG, decoded at runtime by
 * `src/textures/PngCodec.js` into a `DataTexture`. **No URL and no canvas**, deliberately:
 *
 *   · no URL     — §666's whole class of production-only fault. `Props` and `Pickups` both build
 *                  from this and a fetch that never settles in Node hangs the suite rather than
 *                  failing it (`CarmelitaGuard.js:330`).
 *   · no canvas  — `PngCodec`'s own header measures a 2D canvas losing up to ±184 on red for any
 *                  map carrying alpha, and this one is 21% transparent.
 *
 * `PngCodec.parsePng` asserts its input is 8-bit, colour type 6, non-interlaced and **square**.
 * The source is 339x346, so the bake resamples to a square power of two; the 2% x-stretch that
 * costs is measured and printed rather than waved at.
 *
 * ── The alpha bleed, which is not optional ───────────────────────────────────────────────────
 * The transparent 21% is stored as (0,0,0,0) — black. Downsampling or bilinear-filtering across
 * the disc edge pulls that black into the rim and gives the coin a dark fringe. So opaque colour
 * is dilated outward into the transparent region BEFORE the resample. The alpha channel is
 * carried through untouched; it is the RGB under it that is repaired.
 *
 *   node tools/godot2coin.mjs --import --src <checkout root>   # checkout → staging png + module
 *   node tools/godot2coin.mjs                                  # measure the committed module
 *   SIZE=128 node tools/godot2coin.mjs --import --src <root>   # a different bake resolution
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIZE = +(process.env.SIZE || 256);
const SRC_REL = 'Assets/Textures/Icons/Badge_Coin_V2_-_Sly_Cooper_A_Thief_In_Paris.png';
const STAGE = path.join(ROOT, 'staging/assets/sly-coin');
const STAGE_PNG = path.join(STAGE, 'Badge_Coin_V2.png');
const OUT_MODULE = path.join(ROOT, 'src/world/CoinBadge.js');

/* ------------------------------------------------------------------ bake */

/** Dilate opaque RGB outward into the transparent region so a resample cannot pull in black. */
function bleedAlpha(img, passes = 8) {
  const { width: w, height: h, data } = img;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[(i << 2) + 3] > 0 ? 1 : 0;
  let filled = 0;
  for (let p = 0; p < passes; p++) {
    const next = solid.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!solid[j]) continue;
            const o = j << 2;
            r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
          }
        }
        if (!n) continue;
        const o = i << 2;
        data[o] = (r / n) | 0; data[o + 1] = (g / n) | 0; data[o + 2] = (b / n) | 0;
        next[i] = 1; filled++;
      }
    }
    solid.set(next);
  }
  return filled;
}

/** Box-filter resample to `size` x `size`. Averages in straight (non-premultiplied) RGB. */
function resample(img, size) {
  const out = new PNG({ width: size, height: size });
  const { width: w, height: h, data } = img;
  for (let y = 0; y < size; y++) {
    const sy0 = Math.floor((y * h) / size), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / size));
    for (let x = 0; x < size; x++) {
      const sx0 = Math.floor((x * w) / size), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / size));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = ((sy * w + sx) << 2);
          r += data[o]; g += data[o + 1]; b += data[o + 2]; a += data[o + 3]; n++;
        }
      }
      const o = ((y * size + x) << 2);
      out.data[o] = (r / n) | 0; out.data[o + 1] = (g / n) | 0;
      out.data[o + 2] = (b / n) | 0; out.data[o + 3] = (a / n) | 0;
    }
  }
  return out;
}

function bake(srcRoot) {
  const srcPath = path.join(srcRoot, SRC_REL);
  if (!fs.existsSync(srcPath)) throw new Error(`godot2coin: no badge at ${srcPath}`);
  const raw = fs.readFileSync(srcPath);
  const img = PNG.sync.read(raw);
  console.log(`source        ${SRC_REL}`);
  console.log(`              ${img.width}x${img.height}  depth ${img.depth}  colourType ${img.colorType}  ${raw.length} bytes`);

  let transparent = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) transparent++;
  console.log(`              ${transparent} of ${img.width * img.height} texels fully transparent ` +
    `(${(100 * transparent / (img.width * img.height)).toFixed(1)}%) — the corners outside the disc`);

  const filled = bleedAlpha(img);
  console.log(`alpha bleed   ${filled} transparent texels given the nearest opaque RGB`);

  const sq = resample(img, SIZE);
  const stretch = (img.height / img.width - 1) * 100;
  console.log(`resample      ${img.width}x${img.height} → ${SIZE}x${SIZE}  ` +
    `(x stretched ${stretch.toFixed(2)}% to square; the source disc is 338x344 at alpha>128)`);

  /* The rim texel is SEARCHED for, not assumed. Scanning in from the left edge along the centre
     row, the first fully opaque texel is the disc's outer gold — the outermost texel that is
     unambiguously coin rather than antialiasing. Assuming texel 0 put the rim UV on alpha 50,
     which is edge fringe and not a colour anyone chose. */
  let rimX = -1;
  for (let x = 0; x < SIZE; x++) {
    if (sq.data[(((SIZE >> 1) * SIZE + x) << 2) + 3] === 255) { rimX = x; break; }
  }
  if (rimX < 0) throw new Error('godot2coin: no fully opaque texel on the badge centre row');
  const rimO = (((SIZE >> 1) * SIZE + rimX) << 2);
  console.log(`rim texel     x=${rimX} of ${SIZE} on the centre row: ` +
    `rgba(${sq.data[rimO]}, ${sq.data[rimO + 1]}, ${sq.data[rimO + 2]}, ${sq.data[rimO + 3]}) — first fully opaque`);

  /* Three colours SAMPLED out of the badge, so `src/ui/Icons.js` can draw the HUD coin from the
     same source the world coin is textured from instead of retyping hexes. That is the exact
     arrangement `BOTTLE_PALETTE` already has with the clue bottle, and it exists for the same
     reason: a hand-typed hex is how a toast and the object it stands for drift apart.
       star  — the disc centre, which for a point-up five-pointed star is inside the star
       field — the darkest opaque texel on a ring at 0.42r, i.e. a valley between two arms
       rim   — the outermost fully opaque texel on the centre row, the struck edge */
  const at = (x, y) => { const o = (((y | 0) * SIZE + (x | 0)) << 2); return [sq.data[o], sq.data[o + 1], sq.data[o + 2], sq.data[o + 3]]; };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const star = at(SIZE / 2, SIZE / 2);
  let field = null;
  for (let a = 0; a < 360; a += 3) {
    const t = a * Math.PI / 180;
    const c = at(SIZE / 2 + Math.cos(t) * SIZE * 0.42, SIZE / 2 + Math.sin(t) * SIZE * 0.42);
    if (c[3] < 250) continue;
    if (!field || lum(c) < lum(field)) field = c;
  }
  if (!field) throw new Error('godot2coin: found no opaque texel on the 0.42r sampling ring');

  const enc = PNG.sync.write(sq, { deflateLevel: 9 });
  fs.mkdirSync(STAGE, { recursive: true });
  fs.writeFileSync(STAGE_PNG, raw);                      // the SOURCE bytes, verbatim
  console.log(`staged        ${path.relative(ROOT, STAGE_PNG)}  ${raw.length} bytes (source, verbatim)`);

  const b64 = enc.toString('base64');
  const module = `/**
 * CoinBadge — the reference project's coin badge, baked.
 *
 * **GENERATED by \`tools/godot2coin.mjs\`. Do not hand-edit.**
 *
 * ── The premise this file corrects ───────────────────────────────────────────────────────────
 * There is **no coin texture in the reference repository**. Its 3D coin
 * (\`Scenes/Design Tools/pickup_coin.tscn\`) is a procedural, untextured \`CylinderMesh\` under a
 * \`StandardMaterial3D\` that carries an albedo colour, an emission colour, a rim and a clearcoat
 * and **no \`albedo_texture\`**. \`Assets/Models/Pickups/\` holds a bottle and a diamond and no coin.
 *
 * This is the one coin IMAGE in that repository —
 * \`Assets/Textures/Icons/Badge_Coin_V2_-_Sly_Cooper_A_Thief_In_Paris.png\`, filed as a **UI icon**
 * — resampled to a square power of two so \`PngCodec.parsePng\` will take it. It is a coin face, so
 * it maps onto a coin face; that it is an icon rather than a material is recorded here and in
 * \`staging/assets/sly-coin/PROVENANCE.md\` rather than glossed, because it is the one fact a
 * reader needs to redirect this cheaply if they meant something else.
 *
 * ── Why base64 rather than a file ────────────────────────────────────────────────────────────
 * No URL (§666: a runtime asset URL is a production-only fault class, and a fetch that never
 * settles in Node hangs the suite rather than failing it) and no canvas (\`PngCodec\`'s header
 * measures a 2D canvas losing up to ±184 on red for any map carrying alpha; this one is 21%
 * transparent). \`decodeCoinBadge()\` runs identically in the browser and in \`node --test\`.
 */
import { decodePng, inflateNative, canDecode } from '../textures/PngCodec.js';

/** Edge length of the baked square, in texels. */
export const COIN_BADGE_SIZE = ${SIZE};

/**
 * The badge's own rim gold, sampled from the baked texel at the disc's left edge.
 * \`PropKit.coin\`'s rim UVs are parked on this texel so the coin's EDGE is plain metal rather
 * than a smear of the face — a coin's edge is not struck, and sampling the die around it is the
 * one way a face map on a cylinder looks obviously wrong.
 */
export const COIN_BADGE_RIM_UV = [${((rimX + 0.5) / SIZE).toFixed(6)}, 0.5];

/**
 * The badge's own three colours, SAMPLED from the baked texels — not chosen, and not retyped.
 *
 * \`src/ui/Icons.js\` imports these to draw the HUD coin, exactly as it imports \`BOTTLE_PALETTE\`
 * from \`BottleMesh.js\` to draw the clue-bottle toast. The world coin and the coin on the HUD are
 * required to be one object; a hand-typed hex here is precisely how they stop being one.
 *
 *   star  — the disc centre (inside the star, which is point-up)
 *   field — darkest opaque texel on a ring at 0.42r: a valley between two of the star's arms
 *   rim   — outermost fully opaque texel on the centre row: the struck edge
 *
 * **Colour couples; SIZE does not.** The world coin's radius is \`PropKit.COIN_RADIUS\` and it has
 * been resized on request; the glyph is drawn to be legible at 18 px and must not follow it.
 */
export const COIN_BADGE_PALETTE = {
  star:  '${hex(star)}',
  field: '${hex(field)}',
  rim:   '${hex(at(rimX, SIZE / 2))}',
};

const BADGE_B64 = '${b64}';

let _cache = null;

/** @returns {Promise<{data:Uint8Array, size:number}|null>} RGBA, or null where nothing can inflate. */
export async function decodeCoinBadge() {
  if (_cache) return _cache;
  if (!canDecode()) return null;
  const bin = atob(BADGE_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  _cache = await decodePng(bytes, inflateNative);
  return _cache;
}
`;
  fs.writeFileSync(OUT_MODULE, module);
  console.log(`baked         ${path.relative(ROOT, OUT_MODULE)}  ${module.length} bytes ` +
    `(${enc.length} byte PNG → ${b64.length} chars base64)`);
  return { enc, b64, img, sq };
}

/* --------------------------------------------------------------- measure */

async function measure() {
  if (!fs.existsSync(OUT_MODULE)) throw new Error(`godot2coin: ${OUT_MODULE} has not been baked yet`);
  const { decodeCoinBadge, COIN_BADGE_SIZE, COIN_BADGE_RIM_UV } = await import(OUT_MODULE);
  const src = fs.readFileSync(OUT_MODULE, 'utf8');
  console.log(`module        ${path.relative(ROOT, OUT_MODULE)}  ${src.length} bytes`);
  console.log(`declared size ${COIN_BADGE_SIZE}   rim UV [${COIN_BADGE_RIM_UV.join(', ')}]`);
  const img = await decodeCoinBadge();
  if (!img) { console.log('decode        UNAVAILABLE on this host (no DecompressionStream)'); return; }
  console.log(`decoded       ${img.size}x${img.size}  ${img.data.length} bytes RGBA  ` +
    `(${img.data.length === img.size * img.size * 4 ? 'exact' : 'MISMATCH'})`);
  const px = (x, y) => { const i = ((y * img.size + x) << 2); return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
  const h = img.size >> 1;
  console.log(`centre        rgba(${px(h, h).join(', ')})`);
  const rx = Math.min(img.size - 1, Math.floor(COIN_BADGE_RIM_UV[0] * img.size));
  const ry = Math.min(img.size - 1, Math.floor(COIN_BADGE_RIM_UV[1] * img.size));
  console.log(`rim texel     rgba(${px(rx, ry).join(', ')})   ← COIN_BADGE_RIM_UV [${COIN_BADGE_RIM_UV.join(', ')}] → texel (${rx}, ${ry})`);
  console.log(`corner        rgba(${px(0, 0).join(', ')})   ← outside the disc, never sampled by a cap UV`);
  if (fs.existsSync(STAGE_PNG)) {
    console.log(`staged source ${path.relative(ROOT, STAGE_PNG)}  ${fs.statSync(STAGE_PNG).size} bytes`);
  }
}

/* ------------------------------------------------------------------- CLI */

const args = process.argv.slice(2);
if (args.includes('--import')) {
  const i = args.indexOf('--src');
  const srcRoot = i >= 0 ? args[i + 1] : null;
  if (!srcRoot) throw new Error('godot2coin: --import needs --src <checkout root>');
  bake(srcRoot);
} else {
  await measure();
}
