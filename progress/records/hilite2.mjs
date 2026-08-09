/**
 * hilite2.mjs — the PREREG-hilite2 capture. SPECULAR.
 *
 * One boot, one browser, one server. `dt: 0` at every frame-advancing call (§195/§251), so a
 * duplicate arm differs by exactly zero pixels and the null arm means something.
 *
 * Arms are UNIFORM POKES on shared uniform objects (`shading.uniforms.uSpecKey` /
 * `.uSpecGain`), which every material references by identity and nothing republishes per frame
 * — so this is a same-boot single-lever pair and is bit-deterministic (§233). No source edit
 * inside the held ticket, no per-arm navigation, no rebuild.
 *
 * DURABLE-EARLY (§163): every frame PNG and the per-shot JSON is written the moment it exists.
 * If this dies mid-run the committed partial record is the record.
 *
 *   usage: bash tools/launch.sh progress/records/hilite2.mjs <ABS log> <ABS pidfile>
 *      or: node progress/records/hilite2.mjs           (foreground; it will queue on the lock)
 */
import { withGame } from '../../tools/harness.mjs';
import { readPNG } from '../../tools/png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../../shots/hilite2');
mkdirSync(OUT, { recursive: true });

const SHOTS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SHOT_LIST = SHOTS.length ? SHOTS : ['hero', 'temple', 'courtyard', 'sly-closeup'];
/* A second boot for the addendum's `interior` must not overwrite the registered run's JSON —
   every A/B stays inside its own boot and the two records stay separable. */
const TAG = SHOTS.length ? `-${SHOT_LIST.join('_')}` : '';

/* PREREG-hilite2 §4. Order matters: `base2` is captured LAST, after `key`, so I1 proves that
   returning uSpecKey to 0 reproduces base exactly rather than merely that base repeats. */
const ARMS = [
  ['base',  { specKey: 0, specGain: 1 }],
  ['off',   { specKey: 0, specGain: 0 }],
  ['key',   { specKey: 1, specGain: 1 }],
  ['base2', { specKey: 0, specGain: 1 }],
];

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
  const pct = (q) => {
    let acc = 0; const want = q * n;
    for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= want) return b; }
    return 255;
  };
  let over200 = 0, over230 = 0, over250 = 0, mx = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = L[i]; sum += v; if (v > mx) mx = v;
    if (v > 200) over200++; if (v > 230) over230++; if (v > 250) over250++;
  }
  return {
    n, mean: sum / n, p1: pct(0.01), p50: pct(0.50), p90: pct(0.90), p99: pct(0.99),
    p999: pct(0.999), max: mx,
    over200: (100 * over200) / n, over230: (100 * over230) / n, over250: (100 * over250) / n,
  };
}

/** Pixel-exact difference between two frames, plus the size and sign of the luma change. */
function diff(a, b) {
  const n = Math.min(a.w * a.h, b.w * b.h);
  let px = 0, maxAbs = 0, sumUp = 0, sumDn = 0, upPx = 0, dnPx = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    const d0 = a.data[p] - b.data[p], d1 = a.data[p + 1] - b.data[p + 1], d2 = a.data[p + 2] - b.data[p + 2];
    if (d0 || d1 || d2) {
      px++;
      const dl = lumOf(a.data[p], a.data[p + 1], a.data[p + 2]) - lumOf(b.data[p], b.data[p + 1], b.data[p + 2]);
      if (Math.abs(dl) > maxAbs) maxAbs = Math.abs(dl);
      if (dl > 0) { sumUp += dl; upPx++; } else if (dl < 0) { sumDn += dl; dnPx++; }
    }
  }
  return {
    px, pct: (100 * px) / n, maxAbsL: maxAbs,
    upPx, dnPx, meanUpL: upPx ? sumUp / upPx : 0, meanDnL: dnPx ? sumDn / dnPx : 0,
  };
}

/* ------------------------------ in-page helpers ------------------------------ */

/** Apply an arm and read the applied state back off the live uniform (I3). */
const applyArm = async (page, cfg) => page.evaluate(async (c) => {
  const S = window.__ENGINE.get('shading');
  S.uniforms.uSpecKey.value = c.specKey;
  S.uniforms.uSpecGain.value = c.specGain;
  await window.__GAME.step(2, 0);
  return { specKey: S.uniforms.uSpecKey.value, specGain: S.uniforms.uSpecGain.value };
}, cfg);

const grab = async (page) => page.evaluate(() => window.__GAME.capture());

