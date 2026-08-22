import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';
import { ePressWinner } from '../src/player/Moveset.js';

/**
 * epress.test.mjs — §579's cross-tag chooser, and the two readers it was scoped not to touch.
 *
 * §576 measured the defect: `afford` is per-tag, `Collision.nearest` ranks only within a tag, and
 * so which affordance E took was decided by state poll order. Standing 2.41 m from a rope with the
 * camera on it, E took a hook 7.63 m away, and any hook inside `hookGrab` 9.0 deleted the pole's
 * E entry outright.
 *
 * §578 measured the blast radius and found three other readers of `afford` that must not move:
 * the telegraph (ranked by KIND, first non-null wins), the hook auto-grab fly-through, and
 * `Pickpocket`'s veto. The chooser is therefore consulted ONLY from the three `pressed('interact')`
 * clauses. **Arms T and A exist because a construction argument is not evidence** — they are the
 * whole reason the change was allowed to be scoped rather than refused.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROPE = [2.40, -33.20];        // §571
const RING2 = [-4.0, 6.70, -33.7];  // §575
const FORK = [0.0, -33.0];

/* The holds the telegraph marked on the hall floor at 49b90e6 — BEFORE the chooser existed. Any
   drift here is the telegraph moving, which is the thing this arm is for.
   KIND + POINT, and deliberately not `distance`: the mark's distance is measured from the eye and
   so is a fact about where the probe happens to settle, not about which hold was chosen. The
   first draft asserted it and failed by 0.28 m purely because this arm settles for 70 frames and
   the original scratch measurement did not — a difference in the instrument, not in the subject.
   The pair (kind, point) IS the hold's identity, which is the claim being made. */
const TELE_BEFORE = [
  { at: [0, -25], look: [0, -60], kind: 'hook', point: [-3.4, 6.65, -27.0] },
  { at: [0, -33], look: [0, -60], kind: 'hook', point: [-4.0, 6.70, -33.7] },
  { at: [0, -40], look: [0, -60], kind: 'hook', point: [-2.0, 6.60, -40.8] },
  { at: [0, -47], look: [0, -60], kind: 'hook', point: [0.6, 6.70, -47.6] },
  { at: [0, -33], look: ROPE, kind: 'hook', point: [-3.4, 6.65, -27.0] },
];

async function harness() {
  const { engine, collision, c } = await realWorld();
  const marks = [];
  /* Subscribe, rather than scraping `engine.events`: the queue is drained per frame and the
     telegraph is delivered through the bus. Reading only the queue caught nothing and the first
     draft of arm T read that as "the telegraph stopped marking". */
  engine.on?.('telegraph', (p) => marks.push(p));
  const step = (s) => {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    s?.(engine.input); engine.time += DT; c.update(DT, engine.time);
    for (const e of engine.events || []) if (e?.type === 'telegraph') marks.push(e.data ?? e.payload);
    engine.events.length = 0;
  };
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const settle = (x, z) => {
    const g = collision.groundCheck(V(x, 3, z), TUNE.radius, 10);
    hardReset(engine, c, V(x, (g?.hit ? g.y : 0) + 0.35, z), Math.PI);
    for (let i = 0; i < 70; i++) step();
    return c.grounded;
  };
  return { engine, collision, c, step, aim, settle, marks };
}

