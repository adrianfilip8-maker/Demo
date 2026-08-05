/**
 * fx22 — candidate 1 (backdrop-conditioned suppression) against the registered acceptance
 * A1.3 D1–D4, plus the threshold verification §148.3 requires BEFORE D2 is scoreable.
 *
 * The gate is a UNIFORM, not a `#define` (see the patch note): one program, one binary, so a
 * D1 null cannot be the compiler. Every base/gated pair below is therefore the same compiled
 * program with `uGate.x` flipped, dt-0, on one staging per shot.
 *
 * Shots chosen for what they can falsify, not for coverage:
 *   temple            the artefact itself (D2/D3)
 *   hero/dunes/courtyard   daylight exteriors — §145.2 says they contain no dark-blue surface
 *                     class at all, so these are the D1 bit-identity population
 *   night/interior    the FALSE-POSITIVE risk. Both are full of dark blue. If the gate is a
 *                     proxy that has drifted off the mechanism, it over-fires HERE, and D4 is
 *                     what catches it. Including only exteriors would have made D1 easy and
 *                     the run uninformative.
 *
 * THRESHOLD VERIFICATION (§148.3, and the units error this ledger keeps recording): the
 * registered numbers — backdrop luma 44.4 / R/B 0.13 at the disc, 76.6 / 0.66 at the
 * non-artefact — were measured on the FINAL GRADED PNG. The shader samples pre-grade scene
 * colour. Those are different quantities and must not be compared as if they were the same.
 * So the probe reports, at both registered component centres:
 *   - the raw backdrop texel as stored (bytes, and the RT's colorSpace/type, so the encoding
 *     is recorded rather than assumed);
 *   - the shader's own computation, reproduced line for line (enc, bl, rb, wl, wr, factor).
 * The decisive check is NOT "does it equal 44.4" — it is whether the classifier lands on the
 * right side at each centre: fires at the disc, exactly zero at (520,581). If the sampled
 * value is nowhere near the anchor AND the classifier misclassifies, the transform is wrong
 * and D2 is UNSCOREABLE — reported as that, never repaired by moving the threshold (§141.1).
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/shots/fx22';
const W = 1280, H = 720;

const APPLY = `(cfg) => {
  const fx = window.__ENGINE.get('fx');
  const seen = [];
  for (const [, b] of fx.batches) {
    const u = b?.material?.uniforms?.uGate;
    if (u) u.value.x = cfg.gate ? 1 : 0;
  }
  seen.push('gate=' + (cfg.gate ? 'ON' : 'OFF'));
  return seen.join(' ');
}`;

/* Reproduces the fragment shader's gate arithmetic on the CPU at the two registered centres,
   reading the very texels the shader reads. */
const PROBE = `() => {
  const E = window.__ENGINE, fx = E.get('fx'), T = window.__GAME.THREE;
  const out = { time: +E.time.toFixed(4), frame: E.frame, gate: {}, centres: {} };

  const anyMat = [...fx.batches.values()].find((b) => b?.material?.uniforms?.uGate)?.material;
  if (anyMat) {
    const g = anyMat.uniforms.uGate.value, g2 = anyMat.uniforms.uGate2.value;
    out.gate = { on: g.x, lumaMax: g.y, rbMax: g.z, lumaSoft: g.w, rbSoft: g2.x, min: g2.y };
  }

  const rt = fx.backdropRT;
  out.backdropRT = rt ? { w: rt.width, h: rt.height, type: rt.texture.type,
    colorSpace: rt.texture.colorSpace, bound: !!fx.shared.backdrop.value } : null;

  if (rt) {
    const buf = new Uint8Array(4);
    /* The two registered component centres, in FULL-RES frame pixels. The backdrop RT is
       quarter-res, and the shader samples it with gl_FragCoord * uInvRes — i.e. normalised —
       so the same normalised coordinate maps to (x>>2, y>>2) here. Y is flipped because
       readRenderTargetPixels origin is bottom-left. */
    for (const [name, fx_, fy_] of [['disc', 602, 133], ['nonartefact', 520, 581]]) {
      const sx = Math.min(rt.width - 1, fx_ >> 2);
      const sy = Math.min(rt.height - 1, (${H} - 1 - fy_) >> 2);
      try {
        E.renderer.readRenderTargetPixels(rt, sx, sy, 1, 1, buf);
        const r = buf[0] / 255, g = buf[1] / 255, b = buf[2] / 255;
        // the shader, line for line
        const bmax = Math.max(r, Math.max(g, b));
        const encR = Math.pow(Math.min(Math.max(r,0),1), 1/2.2) * 255;
        const encG = Math.pow(Math.min(Math.max(g,0),1), 1/2.2) * 255;
        const encB = Math.pow(Math.min(Math.max(b,0),1), 1/2.2) * 255;
        const bl = 0.2126*encR + 0.7152*encG + 0.0722*encB;
        const rb = encB > 0.5 ? encR / encB : 999;
        const ss = (e0, e1, x) => { const t = Math.min(Math.max((x-e0)/(e1-e0),0),1); return t*t*(3-2*t); };
        const G = out.gate;
        const wl = 1 - ss(G.lumaMax - G.lumaSoft, G.lumaMax, bl);
        const wr = 1 - ss(G.rbMax - G.rbSoft, G.rbMax, rb);
        const factor = 1 + (G.min - 1) * (wl * wr);
        out.centres[name] = { px: [fx_, fy_], rtpx: [sx, sy], raw: [buf[0], buf[1], buf[2]],
          bmax: +bmax.toFixed(4), enc: [+encR.toFixed(1), +encG.toFixed(1), +encB.toFixed(1)],
          bl: +bl.toFixed(2), rb: +rb.toFixed(3), wl: +wl.toFixed(4), wr: +wr.toFixed(4),
          factor: +factor.toFixed(4), fires: wl * wr > 0 };
      } catch (err) { out.centres[name] = { error: String(err && err.message || err) }; }
    }
  }
  const b = fx.batches.get('sandHigh');
  out.sandHigh = b ? { live: b._used ?? b.count ?? -1, vis: !!b.mesh?.visible } : null;
  return out;
}`;

