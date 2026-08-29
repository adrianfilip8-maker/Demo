#!/usr/bin/env node
/**
 * godot2mask.mjs — bake the reference project's Cooper mask insignia into a HUD glyph module.
 *
 * ── What this imports, and its provenance ────────────────────────────────────────────────────
 * Source: the reference Godot project, HEAD `a312a99`, file
 * `Assets/Textures/Icons/Life_Icon_V2_-_Sly_Cooper_A_Thief_In_Paris.png`.
 * 1898 x 1195, 8-bit RGBA, 110,266 bytes, 78.1 % opaque. **Licence: NONE STATED** in that
 * repository — recorded rather than assumed, per the owner's standing instruction that this is
 * not an obstacle here. Nothing under that project's audio directories is read, referenced or
 * named anywhere in this repository (§364.3), and this tool touches exactly one image file.
 *
 * The owner supplied a photograph of this mark and said the health bar should look like it. It is
 * the franchise insignia: a navy band across the top with two pointed ear peaks and a dip between
 * them, two broad pale-grey eye patches, a pale-grey lower muzzle and a dark diamond nose, all
 * under a near-black outline, on a fully transparent ground.
 *
 * ── Why base64 and not a URL, which is the load-bearing decision ─────────────────────────────
 * The same reasoning `godot2coin.mjs` records for the coin badge, and it is not stylistic:
 *   · §666 — a runtime asset URL is a PRODUCTION-ONLY fault class. A path that resolves at the
 *     domain root silently fails under a `/Demo/` prefix, and no dev-server test can see it.
 *   · a fetch that never settles in Node HANGS `node --test` rather than failing it, so the HUD's
 *     own suite could not check the glyph at all.
 * The bytes are inlined, so the glyph is the same object in the browser, in the production
 * artifact and in the test runner. `hud.test.mjs` already asserts this file family makes no
 * runtime fetch and names no remote URL; a data URI keeps that true.
 *
 * ── The two steps that matter for a 21.9 %-transparent source ────────────────────────────────
 *   1. ALPHA DILATION before the resample. A box filter over straight RGB pulls the (black,
 *      alpha 0) padding into every edge texel, which on this artwork would put a dark halo around
 *      the ears and the muzzle — the exact silhouette the mark is recognised by. Opaque RGB is
 *      bled outward first, so the filter only ever averages real colour.
 *   2. ASPECT IS PRESERVED. The source is 1.588:1 and the mark is markedly wider than tall; the
 *      coin bake squares its source because a coin face is a disc, and copying that here would
 *      squash the ears. The output is 128 x 81.
 *
 *   node tools/godot2mask.mjs [--src DIR]
 */
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SRC_ROOT = arg('--src', '/home/user/noahchase/sly-cooper--a-thief-in-godot');
const SRC_REL = 'Assets/Textures/Icons/Life_Icon_V2_-_Sly_Cooper_A_Thief_In_Paris.png';
const SRC_HEAD = 'a312a99';

/** Shipped width in texels. 128 gives 2x supersampling at the largest --u the HUD can reach. */
const OUT_W = 128;

const STAGE = path.join(ROOT, 'staging/assets/sly-mask');
const OUT_MODULE = path.join(ROOT, 'src/ui/MaskBadge.js');

/** Dilate opaque RGB outward into the transparent region so a resample cannot pull in black. */
function bleedAlpha(img, passes = 10) {
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

/** Box-filter resample to w x h. Averages straight (non-premultiplied) RGB and alpha. */
function resample(img, outW, outH) {
  const out = new PNG({ width: outW, height: outH });
  const { width: w, height: h, data } = img;
  for (let y = 0; y < outH; y++) {
    const sy0 = Math.floor((y * h) / outH), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / outH));
    for (let x = 0; x < outW; x++) {
      const sx0 = Math.floor((x * w) / outW), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / outW));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = ((sy * w + sx) << 2);
          r += data[o]; g += data[o + 1]; b += data[o + 2]; a += data[o + 3]; n++;
        }
      }
      const o = ((y * outW + x) << 2);
      out.data[o] = (r / n) | 0; out.data[o + 1] = (g / n) | 0;
      out.data[o + 2] = (b / n) | 0; out.data[o + 3] = (a / n) | 0;
    }
  }
  return out;
}

/** The N most common opaque colours, so the palette is SAMPLED rather than retyped. */
function palette(img, n = 3) {
  const hist = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue;
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  const total = [...hist.values()].reduce((a, b) => a + b, 0);
  return [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, c]) => ({ hex: '#' + k.toString(16).padStart(6, '0'), share: +(100 * c / total).toFixed(1) }));
}

