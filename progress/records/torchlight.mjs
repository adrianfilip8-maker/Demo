/**
 * PREREG-torchlight §4 — the capture runner. Three boots, one src-arm install done the §186 way.
 *
 *   node progress/records/torchlight.mjs <BASE_SHA>
 *
 * BASE_SHA is the parent of the candidate src commit. The runner:
 *   1. asserts `git diff --name-only BASE..HEAD -- src/` is exactly the three registered files
 *      (PF6 — anything else under src/ moved between seal and capture ⇒ VOID, do not capture);
 *   2. Boot A  (base): withGame(onLocked: write the BASE versions of the three files,
 *      onReleasing: git checkout HEAD -- <files>) — §186's acquire→install→boot→capture→revert
 *      →release, using the harness seam built for exactly this. All 16 canonical shots.
 *   3. Boot A2 (base): same install, `interior` + `hero` only — the D1 determinism control.
 *   4. Boot B  (HEAD): all 16; while `interior` is staged, the three poked arms
 *      (null0 = 0, kbover = 6, restore = 2.5) via engine.debug.localToon, then the override
 *      is cleared.
 *
 * Every frame: setShot(name, {dt:0}) → __GAME.step(3, 0) → renderFrame(0) → canvas copy —
 * the frozen-clock discipline (§251), so flicker/FX phase is staging-anchored in every arm.
 * Frames + manifest land in progress/records/torchlight1/. Scoring is torchlight-score.mjs;
 * this file computes nothing it can avoid computing.
 *
 * If this process is killed mid-boot (PF5): `git status` will show the three files modified;
 * restore with `git checkout HEAD -- src/render/Lighting.js src/render/ToonMaterial.js
 * src/render/shaders/toon.glsl.js` and discard that boot's frames.
 */
import { withGame } from '../../tools/harness.mjs';
import { treeState } from '../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'progress/records/torchlight1');
const FILES = [
  'src/render/Lighting.js',
  'src/render/ToonMaterial.js',
  'src/render/shaders/toon.glsl.js',
];
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];

const BASE = process.argv[2];
if (!BASE) { console.error('usage: node torchlight.mjs <BASE_SHA>'); process.exit(2); }

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

/* PF6 — the seal's tree-stability precondition. */
const touched = git('diff', '--name-only', `${BASE}..HEAD`, '--', 'src/').split('\n').filter(Boolean).sort();
const expected = [...FILES].sort();
if (JSON.stringify(touched) !== JSON.stringify(expected)) {
  console.error(`PF6 VOID: BASE..HEAD touches under src/:\n  ${touched.join('\n  ')}\nexpected exactly:\n  ${expected.join('\n  ')}`);
  process.exit(2);
}
const baseContent = new Map(FILES.map((f) => [f, git('show', `${BASE}:${f}`)]));
console.log(`BASE ${BASE} verified: src delta is exactly the three registered files.`);

mkdirSync(OUT, { recursive: true });

/* ---- page-side functions -------------------------------------------------------------- */

/** Stage a canonical shot with the frozen clock and return { png, readback }. */
const STAGE = async (name) => {
  const eng = window.__ENGINE;
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const sh = eng.get('shading'), lt = eng.get('lighting');
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uLocalToon: sh?.uniforms?.uLocalToon ? sh.uniforms.uLocalToon.value : null,
      debugLocalToon: eng.debug?.localToon ?? null,
      tuneLocalToon: lt?.TUNE?.localToon ?? null,
      slots: (lt?._pool || []).filter((s) => s.light.visible).map((s) => ({
        x: +s.light.position.x.toFixed(2), y: +s.light.position.y.toFixed(3),
        z: +s.light.position.z.toFixed(2), i: +s.light.intensity.toFixed(3),
      })),
    },
  };
};