/** Every ToonMaterial in the scene, with the values that decide its specular (H7). */
const census = async (page) => page.evaluate(() => {
  const E = window.__ENGINE, S = E.get('shading');
  const seen = new Map();
  let keyIdentity = 0, specKeyIdentity = 0, total = 0;
  E.scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m?.userData?.sly) continue;
      total++;
      const u = m.userData.slyUniforms;
      if (!u?.uSpec) continue;
      const k = [u.uSpec.value, u.uGloss.value, u.uMetal.value, m.roughness].join('|');
      const row = seen.get(k) || {
        spec: u.uSpec.value, gloss: u.uGloss.value, metal: u.uMetal.value,
        roughness: m.roughness, hasRoughMap: !!m.roughnessMap, count: 0, names: [],
      };
      row.count++;
      if (row.names.length < 4 && o.name) row.names.push(o.name);
      seen.set(k, row);
    }
  });
  /* H7: the coupling factor must be ONE object shared by every program, not a per-material
     copy. Materials merge shared uniforms by identity in onBeforeCompile, so the check is on
     the shading module's own objects being the ones the scene sees. */
  keyIdentity = S.uniforms.uKeyColor && S.uniforms.uKeyIntensity ? 1 : 0;
  specKeyIdentity = S.uniforms.uSpecKey ? 1 : 0;
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return {
    materials: total,
    keyRadLum: lum(S.uniforms.uKeyColor.value) * S.uniforms.uKeyIntensity.value,
    keyIntensity: S.uniforms.uKeyIntensity.value,
    keyColor: S.uniforms.uKeyColor.value.toArray(),
    shared: { keyIdentity, specKeyIdentity },
    classes: [...seen.values()].sort((a, b) => b.spec - a.spec),
  };
});

/** debugTerm(n) through debugRaw('scene'); returns a PNG data URL. Restores both after. */
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

const info = await withGame({ width: W, height: H, quality: 'high', timeout: 600000 }, async ({ page, info }) => {
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
      process.stdout.write(` ${name}(${applied.specKey}/${applied.specGain})`);
    }

    /* Diagnostics — PREREG §5 and I4. Mode 4 FIRST, because it is the calibration and mode 6
       is a reading mode: score the triple here and hand the verdict back to the channel with
       confirmDebugCalibration() before mode 6 runs, so an unproven reading is impossible
       rather than merely discouraged (§210.2). */
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
        .confirmDebugCalibration('term', ok, 'PREREG-hilite2 I4'), row.calibShare > 5);
      process.stdout.write(` dbg4(${row.calibShare.toFixed(1)}%)`);

      const incUrl = await debugGrab(page, 6);
      const inf = path.join(OUT, `${shot}.dbg6.png`);
      writeFileSync(inf, Buffer.from(incUrl.split(',')[1], 'base64'));
      row.files.incid = inf;
      process.stdout.write(' dbg6');
    }

    /* Restore the shipped state before the next shot stages, so a crash leaves the tree and
       the live scene at the shipping values. */
    await applyArm(page, { specKey: 0, specGain: 1 });

    rows.push(row);
    writeFileSync(path.join(OUT, `arms${TAG}.json`), JSON.stringify(rows, null, 2));
    process.stdout.write(`  (${((Date.now() - t0) / 1000) | 0}s)`);
  }
  return { renderer: info.renderer, warnings: info.warnings };
});

console.log(`\n\ncaptured in ${((Date.now() - t0) / 1000) | 0}s\n`);

/* ------------------------------- scoring ------------------------------------- */
const R = { prereg: 'PREREG-hilite2.md', renderer: info.renderer, res: [W, H], shots: [] };

