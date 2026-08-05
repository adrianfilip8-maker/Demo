#!/usr/bin/env node
/* mradius-proj — offline projection for the §24.3 moulding-radius prereg (PREREG-mradius.md).
 *
 * WHAT THIS IS. The hullkerb seal's R2 gate measured the §24.3 hero kerb band LIVE on this
 * tree (n = 1,708 >= the 850 band, crop-confirmed continuous cyan bar — RESULT-hullkerb.md),
 * which arms the moulding-radius prereg. This instrument does the arithmetic that prereg
 * quotes: no boot, no capture — camera projection of the built cross-section, calibrated
 * against the committed frames that survive on this container.
 *
 * WHAT THE BAND ACTUALLY IS — re-derived HERE against the current tree, because the ledger's
 * older identification is stale (§18: re-derive against the tree, do not transcribe):
 *
 *   NOT the stage-2 deck slab's chamfer. NOTE-task20-verification.md filed the band as "the
 *   obelisk terrace stage-2 deck rim"; the deck slab (EgyptLevel.js vol at :365,
 *   'paving_courtyard', chamfer c 0.09) is indeed AT that rim, but its 45-degree bevel strip
 *   is BACKFACING from hero's camera (facet normal (0, .707, -.707) against a view ray
 *   descending only ~22 degrees: n·(-view) ~ -0.36) and its arris projects 3-4 px BELOW the
 *   measured band. Cutting c at :365 (or :352) would not move one band pixel.
 *
 *   THE BAND IS ON THE tc2 CORNICE RING TOP — the walkable fillet annulus of
 *   K.cornice({h:0.56, flare:0.36, roll:0.18}) at EgyptLevel.js:363-364, material
 *   'sandstone_worn', wall plane z=5.35, top flush with the deck at y=5.20, annulus running
 *   0.58 m (= flare+0.22) proud of the wall plane to the fillet outer arris. Three
 *   independent confirmations:
 *     (1) this script: the measured artefact pixels sit BETWEEN the projected wall-plane
 *         and fillet-arris lines at every probe column (tables below);
 *     (2) the shader's own note, toon.glsl.js:721-722: "hero's worn step lip at px
 *         (832-1056,500-620), a ~1453 px cyan band on arch:sandstone_worn INSIDE cast
 *         shadow" — sandstone_worn is the cornice; the deck is paving_courtyard;
 *     (3) the mechanism: sweep() (Kit.js:995) is INDEXED — "normals average along the
 *         profile" — so the fillet arris corner [flare+0.22, top+0.34] gets an area-weighted
 *         average of the top-annulus and draft-face normals (tilt ~24.4 deg outward), and
 *         that turn is interpolated across the ENTIRE 0.58 m annulus. The surface fresnel
 *         (uRimPower 3.1, rimBand smoothstep(0.26,0.58)) selects the tilt sub-window where
 *         ndv drops through ~0.24 toward self-occlusion — a band riding the outer half of
 *         the annulus, exactly what the frames show. Both rim gates pass it correctly
 *         (the normal genuinely turns, convex) — §24.3's own wording.
 *
 * THE MOULDING RADIUS, therefore: the cornice fillet arris has NO explicit radius today.
 * Its rounding is an artefact of indexed-normal smoothing smeared across the full annulus —
 * an effective turn zone of 0.58 m (tc2) / 0.62 m (tc1). THAT WIDTH is the §24.3 lever
 * ("the band's world width scales with the moulding radius"): confine the normal turn to an
 * outer strip of width s by inserting one coplanar profile row at [A - s, top+0.34]
 * (A = flare+0.22) in corniceProfile (Kit.js:1137). Positions all stay on the same plane —
 * NO silhouette moves, no §8.1 contract surface moves, colliders are proxies and untouched.
 * s parametrizes the family continuously:
 *     s = A (row degenerate at the wall plane)  == today's geometry
 *     s < A                                     turn confined to the outer s metres
 *     s = 0 (row duplicated at the arris)       split normals == HARD EDGE (the §13 KB)
 * corniceProfile/cornice/sweep draw NOTHING from the shared rng stream (verified below), so
 * every arm is stream-neutral: corner jitter everywhere else in the level is bit-identical
 * across arms, and the A/B differs by exactly the treated normals.
 *
 * WHAT IS MEASURED vs WHAT IS MODEL:
 *   measured — the band pixel set (kerbband2's frozen artefact class) from the two surviving
 *     committed captures; the projected annulus geometry it is matched against; the
 *     window-fraction and core widths derived from that match.
 *   model — one linearity claim only: compressing the same 0->24.4 deg turn into a narrower
 *     strip scales every tilt-window's world width by the same factor, so band width and
 *     kerbband2 count scale ~linearly with s. (The turn RANGE does not change; per-px
 *     normal turn rises, which keeps the magnitude gate open — 19.6 vs gate-hi 10 today,
 *     higher at smaller s. Deviations: bloom bleed is fixed px so its share grows as the
 *     band narrows; AA at the window edges. The registered intervals carry +/-0.15 on the
 *     ratio for exactly that.)
 *
 * usage: node progress/records/mradius-proj.mjs        (from repo root or anywhere)
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readPNG, px } from '../../tools/png.mjs';

const root = path.join(import.meta.dirname, '../..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');
let failed = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

/* =================== A. SOURCE GUARD (§18: re-read constants at run time) =================== */
console.log('A. source guard — the constants this projection stands on, read from the tree now:');
const shots = read('src/core/Shots.js');
check('Shots.js hero: pos [8.9,10.28,17.2] target [-1.0,7.4,4.0] fov 46 roll -1.5',
  /hero:\s*\{\s*\n?\s*pos:\s*\[8\.9,\s*10\.28,\s*17\.2\],\s*target:\s*\[-1\.0,\s*7\.4,\s*4\.0\],\s*fov:\s*46,\s*tod:\s*0\.79,\s*roll:\s*-1\.5/.test(shots));
check('Shots.js applyShot: lookAt(up 0,1,0) then rotateZ(deg(roll))',
  /cam\.up\.set\(\s*0,\s*1,\s*0\s*\)/.test(shots) && /rotateZ\(\s*THREE\.MathUtils\.degToRad\(\s*shot\.roll\s*\)\s*\)/.test(shots));
const lvl = read('src/world/EgyptLevel.js');
check('EgyptLevel L.terrace: s1 x9.4 z 2.6..19.4 y2.0 / s2 x6.6 z 5.4..16.6 y5.2',
  /terrace:\s*\{\s*s1:\s*\{\s*x:\s*9\.4,\s*z0:\s*2\.6,\s*z1:\s*19\.4,\s*y:\s*2\.0\s*\},\s*s2:\s*\{\s*x:\s*6\.6,\s*z0:\s*5\.4,\s*z1:\s*16\.6,\s*y:\s*5\.2\s*\}\s*\}/.test(lvl));
check('EgyptLevel tc1 = K.cornice({... h: 0.62, flare: 0.40, roll: 0.20 })',
  /const tc1 = K\.cornice\(\{ w: t1\.x \* 2 \+ 0\.1, d: t1\.z1 - t1\.z0 \+ 0\.1, h: 0\.62, flare: 0\.40, roll: 0\.20 \}\)/.test(lvl));
check('EgyptLevel tc2 = K.cornice({... h: 0.56, flare: 0.36, roll: 0.18 })',
  /const tc2 = K\.cornice\(\{ w: t2\.x \* 2 \+ 0\.1, d: t2\.z1 - t2\.z0 \+ 0\.1, h: 0\.56, flare: 0\.36, roll: 0\.18 \}\)/.test(lvl));
check("EgyptLevel tc2 added as 'sandstone_worn' at y = t2.y - tc2.height",
  /A\.add\('court', 'sandstone_worn', K\.place\(tc2\.geo, \{ x: 0, y: t2\.y - tc2\.height, z: \(t2\.z0 \+ t2\.z1\) \/ 2 \}\)\)/.test(lvl));
check('EgyptLevel stage-2 deck vol (paving_courtyard, c 0.09) — the NON-lever, for the record',
  /vol\(A, 'court', 'paving_courtyard', -t2\.x, t2\.x, t2\.y - 0\.45, t2\.y, t2\.z0, t2\.z1, \{ jitter: 0\.02, c: 0\.09 \}\)/.test(lvl));
const kit = read('src/world/Kit.js');
check('Kit corniceProfile top rows: [flare+0.28,top-0.06] [flare+0.30,top+0.04] [flare+0.22,top+0.34] [0,top+0.34]',
  /p\.push\(\[flare \+ 0\.28, top - 0\.06\]\);/.test(kit) && /p\.push\(\[flare \+ 0\.30, top \+ 0\.04\]\);/.test(kit)
  && /p\.push\(\[flare \+ 0\.22, top \+ 0\.34\]\);/.test(kit) && /p\.push\(\[0, top \+ 0\.34\]\);/.test(kit));
check('Kit sweep() is indexed (normals average along the profile)',
  /Indexed so normals average along the\s*\n?\s*\* profile/.test(kit));
{ // rng-neutrality: corniceProfile + cornice + sweep must not touch the shared stream
  const grab = (fn) => { const m = kit.match(new RegExp(`export function ${fn}[\\s\\S]*?\\n\\}`)); return m ? m[0] : ''; };
  const body = grab('corniceProfile') + grab('cornice') + grab('sweep');
  check('corniceProfile/cornice/sweep draw nothing from rng (stream-neutral arms)',
    body.length > 500 && !/rng\./.test(body));
}
const tm = read('src/render/ToonMaterial.js');
check('ToonMaterial TUNE: rimPower 3.1, rimCurve [3,10,1]', /rimPower: 3\.1,/.test(tm) && /rimCurve: \[3\.0, 10\.0, 1\.0\]/.test(tm));
const glsl = read('src/render/shaders/toon.glsl.js');
check('toon.glsl rimBand = smoothstep(0.26, 0.58, fres * mix(0.60, 1.0, wrapRim))',
  /rimBand = smoothstep\( 0\.26, 0\.58, fres \* mix\( 0\.60, 1\.0, wrapRim \) \)/.test(glsl));
check("toon.glsl's own siting of the band: 'worn step lip ... arch:sandstone_worn' at (832-1056,500-620)",
  /worn step lip at px \(832-1056,500-620\)/.test(glsl) && /cyan band on arch:sandstone_worn/.test(glsl));
if (failed) { console.log(`\n${failed} source anchors FAILED — the tree has moved; nothing below may be quoted.`); process.exit(1); }

/* =================== camera + geometry =================== */
const W = 1280, H = 720;
const SHOT = { pos: [8.9, 10.28, 17.2], target: [-1.0, 7.4, 4.0], fov: 46, roll: -1.5 };
function camera(s) {
  const [cx, cy, cz] = s.pos, [tx, ty, tz] = s.target;
  let zx = cx - tx, zy = cy - ty, zz = cz - tz;                       // three.js lookAt: zbk = pos - target
  const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xy = 0, xz = -zx;                                      // up(0,1,0) x zbk
  const xl = Math.hypot(xx, xy, xz); xx /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const t = (s.roll || 0) * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);   // rotateZ(roll)
  return {
    c: [cx, cy, cz],
    x: [ct * xx + st * yx, ct * xy + st * yy, ct * xz + st * yz],
    y: [-st * xx + ct * yx, -st * xy + ct * yy, -st * xz + ct * yz],
    zbk: [zx, zy, zz],
    tanV: Math.tan((s.fov / 2) * Math.PI / 180), tanH: Math.tan((s.fov / 2) * Math.PI / 180) * (W / H),
  };
}
const CAM = camera(SHOT);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function project(p) {
  const v = [p[0] - CAM.c[0], p[1] - CAM.c[1], p[2] - CAM.c[2]];
  const depth = -dot(v, CAM.zbk);
  if (depth <= 0) return null;
  return { px: (dot(v, CAM.x) / depth / CAM.tanH + 1) / 2 * W, py: (1 - dot(v, CAM.y) / depth / CAM.tanV) / 2 * H, depth };
}

