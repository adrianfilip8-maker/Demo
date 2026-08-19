import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * THE ACCEPTANCE ARM: §8.1 from spawn to the Eye of Ra, one Controller, one reset, no teleport.
 *
 * ── What this pins (§492) ─────────────────────────────────────────────────────────────────
 * Every leg of the authored route, driven end to end in one continuous 60 Hz clock:
 * spawn → terrace (via the §486 signpost block) → kiosk lintel (via the §491 step) → the hook
 * chain rings 3→4→5→6 (T10's recipe: pump along velocity, bail on the target face, steer the
 * flight, mash the E-grab once nearer the target than the source) → the hall-front cornice →
 * the §489 retrace back down the chain → courtyard at grade → the south doorway → hall floor →
 * inner gate → the §484 tomb stair → vault floor → through the §490 gate doorway → the Eye.
 * Completes in ~5,300 frames (~88 s of game time) on the tree it was written against.
 *
 * ── DOMAIN (§418.3) ───────────────────────────────────────────────────────────────────────
 * passes on : the shipped tree — the drive reaches the Eye inside the frame budget with ZERO
 *             hard landings on the ascent (spawn through the cornice).
 * fails  on : any leg regressing — a lid over the descent (either of TERRAIN's two
 *             representations), a sealed doorway, a moved ring, a re-boxed stairwell. The §480
 *             family shipped green suites over exactly such states; this arm is the one that
 *             walks the promise instead of the geometry.
 * does NOT  : discriminate guards (out of scope for the demo), the stealth vent (no floor —
 * discrim.    §480.4), route DIFFICULTY (windows and margins are the sheet's, not this arm's),
 *             or the retrace's descent grace: hard landings are asserted only on the ascent,
 *             though the shipped drive currently lands soft END TO END (worst arrival 14.8
 *             against `landHard` 15.0, via the lower-chain return and the sneaked ramp line) —
 *             the descent's 0.2 m/s margin is real but chaos-thin, so it is logged, not pinned. It is also CHAOS-SENSITIVE by nature: collider changes shift BVH
 *             tie-breaks and shift which retry succeeds; the retries absorb that, but a genuine
 *             new failure will look like a stop at one named leg — read the leg table it prints.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function aim(engine, c, tx, tz) {
  const dx = tx - c.position.x, dz = tz - c.position.z;
  engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
}
const f3 = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

