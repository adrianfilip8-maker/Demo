#!/usr/bin/env node
/**
 * daynightshot.mjs — §726's instrument: the L1/N day-night toggle, driven through the REAL
 * input path in the shipped page, photographed at both endpoints and at the transition
 * midpoint, with the snap-vs-ease question answered by measurement rather than taste.
 *
 * What "driven through the real input path" means here (§435.4, §723.8): a synthetic
 * `navigator.getGamepads` pad is installed BEFORE boot, button 4 (L1) is pressed by mutating
 * that pad's state, and frames are pumped through the WRAPPED `engine.renderFrame` — so the
 * press travels poll → `_padButtons` → `_press('daynight','pad')` → `Debug.update`'s
 * `pressed()` edge, exactly the frames a player's press travels. Nothing pokes
 * `engine.debug.timeOfDay` from outside except the deliberate SNAP arm, whose whole point is
 * to be the discontinuous set the ease is measured against.
 *
 * Frames are pumped with `renderFrame(0)`: the world clock stands still (§28/§251 — two
 * frames of one scene must differ by the TRANSITION only, not by animation phase), while the
 * fade still advances because it runs on the input layer's real clock by design.
 *
 * The camDot pre-flight runs FIRST, in Node, before any browser exists (§604): every camera
 * this tool photographs through is checked for enclosure/nearest/forward/subject, and the
 * rows are printed into the record.
 *
 *   node tools/daynightshot.mjs                        full run into shots/daynight726/
 *   node tools/daynightshot.mjs --out DIR --tree PATH  capture a different build
 *   CAMDOT=0 node tools/daynightshot.mjs               pre-flight prints but does not refuse
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };

const TREE = path.resolve(opt('tree', ROOT));
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/daynight726'));
const W = +opt('w', 1280), H = +opt('h', 720);
const TIMEOUT = +opt('timeout', 900) * 1000;
/* --only courtyard,temple,guards,piles,sly,token — rerun a subset after an interrupted run
   (the wrapper of the first full run was killed from outside after the pile stances; the
   scene blocks are independent, so the missing tail is re-run rather than everything). */
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

function sha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE }).toString().trim(); }
  catch { return '(no git)'; }
}

