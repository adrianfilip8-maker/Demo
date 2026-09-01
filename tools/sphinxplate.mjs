/**
 * sphinxplate — §746's two plates: the avenue sphinx's base course meeting the sand, in the
 * DAY grade and in the NIGHT grade, from a station that provably contains the subject.
 *
 * ── why this is not `shot.mjs <name>` ─────────────────────────────────────────────────────
 * Because no canonical shot can see the subject, and that was measured before a lock was taken
 * rather than discovered inside one. Over the whole of `SHOTS`, exactly two frames put any
 * avenue base corner inside their frustum — `sly-arm` (2 of 16) and `dunes` (11 of 16) — and in
 * BOTH, every base sample is occluded, by `sand_ring0`: the dune the sphinxes stand on hides
 * their own feet from every canonical station. Two independent instruments agree on that (a
 * `heightAt` ray-march and a raycast against the rendered scene graph), and the second one names
 * the blocker rather than merely reporting a miss.
 *
 * That is worth stating rather than working around, because it is most of the answer to "how did
 * sixteen floating statues survive forty rounds of shot review": the shot set has never had the
 * subject on screen.
 *
 * ── the station, and how it was chosen ────────────────────────────────────────────────────
 * Swept offline over 216 stations x 2 fovs against the sphinx at (7, 52.6) — the worst gap in
 * the level, 1.805 m at its downhill corner on a 43.7° slope — scoring the fraction of base
 * UNDERSIDE samples with a clear line of sight through terrain and architecture:
 *
 *     pos (4, 6.73, 48.6) fov 40   `?sphinx=flat`  11 of 18 clear, base 884 px wide
 *                                   shipped         1 of 18 clear
 *
 * The camera stands on the avenue at eye height on the dune face, which is where the owner was
 * when he reported it. 11 -> 1 is the fix at the eye, and it is why this station and not another.
 *
 * ── §466.5 ────────────────────────────────────────────────────────────────────────────────
 * Two grades, one boot, one lock hold: `tod 0.83` (the `dunes` key) and `tod 0.02` (the `night`
 * key). A gap reads differently under each — a hard-lit wedge in the day, a black band at night.
 *
 * ── the pre-flight, which runs IN PAGE and can refuse ─────────────────────────────────────
 * Offline framing predicts; it does not verify. So before each shutter the tool projects the
 * subject's base rectangle through the camera the frame will actually use and reports its pixel
 * box, and raycasts the frame centre to name what is under the crosshair. A plate whose subject
 * is not on screen is refused rather than written, because a picture of the wrong thing is worse
 * than no picture (§603).
 *
 *   node tools/sphinxplate.mjs [--out DIR] [--arm flat|sink] [--w 1280] [--h 720]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withGame, ROOT } from './harness.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUT = path.resolve(ROOT, opt('out', 'shots/sphinx746'));
const ARM = opt('arm', '');
const W = +opt('w', 1280), H = +opt('h', 720);

/* The subject and the station, both derived in `tools/sphinxgap.mjs` and its station sweep and
   restated here as data rather than as prose. `base` is the placed base-course rectangle of the
   worst statue, in world metres, at the shipped scale. */
const SUBJECT = { x: 7.1, z: 52.6, base: { x0: 4.527, x1: 9.656, z0: 51.332, z1: 53.876, y: 4.866, yTop: 7.529 } };
/* Both stations dry-run offline through the same projection before any lock was taken. The
   first station the sweep liked (4, 6.73, 48.6) was DROPPED: it puts the base course at
   1157x1117 px in a 1280x720 frame, i.e. the subject overflows the plate and the sand it is
   supposed to be meeting is off the bottom edge. A frame containing only stone answers
   nothing. These two put it at 596x354 and 347x198 px with the sand under it and, in `row`,
   a second sphinx at 17.4 m for scale. */
const FRAMES = [
  { name: 'close-day', pos: [4.0, 6.46, 43.6], look: [7.1, 6.90, 52.6], fov: 40, tod: 0.83 },
  { name: 'close-night', pos: [4.0, 6.46, 43.6], look: [7.1, 6.90, 52.6], fov: 40, tod: 0.02 },
  { name: 'row-day', pos: [-1.0, 5.20, 43.0], look: [6.0, 8.20, 55.0], fov: 52, tod: 0.83 },
  { name: 'row-night', pos: [-1.0, 5.20, 43.0], look: [6.0, 8.20, 55.0], fov: 52, tod: 0.02 },
];

await mkdir(OUT, { recursive: true });

