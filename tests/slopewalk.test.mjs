import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * slopewalk.test.mjs — the user's P1 ("it is difficult to walk or run up slopes other than by
 * jumping"), asked of the WHOLE LEVEL rather than of the material the repair was written for.
 *
 * §515 scoped its fix to `sand` (`slopeSandDeg` 58, plus the ground-plane narrow check) and
 * certified it on a SYNTHETIC ramp — `traversal.test.mjs`'s `rampCollision(deg)`, a perfect
 * infinite plane that answers `material: 'sand'`. A material-scoped fix verified on a fixture
 * built from the same assumption is §439 twice over, so this file re-asks the question on the
 * shipped colliders, per material, swept across the angle range the level actually contains.
 *
 * ── The census the sweep is built on ───────────────────────────────────────────────────────
 * `collision.groundCheck` over the whole level at 0.5 m — 122,293 ground hits:
 *
 *     sand    101,656 samples   41.0 % at >= 20 deg   steepest 68.7
 *     stone    20,300 samples    9.8 % at >= 20 deg   steepest 89.9 (walls, grazed by the cast)
 *     wood        322 samples   palm trunks, tag `misc`, ~90 deg — not a surface anyone walks
 *     metal/cloth      15 samples   0 deg — pole tops
 *
 * So the level has exactly TWO materials with walkable slopes, and enumerating the colliders
 * (every proxy mesh with an up-facing face tilted >= 4 deg and >= 1.5 m2) finds exactly THREE
 * authored sloped walkable surfaces: the terrace flight-1 ramp (33.5 deg) and the two tomb
 * descent flights (30.1 / 32.4 deg). Everything else sloped is sand.
 *
 * ── The verdict ───────────────────────────────────────────────────────────────────────────
 * The material-scoped worry does not materialise. Sand carries a walk and a run at commanded
 * speed everywhere on the route (arm S), and all three stone surfaces do too (arm T). The 8
 * sand patches steeper than the 58 deg gate are all on the approach ridge's west flank
 * (x -73..-80, z 59..83), 40 m off any route — so 58 is above every sand face a player is asked
 * to climb, which is the ceiling §515 asserted but never enumerated.
 *
 * What is left is not a slope defect and arm H says so with a capsule: one of the three, flight
 * A of the tomb descent, is ROOFED over its own drawn centre line.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R2D = 180 / Math.PI;
const WALK_STICK = TUNE.walkSpeed / TUNE.runSpeed;   // Move.update targets runSpeed x wishMag

/* Sand faces on the route, MEASURED (marched along the fall line off `groundCheck`, kept only
   where the face sustains for 6 m so a run has road), not typed in. The slope each one reads is
   asserted, so a terrain reseed fails this loudly instead of silently sweeping nothing. */
const SAND = [
  [-58.00, -21.50, 7.0], [-58.00, 7.75, 8.9], [-58.00, 7.00, 11.3], [-58.00, -15.50, 12.2],
  [-58.00, 39.25, 16.9], [-58.00, -14.00, 17.0], [-58.00, 40.75, 21.0], [-43.00, 41.50, 21.2],
  [-58.00, 45.25, 25.3], [-58.00, 56.50, 29.9], [-52.00, 59.50, 30.2], [-58.00, 51.25, 30.7],
  [-47.50, 53.50, 39.8], [-48.25, 49.00, 40.7],
];

/* The three authored sloped walkable colliders: [name, x, z, uphill x, uphill z, deg]. Each is
   sampled on a lane its own width admits, which is not always its drawn centre — arm H is where
   that distinction lives. */
const STONE = [
  /* [name, x, z, uphill x, uphill z, deg, RUN LENGTH of the surface from that sample] */
  ['terrace flight-1 ramp', 0.00, 22.10, 0, -1, 33.5, 2.2],
  ['tomb descent flight A', -9.30, -55.60, 1, 0, 30.1, 4.5],
  ['tomb descent flight B', -6.00, -57.90, -1, 0, 32.4, 3.0],
];
/** Each flight's surface, from its own steps x rise / steps x run. */
const A_IDEAL = (x) => -5.6 + (x + 9.66) * (5.6 / 9.66);
const B_IDEAL = (x) => -5.6 - (x + 9.9) * (6.4 / 10.08);

