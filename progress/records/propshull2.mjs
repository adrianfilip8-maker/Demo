#!/usr/bin/env node
/* propshull2 — PREREG-hullkerb.md's registered capture: the gold-only prop hull.
 *
 * Derived from propshull.mjs (Task #28's runner) with the seal's three registered deltas:
 *
 *   1. CLONE THE INK MATERIAL onto the `userData.propsHull` shells once, before the arm loop.
 *      The ink material is cached and SHARED by (px|colour|opacity) key
 *      (ToonMaterial.js:1165–1176), so poking `uThickness` on the shared instance could
 *      thicken any same-key shell anywhere in the scene. The clone gives the poke a private
 *      home. Two traps the naive `material.clone()` walks into, both handled here:
 *        a. `ShaderMaterial.clone()` deep-copies EVERY uniform — including the shared
 *           Shading uniform objects (light/atmosphere/time, ToonMaterial.js:717–722) whose
 *           whole contract is identity-sharing. A raw clone renders with a dead snapshot of
 *           the lighting. Fix: after cloning, re-point every uniform EXCEPT `uThickness`
 *           back to the source material's uniform objects BY IDENTITY.
 *        b. `setInkNight()` iterates `_inkCache.values()` (ToonMaterial.js:1444); the clone
 *           is not in the cache, so the guard/night ink lerp would never reach it. Sharing
 *           `uInkSun`/`uInkShade` by identity (fix a) makes the lerp land on the clone for
 *           free — the night arms render the shell with the same ink the cache gets.
 *      Net: the clone renders bit-equivalently to the cached material at uThickness 2.5,
 *      and owns exactly one private uniform — the one the calibration arm pokes.
 *
 *   2. THE `hull3x` ARM (§13 calibration, known-bad by construction): clone uThickness
 *      2.5 → 7.5 for that arm only, with per-arm readback of BOTH the clone's and the cached
 *      original's uThickness printed, so the log itself proves the poke stayed confined.
 *      7.5 px on PostFX's 1.5 px line MUST read heavy/doubled; if `hull` and `hull3x` are
 *      indistinguishable at the registered ROIs the outcome is UNSCOREABLE (§141).
 *
 *   3. THE §2.5 RIDE-ALONGS: `hero` joins the shot list at `base` only (R2's kerb-band
 *      liveness frame). guard/night ride as base/hull pairs exactly as before (R1 scans
 *      them offline; kerbline.mjs / kerbband2.mjs cost no lock time).
 *
 * Arms per decisive shot: base → base2 → hull → hull3x → restore (P1/P2 validity unchanged).
 * Toggled by DETACH/ATTACH of the tagged shells, never `.visible` — §143:
 * `setOutlinesVisible()` rewrites `.visible` on every shell every frame via
 * `beginNormalPass`/`endNormalPass`, so a `.visible` "off" arm is silently not off.
 * dt pinned to 0 on every step (§28's phase trap; `base2` proves the pin held).
 *
 * THE ONE-LINE SRC EDIT, AND WHY THIS RUNNER DOES NOT USE withGame().
 * `src/world/Props.js:135` `new Set()` → `new Set(['gold'])` may exist ONLY inside a held
 * capture ticket (§150.1: the edit itself is a lock-holder; §159.1: per-arm-navigating
 * harnesses re-read the tree, so an edit outside a held window voids a neighbour's arms).
 * withGame() acquires the lock internally AFTER which it immediately boots — there is no
 * seam to put the edit in, and acquiring first outside it would deadlock its own acquire.
 * So this runner takes the lock itself via tools/lock.mjs (same FIFO, same queue — it waits
 * politely behind any older ticket), applies the edit, boots inline (the documented
 * shot.mjs precedent for keeping a private copy of the boot logic), captures, and REVERTS
 * the edit before releasing — with byte-identity against a pre-run snapshot verified and
 * the snapshot written back if verification ever fails. Crash paths: the revert handlers
 * are installed BEFORE acquire() so they run BEFORE lock.mjs's release handlers
 * (`process.once` order), keeping revert-then-release true on SIGINT/SIGTERM/exit too.
 *
 * DURABILITY (§163–§164): frames are written DIRECTLY to the durable path
 * progress/records/hullkerb/frames/ (shots/ is volatile under rollback), arms.json is
 * rewritten after EVERY arm, and the run is chunked by shot via argv so each boot stays
 * ~10–15 min with every registered comparison inside one boot:
 *     chunk 1: interior          (decisive)
 *     chunk 2: courtyard         (collateral guard)
 *     chunk 3: guard night hero  (ride-alongs)
 * srcTree stamped per arm (§160.5 discipline, tuftbias.mjs's implementation: the hash is of
 * working-tree bytes, so it names the EDITED tree during arms and the committed tree after
 * revert — both printed).
 *
 * usage: node progress/records/propshull2.mjs [shot ...]        (launch via tools/launch.sh)
 */
