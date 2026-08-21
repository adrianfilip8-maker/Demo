/**
 * hud.test.mjs — the UI, measured offline.
 *
 * Thresholds for every assertion here were registered in `progress/records/PREREG-hud1.md` and
 * committed BEFORE the candidate existed (§141.1). Nothing below is re-derived from what the
 * code turned out to do.
 *
 * The HUD is a DOM overlay and `window.__GAME.capture()` is a WebGL canvas readback
 * (`src/core/Debug.js:192` → `engine.canvas.toDataURL()`), so no change in `src/ui/*` can move a
 * pixel in any capture. That is asserted structurally in the last block rather than assumed —
 * it is the reason this file can exist at all without taking the capture lock.
 *
 * Every data-driven block asserts a NON-ZERO, exactly-pinned inspected count (§211.1), so a table
 * that silently loses rows fails instead of passing having looked at nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  ALERT_STATES, LIVE_LADDER, CONE, THREAT,
  alertFor, threatFor, contrast, luminance, parseHex,
} from '../src/ui/Alert.js';
import { installDom, fakeEngine } from './_hudshim.mjs';

const SRC = new URL('../src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, SRC), 'utf8');

/* ====================================================================== M1 */
/* Every alert state must be distinctly presented.                          */

/** The four channels a badge can differ in. */
const CHANNELS = ['glyph', 'colour', 'ring', 'label'];

/**
 * Registered threshold: for every unordered pair of live states the tuples must differ in at
 * least TWO channels, and no two may share the same (glyph, colour) pair.
 */
function distinctnessFailures(present) {
  const failures = [];
  let pairs = 0;
  for (let i = 0; i < LIVE_LADDER.length; i++) {
    for (let j = i + 1; j < LIVE_LADDER.length; j++) {
      pairs++;
      const A = LIVE_LADDER[i];
      const B = LIVE_LADDER[j];
      const a = present(A);
      const b = present(B);
      const diff = CHANNELS.filter((k) => a[k] !== b[k]);
      if (diff.length < 2) {
        failures.push(`${A}/${B}: differs in only ${diff.length} channel(s) [${diff.join(',') || 'none'}]`);
      } else if (a.glyph === b.glyph && a.colour === b.colour) {
        failures.push(`${A}/${B}: same (glyph,colour) = ('${a.glyph}','${a.colour}')`);
      }
    }
  }
  return { failures, pairs };
}

/**
 * CALIBRATION ARM — the consumer this replaced, reconstructed.
 *
 * `_onGuardAlert` read `let level = p.level ?? p.suspicion ?? ...` FIRST. `Guard._setState` sets
 * `p.level` on every emit, so the `??` chain always short-circuited on a number and the
 * `p.state` ladder underneath it was unreachable code. Presentation was then, entirely, the arc:
 * gold `?` from `Icons.alertArc()`, flipping to carnelian `!` only once fill passed 0.985. No
 * label element existed.
 *
 * Levels are `suspicion / DETECT.chase` at each band edge (Patrol.js: 0.34 / 0.72 / 1.00); `lost`
 * sits mid-drain between the search band and chase.
 */
const LEGACY_LEVEL = { patrol: 0, suspicious: 0.34, searching: 0.72, chase: 1.0, lost: 0.80 };
function legacyPresent(state) {
  const level = LEGACY_LEVEL[state];
  const full = level > 0.985;
  return { glyph: full ? '!' : '?', colour: full ? '#b8452c' : '#e8b942', ring: level, label: '' };
}

const shipPresent = (state) => ALERT_STATES[state];

test('M1 CALIBRATION (must fire): the pre-fix mapping fails the distinctness assertion', () => {
  const { failures, pairs } = distinctnessFailures(legacyPresent);
  assert.equal(pairs, 10, 'C(5,2) pairs must be inspected');       // §211.1
  assert.ok(failures.length > 0,
    'CALIBRATION FAILED — the instrument cannot see the defect it exists to catch. ' +
    'Interrogate the instrument; do not adjust it.');
  // It must name the specific collision, not just fail vaguely.
  assert.ok(failures.some((f) => f.startsWith('suspicious/searching')),
    `expected suspicious/searching to collide under the old mapping, got:\n  ${failures.join('\n  ')}`);
});

