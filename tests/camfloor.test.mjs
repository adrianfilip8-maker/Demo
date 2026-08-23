import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from './_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { STICKS, PAD_FULL, forceRoutes, driveForce, attribute } from '../tools/camforce.mjs';

/**
 * camfloor.test.mjs — §640's subject boom floor, and the sampling that found it.
 *
 * `camstate.test.mjs` verifies the containment RULING across the state space. This file verifies
 * the mechanism §640 added underneath it, and it exists as a separate file for one reason worth
 * stating: **every route in camstate's 73-route battery drives with `look` at zero** — a mouse
 * player who never touches the mouse. The user plays on a PS4 pad and holds the right stick, and
 * `Input._padLook` turns full deflection into `padLook` 2.6 rad/s, i.e. 0.0433 rad of `look` per
 * 60 Hz frame. Every arm here drives under a stick regime. That is §440 applied to this lane's
 * own instrument rather than to somebody else's: a route list is an instrument, and one that
 * samples a device nobody uses measures a game nobody plays.
 *
 * The stick regimes are not decoration. Measured over 52,976 frames, the hard-cut census by stick:
 * `downleft` produces 26 steps over 60°/frame and `upright` produces 1. A single-direction sample
 * would have reported either number as "the" answer.
 */

const DEG = 180 / Math.PI;
const SOLID_TAGS = ['ground', 'wall', 'ledge', 'pole'];

/* The two poses these arms are written about, both driven, both from a real standing start in the
   shipped level. The pole swing is where §581/§582/§583 found the whip; the hook-ring debt take is
   camclamp's harshest pose on record and the one the movement lane's §597 stress case lands in. */
const SWING = { start: V(19.8, 0.02, -2.0), yaw: Math.PI, frames: 400,
  script: (i, n, c) => {
    i.move.y = 1; i.move.x = 0.8;
    if (c.stateName !== 'poleClimb') { if (n % 8 === 0) i.hold('interact'); else i.let_go('interact'); i.let_go('attack'); }
    else { i.let_go('interact'); if (n % 90 === 0) i.hold('attack'); else i.let_go('attack'); }
  } };

test('camfloor: the closed form is checked on the RESULT, not trusted from the derivation', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the shipped floor, driven on the pole-swing take with the stick held down-left.
   *               `_subjectBoomFloor` solves two quadratics — a range bound and a forward
   *               half-space bound — and this arm never checks the algebra. It takes the boom the
   *               rig actually wrote and evaluates the two GEOMETRIC predicates the quadratics
   *               were derived from, at the camera position that boom produces. That is the same
   *               shape as the overlap bisection `_castBoom` runs after its whiskers and as
   *               §582.1's side-flip rejection: when a closed form can return a wrong branch,
   *               verify the branch you got.
   * ran, fails  : `subjectFloor: false` — the pre-§640 rig, RUN, not recalled: on the same take
   *               the forward predicate is violated on real frames, which is the pose the φ wrap
   *               is defined on. Asserted to reproduce, so a re-routed drive cannot hollow this
   *               out.
   * does NOT    : say the floor is CAST — it is not; it can hand length back into geometry, and
   * discriminate  the arm after this one is what prices that. Nor does it judge composition, nor
   *               cover the shake's positional channel, which is applied after the boom and can
   *               carry the lens up to `shakePos` 0.16 m closer on an impact frame.
   */
  const check = async (floor) => {
    const { rows } = await driveForce({ ...SWING, stick: 'downleft', tune: { subjectFloor: floor } });
    let rangeBad = 0, frontBad = 0, worstRange = Infinity, worstDepth = Infinity, n = 0;
    for (const r of rows) {
      if (r.amp > 0) continue;                 // the shake moves the lens after the boom, by design
      n++;
      /* Rebuild the pose the floor was solved for: the boom tip, before the clamp's translates. */
      const c = r.pb, s = new THREE.Vector3(r.px, r.py + r.anchorY, r.pz);
      const look = new THREE.Vector3(r.pvx, r.pvy + TUNE.headroom, r.pvz);
      const range = s.distanceTo(c);
      const depth = s.clone().sub(c).dot(look.clone().sub(c));
      if (range < TUNE.distHardMin - 1e-6) rangeBad++;
      if (depth <= 0) frontBad++;
      worstRange = Math.min(worstRange, range);
      worstDepth = Math.min(worstDepth, depth);
    }
    return { rangeBad, frontBad, worstRange, worstDepth, n };
  };
  const off = await check(false);
  const on = await check(TUNE.subjectFloor);

  assert.ok(off.frontBad > 0,
    `the pre-§640 rig never put the subject behind the lens on this take (${off.frontBad} frames of `
    + `${off.n}) — the pose the wrap is defined on did not reproduce, so the repair is unpriced`);

  assert.equal(on.frontBad, 0,
    `the shipped floor left ${on.frontBad} frame(s) with the subject at or behind the lens plane — `
    + `worst depth ${on.worstDepth.toFixed(4)} m². The forward predicate is the one that removes `
    + 'the wrap, and a closed form that does not deliver it is a closed form with a wrong branch');
  assert.equal(on.rangeBad, 0,
    `the shipped floor left ${on.rangeBad} frame(s) with the lens closer than distHardMin to the `
    + `subject — worst ${on.worstRange.toFixed(4)} m against ${TUNE.distHardMin}`);

  console.log(`\n[camfloor] closed form on the RESULT, pole swing + stick down-left: pre-§640 `
    + `${off.frontBad}/${off.n} frames with the subject at or behind the lens plane (closest range `
    + `${off.worstRange.toFixed(3)} m) -> shipped 0/${on.n}, closest range ${on.worstRange.toFixed(3)} m, `
    + `least forward depth ${on.worstDepth.toFixed(3)} m²`);
});

