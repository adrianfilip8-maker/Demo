/**
 * camfloorcost.mjs — what §640's subject boom floor COSTS, measured on the things it could break.
 *
 * The floor pushes the boom OUT where occlusion had pulled it in, so the three ways it can be
 * wrong are all "it gave back length it should not have":
 *
 *   1. **THE LENS ENDS UP INSIDE GEOMETRY.** Asked with the rig's own predicate — the overlap
 *      query `_castBoom` already runs as its belt-and-braces check, `overlap(camPos,
 *      camRadius × 0.85, SOLID_TAGS)` — so the instrument and the mechanism agree on what
 *      "inside" means. §582.3's warning is carried: a `wall`/`ground`-only test was blind to the
 *      case that mattered, so `SOLID_TAGS` here is the shipped list, `ledge` and `pole` included.
 *   2. **THE CAMERA OPENS UP AT A SPRINT** — a standing user ruling. Measured as the mean and p99
 *      boom on the ground-locomotion routes specifically, not on the battery average, because the
 *      battery is dominated by pole work where the floor is supposed to act.
 *   3. **COMPOSITION.** §581's body fraction: the share of the live capsule inside the frame.
 *      A longer boom should IMPROVE this; the arm exists so that "should" is a measurement.
 *
 * And the thing it must still deliver: containment. The subject's centre in front of the near
 * plane and inside the frame, on every frame, in both regimes.
 *
 * Usage:  node tools/camfloorcost.mjs
 */
import * as THREE from 'three';
import { realWorld, hardReset, DT } from '../tests/_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';
import { forceRoutes, STICKS, PAD_FULL } from './camforce.mjs';

const SOLID_TAGS = ['ground', 'wall', 'ledge', 'pole'];
const GROUND_ROUTES = ['run N', 'run S', 'run + jumps', 'nave sprint', 'colonnade run', 'crouch walk', 'idle'];

/** §581's body fraction: the widest window of the capsule's angular span inside the frame. */
function bodyFrac(cam, p, h) {
  const q = new THREE.Quaternion().copy(cam.quaternion).invert();
  const half = Math.tan(cam.fov * 0.5 * Math.PI / 180);
  const v = new THREE.Vector3();
  let inside = 0;
  const N = 21;
  for (let i = 0; i < N; i++) {
    v.set(p.x, p.y + h * i / (N - 1), p.z).sub(cam.position).applyQuaternion(q);
    if (v.z >= -1e-6) continue;                    // behind the lens — not on screen
    const ny = (v.y / -v.z) / half;
    const nx = (v.x / -v.z) / (half * (cam.aspect > 0 ? cam.aspect : 16 / 9));
    if (Math.abs(ny) <= 1 && Math.abs(nx) <= 1) inside++;
  }
  return inside / N;
}

async function run(regime, sticks) {
  const { engine, c, collision } = await realWorld();
  const keepGet = engine.get, keepCam = engine.camera;
  const keep = { subjectFloor: TUNE.subjectFloor, pivotLeashK: TUNE.pivotLeashK, subjectStandoff: TUNE.subjectStandoff };
  for (const k of Object.keys(regime)) TUNE[k] = regime[k];
  const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 4000);
  engine.camera = cam;
  engine.get = (m) => (m === 'movement' ? c : m === 'collision' ? collision : keepGet(m));
  const out = [];
  try {
    for (const st of sticks) {
      for (const r of forceRoutes(collision)) {
        hardReset(engine, c, r.start, r.yaw ?? Math.PI);
        engine.input.clear?.();
        if (!engine.input.look) engine.input.look = { x: 0, y: 0 };
        if (r.pre) r.pre(c, engine);
        const rig = new CameraRig(engine);
        rig.init?.(); rig.snap(true);
        const sf = STICKS[st];
        for (let i = 0; i < (r.frames ?? 300); i++) {
          engine.input.beginFrame(DT);
          engine.input.move.x = 0; engine.input.move.y = 0;
          const lk = sf(i);
          engine.input.look.x = lk.x; engine.input.look.y = lk.y;
          const stop = r.script ? r.script(engine.input, i, c) : false;
          engine.time = i * DT; engine.dt = DT;
          c.update(DT, i * DT);
          rig.update(DT, i * DT);
          engine.events.length = 0;
          let inside = false;
          try {
            const hits = collision.overlap(cam.position, TUNE.camRadius * 0.85, SOLID_TAGS);
            inside = !!(hits && hits.length);
          } catch { /* the arm reports the throw as a fault below */ }
          /* containment, exactly as camstate defines it: the capsule's CENTRE, in front of the
             near plane, inside |ndc| ≤ 1, on the FINAL written pose */
          const sc = new THREE.Vector3(c.position.x, c.position.y + c.height * 0.5, c.position.z);
          const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
          const front = sc.clone().sub(cam.position).dot(fwd) > cam.near;
          const n = sc.clone().project(cam);
          out.push({
            route: r.label, stick: st, i, state: c.stateName,
            boom: rig.boom, inside, contained: front && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1,
            bf: bodyFrac(cam, c.position, c.height),
            floorOn: !!rig._subjFloorOn, floor: rig._subjFloor, leashOn: !!rig._pivotLeashOn,
            sp: Math.hypot(c.velocity.x, c.velocity.z),
          });
          if (stop) break;
        }
      }
    }
  } finally {
    engine.get = keepGet; engine.camera = keepCam;
    for (const k of Object.keys(keep)) TUNE[k] = keep[k];
  }
  return out;
}

