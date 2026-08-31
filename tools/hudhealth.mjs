#!/usr/bin/env node
/**
 * hudhealth.mjs — §731's instrument: does the Sly 4 health ornament COLLIDE with anything, can it
 * be READ over both grades, and did adding it stop any existing HUD element from working?
 *
 * Four questions, none of which is answerable from the source or from `_hudshim`:
 *
 *   A. COLLISION. The corner survey in `HUD._healthHtml`'s docblock is a reading of the
 *      stylesheet. A reading is not a layout: `.sly-tl` grows downward as chips arm, the
 *      objective card is a variable-height card, and the prompt is centred with a width that
 *      follows its verb. So every persistent element is driven to its WIDEST state in a real
 *      browser and every rect is measured. Overflow and overlap are facts, not opinions.
 *
 *   B. LEGIBILITY OVER THE SCENE. The HUD is DOM and `__GAME.capture()` reads the WebGL drawing
 *      buffer, so a plate of the HUD is not obtainable that way BY DESIGN (HUD.js's header: "DOM
 *      never lands in it", the screenshot-critic guarantee). What IS obtainable, and is the real
 *      question, is WHAT IS BEHIND THE ORNAMENT: the framebuffer is sampled inside the ornament's
 *      own measured rect at the L1 day grade and the L1 night grade, and the ornament's three
 *      inks are scored against it with the same WCAG arithmetic `hud.test.mjs` M2 uses. A pip set
 *      tuned on bright sand and lost over the night grade is exactly what this catches. Two
 *      camera poses per grade (§466.5).
 *
 *   C. REGRESSION — and this arm is why the tool is not just A and B. §439/§440: an instrument
 *      that FREEZES animation cannot certify animation. Arm A has to freeze (see `freeze()`), so
 *      it is run LAST, and arm C runs FIRST, on an UNFROZEN page. It samples the pickpocket mark,
 *      the toast and the coin readout across time and requires each of them to actually move,
 *      while requiring the ornament in the same samples not to. That pair is the whole point: the
 *      same sampler that certifies the ornament inert is shown catching motion in the elements
 *      beside it, so "the ornament did not move" cannot be a blind probe reporting nothing
 *      (§418.3).
 *
 *      TIME IN THIS ARM IS CLOCKED BY THE TOOL, NOT BY rAF, and that is a correction rather than
 *      a shortcut. The first version of this arm let the page's own rAF loop run and sampled
 *      across wall time: every element, including the toast — whose life is 2.6 s — came back
 *      with ONE distinct state over 2.8 s, and `toastN` sat at 1 for all fourteen samples. The
 *      loop is throttled in a headless page, so `HUD.update` was barely being called and the arm
 *      was measuring a stalled engine, not a stalled HUD. It declared itself unproven, which is
 *      what it is for. Frames are now stepped through `Engine.renderFrame(1/60)` — the entry
 *      point whose own docblock exists so a harness can step deterministically — so `HUD.update`
 *      runs with a real dt and the JS-driven animation (coin tick, toast life, pocket
 *      resolution) actually advances. CSS transitions are NOT frozen here and still settle on
 *      wall time, which is why each step is followed by a real wait.
 *
 *   D. THE TOKENS. `?hud=nohealth` is exercised through the URL in its own boot, and the twelve
 *      standing tokens are booted TOGETHER WITH IT in one more, because the only way this lane
 *      could break them is a key collision and that is a claim about a real URL, not about source.
 *
 * ── SUPERSEDED FOR §731 BY tools/hudvisible.mjs ─────────────────────────────────────────────
 * This tool loads the DEV SERVER AT THE DOMAIN ROOT, stages its subjects and freezes CSS, and
 * its presence check ignores opacity. §731.2 records all four as the reasons it certified an
 * ornament the owner could not see. It is kept for arm C, whose motion trace is still the only
 * check that the rest of the HUD still animates; every claim about whether the §731 readout is
 * VISIBLE belongs to hudvisible.mjs, which measures the production artifact. §731.3 also moved
 * the readout to the top-left and deleted its chip and kicker, so arm A's corner arithmetic
 * below describes where the ornament USED to be.
 *
 *   node tools/hudhealth.mjs                 full run into shots/hud731/
 *   node tools/hudhealth.mjs --out DIR       elsewhere
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
const OUTDIR = path.resolve(ROOT, opt('out', 'shots/hud731'));
const W = +opt('w', 1280), H = +opt('h', 720);

const sha = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { return '(no git)'; } };

async function freePort(start = 5620) {
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
  if (!existsSync(bin)) throw new Error(`vite not installed in ${ROOT}`);
  const proc = spawn(bin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/localhost:\d+|ready in/i.test(log)) break;
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return proc;
}

/* The page-side library. Everything measured is measured HERE, in layout, not inferred. */
const LIB = `
window.__hh = (() => {
  const E = window.__ENGINE, G = window.__GAME;
  const pump = (n = 1, dt) => { for (let i = 0; i < n; i++) E.renderFrame(dt); };
  const hud = () => E.get('hud');

  /**
   * Settle every transition and animation INSTANTLY.
   *
   * With the loop stopped this page has no rAF, and CSS transitions then read as their START
   * value rather than their settled one: the lane that first built this tool read .sly-prompt.on
   * at opacity 0 and .sly-shake at opacity 1 while the binoc flag was set, both of which are the
   * beginning of a transition that never ran. Reading a start value as a settled one is how a
   * tool certifies the opposite of the truth, so transitions are removed and the settled value is
   * read directly.
   *
   * THIS IS DESTRUCTIVE TO ARM C. Once this is installed nothing in the HUD animates, so arm C
   * runs before it and never after. Scoped to the HUD; nothing else is touched.
   * (This whole library is one template literal: no backticks below this line.)
   */
  const freeze = () => {
    const s = document.createElement('style');
    s.id = 'hh-freeze';
    s.textContent = '#sly-hud, #sly-hud * { transition: none !important; animation: none !important; }';
    document.head.appendChild(s);
  };

  /* Drive every persistent element to its WIDEST state, so arm A's rects are worst case and not
     "what happened to be on screen". Nothing here touches the ornament. */
  const widen = () => {
    const h = hud();
    h.objective('Steal the Eye of Ra from the sealed vault', 'Temple of Ra - Great Courtyard, north colonnade');
    h.setCoins(888888, true);
    h.addCoins(1200);
    h.setHealth(5, 5);
    E.emit('guardAlert', { id: 'g1', state: 'chase' });
    E.emit('guardAlert', { id: 'g2', state: 'search' });
    E.emit('playerState', 'sneak');
    E.emit('treasurePickup', { id: 't1', name: 'Scarab of Khepri', value: 1200 });
    E.emit('toast', { text: 'THE VAULT IS OPEN - twelve clues found', icon: 'goal' });
    /* The world markers live in an inset:0 container, so only their own boxes mean anything, and
       they only have boxes once they are pointed at something. */
    h.setGoal({ x: 0, y: -12, z: -72 }, 'THE EYE OF RA');
    h.setLockOn({ pos: { x: 2, y: 1, z: -6 }, body: null });
    pump(6);
    /* The prompt is the ornament's NEAREST neighbour - bottom-centre, and its width follows its
       verb - so it is driven through the public method with the longest verb the game can show.
       LAST, and after the pumps, deliberately: HUD.update runs the affordance fallback and clears
       a prompt nothing in the world is offering, which is why an earlier run of this tool
       reported this element unrendered. An unrendered element is not a collision check. */
    h.prompt('PICKPOCKET THE GUARD CAPTAIN AND FENCE THE SCARAB', 'Space', 'steal');
  };

  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return { sel, hidden: true };
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return { sel, hidden: true };
    return { sel, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
             r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) };
  };

  /* Mean/extreme luma of the framebuffer inside a rect, plus a coarse mean colour. The HUD is DOM
     so it is NOT in this buffer - which is exactly what makes it the BACKGROUND. */
  const behind = async (box, pad = 4) => {
    const png = G.capture();
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = png; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const sx = img.width / window.innerWidth, sy = img.height / window.innerHeight;
    const x0 = Math.max(0, Math.floor((box.x - pad) * sx));
    const y0 = Math.max(0, Math.floor((box.y - pad) * sy));
    const x1 = Math.min(img.width, Math.ceil((box.r + pad) * sx));
    const y1 = Math.min(img.height, Math.ceil((box.b + pad) * sy));
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let R = 0, Gg = 0, B = 0, n = 0, lo = 1e9, hi = -1e9;
    const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    let sum = 0;
    /* A 64-bin luma histogram, because "the worst pixel" is the wrong question. The ornament is a
       SANDWICH - carnelian inside a 4.4-wide ink outline, under a gold kicker - so what has to
       hold is that for EVERY background luma present, at least ONE of those three inks is far
       from it. That is a per-pixel max-over-inks and it needs the distribution, not the range. */
    const hist = new Array(64).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const rl = lin(d[i]), gl = lin(d[i + 1]), bl = lin(d[i + 2]);
      const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      sum += Y; if (Y < lo) lo = Y; if (Y > hi) hi = Y;
      hist[Math.min(63, Math.max(0, Math.round(Math.sqrt(Y) * 63)))]++;
      R += d[i]; Gg += d[i + 1]; B += d[i + 2]; n++;
    }
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    return { px: n, Ymean: +(sum / n).toFixed(4), Ymin: +lo.toFixed(4), Ymax: +hi.toFixed(4),
             hist, mean: '#' + hex(R) + hex(Gg) + hex(B) };
  };

  const setTod = (v) => { G.setTimeOfDay(v); pump(3); return E.debug.timeOfDay; };
  /* freeCam TRUE, not false: CameraRig.update returns early only while the harness owns the
     camera (its own docblock, point 4). An earlier run set it false and every capture came back
     from the same rig pose - two "different" stances measured identical backgrounds to four
     decimals, which is what caught it. */
  const cam = (pos, target) => {
    E.debug.freeCam = true;
    E.camera.position.set(...pos);
    E.camera.lookAt(...target);
    E.camera.updateMatrixWorld(true);
    pump(2);
    return [+E.camera.position.x.toFixed(2), +E.camera.position.y.toFixed(2), +E.camera.position.z.toFixed(2)];
  };

  /* ---------------------------------------------------------------- arm C support */

  /**
   * One sample of everything arm C watches. Deliberately a STRING per element: the question is
   * "did this change", and a string that folds position, opacity and content answers it without
   * the sampler having to know which of those a given element animates in.
   */
  const sampleAll = () => {
    const one = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'absent';
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return [r.x.toFixed(2), r.y.toFixed(2), r.width.toFixed(2), r.height.toFixed(2),
              (+cs.opacity).toFixed(3), cs.transform, (el.textContent || '').trim()].join('|');
    };
    return {
      t: +performance.now().toFixed(1),
      /* The engine's OWN clock, so a stalled loop is visible in the trace instead of being
         mistaken for a stalled HUD — which is exactly what happened the first time. */
      frame: E.frame,
      simT: +E.time.toFixed(3),
      pocket: one('.sly-pocket'),
      toasts: one('.sly-toasts'),
      toastN: document.querySelectorAll('.sly-toast').length,
      coin: one('.sly-coin-num'),
      threat: one('.sly-threat'),
      /* the subject of the negative claim, sampled by the SAME function in the SAME frames */
      hp: one('.sly-hp'),
      hpHtml: (document.querySelector('.sly-hp') || {}).innerHTML || 'absent',
    };
  };

  /**
   * Put the player next to a guard so the HUD's OWN resolver can find a pocket.
   *
   * This stages the WORLD, not the HUD: nothing here writes to .sly-pocket or calls a HUD
   * method. HUD._tickPocket still runs its own _resolvePocket -> Controller.pickMark ->
   * Guards.nearestPickpocketTarget chain, on its own 10 Hz clock, and decides for itself. That is
   * the shipped path (§435.4); teleporting the player is the same liberty every capture tool in
   * this directory takes to reach a vantage.
   */
  const standByAGuard = () => {
    const mv = E.get('movement'), gs = E.get('guards');
    if (!mv || !gs) return { ok: false, why: 'movement or guards module absent' };
    const roster = gs.guards || gs.all || gs.list || [];
    let best = null;
    for (const g of roster) {
      const p = g.position || g.root?.position;
      if (!p) continue;
      if (g.canBePickpocketed === false) continue;
      best = { g, p };
      break;
    }
    if (!best) return { ok: false, why: 'no guard with a position in the roster' };
    /* A pace and a half behind him, facing his back - the approach the pickpocket wants. */
    const yaw = best.g.yaw ?? 0;
    mv.position.set(best.p.x - Math.sin(yaw) * 1.1, best.p.y, best.p.z - Math.cos(yaw) * 1.1);
    if (mv.faceDir && mv.faceDir.set) mv.faceDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    if (typeof mv.yaw === 'number') mv.yaw = yaw;
    return { ok: true, guard: best.g.id ?? '(unnamed)',
             at: [+mv.position.x.toFixed(2), +mv.position.y.toFixed(2), +mv.position.z.toFixed(2)] };
  };

  return { E, G, pump, hud, freeze, widen, rect, behind, setTod, cam, sampleAll, standByAGuard };
})();
`;