test('camfloor: it hands length back into geometry, and that is the cost — priced, not assumed', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the shipped floor over the route set under four stick regimes, asked with the
   *               rig's OWN predicate for "the lens is inside something" — the overlap query
   *               `_castBoom` runs as its belt-and-braces check, `overlap(camPos, camRadius ×
   *               0.85, SOLID_TAGS)`. The floor overrides the occlusion cast, exactly as
   *               `distHardMin` already does, so it can only ever push the lens further into
   *               stone; the claim is that it does so by a margin inside the existing rate, not
   *               that it never does.
   *               §582.3's warning is carried forward: a first pass that looked only for `wall`
   *               and `ground` was blind to the case that mattered, because the geometry behind
   *               a `ledge` proxy has no wall collider of its own. `SOLID_TAGS` here is the
   *               shipped list with `ledge` and `pole` in it.
   * ran, fails  : `subjectFloor: 'frontspan'` — the same repair solved at feet, centre and head
   *               instead of at the centre, RUN: it removes the last wrap poses and puts the lens
   *               inside visible geometry on roughly a quarter of all frames. That is the reason
   *               the shipped value is the centre, and it is asserted here so the two cannot be
   *               confused again.
   * does NOT    : say the frames it does add are unnoticeable — that is a look question and
   * discriminate  belongs to frames; measure the near plane (0.10 m, and the boom floor is
   *               0.55); or cover a level whose geometry the world lane later moves.
   */
  const sticks = ['none', 'down', 'downleft', 'work'];
  const run = async (floor) => {
    const { engine, c, collision } = await realWorld();
    const keepGet = engine.get, keepCam = engine.camera, keepFloor = TUNE.subjectFloor;
    TUNE.subjectFloor = floor;
    const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
    engine.camera = cam;
    engine.get = (m) => (m === 'movement' ? c : m === 'collision' ? collision : keepGet(m));
    let inside = 0, n = 0;
    try {
      for (const st of sticks) {
        for (const r of forceRoutes(collision)) {
          hardReset(engine, c, r.start, r.yaw ?? Math.PI);
          engine.input.clear?.();
          if (!engine.input.look) engine.input.look = { x: 0, y: 0 };
          if (r.pre) r.pre(c, engine);
          const rig = new CameraRig(engine);
          rig.init?.(); rig.snap(true);
          for (let i = 0; i < (r.frames ?? 300); i++) {
            engine.input.beginFrame(DT);
            engine.input.move.x = 0; engine.input.move.y = 0;
            const lk = STICKS[st](i);
            engine.input.look.x = lk.x; engine.input.look.y = lk.y;
            const stop = r.script ? r.script(engine.input, i, c) : false;
            engine.time = i * DT; engine.dt = DT;
            c.update(DT, i * DT); rig.update(DT, i * DT);
            engine.events.length = 0;
            n++;
            const hits = collision.overlap(cam.position, TUNE.camRadius * 0.85, SOLID_TAGS);
            if (hits && hits.length) inside++;
            if (stop) break;
          }
          rig.dispose?.();
        }
      }
    } finally { engine.get = keepGet; engine.camera = keepCam; TUNE.subjectFloor = keepFloor; }
    return { rate: inside / n, inside, n };
  };

  const off = await run(false);
  const on = await run(TUNE.subjectFloor);
  const span = await run('frontspan');

  assert.ok(on.rate < off.rate + 0.01,
    `the floor put the lens inside solid geometry on ${(100 * on.rate).toFixed(2)} % of frames `
    + `against ${(100 * off.rate).toFixed(2)} % without it — more than a point of extra penetration `
    + 'is the pull-in being undone, which is the one thing this floor may not buy its smoothness with');
  assert.ok(span.rate > off.rate * 3,
    `the span-solved variant only reached ${(100 * span.rate).toFixed(2)} % against a `
    + `${(100 * off.rate).toFixed(2)} % baseline — the measurement that chose the centre does not `
    + 'reproduce, so "the centre is the cheap one" is currently unsupported');

  console.log(`[camfloor] lens inside solid geometry, ${sticks.length} stick regimes × ${on.n} frames: `
    + `pre-§640 ${(100 * off.rate).toFixed(2)} % -> shipped (centre) ${(100 * on.rate).toFixed(2)} % -> `
    + `'frontspan' ${(100 * span.rate).toFixed(2)} %. The span variant is why the shipped subject is `
    + 'the capsule centre.');
});