test('M1: every live alert state is distinctly presented', () => {
  const { failures, pairs } = distinctnessFailures(shipPresent);
  assert.equal(pairs, 10);                                          // §211.1
  assert.deepEqual(failures, [], `states not distinguishable:\n  ${failures.join('\n  ')}`);
});

test('M1: the ladder covers every state Patrol can emit, and nothing else', () => {
  const emitted = Object.values(patrolStates());
  assert.ok(emitted.length >= 5, 'expected Patrol.STATE to publish at least five states');
  for (const s of emitted) {
    assert.ok(ALERT_STATES[s], `Patrol emits '${s}' but the HUD has no presentation for it`);
  }
  for (const s of Object.keys(ALERT_STATES)) {
    assert.ok(emitted.includes(s), `HUD presents '${s}' but Patrol never emits it`);
  }
  assert.equal(emitted.length, Object.keys(ALERT_STATES).length);
});

/** Parse `STATE` out of Patrol.js rather than importing it — `src/ai/*` is another agent's file. */
function patrolStates() {
  const src = read('ai/Patrol.js');
  const block = /export const STATE = \{([\s\S]*?)\}/.exec(src);
  assert.ok(block, 'could not find `export const STATE` in src/ai/Patrol.js');
  const out = {};
  for (const m of block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) out[m[1]] = m[2];
  assert.ok(Object.keys(out).length > 0, 'parsed zero states from Patrol.js');   // §211.1
  return out;
}

test('M1: state wins over level — the bug that collapsed the ladder cannot return', () => {
  // A real payload carries BOTH. The number must never again decide the presentation.
  const p = { id: 'g1', state: 'searching', level: 1.0, suspicion: 1.0 };
  assert.equal(alertFor(p).state, 'searching');
  assert.equal(alertFor(p).label, 'SEARCHING');
  // …and a payload with no state still resolves through the numeric bands.
  assert.equal(alertFor({ id: 'g2', level: 1.0 }).state, 'chase');
  assert.equal(alertFor({ id: 'g3', level: 0.4 }).state, 'suspicious');
  assert.equal(alertFor({ id: 'g4', level: 0 }).state, 'patrol');
});

test('M1: the HUD badge colours are the vision cone stops, not a second language', () => {
  const guard = read('ai/Guard.js');
  const stop = (k) => {
    const m = new RegExp(`${k}:\\s*0x([0-9a-fA-F]{6})`).exec(guard);
    assert.ok(m, `could not read TUNE.${k} from src/ai/Guard.js`);
    return `#${m[1].toLowerCase()}`;
  };
  assert.equal(CONE.cream, stop('colPatrol'));
  assert.equal(CONE.amber, stop('colWarn'));
  assert.equal(CONE.red, stop('colAlert'));
});

/* ====================================================================== M2 */
/* Contrast is a real number.                                               */

const INK = '#1a1210';        // the 8-direction halo every `.sly-ink` run carries
const PAINT = '#f2e8d4';
const LAPIS_D = '#1f4f96';
const TOAST_BG = '#1a1210';
const PROMPT_BG = '#140e0c';  // rgba(20,14,12,.9) over anything dark
const CALLER_BG = '#0e0b0a';  // rgba(14,11,10,.92)

/**
 * Registered: >= 4.5:1 body, >= 3.0:1 large/icon. Applied here as 4.5 for EVERY text pair — a
 * strictly tighter bar than registered, which is allowed; loosening it would not be.
 */
const TEXT_MIN = 4.5;