import { acquire } from '../../tools/lock.mjs';
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'progress', 'records', 'hullkerb');
const FRAMES = path.join(OUT, 'frames');
const ARMS_JSON = path.join(OUT, 'arms.json');

const FULL = ['base', 'base2', 'hull', 'hull3x', 'restore'];
const PAIR = ['base', 'hull'];
const PLAN = [
  { shot: 'interior', arms: FULL },   // decisive
  { shot: 'courtyard', arms: FULL },  // collateral guard — cannot rescue interior
  { shot: 'guard', arms: PAIR },      // R1 ride-along
  { shot: 'night', arms: PAIR },      // R1 ride-along
  { shot: 'hero', arms: ['base'] },   // R2 ride-along (kerb-band liveness frame)
];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SHOTS = only.length ? PLAN.filter((p) => only.includes(p.shot)) : PLAN;
if (!SHOTS.length) { console.error(`no valid shots in argv: ${only.join(' ')}`); process.exit(2); }

/* ---------------- the one-line edit ---------------- */
const PROPS = path.join(ROOT, 'src', 'world', 'Props.js');
const LINE_OFF = 'const HULL_KEYS = new Set();';
const LINE_ON = "const HULL_KEYS = new Set(['gold']);";
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const propsBytesBefore = readFileSync(PROPS);
const propsShaBefore = sha(propsBytesBefore);

function countOf(hay, needle) { return hay.split(needle).length - 1; }

function applyEdit() {
  const t = readFileSync(PROPS, 'utf8');
  if (countOf(t, LINE_ON) === 1 && countOf(t, LINE_OFF) === 0) { console.log('edit: already applied'); return; }
  if (countOf(t, LINE_OFF) !== 1) throw new Error(`edit: expected exactly one "${LINE_OFF}" in Props.js — refusing`);
  writeFileSync(PROPS, t.replace(LINE_OFF, LINE_ON));
  console.log(`edit APPLIED inside held ticket: Props.js:135 ${LINE_OFF} -> ${LINE_ON}`);
}

function revertEdit() {
  let t;
  try { t = readFileSync(PROPS, 'utf8'); } catch { return; }
  if (countOf(t, LINE_ON) === 1) {
    writeFileSync(PROPS, t.replace(LINE_ON, LINE_OFF));
    t = readFileSync(PROPS, 'utf8');
  }
  if (sha(Buffer.from(t)) !== propsShaBefore) {
    console.error('revert: byte-identity FAILED after line revert — restoring pre-run snapshot bytes');
    writeFileSync(PROPS, propsBytesBefore);
  }
  const ok = sha(readFileSync(PROPS)) === propsShaBefore;
  console.log(`edit REVERTED — src/world/Props.js byte-identical to pre-run snapshot: ${ok}`);
  if (!ok) console.error('*** REVERT VERIFICATION FAILED — src/** IS DIRTY. DO NOT SCORE. ***');
}

/* Crash-path revert BEFORE acquire(), so revert precedes lock release in handler order. */
process.once('exit', () => { try { revertEdit(); } catch {} });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => { try { revertEdit(); } catch {} ; process.exit(sig === 'SIGINT' ? 130 : 143); });
}