async function freePort(start = 5470) {
  for (let p = start; p < start + 200; p++) {
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
  const bin = path.join(TREE, 'node_modules', '.bin', 'vite');
  if (!existsSync(bin)) throw new Error(`vite not installed in ${TREE}`);
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  for (let i = 0; i < 80; i++) {
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

/* ---------------------------------------------------------------- camDot */

/** The cameras this tool shoots through — canonical entries, named so the pre-flight rows
 *  can be read against Shots.js. `pileclose` is pileshot.mjs's own §724 stance, reused.
 *  NOT here, and why: `hero` and `interior` both fail camDot's SUBJECT leg — their look
 *  targets are aim points 8.0 m and 11.7 m BEHIND the walls that fill their frames, which is
 *  fine for the shots they are (environment framings whose subject is the architecture
 *  itself) but means this tool cannot certify them with the instrument it committed to, so it
 *  photographs `temple`/`courtyard` instead of weakening the bar to admit them (§435.4).
 *  `interior` is still STAGED (for the vault's light rig) — captured through `pileclose`. */
const CAMERAS = {
  temple:        null,   // filled from SHOTS at runtime
  courtyard:     null,
  guard:         null,
  alert:         null,
  'sly-closeup': null,
  'sly-key':     null,
  pileclose:     { pos: [0.9, -10.45, -68.2], target: [2.9, -11.8, -70.8] },
  /* the pile's SECOND §466.5 stance: north of the hoard between it and the Ra statue,
     looking south — swept from three candidates, the only one of the three camDot passes */
  pile2:         { pos: [2.0, -10.4, -74.6], target: [2.9, -11.8, -70.8] },
};

async function preflight() {
  const { SHOTS } = await import(path.join(TREE, 'src/core/Shots.js'));
  for (const name of Object.keys(CAMERAS)) {
    if (!CAMERAS[name]) CAMERAS[name] = { pos: SHOTS[name].pos, target: SHOTS[name].target };
  }
  const { camDot } = await import('./camdot.mjs');
  const rows = [];
  let bad = 0;
  for (const [name, c] of Object.entries(CAMERAS)) {
    const r = await camDot(c.pos, c.target);
    if (!r.ok) bad++;
    rows.push(`  ${name.padEnd(12)} enclosed ${r.near}/${r.dirs}  nearest ${r.nearest == null ? '—' : r.nearest.toFixed(3) + ' m'}  `
      + `forward ${r.forward == null ? '— (sky)' : r.forward.toFixed(3) + ' m (' + r.forwardName + ')'}  `
      + `subject at ${r.targetLen.toFixed(3)} m  ${r.ok ? 'ok' : 'REFUSE: ' + r.reasons.join(' · ')}`);
  }
  console.log(`[daynightshot] camDot pre-flight, ${Object.keys(CAMERAS).length} cameras:\n${rows.join('\n')}`);
  if (bad && process.env.CAMDOT !== '0') {
    throw new Error(`[daynightshot] ${bad} camera(s) failed the pre-flight — refusing to photograph through them (CAMDOT=0 overrides)`);
  }
  return rows;
}

/* ---------------------------------------------------------------- page */

const PAD_INIT = `
  (() => {
    const pad = {
      index: 0, id: 'daynightshot synthetic DS4', mapping: 'standard', connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      timestamp: 0,
    };
    window.__PAD = {
      pad,
      press(i) { pad.buttons[i] = { pressed: true, value: 1, touched: true }; pad.timestamp++; },
      release(i) { pad.buttons[i] = { pressed: false, value: 0, touched: false }; pad.timestamp++; },
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
  })();
`;

async function boot(page, port, query) {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: TIMEOUT });
  return page.evaluate(() => ({
    warnings: window.__ENGINE.warnings.slice(),
    renderer: window.__ENGINE.renderer.getContext().getParameter(0x1F02) || 'webgl',
  }));
}

/* Everything below runs IN PAGE. Pumps go through the wrapped engine.renderFrame so the pad
   poll, the Debug consumer and the fade all run the shipped order. */
const PAGE_LIB = `
  window.__dn = (() => {
    const E = window.__ENGINE, G = window.__GAME;
    const dbg = E.debugTools;
    const pump = (n = 1) => { for (let i = 0; i < n; i++) E.renderFrame(0); };
    const state = () => ({
      tod: E.debug.timeOfDay, u: dbg._dnU, active: dbg._dnActive, target: dbg._dnTarget,
      held: [...E.input._down], enabled: E.input.enabled, device: E.input.lastDevice,
    });
    /* One press–release through the poll path; the edge lands on the press pump. */
    const tap = () => {
      window.__PAD.press(4); pump(1);
      const seen = { active: dbg._dnActive, held: [...E.input._down] };
      window.__PAD.release(4); pump(1);
      return seen;
    };
    const grab = () => {
      const png = G.capture();
      const img = new Image();
      return new Promise((res) => {
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          res({ png, data: g.getImageData(0, 0, img.width, img.height) });
        };
        img.src = png;
      });
    };
    const stats = (im) => {
      const d = im.data.data; let L = 0, black = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        L += l; if (l < 24) black++; n++;
      }
      return { meanL: +(L / n).toFixed(1), pctBlack: +(100 * black / n).toFixed(1) };
    };
    const diff = (a, b) => {
      const A = a.data.data, B = b.data.data; let ch = 0, dl = 0, n = 0;
      for (let i = 0; i < A.length; i += 4) {
        const la = 0.2126 * A[i] + 0.7152 * A[i + 1] + 0.0722 * A[i + 2];
        const lb = 0.2126 * B[i] + 0.7152 * B[i + 1] + 0.0722 * B[i + 2];
        const d = Math.abs(la - lb);
        if (d > 8) ch++; dl += d; n++;
      }
      return { pctChanged: +(100 * ch / n).toFixed(1), meanDL: +(dl / n).toFixed(2) };
    };
    return { E, G, dbg, pump, state, tap, grab, stats, diff };
  })();
`;

async function run() {
  await mkdir(OUTDIR, { recursive: true });
  const camRows = await preflight();

  console.log(`[daynightshot] waiting for capture lock…`);
  const release = await acquire({ onWait: (ms) => process.stdout.write(`· still queued for the capture lock (${(ms / 1000) | 0}s)\n`) });
  let server = null, browser = null;
  const report = { sha: sha(), tree: TREE, when: new Date().toISOString(), camdot: camRows, frames: [], measures: {} };
  try {
    const port = await freePort();
    server = await startServer(port);
    browser = await chromium.launch({
      executablePath: ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
        '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
    });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.addInitScript(PAD_INIT);
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[page:err] ${m.text()}`); });
    const info = await boot(page, port, '');
    console.log(`[daynightshot] booted ${report.sha} — ${info.warnings.length} warning(s)`);
    await page.evaluate(PAGE_LIB);

    /* provenance readback: the night endpoint must be the catalogue's own */
    const prov = await page.evaluate(() => ({
      night: window.__ENGINE.debugTools._dnNight, day: window.__ENGINE.debugTools._dnDay,
      span: window.__ENGINE.debugTools._dnSpan,
    }));
    console.log(`[daynightshot] toggle endpoints: day ${prov.day} · night ${prov.night} (SHOTS.night.tod) · span ${prov.span.toFixed(2)}`);
    report.endpoints = prov;

    const save = async (name, res) => {
      await writeFile(path.join(OUTDIR, `${name}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
      report.frames.push({ name, ...res.meta });
      console.log(`  ${name.padEnd(26)} tod ${res.meta.tod}  u ${res.meta.u}  meanL ${res.meta.meanL}  black<24 ${res.meta.pctBlack}%`);
    };

    /** Stage a canonical shot (optionally re-aiming the camera to a camDot-passed stance),
     *  then run the toggle through the pad path. */
    const stage = (name, cam) => page.evaluate(async ({ name, cam }) => {
      const { G, E } = window.__dn;
      await G.setShot(name, { dt: 0 });
      if (cam) {
        E.camera.position.set(...cam.pos);
        E.camera.lookAt(...cam.target);
        E.camera.updateMatrixWorld(true);
      }
      window.__dn.pump(2);
      return window.__dn.state();
    }, { name, cam });

    /* measure=true grabs EVERY fade frame for the per-frame delta (the snap-vs-ease
       instrument, one scene only — a grab is a full SwiftShader render, so measuring every
       fade would triple the run for numbers the first scene already gives). */
    const fadeTo = (wantTarget, midAt, measure = false) => page.evaluate(async ({ wantTarget, midAt, measure }) => {
      const { dbg, pump, tap, state, grab, stats, diff } = window.__dn;
      const t0 = state();
      const seen = tap();
      const pressed = { activeAfterPress: seen.active, heldAtPress: seen.held };
      if (dbg._dnTarget !== wantTarget) return { error: `press targeted ${dbg._dnTarget}, wanted ${wantTarget}`, t0, pressed };
      let mid = null;
      let frames = 0;
      let maxStep = null;
      let prev = measure ? await grab() : null;
      while (dbg._dnActive && frames < 400) {
        pump(1); frames++;
        let cur = null;
        if (measure) {
          cur = await grab();
          const d = diff(prev, cur);
          if (!maxStep || d.meanDL > maxStep.meanDL) maxStep = { ...d, atU: +dbg._dnU.toFixed(3) };
          prev = cur;
        }
        if (midAt != null && mid == null
            && ((wantTarget === 1 && dbg._dnU >= midAt) || (wantTarget === 0 && dbg._dnU <= midAt))) {
          if (!cur) cur = await grab();
          const s = stats(cur);
          mid = { png: cur.png, meta: { tod: dbg.engine.debug.timeOfDay, u: +dbg._dnU.toFixed(3), ...s } };
        }
      }
      const end = await grab();
      const s = stats(end);
      return {
        t0, pressed, frames, maxStep, mid,
        end: { png: end.png, meta: { tod: dbg.engine.debug.timeOfDay, u: +dbg._dnU.toFixed(3), ...s } },
      };
    }, { wantTarget, midAt, measure });

    if (want('courtyard'))
    /* ── courtyard: the measurement scene. Its staged tod is 0.76 — 0.02 BELOW the corridor —
       so EVERY canonical daylight staging except hero/dunes/the sly sheets meets the
       off-corridor rule first (a player never does: gameplay tod is only ever the two
       endpoints and the corridor between them). Flow: press SNAPS to night (the off-corridor
       rule, verified one-frame) → press eases back to day → the setTimeOfDay snap arm from
       day → press runs the MEASURED day→night ease with the midpoint. The measured ease's
       landing doubles as a second night sample of the same scene. ── */
    {
      const st = await stage('courtyard');
      console.log(`[courtyard] staged tod ${st.tod.toFixed(2)} · input.enabled ${st.enabled}`);
      const r1 = await page.evaluate(async () => {
        const { dbg, tap, pump, grab, stats } = window.__dn;
        const seen = tap(); pump(1);
        const f = await grab(); const s = stats(f);
        return { active: dbg._dnActive, heldAtPress: seen.held, png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: dbg._dnU, ...s } };
      });
      if (r1.active || r1.meta.tod !== 0.02) {
        throw new Error(`courtyard: the off-corridor press should set the night grade in one frame, got tod ${r1.meta.tod} active ${r1.active}`);
      }
      console.log(`[courtyard] off-corridor press: held ${JSON.stringify(r1.heldAtPress)} -> tod 0.02 in one frame`);
      await save('courtyard-night', r1);
      const toDay = await fadeTo(0, null);
      if (toDay.error) throw new Error(`courtyard toDay: ${toDay.error}`);
      await save('courtyard-day', toDay.end);

      /* the snap, driven through the same pipeline via the console facility the toggle
         replaces — one write+emit, one frame */
      const snap = await page.evaluate(async () => {
        const { G, dbg, pump, grab, diff, stats } = window.__dn;
        const before = await grab();
        G.setTimeOfDay(dbg._dnNight);
        pump(1);
        const after = await grab();
        const d = diff(before, after);
        const s = stats(after);
        const back = dbg._dnDay; G.setTimeOfDay(back); pump(1);
        return { onePframe: d, night: s };
      });
      report.measures.courtyardSnap = snap;
      console.log(`[courtyard] SNAP  the whole delta in one frame: ${JSON.stringify(snap.onePframe)}`);

      /* the measured EASE, day -> night, from the toggle's own day endpoint */
      const toNight = await fadeTo(1, 0.5, true);
      if (toNight.error) throw new Error(`courtyard toNight: ${toNight.error}`);
      if (!toNight.pressed.activeAfterPress) throw new Error('courtyard: the day-endpoint press never started the fade — the real path did not fire');
      await save('courtyard-mid-ease', toNight.mid);
      await save('courtyard-night2', toNight.end);
      report.measures.courtyardEase = { frames: toNight.frames, maxPerFrame: toNight.maxStep };
      console.log(`[courtyard] EASE  worst single frame: ${JSON.stringify(toNight.maxStep)} over ${toNight.frames} pumped frames`);
      /* return to day so the scene block ends where it began */
      const home = await fadeTo(0, null);
      if (home.error) throw new Error(`courtyard home: ${home.error}`);
    }

    if (want('temple'))
    /* ── temple: the second sample (§466.5). Its staged tod is 0.72 — 0.06 BELOW the corridor
       start, so the first press exercises the OFF-CORRIDOR rule (classified day-side, one
       discontinuous set to the night grade), and the eased leg with its midpoint runs on the
       RETURN — which also samples the fade in the direction courtyard's midpoint does not. ── */
    {
      const st = await stage('temple');
      console.log(`[temple] staged tod ${st.tod.toFixed(2)} · input.enabled ${st.enabled}`);
      const r1 = await page.evaluate(async () => {
        const { dbg, tap, pump, grab, stats } = window.__dn;
        tap(); pump(1);
        const f = await grab(); const s = stats(f);
        return { active: dbg._dnActive, png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: dbg._dnU, ...s } };
      });
      if (r1.active || r1.meta.tod !== 0.02) {
        throw new Error(`temple: the off-corridor press should set the night grade in one frame, got tod ${r1.meta.tod} active ${r1.active}`);
      }
      await save('temple-night', r1);
      const toDay = await fadeTo(0, 0.5);
      if (toDay.error) throw new Error(`temple toDay: ${toDay.error}`);
      await save('temple-mid-ease', toDay.mid);
      await save('temple-day', toDay.end);
      report.measures.templeEase = { frames: toDay.frames, maxPerFrame: toDay.maxStep };
    }

    /* ── guard + alert: the cone at live night (report-only; src/ai untouched) ── */
    for (const name of want('guards') ? ['guard', 'alert'] : []) {
      const st = await stage(name);
      const staged = await page.evaluate(async () => {
        const { grab, stats, dbg } = window.__dn;
        const f = await grab(); const s = stats(f);
        return { png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: null, ...s } };
      });
      await save(`${name}-staged`, staged);
      /* staged tod 0.10 is OFF the corridor: the first press classifies night-side and snaps
         to day; the second eases to the live night. Both through the pad. */
      const r = await page.evaluate(async () => {
        const { dbg, tap, pump, grab, stats } = window.__dn;
        tap();                                   // 0.10 -> snap to day (off-corridor rule)
        const day = dbg.engine.debug.timeOfDay;
        tap();                                   // day -> ease to night
        let n = 0; while (dbg._dnActive && n < 400) { pump(1); n++; }
        const f = await grab(); const s = stats(f);
        return { day, frames: n, png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: dbg._dnU, ...s } };
      });
      console.log(`  [${name}] off-corridor press snapped to ${r.day}, second press eased ${r.frames} frames`);
      await save(`${name}-livenight`, r);
    }

    /* ── pileclose: the §724 pile at the vault's staged light and at live night (report-only).
       `interior` is STAGED for its light rig; the camera is pileshot's §724 stance, which
       passes all four camDot legs (the interior camera itself does not — see CAMERAS). ── */
    for (const stance of want('piles') ? ['pileclose', 'pile2'] : []) {
      await stage('interior', CAMERAS[stance]);
      const r2 = await page.evaluate(async () => {
        const { dbg, grab, stats } = window.__dn;
        const f = await grab(); const s = stats(f);
        return { png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: dbg._dnU, ...s } };
      });
      /* the staged vault sits at tod 0.5 (off-corridor) — one press snaps to the night grade */
      const r3 = await page.evaluate(async () => {
        const { dbg, tap, pump, grab, stats } = window.__dn;
        tap(); pump(1);
        const f = await grab(); const s = stats(f);
        return { png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: dbg._dnU, ...s } };
      });
      await save(`${stance}-staged`, r2);
      await save(`${stance}-livenight`, r3);
    }

    /* ── the cane hook (§719) at both grades, two close framings ── */
    for (const name of want('sly') ? ['sly-closeup', 'sly-key'] : []) {
      await stage(name);
      const day = await page.evaluate(async () => {
        const { dbg, grab, stats } = window.__dn;
        const f = await grab(); const s = stats(f);
        return { png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: null, ...s } };
      });
      await save(`${name}-staged`, day);
      const night = await page.evaluate(async () => {
        const { dbg, tap, pump, grab, stats } = window.__dn;
        tap();                                   // 0.80 is ON the corridor (u 0.083) -> eases to night
        let n = 0; while (dbg._dnActive && n < 400) { pump(1); n++; }
        const f = await grab(); const s = stats(f);
        return { frames: n, png: f.png, meta: { tod: dbg.engine.debug.timeOfDay, u: dbg._dnU, ...s } };
      });
      await save(`${name}-livenight`, night);
    }

    /* ── the revert token, through the URL in a fresh boot ── */
    if (want('token')) {
      const page2 = await browser.newPage({ viewport: { width: W, height: H } });
      await page2.addInitScript(PAD_INIT);
      await boot(page2, port, '&l1=sneak');
      const tok = await page2.evaluate(() => {
        const E = window.__ENGINE;
        const out = {
          padSneak: E.input._pad.sneak ?? null,
          padDaynight: E.input._pad.daynight ?? null,
          keyDaynight: E.input._keys.daynight ?? null,
        };
        /* drive button 4 through the poll: it must SNEAK and must not touch the toggle */
        window.__PAD.press(4);
        E.renderFrame(0);
        out.heldAtPress = [...E.input._down];
        out.dnActive = E.debugTools._dnActive;
        out.todAfter = E.debug.timeOfDay;
        window.__PAD.release(4);
        E.renderFrame(0);
        return out;
      });
      report.token = tok;
      console.log(`[daynightshot] ?l1=sneak boot: pad.sneak ${JSON.stringify(tok.padSneak)} · pad.daynight ${JSON.stringify(tok.padDaynight)} `
        + `· key.daynight ${JSON.stringify(tok.keyDaynight)} · button-4 held ${JSON.stringify(tok.heldAtPress)} · fade started ${tok.dnActive}`);
      if (JSON.stringify(tok.padSneak) !== '[4]' || tok.padDaynight != null || tok.dnActive) {
        throw new Error('the ?l1=sneak revert token did not restore the old row through the URL');
      }
      await page2.close();
    }

    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`[daynightshot] done — ${report.frames.length} frames in ${OUTDIR}`);
  } finally {
    try { await browser?.close(); } catch { /* teardown */ }
    try { server?.kill(); } catch { /* teardown */ }
    release();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
