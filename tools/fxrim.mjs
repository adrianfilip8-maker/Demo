#!/usr/bin/env node
/**
 * fxrim.mjs — the capture half of §379.4's objective test: does the largest sprite in the game
 * carry any ink at all?
 *
 *   CHROME_PATH=… SANDS_NO_HMR=1 node tools/fxrim.mjs [shot]      # default: impact
 *
 * Scoring is `tools/fxrimscore.mjs`, which never opens a browser. Splitting them is not tidiness:
 * §400 records five container rollbacks, every one of which ate an in-flight capture, so the run
 * that holds the FIFO lock does the least work it can and the analysis happens later against
 * PNGs on disk.
 *
 * ── Why this is a DIFFERENCE instrument and not a colour threshold ──────────────────────────
 * The obvious reading of §379.4 is "count near-black pixels along the rim". §270 is the record of
 * that instrument being VOIDed: a detector that decides for itself which pixels are ink found, on
 * `night.png`, an "ink" median BRIGHTER than the frame median. And the authored hex is not what
 * lands in the file — `Outline.js`'s hull ink goes through the whole grade (display L 12.3–23.4),
 * while `PostFX.js:1373`'s crease ink is composited display-referred but leaks 5% of the
 * background through `inkStrength 0.95`, is faded by `smoothstep(0.05, 0.20, lum)`, and is then
 * multiplied by the vignette and smeared by FXAA. There is no threshold that is correct for both
 * systems and no threshold this project has ever agreed on.
 *
 * `inkblack.mjs` established the answer and its levers are reused here verbatim: **the ink is the
 * pixels the ink passes actually change.** Turn each pass off, diff, and the mask needs no
 * threshold and cannot be argued with.
 *
 * ── The arms, and what each one is for ──────────────────────────────────────────────────────
 *
 *   A-ship      shipped                                        the frame under test
 *   B-nocrease  postfx.tune.inkStrength = 0                    A−B = the CREASE (edge-detect) ink
 *   C-noink     B, plus `.layers.disable(0)` per `slyInk_*`    A−C = ALL ink;  B−C = the HULL ink
 *   N-nofx      shipped ink, `fx.root.visible = false`         A−N = every pixel FX draws
 *   S-nosly     shipped ink, `character.root.visible = false`  A−S = every pixel SLY draws
 *   Z-null      shipped again, nothing touched                 A−Z MUST be empty
 *
 * `A−C` is the ink map. `A−N` is the FX map, and it is the probe without which a rim measurement
 * is worthless: "no ink on the rim" and "the rim band is not on the ring" produce the identical
 * number, and only `A−N` can tell them apart. `Z-null` is the other side of the same worry — if
 * two renders of the same state already differ, every mask above is noise. It is captured LAST so
 * it also catches an arm that failed to restore what it changed.
 *
 * ── Why `S-nosly` exists, and it is the arm that keeps the comparison honest ─────────────────
 * §379.4 requires the rim to be measured against **the hero's silhouette boundary in the same
 * frame**, and that boundary has to be located by something other than the ink, or the
 * calibration probe is "ink is where the ink is". The hull mask `B−C` would locate it and is
 * exactly that circle. So Sly is located the same way the FX is: hide him and diff. `A−S` is the
 * region Sly occupies, its outline is his silhouette, and neither the locator nor its band knows
 * anything about where ink landed.
 *
 * `character.root.visible` is the lever `Debug.setShot` itself uses one line above `applyShot`
 * (`if (character?.root) character.root.visible = !shot.hidePlayer`), so it is the shipped
 * hide path rather than a new one — and §357-adjacent history says to arm it: `courtyard` once
 * passed every projection check while hiding the character changed zero pixels. `A != S` is
 * therefore asserted from the shas, not assumed.
 *
 * The hull lever is `layers.disable(0)` and not `.visible = false` for the reason `inkblack.mjs`
 * states and proved with its `C0` arm: `PostFX._renderChain`'s normal prepass calls
 * `shading.endNormalPass()` → `setOutlinesVisible(true)`, which writes `visible = true` back onto
 * every shell, so the `.visible` lever is dead by the second of the four rendered frames.
 * `setOutlinesVisible` never touches `.layers`.
 *
 * The FX lever is the ROOT group (`Particles.js:2268`, `this.root.name = 'fx'`). Nothing in
 * `Particles` ever writes `root.visible` — the auto-hide at :1532/:1907/:2116/:2244 and
 * `Decals.js:236` all act on child meshes, and their own comments say they never re-show a mesh
 * they did not hide. Hiding the parent cannot be undone by any of them.
 *
 * No shipped code changes inside the experiment: every lever is page-side, so no arm can perturb
 * arm A.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SHOT = process.argv[2] || 'impact';
const OUT = process.env.SANDS_OUT || `shots/fxrim-${SHOT}`;
mkdirSync(OUT, { recursive: true });

const ARMS = [
  { tag: 'A-ship',     crease: null, hull: 'on',     fx: true,  sly: true  },
  { tag: 'B-nocrease', crease: 0,    hull: 'on',     fx: true,  sly: true  },
  { tag: 'C-noink',    crease: 0,    hull: 'layers', fx: true,  sly: true  },
  { tag: 'N-nofx',     crease: null, hull: 'on',     fx: false, sly: true  },
  { tag: 'S-nosly',    crease: null, hull: 'on',     fx: true,  sly: false },
  { tag: 'Z-null',     crease: null, hull: 'on',     fx: true,  sly: true  },
];

let tree = null;
const got = await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 900000,
  /* Read inside `onLocked`, so it describes the tree vite is about to bundle rather than the
     tree at queue time — on this FIFO those can be an hour apart (harness.mjs's own note). */
  onLocked: () => { tree = treeState(); },
}, async ({ page, info }) => {
  await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, SHOT);
  const out = [];
  for (const a of ARMS) {
    out.push(await page.evaluate(async (arm) => {
      const eng = window.__ENGINE;
      const postfx = eng.get('postfx');
      const fx = eng.get('fx');

      /* Every arm restores all three channels before applying its own, so arm order cannot
         leak. PostFX copies tune.inkStrength into its uniform every frame. */
      postfx.tune.inkStrength = (arm.crease === null) ? 0.95 : arm.crease;

      let hulls = 0;
      eng.scene.traverse((o) => {
        if (!(o.isMesh && o.material && typeof o.material.name === 'string'
              && o.material.name.startsWith('slyInk_'))) return;
        hulls++;
        o.visible = true;
        o.layers.enable(0);
        if (arm.hull === 'layers') o.layers.disable(0);
      });

      /* Counted, not assumed: an arm that matched no FX root would answer "FX draws nothing"
         and the rim probe below would then read as a confirmation of the hypothesis. */
      const fxRoot = fx?.root ?? eng.scene.getObjectByName('fx') ?? null;
      if (fxRoot) fxRoot.visible = arm.fx;

      const slyRoot = eng.get('character')?.root ?? null;
      if (slyRoot) slyRoot.visible = arm.sly;

      await window.__GAME.step(3, 0);
      eng.renderFrame(0);
      const src = eng.canvas;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
      return {
        tag: arm.tag,
        applied: {
          inkStrength: postfx.tune.inkStrength, hullDefeat: arm.hull, hulls,
          fxRootFound: !!fxRoot, fxVisible: fxRoot ? fxRoot.visible : null,
          slyRootFound: !!slyRoot, slyVisible: slyRoot ? slyRoot.visible : null,
        },
        png: c.toDataURL('image/png'),
      };
    }, a));
  }
  return { arms: out, renderer: info.renderer, warnings: info.warnings };
});

