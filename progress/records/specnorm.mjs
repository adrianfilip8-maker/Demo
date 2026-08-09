/**
 * specnorm.mjs — the PREREG-specnorm capture. SPECNORM.
 *
 * One boot, one browser, one server. `dt: 0` at every frame-advancing call (§195/§251), so a
 * duplicate arm differs by exactly zero pixels and the null arm means something.
 *
 * Arms are UNIFORM POKES on shared uniform objects (`shading.uniforms.uSpecNormPow` /
 * `.uSpecKey` / `.uSpecGain`), merged into every material by identity in onBeforeCompile and
 * never republished per frame — so this is a same-boot single-lever sweep, bit-deterministic
 * (§233). No source edit inside the held ticket, no per-arm navigation, no rebuild.
 *
 * DURABLE-EARLY (§163): every frame PNG and the per-shot JSON is written the moment it exists.
 * If this dies mid-run the committed partial record is the record.
 *
 *   usage: bash tools/launch.sh progress/records/specnorm.mjs <ABS log> <ABS pidfile>
 */
import { withGame } from '../../tools/harness.mjs';
import { readPNG } from '../../tools/png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../../shots/specnorm');
mkdirSync(OUT, { recursive: true });

const SHOTS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SHOT_LIST = SHOTS.length ? SHOTS : ['hero', 'temple', 'courtyard', 'sly-closeup', 'interior'];
const TAG = SHOTS.length ? `-${SHOT_LIST.join('_')}` : '';
/* PREREG-specnorm §8: T1/T2/H1 are scored on the four OUTDOOR shots. `interior` is the
   gated-term invariance check (G5) and is excluded from the deliverable gates by name. */
const OUTDOOR = new Set(['hero', 'temple', 'courtyard', 'sly-closeup']);

/* PREREG-specnorm §5. Order is fixed; `base2` is LAST so I1 proves that returning the lever to
   0 reproduces `base` exactly rather than merely that `base` repeats. */
const ARMS = [
  ['base',  { pow: 0,    key: 0, gain: 1 }],
  ['off',   { pow: 0,    key: 0, gain: 0 }],
  ['n035',  { pow: 0.35, key: 0, gain: 1 }],
  ['n050',  { pow: 0.50, key: 0, gain: 1 }],
  ['n100',  { pow: 1.00, key: 0, gain: 1 }],
  ['n050k', { pow: 0.50, key: 1, gain: 1 }],
  ['base2', { pow: 0,    key: 0, gain: 1 }],
];
/* Candidates the ship rule may select from. `n050k` is interaction sizing only (§2.1). */
const CAND = ['n035', 'n050', 'n100'];

const W = 1280, H = 720;

/* ------------------------------ scoring helpers ------------------------------ */
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function lumaStats(im) {
  const n = im.w * im.h, hist = new Float64Array(256);
  const L = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += im.ch) {
    const v = lumOf(im.data[p], im.data[p + 1], im.data[p + 2]);
    L[i] = v; hist[Math.min(255, Math.round(v))]++;
  }
  const pct = (q) => { let acc = 0; const want = q * n;
    for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= want) return b; } return 255; };
  let o200 = 0, o230 = 0, o250 = 0, mx = 0, sum = 0;
  for (let i = 0; i < n; i++) { const v = L[i]; sum += v; if (v > mx) mx = v;
    if (v > 200) o200++; if (v > 230) o230++; if (v > 250) o250++; }
  return { n, mean: sum / n, p1: pct(0.01), p50: pct(0.50), p90: pct(0.90), p99: pct(0.99),
    p999: pct(0.999), max: mx, over200: (100 * o200) / n, over230: (100 * o230) / n,
    over250: (100 * o250) / n, over230px: o230, over250px: o250 };
}

