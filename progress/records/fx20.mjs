/**
 * fx20 — name the pool behind `temple`'s pink disc at (615,160).
 *
 * ── What is already established, and is NOT re-derived here ──────────────────────────────
 *  - Confirmed on frame; GEOMETRY raycast puts the architecture behind it at 26 m, so the
 *    disc is drawn IN FRONT of architecture.
 *  - NOT a depth-state bug: the only FX material with `depthTest:false` is `fx.depthCopy`,
 *    which renders offscreen into the depth RT in its own scene. Every main-frame FX material
 *    (`fx.shafts`, `fx.sparkle`, `fx.flames`, all batches) has `depthTest:true`. So it is a
 *    sprite genuinely nearer than 26 m.
 *  - Shape and softness say one large near-lens sprite; only `air_motes` carries a `maxSize`
 *    ceiling (`Particles.js:2012`), so an uncapped pool can present a large disc.
 *
 * This run answers the one remaining question — WHICH POOL — by hiding one at a time.
 *
 * ── Acceptance, registered before the frames exist ───────────────────────────────────────
 * The disc's own pixels are the subject. `DISC` below is centred on the reported (615,160).
 *   - The pool whose removal takes |mean ΔL| over DISC above 3.0 while the OTHER pools'
 *     removals leave it under 1.0 is named as the source.
 *   - If NO single pool clears 3.0, the disc is not a batch sprite: escalate to flames /
 *     sparkles / shafts (all of which this probe also counts) rather than guessing.
 *   - `back` must be bit-identical to `base` (zero differing px at any threshold), or every
 *     row above is void.
 *
 * ── The instrument defect this run fixes rather than files (§122.3) ──────────────────────
 * `fx19` cannot now settle retroactively whether its subject was present, because its probe
 * stamped neither `tod` nor the staged camera — so a null is indistinguishable from a
 * different framing. This probe stamps BOTH, plus a direct answer to "was the subject in the
 * picture": the disc ROI's own luma stats per job, so a null can be told apart from an
 * absence. That is the same "was the subject even in the frame" question that superseded a
 * scoring four hours old; it belongs in the instrument, not in the write-up.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/shots/fx20';
const W = 1280, H = 720;

const APPLY = `(cfg) => {
  const E = window.__ENGINE, fx = E.get('fx');
  const seen = [];
  /* restore-first, so each job is independent of the one before it */
  for (const [, b] of fx.batches) if (b?.mesh) b.mesh.visible = true;
  if (fx.sparkles?.mesh) fx.sparkles.mesh.visible = true;
  if (fx.flames?.mesh)   fx.flames.mesh.visible = true;
  if (fx.shafts?.mesh)   fx.shafts.mesh.visible = true;

  if (cfg.off) {
    const b = fx.batches.get(cfg.off);
    if (b?.mesh) { b.mesh.visible = false; seen.push('OFF batch ' + cfg.off); }
    else seen.push('!! NO BATCH NAMED ' + cfg.off);
  }
  if (cfg.offSystem) {
    const s = fx[cfg.offSystem];
    if (s?.mesh) { s.mesh.visible = false; seen.push('OFF system ' + cfg.offSystem); }
    else seen.push('!! NO SYSTEM ' + cfg.offSystem);
  }
  return seen.join(' ') || 'baseline';
}`;

const PROBE = `() => {
  const E = window.__ENGINE, fx = E.get('fx'), L = E.get('lighting'), T = window.__GAME.THREE;
  const A = L?.atmosphere, cam = E.camera;
  cam.updateMatrixWorld(true);
  const p = new T.Vector3(), q = new T.Quaternion(), d = new T.Vector3();
  cam.getWorldPosition(p); cam.getWorldQuaternion(q); cam.getWorldDirection(d);
  const out = {
    time: +E.time.toFixed(4), frame: E.frame,
    /* §122.3: stamp tod AND the staged camera, so a null can never again be confused with a
       different framing. */
    tod: A ? +A.tod.toFixed(4) : null,
    keyIsMoon: A ? !!A.keyIsMoon : null,
    cam: {
      pos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)],
      dir: [+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)],
      quat: [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)],
      fov: +cam.fov.toFixed(2), aspect: +cam.aspect.toFixed(4),
      near: cam.near, far: cam.far,
    },
    batches: {}, systems: {},
  };
  for (const [n, b] of fx.batches) {
    out.batches[n] = { live: b._used ?? b.count ?? -1, cap: b.capacity ?? -1, vis: !!b.mesh?.visible };
  }
  for (const n of ['sparkles', 'flames', 'shafts']) {
    const s = fx[n];
    if (s) out.systems[n] = { count: s.count ?? -1, vis: !!s.mesh?.visible };
  }
  return out;
}`;

const JOBS = [
  ['temple', 'base',        {}],
  ['temple', 'no-dust',     { off: 'dust' }],
  ['temple', 'no-smoke',    { off: 'smoke' }],
  ['temple', 'no-sandLow',  { off: 'sandLow' }],
  ['temple', 'no-sandHigh', { off: 'sandHigh' }],
  ['temple', 'no-airMotes', { off: 'air_motes' }],
  ['temple', 'no-shimmer',  { off: 'shimmer' }],
  ['temple', 'no-flames',   { offSystem: 'flames' }],
  ['temple', 'no-sparkles', { offSystem: 'sparkles' }],
  ['temple', 'back',        {}],
];

const res = await withGame({ width: W, height: H, quality: 'high', timeout: 2400000 }, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);
  await mkdir(OUT, { recursive: true });
  const acc = { warnings: info.warnings, jobs: {} };
  let staged = false;
  for (const [shot, label, cfg] of JOBS) {
    const t0 = Date.now();
    const doStage = !staged; staged = true;      // one staging; variants are dt-0 on it
    const r = await page.evaluate(async ([n, c, applyBody, probeBody, stage]) => {
      const G = window.__GAME, E = window.__ENGINE;
      if (stage) await G.setShot(n);
      const applied = (0, eval)('(' + applyBody + ')')(c);
      for (let i = 0; i < 3; i++) E.renderFrame(0);
      return { applied, probe: (0, eval)('(' + probeBody + ')')(), dataUrl: G.capture('image/png') };
    }, [shot, cfg, APPLY, PROBE, doStage]);
    const file = path.join(OUT, `${shot}.${label}.png`);
    await writeFile(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    acc.jobs[`${shot}.${label}`] = { applied: r.applied, probe: r.probe };
    const p = r.probe;
    console.log(`\n--- ${shot} [${label}]  ${((Date.now() - t0) / 1000) | 0}s  t=${p.time} f=${p.frame} -> ${file}`);
    console.log(`    applied: ${r.applied}`);
    console.log(`    tod=${p.tod} moon=${p.keyIsMoon} cam.pos=${JSON.stringify(p.cam.pos)} dir=${JSON.stringify(p.cam.dir)} fov=${p.cam.fov}`);
    console.log(`    batches: ${Object.entries(p.batches).map(([k, v]) => k + '=' + v.live + (v.vis ? '' : '(hidden)')).join(' ')}`);
    console.log(`    systems: ${Object.entries(p.systems).map(([k, v]) => k + '=' + v.count + (v.vis ? '' : '(hidden)')).join(' ')}`);
  }
  return acc;
});
await writeFile(path.join(OUT, 'fx20.json'), JSON.stringify(res, null, 1));
console.log('\nfx20 DONE — wrote ' + path.join(OUT, 'fx20.json'));