const rows = [];
for (const r of got.arms) {
  const file = `${OUT}/${SHOT}-${r.tag}.png`;
  const buf = Buffer.from(r.png.split(',')[1], 'base64');
  writeFileSync(file, buf);
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  rows.push({ shot: SHOT, arm: r.tag, file, sha, applied: r.applied, tree });
  console.log(`${r.tag.padEnd(11)} ${sha}  ink ${r.applied.inkStrength}  hull ${r.applied.hullDefeat} (${r.applied.hulls} shells)  fx ${r.applied.fxVisible}`);
}
writeFileSync(`${OUT}/arms.json`, JSON.stringify({
  shot: SHOT, at: new Date().toISOString(), tree, renderer: got.renderer,
  warnings: got.warnings, arms: rows,
}, null, 2));

/* The two instrument checks that can be made from shas alone, printed here so a killed scoring
   run still leaves the verdict on them in the log. */
const sha = (t) => rows.find((r) => r.arm === t)?.sha;
console.log(`\nZ == A  ${sha('Z-null') === sha('A-ship') ? 'YES — the renderer is deterministic across arms' : 'NO — EVERY MASK BELOW IS NOISE'}`);
console.log(`C != A  ${sha('C-noink') !== sha('A-ship') ? 'YES — the ink levers move pixels' : 'NO — the ink defeat is dead, the ink map would be empty'}`);
console.log(`N != A  ${sha('N-nofx') !== sha('A-ship') ? 'YES — the FX lever moves pixels' : 'NO — the FX defeat is dead, the presence probe cannot fire'}`);
console.log(`S != A  ${sha('S-nosly') !== sha('A-ship') ? 'YES — the Sly lever moves pixels' : 'NO — the hero locator is dead, the MUST-FIND probe cannot fire'}`);
console.log(`\n→ ${OUT}/  · score with:  node tools/fxrimscore.mjs ${OUT}`);