function diff(a, b) {
  const n = Math.min(a.w * a.h, b.w * b.h);
  let px = 0, maxAbs = 0, sumUp = 0, upPx = 0, dnPx = 0, sumDn = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    const d0 = a.data[p] - b.data[p], d1 = a.data[p + 1] - b.data[p + 1], d2 = a.data[p + 2] - b.data[p + 2];
    if (d0 || d1 || d2) { px++;
      const dl = lumOf(a.data[p], a.data[p + 1], a.data[p + 2]) - lumOf(b.data[p], b.data[p + 1], b.data[p + 2]);
      if (Math.abs(dl) > maxAbs) maxAbs = Math.abs(dl);
      if (dl > 0) { sumUp += dl; upPx++; } else if (dl < 0) { sumDn += dl; dnPx++; } }
  }
  return { px, pct: (100 * px) / n, maxAbsL: maxAbs, upPx, dnPx,
    meanUpL: upPx ? sumUp / upPx : 0, meanDnL: dnPx ? sumDn / dnPx : 0 };
}

/* ------------------------------ in-page helpers ------------------------------ */
const applyArm = async (page, cfg) => page.evaluate(async (c) => {
  const S = window.__ENGINE.get('shading');
  S.uniforms.uSpecNormPow.value = c.pow;
  S.uniforms.uSpecKey.value = c.key;
  S.uniforms.uSpecGain.value = c.gain;
  await window.__GAME.step(2, 0);
  return { pow: S.uniforms.uSpecNormPow.value, key: S.uniforms.uSpecKey.value, gain: S.uniforms.uSpecGain.value };
}, cfg);

const grab = async (page) => page.evaluate(() => window.__GAME.capture());

const census = async (page) => page.evaluate(() => {
  const E = window.__ENGINE, S = E.get('shading');
  const seen = new Map();
  let total = 0;
  E.scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m?.userData?.sly) continue;
      total++;
      const u = m.userData.slyUniforms;
      if (!u?.uSpec) continue;
      const k = [u.uSpec.value, u.uGloss.value, u.uMetal.value, m.roughness].join('|');
      const row = seen.get(k) || { spec: u.uSpec.value, gloss: u.uGloss.value, metal: u.uMetal.value,
        roughness: m.roughness, hasRoughMap: !!m.roughnessMap, count: 0, names: [] };
      row.count++;
      if (row.names.length < 4 && o.name) row.names.push(o.name);
      seen.set(k, row);
    }
  });
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return { materials: total,
    keyRadLum: lum(S.uniforms.uKeyColor.value) * S.uniforms.uKeyIntensity.value,
    shared: { specNormPowIdentity: S.uniforms.uSpecNormPow ? 1 : 0, specKeyIdentity: S.uniforms.uSpecKey ? 1 : 0 },
    classes: [...seen.values()].sort((a, b) => b.spec - a.spec) };
});

const debugGrab = async (page, mode) => page.evaluate(async (m) => {
  const S = window.__ENGINE.get('shading'), P = window.__ENGINE.get('postfx');
  P.debugRaw(true, 'scene');
  S.debugTerm(m);
  await window.__GAME.step(2, 0);
  const url = window.__GAME.capture();
  S.debugTerm(0);
  P.debugRaw(false);
  await window.__GAME.step(2, 0);
  return url;
}, mode);

/* --------------------------------- the run ----------------------------------- */
const t0 = Date.now();
const rows = [];