/* ---------------- §160.5 srcTree ---------------- */
const SRC_DIRS = 'src/player src/fx src/textures src/render src/world src/core';
const srcTree = () =>
  execSync(`git ls-files -z ${SRC_DIRS} | xargs -0 sha256sum | sha256sum`, { cwd: ROOT })
    .toString().trim().split(/\s/)[0];

/* ---------------- inline boot (shot.mjs precedent; harness.mjs untouched) ---------------- */
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
  if (!existsSync(bin)) throw new Error('vite not installed');
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },   // freeze the build at boot
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

/* ---------------- incremental arms.json ---------------- */
function saveArms(record) {
  let prev = { arms: [] };
  try { prev = JSON.parse(readFileSync(ARMS_JSON, 'utf8')); } catch {}
  const seen = new Set(record.arms.map((a) => `${a.shot}-${a.label}`));
  const kept = (prev.arms || []).filter((a) => !seen.has(`${a.shot}-${a.label}`));
  const merged = {
    ...prev, ...record,
    arms: [...kept, ...record.arms].sort((a, b) => a.shot.localeCompare(b.shot) || a.ts - b.ts),
    chunks: { ...(prev.chunks || {}), ...(record.chunks || {}) },
  };
  writeFileSync(ARMS_JSON, JSON.stringify(merged, null, 2));
}

/* ================================ run ================================ */
mkdirSync(FRAMES, { recursive: true });
const chunkName = only.length ? only.join('+') : 'all';
const srcCommitted = srcTree();
console.log(`propshull2 chunk [${chunkName}]  pid ${process.pid}`);
console.log(`src tree COMMITTED (pre-edit): ${srcCommitted}   [${SRC_DIRS}]`);

const release = await acquire({
  onWait: (ms, pid) => console.log(`· waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid}) — FIFO, queued politely`),
});
console.log('lock ACQUIRED — ticket held; applying the registered one-line edit');