function bake() {
  const srcPath = path.join(SRC_ROOT, SRC_REL);
  if (!fs.existsSync(srcPath)) {
    console.error(`[godot2mask] source not found: ${srcPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(srcPath);
  const img = PNG.sync.read(raw);
  const outH = Math.round((OUT_W * img.height) / img.width);
  console.log(`source        ${SRC_REL}`);
  console.log(`              ${img.width}x${img.height}, ${raw.length} bytes, repo HEAD ${SRC_HEAD}, licence NONE STATED`);

  let opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) opaque++;
  const opaquePct = (100 * opaque / (img.width * img.height)).toFixed(1);
  console.log(`coverage      ${opaquePct}% opaque, ${(100 - opaquePct).toFixed(1)}% transparent`);

  const pal = palette(img);
  console.log('palette       ' + pal.map((p) => `${p.hex} (${p.share}%)`).join('  '));

  const filled = bleedAlpha(img);
  console.log(`alpha bleed   ${filled} transparent texels given real colour before resampling`);

  const small = resample(img, OUT_W, outH);
  const enc = PNG.sync.write(small, { deflateLevel: 9 });
  const b64 = enc.toString('base64');
  console.log(`resample      ${img.width}x${img.height} → ${OUT_W}x${outH}  (${enc.length} byte PNG, ${b64.length} chars base64)`);

  fs.mkdirSync(STAGE, { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'Life_Icon_V2.png'), raw);   // the SOURCE bytes, verbatim
  fs.writeFileSync(path.join(STAGE, 'Life_Icon_V2.baked.png'), enc);
  fs.writeFileSync(path.join(STAGE, 'PROVENANCE.md'), `# sly-mask — the Cooper insignia used by §731.3's health readout

| | |
|---|---|
| source repo | the reference Godot project, HEAD \`${SRC_HEAD}\` |
| source path | \`${SRC_REL}\` |
| source size | ${img.width} x ${img.height}, 8-bit RGBA, ${raw.length} bytes |
| coverage | ${opaquePct}% opaque, ${(100 - opaquePct).toFixed(1)}% transparent |
| licence | **NONE STATED** in that repository |
| shipped as | \`src/ui/MaskBadge.js\`, ${OUT_W} x ${outH}, ${enc.length} byte PNG inlined as base64 |
| baked by | \`tools/godot2mask.mjs\` |

Sampled palette (share of opaque texels):

${pal.map((p) => `- \`${p.hex}\` — ${p.share}%`).join('\n')}

The owner photographed this mark and asked for the health readout to look like it. It is used as
a HUD pip and nothing else; it is not mapped onto any mesh and drives no behaviour. The same
directory in that repository also holds \`Health_Meter_V1/V2\` and their \`PROGRESS_BAR_HP\`/\`POW\`
fill layers, which compose into a radial FILL meter — a functional readout, evaluated and not
shipped, because the owner asked for visual only. See §731.4.

Nothing under that repository's audio directories is read, referenced or named by this project.
`);

  const module = `/**
 * MaskBadge — the reference project's Cooper mask insignia, baked.
 *
 * **GENERATED by \`tools/godot2mask.mjs\`. Do not hand-edit.**
 *
 * The owner supplied a photograph of this mark and said the health readout should look like it.
 * Source: that project's \`Assets/Textures/Icons/Life_Icon_V2_…\` at HEAD \`${SRC_HEAD}\`,
 * ${img.width} x ${img.height} and ${opaquePct}% opaque, resampled to ${OUT_W} x ${outH} with its alpha
 * dilated first so the box filter could not pull the transparent padding into the ears and the
 * muzzle. Licence NONE STATED; see \`staging/assets/sly-mask/PROVENANCE.md\`.
 *
 * Inlined as base64 rather than fetched, for the two reasons \`CoinBadge.js\` records: a runtime
 * asset URL is a production-only fault class (§666), and a fetch that never settles in Node hangs
 * the suite instead of failing it. This way the glyph is the same object in the browser, in the
 * production artifact and in \`node --test\`.
 */

/** Intrinsic size of the baked image, in texels. */
export const MASK_BADGE_W = ${OUT_W};
export const MASK_BADGE_H = ${outH};

/**
 * The mark's own three colours, SAMPLED from the source texels — not chosen, and not retyped.
 * \`hud.test.mjs\` sweeps these over every possible background to bound the badge's legibility, so
 * if the artwork is ever re-baked with different colours the bound is recomputed from the truth
 * rather than from a comment.
 */
export const MASK_BADGE_PALETTE = {
${pal.map((p, i) => `  ${['navy', 'grey', 'outline'][i] ?? 'ink' + i}: '${p.hex}',   // ${p.share}% of opaque texels`).join('\n')}
};

/** The baked PNG, as a data URI ready for an SVG <image href>. */
export const MASK_BADGE_URI =
  'data:image/png;base64,${b64}';
`;
  fs.writeFileSync(OUT_MODULE, module);
  console.log(`wrote         ${path.relative(ROOT, OUT_MODULE)}  (${module.length} chars)`);
  console.log(`              ${path.relative(ROOT, STAGE)}/{Life_Icon_V2.png, Life_Icon_V2.baked.png, PROVENANCE.md}`);
}

bake();
