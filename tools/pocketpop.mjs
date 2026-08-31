#!/usr/bin/env node
/**
 * pocketpop.mjs — §742. Where do the popped coins come from, and do they reach him?
 *
 * The owner asked for coins that *"physically pop out from behind the guard"* and then *"go
 * directly to the character"*. Both halves are measurable and both are measured here, on the
 * SHIPPED path — `Guard.pickpocket()` → `guardPickpocket` → `Pickups._popPocket` →
 * `Pickups.update` — with nothing stubbed and nothing teleported.
 *
 * ── The four questions, and the instrument for each ──────────────────────────────────────────
 *
 *   RIG      Where does the spawn come from? Every roster guard's `hips` bone world position
 *            against the authored `pocketPosition`, plus `dot(spawn − position, forward)` and
 *            the spawn's height above his feet. "Derived from the rig" and "behind him" and "not
 *            his head" are then numbers rather than claims about code I wrote (§435.4: a probe
 *            written from my model of the rig would only test the model).
 *
 *   WALL     §418.3's failing input for the spawn, driven rather than argued. Each guard is
 *            walked backwards into REAL level geometry — found by raycast, not typed — until his
 *            pouch offset points into masonry, and the spawn is tested against the drawn
 *            triangle soup with `coinfit.poseTest`. `--nowall` defeats the sweep in
 *            `Guard._pocketWorld` so the arm can be SEEN to fail; an arm that only ever passes
 *            is not measuring anything (§418.3, §439).
 *
 *   FLIGHT   Does the beat land? Every guard robbed, then `Pickups.update` stepped until the
 *            pool empties, reporting the frame each coin reached him, the peak distance it got
 *            from the pouch (the "pop" the owner asked to see) and the peak distance from the
 *            straight line pouch→chest (the BOW — the difference between thrown and teleported).
 *            A run with the player retreating at sprint speed is included, because the flight
 *            speed is borrowed from the magnet on the grounds that it beats a sprint.
 *
 *   ECONOMY  The wallet, the purse and the module wallet across a scripted steal with the real
 *            HUD and the real PlayerHealth subscribed. The behavioural version of this is
 *            `tests/pocketpop.test.mjs` E1/E2; this prints it beside the flight so one run shows
 *            both, and it is the number the whole feature is most likely to get wrong.
 *
 * ── The instrument's own controls run first (§439/§440) ──────────────────────────────────────
 * `coinfit.controls()` plants four placements of known answer on a real wall mesh and puts them
 * through `poseTest`. If any disagrees this tool ABORTS rather than printing a table: a predicate
 * that cannot be shown to say CROSS on a buried coin and "clear" on an airborne one is not
 * evidence about a spawn point.
 *
 *   node tools/pocketpop.mjs                 rig + wall + flight + economy
 *   node tools/pocketpop.mjs --nowall        defeat the pouch sweep (the WALL arm must go red)
 *   node tools/pocketpop.mjs --skip-soup     rig + flight + economy only (no drawn-soup boot)
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { realWorld, DT } from '../tests/_moveset.mjs';
import { Guards } from '../src/ai/Guard.js';
import { STATE } from '../src/ai/Patrol.js';
import { Pickups, POCKET, TUNE, popCount } from '../src/world/Pickups.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const NOWALL = flag('nowall');
const SKIP_SOUP = flag('skip-soup');

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const f3 = (v) => `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;

/* ------------------------------------------------------------------ boot -- */

/**
 * The world with GUARDS and PICKUPS wired the way `main.js` wires them.
 *
 * `tests/_moveset.mjs`'s `realWorld()` boots terrain, architecture, props and one BVH but
 * registers neither module — `Pickups.update` reads the player through `engine.get('movement')`
 * and `Guards._hookEvents` is what turns the `pickpocket` intent into a steal. `tools/coinwalk.mjs`
 * already needed the `movement` line; this adds `guards`, and nothing about the pop, the pouch
 * sweep or the flight is stubbed.
 */
