/**
 * subdom — every authored feature in `src/textures/**` that is SMALLER than its own recipe's
 * dominant detail scale, sized in millimetres and then in screen pixels at the framings that
 * actually carry the recipe.
 *
 * Why it exists. KNOWN_ISSUES §8's sub-pixel sweep and every sweep of that family key on
 * `detailMm`, which `texlab` derives from the mip half-life — i.e. **the scale that carries most
 * of the tile's variance**. §98.3 records what that misses: `hieroglyph_wall`'s arris lip at
 * 20–102 mm sits far below that recipe's 325 mm dominant detail, so a sweep that clears the
 * recipe says nothing about the lip, and a 1 px feature was sealed as a capture's primary and
 * passed. This enumerates the sub-dominant features instead of the dominant one.
 *
 * SCOPE — the transforms between what this computes and what the renderer draws, i.e. the suffix
 * NOT implemented (KNOWN_ISSUES §11):
 *   - It reads the CALL SITES in `Materials.js`, not the built Surface. A parameter that is
 *     overridden downstream, clamped inside the helper, or masked to a small part of the tile is
 *     reported at its authored value. `speckle`'s `min(freq, size/8)` clamp IS applied; nothing
 *     else is. Params whose value is a computed expression are printed as `expr` and skipped.
 *   - Feature mm is a WIDTH, converted from tile units by the recipe's own `worldTile`. Where a
 *     helper's units are not tile-relative the rule is named in FEATURES below and comes from the
 *     helper's source, not from its call site.
 *   - mm/px comes from `ringpx.mjs` and inherits its scope: ARCHITECTURE geometry only, no
 *     lighting, no mips, no occlusion by non-architecture. It says whether a feature is large
 *     enough to be RESOLVABLE, never whether it is visible — a 4 px feature at 0.2% contrast is
 *     invisible and this tool will call it resolvable.
 *   - No contrast term at all. A feature listed here as 6 px may still be doing nothing.
 *   - `limestone_polished` is stretched x4 by its pyramid consumer (§8's `angsize` caveat), so
 *     its features are 4x larger in world than the tile-derived mm below. Flagged, not corrected.
 *
 *   node progress/records/subdom.mjs --texlab <texlab.json> --ringpx <ringpx.json>
 *                                    [--minshare 1] [--shipped 1024] [--all]
 *
 * `--shipped` (default 1024, the size `Textures.get size` returns and the size the boot log
 * reports) recomputes the three size-QUANTISED features at the size the game actually builds —
 * `Textures.js:195`, tier 0 at `size`, tier >= 1 at `max(256, size >> 1)` — instead of at the
 * size the texlab run happened to use. This matters: at a 512 run `carve`'s `rb` floors at 2
 * texels and `speckle`'s `min(freq, size/8)` clamp bites, so a 512-derived table reports a
 * *wider* bevel and a *coarser* speckle than ship. That is §98.4's arithmetic error, in the
 * direction that flatters the result. Everything else here is tile-relative and size-free.
 * `detailMm` is taken from the run as-is: verified identical at 512 and 1024 on
 * `hieroglyph_wall` 325, `column_papyrus` 625, `hieroglyph_gilded` 1600, `paving_courtyard`
 * 2200, `granite_pink` 1100 — measured, not assumed.
 */
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const MINSHARE = parseFloat(opt('minshare', '1'));
const SHIPPED = parseInt(opt('shipped', '1024'), 10);
/** Textures.js:195 — the size this recipe is actually built at in the game. */
const shipSize = (R) => (R.tier >= 1 ? Math.max(256, SHIPPED >> 1) : SHIPPED);

const tex = JSON.parse(readFileSync(opt('texlab'), 'utf8'));
const ring = JSON.parse(readFileSync(opt('ringpx'), 'utf8'));
const rows = Array.isArray(tex) ? tex : tex.rows;
const byName = new Map(rows.map((r) => [r.name, r]));

/* ── the framings each recipe is actually seen at ─────────────────────────────────────────── */
const framings = new Map();   // recipe -> [{shot, share, mmpx50, mmpxMax50}]
for (const [shot, list] of Object.entries(ring.shots)) {
  for (const m of list) {
    const name = m.name.replace(/^arch:/, '');
    if (!framings.has(name)) framings.set(name, []);
    framings.get(name).push({ shot, share: m.sharePct, mmpx50: m.mmpx50, mmpxMax: m.mmpxMax50 });
  }
}