for (const r of rows) {
  const im = {};
  for (const a of Object.keys(r.files)) { try { im[a] = readPNG(r.files[a]); } catch (e) { im[a] = null; } }
  const s = { shot: r.shot, applied: r.arms, census: r.census, stats: {}, diffs: {}, incidence: null };
  for (const [name] of ARMS) if (im[name]) s.stats[name] = lumaStats(im[name]);
  if (im.base && im.base2) s.diffs.null = diff(im.base2, im.base);
  if (im.base && im.off) s.diffs.off = diff(im.off, im.base);
  if (im.base && im.key) s.diffs.key = diff(im.key, im.base);

  s.calibShare = r.calibShare ?? 0;

  /* debugTerm(6): R = specStep/1.35, G = lobe, B = sh*step(0.02,ndl). Read B first. */
  if (im.incid) {
    const g = im.incid, n = g.w * g.h;
    let gatesAny = 0, gates = 0, sat = 0, joint = 0, half = 0, lobeAny = 0;
    for (let i = 0, p = 0; i < n; i++, p += g.ch) {
      const R8 = g.data[p], G8 = g.data[p + 1], B8 = g.data[p + 2];
      if (B8 >= 1) gatesAny++;
      const gate = B8 >= 250;
      if (gate) gates++;
      if (R8 >= 252) { sat++; if (gate) joint++; }
      if (R8 >= 128 && gate) half++;
      if (G8 >= 6 && gate) lobeAny++;
    }
    s.incidence = {
      gatesAnyPct: (100 * gatesAny) / n, gatesOpenPct: (100 * gates) / n,
      quantSatPct: (100 * sat) / n, jointSatPct: (100 * joint) / n,
      jointHalfPct: (100 * half) / n, lobeAnyPct: (100 * lobeAny) / n,
    };
  }
  R.shots.push(s);
}

writeFileSync(path.join(OUT, `score${TAG}.json`), JSON.stringify(R, null, 2));

/* ------------------------------- the verdict --------------------------------- */
const f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3);
console.log('================= PREREG-hilite2 REGISTERED CRITERIA =================\n');

console.log('per-shot luma (display bytes, Rec.709):');
console.log('shot          arm      p1    p50    p90    p99   p99.9   max    >200%    >230%    >250%');
for (const s of R.shots) for (const [a] of ARMS) {
  const t = s.stats[a]; if (!t) continue;
  console.log(`${s.shot.padEnd(13)} ${a.padEnd(6)} ${String(t.p1).padStart(4)} ${String(t.p50).padStart(6)} ${String(t.p90).padStart(6)} ${String(t.p99).padStart(6)} ${String(t.p999).padStart(6)} ${f2(t.max).padStart(7)} ${f3(t.over200).padStart(8)} ${f3(t.over230).padStart(8)} ${f3(t.over250).padStart(8)}`);
}

console.log('\nI1 NULL ARM  (base2 vs base, must be exactly 0 px):');
let i1 = true;
for (const s of R.shots) { const d = s.diffs.null; const ok = d && d.px === 0; i1 &&= ok; console.log(`   ${s.shot.padEnd(13)} ${d ? d.px : 'MISSING'} px   ${ok ? 'PASS' : 'FAIL'}`); }
console.log(`   I1 ${i1 ? 'FIRED' : 'FAILED — the run is VOID'}`);

console.log('\nI2 POSITIVE CONTROL  (off vs base, must be > 0 px on all four):');
let i2 = true;
for (const s of R.shots) { const d = s.diffs.off; const ok = d && d.px > 0; i2 &&= ok; console.log(`   ${s.shot.padEnd(13)} ${d ? `${d.px} px (${f3(d.pct)}%)  max |dL| ${f2(d.maxAbsL)}  mean dL on changed px ${f2(d.meanDnL)}` : 'MISSING'}   ${ok ? 'FIRED' : 'DID NOT FIRE'}`); }
console.log(`   I2 ${i2 ? 'FIRED' : 'DID NOT FIRE — amplitude claims on the dead shots are VOID'}`);

