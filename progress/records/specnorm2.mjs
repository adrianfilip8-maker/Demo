/**
 * specnorm2.mjs — the PREREG-specnorm2 capture. SPECNORM.
 *
 * Sweeps `uSpecNormPow` 0.60 → 1.00, the gap §263's registered set could not be widened to
 * cover. One boot, one browser, `dt: 0` at every frame-advancing call (§195/§251).
 *
 * Three things this runner does that `specnorm.mjs` did not, each from a §263 measurement:
 *
 *  1. **The class key is the R byte ALONE, with ±1** (PREREG-specnorm2 §2.2). Mode 7's B is
 *     `slyMetal` — `uMetal * metalnessMap.b`, a per-texel read — and keying on it is what sent
 *     §263's I5 BLIND with 2 350 buckets. ±1 is load-bearing: `paving`'s 0.10 is byte 26 in JS
 *     and arrives as 25.
 *  2. **A class below 70 lobe-saturated px returns VOID**, not a number (§2.3). Derived from
 *     `SE(median) = 1.253 σ/√n ≤ 2.0 L` at the worst σ measured in §263 (13.0 L).
 *  3. **The character's denominator is `debugTerm(8)`'s `vSlySkin`, never the mode-4 mask**
 *     (§263.2 / §4's amendment). Mode 4 arrives over Sly as the calibration triple plus an
 *     offset, and that offset moves EVERY debug channel — Sly's mode-7 R reads 74–82 against a
 *     census byte of 64 — so neither the mask nor the `uSpec` byte can find him. `vSlySkin` is
 *     0 or 1 and has ~110 bytes of margin either side of the 128 threshold. I7 checks that.
 *
 * Every ship decision goes through `tools/gate.mjs`, whose only PASS is the boolean `true`
 * (§263.1: `G4 !== false` printed SHIP on a null).
 *
 * DURABLE-EARLY (§163): every frame PNG and the per-shot JSON is written the moment it exists.
 *
 *   usage: bash tools/launch.sh progress/records/specnorm2.mjs <ABS log> <ABS pidfile>
 */
import { withGame } from '../../tools/harness.mjs';
import { readPNG } from '../../tools/png.mjs';
import { shipVerdict, verdictLine, guardState, PASS, VOID } from '../../tools/gate.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../../shots/specnorm2');
mkdirSync(OUT, { recursive: true });

const SHOTS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SHOT_LIST = SHOTS.length ? SHOTS : ['hero', 'temple', 'courtyard', 'sly-closeup', 'interior'];
const TAG = SHOTS.length ? `-${SHOT_LIST.join('_')}` : '';
const OUTDOOR = new Set(['hero', 'temple', 'courtyard', 'sly-closeup']);

/* PREREG-specnorm2 §3. `base2` LAST so I1 proves the lever returns, not merely that base repeats.
   `p100` is captured IN THIS BOOT — §263.3 measured cross-boot frames differing on 5–16 % of
   pixels, so §263's own n100 cannot be reused as the anchor. */
const ARMS = [
  ['base',  0],
  ['off',   0, 0],      // third element = uSpecGain
  ['p060',  0.60],
  ['p070',  0.70],
  ['p080',  0.80],
  ['p090',  0.90],
  ['p100',  1.00],
  ['base2', 0],
];
const CAND = ['p060', 'p070', 'p080', 'p090', 'p100'];
const CANDPOW = { p060: 0.60, p070: 0.70, p080: 0.80, p090: 0.90, p100: 1.00 };

const W = 1280, H = 720;
const SAT_FLOOR = 70;          // §2.3
const G4_BAR = 20;             // §4, unchanged from PREREG-specnorm
const H1_SHARE = 0.02, H1_BASE_MAX = 0.005;

/* ------------------------------ scoring helpers ------------------------------ */
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const pctl = (v, q) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : NaN);

function lumaStats(im) {
  const n = im.w * im.h, hist = new Float64Array(256);
  let o200 = 0, o230 = 0, o250 = 0, mx = 0, sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += im.ch) {
    const v = lumOf(im.data[p], im.data[p + 1], im.data[p + 2]);
    hist[Math.min(255, Math.round(v))]++; sum += v; if (v > mx) mx = v;
    if (v > 200) o200++; if (v > 230) o230++; if (v > 250) o250++;
  }
  const pct = (q) => { let a = 0; for (let b = 0; b < 256; b++) { a += hist[b]; if (a >= q * n) return b; } return 255; };
  return { n, mean: sum / n, p1: pct(0.01), p50: pct(0.50), p90: pct(0.90), p99: pct(0.99),
    p999: pct(0.999), max: mx, over200: (100 * o200) / n, over230: (100 * o230) / n,
    over250: (100 * o250) / n, over230px: o230, over250px: o250 };
}

