import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { CLIPS } from '../src/player/Clips.js';
import { Animation, ACTIVE, buildClipSet } from '../src/player/Animation.js';
import { makeSim, DT } from './_moveset.mjs';

/**
 * flip.test.mjs — the godot double jump DELIVERS a front flip on the shipped model (§478).
 *
 * §474 delivered a +346° cane twirl and the user still read the move as off — the telemetry
 * measured the cane while the player watches the BODY. The repo's own double-jump clip
 * (`FrontFlip`, fired on their air jump) is now the default `double_jump` via GODOT_ALIAS,
 * retimed onto OUR delivered window (0.41 s — doubleJumpV0/|g|), and the deliverable is a
 * SOMERSAULT: net rotation of the hips about the lateral axis. This file holds that claim the
 * way twirl.test.mjs holds §474's — same charStub (no `_attachPoints.cane`, the shipped
 * SlyModelDLRig shape), same real Controller+Moveset+Animation stack, same tapped cadence.
 *
 * ── DOMAIN — both inputs RUN (§418.3) ────────────────────────────────────────────────────────
 *   clip def:   the GODOT def (buildClipSet('godot').table.double_jump — FrontFlip @0.41 s)
 *             | the §474 PROC def (CLIPS.double_jump — the hand-carried cane twirl)
 *   drive:      tapped double jump (8-frame first hold, 6 gap, 4-frame second tap), flat world
 *
 *   passes on:  the godot def — |net sagittal hips sweep| ≥ 270° across the double jump's
 *               airtime (authored 360 minus at most one crossfade's absorption — §474's own
 *               delivery bar, transplanted to the axis a flip actually turns about), AND the
 *               body passes through inverted (min upDot ≤ −0.5)
 *   fails on:   the §474 proc def, RUN in-arm — its rotation is about +Y (the twirl), so the
 *               sagittal metric nets < 90° and upDot never leaves upright (> 0.3); that is not
 *               a defect of the twirl, it is WHY the user kept reading "no flip"
 *   cannot discriminate: whether 0.41 s READS as a flip at game framing and lighting — the
 *               fliptrace frames in shots/flip1 carry that claim, not this arm
 */

function charStub() {
  const root = new THREE.Group();
  root.name = 'slyStub';
  const bones = Object.create(null);
  for (const [name, parent, p] of RIG3.SKELETON) {
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(p[0], p[1], p[2]);
    (bones[parent] || root).add(b);
    bones[name] = b;
  }
  return { root, bones, boneNames: RIG3.BONE_ORDER.slice() };
}

async function boot() {
  const { engine, c } = await makeSim();
  const ch = charStub();
  const an = new Animation(engine);
  engine.get = (m) => (m === 'character' ? ch : m === 'animation' ? an : null);
  await an.init();
  assert.equal(an.ready, true, 'Animation must bind to the stub character');
  c.anim = an;
  return { engine, c, an, ch };
}

/** One tapped-double-jump take; returns per-frame hips world Y axis + states. */
function drive(engine, c, an, ch) {
  const input = engine.input;
  const ups = [], states = [];
  const axis = () => {
    ch.bones.hips.updateWorldMatrix(true, false);
    const e = ch.bones.hips.matrixWorld.elements;
    const L = Math.hypot(e[4], e[5], e[6]) || 1;
    return [e[4] / L, e[5] / L, e[6] / L];
  };
  let f = 0;
  const step = () => {
    input.beginFrame(DT);
    input.move.x = 0; input.move.y = 1;
    engine.time = f * DT;
    c.update(DT, f * DT);
    an.setLocomotion({
      speed: c.speedXZ(), maxSpeed: 7.2, grounded: c.grounded, airborne: !c.grounded,
      verticalVelocity: c.velocity.y, turnRate: 0, slope: 0, surface: 'stone',
    });
    an.update(DT, f * DT);
    ups[f] = axis(); states[f] = c.stateName;
    f++;
  };
  for (let i = 0; i < 30; i++) step();
  input.hold('jump'); for (let i = 0; i < 8; i++) step();
  input.let_go('jump'); for (let i = 0; i < 6; i++) step();
  input.hold('jump'); for (let i = 0; i < 4; i++) step();
  input.let_go('jump');
  for (let i = 0; i < 120 && !(c.grounded && f > 52); i++) step();
  const first = states.indexOf('doubleJump');
  let last = first;
  for (let i = Math.max(first, 0); i < states.length; i++) {
    if (['doubleJump', 'fall', 'land'].includes(states[i])) last = i; else if (i > first + 2) break;
  }
  return { ups, states, first, last };
}

/** Net sagittal sweep (deg) of the hips +Y axis in the (up, +Z-facing) plane, plus min upDot. */
function sagittal(ups, f0, f1) {
  let net = 0, prev = null, minUp = 1;
  for (let fi = f0; fi <= f1 && fi < ups.length; fi++) {
    const y = ups[fi];
    if (!y) continue;
    minUp = Math.min(minUp, y[1]);
    const a = Math.atan2(y[2], y[1]);      // stub runs +Z; twirl.test's own convention
    if (prev !== null) {
      let da = a - prev;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      net += da;
    }
    prev = a;
  }
  return { net: net * 180 / Math.PI, minUp };
}

async function takeWith(clip) {
  const prev = {};
  for (const n of Object.keys(CLIPS)) { prev[n] = ACTIVE[n]; ACTIVE[n] = CLIPS[n]; }
  ACTIVE.double_jump = clip;
  try {
    const { engine, c, an, ch } = await boot();
    return drive(engine, c, an, ch);
  } finally {
    for (const n of Object.keys(CLIPS)) ACTIVE[n] = prev[n];
  }
}

test('F1 flip delivery: the godot def somersaults the body through a tapped double jump; the §474 twirl cannot', async () => {
  const godot = buildClipSet('godot').table.double_jump;
  const now = await takeWith(godot);
  assert.ok(now.first >= 0, `doubleJump never entered (states: ${[...new Set(now.states)].join(',')})`);
  const a = sagittal(now.ups, now.first, now.last);
  assert.ok(Math.abs(a.net) >= 270,
    `godot def delivered ${a.net.toFixed(0)}° net body pitch across the double jump — the 360 did not arrive`);
  assert.ok(a.minUp <= -0.5,
    `godot def never passed through inverted (min upDot ${a.minUp.toFixed(2)}) — a flip that stays upright is not a flip`);

  const old = await takeWith(CLIPS.double_jump);
  assert.ok(old.first >= 0, 'doubleJump never entered on the proc-def arm');
  const b = sagittal(old.ups, old.first, old.last);
  assert.ok(Math.abs(b.net) < 90,
    `the §474 twirl nets ${b.net.toFixed(0)}° of body pitch — the contrast arm no longer contrasts`);
  assert.ok(b.minUp > 0.3,
    `the §474 twirl went inverted (min upDot ${b.minUp.toFixed(2)}) — it should rotate about +Y only`);
});
