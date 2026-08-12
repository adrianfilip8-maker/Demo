/**
 * §D2 / PREREG-bodyshift.md — the render's per-shot hue offset across the canonical set.
 *
 * Same instrument as run 4 (`tools/bodyhue4.mjs`): one boot per shot, arm A rendered, body
 * albedo swapped in-page via `mesh.userData.slySwapBodyTex`, arm B rendered, mask
 * `maxChannelDelta >= 18`, circular median hue. Two additions, both registered:
 *
 *   - `camDist`: |camera world pos − costume-mesh world pos| at the staged frame, for P-M.
 *   - rows APPEND to `shots/bodyshift/arms.json` across invocations, because this run is
 *     eleven shots in batches of two and the container rebuilds hourly — a shot already
 *     scored is skipped, a shot lost in flight simply has no row and is re-captured fresh.
 *
 * This tool takes no verdicts; `tools/bodyshiftscore.mjs` applies PREREG-bodyshift §4–§6.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { readPNG } from './png.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/bodyshift';
const SHOTS = (process.argv[2] || '').split(',').filter(Boolean);
if (!SHOTS.length) { console.error('usage: node tools/bodyshift.mjs shot1,shot2'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

/* §282: the floor is a property of the texture PAIR — p05 of its rotated-texel deltas, computed
   from the textures alone. 18 was the −21.1° pair's value; the −11.3° pair's is 9. Carrying a
   floor across pairs is the defect that confounded run 5 (RESULT-bodyhue5.md ADDENDUM). */
const MASK_MIN = Number(process.env.SANDS_FLOOR || 18);

const ARMS = `${OUT}/arms.json`;
const results = existsSync(ARMS) ? JSON.parse(readFileSync(ARMS, 'utf8')) : [];
const done = new Set(results.map((r) => r.shot));

const NOW = treeState();
console.log(`target src tree ${NOW.src} (HEAD ${NOW.head})`);

for (const shot of SHOTS) {
  if (done.has(shot)) { console.log(`${shot}: already scored, skipping (fresh-frames rule applies per shot, not per row)`); continue; }
  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => page.evaluate(async (s) => {
      const eng = window.__ENGINE;
      await window.__GAME.setShot(s, { dt: 0 });

      let swap = null, swapMesh = null;
      eng.scene.traverse((o) => { if (o.userData && o.userData.slySwapBodyTex) { swap = o.userData.slySwapBodyTex; swapMesh = o; } });
      if (!swap) return { error: 'slySwapBodyTex not found on any object — VOID' };

      const shoot = async () => {
        await window.__GAME.step(3, 0);
        eng.renderFrame(0);
        const src = eng.canvas;
        const c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
        return c.toDataURL('image/png');
      };

      const modeA = await swap('raw');
      const A = await shoot();

      /* camDist AFTER the settle steps that produce the scored frame, so the distance belongs
         to the frame that is measured, not to the pre-settle staging pose. Read via matrixWorld
         to avoid needing a THREE.Vector3 inside the page. */
      eng.camera.updateWorldMatrix(true, false);
      swapMesh.updateWorldMatrix(true, false);
      const ce = eng.camera.matrixWorld.elements, me = swapMesh.matrixWorld.elements;
      const camDist = Math.hypot(ce[12] - me[12], ce[13] - me[13], ce[14] - me[14]);

      const modeB = await swap('fix');
      const B = await shoot();
      return { A, B, modeA, modeB, camDist };
    }, shot));

  if (got.error) { console.log(`${shot}: ${got.error}`); continue; }

  const row = { shot, tree: NOW, floor: MASK_MIN, modeA: got.modeA, modeB: got.modeB, camDist: got.camDist };
  for (const [tag, dataUrl] of [['A-raw', got.A], ['B-fix', got.B]]) {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const file = `${OUT}/${shot}-${tag}.png`;
    writeFileSync(file, buf);
    row[tag] = { file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  }

  /* Score immediately and persist — a rebuild mid-run must not erase completed shots. */
  const ia = readPNG(row['A-raw'].file), ib = readPNG(row['B-fix'].file);
  const hueOf = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return null;
    let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  };
  const hA = [], hB = [];
  let n = 0, tiny = 0;
  for (let i = 0, px = ia.w * ia.h; i < px; i++) {
    const o = i * ia.ch, p = i * ib.ch;
    const dm = Math.max(Math.abs(ia.data[o] - ib.data[p]), Math.abs(ia.data[o + 1] - ib.data[p + 1]),
      Math.abs(ia.data[o + 2] - ib.data[p + 2]));
    if (dm < MASK_MIN) { if (dm) tiny++; continue; }
    n++;
    const a1 = hueOf(ia.data[o], ia.data[o + 1], ia.data[o + 2]);
    const b1 = hueOf(ib.data[p], ib.data[p + 1], ib.data[p + 2]);
    if (a1 != null) hA.push(a1);
    if (b1 != null) hB.push(b1);
  }
  const med = (a) => {
    if (!a.length) return null;
    let sx = 0, sy = 0;
    for (const h of a) { const r = h * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); }
    const mean = Math.atan2(sy, sx) * 180 / Math.PI;
    const shift = 180 - ((mean % 360) + 360) % 360;
    const rot = a.map((h) => (((h + shift) % 360) + 360) % 360).sort((x, y) => x - y);
    const m = rot[Math.floor(rot.length / 2)];
    return (((m - shift) % 360) + 360) % 360;
  };
  row.n = n;
  row.cov = n / (ia.w * ia.h);
  row.excluded = tiny;
  row.hueA = med(hA);
  row.hueB = med(hB);
  results.push(row);
  writeFileSync(ARMS, JSON.stringify(results, null, 1));

  console.log(`${shot.padEnd(11)} mask ${String(n).padStart(7)} (${(100 * row.cov).toFixed(2)}%)  `
    + `hueA ${row.hueA?.toFixed(1)}°  hueB ${row.hueB?.toFixed(1)}°  dist ${row.camDist.toFixed(1)}m`);
}

console.log('\nscore with: node tools/bodyshiftscore.mjs');