async function harness() {
  const { engine, collision, c } = await realWorld();
  const aim = (dx, dz) => {
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (script) => {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script(engine.input);
    engine.time += DT; c.update(DT, engine.time);
    engine.events.length = 0;
  };
  const faceAt = (x, z, from = 60, max = 140) => {
    const g = collision.groundCheck(V(x, from, z), TUNE.radius, max);
    if (!g?.hit || !Number.isFinite(g.y)) return null;
    const l = Math.hypot(g.normal.x, g.normal.z) || 1;
    return {
      y: g.y, deg: Math.acos(Math.min(1, Math.max(-1, g.normal.y))) * R2D,
      mat: g.material, tag: g.tag, up: { x: -g.normal.x / l, z: -g.normal.z / l },
    };
  };
  /**
   * SETTLE the capsule from a metre above the surface, never teleport it to a probed y.
   *
   * This is not fastidiousness, it is the correction of a false finding this file nearly
   * shipped (§562). Placing the capsule at `groundCheck(...).y + 0.05` with a probe origin
   * chosen by hand put it interpenetrating on flight B, the sweep launched it, and
   * `_probeGround`'s rising guard (`velocity.y <= 0.02`) then refused to re-ground it — 60
   * frames of `fall` at 1.37 m/s with the ground probe answering `ok` on every one. Driven
   * from a settled capsule the same flight walks at 2.60 m/s, grounded on every frame. The
   * defect was the placement. §435.4 is about the probe occupying space the way the agent does,
   * and a teleport is not how the agent arrives.
   */
  const climb = (x, z, y0, up, stick, frames = 120, runLen = 12, settle = 45) => {
    hardReset(engine, c, V(x, y0 + 1.0, z), Math.atan2(up.x, up.z));
    for (let i = 0; i < settle; i++) step(() => {});
    if (!c.grounded) return { fail: `never settled (y ${c.position.y.toFixed(2)})` };
    const p0 = c.position.clone();
    const sp = []; let gnd = 0, tip = 0, flicks = 0, was = c.grounded, n = 0;
    for (let i = 0; i < frames; i++) {
      step((inp) => { aim(up.x, up.z); inp.move.y = stick; });
      n++;
      if (c.grounded) gnd++;
      /* FLICKS, not a grounded fraction. §515 measured the defect as a ground/air STUTTER — 154
         refusals in 240 frames — and a fraction cannot tell that apart from one clean launch off
         a dune brink, which is physics and which the §515 DOMAIN itself excludes. Measured on
         this level: healthy route faces flick 0-3 times; the >58 deg ridge faces flick 25-41. */
      if (c.grounded !== was) { flicks++; was = c.grounded; }
      sp.push(Math.hypot(c.velocity.x, c.velocity.z));
      if (c.stateName === 'tiptoe') tip++;
      /* Stop at the SURFACE's length, not at a frame count. The terrace ramp is 2.6 m; a run
         crosses it in 0.36 s and then stands against flight 2's face, and a median over a fixed
         window reported that stand as the ramp's delivered speed — 0.00 m/s for a surface the
         same drive walks at full speed. Length-bounded windows are how walk and run came to
         report the identical number in the first draft of this file. */
      if (c.position.distanceTo(p0) > runLen) break;
    }
    if (sp.length < 10) return { fail: `only ${sp.length} frames before leaving the surface` };
    /* p90, not the median: it asks "did the walker ever reach commanded speed and hold it",
       which is the claim, and it is not destroyed by the accel ramp at the start of a short run. */
    const s = sp.slice().sort((a, b) => a - b);
    const v = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
    return { v, ratio: v / (TUNE.runSpeed * stick), gnd: gnd / n, tip, flicks, n };
  };
  /** Capsule clearance straight up from the feet — the measure a ray gets wrong. */
  const clearance = (feet) => {
    const from = feet.clone(); from.y += 0.001;
    const to = from.clone(); to.y += 6;
    const r = collision.capsuleSweep(from, to, TUNE.radius, TUNE.height);
    return r.hit ? r.position.y - from.y : 6;
  };
  /** Waypointed hold-forward. Returns waypoints reached and the longest frozen run. */
  const route = (start, wps, stick, frames = 900) => {
    hardReset(engine, c, start.clone(), Math.PI);
    for (let i = 0; i < 45; i++) step(() => {});
    let wi = 0, stall = 0, maxStall = 0;
    const lastP = c.position.clone();
    for (let i = 0; i < frames; i++) {
      const t = wps[Math.min(wi, wps.length - 1)];
      step((inp) => { aim(t.x - c.position.x, t.z - c.position.z); inp.move.y = stick; });
      if (Math.hypot(c.position.x - t.x, c.position.z - t.z) < 0.9 && wi < wps.length) wi++;
      if (c.position.distanceTo(lastP) < 0.004) { stall++; if (stall > maxStall) maxStall = stall; } else stall = 0;
      lastP.copy(c.position);
    }
    return { wi, n: wps.length, maxStall, end: c.position.clone() };
  };
  return { engine, collision, c, step, aim, faceAt, climb, clearance, route };
}

/* ====================================================================================== */
test('slopewalk S: every sand slope on the route carries a walk AND a run at commanded speed', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — 14 measured sand faces spanning 7.0..40.7 deg, driven
   *             uphill from a settled capsule, walk (stick 0.361) and run (stick 1.0); each
   *             delivers >= 0.90 of its commanded speed with <= 8 ground/air crossings.
   * fails  on : `slopeSandDeg` rolled back to the stone limit of 50 — but that has no face in
   *             this set above 50, so the ablation is run on the STEEPEST sand the level has
   *             (the ridge flank at (-81, 65), 55.1 deg) instead, RUN IN-ARM below. With 58 it
   *             stutters at 25 flicks; the arm asserts the ablation makes it strictly worse, so
   *             a bar that could not discriminate fails here rather than passing quietly.
   * does NOT  : discriminate the narrow-ground half of §515 (arm T's off-centre lane does), the
   * discrim.    shedding half (`traversal.test.mjs`'s synthetic ramp owns it — this level has no
   *             unwalkable sand on any route to shed off), or anything about stone.
   */
  const { faceAt, climb } = await harness();
  const rows = [];
  for (const [x, z, wantDeg] of SAND) {
    const f = faceAt(x, z);
    assert.ok(f, `sand face at (${x}, ${z}) has no ground — the terrain moved under this sweep`);
    assert.equal(f.mat, 'sand', `(${x}, ${z}) is ${f.mat}, not sand — the sweep is pointed at the wrong surface`);
    assert.ok(Math.abs(f.deg - wantDeg) < 4,
      `(${x}, ${z}) reads ${f.deg.toFixed(1)} deg, was measured at ${wantDeg} — a terrain reseed has moved `
      + 'the faces this sweep was built from, so it is no longer sweeping the range it claims');
    const w = climb(x, z, f.y, f.up, WALK_STICK);
    const r = climb(x, z, f.y, f.up, 1.0);
    rows.push({ deg: f.deg, w, r });
    for (const [lab, o, stick] of [['walk', w, WALK_STICK], ['run', r, 1.0]]) {
      assert.ok(!o.fail, `${f.deg.toFixed(1)} deg sand at (${x}, ${z}): ${o.fail}`);
      assert.ok(o.ratio >= 0.90,
        `${f.deg.toFixed(1)} deg sand at (${x}, ${z}): a held-forward ${lab} delivered ${o.v.toFixed(2)} m/s `
        + `of a commanded ${(TUNE.runSpeed * stick).toFixed(2)} (${(o.ratio * 100).toFixed(0)}%) — this is the `
        + "user's P1 on sand again");
      assert.ok(o.flicks <= 8,
        `${f.deg.toFixed(1)} deg sand at (${x}, ${z}): the ${lab} crossed the ground/air boundary `
        + `${o.flicks} times in 120 frames (grounded ${(o.gnd * 100).toFixed(0)}%) — that is the stutter `
        + '§515 measured, not a single launch off a brink');
    }
  }
  const span = Math.max(...rows.map((r) => r.deg)) - Math.min(...rows.map((r) => r.deg));
  assert.ok(span >= 30 && Math.max(...rows.map((r) => r.deg)) >= 38,
    `the swept range is ${span.toFixed(1)} deg topping out at ${Math.max(...rows.map((r) => r.deg)).toFixed(1)} — `
    + 'a sweep that does not reach the steep end of the level\'s route sand is not testing the fix');

  /* ── the failing input, RUN, not asserted-by-argument ───────────────────────────────────── */
  const RIDGE = [-81, 65];
  const rf = faceAt(RIDGE[0], RIDGE[1]);
  assert.ok(rf && rf.mat === 'sand' && rf.deg > 50,
    `the ablation face at (${RIDGE}) reads ${rf ? `${rf.deg.toFixed(1)} deg ${rf.mat}` : 'nothing'} — it was `
    + 'measured at 55.1 deg sand, and the ablation needs a face above the stone limit to bite');
  const withFix = climb(RIDGE[0], RIDGE[1], rf.y, rf.up, 1.0);
  const keep = TUNE.slopeSandDeg;
  let ablated;
  try { TUNE.slopeSandDeg = 50; ablated = climb(RIDGE[0], RIDGE[1], rf.y, rf.up, 1.0); }
  finally { TUNE.slopeSandDeg = keep; }
  assert.equal(TUNE.slopeSandDeg, keep, 'the ablation did not restore slopeSandDeg');
  assert.ok(ablated.fail || ablated.ratio < withFix.ratio - 0.02 || ablated.flicks > withFix.flicks,
    `ABLATION: with slopeSandDeg pulled back to 50 the ${rf.deg.toFixed(1)} deg face behaved the same `
    + `(ratio ${withFix.ratio.toFixed(2)} -> ${ablated.ratio?.toFixed(2)}, flicks ${withFix.flicks} -> `
    + `${ablated.flicks}) — the instrument cannot see the fix it is here to protect`);

  console.log(`[slopewalk S] ${rows.length} sand faces ${rows[0].deg.toFixed(1)}..${rows[rows.length - 1].deg.toFixed(1)} deg · `
    + `worst walk ${Math.min(...rows.map((r) => r.w.ratio)).toFixed(2)} · worst run ${Math.min(...rows.map((r) => r.r.ratio)).toFixed(2)} `
    + `· ablation on the 55.1 deg ridge: ratio ${withFix.ratio.toFixed(2)} -> ${(ablated.ratio ?? 0).toFixed(2)}, `
    + `flicks ${withFix.flicks} -> ${ablated.flicks ?? '-'}`);
});

/* ====================================================================================== */
test('slopewalk T: all three authored STONE slopes carry a walk and a run — §515 is not sand-only', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level. All three authored sloped stone colliders, driven uphill
   *             from a settled capsule along their own fall line, deliver >= 0.90 of both a
   *             commanded walk and a commanded run, grounded throughout, with no tiptoe.
   * fails  on : the same drive 1.2 m off flight A's centre line — RUN IN-ARM: at z -56.8 the
   *             capsule is 0.35 m from the flight's edge, `narrowGround` correctly answers true
   *             and `tiptoe` caps it. That is the discriminator between "stone slopes resist"
   *             (they do not) and "this capsule is standing beside a drop" (it is).
   * does NOT  : reach the top of any of the three, or say anything about headroom. Arm H owns
   * discrim.    that; mixing them made the first draft of this file report walk and run as the
   *             identical 0.78 m/s, because displacement/time is bounded by the surface's length.
   */
  const { faceAt, climb } = await harness();
  const out = [];
  for (const [name, x, z, ux, uz, wantDeg, runLen] of STONE) {
    /* Probe origin per row, not a blanket y 60: two of these three are UNDER a floor, and a cast
       from above the hall reports the hall's own 84.9 deg wall face. */
    const from = name.startsWith('terrace') ? 6.0 : (name.endsWith('A') ? A_IDEAL(x) : B_IDEAL(x)) + 1.2;
    const f = faceAt(x, z, from, 6);
    assert.ok(f, `${name}: no ground at its sample (${x}, ${z})`);
    assert.equal(f.mat, 'stone', `${name}: sample reads ${f.mat}`);
    assert.ok(Math.abs(f.deg - wantDeg) < 2.0,
      `${name}: reads ${f.deg.toFixed(1)} deg, authored ${wantDeg} — the flight moved`);
    const up = { x: ux, z: uz };
    for (const [lab, stick] of [['walk', WALK_STICK], ['run', 1.0]]) {
      const o = climb(x, z, f.y, up, stick, 90, runLen);
      assert.ok(!o.fail, `${name} ${lab}: ${o.fail}`);
      assert.ok(o.ratio >= 0.90,
        `${name} (${f.deg.toFixed(1)} deg stone): a held-forward ${lab} delivered ${o.v.toFixed(2)} m/s of a `
        + `commanded ${(TUNE.runSpeed * stick).toFixed(2)} — §515's repair really is sand-only`);
      assert.ok(o.gnd >= 0.95, `${name} ${lab}: grounded on only ${(o.gnd * 100).toFixed(0)}% of frames`);
      assert.ok(o.tip / o.n < 0.30,
        `${name} ${lab}: ${o.tip} of ${o.n} frames in tiptoe on a surface its own width admits — §515.2's `
        + 'ground-plane narrow check is reading an authored stair as a ledge again. (Flight B runs 0.30 m '
        + "from the stairwell's west wall face at z -58.2 against a 0.34 m capsule radius, so a few frames "
        + 'of tiptoe there are the probe telling the truth; a majority of them would not be.)');
      if (lab === 'walk') out.push(`${name.split(' ').pop()} ${o.v.toFixed(2)}`);
    }
  }
  /* The failing input, driven. */
  const off = faceAt(-9.30, -56.80, A_IDEAL(-9.30) + 1.2, 6);
  assert.ok(off && off.mat === 'stone', 'the off-centre lane lost its ground');
  const bad = climb(-9.30, -56.80, off.y, { x: 1, z: 0 }, WALK_STICK, 90, 4.5);
  assert.ok(bad.tip > 40 && bad.ratio < 0.70,
    `the off-centre lane delivered ${bad.v.toFixed(2)} m/s with ${bad.tip} tiptoe frames — it was supposed to `
    + 'be the FAILING input (a capsule 0.35 m from a drop), so this arm no longer distinguishes centre-line '
    + 'walking from edge-walking');
  console.log(`[slopewalk T] walk speeds ${out.join(' · ')} m/s (commanded ${TUNE.walkSpeed}) · `
    + `off-centre lane ${bad.v.toFixed(2)} m/s, ${bad.tip}/72 tiptoe (the discriminator)`);
});

