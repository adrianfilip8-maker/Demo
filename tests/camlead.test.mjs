/**
 * camlead.test.mjs — what the camera actually DELIVERS, as opposed to what FRAMES asks for.
 *
 * Three arms, all on the real `CameraRig` against a stub player, all measuring the same class of
 * defect: a knob whose authored value is not the value that reaches the screen.
 *
 *   L1  the velocity lead. `FRAMES.lead` is applied to the follow GOAL; what reaches the frame is
 *       the goal minus the follow spring's own trail, and that trail is `followTimeH × stiff × v`
 *       — so `stiff`, documented only as a stillness control, silently subtracts from `lead`.
 *       Measured before the floor landed: ordinary running delivered −0.939 m (the look-at a
 *       metre BEHIND Sly) against an authored +0.428, and the hook swing, whose framing comment
 *       reads "Lead frames the landing", delivered −0.207 m of an authored 1.750.
 *   L2  the vertical look gain. New, adopted from the reference (`camera_parent.gd` sets
 *       `yaw_sens 1.0` / `pitch_sens 0.75` and nothing else about sensitivity).
 *   L3  the wall-run bank, which had never fired during a wall run because `wallRun` routed to
 *       the `run` framing and `_blendFrame` gates the probe on `_frameKey === 'wall_run'`.
 *       `tests/traversal.test.mjs` arm 24 owns the routing census; this owns the CONSEQUENCE,
 *       because "the key resolves correctly" and "the bank rolls the horizon" are two claims and
 *       arm 24 only ever made the first.
 *
 * ── why a separate file ────────────────────────────────────────────────────────────────────────
 * Same reason `camspeed.test.mjs` gives: `camera.test.mjs` is deliberately built on a stub player
 * so its assertions do not couple to `Moveset.js` tuning. These arms need `Controller.TUNE`'s real
 * speeds to say anything about metres of lead, so they import it rather than inventing numbers,
 * and that import is exactly the coupling that file exists to avoid.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { TUNE as CTUNE } from '../src/player/Controller.js';

const RUN = CTUNE.runSpeed;

/** `FRAMES.lead` by key, read out of the source so this cannot drift from the table it describes
    (§388: a second copy of a table is a table that will disagree with the first). */
const FRAME_LEAD = (() => {
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const FRAMES = {'), src.indexOf('\n};', src.indexOf('const FRAMES = {')));
  const out = {};
  for (const m of block.matchAll(/^\s{2}([a-z_]+):\s*\{[^}]*?lead:\s*([-\d.]+)/gm)) out[m[1]] = Number(m[2]);
  if (Object.keys(out).length < 15) throw new Error(`FRAMES scan found ${Object.keys(out).length} leads`);
  return out;
})();

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

class StubInput {
  constructor() { this.look = { x: 0, y: 0 }; this.move = { x: 0, y: 0 }; this.zoom = 0; }
  pressed() { return false; }
  down() { return false; }
}

/** No geometry: the boom never shortens, so nothing here is measuring an occlusion. */
class OpenAir {
  constructor() { this.ready = true; }
  raycast() { return null; }
  capsuleSweep() { return null; }
  query() { return []; }
  overlap() { return []; }
}

/** A wall at a fixed side of the player, for the bank. `side` is +1 camera-right, −1 left. */
class OneWall {
  constructor(side) { this.ready = true; this.side = side; }
  raycast(_from, dir) {
    // `_probeWallSide` casts along ±`rig.right`; the rig's right is (−cos yaw, 0, sin yaw) and
    // with yaw π that is (+1, 0, 0). Answer for whichever cast points at our chosen side.
    const along = Math.sign(dir.x) || Math.sign(dir.z);
    return along === this.side ? { hit: true, distance: 0.9, normal: { x: -this.side, y: 0, z: 0 } } : null;
  }
  capsuleSweep() { return null; }
  query() { return []; }
  overlap() { return []; }
}

function baseEngine(collision) {
  const movement = {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    grounded: true, stateName: 'idle', yaw: Math.PI,
  };
  const listeners = new Map();
  return {
    input: new StubInput(),
    camera: new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 1000),
    scene: new THREE.Scene(), movement, collision,
    time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high',
    debug: { freeCam: false, showColliders: false, wireframe: false },
    warn() {}, has() { return false; },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => {}; },
    emit(e, p) { for (const f of listeners.get(e) || []) f(p); },
    get(n) { return n === 'movement' ? this.movement : n === 'collision' ? this.collision : null; },
  };
}

