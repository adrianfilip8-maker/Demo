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
import { PAL } from '../src/player/SlyModel3.js';

const PAL_BLUE_HEX = '#' + PAL.blue.toString(16).padStart(6, '0');

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
  /* §743 moved these three runs out of the retired corner card and into the pause cel
     (`.sly-pobj-*`). Same three colour pairs, because the pause panel's ground is `--paint`,
     the same ground the card had — so the bar they were held to is unchanged and the entries
     stay rather than being deleted with the card. */
  ['pause objective title',     INK,                    PAINT],
  ['pause objective subtitle',  '#6b503c',              PAINT],
  ['pause objective kicker',    '#ffe9a8',              LAPIS_D],
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
  // §743: the kicker moved to the pause cel with the rest of the objective. Same rule, same bar.
  assert.match(css, /\.sly-pobj-kick\s*\{[^}]*background:\s*var\(--lapis-d\)/,
    'the objective kicker must sit on --lapis-d — --lapis fails the contrast bar');
  /* And the card the kicker came off is GONE, not renamed around a surviving rule (§743).
     Comments are stripped first: this file's own prose still explains where the card went, and a
     probe that cannot tell a rule from a note about a rule is not measuring the stylesheet.
     §418.3, both inputs named: it must PASS on the sheet as it ships and FAIL on `.sly-pobj`,
     the replacement, which is asserted below with the same stripper so the probe is not blind. */
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!rules.includes('.sly-obj'),
    'a .sly-obj rule is back in the stylesheet — §743 removed the corner objective card');
  assert.ok(rules.includes('.sly-pobj-kick'),
    'CALIBRATION FAILED — the comment stripper ate the rules too, so the absence above proves nothing');
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
  '.sly-toast', '.sly-prompt-verb',
  '.sly-tov-tag', '.sly-mark .lbl', '.sly-alert-glyph', '.sly-alert-lbl',
  '.bx-mono', '.bx-rec', '.bx-caller-name', '.bx-caller-line',
];
const REFERENCE = [
  '.sly-grp > h4', '.sly-row .dsc', '.sly-row .dsc small', '.sly-row .ks .plus',
  '.sly-btn', '.sly-pause-tip', '.sly-pause-title em',
  /* §743: the objective's three runs moved OUT of the gameplay list and into this one, because
     the corner card was retired and the objective now renders inside the pause cel. They are not
     merely deleted from GAMEPLAY — a run that stops being inspected by either list is a run
     nothing holds a floor on, and this file has lost arms that way before (§731.4). */
  '.sly-pobj-kick', '.sly-pobj-title', '.sly-pobj-sub',
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


test('§731.5: the readout is ONE meter, composed from the plate and the fill silhouette', async () => {
  const Ico = await import('../src/ui/Icons.js');
  const M = await import('../src/ui/HealthMeter.js');
  const svg = Ico.healthMeter();

  assert.match(svg, /^<svg[\s\S]*<\/svg>$/, 'the meter is not an svg');
  assert.match(svg, new RegExp(`viewBox="0 0 ${M.METER_W} ${M.METER_H}"`),
    'the meter is not drawn at the baked layers\' own aspect');

  /* BOTH layers, in the right order: the plate underneath, the fill painted over it through the
     silhouette. A meter that drew only the plate would be a grey empty bar and would still be an
     svg with an image in it. */
  assert.ok(svg.includes(M.METER_PLATE_URI), 'the meter does not draw the plate layer');
  assert.ok(svg.includes(M.METER_FILL_URI), 'the meter does not draw the fill silhouette');
  assert.ok(svg.indexOf(M.METER_PLATE_URI) > svg.indexOf(M.METER_FILL_URI),
    'the plate is drawn after the fill — the silhouette belongs in a <mask> defined first');
  assert.match(svg, /<mask id="slyHpFill">/, 'the fill silhouette is not used as a mask');
  assert.match(svg, /<rect[^>]*mask="url\(#slyHpFill\)"/, 'nothing is painted through the mask');

  /* Exactly one meter's worth of layers — a stray duplicate would double a 60 KB payload. */
  assert.equal((svg.match(/<image /g) ?? []).length, 2, 'the meter should draw exactly two images');
  assert.equal((svg.match(/<rect /g) ?? []).length, 1, 'the meter should paint exactly one fill rect');
});
test('§731.6: the live pip row is retired, and nothing is left pointing at it', () => {
  /* The owner: "Do not make it real. Retire the pip row for now". Removed, not hidden — the
     markup, the element handle, the render path, the charm arc it carried and its CSS. */
  const hud = read('ui/HUD.js');
  const css = read('ui/hud.css.js');
  const ico = read('ui/Icons.js');
  let checked = 0;
  for (const [where, src, dead] of [
    ['HUD.js', hud, ['sly-pips', 'this.el.pips', 'pipKind(', 'setCharmProgress(', '_nextCharmIndex(']],
    ['hud.css.js', css, ['sly-pips', 'sly-pip-life', 'sly-pip-lost', 'sly-charm-fill']],
    ['Icons.js', ico, ['function pip(', 'function lifePip(', 'function charmPip(']],
  ]) {
    for (const d of dead) {
      assert.ok(!src.includes(d), `${d} survived §731.6 in ${where}`);
      checked++;
    }
  }
  assert.equal(checked, 12);                                                   // §211.1

  /* What must NOT have gone with it: `setHealth` still tracks state and fires the damage
     vignette and the hit flash, which were never pip machinery. */
  assert.match(hud, /setHealth\(n, max\)/, 'setHealth was removed with the row');
  assert.match(hud, /this\._vig = 1 - v \/ m;/, 'the damage vignette went with the row');
  assert.match(hud, /if \(lost\) this\._hitFx\(prev - v\);/, 'the hit FX went with the row');
  /* ...and the charm TOAST icon, which a publisher outside src/ui still asks for by name. */
  assert.match(ico, /case 'health': return charmIcon\(cls\);/,
    "glyph('health') no longer resolves — Health.js emits a charm toast that needs it");
});test('§731: the ornament is inert — a full health run does not move one pixel of it', async () => {
  const { hud, engine } = await bootHud();
  const snap = () => hud.root.querySelector('.sly-hp').innerHTML;

  const before = snap();
  assert.ok(before.length > 200, 'the ornament rendered empty — this arm would pass on nothing');
  assert.equal((before.match(/sly-hp-meter/g) ?? []).length, 1);               // §211.1
  assert.ok(before.includes('<svg'), 'the meter did not render its artwork');

  /* Everything the game can do to health, through the public API and the bus, plus frames. If
     any of it is wired to the ornament, the markup changes. */
  hud.setHealth(5, 5);
  hud.setHealth(2, 5);
  hud.setHealth(0, 5);
  engine.emit('playerHealth', { hp: 1, max: 5 });
  engine.emit('playerDamage', { amount: 3 });
  engine.emit('playerState', 'hurt');
  run(hud, engine, 3.0);
  const after = snap();
  assert.equal(after, before,
    'the health ornament changed under a damage run — §731 is "visual only" and this is wiring');

  /* Two-sided (§418.3): the SAME snapshot probe, pointed at an element that IS supposed to
     react, must see it react — otherwise the equality above proves only that the probe is blind.
     §731.6 retired the live pip row, so the witness is now the coin counter, which `addCoins`
     drives through the same DOM the probe reads. */
  const coinBefore = hud.el.coinNum.innerHTML;
  hud.addCoins(1234);
  run(hud, engine, 0.6);
  assert.notEqual(hud.el.coinNum.innerHTML, coinBefore,
    'CALIBRATION FAILED — the probe cannot see the coin counter change, so its verdict on the ornament is worthless');

  // ...and the ornament still has not moved, after a neighbour demonstrably did.
  assert.equal(snap(), before, 'the ornament moved once a live element was driven');
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
    assert.equal(on.root.querySelectorAll('.sly-hp-meter').length, 1);      // §211.1
    assert.equal(off.root.querySelector('.sly-hp'), null,
      '?hud=nohealth left the ornament in the DOM');
    assert.equal(off.root.querySelectorAll('.sly-hp-meter').length, 0);

    /* The token must be a scalpel. Every other persistent element is still there, and the LIVE
       pip row in particular keeps its own count — the ornament and the readout are not the
       same thing and a token that took both would be a regression, not a revert.
       §743: `.sly-obj` left this list because the OWNER removed the corner card, not because the
       token grew. Its place is taken by `.sly-pobj-title`, the objective's new home in the pause
       cel — so the list still proves the token leaves the objective alone, which is what it was
       here to prove, and the count does not shrink. */
    let kept = 0;
    for (const sel of ['.sly-tl', '.sly-coins', '.sly-pobj-title', '.sly-toasts',
      '.sly-prompt', '.sly-pocket', '.sly-marks']) {
      assert.ok(off.root.querySelector(sel), `?hud=nohealth also removed ${sel}`);
      kept++;
    }
    assert.equal(kept, 7);                                                     // §211.1
    /* And the retired card is gone from BOTH boots — a token that resurrected it would be a
       second way to fail §743, and neither boot may have it. */
    assert.equal(off.root.querySelector('.sly-obj'), null, 'the corner objective card is back');
    assert.equal(on.root.querySelector('.sly-obj'), null, 'the corner objective card is back');
    /* §731.6 SEMANTICS, stated: the live pip row is retired, so `?hud=nohealth` now leaves the
       top-left with NO health readout of any kind. It does not leave the corner empty — the coin
       counter and the exposure/stealth/carry chips are all still there, which the loop above
       asserts — but "the token removes the ornament and the live row survives" is no longer the
       truth and this arm no longer claims it. */
    assert.equal(off.root.querySelector('.sly-pips'), null,
      'a live pip row came back — §731.6 retired it');
    assert.equal(on.root.querySelector('.sly-pips'), null,
      'a live pip row came back on the default boot');
    assert.ok(off.root.querySelector('.sly-coins'), 'the token emptied the corner entirely');
  } finally {
    on.dispose();
    off.dispose();
    delete globalThis.__HUD_AB;
  }
});

