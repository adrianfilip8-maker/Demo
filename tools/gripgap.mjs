#!/usr/bin/env node
/**
 * gripgap.mjs — how far is the hand from the thing it is supposed to be holding?
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────
 * §479.20 shipped the raw `Standupright` on the user's ruling and left ONE thing it could not
 * close, recorded as a watch item: on the GRIPPING poses the matched reading is the tighter one
 * (PoleClimbIdle 15.0 cm on their rig -> 28.2 raw, CaneSwing Idle 26.7 -> 42.3, LedgeGrab Idle
 * 51.1 -> 67.5), and those hands are supposed to be closed around a pole, a cane and a ledge
 * lip. The section calls the in-situ risk "invisible to a posed take by construction (§479.4's
 * stated limit)".
 *
 * **"Invisible" was too strong.** A posed take cannot judge it BY EYE, but hand-to-prop distance
 * is a number, and the prop's geometry is in the level. This measures it — in situ, on the
 * shipped character, with the player where the game puts him.
 *
 * ── The three traps this file is shaped around ──────────────────────────────────────────────
 *
 * §435.4 — SETTLED, NEVER TELEPORTED. Every grip below is reached by DRIVING: settle on a
 * stance the real capsule ends up `grounded` on, then walk/jump/press exactly as a player does,
 * and measure only after the state machine has taken the verb on its own. A grip measured on a
 * player PLACED at a pole is not a grip measured on a player who CLIMBED to it. The stances are
 * `reachcensus.test.mjs`'s measured ones where that file already has them; the ledge stances
 * were found by the same method (search, then settle) and each records the state path that
 * produced it.
 *
 * §439/§440 — THE INSTRUMENT MUST NOT SHARE THE SUBJECT'S ASSUMPTION. Two separations:
 *   · the HAND comes from the pose pipeline (buildClipSet -> Animation.update -> Rig.commit ->
 *     the shipped skeleton's own FK). The PROP comes from the world (Collision's BVH, the
 *     level's colliders, the drawn InstancedMesh matrices). Neither derives the other, and
 *     nothing in ANIMATION does hand IK — `_footIK` is the only IK there is, so no code
 *     anywhere snaps a hand onto a prop. A grip that lands is a grip the animator drew.
 *   · the GRIP POINT is not the wrist bone. It is the artist's own glove, read off the shipped
 *     model's skin weights (see `palmOf`) — an input the pose system never looks at. This is not
 *     pedantry: `handR` sits 19.5 cm from the glove's own centroid on this model, so a
 *     wrist-to-prop number is wrong by most of a forearm.
 *
 * §442 — A CORRECT MEASUREMENT ON THE WRONG SUBJECT. Two of that family are live here and both
 * are guarded rather than argued:
 *   · the subject is the SHIPPED character (`SlyModelDLRig`, the default `?char=` token), loaded
 *     offline by `dlrig.test.mjs`'s three mechanical rewrites. Not `SlyModel3`, whose skeleton
 *     happens to be the same one — "happens to be" is how §442 starts.
 *   · a pose sampled before its clip is live IS THE BIND POSE, where every bone matrix is the
 *     identity. `assertLive` refuses to report a sample whose dominant track is not the expected
 *     clip at weight >= 0.9, or whose delivered skeleton is within 5 deg of bind everywhere.
 *
 * ── §418.3: what each verb's claim is measured against ───────────────────────────────────────
 * Every verb runs three arms in the same process, and the two counterexamples are RUN, not
 * asserted from the mechanism:
 *   PASS   the driven grip, both regimes.
 *   FAIL-A the same world placement with the skeleton forced to BIND (arms hanging at the
 *          sides). If the gap does not blow up, the metric is not reading the pose — this is
 *          the §442 instance stated as an input.
 *   FAIL-B the same palms measured against the WRONG prop of the same class (the next pole /
 *          ring / lip along). If the gap does not blow up, the metric is not reading the prop.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────────────────────
 * It says nothing about whether a grip READS as closed — fingers are baked into the glove mesh
 * and this measures the glove's centroid, not its curl. It does not judge the standing pose and
 * cannot: no idle is driven here. And `rail_walk` is included for completeness and is reported
 * as what it is — a FOOT contract, not a grip — rather than folded into the hand table.
 *
 *   node tools/gripgap.mjs                       # both regimes, every verb
 *   node tools/gripgap.mjs --regime godot        # one regime (child process per regime)
 *   node tools/gripgap.mjs --verb pole,hook
 *   node tools/gripgap.mjs --json shots/gripgap.json
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REGIME = arg('--regime', '');
const VERBS = new Set(String(arg('--verb', 'pole,ledge,hook,rail')).split(',').map((s) => s.trim()));
const JSON_OUT = arg('--json', '');
/**
 * `--limbopen e,k` — the §531/§532.2 spread lever, as an ABLATION arm.
 *
 * `LIMB_OPEN = { elbow: 0.75, knee: 0.60 }` ships set-wide over the godot regime, and
 * `GODOT_LIMB_OPEN` exempts only the three combo slots, the two wall runs and the two standing
 * idles. None of the grip verbs is exempt. §479.10 already NAMED the criterion that decides
 * whether that is safe — *the lever may open a FREE limb; it may not straighten a limb whose
 * hand is PLACED* — so "what do these numbers look like with the lever off" is the one question
 * that separates a pose defect from a lever defect. `globalThis.__LIMB_OPEN` is the module's own
 * documented pre-module seam for exactly this; `0,0` is bit-exact identity by construction.
 */
const LIMB = arg('--limbopen', '');
if (LIMB) {
  const [e, k] = LIMB.split(',').map(Number);
  globalThis.__LIMB_OPEN = { elbow: e, knee: k };
}

const cm = (m) => +(m * 100).toFixed(1);   // declared above the re-exec: `printCompare` runs in the PARENT

/* ── the two regimes are two MODULE-LEVEL clip tables, so they are two processes ───────────────
   `Animation.js` binds `ACTIVE` at import from `globalThis.__ANIM_AB`, and nothing can rebind it
   afterwards (§525.7). One process per regime, re-execed here so the caller runs one command. */
