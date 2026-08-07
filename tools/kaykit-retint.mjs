/**
 * kaykit-retint — derive the sandstone atlas from the pack's own, repeatably.
 *
 * The first retint was done ad hoc and left no script, so the only record of how the shipped PNG
 * was made was a paragraph in PROVENANCE.md. That is not reproducible, and it turned out to be
 * wrong in a way the paragraph could not reveal. This file replaces both.
 *
 * WHAT THE FIRST VERSION GOT WRONG, measured rather than argued. `wall_arched` and `stairs` sample
 * only u[0.037, 0.215] x v[0.006, 0.214] — the atlas's top-left corner, read straight out of their
 * TEXCOORD_0 buffers. In the pack that patch is near-neutral blue-grey: median (R-B) -12, median
 * HSV saturation 0.110. The old recipe scaled saturation by 0.75 with a 0.18 floor, so those texels
 * fell under the floor and came out AT it, 0.182 — while the already-vivid prop texels (barrels,
 * chests, gold) were scaled DOWN from 0.610 to 0.459. Backwards on both ends: it compressed
 * everything toward a muted middle, and the architecture — the part that has to carry an Egyptian
 * temple — landed greyest of all.
 *
 * In the capture that produced this finding, the KayKit wall and stairs rendered at median (R-B)
 * +2, i.e. neutral, while this level's OWN sandstone in the same frame and the same shade sat at
 * +45. That is not a lighting confound; it is a texture that is not the right colour.
 *
 * THE TARGET is this project's authored stone, not a guess:
 *
 *     sandstone_block    #c9915a   hue 0.083   sat 0.552      (Architecture.js RECIPES)
 *     sandstone_worn     #b8845a   hue 0.078   sat 0.511
 *     paving_courtyard   #cfa068   hue 0.077   sat 0.498
 *
 * So architecture texels need to land near sat 0.45-0.55 at hue ~0.08, and props may sit a little
 * above without going radioactive.
 *
 *   SATURATION  s' = 0.42 + 0.30 s  — monotonic, so the pack's own material ordering survives.
 *               Lifts stone 0.110 -> 0.453 (into the level's range) and lets props 0.610 -> 0.603
 *               keep their vividness instead of being scaled down.
 *
 *   HUE         set toward sandstone, with the blend weight rising with ORIGINAL saturation:
 *               w = 0.35 * clamp(s / 0.45, 0, 1), h' = circular lerp(SAND, h, w).
 *               Near-neutral texels have no meaningful hue — theirs is sensor noise around grey —
 *               so they are set outright. Blending them instead is what a naive lerp gets wrong:
 *               the pack's grey stone sits at hue 0.55, and a straight 75 % pull toward 0.083
 *               lands on 0.20, which is yellow-green. Vivid texels keep 35 % of their own hue, so
 *               gold still reads as gold and wood as wood inside the desert family.
 *
 *   VALUE       gained 1.06 and clipped, deliberately gentle. Value structure is what the cel
 *               shader bands on (`slyRamp` quantises N.L, and the texture's own light-to-dark
 *               structure rides on top), so flattening value would flatten the shading with it.
 *
 * Alpha is passed through untouched — the pack uses it for the torch flame cutout.
 *
 *     node tools/kaykit-retint.mjs            # write the atlas
 *     node tools/kaykit-retint.mjs --check    # report the numbers, write nothing
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const DIR = new URL('../public/assets/kaykit/', import.meta.url);
const SRC = new URL('dungeon_texture.png', DIR);
const DST = new URL('dungeon_texture_sandstone.png', DIR);

const SAND_HUE = 0.083;          // #c9915a, this project's sandstone_block
const SAT_BASE = 0.42, SAT_GAIN = 0.30;
const HUE_KEEP = 0.35, HUE_FULL_AT = 0.45;
const VAL_GAIN = 1.06;

/* the patches the finding was measured on, so --check reports the same quantities */
const PATCH = {
  architecture: [0.037, 0.006, 0.215, 0.214],   // what wall_arched and stairs actually sample
  props: [0.55, 0.30, 0.98, 0.70],
};

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const c = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return c.map((x) => Math.max(0, Math.min(255, Math.round(x * 255))));
}
/* shortest way round the wheel — a straight lerp on hue crosses the wrong arc at the seam */
function hueLerp(a, b, t) {
  let d = b - a;
  if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
  let h = a + d * t;
  return h - Math.floor(h);
}

const png = PNG.sync.read(readFileSync(SRC));
const { width: W, height: H, data } = png;
const out = Buffer.from(data);

for (let i = 0; i < data.length; i += 4) {
  const [h, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);
  const w = HUE_KEEP * Math.min(s / HUE_FULL_AT, 1);
  const [r, g, b] = hsv2rgb(
    hueLerp(SAND_HUE, h, w),
    Math.max(0, Math.min(1, SAT_BASE + SAT_GAIN * s)),
    Math.max(0, Math.min(1, v * VAL_GAIN)),
  );
  out[i] = r; out[i + 1] = g; out[i + 2] = b;      // alpha (i+3) passes through
}

/* ---- report, on the same patches the defect was found on ---- */
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
function report(buf, label) {
  const lines = [];
  for (const [nm, [u0, v0, u1, v1]] of Object.entries(PATCH)) {
    const x0 = Math.round(u0 * W), x1 = Math.round(u1 * W);
    const y0 = Math.round(v0 * H), y1 = Math.round(v1 * H);
    const warm = [], sat = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      warm.push(buf[i] - buf[i + 2]);
      sat.push(rgb2hsv(buf[i], buf[i + 1], buf[i + 2])[1]);
    }
    lines.push(`    ${nm.padEnd(13)} median(R-B) ${median(warm) >= 0 ? '+' : ''}${median(warm)}  median sat ${median(sat).toFixed(3)}`);
  }
  console.log(`  ${label}\n${lines.join('\n')}`);
}
console.log('KayKit atlas retint');
report(data, 'pack as shipped:');
report(out, 'sandstone (this recipe):');
console.log('  target — registered before the run: architecture sat 0.45-0.55 at hue ~0.08,');
console.log('           from this level\'s own stone (#c9915a 0.552, #b8845a 0.511, #cfa068 0.498)');

if (process.argv.includes('--check')) {
  console.log('\n--check: nothing written.');
} else {
  png.data = out;
  writeFileSync(DST, PNG.sync.write(png));
  console.log(`\nwrote ${DST.pathname}`);
}
