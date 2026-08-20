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
 *   B  the colossi tightrope       knee stance -> cross the sagging rail over the spawn approach
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

  /* ── B: the colossi tightrope, knee to knee ────────────────────────────────────────────── */
  hardReset(engine, c, V(-9.0, 5.5, 27.0), Math.PI);
  let onRail = false, maxX = -9;
  for (let i = 0; i < 900; i++) {
    step((inp) => {
      aim(9.0, 27.0);
      inp.move.y = 1;
      if (!onRail && i % 9 === 0) inp.hold('interact'); else inp.let_go('interact');
      inp.hold('sneak');
    });
    if (c.stateName === 'railWalk' || c.stateName === 'railSlide') onRail = true;
    maxX = Math.max(maxX, c.position.x);
    if (maxX > 4.5 && c.grounded) break;
    if (c.position.y < 3.0) break;       // fell off the rope
  }
  assert.ok(onRail, 'B: the tightrope was never entered (no railWalk/railSlide frame) from the knee stance');
  assert.ok(maxX > 4.5,
    `B: the crossing reached x ${maxX.toFixed(2)}; the far knee starts at x 6.1 and the rope is ` +
    'authored to be walkable knee to knee');

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

  console.log('[thiefspots] A rope top', topY.toFixed(2), '· B crossed to x', maxX.toFixed(2), '· C ring at', c.position.y.toFixed(2));
});