const info = await withGame({ width: W, height: H, quality: 'high', timeout: 5400000 }, async ({ page, info }) => {
  const buf = await page.evaluate(() => {
    window.__ENGINE.renderFrame(0);
    return [window.__ENGINE.canvas.width, window.__ENGINE.canvas.height];
  });
  console.log(`renderer: ${info.renderer}   drawing buffer ${buf[0]}x${buf[1]}   boot warnings ${info.warnings.length}`);

  for (const shot of SHOT_LIST) {
    process.stdout.write(`\n[${shot}] staging`);
    await page.evaluate((n) => window.__GAME.setShot(n, { dt: 0 }), shot);

    const cen = await census(page);
    const row = { shot, buf, census: cen, arms: {}, files: {} };

    for (const [name, cfg] of ARMS) {
      const applied = await applyArm(page, cfg);
      const url = await grab(page);
      const f = path.join(OUT, `${shot}.${name}.png`);
      writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      row.arms[name] = applied; row.files[name] = f;
      process.stdout.write(` ${name}(${applied.pow}/${applied.key}/${applied.gain})`);
    }

    /* Diagnostics. Mode 4 FIRST — it is the calibration and 6/7 are reading modes; score the
       triple and hand the verdict back with confirmDebugCalibration() before either runs, so
       an unproven reading is impossible rather than merely discouraged (§210.2). */
    {
      const calibUrl = await debugGrab(page, 4);
      const cf = path.join(OUT, `${shot}.dbg4.png`);
      writeFileSync(cf, Buffer.from(calibUrl.split(',')[1], 'base64'));
      row.files.calib = cf;
      const ci = readPNG(cf);
      let hit = 0; const cn = ci.w * ci.h;
      for (let i = 0, p = 0; i < cn; i++, p += ci.ch) {
        if (ci.data[p] === 64 && ci.data[p + 1] === 128 && ci.data[p + 2] === 191) hit++;
      }
      row.calibShare = (100 * hit) / cn;
      await page.evaluate((ok) => window.__ENGINE.get('shading')
        .confirmDebugCalibration('term', ok, 'PREREG-specnorm I4'), row.calibShare > 5);
      process.stdout.write(` dbg4(${row.calibShare.toFixed(1)}%)`);

      for (const [m, key] of [[6, 'incid'], [7, 'cls']]) {
        const u = await debugGrab(page, m);
        const f = path.join(OUT, `${shot}.dbg${m}.png`);
        writeFileSync(f, Buffer.from(u.split(',')[1], 'base64'));
        row.files[key] = f;
        process.stdout.write(` dbg${m}`);
      }
    }

    await applyArm(page, { pow: 0, key: 0, gain: 1 });

    rows.push(row);
    writeFileSync(path.join(OUT, `arms${TAG}.json`), JSON.stringify(rows, null, 2));
    process.stdout.write(`  (${((Date.now() - t0) / 1000) | 0}s)`);
  }
  return { renderer: info.renderer, warnings: info.warnings };
});

console.log(`\n\ncaptured in ${((Date.now() - t0) / 1000) | 0}s\n`);

/* ------------------------------- scoring ------------------------------------- */
const R = { prereg: 'PREREG-specnorm.md', renderer: info.renderer, res: [W, H], shots: [] };

