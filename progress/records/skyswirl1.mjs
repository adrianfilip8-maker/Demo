/**
 * skyswirl1 — the registered capture for PREREG-skyswirl.md §8. SKY owner.
 *
 * banda2.mjs template (per-chunk own boot, live pokes, idempotent resume, settle = 10
 * frozen frames + throwaway capture after every setShot, readback per arm, durable-early
 * saves) with TWO structural differences, both required by the seal:
 *
 *   1. ONE lock hold for the whole run, taken by THIS process (tools/lock.mjs acquire),
 *      with the boots inlined (harness.mjs's withGame acquires internally, which would
 *      deadlock under an outer hold — and the src edit below must exist at BOOT time,
 *      inside the ticket only). Precedent for a runner carrying its own boot copy:
 *      tools/shot.mjs, named in harness.mjs's own header.
 *   2. A SRC EDIT PHASE: the seal's §3 uGraze diff (uniform + cov line + two call-site
 *      swaps + TUNE/wiring) is applied idempotently AFTER the lock is acquired and
 *      reverted (exact reverse replacement, tree-hash-verified) BEFORE release. At the
 *      default (0.0, 0.10, 0.30) the term is bit-exact inert: cover + 0.0*s == cover.
 *      A pristine copy of Sky.js lands at skyswirl1/Sky.js.pre-edit before any change.
 *      After a container rollback the tree reverts to the committed (pristine) state on
 *      its own; the runner re-applies on resume.
 *
 * Chunks (seal §8):
 *   A  dunes  base/cand/kb/restore  then  night  base/cand/kb/restore   (one boot)
 *   B  courtyard  base/cand/restore  then  hero  base/cand/restore     (one boot)
 *
 * Arms are pokes of sky._u.uGraze (absent from _refresh, so setShot cannot clobber it;
 * poked AFTER setShot settles, never re-setShot inside an arm — seal §8 ordering trap).
 *   base    = NO poke (boot default; readback must equal [0, 0.10, 0.30] exactly)
 *   cand    = (0.15, 0.10, 0.30)
 *   kb      = (0.60, 0.10, 0.45)
 *   restore = (0.0, 0.10, 0.30)  — re-poke of the default; P-F4 binds restore ≡ base
 *
 * Frames + readbacks land incrementally at progress/records/skyswirl1/. Scoring is NOT
 * here:  node progress/records/skynoise-diag.mjs swirlscore progress/records/skyswirl1
 */
import { acquire } from '/home/user/Demo/tools/lock.mjs';
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = '/home/user/Demo';
const SKY = `${ROOT}/src/render/Sky.js`;
const OUT = `${ROOT}/progress/records/skyswirl1`;
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* ───────────────────────── the sealed src diff (PREREG-skyswirl.md §3) ───────────────────────── */

const EDITS = [
  { // TUNE defaults — the INERT state
    old: `  ],
  cloudBands: 3,            // cel quantisation of cloud lighting (§2.1.1)`,
    new: `  ],
  /* skyswirl (PREREG-skyswirl.md §3): decks dissolve into haze below ~17.5° elevation.
     lift 0.0 is BIT-EXACT INERT (cover + 0.0*s == cover); the registered A/B pokes uGraze. */
  graze: { lift: 0.0, dyLo: 0.10, dyHi: 0.30 },
  cloudBands: 3,            // cel quantisation of cloud lighting (§2.1.1)`,
  },
  { // shader uniform declaration
    old: `  uniform vec3  uDeckStreak;`,
    new: `  uniform vec3  uDeckStreak;
  uniform vec3  uGraze;    // skyswirl: (coverLift, dyLo, dyHi); lift 0 = bit-exact inert`,
  },
  { // cov compute, gated on d.y — the elevation term
    old: `    alpha = 0.0;
    if (d.y <= 0.004) return skyBehind;`,
    new: `    alpha = 0.0;
    if (d.y <= 0.004) return skyBehind;
    // skyswirl (PREREG-skyswirl.md §3): elevation-gated cover lift; lift 0 -> cov == cover.
    float cov = cover + uGraze.x * (1.0 - smoothstep(uGraze.y, uGraze.z, d.y));`,
  },
  { // call site 1
    old: `    float dens = deckDensity(uv, streak, cover, soft, core);`,
    new: `    float dens = deckDensity(uv, streak, cov, soft, core);`,
  },
  { // call site 2 (self-shadow sample sees the same cov)
    old: `    float densL = deckDensity(uv + sunUv, streak, cover, soft, dummy);`,
    new: `    float densL = deckDensity(uv + sunUv, streak, cov, soft, dummy);`,
  },
  { // uniform wiring
    old: `      uDeckStreak:  { value: new THREE.Vector3(D[0].streak, D[1].streak, D[2].streak) },`,
    new: `      uDeckStreak:  { value: new THREE.Vector3(D[0].streak, D[1].streak, D[2].streak) },
      uGraze:       { value: new THREE.Vector3(TUNE.graze.lift, TUNE.graze.dyLo, TUNE.graze.dyHi) },`,
  },
];

const STATE = path.join(OUT, 'edit-state.json');