function diff(a, b) {
  const n = Math.min(a.w * a.h, b.w * b.h);
  let px = 0, mx = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    if (a.data[p] === b.data[p] && a.data[p + 1] === b.data[p + 1] && a.data[p + 2] === b.data[p + 2]) continue;
    px++;
    const d = Math.abs(lumOf(a.data[p], a.data[p + 1], a.data[p + 2]) - lumOf(b.data[p], b.data[p + 1], b.data[p + 2]));
    if (d > mx) mx = d;
  }
  return { px, pct: (100 * px) / n, maxAbsL: mx };
}

/* ------------------------------ in-page helpers ------------------------------ */
const applyArm = async (page, pow, gain = 1) => page.evaluate(async (c) => {
  const S = window.__ENGINE.get('shading');
  S.uniforms.uSpecNormPow.value = c.pow;
  S.uniforms.uSpecGain.value = c.gain;
  S.uniforms.uSpecKey.value = 0;
  await window.__GAME.step(2, 0);
  return { pow: S.uniforms.uSpecNormPow.value, gain: S.uniforms.uSpecGain.value, key: S.uniforms.uSpecKey.value };
}, { pow, gain });

const grab = async (page) => page.evaluate(() => window.__GAME.capture());

const census = async (page) => page.evaluate(() => {
  const E = window.__ENGINE, S = E.get('shading');
  const seen = new Map(); let total = 0;
  E.scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m?.userData?.sly) continue;
      total++;
      const u = m.userData.slyUniforms; if (!u?.uSpec) continue;
      const k = [u.uSpec.value, u.uGloss.value, u.uMetal.value, m.roughness].join('|');
      const row = seen.get(k) || { spec: u.uSpec.value, gloss: u.uGloss.value, metal: u.uMetal.value,
        roughness: m.roughness, count: 0, names: [] };
      row.count++; if (row.names.length < 4 && o.name) row.names.push(o.name);
      seen.set(k, row);
    }
  });
  return { materials: total, classes: [...seen.values()].sort((a, b) => b.spec - a.spec) };
});

const debugGrab = async (page, mode) => page.evaluate(async (m) => {
  const S = window.__ENGINE.get('shading'), P = window.__ENGINE.get('postfx');
  P.debugRaw(true, 'scene');
  S.debugTerm(m);
  await window.__GAME.step(2, 0);
  const url = window.__GAME.capture();
  S.debugTerm(0); P.debugRaw(false);
  await window.__GAME.step(2, 0);
  return url;
}, mode);

/* --------------------------------- the run ----------------------------------- */
const t0 = Date.now();
const rows = [];

const info = await withGame({ width: W, height: H, quality: 'high', timeout: 7200000 }, async ({ page, info }) => {
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

    for (const [name, pow, gain] of ARMS) {
      const applied = await applyArm(page, pow, gain ?? 1);
      const url = await grab(page);
      const f = path.join(OUT, `${shot}.${name}.png`);
      writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      row.arms[name] = applied; row.files[name] = f;
      process.stdout.write(` ${name}(${applied.pow}/${applied.gain})`);
    }

    /* Mode 4 FIRST — it is the calibration; 6 and 8 are reading modes and must not run on an
       unproven channel (§210.2). */
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
      .confirmDebugCalibration('term', ok, 'PREREG-specnorm2 I4'), row.calibShare > 5);
    process.stdout.write(` dbg4(${row.calibShare.toFixed(1)}%)`);

    for (const [m, key] of [[6, 'incid'], [8, 'cls']]) {
      const u = await debugGrab(page, m);
      const f = path.join(OUT, `${shot}.dbg${m}.png`);
      writeFileSync(f, Buffer.from(u.split(',')[1], 'base64'));
      row.files[key] = f;
      process.stdout.write(` dbg${m}`);
    }

    await applyArm(page, 0, 1);
    rows.push(row);
    writeFileSync(path.join(OUT, `arms${TAG}.json`), JSON.stringify(rows, null, 2));
    process.stdout.write(`  (${((Date.now() - t0) / 1000) | 0}s)`);
  }
  return { renderer: info.renderer, warnings: info.warnings };
});