/* ====================================================================================== */
test('epress T: the telegraph marks exactly what it marked before the chooser existed', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped tree — five driven stances, each marking the same kind and the same
   *             point, to the centimetre, as measured at 49b90e6 before §579.
   * fails  on : RUN IN-ARM — at the fork stance facing the rope the telegraph's kind and
   *             `ePressWinner`'s answer must DISAGREE ('hook' vs 'pole'). If someone ever routes
   *             the telegraph through the chooser they will agree, and this arm goes red. That
   *             disagreement IS the evidence of separation; a table of marks alone would still
   *             pass if both were wired together and happened to match.
   * does NOT  : approve of what the telegraph marks. `TELEGRAPH_KINDS` has no `pole` in it, so
   * discrim.    §571's rope is never marked and §575's rings now are — a live behaviour change
   *             sitting under review-sheet items 4 and 10, untouched here by instruction.
   */
  const { c, step, aim, settle, marks } = await harness();

  /* The telegraph is EDGE-TRIGGERED on the identity of the hold (`_teleRec`/`_teleKind`), so it
     emits only when the mark changes. Listening after a 70-frame settle catches nothing at all —
     the settle already consumed the emission — and the first draft of this arm read that silence
     as "no mark". Clear the log before settling AND invalidate the cached identity, so the next
     evaluation is guaranteed to re-emit whatever the current mark is. */
  const markAt = (at, look) => {
    marks.length = 0;
    settle(at[0], at[1]);
    c._teleRec = undefined; c._teleKind = undefined;
    for (let i = 0; i < 80; i++) { aim(look[0], look[1]); step(() => {}); }
    return marks.length ? marks[marks.length - 1] : null;
  };

  const bad = [];
  for (const row of TELE_BEFORE) {
    const m = markAt(row.at, row.look);
    if (!m) { bad.push(`(${row.at}) looking at (${row.look}): no mark at all, expected ${row.kind}`); continue; }
    if (m.kind !== row.kind) { bad.push(`(${row.at}): kind ${m.kind}, expected ${row.kind}`); continue; }
    const want = V(...row.point);
    if (m.point.distanceTo(want) > 0.01) {
      bad.push(`(${row.at}): marked (${m.point.x.toFixed(2)}, ${m.point.y.toFixed(2)}, ${m.point.z.toFixed(2)}), expected (${row.point})`);
    }
  }
  assert.deepEqual(bad, [],
    `the telegraph moved under §579's chooser. It reads \`afford\` per KIND and must not consult the `
    + `chooser at all:\n  ${bad.join('\n  ')}`);

  /* the failing input: telegraph and chooser must be able to disagree */
  const m = markAt(FORK, ROPE);
  const winner = ePressWinner(c);
  assert.equal(m?.kind, 'hook', 'the telegraph no longer marks a hook at the fork stance');
  assert.equal(winner, 'pole',
    `at the fork stance facing the rope, ePressWinner returned ${winner} — expected 'pole'. If this `
    + 'is now "hook" the chooser stopped following aim; if the telegraph agrees with it, the two '
    + 'have been wired together and the separation this arm proves is gone');
  console.log(`[epress T] ${TELE_BEFORE.length}/${TELE_BEFORE.length} telegraph marks unchanged · `
    + `at the fork the telegraph says ${m.kind} and the chooser says ${winner} — separate, as designed`);
});

/* ====================================================================================== */
test('epress A: the hook fly-through still auto-grabs, including with E held down', async () => {
  /* THE REGRESSION THIS ARM CAUGHT, and it caught it for real. The chooser was first wired into
   * `HookSwing.canEnter`'s existing early return — `if (pressed) return dist <= hookGrab && …` —
   * so a press that resolved to another tag returned FALSE and never reached the `hookAuto`
   * clause below it. An E press could then SUPPRESS the fly-through grab that
   * `Controller.js:1417` exists to protect. `reachcensus` C failed on the first courtyard hop
   * (the east mast stands 0.83 m off ring 0 and wins the press). The clause now falls through.
   *
   * DOMAIN (§418.3)
   * passes on : a driven fly-through past a courtyard ring catching by `hookAuto`, both with no
   *             input at all and with E held on every frame.
   * fails  on : RUN IN-ARM — the same flight aimed to pass outside `hookAuto` of any ring, which
   *             must NOT catch. Without it "it caught" is indistinguishable from "it grabs
   *             whatever, whenever".
   * does NOT  : test the release side of a chain — that is `reachcensus` C's eight hops.
   */
  const { c, step } = await harness();

  /* A real flight, not a standing start: begin 5 m short of the hang point — outside `hookAuto`
     2.9, so frame 0 cannot catch — and throw the capsule through it. */
  const fly = (ring, holdE, drop = 0) => {
    const hang = V(ring[0], ring[1] - TUNE.hookL + drop, ring[2]);
    const from = hang.clone().add(V(3.2, 0.4, 3.2));
    hardReset(c.engine ?? undefined, c, from, 0);
    c.grounded = false;
    /* BALLISTIC, not "point at it and go": a straight-line launch at 9 m/s over 7 m spends 0.8 s
       in flight and gravity eats 8 m of it, so the first draft simply fell on the courtyard and
       reported "no auto-grab". Solve for the arc that actually arrives — v0 = d/t + ½gt. */
    const d = hang.clone().sub(from);
    const t = d.length() / 11.0;
    c.velocity.copy(d).multiplyScalar(1 / t).add(V(0, 0.5 * 24 * t, 0));
    assert.ok(from.distanceTo(hang) > TUNE.hookAuto,
      'the flight starts inside hookAuto, so a catch would prove nothing about flying through');
    for (let i = 0; i < 60; i++) {
      step((inp) => { if (holdE) inp.hold('interact'); else inp.let_go('interact'); });
      if (c.stateName === 'hookSwing') return { caught: true, i };
    }
    return { caught: false, st: c.stateName };
  };

  const RING = [20.0, 14.9, 27.0];                 // courtyard main-0
  const near = fly(RING, false);
  assert.ok(near.caught, `the fly-through did not auto-grab with no input at all (ended ${near.st})`);
  const withE = fly(RING, true);
  assert.ok(withE.caught,
    `the fly-through did NOT auto-grab while E was held (ended ${withE.st}). That is §579's own `
    + 'regression: an E press resolving to another tag must fall through to the hookAuto clause, '
    + 'never return false out of canEnter. A press must not be able to take a grab away');

  /* THE EXACT REGRESSION, reproduced rather than described. At ring 0's hang point the east mast
     stands 0.83 m away and WINS the press (measured scores: pole 16.21, hook 24.20), so this is
     the case where the chooser answers "not hook" while an E press is live. The auto clause must
     still fire. On the early-return version this returned false and the ring was unreachable. */
  hardReset(c.engine ?? undefined, c, V(20.0, 14.9 - TUNE.hookL, 27.0), 0);
  c.grounded = false; c.velocity.set(0, 0, 0);
  let winnerSeen = null, gotHook = false;
  for (let i = 0; i < 20; i++) {
    step((inp) => { inp.hold('interact'); });
    if (winnerSeen === null) winnerSeen = ePressWinner(c);
    if (c.stateName === 'hookSwing') { gotHook = true; break; }
  }
  assert.ok(gotHook,
    `holding E at ring 0's hang point did not reach hookSwing (ended ${c.stateName}). The chooser `
    + `answers "${winnerSeen}" there because the mast is nearer, and that answer must fall through `
    + 'to the hookAuto clause instead of returning false out of canEnter');

  /* failing input: out past hookAuto of everything, nothing may catch */
  const far = fly(RING, true, -14.0);
  assert.ok(!far.caught,
    `a flight aimed 14.0 m below the ring still "auto-grabbed" (state ${c.stateName}); this `
    + 'arm cannot tell a catch from a coincidence');
  console.log(`[epress A] fly-through catches at frame ${near.i} with no input and frame ${withE.i} `
    + 'with E held; the out-of-range control does not catch');
});