function applyEdit() {
  let src = readFileSync(SKY, 'utf8');
  if (src.includes('uGraze')) {
    for (const e of EDITS) if (!src.includes(e.new)) throw new Error('Sky.js carries uGraze but not the exact sealed diff — refusing (hand-inspect before any capture)');
    log('src edit: already applied (exact sealed diff verified in place)');
    return;
  }
  const pre = treeHash();
  if (!existsSync(path.join(OUT, 'Sky.js.pre-edit'))) copyFileSync(SKY, path.join(OUT, 'Sky.js.pre-edit'));
  writeFileSync(STATE, JSON.stringify({ preHash: pre, appliedAt: new Date().toISOString() }, null, 1));
  for (const e of EDITS) {
    const i = src.indexOf(e.old);
    if (i < 0 || src.indexOf(e.old, i + 1) >= 0) throw new Error(`edit anchor not found exactly once: ${e.old.slice(0, 60)}...`);
    src = src.replace(e.old, e.new);
  }
  writeFileSync(SKY, src);
  log(`src edit: applied (pre-edit tree ${pre} -> edited tree ${treeHash()}); pristine copy at skyswirl1/Sky.js.pre-edit`);
}

function revertEdit() {
  let src = readFileSync(SKY, 'utf8');
  if (!src.includes('uGraze')) { log('src revert: Sky.js already pristine (rollback or prior revert)'); return; }
  for (const e of [...EDITS].reverse()) {
    const i = src.indexOf(e.new);
    if (i < 0) throw new Error(`revert anchor missing: ${e.new.slice(0, 60)}... — restore from skyswirl1/Sky.js.pre-edit by hand`);
    src = src.replace(e.new, e.old);
  }
  writeFileSync(SKY, src);
  const now = treeHash();
  let want = null;
  try { want = JSON.parse(readFileSync(STATE, 'utf8')).preHash; } catch {}
  if (want && now !== want) throw new Error(`revert hash mismatch: tree ${now} != pre-edit ${want} — ANOTHER owner moved src during the hold; reconcile by hand before release`);
  log(`src revert: done, tree ${now}${want ? ' == pre-edit hash (verified)' : ' (no state file — hash unverified, tree carries no uGraze)'}`);
}

/* ───────────────────────── boot internals (harness.mjs copy, minus its lock) ───────────────────────── */

const CHROME_CANDIDATES = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const CHROME_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
  '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
];