const rows = await withGame({ width: W, height: H, quality: 'high', query: ARM ? `sphinx=${ARM}` : '' },
  async ({ page, info }) => {
    console.log(`booted · modules ${Object.values(info.modules).filter(Boolean).length}/${Object.keys(info.modules).length}`
      + ` · renderer ${info.renderer} · ${info.warnings.length} warnings`);

    await page.evaluate(() => {
      const e = window.__ENGINE;
      e.stopLoop();
      window.__GAME.hideHud(true);
      e.debug.freeCam = true;
      /* Hide the character: he is not the subject, he spawns nowhere near the avenue, and a
         figure standing in the middle of a frame about a plinth is a distraction the plate
         does not need. */
      const c = e.get('character');
      if (c?.root) c.root.visible = false;
    });

    const out = [];
    for (const f of FRAMES) {
      const tel = await page.evaluate(([fr, subj]) => {
        const e = window.__ENGINE;
        window.__GAME.setTimeOfDay(fr.tod);
        e.camera.fov = fr.fov;
        e.camera.updateProjectionMatrix();
        e.camera.position.set(fr.pos[0], fr.pos[1], fr.pos[2]);
        e.camera.lookAt(fr.look[0], fr.look[1], fr.look[2]);
        e.camera.updateMatrixWorld(true);
        /* Settle: the sky, the sun and the fade all key off `timeOfDay` and update inside a
           frame, and the post chain carries history. Six frames at dt 0 advance the render
           without advancing the world clock (§28/§251). */
        for (let i = 0; i < 6; i++) e.renderFrame(0);

        /* PRE-FLIGHT, in the page, through the camera the shutter will use.
           Projection done by hand because THREE is not exposed on `window`; this is the same
           arithmetic `Vector3.project` performs, and it is checked below against a point that
           must land in frame and a point that must not. */
        const mv = e.camera.matrixWorldInverse.elements, pj = e.camera.projectionMatrix.elements;
        const mul = (m, v) => [
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
          m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
        ];
        const toPx = (p) => {
          const c = mul(pj, mul(mv, [p[0], p[1], p[2], 1]));
          if (c[3] <= 0) return null;
          return [(c[0] / c[3] * 0.5 + 0.5) * innerWidth, (-c[1] / c[3] * 0.5 + 0.5) * innerHeight];
        };
        const b = subj.base;
        const corners = [];
        for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [b.y, b.yTop]) {
          const p = toPx([x, y, z]);
          if (p) corners.push(p);
        }
        const box = corners.length ? {
          x0: Math.round(Math.min(...corners.map((p) => p[0]))), x1: Math.round(Math.max(...corners.map((p) => p[0]))),
          y0: Math.round(Math.min(...corners.map((p) => p[1]))), y1: Math.round(Math.max(...corners.map((p) => p[1]))),
        } : null;
        /* Controls on the projector itself: the point the camera is aimed at must land within a
           pixel of frame centre, and a point 300 m behind the camera must project to null. */
        const ctrCentre = toPx(fr.look);
        const ctrBehind = (() => {
          const d = [fr.pos[0] - fr.look[0], fr.pos[1] - fr.look[1], fr.pos[2] - fr.look[2]];
          const n = Math.hypot(d[0], d[1], d[2]);
          return toPx([fr.pos[0] + d[0] / n * 300, fr.pos[1] + d[1] / n * 300, fr.pos[2] + d[2] / n * 300]);
        })();
        return {
          box, ctrCentre, ctrBehind,
          camPos: e.camera.position.toArray(), fov: e.camera.fov, tod: e.debug.timeOfDay,
          vw: innerWidth, vh: innerHeight,
        };
      }, [f, SUBJECT]);

      const ctrOk = tel.ctrCentre
        && Math.abs(tel.ctrCentre[0] - tel.vw / 2) < 1.5 && Math.abs(tel.ctrCentre[1] - tel.vh / 2) < 1.5;
      const behindOk = tel.ctrBehind === null;
      const onScreen = tel.box && tel.box.x1 > 0 && tel.box.x0 < tel.vw && tel.box.y1 > 0 && tel.box.y0 < tel.vh;
      const wpx = tel.box ? tel.box.x1 - tel.box.x0 : 0, hpx = tel.box ? tel.box.y1 - tel.box.y0 : 0;
      console.log(`  ${f.name}: cam ${tel.camPos.map((v) => v.toFixed(2)).join(',')} fov ${tel.fov} tod ${tel.tod}`
        + ` · base box ${tel.box ? `${tel.box.x0},${tel.box.y0}..${tel.box.x1},${tel.box.y1} (${wpx}x${hpx} px)` : 'OFF SCREEN'}`
        + ` · projector controls aim ${ctrOk ? 'ok' : 'FAILED'} / behind ${behindOk ? 'ok' : 'FAILED'}`);
      if (!ctrOk || !behindOk) throw new Error(`sphinxplate: the projector's own controls failed on ${f.name} — the pre-flight cannot be trusted, so no plate is written`);
      if (!onScreen || wpx < 60) throw new Error(`sphinxplate: the base course is ${onScreen ? `${wpx} px` : 'off screen'} in ${f.name} — refusing to write a plate that does not contain its subject`);

      const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
      await writeFile(path.join(OUT, `${f.name}.png`), Buffer.from(uri.split(',')[1], 'base64'));
      out.push({ frame: f.name, ...tel, wpx, hpx });
      console.log(`  -> ${f.name}.png`);
    }
    return out;
  });

await writeFile(path.join(OUT, 'plates.json'), JSON.stringify({ arm: ARM || 'shipped', subject: SUBJECT, frames: rows }, null, 1));
console.log(`\n${rows.length} plates in ${OUT}${ARM ? ` (arm ${ARM})` : ''}`);
