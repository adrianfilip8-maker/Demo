/**
 * rampwire3 — is it the SHARED uniform block, or is the toon shader not running at all?
 *
 * Established: writing `uTermHi` persists (0.52 -> 0.95, survives a setShot) and the frame is
 * BYTE-IDENTICAL (0 / 230400 px). So the ramp lever does not reach the shader.
 *
 * `setRampTuning` writes through TWO different paths, and that is the discriminator:
 *   · `lo`/`hi`  -> `this.uniforms.uTermLo/uTermHi`  — the SHARED block, Object.assign'd by
 *                   reference into every material's shader.uniforms at onBeforeCompile.
 *   · `soft`     -> walks `this._cache` and writes `m.userData.slyUniforms.uTermSoft` — the
 *                   PER-MATERIAL `own` bag, which is a different object per material.
 *
 * Both are read by the same GLSL line (toon.glsl.js:174,
 * `smoothstep( t - uTermSoft, t + uTermSoft, x )`), so if one moves the frame and the other does
 * not, the shader is certainly running and the fault is isolated to the shared block. If NEITHER
 * moves it, the patched program is not what is drawing these pixels at all — a much bigger problem.
 *
 * A third arm pokes a shared uniform that is not the ramp (`uInkNight`, via `setInkNight`) to check
 * whether the shared block is dead in general or just for the ramp terms.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';

const OUT = '/home/user/Demo/progress/records/rampwire3';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 640, height: 360, quality: 'high', timeout: 25 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);

  const grab = async (tag) => {
    const d = await page.evaluate(async () => {
      const G = window.__GAME;
      await G.step(4, 0); G.capture('image/png'); await G.step(1, 0);
      return G.capture('image/png');
    });
    await writeFile(`${OUT}/${tag}.png`, Buffer.from(d.split(',')[1], 'base64'));
    return PNG.sync.read(Buffer.from(d.split(',')[1], 'base64'));
  };
  const diff = (a, b) => {
    let n = 0, mx = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > 3) n++;
      if (d > mx) mx = d;
    }
    return { n, pct: 100 * n / (a.width * a.height), mx };
  };

  await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); await window.__GAME.step(8, 0); });
  const base = await grab('base');

  /* ARM 1 — SHARED block, ramp term */
  await page.evaluate(async () => { window.__ENGINE.get('shading').setRampTuning({ hi: 0.95 }); await window.__GAME.step(4, 0); });
  const dHi = diff(base, await grab('hi095'));
  await page.evaluate(async () => { window.__ENGINE.get('shading').setRampTuning({ hi: 0.52 }); await window.__GAME.step(4, 0); });

  /* ARM 2 — PER-MATERIAL bag, read by the SAME GLSL line */
  const softInfo = await page.evaluate(async () => {
    const sh = window.__ENGINE.get('shading');
    sh.setRampTuning({ soft: 0.30 });
    await window.__GAME.step(4, 0);
    let n = 0, sample = null;
    for (const m of sh._cache.values()) {
      const u = m.userData?.slyUniforms;
      if (u?.uTermSoft) { n++; if (sample === null) sample = u.uTermSoft.value; }
    }
    return { cacheSize: sh._cache.size, withSoft: n, sample };
  });
  const dSoft = diff(base, await grab('soft030'));
  await page.evaluate(async () => { window.__ENGINE.get('shading').setRampTuning({ soft: 0.024 }); await window.__GAME.step(4, 0); });

  /* ARM 3 — a DIFFERENT shared uniform, to see if the block is dead in general */
  const inkInfo = await page.evaluate(async () => {
    const sh = window.__ENGINE.get('shading');
    if (typeof sh.setInkNight !== 'function') return 'no setInkNight';
    sh.setInkNight(1);
    await window.__GAME.step(4, 0);
    return 'poked';
  });
  const dInk = diff(base, await grab('inknight'));

  log('');
  log(`material cache: ${softInfo.cacheSize} materials, ${softInfo.withSoft} carry uTermSoft, sample value now ${softInfo.sample}`);
  log('');
  log(`ARM 1  SHARED  uTermHi 0.52 -> 0.95   : ${dHi.n} px (${dHi.pct.toFixed(2)}%)  max ${dHi.mx}`);
  log(`ARM 2  PER-MAT uTermSoft 0.024 -> 0.30: ${dSoft.n} px (${dSoft.pct.toFixed(2)}%)  max ${dSoft.mx}`);
  log(`ARM 3  SHARED  setInkNight(1) [${inkInfo}]  : ${dInk.n} px (${dInk.pct.toFixed(2)}%)  max ${dInk.mx}`);
  log('');
  if (dSoft.n > 500 && dHi.n === 0) {
    log('=> VERDICT: the toon shader IS running and reads uTermSoft. The SHARED uniform block');
    log('   does not reach it. Fault isolated to Object.assign(shader.uniforms, self.uniforms, own).');
  } else if (dSoft.n === 0 && dHi.n === 0) {
    log('=> VERDICT: NEITHER path moves the frame. The patched toon program is not drawing these');
    log('   pixels — a far bigger problem than a uniform-sharing bug.');
  } else {
    log('=> VERDICT: mixed/unexpected — read the numbers above, do not summarise them away.');
  }
  await writeFile(`${OUT}/result.json`, JSON.stringify({ dHi, dSoft, dInk, softInfo }, null, 2));
});
log('DONE');