/* ====================================================================================== */
test('slopewalk B: flight B\'s proxy sits ON its masonry — the mirrored offset sign (§560)', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped placement — proxy top minus the flight's own steps x rise / steps x
   *             run line is +0.06 m at every metre down the centre, matching flight A's +0.05
   *             (the drawn tread nosing).
   * fails  on : the pre-§560 sign, `+0.6 sin(B_ANG)` against `rz: -B_ANG` — CONSTRUCTED AND
   *             MEASURED IN-ARM below from the same three numbers the level uses, giving +0.47.
   *             The arm therefore shows the defect as well as the repair, and cannot go green on
   *             a build where the sign has been put back.
   * does NOT  : say the desync affected the walk. It did not — arm T drives the flight at
   * discrim.    2.60 m/s with the sign either way (measured, §562). This is an art/collider
   *             desync: 0.41 m of daylight between the player's feet and the drawn stair.
   */
  const { collision } = await harness();
  const B_RUN = 16 * 0.63, B_RISE = 16 * 0.4, B_ANG = Math.atan2(B_RISE, B_RUN);
  const deltas = [];
  for (let x = -8.5; x <= -0.4; x += 1.0) {
    const g = collision.groundCheck(V(x, B_IDEAL(x) + 1.4, -57.9), TUNE.radius, 5);
    assert.ok(g?.hit, `flight B: no proxy under (${x.toFixed(1)}, -57.9)`);
    deltas.push(g.y - B_IDEAL(x));
  }
  const worst = Math.max(...deltas.map(Math.abs));
  assert.ok(worst <= 0.15,
    `flight B's collider stands ${worst.toFixed(2)} m off its own drawn run. Flight A, the correct `
    + 'mirror, measures 0.05. A player walking this stair is that far above the masonry');

  /* The failing input, computed from the level's own numbers rather than argued: put the sign
     back and ask where the top face lands. */
  const topMid = new THREE.Vector3(-9.9 + B_RUN / 2, -12.0 + B_RISE / 2, -57.9);
  const place = (sx) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(B_RUN, B_RISE), 1.2, 3.2));
    box.position.set(topMid.x + sx * 0.6 * Math.sin(B_ANG), topMid.y - 0.6 * Math.cos(B_ANG), -57.9);
    box.rotation.z = -B_ANG;
    box.updateMatrixWorld(true);
    /* Top-face height over the flight's midpoint, by raycast — a vertex hunt finds nothing,
       because rotating the box leaves no vertex exactly over any given x. */
    const rc = new THREE.Raycaster(new THREE.Vector3(topMid.x, topMid.y + 8, -57.9),
      new THREE.Vector3(0, -1, 0), 0, 40);
    const hits = rc.intersectObject(box, false);
    return hits.length ? hits[0].point.y : NaN;
  };
  const shipped = place(-1), broken = place(+1);
  assert.ok(broken - shipped > 0.3,
    `ABLATION: flipping the offset sign moved the top face by only ${(broken - shipped).toFixed(3)} m, so the `
    + 'sign is not what this arm thinks it is and the bar above is not protecting anything');
  console.log(`[slopewalk B] flight B proxy vs its drawn run: worst |delta| ${worst.toFixed(2)} m `
    + `(flight A 0.05) · the flipped sign lifts the top face ${(broken - shipped).toFixed(2)} m`);
});