if (!REGIME) {
  const rows = [];
  for (const r of ['godot', 'proc']) {
    const out = execFileSync(process.execPath,
      [path.join(ROOT, 'tools/gripgap.mjs'), '--regime', r, '--verb', [...VERBS].join(','),
        ...(LIMB ? ['--limbopen', LIMB] : []), '--json', `/tmp/gripgap-${r}${LIMB ? `-lo${LIMB.replace(',', '_')}` : ''}.json`],
      { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] });
    process.stdout.write(out);
    rows.push(JSON.parse(readFileSync(`/tmp/gripgap-${r}${LIMB ? `-lo${LIMB.replace(',', '_')}` : ''}.json`, 'utf8')));
  }
  printCompare(rows[0], rows[1]);
  if (JSON_OUT) {
    mkdirSync(path.dirname(path.resolve(ROOT, JSON_OUT)), { recursive: true });
    writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify({ godot: rows[0], proc: rows[1] }, null, 1));
    console.log(`\nwrote ${JSON_OUT}`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------------ boot ---- */
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class { constructor(t, i = {}) { this.type = t; Object.assign(this, i); } };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  if (url.startsWith('file:')) return new Response(readFileSync(new URL(url)), { status: 200 });
  return realFetch(input, init);
};

/**
 * The SHIPPED character, offline. Three mechanical rewrites, each asserted, exactly as
 * `tests/dlrig.test.mjs` does them and for the same three reasons (`import.meta.glob` is a Vite
 * macro; `import.meta.url` + `fetch` refuses `file:`; the rewritten copy lives elsewhere so its
 * relative specifiers must be absolute). Nothing else is touched, so this is the module that
 * ships and not a replica of it (§442).
 */
async function loadShippedCharacter() {
  const SRC = path.join(ROOT, 'src/player/SlyModelDLRig.js');
  const SHIM = path.join(ROOT, 'node_modules/.gripgap');
  let src = readFileSync(SRC, 'utf8');
  const globRe = /import\.meta\.glob\([^;]*?\);/;
  if ((src.match(new RegExp(globRe.source, 'g')) || []).length !== 1) {
    throw new Error('gripgap: expected exactly one import.meta.glob in SlyModelDLRig.js');
  }
  src = src.replace(globRe, '{};');
  if (!src.includes('import.meta.url')) throw new Error('gripgap: no import.meta.url in SlyModelDLRig.js');
  src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));
  const relRe = /(\bfrom\s+')(\.\.?\/[^']+)(')/g;
  if (!src.match(relRe)) throw new Error('gripgap: no relative imports in SlyModelDLRig.js');
  src = src.replace(relRe, (_m, a, spec, c) => a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + c);
  mkdirSync(SHIM, { recursive: true });
  const out = path.join(SHIM, `char.${process.pid}.mjs`);
  writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

globalThis.__ANIM_AB = REGIME;
const CharMod = await loadShippedCharacter();
const { realWorld, hardReset, DT } = await import('../tests/_moveset.mjs');
const { TUNE } = await import('../src/player/Controller.js');
const { Animation, CLIP_REGIME, CLIP_ORIGIN } = await import('../src/player/Animation.js');
if (CLIP_REGIME !== REGIME) {
  throw new Error(`gripgap: asked for regime "${REGIME}" but Animation.js loaded "${CLIP_REGIME}" — `
    + 'the pre-module seam did not take and every number below would be from the wrong set.');
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------------------------------------------------- the palm point ---- */
/**
 * The grip point of one hand, from the ARTIST'S GLOVE and not from the rig.
 *
 * Every project bone is built with an identity bind rotation (see `SlyModelDLRig.init`), so a
 * bone's bind world matrix is a pure translation and a vertex rigid to that bone has local
 * coordinates `bindPos(vertex) − bindPos(bone)`. The glove's weighted centroid is therefore a
 * fixed offset in the hand's own frame, and posing the hand carries it exactly as the skinning
 * carries the mesh. `fistR` is the RMS spread of the same vertices about that centroid — the
 * physical size of the closed hand, which is what "closed around it" has to be judged against.
 *
 * Measured on the shipped model: handL 0.209 m out from the wrist bone, handR 0.195 m. The
 * artist's own solved cane socket (`_relaxGloves` -> `caneSocket`, a completely independent
 * derivation from the finger chains) lands at 0.240 m on the right, which is the corroboration
 * that this offset is the fist and not an artefact of the weight threshold.
 */
function palmOf(model, side) {
  const geo = model.mesh.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const target = model.boneNames.indexOf(`hand${side}`);
  if (target < 0) throw new Error(`gripgap: no hand${side} in the shipped skeleton`);
  const c = new THREE.Vector3(); let wsum = 0; const keep = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === target) w += sw.getComponent(i, k);
    if (w < 0.5) continue;
    p.fromBufferAttribute(pos, i);
    c.addScaledVector(p, w); wsum += w; keep.push(p.clone());
  }
  if (keep.length < 200) throw new Error(`gripgap: only ${keep.length} vertices dominated by hand${side} — the weight map moved`);
  c.multiplyScalar(1 / wsum);
  let s2 = 0; for (const q of keep) s2 += q.distanceToSquared(c);
  const bind = model._bindWorld[`hand${side}`];
  return { local: c.clone().sub(bind), fistR: Math.sqrt(s2 / keep.length), n: keep.length };
}

/* ------------------------------------------------------------------ world ---- */
const { engine, collision, mods, c } = await realWorld();
const model = new CharMod.SlyModel(engine);
await model.init();
mods.character = model;
engine.scene.add(model.root);
const anim = new Animation(engine);
await anim.init();
mods.animation = anim; c.anim = anim; c.character = model;
if (!anim.ready || !anim.rig) throw new Error('gripgap: ANIMATION never bound the shipped rig');

const PALM = { L: palmOf(model, 'L'), R: palmOf(model, 'R') };
const CANE = model.cane || null;

