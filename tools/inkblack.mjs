/**
 * §270 / PREREG-inkblack.md — which of the two ink systems owns the ink black point.
 *
 * The ink is defined here as **the pixels the ink passes actually change**, not as anything a
 * detector decides. That is the whole point: the VOID run this replaces used a ridge detector
 * ("dark valley, lighter shoulders") which on `night.png` found pixels BRIGHTER than the frame
 * median, because in a dark frame a dark valley is just texture. A definitional mask needs no
 * threshold and cannot make that mistake.
 *
 * FOUR arms, one boot per shot, `dt = 0` on every step (§251):
 *
 *   A   shipped      both ink systems live
 *   B   crease-off   postfx.tune.inkStrength = 0            -> what remains is HULL ink
 *   C0  visible=false  B, plus `.visible = false` per shell -> THE BROKEN LEVER, kept on purpose
 *   C   layers        B, plus `.layers.disable(0)`          -> the un-inked frame
 *
 * Then, exactly:  inkMask = A != C,  creaseMask = A != B,  hullMask = B != C.
 * `C0` enters no mask. It exists to score CAL-4.
 *
 * ## Why there are two hull-defeat arms
 *
 * The obvious lever — walk the scene and set `.visible = false` on every `slyInk_*` mesh — does
 * not survive to the captured frame, and the pre-registration says so *before* this run:
 * `PostFX._renderChain` renders the scene at step 1 and the normal prepass at step 2, and the
 * prepass's `finally` calls `shading.endNormalPass()` -> `setOutlinesVisible(true)`, which writes
 * `visible = true` back onto every shell. The capture renders four frames per arm, so the hide is
 * honoured by frame 1 and gone by frame 2; the frame kept is frame 4.
 *
 * That claim is a reading of the source, and readings of the source are exactly what §270 records
 * this lane getting wrong twice in one day. So it is not asserted — it is ARMED. `C0` is the
 * broken lever, run in the same boot on the same frame as the working one, and CAL-4 requires
 * `sha(C0) == sha(B)` AND `sha(C) != sha(B)`: one lever provably dead, the other provably alive.
 * A null arm would only prove repeatability; this pair proves the instrument is sensitive to the
 * thing it is about to attribute.
 *
 * `layers.disable(0)` and not `disableAll()`: `Lighting.js` partitions shadow casters across
 * layers 28-31 and rewrites those bits on a beat, and its own comment pins the invariant this
 * lever rides on — "Layer 0 membership is never touched, so the main camera ... is blind to all
 * of this". Clearing exactly bit 0 removes the shell from the scene pass and collides with
 * nothing. `setOutlinesVisible` writes `.visible` and never `.layers`, so `endNormalPass` cannot
 * resurrect a layer-hidden shell.
 *
 * Both hull levers are page-side. No shipped code changes inside the experiment, so neither can
 * perturb arm A.
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

/* `hull`: 'on' = shells drawn; 'visible' = the broken `.visible=false` lever; 'layers' = the
   working `.layers.disable(0)` lever. Order matters only in that every arm fully restores both
   channels before applying its own, so no arm can inherit the previous one's state. */
const ARMS = [
  { tag: 'A-ship',     crease: null, hull: 'on'      },
  { tag: 'B-nocrease', crease: 0,    hull: 'on'      },
  { tag: 'C0-visible', crease: 0,    hull: 'visible' },
  { tag: 'C-noink',    crease: 0,    hull: 'layers'  },
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

          /* Hull. Restore BOTH channels on every shell first, then apply this arm's defeat, so
             arm order cannot leak through either one. Count the shells — a traversal that
             matched nothing would quietly answer "the hull contributes 0". */
          let hulls = 0;
          eng.scene.traverse((o) => {
            if (!(o.isMesh && o.material && typeof o.material.name === 'string'
                  && o.material.name.startsWith('slyInk_'))) return;
            hulls++;
            o.visible = true;
            o.layers.enable(0);
            if (arm.hull === 'visible') o.visible = false;
            else if (arm.hull === 'layers') o.layers.disable(0);
          });

          await window.__GAME.step(3, 0);
          eng.renderFrame(0);
          const src = eng.canvas;
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          return {
            tag: arm.tag,
            applied: { inkStrength: postfx.tune.inkStrength, hullDefeat: arm.hull, hulls },
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
      + `hull=${String(r.applied.hullDefeat).padEnd(7)} shells=${String(r.applied.hulls).padStart(4)} sha=${sha}`);
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
console.log('\nCAL-4 (registered): sha(C0)==sha(B) — the .visible lever is dead — AND sha(C)!=sha(B)');
for (const [shot, arms] of byShot) {
  const shells = arms['C-noink']?.applied.hulls ?? 0;
  if (!shells) { console.log(`  ${shot}: NO slyInk_* MESHES FOUND — arm C is arm B, VOID`); bad++; }
  if (arms['A-ship'] && arms['C-noink'] && arms['A-ship'].sha === arms['C-noink'].sha) {
    console.log(`  ${shot}: arm A and arm C are BIT-IDENTICAL — no ink in this frame at all, VOID`);
    bad++;
  }

  /* CAL-4. Both halves must hold. The first is PRED-1 firing (the `.visible` lever is reverted by
     endNormalPass before the captured frame); the second is the layers lever working. Reported
     per shot with the actual verdict rather than only on failure, because "the broken lever is
     broken" is the positive result this run was restructured to obtain. */
  const B = arms['B-nocrease'], C0 = arms['C0-visible'], C = arms['C-noink'];
  if (B && C0 && C) {
    const deadC0 = C0.sha === B.sha;      // PRED-1
    const liveC  = C.sha !== B.sha;
    const verdict = deadC0 && liveC ? 'OK'
      : !deadC0 && liveC ? 'PRED-1 REFUTED — the .visible lever DOES survive to the captured frame'
      : deadC0 && !liveC ? 'BOTH LEVERS DEAD — the hull draws nothing here, VOID'
      : 'BOTH LEVERS LIVE — PRED-1 refuted and the render-order reading was wrong';
    console.log(`  ${shot.padEnd(12)} C0==B ${deadC0 ? 'yes' : 'NO '}   C!=B ${liveC ? 'yes' : 'NO '}   ${verdict}`);
    if (!(deadC0 && liveC)) bad++;
  } else {
    console.log(`  ${shot.padEnd(12)} missing an arm — CAL-4 unscoreable`);
    bad++;
  }
}
console.log(bad ? `\n${bad} shot(s) unusable — see above` : '\ncapture clean; score with tools/inkblackscore.mjs');
