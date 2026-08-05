/**
 * atmowire1 — the registered capture for PREREG-atmowire.md §6. Executor: SKY (per §174
 * dispatch); the seal is SHADING's; ship decisions C1 (SHADING) / C2 (SKY) / C3 (FX) are
 * the coordinator's, ownership flags honored in RESULT-atmowire.md.
 *
 * skyswirl1.mjs architecture (ONE lock hold taken by this process, boots inlined — the
 * pre-edit must exist at BOOT time, inside the ticket; precedent tools/shot.mjs per
 * harness.mjs's own header) with ONE deliberate difference from skyswirl1:
 *
 *   THE SEAM STAYS. PREREG-atmowire §6: "Pre-edit (one ticketed commit before chunk 1, the
 *   fxcluster §1 seam pattern): C1's debug-gated shader branch + setAtmosphere param
 *   extension, default bit-identical, proven by chunk 1's base arms (P-F4 discipline)."
 *   The fxcluster precedent is in the tree today (Guard.js:1832 guardTowardCamera). So this
 *   runner applies the seam idempotently inside the hold and does NOT revert it; the
 *   coordinator's sweep commits it. At uAtmoWire 0.0 the branch is untaken and every
 *   program renders the shipped side-door bit-identically — proven in-boot by the base
 *   gates and P-F4 restore identity.
 *
 * Chunks (seal §6):
 *   A  dunes  base → base2 → W → CT55 → CT40 → KBdense → restore   (one boot, 7 frames)
 *   B  hero   base → CT40 → restore;  night  base → CT40 → restore (one boot, 6 frames)
 *
 * Arms are runtime pokes emulating exactly what the C2 publisher would send (setAtmosphere
 * is live-pokeable and durable: single `_fogSynced = true` writer, asserted by section W):
 *   base/base2 = no poke (shipped side-door; base records boot uniform values)
 *   W       = setAtmosphere(published values at the shot's tod, s=1.0) + uAtmoWire 1
 *   CT55    = same with fogColor/fogTint × 0.55
 *   CT40    = same with × 0.40
 *   KBdense = CT40 + density × 3 (the registered must-fail arm)
 *   restore = uAtmoWire 0 + _fogSynced=false (side-door resumes and regenerates boot
 *             values from the untouched scene.fog) + belt-and-braces re-poke of recorded
 *             boot values; P-F4 binds restore ≡ base bit-identically.
 *
 * Scoring is NOT here:  node progress/records/fxcluster-diag.mjs WSCORE
 */
import { acquire } from '/home/user/Demo/tools/lock.mjs';
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = '/home/user/Demo';
const GLSL = `${ROOT}/src/render/shaders/toon.glsl.js`;
const TOON = `${ROOT}/src/render/ToonMaterial.js`;
const OUT = `${ROOT}/progress/records/atmowire1`;
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* ─────────────── the sealed C1 seam (PREREG-atmowire.md §2 C1, verbatim design) ─────────────── */