async function popWorld() {
  const w = await realWorld();
  const { engine, collision } = w;
  const guards = new Guards(engine);
  await guards.init();
  const mv = { position: V(0, 0, 0) };
  const inner = engine.get.bind(engine);
  engine.get = (m) => (m === 'guards' ? guards
    : m === 'movement' ? mv
    : m === 'collision' ? collision : inner(m));
  const pickups = new Pickups(engine);
  await pickups.init();
  return { ...w, guards, pickups, mv };
}

/** Put a guard back in a state that can be robbed. The roster latches `looted` per guard. */
function armed(g) {
  g.looted = false;
  g.state = STATE.PATROL;
  g._updatePocket();
  g.root.updateMatrixWorld(true);
  return g;
}

/* ------------------------------------------------------------------- rig -- */

function rigCensus(guards) {
  const rows = [];
  const w = new THREE.Vector3(), pw = new THREE.Vector3();
  for (const g of guards.guards) {
    armed(g);
    const bone = g.bones?.hips || g.bones?.Hips || g.bones?.pelvis || g.bones?.mixamorigHips || null;
    const hip = bone ? w.setFromMatrixPosition(bone.matrixWorld).clone() : null;
    g._pocketWorld(pw);
    rows.push({
      id: g.id, type: g.type, bone: bone ? 'hips' : 'NONE',
      dyHip: hip ? g.pocketPosition.y - hip.y : NaN,
      dxzHip: hip ? Math.hypot(hip.x - g.position.x, hip.z - g.position.z) : NaN,
      spawn: pw.clone(),
      behind: pw.clone().sub(g.position).dot(g.forward),
      up: pw.y - g.position.y,
      headY: g.headY - g.position.y,
    });
  }
  return rows;
}

/* ---------------------------------------------------------------- flight -- */

/**
 * Rob `g` and step PICKUPS until the pool empties. The player is placed where a steal actually
 * happens — inside `pocketRange` of the pouch, in front of him — unless `drive` moves him.
 *
 * → per-coin: the frame it was absorbed, the farthest it got from the pouch, and the farthest it
 *   strayed from the straight line pouch→chest.
 */
function flight(pickups, g, mv, { retreat = 0, frames = 300 } = {}) {
  armed(g);
  const chest0 = mv.position.clone(); chest0.y += TUNE.grabHeight;
  const loot = g.pickpocket();
  if (!loot) return null;
  const pouch = pickups.pocketCoins.slice(0, pickups._popLive).map((c) => c.pos.clone())[0]?.clone()
    || g.pocketPosition.clone();
  const n = pickups._popLive;
  const track = [];
  for (let i = 0; i < n; i++) {
    track.push({ rec: pickups.pocketCoins[i], born: pickups.pocketCoins[i].born, peak: 0, bow: 0, frame: -1 });
  }
  const line = new THREE.Vector3(), rel = new THREE.Vector3(), proj = new THREE.Vector3();
  for (let f = 0; f < frames && pickups._popLive > 0; f++) {
    if (retreat) mv.position.z += retreat * DT;
    const chest = mv.position.clone(); chest.y += TUNE.grabHeight;
    line.subVectors(chest, pouch);
    const llen = line.length() || 1;
    for (const t of track) {
      if (t.frame >= 0) continue;
      const c = t.rec;
      if (c.born !== t.born) { t.frame = f; continue; }   // slot was retired and reused
      const d = c.pos.distanceTo(pouch);
      if (d > t.peak) t.peak = d;
      rel.subVectors(c.pos, pouch);
      proj.copy(line).multiplyScalar(rel.dot(line) / (llen * llen));
      const bow = rel.distanceTo(proj);
      if (bow > t.bow) t.bow = bow;
    }
    pickups.update(DT, f * DT);
    for (const t of track) if (t.frame < 0 && t.rec.born !== t.born) t.frame = f + 1;
  }
  for (const t of track) if (t.frame < 0) t.frame = -1;
  return { loot, n, pouch, track, left: pickups._popLive };
}

