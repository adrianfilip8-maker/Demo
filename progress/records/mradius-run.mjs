/**
 * mradius-run — the registered capture for PREREG-mradius.md (+ ADDENDUM-mradius-arrisweight).
 * GEOMETRY owner. banda2.mjs template (per-chunk own lock hold, idempotent resume, incremental
 * readbacks, settle = 10 frozen frames + throwaway capture) with the tree-state difference:
 *
 *   ARMS ARE TREE STATES, NOT UNIFORM POKES. Every arm gets: src edit (inside the held
 *   ticket) -> srcAtArm hash -> FRESH vite server (restarted per arm: SANDS_NO_HMR freezes
 *   watching, and a frozen transform cache must never serve arm N-1's bytes to arm N) ->
 *   fresh browser context -> goto + ready -> setShot -> liveness probe -> settle -> capture.
 *   Pristine bytes are restored and hash-verified before EVERY lock release (finally-block),
 *   so no src edit ever survives outside a held ticket. The arrisBand scaffold is NOT a
 *   staying scaffold — ship happens only via the seal's ship rule, by the coordinator.
 *
 * Liveness probe (specified-is-not-live, banda2's lever lesson): cand/kb must move the
 * counted triangle column by a small positive delta vs base (<= 400), restore must equal
 * base exactly. A cand/kb arm whose build did not change is FATAL — chunk void, no frames.
 *
 * Chunks (decisive first, per the seal): C1 hero, C2 night, C3 courtyard; arms
 * base -> cand -> kb -> restore. Frames + readbacks land incrementally at
 * progress/records/mradius1/. Scoring is NOT here: see RESULT-mradius.md.
 *
 *   usage: node mradius-run.mjs C1|C2|C3|all
 */
import { chromium } from 'playwright';
import { acquire } from '/home/user/Demo/tools/lock.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';

const ROOT = '/home/user/Demo';
const OUT = path.join(ROOT, 'progress/records/mradius1');
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* ---------------- the registered tree states (PREREG-mradius §3/§4) ---------------- */
const KIT = path.join(ROOT, 'src/world/Kit.js');
const LVL = path.join(ROOT, 'src/world/EgyptLevel.js');

const K_ANCHORS = {
  sig: 'export function corniceProfile({ h = 2.0, flare = 1.15, roll = 0.42, steps = 9 } = {}) {',
  row: '  p.push([flare + 0.22, top + 0.34]);   // fillet slab, drafted back in\n',
  csig: 'export function cornice({ w, d, h = 2.0, flare = 1.15, roll = 0.42 }) {',
  ccall: '  const { profile, height, flare: f } = corniceProfile({ h, flare, roll });',
};
const L_ANCHORS = {
  tc1: 'const tc1 = K.cornice({ w: t1.x * 2 + 0.1, d: t1.z1 - t1.z0 + 0.1, h: 0.62, flare: 0.40, roll: 0.20 });',
  tc2: 'const tc2 = K.cornice({ w: t2.x * 2 + 0.1, d: t2.z1 - t2.z0 + 0.1, h: 0.56, flare: 0.36, roll: 0.18 });',
};

function patchKit(src) {
  for (const [k, a] of Object.entries(K_ANCHORS)) {
    if (src.split(a).length !== 2) throw new Error(`Kit anchor ${k} not found EXACTLY once — tree drifted, FATAL`);
  }
  return src
    .replace(K_ANCHORS.sig, 'export function corniceProfile({ h = 2.0, flare = 1.15, roll = 0.42, steps = 9, arrisBand = null } = {}) {')
    .replace(K_ANCHORS.row, K_ANCHORS.row
      + '  /* mradius A/B (PREREG-mradius.md): confine the top-annulus normal turn to the outer\n'
      + '     `arrisBand` metres by splitting the top run with one coplanar row; 0 = duplicated row =\n'
      + '     split normals (hard edge, the registered KB). null = today\'s profile, bit-identical. */\n'
      + '  if (arrisBand !== null) {\n'
      + '    const bandA = flare + 0.22;\n'
      + '    const bandS = Math.max(0, Math.min(arrisBand, bandA - 0.01));\n'
      + '    p.push([bandS > 0 ? bandA - bandS : bandA, top + 0.34]);\n'
      + '  }\n')
    .replace(K_ANCHORS.csig, 'export function cornice({ w, d, h = 2.0, flare = 1.15, roll = 0.42, arrisBand = null }) {')
    .replace(K_ANCHORS.ccall, '  const { profile, height, flare: f } = corniceProfile({ h, flare, roll, arrisBand });');
}
function patchLvl(src, s1, s2) {
  for (const [k, a] of Object.entries(L_ANCHORS)) {
    if (src.split(a).length !== 2) throw new Error(`EgyptLevel anchor ${k} not found EXACTLY once — tree drifted, FATAL`);
  }
  return src
    .replace(L_ANCHORS.tc1, L_ANCHORS.tc1.replace(' });', `, arrisBand: ${s1} });`))
    .replace(L_ANCHORS.tc2, L_ANCHORS.tc2.replace(' });', `, arrisBand: ${s2} });`));
}