/**
 * Hold a constant ground speed along −z until the rig settles, then read the signed distance from
 * the player to the look-at pivot ALONG TRAVEL. Positive = the pivot is ahead of the player,
 * which is the only thing the word "lead" can mean.
 */
function settledLead(stateName, speed, { grounded = true, seconds = 12 } = {}) {
  const engine = baseEngine(new OpenAir());
  const rig = new CameraRig(engine);
  rig.init?.();
  const mv = engine.movement;
  mv.stateName = stateName;
  mv.grounded = grounded;
  mv.velocity.set(0, 0, -speed);
  rig.snap?.(true);
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    mv.position.z -= speed * dt;
    engine.dt = dt; engine.time += dt;
    rig.update(dt);
  }
  return { lead: -(rig.pivot.z - mv.position.z), stiff: rig._frame.stiff, key: rig._frameKey };
}

function withTune(key, value, fn) {
  const keep = TUNE[key];
  TUNE[key] = value;
  try { return fn(); } finally { TUNE[key] = keep; }
}

/* ====================================================================== */
/* L1 — the look-at must not trail the character it is following           */
/* ====================================================================== */

test('L1: the delivered velocity lead never goes negative, at any framing or speed', () => {
  /* THE CLAIM. `_pivotGoal` floors the lead vector at the follow spring's own steady-state trail,
     `followTimeH × stiff × v`, so the delivered lead is bounded below by −`deadzoneH` — the
     deadzone being deliberately outside the floor, since cancelling it would destroy the still
     frame it exists to produce.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped rig. Every framing below reads ≥ −`deadzoneH`, and the framings
   *               that were already leading (`run`, `rail_slide`, `air`, `glide`) are unchanged
   *               to three decimals — the floor is one-sided by construction.
   *   fails on  : the same rig with `leadTime` 0, IF THE FLOOR IS REMOVED. That input is run live
   *               below and its un-floored value is derived in closed form from TUNE rather than
   *               remembered: at `leadTime` 0 there is no authored lead at all, so an un-floored
   *               rig settles at exactly −(followTimeH·stiff·v + deadzoneH) = −1.42 m at a full
   *               run. The bar is asserted to REJECT that number and to ACCEPT the measured one,
   *               so both sides of it exist and neither is hypothetical.
   *               (Historically the same bar also failed on the rig as it shipped before the
   *               floor: `idle`/`move` at −0.939 m and `hook_swing` at −0.207 m, measured.) */
  const bar = -TUNE.deadzoneH;

  const rows = [
    ['move  (the shipped ground run)', 'move', RUN, true],
    ['hookSwing', 'hookSwing', 8.0, false],
    ['railSlide', 'railSlide', CTUNE.railMax, false],
    ['railWalk', 'railWalk', CTUNE.railWalk, true],
    ['sneak', 'sneak', CTUNE.sneakSpeed, true],
    ['fall', 'fall', RUN, false],
    ['paraglide', 'paraglide', CTUNE.glideSpeed, false],
  ];
  console.log('\n[L1] framing                          key           v    delivered   un-floored');
  for (const [label, st, v, g] of rows) {
    const r = settledLead(st, v, { grounded: g });
    const authored = Math.min(TUNE.leadTime * (FRAME_LEAD[r.key] ?? 0) * v, TUNE.leadMax);
    const trail = TUNE.followTimeH * r.stiff * v + TUNE.deadzoneH - authored;
    console.log(`[L1] ${label.padEnd(32)} ${r.key.padEnd(11)} ${v.toFixed(2).padStart(5)} `
      + `${r.lead.toFixed(3).padStart(9)}   ${(-trail).toFixed(3).padStart(9)}`);
    assert.ok(r.lead >= bar - 1e-3,
      `${label}: the look-at settles ${r.lead.toFixed(3)} m from the player along travel, i.e. `
      + `${(-r.lead).toFixed(3)} m BEHIND him, past the ${bar.toFixed(3)} m the deadzone alone `
      + 'explains. The lead floor in `_pivotGoal` is not running, or `stiff` has grown past what '
      + 'it compensates.');
  }

  /* THE FAILING INPUT, run rather than described. With no authored lead at all the floor is the
     only thing holding the pivot on the character. */
  const noLead = withTune('leadTime', 0, () => settledLead('move', RUN));
  const unflooredAtZero = -(TUNE.followTimeH * noLead.stiff * RUN + TUNE.deadzoneH);
  console.log(`[L1] leadTime 0 -> delivered ${noLead.lead.toFixed(4)} m · `
    + `un-floored closed form ${unflooredAtZero.toFixed(4)} m · bar ${bar.toFixed(4)} m`);
  assert.ok(unflooredAtZero < bar - 0.5,
    `the un-floored value at leadTime 0 is ${unflooredAtZero.toFixed(3)} m, which is not clearly `
    + `on the failing side of the ${bar.toFixed(3)} m bar. This arm's failing input has evaporated, `
    + 'so the passing one proves nothing.');
  assert.ok(noLead.lead >= bar - 1e-3,
    `with leadTime 0 the pivot settles ${noLead.lead.toFixed(3)} m along travel — the floor is not `
    + 'holding it, so the shipped numbers above are passing on the authored lead alone');

  /* And the floor must be measurably intervening, not merely present. */
  const gap = noLead.lead - unflooredAtZero;
  assert.ok(gap > 0.5,
    `the floor buys only ${gap.toFixed(3)} m at leadTime 0 — it is not the thing keeping the pivot `
    + 'on the character, so L1 is attributing someone else\'s work to it');
});

