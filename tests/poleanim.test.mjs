import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { buildClipSet, GODOT_LIMB_OPEN } from '../src/player/Animation.js';

/**
 * §720 — the rope/pipe climb, driven on the SHIPPED level rather than asserted off the table.
 *
 * The owner: *"Integrate the animation for the rope and pipe climbing from the godot repo over
 * the current one."* Two clips the reference authored and this project had never bound —
 * `PoleClimbIdle` (their `pole_state` input 0) and `PoleGrab` (their pole mount) — plus §531's
 * limb lever taken off the pole family, because a hand on a rope is a PLACED hand and §479.10's
 * own criterion exempts those.
 *
 * ── WHY A DRIVEN ARM AND NOT A TABLE ARM ──────────────────────────────────────────────────
 * `buildClipSet` will happily report `pole_idle -> godot:PoleClimbIdle` in a build where the
 * state machine never asks for it. That is the whole §715.6 gap restated: the clip was BAKED
 * and reachable the entire time; what was missing was a play site. So the load-bearing arm is
 * the one that walks Sly into a real pipe on the real level and reads what `Controller.baseClip`
 * and `Controller.oneShot` were actually handed, frame by frame (§435.4 — settled, walked,
 * never teleported into the state).
 *
 * The pipe is the shipped one at (21.35, ., -2): r 0.18 after `PoleClimb.enter`'s max(0.18, .),
 * bottom 0, top 9.6 — the only climbable in the level whose foot is ON THE GROUND, which is what
 * lets the mount be walked into instead of jumped at.
 *
 * ── DOMAIN (§418.3) ───────────────────────────────────────────────────────────────────────
 * passes on : the shipped default — the mount fires `pole_grab`, a stationary hang holds
 *             `pole_idle`, stick-forward returns `pole_climb`, crouch returns `pole_slide`.
 * fails  on : RUN IN-ARM, the `?pole=climb` revert built in the same process — where the same
 *             drive must produce `pole_climb` at the mount AND while stationary, i.e. the exact
 *             defect §715.2 named ("our pole state shows the climbing loop while stationary").
 *             An arm that only checked the default would pass on a build where the token did
 *             nothing.
 * does NOT  : judge the clips' LOOK (that is `tools/polemeasure.mjs` and the frames), the fade
 * discrim.    length, or anything about `pole_swing` — a different state, deliberately left on
 *             the set-wide lever with its numbers recorded rather than changed.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PIPE = { x: 21.35, z: -2, top: 9.6 };

/**
 * Record every clip MOVEMENT asks for (`_clipprobe.mjs`'s idiom: `baseClip` and `oneShot` are the
 * only two routes from a state to a clip, so patching the pair sees every request there is).
 *
 * Stamped with the FRAME, deliberately not with `c.stateName`: `StateMachine.set` runs
 * `next.enter()` BEFORE `onStateChanged` assigns `stateName`, so a mount one-shot fired inside
 * `enter` is still attributed to the state being left. The first draft of this helper filtered
 * on `stateName === 'poleClimb'` and reported an EMPTY mount — a plausible "nothing fired" that
 * was the instrument's own off-by-one, which is why the frame stamp is the key instead.
 */
function watchClips(c, clock) {
  const log = { base: [], one: [] };
  const b = c.baseClip.bind(c), o = c.oneShot.bind(c);
  c.baseClip = (n, f) => { log.base.push({ n, f: clock.i, s: c.stateName }); return b(n, f); };
  c.oneShot = (n, s, f) => { log.one.push({ n, f: clock.i, s: c.stateName }); return o(n, s, f); };
  return log;
}

/**
 * Walk in from 2.6 m east of the pipe, then hold one input for 40 frames once mounted.
 *
 * A FRESH Controller per drive, via `realWorld()`'s own mint-and-retire path, rather than
 * `hardReset` on the previous one: `hardReset` rebuilds the moveset with `sm.current = null`, so
 * the outgoing state's `exit` never runs and `PoleClimb.exit`'s `c.attached = null` is skipped —
 * the second drive then starts attached to a pole it is not on and never settles. Found by the
 * settle guard above tripping on drive 2, which is the guard doing its job.
 */
