/**
 * §269 / PREREG-shadowhold.md — the A/B for the per-albedo shade band.
 *
 * One boot per shot, six arms per boot, `dt = 0` on every step (§251). Arms are exactly those
 * registered in PREREG-shadowhold.md §6 and are NOT re-ordered or re-named here:
 *
 *   A0 base        shipped constants
 *   A1 null        hold -> 1 -> 0. Must be BIT-IDENTICAL to A0 (repeatability + reversibility)
 *   A2 control     uNeutralShadow = 1. MUST FIRE: dunes ROI dh must move >= 20 deg, else VOID
 *   A3 candidate   uShadowHold = 1
 *   A4 candidate   uShadowHold = 0.6
 *   A5 attribution uShadowHold = 1 + uNeutralFill = 1 (how much residual is the fill)
 *
 * A1 is the null and A2 is the positive control. §255: a null alone proves nothing, because
 * black equals black — so A2 carries a registered magnitude it has to clear.
 *
 * Writes shots/<out>/<shot>-<arm>.png plus a sha256 per frame, so the A0/A1 bit-identity claim
 * is checkable rather than asserted. Scoring is done separately by scratchpad/hue/score.py,
 * the instrument frozen before the candidate existed.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/shold';
const SHOTS = (process.argv[2] || 'dunes,hero,interior').split(',');

mkdirSync(OUT, { recursive: true });

/** Every arm as {hold, neutralShadow, neutralFill} plus an optional pre-poke, applied fresh. */
const ALL = [
  { tag: 'A0-base',    pre: null, hold: null, ns: 0, nf: 0 },
  { tag: 'A1-null',    pre: 1,    hold: 0,    ns: 0, nf: 0 },
  { tag: 'A2-ctlgrey', pre: null, hold: 0,    ns: 1, nf: 0 },
  { tag: 'A3-hold1',   pre: null, hold: 1,    ns: 0, nf: 0 },
  { tag: 'A4-hold06',  pre: null, hold: 0.6,  ns: 0, nf: 0 },
  { tag: 'A5-nofill',  pre: null, hold: 1,    ns: 0, nf: 1 },
];
/* SANDS_ARMS selects a subset by tag prefix, so run 2 (the revised held branch, §269.4) can
   re-measure base + null + hold1 under the new code without re-paying for A2/A4/A5, whose
   questions run 1 already answered. The arm DEFINITIONS are untouched. */
const WANT = (process.env.SANDS_ARMS || '').split(',').filter(Boolean);
const ARMS = WANT.length ? ALL.filter((a) => WANT.some((w) => a.tag.startsWith(w))) : ALL;
if (WANT.length && ARMS.length !== WANT.length) throw new Error(`SANDS_ARMS matched ${ARMS.length} of ${WANT.length}`);

const results = [];
for (const shot of SHOTS) {
  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => {
      await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, shot);
      const out = [];
      for (const a of ARMS) {
        out.push(await page.evaluate(async (arm) => {
          const eng = window.__ENGINE;
          const u = eng.get('shading').uniforms;
          if (arm.pre !== null) u.uShadowHold.value = arm.pre;
          if (arm.hold !== null) u.uShadowHold.value = arm.hold;
          u.uNeutralShadow.value = arm.ns;
          u.uNeutralFill.value = arm.nf;
          await window.__GAME.step(3, 0);
          eng.renderFrame(0);
          const src = eng.canvas;
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          return {
            tag: arm.tag,
            applied: { hold: u.uShadowHold.value, knee: u.uShadowHoldKnee.value,
                       ns: u.uNeutralShadow.value, nf: u.uNeutralFill.value },
            png: c.toDataURL('image/png'),
          };
        }, a));
      }
      return out;
    });

  for (const r of got) {
    const buf = Buffer.from(r.png.split(',')[1], 'base64');
    const file = `${OUT}/${shot}-${r.tag}.png`;
    writeFileSync(file, buf);
    const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    results.push({ shot, arm: r.tag, file, sha, applied: r.applied });
    console.log(`${shot.padEnd(9)} ${r.tag.padEnd(11)} hold=${String(r.applied.hold).padEnd(4)} ` +
                `ns=${r.applied.ns} nf=${r.applied.nf}  sha=${sha}`);
  }
}

writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));

/* A1 must be bit-identical to A0, per shot. Reported here; gated in the scorer. */
for (const shot of SHOTS) {
  const a0 = results.find((r) => r.shot === shot && r.arm === 'A0-base');
  const a1 = results.find((r) => r.shot === shot && r.arm === 'A1-null');
  console.log(`NULL ${shot}: A0 ${a0?.sha} vs A1 ${a1?.sha} -> ` +
              (a0 && a1 ? (a0.sha === a1.sha ? 'IDENTICAL' : 'DIFFERS') : 'MISSING'));
}
