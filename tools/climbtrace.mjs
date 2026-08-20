#!/usr/bin/env node
/**
 * climbtrace.mjs — per-frame attribution of the boom through the two §495 pole climbs,
 * replicating `tools/thieflook.mjs` T1/T3 headlessly against the same BVH.
 *
 * Exists because the thief1 run photographed the T1 obelisk-rope climb at the 0.55 hard-min
 * with the subject above the frame's top edge on BOTH takes (`thief1-t1t*-{mount,climb,top}`,
 * boom 0.55, ndcY +1.0..+1.5) while the SAME `poleClimb` state on the SE drainpipe composes at
 * boom 5.8–6.0 — and every number in that telemetry describes the outcome, not the mechanism
 * (§439). This logs each of the five boom casts per frame with the IDENTITY of what it hit —
 * tag, material, mesh position, cylinder radius, raw distance, sweep-vs-depenetration — so
 * "the occlusion cast eats the boom against the climbed geometry" stops being a presumption
 * and names its collider. Two candidate repairs are priced in the same pass, from OUTSIDE the
 * rig (the slamtrace pattern), so shipped source carries no experimental branch:
 *
 *   solid     the five casts with `pole` kept solid — the pre-§471 rig (the ablation)
 *   noPole    the same casts with 'pole' added to ignoreTags — what the shipped rig now runs
 *             while `movement.attached` is a pole (the §471 gate); identical to `solid` any
 *             time the gate is closed
 *
 * The `allowed` column follows whichever arm the live rig is on (the gate is read off
 * `c.attached`), so rig.boom stays checkable against it; `allowedSolid`/`allowedNoPole` carry
 * both arms regardless, which is what prices the fix and what re-derives the defect after it.
 *
 * T3 is the CONTROL and runs first: same state, same rig, open wall. If the instrument does not
 * reproduce its composed boom, nothing it says about T1 is evidence. The T3 arm continues
 * through the top-hop onto the y 9.0 ring and logs the arrival + settle window (leash slack,
 * ndcY), because item 12's question — does a state-scoped climb fix move the subjectless
 * arrivals at all — needs the same instrument to answer it before and after.
 *
 * Drives are the thiefspots.test.mjs scripts verbatim (the drive that shipped the lines);
 * camera aimed per thieflook: rig yaw set facing the line at the stance, no look input after.
 *
 *   node tools/climbtrace.mjs             both lines
 *   SEQ=t1 node tools/climbtrace.mjs      one line
 *
 * Prints per-frame tables and writes shots/climbtrace.json.
 */
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { realWorld, hardReset, V, DT } from '../tests/_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEQ = (process.env.SEQ || 't3,t1').split(',');

/* Same tables as CameraRig's (not exported); the fidelity check below keeps them honest — if
   this loop's min disagrees with the rig's own boom while pulling in, the copy has drifted. */
const WHISKERS = [[0, 0, 1.0], [1, 0, 0.55], [-1, 0, 0.55], [0, 1, 0.45], [0, -1, 0.35]];
const SWEEP_OPTS = { ignoreTags: ['hazard', 'water', 'vent', 'rail', 'hook', 'spire'] };
const SWEEP_NOPOLE = { ignoreTags: [...SWEEP_OPTS.ignoreTags, 'pole'] };
const SOLID_TAGS = ['ground', 'wall', 'ledge', 'pole'];

/** Identify a hit for the table: tag/material plus the rec's mesh centre and cylinder radius. */
function ident(r) {
  if (!r || !r.hit) return null;
  const m = r.rec?.mesh;
  const gp = m?.geometry?.parameters;
  return {
    tag: r.tag || '?', matl: r.material || '?',
    at: m ? [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)] : null,
    r: gp?.radiusTop ?? gp?.radius ?? null,
    raw: +(r.distance ?? -1).toFixed(3), sh: !!r.sweepHit, dh: !!r.depenHit,
  };
}