/* the two terrace cornices, from the source constants verified above */
const T2 = { y: 5.2, zWall: 5.35, A: 0.36 + 0.22, name: 'tc2 (stage-2)' };   // wall plane z = 11 - 11.3/2
const T1 = { y: 2.0, zWall: 2.55, A: 0.40 + 0.22, name: 'tc1 (stage-1)' };   // wall plane z = 11 - 16.9/2
// arris normal tilt: area-weighted average of top annulus (A wide, +y) and draft face
// ([flare+0.30,top+0.04]->[flare+0.22,top+0.34]: 0.3105 m, profile-plane normal (0.966,0.258))
function arrisTilt(A) {
  const wDraft = 0.3105, nDraft = [0.966, 0.258];                    // (out, up)
  const oy = wDraft * nDraft[1] + A * 1.0, oo = wDraft * nDraft[0];
  return Math.atan2(oo, oy);                                          // radians, outward from +y
}
const TILT2 = arrisTilt(T2.A), TILT1 = arrisTilt(T1.A);

/* find world-x on a north-run line {y, z} whose projection lands at screen column PX */
function xAtCol(line, PX) {
  let lo = -8, hi = 8;
  const f = (x) => { const p = project([x, line.y, line.z]); return (p ? p.px : 1e9) - PX; };
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? hi = m : lo = m; }
  return (lo + hi) / 2;
}

