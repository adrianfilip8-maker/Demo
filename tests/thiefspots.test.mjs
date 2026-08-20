import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * §495's optional thief lines, driven — a probe is a hypothesis, a drive is evidence.
 *
 * One batch arm for all three spots (the census pattern), each completed by scripted input from
 * a standable start, none by teleport-past-the-hard-part:
 *
 *   A  the obelisk climbing rope   jump-grab from the kiosk lintel -> poleClimb -> top ~20.4
 *                                  (preserves the §8.1 step-2 alternative through the §494 gate;
 *                                  bottom 9.6 by design — a plinth walk-on trapped the retreat)
 *   B  the colossi tightrope       buttonless walk-on from EITHER knee -> cross -> arrive
 *                                  STANDING on the far side (§497: three legs — both walk-ons,
 *                                  plus the fast off-end fling into the shin deflector)
 *   C  the SE drainpipe            paving walk-on -> poleClimb -> top-hop onto the y 9.0 ring
 *
 * DOMAIN (§418.3)
 * passes on : the shipped placements, driven end to end below.
 * fails  on : any of the three moving, thickening past the §494 contract (asserted in-arm:
 *             every pole this section added is r <= 0.5), or a level change that strands the
 *             start stances — the starts are MEASURED surfaces, not authored coordinates.
 * does NOT  : test the §494 gate itself (controller lane's); guards or any system (out of
 * discrim.    scope); or the beats' difficulty. It also cannot see art — a proxy with no
 *             visible rope would pass, which is the standing art/collision seam this project
 *             audits elsewhere.
 *
 * WHAT THE FIRST VERSION COULD NOT SEE (§418.3's third line, kept as a warning): its B leg
 * drove an E-press entry (the interact taps were load-bearing, not decoration) and certified
 * the crossing on `maxX > 4.5` with a break on `grounded` — so it went green on a run whose
 * rider was flung off the far end into the colossus's shin and STOPPED there, at the very
 * x 8.31 the assertion quoted as success. The camera lane's photographs (`shots/thief1-*`,
 * §497) found what the number hid: the buttonless walk-on did not exist, `railWalk` was
 * structurally unreachable, and the fast arrival wedged airborne at (8.33, 4.77) until the
 * §504 watchdog respawned it. The B leg below asserts what that green never did: the entry a
 * player walks, the balance state, WHERE the crossing ends, and that nothing holds a capsule
 * in the air on the way.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('thiefspots: the three §495 lines complete from standable starts, and the new poles honour the §494 contract', async () => {
  const { engine, c, collision } = await realWorld();
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (script) => {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script(engine.input);
    engine.time = 0; c.update(DT, 0);
    engine.events.length = 0;
  };

  /* ── the §494 contract, on the data this level ships ───────────────────────────────────── */
  const POLE_GIRTH_MAX = 0.5;              // §494: band (0.40, 0.85); the recommended constant
  const newPoles = [];
  for (const r of collision.recs) {
    if (r.tag !== 'pole' || !r.mesh) continue;
    const gp = r.mesh.geometry?.parameters;
    const radius = gp?.radiusTop ?? gp?.radius ?? 99;
    const p = r.mesh.position;
    if ((Math.abs(p.x - 0) < 0.2 && Math.abs(p.z - 13.0) < 0.2) ||
        (Math.abs(p.x - 21.35) < 0.2 && Math.abs(p.z + 2.0) < 0.2)) newPoles.push({ p, radius });
  }
  assert.equal(newPoles.length, 2, `expected the rope and the pipe among the pole recs, found ${newPoles.length}`);
  for (const n of newPoles) {
    assert.ok(n.radius <= POLE_GIRTH_MAX,
      `a §495 pole at (${n.p.x}, ${n.p.z}) has r ${n.radius} > ${POLE_GIRTH_MAX} — it would be refused ` +
      'by the very gate it was authored to pass');
  }

  /* ── A: the obelisk rope — a deliberate JUMP-grab from the kiosk lintel, then the climb.
     The bottom is 9.6 by design (a plinth walk-on mount trapped the §489 retreat — see the
     authoring comment), so the mount is airborne: jump from the lintel's inner edge toward the
     axis and press grab. ── */
  hardReset(engine, c, V(2.3, 9.02, 13.0), Math.PI);
  let topY = 0, mounted = false;
  for (let t = 0; t < 6 && !mounted; t++) {
    for (let i = 0; i < 90; i++) {
      step((inp) => {
        aim(0, 13.0); inp.move.y = 1;
        if (i >= 4 && i < 18) inp.hold('jump'); else inp.let_go('jump');
        if (i > 6 && i % 5 === 0) inp.hold('interact'); else inp.let_go('interact');
      });
      if (c.stateName === 'poleClimb') { mounted = true; break; }
    }
    if (!mounted) {                                     // fell to the plinth: climb back to the lintel
      for (let i = 0; i < 260 && !(c.grounded && c.position.y > 8.6); i++)
        step((inp) => { aim(2.6, 13.6); inp.move.y = 1; if (i % 30 < 14) inp.hold('jump'); else inp.let_go('jump'); });
    }
  }
  for (let i = 0; i < 700 && mounted; i++) {
    step((inp) => { inp.move.y = 1; inp.let_go('interact'); inp.let_go('jump'); });
    topY = Math.max(topY, c.position.y);
    if (c.position.y > 19.6) break;
  }
  assert.ok(mounted, 'A: the jump-grab from the kiosk lintel never entered poleClimb on the rope');
  assert.ok(topY > 19.6,
    `A: the rope climb reached y ${topY.toFixed(2)}; the top is authored at 20.4 so the §8.1 ` +
    'step-2 alternative (and level.test §5\'s premise) no longer carries through the gate');

  /* ── B: the colossi tightrope — both walk-ons, then the fling the deflector must shed ────
     Three legs, no interact anywhere: the entry under test is the one a player WALKS (§497).
     Each leg tracks the longest airborne stand-still, because the defect this replaces was a
     capsule held in the air (fall, |v| ~ 0, gr false) for the §504 watchdog to throw away. */
  const bLeg = (name, start, tx, { sneak, wantWalk, emash }) => {
    hardReset(engine, c, start, Math.PI);
    for (let i = 0; i < 25; i++) step(() => {});          // settle: the start is a stance, not a mount
    assert.ok(c.grounded, `${name}: the start stance did not settle grounded (y ${c.position.y.toFixed(2)})`);
    let onRail = false, sawWalk = false, arrived = -1, airHold = 0, maxAirHold = 0;
    let gndHold = 0, maxGndHold = 0, gndAt = '';
    for (let i = 0; i < 1400; i++) {
      step((inp) => {
        aim(tx, 27.0); inp.move.y = 1; if (sneak) inp.hold('sneak');
        if (emash && !onRail && i % 9 === 0) inp.hold('interact'); else inp.let_go('interact');
      });
      const onR = c.stateName === 'railWalk' || c.stateName === 'railSlide';
      onRail = onRail || onR;
      sawWalk = sawWalk || c.stateName === 'railWalk';
      const spXZ = Math.hypot(c.velocity.x, c.velocity.z);
      if (!onR && !c.grounded && spXZ < 0.05 && Math.abs(c.velocity.y) < 0.5) airHold++; else airHold = 0;
      maxAirHold = Math.max(maxAirHold, airHold);
      /* §498's pocket was the GROUNDED twin of the §497 wedge: tiptoe, wiggling centimetres,
         invisible to both watchdogs by design. Held forward must never stand still this long. */
      if (!onR && c.grounded && spXZ < 0.35) {
        gndHold++;
        if (gndHold > maxGndHold) { maxGndHold = gndHold; gndAt = `(${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)})`; }
      } else gndHold = 0;
      const past = tx > 0 ? c.position.x > 6.2 : c.position.x < -6.2;
      if (onRail && past && c.grounded && arrived < 0) { arrived = i; break; }
      assert.ok(!(c.position.z > 29.5 && Math.abs(c.position.x) < 1.5),
        `${name}: respawned to spawn mid-leg — the §504 watchdog fired, so something held the capsule`);
      if (c.position.y < 3.0) break;                       // off the rope into the courtyard: a miss, not a trap
    }
    assert.ok(maxGndHold < 150,
      `${name}: held-forward stood still GROUNDED for ${maxGndHold} frames at ${gndAt} — the §498 crouch `
      + 'pocket class (§473.3: pinned 1347 frames beside the west anchor stone, exempt from both '
      + 'watchdogs because grounded and wiggling) is holding a walker again');
    const p = c.position;
    assert.ok(onRail, `${name}: the buttonless walk-on never mounted — the from-above catch does not `
      + 'cover where the knee walk-off arrives (§497 re-hung the rope precisely so it does)');
    if (wantWalk) {
      assert.ok(sawWalk, `${name}: railWalk never happened — the crossing stayed a slide, so the balance `
        + 'beat this rope was authored to be is still unreachable (mountSpeed 0 not in effect?)');
    }
    assert.ok(arrived >= 0,
      `${name}: never ARRIVED standing on the far side (end (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), `
      + `gr=${c.grounded}) — the old arm certified exactly this non-arrival and the §497 frames show where it ends`);
    assert.ok(Math.abs(p.y - 4.5) < 1.2,
      `${name}: arrival height ${p.y.toFixed(2)} is not the knee shelf band (4.4..5.6 covers floor and shin-top)`);
    assert.ok(maxAirHold < 45,
      `${name}: the capsule stood still in the AIR for ${maxAirHold} frames — the shin pocket (§497, T2's `
      + 'wedge at (8.33, 4.77)) is holding again instead of admitting or deflecting');
    return p.x;
  };
  const bWE = bLeg('B-walkonWE', V(-7.9, 4.72, 27.0), 9.0, { sneak: true, wantWalk: false });
  const bEW = bLeg('B-walkonEW', V(7.9, 4.72, 27.0), -9.0, { sneak: true, wantWalk: true });
  /* The fling: RUN in, ride the slide off the far end at speed, into the deflector face.
     The leg's whole point is the maxAirHold and watchdog assertions inside bLeg. */
  const bFling = bLeg('B-fling', V(-7.9, 4.72, 27.0), 9.0, { sneak: false, wantWalk: false });
  /* §498: the camera lane's fourth take, verbatim — sneak + E every 9 frames from the west
     stance. Pre-fill this drive drifted south of the stone in the live browser and pinned in the
     crouch pocket at (−7.01, 4.77, 26.52) for 1347 frames (§473.3). The headless driver does not
     reproduce that drift (measured: it completes even with the fills ablated), so the take alone
     is NOT the pocket's certification — the placed-and-held legs below are. */
  const bMash = bLeg('B-emash', V(-9.0, 5.5, 27.0), 9.0, { sneak: true, wantWalk: false, emash: true });
  /* The pocket itself, entered the way it actually holds: DYNAMICALLY. A capsule placed at
     §473.3's coordinates settles clear and walks out, and a straight-line drive never drifts
     into it — the pin needs the wedge-in-motion (pressed under the kneecap overhang against the
     stone's corner). So this probe drives INTO each slot deliberately, then switches to the
     exact input that pinned the fourth take — held toward the rope — and asserts it MOVES.
     Ablation-measured, both sides: fills removed, the wedge lands at (±6.83, 4.84, 26.36) and
     the held input moves 0.01 m (§473.3's 1347-frame pin, reproduced); fills in, the same drive
     stands at the anchor stone and the held input moves ~9.3 m — onto the rope, in `railWalk`,
     to mid-span. The pinned input now completes the beat it was trying for. */
  for (const [nm, sx] of [['pocketW', -1], ['pocketE', 1]]) {
    hardReset(engine, c, V(sx * 6.9, 4.95, 27.2), Math.PI);
    for (let i = 0; i < 20; i++) step(() => {});
    for (let i = 0; i < 150; i++) step((inp) => { aim(sx * 7.9, 25.4); inp.move.y = 1; inp.hold('sneak'); });
    const w = c.position.clone();
    let moved = 0;
    for (let i = 0; i < 240; i++) {
      step((inp) => { aim(sx * -9.0, 27.0); inp.move.y = 1; });
      moved = Math.max(moved, Math.hypot(c.position.x - w.x, c.position.z - w.z));
    }
    assert.ok(moved > 1.0,
      `B-${nm}: after wedging into the slot at (${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)}), `
      + `held-toward-the-rope moved only ${moved.toFixed(2)} m — the §498 crouch pocket is holding a `
      + 'grounded walker again (both watchdogs exempt it by design, so geometry is the only net)');
  }

  /* ── C: the drainpipe, paving to the y 9.0 ring ────────────────────────────────────────── */
  hardReset(engine, c, V(19.8, 0.02, -2.0), Math.PI);
  let cMounted = false, arrived = false;
  for (let i = 0; i < 900; i++) {
    step((inp) => {
      if (c.stateName !== 'poleClimb' && !cMounted) { aim(21.35, -2.0); inp.move.y = 1; if (i % 8 === 0) inp.hold('interact'); else inp.let_go('interact'); }
      else if (c.stateName === 'poleClimb') {
        cMounted = true;
        if (c.position.y < 9.35) { inp.move.y = 1; }                       // climb
        else { aim(22.6, -2.0); inp.move.y = 1; inp.hold('jump'); }        // top hop east onto the ring
      } else { aim(22.6, -2.0); inp.move.y = 1; inp.let_go('jump'); }      // steer the hop
    });
    if (cMounted && c.grounded && c.position.y > 8.6 && c.position.x > 21.7) { arrived = true; break; }
  }
  assert.ok(cMounted, 'C: walking into the drainpipe from the paving never entered poleClimb');
  assert.ok(arrived,
    `C: the pipe climb ended at (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ` +
    `${c.position.z.toFixed(2)}) ${c.stateName} — the top-hop onto the y 9.0 architrave ring did not land`);

  console.log('[thiefspots] A rope top', topY.toFixed(2),
    `· B arrivals WE x ${bWE.toFixed(2)} / EW x ${bEW.toFixed(2)} / fling x ${bFling.toFixed(2)} / emash x ${bMash.toFixed(2)}`,
    '· C ring at', c.position.y.toFixed(2));
});