function castDetail(rig, collision, want, gate) {
  const pitch = rig._effectivePitch();
  const dir = new THREE.Vector3(
    -rig.forward.x * Math.cos(pitch), Math.sin(pitch), -rig.forward.z * Math.cos(pitch));
  const rows = [];
  let allowedSolid = want, allowedNoPole = want;
  for (const w of WHISKERS) {
    const from = rig.pivot.clone();
    if (w[0]) from.addScaledVector(rig.right, w[0] * TUNE.whisker);
    if (w[1]) from.y += w[1] * TUNE.whiskerUp;
    const to = from.clone().addScaledVector(dir, want);
    const cast = (opts) => {
      const r = collision.capsuleSweep(from, to, TUNE.camRadius, 0, opts);
      if (!r || !r.hit) return { d: want, hit: null };
      return { d: Math.max(TUNE.distHardMin, (r.distance ?? want) - TUNE.camPad), hit: ident(r) };
    };
    const s = cast(SWEEP_OPTS);
    const np = cast(SWEEP_NOPOLE);
    const claim = s.d >= want ? want : want - (want - s.d) * w[2];
    const claimNP = np.d >= want ? want : want - (want - np.d) * w[2];
    if (claim < allowedSolid) allowedSolid = claim;
    if (claimNP < allowedNoPole) allowedNoPole = claimNP;
    rows.push({ w, d: +s.d.toFixed(3), claim: +claim.toFixed(3), hit: s.hit,
      dNP: +np.d.toFixed(3), claimNP: +claimNP.toFixed(3), hitNP: np.hit });
  }
  const allowed = gate ? allowedNoPole : allowedSolid;
  /* The belt-and-braces overlap at the resulting camera point (SOLID_TAGS keeps `pole`). */
  const end = rig.pivot.clone().addScaledVector(dir, Math.max(TUNE.distHardMin, allowed));
  let inside = [];
  try { inside = collision.overlap(end, TUNE.camRadius * 0.85, SOLID_TAGS).map((rec) => rec.tag); }
  catch { inside = ['<threw>']; }
  return { pitch, rows, allowed: Math.max(TUNE.distHardMin, allowed),
    allowedSolid: Math.max(TUNE.distHardMin, allowedSolid),
    allowedNoPole: Math.max(TUNE.distHardMin, allowedNoPole), inside: [...inside] };
}

function ndcOf(cam, px, py, pz) {
  const v = new THREE.Vector3(px, py + 0.9, pz).project(cam);
  return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
}

const { engine, c, collision } = await realWorld();

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

/* thiefspots' aim(): the controller's input is camera-relative to ITS engine camera. */
const aim = (tx, tz) => {
  const dx = tx - c.position.x, dz = tz - c.position.z;
  engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
};
/* thieflook's setCam(): the rig's own yaw, snapped facing the line. */
const setCam = (yaw) => { rig.yaw = yaw; rig.snap(false); };

let t = 0;
function frame(script) {
  engine.input.beginFrame(DT);
  engine.input.move.x = 0; engine.input.move.y = 0;
  if (script) script(engine.input);
  /* thiefspots' step(), verbatim — time frozen at 0 for the controller, events cleared. The
     rig keeps its own advancing clock (it only feeds the shake phase). */
  engine.time = 0;
  c.update(DT, 0);
  engine.events.length = 0;
  rigEngine.time = t; rigEngine.dt = DT;
  rig.update(DT, t);
  t += DT;
}

function probe() {
  const g = new THREE.Vector3();
  rig._pivotGoal(g, 1);
  const gate = !!(c.attached && c.attached.tag === 'pole');
  const cd = castDetail(rig, collision, rig._boomWant, gate);
  const liveClaim = (r) => (gate ? r.claimNP : r.claim);
  const binding = cd.rows.reduce((a, b) => (liveClaim(b) < liveClaim(a) ? b : a));
  return {
    st: c.stateName, key: rig._frameKey, gr: !!c.grounded, gate,
    p: [+c.position.x.toFixed(3), +c.position.y.toFixed(3), +c.position.z.toFixed(3)],
    vy: +c.velocity.y.toFixed(2),
    gy: +g.y.toFixed(3), pivY: +rig.pivot.y.toFixed(3), slack: +(g.y - rig.pivot.y).toFixed(3),
    want: +rig._boomWant.toFixed(3), allowed: +cd.allowed.toFixed(3),
    allowedSolid: +cd.allowedSolid.toFixed(3), allowedNoPole: +cd.allowedNoPole.toFixed(3),
    boom: +rig.boom.toFixed(3), rec: rig._recovering, inside: cd.inside,
    pitch: +(cd.pitch / (Math.PI / 180)).toFixed(1),
    yaw: +rig.yaw.toFixed(3),
    whisk: liveClaim(binding) < rig._boomWant - 1e-3
      ? { w: binding.w, d: gate ? binding.dNP : binding.d, hit: gate ? binding.hitNP : binding.hit }
      : null,
    casts: cd.rows,
    cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    ndc: ndcOf(cam, c.position.x, c.position.y, c.position.z),
  };
}

const short = (s) => {
  if (!s.whisk) return '';
  const h = s.whisk.hit;
  const id = h ? `${h.tag}/${h.matl}${h.r !== null ? ` r${h.r}` : ''}${h.at ? `@(${h.at[0]},${h.at[2]})` : ''}${h.sh ? '' : h.dh ? ' DEPEN' : ''}` : '?';
  return `[${s.whisk.w}] d${s.whisk.d} ${id}`;
};
const line = (i, s) =>
  `${String(i).padStart(4)} ${(s.st + '>' + s.key).padEnd(15)} y${String(s.p[1]).padStart(7)}`
  + ` want ${String(s.want).padStart(5)} allow ${String(s.allowed).padStart(5)}${s.gate ? '*' : ' '}`
  + ` (solid ${String(s.allowedSolid).padStart(5)}) boom ${String(s.boom).padStart(5)}`
  + ` ndcY ${String(s.ndc[1]).padStart(6)} ${short(s)}${s.inside.length ? ` INSIDE:${s.inside}` : ''}`;