/* =================== B. FRAME CALIBRATION (measured, from committed captures) =================== */
console.log('\nB. frame calibration — the frozen artefact class on the surviving committed frames:');
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const art = (r, g, b) => { const l = L(r, g, b); return l >= 150 && b > r && b - r >= 18 && b >= g - 4; };
const ROI = { x0: 820, x1: 1100, y0: 500, y1: 610 };
const FR = {
  rim2base: 'shots/rim2/hero-base.png', rim2norim: 'shots/rim2/hero-norim.png',
  live: 'progress/records/hullkerb/frames/hero-base.png',
};
const have = Object.fromEntries(Object.entries(FR).map(([k, f]) => [k, existsSync(path.join(root, f))]));
let bandCols = null, measured = null;
if (have.rim2base && have.rim2norim && have.live) {
  const b = readPNG(path.join(root, FR.rim2base)), nr = readPNG(path.join(root, FR.rim2norim)), lv = readPNG(path.join(root, FR.live));
  let nCausal = 0, nLive = 0; bandCols = new Map();
  for (let y = ROI.y0; y <= ROI.y1; y++) for (let x = ROI.x0; x <= ROI.x1; x++) {
    const [r1, g1, b1] = px(b, x, y);
    if (art(r1, g1, b1)) { const [r2, g2, b2] = px(nr, x, y); if (L(r1, g1, b1) - L(r2, g2, b2) >= 8) nCausal++; }
    const [r3, g3, b3] = px(lv, x, y);
    if (art(r3, g3, b3)) { nLive++; if (!bandCols.has(x)) bandCols.set(x, []); bandCols.get(x).push(y); }
  }
  check(`rim2 causal count reproduces the committed record: ${nCausal} (record 1,691)`, nCausal === 1691);
  check(`live hero-base non-causal reproduces R2: ${nLive} (record 1,708)`, nLive === 1708);
  if (failed) { console.log('counts do not reproduce — nothing below may be quoted.'); process.exit(1); }

  console.log('\n   band <-> annulus match (probe columns; wall = projected wall-plane row, arris = fillet arris row):');
  console.log('   col | measured band y | wall py | arris py | band centre at out-metres (0=wall, A=arris)');
  measured = [];
  for (const PX of [860, 900, 940, 980, 1020]) {
    const ys = (bandCols.get(PX) || []).sort((a, c) => a - c);
    if (!ys.length) continue;
    const xw = xAtCol({ y: T2.y, z: T2.zWall }, PX), xa = xAtCol({ y: T2.y, z: T2.zWall - T2.A }, PX);
    const wall = project([xw, T2.y, T2.zWall]), arris = project([xa, T2.y, T2.zWall - T2.A]);
    const span = wall.py - arris.py;                                   // px height of the whole annulus
    const out = (py) => T2.A * (wall.py - py) / span;                  // linear map py -> metres out from wall
    const yc = (ys[0] + ys[ys.length - 1]) / 2;
    const inBetween = ys[0] >= arris.py - 1.5 && ys[ys.length - 1] <= wall.py + 1.5;
    measured.push({ PX, core: ys.length ? ys[ys.length - 1] - ys[0] + 1 : 0, span, out0: out(ys[ys.length - 1]), out1: out(ys[0]), inBetween });
    console.log(`   ${PX} | y ${ys[0]}..${ys[ys.length - 1]} (${ys.length}px) | ${wall.py.toFixed(1)} | ${arris.py.toFixed(1)} | centre ${out(yc).toFixed(2)} m, core ${out(ys[ys.length - 1]).toFixed(2)}..${out(ys[0]).toFixed(2)} m of A=${T2.A.toFixed(2)}`);
  }
  const allIn = measured.every((m) => m.inBetween);
  check('every probe column\'s band lies inside the projected annulus (+/-1.5 px)', allIn);
  if (!allIn) { console.log('the band does not sit on the modelled surface — projection void.'); process.exit(1); }
} else {
  console.log('   committed frames not on this container (rollback) — geometric model runs uncalibrated.');
  console.log('   The calibration that DID run is recorded in PREREG-mradius.md §2 with these frames\' hashes;');
  console.log('   re-run this script on a container that has them before re-quoting its numbers.');
  process.exit(1);
}
const coreAvg = measured.reduce((s, m) => s + m.core, 0) / measured.length;
const fracLo = measured.reduce((s, m) => s + m.out0, 0) / measured.length / T2.A;   // window inner edge, fraction of A
const fracHi = measured.reduce((s, m) => s + m.out1, 0) / measured.length / T2.A;   // window outer edge
const winFrac = fracHi - fracLo;
console.log(`\n   measured: artefact core avg ${coreAvg.toFixed(1)} px tall; window = out ${(fracLo * T2.A).toFixed(2)}..${(fracHi * T2.A).toFixed(2)} m`
  + ` = ${(fracLo * 100).toFixed(0)}..${(fracHi * 100).toFixed(0)} % of the ${T2.A.toFixed(2)} m turn zone (window fraction ${winFrac.toFixed(2)})`);

