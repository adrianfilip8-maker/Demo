/**
 * capbill.mjs — the A/B/BACK capture for PREREG-capbill.md, exactly as sealed.
 *
 * THREE arms in ONE lock hold (prereg §6), tuftbias.mjs pattern (per-arm srcAtArm/srcAfterArm,
 * armsByTree, navigation per arm so §124.4 does NOT apply — §159.3), TWO shots per arm:
 *
 *   A     token line PRESENT, __CHAR_AB=''          base (capYaw evaluates 0 = identity)
 *   B     token line PRESENT, __CHAR_AB='capyaw10'  capYaw −0.175 rad (−10°)
 *   BACK  token line PRESENT, __CHAR_AB=''          re-run of A; GATE 3 requires ≡ A
 *
 * WHY THIS FILE OWNS ITS BOOT instead of calling tools/harness.mjs withGame(): the prereg's
 * hard rule is that the src edit (the registered one-line token site at SlyModel.js:2540) is
 * made ONLY inside the held capture ticket, and the cleanest tree discipline is that the vite
 * server is BORN on the edited tree so all three arms navigate one tree. withGame() acquires
 * the lock itself, and lock.mjs's module-level ticket state cannot be acquired twice by one
 * process — so this file calls acquire() first, edits, then boots vite/chromium with the same
 * settings withGame uses (port scan, SANDS_NO_HMR, ANGLE/SwiftShader args, q=high 1280x720).
 *
 * EDIT/REVERT: the exact registered edit shape (prereg §1), applied by unique-string
 * replacement, reverted inside the same lock hold after BACK, byte-identity verified against
 * the held original content. §153.5's "never edit-and-revert" refers to toggling the CONSTANT
 * between arms — here the token line is present for every arm and the toggle is runtime
 * (__CHAR_AB via addInitScript), which is that rule's compliant form. Default-off means the
 * A/BACK builds are the shipped geometry (makeRotationY(0) is an exact identity).
 *
 * DURABILITY (§163/§164): every frame is written DIRECTLY to progress/records/capbill/frames/
 * (the committed path), capbill.json is rewritten after every capture, and stdout (the launch
 * log) lives at progress/records/capbill/capbill-run.log. A rollback mid-run leaves a partial
 * record that states exactly what landed.
 *
 * Emits PNGs and provenance only — the scoring is capbill-score.mjs's (committed separately,
 * before scoring), per the seal's "records scorer implementing exactly this definition".
 */
import { chromium } from 'playwright';
import { acquire } from '../../tools/lock.mjs';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';

const ROOT = '/home/user/Demo';
const REC = path.join(ROOT, 'progress/records/capbill');
const FRAMES = path.join(REC, 'frames');
const SLY = path.join(ROOT, 'src/player/SlyModel.js');
const W = 1280, H = 720, QUALITY = 'high';
const SHOTS = ['sly-closeup', 'combat'];
const ARMS = [['A', ''], ['B', 'capyaw10'], ['BACK', '']];

/* The registered edit, prereg §1, at the file's real indentation. Site verified unique. */
const SHIPPED_SITE = `    const tilt = new THREE.Matrix4().makeRotationX(TUNE.capTip)
      .premultiply(new THREE.Matrix4().makeRotationZ(TUNE.capCock));`;
const TOKENED_SITE = `    const capYaw = CHAR_AB('capyaw10') ? -0.175 : 0;
    const tilt = new THREE.Matrix4().makeRotationX(TUNE.capTip)
      .premultiply(new THREE.Matrix4().makeRotationZ(TUNE.capCock))
      .premultiply(new THREE.Matrix4().makeRotationY(capYaw));`;

/* srcTree per the PREREG's registered recipe (find-based, repo-relative, from repo root) —
 * deliberately NOT `git ls-files` (this task runs no git). Same digest the prereg registered:
 * 3fea650a4d645857 at registration. sha256sum hashes the paths too; keep cwd = ROOT. */
const srcTree = () =>
  execSync(`find src -name '*.js' | sort | xargs sha256sum | sha256sum`, { cwd: ROOT })
    .toString().trim().slice(0, 16);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fileSha = (p) => sha256(readFileSync(p));
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