const runs = [];

/* ── T3: the SE drainpipe — the control. thiefspots §C verbatim. ─────────────────────────── */
if (SEQ.includes('t3')) {
  console.log('\n=== T3 · SE drainpipe (control) — browser: mount boom 5.844 ndcY -0.22 · climb 6.019 -0.43 · ring 0.557 -35.74 · ring2 1.507 -1.90');
  hardReset(engine, c, V(19.8, 0.02, -2.0), Math.PI);
  aim(21.35, -2.0);
  setCam(Math.atan2(21.35 - 19.8, -2.0 - -2.0));
  for (let i = 0; i < 25; i++) frame();
  const log = [];
  let mounted = false, arrived = -1, settle = -1;
  for (let i = 0; i < 900 && settle < 0; i++) {
    frame((inp) => {
      if (c.stateName !== 'poleClimb' && !mounted) {
        aim(21.35, -2.0); inp.move.y = 1;
        if (i % 8 === 0) inp.hold('interact'); else inp.let_go('interact');
      } else if (c.stateName === 'poleClimb') {
        mounted = true;
        if (c.position.y < 9.35) { inp.move.y = 1; }
        else { aim(22.6, -2.0); inp.move.y = 1; inp.hold('jump'); }
      } else if (arrived < 0) { aim(22.6, -2.0); inp.move.y = 1; inp.let_go('jump'); }
    });
    const s = probe();
    log.push({ i, ...s });
    if (arrived < 0 && mounted && s.gr && s.p[1] > 8.6 && s.p[0] > 21.7) arrived = i;
    if (arrived >= 0 && i >= arrived + 43) settle = i;   // thieflook: +3 ring, +40 ring2
  }
  const climb = log.filter((r) => r.st === 'poleClimb');
  console.log(`mounted ${mounted} · climb frames ${climb.length} · boom during climb min ${Math.min(...climb.map((r) => r.boom)).toFixed(3)} max ${Math.max(...climb.map((r) => r.boom)).toFixed(3)} · arrived @${arrived}`);
  for (const r of log) {
    if (r.st === 'poleClimb' && r.i % 25 && r.whisk === null) continue;
    if (arrived >= 0 && r.i > arrived + 6 && r.i < arrived + 38) continue;
    if (!(r.st === 'poleClimb' || (arrived >= 0 && r.i >= arrived - 8) || r.i % 40 === 0)) continue;
    console.log(line(r.i, r));
  }
  if (arrived >= 0) {
    const a0 = log.find((r) => r.i === arrived + 3), a1 = log.find((r) => r.i === arrived + 43) || log[log.length - 1];
    console.log(`ring  (+3):  boom ${a0.boom} ndcY ${a0.ndc[1]} slack ${a0.slack} (browser 0.557 / -35.74)`);
    console.log(`ring2 (+43): boom ${a1.boom} ndcY ${a1.ndc[1]} slack ${a1.slack} (browser 1.507 / -1.90)`);
  }
  runs.push({ seq: 't3', mounted, arrived, log });
}

