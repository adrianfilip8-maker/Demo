/**
 * §D2 / PREREG-bodyhue3.md — the costume-hue A/B, same-boot, with filtered edges excluded.
 *
 * Run 1 voided because `?body=` is read at module load, so its arms needed two page loads and two
 * page loads are not bit-identical (ADDENDUM-bodyhue-run1.md). Here both arms are two renders of
 * ONE boot: the shot is staged once with the clock frozen, arm A is rendered, the body albedo is
 * swapped in-page via `mesh.userData.slySwapBodyTex`, and arm B is rendered. Nothing else moves,
 * so `costumeMask = { p : A(p) != B(p) }` is definitional again.
 *
 * CAL-3 is what proves that rather than assuming it: at most 2.0% of the mask may differ by <= 2
 * levels. Run 1's sly-perch was 85.6% by that measure.
 *
 * Deliberately writes each shot's frames AND its scored row as it goes: the container has rebuilt
 * twice tonight and destroyed every capture in flight, so a run that only reports at the end
 * reports nothing.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { readPNG } from './png.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/bodyhue3';
const SHOTS = (process.argv[2] || 'sly-closeup,sly-perch').split(',');
mkdirSync(OUT, { recursive: true });

/* PREREG-bodyhue3 §2, derived from the two TEXTURES: 95% of rotated texels change by
   >= 18 levels (p50 78), so a frame pixel below that is necessarily a filtered blend. */
const MASK_MIN = 18;

const NOW = treeState();
console.log(`target src tree ${NOW.src} (HEAD ${NOW.head})`);

const results = [];
for (const shot of SHOTS) {
  const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
    async ({ page }) => page.evaluate(async (s) => {
      const eng = window.__ENGINE;
      await window.__GAME.setShot(s, { dt: 0 });

      /* Find the swap handle. A traversal that matches nothing would silently make both arms
         identical and read as "the fix does nothing" — the exact misreading run 1 risked. */
      let swap = null;
      eng.scene.traverse((o) => { if (o.userData && o.userData.slySwapBodyTex) swap = o.userData.slySwapBodyTex; });
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
      const modeB = await swap('fix');
      const B = await shoot();
      return { A, B, modeA, modeB };
    }, shot));

  if (got.error) { console.log(`${shot}: ${got.error}`); continue; }

  const row = { shot, tree: NOW, modeA: got.modeA, modeB: got.modeB };
  for (const [tag, dataUrl] of [['A-raw', got.A], ['B-fix', got.B]]) {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const file = `${OUT}/${shot}-${tag}.png`;
    writeFileSync(file, buf);
    row[tag] = { file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  }

  /* Score this shot immediately and persist it, so a rebuild mid-run cannot erase the result. */
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
    if (dm < MASK_MIN) { if (dm) tiny++; continue; }   // PREREG-bodyhue3 §2: below 18 cannot be
    n++;                                                //   fully-costume, only a filtered blend
    const a1 = hueOf(ia.data[o], ia.data[o + 1], ia.data[o + 2]);
    const b1 = hueOf(ib.data[p], ib.data[p + 1], ib.data[p + 2]);
    if (a1 != null) hA.push(a1);
    if (b1 != null) hB.push(b1);
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  row.n = n;
  row.cov = n / (ia.w * ia.h);
  row.excluded = tiny;   // blends below the cutoff, reported not gated
  row.hueA = med(hA);
  row.hueB = med(hB);
  row.straddle = (hA.some((x) => x < 30) && hA.some((x) => x > 330))
    || (hB.some((x) => x < 30) && hB.some((x) => x > 330));
  results.push(row);
  writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));

  console.log(`${shot.padEnd(13)} mask ${String(n).padStart(7)} (${(100 * row.cov).toFixed(2)}%)  `
    + `<=2 ${(100 * row.tinyShare).toFixed(1)}%  hueA ${row.hueA?.toFixed(1)}°  hueB ${row.hueB?.toFixed(1)}°  `
    + `shift ${(row.hueB - row.hueA).toFixed(1)}°${row.straddle ? '  STRADDLE' : ''}`);
}

console.log('\nscore with: node tools/bodyhue3score.mjs');
