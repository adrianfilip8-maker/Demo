#!/usr/bin/env node
/**
 * sightceil.mjs — the vertical limit on a guard's sight: its number, and what it changes. §748.
 *
 *   node tools/sightceil.mjs --height    # only §A: measure Carmelita's drawn height
 *   node tools/sightceil.mjs --table     # only §B: the pure-unit detection table on `Senses`
 *   node tools/sightceil.mjs --drive     # only §C: the same question through the REAL controller
 *   node tools/sightceil.mjs --cone      # only §D: the DRAWN cone against the sensed volume
 *   node tools/sightceil.mjs             # all four
 *
 * Reads committed assets and builds the shipped level in plain Node. No fetch, no lock, no
 * browser, no renderer.
 *
 * ── what this answers, and why each half needs an instrument ────────────────────────────────
 *
 * §A **How tall is Carmelita, at the scale she ships at?** The owner chose her height as the
 *    ceiling. Two traps are on the record for this exact character and both are avoided by
 *    construction rather than by care:
 *      · §709 — identity in glTF lives on the NODE. The placement scale is read off the node
 *        `instantiateNative` actually writes it to (`rig.scale`), never divided out of a box.
 *      · §704 — her head was once 99.4 % absent from the GLB. The head group's triangle count
 *        is printed beside the height, so a short box cannot pass as a measurement.
 *    Three independent expressions of the same height are printed and cross-checked: the world
 *    `Box3` over the placed rig, the merged geometry's own box times the node scale, and the
 *    rebind arm's bind-pose height (a different import path over the same source file).
 *
 * §B **What does the vertical limit change, per roster type?** A `Senses` instance per type,
 *    swept over vertical offsets and horizontal distances, reporting the fill rate. Straight
 *    overhead is a row of its own, because it is the defect's worst case: with the cone tested
 *    in the horizontal plane, `_flat` collapses under 1e-6 and the code substitutes the guard's
 *    own forward, scoring the player at angle 0 — dead centre of the bright core.
 *
 * §C **Does it hold through the real movement path?** §435.4: a probe written from the author's
 *    model of the level is a test of the model, and a player position typed into the sensing
 *    call is a test of the typist. This arm builds the SHIPPED level (Terrain, Architecture,
 *    Props, Collision), drives the real `Controller` with real input, and reads the player
 *    through `Guards._readPlayer` — the shipped contract-reader — before calling the shipped
 *    `Senses.evaluate`. Only the guard's POSE is synthetic; it is the independent variable.
 *
 * §D **Is the player being shown a lie?** The sensed volume moves in this lane and the drawn cone
 *    does not, so the disagreement has to be sized rather than asserted. Pure arithmetic over the
 *    shipped cone constants — the same expressions `_updateCones` and `BEAM_VERT` evaluate — so it
 *    needs no renderer and makes no visual claim.
 *
 * ── §418.3 DOMAIN, stated for the tool as a whole ───────────────────────────────────────────
 * Every table below is printed for BOTH arms — `sight` on (shipped) and `?sight=sky` (the
 * pre-§748 behaviour) — from the same run, so no row is a claim about one arm alone. A row
 * that reads the same in both arms is doing no work and says so.
 */
import '../tools/_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* The A/B token, for the child processes §C.3 spawns. It has to be set BEFORE `Patrol.js` is
   first imported — the token is read once at module scope, exactly as the game reads it — and
   every import in this file is dynamic and below this line, so it is. */
if (process.env.SIGHT_AB != null) globalThis.__SIGHT_AB = process.env.SIGHT_AB;

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const E2E_CHILD = argv.includes('--e2e-child');
const WANT = {
  height: !E2E_CHILD && (argv.includes('--height') || argv.length === 0),
  table: !E2E_CHILD && (argv.includes('--table') || argv.length === 0),
  drive: !E2E_CHILD && (argv.includes('--drive') || argv.length === 0),
  cone: !E2E_CHILD && (argv.includes('--cone') || argv.length === 0),
};
const A = (p) => path.join(ROOT, 'public/assets/sly-anim', p);
const f3 = (v) => (v >= 0 ? ' ' : '') + v.toFixed(3);

/* ══════════════════════════════════════════════════════════════════════════ §A ══ */

