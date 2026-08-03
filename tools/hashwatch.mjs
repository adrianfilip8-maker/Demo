/**
 * hashwatch — stamp the tree AT `page.goto`, which is the only moment that matters (§124.4).
 *
 * The bundler reads the tree at boot, not at capture: `SANDS_NO_HMR=1` gives `hmr:false` plus
 * `watch:{ignored:['**''/*']}` and the harness navigates once with no reload, so a mid-run edit
 * is harmless while a between-runs edit is fatal. A hash taken when a run is QUEUED describes a
 * tree the run may never see, and a hash taken after it finishes describes one it never saw
 * either. So this waits for the lock-acquisition transition in the run's own log — the last
 * event before `page.goto` — and stamps there.
 *
 * Live hazard this exists for: SHADING is editing Outline.js / ToonMaterial.js / toon.glsl.js,
 * the pass that draws every silhouette in the game. If that lands on the far side of goto it is
 * in the frames; on the near side it is not. This records which.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const LOG = process.argv[2];
const OUT = process.argv[3];
const R = '/home/user/Demo';
const WATCH = [
  'src/render/Outline.js', 'src/render/ToonMaterial.js', 'src/render/shaders/toon.glsl.js',
  'src/fx/Particles.js', 'src/fx/Emitters.js', 'src/render/Lighting.js',
  'src/world/EgyptLevel.js', 'src/world/Kit.js',
];

const sha = (p) => {
  try { return createHash('sha1').update(readFileSync(`${R}/${p}`)).digest('hex').slice(0, 12); }
  catch { return 'ABSENT'; }
};
const mtime = (p) => { try { return statSync(`${R}/${p}`).mtime.toISOString(); } catch { return null; } };
const git = (c) => { try { return execSync(c, { cwd: R }).toString().trim(); } catch { return '?'; } };

function stamp(when, note) {
  return {
    when, note,
    wallclock: new Date().toISOString(),
    head: git('git rev-parse --short HEAD'),
    dirty: git('git status --porcelain').length > 0,
    files: Object.fromEntries(WATCH.map((p) => [p, { sha: sha(p), mtime: mtime(p) }])),
  };
}

const rec = { pregoto: null, atgoto: null, post: null };
rec.pregoto = stamp('queued', 'taken while the run was still waiting for the lock — NOT the boot tree');

let sawWait = false;
const tail = () => { try { return readFileSync(LOG, 'utf8'); } catch { return ''; } };

/* The transition: "waiting for capture lock" lines stop and boot output begins. `renderer:` is
   the harness's first post-boot line, so either signal means goto has just happened. */
const t0 = Date.now();
const iv = setInterval(() => {
  const s = tail();
  if (/waiting for capture lock/.test(s)) sawWait = true;
  const booted = /renderer:/.test(s);
  const stoppedWaiting = sawWait && !/waiting for capture lock \(\d+s[^)]*\)\s*$/.test(s.trimEnd());
  if (booted || (stoppedWaiting && s.length > 0 && !/waiting for capture lock/.test(s.slice(-200)))) {
    rec.atgoto = stamp('at-goto', booted ? 'stamped on the harness\'s first post-boot line' : 'stamped when lock-wait output ceased');
    rec.driftFromQueued = WATCH.filter((p) => rec.pregoto.files[p].sha !== rec.atgoto.files[p].sha);
    writeFileSync(OUT, JSON.stringify(rec, null, 1));
    clearInterval(iv);
    console.log('AT-GOTO stamped: head', rec.atgoto.head, 'dirty', rec.atgoto.dirty);
    console.log('drift since queued:', rec.driftFromQueued.length ? rec.driftFromQueued.join(', ') : 'none');
  }
  if (Date.now() - t0 > 3 * 3600e3) { clearInterval(iv); }
}, 2000);

writeFileSync(OUT, JSON.stringify(rec, null, 1));
console.log('hashwatch armed on', LOG, '->', OUT);