/* ------------------------------------------------------------------ main -- */

const t0 = Date.now();
process.stdout.write(`· booting the level (guards + pickups)${NOWALL ? '   [--nowall: the pouch sweep is DEFEATED]' : ''}\n`);
const { engine, collision, guards, pickups, mv } = await popWorld();
process.stdout.write(`· ${guards.guards.length} guards · ${pickups.coins.length} authored coins · `
  + `coin mesh capacity ${pickups._coinMesh.instanceMatrix.count} instances, `
  + `drawing ${pickups._coinMesh.count}  ${((Date.now() - t0) / 1000).toFixed(1)}s\n\n`);

/* ---- RIG ---- */
process.stdout.write('RIG — where the spawn comes from\n');
process.stdout.write('  guard   type    bone   pocketUp vs hips   spawn (world)                  behind   up     head\n');
for (const r of rigCensus(guards)) {
  process.stdout.write(`  ${r.id.padEnd(7)} ${r.type.padEnd(7)} ${r.bone.padEnd(6)} `
    + `${Number.isFinite(r.dyHip) ? `dy ${r.dyHip >= 0 ? '+' : ''}${r.dyHip.toFixed(3)} m` : '     —     '}       `
    + `${f3(r.spawn).padEnd(29)}  ${r.behind >= 0 ? '+' : ''}${r.behind.toFixed(3)}  ${r.up.toFixed(3)}  ${r.headY.toFixed(2)}\n`);
}
process.stdout.write('\n  `behind` is dot(spawn − guard.position, guard.forward): NEGATIVE is behind his facing.\n');
process.stdout.write('  `up` is the spawn height above his feet; `head` is his own head height for comparison.\n\n');