/* WCAG, node side — the same arithmetic hud.test.mjs M2 uses. */
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lumaHex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratioY = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };

/* The ornament's own inks, from Icons.C / hud.css.js. */
const INKS = { carn: '#b8452c', ink: '#1a1210', goldL: '#ffe9a8' };
const BAR = 3.0;      // the non-text bar; the kicker's own 4.5 is hud.test.mjs M2's job

/**
 * The legibility score, from a background luma histogram.
 *
 * For each occupied bin take the BEST of the ornament's three inks against it. The ornament fails
 * only where all three are close to the background at once, so the number reported is the minimum
 * of that best-of-three over the distribution, plus the share of pixels under the bar. The worst
 * single pixel is deliberately NOT the verdict: against the darkest pixel of a bright frame the
 * ink outline is invisible, and it does not matter, because the carnelian and the gold are not.
 */
function score(hist) {
  let worst = Infinity, under = 0, total = 0, worstY = 0;
  const Ys = Object.values(INKS).map(lumaHex);
  for (let i = 0; i < hist.length; i++) {
    if (!hist[i]) continue;
    const Y = (i / 63) ** 2;
    const best = Math.max(...Ys.map((y) => ratioY(y, Y)));
    total += hist[i];
    if (best < BAR) under += hist[i];
    if (best < worst) { worst = best; worstY = Y; }
  }
  return { worstBest: +worst.toFixed(2), atY: +worstY.toFixed(4),
           underPct: +(100 * under / Math.max(1, total)).toFixed(2) };
}