console.log(`\n\ncaptured in ${((Date.now() - t0) / 1000) | 0}s\n`);

/* ------------------------------- scoring ------------------------------------- */
const R = { prereg: 'PREREG-specnorm2.md', renderer: info.renderer, res: [W, H], satFloor: SAT_FLOOR, shots: [] };

/* Census bytes -> ±1 LUT, ambiguous left UNRESOLVED (§2.2). */
const censusBytes = [...new Set(rows.flatMap((r) => r.census.classes.map((c) => Math.round(c.spec * 255))))].sort((a, b) => a - b);
const specOf = new Map();
for (const r of rows) for (const c of r.census.classes) {
  const b = Math.round(c.spec * 255);
  if (!specOf.has(b)) specOf.set(b, { spec: c.spec, names: new Set(), meshes: 0 });
  const e = specOf.get(b); e.meshes = Math.max(e.meshes, c.count);
  for (const n of c.names) e.names.add(n);
}
const LUT = new Int16Array(256).fill(-1);
for (let b = 0; b < 256; b++) {
  const near = censusBytes.filter((c) => Math.abs(c - b) <= 1);
  if (near.length === 1) LUT[b] = near[0];
  else if (near.length > 1) LUT[b] = near.includes(b) ? b : -2;
}
R.censusBytes = censusBytes;
R.ambiguousBytes = [...LUT.keys()].filter((b) => LUT[b] === -2);

for (const r of rows) {
  const im = {};
  for (const a of Object.keys(r.files)) { try { im[a] = readPNG(r.files[a]); } catch { im[a] = null; } }
  const s = { shot: r.shot, applied: r.arms, census: r.census, stats: {}, diffs: {},
    calibShare: r.calibShare ?? 0, incidence: null, classes: null, skin: null, g4: null };
  for (const [name] of ARMS) if (im[name]) s.stats[name] = lumaStats(im[name]);
  if (im.base && im.base2) s.diffs.null = diff(im.base2, im.base);
  if (im.base && im.off) s.diffs.off = diff(im.off, im.base);
  for (const c of CAND) if (im.base && im[c]) s.diffs[c] = diff(im[c], im.base);

  const gi = im.incid, ca = im.calib, cl = im.cls, ba = im.base;
  const n = ba ? ba.w * ba.h : 0;

  /* mode-6 incidence, masked to mode 4 — architecture only, and now known to be so (§263.2). */
  if (gi && ca) {
    let toon = 0, gA = 0, gF = 0, sat = 0;
    for (let i = 0; i < n; i++) {
      const c = i * ca.ch;
      if (!(ca.data[c] === 64 && ca.data[c + 1] === 128 && ca.data[c + 2] === 191)) continue;
      toon++;
      const q = i * gi.ch;
      if (gi.data[q + 2] >= 1) gA++;
      if (gi.data[q + 2] < 250) continue;
      gF++; if (gi.data[q] >= 252) sat++;
    }
    s.incidence = { toonPct: (100 * toon) / n, toonPx: toon,
      gatesAnyPct: toon ? (100 * gA) / toon : 0, gatesOpenPct: toon ? (100 * gF) / toon : 0,
      jointSatPct: toon ? (100 * sat) / toon : 0, jointSatPx: sat };
  }

  /* I5′ share, per-class table, I6/I7 skin statistics, and G4′ — one pass. */
  if (cl && ca && gi && ba) {
    const bk = new Map();
    let toon = 0, resolved = 0;
    let skinPx = 0, skinMasked = 0, deadZone = 0, bAny = 0;
    const g4rise = {};
    for (let i = 0; i < n; i++) {
      const p = i * cl.ch, Rb = cl.data[p], Bb = cl.data[p + 2];
      const c = i * ca.ch;
      const isMask4 = ca.data[c] === 64 && ca.data[c + 1] === 128 && ca.data[c + 2] === 191;
      if (Bb > 0) bAny++;
      if (Bb > 0 && Bb >= 64 && Bb <= 192) deadZone++;
      const isSkin = Bb >= 128;
      if (isSkin) { skinPx++; if (isMask4) skinMasked++; }

      const q = i * gi.ch;
      const satLobe = gi.data[q] >= 252 && gi.data[q + 2] >= 250;

      /* G4′ (amended): skin bit AND lobe-saturated. NOT the mode-4 mask, NOT the uSpec byte. */
      if (isSkin && satLobe && im.base) {
        const bp = i * ba.ch, bL = lumOf(ba.data[bp], ba.data[bp + 1], ba.data[bp + 2]);
        for (const a of CAND) {
          if (!im[a]) continue;
          const ap = i * im[a].ch;
          (g4rise[a] ||= []).push(lumOf(im[a].data[ap], im[a].data[ap + 1], im[a].data[ap + 2]) - bL);
        }
      }

      /* per-class architecture table, masked to mode 4 (where mode 4 is known to be exact) */
      if (!isMask4) continue;
      toon++;
      const key = LUT[Rb];
      if (key < 0) continue;
      resolved++;
      let row = bk.get(key);
      if (!row) { row = { byte: key, px: 0, gsum: 0, sat: 0, rise: {} }; bk.set(key, row); }
      row.px++; row.gsum += cl.data[p + 1];
      if (!satLobe) continue;
      row.sat++;
      const bp = i * ba.ch, bL = lumOf(ba.data[bp], ba.data[bp + 1], ba.data[bp + 2]);
      for (const a of CAND) {
        if (!im[a]) continue;
        const ap = i * im[a].ch;
        (row.rise[a] ||= []).push(lumOf(im[a].data[ap], im[a].data[ap + 1], im[a].data[ap + 2]) - bL);
      }
    }
    s.resolvedPct = toon ? (100 * resolved) / toon : 0;
    s.skin = { skinPx, skinPctFrame: (100 * skinPx) / n, skinMasked,
      deadZonePct: bAny ? (100 * deadZone) / bAny : 0, bAny };

    const out = [];
    for (const row of bk.values()) {
      const e = specOf.get(row.byte);
      const o = { uSpec: e.spec, meshes: e.meshes, name: [...e.names][0] || '?', px: row.px,
        satPx: row.sat, glossP: (row.gsum / row.px / 255) * 128, scoreable: row.sat >= SAT_FLOOR, rise: {} };
      for (const a of Object.keys(row.rise)) {
        const v = row.rise[a].sort((x, y) => x - y);
        o.rise[a] = { p50: pctl(v, 0.5), p90: pctl(v, 0.9), n: v.length };
      }
      out.push(o);
    }
    s.classes = out.sort((a, b) => b.satPx - a.satPx);

    const g4n = (g4rise[CAND[0]] || []).length;
    s.g4 = { n: g4n, scoreable: g4n >= SAT_FLOOR, med: {} };
    for (const a of CAND) {
      const v = (g4rise[a] || []).slice().sort((x, y) => x - y);
      s.g4.med[a] = v.length ? pctl(v, 0.5) : null;
    }
  }
  R.shots.push(s);
}