/* ---- WALL ---- */
let W = null, C = null;
if (!SKIP_SOUP) {
  const { poseTest, controls, coinGeom, worldSoup } = await import('./coinfit.mjs');
  process.stdout.write('· building the DRAWN triangle soup (props included) for the spawn test\n');
  W = await worldSoup();
  C = coinGeom(TUNE.coinRadius);
  process.stdout.write(`  world: ${W.meshCount} drawn meshes → ${W.triCount.toLocaleString()} triangles · `
    + `coin: ${C.triCount} tris, swept radius ${Math.hypot(C.r, C.t / 2).toFixed(4)}\n`);

  const { seed, out: ctrl } = controls(W, C);
  process.stdout.write(`\nCONTROLS on \`${seed.mesh}\` tri ${seed.tri} (area ${seed.area.toFixed(4)} m²)\n`);
  let bad = 0;
  for (const r of ctrl) {
    const ok = r.got === r.want;
    if (!ok) bad++;
    process.stdout.write(`  ${r.name.padEnd(11)} want ${r.want ? 'CROSS   ' : 'no cross'}  `
      + `got ${r.got ? 'CROSS   ' : 'no cross'}  ${ok ? 'OK ' : 'FAIL'}  ${r.note || `(clear ${r.clear.toFixed(3)} m)`}\n`);
  }
  if (bad) {
    process.stderr.write(`\npocketpop: ABORTING — ${bad} instrument control(s) failed. A predicate that `
      + 'cannot be shown to answer correctly on inputs of known answer is not evidence about a spawn.\n');
    process.exit(2);
  }

  process.stdout.write('\nWALL — §418.3\'s failing input: a guard backed into real level geometry\n');
  /**
   * ── WHICH GEOMETRY THE VERDICT IS ABOUT, because there are two sets and they disagree ──────
   *
   * `Guard._pocketWorld`'s sweep is a `Collision` query, so the thing it can be held to is the
   * COLLIDER set: after the sweep, no collider tagged solid may overlap the spawn at the coin's
   * own swept radius. That is the `collider` column and it is the arm's actual bar.
   *
   * The `drawn` column is `coinfit.poseTest` against the drawn triangle soup, and it is
   * ADVISORY. §732.4 measured these two sets disagreeing on this level in both directions — 7 of
   * 14 drawn-buried coins invisible to `Collision.overlap`, and 4 collider-buried coins drawn
   * clear — because the coarse `proxy:wall`/`proxy:ground` boxes neither cover the detail meshes
   * nor stop at the paving. **A drawn cross beside a clear collider is therefore NOT evidence
   * that the sweep failed**; it is evidence that the level's two representations differ, which
   * §732 already established and this section does not attempt to fix. It is printed because
   * hiding it would be worse, not because the sweep is answerable for it.
   *
   * `ground` is excluded from the collider mask deliberately: §732.4 measured
   * `Collision.overlap` calling four perfectly clear coins buried against `proxy:ground` under
   * the courtyard. A pouch at 0.62 m is not standing in the floor.
   *
   * Two gaps, and the pair is the point. **0.55 m** is the winnable one: `pocketBack` is 0.34
   * and a coin's swept radius is 0.2414, so ~0.58 m is the least space in which a whole coin
   * fits behind him. **0.22 m** is deliberately UNWINNABLE — the volume behind him is narrower
   * than the coin — and is here so the first number cannot be read as "it always passes".
   */
  const SOLID = ['wall', 'ledge', 'pole', 'misc'];
  const GAPS = [0.55, 0.22];
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  const rows = [];
  for (const g of guards.guards) {
    armed(g);
    const home = g.position.clone(), homeYaw = g.yaw;
    let found = null;
    for (let a = 0; a < 24 && !found; a++) {
      const th = (a / 24) * Math.PI * 2;
      _d.set(Math.sin(th), 0, Math.cos(th));
      _o.copy(g.position); _o.y += 0.62;
      const hit = collision.raycast(_o, _d, 6.0, null);
      if (hit?.hit && hit.distance > 0.9 && hit.tag !== 'ground') found = { dir: _d.clone(), d: hit.distance, tag: hit.tag };
    }
    if (!found) { g.position.copy(home); continue; }
    const face = _o.clone().addScaledVector(found.dir, found.d);   // the surface point, on the ray

    for (const gap of GAPS) {
      g.position.copy(home).addScaledVector(found.dir, found.d - gap);
      g.yaw = Math.atan2(-found.dir.x, -found.dir.z);
      g.forward.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
      g.root.position.copy(g.position);
      g.root.rotation.set(0, g.yaw, 0);
      g.root.updateMatrixWorld(true);
      g._updatePocket();

      const raw = g.pocketPosition.clone();
      const spawn = new THREE.Vector3();
      if (NOWALL) spawn.copy(raw);              // exactly `_pocketWorld` minus its sweep
      else g._pocketWorld(spawn);
      /* Signed depth PAST the collider surface along its own normal. Positive is inside. */
      const depth = (p) => p.clone().sub(face).dot(found.dir);
      const hits = (p) => collision.overlap(p, Math.hypot(C.r, C.t / 2), SOLID).length;
      /* Is the GUARD HIMSELF in drawn geometry in this pose? He is placed by a COLLIDER
         raycast, and §732.4 says the two sets differ — so if his own hip crosses, the drawn
         column below is a fact about this rig and not about the spawn. Attributing it is the
         difference between a number and a number that means something. */
      const hip = g.position.clone(); hip.y += 0.62;
      rows.push({
        id: g.id, tag: found.tag, gap,
        rawCol: hits(raw), spawnCol: hits(spawn),
        rawDrawn: !!poseTest(W, C, { x: raw.x, y: raw.y, z: raw.z }).cross,
        spawnDrawn: !!poseTest(W, C, { x: spawn.x, y: spawn.y, z: spawn.z }).cross,
        bodyDrawn: !!poseTest(W, C, { x: hip.x, y: hip.y, z: hip.z }).cross,
        rawD: depth(raw), spawnD: depth(spawn), moved: raw.distanceTo(spawn),
      });
    }
    g.position.copy(home); g.yaw = homeYaw;
    g.forward.set(Math.sin(homeYaw), 0, Math.cos(homeYaw));
    g.root.position.copy(home); g.root.rotation.set(0, homeYaw, 0); g.root.updateMatrixWorld(true);
    g._updatePocket();
  }
  for (const gap of GAPS) {
    const set = rows.filter((r) => r.gap === gap);
    process.stdout.write(`\n  gap ${gap.toFixed(2)} m behind his back  (${set.length} guards found a wall)\n`);
    process.stdout.write('    guard         surface   RAW pouch                      SWEPT spawn                    moved\n');
    for (const r of set) {
      process.stdout.write(`    ${r.id.padEnd(7)} vs ${String(r.tag).padEnd(6)}  `
        + `col ${String(r.rawCol).padStart(2)} drawn ${r.rawDrawn ? 'X' : '·'} d ${r.rawD >= 0 ? '+' : ''}${r.rawD.toFixed(3)}   →   `
        + `col ${String(r.spawnCol).padStart(2)} drawn ${r.spawnDrawn ? 'X' : '·'} d ${r.spawnD >= 0 ? '+' : ''}${r.spawnD.toFixed(3)}   `
        + `${r.moved.toFixed(3)} m\n`);
    }
    const sum = (k) => set.reduce((a, r) => a + r[k], 0);
    const cnt = (k) => set.filter((r) => r[k]).length;
    process.stdout.write(`    → colliders overlapping: raw ${sum('rawCol')} → swept ${sum('spawnCol')}   `
      + `(THE BAR: swept must be 0)\n`);
    process.stdout.write(`      drawn crossings (advisory, §732.4): raw ${cnt('rawDrawn')}/${set.length} → `
      + `swept ${cnt('spawnDrawn')}/${set.length}   `
      + `— of which ${cnt('bodyDrawn')}/${set.length} have the GUARD'S OWN HIP inside drawn geometry\n`);
  }
  process.stdout.write(NOWALL
    ? '\n  --nowall: the SWEPT column IS the raw offset, so the two must be identical. If the swept\n'
      + '  run reads the same, the sweep is decoration and this tool is not measuring it.\n'
    : '\n  Re-run with --nowall: the SWEPT column must collapse onto the RAW column, or nothing above\n'
      + '  discriminates. `col` is solid colliders overlapping the spawn at the coin\'s swept radius\n'
      + '  (the bar); `drawn` is `poseTest` against the drawn soup (advisory — see the note in source);\n'
      + '  `d` is signed metres past the collider surface along its own normal.\n');
}