test('camfloor: where it does not bind it contributes no more than the harness can resolve', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the nave sprint with the stick worked, driven twice — floor off and floor on —
   *               and compared frame for frame against the SAME PAIR OF DRIVES REPEATED WITH THE
   *               TUNE UNCHANGED. The bar is not zero, it is this harness's own repeatability,
   *               and that is the whole point of the arm.
   *               **A draft asserted an exact zero and failed at 3.42e-6°.** The obvious reading
   *               was that the floor was doing something on a route where its own flag said it
   *               had not. The control says otherwise: two drives with IDENTICAL tune diverge by
   *               3.415e-6° on the same route, first differing at frame 5, with boom, pivot and
   *               the floor's own value bit-identical at that frame. The number is the harness's,
   *               not the mechanism's — a shared cached world driven twice in one process does
   *               not reproduce to the last bit — and an arm that had not run the same thing
   *               twice would have spent a long time chasing it (§439: an instrument compared
   *               only against itself cannot tell its own noise from a finding).
   * ran, fails  : the pole-swing take with the stick down-left, RUN: there the floor binds and
   *               the same comparison shows degrees, not millionths. Without that leg "the
   *               difference is at the noise floor" would be a fact about a route that never
   *               reaches the mechanism, which is a check true by accident.
   * does NOT    : prove the floor is inert in the level generally — 6.44 % of the battery's
   * discriminate  frames bind and this route is deliberately not one of them; establish that the
   *               harness noise is bounded on other routes; or cover a movement facade with no
   *               `height`, which falls back to `clampAnchorY` and is camstate's.
   */
  /* The nave sprint, stick worked. Chosen by MEASUREMENT rather than by looking like ordinary
     play: the floor binds zero times on it under `none`, `work` and `downleft` alike, which a
     courtyard run with jumps does not — that one binds on 35 of 300 frames and was this arm's
     first choice. "Ordinary-looking" and "does not reach the mechanism" are different properties
     and only one of them is checkable. */
  const RUN = { start: V(2.4, 0.1, -20), yaw: Math.PI, frames: 320,
    script: (i) => { i.move.y = 1; } };

  const spread = async (route, stick, tuneA, tuneB) => {
    const a = await driveForce({ ...route, stick, tune: tuneA });
    const b = await driveForce({ ...route, stick, tune: tuneB });
    const n = Math.min(a.rows.length, b.rows.length);
    let bound = 0, worstQ = 0, worstP = 0;
    for (let i = 0; i < n; i++) {
      if (b.rows[i].subjFloorOn) bound++;
      worstQ = Math.max(worstQ, a.rows[i].q.angleTo(b.rows[i].q) * DEG);
      worstP = Math.max(worstP, a.rows[i].pos.distanceTo(b.rows[i].pos));
    }
    return { bound, worstQ, worstP, n };
  };

  const OFF = { subjectFloor: false }, ON = { subjectFloor: TUNE.subjectFloor };
  /* The instrument's own repeatability, measured on the same route with nothing changed. */
  const noise = await spread(RUN, 'work', OFF, OFF);
  const quiet = await spread(RUN, 'work', OFF, ON);

  assert.equal(quiet.bound, 0,
    `the floor bound on ${quiet.bound} of ${quiet.n} frames of the nave sprint — this arm's whole `
    + 'point is a route where it does not, so the comparison below would be measuring something else');
  assert.ok(quiet.worstQ <= noise.worstQ,
    `with the floor never bound the pose moved ${quiet.worstQ.toExponential(2)}° against a same-tune `
    + `repeatability of ${noise.worstQ.toExponential(2)}° — the floor is doing something on frames `
    + 'its own flag says it did not touch');
  assert.ok(quiet.worstP <= Math.max(noise.worstP, 1e-9),
    `the camera position moved ${quiet.worstP.toExponential(2)} m against a same-tune `
    + `${noise.worstP.toExponential(2)} m with the floor never bound`);

  /* And the comparison can see a real change when there is one. */
  const loud = await spread(SWING, 'downleft', OFF, ON);
  assert.ok(loud.bound > 0 && loud.worstQ > 1,
    `the pole-swing take bound on ${loud.bound} frames and the poses differed by only `
    + `${loud.worstQ.toFixed(3)}° — if the mechanism cannot be made to show up, the bound above is `
    + 'a fact about the comparison and not about the floor');
  assert.ok(loud.worstQ > noise.worstQ * 1e4,
    `the binding route's ${loud.worstQ.toFixed(2)}° is not decisively above the harness noise `
    + `${noise.worstQ.toExponential(2)}° — the two legs are not separated`);

  console.log(`[camfloor] zero-cost: nave sprint + worked stick, ${quiet.n} frames, floor bound `
    + `${quiet.bound}; pose delta ${quiet.worstQ.toExponential(2)}° against a same-tune repeatability `
    + `of ${noise.worstQ.toExponential(2)}° — the floor is inside the harness's own noise, which is `
    + `NOT zero. Control — pole swing + stick down-left, bound ${loud.bound} frames, `
    + `${loud.worstQ.toFixed(1)}°.`);
});

