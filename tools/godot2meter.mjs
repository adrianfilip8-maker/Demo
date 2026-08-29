#!/usr/bin/env node
/**
 * godot2meter.mjs — bake the reference project's health meter into a HUD element.
 *
 * Replaces `godot2mask.mjs`, which baked the bare insignia for §731.4's row of five pips. The
 * owner corrected that: *"No, that is wrong. The blue part behind the insignia is the health bar."*
 * It is ONE meter with ONE mask on it, not five badges.
 *
 * ── Which version, and why V1 ────────────────────────────────────────────────────────────────
 * Both sets are 1920 x 1195 at HEAD `a312a99`, licence NONE STATED, and both are two layers:
 * a PLATE (grey track with the mask baked on) and a FILL. Measured:
 *
 *   V1 plate  bbox x28-1884 y72-1122   grey #7f7f7f 63.1%, navy #262671 11.8%, pale #c5c5c5 7.2%
 *   V1 fill   bbox x33-1879 y77-989    #4aa0d0 99.5%   ← MID BLUE
 *   V2 plate  bbox x107-1889 y149-1023
 *   V2 fill   bbox x107-1889 y149-1023 #97fdfd 99.9%   ← PALE CYAN
 *
 * V2's two layers share an exact bbox, which is tidier, but composited at full it is a partial
 * cyan crescent with a bite out of the lower left and no outline around the track — it reads as a
 * half-empty meter, not a full one. V1 composites to exactly what the owner pointed at: a
 * complete oval, heavy black outline, mask sitting on it. So V1.
 *
 * V1's plate is taller than its HP fill because it also carries the POW track (its own
 * `PROGRESS_BAR_POW` layer is bronze #c18e52, bbox y848-1117 — a second stat this project does not
 * have). Left alone that track shows as a bare grey wedge under the mask. Since §731 is visual
 * only and pinned at FULL, the track is treated as filled: the silhouette below is the union of
 * the HP fill and the plate's empty-track grey, so the whole meter reads full. That is a
 * compositing decision about which state to draw, not a repaint of the artwork.
 *
 * ── Why the fill ships as a SILHOUETTE and not as colour ─────────────────────────────────────
 * The owner then said: *"Use the same color blue as the blue on the character's outfit"*. That is
 * `PAL.blue` in `src/player/SlyModel3.js`, whose own docblock states the rule the model was built
 * to — one blue BY NAME across cap, shirt, gloves and boots (G1). If the bake burned a hex into
 * the raster, the meter could drift from the outfit the moment that constant is retuned, which is
 * exactly the defect §712 closed for the coin badge. So the fill layer is baked as an ALPHA
 * SILHOUETTE — white where filled, transparent elsewhere, mask hole included — and the HUD paints
 * it through an SVG mask with the colour read from the imported constant at module load.
 *
 * Everything else follows `godot2mask.mjs`, which solved these already: alpha dilated before the
 * box filter so the transparent padding cannot bleed into the outline, aspect preserved, and the
 * bytes inlined as base64 rather than fetched — a runtime asset URL is a production-only fault
 * class (§666) and a fetch that never settles hangs `node --test` rather than failing it.
 *
 * §364.3: nothing under that project's audio directories is read, referenced or named here.
 *
 *   node tools/godot2meter.mjs [--src DIR] [--width N]
 */
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SRC_ROOT = arg('--src', '/home/user/noahchase/sly-cooper--a-thief-in-godot');
const DIR = 'Assets/Textures/Icons/';
const PLATE_REL = DIR + 'Health_Meter_V1_-_A_Thief_in_Paris.png';
const FILL_REL = DIR + 'Health_Meter_V1_PROGRESS_BAR_HP.png';
const POW_REL = DIR + 'Health_Meter_V1_PROGRESS_BAR_POW.png';
const SRC_HEAD = 'a312a99';
const OUT_W = +arg('--width', 320);

const STAGE = path.join(ROOT, 'staging/assets/sly-meter');
const OUT_MODULE = path.join(ROOT, 'src/ui/HealthMeter.js');