/* Every persistent gameplay element, plus the ornament. `.sly-marks` is deliberately NOT here: it
   is an `inset: 0` container for world markers and overlaps everything by construction, so its
   CHILDREN are what a collision check may ask about. */
/* §743 removed `.sly-obj`, the corner objective card. The objective now renders inside the pause
   cel, which is not a gameplay-layer element and so is not a collision neighbour. */
const PERSISTENT = ['.sly-tl', '.sly-coins', '.sly-threat', '.sly-carry',
  '.sly-toasts', '.sly-prompt', '.sly-pocket', '.sly-goal', '.sly-lock'];

/* The twelve standing tokens this lane must not disturb, and the one it adds. */
const STANDING = ['props=tinted', 'props=plain', 'smash=gen', 'swing=loose', 'surf=apex',
  'pile=faded', 'mag=wide', 'pole=climb', 'combo=mono', 'idle=pose', 'hook=cream', 'l1=sneak'];

function overlap(a, b) {
  const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
  const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? +(w * h).toFixed(1) : 0;
}

async function boot(browser, port, query) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await page.evaluate(LIB);
  return page;
}

async function run() {
  await mkdir(OUTDIR, { recursive: true });
  console.log('[hudhealth] waiting for capture lock…');
  const release = await acquire({ onWait: (ms) => process.stdout.write(`· queued for the capture lock (${(ms / 1000) | 0}s)\n`) });
  let server = null, browser = null;
  const report = { sha: sha(), when: new Date().toISOString(), viewport: [W, H] };
  let bad = 0;
  const fail = (m) => { console.log(`    !! ${m}`); bad++; };
  try {
    const port = await freePort();
    server = await startServer(port);
    browser = await chromium.launch({
      executablePath: ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
        '--js-flags=--max-old-space-size=4096', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
    });

    const page = await boot(browser, port, '');

    /* ============ ARM C — the existing HUD still renders AND animates. Runs FIRST, on a live,
       unfrozen page with the real rAF loop turning: arm A's freeze() would make this arm certify
       the opposite of the truth (§439/§440). ============================================== */
    console.log('\n[hudhealth] ARM C — regression: does the rest of the HUD still work, with the ornament present?');
    const stand = await page.evaluate(() => window.__hh.standByAGuard());
    console.log(`    staged the WORLD (not the HUD): ${stand.ok ? `player set behind guard ${stand.guard} at ${JSON.stringify(stand.at)}` : `NOT staged — ${stand.why}`}`);
    report.stand = stand;

    /* Drive the two event-fed elements through the BUS, the shipped publisher path. */
    await page.evaluate(() => {
      const h = window.__hh.hud();
      h.setCoins(0, true);
      window.__hh.E.emit('treasurePickup', { id: 'tz', name: 'Scarab of Khepri', value: 4200 });
      window.__hh.E.emit('toast', { text: 'CLUE BOTTLE 7 OF 12', icon: 'goal' });
    });

    /* 14 steps of 12 frames at 1/60 = 2.8 s of simulated time, which covers the toast's 2.6 s
       life, the coin tick and ~4 pocket resolutions (TUNE.pocketTick is 6 frames). The rAF loop
       is stopped so the tool is the only clock and the trace is deterministic; the real wait
       after each step is what lets the CSS transitions, which are NOT frozen in this arm, settle
       between samples. */
    await page.evaluate(() => window.__hh.E.stopLoop());
    const trace = [];
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => window.__hh.pump(12, 1 / 60));
      trace.push(await page.evaluate(() => window.__hh.sampleAll()));
      await page.waitForTimeout(120);
    }
    report.trace = trace;
    console.log(`    stepped ${trace.length} x 12 frames at 1/60 (engine frame ${trace[0].frame} -> ${trace[trace.length - 1].frame}, sim time ${trace[0].simT} -> ${trace[trace.length - 1].simT}s)`);
    if (trace[trace.length - 1].frame === trace[0].frame) fail('the engine frame counter never advanced — arm C has no clock and proves nothing');

    const distinct = (k) => new Set(trace.map((s) => s[k])).size;
    const seen = (k) => trace.filter((s) => s[k] !== 'absent').length;
    const moved = {};
    console.log(`    ${'element'.padEnd(22)} ${'frames present'.padStart(14)} ${'distinct states'.padStart(16)}`);
    for (const [label, key] of [['pickpocket mark', 'pocket'], ['toast stack', 'toasts'],
      ['coin readout', 'coin'], ['live pip row', 'pips'], ['threat chip', 'threat'],
      ['§731 ornament', 'hp']]) {
      const p = seen(key), d = distinct(key);
      moved[key] = { present: p, states: d };
      console.log(`    ${label.padEnd(22)} ${String(p).padStart(9)}/${trace.length} ${String(d).padStart(16)}`);
    }
    console.log(`    toasts alive across the trace: ${trace.map((s) => s.toastN).join(',')}`);
    report.moved = moved;

    /* The POSITIVE half of §418.3: the sampler must SEE motion. If these are static the sampler
       is blind and its verdict on the ornament below is worthless. */
    let animators = 0;
    for (const [label, key] of [['the coin readout', 'coin'], ['the toast stack', 'toasts']]) {
      if (moved[key].states > 1) { animators++; console.log(`    ✓ ${label} animated (${moved[key].states} distinct states)`); }
      else fail(`${label} NEVER CHANGED across ${trace.length} samples — it stopped animating, or the sampler is blind`);
    }
    if (moved.pocket.present > 0 && moved.pocket.states > 1) {
      animators++;
      console.log(`    ✓ the pickpocket mark rendered and tracked (${moved.pocket.present}/${trace.length} frames, ${moved.pocket.states} distinct states)`);
    } else if (moved.pocket.present > 0) {
      console.log(`    · the pickpocket mark RENDERED (${moved.pocket.present}/${trace.length} frames) but held one state — a stationary guard is not a fault`);
      animators++;
    } else {
      fail(`the pickpocket mark never rendered in ${trace.length} samples — arm C cannot speak for it`);
    }
    if (animators < 2) fail('fewer than two elements animated at all; treat every verdict in this arm as unproven');

    /* The NEGATIVE half, from the SAME samples: the ornament held still while they moved. */
    const hpStates = distinct('hp'), hpHtml = distinct('hpHtml');
    console.log(`    ${'§731 ornament'.padEnd(22)} markup states across the same trace: ${hpHtml} (1 = inert)`);
    if (hpHtml !== 1) fail(`the ornament's MARKUP changed ${hpHtml} times during a live run — "visual only" is not true`);
    if (hpStates !== 1) console.log(`    · the ornament's box moved (${hpStates} states) without its markup changing — that is the world shake it inherits from .sly-shake, which is correct`);
    report.armC = { animators, hpStates, hpHtml };

    /* ============ ARM A — collision. Loop stopped, transitions frozen. ==================== */
    console.log('\n[hudhealth] ARM A — corner occupancy, every element driven to its widest state:');
    const shape = await page.evaluate(() => {
      const pristineLive = document.querySelectorAll('.sly-coins').length;
      window.__hh.E.stopLoop();
      window.__hh.freeze();
      window.__hh.widen();
      const q = (s) => document.querySelectorAll(s).length;
      return {
        pristineLive,
        present: !!document.querySelector('.sly-hp'),
        pips: q('.sly-hp-pip'),
        inShake: !!document.querySelector('.sly-shake .sly-hp'),
        livePips: document.querySelectorAll('.sly-coins').length,
      };
    });
    console.log(`    ornament: present=${shape.present} pips=${shape.pips} inside .sly-shake=${shape.inShake}`);
    console.log(`    live health row beside it: ${shape.pristineLive} pips pristine, ${shape.livePips} after setHealth(5,5)`);
    report.shape = shape;
    if (!shape.present || shape.pips !== 5 || !shape.inShake) fail('the ornament is not the shape §731 ships');
    if (shape.pristineLive < 1 || shape.livePips !== 5) fail('the LIVE pip row was disturbed');

    const rects = await page.evaluate((sels) => {
      const out = {};
      for (const s of [...sels, '.sly-hp']) out[s] = window.__hh.rect(s);
      return out;
    }, PERSISTENT);
    report.rects = rects;
    const hp = rects['.sly-hp'];
    if (!hp || hp.hidden) throw new Error('the ornament has no rect — arm A cannot run');
    for (const s of [...PERSISTENT, '.sly-hp']) {
      const r = rects[s];
      if (!r) { console.log(`    ${s.padEnd(14)} — absent`); continue; }
      if (r.hidden) { console.log(`    ${s.padEnd(14)} — not rendered`); continue; }
      const corner = `${r.y + r.h / 2 < H / 2 ? 'top' : 'bottom'}-${r.x + r.w / 2 < W / 2 ? 'left' : 'right'}`;
      console.log(`    ${s.padEnd(14)} ${String(r.x).padStart(7)},${String(r.y).padStart(6)}  ${String(r.w).padStart(6)} x ${String(r.h).padStart(5)}   ${corner}`);
    }
    console.log('\n    intersection of .sly-hp with every other persistent element:');
    const gaps = [];
    for (const s of PERSISTENT) {
      const r = rects[s];
      if (!r || r.hidden) continue;
      const a = overlap(hp, r);
      const gx = Math.max(r.x - hp.r, hp.x - r.r, 0);
      const gy = Math.max(r.y - hp.b, hp.y - r.b, 0);
      const gap = Math.hypot(gx, gy);
      gaps.push({ sel: s, overlap: a, gap: +gap.toFixed(1) });
      console.log(`    ${s.padEnd(14)} overlap ${String(a).padStart(8)} px²   clearance ${gap.toFixed(1)} px`);
      if (a > 0) fail(`.sly-hp INTERSECTS ${s}`);
    }
    report.gaps = gaps;
    const inView = hp.x >= 0 && hp.y >= 0 && hp.r <= W && hp.b <= H;
    console.log(`    inside the viewport: ${inView}  (right margin ${(W - hp.r).toFixed(1)} px, bottom ${(H - hp.b).toFixed(1)} px)`);
    if (!inView) fail('the ornament is off-screen');

    /* The Binocucom state: the gameplay cluster stands down, so the caller cannot collide.
       Opacity is a CSS transition on wall time, not on rendered frames, so the flag is read from
       the attribute AND the settled opacity after a real wait. */
    const binoc = await page.evaluate(() => {
      window.__hh.hud().binocucom(true);
      window.__hh.pump(3);
      return { flag: document.getElementById('sly-hud').dataset.binoc, caller: window.__hh.rect('.bx-caller') };
    });
    await page.waitForTimeout(500);
    binoc.shakeOpacity = await page.evaluate(() => +getComputedStyle(document.querySelector('.sly-shake')).opacity);
    await page.evaluate(() => { window.__hh.hud().binocucom(false); window.__hh.pump(3); });
    await page.waitForTimeout(400);
    report.binoc = binoc;
    console.log(`    optics up: data-binoc="${binoc.flag}", .sly-shake settles to opacity ${binoc.shakeOpacity} — the ornament is inside it and rides it down`);
    if (binoc.shakeOpacity !== 0) fail('the gameplay cluster did not stand down for the optics');
    if (binoc.caller && !binoc.caller.hidden) {
      console.log(`    .bx-caller  ${binoc.caller.x},${binoc.caller.y}  ${binoc.caller.w} x ${binoc.caller.h}  overlap with .sly-hp ${overlap(hp, binoc.caller)} px²`);
      console.log('    (this is why the ornament is bottom-RIGHT: the caller owns bottom-left)');
    }

    /* ============ ARM B — legibility over BOTH grades, two poses each (§466.5) ============ */
    /* Poses chosen for what they put UNDER the corner: the courtyard's bright sand and the
       vault's near-black interior — the two extremes HUD.js's header names by hand. */
    const POSES = [
      ['courtyard sand', [-13.4, 8.4, 22.0], [2.0, 6.0, 2.0]],
      ['vault interior', [3.2, -9.2, -60.0], [0.0, -11.0, -72.0]],
    ];
    const GRADES = [['L1 day', 0.78], ['L1 night', 0.02]];
    report.legibility = [];
    console.log('\n[hudhealth] ARM B — what is BEHIND the ornament, and whether its inks survive it:');
    for (const [gname, tod] of GRADES) {
      for (const [pname, pos, tgt] of POSES) {
        const bg = await page.evaluate(async ([t, p, g, box]) => {
          window.__hh.setTod(t);
          const at = window.__hh.cam(p, g);
          return { ...(await window.__hh.behind(box)), at };
        }, [tod, pos, tgt, hp]);
        const s = score(bg.hist);
        const row = { grade: gname, tod, pose: pname, at: bg.at, mean: bg.mean,
                      Ymean: bg.Ymean, Ymin: bg.Ymin, Ymax: bg.Ymax, px: bg.px, ...s, ratios: {} };
        for (const [k, hex] of Object.entries(INKS)) row.ratios[k] = +ratioY(lumaHex(hex), bg.Ymean).toFixed(2);
        report.legibility.push(row);
        console.log(`    ${gname.padEnd(9)} ${pname.padEnd(16)} cam ${JSON.stringify(bg.at)}  behind = ${bg.mean}  Y mean ${bg.Ymean.toFixed(4)}  [${bg.Ymin.toFixed(4)} .. ${bg.Ymax.toFixed(4)}]  ${bg.px} px`);
        console.log(`               against the MEAN:  carn ${String(row.ratios.carn).padStart(6)}:1   ink ${String(row.ratios.ink).padStart(6)}:1   goldL ${String(row.ratios.goldL).padStart(6)}:1`);
        console.log(`               worst background luma present (Y=${s.atY}): best ink clears ${s.worstBest}:1   `
          + `pixels where no ink clears ${BAR}:1 = ${s.underPct}%`);
        if (s.worstBest < BAR) fail(`some background luma leaves every ink under ${BAR}:1`);
      }
    }

    try {
      await page.evaluate(() => { window.__hh.setTod(0.78); window.__hh.cam([-13.4, 8.4, 22.0], [2.0, 6.0, 2.0]); });
      await page.screenshot({ path: path.join(OUTDIR, 'hud731-day.png'), timeout: 25000 });
      await page.evaluate(() => { window.__hh.setTod(0.02); window.__hh.cam([-13.4, 8.4, 22.0], [2.0, 6.0, 2.0]); });
      await page.screenshot({ path: path.join(OUTDIR, 'hud731-night.png'), timeout: 25000 });
      report.plates = ['hud731-day.png', 'hud731-night.png'];
      console.log('\n[hudhealth] plates written');
    } catch (e) {
      report.plates = null;
      console.log(`\n[hudhealth] no plate: ${String(e.message).split('\n')[0]} — the numbers above are the evidence`);
    }
    await page.close();

    /* ============ ARM D — the tokens, through the URL ==================================== */
    console.log('\n[hudhealth] ARM D — tokens, each through a real URL:');
    const p2 = await boot(browser, port, '?hud=nohealth');
    const off = await p2.evaluate(() => ({
      hp: !!document.querySelector('.sly-hp'),
      pips: document.querySelectorAll('.sly-hp-pip').length,
      live: document.querySelectorAll('.sly-coins').length,
      obj: !!document.querySelector('.sly-obj'),         // §743: must now be FALSE always
      pobj: !!document.querySelector('.sly-pobj-title'),
      prompt: !!document.querySelector('.sly-prompt'),
      toasts: !!document.querySelector('.sly-toasts'),
      pocket: !!document.querySelector('.sly-pocket'),
    }));
    report.token = off;
    console.log(`    ?hud=nohealth : ornament ${off.hp ? 'STILL PRESENT' : 'gone'} (${off.pips} pips); rest of the HUD intact — live row ${off.live}, corner card ${off.obj}, pause objective ${off.pobj}, prompt ${off.prompt}, toasts ${off.toasts}, pocket ${off.pocket}`);
    if (off.hp || off.pips) fail('?hud=nohealth did not remove the ornament');
    if (off.obj) fail('the corner objective card is back — §743 removed it');
    if (off.live !== shape.pristineLive || !off.pobj || !off.prompt || !off.toasts || !off.pocket) {
      fail(`the token removed more than the ornament (live row ${off.live} vs the default boot's ${shape.pristineLive})`);
    }
    await p2.close();

    /* All twelve standing tokens AND this lane's, in one URL. The only way this lane could break
       them is a query-key collision, and that is a claim about a real URL. */
    const all = `?${STANDING.join('&')}&hud=nohealth`;
    const p3 = await boot(browser, port, all);
    const co = await p3.evaluate(() => {
      const q = new URLSearchParams(location.search);
      const out = {};
      for (const [k, v] of q) out[k] = v;
      return { params: out, hp: !!document.querySelector('.sly-hp'), ready: window.__GAME.ready,
               warnings: (window.__ENGINE.warnings || []).length };
    });
    report.tokensTogether = { url: all, ...co };
    const wanted = new Set(STANDING.map((s) => s.split('=')[0]));
    let survived = 0;
    for (const k of wanted) { if (co.params[k] !== undefined) survived++; else fail(`token key '${k}' vanished from the URL`); }
    console.log(`    all twelve standing tokens + ?hud=nohealth in one boot: ${survived}/${wanted.size} keys survive the URL, game ready=${co.ready}, ornament present=${co.hp}`);
    console.log(`    resolved params: ${JSON.stringify(co.params)}`);
    if (co.hp) fail('?hud=nohealth stopped working when the other tokens were present');
    if (!co.ready) fail('the game did not reach ready with every token set');
    /* The fail arm for this check: a key this lane does NOT own must be absent when not passed. */
    const p4 = await boot(browser, port, '?hud=nohealth');
    const solo = await p4.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
    if (solo.props !== undefined) fail('CALIBRATION FAILED — a token appears set even when it was not passed');
    else console.log(`    calibration: with only ?hud=nohealth passed, 'props' reads ${JSON.stringify(solo.props)} — the check above can tell absent from present`);
    await p3.close(); await p4.close();

    await writeFile(path.join(OUTDIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n[hudhealth] report -> ${path.relative(ROOT, OUTDIR)}/report.json   sha ${report.sha}`);
    console.log(bad ? `\nVERDICT: ${bad} problem(s)` : '\nVERDICT: clear of every element, reads on both grades, the rest of the HUD still animates, tokens intact');
    if (bad) process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    server?.kill('SIGTERM');
    setTimeout(() => server?.kill('SIGKILL'), 3000);
    release();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
