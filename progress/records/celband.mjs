/**
 * celband — the one-boot sweep that settles TUNE.shadeBand.
 *
 * Acceptance is registered in progress/records/PREREG-celband.md §9, BEFORE this ran. Nothing
 * here chooses a value; it produces the frames that the registered rule is applied to, plus the
 * three controls that decide whether those frames mean anything.
 *
 * ── ARMS, in capture order. The order is the design. ──────────────────────────────────────
 *   base-a    uShadeBand 0 — the shipped build, since the default is a bit-identical no-op
 *   sb15/30/45/60                                                          the candidate sweep
 *   base-b    uShadeBand 0 again, LAST
 *
 * base-a and base-b bracket the whole sweep, so their difference is the capture-to-capture
 * drift floor across the entire run (§220). Every claim about a candidate has to clear it.
 *
 * THREE THINGS MUST FIRE or the run is void:
 *   NULL     base-a vs base-b must be SMALL. It is the floor everything else is quoted against.
 *   LEVER    sb60 vs base-a must be LARGE — larger than the null. §210.2 killed a whole run on
 *            `setRampTuning`, a knob that moved nothing; this is the arm that catches that
 *            shape of failure before a verdict is written, not after.
 *   IDENTITY base-a must be the SHIPPED build. It is, by construction: TUNE.shadeBand is 0 and
 *            the shader spells the term `1 - uShadeBand*(1-ramp)`, so at 0 it multiplies out to
 *            a literal 1.0. The null arm doubles as the check.
 *
 * Both shots are captured: `temple` is the subject (97.5% cast-shadowed, where the ramp is
 * absent) and `courtyard` is the GUARD (31.8% key-lit, where the ramp already bands at 12-25x
 * its own control) — a fix for the first that wrecks the second is not a fix.
 *
 * Staging follows tealarm/§195: setShot ONCE per shot, then step(3, 0) + renderFrame(0) per arm,
 * so the world clock never advances between arms and §218's "step(n,0) does not render" cannot
 * bite. Takes the capture lock for its whole duration.
 *
 *   node progress/records/celband.mjs
 */
import { withGame } from '../../tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.env.SANDS_OUT || 'shots/celband';
const SWEEP = [0.15, 0.30, 0.45, 0.60];
const SHOTS = ['temple', 'courtyard'];

mkdirSync(OUT, { recursive: true });

const res = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 2400000 }, async ({ page }) => {
  const log = [];

  for (const shot of SHOTS) {
    await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, shot);

    const arms = [['base-a', 0], ...SWEEP.map((v) => [`sb${String(Math.round(v * 100)).padStart(2, '0')}`, v]), ['base-b', 0]];

    for (const [tag, v] of arms) {
      const r = await page.evaluate(async (val) => {
        const eng = window.__ENGINE;
        const sh = eng.get('shading');
        const u = sh?.uniforms?.uShadeBand;
        if (!u) return { err: 'uShadeBand uniform is absent — the lever does not exist' };
        u.value = val;
        await window.__GAME.step(3, 0);
        eng.renderFrame(0);
        /* Read the uniform back AFTER the step and the render, never before (the uRimGain trap
           at ToonMaterial TUNE.rimGain: a per-frame republish silently reverts a poke). */
        const readback = sh.uniforms.uShadeBand.value;
        return { readback, dataUrl: window.__GAME.capture('image/png', 1, 0) };
      }, v);

      if (r.err) throw new Error(r.err);
      if (r.readback !== v) throw new Error(`uShadeBand readback ${r.readback} != requested ${v} — the poke did not survive the step`);
      const file = `${OUT}/${shot}-${tag}.png`;
      writeFileSync(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      log.push({ shot, tag, value: v, readback: r.readback, file });
      process.stdout.write(`  captured ${file}  (uShadeBand readback ${r.readback})\n`);
    }
  }
  return log;
});

writeFileSync(`${OUT}/arms.json`, JSON.stringify(res, null, 2));
console.log(`\n${res.length} frames written to ${OUT}/`);
