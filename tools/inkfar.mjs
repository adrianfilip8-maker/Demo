/**
 * §270 / PREREG-inkfar.md — D10a: why distant silhouettes get no ink.
 *
 * The brief's suspect (`Outline.js`'s `uFalloff`) is excluded by reading before this run exists:
 * `createOutlineMaterial` writes `INK_NO_FALLOFF = 1e9` unconditionally and nothing in `src/`
 * overwrites it, so `mix(1.0, 0.62, smoothstep(18.0, 1e9, dist))` is bit-exactly 1.0 at any scene
 * distance. Two mechanisms remain and both are armed here rather than argued:
 *
 *   M1  the CREASE pass's own distance fade — `line *= 1 - smoothstep(45, 190, z0)` (PostFX:987)
 *   M2  the pyramids refuse ink — `outline: 0` (Terrain.js:1085), and `applyOutlines()` has no
 *       call site in src/, so no hull is ever built for them
 *
 * Five arms, one boot per shot, `dt = 0`:
 *
 *   A-ship    shipped
 *   P-nopyr   pyramids hidden          -> defines the mask, and is not a claim about ink
 *   F-nofade  edgeFadeStart/End pushed past any scene distance
 *   H-hull    a real shell built on each pyramid through `shading.outline()`
 *   FH-both   both levers
 *
 * ## Arm order is load-bearing
 *
 * `shading.outline()` mutates: it welds a `slyNormal` stream onto the geometry, writes `slyInk`,
 * and parents a shell that `mesh.userData.slyShell` then makes permanent for the rest of the boot.
 * There is no page-side undo. So every arm that must be hull-free — A, P, F — runs BEFORE H, and
 * the two hulled arms run last. Stated here because an arm order that merely happens to be right
 * is one edit away from being wrong.
 *
 * Distances are MEASURED in view space per pyramid, not transcribed from the `PYRAMIDS` table: a
 * distance computed from a coordinate pair and a remembered camera is exactly the class of number
 * this lane has already had to withdraw twice today.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/inkfar';
const SHOTS = (process.argv[2] || 'dunes,traversal').split(',');

mkdirSync(OUT, { recursive: true });

/* `hidePyr` hides the pyramids; `fade` removes the crease distance fade; `hull` builds shells.
   Order: the three hull-free arms first — see the header. */
const ARMS = [
  { tag: 'A-ship',   hidePyr: false, fade: true,  hull: false },
  { tag: 'P-nopyr',  hidePyr: true,  fade: true,  hull: false },
  { tag: 'F-nofade', hidePyr: false, fade: false, hull: false },
  { tag: 'H-hull',   hidePyr: false, fade: true,  hull: true  },
  { tag: 'FH-both',  hidePyr: false, fade: false, hull: true  },
];

const results = [];
for (const shot of SHOTS) {
  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => {
      await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, shot);

      /* Measure first, with nothing poked: nearest and farthest vertex distance in VIEW space for
         every pyramid, so PF1 is scored against a measurement rather than against arithmetic on
         the PYRAMIDS table. */
      const geom = await page.evaluate(() => {
        const eng = window.__ENGINE;
        const cam = eng.camera;
        cam.updateMatrixWorld(true);
        const out = [];
        eng.scene.traverse((o) => {
          if (!o.isMesh || o.userData.slyOutline || !/^pyramid_/.test(o.name || '')) return;
          o.updateWorldMatrix(true, false);
          const pos = o.geometry?.getAttribute('position');
          if (!pos) return;
          /* Plain arithmetic rather than THREE.Vector3: the page exposes `__ENGINE` and `__GAME`
             and no three namespace, so importing one here would be inventing a global for a
             measurement. Column-major, as three stores them. */
          const apply = (e, x, y, z) => [
            e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14],
          ];
          const W = o.matrixWorld.elements, V = cam.matrixWorldInverse.elements;
          let near = Infinity, far = 0;
          for (let i = 0; i < pos.count; i++) {
            const w = apply(W, pos.getX(i), pos.getY(i), pos.getZ(i));
            const v = apply(V, w[0], w[1], w[2]);
            const d = Math.hypot(v[0], v[1], v[2]);
            if (d < near) near = d;
            if (d > far) far = d;
          }
          out.push({ name: o.name, near, far });
        });
        const pf = window.__ENGINE.get('postfx');
        return { pyramids: out, edgeFadeStart: pf.tune.edgeFadeStart, edgeFadeEnd: pf.tune.edgeFadeEnd };
      });

      const out = [];
      for (const a of ARMS) {
        out.push(await page.evaluate(async (arm) => {
          const eng = window.__ENGINE;
          const postfx = eng.get('postfx');
          const shading = eng.get('shading');

          /* Restore both levers from the shipped values every arm, so arm order cannot leak
             through either. `uFade` is copied out of `tune` inside _renderChain each frame. */
          postfx.tune.edgeFadeStart = 45;
          postfx.tune.edgeFadeEnd = 190;
          if (!arm.fade) { postfx.tune.edgeFadeStart = 1e9; postfx.tune.edgeFadeEnd = 1e9 + 1; }

          const pyr = [];
          eng.scene.traverse((o) => {
            if (o.isMesh && !o.userData.slyOutline && /^pyramid_/.test(o.name || '')) pyr.push(o);
          });

          let shellsBuilt = 0, shellsTotal = 0;
          if (arm.hull) {
            for (const m of pyr) {
              const s = shading?.outline?.(m, { thickness: 1.0 }) || m.userData.slyShell;
              if (s) shellsBuilt++;
            }
          }
          /* Count shells that actually exist right now, whether this arm built them or an earlier
             one did — CAL-F3 is about the state the frame was rendered in, not about who caused it. */
          for (const m of pyr) if (m.userData.slyShell) shellsTotal++;

          for (const m of pyr) { m.layers.enable(0); if (arm.hidePyr) m.layers.disable(0); }

          await window.__GAME.step(3, 0);
          eng.renderFrame(0);
          const src = eng.canvas;
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          return {
            tag: arm.tag,
            applied: {
              fadeStart: postfx.tune.edgeFadeStart, fadeEnd: postfx.tune.edgeFadeEnd,
              hidePyr: arm.hidePyr, pyramids: pyr.length, shellsBuilt, shellsTotal,
            },
            png: c.toDataURL('image/png'),
          };
        }, a));
      }
      return { geom, arms: out };
    });

  console.log(`\n${shot}  edgeFade ${got.geom.edgeFadeStart}..${got.geom.edgeFadeEnd} m`);
  for (const p of got.geom.pyramids) {
    console.log(`  ${p.name.padEnd(14)} view distance  near ${p.near.toFixed(1)} m  far ${p.far.toFixed(1)} m`
      + `   ${p.near > got.geom.edgeFadeEnd ? 'BEYOND the fade' : 'INSIDE the fade'}`);
  }

  for (const r of got.arms) {
    const buf = Buffer.from(r.png.split(',')[1], 'base64');
    const file = `${OUT}/${shot}-${r.tag}.png`;
    writeFileSync(file, buf);
    const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    results.push({ shot, arm: r.tag, file, sha, applied: r.applied, geom: got.geom });
    const ap = r.applied;
    console.log(`  ${r.tag.padEnd(9)} fade=${String(ap.fadeStart).padStart(4)}..${String(ap.fadeEnd).padEnd(5)} `
      + `hidePyr=${ap.hidePyr ? 'yes' : 'no '} pyr=${ap.pyramids} shells=${ap.shellsTotal} sha=${sha}`);
  }
}

writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));
console.log('\nscore with tools/inkfarscore.mjs');