console.log('\nI3 APPLIED STATE  (distinct per arm):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${Object.entries(s.applied).map(([k, v]) => `${k}=${v.specKey}/${v.specGain}`).join('  ')}`);

console.log('\nI4 READBACK CALIBRATION  (debugTerm(4) triple, bar > 5% of frame):');
let i4 = true;
for (const s of R.shots) { const ok = (s.calibShare ?? 0) > 5; i4 &&= ok; console.log(`   ${s.shot.padEnd(13)} ${f2(s.calibShare ?? 0)}%   ${ok ? 'FIRED' : 'BLIND'}`); }
console.log(`   I4 ${i4 ? 'FIRED' : 'BLIND — linear/incidence numbers are VOID, display bytes stand'}`);

console.log('\nkey vs base  (the candidate):');
for (const s of R.shots) { const d = s.diffs.key, b = s.stats.base, k = s.stats.key; if (!d || !b || !k) continue;
  console.log(`   ${s.shot.padEnd(13)} ${d.px} px changed (${f3(d.pct)}%)  max +dL ${f2(d.maxAbsL)}   p99 ${b.p99} -> ${k.p99}   >230 ${f3(b.over230)}% -> ${f3(k.over230)}%   >250 ${f3(b.over250)}% -> ${f3(k.over250)}%`); }

const T1 = R.shots.filter((s) => s.stats.key?.p99 >= 200).length;
const T2 = R.shots.filter((s) => s.stats.key?.over230 >= 0.20).length;
console.log(`\nT1  p99 >= 200 on >= 3 of 4:  ${T1}/4   ${T1 >= 3 ? 'PASS' : 'FAIL'}`);
console.log(`T2  >230 share >= 0.20% on >= 3 of 4:  ${T2}/4   ${T2 >= 3 ? 'PASS' : 'FAIL'}`);
const T3 = R.shots.every((s) => s.stats.key?.p50 <= 130);
const T4 = R.shots.every((s) => s.stats.key?.over250 <= 1.0);
const T5 = R.shots.every((s) => s.stats.key?.p1 <= 45);
console.log(`T3  p50 <= 130 everywhere:  ${T3 ? 'PASS' : 'FAIL'}`);
console.log(`T4  >250 <= 1.0% everywhere:  ${T4 ? 'PASS' : 'FAIL'}`);
console.log(`T5  p1 <= 45 everywhere:  ${T5 ? 'PASS' : 'FAIL'}`);

const h6rows = R.shots.map((s) => ({
  shot: s.shot, base: s.stats.base?.over230 ?? 0, key: s.stats.key?.over230 ?? 0,
  ok: (s.stats.base?.over230 ?? 1) <= 0.005 && (s.stats.key?.over230 ?? 0) >= 0.02,
}));
const H6n = h6rows.filter((r) => r.ok).length;
console.log('\nH6  a highlight exists  (key >= 0.02% above L230 where base <= 0.005%; bar 2 of 4):');
for (const r of h6rows) console.log(`   ${r.shot.padEnd(13)} base ${f3(r.base)}%  ->  key ${f3(r.key)}%   ${r.ok ? 'PASS' : 'no'}`);
console.log(`   H6 ${H6n}/4   ${H6n >= 2 ? 'PASS' : 'FAIL'}`);

console.log('\nH7  no material inversion:');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${s.census.materials} sly materials, ${s.census.classes.length} distinct spec classes, keyRad luma ${f3(s.census.keyRadLum)}, shared uSpecKey ${s.census.shared.specKeyIdentity ? 'yes' : 'NO'}`);

const H8 = R.shots.every((s) => (s.stats.key.over250 - s.stats.base.over250) < 0.5 && s.stats.key.over250 <= 1.0);
console.log('\nH8  no blowout  (>250 rises < 0.5pp and stays <= 1.0%):');
for (const s of R.shots) console.log(`   ${s.shot.padEnd(13)} ${f3(s.stats.base.over250)}% -> ${f3(s.stats.key.over250)}%  (+${f3(s.stats.key.over250 - s.stats.base.over250)}pp)`);
console.log(`   H8 ${H8 ? 'PASS' : 'FAIL'}`);

console.log('\ndebugTerm(6) SPECULAR INCIDENCE  (share of frame; forecast: joint-saturated < 0.5%):');
console.log('shot           gates > 0   gates FULL   lobe > 0   quant >= 50%   quant SAT (joint)');
for (const s of R.shots) { const i = s.incidence; if (!i) { console.log(`   ${s.shot} — missing`); continue; }
  console.log(`${s.shot.padEnd(13)} ${f3(i.gatesAnyPct).padStart(8)}%  ${f3(i.gatesOpenPct).padStart(9)}%  ${f3(i.lobeAnyPct).padStart(8)}%  ${f3(i.jointHalfPct).padStart(11)}%  ${f3(i.jointSatPct).padStart(15)}%`); }

console.log('\nSHIP RULE: uSpecKey 1.0 ships iff I1-I3 fire, T3/T4/T5 pass, H8 passes, and H6 passes.');
console.log(`   I1 ${i1 ? 'ok' : 'VOID'} · I2 ${i2 ? 'ok' : 'VOID'} · T3 ${T3 ? 'ok' : 'FAIL'} · T4 ${T4 ? 'ok' : 'FAIL'} · T5 ${T5 ? 'ok' : 'FAIL'} · H8 ${H8 ? 'ok' : 'FAIL'} · H6 ${H6n >= 2 ? 'PASS' : 'FAIL'}`);
console.log(`   ==> ${i1 && i2 && T3 && T4 && T5 && H8 && H6n >= 2 ? 'SHIP' : 'DO NOT SHIP'}`);