test('camfloor: the pad is the sample — a held stick changes which mechanism is worst', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : the per-mechanism decomposition over the route set under every stick regime.
   *               The decomposition is exact rather than a model: `_write` builds the pose as
   *               `q_base · Rz(bank) · Rx(need) · S(shake)`, and pre- and post-multiplying by a
   *               fixed rotation both preserve the angle between two rotations, so freezing one
   *               factor at its previous-frame value gives that factor's exact contribution.
   *               `tools/camforce.mjs` carries its own falsifier for that (§439): it REBUILDS
   *               `q_base` from rig state and asserts the rebuild reproduces the shipped pose.
   *               The claim: the containment clamp owns the tail, and the follow spring — the
   *               obvious suspect for "the camera moves on its own" — contributes exactly 0° of
   *               view rotation, because the look-at and the lens both hang off the pivot and a
   *               pivot translation moves them together.
   * ran, fails  : `stick: 'none'`, which is what the whole 73-route battery in camstate uses. It
   *               reports 8 steps over 60°/frame; `downleft` on the same routes reports 26. RUN,
   *               both, and the spread is the finding — a battery that samples one stick state
   *               answers for one player.
   * does NOT    : rank the mechanisms by how they FEEL — a 0.9 %-of-frames event and a
   * discriminate  continuous 2°/frame drift are not comparable by count, and only frames decide;
   *               cover mouse input, whose per-frame `look` is unbounded where a stick's is
   *               capped at `padLook`/60; or attribute cancelling pairs, since one-at-a-time
   *               sensitivities do not sum to the total.
   */
  const { collision } = await realWorld();
  const routes = forceRoutes(collision).filter((r) => /pole swing|run \+ jumps|hook-ring debt$/.test(r.label));
  const bySt = new Map();
  let worstResid = 0, pivotWorst = 0;
  for (const st of ['none', 'downleft']) {
    const all = [];
    for (const r of routes) {
      const { rows } = await driveForce({ ...r, stick: st });
      const { steps, selfCheck } = attribute(rows);
      worstResid = Math.max(worstResid, selfCheck.worstResid);
      for (const s of steps) { all.push(s); pivotWorst = Math.max(pivotWorst, s.pivot); }
    }
    bySt.set(st, all);
  }

  /* THE INSTRUMENT FIRST (§439). If the rebuilt pose is not the shipped pose, nothing below is
     a measurement of this rig. */
  assert.ok(worstResid < 1e-3,
    `camforce's rebuilt pose differs from the shipped pose by ${worstResid.toExponential(2)}° — the `
    + 'decomposition is not describing this rig and every attribution below is void');

  /* The follow spring's contribution is ANALYTICALLY zero and MEASURABLY at the instrument's
     noise floor, and the difference matters. `angBetween` goes through `acos` near 1, where
     double precision buys about 1e-6 of a degree — the same 3.8e-6 the pose rebuild above
     reports. So the bar is the instrument's own residual and not a round number: the pivot term
     may not be larger than the error with which this tool can reproduce the shipped pose at all.
     A first draft asserted `=== 0` and failed at 3.8e-6, which would have been a true claim
     rejected by an instrument that cannot represent it. */
  assert.ok(pivotWorst <= Math.max(worstResid, 1e-5),
    `the follow spring contributed ${pivotWorst.toExponential(2)}° of view rotation against an `
    + `instrument noise floor of ${worstResid.toExponential(2)}° — it should be analytically zero: `
    + 'the look-at is pivot + headroom·ŷ and the lens is pivot + boom·d̂, so a pivot translation '
    + 'moves both by the same vector and cannot rotate the view');

  for (const [st, all] of bySt) {
    const cuts = all.filter((s) => s.total > 10);
    const clampLed = cuts.filter((s) => s.clamp >= Math.max(s.bank, s.boomStep, s.pitchStep, s.yawStep));
    assert.ok(cuts.length === 0 || clampLed.length * 2 > cuts.length,
      `with the stick ${st}, only ${clampLed.length} of ${cuts.length} steps over 10°/frame are led by `
      + 'the containment clamp — the attribution this lane acted on has stopped reproducing');
  }

  const none = bySt.get('none').filter((s) => s.total > 30).length;
  const dl = bySt.get('downleft').filter((s) => s.total > 30).length;
  assert.notEqual(none, dl,
    `both stick regimes report ${none} steps over 30°/frame — then the stick does not discriminate `
    + 'and this file\'s reason for existing is unsupported');

  console.log(`[camfloor] §440: same routes, steps over 30°/frame — stick at rest ${none}, stick held `
    + `down-left ${dl}. Follow-spring contribution to view rotation: ${pivotWorst.toExponential(1)}° (the instrument's floor). `
    + `camforce self-check ${worstResid.toExponential(2)}°.`);
});