const TEXT_PAIRS = [
  ['alert badge · unseen',      CONE.cream,             INK],
  ['alert badge · noticed',     CONE.amber,             INK],
  ['alert badge · spotted',     CONE.red,               INK],
  ['alert badge · downed',      ALERT_STATES.ko.colour, INK],
  ['threat chip · hidden',      THREAT.hidden.colour,   INK],
  ['threat chip · noticed',     THREAT.noticed.colour,  INK],
  ['threat chip · hunted',      THREAT.hunted.colour,   INK],
  ['threat chip · spotted',     THREAT.spotted.colour,  INK],
  ['coin counter',              '#ffe9a8',              INK],
  ['objective title',           INK,                    PAINT],
  ['objective subtitle',        '#6b503c',              PAINT],
  ['objective kicker',          '#ffe9a8',              LAPIS_D],
  ['toast body',                PAINT,                  TOAST_BG],
  ['prompt verb',               PAINT,                  PROMPT_BG],
  ['pause title',               INK,                    PAINT],
  ['pause group heading',       '#ffe9a8',              INK],
  ['pause row description',     INK,                    PAINT],
  ['pause row detail',          '#6b503c',              PAINT],
  ['pause resume button',       '#ffe9a8',              INK],
  ['pause tip',                 '#6b503c',              PAINT],
  ['binocucom readout',         '#8fd8ff',              INK],
  ['binocucom caller name',     '#ffe9a8',              CALLER_BG],
  ['binocucom caller line',     PAINT,                  CALLER_BG],
  ['thief-o-vision tag',        '#8fd8ff',              INK],
  ['lock-on label',             '#8fd8ff',              INK],
];

function contrastFailures(pairs, min) {
  const failures = [];
  for (const [what, fg, bg] of pairs) {
    const r = contrast(fg, bg);
    if (r < min) failures.push(`${what}: ${fg} on ${bg} = ${r.toFixed(2)}:1 (needs ${min}:1)`);
  }
  return failures;
}

test('M2 CALIBRATION (must fire): the ratio function reports a known-bad pair and clears a known-good one', () => {
  const bad = contrastFailures([['known-bad', '#e8b942', '#ffe9a8']], TEXT_MIN);
  assert.equal(bad.length, 1,
    'CALIBRATION FAILED — gold on pale gold must be reported as insufficient. ' +
    'The contrast instrument is blind; interrogate it.');
  const good = contrastFailures([['known-good', PAINT, INK]], TEXT_MIN);
  assert.deepEqual(good, [], 'CALIBRATION FAILED — cream on ink must pass.');

  // The arithmetic itself, against values fixed by the WCAG 2.1 definition.
  assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9, 'white luminance must be 1');
  assert.ok(Math.abs(luminance('#000000')) < 1e-9, 'black luminance must be 0');
  assert.ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 1e-6, 'white/black must be 21:1');
  assert.deepEqual(parseHex('#8fd8ff'), [143, 216, 255]);
});

test('M2: every text pair in the HUD clears 4.5:1', () => {
  assert.ok(TEXT_PAIRS.length >= 20, 'refusing to pass on a token sample');   // §211.1
  assert.equal(TEXT_PAIRS.length, 25);
  const failures = contrastFailures(TEXT_PAIRS, TEXT_MIN);
  assert.deepEqual(failures, [], `contrast failures:\n  ${failures.join('\n  ')}`);
});