test('L1b: the floor is one-sided — framings that already led are untouched', () => {
  /* The other half of the claim, and the reason full lag compensation was refused: this change
     must move ONLY the framings whose delivered lead had the wrong sign.
   *
   * The strongest row in here is `railSlide` at TWO speeds, because it is the same framing on
   * both sides of the crossover and so it demonstrates the mechanism rather than asserting it:
   * `leadMax` bounds the lead and NOTHING bounds the trail, so above `leadMax / (followTimeH ×
   * stiff)` = 13.67 m/s the authored lead stops growing while the trail keeps going. At
   * `railSpeed` 9.5 the floor is inactive; at `railMax` 15.0 it binds. That crossover is the
   * whole defect, in one state.
   *
   * (This arm's first draft asserted `railSlide` at `railMax` was on the INACTIVE side. It is
   * not — 1.750 authored against 1.920 of trail — and the arm said so. Recorded because a
   * discriminator that catches the person writing it is the only kind worth having.)
   *
   * DOMAIN (§418.3)
   *   passes on : `run` at runSpeed and `railSlide` at railSpeed — authored lead exceeds the
   *               trail, floor inactive, delivered value identical to the pre-change rig
   *               (0.612 m, measured before and after).
   *   fails on  : `move` at runSpeed, `sneak` at sneakSpeed and `railSlide` at railMax — authored
   *               lead is BELOW the trail, so the floor binds and the delivered value moves
   *               (−0.939 → −0.043, −0.250 → −0.089). Asserted below as the discriminator: if
   *               the floor bound on everything, or on nothing, these two sets would agree. */
  const inactive = [['run', RUN, true], ['railSlide', CTUNE.railSpeed, false]];
  const active = [['move', RUN, true], ['sneak', CTUNE.sneakSpeed, true], ['railSlide', CTUNE.railMax, false]];

  for (const [st, v, g] of inactive) {
    const r = settledLead(st, v, { grounded: g });
    const authoredLen = Math.min(TUNE.leadTime * (FRAME_LEAD[r.key] ?? 0) * v, TUNE.leadMax);
    const trail = TUNE.followTimeH * r.stiff * v;
    console.log(`[L1b] ${st.padEnd(10)} key ${r.key.padEnd(11)} authored ${authoredLen.toFixed(3)} `
      + `> trail ${trail.toFixed(3)} -> floor inactive · delivered ${r.lead.toFixed(3)}`);
    assert.ok(authoredLen > trail,
      `${st}: authored lead ${authoredLen.toFixed(3)} m is not above the trail ${trail.toFixed(3)} m, `
      + 'so this row is not an example of the floor being inactive and proves nothing about one-sidedness');
  }
  for (const [st, v, g] of active) {
    const r = settledLead(st, v, { grounded: g });
    const authoredLen = Math.min(TUNE.leadTime * (FRAME_LEAD[r.key] ?? 0) * v, TUNE.leadMax);
    const trail = TUNE.followTimeH * r.stiff * v;
    console.log(`[L1b] ${st.padEnd(10)} key ${r.key.padEnd(11)} authored ${authoredLen.toFixed(3)} `
      + `< trail ${trail.toFixed(3)} -> floor binds   · delivered ${r.lead.toFixed(3)}`);
    assert.ok(authoredLen < trail,
      `${st}: authored lead ${authoredLen.toFixed(3)} m is not below the trail ${trail.toFixed(3)} m, `
      + 'so this row is not an example of the floor binding — both halves of the discriminator have collapsed');
  }
});

