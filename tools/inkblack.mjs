/**
 * §270 / PREREG-inkblack.md — which of the two ink systems owns the ink black point.
 *
 * The ink is defined here as **the pixels the ink passes actually change**, not as anything a
 * detector decides. That is the whole point: the VOID run this replaces used a ridge detector
 * ("dark valley, lighter shoulders") which on `night.png` found pixels BRIGHTER than the frame
 * median, because in a dark frame a dark valley is just texture. A definitional mask needs no
 * threshold and cannot make that mistake.
 *
 * Three arms, one boot per shot, `dt = 0` on every step (§251):
 *
 *   A  shipped      both ink systems live
 *   B  crease-off   postfx.tune.inkStrength = 0        -> what remains is HULL ink
 *   C  both-off     B, plus every slyInk_* mesh hidden -> the un-inked frame
 *
 * Then, exactly:  inkMask = A != C,  creaseMask = A != B,  hullMask = B != C.
 *
 * Arm C hides the hull by scene traversal rather than through a debug lever, because none
 * exists and adding one would change shipped code inside the experiment. `Outline.js:544`
 * attaches each hull as a separate THREE.Mesh named `<mesh>_ink` carrying a `slyInk_*`
 * material, so the traversal is well-defined — but a traversal that matched nothing would
 * silently collapse arm C into arm B and every attribution below would read "the hull does
 * nothing". So the run asserts the hide count against `_inkMaterials`, and CAL-2 is the
 * independent backstop.
 *
 * Writes shots/<out>/<shot>-<arm>.png + arms.json. Scoring is `tools/inkblackscore.mjs`,
 * whose thresholds are the ones in the pre-registration and are not re-derived here.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/inkblack';
const SHOTS = (process.argv[2]
  || 'dunes,hero,interior,courtyard,temple,traversal,combat,night,sly-closeup,sly-perch').split(',');

mkdirSync(OUT, { recursive: true });

const ARMS = [
  { tag: 'A-ship',    crease: null, hull: true  },
  { tag: 'B-nocrease', crease: 0,   hull: true  },
  { tag: 'C-noink',   crease: 0,    hull: false },
];

const results = [];
for (const shot of SHOTS) {
  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => {
      await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, shot);
      const out = [];
      for (const a of ARMS) {
        out.push(await page.evaluate(async (arm) => {
          const eng = window.__ENGINE;
          const postfx = eng.get('postfx');

          /* Crease. Restored to the shipped value on every arm before being overridden, so arm
             order cannot leak: PostFX copies tune.inkStrength into the uniform each frame. */
          postfx.tune.inkStrength = (arm.crease === null) ? 0.95 : arm.crease;

          /* Hull. Toggle every shell mesh, and COUNT them — a traversal that matches nothing
             would make arm C identical to arm B and quietly answer "the hull contributes 0". */
          let hulls = 0;
          eng.scene.traverse((o) => {
            if (o.isMesh && o.material && typeof o.material.name === 'string'
                && o.material.name.startsWith('slyInk_')) {
              o.visible = arm.hull; hulls++;
            }
          });

          await window.__GAME.step(3, 0);
          eng.renderFrame(0);
          const src = eng.canvas;
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          return {
            tag: arm.tag,
            applied: { inkStrength: postfx.tune.inkStrength, hullVisible: arm.hull, hulls },
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
    console.log(`${shot.padEnd(12)} ${r.tag.padEnd(11)} ink=${r.applied.inkStrength} `
      + `hull=${r.applied.hullVisible ? 'on ' : 'off'} shells=${String(r.applied.hulls).padStart(4)} sha=${sha}`);
  }
}

writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));

/* Two things that must hold before the scorer is allowed to attribute anything. Reported here,
   GATED in the scorer — this file's job is to capture, not to decide. */
const byShot = new Map();
for (const r of results) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, {});
  byShot.get(r.shot)[r.arm] = r;
}
let bad = 0;
for (const [shot, arms] of byShot) {
  const shells = arms['C-noink']?.applied.hulls ?? 0;
  if (!shells) { console.log(`  ${shot}: NO slyInk_* MESHES FOUND — arm C is arm B, VOID`); bad++; }
  if (arms['A-ship'] && arms['C-noink'] && arms['A-ship'].sha === arms['C-noink'].sha) {
    console.log(`  ${shot}: arm A and arm C are BIT-IDENTICAL — no ink in this frame at all, VOID`);
    bad++;
  }
}
console.log(bad ? `\n${bad} shot(s) unusable — see above` : '\ncapture clean; score with tools/inkblackscore.mjs');