/* ---- FLIGHT ---- */
process.stdout.write('\nFLIGHT — every guard robbed, then stepped until the pool empties\n');
process.stdout.write('  guard   type    loot  discs   absorbed (frames)      pop reach   bow    beat\n');
for (const g of guards.guards) {
  /* Stand where a steal actually happens: in front of him, inside `pocketRange`. */
  mv.position.copy(g.position).addScaledVector(g.forward, 1.5);
  const r = flight(pickups, g, mv);
  if (!r) { process.stdout.write(`  ${g.id}: refused the steal\n`); continue; }
  const fr = r.track.map((t) => t.frame);
  const worst = Math.max(...fr);
  process.stdout.write(`  ${g.id.padEnd(7)} ${g.type.padEnd(7)} ${String(r.loot.coins).padStart(4)}  `
    + `${String(r.n).padStart(2)}     ${fr.join(',').padEnd(22)} `
    + `${Math.max(...r.track.map((t) => t.peak)).toFixed(2)} m     `
    + `${Math.max(...r.track.map((t) => t.bow)).toFixed(2)} m  ${(worst * DT).toFixed(2)} s`
    + `${r.left ? `   **${r.left} NEVER ARRIVED**` : ''}\n`);
  while (pickups._popLive > 0) pickups._popFree(pickups._popLive - 1);
}