async function drive({ hold = null, holdFrames = 40, climbFirst = 0 } = {}) {
  const { engine, c } = await realWorld();
  const start = V(PIPE.x + 2.6, 0, PIPE.z);
  hardReset(engine, c, start, 0);
  const clock = { i: 0 };
  const log = watchClips(c, clock);
  /* SETTLE first: `hardReset` places a capsule, and a capsule that has not been integrated is
     not yet standing on anything. Ten still frames put him on the ground the same way the
     acceptance drive does, so the mount below is walked into from a real stance. */
  for (let i = 0; i < 10; i++) {
    clock.i = i;
    engine.input.beginFrame(DT);
    /* Zeroed EXPLICITLY. `StubInput.move` persists across `beginFrame`, so without this the
       settle inherits the previous drive's held stick and Sly walks into the pipe and mounts it
       during the ten "still" frames — which is how drive 3 first failed this guard, in the state
       it was supposed to be settling before. */
    engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
  }
  assert.ok(c.grounded, 'the driver never settled on the ground — the walk-in is not a walk-in');

  /* Aim the camera at the shaft and hold forward. `PoleClimb.canEnter`'s auto-mount wants
     `wishMag > 0.4` and the wish direction pointed at the pole; `poleMount` is 1.9 m. */
  let mounted = -1;
  for (let i = 10; i < 260 && mounted < 0; i++) {
    clock.i = i;
    const dx = PIPE.x - c.position.x, dz = PIPE.z - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    engine.time = i * DT; c.update(DT, i * DT);
    if (c.stateName === 'poleClimb') mounted = i;
  }
  assert.ok(mounted > 0, `never mounted the pipe: ended in "${c.stateName}" at ${c.position.toArray().map((v) => v.toFixed(2))}`);
  /* The mount's one-shots are the ones fired on the frame the state changed — see watchClips. */
  const mountOneShots = log.one.filter((e) => e.f === mounted).map((e) => e.n);

  /* Now the held phase. RAW stick, not camera-relative: `PoleClimb` gates on `wishRaw.z`
     (the traversal file's own note — a world-space steering vector feeds it a NEGATIVE z and
     slides Sly back down). So the script writes `move` directly. */
  /* A mount lands at y 0.10 on a pipe whose `bottom` is 0, and `PoleClimb.update` bails to
     `idle` the moment a descent reaches `bottom + 0.02`. So the slide branch is unreachable from
     the mount height and has to be climbed to first — otherwise the arm would report "pole_slide
     never played" about the level's geometry rather than about §720. */
  for (let i = 0; i < climbFirst; i++) {
    clock.i = mounted + 1 + i;
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    const t = (mounted + i) * DT;
    engine.time = t; c.update(DT, t);
  }
  const climbedTo = c.position.y;

  const baseAt = log.base.length;
  for (let i = 0; i < holdFrames; i++) {
    clock.i = mounted + 1 + climbFirst + i;
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    if (hold === 'up') engine.input.move.y = 1;
    if (hold === 'down') engine.input.move.y = -1;
    if (hold === 'crouch') engine.input.hold('crouch');
    const t = (mounted + climbFirst + i) * DT;
    engine.time = t; c.update(DT, t);
  }
  const held = log.base.slice(baseAt).filter((e) => e.s === 'poleClimb').map((e) => e.n);
  return { mounted, mountOneShots, held, climbedTo, state: c.stateName, log };
}

/**
 * CHILD MODE — the same driver, in a process where the token was set BEFORE any module loaded.
 *
 * §720's revert has two halves in two files, and the play-site half (`Moveset.js`) reads a
 * module-load constant exactly as §716's and §717's tokens do. One process cannot hold both
 * arms of that, and asserting the FLAG instead of the behaviour is §418.9's failure mode written
 * out. So the fail input is a child `node` that sets `globalThis.__POLE_AB` and then runs this
 * very file's `drive()` — one copy of the driver, two arms, and the reverted arm has to
 * reproduce the defect §715.2 named or the token is not reverting anything.
 */
