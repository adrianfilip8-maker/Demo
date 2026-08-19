#!/usr/bin/env node
/**
 * slamtrace.mjs — per-frame attribution of the boom and the pivot through a Cane Slam from
 * height, replicating `tools/camlook.mjs` S3 headlessly against the same BVH.
 *
 * Exists because run 2 and run 3 of the rig-live look produced impact frames from a 16 m slam
 * with NO SUBJECT IN THEM (`ndcY` −3.33, vis:true, boom 1.57 m) and every camera number in the
 * telemetry describes the outcome, not the mechanism. This logs the boom's contributing terms
 * (want, per-whisker allowed, recovery state) and the pivot's (goal composition, leash slack,
 * effective pitch) per frame through the whole sequence, the way the lead census logged
 * `_pivotGoal`'s — the mechanism, not the delivery (§439).
 *
 * The staging is camlook S3's, verbatim: raw `position.set` 16 m above spawn (NOT `teleport()` —
 * the tool's fallback path), 14 free-fall frames, a 2-frame attack press, run to ground. The
 * spawn steady state is printed first so this instrument can be checked against the browser
 * run's telemetry (`shots/camlane3-telemetry-s3.json`: spawn boom 5.433, cam [0,2.41,35.34],
 * ndcY −0.26) before any claim rests on it.
 *
 *   node tools/slamtrace.mjs             both drops (16 m and 8 m) + the 16 m repeat
 *   DROP=16 node tools/slamtrace.mjs     one drop height
 *
 * Prints a per-frame table and writes JSON beside the camlane3 telemetry it explains.
 */
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { realWorld, hardReset, V, DT } from '../tests/_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DROPS = process.env.DROP ? [Number(process.env.DROP)] : [16, 16.001, 8];
/* MODE=slam presses attack at frame 14 (camlook S3's script); MODE=fall never presses it.
   Both exist because the browser telemetry contradicts the slam's own exit path: `DiveAttack`
   grounds into `idle` with `landImpact = 0`, yet both browser impacts read `st: 'land'` — and
   S2's impact velocity is not cut to `DiveAttack.enter`'s 30 %. If `fall` reproduces the browser
   and `slam` does not, the captured sequence was never a slam and the apparatus's mouse press
   never became `attack`. */
const MODES = process.env.MODE ? [process.env.MODE] : ['slam', 'fall'];
/* LEASH=frame prices the one candidate repair the static ablation cannot: bounding the leash in
   half-frame-heights instead of metres (min(2.6, 0.48 × boom), 0.48 ≈ tan(fovBase/2) — the same
   ratio the shipped 2.6 embodies at the 5.4 m default boom). Set per frame from OUTSIDE the rig
   so shipped source carries no experimental branch; the dynamic effect it exists to measure is
   that a tighter pivot also lowers the occlusion-cast origin, which moves the frame where the
   boom clears. */
const LEASH_FRAME = process.env.LEASH === 'frame';
const LEASH_SHIPPED = 2.6;

/* Same table as CameraRig's WHISKERS (not exported); kept in lockstep by the fidelity check
   below — if the rig's own `_castBoom` disagrees with this loop's min, the copy has drifted. */
const WHISKERS = [[0, 0, 1.0], [1, 0, 0.55], [-1, 0, 0.55], [0, 1, 0.45], [0, -1, 0.35]];
const SWEEP_OPTS = { ignoreTags: ['hazard', 'water', 'vent', 'rail', 'hook', 'spire'] };

function castDetail(rig, collision, want) {
  const pitch = rig._effectivePitch();
  const dir = new THREE.Vector3(
    -rig.forward.x * Math.cos(pitch), Math.sin(pitch), -rig.forward.z * Math.cos(pitch));
  const rows = [];
  for (const w of WHISKERS) {
    const from = rig.pivot.clone();
    if (w[0]) from.addScaledVector(rig.right, w[0] * TUNE.whisker);
    if (w[1]) from.y += w[1] * TUNE.whiskerUp;
    const to = from.clone().addScaledVector(dir, want);
    let d = want, tag = '', hitAt = null;
    const r = collision.capsuleSweep(from, to, TUNE.camRadius, 0, SWEEP_OPTS);
    if (r && r.hit) {
      d = Math.max(TUNE.distHardMin, (r.distance ?? want) - TUNE.camPad);
      tag = r.tag || '?';
      hitAt = from.clone().addScaledVector(dir, Math.min(want, r.distance ?? want));
    }
    const claim = d >= want ? want : want - (want - d) * w[2];
    rows.push({ w, d: +d.toFixed(3), claim: +claim.toFixed(3), tag, hitAt });
  }
  return { pitch, dir, rows, allowed: Math.min(...rows.map((r) => r.claim)) };
}

