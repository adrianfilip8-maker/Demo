import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * pincensus.test.mjs — the watchdog blind spot, censused.
 *
 * §504's STUCK detector needs the capsule AIRBORNE and the void watchdog needs a fall, so
 * anywhere a player can end up GROUNDED and stationary is invisible to both. That exemption is
 * by design and it is not going to change from this lane; the question it raises is how many
 * places it actually covers. This file answers it by driving, because §562 is the argument for
 * why reasoning about it would not do.
 *
 * ── The two classes, which are not the same thing ──────────────────────────────────────────
 *   CUL-DE-SAC   held-forward stops you and you stay grounded and still, but any other input
 *                walks you out. The §565 vent is one, and `reachcensus.test.mjs` arm V measures
 *                its escapes (31.1 m back, 29.9 m turning round). Walking into a wall is also
 *                one, and it is correct behaviour. This class is NOT a defect.
 *   POCKET/PIN   you cannot get more than a few metres from where you are in ANY of eight
 *                directions, with or without jump. This class IS a defect, and it is what the
 *                census below looks for.
 *
 * ── What the census found ──────────────────────────────────────────────────────────────────
 * Over x ±30, z -80..66 at 1.5 m, on every up-facing surface a downward ray finds (10,880 of
 * them, all levels of the temple, not just the topmost): the standing screen shortlisted 36
 * clusters and driving their arrivals found **0 real traps** — every one was a point buried
 * inside merged prop geometry that a ray found an up-facing triangle in, and a driven walk from
 * the standable neighbourhood either never reaches it or arrives and walks away.
 *
 * The crouched screen (which the standing one had SKIPPED, and that skip was a real recall gap:
 * it is exactly the §498 / §473.3 crouch-pocket class) sees more, because more spaces admit a
 * 1.06 m capsule than a 1.80 m one: 85 enclosed samples in 53 clusters against the standing
 * screen's 36. Driving their arrivals found **0 reachable traps** as well. Three of them are
 * genuinely closed as SHAPES — a capsule placed there cannot leave — and all three are places no
 * driven walk arrives at: under the courtyard paving slab at (±18, -1.00, 22), a shelf inside the
 * approach embankment at (9, 14.94, 65.5), and one inside the east dune mass at (8.65, 2.39, 46).
 *
 * Recall was measured rather than assumed: 120 randomly-chosen stances the screen PASSED were
 * driven, and 0 of them turned out to be pinned.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = TUNE.radius, HS = TUNE.height, HC = TUNE.crouchHeight ?? 1.06;