const step = (script) => {
  engine.input.beginFrame(DT);
  engine.input.move.x = 0; engine.input.move.y = 0;
  script(engine.input, c);
  engine.time += DT;
  /* MANIFEST order: character, animation, movement (src/main.js). ANIMATION samples the tracks
     MOVEMENT asserted last frame; MOVEMENT then moves and pushes the drawn root. Sampling after
     both is exactly the composition a rendered frame carries. */
  anim.update(DT, engine.time);
  c.update(DT, engine.time);
};
const aim = (x, z) => {
  engine.camera.rotation.set(0, Math.atan2(-(x - c.position.x), -(z - c.position.z)), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
};

/** World position of a hand's grip point, and of the wrist bone beside it. */
function hands() {
  model.root.updateMatrixWorld(true);
  const out = {};
  for (const S of ['L', 'R']) {
    const b = model.bones[`hand${S}`];
    out[S] = {
      palm: b.localToWorld(PALM[S].local.clone()),
      wrist: new THREE.Vector3().setFromMatrixPosition(b.matrixWorld),
    };
  }
  out.cane = CANE ? CANE.object.localToWorld(CANE.hookPoint.clone()) : null;
  out.hips = new THREE.Vector3().setFromMatrixPosition(model.bones.hips.matrixWorld);
  out.shoulderL = new THREE.Vector3().setFromMatrixPosition(model.bones.upperArmL.matrixWorld);
  out.shoulderR = new THREE.Vector3().setFromMatrixPosition(model.bones.upperArmR.matrixWorld);
  return out;
}

/**
 * §442, as a refusal rather than a hope. A sample is only reported if the clip under test is
 * the dominant live track at weight >= 0.9 AND the delivered skeleton is actually off bind.
 * The second half is the live instance the ledger records: an instrument that CPU-skinned the
 * bind pose could not have detected the thing it was testing for, because every bone matrix
 * there is the identity.
 */
function assertLive(want, label, allowLayer = []) {
  const live = anim.tracks.filter((t) => t.clip && t.w > 0.01)
    .sort((a, b) => b.w - a.w)
    .map((t) => ({ name: t.clip.name, w: +t.w.toFixed(3), t: +t.time.toFixed(3) }));
  const mine = live.find((l) => l.name === want);
  const stray = live.filter((l) => l.name !== want && !allowLayer.includes(l.name));
  if (!mine || mine.w < 0.9 || stray.length) {
    throw new Error(`gripgap ${label}: expected "${want}" live at w>=0.9`
      + `${allowLayer.length ? ` (layers allowed: ${allowLayer.join(', ')})` : ''}, got `
      + (live.length ? live.map((l) => `${l.name} w${l.w}`).join(' + ') : '(nothing)'));
  }
  let worst = 0;
  for (const n of model.boneNames) {
    const q = model.bones[n].quaternion;
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI);
  }
  if (worst < 5) {
    throw new Error(`gripgap ${label}: the delivered skeleton is within ${worst.toFixed(2)} deg of BIND everywhere `
      + '— this is the rest pose wearing a clip name (§442), not a grip');
  }
  return { live, offBindDeg: +worst.toFixed(1) };
}

/** Force the skeleton to bind at the current world placement — FAIL-A's input. */
function poseBind() {
  for (const n of model.boneNames) { model.bones[n].quaternion.identity(); model.bones[n].scale.set(1, 1, 1); }
  const hb = model._bindWorld.hips;
  model.bones.hips.position.set(hb.x, hb.y, hb.z);
  model.root.updateMatrixWorld(true);
}

/* ------------------------------------------------------------- prop metrics ---- */
/** Signed gap from `p` to an infinite vertical cylinder of radius `r` at (cx, cz). */
function toPole(p, cx, cz, r) {
  const dx = p.x - cx, dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  return { gap: d - r, axis: d, ang: Math.atan2(dx, dz) };
}
/** Distance from `p` to the horizontal lip EDGE line, split into its two readable components. */
function toLip(p, edge, nx, nz) {
  const d = p.clone().sub(edge);
  const out = d.x * nx + d.z * nz;             // + = outside the wall face
  const up = d.y;                              // + = above the top surface
  const along = d.x * -nz + d.z * nx;          // along the lip
  return { out, up, along, line: Math.hypot(out, up) };
}
/** Distance from `p` to a torus: `R` axis circle, `tube` tube radius, centre `C`, normal `N`. */
function toRing(p, C, N, R, tube) {
  const d = p.clone().sub(C);
  const ax = d.dot(N);
  const rad = d.clone().addScaledVector(N, -ax).length();
  const toAxisCircle = Math.hypot(rad - R, ax);
  return { axisCircle: toAxisCircle, surface: toAxisCircle - tube, centre: d.length() };
}
/**
 * Is this point BURIED in the level's solid — asked of the shipped BVH by line of sight, and not
 * of my own plane arithmetic.
 *
 * This is what turns "the palm is 22 cm behind the wall's face plane" from a derivation into a
 * measurement: a plane is a MODEL of the wall and can be wrong about a batter, a chamfer or a
 * parapet thinner than the number; the BVH is the wall. A point outside the solid can see open
 * space along at least one direction; a point inside cannot see it along any.
 *
 * `Collision._depenetrate` WAS the first version of this and is written up rather than quietly
 * replaced, because it is this ledger's recurring failure mode: it returned 0 — "not inside" —
 * for every palm including the ones 22 cm behind a wall face, so as an inside/outside test it
 * was an instrument that answers "healthy" for every input (§39/§43/§50). The cause is that it
 * is a shallow CONTACT resolver: `deepestContact` only finds triangles within the probe's own
 * radius, so a point deep inside a solid is nowhere near a triangle and reads clear. It is the
 * right routine for a capsule grazing a surface and the wrong one for this question.
 */
const PROBE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].map(([x, y, z]) => V(x, y, z));
/**
 * Ray parity: march out of the point along each of five directions counting surface crossings.
 * An odd count means the ray started INSIDE. Returns how many of the five agree on "inside".
 *
 * LIMIT, stated because it decides how the number may be read: the level's colliders are proxy
 * shells and are not guaranteed watertight, so a mid-range vote (2 or 3) is inconclusive and only
 * a clean 0 or 5 is worth quoting. Both readings this file actually produces are clean, and both
 * were checked against hand-picked points before use — a point 21 cm behind the terrace face
 * reads 5/5 and a point 13 cm outside it reads 0/5.
 *
 * The FIRST version of this used `Collision._depenetrate`, and it is written up rather than
 * quietly replaced because it is this ledger's recurring failure mode: it returned "not inside"
 * for every palm including the ones deep behind a wall face — an instrument that answers
 * "healthy" for every input (§39/§43/§50). The cause is that it is a shallow CONTACT resolver:
 * `deepestContact` only finds triangles within the probe's own radius, so a point well inside a
 * solid is nowhere near a triangle and reads clear. Right routine for a capsule grazing a
 * surface, wrong one for this question.
 */
function insideOdd(p, reach = 8) {
  let odd = 0;
  for (const d of PROBE_DIRS) {
    let cur = p.clone(), left = reach, n = 0;
    for (let k = 0; k < 40 && left > 1e-3; k++) {
      const h = collision.raycast(cur, d, left);
      if (!h?.hit) break;
      n++; const adv = h.distance + 1e-3; cur.addScaledVector(d, adv); left -= adv;
    }
    if (n % 2 === 1) odd++;
  }
  return odd;
}

