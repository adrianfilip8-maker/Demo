/**
 * fx21 scoring — Arm A of PREREG-sandhigh.md. Evaluates; decides nothing.
 *
 * Registered measurements, per shot, `base` vs `no-sandHigh`:
 *   whole-frame changed px · mean |ΔL| · component-size distribution · scattered fraction
 *   (components < 200 px).  `temple` is the same-boot interior anchor.
 *
 * Registered ARTEFACT test, applied to EVERY shot including the exteriors:
 *   ARTEFACT = connected component with ΔL >= 8.0 over a backdrop of luma < 60 AND R/B < 0.5,
 *   backdrop read off the `no-sandHigh` frame (the surface the sprite was covering).
 *
 * THE FALSIFIER, quoted from the seal and checked before any baseline is quoted:
 *   "If an exterior shot also carries a ΔL>=8 component over a dark blue backdrop, the artefact
 *   is not temple-specific and the PREREG's ARTEFACT/FIELD split needs rewriting before any fix."
 *
 * Control: each shot's `back` must be bit-identical to its `base`; if not, THAT SHOT'S ROWS ARE
 * VOID and are reported as void rather than quoted.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const D = '/home/user/Demo/shots/fx21';
const MINC = 40;            // ignore components below this; noise floor
const SCATTER = 200;        // "scattered" = component smaller than this
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

if (!existsSync(`${D}/fx21.json`)) { console.log('fx21.json missing — run unfinished'); process.exit(1); }
const J = JSON.parse(readFileSync(`${D}/fx21.json`, 'utf8'));
const load = (n) => existsSync(`${D}/${n}.png`) ? readPNG(`${D}/${n}.png`) : null;

const analyse = (shot) => {
  const A = load(`${shot}.base`), B = load(`${shot}.no-sandHigh`), K = load(`${shot}.back`);
  if (!A || !B) return { shot, missing: true };
  const W = A.w, H = A.h, N = W * H;

  // control first
  let backDiff = null;
  if (K) {
    backDiff = 0;
    for (let i = 0; i < N; i++) {
      const o = i * A.ch;
      if (Math.abs(A.data[o] - K.data[o]) + Math.abs(A.data[o + 1] - K.data[o + 1]) + Math.abs(A.data[o + 2] - K.data[o + 2]) >= 4) backDiff++;
    }
  }

  const mask = new Uint8Array(N), lift = new Float32Array(N);
  let changed = 0, absSum = 0;
  for (let i = 0; i < N; i++) {
    const o = i * A.ch;
    const d = Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o + 1] - B.data[o + 1]) + Math.abs(A.data[o + 2] - B.data[o + 2]);
    if (d < 4) continue;
    mask[i] = 1; changed++;
    const g = L(A.data, o) - L(B.data, o);
    lift[i] = g; absSum += Math.abs(g);
  }

  const seen = new Uint8Array(N), comps = [];
  for (let i = 0; i < N; i++) {
    if (!mask[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    let c = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, s = 0;
    const px = [];
    while (st.length) {
      const j = st.pop(), jx = j % W, jy = (j / W) | 0;
      c++; s += lift[j]; if (px.length < 4000) px.push(j);
      if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    if (c < MINC) continue;
    // backdrop = what this component was covering, read off no-sandHigh
    let br = 0, bg = 0, bb = 0;
    for (const j of px) { const o = j * B.ch; br += B.data[o]; bg += B.data[o + 1]; bb += B.data[o + 2]; }
    const n = px.length;
    const bR = br / n, bG = bg / n, bB = bb / n;
    comps.push({ c, box: [x1 - x0 + 1, y1 - y0 + 1], at: [x0, y0], dL: s / c,
      bd: [Math.round(bR), Math.round(bG), Math.round(bB)],
      bdLuma: 0.2126 * bR + 0.7152 * bG + 0.0722 * bB, bdRB: bB > 0 ? bR / bB : 99 });
  }
  comps.sort((a, b) => b.c - a.c);
  const scatterPx = comps.filter((k) => k.c < SCATTER).reduce((s, k) => s + k.c, 0);
  const artefacts = comps.filter((k) => k.dL >= 8.0 && k.bdLuma < 60 && k.bdRB < 0.5);
  return { shot, backDiff, changed, pctFrame: 100 * changed / N, meanAbs: absSum / (changed || 1),
    comps, scatterPx, scatterFrac: 100 * scatterPx / (changed || 1), artefacts };
};

const EXT = ['dunes', 'hero', 'courtyard'];
const results = {};
for (const s of [...EXT, 'temple']) results[s] = analyse(s);

console.log('='.repeat(84));
console.log('fx21 — Arm A: what `sandHigh` contributes where it is doing its job');
console.log('='.repeat(84));

for (const s of [...EXT, 'temple']) {
  const r = results[s];
  console.log(`\n### ${s}${s === 'temple' ? '  (same-boot interior anchor)' : '  (exterior)'}`);
  if (r.missing) { console.log('  MISSING frames'); continue; }
  if (r.backDiff === null) console.log('  !! no `back` frame — rows UNVERIFIED');
  else if (r.backDiff !== 0) { console.log(`  !! CONTROL FAILED: back differs from base by ${r.backDiff} px — THIS SHOT'S ROWS ARE VOID`); continue; }
  else console.log('  control: back == base (0 px)');
  console.log(`  changed ${r.changed} px (${r.pctFrame.toFixed(2)}% of frame)   mean|ΔL| ${r.meanAbs.toFixed(2)}`);
  console.log(`  components >=${MINC}px: ${r.comps.length}   scattered(<${SCATTER}px) ${r.scatterPx} px = ${r.scatterFrac.toFixed(1)}% of changed`);
  for (const k of r.comps.slice(0, 6)) {
    console.log(`    ${String(k.c).padStart(6)} px  ${k.box[0]}x${k.box[1]} at (${k.at[0]},${k.at[1]})  ΔL ${k.dL >= 0 ? '+' : ''}${k.dL.toFixed(2)}` +
      `  backdrop rgb(${k.bd.join(',')}) luma ${k.bdLuma.toFixed(1)} R/B ${k.bdRB.toFixed(2)}` +
      (k.dL >= 8 && k.bdLuma < 60 && k.bdRB < 0.5 ? '   <<< ARTEFACT-CLASS' : ''));
  }
}

console.log('\n' + '='.repeat(84));
console.log('THE REGISTERED FALSIFIER');
const extArte = EXT.filter((s) => !results[s].missing && results[s].backDiff === 0 && results[s].artefacts?.length);
if (extArte.length) {
  console.log('  FIRED. Exterior shots carrying a ΔL>=8 component over a dark blue backdrop:');
  for (const s of extArte) for (const k of results[s].artefacts)
    console.log(`    ${s}: ${k.c} px ${k.box[0]}x${k.box[1]} at (${k.at[0]},${k.at[1]}) ΔL +${k.dL.toFixed(2)} backdrop luma ${k.bdLuma.toFixed(1)} R/B ${k.bdRB.toFixed(2)}`);
  console.log('  => The artefact is NOT temple-specific. Per the seal, the ARTEFACT/FIELD split');
  console.log('     must be REWRITTEN BEFORE ANY FIX. No candidate fix may be selected on this run.');
} else {
  console.log('  Not fired: no exterior carries a ΔL>=8 component over a backdrop of luma<60 and R/B<0.5.');
  console.log('  => The ARTEFACT/FIELD split stands as registered, and Arm A\'s numbers below are the');
  console.log('     cost ceiling any fix must respect (Arm B PASS needs each exterior within 15% of');
  console.log('     its total contribution AND within 15% relative on scattered fraction).');
}

console.log('\n--- Arm B cost ceiling (from Arm A, for the fix that has not been chosen yet) ---');
for (const s of EXT) {
  const r = results[s];
  if (r.missing || r.backDiff !== 0) { console.log(`  ${s.padEnd(10)} VOID/missing`); continue; }
  console.log(`  ${s.padEnd(10)} total|ΔL| budget ${(r.meanAbs * r.changed).toFixed(0)} (±15% => ${(0.85 * r.meanAbs * r.changed).toFixed(0)}..${(1.15 * r.meanAbs * r.changed).toFixed(0)})` +
    `   scattered ${r.scatterFrac.toFixed(1)}% (±15% rel => ${(0.85 * r.scatterFrac).toFixed(1)}..${(1.15 * r.scatterFrac).toFixed(1)})`);
}

console.log('\n--- registered predictions, scored ---');
const t = results.temple;
if (!t.missing && t.backDiff === 0) {
  for (const s of EXT) {
    const r = results[s];
    if (r.missing || r.backDiff !== 0) continue;
    const bigger = r.changed > t.changed;
    const scatt = r.scatterFrac > t.scatterFrac;
    const loud = r.comps.some((k) => k.dL >= 17);
    console.log(`  ${s.padEnd(10)} larger total than temple: ${bigger ? 'YES' : 'NO'} (${r.changed} vs ${t.changed})` +
      `   higher scattered: ${scatt ? 'YES' : 'NO'} (${r.scatterFrac.toFixed(1)}% vs ${t.scatterFrac.toFixed(1)}%)` +
      `   no ΔL~+17 component: ${loud ? 'NO — one exists' : 'YES'}`);
  }
}
const st = J.jobs?.['temple.base']?.probe;
if (st) console.log(`\nsame-boot anchor stamp: temple tod ${st.tod} cam ${JSON.stringify(st.camPos)} fov ${st.fov} sandHigh live ${st.batches?.sandHigh?.live}`);