function ndcOf(cam, px, py, pz) {
  const v = new THREE.Vector3(px, py + 0.9, pz).project(cam);
  return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
}

const { engine, c, collision } = await realWorld();

/* The rig gets the same facade shape camdrive's screenReplay uses, but LIVE: the Controller
   advances first each frame (main.js MANIFEST order: movement, …, camera) and the rig reads it
   as the movement module. The Controller's own engine gains a 'camera' route so `diveShake`
   reaches the rig the way it does in the browser. */
const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 2000);
const rigEngine = {
  input: { look: { x: 0, y: 0 }, down: () => false, pressed: () => false },
  camera: cam, scene: new THREE.Scene(), time: 0, dt: 0, timeScale: 1,
  debug: { freeCam: false }, warn() {}, has() { return false; },
  on() { return () => {}; }, emit() {},
  get(n) { return n === 'movement' ? c : n === 'collision' ? collision : null; },
};
const rig = new CameraRig(rigEngine);
await rig.init();
const baseGet = engine.get;
engine.get = (m) => (m === 'camera' ? rig : baseGet(m));

let t = 0;
function frame(script) {
  engine.input.beginFrame(DT);
  engine.input.move.x = 0; engine.input.move.y = 0;
  if (script) script(engine.input);
  engine.time = t;
  c.update(DT, t);
  if (LEASH_FRAME) TUNE.followLeashV = Math.min(LEASH_SHIPPED, 0.48 * rig.boom);
  rigEngine.time = t; rigEngine.dt = DT;
  rig.update(DT, t);
  TUNE.followLeashV = LEASH_SHIPPED;
  t += DT;
}

function probe() {
  const g = new THREE.Vector3();
  rig._pivotGoal(g, 1);
  const cd = castDetail(rig, collision, rig._boomWant);
  const binding = cd.rows.reduce((a, b) => (b.claim < a.claim ? b : a));
  return {
    st: c.stateName, key: rig._frameKey, gr: !!c.grounded,
    py: +c.position.y.toFixed(3), vy: +c.velocity.y.toFixed(2),
    gy: +g.y.toFixed(3), pivY: +rig.pivot.y.toFixed(3),
    slack: +(g.y - rig.pivot.y).toFixed(3),
    want: +rig._boomWant.toFixed(3), allowed: +cd.allowed.toFixed(3),
    boom: +rig.boom.toFixed(3), rec: rig._recovering,
    pitch: +(cd.pitch / (Math.PI / 180)).toFixed(1),
    whisk: binding.claim < rig._boomWant - 1e-3
      ? { w: binding.w, d: binding.d, tag: binding.tag,
          at: binding.hitAt && binding.hitAt.toArray().map((x) => +x.toFixed(2)) }
      : null,
    cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    ndc: ndcOf(cam, c.position.x, c.position.y, c.position.z),
    shake: +(rig._shakeAmp * rig._shakeEnv()).toFixed(3),
  };
}