async function freePort(start = 5400) {
  for (let p = start; p < start + 300; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}

async function startServer(port) {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let logTxt = '';
  proc.stdout.on('data', (d) => { logTxt += d; });
  proc.stderr.on('data', (d) => { logTxt += d; });
  for (let i = 0; i < 160; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${logTxt}`);
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened on ${port}:\n${logTxt}`);
}

/* ───────────────────────── arms and chunks (seal §4/§8) ───────────────────────── */

const ARMS = {
  base: null,                    // no poke: boot default, readback-verified
  cand: [0.15, 0.10, 0.30],
  kb: [0.60, 0.10, 0.45],
  restore: [0.0, 0.10, 0.30],    // re-poke of the default; P-F4 binds restore ≡ base
};
const SHIP_DECKS = { scale: [0.000105, 0.000138, 0.000105], soft: [0.36, 0.38, 0.40], warp: [0.55, 0.85, 1.25] };
const GRAZE_DEFAULT = [0.0, 0.10, 0.30];

const CHUNKS = [
  { id: 'A', shots: [{ shot: 'dunes', arms: ['base', 'cand', 'kb', 'restore'] }, { shot: 'night', arms: ['base', 'cand', 'kb', 'restore'] }] },
  { id: 'B', shots: [{ shot: 'courtyard', arms: ['base', 'cand', 'restore'] }, { shot: 'hero', arms: ['base', 'cand', 'restore'] }] },
];

async function runChunk(chunk) {
  const report = {
    prereg: 'PREREG-skyswirl.md', chunk: chunk.id, startedAt: new Date().toISOString(),
    srcTreeBefore: treeHash(), grazeDefault: GRAZE_DEFAULT, shipDecks: SHIP_DECKS, shots: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk.id}.json`), JSON.stringify(report, null, 1));
  save();
  log(`chunk ${chunk.id}: srcTree(EDITED) ${report.srcTreeBefore} — booting`);

  const port = await freePort();
  const server = await startServer(port);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p)), args: CHROME_ARGS });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => log(`    pageerror: ${e.message.slice(0, 200)}`));
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 30 * 60 * 1000, polling: 500 });

    /* Lever probe BEFORE anything is believed: the edited tree must publish uGraze at the
       inert default, and the decks must be the SHIPPED six numbers (P-F3 family). */
    const lever = await page.evaluate(() => {
      const sky = window.__ENGINE?.get?.('sky');
      return {
        hasSky: !!sky, hasGraze: !!sky?._u?.uGraze,
        graze: sky?._u?.uGraze?.value?.toArray?.(),
        deckScale: sky?._u?.uDeckScale?.value?.toArray?.(),
        deckSoft: sky?._u?.uDeckSoft?.value?.toArray?.(),
        deckWarp: sky?._u?.uDeckWarp?.value?.toArray?.(),
        renderer: (() => {
          const gl = window.__ENGINE?.renderer?.getContext?.();
          const d = gl?.getExtension('WEBGL_debug_renderer_info');
          return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
        })(),
      };
    });
    report.lever = lever;
    log(`  LEVER ${JSON.stringify(lever)}`);
    save();
    if (!lever.hasSky || !lever.hasGraze) { report.fatal = 'uGraze absent from live page — edit did not reach the boot'; log(`  FATAL: ${report.fatal}`); save(); return; }
    const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
    if (!near(lever.graze, GRAZE_DEFAULT)) { report.fatal = `uGraze default ${lever.graze} != ${GRAZE_DEFAULT}`; log(`  FATAL: ${report.fatal}`); save(); return; }
    if (!near(lever.deckScale, SHIP_DECKS.scale) || !near(lever.deckSoft, SHIP_DECKS.soft) || !near(lever.deckWarp, SHIP_DECKS.warp)) {
      report.fatal = 'shipped deck values not live — tree under capture is not the tree diagnosed (P-F3)';
      log(`  FATAL: ${report.fatal}`); save(); return;
    }

    for (const { shot, arms } of chunk.shots) {
      const sRec = { shot, arms: [] };
      report.shots.push(sRec);
      const t1 = Date.now();
      const staged = await page.evaluate(async (n) => {
        const r = await window.__GAME.setShot(n);
        return { stats: r?.stats, tod: window.__ENGINE.debug.timeOfDay };
      }, shot);
      sRec.setShot = staged;
      log(`  setShot(${shot}) ${((Date.now() - t1) / 1000).toFixed(0)}s  tod ${staged.tod}  draws ${staged.stats?.drawCalls} tris ${staged.stats?.triangles}`);
      save();

      const t2 = Date.now();
      await page.evaluate(async () => {
        await window.__GAME.step(10, 0);
        window.__GAME.capture('image/png');   // throwaway: warms compiles + capture path
      });
      sRec.settleSecs = Math.round((Date.now() - t2) / 1000);
      log(`  settle(${shot}) ${sRec.settleSecs}s (10 frozen frames + throwaway capture)`);

      for (const arm of arms) {
        const ta = Date.now();
        const v = ARMS[arm];
        const r = await page.evaluate(async (v) => {
          const sky = window.__ENGINE.get('sky');
          if (v) sky._u.uGraze.value.set(v[0], v[1], v[2]);
          await window.__GAME.step(1, 0);      // dt=0: uTime frozen across every arm
          const dataUrl = window.__GAME.capture('image/png');
          return {
            readback: {
              graze: sky._u.uGraze.value.toArray(),
              uTime: sky._u.uTime.value,
              cover: sky._u.uCloudCover.value.toArray(),
              tod: window.__ENGINE.debug.timeOfDay,
            },
            dataUrl,
          };
        }, v);
        const rb = r.readback;
        const want = v ?? GRAZE_DEFAULT;
        const mism = rb.graze.some((x, i) => Math.abs(x - want[i]) > 1e-9);
        writeFileSync(path.join(OUT, `${shot}.${arm}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
        log(`  ${shot}.${arm.padEnd(8)} ${((Date.now() - ta) / 1000).toFixed(0)}s  uGraze [${rb.graze.join(', ')}]  uTime ${rb.uTime.toFixed(3)}  cover [${rb.cover.map((x) => x.toFixed(3)).join(', ')}]  ${mism ? 'POKE MISMATCH' : 'applied ok'}`);
        sRec.arms.push({ arm, requested: want, readback: rb, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
        save();
      }
    }

    report.srcTreeAfter = treeHash();
    report.finishedAt = new Date().toISOString();
    log(`  chunk ${chunk.id} done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
    save();
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

/* ───────────────────────── main ───────────────────────── */

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

if (only === 'REVERT') {
  // manual recovery path: revert the edit under its own short hold, no boots
  const release = await acquire({ onWait: (ms, pid) => log(`waiting for lock (${(ms / 1000) | 0}s, pid ${pid})`) });
  try { revertEdit(); } finally { release(); }
  process.exit(0);
}

const chunksToRun = CHUNKS.filter((c) => !only || c.id === only).filter((c) =>
  !c.shots.every((s) => s.arms.every((a) => existsSync(path.join(OUT, `${s.shot}.${a}.png`)))));
if (!chunksToRun.length) { log('all requested chunks already have all frames — nothing to do (idempotent resume)'); process.exit(0); }

log(`acquiring capture lock (chunks: ${chunksToRun.map((c) => c.id).join(', ')})`);
const release = await acquire({ onWait: (ms, pid) => log(`waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})`) });
log('lock ACQUIRED — src edit + boots happen inside this hold only');
try {
  applyEdit();
  for (const chunk of chunksToRun) await runChunk(chunk);
} finally {
  try { revertEdit(); } catch (e) { log(`REVERT FAILED: ${e.message}`); }
  release();
  log('lock released');
}
log('ALL DONE — score with: node progress/records/skynoise-diag.mjs swirlscore progress/records/skyswirl1');