const EDITS = [
  { file: GLSL, // uniform declarations join SLY_COMMON (reaches surface AND ink programs)
    old: `uniform float uHazeStart;     // metres of grace before haze bites`,
    new: `uniform float uHazeStart;     // metres of grace before haze bites
/* atmowire seam (PREREG-atmowire.md C1): published-curve branch. uAtmoWire 0.0 = shipped
   side-door bit-identically (the branch is untaken; no arithmetic changes). */
uniform float uAtmoWire;
uniform float uHazeHeightFalloff; // metres — published fog.heightFalloff (read only when wired)
uniform float uHazeInscatter;     // published fog.inscatter (read only when wired)
uniform vec3  uHazeTint;          // published fog.sunTint (read only when wired)`,
  },
  { file: GLSL, // slyHaze: the published blend (ATMOSPHERE_GLSL applyAerial, exactly)
    old: `float slyHaze( vec3 camPos, vec3 rd, float dist ) {
	float b = max( uHazeFalloff, 1e-5 );`,
    new: `float slyHaze( vec3 camPos, vec3 rd, float dist ) {
	if ( uAtmoWire > 0.5 ) {
		/* atmowire: ATMOSPHERE_GLSL applyAerial's exact blend (PREREG-atmowire.md C1). */
		float hw = exp( - max( camPos.y + rd.y * dist, 0.0 ) / max( uHazeHeightFalloff, 1.0 ) );
		float dw = dist * uHazeDensity * mix( 0.55, 1.0, hw );
		return clamp( 1.0 - exp( - dw * dw ), 0.0, 1.0 );
	}
	float b = max( uHazeFalloff, 1e-5 );`,
  },
  { file: GLSL, // slyHazeColor: published haze colour — pole mix + ×gain retired when wired
    old: `vec3 slyHazeColor( vec3 rd ) {
	float sunAmt = max( dot( rd, uKeyDir ), 0.0 );
	vec3 c = mix( uHaze, uHazeSun, pow( sunAmt, 3.0 ) * 0.8 );
	return c * uHazeGain;
}`,
    new: `vec3 slyHazeColor( vec3 rd ) {
	float sunAmt = max( dot( rd, uKeyDir ), 0.0 );
	if ( uAtmoWire > 0.5 ) {
		/* atmowire: published haze colour — pole mix and uHazeGain retired when wired. */
		return uHaze + uHazeTint * ( pow( sunAmt, 5.0 ) * uHazeInscatter );
	}
	vec3 c = mix( uHaze, uHazeSun, pow( sunAmt, 3.0 ) * 0.8 );
	return c * uHazeGain;
}`,
  },
  { file: TOON, // shared uniforms (merged into every material by identity in onBeforeCompile)
    old: `      uHazeStart:    { value: TUNE.hazeStart },`,
    new: `      uHazeStart:    { value: TUNE.hazeStart },
      /* atmowire seam (PREREG-atmowire.md C1): OFF by default — uAtmoWire 0.0 keeps every
         program on the shipped side-door bit-identically; setAtmosphere() fills these. */
      uAtmoWire:     { value: 0.0 },
      uHazeHeightFalloff: { value: 58 },
      uHazeInscatter: { value: 0.62 },
      uHazeTint:     { value: new THREE.Color(0xffc98a) },`,
  },
  { file: TOON, // setAtmosphere accepts the published params (inert while uAtmoWire is 0)
    old: `    if (typeof p.start === 'number') u.uHazeStart.value = p.start;`,
    new: `    if (typeof p.start === 'number') u.uHazeStart.value = p.start;
    /* atmowire (PREREG-atmowire.md C1): published-curve params; inert while uAtmoWire is 0. */
    if (typeof p.heightFalloff === 'number') u.uHazeHeightFalloff.value = p.heightFalloff;
    if (typeof p.inscatter === 'number') u.uHazeInscatter.value = p.inscatter;
    if (p.tint !== undefined) setCol(u.uHazeTint.value, p.tint);`,
  },
  { file: TOON, // the public-surface doc line follows the surface (AGENTS §4.4)
    old: `   * @param {{haze?, hazeSun?, density?, falloff?, base?, gain?, start?, shadowTint?, shadowFloor?}} p`,
    new: `   * @param {{haze?, hazeSun?, density?, falloff?, base?, gain?, start?, heightFalloff?, inscatter?, tint?, shadowTint?, shadowFloor?}} p`,
  },
];

function applySeam() {
  const cur = { [GLSL]: readFileSync(GLSL, 'utf8'), [TOON]: readFileSync(TOON, 'utf8') };
  if (cur[GLSL].includes('uAtmoWire') || cur[TOON].includes('uAtmoWire')) {
    for (const e of EDITS) if (!cur[e.file].includes(e.new)) throw new Error(`tree carries uAtmoWire but not the exact sealed seam (${path.basename(e.file)}) — refusing; hand-inspect before any capture`);
    log('seam: already applied (exact sealed form verified in place)');
    return;
  }
  const pre = treeHash();
  if (!existsSync(path.join(OUT, 'toon.glsl.js.pre-seam'))) copyFileSync(GLSL, path.join(OUT, 'toon.glsl.js.pre-seam'));
  if (!existsSync(path.join(OUT, 'ToonMaterial.js.pre-seam'))) copyFileSync(TOON, path.join(OUT, 'ToonMaterial.js.pre-seam'));
  writeFileSync(path.join(OUT, 'seam-state.json'), JSON.stringify({ preHash: pre, appliedAt: new Date().toISOString(), stays: 'PREREG-atmowire §6 pre-edit — the seam is committed scaffolding (fxcluster §1 pattern), NOT reverted after capture' }, null, 1));
  for (const e of EDITS) {
    const i = cur[e.file].indexOf(e.old);
    if (i < 0 || cur[e.file].indexOf(e.old, i + 1) >= 0) throw new Error(`seam anchor not found exactly once in ${path.basename(e.file)}: ${e.old.slice(0, 60)}...`);
    cur[e.file] = cur[e.file].replace(e.old, e.new);
  }
  writeFileSync(GLSL, cur[GLSL]);
  writeFileSync(TOON, cur[TOON]);
  log(`seam: applied (pre-seam tree ${pre} -> seamed tree ${treeHash()}); pristine copies at atmowire1/*.pre-seam`);
}

/* ─────────────── boot internals (harness.mjs copy, minus its lock — shot.mjs precedent) ─────────────── */

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

