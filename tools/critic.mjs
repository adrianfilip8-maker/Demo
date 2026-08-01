#!/usr/bin/env node
/**
 * Capture a review set for the visual critic: full-resolution PNGs of the canonical shots
 * into a labelled directory, plus a manifest with stats and warnings.
 *
 *   node tools/critic.mjs --label r3               all shots at 1280x720, quality high
 *   node tools/critic.mjs --label r3 hero temple    just those
 *   node tools/critic.mjs --label r3 --w 1600 --h 900 --q ultra
 *
 * Also emits crops when --crops is passed: a 2x centre detail from each shot, because
 * texture and outline quality only becomes judgeable at pixel scale.
 */
import { withGame, grab, ROOT } from './harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i === -1) return false; argv.splice(i, 1); return true; };

const LABEL = opt('label', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16));
const WIDTH = parseInt(opt('w', '1280'), 10);
const HEIGHT = parseInt(opt('h', '720'), 10);
const QUALITY = opt('q', 'high');
const CROPS = flag('crops');
const only = argv.filter((a) => !a.startsWith('--'));

const OUT = path.join(ROOT, 'shots', LABEL);

async function main() {
  await mkdir(OUT, { recursive: true });
  process.stdout.write(`· review set "${LABEL}" at ${WIDTH}x${HEIGHT} q=${QUALITY}\n`);

  const manifest = await withGame({ width: WIDTH, height: HEIGHT, quality: QUALITY },
    async ({ page, info }) => {
      const names = only.length ? only : info.shots;
      const entries = [];

      for (const name of names) {
        try {
          const t0 = Date.now();
          const r = await grab(page, name);
          await writeFile(path.join(OUT, `${name}.png`),
            Buffer.from(r.dataUrl.split(',')[1], 'base64'));

          let crop = null;
          if (CROPS) {
            // A 2x centre crop: outline thickness, texture detail and cel banding only
            // become judgeable at pixel scale, and a downscaled frame hides all three.
            const c = await page.evaluate(() => {
              const src = window.__ENGINE.canvas;
              const w = Math.round(src.width / 2), h = Math.round(src.height / 2);
              const cv = document.createElement('canvas');
              cv.width = w; cv.height = h;
              cv.getContext('2d').drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, w, h);
              return cv.toDataURL('image/png');
            });
            crop = `${name}.crop.png`;
            await writeFile(path.join(OUT, crop), Buffer.from(c.split(',')[1], 'base64'));
          }

          entries.push({ name, file: `${name}.png`, crop, ms: Date.now() - t0, ...r.stats });
          process.stdout.write(`  ✓ ${name.padEnd(13)} draws ${String(r.stats.drawCalls).padStart(4)}  tris ${(r.stats.triangles / 1000).toFixed(0)}k\n`);
        } catch (err) {
          entries.push({ name, error: err.message.split('\n')[0] });
          process.stdout.write(`  ✗ ${name}: ${err.message.split('\n')[0]}\n`);
        }
      }

      const runtime = await page.evaluate(() => window.__GAME.warnings.slice());
      return {
        label: LABEL, at: new Date().toISOString(), width: WIDTH, height: HEIGHT, quality: QUALITY,
        renderer: info.renderer, modules: info.modules, poses: info.poses,
        bootWarnings: info.warnings, warnings: runtime,
        consoleErrors: info.consoleErrors.slice(0, 30), shots: entries,
      };
    });

  /* Provenance. `shot.mjs` has stamped this since the day a 25-commit-old PNG was read as
     evidence of a live bug; `critic.mjs` did not, and a critic pass had to reconstruct which
     build each batch came from by hand, from file mtimes against commit times. `dirty` matters
     more here than the SHA: with several agents committing live, a review set can straddle two
     builds, and that is exactly what happened. */
  try {
    const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
    manifest.commit = {
      sha: git(['rev-parse', '--short', 'HEAD']),
      dirty: git(['status', '--porcelain']) !== '',
      capturedAt: new Date().toISOString(),
    };
  } catch { manifest.commit = null; }
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const absent = Object.entries(manifest.modules).filter(([, v]) => !v).map(([k]) => k);
  if (absent.length) process.stdout.write(`· modules absent: ${absent.join(' ')}\n`);
  if (manifest.warnings.length) {
    process.stdout.write(`· ${manifest.warnings.length} runtime warning(s):\n`);
    for (const w of manifest.warnings.slice(0, 10)) process.stdout.write(`    ! ${String(w).slice(0, 160)}\n`);
  }
  if (manifest.consoleErrors.length) {
    process.stdout.write(`· ${manifest.consoleErrors.length} console error(s):\n`);
    for (const e of manifest.consoleErrors.slice(0, 10)) process.stdout.write(`    ! ${String(e).split('\n')[0].slice(0, 160)}\n`);
  }
  process.stdout.write(`\n→ shots/${LABEL}/  (${manifest.shots.filter((s) => !s.error).length} frames)\n`);
}

main().catch((e) => { console.error('critic capture failed:', e.message); process.exit(1); });