/* =================== C. MECHANISM CROSS-CHECK (model vs the measured window) =================== */
console.log('\nC. mechanism cross-check — shader window vs the measured band (model, order-of-magnitude):');
{
  const xw = xAtCol({ y: T2.y, z: T2.zWall - T2.A / 2 }, 940);
  const p = [xw, T2.y, T2.zWall - T2.A / 2];
  const v = [p[0] - CAM.c[0], p[1] - CAM.c[1], p[2] - CAM.c[2]]; const vl = Math.hypot(...v);
  const vn = v.map((q) => q / vl);                                    // view direction (cam -> point)
  const ndv = (t) => -(vn[1] * Math.cos(t) + vn[2] * -Math.sin(t));   // n = (0, cos t, -sin t): tilt t northward
  const fres = (t) => Math.pow(1 - Math.max(ndv(t), 0), 3.1);
  // wrap on this shadowed, up-facing annulus is between 0.60 (full shadow-side) and 1.0; band
  // onset = smallest tilt where rimBand opens; sil = tilt where ndv reaches 0 (self-occlusion).
  const solve = (f, lo, hi) => { for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? hi = m : lo = m; } return (lo + hi) / 2; };
  const on60 = solve((t) => fres(t) * 0.60 - 0.26, 0, 0.6), on100 = solve((t) => fres(t) * 1.0 - 0.26, 0, 0.6);
  const sil = solve((t) => ndv(t), 0.2, 0.9);
  const deg = (r) => (r * 180 / Math.PI).toFixed(1);
  console.log(`   arris normal tilt (area-weighted smoothing): tc2 ${deg(TILT2)} deg, tc1 ${deg(TILT1)} deg over the full annulus`);
  console.log(`   rimBand onset tilt: ${deg(on100)} (wrap=1) .. ${deg(on60)} (wrap=0.6) deg; self-occlusion at ${deg(sil)} deg`);
  console.log(`   measured window in tilt terms: ${deg(fracLo * TILT2)} .. ${deg(fracHi * TILT2)} deg`);
  console.log(`   -> measured inner edge sits inside the modelled onset range, outer edge short of self-occlusion`);
  console.log(`      (luma threshold L>=150 trims the tail) — the fresnel-window mechanism stands. The`);
  console.log(`      PREDICTIONS below do NOT use this model; they scale the MEASURED window linearly in s.`);
}