/* ====================================================================================== */
test('slopewalk H: flight A is ROOFED over its drawn centre line — capsule, not ray (§435.4)', async () => {
  /* A TRIPWIRE, and labelled one (§418.5). It records a defect this lane measured, PRICED, and
   * deliberately did not repair, so the next lane inherits the numbers instead of the impression.
   *
   * ── What it is ────────────────────────────────────────────────────────────────────────────
   * Flight A is 3.2 m wide; the slot it descends through is 1.55 m — the gap between the gate
   * corridor floor (`proxy:ground`, x +-3.4, y -1..0, z -55.7..-48.3) and the descent landing
   * (trimmed to z -57.25 by §482). A 3.2 m flight in a 1.55 m slot is roofed over 1.65 m of its
   * width, and that is just what a stairwell is. What is wrong is WHICH 1.65 m: the flight's own
   * centre line at z -55.6 lies 0.10 m south of the slot, so the drawn middle of the staircase
   * is the roofed half. Headroom on it, capsule settled: 6.00 m down to x -4.5, then 1.77, 1.51,
   * 0.07, 0.00, 0.10 over x -4.0..-2.0 against a 1.80 m capsule. Held forward from the gate
   * corridor, the centre-line WALK stalls 709 frames and the RUN 848.
   *
   * ── Why it is not repaired ────────────────────────────────────────────────────────────────
   * The parameter was swept before the mechanism was described (§450.4) and the repair space is
   * empty: flight A's proxy is 1.2 m thick and flight B lies under it in the same shaft, so every
   * metre A moves north is a metre off B's ceiling. A_Z -55.6 / -56.0 / -56.2 / -56.475 / -56.7
   * give descent-walk 1/4 · 1/4 · 1/4 · 4/4 · 4/4 and flight-B best-lane headroom 6.00 · 1.51 ·
   * 1.38 · 1.38 · 1.38 m. Every value that frees A's centre takes B from passable to impassable
   * across its whole width. The honest repair notches the corridor slab, which splits one
   * collider into two, and `tests/basketvary.test.mjs:424` pins ARCHITECTURE+PROPS registrations
   * at 282 — moving that bar to pass one's own change is §141.1.
   *
   * ── And the reason the arm is written with a capsule ───────────────────────────────────────
   * A ray from head height over the same feet reports 1.00-2.26 m of clear space where the
   * capsule measures 0.00-1.77. This lane's own history is a probe that read two rectangles and
   * reported 1.100 m of clearance where the real route failed at 0.48 m on an unmodelled
   * parapet. Both measurements are made below, side by side, so the contrast cannot be lost.
   *
   * If this arm goes red the stairwell has been re-cut — replace it with a walk, do not adjust it.
   */
  const { collision, clearance, route, step, engine, c } = await harness();
  const rayHead = (feet) => {
    const o = feet.clone(); o.y += TUNE.height * 0.55;
    const r = collision.raycast(o, V(0, 1, 0), 8);
    return r?.hit ? r.point.y - feet.y : 8;
  };

  /* Settled capsules down the drawn centre line. */
  const pinched = [];
  for (const x of [-4.0, -3.5, -3.0, -2.5, -2.0]) {
    hardReset(engine, c, V(x, A_IDEAL(x) + 1.0, -55.6), Math.PI);
    for (let i = 0; i < 60; i++) step(() => {});
    const cap = clearance(c.position.clone());
    const ray = rayHead(c.position.clone());
    pinched.push({ x, cap, ray });
    assert.ok(cap < TUNE.height,
      `flight A at x ${x}: the capsule now clears ${cap.toFixed(2)} m on the drawn centre line. If the `
      + 'stairwell was opened, DELETE this tripwire and assert the walk instead (§418.5)');
  }
  const contrast = Math.max(...pinched.map((p) => p.ray - p.cap));
  assert.ok(contrast > 0.8,
    `the widest head-ray-minus-capsule gap on the roofed span is ${contrast.toFixed(2)} m. That gap is this `
    + "arm's §435.4 point; if it has closed the geometry changed and every number above is stale");

  /* Driven: the centre line stalls, the working lane does not. Both, so the arm distinguishes
     "this stair is roofed" from "this stair is impassable" — it is the former. */
  const CENTRE = [V(0, 0, -55.6), V(-3, -1.6, -55.6), V(-6, -3.4, -55.6), V(-9.4, -5.5, -55.6)];
  const LANE = [V(0, 0, -56.6), V(-3, -1.6, -56.8), V(-6, -3.4, -56.8), V(-9.4, -5.5, -56.8)];
  const cw = route(V(0, 0.2, -53.0), CENTRE, WALK_STICK);
  const lw = route(V(0, 0.2, -53.0), LANE, WALK_STICK);
  const lr = route(V(0, 0.2, -53.0), LANE, 1.0);
  assert.ok(cw.maxStall > 300,
    `the centre-line walk stalled only ${cw.maxStall} frames and reached ${cw.wi}/${cw.n} waypoints — the roof `
    + 'no longer stops it, so this tripwire has been overtaken by a repair and should be replaced');
  assert.ok(lw.wi === lw.n && lw.maxStall < 30,
    `the WORKING lane (z -56.8) reached only ${lw.wi}/${lw.n} waypoints with a ${lw.maxStall}-frame stall — `
    + 'the descent has become impassable rather than merely off-centre, which is a worse defect than the '
    + 'one this arm records');
  assert.ok(lr.wi === lr.n, `the working lane failed at a RUN: ${lr.wi}/${lr.n}`);

  /* And the seal on the repair that was declined: flight B must keep the clear lane that moving
     flight A would have cost it. */
  let best = -1, bz = 0;
  for (let z = -58.0; z <= -56.35; z += 0.2) {
    let mn = 9;
    for (let x = -9.6; x <= -1.0; x += 0.4) {
      const g = collision.groundCheck(V(x, B_IDEAL(x) + 1.0, z), TUNE.radius, 4);
      if (!g?.hit) { mn = 0; break; }
      mn = Math.min(mn, clearance(V(x, g.y, z)));
    }
    if (mn > best) { best = mn; bz = z; }
  }
  assert.ok(best >= TUNE.height,
    `flight B's best lane (z ${bz.toFixed(1)}) now clears only ${best.toFixed(2)} m against a ${TUNE.height} m `
    + 'capsule. That is exactly the cost the A_Z sweep refused to pay, so something has moved flight A '
    + 'north — or moved flight B — and the descent is now impassable in BOTH flights');

  console.log('[slopewalk H] flight A centre line, capsule/head-ray: '
    + pinched.map((p) => `x${p.x} ${p.cap.toFixed(2)}/${p.ray.toFixed(2)}`).join('  ')
    + ` · centre stall ${cw.maxStall}f (${cw.wi}/${cw.n}) vs lane ${lw.maxStall}f (${lw.wi}/${lw.n}) `
    + `· flight B best lane z ${bz.toFixed(1)} clears ${best.toFixed(2)} m`);
});