/** Nearest distance from `p` to a curve, by dense sampling then a local refine. */
function toCurve(p, curve, n = 400) {
  let bu = 0, bd = Infinity;
  const q = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n; curve.getPointAt(u, q);
    const d = q.distanceTo(p); if (d < bd) { bd = d; bu = u; }
  }
  for (let s = 1 / n; s > 1e-5; s *= 0.5) {
    for (const u of [bu - s, bu + s]) {
      if (u < 0 || u > 1) continue;
      curve.getPointAt(u, q); const d = q.distanceTo(p);
      if (d < bd) { bd = d; bu = u; }
    }
  }
  return { d: bd, u: bu };
}

/* ------------------------------------------------------------------ drives ---- */
const results = {
  regime: REGIME,
  limbOpen: globalThis.__LIMB_OPEN || null,
  origin: {},
  palm: { L: +PALM.L.local.length().toFixed(4), R: +PALM.R.local.length().toFixed(4), fistR: +((PALM.L.fistR + PALM.R.fistR) / 2).toFixed(4) },
  verbs: [],
};
for (const k of ['pole_climb', 'ledge_hang', 'hook_swing', 'hook_grab', 'rail_walk']) results.origin[k] = CLIP_ORIGIN[k];

/**
 * A grip clip is not one frame. `pole_climb` is a hand-over-hand CYCLE, so a single sample
 * catches one hand reaching and the other holding and says nothing about either; `ledge_hang`
 * and `hook_swing` are near-static holds, and a sweep over them is what shows they stay put.
 * So every site sweeps its own window and reports the distribution, and the statistic that
 * decides a climb is `bestWorst`: at the WORST moment of the cycle, how far is the NEAREST hand
 * from the shaft. A cycle where that stays small is a cycle where a hand is always on the pole.
 */
function sweepStats(rows) {
  const st = (vals) => ({ min: +Math.min(...vals).toFixed(4), mean: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4), max: +Math.max(...vals).toFixed(4) });
  const L = rows.map((r) => r.L), R = rows.map((r) => r.R);
  return { n: rows.length, L: st(L), R: st(R), best: st(rows.map((r) => Math.min(r.L, r.R))), bestWorst: +Math.max(...rows.map((r) => Math.min(r.L, r.R))).toFixed(4) };
}