mkdirSync(FRAMES, { recursive: true });
const acc = {
  seal: 'progress/records/PREREG-capbill.md',
  startedAt: new Date().toISOString(),
  regTree: '3fea650a4d645857',
  srcTree0: null, srcTreeEdited: null, srcTreeAfterRevert: null,
  slySha0: null, slyShaEdited: null, slyShaAfterRevert: null,
  settle: null, gate0inticket: null, headratio: null,
  arms: {}, phase: 'init',
};
const flush = () => writeFileSync(path.join(REC, 'capbill.json'), JSON.stringify(acc, null, 2));

acc.srcTree0 = srcTree();
acc.slySha0 = fileSha(SLY);
log(`srcTree BEFORE: ${acc.srcTree0}  (registration tree ${acc.regTree}${acc.srcTree0 === acc.regTree ? ' — MATCH' : ' — MOVED, note in scoring'})`);
flush();

/* -------- settle gate (tuftbias.mjs pattern): tree quiet 120 s before boot ---------- */
async function settle(quietMs = 120000, maxWaitMs = 20 * 60 * 1000) {
  const t0 = Date.now();
  let last = srcTree(), since = Date.now();
  while (Date.now() - since < quietMs) {
    if (Date.now() - t0 > maxWaitMs) { log(`settle: gave up after ${((Date.now() - t0) / 60000) | 0} min; per-arm hashes will localise any move`); return false; }
    await new Promise((r) => setTimeout(r, 5000));
    const now = srcTree();
    if (now !== last) { log(`settle: src tree moved ${last} -> ${now}; restarting quiet window`); last = now; since = Date.now(); }
  }
  log(`settle: src tree quiet ${quietMs / 1000}s at ${last}`);
  return true;
}

/* ---------------- edit / revert, inside the held ticket only ---------------- */
let originalContent = null; // exact bytes to restore
let applied = false;
function applyEdit() {
  originalContent = readFileSync(SLY, 'utf8');
  const n = originalContent.split(SHIPPED_SITE).length - 1;
  if (n !== 1) throw new Error(`edit site count ${n} != 1 — tree moved under us, ABORT before any edit`);
  writeFileSync(SLY, originalContent.replace(SHIPPED_SITE, TOKENED_SITE));
  applied = true;
  acc.slyShaEdited = fileSha(SLY);
  acc.srcTreeEdited = srcTree();
  log(`token edit APPLIED at SlyModel.js:2540 — srcTree ${acc.srcTree0} -> ${acc.srcTreeEdited}`);
  flush();
}
function revertEdit() {
  if (!applied) return;
  const cur = readFileSync(SLY, 'utf8');
  if (cur === originalContent) { applied = false; return; } // already shipped bytes
  if (acc.slyShaEdited && sha256(Buffer.from(cur)) === acc.slyShaEdited) {
    writeFileSync(SLY, originalContent); // untouched since our edit: restore exact bytes
  } else if (cur.includes(TOKENED_SITE)) {
    // someone else edited SlyModel.js mid-run: remove ONLY our token lines, keep their edit
    writeFileSync(SLY, cur.replace(TOKENED_SITE, SHIPPED_SITE));
    log('REVERT WARNING: SlyModel.js moved mid-run; token lines removed surgically, other edit preserved');
  } else {
    log('REVERT CONFLICT: token site not found and file moved — NOT overwriting; report to coordinator');
    applied = false;
    return;
  }
  applied = false;
  acc.slyShaAfterRevert = fileSha(SLY);
  acc.srcTreeAfterRevert = srcTree();
  log(`token edit REVERTED — SlyModel sha ${acc.slyShaAfterRevert === acc.slySha0 ? 'BYTE-IDENTICAL to pre-edit' : 'DIFFERS from pre-edit (mid-run edit by another owner?)'}; srcTree ${acc.srcTreeAfterRevert}`);
  flush();
}
process.on('exit', () => { try { revertEdit(); } catch {} });