/* ====================================================================================== */
test('epress W: E follows aim across tags, and stays a weight rather than a filter', async () => {
  /* DOMAIN (§418.3)
   * passes on : the fork stance — camera on the rope resolves to `pole`, camera on the ring to
   *             `hook`, from one settled position with one press.
   * fails  on : RUN IN-ARM — a stance where only ONE affordance is eligible must resolve to it
   *             from EVERY facing including straight away from it. That is condition 3: the
   *             penalty orders competitors, it never removes a lone option. A filter would make
   *             the away-facing case return null and this assertion go red.
   * does NOT  : change `Pickpocket`'s veto, which reads `afford` directly and is asserted
   * discrim.    unchanged by the suite's own pickpocket arms rather than re-tested here.
   */
  const { c, step, aim, settle } = await harness();

  const pressAt = (x, z, tx, tz) => {
    settle(x, z);
    for (let i = 0; i < 90; i++) {
      step((inp) => { aim(tx, tz); if (i === 5) inp.hold('interact'); else inp.let_go('interact'); });
      if (c.stateName === 'hookSwing' || c.stateName === 'poleClimb') return c.stateName;
    }
    return c.stateName;
  };
  assert.equal(pressAt(FORK[0], FORK[1], ROPE[0], ROPE[1]), 'poleClimb',
    'E with the camera on the rope did not take the rope — the whole point of §579');
  assert.equal(pressAt(FORK[0], FORK[1], RING2[0], RING2[2]), 'hookSwing',
    'E with the camera on the ring did not take the ring');

  /* weight, not filter: a lone affordance must win from any angle, including facing away */
  const lone = [];
  for (const [tx, tz] of [[2.4, -20.0], [2.4, -46.0], [40, -20], [-40, -46]]) {
    settle(0, -33);
    const winner = (() => {
      for (let i = 0; i < 20; i++) { aim(tx, tz); step(() => {}); }
      return ePressWinner(c);
    })();
    lone.push(`${winner}`);
  }
  assert.ok(lone.every((w) => w === 'pole' || w === 'hook'),
    `from some facings the chooser resolved to nothing at all (${lone.join(', ')}). The facing term `
    + 'is a WEIGHT and must only order candidates — if it can return null for an in-range affordance '
    + 'it has become a cone cutoff, which is the behaviour Collision.nearest\'s docblock rejects');
  console.log(`[epress W] rope-facing -> poleClimb, ring-facing -> hookSwing; four facings all still `
    + `resolve to something (${lone.join(', ')})`);
});