/** Settle at `start`, then run `drive` until `want` is the state. Throws if the drive misses. */
function driveTo(start, yaw, want, drive, frames, label) {
  /* The camera is what `wishDir` is relative to, and it is SHARED across every drive in this
     process. A site that inherits the previous site's aim walks in the previous site's
     direction — which is not a subtle failure, it is a run that reports "never reached the
     verb" while the drive was correct. Point it along the approach before anything settles;
     the per-frame `aim()` calls below then own it from there. */
  engine.camera.rotation.set(0, yaw + Math.PI, 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
  hardReset(engine, c, V(...start), yaw);
  for (let i = 0; i < 25; i++) step(() => {});
  if (!c.grounded) throw new Error(`gripgap ${label}: the stance never settled grounded (y ${c.position.y.toFixed(2)})`);
  const pathTrace = []; let last = '';
  for (let i = 0; i < frames; i++) {
    step((inp) => drive(inp, i));
    if (c.stateName !== last) { pathTrace.push(`${c.stateName}@${i}`); last = c.stateName; }
    if ([].concat(want).includes(c.stateName)) return { at: i, path: pathTrace.join(' '), state: c.stateName };
  }
  throw new Error(`gripgap ${label}: never reached ${[].concat(want).join('/')} (${pathTrace.join(' ')})`);
}

/* ---- pole ---- */
const POLES = [
  ['SE drainpipe (§495.C)', [21.95, 0.00, -2.00], [21.35, 4.80, -2.00], 'walk'],
  ['obelisk rope (§495.A)', [0.60, 6.30, 13.00], [0, 15.00, 13.00], 'walkE'],
];
function measurePole(label, start, target, verb) {
  const yaw = Math.atan2(target[0] - start[0], target[2] - start[2]);
  const got = driveTo(start, yaw, 'poleClimb', (inp, i) => {
    aim(target[0], target[2]);
    inp.move.y = 1;
    if (verb === 'walkE' && i > 3 && i % 6 === 0) inp.hold('interact'); else inp.let_go('interact');
  }, 260, label);
  const p = { x: c.pole.x, z: c.pole.z, r: c.pole.r, hold: c.pole.hold, top: c.pole.top, bottom: c.pole.bottom };
  /* Climb for a beat so the cycle is genuinely running, then sweep 96 frames (1.6 s — longer
     than the clip) while he keeps climbing. A grip on a pole is what the hands do THROUGHOUT
     the cycle, not at one frame.

     §720 — WAIT OUT THE MOUNT ONE-SHOT FIRST. `PoleClimb.enter` now fires `pole_grab` (their
     `PoleGrab`, 0.67 s, non-looping) where it used to fire `pole_climb`, which under the godot
     regime coalesced into the base clip by §525's same-source rule and so was never a second
     live track. A fixed 30-frame settle (0.5 s) left the catch still at w1 and `assertLive`
     refused the sample — correctly: two clips at w1 is not a reading of either. This waits for
     the one-shot to actually retire rather than for a frame count that happened to be long
     enough, so the numbers below stay the same quantity §713.4 and §715.8 quote. */
  /* `t.w > 0.01` would be the obvious predicate and it is WRONG here: `play()` adds the track
     with weight 0 and a target of 1, so on the frame the mount fires the catch is present and
     weightless. Tested that way the wait fell straight through, the 30 frames below took the
     clip to w1, and `assertLive` refused the first sample — the guard catching a settle that had
     not settled. The predicate is therefore the track's EXISTENCE, which is what `_advance`
     clears when a one-shot finishes. */
  const grabLive = () => anim.tracks.some((t) => t.clip && t.clip.name === 'pole_grab');
  let settle = 0;
  while (grabLive() && settle < 180) { step((inp) => { inp.move.y = 0.5; }); settle++; }
  if (settle >= 180) throw new Error(`gripgap ${label}: the mount one-shot never retired in 3 s`);
  for (let i = 0; i < 30; i++) step((inp) => { inp.move.y = 0.5; });
  const rows = []; let live = null; let bind = null; let palms = null;
  for (let i = 0; i < 96; i++) {
    step((inp) => { inp.move.y = 0.5; });
    if (c.stateName !== 'poleClimb') throw new Error(`gripgap ${label}: fell off the pole (${c.stateName})`);
    live = assertLive('pole_climb', label);
    const h = hands();
    const rad = V(c.position.x - p.x, 0, c.position.z - p.z).normalize();
    const tan = V(-rad.z, 0, rad.x);
    const sL = h.L.palm.clone().sub(V(p.x, h.L.palm.y, p.z)).dot(tan);
    const sR = h.R.palm.clone().sub(V(p.x, h.R.palm.y, p.z)).dot(tan);
    rows.push({
      L: toPole(h.L.palm, p.x, p.z, p.r).gap, R: toPole(h.R.palm, p.x, p.z, p.r).gap,
      wL: toPole(h.L.wrist, p.x, p.z, p.r).gap, wR: toPole(h.R.wrist, p.x, p.z, p.r).gap,
      pL: insideOdd(h.L.palm), pR: insideOdd(h.R.palm),
      /* Hand-to-hand separation — the quantity §479.20's watch item was written in. Carried so
         the two readings can be compared on their own terms, not so it decides anything: a lip
         is a continuous edge metres long and a pole is 36 cm across, so "wider than the prop"
         is only a failure mode for one of the three props here (§708). */
      sep: h.L.palm.distanceTo(h.R.palm),
      straddle: sL * sR < 0,
    });
    if (i === 0) {
      palms = { L: h.L.palm.clone(), R: h.R.palm.clone() };
      /* FAIL-A, in-arm: same world placement, skeleton forced to bind. */
      poseBind();
      const hb = hands();
      bind = { L: toPole(hb.L.palm, p.x, p.z, p.r).gap, R: toPole(hb.R.palm, p.x, p.z, p.r).gap };
      model.root.updateMatrixWorld(true);
    }
  }
  const stats = sweepStats(rows);
  stats.wrist = sweepStats(rows.map((r) => ({ L: r.wL, R: r.wR })));
  stats.pen = sweepStats(rows.map((r) => ({ L: r.pL, R: r.pR })));
  if (rows[0].sep != null) stats.sep = sweepStats(rows.map((r) => ({ L: r.sep, R: r.sep }))).L;
  stats.straddleFrac = +(rows.filter((r) => r.straddle).length / rows.length).toFixed(3);
  return { verb: 'pole_climb', label, clip: CLIP_ORIGIN.pole_climb, prop: { kind: 'cylinder', ...p }, entry: got, stats, live, failBind: bind, palms };
}

/* ---- ledge ---- */
/* Found by search then settled, the `reachcensus` method: a stance the real capsule ends up
   grounded on, a walk-in, a jump, and `LedgeHang.canEnter`'s own probe taking him. Forward is
   held at 0.45 after the jump on purpose — above `canEnter`'s `wishMag > 0.3` and below
   `LedgeHang.update`'s `wishRaw.z > 0.5`, which is the line between hanging and mantling. */
const LEDGES = [
  /* [label, settled stance, approach yaw, jump frame] — each recorded with the state path its
     own drive produced, below, so a site that stops working says so rather than drifting. */
  ['temple terrace lip, south face (top 5.20)', [0.00, 2.00, 3.40], 0, 8],
  ['temple terrace lip, east face (top 5.20)', [-7.90, 2.00, 5.85], Math.PI / 2, 12],
  ['temple plinth lip, south face (top 2.00)', [0.00, 0.00, 1.30], 0, 8],
];
function measureLedge(label, start, yaw, jumpAt) {
  const got = driveTo(start, yaw, 'ledgeHang', (inp, i) => {
    inp.move.y = i < jumpAt ? 1 : 0.45;
    if (i >= jumpAt && i < jumpAt + 6) inp.hold('jump'); else inp.let_go('jump');
  }, 200, label);
  const nx = c.ledge.nx, nz = c.ledge.nz, ly = c.ledge.y;
  /* The lip EDGE, re-derived from the BVH rather than taken from the state's bookkeeping: cast
     into the wall from lip height to find the face, then down just outside it to confirm the
     top. `probeLedge` stores a STANCE (the face point pushed back by `radius * 0.96`), which is
     not the edge — using it would put the target a third of a metre off. */
  const from = V(c.position.x + nx * 0.9, ly - 0.05, c.position.z + nz * 0.9);
  const into = V(-nx, 0, -nz);
  const face = collision.raycast(from, into, 2.0);
  if (!face?.hit) throw new Error(`gripgap ${label}: no wall face under the lip — cannot locate the edge`);
  const edge = V(face.point.x, ly, face.point.z);
  /* Hold, no input, and sweep 96 frames. `ledge_hang` is a held idle, so this reports whether
     the hands STAY where the clip put them as much as where that is. */
  for (let i = 0; i < 24; i++) step((inp) => { inp.move.y = 0; });
  const rows = []; let live = null; let bind = null; let palms = null; let detail = null;
  for (let i = 0; i < 96; i++) {
    step((inp) => { inp.move.y = 0; });
    if (c.stateName !== 'ledgeHang') throw new Error(`gripgap ${label}: let go of the lip (${c.stateName})`);
    live = assertLive('ledge_hang', label);
    const h = hands();
    const dL = toLip(h.L.palm, edge, nx, nz), dR = toLip(h.R.palm, edge, nx, nz);
    rows.push({
      L: dL.line, R: dR.line,
      wL: toLip(h.L.wrist, edge, nx, nz).line, wR: toLip(h.R.wrist, edge, nx, nz).line,
      outL: dL.out, upL: dL.up, outR: dR.out, upR: dR.up,
      pL: insideOdd(h.L.palm), pR: insideOdd(h.R.palm),
      sep: h.L.palm.distanceTo(h.R.palm),
      /* Height of each grip point above the FEET. `TUNE.hangDrop` (1.62 m) is what puts the feet
         below the lip, and it was derived against the procedural hang — so this is the number
         that says whether the drop still suits the clip that replaced it. */
      hfL: h.L.palm.y - c.position.y, hfR: h.R.palm.y - c.position.y,
      wfL: h.L.wrist.y - c.position.y, wfR: h.R.wrist.y - c.position.y,
      straddle: dL.along * dR.along < 0,
    });
    if (i === 0) {
      palms = { L: h.L.palm.clone(), R: h.R.palm.clone() };
      detail = { L: dL, R: dR };
      poseBind();
      const hb = hands();
      bind = { L: toLip(hb.L.palm, edge, nx, nz).line, R: toLip(hb.R.palm, edge, nx, nz).line };
      model.root.updateMatrixWorld(true);
    }
  }
  const stats = sweepStats(rows);
  stats.wrist = sweepStats(rows.map((r) => ({ L: r.wL, R: r.wR })));
  stats.pen = sweepStats(rows.map((r) => ({ L: r.pL, R: r.pR })));
  if (rows[0].sep != null) stats.sep = sweepStats(rows.map((r) => ({ L: r.sep, R: r.sep }))).L;
  stats.straddleFrac = +(rows.filter((r) => r.straddle).length / rows.length).toFixed(3);
  stats.aboveFeet = {
    palm: sweepStats(rows.map((r) => ({ L: r.hfL, R: r.hfR }))),
    wrist: sweepStats(rows.map((r) => ({ L: r.wfL, R: r.wfR }))),
    hangDrop: TUNE.hangDrop,
  };
  stats.split = {
    outL: sweepStats(rows.map((r) => ({ L: r.outL, R: r.outR }))).L,
    upL: sweepStats(rows.map((r) => ({ L: r.upL, R: r.upR }))).L,
    outR: sweepStats(rows.map((r) => ({ L: r.outR, R: r.outL }))).L,
    upR: sweepStats(rows.map((r) => ({ L: r.upR, R: r.upL }))).L,
  };
  return { verb: 'ledge_hang', label, clip: CLIP_ORIGIN.ledge_hang, prop: { kind: 'lip', edge: edge.toArray().map((v) => +v.toFixed(3)), n: [nx, nz], y: ly }, entry: got, stats, detail, live, failBind: bind, palms };
}

/* ---- hook ---- */
/**
 * The ring's true frame, off the DRAWN InstancedMesh rather than off the level source. `hookRing`
 * builds a torus in local XY with its face normal on +Z (§605), so the instance matrix carries
 * both the centre and the normal. Reading the drawn thing means a ring that moves changes this
 * measurement instead of quietly invalidating it.
 */
function ringFrame(anchor) {
  let best = null;
  engine.scene.traverse((o) => {
    if (!o.isInstancedMesh || !/hooks:/.test(o.name || '')) return;
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
      const d = pos.distanceTo(anchor);
      if (d > 0.6 || (best && d >= best.d)) continue;
      n.set(0, 0, 1).transformDirection(m).transformDirection(o.matrixWorld).normalize();
      best = { d, C: pos.clone(), N: n.clone(), mesh: o.name };
    }
  });
  if (!best) throw new Error(`gripgap: no drawn ring within 0.6 m of the anchor ${anchor.toArray().map((v) => v.toFixed(2))}`);
  return best;
}
const RING_R = 0.62, RING_TUBE = 0.115;
const HOOKS = [
  ['main-0 (courtyard chain)', [20.42, 15.90, 27.42], [20.00, 14.90, 27.00], 'walk'],
  ['low-2 (return chain)', [-4.20, 9.00, 14.00], [-6.00, 11.80, 14.00], 'walk'],
];
function measureHook(label, start, target, verb) {
  const yaw = Math.atan2(target[0] - start[0], target[2] - start[2]);
  const got = driveTo(start, yaw, 'hookSwing', (inp, i) => {
    aim(target[0], target[2]);
    inp.move.y = 1;
    if (verb === 'walkE' && i > 3 && i % 6 === 0) inp.hold('interact'); else inp.let_go('interact');
  }, 260, label);
  const anchor = c.anchor.clone();
  const ring = ringFrame(anchor);
  /* Past `hookMinSwing` and well past the `hook_grab` one-shot, so the sweep reads the HANG and
     not the catch (§529: `hook_swing` is the base and `hook_grab` layers on top of it). No
     input, so nothing releases. */
  for (let i = 0; i < 150; i++) step(() => {});
  const rows = []; let live = null; let bind = null; let palms = null; let caneP = null;
  for (let i = 0; i < 96; i++) {
    step(() => {});
    if (c.stateName !== 'hookSwing') throw new Error(`gripgap ${label}: left the ring (${c.stateName})`);
    live = assertLive('hook_swing', label);
    const h = hands();
    rows.push({
      L: toRing(h.L.palm, ring.C, ring.N, RING_R, RING_TUBE).surface,
      R: toRing(h.R.palm, ring.C, ring.N, RING_R, RING_TUBE).surface,
      wL: toRing(h.L.wrist, ring.C, ring.N, RING_R, RING_TUBE).surface,
      wR: toRing(h.R.wrist, ring.C, ring.N, RING_R, RING_TUBE).surface,
      cane: h.cane ? toRing(h.cane, ring.C, ring.N, RING_R, RING_TUBE).axisCircle : null,
      caneC: h.cane ? h.cane.distanceTo(ring.C) : null,
      pL: insideOdd(h.L.palm), pR: insideOdd(h.R.palm),
      sep: h.L.palm.distanceTo(h.R.palm),
      /* The rope tilts; the BODY does not follow it (root rotation is yaw only), so hand-to-ring
         grows with the swing angle for reasons that are the STATE's and not the pose's. Recorded
         per frame so the pose can be read at the bottom of the arc, where the two agree. */
      tilt: Math.acos(Math.min(1, Math.max(-1, c.position.clone().sub(ring.C).normalize().dot(V(0, -1, 0))))) * 180 / Math.PI,
    });
    if (i === 0) {
      palms = { L: h.L.palm.clone(), R: h.R.palm.clone() };
      caneP = h.cane ? h.cane.clone() : null;
      poseBind();
      const hb = hands();
      bind = { L: toRing(hb.L.palm, ring.C, ring.N, RING_R, RING_TUBE).surface, R: toRing(hb.R.palm, ring.C, ring.N, RING_R, RING_TUBE).surface };
      model.root.updateMatrixWorld(true);
    }
  }
  const stats = sweepStats(rows);
  stats.wrist = sweepStats(rows.map((r) => ({ L: r.wL, R: r.wR })));
  stats.pen = sweepStats(rows.map((r) => ({ L: r.pL, R: r.pR })));
  if (rows[0].sep != null) stats.sep = sweepStats(rows.map((r) => ({ L: r.sep, R: r.sep }))).L;
  stats.tilt = sweepStats(rows.map((r) => ({ L: r.tilt, R: r.tilt }))).L;
  /* The pose read at the bottom of the arc — the frames where the rope is within 10 deg of
     vertical, i.e. where the body and the rope agree and the swing cannot be blamed. */
  const low = rows.filter((r) => r.tilt <= 10);
  stats.upright = low.length >= 4
    ? { n: low.length, ...sweepStats(low), cane: sweepStats(low.map((r) => ({ L: r.cane, R: r.cane }))).L }
    : { n: low.length, note: 'the swing never came within 10 deg of vertical during the sweep' };
  if (rows[0].cane != null) {
    stats.cane = sweepStats(rows.map((r) => ({ L: r.cane, R: r.cane }))).L;
    stats.caneCentre = sweepStats(rows.map((r) => ({ L: r.caneC, R: r.caneC }))).L;
    stats.crookRadius = CANE.opts?.tune?.hookRadius ?? 0.168;
  }
  stats.note = 'a ring is a point prop; the source hang is ONE-ARMED (§479.8), so hand-to-hand straddle is not the contract — the cane row is';
  return { verb: 'hook_swing', label, clip: CLIP_ORIGIN.hook_swing, prop: { kind: 'ring', C: ring.C.toArray().map((v) => +v.toFixed(3)), N: ring.N.toArray().map((v) => +v.toFixed(3)), R: RING_R, tube: RING_TUBE, mesh: ring.mesh }, entry: got, stats, live, failBind: bind, palms, caneP };
}