const runs = [];
for (const mode of MODES) for (const drop of DROPS) {
  hardReset(engine, c, V(0, 0, 30), Math.PI);
  rig.snap(true);
  for (let i = 0; i < 30; i++) frame();
  const spawn = probe();
  console.log(`\n=== ${mode} · drop ${drop} m · spawn check: boom ${spawn.boom} cam [${spawn.cam}] ndcY ${spawn.ndc[1]}`
    + ` (browser: 5.433 [0,2.41,35.34] -0.26)`);

  /* camlook S3 staging, verbatim: raw set, zero velocity. */
  c.position.set(0, c.position.y + drop, 30);
  c.velocity.set(0, 0, 0);

  const log = [];
  let impact = -1;
  for (let i = 0; i < 140 && impact < 0; i++) {
    if (mode === 'slam' && (i === 14 || i === 15)) frame((inp) => inp.hold('attack'));
    else if (mode === 'slam' && i === 16) frame((inp) => inp.let_go('attack'));
    else frame();
    const s = probe();
    log.push({ i, ...s });
    if (i > 16 && s.gr && s.st !== 'dive') impact = i;
  }
  for (let k = 1; k <= 10; k++) { frame(); log.push({ i: impact + k, ...probe() }); }

  const imp = log.find((r) => r.i === impact);
  console.log(`impact @ frame ${impact}: st ${imp.st} boom ${imp.boom} (want ${imp.want}, allowed ${imp.allowed},`
    + ` rec ${imp.rec}) pivY ${imp.pivY} vs chest ${(imp.py + 0.9).toFixed(2)} ndcY ${imp.ndc[1]}`);

  /* Ablation at the impact frame: re-project the subject with each mechanism removed, one at a
     time, from the LOGGED numbers — same lens, same yaw. Which term owns the empty frame. */
  const yaw = Math.PI;
  const reproject = (boom, pivotY, pitchDeg) => {
    const p = pitchDeg * Math.PI / 180;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const dir = new THREE.Vector3(-fwd.x * Math.cos(p), Math.sin(p), -fwd.z * Math.cos(p));
    const c2 = new THREE.PerspectiveCamera(cam.fov, 16 / 9, 0.1, 2000);
    const pivot = new THREE.Vector3(rig.pivot.x, pivotY, rig.pivot.z);
    c2.position.copy(pivot).addScaledVector(dir, boom);
    c2.lookAt(pivot.x, pivot.y + TUNE.headroom, pivot.z);
    c2.updateMatrixWorld(true);
    return ndcOf(c2, imp.py * 0 + 0, imp.py, 30)[1];
  };
  const prev = log.find((r) => r.i === impact - 1);
  const abl = {
    asIs: reproject(imp.boom, imp.pivY, imp.pitch),
    boomAtWant: reproject(imp.want, imp.pivY, imp.pitch),
    pivotAtGoal: reproject(imp.boom, imp.gy, imp.pitch),
    fallPitchHeld: reproject(imp.boom, imp.pivY, prev.pitch),
    all3: reproject(imp.want, imp.gy, prev.pitch),
  };
  console.log(`ablation ndcY: as-is ${abl.asIs} · boom→want ${abl.boomAtWant} · pivot→goal ${abl.pivotAtGoal}`
    + ` · fallPitch held ${abl.fallPitchHeld} · all three ${abl.all3}`);

  console.log('  i st>key        py      vy    gy→pivY  slack  want allow boom  rec pitch ndcY  whisker');
  for (const r of log) {
    if (r.i > 5 && r.i < impact - 2 && r.i % 4) continue;
    console.log(`${String(r.i).padStart(3)} ${(r.st + '>' + r.key).padEnd(13)} ${String(r.py).padStart(7)}`
      + ` ${String(r.vy).padStart(7)} ${String(r.gy).padStart(7)}→${String(r.pivY).padEnd(7)}`
      + ` ${String(r.slack).padStart(6)} ${String(r.want).padStart(5)} ${String(r.allowed).padStart(5)}`
      + ` ${String(r.boom).padStart(5)} ${r.rec ? ' R ' : '   '} ${String(r.pitch).padStart(5)}`
      + ` ${String(r.ndc[1]).padStart(5)}  ${r.whisk ? JSON.stringify(r.whisk) : ''}`);
  }
  runs.push({ mode, drop, spawn, impact, ablation: abl, log });
}

/* Numbers taken from a dirty tree are the phantom-269 class; say so on the record. */
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/', 'tests/'],
  { cwd: ROOT, encoding: 'utf8' }).trim();
const out = LEASH_FRAME ? 'slamtrace-leashframe.json' : 'slamtrace.json';
await writeFile(`${ROOT}/shots/${out}`,
  JSON.stringify({ sha, dirty, drops: DROPS, modes: MODES, leash: LEASH_FRAME ? 'min(2.6, 0.48*boom)' : 'shipped 2.6',
    tune: { leash: TUNE.followLeashV, fallLeadMax: TUNE.fallLeadMax,
    fallPitch: TUNE.fallPitch / (Math.PI / 180), recoverTime: TUNE.recoverTime,
    recoverSpeed: TUNE.recoverSpeed, recoverDelay: TUNE.recoverDelay }, runs }, null, 1));
console.log(`\nwrote shots/${out}`);