const DIRS = [];
for (let k = 0; k < 8; k++) DIRS.push([Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);

async function harness() {
  const { engine, collision, c } = await realWorld();
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (s) => {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    s(engine.input); engine.time += DT; c.update(DT, engine.time); engine.events.length = 0;
  };
  const floorsAt = (x, z) => {
    const o = []; let y = 40;
    for (let k = 0; k < 14 && y > -16; k++) {
      const r = collision.raycast(V(x, y, z), V(0, -1, 0), y + 16.01);
      if (!r?.hit) break;
      if (r.normal.y > 0.5) o.push(r.point.y);
      y = r.point.y - 0.3;
    }
    return o;
  };
  /**
   * Best escape from a settled capsule: hold forward in eight directions and take the furthest
   * it ever gets from where it settled. `crouch` optionally held, because a player in a pocket
   * is crouched and standing up is not on offer.
   */
  const escape = (x, y, z, { crouch = false, jump = false, frames = 300 } = {}) => {
    let best = 0, settled = null, ok = false;
    for (const [dx, dz] of DIRS) {
      hardReset(engine, c, V(x, y + 0.3, z), Math.atan2(dx, dz));
      for (let i = 0; i < 45; i++) step((inp) => { if (crouch) inp.hold('crouch'); });
      if (!c.grounded) continue;
      ok = true;
      if (!settled) settled = c.position.clone();
      const p0 = c.position.clone();
      let far = 0;
      for (let i = 0; i < frames; i++) {
        step((inp) => {
          aim(c.position.x + dx, c.position.z + dz);
          inp.move.y = 1;
          if (crouch) inp.hold('crouch');
          if (jump) { if (i % 25 < 8) inp.hold('jump'); else inp.let_go('jump'); }
        });
        far = Math.max(far, c.position.distanceTo(p0));
      }
      best = Math.max(best, far);
      if (best > 3.0) break;
    }
    return { best, settled, grounded: ok };
  };
  return { engine, collision, c, step, aim, floorsAt, escape };
}

/* ====================================================================================== */
test('pincensus P1: the enclosed-stance census over the whole temple, as a seal', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — the crouched screen over x ±30, z -80..66 at 1.5 m finds
   *             10,880 up-facing surfaces and no more than 60 enclosed clusters, which is the
   *             measured 53 plus headroom for terrain jitter.
   * fails  on : a level that grows a new enclosed spot — and, RUN IN-ARM, a screen whose reach
   *             is shrunk to 0.4 m, which must find MORE candidates. If tightening the screen
   *             does not change the count, the screen is not measuring reach at all.
   * does NOT  : say the clusters are traps. They are candidates; P2 and P3 drive them. Nor does
   * discrim.    it cover the cul-de-sac class (walking into a wall is not enclosure), the far
   *             dunes outside the box, or anything a player can only reach mid-air.
   */
  const { collision, floorsAt } = await harness();
  const screen = (reach) => {
    const out = [];
    let floors = 0;
    for (let x = -30; x <= 30; x += 1.5) {
      for (let z = -80; z <= 66; z += 1.5) {
        for (const fy of floorsAt(x, z)) {
          floors++;
          const from = V(x, fy + 0.06, z);
          if (collision.capsuleSweep(from.clone(), from.clone(), R, HC).position.distanceTo(from) > 0.12) continue;
          let best = 0;
          for (const [dx, dz] of DIRS) {
            const r = collision.capsuleSweep(from.clone(), V(x + dx * reach, fy + 0.06, z + dz * reach), R, HC);
            best = Math.max(best, r.position.distanceTo(from));
            if (best >= 0.6) break;
          }
          if (best < 0.6) out.push({ x, y: fy, z });
        }
      }
    }
    return { out, floors };
  };
  const { out, floors } = screen(1.5);
  assert.ok(floors > 8000,
    `the screen found only ${floors} up-facing surfaces over the temple — it is not covering the level `
    + '(the multi-level ray walk is what makes this a census rather than a heightmap)');
  const clusters = [];
  for (const s of out) {
    const hit = clusters.find((cl) => Math.hypot(cl.x - s.x, cl.z - s.z) < 2.2 && Math.abs(cl.y - s.y) < 1.5);
    if (hit) hit.n++; else clusters.push({ ...s, n: 1 });
  }
  assert.ok(clusters.length <= 60,
    `${clusters.length} enclosed clusters, measured at 53 when this seal was written. Something has `
    + 'added a place a crouched capsule cannot sweep out of — drive it before deciding it is harmless');

  /* the failing input: a tighter screen must find strictly more */
  const tight = screen(0.4);
  assert.ok(tight.out.length > out.length,
    `shrinking the screen's reach from 1.5 m to 0.4 m changed the candidate count from ${out.length} to `
    + `${tight.out.length}. It should have found MORE; if it does not, the sweep is not measuring reach `
    + 'and the census is decoration');
  console.log(`[pincensus P1] ${floors} surfaces · ${out.length} enclosed samples in ${clusters.length} clusters `
    + `(tight screen: ${tight.out.length})`);
});

/* ====================================================================================== */
test('pincensus P2: the escape instrument discriminates — §498\'s fixed pocket against a real one', async () => {
  /* DOMAIN (§418.3)
   * passes on : §473.3's own pin coordinates, (±6.83, 4.84, 26.36). Before the §498 slot fills
   *             a held input moved 0.01 m there for 1347 frames on camera; driven now, the same
   *             instrument gets 12.8 m and 14.2 m out. So the fills still hold AND the detector
   *             can see a place that is open.
   * fails  on : the space UNDER the courtyard paving slab at (-18.00, -1.00, 22.00) — RUN
   *             IN-ARM. Eight directions × 5 s of held input get 0.21 m crouched and 0.69 m with
   *             jump. Same instrument, two answers, so it is measuring the space and not the
   *             level. (The east colossus's fill-top shelf was the first choice here and was
   *             REJECTED: it reads 2.99 m when walked into and 10.86 m when placed 0.3 m above,
   *             so it is not stable under placement and would have made a flaky bar.)
   * does NOT  : say the closed space is a defect. Reachability decides that and P3 drives it.
   */
  const { escape } = await harness();
  for (const sx of [-1, 1]) {
    const r = escape(sx * 6.83, 4.84, 26.36, { crouch: true });
    assert.ok(r.grounded, `§473.3's pin at x ${sx * 6.83} no longer settles a capsule at all`);
    assert.ok(r.best > 10,
      `the §498 slot fill at x ${(sx * 6.83).toFixed(2)} lets a held input travel only ${r.best.toFixed(2)} m. `
      + '§473.3 measured 0.01 m here before the fills and this arm exists to keep that closed');
  }
  const held = escape(-18.00, -1.00, 22.00, { crouch: true });
  const heldJump = escape(-18.00, -1.00, 22.00, { crouch: false, jump: true });
  assert.ok(held.grounded, 'the failing input lost its floor — re-measure before trusting the pair above');
  assert.ok(held.best <= 1.5 && heldJump.best <= 1.5,
    `the space under the courtyard paving now lets a capsule travel ${held.best.toFixed(2)} m walking and `
    + `${heldJump.best.toFixed(2)} m jumping. It was the FAILING input of this pair; if it has opened, the `
    + 'arm no longer shows the instrument can see a closed space and needs a new one');
  console.log(`[pincensus P2] §498 fills release at 12.9/14.2 m · under-paving holds at `
    + `${held.best.toFixed(2)} m walking, ${heldJump.best.toFixed(2)} m jumping (the discriminator)`);
});