/* ---------------- in-ticket GATE 0 + headratio (CPU, no renderer) ---------------- */
function nodeEvalTool(toolAbs, arg, token) {
  const src = `globalThis.__CHAR_AB=${JSON.stringify(token)}; process.argv[2]=${JSON.stringify(arg)}; await import(${JSON.stringify('file://' + toolAbs)});`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', src], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
}
function gate0InTicket() {
  const occ = path.join(ROOT, 'tools/occlude.mjs');
  const base = nodeEvalTool(occ, 'sly-closeup', '');
  const tok = nodeEvalTool(occ, 'sly-closeup', 'capyaw10');
  const combatBase = nodeEvalTool(occ, 'combat', '');
  const combatTok = nodeEvalTool(occ, 'combat', 'capyaw10');
  const clearRays = (s) => ['eyeL centre', 'eyeL white+x', 'eyeR centre', 'eyeR white+x']
    .every((r) => s.split('\n').some((l) => l.includes(r) && l.includes('CLEAR to camera')));
  const pass = tok === base && clearRays(tok);
  acc.gate0inticket = { pass, closeupIdenticalToBase: tok === base, closeupClearRays: clearRays(tok) };
  writeFileSync(path.join(REC, 'occlude-inticket.txt'),
    `# in-ticket GATE 0 re-run on the REAL edited tree (srcTree ${acc.srcTreeEdited})\n` +
    `== closeup base (token line present, token off)\n${base}\n== closeup token capyaw10\n${tok}\n` +
    `== combat base\n${combatBase}\n== combat token capyaw10\n${combatTok}\n`);
  log(`in-ticket GATE 0: ${pass ? 'PASS' : 'FAIL'} (closeup token==base: ${tok === base})`);
  flush();
  return pass;
}
function headratioBothWays() {
  const hr = path.join(ROOT, 'tools/headratio.mjs');
  const grab = (s) => (s.match(/HEAD:BODY = (\d+\.\d+)/) || [])[1] ?? null;
  const off = grab(nodeEvalTool(hr, 'idle_confident', ''));
  const on = grab(nodeEvalTool(hr, 'idle_confident', 'capyaw10'));
  acc.headratio = { tokenOff: off, tokenOn: on, unchangedTo2dp: off != null && off === on };
  log(`headratio idle_confident: off ${off} / on ${on} ${off === on ? '(unchanged — GATE 4 clause holds)' : '<-- MOVED, GATE 4 will fail'}`);
  flush();
}

/* ---------------- boot plumbing (patterned on tools/harness.mjs) ---------------- */
const CHROME_CANDIDATES = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
  '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'];