/* ---- rail ---- */
const RAILS = [
  ['colossi-rope (§495.B)', [-7.90, 4.72, 27.00], [9.00, 4.95, 27.00], 'sneak'],
  ['roof-e', [12.00, 16.60, -18.50], [11.40, 17.42, -18.50], 'walkE'],
];
function measureRail(label, start, target, verb) {
  const yaw = Math.atan2(target[0] - start[0], target[2] - start[2]);
  /* Both rail states count. `roof-e` is entered at speed and lands in `railSlide`; the
     colossi rope is walked on at the walker's own pace and lands in `railWalk`. They play
     different clips and both are on the same line, so the drive names whichever it got rather
     than forcing one and reporting a failure for the other. */
  const got = driveTo(start, yaw, ['railWalk', 'railSlide'], (inp, i) => {
    aim(target[0], target[2]);
    inp.move.y = 1;
    if (verb === 'sneak') inp.hold('sneak');
    if (verb === 'walkE' && i > 3 && i % 6 === 0) inp.hold('interact'); else inp.let_go('interact');
  }, 320, label);
  const RAILST = ['railWalk', 'railSlide'];
  const spline = c.rail.spline;
  if (!spline) throw new Error(`gripgap ${label}: on a rail with no spline`);
  const rows = []; let live = null; let clipPlayed = null;
  /* Let the mount's `rail_slide` -> `rail_walk` crossfade finish. A sample taken inside it is a
     50/50 mean of two clips and is not either of them (§525's shape), which `assertLive` would
     refuse anyway — settling is the honest answer, not loosening the guard. */
  for (let i = 0; i < 30 && RAILST.includes(c.stateName); i++) step((inp) => { inp.move.y = 0.35; if (verb === 'sneak') inp.hold('sneak'); });
  for (let i = 0; i < 40; i++) {
    step((inp) => { inp.move.y = 0.35; if (verb === 'sneak') inp.hold('sneak'); });
    if (!RAILST.includes(c.stateName)) break;
    clipPlayed = c.stateName === 'railSlide' ? 'rail_slide'
      : Math.abs(c.rail.speed) > 0.25 ? 'rail_walk' : 'balance_idle';
    /* `RailWalk.enter` fires `rail_walk` as a ONE-SHOT and `update` re-asserts it as the base,
       and the mount's `rail_slide` is still finishing on top of both — a real layer, not a
       crossfade, so it is named as an allowed one rather than waited out forever. */
    live = assertLive(clipPlayed, label, ['rail_slide', 'rail_walk', 'balance_idle']);
    model.root.updateMatrixWorld(true);
    const h = hands();
    const fp = (S) => new THREE.Vector3().setFromMatrixPosition(model.bones[`foot${S}`].matrixWorld);
    rows.push({
      L: toCurve(fp('L'), spline).d, R: toCurve(fp('R'), spline).d,
      wL: toCurve(h.L.palm, spline).d, wR: toCurve(h.R.palm, spline).d,
    });
  }
  if (rows.length < 10) throw new Error(`gripgap ${label}: only ${rows.length} frames on the rail`);
  const stats = sweepStats(rows);
  stats.hands = sweepStats(rows.map((r) => ({ L: r.wL, R: r.wR })));
  return { verb: 'rail_walk', label, clip: CLIP_ORIGIN.rail_walk, clipPlayed, prop: { kind: 'spline', len: +c.rail.len.toFixed(2) }, entry: got, stats, live, note: 'FEET, not hands: railWalk has no hand-prop contract — the line is under the soles' };
}