if (process.env.POLE_CHILD) {
  /* The token itself is set by the SPAWNER before this module is imported — see the arm below.
     Asserting it here rather than assigning it is the point: if the child ever ran without the
     token in place, this throws instead of quietly measuring the default twice. */
  assert.equal(globalThis.__POLE_AB, process.env.POLE_CHILD,
    'child mode ran without the token set before import — the arm would compare the default to itself');
  const out = {};
  out.idle = await drive({ hold: null });
  out.up = await drive({ hold: 'up' });
  process.stdout.write(`\n__POLE_RESULT__${JSON.stringify({
    mountOneShots: out.idle.mountOneShots,
    heldStationary: [...new Set(out.idle.held)],
    heldUp: [...new Set(out.up.held)],
  })}\n`);
  process.exit(0);
}

test('§720 pole: the mount fires `pole_grab` and a stationary hang holds `pole_idle` — walked in, on the shipped level', async () => {
  const idle = await drive({ hold: null });
  assert.ok(idle.mountOneShots.includes('pole_grab'),
    `the mount fired ${JSON.stringify(idle.mountOneShots)} — §720 binds their PoleGrab there, and `
    + 'the old `oneShot(\'pole_climb\')` played NOTHING under the godot regime because §525 refuses '
    + 'to layer a clip on its own source and the base clip was the same motion.');
  assert.ok(idle.held.includes('pole_idle'),
    `a stationary player on the pipe asked for ${JSON.stringify([...new Set(idle.held)])} — §715.2's `
    + 'open gap was that this shows the CLIMBING loop while standing still.');
  assert.ok(!idle.held.includes('pole_climb'),
    'a stationary player still asked for `pole_climb` — the hang is not exclusive, so the climb '
    + 'loop still plays on the spot for part of the time.');

  const up = await drive({ hold: 'up' });
  assert.ok(up.held.includes('pole_climb'),
    `holding UP asked for ${JSON.stringify([...new Set(up.held)])} — climbing must still play the climb.`);
  assert.ok(!up.held.includes('pole_idle'), 'holding UP asked for the hang — the discriminator is inverted');

  const down = await drive({ hold: 'crouch', climbFirst: 40 });
  assert.ok(down.held.includes('pole_slide'),
    `crouching asked for ${JSON.stringify([...new Set(down.held)])} — the slide branch is unchanged by §720.`);

  console.log(`[§720] walked-in mount at frame ${idle.mounted}: one-shots ${JSON.stringify(idle.mountOneShots)}; `
    + `held stationary ${JSON.stringify([...new Set(idle.held)])}; up ${JSON.stringify([...new Set(up.held)])}; `
    + `crouch ${JSON.stringify([...new Set(down.held)])}`);
});

test('§720 pole: `?pole=climb` restores the climbing-on-the-spot state — the fail arm, driven in a child process', async () => {
  const { execFileSync } = await import('node:child_process');
  const url = new URL(import.meta.url);
  /* `--input-type=module -e` and a DYNAMIC import, not `node <this file>`: a static import is
     hoisted and evaluated before any statement in the module body, so setting the token in the
     child's own top-level code would set it AFTER `Animation.js` had already read it. The first
     version of this arm did exactly that and the "reverted" child returned the default's answers
     — a fail input that silently was not one, which is the only way this arm could have lied. */
  const run = (token) => {
    const src = `globalThis.__POLE_AB = ${JSON.stringify(token)};\n`
      + `await import(${JSON.stringify(url.href)});\n`;
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', src],
      { env: { ...process.env, POLE_CHILD: token }, encoding: 'utf8', maxBuffer: 32 << 20 });
    const m = /__POLE_RESULT__(\{.*\})/.exec(raw);
    assert.ok(m, `the ?pole=${token} child produced no result line — it did not reach the pipe`);
    return JSON.parse(m[1]);
  };

  const port = run('port');
  const climb = run('climb');

  /* PASS INPUT — the shipped default, re-derived in a clean process rather than inherited from
     the arm above (a token arm that only ever ran in the parent proves nothing about the token). */
  assert.deepEqual(port.mountOneShots, ['pole_grab']);
  assert.deepEqual(port.heldStationary, ['pole_idle']);
  assert.deepEqual(port.heldUp, ['pole_climb']);

  /* FAIL INPUT — the reverted arm must reproduce the defect, not merely differ from the default.
     `pole_climb` at the mount AND while stationary is §715.2's sentence, exactly. */
  assert.deepEqual(climb.mountOneShots, ['pole_climb'],
    `?pole=climb fired ${JSON.stringify(climb.mountOneShots)} at the mount — the revert must restore `
    + 'the original `oneShot(\'pole_climb\')` call, not a third behaviour.');
  assert.deepEqual(climb.heldStationary, ['pole_climb'],
    `?pole=climb held ${JSON.stringify(climb.heldStationary)} while stationary — the whole point of the `
    + 'revert is that it climbs on the spot again, which is what shipped before §720.');
  assert.deepEqual(climb.heldUp, ['pole_climb']);

  console.log(`[§720 token] default: mount ${JSON.stringify(port.mountOneShots)}, stationary `
    + `${JSON.stringify(port.heldStationary)} · ?pole=climb: mount ${JSON.stringify(climb.mountOneShots)}, `
    + `stationary ${JSON.stringify(climb.heldStationary)}`);
});