writeFileSync(path.join(OUT, `score${TAG}.json`), JSON.stringify(R, null, 2));

/* ------------------------------- the verdict --------------------------------- */
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '  —' : v.toFixed(2));
const f4 = (v) => v.toFixed(4);
const OUT_SHOTS = R.shots.filter((s) => OUTDOOR.has(s.shot));
console.log('================= PREREG-specnorm2 REGISTERED CRITERIA =================\n');

console.log('per-shot luma (display bytes, Rec.709):');
console.log('shot          arm      p1   p50   p99  p99.9    max    >230%  >230px   >250px');
for (const s of R.shots) {
  for (const [a] of ARMS) { const t = s.stats[a]; if (!t) continue;
    console.log(`${s.shot.padEnd(13)} ${a.padEnd(6)} ${String(t.p1).padStart(4)} ${String(t.p50).padStart(5)} ${String(t.p99).padStart(5)} ${String(t.p999).padStart(6)} ${t.max.toFixed(1).padStart(6)} ${f4(t.over230).padStart(8)} ${String(t.over230px).padStart(7)} ${String(t.over250px).padStart(8)}`); }
  console.log('');
}

const i1 = R.shots.every((s) => s.diffs.null?.px === 0);
const i2 = OUT_SHOTS.every((s) => (s.diffs.off?.px ?? 0) > 0);
const i4 = R.shots.every((s) => (s.calibShare ?? 0) > 5);
const i5 = OUT_SHOTS.every((s) => (s.resolvedPct ?? 0) >= 98);
const sly = R.shots.find((s) => s.shot === 'sly-closeup');
const i6 = !!sly?.skin && sly.skin.skinPctFrame > 5 && sly.skin.skinPx > 10 * sly.skin.skinMasked;
const i7 = !!sly?.skin && sly.skin.deadZonePct < 1;

