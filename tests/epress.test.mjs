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

/* ====================================================================================== */
test('epress K: the kiosk beat still grabs the ring, and metres alone would take the rope', async () => {
  /* §8.1 step 3 is an authored beat: from the kiosk lintel, E onto the hook chain. The lintel
   * stance also stands 2.36 m from the obelisk rope, so it is exactly the case where cross-tag
   * resolution decides a ROUTE rather than a preference — and the first version of §579 got it
   * wrong, scoring in metres and handing the press to the rope. `camclamp` caught it (the camera
   * lane's file, which is why the guard belongs here too).
   *
   * The repair is to score distance as a FRACTION OF EACH TAG'S OWN GATE. The gates are the
   * moveset's own statement of how far away a hold is meant to be taken from, so the ratio asks
   * "how deep inside its own envelope is this" instead of comparing metres across kinds that do
   * not mean the same thing by them.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped scoring — at the lintel the ring wins the press (ratio 0.659 against
   *             the rope's 0.925) and a driven E enters `hookSwing`.
   * fails  on : RUN IN-ARM — the same two candidates scored in RAW METRES, where the rope wins
   *             (2.64 against 5.93). That is the exact regression, recomputed from the live
   *             numbers rather than quoted, so it cannot rot into a comment.
   * does NOT  : assert the rest of the debt sequence — the swing, the bail, the transfer and the
   * discrim.    containment are `camclamp`'s, and this arm only guards which affordance the
   *             press means at its first frame.
   */
  const { engine, c, step } = await harness();
  hardReset(engine, c, V(2.3, 9.02, 13.55), Math.PI);
  for (let i = 0; i < 40; i++) step(() => {});
  assert.ok(c.grounded, `the kiosk lintel stance did not settle (y ${c.position.y.toFixed(2)})`);

  const dx = -0.34 - c.position.x, dz = 11.36 - c.position.z;
  engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
  step(() => {});

  const fwd = new THREE.Vector3();
  engine.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const GATE = { hook: TUNE.hookGrab, pole: TUNE.poleMount * 1.5 };
  const scored = {};
  for (const tag of ['hook', 'pole']) {
    const a = c.afford(tag);
    assert.ok(a, `no ${tag} in range of the kiosk lintel — this arm's premise is gone`);
    const pen = c.col.facingPenalty(a.point.x - c.position.x, a.point.y - (c.position.y + 1.15),
      a.point.z - c.position.z, a.distance, fwd, Math.PI / 2);
    scored[tag] = { d: a.distance, metres: a.distance * pen, ratio: (a.distance / GATE[tag]) * pen };
  }
  assert.equal(ePressWinner(c), 'hook',
    `the kiosk lintel press resolves to ${ePressWinner(c)}, not the ring. §8.1 step 3's E-grab onto `
    + 'the hook chain is an authored beat and this is where it is decided');
  assert.ok(scored.hook.ratio < scored.pole.ratio,
    `gate-fraction scoring puts the ring at ${scored.hook.ratio.toFixed(3)} and the rope at `
    + `${scored.pole.ratio.toFixed(3)} — the ring must be the smaller`);
  /* the failing input, recomputed live: metres alone hand the beat to the rope */
  assert.ok(scored.pole.metres < scored.hook.metres,
    `scored in RAW METRES the rope is ${scored.pole.metres.toFixed(2)} and the ring `
    + `${scored.hook.metres.toFixed(2)}. This arm exists because the rope used to win that way; if it `
    + 'no longer does, the geometry moved and the regression this guards is no longer reachable — '
    + 're-read before trusting the arm');

  /* and drive it, because a score is not a state */
  let got = null;
  for (let i = 0; i < 60 && !got; i++) {
    step((inp) => { if (i === 5) inp.hold('interact'); else inp.let_go('interact'); });
    if (c.stateName === 'hookSwing' || c.stateName === 'poleClimb') got = c.stateName;
  }
  assert.equal(got, 'hookSwing',
    `driven, the kiosk press entered ${got}. The beat takes the ring, not the obelisk rope`);
  console.log(`[epress K] kiosk lintel: ring ratio ${scored.hook.ratio.toFixed(3)} beats rope `
    + `${scored.pole.ratio.toFixed(3)}; in metres the rope would win `
    + `(${scored.pole.metres.toFixed(2)} vs ${scored.hook.metres.toFixed(2)}) · driven -> ${got}`);
});