for (const r of rows) {
  const im = {};
  for (const a of Object.keys(r.files)) { try { im[a] = readPNG(r.files[a]); } catch { im[a] = null; } }
  const s = { shot: r.shot, applied: r.arms, census: r.census, stats: {}, diffs: {},
    calibShare: r.calibShare ?? 0, incidence: null, classes: null };
  for (const [name] of ARMS) if (im[name]) s.stats[name] = lumaStats(im[name]);
  if (im.base && im.base2) s.diffs.null = diff(im.base2, im.base);
  if (im.base && im.off) s.diffs.off = diff(im.off, im.base);
  for (const c of [...CAND, 'n050k']) if (im.base && im[c]) s.diffs[c] = diff(im[c], im.base);

  /* --- mode 6 incidence, MASKED to the mode-4 toon population (§262 §8.1) --- */
  if (im.incid && im.calib) {
    const g = im.incid, c = im.calib, n = g.w * g.h;
    let toon = 0, gA = 0, gF = 0, sat = 0, half = 0;
    for (let i = 0; i < n; i++) {
      const ci = i * c.ch;
      if (!(c.data[ci] === 64 && c.data[ci + 1] === 128 && c.data[ci + 2] === 191)) continue;
      toon++;
      const p = i * g.ch;
      if (g.data[p + 2] >= 1) gA++;
      if (g.data[p + 2] < 250) continue;
      gF++;
      if (g.data[p] >= 252) sat++;
      if (g.data[p] >= 128) half++;
    }
    const q = (v) => (toon ? (100 * v) / toon : 0);
    s.incidence = { toonPct: (100 * toon) / n, toonPx: toon, gatesAnyPct: q(gA), gatesOpenPct: q(gF),
      jointSatPct: q(sat), jointHalfPct: q(half), jointSatPx: sat };
  }

  /* --- mode 7 per-class attribution, masked the same way (PREREG-specnorm §7) ---
   * R = uSpec, G = glossP/128, B = slyMetal. Bucket on (R, B): those are per-material uniforms
   * and quantise to a stable byte. G varies per pixel with ormG, so it is reported as a range
   * rather than used as a key. Rises are measured on LOBE-SATURATED pixels (mode-6 R >= 252),
   * which is the worst case for that class and the population G4 is defined over. */
  if (im.cls && im.calib && im.incid && im.base) {
    const cl = im.cls, ca = im.calib, gi = im.incid, n = cl.w * cl.h;
    const bk = new Map();
    for (let i = 0; i < n; i++) {
      const ci = i * ca.ch;
      if (!(ca.data[ci] === 64 && ca.data[ci + 1] === 128 && ca.data[ci + 2] === 191)) continue;
      const p = i * cl.ch, uS = cl.data[p], gl = cl.data[p + 1], mt = cl.data[p + 2];
      const k = `${uS}|${mt}`;
      let row = bk.get(k);
      if (!row) { row = { uSpec8: uS, metal8: mt, px: 0, glMin: 255, glMax: 0, glSum: 0,
        satPx: 0, rises: {} }; bk.set(k, row); }
      row.px++; row.glSum += gl;
      if (gl < row.glMin) row.glMin = gl;
      if (gl > row.glMax) row.glMax = gl;
      const q = i * gi.ch;
      if (gi.data[q + 2] >= 250 && gi.data[q] >= 252) {
        row.satPx++;
        const bp = i * im.base.ch;
        const bL = lumOf(im.base.data[bp], im.base.data[bp + 1], im.base.data[bp + 2]);
        for (const a of [...CAND, 'n050k']) {
          if (!im[a]) continue;
          const ap = i * im[a].ch;
          (row.rises[a] ||= []).push(lumOf(im[a].data[ap], im[a].data[ap + 1], im[a].data[ap + 2]) - bL);
        }
      }
    }
    const out = [];
    for (const row of bk.values()) {
      const o = { uSpec: row.uSpec8 / 255, metal: row.metal8 / 255, px: row.px, satPx: row.satPx,
        glossP: { min: (row.glMin / 255) * 128, max: (row.glMax / 255) * 128,
          mean: (row.glSum / row.px / 255) * 128 }, rise: {} };
      for (const a of Object.keys(row.rises)) {
        const v = row.rises[a].sort((x, y) => x - y);
        o.rise[a] = { p50: v[(0.5 * v.length) | 0], p90: v[Math.min(v.length - 1, (0.9 * v.length) | 0)],
          max: v[v.length - 1], n: v.length };
      }
      out.push(o);
    }
    s.classes = out.sort((a, b) => b.satPx - a.satPx || b.px - a.px);
  }
  R.shots.push(s);
}

writeFileSync(path.join(OUT, `score${TAG}.json`), JSON.stringify(R, null, 2));

/* ------------------------------- the verdict --------------------------------- */
const f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3), f4 = (v) => v.toFixed(4);
const OUT_SHOTS = R.shots.filter((s) => OUTDOOR.has(s.shot));
console.log('================= PREREG-specnorm REGISTERED CRITERIA =================\n');