/* ------------------------------------------------------------------- run ---- */
const jobs = [];
if (VERBS.has('pole')) for (const p of POLES) jobs.push(() => measurePole(...p));
if (VERBS.has('ledge')) for (const l of LEDGES) jobs.push(() => measureLedge(...l));
if (VERBS.has('hook')) for (const k of HOOKS) jobs.push(() => measureHook(...k));
if (VERBS.has('rail')) for (const r of RAILS) jobs.push(() => measureRail(...r));

console.log(`\n=== gripgap · regime ${CLIP_REGIME}`
  + `${globalThis.__LIMB_OPEN ? ` · __LIMB_OPEN ${JSON.stringify(globalThis.__LIMB_OPEN)}` : ''}`
  + ` · palm offset L ${cm(PALM.L.local.length())} / R ${cm(PALM.R.local.length())} cm from the wrist bone, fist RMS ${cm((PALM.L.fistR + PALM.R.fistR) / 2)} cm ===`);
for (const j of jobs) results.verbs.push(j());

/**
 * FAIL-B, in-arm and across SITES: the palms measured at site A against site B's prop — both
 * props real, both of the same class, both in the shipped level. If the metric cannot tell them
 * apart it is not reading the prop, and every "the grip is sound" line above would be vacuous.
 */
for (const r of results.verbs) {
  const peer = results.verbs.find((o) => o !== r && o.verb === r.verb && o.prop);
  if (!peer || !r.palms) continue;
  if (r.verb === 'pole_climb') {
    r.failProp = { peer: peer.label, L: toPole(r.palms.L, peer.prop.x, peer.prop.z, peer.prop.r).gap, R: toPole(r.palms.R, peer.prop.x, peer.prop.z, peer.prop.r).gap };
  } else if (r.verb === 'ledge_hang') {
    const e = V(...peer.prop.edge);
    r.failProp = { peer: peer.label, L: toLip(r.palms.L, e, peer.prop.n[0], peer.prop.n[1]).line, R: toLip(r.palms.R, e, peer.prop.n[0], peer.prop.n[1]).line };
  } else if (r.verb === 'hook_swing') {
    const C = V(...peer.prop.C), N = V(...peer.prop.N);
    r.failProp = { peer: peer.label, L: toRing(r.palms.L, C, N, RING_R, RING_TUBE).surface, R: toRing(r.palms.R, C, N, RING_R, RING_TUBE).surface };
  }
}