/* ====================================================================== */
/* L2 — the vertical look gain                                             */
/* ====================================================================== */

test('L2: vertical look is geared below horizontal, by exactly lookPitchScale', () => {
  /* DOMAIN (§418.3)
   *   passes on : the shipped `lookPitchScale` 0.75 — one radian of `look.y` moves `pitch` by
   *               0.75 rad while one radian of `look.x` moves `yaw` by a full 1.0.
   *   fails on  : `lookPitchScale` 1.0, which is the state the rig shipped in until this change.
   *               Planted live below and asserted to produce a DIFFERENT pitch, so the equality
   *               above is known to be measuring the constant rather than measuring nothing. */
  const readAxes = (dy) => {
    const engine = baseEngine(new OpenAir());
    const rig = new CameraRig(engine);
    rig.init?.();
    rig.snap?.(true);
    const p0 = rig.pitch, y0 = rig.yaw;
    engine.input.look.x = 0.20;
    engine.input.look.y = dy;
    engine.dt = 1 / 60; engine.time += 1 / 60;
    rig.update(1 / 60);
    return { dPitch: rig.pitch - p0, dYaw: rig.yaw - y0 };
  };

  const shipped = readAxes(0.20);
  console.log(`\n[L2] look (0.20, 0.20) -> dYaw ${shipped.dYaw.toFixed(6)} · dPitch ${shipped.dPitch.toFixed(6)} `
    + `· lookPitchScale ${TUNE.lookPitchScale}`);
  assert.ok(Math.abs(shipped.dYaw + 0.20) < 1e-9,
    `yaw moved ${shipped.dYaw.toFixed(6)} for a 0.20 rad look — horizontal must stay 1:1 (rule 1)`);
  assert.ok(Math.abs(shipped.dPitch - 0.20 * TUNE.lookPitchScale) < 1e-9,
    `pitch moved ${shipped.dPitch.toFixed(6)} for a 0.20 rad look; lookPitchScale ${TUNE.lookPitchScale} `
    + `asks for ${(0.20 * TUNE.lookPitchScale).toFixed(6)}`);

  const flat = withTune('lookPitchScale', 1.0, () => readAxes(0.20));
  console.log(`[L2] planted lookPitchScale 1.0 -> dPitch ${flat.dPitch.toFixed(6)}`);
  assert.ok(Math.abs(flat.dPitch - shipped.dPitch) > 0.02,
    `planting lookPitchScale 1.0 changed the pitch step by ${Math.abs(flat.dPitch - shipped.dPitch).toFixed(6)} rad. `
    + 'The constant is not reaching `_orbit`, so the equality above passes for the wrong reason.');
  assert.ok(Math.abs(flat.dYaw - shipped.dYaw) < 1e-12,
    'planting the pitch scale also moved yaw — it is not axis-local, and rule 1 is being touched');
});