async function sectionHeight() {
  const { buildNative, instantiateNative, MOUNT_SCALE } = await import('../src/ai/CarmelitaNative.js');
  const { bindToRig3, spliceHead } = await import('../src/ai/CarmelitaGuard.js');

  const load = async (file) => {
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    const buf = readFileSync(file);
    const g = await new Promise((res, rej) => new GLTFLoader().parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
    g.scene.updateMatrixWorld(true);
    return g;
  };
  const firstGeom = (g) => { let h = null; g.scene.traverse((o) => { if (!h && o.isMesh) h = o.geometry; }); return h; };

  console.log('══ §A. Carmelita\'s height, at the scale she ships at ══\n');

  const guardA = await load(A('carmelita-guard.glb'));
  const guardB = await load(A('carmelita-guard.glb'));       // bindToRig3 mutates its scene
  const head = firstGeom(await load(A('carmelita-head-lp.glb')));
  const native = buildNative(guardA.scene, head);

  /* Is the head actually there? §704: a 96-element index over 5,000 triangles once passed for
     a head. The merged buffer's second group IS the head; count it rather than trust it. */
  const g1 = native.geometry.groups[1];
  const headTris = g1 ? g1.count / 3 : 0;
  const bodyTris = native.geometry.groups[0].count / 3;
  console.log(`  merged groups ${native.geometry.groups.length}: body ${bodyTris} tris, head ${headTris} tris`);
  console.log(`  head splice ok=${native.stats.head?.ok}  ${native.stats.head?.before} → ${native.stats.head?.after} tris`
    + `  fiducial worst ${native.stats.head?.fiducial?.worst?.toExponential(2)} m`);
  if (!(headTris > 1000)) console.log('  !! the head group is thin — do not trust the height above it');

  /* The PLACED rig, built by the shipped instantiator. The scale is read off the node it was
     written to, never recovered by dividing a box (§746). */
  const mat = new THREE.MeshBasicMaterial();
  const rig = instantiateNative(native, [mat, mat]);
  rig.root.updateMatrixWorld(true);
  const nodeScale = rig.rig.scale.clone();
  const worldBox = new THREE.Box3().setFromObject(rig.root);
  const hWorld = worldBox.max.y - worldBox.min.y;

  /* Expression 2: the unscaled merged geometry's own box, times that node scale. */
  native.geometry.computeBoundingBox();
  const bb = native.geometry.boundingBox;
  const hGeom = (bb.max.y - bb.min.y) * nodeScale.y;

  /* Expression 3: a different import path over the same source file. */
  spliceHead(guardB.scene, firstGeom(await load(A('carmelita-head-lp.glb'))));
  const rebind = bindToRig3(guardB.scene);
  rebind.geometry.computeBoundingBox();
  const hRebind = rebind.geometry.boundingBox.max.y - rebind.geometry.boundingBox.min.y;

  console.log(`\n  node scale written by instantiateNative : ${nodeScale.x} ${nodeScale.y} ${nodeScale.z}`
    + `   (MOUNT_SCALE ${MOUNT_SCALE})`);
  console.log(`  world Box3 over the placed rig          : y [${worldBox.min.y.toFixed(6)}, ${worldBox.max.y.toFixed(6)}]  →  ${hWorld.toFixed(5)} m`);
  console.log(`  merged geometry box × node scale        : ${hGeom.toFixed(5)} m   (unscaled ${(bb.max.y - bb.min.y).toFixed(5)})`);
  console.log(`  rebind arm, same source file            : ${hRebind.toFixed(5)} m`);
  console.log(`  worst disagreement of the three         : ${Math.max(
    Math.abs(hWorld - hGeom), Math.abs(hWorld - hRebind), Math.abs(hGeom - hRebind)).toExponential(2)} m`);
  console.log(`  soles at y=0 (Guard._step's assumption) : min.y ${worldBox.min.y.toExponential(2)}`);

  /* What it is being compared against — the numbers a ceiling has to clear. */
  const { VISION } = await import('../src/ai/Patrol.js');
  console.log('\n  against the numbers the ceiling has to clear:');
  console.log(`    MOVEMENT's standing capsule (Controller.TUNE.height)   1.80 m`);
  console.log(`    the drawn guard bodies (Guard.TUNE.headTop)            temple 1.95   heavy 2.22   scarab 0.34`);
  console.log(`    the sensing eyes (VISION.eyeHeight)                    temple ${VISION.temple.eyeHeight}   heavy ${VISION.heavy.eyeHeight}   scarab ${VISION.scarab.eyeHeight}`);

  return { hWorld, hGeom, hRebind, headTris };
}

/* ══════════════════════════════════════════════════════════════════════════ §B ══ */

/** Rows: vertical offset of the player's FEET above the guard's base. */
const RISES = [0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 8.0];
/** Columns: horizontal distance, guard facing the player. `0` is straight overhead. */
const DISTS = [0, 2, 6, 12];

async function sensesTable(arm, airborne = false) {
  globalThis.__SIGHT_AB = arm;
  /* Fresh module graph per arm: the token is read once at module scope, exactly as the game
     reads it. `import()` with a cache-busting query is the only way to get a second read. */
  const P = await import(`../src/ai/Patrol.js?arm=${encodeURIComponent(arm)}&n=${Math.random()}`);
  const out = {};
  for (const type of ['temple', 'heavy', 'scarab']) {
    const cfg = P.VISION[type];
    out[type] = {};
    for (const rise of RISES) {
      out[type][rise] = {};
      for (const d of DISTS) {
        const s = new P.Senses(type, 11);
        /* Guard at the origin on his own floor, facing +Z. Player rise metres up, d out. */
        const eye = new THREE.Vector3(0, cfg.eyeHeight, 0);
        const bag = {
          eye, forward: new THREE.Vector3(0, 0, 1),
          target: new THREE.Vector3(0, rise, d), targetTop: 0.95,
          baseY: 0, collision: null,
          moving: 0.36, sneaking: false, crouching: false, airborne,
          light: 0.3, alerted: false, dt: 1 / 60,
        };
        const gain = s.evaluate(bag);
        /* Hearing is a sphere and is deliberately untouched by the ceiling; separate it out so
           the vision column is a claim about vision. */
        out[type][rise][d] = { gain, saw: s.sawThisFrame, heard: s.heardThisFrame };
      }
    }
  }
  delete globalThis.__SIGHT_AB;
  return out;
}

/**
 * The MECHANISM, not the outcome (§439): what angle does the shipped code score the player at?
 * Reproduces `evaluate`'s own three lines so the number is the code's, not a paraphrase.
 */
function coneAngle(riseAboveEye, dist, lat = 0) {
  const to = new THREE.Vector3(lat, riseAboveEye, dist);
  const flat = to.clone().setY(0);
  const collapsed = flat.lengthSq() < 1e-6;
  if (collapsed) flat.set(0, 0, 1);              // the code substitutes `p.forward`
  flat.normalize();
  const fwd = new THREE.Vector3(0, 0, 1);
  return { angle: Math.acos(THREE.MathUtils.clamp(fwd.dot(flat), -1, 1)), collapsed };
}

async function sectionTable() {
  console.log('\n══ §B. the detection table — `Senses.evaluate`, both arms ══');
  console.log('  guard at the origin facing +Z; player at (0, rise, dist) STANDING on a surface');
  console.log('  at that height (airborne false), walking, moonlit, no collision (so no LOS ray can');
  console.log('  mask the geometry question). Cell = fill rate/s, `·` = not seen.\n');

  const sky = await sensesTable('sky');
  const shipped = await sensesTable('');

  for (const type of ['temple', 'heavy', 'scarab']) {
    console.log(`  ── ${type} ──`);
    console.log(`      rise │${DISTS.map((d) => (d === 0 ? '  OVERHEAD' : `      ${String(d).padStart(2)} m`)).join('')}   │${DISTS.map((d) => (d === 0 ? '  OVERHEAD' : `      ${String(d).padStart(2)} m`)).join('')}`);
    console.log(`           │${' '.repeat(DISTS.length * 10 - 20)}?sight=sky (before)   │${' '.repeat(DISTS.length * 10 - 22)}shipped (after)`);
    for (const rise of RISES) {
      const cell = (t) => DISTS.map((d) => {
        const c = t[type][rise][d];
        if (c.gain <= 0) return '         ·';
        const tag = c.saw ? ' ' : 'h';
        return `${c.gain.toFixed(3)}${tag}`.padStart(10);
      }).join('');
      console.log(`   ${rise.toFixed(2).padStart(7)} │${cell(sky)}   │${cell(shipped)}`);
    }
    console.log('');
  }

  /* ── the mechanism, so the table is not the only witness ──────────────────────────────── */
  console.log('  ── what bearing the cone maths actually scores (temple, eye 1.66) ──');
  console.log('     the vision block flattens BOTH vectors, so height cannot enter the angle at all.');
  console.log('     §418.3 DOMAIN for this probe: it must be able to say 0°, say something else, and');
  console.log('     say "outside the cone". All three appear below, and the rise column never moves it.');
  console.log('     rise above eye   fwd     lateral    angle scored   in cone?   _flat collapsed <1e-6?');
  const P = await import('../src/ai/Patrol.js');
  const core = P.VISION.temple.halfAngle, per = P.VISION.temple.peripheral;
  for (const [r, d, l] of [
    [0, 6, 0], [8, 6, 0],            // dead ahead, 8 m up: unchanged at 0°
    [0, 6, 6], [8, 6, 6],            // 45° off the nose: unchanged by 8 m of height
    [0, 2, 12], [8, 2, 12],          // 80.5° — OUTSIDE `peripheral`, so the probe can refuse
    [8, 0.5, 0], [8, 0.001, 0],      // near the axis but not collapsed: |flat|² = 1e-6, not <
    [8, 0, 0], [8, 0.0005, 0],       // and the collapse itself, inside a 1 mm radius
  ]) {
    const { angle, collapsed } = coneAngle(r, d, l);
    const where = angle <= core ? 'CORE' : angle <= per ? 'periph' : 'outside';
    console.log(`     ${String(r).padStart(6)} m ${String(d).padStart(8)} m ${String(l).padStart(8)} m   ${(angle * 180 / Math.PI).toFixed(2).padStart(9)}°`
      + `   ${where.padEnd(9)} ${collapsed ? 'YES — substitutes p.forward' : 'no'}`);
  }
  console.log(`     core half-angle ${(core * 180 / Math.PI).toFixed(1)}°, peripheral ${(per * 180 / Math.PI).toFixed(1)}°.`);
  console.log('     Every pair above reads IDENTICALLY at rise 0 and rise 8: height is absent from');
  console.log('     the bearing, so the sensed volume was an infinite vertical wedge and its bright');
  console.log('     core was a vertical HALF-PLANE, not a 1 mm column — the 1e-6 collapse is only the');
  console.log('     degenerate exactly-overhead case of a defect that covers the whole wedge.\n');

  /* ── DETECT.airborneGain, the compounding term ─────────────────────────────────────────── */
  const skyAir = await sensesTable('sky', true);
  const shipAir = await sensesTable('', true);
  console.log('  ── DETECT.airborneGain 1.20, which compounds it (temple, straight OVERHEAD) ──');
  console.log('     rise      standing/before   airborne/before   standing/after   airborne/after');
  for (const rise of [0, 1.0, 2.0, 4.0, 8.0]) {
    const g = (t) => t.temple[rise][0].gain.toFixed(3).padStart(10);
    console.log(`   ${rise.toFixed(2).padStart(7)} ${g(sky)}${g(skyAir)}${g(shipped)}${g(shipAir)}`);
  }
  console.log('     for scale, a player STANDING ON THE GUARD\'S OWN FLOOR six metres in front of him');
  console.log(`     reads ${sky.temple[0][6].gain.toFixed(3)} — lower than several of the airborne overhead rows above.`);
  console.log('');
  return { sky, shipped, skyAir, shipAir };
}

/* ══════════════════════════════════════════════════════════════════════════ §C ══ */

async function sectionDrive() {
  console.log('\n══ §C. through the REAL controller, on the SHIPPED level (§435.4) ══');
  const { realWorld, hardReset, DT } = await import('../tests/_moveset.mjs');
  const { Guards } = await import('../src/ai/Guard.js');
  const { VISION, DETECT } = await import('../src/ai/Patrol.js');

  const { engine, collision, c, mods } = await realWorld();
  mods.movement = c;
  engine.debug.timeOfDay = 0.06;
  const prevGet = engine.get;
  engine.get = (m) => (m === 'movement' ? c : m === 'collision' ? collision : prevGet(m));
  const guards = new Guards(engine);
  await guards.init();
  console.log(`  world up: ${guards.guards.length} guards on the shipped routes, collision ready=${collision.ready}`);

  /* Every height below is READ OUT OF THE SHIPPED COLLISION, never typed in — §435.4's lesson is
     that a probe written from the author's model of the level is a test of the model. `from` is
     the height the downward probe starts at, so a spot under a roof can be asked for its FLOOR
     rather than for the roof. Each station prints what it found, so a level change shows up as a
     changed number instead of a silently invalidated claim. */
  const probeGround = (x, z, from = 8) => {
    const g = collision.groundCheck(new THREE.Vector3(x, from, z), 0.34, from + 60);
    return g?.hit ? g.y : null;
  };

  /* player spot, guard spot, and what the drive does. */
  const STATIONS = [
    { name: 'level courtyard, walking', p: [0, -8], g: [0, -14], drive: 'walk' },
    { name: 'level courtyard, standing', p: [0, -8], g: [0, -14], drive: 'stand' },
    { name: 'level courtyard, single jump', p: [0, -8], g: [0, -14], drive: 'jump1' },
    { name: 'level courtyard, double jump', p: [0, -8], g: [0, -14], drive: 'jump2' },
    /* The raised stations STAND. Driven forward they walk off their own surface within the
       window and the rise band stops being the surface's height — measured: the 0.4 m step
       read 0.405‥1.956 m on a walk, so the row would have been about two surfaces. */
    { name: 'a 0.4 m step', p: [0, 22], g: [-4, 28], drive: 'stand' },
    { name: 'a 1.7 m plinth', p: [0, 20], g: [-4, 24], drive: 'stand' },
    { name: 'the stage-1 terrace deck', p: [0, 4], g: [0, -2], drive: 'stand' },
    { name: 'the stage-3 obelisk deck', p: [-4, 8], g: [-8, 8], drive: 'stand' },
    /* The reassurance the ceiling has to earn: a guard whose OWN floor is the raised one still
       sees a player standing on it, because `baseY` is his and not somebody else's. */
    { name: 'both on the stage-1 deck', p: [0, 4], g: [4, 4], drive: 'stand' },
    { name: 'both on the stage-3 deck', p: [-4, 8], g: [0, 8], drive: 'stand' },
    { name: 'both on the stage-3 deck, walking', p: [-4, 8], g: [0, 8], drive: 'walk' },
  ];

  console.log('\n  the stations, as the shipped collision reports them:');
  for (const st of STATIONS) {
    st.py = probeGround(st.p[0], st.p[1]);
    st.gy = probeGround(st.g[0], st.g[1]);
    st.rise = st.py - st.gy;
    st.horiz = Math.hypot(st.p[0] - st.g[0], st.p[1] - st.g[1]);
    console.log(`    ${st.name.padEnd(28)} player floor ${st.py.toFixed(3).padStart(7)}   guard floor ${st.gy.toFixed(3).padStart(7)}`
      + `   rise ${st.rise.toFixed(3).padStart(7)} m   ${st.horiz.toFixed(1)} m apart`);
  }

  const results = [];
  for (const arm of ['sky', '']) {
    globalThis.__SIGHT_AB = arm;
    const P = await import(`../src/ai/Patrol.js?drive=${arm}&n=${Math.random()}`);
    for (const st of STATIONS) {
      const per = {};
      for (const type of ['temple', 'heavy', 'scarab']) {
        const cfg = VISION[type];
        const s = new P.Senses(type, 5);
        hardReset(engine, c, new THREE.Vector3(st.p[0], st.py + 0.06, st.p[1]), Math.PI);
        /* Settle onto the real floor under real gravity before anything is read. */
        for (let i = 0; i < 40; i++) {
          engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
          engine.time = i * DT; c.update(DT, i * DT);
        }
        let peak = 0, minRise = Infinity, maxRise = -Infinity, seen = 0, frames = 0;
        let states = new Set(), airFrames = 0;
        const N = st.drive.startsWith('jump') ? 150 : 90;
        for (let i = 0; i < N; i++) {
          engine.input.beginFrame(DT);
          engine.input.move.x = 0; engine.input.move.y = 0;
          if (st.drive === 'walk') engine.input.move.y = 0.55;             // a walk, not a sprint
          if (st.drive === 'jump1') { if (i === 5) engine.input.hold('jump'); if (i === 60) engine.input.let_go('jump'); }
          if (st.drive === 'jump2') {
            if (i === 5) engine.input.hold('jump');
            if (i === 26) engine.input.let_go('jump');
            if (i === 28) engine.input.hold('jump');
            if (i === 80) engine.input.let_go('jump');
          }
          engine.time = (200 + i) * DT;
          c.update(DT, engine.time);
          guards._readPlayer(DT);                        // the shipped contract reader
          const bag = guards._sense;
          bag.collision = null;   // this arm is the geometry question; the LOS ray has its own tests
          bag.dt = DT;
          bag.light = 0.3;
          bag.target = c.position;
          bag.targetTop = 0.95;
          bag.eye = new THREE.Vector3(st.g[0], st.gy + cfg.eyeHeight, st.g[1]);
          /* The guard faces the player's start, horizontally — the cone's own convention. */
          bag.forward = new THREE.Vector3(st.p[0] - st.g[0], 0, st.p[1] - st.g[1]).normalize();
          bag.baseY = st.gy;
          bag.alerted = false;
          const gain = s.evaluate(bag);
          const rise = c.position.y - st.gy;
          minRise = Math.min(minRise, rise); maxRise = Math.max(maxRise, rise);
          peak = Math.max(peak, gain);
          if (s.sawThisFrame) seen++;
          if (!c.grounded) airFrames++;
          states.add(c.stateName);
          frames++;
        }
        per[type] = { peak, seen, frames, minRise, maxRise, blindSec: (frames - seen) * DT, airFrames, states: [...states] };
      }
      results.push({ arm: arm || 'shipped', st, per });
    }
    delete globalThis.__SIGHT_AB;
  }

  console.log('\n  peak fill rate and frames-seen, per roster. The player reaches `Senses` only through');
  console.log('  the real Controller and the shipped `Guards._readPlayer`; only the guard pose is set.');
  console.log('  arm     station                       rise band        temple        heavy         scarab');
  for (const r of results) {
    const p = (t) => `${r.per[t].peak.toFixed(3)} ${String(r.per[t].seen).padStart(3)}/${r.per[t].frames}`;
    console.log(`  ${(r.arm === 'sky' ? 'before' : 'after ').padEnd(7)} ${r.st.name.padEnd(28)} `
      + `${f3(r.per.temple.minRise)}‥${f3(r.per.temple.maxRise)}  ${p('temple')}  ${p('heavy')}  ${p('scarab')}`);
  }

  console.log(`\n  the jump, which is the case a ceiling could turn into an invisibility exploit.`);
  console.log(`  Blind window = seconds with no sight; DETECT.drainDelay is ${DETECT.drainDelay} s, so a`);
  console.log(`  window shorter than that does not drain a single unit of an already-filling meter.`);
  for (const r of results.filter((x) => x.st.drive.startsWith('jump'))) {
    const t = r.per.temple;
    console.log(`  ${(r.arm === 'sky' ? 'before' : 'after ').padEnd(7)} ${r.st.name.padEnd(28)} `
      + `apex ${t.maxRise.toFixed(3)} m   airborne ${(r.per.temple.airFrames * DT).toFixed(2)} s   `
      + `blind temple ${t.blindSec.toFixed(3)} s  heavy ${r.per.heavy.blindSec.toFixed(3)} s  scarab ${r.per.scarab.blindSec.toFixed(3)} s`);
  }
  console.log(`  states visited on the double jump: ${results.find((x) => x.st.drive === 'jump2').per.temple.states.join(' ')}`);

  return results;
}

/**
 * §C.3 — the whole module, end to end, one process per arm.
 *
 * **This has to be a child process and the first version of it was silently wrong.** `Guard.js`
 * binds `Patrol.js` at module scope, so a `globalThis.__SIGHT_AB` written after the first import
 * cannot reach the `Guards` instance — both "arms" ran the same code, and they still printed
 * DIFFERENT numbers (0.194/42 against 0.000/0) because the nine guards had walked on down their
 * routes between the two runs. Two arms that differ only in their route phase, presented as an
 * A/B: §439's family, caught by the numbers being too good rather than by the design.
 */
async function endToEnd() {
  const { realWorld, hardReset, DT } = await import('../tests/_moveset.mjs');
  const { Guards } = await import('../src/ai/Guard.js');
  const { SIGHT_CEIL_ON } = await import('../src/ai/Patrol.js');
  const { engine, collision, c, mods } = await realWorld();
  mods.movement = c;
  engine.debug.timeOfDay = 0.06;
  const prevGet = engine.get;
  engine.get = (m) => (m === 'movement' ? c : m === 'collision' ? collision : prevGet(m));
  const guards = new Guards(engine);
  await guards.init();
  const warnings = engine.warnings.slice();

  /* The player walks the open courtyard; every guard runs his own authored route and his own
     `Senses` through the shipped `Guards.update`. Nothing here is posed. */
  hardReset(engine, c, new THREE.Vector3(0, 0.06, -8), Math.PI);
  let peak = 0, sawFrames = 0, sus = 0, alerts = 0;
  engine.events.length = 0;
  for (let i = 0; i < 600; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0.55;
    engine.time = (500 + i) * DT;
    c.update(DT, engine.time);
    guards.update(DT, engine.time);
    for (const g of guards.guards) {
      peak = Math.max(peak, g.senses.gain);
      sus = Math.max(sus, g.senses.suspicion);
      if (g.senses.sawThisFrame) sawFrames++;
    }
  }
  alerts = engine.events.filter((e) => e.evt === 'guardAlert').length;
  const arm = SIGHT_CEIL_ON ? 'shipped' : 'sky';
  console.log(`E2E ${arm.padEnd(7)} courtyard  peakGain=${peak.toFixed(3)} peakSuspicion=${sus.toFixed(3)} `
    + `sawFrames=${sawFrames} guardAlert=${alerts} initWarnings=${warnings.length}`);
  const y = guards.guards.map((g) => g.position.y.toFixed(2)).join(' ');
  console.log(`E2E ${arm.padEnd(7)} guard floors ${y}   player floor ${c.position.y.toFixed(3)}`);
  if (warnings.length) for (const w of warnings) console.log(`E2E warn: ${w}`);

  /* §418.3 for THIS bar: the run above is the input it must pass on, and it passes in both arms
     because the player never leaves the guards' own floor. The run below is the input it must
     FAIL on — the same nine guards, the same driver, the player standing on the stage-1 terrace
     deck 2.00 m up. Without it the end-to-end block could not tell the two arms apart at all. */
  const { STATE } = await import('../src/ai/Patrol.js');
  const deckY = collision.groundCheck(new THREE.Vector3(0, 8, 4), 0.34, 60)?.y ?? 2;
  hardReset(engine, c, new THREE.Vector3(0, deckY + 0.06, 4), Math.PI);
  /* `senses.reset()` alone leaves the ALERT MACHINE where the courtyard run left it, and a
     guard still walking off a search emits `guardAlert` on his way back down — which would have
     been counted as this run's. Reset the state too, so the second run starts from patrol. */
  for (const g of guards.guards) { g.senses.reset(); g._setState(STATE.PATROL); }
  engine.events.length = 0;
  let dPeak = 0, dSaw = 0, dSus = 0;
  const byGuard = new Map();
  for (let i = 0; i < 600; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = (1500 + i) * DT;
    c.update(DT, engine.time);
    guards.update(DT, engine.time);
    for (const g of guards.guards) {
      dPeak = Math.max(dPeak, g.senses.gain);
      dSus = Math.max(dSus, g.senses.suspicion);
      if (g.senses.sawThisFrame) { dSaw++; byGuard.set(g.name, (byGuard.get(g.name) || 0) + 1); }
    }
  }
  console.log(`E2E ${arm.padEnd(7)} terrace    peakGain=${dPeak.toFixed(3)} peakSuspicion=${dSus.toFixed(3)} `
    + `sawFrames=${dSaw} guardAlert=${engine.events.filter((e) => e.evt === 'guardAlert').length} `
    + `playerFloor=${c.position.y.toFixed(3)}`);
  console.log(`E2E ${arm.padEnd(7)} terrace    who saw him: ${[...byGuard].map(([k, v]) => `${k} x${v}`).join(', ') || '(nobody)'}`);
}

async function sectionEndToEnd() {
  const { execFileSync } = await import('node:child_process');
  console.log('\n  §C.3 — the whole module end to end, one CHILD PROCESS per arm so the token is');
  console.log('  read at module load (see the note on `endToEnd`). Nine guards on their authored');
  console.log('  routes, the real Controller walking the courtyard, `Guards.update` doing all of it:');
  for (const arm of ['sky', '']) {
    const out = execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--e2e-child'], {
      encoding: 'utf8', env: { ...process.env, SIGHT_AB: arm }, timeout: 600000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) if (line.startsWith('E2E')) console.log(`    ${line}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════ §D ══ */

/**
 * §D — is the player being shown a lie? The DRAWN cone against the SENSED volume.
 *
 * This project keeps finding the same defect class: the sensed volume moves and the drawn one
 * does not, so the telegraph stops meaning what it draws. The cone has two drawn parts and they
 * answer different questions, which `Guard.js` already says in its own words — the POOL "always
 * keeps the true half-angle, so the pavement wedge stays the honest telegraph", and the BEAM is
 * additive air haze whose shell "may be narrower than the sensed cone".
 *
 * Everything below is pure arithmetic over the shipped constants — the same expressions
 * `_updateCones` and `BEAM_VERT` evaluate — so it needs no renderer and makes no visual claim.
 */
async function sectionCone() {
  const { GUARD_TUNE } = await import('../src/ai/Guard.js');
  const { VISION, SIGHT } = await import('../src/ai/Patrol.js');
  const T = GUARD_TUNE;
  console.log('\n══ §D. the drawn cone against the sensed volume ══');
  console.log(`  conePitch ${T.conePitch} rad below horizontal, beamCoreScale ${T.beamCoreScale}, coneShape ${T.coneShape} (legacy branch)`);
  console.log(`  sensed ceiling ${SIGHT.ceiling} m above the guard's own base, ${SIGHT.soft} m of fade below it.\n`);

  for (const type of ['temple', 'heavy', 'scarab']) {
    const cfg = VISION[type];
    const reach = cfg.coneLength;                      // unobstructed throw
    const r = Math.tan(cfg.halfAngle) * reach * T.beamCoreScale;
    const cp = Math.cos(T.conePitch), sp = Math.sin(T.conePitch);
    /* Apex: the muzzle on an armed native guard, the eye otherwise. Both are printed, because
       §709 moved one and not the other and the pool's onset already depends on which. */
    for (const [apexName, apexY] of [['eye', cfg.eyeHeight + T.coneEyeUp], ['muzzle', 0.685]]) {
      const top = (t) => apexY - t * reach * sp + t * r * cp;      // the ring's highest vertex
      /* the beam's own longitudinal weight, legacy branch, view-independent factors only */
      const w = (t) => (1 / (1 + 7 * t * t))
        * THREE.MathUtils.smoothstep(t, 0, 0.16)
        * (1 - THREE.MathUtils.smoothstep(t, 0.56, 1.0));
      let tCross = null;
      for (let t = 0; t <= 1.0001; t += 0.0005) if (top(t) >= SIGHT.ceiling) { tCross = t; break; }
      const peak = Math.max(...[...Array(201).keys()].map((i) => w(i / 200)));
      console.log(`  ── ${type}, apex at the ${apexName} (${apexY.toFixed(3)} m), throw ${reach} m, rim radius ${r.toFixed(2)} m`);
      console.log(`     t     dist along   top rim above base   beam weight   above the ceiling?`);
      for (const t of [0.05, 0.10, 0.20, 0.40, 0.56, 0.80, 1.00]) {
        console.log(`   ${t.toFixed(2)}   ${(t * reach).toFixed(2).padStart(8)} m   ${top(t).toFixed(2).padStart(14)} m`
          + `   ${(w(t) / peak).toFixed(3).padStart(11)}   ${top(t) > SIGHT.ceiling ? 'yes' : 'no'}`);
      }
      console.log(`     the drawn rim first reaches the ceiling at t = ${tCross === null ? 'never' : tCross.toFixed(4)}`
        + `${tCross === null ? '' : ` (${(tCross * reach).toFixed(2)} m out), where the beam's own weight is ${(w(tCross) / peak).toFixed(3)} of peak`}`);
    }
    /* Straight up: is a point directly over the guard inside the drawn beam at all? */
    const angUp = Math.PI / 2 + T.conePitch;           // axis is pitched DOWN, so up is further off
    console.log(`     straight overhead sits ${(angUp * 180 / Math.PI).toFixed(1)}° off the drawn axis`
      + ` against a drawn half-angle of ${(cfg.halfAngle * T.beamCoreScale * 180 / Math.PI).toFixed(1)}°`
      + ` — outside the drawn beam by ${((angUp - cfg.halfAngle * T.beamCoreScale) * 180 / Math.PI).toFixed(1)}°.\n`);
  }

  console.log('  the POOL — the only drawn part that marks GROUND as dangerous — is one flat wedge at');
  console.log('  `g.position.y + 0.035`, i.e. on the guard\'s OWN floor, at the true half-angle. Nothing');
  console.log('  about it changed, and with the ceiling in place the sensed volume is now exactly the');
  console.log('  band standing on that floor: before §748 a player could stand on a roof with no pool');
  console.log('  within reach of his feet and still be seen, which is the pool UNDER-drawing the danger.\n');
}

/* ══════════════════════════════════════════════════════════════════════════════ */

if (E2E_CHILD) { await endToEnd(); }
else {
  if (WANT.height) await sectionHeight();
  if (WANT.table) await sectionTable();
  if (WANT.drive) { await sectionDrive(); await sectionEndToEnd(); }
  if (WANT.cone) await sectionCone();
}