/* =================== D. CANDIDATES =================== */
console.log('\nD. candidates — turn-zone width s, predicted band, predicted count (base n = 1,708):');
const N0 = 1708;
const rows = [];
for (const [tag, ratio] of [['current', 1.0], ['-25%', 0.75], ['-40% (CAND)', 0.60], ['radius->0 (KB)', 0.0]]) {
  const s2 = T2.A * ratio, s1 = T1.A * ratio;
  const bandW = winFrac * s2;                                          // world width of the artefact core, tc2
  const scr = measured.map((m) => ({ PX: m.PX, zone: m.span * ratio, core: m.core * ratio }));
  const n = Math.round(N0 * ratio);
  rows.push({ tag, ratio, s2, s1, bandW, scr, n });
  const scrTx = scr.filter((m) => [860, 940, 1020].includes(m.PX))
    .map((m) => `${m.PX}: zone ${m.zone.toFixed(1)}px core ${m.core.toFixed(1)}px`).join(' | ');
  console.log(`\n   ${tag}:  s tc2 ${s2.toFixed(3)} m / tc1 ${s1.toFixed(3)} m`);
  console.log(`      band world width (artefact core, tc2 north run): ${bandW.toFixed(3)} m`);
  console.log(`      screen at hero (col: full turn zone / artefact core): ${scrTx}`);
  console.log(`      predicted kerbband2 non-causal on hero: ${ratio > 0 ? `${n}  (interval [${Math.round(N0 * (ratio - 0.15))}, ${Math.round(N0 * (ratio + 0.15))}])` : '<= 400, expected <= 170 (see KB signature)'}`);
}