test('spawn to the Eye of Ra: the authored route completes in one continuous drive', async () => {
  const world = await realWorld();
  const { engine, c, collision } = world;
  const { legRows, events, cornice } = await (async () => {
let FRAME = 0, last = '';
let CORNICE_FRAME = -1;
const events = [], legRows = [];
function step(script) {
  engine.input.beginFrame(DT);
  engine.input.move.x = 0; engine.input.move.y = 0;
  script(engine.input);
  engine.time = FRAME * DT; c.update(DT, FRAME * DT);
  for (const e of engine.events) {
    if (e.evt === 'landed') events.push(`f${FRAME} landed ${e.payload.force.toFixed(1)}${e.payload.force >= TUNE.landHard ? ' **HARD**' : ''}`);
  }
  engine.events.length = 0;
  if (c.stateName !== last) last = c.stateName;
  FRAME++;
}
const near = (x, z, tol) => Math.hypot(c.position.x - x, c.position.z - z) < tol;
const say = (n, ok) => { legRows.push(`${ok ? 'OK  ' : 'STOP'} ${n}  f${FRAME}  at ${f3(c.position)} ${c.stateName}`); console.log(legRows[legRows.length - 1]); return ok; };

const R3 = [4.2, 14.8, 4.5], R4 = [1.0, 14.5, -3.0], R5 = [-4.0, 13.9, -8.5], R6 = [-9.5, 14.0, -13.0];
const CORNICE = [-9.5, 15.29, -16.0];
let steals = 0;

/** T10 generalized: assume currently in hookSwing; pump along velocity, bail on the target face,
 *  STEER the flight at the target. Returns 'grabbed' | 'stole' | 'landed' | 'lost'. */
function chainHop(tgt, { dj = false, wantLand = null, attempts = 8, sideBar = 0.58, vyBar = 4.0 } = {}) {
  /* T10's loop, transplanted rather than paraphrased (provenance rule): pump along velocity for
     a FIXED W frames from the grab, one jump press at i === W, then hold toward the target
     through the flight. My §485/§488 condition-based bail (sp > 6, up-swing, aligned) was
     paraphrase, and it failed twice more here — the steered flight landed on the target's ground
     shadow both times, because a first-opportunity bail at ~6 m/s arcs flat. The window numbers
     are T10's own, swept. */
  for (let a = 0; a < attempts; a++) {
    if (c.stateName !== 'hookSwing') return 'lost';
    let bailed = false, djDone = false, bailFrame = 0, i = 0;
    const srcAnchor = c.anchor ? c.anchor.clone() : null;
    for (; i < 640; i++) {
      const sw = c.stateName === 'hookSwing';
      /* Phase-locked to the state T10's W window hits, not to a frame count: full pump behind us,
         capsule on the TARGET side of the anchor, rising, fast. A frame-count window is only
         valid for T10's own entry; this entry's phase differs and W 158 there missed short. */
      let atBail = false;
      if (sw && !bailed && i > 140) {
        const px = c.position.x - c.anchor.x, pz = c.position.z - c.anchor.z;
        const pl = Math.hypot(px, pz) || 1;
        const tx = tgt[0] - c.anchor.x, tz = tgt[2] - c.anchor.z;
        const tl = Math.hypot(tx, tz) || 1;
        const side = (px / pl) * (tx / tl) + (pz / pl) * (tz / tl);
        const sp = Math.hypot(c.velocity.x, c.velocity.z);
        /* The probe-proven bail state (t10probe, from T10's own entry): side > 0.58 fires at the
           winning phase (side 0.64, vy 4.3, sp 8.2 -> GRABBED); side > 0.5 clips the window's
           low-energy leading edge and vy > 4.5 clips this very bail. Both were measured, not
           argued. i > 140 forces a full pump first. */
        atBail = side > sideBar && c.velocity.y > vyBar && sp > 5.0;
        /* Fallback for the smaller swings after a mid-flight grab: past frame 340 without the
           prime state, take a moderate release on the target side — the flight mash has 9 m of
           reach, so a perfect launch is no longer required. */
        if (!atBail && i > 340) atBail = side > 0.25 && c.velocity.y > 1.5 && sp > 4.0;
      }
      step((inp) => {
        if (sw && !bailed && !atBail) {
          const sp = Math.hypot(c.velocity.x, c.velocity.z);
          if (sp > 0.3) aim(engine, c, c.position.x + c.velocity.x, c.position.z + c.velocity.z);
          else aim(engine, c, tgt[0], tgt[2]);
          inp.move.y = 1; inp.let_go('jump');
        } else {
          aim(engine, c, tgt[0], tgt[2]);
          inp.move.y = 1;
          if (atBail) { inp.hold('jump'); bailFrame = FRAME; }
          else if (dj && bailed && !djDone && bailFrame && FRAME - bailFrame === 12) { inp.hold('jump'); djDone = true; }
          else inp.let_go('jump');
          /* Mash grab through the flight — the player's E-grab verb, reach `hookGrab` 9.0. The
             auto-grab needs 2.9 and the natural entry's best flight passes 3.74 out (W-swept,
             26 phases, zero auto-grabs); every flight is inside NINE. T10 never pressed it
             because its teleported start didn't need to; a thumb would. */
          if (bailed && !c.grounded && !wantLand) {   // a LANDING exit must not re-grab the chain
            /* ...but not until the flight is nearer the TARGET than the ring it just left, or the
               mash re-grabs the departed ring instantly (leg5c looped on exactly that, 8 times). */
            const dT = Math.hypot(c.position.x - tgt[0], c.position.z - tgt[2]);
            const dS = srcAnchor ? Math.hypot(c.position.x - srcAnchor.x, c.position.z - srcAnchor.z) : 99;
            if (dT < dS - 0.5 && FRAME % 5 === 0) inp.hold('interact'); else inp.let_go('interact');
          }
        }
      });
      if (!bailed && bailFrame && c.stateName !== 'hookSwing') bailed = true;
      if (bailed) {
        const d3 = Math.hypot(c.position.x - tgt[0], c.position.y + 1.6 - tgt[1], c.position.z - tgt[2]);
        if (!chainHop._min || d3 < chainHop._min.d) chainHop._min = { d: d3, at: c.position.clone(), st: c.stateName, vy: c.velocity.y };
        if (c.stateName === 'hookSwing' && c.anchor) {
          const d = Math.hypot(c.anchor.x - tgt[0], c.anchor.y - tgt[1], c.anchor.z - tgt[2]);
          if (d < 0.7) return 'grabbed';
          steals++;
          break;                                  // continue from the stolen ring, next attempt
        }
        if (wantLand && c.grounded && Math.abs(c.position.y - wantLand[1]) < 1.0 && near(wantLand[0], wantLand[2], 1.6)) return 'landed';
        if (c.grounded || c.position.y < 1.5) return 'fell';
      }
    }
  }
  return 'lost';
}
/** E-grab a ring from the ground (T10's enter, generalized). */
function eGrab(ring, tries = 4) {
  for (let t = 0; t < tries; t++) {
    for (let i = 0; i < 60; i++) {
      step((inp) => {
        aim(engine, c, ring[0], ring[2]);
        inp.move.y = 1;
        if (i === 2 || i === 3) inp.hold('jump'); else if (i === 4) inp.let_go('jump');
        if (i > 3) inp.hold('interact');
      });
      if (c.stateName === 'hookSwing' && c.anchor && Math.hypot(c.anchor.x - ring[0], c.anchor.z - ring[2]) < 0.7) { engine.input.let_go('interact'); engine.input.let_go('jump'); return true; }
    }
    engine.input.let_go('interact');
    for (let i = 0; i < 60 && !c.grounded; i++) step(() => {});
  }
  return false;
}
/** Flood-fill a walkable path (stepHeight 0.42, slope 50) from here to (tx,ty,tz), then follow
 *  every cell. Self-routing for retraces — guessed waypoint lists kept walking into furniture. */
function floodWalk(tx, ty, tz, frames = 6000) {
  const { collision } = world;
  const G2 = 0.5, WALK = Math.cos(50 * Math.PI / 180);
  const stand = (x, z, fy) => {
    const g = collision.groundCheck(V(x, fy + 1.0, z), TUNE.radius, 2.4);
    if (!g.hit || g.normal.y < WALK) return null;
    const pp = V(x, g.y + 0.03, z);
    const occ = collision.capsuleSweep(pp, pp.clone(), TUNE.radius, TUNE.height);
    return (occ.depenHit && occ.depenDepth > 0.05) ? null : g.y;
  };
  const key = (x, z, y) => `${Math.round(x / G2)},${Math.round(z / G2)},${Math.round(y / 0.5)}`;
  const ax = c.position.x, ay = c.position.y, az = c.position.z;
  const lo = { x: Math.min(ax, tx) - 16, z: Math.min(az, tz) - 16 };
  const hi = { x: Math.max(ax, tx) + 16, z: Math.max(az, tz) + 16 };
  const y0 = stand(ax, az, ay); if (y0 == null) return false;
  const prev = new Map(), seen = new Set([key(ax, az, y0)]); const q = [[ax, az, y0]];
  let goal = null;
  while (q.length && !goal && seen.size < 60000) {
    q.sort((p1, p2) => (Math.hypot(p1[0] - tx, p1[1] - tz) - Math.hypot(p2[0] - tx, p2[1] - tz)));
    const cur = q.shift();
    if (Math.hypot(cur[0] - tx, cur[1] - tz) < 1.2 && Math.abs(cur[2] - ty) < 1.5) { goal = cur; break; }
    for (const [dx, dz] of [[G2, 0], [-G2, 0], [0, G2], [0, -G2]]) {
      const nx = cur[0] + dx, nz = cur[1] + dz;
      if (nx < lo.x || nx > hi.x || nz < lo.z || nz > hi.z) continue;
      const ny = stand(nx, nz, cur[2]);
      if (ny == null || Math.abs(ny - cur[2]) > TUNE.stepHeight) continue;
      const k = key(nx, nz, ny); if (seen.has(k)) continue;
      seen.add(k); prev.set(k, cur); q.push([nx, nz, ny]);
    }
  }
  if (!goal) return false;
  const path = []; let k = key(goal[0], goal[1], goal[2]), n = goal;
  while (n) { path.push(n); n = prev.get(k); if (n) k = key(n[0], n[1], n[2]); }
  path.reverse();
  let wi = 0, stuck = 0, prevPos = c.position.clone();
  for (let i = 0; i < frames; i++) {
    const t = path[Math.min(wi, path.length - 1)];
    step((inp) => { inp.move.y = 1; aim(engine, c, t[0], t[1]); inp.let_go('sneak'); });
    if (c.position.distanceTo(prevPos) < 0.003) stuck++; else stuck = 0;
    prevPos.copy(c.position);
    if (Math.hypot(c.position.x - t[0], c.position.z - t[1]) < 0.5) { if (wi < path.length - 1) wi++; else return true; }
    if (stuck > 300) return false;
  }
  return false;
}
const walkTo = (x, z, tol = 0.8, frames = 600, sneak = false) => {
  for (let i = 0; i < frames; i++) {
    step((inp) => { inp.move.y = 1; aim(engine, c, x, z); if (sneak) inp.hold('sneak'); else inp.let_go('sneak'); });
    if (near(x, z, tol)) return true;
  }
  return false;
};

/* ================= THE RUN ================= */
hardReset(engine, c, V(0, 0, 30), Math.PI);
console.log(`SPAWN ${f3(c.position)}\n`);

/* legs 1-2: spawn -> stage-2 via the signpost */
walkTo(0, 19.5, 1.0, 500);
for (let i = 0; i < 120 && c.position.y < 1.9; i++) step((inp) => { inp.move.y = 1; aim(engine, c, 0, 19.4); });
say('leg1  spawn -> stage-1 deck', c.position.y > 1.8);
let ok = false;
for (let t = 0; t < 4 && !ok; t++) {
  for (let i = 0; i < 90; i++) { step((inp) => { inp.move.y = 1; aim(engine, c, 3.7, 18.25); if (i >= 6 && i < 22) inp.hold('jump'); else inp.let_go('jump'); }); if (c.grounded && c.position.y > 3.4 && c.position.y < 3.9) break; }
  if (!(c.grounded && c.position.y > 3.4)) continue;
  for (let i = 0; i < 220; i++) { step((inp) => { inp.move.y = 1; aim(engine, c, 3.4, 14.5); inp.let_go('jump'); }); if (c.grounded && c.position.y > 5.0) { ok = true; break; } }
}
if (!say('leg2  deck -> stage-2 (signpost block)', ok)) return { legRows, events, cornice: CORNICE_FRAME };

/* leg 3: authored double jump onto the kiosk lintel, then walk the ring to the NE corner */
walkTo(0, 15.8, 0.8, 300);
ok = false;
/* Primary: the §491 step — deck -> step block (7.1) -> lintel (9.0), two 1.9 m singles. */
for (let t = 0; t < 5 && !ok; t++) {
  let onStep = false;
  for (let i = 0; i < 110; i++) {
    step((inp) => { inp.move.y = 1; aim(engine, c, -1.6, 15.65); if (i >= 6 && i < 22) inp.hold('jump'); else inp.let_go('jump'); });
    if (c.grounded && c.position.y > 6.9 && c.position.y < 7.4) { onStep = true; break; }
  }
  if (!onStep) { for (let i = 0; i < 120 && (!c.grounded || c.position.y > 5.6); i++) step((inp) => { inp.move.y = 1; aim(engine, c, 0, 16.2); inp.let_go('jump'); }); continue; }
  for (let i = 0; i < 140; i++) {
    step((inp) => { inp.move.y = 1; aim(engine, c, -1.6, 14.0); if (i >= 5 && i < 21) inp.hold('jump'); else inp.let_go('jump'); });
    if (c.grounded && c.position.y > 8.7) { ok = true; break; }
  }
}
if (!ok) for (const h1 of [8, 12, 16, 20]) for (const gap of [12, 16, 20, 24, 28]) {
  let hopAt = -1;
  for (let i = 0; i < 340; i++) {
    /* a partial arrival on a kiosk course (y ~6.5-8.7) is a step, not a miss: hop once more */
    if (c.grounded && c.position.y > 6.4 && c.position.y < 8.7 && hopAt < 0) hopAt = i + 2;
    const press = (i >= 6 && i < 6 + h1) || (i >= 6 + gap && i < 6 + gap + 20)
      || (hopAt > 0 && i >= hopAt && i < hopAt + 14);
    step((inp) => { inp.move.y = 1; aim(engine, c, 0, 13.9); if (press) inp.hold('jump'); else inp.let_go('jump'); });
    if (c.grounded && c.position.y > 8.7) { ok = true; break; }
    if (ok) break;
  }
  /* back to the deck before the next timing: a partial jump can strand the capsule on a kiosk
     course at y ~7.75 that is boxed in at walking height (walking south there paces on the spot,
     measured over 300 frames) — JUMP south off it instead */
  for (let t = 0; t < 4 && (c.position.y > 5.6 || !c.grounded); t++) {
    for (let i = 0; i < 120; i++) {
      step((inp) => { inp.move.y = 1; aim(engine, c, 0, 17.5); if (i >= 4 && i < 18) inp.hold('jump'); else inp.let_go('jump'); });
      if (c.grounded && c.position.y < 5.6) break;
    }
  }
  walkTo(0, 15.8, 0.8, 250);
}
if (!say('leg3  stage-2 -> kiosk lintel (double jump)', ok)) return { legRows, events, cornice: CORNICE_FRAME };
ok = walkTo(3.4, 14.4, 0.5, 400, true) && walkTo(3.4, 8.6, 0.5, 400, true) && walkTo(2.2, 8.4, 0.22, 400, true);
for (let i = 0; i < 24; i++) step(() => {});                       // settle to a standstill
if (!say('leg3b lintel ring -> T10 entry point', ok && Math.hypot(c.velocity.x, c.velocity.z) < 0.2)) return { legRows, events, cornice: CORNICE_FRAME };

/* leg 4 + 5a: T10 VERBATIM — its enter script and W-swept leg 5, in the continuous clock.
   Two paraphrases and three tuned bail conditions all missed from my own entry; the committed
   apparatus works from this exact standing start, so the run stands exactly there first.
   A missed W is followed by the honest player retrace back up to the entry point. */
const R3v = V(...R3);
let hop1 = false, said4 = false;
for (let attempt = 0; attempt < 5; attempt++) {
  let entered = false;
  for (let i = 0; i < 40; i++) {
    step((inp) => {
      aim(engine, c, R3[0], R3[2]);
      inp.move.y = 1;
      if (i === 1 || i === 2) inp.hold('jump');
      if (i === 3) inp.let_go('jump');
      if (i > 2) inp.hold('interact');
    });
    if (c.stateName === 'hookSwing' && c.anchor && c.anchor.distanceTo(R3v) < 0.5) { entered = true; break; }
  }
  engine.input.let_go('interact'); engine.input.let_go('jump');
  if (!entered) break;
  if (!said4) { say('leg4  E-grab ring 3 (T10 enter)', true); said4 = true; }
  const TH = [[0.58, 4.0], [0.50, 3.5], [0.66, 4.5], [0.45, 5.0], [0.62, 3.0]][attempt % 5];
  if (chainHop(R4, { sideBar: TH[0], vyBar: TH[1], attempts: 2 }) === 'grabbed') { hop1 = true; break; }
  console.log(`   [attempt ${attempt}] missed ring 4; retracing east-about to the entry point`);
  for (let i = 0; i < 200 && !c.grounded; i++) step(() => {});
  if (!floodWalk(0, 0, 21.5)) break;      // self-routing: around kiosk, terrace, colossi
  let up = false;
  for (let t = 0; t < 4 && !up; t++) {
    for (let i = 0; i < 90; i++) { step((inp) => { inp.move.y = 1; aim(engine, c, 3.7, 18.25); if (i >= 6 && i < 22) inp.hold('jump'); else inp.let_go('jump'); }); if (c.grounded && c.position.y > 3.4 && c.position.y < 3.9) break; }
    if (!(c.grounded && c.position.y > 3.4)) continue;
    for (let i = 0; i < 220; i++) { step((inp) => { inp.move.y = 1; aim(engine, c, 3.4, 14.5); inp.let_go('jump'); }); if (c.grounded && c.position.y > 5.0) { up = true; break; } }
  }
  if (!up) break;
  walkTo(0, 15.8, 0.8, 300);
  let onL = false;
  lin: for (const h1 of [8, 12, 16, 20]) for (const gap of [12, 16, 20, 24, 28]) {
    for (let i = 0; i < 240; i++) {
      const press = (i >= 6 && i < 6 + h1) || (i >= 6 + gap && i < 6 + gap + 20);
      step((inp) => { inp.move.y = 1; aim(engine, c, 0, 13.9); if (press) inp.hold('jump'); else inp.let_go('jump'); });
      if (c.grounded && c.position.y > 8.7) { onL = true; break lin; }
    }
    walkTo(0, 15.8, 0.8, 250);
  }
  if (!onL) break;
  if (!(walkTo(3.4, 14.4, 0.5, 400, true) && walkTo(3.4, 8.6, 0.5, 400, true) && walkTo(2.2, 8.4, 0.22, 400, true))) break;
  for (let i = 0; i < 24; i++) step(() => {});
}
if (!say('leg5a ring3 -> ring4 (T10 enter + proven bail)', hop1)) return { legRows, events, cornice: CORNICE_FRAME };
if (!say('leg5b ring4 -> ring5', chainHop(R5) === 'grabbed')) return { legRows, events, cornice: CORNICE_FRAME };
if (!say('leg5c ring5 -> ring6', chainHop(R6) === 'grabbed')) return { legRows, events, cornice: CORNICE_FRAME };
{
  let r = chainHop(CORNICE, { dj: true, wantLand: CORNICE });
  /* The exit often lands on a hall-front course 2-3 m under the wall head (measured: y 13.00 at
     (-6.7, -17.9)). From there the cornice is one double jump; climb rather than call it a miss. */
  if (r !== 'landed' && c.grounded && c.position.y > 11.5 && c.position.z < -14.5) {
    for (let t = 0; t < 6 && !(c.grounded && c.position.y > 14.6); t++) {
      for (let i = 0; i < 130; i++) {
        const press = (i >= 4 && i < 18) || (i >= 26 && i < 44);
        step((inp) => { inp.move.y = 1; aim(engine, c, CORNICE[0], CORNICE[2]); if (press) inp.hold('jump'); else inp.let_go('jump'); });
        if (c.grounded && c.position.y > 14.6) break;
      }
    }
    if (c.grounded && c.position.y > 14.6) r = 'landed';
  }
  if (!say('leg5d ring6 -> CORNICE (exit + climb-up)', r === 'landed')) return { legRows, events, cornice: CORNICE_FRAME };
}
CORNICE_FRAME = FRAME;

/* leg 6 (§489 retrace): cornice -> ring6 -> ring5 -> ring4 -> ring3 -> drop to the kiosk lintel */
walkTo(-9.5, -15.9, 0.6, 200, true);
if (!say('leg6a cornice -> E-grab ring 6', eGrab(R6))) return { legRows, events, cornice: CORNICE_FRAME };
if (!say('leg6b ring6 -> ring5', chainHop(R5) === 'grabbed')) return { legRows, events, cornice: CORNICE_FRAME };
if (!say('leg6c ring5 -> ring4', chainHop(R4) === 'grabbed')) return { legRows, events, cornice: CORNICE_FRAME };
if (!say('leg6d ring4 -> ring3', chainHop(R3) === 'grabbed')) return { legRows, events, cornice: CORNICE_FRAME };
{
  /* Down via the LOWER chain — the level's own return path ("gives the swing a return"): from
     ring 3, bail south and E-grab the lower ring at (-1.5, 11.9, 9.5), then crouch-drop 4.0 m
     onto the obelisk plinth (6.3) at 14.2 m/s — under the threshold. Bailing straight down onto
     the massif instead costs 18.2 HARD from the hang (measured), because every surface except
     the lintel and this plinth-via-lower-ring line is past the 4.75 m walk-off crossover. */
  const LOWER = [-1.5, 11.9, 9.5];
  let down = chainHop(LOWER) === 'grabbed';
  if (down) {
    for (let i = 0; i < 90 && c.stateName === 'hookSwing'; i++) step((inp) => { inp.hold('crouch'); });
    engine.input.let_go('crouch');
    for (let i = 0; i < 120 && !c.grounded; i++) step(() => {});
  }
  for (let i = 0; i < 60 && !c.grounded; i++) step(() => {});
  const onMassif = c.grounded && c.position.y > 4.6 && c.position.y < 9.6 && Math.abs(c.position.x) < 7.5 && c.position.z > 6 && c.position.z < 18;
  if (!say('leg6e ring3 -> lower ring -> plinth (soft)', onMassif)) return { legRows, events, cornice: CORNICE_FRAME };
}


/* leg 7: down the terrace's own south line — stage-2 south edge (3.2 m, soft), the stage-1 deck,
   then the WALKABLE flight-1 ramp to paving. Every drop on this line is under the 4.75 m
   crossover; the previous east-edge script took an unidentified 16 m drop at 28.4 HARD. */
for (let i = 0; i < 300 && c.position.y > 5.6; i++) step((inp) => { inp.move.y = 1; aim(engine, c, 0.5, 16.2); inp.let_go('crouch'); });
/* sneak the last two stages: at run speed the walk-off launches clear over the stage-1 deck and
   the ramp both, turning a 3.2 m soft ladder into a single 15.2 m/s arrival (measured) */
for (let i = 0; i < 500 && c.position.y > 2.3; i++) step((inp) => { inp.move.y = 1; aim(engine, c, 0.5, 18.0); inp.hold('sneak'); });
for (let i = 0; i < 900 && c.position.y > 0.3; i++) step((inp) => { inp.move.y = 1; aim(engine, c, 0, 23.5); inp.hold('sneak'); });
engine.input.let_go('sneak');
for (let i = 0; i < 60 && !c.grounded; i++) step(() => {});
ok = c.grounded && c.position.y < 0.4;
say('leg7a massif -> courtyard via the south ramp (all soft)', ok);
ok = ok && floodWalk(0, 0, -18) && walkTo(0, -20, 1.5, 500);
if (!say('leg7b courtyard -> south doorway -> hall floor', ok && c.position.y < 0.5)) return { legRows, events, cornice: CORNICE_FRAME };

/* leg 8: hall floor -> inner gate -> descent landing -> tomb stair -> vault floor */
ok = walkTo(0, -52, 1.5, 900) && walkTo(0, -56.5, 1.2, 400);
say('leg8a hall -> inner gate -> descent landing', ok);
ok = ok && walkTo(0, -57.9, 0.9, 300, true);                       // stair head (A_HEAD 0)
for (const [wx, wz] of [[-2.5, -57.7], [-5.5, -56.6], [-8.5, -56.7], [-11.0, -57.2], [-9.9, -57.9], [-6.0, -57.9], [-2.0, -57.9], [0.2, -57.9]]) {
  if (!ok) break;
  ok = walkTo(wx, wz, 0.9, 500, true);
}
if (!say('leg8b descent -> vault floor', ok && c.position.y < -10.0)) return { legRows, events, cornice: CORNICE_FRAME };

/* leg 9: vault floor -> around the sarcophagus -> THE EYE OF RA (0, -11.20, -74.30) */
ok = walkTo(0, -60.5, 1.2, 400) && walkTo(-4.5, -66, 1.4, 500) && walkTo(-5, -71, 1.4, 500) && walkTo(-2.5, -74.3, 1.2, 500) && walkTo(0, -74.3, 1.0, 400);
say('leg9  vault -> the Eye of Ra', ok && Math.abs(c.position.y + 11.2) < 1.6);

console.log(`\n=== hook steals onto unauthored rings during the run: ${steals} ===`);
console.log('\n--- landings ---');
console.log(events.join('\n') || '(none)');
console.log(`\ntotal ${FRAME} frames = ${(FRAME / 60).toFixed(1)} s of game time`);

  return { legRows, events, cornice: CORNICE_FRAME };
  })();
  const okAll = legRows.length > 0 && legRows.every((r) => r.startsWith('OK'));
  /* zero hard landings on the ASCENT (spawn through the cornice) — the descent's grace is the
     driver's, per the domain lines */
  const ascentHards = events.filter((e) => {
    const m = e.match(/^f(\d+) landed ([\d.]+)/);
    return m && +m[1] <= (cornice < 0 ? Infinity : cornice) && +m[2] >= TUNE.landHard;
  });
  assert.equal(ascentHards.length, 0,
    'hard landing(s) on the ascent: ' + ascentHards.join(' · ') + ' — a beat the route requires now costs control');
  console.log('\n[spawn2eye] leg table:');
  for (const r of legRows) console.log('  ' + r);
  assert.ok(okAll, 'the drive stopped at: ' + (legRows.find((r) => r.startsWith('STOP')) || '(no legs ran)'));
  const finalD = Math.hypot(c.position.x - 0, c.position.z + 74.3);
  assert.ok(finalD < 2.0 && Math.abs(c.position.y + 11.2) < 1.8,
    'the drive "completed" but did not end at the Eye: ' + f3(c.position));
});
