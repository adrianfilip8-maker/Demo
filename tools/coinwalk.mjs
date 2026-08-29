#!/usr/bin/env node
/**
 * coinwalk.mjs — §732. Does a driven player actually COLLECT it?
 *
 * `tools/coinmove.mjs` proposes destinations from a model: drawn-triangle clearance plus a
 * `groundCheck` under the spot. §435.4 is exactly about that — a probe written from my picture
 * of the level tests the picture. This drives the real `Controller` with `input.move`, through
 * the real `Collision`, into the real `Pickups.update`, and reports the frame the collection
 * fired. Nothing is teleported to the coin: `hardReset` places the capsule at a START point and
 * the stick is held from there.
 *
 * ── The wiring is the shipped wiring, not a shim ─────────────────────────────────────────────
 * `tests/_moveset.js`'s `realWorld()` boots terrain, architecture, props and collision but not
 * `Pickups` — no test needed it before. `Pickups.update` reads the player through
 * `engine.get('movement')`, which is exactly how `src/main.js` registers the Controller
 * (MANIFEST line 112), so this adds that one entry to the module map and builds `Pickups` the
 * way the game does. Nothing about `stepPickup`, the magnet or the collect radius is stubbed;
 * poking `pickups._playerPos` directly would have been a shim and would have tested this file.
 *
 *   node tools/coinwalk.mjs                     drive to every coin `coinfit` calls buried
 *   node tools/coinwalk.mjs --spots a.json      drive to the placements in a JSON list
 *   node tools/coinwalk.mjs --from 0,0,30 --to 1.2,2.4,22.4
 */
import './_domshim.mjs';
import * as THREE from 'three';
import fs from 'node:fs';
import { realWorld, hardReset, DT } from '../tests/_moveset.mjs';
import { Pickups, TUNE } from '../src/world/Pickups.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Boot the world with PICKUPS wired the way `main.js` wires it. */
export async function pickupWorld() {
  const w = await realWorld();
  const { engine, c } = w;
  /* The one line `realWorld` is missing: MANIFEST registers the Controller as `movement`, and
     `Pickups.update` reads the player position through it. */
  if (!engine._movementPatched) {
    const inner = engine.get.bind(engine);
    engine.get = (m) => (m === 'movement' ? engine._ctl : inner(m));
    engine._movementPatched = true;
  }
  engine._ctl = c;
  const pickups = new Pickups(engine);
  await pickups.init();
  return { ...w, pickups };
}

/** Input is camera-relative (`Controller._readInput`, §6.1), so steering means aiming the camera. */
function aimAt(engine, t, from) {
  const dx = t.x - from.x, dz = t.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
}

/**
 * Walk from `start` toward `goal`, holding forward, jumping when horizontal progress stalls.
 * `coin` is the live pickup record; the result is the frame `taken` latched, or -1.
 *
 * The same straight-line driver `tests/collectroute.test.mjs` uses, and it inherits that file's
 * asymmetry verbatim: **a collection is proof; a miss is a candidate, not a verdict**, because
 * the missing thing may be a verb this driver has no script for.
 */
export function walkTo(engine, c, pickups, start, goal, coin, frames = 700) {
  hardReset(engine, c, start.clone());
  let took = -1, best = Infinity, stuck = 0, lastD = Infinity;
  for (let i = 0; i < frames && took < 0; i++) {
    aimAt(engine, goal, c.position);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (stuck > 12) { if (i % 18 < 3) engine.input.hold('jump'); else engine.input.let_go('jump'); }
    engine.time = i * DT;
    c.update(DT, i * DT);
    pickups.update(DT, i * DT);
    if (coin?.taken) took = i;
    const d = c.position.distanceTo(goal);
    if (d < best) best = d;
    stuck = (lastD - d) < 0.004 ? stuck + 1 : 0;
    lastD = d;
  }
  return { took, best, end: c.position.clone(), state: c.sm?.name };
}

/** A start point `back` metres from the coin, on whatever ground is under it. */
export function approachFrom(collision, goal, back = 5.0, azimuth = 0) {
  const dir = V(Math.cos(azimuth), 0, Math.sin(azimuth));
  const p = goal.clone().addScaledVector(dir, back);
  const g = collision.groundCheck(V(p.x, goal.y + 2.0, p.z), 0.34, 40);
  return V(p.x, (g?.hit ? g.y : 0) + 0.02, p.z);
}

