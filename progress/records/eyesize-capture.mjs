/**
 * eyesize-capture.mjs — the PREREG-eyesize one-boot chunked capture. CHARACTER.
 *
 * Executes the sealed plan exactly (PREREG-eyesize §6): arms A(base) / B(eyesize55) /
 * KB(eyebead15) / BACK(base) at `sly-closeup` + `combat`, 1280×720 q=high, ONE server ONE
 * browser, a FRESH page context per arm with `globalThis.__CHAR_AB` injected before any module
 * loads (tuftbias.mjs pattern — per-arm navigation, so §124.4 does not bind and the settle/
 * per-arm-hash discipline localises any foreign mid-run edit).
 *
 * THE SRC EDIT LIVES AND DIES INSIDE THE HELD TICKET (§150.1, §165; propshull2.mjs is the
 * proven §168 pattern this copies): withGame() would deadlock its own acquire, so this runner
 * acquires tools/lock.mjs itself, applies the registered token edit to src/player/SlyModel.js,
 * runs GATE 0 (occlude under both tokens) + the headratio pair offline inside the hold, boots
 * inline (SANDS_NO_HMR=1), captures, then REVERTS to byte-identity against a pre-run snapshot
 * before releasing. Crash-path revert handlers are installed BEFORE acquire() so revert
 * precedes lock release on exit/SIGINT/SIGTERM (process.once ordering).
 *
 * The seven edit sites are PREREG-eyesize §1's shape verbatim — lens-plane scale only:
 * right/trueUp radii and offsets ×EYE_E(), every outward offset and z-radius untouched, the
 * glint floored at 0.62. Each replacement is asserted exactly-once or the runner refuses.
 * Equivalence to eyesize-proj.mjs's transform is exact (prereg §1/§4; the lid's rotated basis
 * commutes because the in-plane scale is isotropic).
 *
 * DURABLE-EARLY (§163: ~45-min rollback horizon): every frame PNG and the merged arms JSON are
 * written to progress/records/eyesize/ THE MOMENT they exist — a rollback mid-run keeps every
 * landed arm. If this dies mid-run the committed partial record is the record; do not re-argue.
 *
 *   usage: bash tools/launch.sh progress/records/eyesize-capture.mjs <ABS log> <ABS pidfile>
 */
import { acquire } from '../../tools/lock.mjs';
import { chromium } from 'playwright';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SLY = path.join(ROOT, 'src', 'player', 'SlyModel.js');
const OUT = path.join(ROOT, 'progress', 'records', 'eyesize');
const FRAMES = path.join(OUT, 'frames');
const ARMS_JSON = path.join(OUT, 'eyesize-arms.json');

const SHOT_LIST = ['sly-closeup', 'combat'];
/* Arm labels -> tokens. `A2` exists for the §168-style rollback-recovery chunk: a second
   base arm captured in the SAME recovery boot as `A`, giving a within-boot base pair when a
   rollback has eaten the original A (boot 1's BACK then pairs with A cross-boot, recorded as
   a deviation in the RESULT, never silently converted). argv selects arms; default full plan. */
const TOKEN_OF = { A: '', B: 'eyesize55', KB: 'eyebead15', BACK: '', A2: '' };
const argLabels = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const l of argLabels) if (!(l in TOKEN_OF)) { console.error(`unknown arm label ${l}`); process.exit(2); }
const LABELS = argLabels.length ? argLabels : ['A', 'B', 'KB', 'BACK'];
const ARMS = LABELS.map((l) => [l, TOKEN_OF[l]]);
/* A base-only chunk needs NO src edit: EYE_E() = 1.0 is float-exact identity (x*1.0 === x for
   every finite IEEE value), so base-with-edit builds bit-identical geometry to pristine — and
   skipping the edit removes all src risk from a recovery chunk. */
const NEED_EDIT = ARMS.some(([, t]) => t !== '');

/* ---------------- the registered edit (PREREG-eyesize §1), byte-exact ---------------- */
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const slyBytesBefore = readFileSync(SLY);
const slyShaBefore = sha(slyBytesBefore);

const EYE_E_BLOCK = `
/* PREREG-eyesize arms (default-off; §153.5 token pattern). Lens-plane eye-unit scale:
   right/trueUp radii and in-plane offsets only — every outward offset and z-radius is
   untouched, because the sclera centre sits at SINK 0.92 with the mask band at inflate 1.058
   in front of it and only the lens's outward extent pokes it through the black (measured:
   a uniform scale at E<=0.55 renders ZERO eye pixels — the band swallows the lens). */
const EYE_E = () => (CHAR_AB('eyebead15') ? 0.15 : CHAR_AB('eyesize55') ? 0.55 : 1.0);
`;