for (const r of results.verbs) {
  const s = r.stats;
  console.log(`\n[${r.verb}] ${r.label}   clip=${r.clip}${r.clipPlayed ? ` (playing ${r.clipPlayed})` : ''}`);
  console.log(`  entered at f${r.entry.at}: ${r.entry.path}`);
  console.log(`  live: ${r.live.live.map((l) => `${l.name} w${l.w}`).join(' + ')}   off-bind ${r.live.offBindDeg} deg`);
  if (r.verb === 'rail_walk') {
    console.log(`  foot→line over ${s.n} frames   L min/mean/max ${cm(s.L.min)} / ${cm(s.L.mean)} / ${cm(s.L.max)} cm`
      + `   R ${cm(s.R.min)} / ${cm(s.R.mean)} / ${cm(s.R.max)} cm   nearest-foot worst ${cm(s.bestWorst)} cm`);
    console.log(`  hands (free by design) L mean ${cm(s.hands.L.mean)} cm   R mean ${cm(s.hands.R.mean)} cm`);
    continue;
  }
  const unit = r.verb === 'pole_climb' ? 'palm→shaft' : r.verb === 'ledge_hang' ? 'palm→lip edge' : 'palm→ring surface';
  console.log(`  ${unit} over ${s.n} frames   L min/mean/max ${cm(s.L.min)} / ${cm(s.L.mean)} / ${cm(s.L.max)} cm`
    + `   R ${cm(s.R.min)} / ${cm(s.R.mean)} / ${cm(s.R.max)} cm`);
  console.log(`  nearest hand: mean ${cm(s.best.mean)} cm, WORST MOMENT ${cm(s.bestWorst)} cm   (wrist reading: L mean ${cm(s.wrist.L.mean)} / R mean ${cm(s.wrist.R.mean)} cm)`);
  if (s.sep) console.log(`  hand-to-hand separation (the watch item's own metric): mean ${cm(s.sep.mean)} cm`);
  if (s.straddleFrac != null) console.log(`  straddle (prop between the hands): ${(s.straddleFrac * 100).toFixed(0)}% of frames`);
  if (s.pen) {
    console.log(`  inside solid? ray parity over 5 directions: L ${s.pen.L.mean.toFixed(1)}/5   R ${s.pen.R.mean.toFixed(1)}/5   (5 = buried, 0 = clear)`);
  }
  if (s.tilt) {
    console.log(`  rope tilt off vertical: mean ${s.tilt.mean.toFixed(1)} deg (min ${s.tilt.min.toFixed(1)}, max ${s.tilt.max.toFixed(1)})`);
    if (s.upright.n >= 4) {
      console.log(`  at the BOTTOM of the arc (tilt <= 10 deg, ${s.upright.n} frames): palm→ring L ${cm(s.upright.L.mean)} / R ${cm(s.upright.R.mean)} cm`
        + `   cane crook→tube axis ${cm(s.upright.cane.mean)} cm`);
    } else console.log(`  ${s.upright.note}`);
  }
  if (s.aboveFeet) {
    const a = s.aboveFeet;
    console.log(`  grip point above the feet: L ${cm(a.palm.L.mean)} cm  R ${cm(a.palm.R.mean)} cm`
      + `   (wrist L ${cm(a.wrist.L.mean)} / R ${cm(a.wrist.R.mean)})   hangDrop ${cm(a.hangDrop)} cm`
      + `   -> the drop that would put each grip point ON the lip: L ${cm(a.palm.L.mean)} / R ${cm(a.palm.R.mean)} cm`);
  }
  if (s.split) {
    console.log(`  split — L out ${cm(s.split.outL.mean)} cm / up ${cm(s.split.upL.mean)} cm`
      + `      R out ${cm(s.split.outR.mean)} cm / up ${cm(s.split.upR.mean)} cm     (+out = outside the wall, +up = above the lip)`);
  }
  if (s.cane) {
    console.log(`  cane crook centre → ring tube axis: mean ${cm(s.cane.mean)} cm (crook radius ${cm(s.crookRadius)} cm, tube ${cm(RING_TUBE)} cm)`
      + `   crook → ring centre mean ${cm(s.caneCentre.mean)} cm`);
  }
  if (r.failBind) console.log(`  FAIL-A bind pose, same placement: L ${cm(r.failBind.L)} cm  R ${cm(r.failBind.R)} cm`);
  if (r.failProp) console.log(`  FAIL-B same palms vs "${r.failProp.peer}": L ${cm(r.failProp.L)} cm  R ${cm(r.failProp.R)} cm`);
}
for (const r of results.verbs) { delete r.palms; delete r.caneP; }

if (JSON_OUT) {
  const abs = path.resolve(ROOT, JSON_OUT);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(results, null, 1));
  console.log(`\nwrote ${JSON_OUT}`);
}

/* --------------------------------------------------------------- compare ---- */
function printCompare(a, b) {
  console.log('\n\n=== raw (shipped, godot) vs matched (?anim=proc) — palm to prop, cm ===');
  const key = (r) => `${r.verb}|${r.label}`;
  const B = new Map(b.verbs.map((r) => [key(r), r]));
  console.log('  every figure is the MEAN over the site\'s own sweep; "worst" is the nearest hand at the worst frame.');
  console.log('  verb / site                                        raw L   raw R   raw worst |  proc L  proc R  proc worst');
  for (const r of a.verbs) {
    const o = B.get(key(r));
    if (!o) continue;
    const f = (x) => String(cm(x)).padStart(7);
    console.log(`  ${(`${r.verb} · ${r.label}`).padEnd(48)}${f(r.stats.L.mean)} ${f(r.stats.R.mean)} ${f(r.stats.bestWorst)}  |${f(o.stats.L.mean)} ${f(o.stats.R.mean)} ${f(o.stats.bestWorst)}`);
  }
}
