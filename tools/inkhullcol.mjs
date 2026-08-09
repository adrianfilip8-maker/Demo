/**
 * §270 / PREREG-inkblack.md P2 — is the ink black point the hull's AUTHORED COLOUR, or the
 * grade chain's own floor?
 *
 * P1 asks which ink system owns the black point. P2 asks, within the hull, which *term* owns it,
 * and it is a two-outcome question with both outcomes registered before this file existed:
 *
 *   P2  re-authoring the hull to pure black moves the hullMask darkest decile down >= 0.030 L
 *   F2  a move of < 0.010 L refutes "the authored colour is the locus" and says the wall is the
 *       grade's own floor, which is a different file and a different fix
 *
 * Three arms, one boot per shot, `dt = 0`, crease ink OFF in all three because P2 is a question
 * about the hull and leaving the crease live would put a second ink system inside the mask:
 *
 *   B  authored    hull on, inkSun 0x1a1210 / inkShade 0x161022   (the shipped hull)
 *   C  no hull     hull off via `.layers.disable(0)`              (defines the mask)
 *   D  black hull  hull on, both endpoints forced to (0,0,0)
 *
 * ## The mask is the SHIPPED one, and that is a pre-registration, not a convenience
 *
 * `hullMask = { p : B(p) != C(p) }` — the pixels the *shipped* hull changes. The decile is then
 * read from image B and from image D over that one fixed pixel set. Scoring each arm on its own
 * mask would let the candidate choose its own population, which is the §141.1 failure in spatial
 * form: a black hull that happened to stop differing from the background somewhere would silently
 * drop those pixels and improve its own number by shrinking the sample. `hullMask_D` is computed
 * and printed anyway, because if the two masks differ by much then the hull's coverage is
 * colour-dependent and that is itself worth knowing — but the GATE reads the shipped mask.
 *
 * ## The lever, and why it needs no src edit
 *
 * `createOutlineMaterial` builds `uInkSun` / `uInkShade` as THREE.Color uniforms, and the only
 * thing that rewrites them afterwards is `_applyInkNight`, reached through `setInkNight`, which
 * early-outs on an unchanged amount (`ToonMaterial.js:1620`). At `dt = 0` the clock cannot move,
 * so a page-side write to the uniform stands. That keeps the experiment page-side exactly as the
 * hull-defeat lever is, so no shipped byte changes while the measurement is running (§186).
 *
 * Not trusted, though — asserted. Every arm reads its ink uniforms BACK after the frame is
 * rendered and reports them, and CAL-P2b below fails the run if arm D did not actually render
 * with black ink. A lever assumed to have applied is how this lane produced a VOID already.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/inkhullcol';
const SHOTS = (process.argv[2]
  || 'dunes,hero,interior,courtyard,temple,traversal,combat,night,sly-closeup,sly-perch').split(',');

mkdirSync(OUT, { recursive: true });

const ARMS = [
  { tag: 'B-authored', hull: 'on',     black: false },
  { tag: 'C-noink',    hull: 'layers', black: false },
  { tag: 'D-blackhull', hull: 'on',    black: true  },
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

          /* The crease is off in every arm of this run: P2 is a hull question. */
          postfx.tune.inkStrength = 0;

          /* Collect the distinct ink materials once, so the colour write and the read-back
             below are talking about the same set. A material is shared by dozens of shells. */
          const mats = new Map();
          let shells = 0;
          eng.scene.traverse((o) => {
            if (!(o.isMesh && o.material && typeof o.material.name === 'string'
                  && o.material.name.startsWith('slyInk_'))) return;
            shells++;
            o.visible = true;
            o.layers.enable(0);
            if (arm.hull === 'layers') o.layers.disable(0);
            mats.set(o.material.uuid, o.material);
          });

          /* Restore the authored endpoints from what the material recorded at build time, then
             override if this arm asks for black. Restoring FROM `slyInkBase` rather than from a
             remembered previous value means arm order cannot drift the baseline. */
          let noBase = 0;
          for (const m of mats.values()) {
            const base = m.userData?.slyInkBase;
            if (base && m.uniforms?.uInkSun) {
              m.uniforms.uInkSun.value.set(base.sun);
              m.uniforms.uInkShade.value.set(base.shade);
            } else if (m.uniforms?.uInkSun) {
              /* No recorded baseline. Only `ToonMaterial.outline()` builds these and it always
                 records one, so this counts as a surprise and is reported rather than hidden —
                 an unrestorable material would make arm B depend on arm order. */
              noBase++;
            }
            if (arm.black && m.uniforms?.uInkSun) {
              m.uniforms.uInkSun.value.setRGB(0, 0, 0);
              m.uniforms.uInkShade.value.setRGB(0, 0, 0);
            }
          }

          await window.__GAME.step(3, 0);
          eng.renderFrame(0);

          /* Read the uniforms BACK, after the render, and report the extremes. If anything
             rewrote them mid-frame this is where it shows. */
          let maxSun = 0, maxShade = 0;
          for (const m of mats.values()) {
            const s = m.uniforms?.uInkSun?.value, h = m.uniforms?.uInkShade?.value;
            if (s) maxSun = Math.max(maxSun, s.r, s.g, s.b);
            if (h) maxShade = Math.max(maxShade, h.r, h.g, h.b);
          }

          const src = eng.canvas;
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          return {
            tag: arm.tag,
            applied: {
              inkStrength: postfx.tune.inkStrength, hullDefeat: arm.hull, black: arm.black,
              shells, mats: mats.size, maxSun, maxShade, noBase,
            },
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
    const ap = r.applied;
    console.log(`${shot.padEnd(12)} ${r.tag.padEnd(12)} hull=${ap.hullDefeat.padEnd(6)} `
      + `black=${ap.black ? 'yes' : 'no '} mats=${String(ap.mats).padStart(3)} `
      + `maxSun=${ap.maxSun.toFixed(5)} maxShade=${ap.maxShade.toFixed(5)} sha=${sha}`);
  }
}

writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));
console.log('\nscore with tools/inkhullcolscore.mjs');