/* ====================================================================== */
/* L3 — the wall-run bank, live for the first time                         */
/* ====================================================================== */

test('L3: a wall run banks the horizon, and it takes the wall to do it', () => {
  /* The consequence of the `wallRun -> wall_run` routing fix. `_blendFrame` gates the wall-side
     probe on `_frameKey === 'wall_run'`, so while `wallRun` routed to the `run` framing the probe
     never ran and `_roll` was pinned at exactly 0 for the entire move.
   *
   * DOMAIN (§418.3)
   *   passes on : stateName 'wallRun' with a wall on the right — `_roll` settles non-zero and
   *               signed toward the wall.
   *   fails on  : the SAME wall with stateName 'move'. `move` routes to `idle`, the probe is
   *               gated off, and `_roll` stays 0 — which is precisely the pre-fix condition, so
   *               the failing input is the defect itself rather than an invented one. Asserted
   *               below, not assumed. */
  const run = (stateName, side) => {
    const engine = baseEngine(new OneWall(side));
    const rig = new CameraRig(engine);
    rig.init?.();
    const mv = engine.movement;
    mv.stateName = stateName;
    mv.grounded = false;
    mv.velocity.set(0, 0, -CTUNE.wallRunSpeed);
    rig.snap?.(true);
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) {
      mv.position.z -= CTUNE.wallRunSpeed * dt;
      engine.dt = dt; engine.time += dt;
      rig.update(dt);
    }
    return { roll: rig._roll, key: rig._frameKey, side: rig._wallSide };
  };

  const right = run('wallRun', +1);
  const left = run('wallRun', -1);
  const notWall = run('move', +1);
  console.log(`\n[L3] wallRun/right key ${right.key} wallSide ${right.side} roll ${right.roll.toFixed(5)}`);
  console.log(`[L3] wallRun/left  key ${left.key} wallSide ${left.side} roll ${left.roll.toFixed(5)}`);
  console.log(`[L3] move/right    key ${notWall.key} wallSide ${notWall.side} roll ${notWall.roll.toFixed(5)}`);

  assert.equal(right.key, 'wall_run', `wallRun resolved to '${right.key}' — the routing fix is gone`);
  assert.ok(Math.abs(right.roll) > 0.02,
    `a wall run beside a wall banks ${right.roll.toFixed(5)} rad. The bank is dead again — either the `
    + 'routing fix was dropped or `_probeWallSide` stopped answering.');
  assert.ok(Math.sign(right.roll) === -Math.sign(left.roll),
    `both sides bank the same way (${right.roll.toFixed(5)} / ${left.roll.toFixed(5)}) — the roll is not `
    + 'reading which side the wall is on, so its magnitude is not evidence of a bank');
  assert.ok(Math.abs(notWall.roll) < 1e-6,
    `the same wall banked ${notWall.roll.toFixed(6)} rad in the 'move' framing. The probe is not gated on `
    + 'the framing key at all, so L3 is not measuring the routing fix.');
});