/* ── recipe blocks, by brace matching from `  name: {` ────────────────────────────────────── */
const src = readFileSync('src/textures/Materials.js', 'utf8');
const blocks = new Map();
{
  const re = /^ {2}([a-z0-9_]+): \{$/gm;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex - 1, depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) break; }
    }
    blocks.set(m[1], src.slice(re.lastIndex, i));
  }
}

/** Balanced-paren text of the first argument object of `fn(` inside `body`, all call sites. */
function callArgs(body, fn) {
  const out = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(body))) {
    let i = m.index + m[0].length, depth = 1;
    for (; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') { depth--; if (!depth) break; }
    }
    out.push(body.slice(m.index + m[0].length, i));
  }
  return out;
}

/** Literal number for `key:` in an argument blob, or the expression text, or undefined. */
function param(blob, key) {
  const m = blob.match(new RegExp(`\\b${key}\\s*:\\s*([^,}\\n]+)`));
  if (!m) return undefined;
  const t = m[1].trim();
  return /^-?[0-9.]+$/.test(t) ? parseFloat(t) : { expr: t };
}

/* ── the feature table ────────────────────────────────────────────────────────────────────
 * `mm(v, R)` returns the feature's WIDTH in world millimetres. `R` is the texlab row, so
 * `R.worldTile` is metres of world per tile repeat and `R.size` the built map size.
 * Every rule below is taken from the helper's own source, cited.                            */
const FEATURES = [
  { fn: 'ashlar', key: 'jointW', dflt: 0.008, label: 'mortar groove (full width)',
    // Canvas2D.js:597 — "half-width of the mortar groove, in tile units"
    mm: (v, R) => 2 * v * R.worldTile * 1000 },
  { fn: 'ashlar', key: 'chamfer', dflt: 0.015, label: 'joint chamfer ramp',
    // Canvas2D.js:598 — "chamfer ramp width outside the groove"
    mm: (v, R) => v * R.worldTile * 1000 },
  { fn: 'ashlar', key: 'grainFreq', dflt: 12, label: 'stone grain cell',
    mm: (v, R) => (R.worldTile / v) * 1000 },
  { fn: 'ashlar', key: 'cloudFreq', dflt: 14, label: 'intra-block cloud cell',
    mm: (v, R) => (R.worldTile / v) * 1000 },
  { fn: 'ashlar', key: 'bedFreq', dflt: 2, label: 'quarry-bed cell',
    mm: (v, R) => (R.worldTile / v) * 1000 },
  { fn: 'speckle', key: 'freq', dflt: 150, label: 'speckle worley cell',
    // Canvas2D.js:953 clamps to size/8 cells
    mm: (v, R) => { const S = shipSize(R);
      return (R.worldTile / Math.max(2, Math.min(Math.round(v), Math.round(S / 8)))) * 1000; } },
  { fn: 'carve', key: 'bevelPx', dflt: 3.0, label: 'carve bevel (rb texels)',
    // Materials.js: rb = max(2, round(bevelPx*size/1024)); one bevel is rb texels wide
    mm: (v, R) => { const S = shipSize(R);
      return Math.max(2, Math.round((v * S) / 1024)) * (R.worldTile / S) * 1000; } },
  { fn: 'carve', key: 'arris', dflt: 0, label: 'arris lip (above-field support)',
    /* PROFILED, not derived: PREREG-hgarris2 measured the gated ring's above-field support at
     * ~102 mm on `hieroglyph_wall` (rb = 3 at 1024, 10.16 mm/texel), i.e. ~3.3 x rb. Scaled by
     * rb for the other consumers and marked `~` because only the wall was profiled. */
    mm: (v, R, blob) => {
      if (!v) return null;
      const S = shipSize(R);
      const bp = typeof param(blob, 'bevelPx') === 'number' ? param(blob, 'bevelPx') : 3.0;
      const rb = Math.max(2, Math.round((bp * S) / 1024));
      return 3.3 * rb * (R.worldTile / S) * 1000;
    }, approx: true },
  { fn: 'paintRemnants', key: 'freq', dflt: 5, label: 'paint-wear cell',
    mm: (v, R) => (R.worldTile / v) * 1000 },
  { fn: 'glyphWall', key: 'glyphM', dflt: 0.72, label: 'glyph quadrat', mm: (v) => v * 1000 },
  { fn: 'glyphWall', key: 'kheker', dflt: 0, label: 'kheker finial height',
    // Materials.js:4411 — khH = size * kheker, i.e. a fraction of the tile
    mm: (v, R) => (v ? v * R.worldTile * 1000 : null) },
];