/* ====================================================================================== */
test('epress R: RATCHET — every stance offering two KINDS can select either by aim', async () => {
  /* ── A ratchet on a PROPERTY, not on a current value (§584). ──────────────────────────────
   * The count of such stances is content and must stay free to move — §575 took it from 0 to 6
   * and the next level change may take it anywhere. What must never regress is the property:
   * wherever two different affordance KINDS are inside their gates at once, the player must be
   * able to have either one. A stance that fails this is §576 returning — the branch-factor
   * metric reads 2 and the game plays 1 — and it is a defect however few stances there are.
   *
   * So the bar is a ratio pinned at 100%, and the count is printed beside it as the histogram.
   * Improvement is MORE stances at 100%, never a lower ratio.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped hall — every mixed-kind stance found on a 0.5 m sweep of the nave
   *             resolves to a different tag when aimed at each of its candidates.
   * fails  on : RUN IN-ARM — the same sweep with aim held FIXED instead of pointed at each
   *             candidate, which must collapse to one answer everywhere. Without that, "aiming
   *             selects" is indistinguishable from "the answer varies for some other reason".
   * does NOT  : assert how MANY such stances exist, or that they are good ones.
   * discrim.
   */
  const { engine, collision, c, step, settle } = await harness();

  const GATES = [
    ['pole', 0.95, TUNE.poleMount * 1.5],
    ['rail', 0.55, TUNE.railMount * 1.6],
    ['hook', 1.15, TUNE.hookGrab],
  ];
  const lookAt = (p) => {
    const dx = p.x - c.position.x, dz = p.z - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  /* find the mixed-kind stances on the nave centre line */
  const stances = [];
  for (let z = -20; z >= -51; z -= 0.5) {
    const g = collision.groundCheck(V(0, 3, z), TUNE.radius, 8);
    const feet = V(0, g?.hit ? g.y : 0, z);
    const recs = new Set();
    for (const [tag, eye, range] of GATES) {
      for (const h of collision.query(V(feet.x, feet.y + eye, feet.z), range, [tag]) || []) if (h.rec) recs.add(h.rec);
    }
    if (new Set([...recs].map((r) => r.tag)).size >= 2) stances.push({ z, recs: [...recs] });
  }
  assert.ok(stances.length > 0,
    'no stance on the nave floor offers two different affordance kinds, so this ratchet has nothing '
    + 'to protect — the level has lost its only fork');

  const pointOf = (rec) => {
    const o = rec.object || rec.mesh; if (!o) return null;
    o.geometry?.computeBoundingSphere?.();
    const s = o.geometry?.boundingSphere; if (!s) return null;
    return s.center.clone().applyMatrix4(o.matrixWorld);
  };
  const winnersAt = (st, fixedAim) => {
    const out = new Set();
    for (const rec of st.recs) {
      const p = pointOf(rec); if (!p) continue;
      settle(0, st.z);
      for (let i = 0; i < 20; i++) { lookAt(fixedAim || p); step(() => {}); }
      const w = ePressWinner(c);
      if (w) out.add(w);
    }
    return out;
  };

  const failed = [];
  for (const st of stances) {
    if (winnersAt(st).size < 2) failed.push(`z ${st.z.toFixed(1)}`);
  }
  assert.deepEqual(failed, [],
    `${failed.length} of ${stances.length} mixed-kind stances cannot select both options by aim `
    + `(${failed.join(', ')}). Two affordances in range that resolve to the same one is §576's defect: `
    + 'the metric reads 2 and the game plays 1');

  /* the failing input: hold aim FIXED and selection must collapse */
  const fixed = V(0, 0, -80);
  const varied = stances.filter((st) => winnersAt(st, fixed).size >= 2);
  assert.equal(varied.length, 0,
    `${varied.length} stances still produced two different winners with the camera held FIXED, so this `
    + 'arm is not measuring aim at all and the result above means nothing');
  console.log(`[epress R] ${stances.length}/${stances.length} mixed-kind stances select either option by `
    + `aim (100%, the bar) · fixed-aim control produced two winners at ${varied.length} of them`);
});