/** Poke the live gain on the CURRENT staging (no re-stage) and re-render. `null` clears. */
const POKE = async (v) => {
  const eng = window.__ENGINE;
  eng.debug.localToon = v;
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const sh = eng.get('shading'), lt = eng.get('lighting');
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uLocalToon: sh?.uniforms?.uLocalToon ? sh.uniforms.uLocalToon.value : null,
      debugLocalToon: eng.debug?.localToon ?? null,
      tuneLocalToon: lt?.TUNE?.localToon ?? null,
      slots: (lt?._pool || []).filter((s) => s.light.visible).map((s) => ({
        x: +s.light.position.x.toFixed(2), y: +s.light.position.y.toFixed(3),
        z: +s.light.position.z.toFixed(2), i: +s.light.intensity.toFixed(3),
      })),
    },
  };
};

/* ---- boots ----------------------------------------------------------------------------- */

const manifest = existsSync(path.join(OUT, 'manifest.json'))
  ? JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8'))
  : { base: BASE, files: FILES, rows: [] };
manifest.base = BASE;
const done = new Set(manifest.rows.map((r) => `${r.shot}.${r.arm}`));
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

function saveFrame(shot, arm, got, tree) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  const row = {
    shot, arm, file,
    sha256: createHash('sha256').update(buf).digest('hex'),
    tree, readback: got.readback,
  };
  manifest.rows = manifest.rows.filter((r) => !(r.shot === shot && r.arm === arm));
  manifest.rows.push(row);
  saveManifest();
  console.log(`  ${shot}.${arm}  sha ${row.sha256.slice(0, 16)}  slots=${got.readback.slots.length} uLocalToon=${got.readback.uLocalToon}`);
}

async function boot(label, { install, shots, arm, interiorArms }) {
  const need = shots.some((s) => !done.has(`${s}.${arm}`))
    || (interiorArms && ['null0', 'kbover', 'restore'].some((a) => !done.has(`interior.${a}`)));
  if (!need) { console.log(`${label}: all frames present, skipping boot`); return; }

  let tree = null;
  const onLocked = install ? async () => {
    for (const f of FILES) writeFileSync(path.join(ROOT, f), baseContent.get(f));
    tree = treeState();
    console.log(`${label}: BASE arm installed under the lock — src ${tree.src}`);
  } : async () => { tree = treeState(); };
  const onReleasing = install ? async () => {
    execFileSync('git', ['checkout', 'HEAD', '--', ...FILES], { cwd: ROOT });
    console.log(`${label}: HEAD restored before lock release — src ${treeState().src}`);
  } : null;

  await withGame(
    { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
    async ({ page, info }) => {
      const roster = [...info.shots].sort();
      if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
        throw new Error(`roster drift: page has [${info.shots}]`);
      }
      for (const shot of ROSTER) {
        if (!shots.includes(shot)) continue;
        const already = done.has(`${shot}.${arm}`);
        const needPokes = interiorArms && shot === 'interior'
          && ['null0', 'kbover', 'restore'].some((a) => !done.has(`interior.${a}`));
        if (already && !needPokes) continue;
        const got = await page.evaluate(STAGE, shot);
        if (!already) saveFrame(shot, arm, got, tree);
        if (needPokes) {
          for (const [a, v] of [['null0', 0], ['kbover', 6.0], ['restore', 2.5]]) {
            const g = await page.evaluate(POKE, v);
            saveFrame('interior', a, g, tree);
          }
          await page.evaluate(() => { window.__ENGINE.debug.localToon = null; });
        }
      }
    });
}

console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')}; frames -> ${OUT}`);
await boot('boot A  (base, 16 shots)', { install: true, shots: ROSTER, arm: 'base' });
await boot('boot A2 (base, D1 control)', { install: true, shots: ['interior', 'hero'], arm: 'base2' });
await boot('boot B  (candidate, 16 shots + interior pokes)', { install: false, shots: ROSTER, arm: 'cand', interiorArms: true });
console.log('DONE. Score with: node progress/records/torchlight-score.mjs');