/* ── collect ──────────────────────────────────────────────────────────────────────────────── */
const found = [];
for (const [recipe, body] of blocks) {
  const R = byName.get(recipe);
  if (!R) continue;
  const fr = (framings.get(recipe) || []).filter((f) => f.share >= MINSHARE)
    .sort((a, b) => b.share - a.share);
  if (!fr.length && !has('all')) continue;
  for (const F of FEATURES) {
    for (const blob of callArgs(body, F.fn)) {
      let v = param(blob, F.key);
      if (v && v.expr) { found.push({ recipe, R, fr, F, expr: v.expr }); continue; }
      if (v === undefined) v = F.dflt;
      const mm = F.mm(v, R, blob);
      if (mm == null || mm <= 0) continue;
      found.push({ recipe, R, fr, F, v, mm });
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────────────────────────── */
const fpx = (mm, mmpx) => mm / mmpx;
console.log(`# subdom — authored feature scale vs dominant scale vs framing, minshare ${MINSHARE}%`);
console.log(`# texlab build size ${rows[0].size}px; ringpx ${ring.W}x${ring.H}\n`);

const order = [...new Set(found.map((f) => f.recipe))]
  .sort((a, b) => Math.max(0, ...(framings.get(b) || []).map((x) => x.share))
                - Math.max(0, ...(framings.get(a) || []).map((x) => x.share)));

let nSub = 0, nAbsent = 0, nBelowDom = 0;
for (const recipe of order) {
  const items = found.filter((f) => f.recipe === recipe);
  const R = items[0].R, fr = items[0].fr;
  if (!fr.length) { console.log(`## ${recipe} — no framing over ${MINSHARE}% (unscoreable)\n`); continue; }
  const best = fr[0];
  // the framing that resolves this recipe WORST among those carrying >= minshare
  const worst = fr.reduce((a, b) => (b.mmpx50 > a.mmpx50 ? b : a));
  console.log(`## ${recipe}  detailMm ${R.detailMm}  worldTile ${R.worldTile}m  size ${R.size}`);
  console.log(`   framings >= ${MINSHARE}%: ` + fr.map((f) => `${f.shot} ${f.share.toFixed(1)}% @${f.mmpx50}mm/px`).join(', '));
  console.log('   feature                        auth      mm   f/dom   px@' + best.shot.padEnd(10) + ' px@' + worst.shot.padEnd(10) + ' flag');
  for (const it of items) {
    if (it.expr) {
      console.log(`   ${it.F.label.padEnd(30)} ${String(it.expr).slice(0, 22).padEnd(22)} (expression — not evaluated)`);
      continue;
    }
    const pb = fpx(it.mm, best.mmpx50), pw = fpx(it.mm, worst.mmpx50);
    const dom = it.mm / R.detailMm;
    const flags = [];
    if (dom < 0.25) { flags.push('BELOW-DOM'); nBelowDom++; }
    if (pw < 1.0) { flags.push('ABSENT@worst'); nAbsent++; }
    else if (pw < 2.0) { flags.push('SUB-2PX@worst'); nSub++; }
    if (pb < 2.0) flags.push('SUB-2PX@best');
    console.log(`   ${it.F.label.padEnd(30)} ${String(it.v).padEnd(7)} ${(it.F.approx ? '~' : '') + it.mm.toFixed(0).padStart(5)}  ${dom.toFixed(2).padStart(5)}   ${pb.toFixed(2).padStart(12)} ${pw.toFixed(2).padStart(12)}  ${flags.join(' ')}`);
  }
  console.log('');
}
console.log(`# totals: ${nBelowDom} features below a quarter of their recipe's dominant scale;`);
console.log(`#         ${nSub} sub-2px and ${nAbsent} sub-1px at the coarsest framing carrying >= ${MINSHARE}% of them.`);