/**
 * §731.4 — the badge is IMPORTED, so the checks are about provenance and decode, not geometry.
 *
 * §731.3 hand-drew the mark and this block checked its path data — two ear peaks, a dip, a notch,
 * two slits. All of that passed, and the drawing was still wrong: the owner's artwork has broad
 * pale eye PATCHES, a muzzle and a nose, and no oval. Checking a shape you invented against a
 * description you invented is not a check (§439). The art now comes from the reference project,
 * so what is checkable here is that it is really that file, really inlined, and really wired in.
 * Whether it READS is a pixel question and belongs to `tools/hudvisible.mjs`.
 */
test('§731.5: the meter is the imported V1 pair, inlined, with its palette sampled not retyped', async () => {
  const M = await import('../src/ui/HealthMeter.js');

  assert.equal(M.METER_W, 320);
  assert.equal(M.METER_H, 175);
  /* §731.7 cut the POW crescent off the bottom, so the shape is taller-cropped than the full
     plate was: 1857 x 1015 rather than 1857 x 1051. Pinned to the cropped source, because the
     element's CSS height is derived from it. */
  const aspect = M.METER_W / M.METER_H;
  assert.ok(Math.abs(aspect - 1857 / 1015) < 0.02,
    `the bake is ${aspect.toFixed(3)}:1 but the cropped source is ${(1857 / 1015).toFixed(3)}:1 — the meter has been squashed`);

  /* Inlined, not fetched — the §666 property the whole import hangs on. */
  let layers = 0;
  for (const [name, uri] of [['plate', M.METER_PLATE_URI], ['fill mask', M.METER_FILL_URI]]) {
    assert.match(uri, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, `the ${name} is not a self-contained data URI`);
    const bytes = Buffer.from(uri.split(',')[1], 'base64');
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `the ${name} bytes are not a PNG`);
    assert.ok(bytes.length > 2000 && bytes.length < 80000,
      `the baked ${name} is ${bytes.length} bytes, which is neither the artwork nor a sane bake`);
    layers++;
  }
  assert.equal(layers, 2);                                                     // §211.1
  assert.notEqual(M.METER_PLATE_URI, M.METER_FILL_URI, 'both layers baked to the same image');

  const pal = M.METER_PALETTE;
  let entries = 0;
  for (const k of ['track', 'navy', 'pale']) {
    assert.match(pal[k], /^#[0-9a-f]{6}$/, `METER_PALETTE.${k} is not a sampled hex`);
    entries++;
  }
  assert.equal(entries, 3);                                                    // §211.1
  assert.equal(new Set(Object.values(pal)).size, 3, 'the sampled palette collapsed');

  /* The old single-badge import is GONE, not merely unused. */
  const ico = readFileSync(new URL('../src/ui/Icons.js', import.meta.url), 'utf8');
  for (const dead of ['MaskBadge', 'MASK_BADGE', 'maskPip']) {
    assert.ok(!ico.includes(dead), `${dead} survived the §731.5 rewrite`);
  }
});
test('§731.5: provenance is recorded, with both source paths, the repo HEAD and the licence', () => {
  const prov = readFileSync(new URL('../staging/assets/sly-meter/PROVENANCE.md', import.meta.url), 'utf8');
  let facts = 0;
  for (const [what, re] of [
    ['the plate source', /Health_Meter_V1_-/],
    ['the fill source', /Health_Meter_V1_PROGRESS_BAR_HP/],
    ['the repo HEAD', /a312a99/],
    ['the licence', /NONE STATED/],
    ['the bake tool', /godot2meter\.mjs/],
    ['the shipped module', /HealthMeter\.js/],
    ['why V1 over V2', /V1 chosen over V2/],
  ]) { assert.match(prov, re, `PROVENANCE.md does not record ${what}`); facts++; }
  assert.equal(facts, 7);                                                      // §211.1

  /* §364.3: no file touching this asset may name that project's audio directories. Checked as a
     property of the text rather than trusted. */
  for (const [name, rel] of [['PROVENANCE.md', '../staging/assets/sly-meter/PROVENANCE.md'],
    ['HealthMeter.js', '../src/ui/HealthMeter.js'], ['godot2meter.mjs', '../tools/godot2meter.mjs']]) {
    const text = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(!/Assets\/(Audio|Sounds?|Music)/i.test(text),
      `${name} names an audio directory of the reference project`);
  }
});