console.log('per-shot luma (display bytes, Rec.709):');
console.log('shot          arm      p1    p50    p90    p99   p99.9   max     >200%    >230%  >230px    >250%');
for (const s of R.shots) { for (const [a] of ARMS) { const t = s.stats[a]; if (!t) continue;
  console.log(`${s.shot.padEnd(13)} ${a.padEnd(6)} ${String(t.p1).padStart(4)} ${String(t.p50).padStart(6)} ${String(t.p90).padStart(6)} ${String(t.p99).padStart(6)} ${String(t.p999).padStart(6)} ${f2(t.max).padStart(7)} ${f3(t.over200).padStart(9)} ${f4(t.over230).padStart(8)} ${String(t.over230px).padStart(7)} ${f4(t.over250).padStart(8)}`); } console.log(''); }

console.log('I1 NULL ARM  (base2 vs base, must be exactly 0 px):');
let i1 = true;
for (const s of R.shots) { const d = s.diffs.null, ok = d && d.px === 0; i1 &&= ok;
  console.log(`   ${s.shot.padEnd(13)} ${d ? d.px : 'MISSING'} px   ${ok ? 'PASS' : 'FAIL'}`); }
console.log(`   I1 ${i1 ? 'FIRED' : 'FAILED — the run is VOID'}`);

console.log('\nI2 POSITIVE CONTROL  (off vs base, must be > 0 px on all four OUTDOOR shots):');
let i2 = true;
for (const s of R.shots) { const d = s.diffs.off, ok = d && d.px > 0, req = OUTDOOR.has(s.shot);
  if (req) i2 &&= ok;
  console.log(`   ${s.shot.padEnd(13)} ${d ? `${d.px} px (${f3(d.pct)}%)  max |dL| ${f2(d.maxAbsL)}  mean dL ${f2(d.meanDnL)}` : 'MISSING'}   ${req ? (ok ? 'FIRED' : 'DID NOT FIRE') : '(exempt — G5 predicts 0)'}`); }
console.log(`   I2 ${i2 ? 'FIRED' : 'DID NOT FIRE — amplitude claims on the dead shots are VOID'}`);