/* ── T1: the obelisk rope — thiefspots §A verbatim (lintel jump-grab, then climb). ────────── */
if (SEQ.includes('t1')) {
  console.log('\n=== T1 · obelisk rope — browser: mount boom 0.55 ndcY +1.26 · climb 0.55 +1.01 · top 0.55 +1.50');
  /* thieflook's REAL lintel stance (2.3, 9.02, 13.55), not thiefspots' air one (z 13.0): the
     hang azimuth on the rope follows the approach line, and the browser's crush happened with
     the player hung at (−0.17, ·, 12.58) — the crevice between rope and shaft face — which the
     z 13.55 approach produces. From z 13.0 the drive hangs on the open east side (0.452, 13.0)
     and compose fine (measured, previous run of this tool) — a different take, not the one
     photographed. No settle frames: 25 idle frames from the air stance spent the airtime on the
     plinth and the jump-grab then caught a kiosk hook ring instead of the rope (also measured). */
  hardReset(engine, c, V(2.3, 9.02, 13.55), Math.PI);
  aim(0, 13.0);
  setCam(Math.atan2(0 - 2.3, 13.0 - 13.55));
  const log = [];
  let mounted = false;
  for (let a = 0; a < 6 && !mounted; a++) {
    for (let i = 0; i < 90; i++) {
      frame((inp) => {
        aim(0, 13.0); inp.move.y = 1;
        if (i >= 4 && i < 18) inp.hold('jump'); else inp.let_go('jump');
        if (i > 6 && i % 5 === 0) inp.hold('interact'); else inp.let_go('interact');
      });
      log.push({ i: `m${a}.${i}`, ...probe() });
      if (c.stateName === 'poleClimb') { mounted = true; break; }
    }
    if (!mounted) {
      for (let i = 0; i < 260 && !(c.grounded && c.position.y > 8.6); i++)
        frame((inp) => { aim(2.6, 13.6); inp.move.y = 1; if (i % 30 < 14) inp.hold('jump'); else inp.let_go('jump'); });
    }
  }
  /* The hang azimuth is a free, player-steerable parameter of the attached state (`wishRaw.x`
     spins `p.angle` at TUNE.poleSpin), and it decides everything about this shot: the browser
     takes hang at atan2(−0.17, −0.42) ≈ −2.757 — the crevice between rope and shaft face — and
     both crushed; the near-side azimuths this drive's arcs grab at compose fine (measured,
     previous runs). Spin to the PHOTOGRAPHED azimuth by input before climbing, so the casts are
     evaluated at the pose in the committed frames rather than at whichever azimuth this arc
     happens to grab. */
  const AZ = Math.atan2(-0.17, -0.42);
  let spun = mounted;
  for (let i = 0; i < 300 && mounted; i++) {
    const err = ((AZ - c.pole.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (Math.abs(err) < 0.03) { spun = true; break; }
    frame((inp) => { inp.move.x = err > 0 ? -1 : 1; });
    if (i % 5 === 0) log.push({ i: `s${i}`, ...probe() });
    if (c.stateName !== 'poleClimb') { spun = false; break; }
  }
  console.log(`spun to azimuth ${c.pole?.angle?.toFixed(3)} (target ${AZ.toFixed(3)}) · hang (${c.position.x.toFixed(2)}, ${c.position.z.toFixed(2)}) — browser (-0.17, 12.58)`);
  let top = false;
  for (let i = 0; i < 700 && mounted && spun && !top; i++) {
    frame((inp) => { inp.move.y = 1; inp.let_go('interact'); inp.let_go('jump'); });
    log.push({ i: `c${i}`, ...probe() });
    if (c.position.y > 19.6) top = true;
    if (c.stateName !== 'poleClimb') break;
  }
  const climb = log.filter((r) => r.st === 'poleClimb');
  console.log(`mounted ${mounted} · top ${top} · climb frames ${climb.length} · boom during climb min ${climb.length ? Math.min(...climb.map((r) => r.boom)).toFixed(3) : '—'} max ${climb.length ? Math.max(...climb.map((r) => r.boom)).toFixed(3) : '—'}`);
  let lastKey = '';
  for (const r of log) {
    const k = `${r.st}|${short(r)}`;
    const interesting = r.st === 'poleClimb' || r.whisk;
    if (!interesting) continue;
    if (k === lastKey && String(r.i).endsWith('5') === false && !/^c\d*[05]$/.test(String(r.i))) continue;
    lastKey = k;
    console.log(line(r.i, r));
  }
  /* The whole-climb attribution: which collider held the binding claim, frame-counted. */
  const owners = new Map();
  for (const r of climb) {
    const h = r.whisk?.hit;
    const key = h ? `${h.tag}/${h.matl} r${h.r} @(${h.at?.[0]},${h.at?.[2]})` : '(cast clear)';
    owners.set(key, (owners.get(key) || 0) + 1);
  }
  console.log('binding blocker over the climb:', JSON.stringify([...owners.entries()]));
  const npBetter = climb.filter((r) => r.allowedNoPole > r.allowedSolid + 0.25).length;
  console.log(`noPole raises allowed over solid on ${npBetter}/${climb.length} climb frames · noPole min ${climb.length ? Math.min(...climb.map((r) => r.allowedNoPole)).toFixed(3) : '—'} · solid min ${climb.length ? Math.min(...climb.map((r) => r.allowedSolid)).toFixed(3) : '—'}`);
  runs.push({ seq: 't1', mounted, top, log });
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/', 'tests/'],
  { cwd: ROOT, encoding: 'utf8' }).trim();
await writeFile(`${ROOT}/shots/climbtrace.json`,
  JSON.stringify({ sha, dirty, seq: SEQ, tune: { camRadius: TUNE.camRadius, camPad: TUNE.camPad,
    distHardMin: TUNE.distHardMin, whisker: TUNE.whisker, whiskerUp: TUNE.whiskerUp }, runs }, null, 1));
console.log(`\nwrote shots/climbtrace.json (sha ${sha}${dirty ? ' DIRTY' : ''})`);