/* ---------------- vite + browser plumbing (harness.mjs copies, per-arm server) ---------------- */
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
  let logs = '';
  proc.stdout.on('data', (d) => { logs += d; });
  proc.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 160; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${logs}`);
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened on ${port}:\n${logs}`);
}
const stopServer = (proc) => new Promise((res) => {
  if (!proc || proc.exitCode !== null) return res();
  proc.once('exit', () => res());
  proc.kill('SIGTERM');
  setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} res(); }, 4000);
});

/* ---------------- chunks ---------------- */
const CHUNKS = [
  { id: 'C1', shot: 'hero' },
  { id: 'C2', shot: 'night' },
  { id: 'C3', shot: 'courtyard' },
];
const ARMS = ['base', 'cand', 'kb', 'restore'];
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

const pristineKit = readFileSync(KIT, 'utf8');
const pristineLvl = readFileSync(LVL, 'utf8');
const pristine = { kitSha: sha(pristineKit), lvlSha: sha(pristineLvl), tree: treeHash() };
// Fail before ANY lock time if the anchors are gone (patch functions throw on bad anchors).
patchKit(pristineKit); patchLvl(pristineLvl, 0.372, 0.348);
writeFileSync(path.join(OUT, 'pristine.json'), JSON.stringify(pristine, null, 1));
log(`pristine: tree ${pristine.tree} Kit ${pristine.kitSha.slice(0, 12)} Lvl ${pristine.lvlSha.slice(0, 12)} — anchors verified`);

const armTree = (arm) => {
  if (arm === 'base' || arm === 'restore') { writeFileSync(KIT, pristineKit); writeFileSync(LVL, pristineLvl); return 'pristine'; }
  const kit = patchKit(pristineKit);
  if (arm === 'cand') { writeFileSync(KIT, kit); writeFileSync(LVL, patchLvl(pristineLvl, 0.372, 0.348)); return 'cand s=0.372/0.348'; }
  if (arm === 'kb') { writeFileSync(KIT, kit); writeFileSync(LVL, patchLvl(pristineLvl, 0, 0)); return 'kb s=0/0'; }
  throw new Error(`unknown arm ${arm}`);
};
const restorePristine = () => {
  writeFileSync(KIT, pristineKit); writeFileSync(LVL, pristineLvl);
  const ok = sha(readFileSync(KIT)) === pristine.kitSha && sha(readFileSync(LVL)) === pristine.lvlSha;
  const tree = treeHash();
  log(`RESTORE pristine: files ${ok ? 'byte-verified' : 'MISMATCH — FATAL'}; tree now ${tree} (pristine ${pristine.tree}${tree === pristine.tree ? '' : ' — OTHER OWNERS EDITED MID-RUN, files above still verified'})`);
  if (!ok) throw new Error('pristine restore failed byte-verification');
};

