/**
 * fx19 — bracket the screen-size ceiling for the sand fields (PREREG-puff.md).
 *
 * Attribution is DONE (§89.3): `sandLow` owns the compact central mass; `airMotes`/`dust` are
 * exactly zero; `shimmer` moves 4x the pixels and is a diffuse wash, not the object. This run
 * does not re-attribute — it brackets a ceiling value, two-sided, and ships nothing.
 *
 * The ceiling is applied by UNIFORM POKE. `uMaxSize` already exists per batch (Particles.js:1446)
 * and is 0 for everything but `air_motes`, so turning it on for the sand fields needs no code
 * change — which means a value gets verified before it is shipped rather than after.
 *
 * §89.2's leak is fixed here: restore-first reverts EVERY uniform this script can touch, from
 * originals captured once at boot, so `back` is a real control instead of a duplicate of the
 * last poke.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/shots/fx19';
const W = 1280, H = 720;

const APPLY = `(cfg) => {
  const E = window.__ENGINE, fx = E.get('fx');
  const seen = [];
  const st = (window.__fx19 ||= { orig: null });

  /* Capture the pristine per-batch uniform values ONCE, at first apply, so restore-first has
     something true to restore to. §89.2: the previous run reverted nothing and its control
     silently became a duplicate of the last state it had poked. */
  if (!st.orig) {
    st.orig = {};
    for (const [n, b] of fx.batches) {
      const u = b?.material?.uniforms;
      if (!u) continue;
      st.orig[n] = { maxSize: u.uMaxSize ? u.uMaxSize.value : null,
                     softness: u.uSoftness ? u.uSoftness.value : null };
    }
  }
  /* RESTORE-FIRST — unconditionally, every arm, every uniform this script can touch. */
  for (const [n, b] of fx.batches) {
    const u = b?.material?.uniforms, o = st.orig[n];
    if (!u || !o) continue;
    if (u.uMaxSize && o.maxSize !== null) u.uMaxSize.value = o.maxSize;
    if (u.uSoftness && o.softness !== null) u.uSoftness.value = o.softness;
    if (b.mesh) b.mesh.visible = true;
  }

  if (cfg.off) {
    const b = fx.batches.get(cfg.off);
    if (b?.mesh) { b.mesh.visible = false; seen.push('OFF ' + cfg.off); }
    else seen.push('!! no batch ' + cfg.off);
  }
  if (cfg.cap !== undefined) {
    /* sandLow + sandHigh only: same family, same exemption. 'shimmer' is deliberately NOT
       clamped — it is not the object, and clamping it would be a change with no evidence. */
    const hit = [];
    for (const n of ['sandLow', 'sandHigh']) {
      const u = fx.batches.get(n)?.material?.uniforms;
      if (u?.uMaxSize) { u.uMaxSize.value = cfg.cap; hit.push(n); }
    }
    seen.push('uMaxSize=' + cfg.cap + ' on [' + hit.join(',') + ']');
  }
  /* Attest the applied state by READING IT BACK rather than reporting what was intended. */
  const rb = [];
  for (const n of ['sandLow', 'sandHigh', 'shimmer']) {
    const u = fx.batches.get(n)?.material?.uniforms;
    if (u?.uMaxSize) rb.push(n + ':' + u.uMaxSize.value);
  }
  seen.push('readback[' + rb.join(' ') + ']');
  return seen.join('  ') || 'baseline';
}`;

const PROBE = `() => {
  const E = window.__ENGINE, fx = E.get('fx');
  const out = { time: +E.time.toFixed(4), frame: E.frame, batches: {} };
  for (const [n, b] of fx.batches) {
    const u = b?.material?.uniforms;
    out.batches[n] = { live: b._used ?? b.count ?? -1, vis: !!b.mesh?.visible,
      maxSize: u?.uMaxSize ? u.uMaxSize.value : null };
  }
  return out;
}`;

const JOBS = [
  ['sly-profile', 'base',       {}],
  ['sly-profile', 'no-sandLow', { off: 'sandLow' }],   // reference: total removal
  ['sly-profile', 'cap120',     { cap: 0.120 }],
  ['sly-profile', 'cap085',     { cap: 0.085 }],
  ['sly-profile', 'cap055',     { cap: 0.055 }],
  ['sly-profile', 'back',       {}],                   // MUST be bit-identical to base
  /* §84.4: supply the frame the pink disc needs. */
  ['temple',      'base',       {}],
];

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
    console.log(`\n--- ${shot} [${label}]  ${((Date.now() - t0) / 1000) | 0}s  t=${r.probe.time} -> ${file}`);
    console.log(`    applied: ${r.applied}`);
    console.log(`    live: ${Object.entries(r.probe.batches).map(([k, v]) => `${k}=${v.live}${v.vis ? '' : '(hidden)'}${v.maxSize ? '@' + v.maxSize : ''}`).join(' ')}`);
  }
  return acc;
});
await writeFile(path.join(OUT, 'fx19.json'), JSON.stringify(res, null, 1));
console.log('\nfx19 DONE — wrote ' + path.join(OUT, 'fx19.json'));