/* The retreating player: the flight speed is borrowed from `TUNE.speedMax` on the stated grounds
   that it is 2x runSpeed and beats a sprint. That is an argument until it is driven. */
const gr = guards.guards[1];
mv.position.copy(gr.position).addScaledVector(gr.forward, 1.5);
const runSpeed = TUNE.speedMax / 2;
const rr = flight(pickups, gr, mv, { retreat: runSpeed, frames: 400 });
process.stdout.write(`\n  RETREAT — the same steal with the player sprinting away at ${runSpeed.toFixed(1)} m/s `
  + `(TUNE.speedMax / 2):\n    absorbed at frames ${rr.track.map((t) => t.frame).join(',')} `
  + `(${(Math.max(...rr.track.map((t) => t.frame)) * DT).toFixed(2)} s), ${rr.left} never arrived\n`);
while (pickups._popLive > 0) pickups._popFree(pickups._popLive - 1);

/* ---- ECONOMY ---- */
process.stdout.write('\nECONOMY — one scripted steal, with the real HUD and the real PlayerHealth subscribed\n');
const { installDom, fakeEngine } = await import('../tests/_hudshim.mjs');
installDom();
const { HUD } = await import('../src/ui/HUD.js');
const { Health, CHARM } = await import('../src/player/Health.js');
const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
const eco = fakeEngine(cam);
/* `Pickups.init` adds its root to a scene and reads `movement`; `fakeEngine` has neither. */
eco.scene = new THREE.Group();
eco.get = (m) => (m === 'movement' ? { position: V(0, 0, 0) } : null);
const hud = new HUD(eco); await hud.init();
const hp = new Health(eco); await hp.init();
const pk = new Pickups(eco); await pk.init();
let coinEvents = 0;
eco.on('coin', () => { coinEvents++; });
/* The purse rolls over into a charm at 100, so "banked" is purse + charms x price. */
const banked = () => hp.purse + hp.charms * CHARM.charmCoins;
const LOOT = 137;
/**
 * ONE update before the steal, and it is not a formality.
 *
 * `Pickups.update` publishes `coins` — the ABSOLUTE-set channel — exactly once, on its first
 * frame, to sync the HUD to its own starting purse. `HUD.on('coins')` is `setCoins`, not
 * `addCoins`. So a steal that lands BEFORE that first update is credited and then silently
 * overwritten back to `Pickups.wallet.coins`, and this tool read `HUD wallet +0` on its first
 * run for exactly that reason. It cannot happen in the shipped game (MANIFEST updates PICKUPS
 * from frame 1 and a steal needs a guard within 2.4 m), but it is a real property of the wiring
 * and it is written down here rather than being quietly stepped around — see §742.
 */
pk.update(DT, 0);
const w0 = hud.coins, p0 = banked(), m0 = pk.wallet.coins;
eco.emit('guardPickpocket', {
  id: 'eco', coins: LOOT, item: 'brass key',
  pos: V(0, 0, 2), pocket: V(0, 0.62, 2.34), forward: V(0, 0, -1),
});
const popped = pk._popLive;
for (let f = 0; f < 300 && pk._popLive > 0; f++) pk.update(DT, f * DT);
process.stdout.write(`  a roll of ${LOOT} popped ${popped} discs (popCount says ${popCount(LOOT)}); pool now ${pk._popLive}\n`);
process.stdout.write(`  HUD wallet     +${hud.coins - w0}   (must be exactly ${LOOT})\n`);
process.stdout.write(`  charm purse    +${banked() - p0}   (must be exactly ${LOOT})\n`);
process.stdout.write(`  Pickups.wallet +${pk.wallet.coins - m0}     (must be exactly 0 — a steal has never fed it)\n`);
process.stdout.write(`  'coin' events   ${coinEvents}     (must be 0 — a chime for a payment that did not happen)\n`);

process.stdout.write(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
