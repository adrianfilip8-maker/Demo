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
  assert.equal(shipped.length, 11, 'PAD_GLYPH_FILES gained or lost a glyph — re-pin this count deliberately');
  /* 12 -> 11 at §682: `focus` moved off R2, R2 is bound to nothing, and its glyph went with it. */
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
  assert.equal(used.size, 11,
    `the pad cel should render all 11 imported glyphs, rendered ${used.size} — a row lost its pad column`);
  for (const f of used) {
    assert.ok(existsSync(new URL(f, PROMPTS)), `the cel names ${f} and the file is not committed`);
  }
  hud.prompt('Thief-o-Vision', 'RMB');
  /* §682: RMB's pad twin is R3 now, not R2. */
  assert.ok(hud.el.promptKey.innerHTML.includes(PAD_GLYPH_FILES.R3),
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

/* ============================================================= §731 ornament */
/* The Sly 4 health readout in the bottom-right corner. The owner asked for it "visual only",  */
/* so the load-bearing claim in this block is a NEGATIVE one — that nothing can change it —    */
/* and a negative claim is worth nothing unless the probe is shown catching a positive.        */

/** Normalised drawing text, so whitespace in the template literals is not a difference. */
const draw = (svg) => String(svg).replace(/\s+/g, ' ').trim();

/**
 * Registered probe: two pip drawings differ iff their normalised SVG text differs. Trivial on
 * purpose — the point of the calibration below is that it is two-sided, not that it is clever.
 */
const sameDrawing = (a, b) => draw(a) === draw(b);

test('§731 CALIBRATION (must fire): the drawing probe reports a known-same pair and a known-different one', async () => {
  const Ico = await import('../src/ui/Icons.js');
  // Same input, twice: the probe must NOT invent a difference.
  assert.ok(sameDrawing(Ico.pip(true, 'mask'), Ico.pip(true, 'mask')),
    'CALIBRATION FAILED — the probe reports a difference between one drawing and itself');
  // A pair that really differs: the probe must not sleep through it.
  assert.ok(!sameDrawing(Ico.pip(true, 'mask'), Ico.pip(true, 'charm')),
    'CALIBRATION FAILED — the probe cannot tell the mask badge from the horseshoe');
});

test('§731: the ornament ships BOTH pip states as real, distinct drawings', async () => {
  const Ico = await import('../src/ui/Icons.js');
  const full = Ico.pip(true, 'mask');
  const empty = Ico.pip(false, 'mask');

  let inspected = 0;
  for (const [name, svg] of [['filled', full], ['empty', empty]]) {
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/, `the ${name} mask badge is not an svg`);
    // A drawing, not a stub: the oval ground and the mask silhouette both have to be in there.
    assert.match(svg, /<ellipse[^>]*rx="17\.6"[^>]*ry="15\.2"/, `the ${name} badge lost its oval`);
    assert.match(svg, /<path[^>]*\bd="M10\.2 12\.6Q/, `the ${name} badge lost the mask silhouette`);
    inspected++;
  }
  assert.equal(inspected, 2);                                                  // §211.1

  /* The whole reason the empty art exists: HP_FULL === HP_PIPS today, so nothing in the shipped
     markup renders it, and dead art rots silently. This arm is what keeps it alive. */
  assert.ok(!sameDrawing(full, empty),
    'the empty badge is byte-identical to the filled one — the spent state is not drawn');
  // Spent still COUNTS: it keeps the ink outline rather than vanishing.
  assert.match(empty, /stroke-width="4\.2"/, 'the spent badge lost the outline that makes it count');
  // ...and it is not the filled badge with the fill removed — the mask survives as a traced line.
  assert.match(empty, /stroke="#8fd8ff"/, 'the spent badge dropped its mask tracing');
  /* The filled badge carries all four inks the §731.3 contrast bound is computed over. If any of
     them is dropped the bound in the sweep arm below stops describing what actually ships. */
  let inks = 0;
  for (const [what, re] of [
    ['the sky-blue oval', /fill="#8fd8ff"/], ['the navy mask', /fill="#1f4f96"/],
    ['the near-white eye slits', /fill="#f2e8d4"/], ['the ink outline', /stroke="#1a1210"/],
  ]) { assert.match(full, re, `the filled badge lost ${what}`); inks++; }
  assert.equal(inks, 4);                                                       // §211.1
  // TWO eye slits, not one: a single slit is not the mark.
  assert.equal((full.match(/fill="#f2e8d4"/g) ?? []).length, 2,
    'the badge must have exactly two eye slits');

  /* A different silhouette from BOTH live-row pips — "a second widget with its own art" is
     exactly what it must not become, and the live row sits directly above it now. */
  assert.ok(!sameDrawing(full, Ico.pip(true, 'life')), 'the badge collides with the life pip');
  assert.ok(!sameDrawing(full, Ico.pip(true, 'charm')), 'the badge collides with the charm pip');
});

/**
 * §731.3 — does the drawing actually describe the MASK the owner sent?
 *
 * "It is an svg and it has a path in it" is not that claim. The owner's reference has four
 * features that make it the Cooper mark rather than a blue blob, and every one of them is a
 * geometric fact about the path data, checkable here without a rasteriser:
 * two ear-peaks, a concave dip between them, a notch at bottom centre, and two eye slits whose
 * OUTER ends ride higher than their inner ones. The rendered-pixel half of this claim — that the
 * features survive at the size it actually ships — is `tools/hudvisible.mjs`, which counts them
 * off the production frame.
 */
function pathPoints(d) {
  const pts = [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
    .map((m) => ({ x: +m[1], y: +m[2] }));
  /* A closed path names its start point again at the end, which read as a third ear peak the
     first time this ran. Dedupe by coordinate. */
  const seen = new Set();
  return pts.filter((q) => {
    const k = `${q.x},${q.y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The dip is the feature that separates the mask from a blob: peaks alone do not. */
function topDip(pts) {
  const topY = Math.min(...pts.map((q) => q.y));
  const peaks = pts.filter((q) => Math.abs(q.y - topY) < 0.01);
  const centre = pts.filter((q) => Math.abs(q.x - 23) < 0.01 && q.y < 25);
  const centreY = centre.length ? Math.min(...centre.map((q) => q.y)) : null;
  return { topY, peaks, centreY, dip: centreY == null ? 0 : centreY - topY };
}

test('§731.3 CALIBRATION (must fire): the silhouette checks reject a shape that is not the mask', () => {
  /* A rounded blob whose top edge is FLAT. Its outermost top points look exactly like ear peaks
     to a naive peak count — the first version of this arm counted two and was satisfied, which is
     why the discriminator is the DIP between them and not the peaks themselves. */
  const blob = pathPoints('M10 23Q10 12 23 12Q36 12 36 23Q36 34 23 34Q10 34 10 23Z');
  const b = topDip(blob);
  assert.ok(b.peaks.length >= 2,
    'CALIBRATION FAILED — the blob should still LOOK like it has peaks, or it is not a hard case');
  assert.ok(b.dip < 3,
    `CALIBRATION FAILED — a flat-topped blob reports a ${b.dip} dip, so the dip check cannot discriminate`);

  /* And a shape with no bottom notch: the lowest edge is flat, so "one lowest point on the
     centre line" must NOT hold. */
  const flatBottom = pathPoints('M10 12L36 12L36 34L10 34Z');
  const botY = Math.max(...flatBottom.map((q) => q.y));
  const lowest = flatBottom.filter((q) => Math.abs(q.y - botY) < 0.01);
  assert.ok(lowest.length !== 1,
    'CALIBRATION FAILED — a flat bottom edge reads as a single notch point');
});

test('§731.3: the badge path carries the mark — two ears, a dip, a notch, two angled slits', async () => {
  const src = readFileSync(new URL('../src/ui/Icons.js', import.meta.url), 'utf8');
  const grab = (name) => {
    const m = new RegExp(`const ${name} = ([\\s\\S]*?);\\n`).exec(src);
    assert.ok(m, `${name} not found in Icons.js`);
    return m[1].replace(/['\n+ ]/g, ' ');
  };
  const mask = pathPoints(grab('MASK_D'));
  assert.ok(mask.length >= 10, `mask path parsed to only ${mask.length} points`);

  /* 1. TWO EAR PEAKS, left and right of centre, at the same height. */
  const { topY, peaks, dip } = topDip(mask);
  assert.equal(peaks.length, 2, `expected two ear peaks at the top edge, found ${peaks.length}`);
  const [lp, rp] = peaks.sort((a, b) => a.x - b.x);
  assert.ok(lp.x < 23 && rp.x > 23, 'the two peaks are not on opposite sides of centre');
  assert.ok(Math.abs((23 - lp.x) - (rp.x - 23)) < 0.05, 'the ear peaks are not symmetric');

  /* 2. A CONCAVE DIP between them — the feature the calibration above shows a blob does NOT have.
     The top edge at centre must sit well below the peaks. */
  assert.ok(dip >= 3, `the top edge does not dip between the ears (dip ${dip} from peaks at ${topY})`);

  /* 3. A NOTCH at bottom centre: the lowest point of the whole path is ON the centre line. */
  const botY = Math.max(...mask.map((q) => q.y));
  const lowest = mask.filter((q) => Math.abs(q.y - botY) < 0.01);
  assert.equal(lowest.length, 1, 'the bottom point is not a single notch');
  assert.ok(Math.abs(lowest[0].x - 23) < 0.01, `the bottom notch is off-centre at x=${lowest[0].x}`);

  /* 4. TWO EYE SLITS, mirrored, in the upper half, OUTER ends higher than inner ends. */
  const eyeL = pathPoints(grab('EYE_L'));
  const eyeR = pathPoints(grab('EYE_R'));
  assert.equal(eyeL.length, 4, 'the left slit is not a four-point wedge');
  assert.equal(eyeR.length, 4, 'the right slit is not a four-point wedge');
  const mid = (23 + botY) / 2;
  for (const [side, e] of [['left', eyeL], ['right', eyeR]]) {
    assert.ok(Math.max(...e.map((q) => q.y)) < mid + 4, `the ${side} slit is not in the upper half`);
  }
  // outer end higher (smaller y) than inner end, on both sides
  const outerL = eyeL.reduce((a, b) => (b.x < a.x ? b : a));
  const innerL = eyeL.reduce((a, b) => (b.x > a.x ? b : a));
  assert.ok(outerL.y < innerL.y, 'the left slit does not ride higher at its outer end');
  const outerR = eyeR.reduce((a, b) => (b.x > a.x ? b : a));
  const innerR = eyeR.reduce((a, b) => (b.x < a.x ? b : a));
  assert.ok(outerR.y < innerR.y, 'the right slit does not ride higher at its outer end');
  // and they are mirror images about x = 23, so the mark is not lopsided
  const mirror = (pts) => pts.map((q) => ({ x: +(46 - q.x).toFixed(2), y: q.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const norm = (pts) => pts.map((q) => ({ x: +q.x.toFixed(2), y: q.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  assert.deepEqual(mirror(eyeR), norm(eyeL), 'the two eye slits are not mirror images');
});

test('§731: nothing that drives the live pip row can reach the heart branch', () => {
  const hud = read('ui/HUD.js');
  const m = /function pipKind\(i\)\s*\{\s*return ([^;]+);\s*\}/.exec(hud);
  assert.ok(m, 'pipKind() no longer has the shape this arm reads');
  const kinds = new Set();
  const pipKind = new Function('i', `return ${m[1]};`);
  // The live row is at most the charm count plus the calling card; walk well past it.
  for (let i = 0; i < 32; i++) kinds.add(pipKind(i));
  assert.deepEqual([...kinds].sort(), ['charm', 'life'],
    'pipKind() can now return a third kind — the live row may be able to draw the ornament art');
  assert.equal(kinds.size, 2);                                                 // §211.1
  // Two-sided: the same walk over a mapping that DOES reach it is caught.
  const bad = new Function('i', "return i === 0 ? 'life' : i === 1 ? 'mask' : 'charm';");
  const badKinds = new Set();
  for (let i = 0; i < 32; i++) badKinds.add(bad(i));
  assert.ok(badKinds.has('mask'),
    'CALIBRATION FAILED — the walk cannot see the mask kind even when the mapping returns it');
});

test('§731: the ornament is inert — a full health run does not move one pixel of it', async () => {
  const { hud, engine } = await bootHud();
  const snap = () => hud.root.querySelector('.sly-hp').innerHTML;

  const before = snap();
  assert.ok(before.length > 200, 'the ornament rendered empty — this arm would pass on nothing');
  assert.equal((before.match(/sly-hp-pip/g) ?? []).length, 5);                 // §211.1

  /* Everything the game can do to health, through the public API and the bus, plus frames. If
     any of it is wired to the ornament, the markup changes. */
  hud.setHealth(5, 5);
  hud.setHealth(2, 5);
  hud.setHealth(0, 5);
  hud.setCharmProgress(0.4);
  engine.emit('playerHealth', { hp: 1, max: 5 });
  engine.emit('playerDamage', { amount: 3 });
  engine.emit('playerState', 'hurt');
  run(hud, engine, 3.0);
  const after = snap();
  assert.equal(after, before,
    'the health ornament changed under a damage run — §731 is "visual only" and this is wiring');

  /* Two-sided (§418.3): the SAME snapshot probe, pointed at the element that is supposed to
     react, must see it react — otherwise the equality above proves only that the probe is
     blind. The live row is what setHealth actually drives. */
  const liveAfter = hud.el.pips.innerHTML;
  hud.setHealth(5, 5);
  run(hud, engine, 0.2);
  assert.notEqual(hud.el.pips.innerHTML, liveAfter,
    'CALIBRATION FAILED — the probe cannot see the LIVE pip row change, so its verdict on the ornament is worthless');

  // ...and the ornament still has not moved, after the live row demonstrably did.
  assert.equal(snap(), before, 'the ornament moved once the live row was driven');
  hud.dispose();
});

test('§731: ?hud=nohealth removes the ornament and nothing else', async () => {
  /* Driven through the module seam the URL feeds (§435.4): HUD_NOHEALTH is read once at module
     load, so each arm needs its own instance of the module, not a flag poked afterwards. */
  const boot = async (token, tag) => {
    installDom();
    if (token == null) delete globalThis.__HUD_AB; else globalThis.__HUD_AB = token;
    const { HUD } = await import(`../src/ui/HUD.js?${tag}`);
    const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
    camera.updateMatrixWorld(true);
    const engine = fakeEngine(camera);
    const hud = new HUD(engine);
    await hud.init();
    return hud;
  };

  const on = await boot(null, 's731on');
  const off = await boot('nohealth', 's731off');
  try {
    assert.ok(on.root.querySelector('.sly-hp'), 'the default boot lost the ornament');
    assert.equal(on.root.querySelectorAll('.sly-hp-pip').length, 5);        // §211.1
    assert.equal(off.root.querySelector('.sly-hp'), null,
      '?hud=nohealth left the ornament in the DOM');
    assert.equal(off.root.querySelectorAll('.sly-hp-pip').length, 0);

    /* The token must be a scalpel. Every other persistent element is still there, and the LIVE
       pip row in particular keeps its own count — the ornament and the readout are not the
       same thing and a token that took both would be a regression, not a revert. */
    let kept = 0;
    for (const sel of ['.sly-tl', '.sly-pips', '.sly-coins', '.sly-obj', '.sly-toasts',
      '.sly-prompt', '.sly-pocket', '.sly-marks']) {
      assert.ok(off.root.querySelector(sel), `?hud=nohealth also removed ${sel}`);
      kept++;
    }
    assert.equal(kept, 8);                                                     // §211.1
    /* `_hudshim` supports `.class` and nothing else by design, so the live row is counted off
       its own handle rather than through a descendant selector. */
    assert.equal(off.el.pips.childNodes.length, on.el.pips.childNodes.length,
      'the token changed the LIVE pip row');
    assert.ok(on.el.pips.childNodes.length > 0, 'the live pip row rendered empty in both arms');
  } finally {
    on.dispose();
    off.dispose();
    delete globalThis.__HUD_AB;
  }
});

/**
 * §731.3 — the badge's contrast, swept rather than sampled, and why there is no longer a chip.
 *
 * §731.2 struck the row on an ink chip because a carnelian pip on the open scene measured 1.28:1
 * over day sand. The owner's badge carries its own opaque ground, so that whole problem is inside
 * the glyph now: the mask against the oval and the slits against the mask are FIXED ratios that
 * no scene can move. What still has to hold is that the badge separates from the SCENE, and that
 * is a four-ink sandwich — ink outline, sky oval, navy mask, near-white slits — where the badge
 * survives wherever ANY ONE of them is far from the background.
 *
 * Sweeping all 256 grey grounds is strictly stronger than sampling four camera poses, and costs
 * no capture lock. It is also what justifies deleting the chip: if the bound holds without it,
 * the chip was solving a problem the artwork already solves.
 */
const BADGE_INKS = { ink: '#1a1210', oval: '#8fd8ff', mask: '#1f4f96', slit: '#f2e8d4' };
const GREY = (v) => '#' + [v, v, v].map((c) => c.toString(16).padStart(2, '0')).join('');

/** Worst, over every grey ground, of the BEST of the supplied inks. */
function sweepBestOf(hexes) {
  let worst = Infinity, at = 0;
  for (let bg = 0; bg <= 255; bg++) {
    const ground = GREY(bg);
    const best = Math.max(...hexes.map((h) => contrast(h, ground)));
    if (best < worst) { worst = best; at = bg; }
  }
  return { worst: +worst.toFixed(2), atGrey: at };
}

test('§731.3 CALIBRATION (must fire): the sweep rejects a single ink and accepts a real sandwich', () => {
  /* One ink can never clear a bar against EVERY background — there is always a ground that
     matches it. If the sweep says otherwise it is not sweeping. */
  for (const [name, hex] of Object.entries(BADGE_INKS)) {
    const one = sweepBestOf([hex]);
    assert.ok(one.worst < 1.05,
      `CALIBRATION FAILED — ${name} alone reports ${one.worst}:1 against every background, which is impossible`);
  }
  /* ...and the ink/near-white pair, which is the widest the palette offers, must clear it. */
  const pair = sweepBestOf([BADGE_INKS.ink, BADGE_INKS.slit]);
  assert.ok(pair.worst >= 3.0,
    `CALIBRATION FAILED — ink against near-white should clear 3:1 everywhere, got ${pair.worst}:1`);
});

test('§731.3: the badge clears the non-text bar against EVERY possible background, with no chip', () => {
  const all = sweepBestOf(Object.values(BADGE_INKS));
  assert.ok(all.worst >= 3.0,
    `the badge falls to ${all.worst}:1 at grey ${all.atGrey} — below the 3:1 non-text bar`);
  // Pinned, so a palette change that silently weakens the guarantee fails instead of passing.
  assert.deepEqual(all, { worst: 3.9, atGrey: 115 });

  /* THE REASON THE KICKER IS GONE. Gold text plus its ink halo is the best case a label could
     have had without a chip, and it does not reach the 4.5:1 text bar. Keeping "HEALTH" after
     deleting the chip would have meant shipping a text run this project's own M2 bar rejects. */
  const label = sweepBestOf(['#ffe9a8', BADGE_INKS.ink]);
  assert.ok(label.worst < 4.5,
    `a gold label on the open scene reports ${label.worst}:1 — if this now passes, the kicker could come back`);
  assert.deepEqual(label, { worst: 3.95, atGrey: 115 });
  // ...and it is genuinely absent, in both the stylesheet and the markup.
  assert.ok(!/sly-hp-kick/.test(read('ui/hud.css.js')), 'the kicker rule survived §731.3');
  assert.ok(!/sly-hp-kick/.test(read('ui/HUD.js')), 'the kicker markup survived §731.3');
});

test('§731.3: the chip is gone, and the readout is a bare row of badges', () => {
  const css = read('ui/hud.css.js');
  const block = /\.sly-hp\s*\{([\s\S]*?)\}/.exec(css);
  assert.ok(block, '.sly-hp rule not found');
  const rule = block[1];
  /* No ground, no border, no panel shadow: the badge brings all three. */
  let checked = 0;
  for (const [what, re] of [
    ['a background', /background:/], ['a border', /border:/], ['a box-shadow', /box-shadow:/],
  ]) { assert.ok(!re.test(rule), `.sly-hp still has ${what} — the chip was supposed to go`); checked++; }
  assert.equal(checked, 3);                                                    // §211.1
  // The optics bracket stayed deleted too.
  assert.ok(!/sly-hp-br/.test(css), 'the optics bracket rule came back');
  assert.ok(!/sly-hp-br/.test(read('ui/HUD.js')), 'the optics bracket markup came back');

  /* TOP-LEFT now, below a stack that grows downward. The offsets are asserted as numbers because
     "near the top left corner where there is space" is the instruction, and a rule that drifts
     back to the right edge would satisfy no part of it. */
  assert.match(rule, /left:\s*calc\(var\(--u\)\s*\*\s*[\d.]+\)/, '.sly-hp is not anchored to the left edge');
  assert.match(rule, /top:\s*calc\(var\(--u\)\s*\*\s*[\d.]+\)/, '.sly-hp is not anchored to the top');
  assert.ok(!/right:/.test(rule) && !/bottom:/.test(rule), '.sly-hp still carries its old corner offsets');
  const top = parseFloat(/top:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(rule)[1]);
  /* The fully-armed .sly-tl stack reaches 125.8 px at u=11, i.e. 11.44u. Anything above that
     collides only when the player happens to be carrying loot, which is the worst kind of bug. */
  assert.ok(top >= 11.9, `.sly-hp sits at ${top}u, inside the fully-armed .sly-tl stack (11.44u)`);
});