const EDITS = [
  // 0: module-scope helper, appended immediately after CHAR_AB
  ['export function CHAR_AB(token) {\n  return charABRaw().split(/[,\\s]+/).filter(Boolean).includes(token);\n}\n',
    'export function CHAR_AB(token) {\n  return charABRaw().split(/[,\\s]+/).filter(Boolean).includes(token);\n}\n' + EYE_E_BLOCK],
  // 1: _eyeFrame pc — trueUp offset scales, outward clearance does not
  ['const pc = c.clone().addScaledVector(outward, 0.020 * S).addScaledVector(trueUp, 0.013 * S);',
    'const pc = c.clone().addScaledVector(outward, 0.020 * S).addScaledVector(trueUp, 0.013 * S * EYE_E());'],
  // 2: sclera radii
  ['center: c, radii: new THREE.Vector3(0.086 * S, 0.092 * S, 0.032 * S), basis,',
    'center: c, radii: new THREE.Vector3(0.086 * S * EYE_E(), 0.092 * S * EYE_E(), 0.032 * S), basis,'],
  // 3: pupil radii
  ['center: pc, radii: new THREE.Vector3(0.042 * S, 0.050 * S, 0.020 * S), basis,',
    'center: pc, radii: new THREE.Vector3(0.042 * S * EYE_E(), 0.050 * S * EYE_E(), 0.020 * S), basis,'],
  // 4: glint centre — in-plane offsets scale, outward does not
  ['.addScaledVector(trueUp, 0.020 * S).addScaledVector(right, -side * 0.015 * S);',
    '.addScaledVector(trueUp, 0.020 * S * EYE_E()).addScaledVector(right, -side * 0.015 * S * EYE_E());'],
  // 5: glint radii — floored so the catchlight survives the ~2.5 px ink ring
  ['center: hc, radii: new THREE.Vector3(0.013 * S, 0.013 * S, 0.009 * S), basis,',
    'center: hc, radii: new THREE.Vector3(0.013 * S * Math.max(EYE_E(), 0.62), 0.013 * S * Math.max(EYE_E(), 0.62), 0.009 * S), basis,'],
  // 6: lid radii
  ['radii: new THREE.Vector3(0.091 * S, 0.097 * S, 0.033 * S),',
    'radii: new THREE.Vector3(0.091 * S * EYE_E(), 0.097 * S * EYE_E(), 0.033 * S),'],
];

function countOf(hay, needle) { return hay.split(needle).length - 1; }

function applyEdit() {
  let t = readFileSync(SLY, 'utf8');
  if (EDITS.every(([, on]) => countOf(t, on) === 1)) { console.log('edit: already applied'); return; }
  for (const [off, on] of EDITS) {
    if (countOf(t, off) !== 1) throw new Error(`edit: expected exactly one site for:\n${off}\n— refusing (found ${countOf(t, off)})`);
    if (countOf(t, on) !== 0) throw new Error('edit: ON form already present — refusing');
    t = t.replace(off, on);
  }
  writeFileSync(SLY, t);
  console.log(`edit APPLIED inside held ticket: ${EDITS.length} sites in src/player/SlyModel.js (PREREG-eyesize §1)`);
}

function revertEdit() {
  let t;
  try { t = readFileSync(SLY, 'utf8'); } catch { return; }
  let changed = false;
  for (const [off, on] of EDITS) {
    if (countOf(t, on) === 1) { t = t.replace(on, off); changed = true; }
  }
  if (changed) writeFileSync(SLY, t);
  if (sha(readFileSync(SLY)) !== slyShaBefore) {
    console.error('revert: byte-identity FAILED after site revert — restoring pre-run snapshot bytes');
    writeFileSync(SLY, slyBytesBefore);
  }
  const ok = sha(readFileSync(SLY)) === slyShaBefore;
  console.log(`edit REVERTED — src/player/SlyModel.js byte-identical to pre-run snapshot: ${ok}`);
  if (!ok) console.error('*** REVERT VERIFICATION FAILED — src/** IS DIRTY. DO NOT SCORE. ***');
}

/* Crash-path revert BEFORE acquire(), so revert precedes lock release in handler order. */
process.once('exit', () => { try { revertEdit(); } catch {} });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => { try { revertEdit(); } catch {} ; process.exit(sig === 'SIGINT' ? 130 : 143); });
}