const SHOTS = ['temple', 'hero', 'dunes', 'courtyard', 'night', 'interior'];
// §164: argv selects a subset so a chunk fits inside the observed rollback interval. Every
// registered comparison (base vs gated per shot; temple.back vs temple.base) stays within one
// boot because a chunk carries whole pairs and temple's control rides the temple chunk.
const FILTER = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const f of FILTER) if (!SHOTS.includes(f)) { console.error(`unknown shot: ${f}`); process.exit(2); }
const RUN_SHOTS = FILTER.length ? SHOTS.filter((s) => FILTER.includes(s)) : SHOTS;
const JOBS = [];
for (const s of RUN_SHOTS) { JOBS.push([s, 'base', { gate: false }]); JOBS.push([s, 'gated', { gate: true }]); }
if (RUN_SHOTS.includes('temple')) JOBS.push(['temple', 'back', { gate: false }]);  // restore control: must equal temple.base

const res = await withGame({ width: W, height: H, quality: 'high', timeout: 3000000 }, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);
  await mkdir(OUT, { recursive: true });
  const acc = { warnings: info.warnings, jobs: {} };
  let last = null;
  for (const [shot, label, cfg] of JOBS) {
    const t0 = Date.now();
    const restage = last !== shot;
    const r = await page.evaluate(async ([n, c, applyBody, probeBody, doStage]) => {
      const G = window.__GAME, E = window.__ENGINE;
      if (doStage) await G.setShot(n);
      const applied = (0, eval)('(' + applyBody + ')')(c);
      for (let i = 0; i < 3; i++) E.renderFrame(0);
      return { applied, probe: (0, eval)('(' + probeBody + ')')(), dataUrl: G.capture('image/png') };
    }, [shot, cfg, APPLY, PROBE, restage]);
    last = shot;
    const file = path.join(OUT, `${shot}.${label}.png`);
    await writeFile(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    acc.jobs[`${shot}.${label}`] = { applied: r.applied, probe: r.probe };
    const p = r.probe;
    console.log(`\n--- ${shot} [${label}]  ${((Date.now() - t0) / 1000) | 0}s -> ${file}`);
    console.log(`    ${r.applied}  sandHigh=${JSON.stringify(p.sandHigh)}  rt=${JSON.stringify(p.backdropRT)}`);
    for (const [k, v] of Object.entries(p.centres || {})) {
      console.log(`    centre ${k}: raw ${JSON.stringify(v.raw)} enc ${JSON.stringify(v.enc)} ` +
        `bl=${v.bl} rb=${v.rb} wl=${v.wl} wr=${v.wr} factor=${v.factor} fires=${v.fires}`);
    }
  }
  return acc;
});
// §164: chunks accumulate — merge into any existing fx22.json so the scorer's contract
// (one file, all jobs) holds once the last chunk lands.
const jf = path.join(OUT, 'fx22.json');
let merged = res;
try {
  const prev = JSON.parse(await readFile(jf, 'utf8'));
  merged = { warnings: [...new Set([...(prev.warnings || []), ...res.warnings])],
             jobs: { ...prev.jobs, ...res.jobs } };
} catch { /* first chunk */ }
await writeFile(jf, JSON.stringify(merged, null, 1));
console.log(`\nfx22 DONE — wrote ${jf} (${Object.keys(merged.jobs).length} jobs total, ` +
  `this chunk: ${RUN_SHOTS.join('+')})`);