test('§720 pole: the token moves the TABLE half too — the source rows and the §531 lever', () => {
  /* The revert is two halves in two files; the child arm above covers the PLAY SITES, this one
     covers the clip table, and a token that moved only one would be a half-revert reading as a
     whole one. */
  const climb = buildClipSet('godot', { pole: 'climb' });
  const port = buildClipSet('godot', { pole: 'port' });
  assert.equal(port.origin.pole_idle, 'godot:PoleClimbIdle');
  assert.equal(port.origin.pole_grab, 'godot:PoleGrab');
  assert.equal(climb.origin.pole_idle, 'proc',
    'the revert must hand these verbs back to the procedural donors, not keep the ported source');
  assert.equal(climb.origin.pole_grab, 'proc');
  /* The §531 half: the two verbs that ALREADY SHIPPED must get the set-wide lever back, and the
     two new ones must not — nothing plays them in that arm, so there is nothing to revert. */
  assert.notEqual(climb.table.pole_climb.bones.find((t) => t.name === 'lowerArmL'),
    port.table.pole_climb.bones.find((t) => t.name === 'lowerArmL'),
    '`?pole=climb` left `pole_climb`\'s elbow track alone — the lever half of the revert did not run');
  assert.deepEqual(GODOT_LIMB_OPEN.pole_climb, { elbow: 0, knee: 0 });
  assert.deepEqual(GODOT_LIMB_OPEN.pole_slide, { elbow: 0, knee: 0 });
  assert.equal(GODOT_LIMB_OPEN.pole_swing, undefined,
    '`pole_swing` gained a lever row — §720 deliberately measured it and left it on the set-wide value');
});

test('§720 pole: neither new clip carries an event, and that is the contract', () => {
  /* `spliceClip` fills a swapped clip's events from the PROCEDURAL donor when the source has
     none — and no clip in the reference carries any. So the risk here is an INHERITED event, not
     a missing one: `pole_climb`'s two `footstep` beats on a motionless hang would be a climb
     rhythm with no climb, and `PoleClimb.enter` already emits `poleMount` for AUDIO and FX, so a
     mount event would announce one contact twice. */
  const { table } = buildClipSet('godot');
  assert.equal(table.pole_idle.events.length, 0,
    `pole_idle carries ${table.pole_idle.events.length} event(s) — a stationary hang must not beat out footsteps`);
  assert.equal(table.pole_grab.events.length, 0,
    `pole_grab carries ${table.pole_grab.events.length} event(s) — the mount is announced once, by PoleClimb.enter`);
  /* the positive control: the verb that SHOULD have them still does, so the assertion above is
     about these two clips and not about a build where events stopped being filled at all. */
  assert.ok(table.pole_climb.events.length > 0,
    'pole_climb lost its hand-beat events — the donor fill stopped running and the two zeros above mean nothing');
});