/* ---------------- provenance (§121.4 / §160.5) ---------------- */
const SRC_DIRS = 'src/player src/fx src/textures src/render src/world src/core';
const srcTree = () =>
  execSync(`git ls-files -z ${SRC_DIRS} | xargs -0 sha256sum | sha256sum`, { cwd: ROOT })
    .toString().trim().split(/\s/)[0].slice(0, 16);
const gitHead = () => execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();

/* ---------------- offline in-hold instruments (GATE 0 + headratio pair) -------------- */
function nodeWithToken(token, file, arg) {
  const script = `globalThis.__CHAR_AB=${JSON.stringify(token)}; if (${JSON.stringify(arg ?? '')}) process.argv[2]=${JSON.stringify(arg ?? '')}; await import(${JSON.stringify(file)});`;
  return execFileSync('node', ['--input-type=module', '-e', script], { cwd: ROOT, timeout: 180000 }).toString();
}

/* ---------------- inline boot (propshull2.mjs precedent) ---------------- */
const CHROME_CANDIDATES = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const CHROME_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
  '--disable-frame-rate-limit', '--js-flags=--max-old-space-size=4096',
  '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
];
async function freePort(start = 5480) {
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
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },   // freeze: no watch, no HMR
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 160; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened on ${port}:\n${log}`);
}

/* ---------------- incremental record ---------------- */
function saveRecord(rec) {
  let prev = {};
  try { prev = JSON.parse(readFileSync(ARMS_JSON, 'utf8')); } catch {}
  const merged = { ...prev, ...rec, arms: { ...(prev.arms || {}), ...(rec.arms || {}) } };
  writeFileSync(ARMS_JSON, JSON.stringify(merged, null, 2));
}

/* ================================ run ================================ */
mkdirSync(FRAMES, { recursive: true });
console.log(`eyesize-capture pid ${process.pid}  HEAD ${gitHead()}`);
const srcCommitted = srcTree();
console.log(`src tree COMMITTED (pre-edit): ${srcCommitted}   [${SRC_DIRS}]`);
saveRecord({ startedAt: new Date().toISOString(), head: gitHead(), srcCommitted, plan: { arms: ARMS, shots: SHOT_LIST } });

const release = await acquire({
  onWait: (ms, pid) => console.log(`· waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid}) — FIFO, queued politely`),
});
console.log('lock ACQUIRED — ticket held; applying the registered token edit');

let server = null, browser = null;
try {
  if (NEED_EDIT) {
    applyEdit();
    const srcEdited = srcTree();
    console.log(`src tree EDITED (capture tree, token arms boot from it): ${srcEdited}`);
    saveRecord({ srcEdited });

    /* ---- GATE 0: occlude under both tokens, inside the hold, before boot (PREREG §6) ---- */
    const gate0 = {};
    for (const token of ['', 'eyesize55', 'eyebead15']) {
      const outTxt = nodeWithToken(token, path.join(ROOT, 'tools', 'occlude.mjs'), 'sly-closeup');
      const centreLines = outTxt.split('\n').filter((l) => l.includes('centre'));
      const clear = centreLines.length === 2 && centreLines.every((l) => l.includes('CLEAR to camera'));
      gate0[token || 'base'] = { clear, centreLines: centreLines.map((s) => s.trim()) };
      console.log(`GATE 0 occlude [${token || 'base'}]: centre rays ${clear ? 'BOTH CLEAR' : 'NOT CLEAR — ABORTING'}`);
      if (!clear) { for (const l of centreLines) console.log(`   ${l.trim()}`); }
      if (!clear) throw new Error(`GATE 0 failed for token '${token}' — arm abandoned unrun per PREREG §6`);
    }
    saveRecord({ gate0 });

    /* ---- headratio pair (GATE 5 input), inside the hold, offline ---- */
    const headratio = {};
    for (const token of ['', 'eyesize55']) {
      const txt = nodeWithToken(token, path.join(ROOT, 'tools', 'headratio.mjs'), '');
      const m = txt.match(/HEAD:BODY\s*=\s*([0-9.]+)/);
      headratio[token || 'base'] = m ? parseFloat(m[1]) : null;
      console.log(`headratio [${token || 'base'}]: ${m ? m[1] : 'UNPARSED — raw follows'}`);
      if (!m) console.log(txt.slice(0, 400));
    }
    saveRecord({ headratio });
  } else {
    console.log('base-only chunk — no src edit, no GATE 0 re-run (boot 1 recorded them)');
  }

  /* ---- boot ---- */
  const port = await freePort();
  server = await startServer(port);
  const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
  browser = await chromium.launch({ executablePath, args: CHROME_ARGS });
  const baseUrl = `http://127.0.0.1:${port}/?shot=1&q=high`;
  console.log(`server up on :${port} — capturing ${ARMS.length} arms × ${SHOT_LIST.length} shots from ${baseUrl}`);

  for (const [label, token] of ARMS) {
    const t0 = Date.now();
    const srcAtArm = srcTree();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    // Runs before ANY page script, so the model's per-call CHAR_AB()/EYE_E() sees it at build.
    await ctx.addInitScript(`globalThis.__CHAR_AB = ${JSON.stringify(token)};`);
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

    await p.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
    const seen = await p.evaluate(() => ({
      charAB: String(globalThis.__CHAR_AB ?? '(unset)'),
      warnings: window.__GAME.warnings.length,
    }));

    const arm = { token: token || '(none)', charAB: seen.charAB, srcAtArm, shots: {}, consoleErrors: errs };
    for (const shotName of SHOT_LIST) {
      const r = await p.evaluate(async (n) => {
        const out = await window.__GAME.setShot(n);
        return { stats: out.stats, dataUrl: window.__GAME.capture('image/png') };
      }, shotName);
      const buf = Buffer.from(r.dataUrl.split(',')[1], 'base64');
      const file = path.join(FRAMES, `${shotName}-${label}.png`);
      writeFileSync(file, buf);   // durable the moment it exists
      arm.shots[shotName] = { file: path.relative(ROOT, file), sha: sha(buf), bytes: buf.length, stats: r.stats };
      console.log(`arm ${label.padEnd(4)} ${shotName.padEnd(12)} sha ${arm.shots[shotName].sha.slice(0, 16)}  ${buf.length}b  draws ${r.stats?.drawCalls}`);
      saveRecord({ arms: { [label]: arm } });   // incremental after EVERY shot
    }
    arm.srcAfterArm = srcTree();
    arm.secs = ((Date.now() - t0) / 1000) | 0;
    if (arm.srcAfterArm !== srcAtArm) console.log(`  <-- TREE MOVED DURING ARM ${label}: ${srcAtArm} -> ${arm.srcAfterArm}`);
    saveRecord({ arms: { [label]: arm } });
    console.log(`arm ${label} done in ${arm.secs}s  charAB=${seen.charAB}  src@arm=${srcAtArm}`);
    await ctx.close();
  }

  /* ---- gates that live in the record, computed now for the scorer ---- */
  const rec = JSON.parse(readFileSync(ARMS_JSON, 'utf8'));
  const backIdentical = {}, a2Identical = {};
  for (const s of SHOT_LIST) {
    backIdentical[s] = !!rec.arms?.A?.shots?.[s]?.sha && rec.arms.A.shots[s].sha === rec.arms?.BACK?.shots?.[s]?.sha;
    if (rec.arms?.A2) a2Identical[s] = !!rec.arms?.A?.shots?.[s]?.sha && rec.arms.A.shots[s].sha === rec.arms.A2.shots?.[s]?.sha;
  }
  if (rec.arms?.A2) saveRecord({ a2IdenticalByShot: a2Identical });
  const armsByTree = {};
  for (const [k, v] of Object.entries(rec.arms || {})) (armsByTree[v.srcAtArm] ??= []).push(k);
  saveRecord({ backIdenticalByShot: backIdentical, armsByTree, finishedArmsAt: new Date().toISOString() });
  console.log(`BACK sha identical to A: ${JSON.stringify(backIdentical)} (byte-identity is stronger than the ≤200px gate; px diff is the scorer's)`);
  console.log(`arms by tree: ${JSON.stringify(armsByTree)}`);
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) server.kill('SIGTERM'); } catch {}
  revertEdit();                             // inside the held ticket, before release
  const srcAfter = srcTree();
  console.log(`src tree AFTER revert: ${srcAfter}  MATCHES COMMITTED: ${srcAfter === srcCommitted}`);
  saveRecord({ srcAfterRevert: srcAfter, revertMatchesCommitted: srcAfter === srcCommitted, doneAt: new Date().toISOString() });
  release();
  console.log('lock RELEASED');
}
console.log('DONE');