for (const chunk of CHUNKS) {
  if (only && chunk.id !== only) continue;
  const framesOf = (a) => path.join(OUT, `${chunk.shot}.${a}.png`);
  if (ARMS.every((a) => existsSync(framesOf(a)))) { log(`chunk ${chunk.id}: all frames present — skipping (idempotent resume)`); continue; }

  const report = {
    prereg: 'PREREG-mradius.md', addendum: 'ADDENDUM-mradius-arrisweight.md', chunk: chunk.id,
    shot: chunk.shot, startedAt: new Date().toISOString(), pristine, arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk.id}.json`), JSON.stringify(report, null, 1));
  save();

  log(`chunk ${chunk.id} (${chunk.shot}): acquiring capture lock (FIFO — politely behind whatever holds it)`);
  const release = await acquire({
    onWait: (ms, pid) => log(`  · waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})`),
  });
  log(`chunk ${chunk.id}: lock HELD — edits are now inside the ticket`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
      '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
  });

  let baseTris = null, fatal = null;
  try {
    for (const arm of ARMS) {
      if (existsSync(framesOf(arm))) { log(`  ${chunk.shot}.${arm}: frame exists — skipping (resume)`); continue; }
      if (fatal) break;
      const ta = Date.now();
      const desc = armTree(arm);
      const srcAtArm = treeHash();
      log(`  arm ${arm} (${desc}) srcAtArm ${srcAtArm} — fresh vite + fresh context`);
      const port = await freePort();
      const server = await startServer(port);
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errs = [];
      try {
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
        page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`.slice(0, 300)));
        await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 30 * 60 * 1000, polling: 500 });
        const staged = await page.evaluate(async (n) => {
          const r = await window.__GAME.setShot(n);
          return { stats: r?.stats, warnings: r?.warnings?.length ?? 0, tod: window.__ENGINE.debug.timeOfDay };
        }, chunk.shot);
        const tris = staged.stats?.triangles ?? null, draws = staged.stats?.drawCalls ?? null;
        log(`  ${chunk.shot}.${arm}: setShot ok tod ${staged.tod} draws ${draws} tris ${tris}`);

        /* liveness probe — specified is not live (counted column, arm-to-arm ONLY) */
        if (arm === 'base') baseTris = tris;
        else if (baseTris != null && tris != null) {
          const d = tris - baseTris;
          if ((arm === 'cand' || arm === 'kb') && !(d > 0 && d <= 400)) {
            fatal = `${arm} tris delta vs base = ${d} (want 0 < d <= 400) — the edit did NOT reach the build`;
          }
          if (arm === 'restore' && d !== 0) {
            fatal = `restore tris delta vs base = ${d} (want exactly 0) — restore is not pristine`;
          }
          if (fatal) { log(`  FATAL LIVENESS: ${fatal}`); report.fatal = fatal; save(); }
        }
        if (!fatal) {
          await page.evaluate(async () => {
            await window.__GAME.step(10, 0);
            window.__GAME.capture('image/png');   // throwaway: warms the capture path
          });
          const dataUrl = await page.evaluate(() => window.__GAME.capture('image/png'));
          const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
          writeFileSync(framesOf(arm), buf);
          const rec = {
            arm, desc, srcAtArm, srcAfterArm: treeHash(), file: framesOf(arm), sha256: sha(buf),
            draws, tris, trisDeltaVsBase: baseTris != null && tris != null ? tris - baseTris : null,
            tod: staged.tod, consoleErrors: errs, secs: Math.round((Date.now() - ta) / 1000),
          };
          if (chunk.shot === 'hero') {
            try {
              const out = execSync(`node ${path.join(ROOT, 'progress/records/kerbband2.mjs')} ${framesOf(arm)}`, { encoding: 'utf8' });
              rec.kerbband2 = out.trim();
              const m = out.match(/ROI:\s*(\d+)/);
              rec.n = m ? parseInt(m[1], 10) : null;
            } catch (e) { rec.kerbband2 = `ERROR ${e.message}`; }
          }
          report.arms.push(rec);
          log(`  ${chunk.shot}.${arm}: CAPTURED sha ${rec.sha256.slice(0, 16)} ${rec.secs}s`
            + (rec.n != null ? `  kerbband2 n=${rec.n}` : '') + (errs.length ? `  consoleErrors ${errs.length}` : ''));
          save();
        }
      } finally {
        await ctx.close().catch(() => {});
        await stopServer(server);
      }
    }
  } finally {
    restorePristine();
    report.finishedAt = new Date().toISOString();
    report.restoredPristine = true;
    save();
    await browser.close().catch(() => {});
    release();
    log(`chunk ${chunk.id}: pristine restored + lock released`);
  }
  if (fatal) { log(`chunk ${chunk.id}: FATAL — ${fatal}; stopping (no further chunks)`); process.exit(2); }
}
log('ALL DONE');