const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

const sticks = ['none', 'down', 'downleft', 'work'];
const REGIMES = [
  ['pre-§640          ', { subjectFloor: false, pivotLeashK: 0 }],
  ['range only        ', { subjectFloor: true, pivotLeashK: 0 }],
  ['front centre      ', { subjectFloor: 'front', pivotLeashK: 0 }],
  ['front centre + L.8', { subjectFloor: 'front', pivotLeashK: 0.80 }],
  ['front SPAN        ', { subjectFloor: 'frontspan', pivotLeashK: 0 }],
  ['range + leash 0.80', { subjectFloor: true, pivotLeashK: 0.80 }],
];
const res = [];
for (const [nm, rg] of REGIMES) res.push([nm, await run(rg, sticks)]);

console.log(`\n=== §640 cost · ${sticks.length} stick regimes · ${res[0][1].length} frames each ===`);
console.log('  regime               lens-in-stone   sprint boom   body frac   <70% body   uncontained  mean boom');
for (const [nm, a] of res) {
  const g = a.filter((x) => GROUND_ROUTES.includes(x.route) && x.sp > 6).map((x) => x.boom);
  console.log(`  ${nm} ${(100 * a.filter((x) => x.inside).length / a.length).toFixed(2).padStart(10)} % `
    + `${mean(g).toFixed(3).padStart(12)} ${mean(a.map((x) => x.bf)).toFixed(4).padStart(11)} `
    + `${String(a.filter((x) => x.bf < 0.7).length).padStart(11)} ${String(a.filter((x) => !x.contained).length).padStart(13)} `
    + `${mean(a.map((x) => x.boom)).toFixed(3).padStart(10)}`);
}
console.log('\n  ground-route framing, the "must not open up at a sprint" ruling');
console.log('  regime               mean boom (ground)   p99      max     leash%   floor%');
for (const [nm, a] of res) {
  const g = a.filter((x) => GROUND_ROUTES.includes(x.route));
  console.log(`  ${nm} ${mean(g.map((x) => x.boom)).toFixed(3).padStart(16)} ${pct(g.map((x) => x.boom), 0.99).toFixed(3).padStart(9)} `
    + `${Math.max(...g.map((x) => x.boom)).toFixed(3).padStart(8)} ${(100 * g.filter((x) => x.leashOn).length / g.length).toFixed(1).padStart(8)} `
    + `${(100 * g.filter((x) => x.floorOn).length / g.length).toFixed(1).padStart(8)}`);
}
console.log('\n  BODY FRACTION BY ROUTE — where the leash actually spends composition');
console.log('  route                        pre-§640   shipped      Δ    boom pre   boom ship');
for (const r of [...new Set(res[0][1].map((x) => x.route))]) {
  const o = res[0][1].filter((x) => x.route === r), n = res[res.length - 1][1].filter((x) => x.route === r);
  if (!o.length || !n.length) continue;
  const a = mean(o.map((x) => x.bf)), b = mean(n.map((x) => x.bf));
  console.log(`  ${r.padEnd(28)} ${a.toFixed(4).padStart(7)} ${b.toFixed(4).padStart(9)} ${(b - a >= 0 ? '+' : '') + (b - a).toFixed(4)} `
    + `${mean(o.map((x) => x.boom)).toFixed(2).padStart(9)} ${mean(n.map((x) => x.boom)).toFixed(2).padStart(10)}`);
}
process.exit(0);
