/**
 * fx9 — verification of the courtStackBudget family cap (ledger #13, decided by fx8).
 *
 * Pre-registered acceptance (written BEFORE these frames render, against fx8/fx5 pins):
 *   combat.full − combat.noshaft, roilift ROIs:
 *     left edge (0,28)-(150,355):  fx8 pinned +29.11  →  target <= 9.5
 *     doorway   (652,95)-(821,192): fx8 pinned +15.95  →  target <= 5.1  (cone ~1.1 stays)
 *   traversal.full − traversal.noshaft:
 *     the bottom-left beam blob must survive ~unchanged (fx5 pin: 33k px at mean +43,
 *     contrast sd RISING inside the bbox). Probe must report courtCap = 1.00 exactly —
 *     smoothN 1.38 < budget 2.0. Any cap below 1.0 here is a FAIL of the fail-safe claim.
 *   dunes.full − dunes.noshaft:
 *     accepted cost — the faint courtw haze (fx5: 1.13% of frame at mean +7.5) drops to
 *     roughly a quarter. Record, do not chase.
 *   combat probe must report courtCap ≈ 2.0/7.8 ≈ 0.26.
 *
 * Same dt-0 pair discipline as fx5/fx8 (clock frozen between variants of one shot).
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/shots/fx9';
const W = 1280, H = 720;

const APPLY = `(cfg) => {
  const E = window.__ENGINE, fx = E.get('fx');
  if (fx?.shafts?.mesh) fx.shafts.mesh.visible = cfg.shafts !== false;
  return 'shafts=' + (fx?.shafts?.mesh?.visible ?? 'n/a');
}`;

const PROBE = `() => {
  const E = window.__ENGINE, fx = E.get('fx'), L = E.get('lighting');
  const A = L?.atmosphere;
  return {
    time: +E.time.toFixed(4), frame: E.frame,
    courtCap: fx?._courtCap === undefined ? null : +fx._courtCap.toFixed(3),
    tod: A ? +A.tod.toFixed(3) : null,
    court: (L?.shafts ?? []).filter(s => s.family === 'court' && (s.intensity ?? 0) > 0.012)
      .map(s => s.id + ':' + s.intensity.toFixed(2)).join(' '),
  };
}`;

const JOBS = [
  ['combat', 'full',      {}],
  ['combat', 'noshaft',   { shafts: false }],
  ['traversal', 'full',    {}],
  ['traversal', 'noshaft', { shafts: false }],
  ['dunes', 'full',       {}],
  ['dunes', 'noshaft',    { shafts: false }],
];

const res = await withGame({ width: W, height: H, quality: 'high', timeout: 2400000 }, async ({ page, info }) => {
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
      E.renderFrame(0);   // refresh half-res depth for the soft blades
      E.renderFrame(0);   // captured frame
      return { applied, probe: (0, eval)('(' + probeBody + ')')(), dataUrl: G.capture('image/png') };
    }, [shot, cfg, APPLY, PROBE, restage]);
    last = shot;
    await writeFile(path.join(OUT, `${shot}.${label}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    acc.jobs[`${shot}.${label}`] = { applied: r.applied, probe: r.probe };
    console.log(`--- ${shot} [${label}] ${((Date.now() - t0) / 1000) | 0}s t=${r.probe.time} f=${r.probe.frame} courtCap=${r.probe.courtCap} ${r.applied}`);
    if (r.probe.court) console.log(`    court: ${r.probe.court}`);
  }
  return acc;
});
await writeFile(path.join(OUT, 'fx9.json'), JSON.stringify(res, null, 1));
console.log('wrote ' + path.join(OUT, 'fx9.json'));
