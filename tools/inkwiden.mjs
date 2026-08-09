/**
 * §270 / PREREG-inkwiden.md — does giving the crease ink a VALUE range widen its distribution
 * without flattening the line?
 *
 * The defect, restated from a matched instrument (`progress/records/inkspread.mjs`): our ink
 * carries 54 % of the reference's dynamic range (p90/p10 4.06 against 7.57) and its floor sits at
 * 2.01x the reference's. The median is fine. So the target is RANGE, and a candidate that simply
 * darkens the line fails the design constraint even if it hits the floor.
 *
 * Five arms, one boot per shot, `dt = 0`, every lever page-side:
 *
 *   S-ship     shipped
 *   T1-colour  inkCool sized to display luma 0.0381, hue held at 260.00
 *   T2-gate    the dark gate relaxed to (0.02, 0.10)
 *   W-both     the candidate
 *   Z-noink    inkStrength = 0                          -> defines the mask
 *
 * `inkMask = { p : S != Z }` is the SHIPPED crease pass's own pixel set, and all four inked arms
 * are measured over that one fixed set. A candidate allowed to define its own population can
 * improve its number by shrinking it, which is §141.1 in spatial form.
 *
 * The per-term arms are not decoration. `progress/records/creasemodel.mjs` says T1 alone moves a
 * pixel on a 0.15 background from 0.0957 to 0.0702 and the pair moves it to 0.0429, so if T2
 * turns out to reopen the mush the gate was written to prevent, T1 is still shippable on its own
 * arm and the run says so.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/inkwiden';
/* Registered in PREREG-inkwiden.md §4 and chosen by mechanism: `night` is maximum exposure to the
   gate, `dunes` is the specificity control where the model predicts almost no change, `interior`
   and `temple` carry the largest shadow populations, `sly-closeup` has the tightest IQR in the
   set and is therefore most at risk of flattening rather than widening. */
const SHOTS = (process.argv[2] || 'interior,night,temple,sly-closeup,dunes').split(',');

mkdirSync(OUT, { recursive: true });

const SHIP_COOL = 0x161022;
const CAND_COOL = 0x0c0814;      // sized to display luma 0.0381; hue held at 260.00 exactly
const SHIP_GATE = [0.05, 0.20];
const CAND_GATE = [0.02, 0.10];

const ARMS = [
  { tag: 'S-ship',    cool: SHIP_COOL, gate: SHIP_GATE, strength: 0.95 },
  { tag: 'T1-colour', cool: CAND_COOL, gate: SHIP_GATE, strength: 0.95 },
  { tag: 'T2-gate',   cool: SHIP_COOL, gate: CAND_GATE, strength: 0.95 },
  { tag: 'W-both',    cool: CAND_COOL, gate: CAND_GATE, strength: 0.95 },
  { tag: 'Z-noink',   cool: SHIP_COOL, gate: SHIP_GATE, strength: 0 },
];

const results = [];
for (const shot of SHOTS) {
  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => {
      await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, shot);
      const out = [];
      for (const a of ARMS) {
        out.push(await page.evaluate(async (arm) => {
          const postfx = window.__ENGINE.get('postfx');
          /* Every arm writes all three fields, so no arm can inherit another's state. All three
             are re-read from `tune` into the composite uniforms every frame. */
          postfx.tune.inkCool = arm.cool;
          postfx.tune.inkDarkGate = arm.gate.slice();
          postfx.tune.inkStrength = arm.strength;

          await window.__GAME.step(3, 0);
          window.__ENGINE.renderFrame(0);

          /* Read the uniforms BACK after the render. If `inkDarkGate` is not wired to the shader,
             or `inkCool` is still the construction-time value, this is where it shows — and the
             scorer gates on it rather than trusting that a poke landed. */
          const u = postfx.compositeMat?.uniforms || {};
          const cool = u.uInkCool?.value;
          const gate = u.uInkGate?.value;
          const applied = {
            cool: cool ? [cool.r, cool.g, cool.b] : null,
            gate: gate ? [gate.x, gate.y] : null,
            strength: u.uInkStrength?.value ?? null,
            wanted: { cool: arm.cool, gate: arm.gate, strength: arm.strength },
          };

          const src = window.__ENGINE.canvas;
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          return { tag: arm.tag, applied, png: c.toDataURL('image/png') };
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
    const ap = r.applied;
    const f = (v) => (v ? v.map((x) => x.toFixed(4)).join(',') : 'MISSING');
    console.log(`${shot.padEnd(12)} ${r.tag.padEnd(10)} strength=${ap.strength} `
      + `gate=[${f(ap.gate)}] cool=[${f(ap.cool)}] sha=${sha}`);
  }
}

writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));

/* The one thing worth failing loudly at capture time: a lever that did not reach the shader. */
let dead = 0;
for (const r of results) {
  if (!r.applied.gate) { console.log(`  ${r.shot} ${r.arm}: uInkGate MISSING — the gate lever is not wired`); dead++; }
  else if (Math.abs(r.applied.gate[0] - r.applied.wanted.gate[0]) > 1e-6
        || Math.abs(r.applied.gate[1] - r.applied.wanted.gate[1]) > 1e-6) {
    console.log(`  ${r.shot} ${r.arm}: uInkGate is [${r.applied.gate}] but [${r.applied.wanted.gate}] was requested`);
    dead++;
  }
}
console.log(dead ? `\n${dead} arm(s) did not apply — do not score this run`
                 : '\ncapture clean; score with tools/inkwidenscore.mjs');