/* ---------------------------------------------------------------- CLI ---- */
if (process.argv[1] && process.argv[1].endsWith('coinwalk.mjs')) {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const { engine, c, collision, pickups } = await pickupWorld();
  process.stdout.write(`· pickups: ${pickups.coins.length} coins, ${pickups.clues.length} clues, ` +
    `${pickups.treasures.length} treasures  ·  collect ${TUNE.collect} magnet ${TUNE.magnet}\n`);

  /**
   * ── §418.3 DOMAIN, run in-arm on every invocation ─────────────────────────────────────────
   * passes on : a live coin 3 m in front of the start point on the courtyard floor — the driver
   *             walks to it and `Pickups.update` latches `taken`.
   * fails  on : the SAME coin record parked 40 m out over the open desert behind spawn, with the
   *             same walk. If that reports a collection, "COLLECTED" is not measuring arrival —
   *             it is measuring that the harness ran. This is `collectroute` V1's counterexample
   *             borrowed wholesale, and it is the only thing standing between this tool and the
   *             class of instrument §439 is about.
   * does NOT  : say a coin is reachable FROM SPAWN. Each drive starts a few metres out on local
   * discrim.    ground; connectivity is `tests/collectroute.test.mjs`'s claim, not this one.
   */
  {
    const probe = pickups.coins[0];
    const home = probe.pos.clone();
    const near = V(0, 0.90, 26.0);
    probe.taken = false; probe.magnet = false; probe.pos.copy(near);
    const pass = walkTo(engine, c, pickups, V(0, 0.02, 30), near, probe, 400);
    const far = V(0, 0.90, 70.0);
    probe.taken = false; probe.magnet = false; probe.pos.copy(far);
    const fail = walkTo(engine, c, pickups, V(0, 0.02, 30), near, probe, 400);
    probe.taken = false; probe.magnet = false; probe.pos.copy(home);
    process.stdout.write(`· CONTROL  pass-input: coin 4 m ahead -> ${pass.took >= 0 ? `collected at frame ${pass.took}` : 'NOT collected'}\n` +
      `· CONTROL  fail-input: same coin 40 m behind spawn -> ${fail.took >= 0 ? `collected at frame ${fail.took}` : 'not collected'} ` +
      `(closest ${fail.best.toFixed(2)} m)\n`);
    if (!(pass.took >= 0) || fail.took >= 0) {
      throw new Error('coinwalk: the driver failed its own controls — nothing below is a measurement');
    }
  }

  const spotsArg = arg('--spots');
  const list = spotsArg
    ? JSON.parse(fs.readFileSync(spotsArg, 'utf8'))
    : JSON.parse(fs.readFileSync(arg('--json') || '/dev/stdin', 'utf8'));

  let ok = 0;
  for (const s of list) {
    const goal = V(s.x, s.y, s.z);
    /* Find the live pickup record nearest the target, so the collection reported is THAT coin's. */
    let coin = null, bd = Infinity;
    for (const k of pickups.coins) { const d = k.pos.distanceTo(goal); if (d < bd) { bd = d; coin = k; } }
    if (bd > 0.05) { process.stdout.write(`  (${s.x},${s.y},${s.z}) has no live coin within 5 cm (nearest ${bd.toFixed(2)} m)\n`); continue; }
    let best = null;
    for (const az of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const back of [3.0, 5.0, 7.0]) {
        coin.taken = false; coin.magnet = false; coin.pos.copy(goal);
        const r = walkTo(engine, c, pickups, approachFrom(collision, goal, back, az), goal, coin);
        if (!best || (r.took >= 0 && best.took < 0) || (r.took >= 0 && r.took < best.took)) best = { ...r, az, back };
        if (r.took >= 0) break;
      }
      if (best?.took >= 0) break;
    }
    coin.taken = false; coin.pos.copy(goal);
    process.stdout.write(`  ${s.label ?? ''} (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})  ` +
      `${best.took >= 0 ? `COLLECTED at frame ${best.took} (from ${best.back} m, az ${(best.az * 180 / Math.PI).toFixed(0)}°)`
        : `never collected — closest ${best.best.toFixed(2)} m, ended ${best.state}`}\n`);
    if (best.took >= 0) ok++;
  }
  process.stdout.write(`\n  ${ok}/${list.length} collected by a driven player\n`);
  process.exit(0);
}