console.log('I1 NULL ARM (0 px on every shot):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${s.diffs.null?.px ?? '—'} px`);
console.log(`   I1 ${i1 ? 'FIRED' : 'FAILED — run is VOID'}`);
console.log('\nI2 POSITIVE CONTROL (off vs base > 0 px on all four outdoor):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${s.diffs.off?.px ?? '—'} px${OUTDOOR.has(s.shot) ? '' : '   (exempt)'}`);
console.log(`   I2 ${i2 ? 'FIRED' : 'DID NOT FIRE'}`);
console.log('\nI3 APPLIED STATE:');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${Object.entries(s.applied).map(([k, v]) => `${k}=${v.pow}/${v.gain}`).join(' ')}`);
console.log('\nI4 MODE-4 CALIBRATION (> 5 % of frame):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${f2(s.calibShare)}%`);
console.log(`   I4 ${i4 ? 'FIRED' : 'BLIND'}`);
console.log('\nI5′ CLASS-MAP SHARE (mode-8 R resolves on >= 98 % of the mode-4 toon population):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${f2(s.resolvedPct)}%${OUTDOOR.has(s.shot) ? '' : '   (not scored)'}`);
console.log(`   I5′ ${i5 ? 'FIRED' : 'BLIND — per-class attribution VOID'}`);
console.log('\nI6 THE SKIN BIT SEES WHAT THE MASK CANNOT (sly-closeup):');
if (sly?.skin) console.log(`   skin px ${sly.skin.skinPx} = ${f2(sly.skin.skinPctFrame)}% of frame (bar > 5%);  also inside mode-4 mask: ${sly.skin.skinMasked};  ratio ${sly.skin.skinMasked ? (sly.skin.skinPx / sly.skin.skinMasked).toFixed(1) : '∞'}x (bar > 10x)`);
console.log(`   I6 ${i6 ? 'FIRED' : 'DID NOT FIRE — G4′ is VOID'}`);
console.log('\nI7 SKIN BIT IS BIMODAL (< 1 % of B>0 pixels in the dead zone [64,192]):');
if (sly?.skin) console.log(`   ${f2(sly.skin.deadZonePct)}% of ${sly.skin.bAny} px with B>0`);
console.log(`   I7 ${i7 ? 'FIRED' : 'DID NOT FIRE — G4′ is VOID'}`);

console.log('\ncandidate vs base:');
for (const s of R.shots) {
  console.log(`   ${s.shot}`);
  for (const a of CAND) { const d = s.diffs[a], b = s.stats.base, k = s.stats[a]; if (!d || !b || !k) continue;
    console.log(`      ${a}  ${String(d.px).padStart(7)} px  p50 ${b.p50}->${k.p50}  p99 ${b.p99}->${k.p99}  >230 ${b.over230px}->${k.over230px} px (${f4(k.over230)}%)  >250 ${k.over250px} px`); }
}

/* ---- the gates ---- */
console.log('\nG4′ — median rise on the character\'s lobe-saturated pixels (bar <= 20 L):');
const g4ok = {};
if (sly?.g4) {
  console.log(`   population ${sly.g4.n} px  (floor ${SAT_FLOOR}) -> ${sly.g4.scoreable ? 'scoreable' : 'VOID'}`);
  for (const a of CAND) console.log(`   ${a}  median ${f2(sly.g4.med[a])} L   ${sly.g4.scoreable && sly.g4.med[a] !== null ? (sly.g4.med[a] <= G4_BAR ? 'PASS' : 'FAIL') : 'VOID'}`);
}
for (const a of CAND) {
  g4ok[a] = (sly?.g4?.scoreable && i5 && i6 && i7 && sly.g4.med[a] !== null) ? sly.g4.med[a] <= G4_BAR : null;
}

console.log('\n================= REGISTERED GATES =================');
console.log('cand   T1     T2      H1   | G1    G2    G3    G4′    G5   | SHIP');
const verdicts = {};
for (const a of CAND) {
  const T1 = OUT_SHOTS.filter((s) => s.stats[a]?.p99 >= 200).length;
  const T2 = OUT_SHOTS.filter((s) => s.stats[a]?.over230 >= 0.20).length;
  const H1 = OUT_SHOTS.filter((s) => (s.stats.base?.over230 ?? 1) <= H1_BASE_MAX && (s.stats[a]?.over230 ?? 0) >= H1_SHARE).length;
  const G1 = R.shots.every((s) => s.stats[a].over250 <= 0.50 && (s.stats[a].over250 - s.stats.base.over250) <= 0.40);
  const G2 = R.shots.every((s) => (s.stats[a].p50 - s.stats.base.p50) <= 4 && s.stats[a].p50 <= 130);
  const G3 = R.shots.every((s) => s.stats[a].p1 <= 45 && Math.abs(s.stats[a].p1 - s.stats.base.p1) <= 2);
  const inte = R.shots.find((s) => s.shot === 'interior');
  const G5 = inte ? inte.diffs[a].px === 0 : null;
  const v = shipVerdict({ G1, G2, G3, G4: g4ok[a], G5 });
  verdicts[a] = { T1, T2, H1, v, ship: v.ship && H1 >= 3 };
  const st = (x) => guardState(x).padEnd(5);
  console.log(`${a}  ${T1}/4    ${T2}/4    ${H1}/4  | ${st(G1)} ${st(G2)} ${st(G3)} ${st(g4ok[a])} ${st(G5)} | ${verdicts[a].ship ? 'YES' : 'no'}`);
}

const winner = [...CAND].reverse().find((a) => verdicts[a].ship);
const runOk = shipVerdict({ I1: i1, I2: i2, I4: i4, candidate: winner ? true : false });
console.log(`\nSHIP RULE: largest pow with every one of G1,G2,G3,G4′,G5 = PASS, I1-I4/I5′/I6/I7 fired, and H1 >= 3/4.`);
console.log(`   ${verdictLine(runOk, winner ? `uSpecNormPow ${CANDPOW[winner]}` : '')}`);
if (!runOk.ship) console.log('   TUNE.specNormPow stays 0; the shipped build is bit-identical.');

/* The interval the run exists to produce, whether or not anything ships. */
const g4Cross = (() => {
  if (!sly?.g4?.scoreable) return null;
  let lo = null, hi = null;
  for (const a of CAND) { const m = sly.g4.med[a]; if (m === null) continue;
    if (m <= G4_BAR) lo = CANDPOW[a]; else if (hi === null) hi = CANDPOW[a]; }
  return { lastPass: lo, firstFail: hi };
})();
const h1Cross = (() => {
  let first = null;
  for (const a of CAND) {
    const H1 = OUT_SHOTS.filter((s) => (s.stats.base?.over230 ?? 1) <= H1_BASE_MAX && (s.stats[a]?.over230 ?? 0) >= H1_SHARE).length;
    if (H1 >= 3 && first === null) first = CANDPOW[a];
  }
  return first;
})();
console.log('\nTHE INTERVAL (the product of this run, ship or no ship):');
console.log(`   G4′ last PASS at p = ${g4Cross?.lastPass ?? '—'}, first FAIL at p = ${g4Cross?.firstFail ?? '—'}`);
console.log(`   H1 first reaches 3/4 at p = ${h1Cross ?? 'never in the swept set'}`);
if (g4Cross?.lastPass !== null && h1Cross !== null && g4Cross && h1Cross > g4Cross.lastPass)
  console.log(`   ==> energy conservation and the character conflict across p in (${g4Cross.lastPass}, ${h1Cross}]`);
else if (h1Cross !== null && g4Cross?.lastPass !== null && g4Cross && h1Cross <= g4Cross.lastPass)
  console.log(`   ==> NO conflict: H1 is met at p = ${h1Cross} while G4′ still passes. The forecast is wrong in the informative direction.`);

console.log('\nPER-CLASS (mode-4 masked architecture; a class under the floor is VOID, not a number):');
for (const s of R.shots) {
  if (!s.classes?.length) continue;
  console.log(`\n  ${s.shot}   resolved ${f2(s.resolvedPct)}% of toon`);
  console.log('  uSpec  glossP   satPx  state    p060   p070   p080   p090   p100   material');
  for (const c of s.classes) {
    if (!c.satPx) continue;
    const cell = (a) => (c.scoreable && c.rise[a] ? ((c.rise[a].p50 >= 0 ? '+' : '') + c.rise[a].p50.toFixed(1)).padStart(6) : '  VOID');
    console.log(`  ${c.uSpec.toFixed(3)} ${c.glossP.toFixed(1).padStart(7)} ${String(c.satPx).padStart(7)}  ${(c.scoreable ? 'ok' : 'VOID').padEnd(6)} ${CAND.map(cell).join(' ')}   ${c.name}`);
  }
}
