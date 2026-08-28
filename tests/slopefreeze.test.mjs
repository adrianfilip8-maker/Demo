import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * §723B — "when going up a steep slope, the character pose is freezing for some reason."
 *
 * The reason, discriminated before it was fixed (the trace is in KNOWN_ISSUES §723): on a steep
 * face the capsule climbs as a sustained AIRBORNE skim — the sweep against the slope keeps
 * topping vy up to ≈ +0.95 m/s, the grounding probe's rising guard (`velocity.y <= 0.02`)
 * therefore refuses to re-ground it, and `Fall.update`'s clip pick `|vy| < apexWindow` reads
 * that plateau as a jump apex for as long as it lasts. `jump_apex` is a hover HOLD
 * (1.25°/frame of bone motion against walk's 8.3), so the body freezes for seconds while
 * travelling at up to 7 m/s. NOT a phase stall (the playhead advances the whole time), NOT a
 * state thrash (one continuous fall stretch), NOT a §717 regression (byte-identical trace at
 * cb4e41d, before §717 landed).
 *
 * The fix is one branch at the one play site: `Fall` counts residence inside the apex window,
 * and past `TUNE.surfBeat` — a ceiling free fall cannot reach (derivation at the constant) —
 * hands the body to the locomotion tree at its measured speed. Presentation only.
 *
 * ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────────
 * passes on : a BALLISTIC run-jump on the flat spawn ground — apex residence never crosses
 *             `surfBeat` (measured ceiling 0.08 s vs 0.30), so the branch is unreachable and
 *             every fall-state clip request is the shipped `jump_apex`/`jump_fall` pick.
 * fails  on : RUN IN A CHILD — `?surf=apex` (the revert) driven up the far-west dune, where the
 *             same drive must reproduce the defect: `jump_apex` requested continuously for
 *             > 1 s of in-window residence. An arm that only checked the default would pass on
 *             a build where the token did nothing (§720.5's lesson; the token is set BEFORE the
 *             child's import, and asserted, because a hoisted import reads it at load).
 * does NOT  : judge how the gait READS mid-skim (frames carry that), the fade length, or the
 * discrim.    physics of the skim itself — the rising guard and the slope constants are §515's
 *             settled ground and this file asserts they did NOT move (position-trace hash
 *             identical across arms).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/* The far-west dune §515.3 named, on the line tools measured at 51.6–57.2° sand: walked in
   from (-76, ., 50), uphill +x with a small +z component. The over-limit ridge face (§515.1's
   own census: >58° refuses grounding) is the near-zero-speed variant of the same defect. */
const SITES = {
  surf: { x: -76, z: 50, up: { x: 0.97, z: 0.26 } },
  ridge: { x: -79, z: 65, up: { x: 1, z: 0.07 } },
};
const GAITS = new Set(['walk', 'run', 'run_fast']);

/**
 * Drive one scenario and log, per frame: the state, |vy|-window residence, and the base clip
 * request in force. Also hashes the full position trace, because the whole fix is presentation:
 * a branch that moved the capsule by a micrometre would be a different change than the one
 * KNOWN_ISSUES describes, and the hash is what catches it across arms.
 */
async function drive(kind) {
  const { engine, collision, c } = await realWorld();
  let base = '';
  const b0 = c.baseClip.bind(c);
  c.baseClip = (n, f) => { base = n; return b0(n, f); };

  const site = SITES[kind === 'jump' ? 'surf' : kind];
  const start = kind === 'jump' ? V(0, 0, 30) : (() => {
    const g = collision.groundCheck(V(site.x, 80, site.z), TUNE.radius, 170);
    assert.ok(g?.hit, `no ground under the ${kind} site — the terrain moved under this file`);
    return V(site.x, g.y + 1.0, site.z);
  })();
  const yaw = kind === 'jump' ? 0 : Math.atan2(site.up.x, site.up.z);
  hardReset(engine, c, start, yaw);

  const hash = createHash('sha256');
  const frames = [];
  let t = 0, inWin = 0;
  const step = (stick, jump) => {
    const ux = kind === 'jump' ? 0 : site.up.x, uz = kind === 'jump' ? -1 : site.up.z;
    engine.camera.rotation.set(0, Math.atan2(-ux, -uz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = stick;
    if (jump) engine.input.hold('jump'); else engine.input.let_go('jump');
    engine.time = t; c.update(DT, t); t += DT;
    const fall = c.stateName === 'fall';
    const apex = fall && Math.abs(c.velocity.y) < TUNE.apexWindow;
    inWin = apex ? inWin + DT : 0;
    frames.push({ st: c.stateName, apex, inWin: +inWin.toFixed(4), base });
    hash.update(Float64Array.from([c.position.x, c.position.y, c.position.z]).buffer
      ? Buffer.from(Float64Array.from([c.position.x, c.position.y, c.position.z]).buffer) : '');
  };
  for (let i = 0; i < 45; i++) step(0, false);
  if (kind === 'jump') {
    for (let i = 0; i < 200; i++) step(1, i >= 48 && i < 56);
  } else {
    for (let i = 0; i < 300; i++) step(1, false);
  }

  /* Longest in-window residence, and the set of base clips requested past the beat. */
  let best = 0;
  const pastBeat = new Set();
  for (const f of frames) {
    if (f.inWin > best) best = f.inWin;
    if (f.apex && f.inWin > TUNE.surfBeat) pastBeat.add(f.base);
  }
  const fallClips = new Set(frames.filter((f) => f.st === 'fall').map((f) => f.base));
  return { best, pastBeat: [...pastBeat], fallClips: [...fallClips], posSha: hash.digest('hex') };
}

/* ── CHILD MODE — the revert arm runs this same driver under the token (§720.5's shape). ── */
if (process.env.SURF_CHILD) {
  assert.equal(globalThis.__SURF_AB, process.env.SURF_CHILD,
    'child ran without the token set before import — the arm would compare the default to itself');
  const surf = await drive('surf');
  process.stdout.write(`\n__SURF_RESULT__${JSON.stringify(surf)}\n`);
  process.exit(0);
}

test('§723B slope freeze: past the free-fall ceiling the fall state asks for the gait, and a ballistic jump never gets near the branch', async () => {
  const surf = await drive('surf');
  /* The fail input has to EXIST before the fix can be said to flip it: the dune must still
     produce a skim that out-stays free fall by a wide margin. If terrain or physics changes
     ever remove the skim, this arm goes red and the branch below it is untested — which is
     the §442 shape, and better loud than latent. */
  assert.ok(surf.best > TUNE.surfBeat * 3,
    `the steep drive's longest apex-window residence is ${surf.best.toFixed(2)} s — the sustained `
    + 'skim this section is about no longer occurs, so the gait branch is now unreachable here');
  assert.ok(surf.pastBeat.length > 0 && surf.pastBeat.every((n) => GAITS.has(n)),
    `past surfBeat the fall state asked for ${JSON.stringify(surf.pastBeat)} — §723B hands the `
    + 'body to the locomotion tree there, never the apex hover');
  assert.ok(!surf.pastBeat.includes('jump_apex'),
    'jump_apex was still requested past the beat — the freeze the owner reported is back');

  const ridge = await drive('ridge');
  assert.ok(ridge.best > 1.0, `the over-limit ridge push held the window for ${ridge.best.toFixed(2)} s`);
  assert.ok(ridge.pastBeat.every((n) => GAITS.has(n)),
    `the near-zero-speed push asked for ${JSON.stringify(ridge.pastBeat)} — the tree resolves `
    + 'sub-moveFloor speed to the idle family (§717), so the request stays a tree name');

  const jump = await drive('jump');
  assert.ok(jump.best < TUNE.surfBeat,
    `a ballistic run-jump reached ${jump.best.toFixed(3)} s of apex residence against the beat's `
    + `${TUNE.surfBeat} — free fall must not be able to reach the branch, or ordinary jumps change`);
  for (const n of jump.fallClips) {
    assert.ok(n === 'jump_apex' || n === 'jump_fall',
      `a ballistic fall requested "${n}" — the pass arm must keep the shipped apex/fall pick exactly`);
  }
  console.log(`[§723B] surf: residence ${surf.best.toFixed(2)} s, past-beat clips ${JSON.stringify(surf.pastBeat)} · `
    + `ridge: ${ridge.best.toFixed(2)} s, ${JSON.stringify(ridge.pastBeat)} · `
    + `jump: ${jump.best.toFixed(3)} s, fall clips ${JSON.stringify(jump.fallClips)}`);
});

test('§723B token: `?surf=apex` reproduces the freeze in a child, and the capsule trace is byte-identical across arms', async () => {
  const { execFileSync } = await import('node:child_process');
  const url = new URL(import.meta.url);
  const run = (token) => {
    /* Token BEFORE the dynamic import — a static import is hoisted past any assignment in the
       child's own body, and §720.5 measured that failure mode as a revert arm that silently
       measured the default (the only way this arm could lie). */
    const src = `globalThis.__SURF_AB = ${JSON.stringify(token)};\n`
      + `await import(${JSON.stringify(url.href)});\n`;
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', src],
      { env: { ...process.env, SURF_CHILD: token }, encoding: 'utf8', maxBuffer: 32 << 20 });
    const m = /__SURF_RESULT__(\{.*\})/.exec(raw);
    assert.ok(m, `the ?surf=${token} child produced no result line — it never finished the drive`);
    return JSON.parse(m[1]);
  };

  const gait = run('gait');
  const apex = run('apex');

  /* PASS INPUT — the shipped default, re-derived in a clean process rather than inherited from
     the arm above. */
  assert.ok(gait.pastBeat.length > 0 && gait.pastBeat.every((n) => GAITS.has(n)),
    `default child asked for ${JSON.stringify(gait.pastBeat)} past the beat`);

  /* FAIL INPUT — the revert must reproduce the DEFECT, not merely differ: the apex hover held
     through a residence free fall cannot produce. */
  assert.deepEqual(apex.pastBeat, ['jump_apex'],
    `?surf=apex asked for ${JSON.stringify(apex.pastBeat)} past the beat — the revert must restore `
    + 'the shipped hover exactly, not a third behaviour');
  assert.ok(apex.best > 1.0,
    `?surf=apex held the window for only ${apex.best.toFixed(2)} s — the defect did not reproduce`);

  /* PRESENTATION ONLY, asserted rather than promised: the same drive in both arms must put the
     capsule in exactly the same place on every frame. A gait branch that moved physics would be
     a different change than the one KNOWN_ISSUES §723 describes. */
  assert.equal(gait.posSha, apex.posSha,
    'the position trace differs between ?surf arms — the branch leaked into the simulation');

  console.log(`[§723B token] default past-beat ${JSON.stringify(gait.pastBeat)} · ?surf=apex past-beat `
    + `${JSON.stringify(apex.pastBeat)} (residence ${apex.best.toFixed(2)} s) · posSha equal ${gait.posSha === apex.posSha}`);
});