/* ─────────────── arms and chunks (seal §3/§6) ─────────────── */

const SCALES = { W: 1.0, CT55: 0.55, CT40: 0.40, KBdense: 0.40 };
const DENSMUL = { W: 1.0, CT55: 1.0, CT40: 1.0, KBdense: 3.0 };

const CHUNKS = [
  { id: 'A', shots: [{ shot: 'dunes', arms: ['base', 'base2', 'W', 'CT55', 'CT40', 'KBdense', 'restore'] }] },
  { id: 'B', shots: [{ shot: 'hero', arms: ['base', 'CT40', 'restore'] }, { shot: 'night', arms: ['base', 'CT40', 'restore'] }] },
];

async function runChunk(chunk) {
  const report = {
    prereg: 'PREREG-atmowire.md', chunk: chunk.id, startedAt: new Date().toISOString(),
    srcTreeBefore: treeHash(), scales: SCALES, densMul: DENSMUL, shots: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk.id}.json`), JSON.stringify(report, null, 1));
  save();
  log(`chunk ${chunk.id}: srcTree(SEAMED) ${report.srcTreeBefore} — booting`);

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

    /* Lever probe BEFORE anything is believed: the seam must be live at its inert default,
       setAtmosphere must accept the extended params, and _fogSynced must be false (side-door
       active = shipped behaviour) — the W1 premises, read from the page. */
    const lever = await page.evaluate(() => {
      const sh = window.__ENGINE?.get?.('shading');
      const sky = window.__ENGINE?.get?.('sky');
      return {
        hasShading: !!sh, hasSky: !!sky,
        hasWire: !!sh?.uniforms?.uAtmoWire, wire: sh?.uniforms?.uAtmoWire?.value,
        hasHF: !!sh?.uniforms?.uHazeHeightFalloff, hasIns: !!sh?.uniforms?.uHazeInscatter, hasTint: !!sh?.uniforms?.uHazeTint,
        fogSynced: sh?._fogSynced,
        uHazeDensity: sh?.uniforms?.uHazeDensity?.value, uHazeGain: sh?.uniforms?.uHazeGain?.value,
        uHazeFalloff: sh?.uniforms?.uHazeFalloff?.value,
        fog: sky ? { density: sky.atmosphere.fog.density, heightFalloff: sky.atmosphere.fog.heightFalloff, inscatter: sky.atmosphere.fog.inscatter } : null,
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
    if (!lever.hasShading || !lever.hasWire || !lever.hasHF || !lever.hasIns || !lever.hasTint) {
      report.fatal = 'seam uniforms absent from live page — pre-edit did not reach the boot'; log(`  FATAL: ${report.fatal}`); save(); return;
    }
    if (lever.wire !== 0) { report.fatal = `uAtmoWire boot default ${lever.wire} != 0`; log(`  FATAL: ${report.fatal}`); save(); return; }
    /* W1 premise gate, corrected after the 2026-08-05 VOID run (RESULT-atmowire.md §VOID-1):
       ToonMaterial never INITIALIZES _fogSynced — it is undefined at every boot by design
       (three sites total: `= true` in setAtmosphere, two `if (!this._fogSynced)` readers),
       so "side-door active" means FALSY, not the literal false the first run demanded.
       Gate on the mechanism instead (§143.1): truthy _fogSynced = a publisher already ran
       (premise broken), AND the side-door's own arithmetic must be live in the uniforms. */
    if (lever.fogSynced) { report.fatal = `_fogSynced at boot is truthy (${lever.fogSynced}) — a publisher already ran; W1 premise broke`; log(`  FATAL: ${report.fatal}`); save(); return; }
    const sideDoorWant = Math.max(lever.fog.density * 2.6, 0.004);
    if (Math.abs(lever.uHazeDensity - sideDoorWant) > 1e-9) {
      report.fatal = `side-door arithmetic not live: uHazeDensity ${lever.uHazeDensity} != max(fog.density*2.6, 0.004) = ${sideDoorWant} — W1 premise broke`;
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
        const r = await page.evaluate(async ({ arm, s, dMul }) => {
          const sh = window.__ENGINE.get('shading');
          const sky = window.__ENGINE.get('sky');
          const fog = sky.atmosphere.fog;
          const u = sh.uniforms;
          if (arm === 'base') {
            window.__ATMO_REC = {
              uHaze: u.uHaze.value.toArray(), uHazeSun: u.uHazeSun.value.toArray(),
              uHazeGain: u.uHazeGain.value, uHazeDensity: u.uHazeDensity.value,
              uHazeFalloff: u.uHazeFalloff.value, uHazeBase: u.uHazeBase.value, uHazeStart: u.uHazeStart.value,
              uHazeHeightFalloff: u.uHazeHeightFalloff.value, uHazeInscatter: u.uHazeInscatter.value,
              uHazeTint: u.uHazeTint.value.toArray(),
            };
          }
          if (s !== undefined) {
            sh.setAtmosphere({
              color: fog.color.clone().multiplyScalar(s),
              tint: fog.sunTint.clone().multiplyScalar(s),
              density: fog.density * dMul,
              heightFalloff: fog.heightFalloff,
              inscatter: fog.inscatter,
              gain: 1.0,
            });
            u.uAtmoWire.value = 1.0;
          } else if (arm === 'restore') {
            u.uAtmoWire.value = 0.0;
            const rec = window.__ATMO_REC;
            if (rec) {
              u.uHaze.value.fromArray(rec.uHaze); u.uHazeSun.value.fromArray(rec.uHazeSun);
              u.uHazeGain.value = rec.uHazeGain; u.uHazeDensity.value = rec.uHazeDensity;
              u.uHazeFalloff.value = rec.uHazeFalloff; u.uHazeBase.value = rec.uHazeBase; u.uHazeStart.value = rec.uHazeStart;
              u.uHazeHeightFalloff.value = rec.uHazeHeightFalloff; u.uHazeInscatter.value = rec.uHazeInscatter;
              u.uHazeTint.value.fromArray(rec.uHazeTint);
            }
            sh._fogSynced = false;   // side-door resumes; regenerates boot values from untouched scene.fog
          }
          await window.__GAME.step(1, 0);      // dt=0: world clock frozen across every arm
          const dataUrl = window.__GAME.capture('image/png');
          return {
            readback: {
              uAtmoWire: u.uAtmoWire.value, _fogSynced: sh._fogSynced,
              uHaze: u.uHaze.value.toArray().map((v) => +v.toFixed(5)),
              uHazeSun: u.uHazeSun.value.toArray().map((v) => +v.toFixed(5)),
              uHazeGain: u.uHazeGain.value, uHazeDensity: +u.uHazeDensity.value.toFixed(6),
              uHazeFalloff: u.uHazeFalloff.value, uHazeBase: u.uHazeBase.value, uHazeStart: u.uHazeStart.value,
              uHazeHeightFalloff: u.uHazeHeightFalloff.value, uHazeInscatter: +u.uHazeInscatter.value.toFixed(4),
              uHazeTint: u.uHazeTint.value.toArray().map((v) => +v.toFixed(5)),
              fogAnchor: { color: fog.color.toArray().map((v) => +v.toFixed(5)), density: fog.density, heightFalloff: fog.heightFalloff, inscatter: +fog.inscatter.toFixed(4) },
              tod: window.__ENGINE.debug.timeOfDay,
            },
            dataUrl,
          };
        }, { arm, s: SCALES[arm], dMul: DENSMUL[arm] });
        const rb = r.readback;
        writeFileSync(path.join(OUT, `${shot}.${arm}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
        const wantWire = SCALES[arm] !== undefined ? 1 : 0;
        const mism = rb.uAtmoWire !== wantWire;
        log(`  ${shot}.${arm.padEnd(8)} ${((Date.now() - ta) / 1000).toFixed(0)}s  uAtmoWire ${rb.uAtmoWire}  _fogSynced ${rb._fogSynced}  uHazeDensity ${rb.uHazeDensity}  hf ${rb.uHazeHeightFalloff}  ins ${rb.uHazeInscatter}  ${mism ? 'POKE MISMATCH' : 'applied ok'}`);
        sRec.arms.push({ arm, readback: rb, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
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

/* ─────────────── main ─────────────── */

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

const chunksToRun = CHUNKS.filter((c) => !only || c.id === only).filter((c) =>
  !c.shots.every((s) => s.arms.every((a) => existsSync(path.join(OUT, `${s.shot}.${a}.png`)))));
if (!chunksToRun.length) { log('all requested chunks already have all frames — nothing to do (idempotent resume)'); process.exit(0); }

log(`acquiring capture lock (chunks: ${chunksToRun.map((c) => c.id).join(', ')}) — FIFO behind the existing chain`);
const release = await acquire({ onWait: (ms, pid) => log(`waiting for capture lock (${(ms / 1000) | 0}s, held by pid ${pid})`) });
log('lock ACQUIRED — seam + boots happen inside this hold');
try {
  applySeam();               // idempotent; STAYS after the run (see header)
  for (const chunk of chunksToRun) await runChunk(chunk);
} finally {
  release();
  log('lock released (seam left in tree by design — PREREG-atmowire §6 / fxcluster §1 pattern)');
}
log('ALL DONE — score with: node progress/records/fxcluster-diag.mjs WSCORE');