test('§731.5: the meter fill is COUPLED to the character blue, not a copy of it', async () => {
  const { PAL } = await import('../src/player/SlyModel3.js');
  const Ico = await import('../src/ui/Icons.js');
  const svg = Ico.healthMeter();

  /* The owner: "use the same color blue as the blue on the character's outfit". SlyModel3's G1
     rule makes that one named constant across cap, shirt, gloves and boots, so the meter must
     render whatever that constant currently is — asserting the literal #2f5fc4 here would be the
     drift §712 closed, since a retune of the outfit would leave this test certifying a stale hex. */
  const expected = '#' + PAL.blue.toString(16).padStart(6, '0');
  assert.ok(svg.includes(`fill="${expected}"`),
    `the meter does not paint PAL.blue (${expected}) — it has drifted from the outfit`);

  /* Two-sided: the arm must be able to SEE a drift. A different blue must not satisfy it. */
  const other = '#' + PAL.blueDark.toString(16).padStart(6, '0');
  assert.notEqual(expected, other, 'PAL.blue and PAL.blueDark collapsed — this arm cannot discriminate');
  assert.ok(!svg.includes(`fill="${other}"`),
    'the meter paints blueDark as well, so the coupling assertion above proves nothing');

  /* ...and the colour is not baked into the raster, which is what makes the coupling live. */
  const src = readFileSync(new URL('../src/ui/Icons.js', import.meta.url), 'utf8');
  assert.ok(/PAL\.blue/.test(src), 'Icons.js no longer reads PAL.blue');
  /* Comments are stripped first: healthMeter's header DISCUSSES the hex, and a naive search would
     read that prose as a hardcode and fail on a correct file. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/#2f5fc4/i.test(code), 'Icons.js hardcodes the character blue instead of importing it');
  const meter = readFileSync(new URL('../src/ui/HealthMeter.js', import.meta.url), 'utf8');
  assert.ok(!/#2f5fc4/i.test(meter), 'the bake burned the character blue into the module');
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
/* What the composed meter actually shows: the artwork's own outline and insignia colours, plus
   the PAL.blue fill painted through the silhouette. `track` is deliberately absent — the shipped
   composite covers it completely, so it is never on screen. */
const METER_INKS = { outline: '#1a1a1a', fill: PAL_BLUE_HEX, pale: '#c5c5c5', navy: '#262671' };
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

test('§731.5 CALIBRATION (must fire): the sweep rejects a single ink and accepts a real sandwich', () => {
  /* One ink can never clear a bar against EVERY background — there is always a ground that
     matches it. If the sweep says otherwise it is not sweeping. */
  for (const [name, hex] of Object.entries(METER_INKS)) {
    const one = sweepBestOf([hex]);
    assert.ok(one.worst < 1.05,
      `CALIBRATION FAILED — ${name} alone reports ${one.worst}:1 against every background, which is impossible`);
  }
  /* ...and the outline against the insignia's pale patches, the widest pair the meter has, must
     clear it. That pair is what actually carries the element. */
  const pair = sweepBestOf([METER_INKS.outline, METER_INKS.pale]);
  assert.ok(pair.worst >= 3.0,
    `CALIBRATION FAILED — outline against pale should clear 3:1 everywhere, got ${pair.worst}:1`);
});
test('§731.5: the meter clears the non-text bar against EVERY possible background', () => {
  const all = sweepBestOf(Object.values(METER_INKS));
  assert.ok(all.worst >= 3.0,
    `the meter falls to ${all.worst}:1 at grey ${all.atGrey} — below the 3:1 non-text bar`);
  assert.deepEqual(all, { worst: 3.18, atGrey: 105 });

  /* THE COST OF THE OWNER'S BLUE, pinned so it cannot drift unnoticed. PAL.blue is much darker
     than the artwork's own #4aa0d0, so the insignia's navy band sits far closer to the fill than
     it did. The mark still reads, and this records exactly what carries it. */
  const navyOnFill = contrast(METER_INKS.navy, METER_INKS.fill);
  const paleOnFill = contrast(METER_INKS.pale, METER_INKS.fill);
  const inkOnFill = contrast(METER_INKS.outline, METER_INKS.fill);
  assert.ok(navyOnFill < 3.0,
    `the navy band now clears ${navyOnFill.toFixed(2)}:1 on the fill — if this passes 3:1 the note in healthMeter's header is stale`);
  assert.ok(paleOnFill >= 3.0,
    `the insignia's pale patches fall to ${paleOnFill.toFixed(2)}:1 on the fill — the mark has stopped reading`);
  assert.equal(+navyOnFill.toFixed(2), 2.22);
  assert.equal(+paleOnFill.toFixed(2), 3.42);
  assert.equal(+inkOnFill.toFixed(2), 2.95);

  /* The SCENE-facing bound is set by outline-against-pale, not by the fill, so the owner's colour
     costs nothing there. Two-sided: swapping in the artwork's own blue must give the same number. */
  const withAssetBlue = sweepBestOf([METER_INKS.outline, '#4aa0d0', METER_INKS.pale, METER_INKS.navy]);
  assert.deepEqual(withAssetBlue, all,
    'the scene bound moved with the fill colour — the claim that the fill does not set it is wrong');
});
test('§743: one meter in the corner the objective card vacated, no chip, no pip row', () => {
  const css = read('ui/hud.css.js');
  const block = /\.sly-hp\s*\{([\s\S]*?)\}/.exec(css);
  assert.ok(block, '.sly-hp rule not found');
  const rule = block[1];

  /* No chip: the artwork brings its own outline and ground. */
  let checked = 0;
  for (const [what, re] of [
    ['a background', /background:/], ['a border', /border:/], ['a box-shadow', /box-shadow:/],
  ]) { assert.ok(!re.test(rule), `.sly-hp still has ${what} — the meter needs no chip`); checked++; }
  assert.equal(checked, 3);                                                    // §211.1

  /* The pip row is GONE, not dormant — rules, markup and constants. */
  for (const dead of ['sly-hp-pip', 'sly-hp-row', 'sly-hp-kick', 'sly-hp-br']) {
    assert.ok(!css.includes(dead), `${dead} survived §731.5 in the stylesheet`);
  }
  const hud = read('ui/HUD.js');
  for (const dead of ['sly-hp-pip', 'sly-hp-row', 'const HP_PIPS', 'const HP_FULL']) {
    assert.ok(!hud.includes(dead), `${dead} survived §731.5 in HUD.js`);
  }

  /* §743 TOP-RIGHT, the corner `.sly-obj` vacated. Anchored by `right` and `top`, and NOT by
     `left` or `bottom` — an element with both a left and a right offset is stretched rather than
     placed, and the whole point of the move is that the right margin is the one that holds. */
  const decl = rule.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(decl, /right:\s*calc\(var\(--u\)\s*\*\s*[\d.]+\)/, '.sly-hp is not anchored to the right edge');
  assert.match(decl, /top:\s*calc\(var\(--u\)\s*\*\s*[\d.]+\)/, '.sly-hp is not anchored to the top');
  assert.ok(!/left:/.test(decl) && !/bottom:/.test(decl),
    '.sly-hp still carries its old top-left offsets — §743 moved it to the top-right');

  /* THE ORIGIN, which is the part of this move that is not a number swap. `rotate(-1.2deg)`
     leaves ONE corner fixed — the transform origin — and throws every other corner off it. At
     `left top` the far (right) end swings UP and the painted box escapes above the stated `top`
     by width * sin(1.2deg); that is the 11.7-px-against-~17 gap §731.5 measured and the reason
     §731.7 declined 10u at 8.2 px. Anchored by `right`/`top`, the origin must sit on THAT corner
     or the two offsets above stop meaning what they say. Carrying `left top` over is the specific
     mistake this arm exists to catch. */
  assert.match(decl, /transform-origin:\s*right\s+top/,
    '.sly-hp is anchored right/top but its transform-origin is not — the tilt will eat a margin the offsets promise');
  const rot = parseFloat(/transform:\s*rotate\(([-\d.]+)deg\)/.exec(decl)[1]);
  assert.ok(Math.abs(rot) > 0 && Math.abs(rot) <= 2,
    `.sly-hp is rotated ${rot}deg — the tilt is a degree of hand-placement, not a slant`);

  const right = parseFloat(/right:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(decl)[1]);
  const top = parseFloat(/top:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(decl)[1]);
  /* Both offsets are DERIVED from the opposite corner rather than picked: `.sly-tl` is the
     cluster the owner demonstrably reads, and the two top corners should carry the same margins.
     Read out of the stylesheet, not retyped, so retuning one corner fails this instead of
     silently desyncing the two. The real clearances are measured by tools/hudvisible.mjs on the
     production artifact against a fully armed stack; this arm holds the symmetry. */
  const tl = /\.sly-tl\s*\{([\s\S]*?)\}/.exec(css)[1];
  const tlLeft = parseFloat(/left:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(tl)[1]);
  const tlTop = parseFloat(/top:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(tl)[1]);
  assert.equal(right, tlLeft, `.sly-hp's right margin is ${right}u against .sly-tl's ${tlLeft}u — the two top corners must mirror`);
  assert.equal(top, tlTop, `.sly-hp's top is ${top}u against .sly-tl's ${tlTop}u — the two top corners must line up`);
  /* Sized to the owner's "roughly 200 px wide in a 1280-wide frame". */
  const w = parseFloat(/width:\s*calc\(var\(--u\)\s*\*\s*([\d.]+)\)/.exec(rule)[1]);
  /* §731.7: "reduce the size by one third" — 18.2u became 12.13u. Pinned as a RATIO of the
     previous width so the instruction, not a magic number, is what the arm checks. */
  assert.ok(Math.abs(w - 18.2 * 2 / 3) < 0.05,
    `.sly-hp is ${w}u wide; one third off 18.2u is ${(18.2 * 2 / 3).toFixed(2)}u`);
});