/** The plate's EMPTY-TRACK grey. Distinct from the mask's own #c5c5c5, so this is unambiguous. */
const TRACK = [0x7f, 0x7f, 0x7f];
/** The artwork's own outline: #242424, measured 5 px thick at the oval's top edge at 1920 wide. */
const OUTLINE = [0x24, 0x24, 0x24];
const OUTLINE_PX = 5;
const near = (d, i, t, tol) => Math.abs(d[i] - t[0]) <= tol && Math.abs(d[i + 1] - t[1]) <= tol
  && Math.abs(d[i + 2] - t[2]) <= tol;

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

function cropTo(img, box) {
  const out = new PNG({ width: box.w, height: box.h });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((box.y + y) * img.width + (box.x + x)) << 2;
      const d = (y * box.w + x) << 2;
      for (let c = 0; c < 4; c++) out.data[d + c] = img.data[s + c];
    }
  }
  return out;
}

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
  const platePath = path.join(SRC_ROOT, PLATE_REL);
  const fillPath = path.join(SRC_ROOT, FILL_REL);
  for (const p of [platePath, fillPath]) {
    if (!fs.existsSync(p)) { console.error(`[godot2meter] source not found: ${p}`); process.exit(1); }
  }
  const powPath = path.join(SRC_ROOT, POW_REL);
  const plateRaw = fs.readFileSync(platePath), fillRaw = fs.readFileSync(fillPath);
  const powRaw = fs.readFileSync(powPath);
  const plate = PNG.sync.read(plateRaw), fill = PNG.sync.read(fillRaw);
  const pow = PNG.sync.read(powRaw);
  console.log(`plate         ${PLATE_REL}  ${plate.width}x${plate.height}, ${plateRaw.length} bytes`);
  console.log(`fill          ${FILL_REL}  ${fill.width}x${fill.height}, ${fillRaw.length} bytes`);
  if (plate.width !== fill.width || plate.height !== fill.height) {
    console.error('[godot2meter] the two layers are not the same size — they cannot be composed');
    process.exit(1);
  }

  /* ALIGNMENT, measured not assumed: how much of the fill lands on plate that is actually the
     empty track. A misaligned pair would put fill over the mask or off the plate entirely. */
  let fillPx = 0, onTrack = 0, offPlate = 0;
  for (let i = 0; i < plate.data.length; i += 4) {
    if (fill.data[i + 3] < 128) continue;
    fillPx++;
    if (plate.data[i + 3] < 8) { offPlate++; continue; }
    if (near(plate.data, i, TRACK, 20)) onTrack++;
  }
  console.log(`alignment     ${(100 * onTrack / fillPx).toFixed(1)}% of fill lands on empty track, `
    + `${(100 * offPlate / fillPx).toFixed(2)}% falls outside the plate entirely`);

  /* ── §731.7: CUT THE POW SECTION OUT ──────────────────────────────────────────────────────
     The owner: "Remove the bottom section of the oval that is sectioned off by the thin lines."
     That section is the POW track, and it is not a horizontal band — it is a CRESCENT across the
     bottom of the oval, bounded above by the two thin dividing lines that run from the insignia's
     chin out to the oval's left and right edges, and below by the oval's own bottom arc. So the
     boundary is not guessed at a fraction: the region is exactly `PROGRESS_BAR_POW`'s own alpha,
     which is the layer the artwork uses to paint it.

     This is a MASK, not a rectangular crop: a horizontal cut would take the oval's bottom-left
     and bottom-right shoulders with it. The removed region's own edge then becomes the shape's
     new bottom edge, so it is RE-STROKED in the artwork's own outline (#242424 at 5 px, measured
     off the oval's top edge) — otherwise the meter reads as a broken oval with an open bottom. */
  const removed = new Uint8Array(plate.width * plate.height);
  let removedPx = 0;
  /* COLUMN-WISE, from the dividing line downward — not simply "wherever the POW layer is opaque".
     The POW fill stops just inside the oval's bottom outline, so removing only its own texels
     leaves that black arc floating below the cut as an orphan (measured: the bbox did not move).
     For every column the POW layer touches, everything from its topmost texel down goes; columns
     the dividing lines never reach are untouched, so the oval's left and right shoulders stay. */
  for (let x = 0; x < plate.width; x++) {
    let top = -1;
    for (let y = 0; y < plate.height; y++) {
      if (pow.data[(((y * plate.width) + x) << 2) + 3] >= 128) { top = y; break; }
    }
    if (top < 0) continue;
    for (let y = top; y < plate.height; y++) {
      const px = y * plate.width + x;
      if (plate.data[(px << 2) + 3] > 8) { removed[px] = 1; removedPx++; }
    }
  }
  console.log(`pow cut       ${removedPx} plate texels removed (the POW crescent and the arc below it)`);

  /* Re-close the outline: every kept texel within OUTLINE_PX of a removed one becomes outline. */
  const W = plate.width, H = plate.height;
  let restroked = 0;
  const kept = (px) => !removed[px] && plate.data[(px << 2) + 3] > 8;
  const toStroke = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = y * W + x;
      if (!kept(px)) continue;
      let near_ = false;
      for (let dy = -OUTLINE_PX; dy <= OUTLINE_PX && !near_; dy++) {
        for (let dx = -OUTLINE_PX; dx <= OUTLINE_PX; dx++) {
          if (dx * dx + dy * dy > OUTLINE_PX * OUTLINE_PX) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (removed[ny * W + nx]) { near_ = true; break; }
        }
      }
      if (near_) toStroke.push(px);
    }
  }
  for (const px of toStroke) {
    const i = px << 2;
    plate.data[i] = OUTLINE[0]; plate.data[i + 1] = OUTLINE[1]; plate.data[i + 2] = OUTLINE[2];
    plate.data[i + 3] = 255;
    restroked++;
  }
  console.log(`outline       ${restroked} texels re-stroked along the cut, closing the shape`);

  /* Now clear the removed region. */
  for (let px = 0; px < removed.length; px++) if (removed[px]) plate.data[(px << 2) + 3] = 0;

  /* The SILHOUETTE the HUD paints PAL.blue through is now the HP fill ALONE — §731.5's union with
     the empty track existed only to stop the POW region reading as a hole, and that region is
     gone. Anything of the HP fill that strayed into the cut is dropped with it. */
  const sil = new PNG({ width: plate.width, height: plate.height });
  let silPx = 0;
  for (let i = 0, px = 0; i < plate.data.length; i += 4, px++) {
    if (fill.data[i + 3] >= 128 && !removed[px] && plate.data[i + 3] > 8) {
      sil.data[i] = 255; sil.data[i + 1] = 255; sil.data[i + 2] = 255; sil.data[i + 3] = 255;
      silPx++;
    }
  }
  console.log(`silhouette    ${silPx} texels (HP fill only — the union with the empty track is gone)`);

  // Crop both to the plate's opaque bounding box so no transparent margin ships.
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      if (plate.data[((y * plate.width + x) << 2) + 3] < 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const outH = Math.round((OUT_W * box.h) / box.w);
  console.log(`crop          x${x0}-${x1} y${y0}-${y1}  ${box.w}x${box.h}  (${(box.w / box.h).toFixed(3)}:1)`);

  const pal = palette(plate);
  console.log('plate palette ' + pal.map((p) => `${p.hex} (${p.share}%)`).join('  '));

  const plateC = cropTo(plate, box), silC = cropTo(sil, box);
  const bled = bleedAlpha(plateC);
  bleedAlpha(silC, 4);
  console.log(`alpha bleed   ${bled} plate texels given real colour before resampling`);

  const plateS = resample(plateC, OUT_W, outH);
  const silS = resample(silC, OUT_W, outH);
  const plateEnc = PNG.sync.write(plateS, { deflateLevel: 9 });
  const silEnc = PNG.sync.write(silS, { deflateLevel: 9 });
  const plateB64 = plateEnc.toString('base64'), silB64 = silEnc.toString('base64');
  console.log(`resample      ${box.w}x${box.h} → ${OUT_W}x${outH}`);
  console.log(`              plate ${plateEnc.length} B (${plateB64.length} b64), fill mask ${silEnc.length} B (${silB64.length} b64)`);

  fs.mkdirSync(STAGE, { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'Health_Meter_V1.png'), plateRaw);
  fs.writeFileSync(path.join(STAGE, 'Health_Meter_V1_PROGRESS_BAR_HP.png'), fillRaw);
  fs.writeFileSync(path.join(STAGE, 'plate.baked.png'), plateEnc);
  fs.writeFileSync(path.join(STAGE, 'fillmask.baked.png'), silEnc);
  fs.writeFileSync(path.join(STAGE, 'PROVENANCE.md'), `# sly-meter — the health meter behind §731.5's readout

| | |
|---|---|
| source repo | the reference Godot project, HEAD \`${SRC_HEAD}\` |
| plate | \`${PLATE_REL}\` — ${plate.width} x ${plate.height}, ${plateRaw.length} bytes |
| fill | \`${FILL_REL}\` — ${fill.width} x ${fill.height}, ${fillRaw.length} bytes |
| licence | **NONE STATED** in that repository |
| shipped as | \`src/ui/HealthMeter.js\`, ${OUT_W} x ${outH}, plate ${plateEnc.length} B + fill mask ${silEnc.length} B, inlined base64 |
| baked by | \`tools/godot2meter.mjs\` |

Plate palette (share of opaque texels):

${pal.map((p) => `- \`${p.hex}\` — ${p.share}%`).join('\n')}