test('M2: the colours asserted above are the colours the stylesheet actually ships', () => {
  const css = read('ui/hud.css.js');
  // If a token is retuned, this test must break rather than keep certifying a stale number.
  const tokens = { '--ink': INK, '--paint': PAINT, '--lapis-d': LAPIS_D, '--gold-l': '#ffe9a8', '--spark': '#8fd8ff' };
  let checked = 0;
  for (const [name, want] of Object.entries(tokens)) {
    const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`).exec(css);
    assert.ok(m, `token ${name} not found in hud.css.js`);
    assert.equal(m[1].toLowerCase(), want, `${name} changed — re-check the contrast table`);
    checked++;
  }
  assert.equal(checked, 5);                                                   // §211.1
  // The objective kicker sits on the DARK lapis; on plain --lapis it measures 3.44:1 and fails.
  assert.match(css, /\.sly-obj-kick\s*\{[^}]*background:\s*var\(--lapis-d\)/,
    'the objective kicker must sit on --lapis-d — --lapis fails the contrast bar');
});

/* ====================================================================== M3 */
/* A live alert survives an edge-triggered source.                          */

async function bootHud() {
  installDom();
  const { HUD } = await import('../src/ui/HUD.js');
  const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -20);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const engine = fakeEngine(camera);
  const hud = new HUD(engine);
  await hud.init();
  return { hud, engine, camera };
}

/** Advance `seconds` of frames at 60 Hz. */
function run(hud, engine, seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    engine.dt = dt;
    engine.time += dt;
    hud.update(dt);
  }
}

const badges = (hud) => hud.el.marks.querySelectorAll('.sly-alert');

test('M3: one edge-triggered emit keeps a SEARCHING badge alive for 30s of silence', async () => {
  const { hud, engine } = await bootHud();
  engine.emit('guardAlert', { id: 'g1', state: 'searching', level: 0.72, pos: new THREE.Vector3(0, 0, -12) });

  run(hud, engine, 30);

  const live = badges(hud);
  assert.equal(live.length, 1, 'the badge was erased while the guard was still searching');
  assert.equal(live[0].querySelector('.sly-alert-lbl').textContent, 'SEARCHING');
  assert.equal(live[0].dataset.state, 'searching');
  hud.dispose();
});

test('M3 CALIBRATION (must fire): the same harness observes a retired badge disappear', async () => {
  const { hud, engine } = await bootHud();
  // `ko` is a non-live state: it must linger briefly, then be collected. If this arm does not
  // fire, the harness is simply reporting "present" for everything and M3 proves nothing.
  engine.emit('guardAlert', { id: 'g1', state: 'ko', pos: new THREE.Vector3(0, 0, -12) });

  run(hud, engine, 0.5);
  assert.equal(badges(hud).length, 1, 'a downed guard should still be shown briefly');

  run(hud, engine, 30);
  assert.equal(badges(hud).length, 0,
    'CALIBRATION FAILED — the harness never observes removal, so M3 is vacuous.');
  hud.dispose();
});

test('M3: a transition back to patrol retires the badge; chase does not', async () => {
  const { hud, engine } = await bootHud();
  const pos = new THREE.Vector3(0, 0, -12);
  engine.emit('guardAlert', { id: 'g1', state: 'chase', level: 1, pos });
  run(hud, engine, 30);
  assert.equal(badges(hud).length, 1, 'a chasing guard must stay on screen');

  engine.emit('guardAlert', { id: 'g1', state: 'patrol', level: 0, pos });
  run(hud, engine, 5);
  assert.equal(badges(hud).length, 0, 'returning to patrol must clear the badge');
  hud.dispose();
});

test('M3: the old TTL is gone from the source, not merely lengthened', () => {
  const src = read('ui/HUD.js');
  assert.ok(!/alertTTL/.test(src), 'alertTTL still present — the TTL model was not removed');
  assert.match(src, /alertFade/, 'expected the retire-only fade to replace it');
});

/* ====================================================================== M4 */
/* The badge tracks the guard.                                              */

function badgeX(hud) {
  const el = badges(hud)[0];
  assert.ok(el, 'no badge to measure');
  const m = /translate\(([-\d.]+)px/.exec(el.style.transform || '');
  assert.ok(m, `badge has no translate transform, got: ${el.style.transform}`);
  return parseFloat(m[1]);
}

test('M4: moving the guard moves the badge', async () => {
  const { hud, engine } = await bootHud();
  const pos = new THREE.Vector3(0, 0, -12);          // live reference, as Guard.js emits
  engine.emit('guardAlert', { id: 'g1', state: 'chase', level: 1, pos });

  run(hud, engine, 0.2);
  const before = badgeX(hud);

  pos.x += 5;                                         // the guard walks, no new event
  run(hud, engine, 0.2);
  const after = badgeX(hud);

  assert.ok(Math.abs(after - before) > 1,
    `badge did not follow the guard: ${before.toFixed(1)}px → ${after.toFixed(1)}px`);
  hud.dispose();
});

test('M4 CALIBRATION (must fire): a snapshot payload does NOT move, proving the probe is two-sided', async () => {
  const { hud, engine } = await bootHud();
  // An array payload is a value, not a reference — it cannot track, by construction. If this
  // arm moves anyway, `badgeX` is measuring something other than the projected position.
  const arr = [0, 0, -12];
  engine.emit('guardAlert', { id: 'g1', state: 'chase', level: 1, pos: arr });

  run(hud, engine, 0.2);
  const before = badgeX(hud);
  arr[0] += 5;
  run(hud, engine, 0.2);
  const after = badgeX(hud);

  assert.equal(after, before,
    'CALIBRATION FAILED — a by-value payload appeared to track, so M4 measures nothing.');
  hud.dispose();
});

/* ====================================================================== M5 */
/* The aggregate exposure readout.                                          */

test('M5: threat is the worst guard state, with a count at the top rank', () => {
  assert.equal(threatFor([]).key, 'hidden');
  assert.equal(threatFor(['patrol', 'patrol']).key, 'hidden');
  assert.equal(threatFor(['patrol', 'suspicious']).key, 'noticed');
  assert.equal(threatFor(['suspicious', 'searching']).key, 'hunted');
  assert.equal(threatFor(['searching', 'chase']).key, 'spotted');
  assert.equal(threatFor(['lost', 'searching']).key, 'hunted');
  // A downed guard is not a threat.
  assert.equal(threatFor(['ko', 'stunned']).key, 'hidden');

  const two = threatFor(['searching', 'lost', 'patrol']);
  assert.equal(two.key, 'hunted');
  assert.equal(two.count, 2, 'both hunting guards must be counted');
  assert.equal(two.inspected, 3);                                   // §211.1
});

test('M5: the chip reaches the DOM and tracks the ladder', async () => {
  const { hud, engine } = await bootHud();
  assert.equal(hud.el.threat.dataset.state, 'hidden');
  assert.equal(hud.el.threatLbl.textContent, 'HIDDEN');

  engine.emit('guardAlert', { id: 'g1', state: 'suspicious', level: 0.34, pos: new THREE.Vector3(0, 0, -12) });
  assert.equal(hud.el.threat.dataset.state, 'noticed');
  assert.equal(hud.el.threatLbl.textContent, 'NOTICED');

  engine.emit('guardAlert', { id: 'g2', state: 'chase', level: 1, pos: new THREE.Vector3(3, 0, -12) });
  assert.equal(hud.el.threat.dataset.state, 'spotted');
  assert.equal(hud.el.threatLbl.textContent, 'SPOTTED');

  engine.emit('guardAlert', { id: 'g1', state: 'patrol', level: 0, pos: new THREE.Vector3(0, 0, -12) });
  engine.emit('guardAlert', { id: 'g2', state: 'patrol', level: 0, pos: new THREE.Vector3(3, 0, -12) });
  run(hud, engine, 5);
  assert.equal(hud.el.threat.dataset.state, 'hidden', 'the chip must fall back to HIDDEN');
  hud.dispose();
});

test('M5: two guards at the same rank report a count the player can act on', async () => {
  const { hud, engine } = await bootHud();
  engine.emit('guardAlert', { id: 'a', state: 'searching', level: 0.72, pos: new THREE.Vector3(0, 0, -12) });
  engine.emit('guardAlert', { id: 'b', state: 'lost', level: 0.8, pos: new THREE.Vector3(4, 0, -12) });
  assert.equal(hud.el.threatNum.textContent, '×2');
  assert.equal(badges(hud).length, 2, 'each guard keeps his own badge');
  hud.dispose();
});

/* ====================================================================== M6 */
/* Legibility floor — ADDENDUM-hud1-legibility.md.                          */

/**
 * Selectors whose text is read while play continues. Everything under `.sly-pause` is reference
 * text, read only with the game stopped.
 */
const GAMEPLAY = [
  '.sly-coin-num', '.sly-coin-plus', '.sly-threat-lbl', '.sly-threat-num',
  '.sly-obj-kick', '.sly-obj-title', '.sly-obj-sub', '.sly-toast', '.sly-prompt-verb',
  '.sly-tov-tag', '.sly-mark .lbl', '.sly-alert-glyph', '.sly-alert-lbl',
  '.bx-mono', '.bx-rec', '.bx-caller-name', '.bx-caller-line',
];
const REFERENCE = [
  '.sly-grp > h4', '.sly-row .dsc', '.sly-row .dsc small', '.sly-row .ks .plus',
  '.sly-btn', '.sly-pause-tip', '.sly-pause-title em',
];

/** Pull every `<selector> { … font-size: calc(var(--u) * N) … }` out of the stylesheet. */
function fontScale() {
  const css = read('ui/hud.css.js');
  const out = new Map();
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const fs = /font-size:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(m[2]);
    if (!fs) continue;
    for (const sel of m[1].split(',')) {
      const s = sel.trim().replace(/\s+/g, ' ');
      if (s) out.set(s, parseFloat(fs[1]));
    }
  }
  return out;
}

function legibilityFailures(scale) {
  const ref = REFERENCE.map((s) => scale.get(s)).filter((v) => typeof v === 'number');
  assert.ok(ref.length >= 5, `only ${ref.length} reference text runs parsed — regex has rotted`);
  const floor = Math.min(...ref);
  const failures = [];
  let inspected = 0;
  for (const sel of GAMEPLAY) {
    const v = scale.get(sel);
    if (typeof v !== 'number') continue;
    inspected++;
    if (v < floor) failures.push(`${sel}: ${v}u < reference floor ${floor}u`);
  }
  return { failures, inspected, floor };
}

test('M6 CALIBRATION (must fire): the pre-fix sizes fail the legibility floor', () => {
  const scale = fontScale();
  // The two values as they shipped before this run.
  scale.set('.sly-alert-lbl', 0.58);
  scale.set('.sly-mark .lbl', 0.62);
  const { failures, inspected } = legibilityFailures(scale);
  assert.ok(inspected >= 12, `only ${inspected} gameplay runs inspected`);      // §211.1
  assert.equal(failures.length, 2,
    `CALIBRATION FAILED — expected exactly the two undersized labels to be caught, got:\n  ${failures.join('\n  ')}`);
  assert.ok(failures.some((f) => f.startsWith('.sly-alert-lbl')));
  assert.ok(failures.some((f) => f.startsWith('.sly-mark .lbl')));
});

test('M6: no gameplay text is smaller than the smallest pause-menu text', () => {
  const scale = fontScale();
  const { failures, inspected, floor } = legibilityFailures(scale);
  assert.ok(inspected >= 12, `only ${inspected} gameplay runs inspected`);      // §211.1
  assert.equal(floor, 0.68, 'reference floor moved — re-read the addendum before touching this');
  assert.deepEqual(failures, [], `text too small to read at 1280x720:\n  ${failures.join('\n  ')}`);
});

test('M6: the Binocucom readouts clear their own corner brackets', () => {
  const css = read('ui/hud.css.js');
  const u = (re, what) => {
    const m = re.exec(css);
    assert.ok(m, `could not read ${what}`);
    return parseFloat(m[1]);
  };
  // Bracket box: the size is on `.bx-corner`, the inset on the per-corner rules.
  const size = u(/\.bx-corner\s*\{[^}]*?width:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/, '.bx-corner size');
  const inset = u(/\.bx-corner\.tl\s*\{[^}]*?left:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/, '.bx-corner.tl inset');
  const reach = inset + size;    // how far in from the corner the bracket actually reaches

  let checked = 0;
  for (const [sel, re] of [
    ['.bx-tl', /\.bx-tl\s*\{[^}]*?top:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/],
    ['.bx-bl', /\.bx-bl\s*\{[^}]*?bottom:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/],
    ['.bx-br', /\.bx-br\s*\{[^}]*?bottom:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/],
    ['.bx-rec', /\.bx-rec\s*\{[^}]*?top:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/],
  ]) {
    const v = u(re, sel);
    assert.ok(v >= reach, `${sel} starts at ${v}u but the corner bracket reaches ${reach}u`);
    checked++;
  }
  assert.equal(checked, 4);                                                    // §211.1
});

/* ============================================================ capture seam */

test('the HUD cannot appear in any capture: DOM overlay vs canvas readback', () => {
  const dbg = read('core/Debug.js');
  // The capture path reads the WebGL canvas, which no DOM node composites into.
  assert.match(dbg, /capture:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?canvas[\s\S]*?toDataURL/,
    'capture() no longer reads the canvas — the DOM-invisibility argument must be rechecked');

  // Belt as well as braces: the HUD still honours hideHud, re-checked every frame.
  const hud = read('ui/HUD.js');
  assert.match(hud, /_applyVisibility\(\);\s*\n\s*if \(this\._hiddenNow\) return;/,
    'update() must re-check hideHud every frame');
  assert.match(read('ui/hud.css.js'), /#sly-hud\[data-hidden='1'\]\s*\{\s*display:\s*none/);
});

test('the HUD stays self-contained: no runtime fetches, no CDN, no web fonts', () => {
  let checked = 0;
  for (const f of ['ui/HUD.js', 'ui/Icons.js', 'ui/hud.css.js', 'ui/Alert.js']) {
    const src = read(f);
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(src), `${f} references a remote URL`);
    assert.ok(!/@import|@font-face/.test(src), `${f} pulls a web font`);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest/.test(src), `${f} fetches at runtime`);
    checked++;
  }
  assert.equal(checked, 4);                                          // §211.1
});

/* ========================================================== §516 pad glyphs */

test('§516: prompts follow the device, and every pad glyph they can name is a committed Kenney file', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the real HUD under the shim — a keyboard 'E' prompt renders a keycap; after
   *               the pad claims the device flag and `inputDevice` fires, the same on-screen
   *               prompt re-renders as Circle's imported glyph and the OPEN pause cel's key
   *               columns re-render to shapes in place, keeping their open state; flipping back
   *               restores keycaps. Statically: every glyph name the cel's `p:` columns and the
   *               PAD_KEY prompt map can reach resolves through PAD_GLYPH_FILES to a file that
   *               exists under `public/assets/prompts/`, every payload file there is consumed
   *               (nothing imported unused), and the licence + provenance ride beside them.
   *   fails  on : RUN in-arm — a glyph name with no file ('L9') must render the text fallback
   *               and no <image>; and, by construction, a deleted or renamed asset, a PAD_KEY
   *               or `p:` row naming an unshipped glyph, or a 13th committed file no code path
   *               consumes.
   *   does NOT  : discriminate pixels — the shim renders nothing, so the white-glyph-on-dark-cap
   *   discrim.    legibility argument in Icons.padBtn is design reasoning verified only by eyes
   *               (hardware sheet item 14); nor a physical DualShock 4, which does not exist in
   *               this container.
   */
  const { existsSync, readdirSync } = await import('node:fs');
  const { padBtn, PAD_GLYPH_FILES } = await import('../src/ui/Icons.js');
  const PROMPTS = new URL('../public/assets/prompts/', import.meta.url);

  /* ---- static: the three name tables and the directory agree in every direction ---- */
  const onDisk = readdirSync(PROMPTS).filter((f) => f.endsWith('.svg')).sort();
  const shipped = [...new Set(Object.values(PAD_GLYPH_FILES))].sort();
  assert.equal(shipped.length, 12, 'PAD_GLYPH_FILES gained or lost a glyph — re-pin this count deliberately');
  assert.deepEqual(onDisk, shipped,
    'public/assets/prompts/ and Icons.PAD_GLYPH_FILES disagree — a glyph is either committed with '
    + 'no consumer (dead import) or named with no file (broken <image> at runtime)');
  for (const doc of ['LICENSE.txt', 'PROVENANCE.md']) {
    assert.ok(existsSync(new URL(doc, PROMPTS)), `${doc} must travel beside the CC0 assets`);
  }
  const hudSrc = read('ui/HUD.js');
  const celNames = [...hudSrc.matchAll(/P\('([^']+)'\)/g)].map((m) => m[1])
    .map((n) => (n === 'stick' ? 'LS' : n === 'stickR' ? 'RS' : n));
  const mapBody = /const PAD_KEY = \{([\s\S]*?)\};/.exec(hudSrc)?.[1] ?? '';
  const mapNames = [...mapBody.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(celNames.length >= 12 && mapNames.length >= 9,
    `the scrape went blind — ${celNames.length} cel names, ${mapNames.length} map names`);   // §211.1
  for (const n of [...celNames, ...mapNames]) {
    assert.ok(PAD_GLYPH_FILES[n], `'${n}' is offered to players but PAD_GLYPH_FILES has no glyph for it`);
  }

  /* ---- RUN counterexample: an unknown name must fall back to text, not a dead image ---- */
  const junk = padBtn('L9');
  assert.ok(!junk.includes('<image') && junk.includes('L9'),
    'an unmapped pad label must render as a text cap — a dead <image> is an invisible button');

  /* ---- behavioural: the live prompt and the open cel follow the device flag ---- */
  const { hud, engine } = await bootHud();
  hud.prompt('Grab', 'E');
  assert.ok(!hud.el.promptKey.innerHTML.includes('<image'),
    'keyboard-last must render a keycap, and did not');
  hud.el.pause.classList.add('on');                       // the cel is OPEN during the flip
  engine.input.lastDevice = 'pad';
  engine.emit('inputDevice', 'pad');
  assert.ok(hud.el.promptKey.innerHTML.includes(PAD_GLYPH_FILES.circle),
    "the on-screen 'E' prompt did not become Circle when the pad took the device");
  assert.ok(hud.el.pause.classList.contains('on'),
    'the device flip closed the open pause cel — the in-place re-render regressed to replacement');
  const cols = hud.el.pause.querySelector('.sly-cols').innerHTML;
  const used = new Set([...cols.matchAll(/href="assets\/prompts\/([^"]+)"/g)].map((m) => m[1]));
  assert.equal(used.size, 12,
    `the pad cel should render all 12 imported glyphs, rendered ${used.size} — a row lost its pad column`);
  for (const f of used) {
    assert.ok(existsSync(new URL(f, PROMPTS)), `the cel names ${f} and the file is not committed`);
  }
  hud.prompt('Thief-o-Vision', 'RMB');
  assert.ok(hud.el.promptKey.innerHTML.includes(PAD_GLYPH_FILES.R2),
    'a mouse-bound prompt (RMB) must map to its pad verb (R2) while the pad is live');
  hud.prompt('Open', undefined);
  assert.ok(hud.el.promptKey.innerHTML.includes(PAD_GLYPH_FILES.circle),
    "a keyless prompt defaults to the interact family — on pad that is Circle, not a keycap 'E'");
  engine.input.lastDevice = 'kbm';
  engine.emit('inputDevice', 'kbm');
  hud.prompt('Grab', 'E');
  assert.ok(!hud.el.promptKey.innerHTML.includes('<image'),
    'returning to the keyboard must restore keycaps, and did not');
  hud.dispose();
});