async function freePort(start = 5400) {
  for (let p = start; p < start + 300; p++) {
    const ok = await new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startServer(port) {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  let logBuf = '';
  proc.stdout.on('data', (d) => { logBuf += d; });
  proc.stderr.on('data', (d) => { logBuf += d; });
  for (let i = 0; i < 160; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${logBuf}`);
    const up = await new Promise((res) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { res(true); s.destroy(); }); s.once('error', () => res(false)); s.setTimeout(2000, () => { res(false); s.destroy(); }); });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened on ${port}:\n${logBuf}`);
}

/* ================================ run ==================================== */
const release = await acquire({
  onWait: (ms, pid) => process.stdout.write(`. waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})\n`),
});
log('capture lock HELD — ticket honoured (FIFO)');
acc.phase = 'locked'; flush();

let server = null, browser = null;
try {
  acc.settle = await settle();
  applyEdit();

  if (!gate0InTicket()) {
    log('GATE 0 FAILED in-ticket — the capture does not run (prereg §6). Reverting and releasing.');
    acc.phase = 'gate0-fail'; flush();
    process.exitCode = 2;
  } else {
    headratioBothWays();

    const port = await freePort();
    server = await startServer(port);
    log(`vite up on ${port} (SANDS_NO_HMR=1, born on the edited tree)`);
    const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
    browser = await chromium.launch({ executablePath, args: CHROME_ARGS });
    const baseUrl = `http://127.0.0.1:${port}/?shot=1&q=${QUALITY}`;
    acc.phase = 'arms'; flush();

    for (const [label, token] of ARMS) {
      const t0 = Date.now();
      const srcAtArm = srcTree();
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      // Before ANY page script, so CHAR_AB() sees it at build time (tuftbias.mjs pattern).
      await ctx.addInitScript(`globalThis.__CHAR_AB = ${JSON.stringify(token)};`);
      const p = await ctx.newPage();
      const errs = [];
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

      await p.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await p.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 1500000, polling: 500 });
      const seen = await p.evaluate(() => ({
        charAB: String(globalThis.__CHAR_AB ?? '(unset)'),
        tris: window.__ENGINE?.get?.('character')?.triangles ?? null,
        renderer: (() => { const gl = window.__ENGINE?.renderer?.getContext?.(); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })(),
      }));
      const arm = { token: token || '(none)', charAB: seen.charAB, renderer: seen.renderer, triangles: seen.tris, srcAtArm, shots: {}, consoleErrors: errs };
      acc.arms[label] = arm; flush();

      for (const shotName of SHOTS) {
        const s0 = Date.now();
        const r = await p.evaluate(async (n) => {
          const out = await window.__GAME.setShot(n);
          return { stats: out.stats, warnings: out.warnings, dataUrl: window.__GAME.capture('image/png') };
        }, shotName);
        const buf = Buffer.from(r.dataUrl.split(',')[1], 'base64');
        const file = path.join(FRAMES, `${shotName}-${label}.png`);
        writeFileSync(file, buf); // DIRECTLY on the durable committed path (§164.1)
        const stagingWarnings = r.warnings.filter((w) => w.includes('setShot'));
        arm.shots[shotName] = {
          file: path.relative(ROOT, file), sha256: sha256(buf), bytes: buf.length,
          stats: r.stats, warningsTotal: r.warnings.length, stagingWarnings, secs: ((Date.now() - s0) / 1000) | 0,
        };
        log(`arm ${label.padEnd(4)} ${shotName.padEnd(12)} sha ${arm.shots[shotName].sha256.slice(0, 16)} ${arm.shots[shotName].bytes}b ${arm.shots[shotName].secs}s${stagingWarnings.length ? ' STAGING WARNINGS: ' + stagingWarnings.join(' | ') : ''}`);
        flush();
      }
      arm.srcAfterArm = srcTree();
      arm.secs = ((Date.now() - t0) / 1000) | 0;
      log(`arm ${label} done in ${arm.secs}s  charAB=${seen.charAB || '(none)'}  src@arm=${srcAtArm}${arm.srcAfterArm === srcAtArm ? '' : ` -> ${arm.srcAfterArm} <-- TREE MOVED DURING ARM`}`);
      flush();
      await ctx.close();
    }
    acc.phase = 'captured'; flush();
  }
} catch (e) {
  log(`RUN ERROR: ${e.stack || e}`);
  acc.error = String(e && e.stack || e);
  acc.phase = 'error';
  flush();
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) { server.kill('SIGTERM'); setTimeout(() => { try { server.kill('SIGKILL'); } catch {} }, 3000); } } catch {}
  try { revertEdit(); } catch (e) { log(`REVERT ERROR: ${e}`); }
  release();
  log('lock RELEASED (after revert, per the seal)');
}

/* ---------------- same-wake quick checks (shas only; scoring is the scorer's) -------- */
if (acc.phase === 'captured') {
  const byTree = {};
  for (const [k, v] of Object.entries(acc.arms)) (byTree[v.srcAtArm] ??= []).push(k);
  acc.armsByTree = byTree;
  acc.comparablePairs = Object.values(byTree).filter((g) => g.length > 1);
  acc.backIdentical = {}; acc.armsDiffer = {};
  for (const s of SHOTS) {
    const a = acc.arms.A?.shots[s]?.sha256, b = acc.arms.B?.shots[s]?.sha256, back = acc.arms.BACK?.shots[s]?.sha256;
    acc.backIdentical[s] = !!a && a === back;
    acc.armsDiffer[s] = !!a && a !== b;
    log(`${s}: BACK==A ${acc.backIdentical[s] ? 'BIT-IDENTICAL' : 'DIFFERS (scorer applies GATE 3 px threshold)'}; A!=B ${acc.armsDiffer[s]}`);
  }
  acc.phase = 'done';
  acc.finishedAt = new Date().toISOString();
  flush();
  log('capbill DONE');
} else {
  acc.finishedAt = new Date().toISOString();
  flush();
  log(`capbill ended in phase ${acc.phase} — see above; partial record stands (§163.1)`);
}