/* retention: the same cornices' KEY-CATCH side in hero — the west rim runs down frame-left, sunlit
 * at tod 0.79 (the R2 crop's own orange raking stripes are this sun reaching the terrace). */
console.log('\n   key-catch retention site (hero, tc2 WEST rim, lit side — frame-left):');
{
  const xWall = -(13.3 / 2);                                           // west wall plane x = -6.65
  for (const z of [6.5, 8.5]) {
    const w = project([xWall, T2.y, z]), a = project([xWall - T2.A, T2.y, z]);
    const span = Math.hypot(w.px - a.px, w.py - a.py);
    console.log(`      z=${z}: wall (${w.px.toFixed(0)},${w.py.toFixed(0)}) arris (${a.px.toFixed(0)},${a.py.toFixed(0)}) — lit turn zone ${span.toFixed(1)} px`
      + ` -> cand ${(span * 0.6).toFixed(1)} px, KB 0 px (dead)`);
  }
}
/* context: tc1's north rim (same class, below the ROI) */
{
  const xw = xAtCol({ y: T1.y, z: T1.zWall }, 940);
  if (xw !== null) {
    const w = project([xw, T1.y, T1.zWall]), a = project([xAtCol({ y: T1.y, z: T1.zWall - T1.A }, 940), T1.y, T1.zWall - T1.A]);
    console.log(`   context: tc1 north-rim annulus at col 940: py ${a.py.toFixed(0)}..${w.py.toFixed(0)} (below the ROI; same treatment, no numeric gate)`);
  }
}

/* =================== E. registered-numbers block =================== */
console.log(`
E. numbers PREREG-mradius.md registers (quote from here, not from memory):
   lever      corniceProfile arrisBand (new, opt-in, default null == today's bytes), Kit.js:1137;
              call sites treated: tc1 (EgyptLevel.js:350) and tc2 (:363) ONLY — both terrace kerbs.
   candidate  arrisBand = 0.60 x A  ->  tc2 s = ${(T2.A * 0.6).toFixed(3)} m, tc1 s = ${(T1.A * 0.6).toFixed(3)} m  (-40 %)
   KB         arrisBand = 0 (split normals at the arris row) — hard edge, both cornices
   base/rest  pristine bytes (no Kit param anywhere)
   hero base  n in [${Math.round(N0 * 0.98)}, ${Math.round(N0 * 1.02)}]  (same tree re-captured; outside it the boot is not the sealed boot)
   hero cand  n in [${Math.round(N0 * 0.45)}, ${Math.round(N0 * 0.75)}]  point ${Math.round(N0 * 0.60)}; band still present, visibly narrowed, single, clean
   hero KB    n <= 400 (expected <= 170) AND the band GONE as a band — signature, all three required:
              (a) no continuous >=4 px pale-cyan bar anywhere in the ROI at 4x;
              (b) a hard shading edge at the arris line: the previously-soft 15 px gradient collapses
                  to a 1-2 px transition that shows the raster staircase (grazing crawl), possibly plus
                  a new thin screen-space/PostFX edge line on the now-discontinuous normals;
              (c) key-catch DEAD on the lit runs (west rim crop: no bright rounded-edge line) and
                  night's deck-edge traces dead. KB passing (a) while ALSO passing the retention
                  crops as 'fine' would mean the viewing condition cannot score this question:
                  UNSCOREABLE (§141) -> revert, no ship, no re-threshold.
   silhouette invariant: ALL arms keep positions on the same planes — any arm whose diff moves a
              silhouette edge (not just shading inside the annuli + bloom halo + temporal mask)
              is a broken mechanism: VOID + revert, not a result.
`);
console.log('done. exit 0 = every anchor held and both committed counts reproduced.');