console.log('\nI3 APPLIED STATE  (pow/key/gain, distinct per arm):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${Object.entries(s.applied).map(([k, v]) => `${k}=${v.pow}/${v.key}/${v.gain}`).join(' ')}`);

console.log('\nI4 READBACK CALIBRATION  (debugTerm(4) triple, bar > 5% of frame):');
let i4 = true;
for (const s of R.shots) { const ok = (s.calibShare ?? 0) > 5; i4 &&= ok;
  console.log(`   ${s.shot.padEnd(13)} ${f2(s.calibShare ?? 0)}%   ${ok ? 'FIRED' : 'BLIND'}`); }
console.log(`   I4 ${i4 ? 'FIRED' : 'BLIND — masked/incidence numbers are VOID, display bytes stand'}`);

/* I5 — the class map must resolve >= 6 buckets and match the live census to 1/255. */
const allB = new Map();
for (const s of R.shots) for (const c of s.classes ?? []) allB.set(`${Math.round(c.uSpec * 255)}|${Math.round(c.metal * 255)}`, c);
const censusSpec = [...new Set(R.shots.flatMap((s) => s.census.classes.map((c) => c.spec)))];
let matched = 0;
for (const c of allB.values()) if (censusSpec.some((v) => Math.abs(v - c.uSpec) <= 1 / 255 + 1e-9)) matched++;
const i5 = allB.size >= 6 && matched === allB.size;
console.log(`\nI5 CLASS-MAP CALIBRATION  (debugTerm(7); >= 6 buckets, every uSpec within 1/255 of the census):`);
console.log(`   ${allB.size} distinct (uSpec, metal) buckets over all shots; ${matched}/${allB.size} match a census row`);
console.log(`   I5 ${i5 ? 'FIRED' : 'BLIND — ALL per-class attribution in this run is VOID; whole-frame numbers stand'}`);

console.log('\ncandidate vs base:');
for (const s of R.shots) { console.log(`   ${s.shot}`);
  for (const a of [...CAND, 'n050k']) { const d = s.diffs[a], b = s.stats.base, k = s.stats[a];
    if (!d || !b || !k) continue;
    console.log(`      ${a.padEnd(6)} ${String(d.px).padStart(7)} px (${f3(d.pct)}%)  max dL ${f2(d.maxAbsL).padStart(6)}   p50 ${b.p50}->${k.p50}   p99 ${b.p99}->${k.p99}   >230 ${b.over230px}->${k.over230px} px   >250 ${f4(k.over250)}%`); } }

/* ---- registered thresholds ---- */
const gate = {};
for (const a of CAND) {
  const T1 = OUT_SHOTS.filter((s) => s.stats[a]?.p99 >= 200).length;
  const T2 = OUT_SHOTS.filter((s) => s.stats[a]?.over230 >= 0.20).length;
  const H1 = OUT_SHOTS.filter((s) => (s.stats.base?.over230 ?? 1) <= 0.005 && (s.stats[a]?.over230 ?? 0) >= 0.02).length;
  const G1 = R.shots.every((s) => s.stats[a].over250 <= 0.50 && (s.stats[a].over250 - s.stats.base.over250) <= 0.40);
  const G2 = R.shots.every((s) => (s.stats[a].p50 - s.stats.base.p50) <= 4 && s.stats[a].p50 <= 130);
  const G3 = R.shots.every((s) => s.stats[a].p1 <= 45 && Math.abs(s.stats[a].p1 - s.stats.base.p1) <= 2);
  const sly = R.shots.find((s) => s.shot === 'sly-closeup');
  const slyCls = (sly?.classes ?? []).filter((c) => Math.abs(c.uSpec - 0.25) < 0.01 && c.metal < 0.01 && c.rise[a]);
  const g4v = slyCls.length ? Math.max(...slyCls.map((c) => c.rise[a].p50)) : null;
  const G4 = g4v === null ? null : g4v <= 20;
  const inte = R.shots.find((s) => s.shot === 'interior');
  const G5 = inte ? inte.diffs[a].px === 0 : null;
  /* ── SCORING BUG, FOUND AFTER THE RUN AND FIXED HERE RATHER THAN QUIETLY ──────────────
     This line originally read `G4 !== false && G5 !== false`, which treats an UNSCOREABLE
     guard (null) as a satisfied one. On the registered run G4 came back null — I5 went BLIND
     and, independently, `sly-closeup`'s uSpec-0.25 population is 23 px because the mode-4 mask
     does not contain the character — and the runner therefore printed **"==> SHIP
     uSpecNormPow 1"**. That output is in `specnorm/capture.txt` and it is WRONG.

     The registered ship rule says "satisfies G1-G5". A guard that could not be evaluated is
     not a guard that passed, and PREREG-specnorm's I5 says in terms that a BLIND class map
     makes all per-class attribution VOID. G4 is per-class attribution. So the correct reading
     is DO NOT SHIP, and `null` must fail closed.

     Left as a comment rather than an edit-in-silence because a permissive default in a scorer
     is exactly the failure mode this project's whole method exists to catch, and because the
     printed verdict is part of the record. */
  const passed = (v) => v === true;
  gate[a] = { T1, T2, H1, G1, G2, G3, G4, g4v, G5,
    guards: passed(G1) && passed(G2) && passed(G3) && passed(G4) && passed(G5), ship: false };
  gate[a].ship = gate[a].guards && H1 >= 3;
}

console.log('\n================= REGISTERED GATES (outdoor shots only for T1/T2/H1) =================');
console.log('cand    T1 p99>=200  T2 >230>=0.20%   H1 >230>=0.02%  | G1 blowout  G2 p50  G3 p1  G4 sly  G5 interior | SHIP');
for (const a of CAND) { const g = gate[a];
  console.log(`${a.padEnd(7)} ${String(g.T1).padStart(4)}/4       ${String(g.T2).padStart(6)}/4          ${String(g.H1).padStart(6)}/4      |  ${(g.G1 ? 'pass' : 'FAIL').padEnd(9)} ${(g.G2 ? 'pass' : 'FAIL').padEnd(6)} ${(g.G3 ? 'pass' : 'FAIL').padEnd(6)} ${(g.G4 === null ? 'n/a' : g.G4 ? 'pass' : 'FAIL').padEnd(7)} ${(g.G5 === null ? 'n/a' : g.G5 ? 'pass' : 'FAIL').padEnd(11)}| ${g.ship ? 'YES' : 'no'}`); }
for (const a of CAND) if (gate[a].g4v !== null) console.log(`   G4 detail  ${a}: median rise on Sly's lobe-saturated px = ${f2(gate[a].g4v)} L  (bar 20)`);

const winner = [...CAND].reverse().find((a) => gate[a].ship);
console.log(`\nSHIP RULE: the largest pow in {${CAND.join(', ')}} that satisfies G1-G5 with I1-I4 fired, provided H1 >= 3/4.`);
console.log(`   I1 ${i1 ? 'ok' : 'VOID'} · I2 ${i2 ? 'ok' : 'VOID'} · I4 ${i4 ? 'ok' : 'BLIND'} · I5 ${i5 ? 'ok' : 'BLIND'}`);
console.log(`   ==> ${i1 && i2 && winner ? `SHIP uSpecNormPow ${ARMS.find(([n]) => n === winner)[1].pow}` : 'DO NOT SHIP — TUNE.specNormPow stays 0'}`);
const guardOnly = [...CAND].reverse().find((a) => gate[a].guards);
if (!winner && guardOnly) console.log(`   (largest value that clears the GUARDS but misses H1: ${guardOnly})`);

console.log('\ndebugTerm(6) SPECULAR INCIDENCE — OF THE TOON POPULATION (mode-4 mask), never of the frame:');
console.log('shot           toon%   toonPx   gates>0   gatesFULL   quant>=50%   quantSAT   (px)');
for (const s of R.shots) { const i = s.incidence; if (!i) { console.log(`   ${s.shot} — missing`); continue; }
  console.log(`${s.shot.padEnd(13)} ${f2(i.toonPct).padStart(5)}% ${String(i.toonPx).padStart(8)} ${f3(i.gatesAnyPct).padStart(9)}% ${f3(i.gatesOpenPct).padStart(10)}% ${f3(i.jointHalfPct).padStart(11)}% ${f3(i.jointSatPct).padStart(10)}% ${String(i.jointSatPx).padStart(7)}`); }

console.log('\ndebugTerm(7) PER-MATERIAL CLASS — median display-L rise on that class\'s LOBE-SATURATED pixels');
console.log('(uSpec/metal from the map; glossP is per-pixel so it is a range. norm factor = ((glossP+8)/8)^pow)');
for (const s of R.shots) {
  if (!s.classes?.length) continue;
  console.log(`\n  ${s.shot}`);
  console.log('  uSpec  metal   glossP mean[min..max]   class px   satPx |  n035    n050    n100   n050k');
  for (const c of s.classes) {
    if (!c.satPx) continue;
    const r = (a) => (c.rise[a] ? (c.rise[a].p50 >= 0 ? '+' : '') + c.rise[a].p50.toFixed(1) : '-');
    console.log(`  ${f3(c.uSpec)}  ${f2(c.metal)}   ${f2(c.glossP.mean).padStart(6)}[${f2(c.glossP.min)}..${f2(c.glossP.max)}]  ${String(c.px).padStart(8)} ${String(c.satPx).padStart(7)} | ${r('n035').padStart(6)} ${r('n050').padStart(7)} ${r('n100').padStart(7)} ${r('n050k').padStart(7)}`);
  }
  const dead = s.classes.filter((c) => !c.satPx);
  if (dead.length) console.log(`  (+ ${dead.length} classes present but with no lobe-saturated pixel: uSpec ${dead.map((c) => f2(c.uSpec)).join(', ')})`);
}