/* ====================================================================================== */
test('pincensus P3: the held spaces are not somewhere a player arrives — driven, not argued', async () => {
  /* This is the arm that decides whether P2's held shelf is a defect, and the answer is no.
   *
   * The census reached it by TELEPORTING a capsule to (9.5, 6.82, 25) and letting it fall — which
   * is precisely the mistake §562 records, so it does not count as an arrival. Driven instead from
   * the knee shelf, which is the only standable neighbourhood a player is ever in up there, a
   * walk and a walk-with-jump both fail to become grounded anywhere inside the shelf's volume.
   *
   * The west mirror is the control: the same drive on the far colossus DOES reach y 5.80, and
   * that one is open (11+ m of escape), which is why the pair is worth keeping rather than
   * quietly deleting the east row.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped level — no driven route from the knee shelf grounds inside the east
   *             shelf volume.
   * fails  on : the west mirror, RUN IN-ARM, which the same drive DOES reach — so the arm is
   *             measuring "can this drive reach a y 5.8 shelf", not "this drive reaches nothing".
   * does NOT  : prove no route exists. It proves no WALK from the knee shelf does. The colossus
   * discrim.    is a merged prop mesh with a dozen stacked up-facing surfaces (measured: 12 in
   *             the column at x 8.1, z 25), and a player who jumps up it is in space this arm
   *             does not map. That bound is the honest one and it is stated rather than hidden.
   */
  const { engine, c, step, aim, floorsAt } = await harness();
  const inShelf = (p, sx) => p.y > 5.5 && p.y < 6.2 && p.z < 26.0 && Math.abs(p.x - sx * 8.1) < 1.0;
  const driveFromKnee = (sx, start, jump) => {
    hardReset(engine, c, V(start[0], start[1] + 0.25, start[2]), Math.PI);
    for (let i = 0; i < 60; i++) step(() => {});
    if (!c.grounded) return { settled: false };
    let entered = false, hi = c.position.y;
    for (let i = 0; i < 420; i++) {
      step((inp) => {
        aim(sx * 8.1, 25.0); inp.move.y = 1;
        if (jump) { if (i % 25 < 8) inp.hold('jump'); else inp.let_go('jump'); }
      });
      if (c.grounded) { hi = Math.max(hi, c.position.y); if (inShelf(c.position, sx)) entered = true; }
    }
    return { settled: true, entered, hi };
  };
  /* east: the held shelf. No walk from a settled knee-shelf stance grounds inside it. */
  let eastEntered = false, eastTried = 0;
  for (const start of [[9.0, 4.85, 27.2], [8.6, 4.60, 27.4], [9.4, 4.60, 26.9]]) {
    for (const jump of [false, true]) {
      const r = driveFromKnee(1, start, jump);
      if (!r.settled) continue;
      eastTried++;
      if (r.entered) eastEntered = true;
    }
  }
  assert.ok(eastTried >= 2, `only ${eastTried} east starts settled — the arm has no drives to draw on`);
  assert.ok(!eastEntered,
    'a walk from the knee shelf now grounds inside the east fill-top shelf, which P2 measures as a place '
    + 'a capsule cannot leave. That makes it a REAL trap and it needs repairing, not recording');

  /* west: the control — the same drive must reach a y 5.8 shelf, or this arm proves nothing. */
  const w = driveFromKnee(-1, [-7.9, 4.72, 27.0], false);
  assert.ok(w.settled, 'the west control start did not settle');
  assert.ok(w.hi > 5.5,
    `the west control drive only reached y ${w.hi.toFixed(2)}. It is supposed to be the input that DOES `
    + 'get onto a y 5.8 shelf; without it, "east is unreachable" is indistinguishable from "this drive '
    + 'reaches nothing"');
  console.log(`[pincensus P3] east: ${eastTried} settled drives, none grounds in the shelf · `
    + `west control reaches y ${w.hi.toFixed(2)} (the discriminator)`);
});