let server = null, browser = null;
const consoleErrors = [];
try {
  applyEdit();
  const srcEdited = srcTree();
  console.log(`src tree EDITED (capture tree): ${srcEdited}`);

  const port = await freePort();
  server = await startServer(port);
  const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
  browser = await chromium.launch({ executablePath, args: CHROME_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 300000, polling: 500 });
  const info = await page.evaluate(() => ({
    warnings: window.__GAME.warnings.slice(),
    renderer: (() => {
      const gl = window.__ENGINE?.renderer?.getContext?.();
      const d = gl?.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
    })(),
  }));
  console.log(`boot OK — renderer: ${info.renderer}; ${info.warnings.length} boot warning(s)`);

  /* ---- inventory: prove the shells exist and are gold-only, before any arm ---- */
  const inv = await page.evaluate(() => {
    const out = [];
    window.__ENGINE.scene.traverse((o) => {
      if (!o.userData?.propsHull) return;
      const g = o.geometry;
      out.push({
        name: o.name, host: o.parent?.name ?? null,
        tris: (g.index?.count ?? g.attributes.position.count) / 3,
        castShadow: o.castShadow, noShadow: !!o.userData.noShadow,
        isOutlineShell: !!o.userData.isOutlineShell,
      });
    });
    return out;
  });
  console.log(`\nprops hull shells found: ${inv.length}`);
  for (const s of inv) {
    console.log(`  ${s.name.padEnd(22)} host ${String(s.host).padEnd(18)} ${String(Math.round(s.tris)).padStart(6)} tris  ` +
                `castShadow ${s.castShadow} noShadow ${s.noShadow} isOutlineShell ${s.isOutlineShell}`);
  }
  if (!inv.length) throw new Error('no shells tagged propsHull — the gate did not fire, nothing to test');
  const badShadow = inv.filter((s) => s.castShadow || !s.noShadow || !s.isOutlineShell);
  if (badShadow.length) throw new Error(`${badShadow.length} shell(s) would reach the shadow map: ${badShadow.map((b) => b.name).join(', ')}`);
  const nonGold = inv.filter((s) => s.host !== 'props_gold');
  if (nonGold.length) throw new Error(`gold-only gate violated — shell(s) on ${nonGold.map((b) => b.host).join(', ')}`);

  /* ---- DELTA 1: clone the ink material onto the tagged shells, once, before the arm loop ---- */
  const cloneInfo = await page.evaluate(() => {
    const shells = [];
    window.__ENGINE.scene.traverse((o) => { if (o.userData?.propsHull) shells.push(o); });
    const pairs = [];                       // [{src, clone}] — page-side identity map
    let cloned = 0, reused = 0;
    for (const s of shells) {
      const src = s.material;
      let rec = pairs.find((p) => p.src === src);
      if (!rec) {
        const clone = src.clone();          // separate instance = private uniform storage
        /* Re-point every uniform EXCEPT uThickness back to the source's objects BY IDENTITY:
           the shared Shading uniforms stay live (clone() deep-copied them into dead
           snapshots), and uInkSun/uInkShade stay on the objects _setInkNight actually
           writes — the clone is not in _inkCache and would otherwise miss the night lerp. */
        for (const k of Object.keys(clone.uniforms)) {
          if (k !== 'uThickness') clone.uniforms[k] = src.uniforms[k];
        }
        clone.userData.propsHullClone = true;
        rec = { src, clone, basePx: src.uniforms.uThickness.value };
        pairs.push(rec); cloned++;
      } else reused++;
      s.material = rec.clone;
    }
    window.__propsHullMats = pairs;
    return {
      shells: shells.length, cloned, reused,
      basePx: pairs.map((p) => p.basePx),
      privateUniforms: pairs.map((p) => Object.keys(p.clone.uniforms).filter((k) => p.clone.uniforms[k] !== p.src.uniforms[k])),
    };
  });
  console.log(`ink clone: ${cloneInfo.cloned} material(s) cloned onto ${cloneInfo.shells} shell(s) (${cloneInfo.reused} reuse)` +
              `  basePx ${cloneInfo.basePx.join(',')}  private uniforms per clone: [${cloneInfo.privateUniforms.map((u) => u.join('|')).join('; ')}]`);
  if (cloneInfo.privateUniforms.some((u) => u.length !== 1 || u[0] !== 'uThickness')) {
    throw new Error('clone re-point failed — private uniform set is not exactly [uThickness]');
  }

  /* Detach / attach with moved-count printouts so an arm can never silently no-op. */
  const setHulls = (on) => page.evaluate((want) => {
    const stash = (window.__propsHullStash ||= new Map());
    let n = 0;
    if (want) {
      for (const [shell, host] of stash) { host.add(shell); n++; }
      stash.clear();
    } else {
      const found = [];
      window.__ENGINE.scene.traverse((o) => { if (o.userData?.propsHull) found.push(o); });
      for (const s of found) { stash.set(s, s.parent); s.removeFromParent(); n++; }
    }
    let live = 0;
    window.__ENGINE.scene.traverse((o) => { if (o.userData?.propsHull) live++; });
    return { moved: n, live };
  }, on);

  /* DELTA 2's poke + per-arm readback: clone vs cached original, printed every arm. */
  const setThickness = (mult) => page.evaluate((m) => {
    for (const p of window.__propsHullMats) p.clone.uniforms.uThickness.value = p.basePx * m;
    return window.__propsHullMats.map((p) => ({
      clonePx: p.clone.uniforms.uThickness.value,
      cachePx: p.src.uniforms.uThickness.value,
      sameObject: p.clone.uniforms.uThickness === p.src.uniforms.uThickness,
    }));
  }, mult);

  const armRecords = [];
  const record = {
    prereg: 'PREREG-hullkerb.md', chunk: chunkName, pid: process.pid,
    srcCommitted, srcEdited, renderer: info.renderer,
    chunks: { [chunkName]: { startedAt: new Date().toISOString(), done: false } },
    arms: armRecords,
  };

  const ARM_STATE = {                     // attached? thickness-multiplier?
    base: { on: false, mult: 1 }, base2: { on: false, mult: 1 },
    hull: { on: true, mult: 1 }, hull3x: { on: true, mult: 3 },
    restore: { on: false, mult: 1 },
  };

  const shoot = async (shot, label) => {
    const st = ARM_STATE[label];
    const t = await setHulls(st.on);
    if (st.on && t.live !== inv.length) throw new Error(`${label}: ${t.live} shells live, expected ${inv.length}`);
    if (!st.on && t.live !== 0) throw new Error(`${label}: ${t.live} shells still live with hulls off`);
    const rb = await setThickness(st.mult);
    const rbStr = rb.map((r) => `clone ${r.clonePx.toFixed(3)} / cache ${r.cachePx.toFixed(3)}${r.sameObject ? ' SHARED-OBJECT!' : ''}`).join('; ');
    if (rb.some((r) => r.sameObject)) throw new Error(`${label}: uThickness object is SHARED with the cache — the clone did not isolate the poke`);
    if (rb.some((r) => Math.abs(r.cachePx - 2.5) > 1e-6)) throw new Error(`${label}: cached ink uThickness moved off 2.5 — poke leaked to shared material`);
    await page.evaluate(async () => { await window.__GAME.step(3, 0); });
    const r = await page.evaluate(() => ({ png: window.__GAME.capture(), stats: { ...window.__ENGINE.stats } }));
    const file = path.join(FRAMES, `${shot}-${label}.png`);
    writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
    const srcAtArm = srcTree();
    console.log(`  ✓ ${label.padEnd(8)} live ${String(t.live).padStart(2)} (moved ${t.moved})  ink readback: ${rbStr}` +
                `\n      counted-column stats (arm-to-arm sanity ONLY, never vs 250/1.2M — §153.1): draws ${r.stats.drawCalls}  tris ${(r.stats.triangles / 1000) | 0}k` +
                `\n      srcAtArm ${srcAtArm.slice(0, 16)}…  -> ${path.relative(ROOT, file)}`);
    armRecords.push({
      shot, label, file: path.relative(ROOT, file), attached: st.on, thicknessMult: st.mult,
      inkReadback: rb, draws: r.stats.drawCalls, tris: r.stats.triangles,
      live: t.live, moved: t.moved, srcAtArm, ts: Date.now(),
    });
    saveArms(record);                      // durable after EVERY arm (§163.2/§164.1)
  };

  for (const { shot, arms } of SHOTS) {
    console.log(`\ncapturing ${shot} [${arms.join(' ')}] (dt pinned to 0 on every step):`);
    await page.evaluate(async (s) => { await window.__GAME.setShot(s); }, shot);
    await page.evaluate(async () => { await window.__GAME.step(6, 0); });
    for (const a of arms) await shoot(shot, a);
    /* leave the scene hulls-detached and thickness at base between shots */
    await setHulls(false);
    await setThickness(1);
  }

  record.chunks[chunkName].done = true;
  record.chunks[chunkName].finishedAt = new Date().toISOString();
  record.consoleErrors = consoleErrors;
  record.bootWarnings = info.warnings.length;
  saveArms(record);
  console.log(`\nCHUNK ${chunkName} DONE — ${armRecords.length} frames on the durable path`);
  if (consoleErrors.length) {
    console.log(`· ${consoleErrors.length} console error(s):`);
    for (const e of consoleErrors.slice(0, 6)) console.log(`    ! ${e.split('\n')[0]}`);
  }
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (server) { server.kill('SIGTERM'); setTimeout(() => { try { server.kill('SIGKILL'); } catch {} }, 3000).unref?.(); } } catch {}
  revertEdit();                            // inside the held ticket, before release
  const srcAfter = srcTree();
  console.log(`src tree AFTER revert: ${srcAfter}  MATCHES COMMITTED: ${srcAfter === srcCommitted}`);
  release();
  console.log('lock RELEASED');
}