**V1 chosen over V2.** Both are plate+fill pairs. V2's fill is pale cyan \`#97fdfd\` and composites
at full to a partial crescent with no track outline; V1's is mid blue \`#4aa0d0\` and composites to a
complete outlined oval with the mask on it, which is what the owner pointed at. V1's plate also
carries the POW track (its own bronze \`PROGRESS_BAR_POW\` layer, a second stat this project does not
have); since §731 is visual-only and pinned at full, that track is included in the fill silhouette
so the meter reads full.

**The fill colour is NOT baked.** It ships as an alpha silhouette and the HUD paints it with
\`PAL.blue\` imported from \`src/player/SlyModel3.js\` — the owner asked for the character's own blue,
and that file's G1 rule makes it one named constant across cap, shirt, gloves and boots. Burning a
hex here would let the meter drift from the outfit.

Nothing under that repository's audio directories is read, referenced or named by this project.
`);

  const module = `/**
 * HealthMeter — the reference project's health meter, baked.
 *
 * **GENERATED by \`tools/godot2meter.mjs\`. Do not hand-edit.**
 *
 * The owner: *"The blue part behind the insignia is the health bar."* This is that meter — the V1
 * pair from that project's \`Assets/Textures/Icons/\` at HEAD \`${SRC_HEAD}\`, licence NONE STATED,
 * cropped to the plate's bounding box and resampled to ${OUT_W} x ${outH}. See
 * \`staging/assets/sly-meter/PROVENANCE.md\`.
 *
 * TWO layers, because the fill's colour is not ours to bake:
 *   · \`METER_PLATE_URI\` — the grey track, the black outline and the mask insignia, as drawn.
 *   · \`METER_FILL_URI\` — a white-on-transparent SILHOUETTE of the filled region, mask hole
 *     included. The HUD uses it as an SVG luminance mask and paints \`PAL.blue\` through it, so the
 *     meter follows the character's outfit colour instead of a copy of it (§712).
 *
 * Inlined as base64, never fetched: a runtime asset URL is a production-only fault class (§666)
 * and a fetch that never settles in Node hangs the suite rather than failing it.
 */

/** Intrinsic size of the baked layers, in texels. Both are identical by construction. */
export const METER_W = ${OUT_W};
export const METER_H = ${outH};

/**
 * The plate's own colours, SAMPLED from the source texels — not chosen, not retyped.
 * \`track\` is the empty-meter grey, which the shipped composite covers entirely.
 */
export const METER_PALETTE = {
${pal.map((p, i) => `  ${['track', 'navy', 'pale'][i] ?? 'ink' + i}: '${p.hex}',   // ${p.share}% of opaque texels`).join('\n')}
};

/** The plate: track, outline and insignia. */
export const METER_PLATE_URI =
  'data:image/png;base64,${plateB64}';

/** The filled region, as a luminance mask. White = filled. */
export const METER_FILL_URI =
  'data:image/png;base64,${silB64}';
`;
  fs.writeFileSync(OUT_MODULE, module);
  console.log(`wrote         ${path.relative(ROOT, OUT_MODULE)}  (${module.length} chars)`);
}

bake();
