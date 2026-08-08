/**
 * carmelita2clips — retarget the supplied Carmelita clips onto RIG3, offline.
 *
 * `public/assets/sly-anim/carmelita-anims.glb` holds 11 authored clips on a 199-bone Blender rig
 * (provenance and licence status: `public/assets/sly-anim/PROVENANCE.md`). It is a **guard** set,
 * not a hero set — `PatrolWalk` and `Lookaround` are the two clips a stealth guard cannot do
 * without, and this project has neither; guard animation is currently procedural (`src/ai/GuardAnim.js`).
 *
 * ── RELATIONSHIP TO `tools/mixamo2clips.mjs`, stated rather than left to a diff ───────────────
 * The **retarget algorithm is the same** and is not re-derived here: world-space delta against the
 * source's own rest pose, converted world→local top-down over RIG3's parent order, emitted as Euler
 * XYZ degrees at 0.1°. Read that file's header for why a local-quaternion copy would be wrong. The
 * sparse-key audit, the quaternion-angle reporting metric and the "emit every sampled bone at every
 * key" rule are carried over deliberately, because each of them is a recorded failure (§212).
 *
 * What is genuinely different, and why this is a separate tool rather than a flag on that one:
 *
 *   1. **A second bone map.** Carmelita is not Mixamo-named. Her rig is a Blender rig with dotted
 *      side suffixes (`upper_arm.L`, `Ear.L`) and a full IK control layer (`Hand.IK.L`, `Heel_IK_L`,
 *      `Pole.thigh.L`) that must NOT be sampled — the IK controls drive the FK bones, and reading
 *      both would double-count. Only the deform chain is mapped.
 *   2. **Name sanitisation is dots, not colons.** `mixamo2clips` learned that GLTFLoader strips the
 *      colon in `mixamorig:Hips`. The same mechanism strips the DOT here: `Ear.L` arrives as `EarL`.
 *      Rather than hard-code either, this resolves through **three's own**
 *      `PropertyBinding.sanitizeNodeName`, so a three upgrade that changes the rule stays correct.
 *      Verified: 24/24 mapped. (My own first probe of this file searched the raw glTF JSON using
 *      sanitised strings and reported the entire arm and leg chain "ABSENT". Same trap, other
 *      direction, ten minutes apart.)
 *   3. **Two neck bones collapse to one.** She has `Neck1`→`Neck2`; RIG3 has a single `neck`. See
 *      NECK below — the choice is measured, not asserted.
 *   4. **Duplicate tracks.** `Shoot(BodyMovement)` ships every channel twice (1194 tracks, 597
 *      unique names), both copies pointing at the *same* glTF sampler. Deduplicated before
 *      sampling; measured cost of not doing so was 0.004° on `Head`, i.e. it was harmless, but
 *      feeding a mixer two bindings for one node is not a thing to leave in place on purpose.
 *   5. **A sampling-rate audit** picks the key rate against a 120 Hz ground truth instead of
 *      inheriting `mixamo2clips`'s 20 Hz. These clips are much shorter and faster than Sly's
 *      (`Shoot(GunMovement)` is 0.33 s; 20 Hz would give it 8 keys).
 *   6. **Calibration arms** (`--calibrate`), because both earlier failures of the Sly tool looked
 *      exactly like success and neither would have been caught by reading the report alone.
 *
 * ── WHAT HAS NO SOURCE, and the one place the brief's premise was wrong ──────────────────────
 * The task brief said "her rig has no tail; ours has 4 tail bones". **Her rig does have a tail** —
 * `Tail1`…`Tail8` under `Hips`, plus a `Tail_CTL`. What is true is the conclusion, for a different
 * reason: measured over all 11 clips at 30 Hz, every one of those 8 bones holds **0.00°** of local
 * rotation. The tail is rigged and never animated. So there is no tail motion to retarget, and
 * emitting it would pin `tailA..tailD` rigid to bind — which is strictly worse than omitting them,
 * because absent leaves the procedural spring chain in charge while zeroed reads as a dead rope
 * (`tests/mixamo.test.mjs` makes exactly this argument about Mixamo's missing tail).
 *
 * `capBrim` has no counterpart (she has hair, not a cap: `Hairtop.*`, `Bangs*`, `Braid1..11`).
 * `browL`/`browR` have none either — her brows are shape-key driven (`AngerSK_CTL`, `SmarmySK_CTL`,
 * `BlinkSK_CTL`, …), not skeletal. All seven stay procedural.
 *
 * Conversely, three RIG3 bones that Mixamo could NOT supply do have a source here: `jaw`, `earL`,
 * `earR`. They are emitted only in the clips where they actually move (see the per-clip table), so
 * a clip that leaves them absent still leaves the procedural layer in charge.
 *
 *   node tools/carmelita2clips.mjs                 # report only, writes nothing
 *   node tools/carmelita2clips.mjs --write <path>  # emit the module
 *   node tools/carmelita2clips.mjs --calibrate     # run the calibration arms and stop
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RIG3 } from '../src/player/SlyModel3.js';

const SRC = new URL('../public/assets/sly-anim/carmelita-anims.glb', import.meta.url);
const DEG = 180 / Math.PI;

/* ── Carmelita (Blender deform chain) -> RIG3 ────────────────────────────────────────────────
 * Written in the source's CANONICAL dotted form, because that is what a reader inspecting the GLB
 * in Blender will see; the resolver applies three's sanitisation itself.
 *
 * NECK. She has Neck1 -> Neck2, we have one `neck`. Both carry authored motion (Neck1 up to 35.1°
 * local, Neck2 up to 25.2°). Mapping `neck <- Neck2` gives our single bone the *accumulated*
 * rotation of the whole neck chain, since a world-space delta at Neck2 already contains Neck1's;
 * the world->local pass then divides out `chest`, leaving exactly (Neck1 + Neck2). Mapping to Neck1
 * instead would leave Neck2's contribution to be absorbed into `head`'s local rotation. The head's
 * WORLD orientation is identical either way — which is what `Lookaround` actually needs — so the
 * choice only decides where the bend is drawn. Neck2 is chosen because our one bone represents the
 * whole neck; the run prints how much the two differ so the choice stays visible.
 *
 * NOT SAMPLED, on purpose: the IK/control layer (`Hand.IK.*`, `Ankle_IK_*`, `Heel_*`, `Toe_CTL_*`,
 * `Pole.*`, `RotateCTL`, `Bone.001`, `Hips_Center`, `*_CTL`) and the cosmetic chains (hair, braid,
 * coat, collar, fingers, lips, eyes). The controls already drive the deform bones in the baked
 * export, and RIG3 has no fingers (§207 baked the glove curl for exactly this reason). */
const MAP = {
  Hips: 'hips',
  Ribs: 'spine',
  Chest: 'chest',
  Neck2: 'neck',
  Head: 'head',
  Jaw: 'jaw',
  'Ear.L': 'earL', 'Ear.R': 'earR',
  'shoulder.L': 'shoulderL', 'shoulder.R': 'shoulderR',
  'upper_arm.L': 'upperArmL', 'upper_arm.R': 'upperArmR',
  'forearm.L': 'lowerArmL', 'forearm.R': 'lowerArmR',
  'Hand.L': 'handL', 'Hand.R': 'handR',
  'thigh.L': 'upperLegL', 'thigh.R': 'upperLegR',
  'shin.L': 'lowerLegL', 'shin.R': 'lowerLegR',
  'foot.L': 'footL', 'foot.R': 'footR',
  'toe.L': 'toeL', 'toe.R': 'toeR',
};
/** The alternative neck root, kept so the run can report what the choice costs. */
const NECK_ALT = 'Neck1';
/** Rigged in the source but 0.00° local in all 11 clips — checked, not assumed. */
const SOURCE_TAIL = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7', 'Tail8'];
/** RIG3 bones with no usable source. Reported, and asserted absent by tests/carmelita.test.mjs. */
const NO_SOURCE = ['capBrim', 'browL', 'browR', 'tailA', 'tailB', 'tailC', 'tailD'];

/* RIG3 parent order for the world->local pass, derived from the rig itself rather than restated,
   so a skeleton edit cannot silently desynchronise this tool from the model. */
const PARENT = Object.fromEntries(RIG3.SKELETON.map(([n, p]) => [n, p === 'root' ? null : p]));
const ORDER = RIG3.BONE_ORDER.filter((b) => Object.values(MAP).includes(b));

/* Loop flags. An explicit table, not a regex on the name: `Air` is a falling loop and `Lookaround`
   is a one-shot idle break, and no pattern over those two strings gets both right. The run prints
   each clip's loop-closure error (first key vs last key) so the table can be checked against the
   data instead of against intuition. */
const LOOPS = {
  Air: true, CasualWalking: true, HitTaken: false, Idle: true, Jump: false,
  Lookaround: false, PatrolWalk: true, Run: true, 'Run.001': true,
  'Shoot(BodyMovement)': false, 'Shoot(GunMovement)': false,
};

/* ── PRE-DECLARED, before any of the numbers below were read ─────────────────────────────────
 * Key rate: sample the candidate rates {20, 30, 40, 60} Hz, reconstruct by the same interpolation
 * the runtime uses, and compare against a 120 Hz ground truth. CHOOSE THE LOWEST RATE whose worst
 * reconstruction error over every mapped bone in every clip is <= 1.0 deg. 1.0 deg is an order of
 * magnitude below the ~10 deg features these clips are made of and ~10x the 0.107 deg Euler
 * quantisation floor measured in §212, so it is small enough not to matter and large enough not to
 * chase float noise. The easing written into each key is chosen by the same audit, between `lin`
 * and `smooth`, on the same ground truth. Neither number is adjusted after the fact. */
const RATE_CANDIDATES = [20, 30, 40, 60];
const RATE_ACCEPT_DEG = 1.0;
const GROUND_TRUTH_HZ = 120;

/* ── load ───────────────────────────────────────────────────────────────────────────────────── */
const bytes = readFileSync(SRC);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const root = gltf.scene;
root.updateMatrixWorld(true);

/* The GLB's own JSON chunk, read alongside the parsed scene purely to report what the SOURCE
   authoring rate and interpolation mode were. That turns the sampling-rate audit from "this rate
   reconstructs well" into "this rate is the rate the clips were authored at", which is a much
   stronger statement and is checkable rather than inferred from an error curve. */
const srcKeyCount = new Map(), srcInterp = new Map();
{
  let off = 12, gjson = null;
  while (off < bytes.length) {
    const len = bytes.readUInt32LE(off), type = bytes.readUInt32LE(off + 4);
    if (type === 0x4E4F534A) gjson = JSON.parse(bytes.slice(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  for (const a of gjson?.animations || []) {
    const s = a.samplers[0];
    srcKeyCount.set(a.name, gjson.accessors[s.input].count);
    srcInterp.set(a.name, s.interpolation || 'LINEAR');
  }
}

const nodes = new Map();
root.traverse((o) => { if (o.name) nodes.set(o.name, o); });
/* Resolve through three's OWN sanitiser first (see header note 2), then fall back to the plausible
   hand-rolled variants so a three version without the helper still maps rather than silently
   returning zero bones — which is what 0/21 looked like in the Sly job. */
const resolve = (raw, tolerant = true) => {
  if (!tolerant) return nodes.get(raw) || null;
  const san = THREE.PropertyBinding.sanitizeNodeName;
  return (san && nodes.get(san(raw)))
    || nodes.get(raw)
    || nodes.get(raw.replace(/\./g, ''))
    || nodes.get(raw.replace(/\./g, '_'))
    || nodes.get(raw.replace(/[\s.:/[\]]/g, '_'))
    || null;
};

/* DECOMPOSE, never setFromRotationMatrix — the §212 trap. Note for anyone comparing the two tools:
   Carmelita's rig sits at world scale 1.0, not Mixamo's 0.01, so `setFromRotationMatrix` would NOT
   have produced the all-zeros failure here. That makes this rig a *worse* place to notice the bug,
   not a safe one, which is why the same discipline is applied anyway. */
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const worldQuat = (node) => { node.matrixWorld.decompose(_p, _q, _s); return _q.clone(); };

/* NECK_ALT is included even though it is not in MAP: the neck-choice comparison below swaps it in,
   and `poseAt` refuses any source bone with no rest rotation. Without it that comparison silently
   dropped the neck entirely and reported "the two mappings differ by 0.0 deg" — a null that reads
   exactly like agreement. It is in this table so the comparison measures something. */
const restWorld = new Map();
for (const raw of [...Object.keys(MAP), NECK_ALT]) {
  const n = resolve(raw);
  if (n) restWorld.set(raw, worldQuat(n));
}
const missing = Object.keys(MAP).filter((m) => !resolve(m));

/* Every target name must be a real RIG3 bone — a typo here would otherwise surface as a clip
   driving a bone that does not exist, which is a runtime no-op and invisible in a report. */
const rigBones = new Set(RIG3.BONE_ORDER);
const badTargets = Object.values(MAP).filter((b) => !rigBones.has(b));

/** De-duplicated clips (see header note 4). */
const clips = gltf.animations.map((c) => {
  const seen = new Set(), uniq = [];
  for (const t of c.tracks) { if (!seen.has(t.name)) { seen.add(t.name); uniq.push(t); } }
  return uniq.length === c.tracks.length ? c
    : new THREE.AnimationClip(c.name, c.duration, uniq);
});

const mixer = new THREE.AnimationMixer(root);

/**
 * Start a clip so that `mixer.setTime(clip.duration)` reads the clip's LAST frame.
 *
 * three's default loop mode is `LoopRepeat`, under which time == duration wraps to time 0 — so
 * sampling the half-open range [0, duration] the obvious way silently makes the final sample a
 * copy of the FIRST one. It is invisible in a report (every value is a real pose, just the wrong
 * one) and it is exactly the "looks like success" class of failure §212 is about: with it in
 * place, every clip here reported a perfect 0.00 deg loop closure, including `Jump` and
 * `HitTaken`, which are one-shots and cannot close. Measured on `Jump`/`shin.R`: the true final
 * frame sits 38.03 deg from frame 0, and the wrapped sample reported 0.00.
 *
 * NOTE FOR `tools/mixamo2clips.mjs`, which has this bug: all 16 clips in the shipped
 * `src/player/MixamoClips.js` currently end in a byte-identical copy of their first key. Reported
 * rather than fixed here — that tool and that output belong to other owners.
 */
let currentAct = null;
function playOnce(clip) {
  const act = mixer.clipAction(clip);
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = true;
  act.reset();
  act.play();
  currentAct = act;
  return act;
}

/**
 * Seek the playing action. Every sample in this file goes through here, and it exists because
 * `clampWhenFinished` has a second, non-obvious effect: the moment a sample lands on
 * t == duration, three sets `action.paused = true` — and a paused action ignores every later
 * `setTime`, so the rig FREEZES on the final pose and keeps answering with it.
 *
 * That silently destroyed the sampling-rate audit, which samples keys across [0, duration] (hitting
 * the pause on its last key) and only then samples the 120 Hz ground truth — against a frozen rig.
 * The tell was that reconstruction error went UP with sample rate (140.8 deg at 20 Hz, 143.5 deg at
 * 60 Hz) and was identical for both easings, which no real interpolation error can do. Clearing the
 * flag per seek makes sampling order-independent, which is the property the audit assumed it had.
 */
function seek(t) {
  if (currentAct) { currentAct.paused = false; currentAct.enabled = true; }
  mixer.setTime(t);
  root.updateMatrixWorld(true);
}

/**
 * The retarget itself, factored so the rate audit and the calibration arms drive the same code
 * path the emitter does rather than a re-implementation of it.
 * @returns Map<rig3Bone, THREE.Quaternion> local rotation on top of RIG3's identity bind
 */
function poseAt(t, opts = {}) {
  const { tolerant = true, space = 'world', map = MAP, frozen = false } = opts;
  if (!frozen) seek(t);
  const worldTarget = new Map();
  for (const [raw, ours] of Object.entries(map)) {
    const n = resolve(raw, tolerant);
    if (!n || !restWorld.has(raw)) continue;
    if (space === 'local') {
      /* CALIBRATION ARM ONLY — copy the source's local quaternion straight across, the mistake
         `mixamo2clips`'s header warns about. Kept here so the arm exercises the real emitter. */
      worldTarget.set(ours, n.quaternion.clone());
    } else {
      worldTarget.set(ours, worldQuat(n).multiply(restWorld.get(raw).clone().invert()));
    }
  }
  const localW = new Map(), out = new Map();
  for (const b of ORDER) {
    const w = worldTarget.get(b);
    if (!w) continue;
    const par = PARENT[b];
    const pw = (par && localW.has(par)) ? localW.get(par) : new THREE.Quaternion();
    localW.set(b, w.clone());
    out.set(b, pw.clone().invert().multiply(w));
  }
  return out;
}

const quantise = (q) => {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x * DEG, e.y * DEG, e.z * DEG].map((v) => +v.toFixed(1));
};
const qOf = (d) => new THREE.Quaternion().setFromEuler(
  new THREE.Euler(d[0] / DEG, d[1] / DEG, d[2] / DEG, 'XYZ'));
/* NORMALISE before the dot. Found by a calibration arm that should have read exactly 0.00 and read
   0.05: repeated quaternion multiplies drift off unit length, so `a.dot(b)` for two *identical*
   poses comes back as 0.9999996 rather than 1, and 2*acos of that is 0.05 deg. That is a noise
   floor in the measuring instrument, not motion — and it would have been quoted as if it were
   motion. It is far below the 2 deg "is this clip alive" bar, so nothing downstream was wrong; the
   arm still earned its keep by making the instrument's own resolution visible. */
const angBetween = (a, b) => {
  const d = a.clone().normalize().dot(b.clone().normalize());
  return 2 * Math.acos(Math.min(1, Math.abs(d))) * DEG;
};
const EASE = { lin: (x) => x, smooth: (x) => x * x * (3 - 2 * x) };

/* ── calibration arms ───────────────────────────────────────────────────────────────────────── */
if (process.argv.includes('--calibrate')) {
  console.log('CALIBRATION — each arm must MOVE the number the report relies on.\n');
  const probe = clips.find((c) => c.name === 'PatrolWalk');
  const act = playOnce(probe);
  const swingOf = (opts) => {
    const poses = [];
    for (let i = 0; i <= 30; i++) poses.push(poseAt((i / 30) * probe.duration, opts));
    let worst = 0, bone = '', n = 0;
    for (const b of ORDER) {
      const qs = poses.map((p) => p.get(b)).filter(Boolean);
      if (!qs.length) continue;
      n++;
      for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
        const a = angBetween(qs[i], qs[j]);
        if (a > worst) { worst = a; bone = b; }
      }
    }
    return { worst, bone, n };
  };
  const live = swingOf({});
  const arm1 = swingOf({ tolerant: false });
  const arm2 = swingOf({ space: 'local' });
  seek(0);
  const arm3 = swingOf({ frozen: true });
  act.stop();
  const row = (n, r) => `${n.padEnd(46)} bones ${String(r.n).padStart(2)}   worst swing ${r.worst.toFixed(2).padStart(7)} deg  ${r.bone}`;
  console.log(row('PRODUCTION (tolerant resolve, world-space)', live));
  console.log(row('ARM 1 exact-match resolver (the 0/21 failure)', arm1));
  console.log(row('ARM 2 local-quaternion copy (wrong space)', arm2));
  console.log(row('ARM 3 mixer frozen at rest (bind pose)', arm3));
  console.log('\nverdict:');
  /* Arm 1 maps 6 rather than 0, because six of her deform bones (Hips, Ribs, Chest, Neck2, Head,
     Jaw) carry no dot and so survive an exact-match lookup. Every dotted name — the whole of both
     arms, both legs and the ears — is lost. Reported as counts rather than as a claim, since
     "0 bones" was my first guess here and it was wrong. */
  console.log(`  arm1 differs: ${arm1.n !== live.n ? `YES — ${arm1.n}/${live.n} bones resolve; every dotted name is lost` : 'NO — INSTRUMENT DEAD'}`);
  console.log(`  arm2 differs: ${Math.abs(arm2.worst - live.worst) > 1 ? `YES — ${arm2.worst.toFixed(2)} vs ${live.worst.toFixed(2)} deg` : 'NO — INSTRUMENT DEAD'}`);
  console.log(`  arm3 differs: ${arm3.worst < 0.01 && live.worst > 1 ? `YES — collapses to ${arm3.worst.toFixed(4)} deg, which is the "stack of identical poses" failure the test guards` : 'NO — INSTRUMENT DEAD'}`);
  process.exit(0);
}

/* ── sampling-rate audit, against the pre-declared bar ───────────────────────────────────────── */
const rateRows = [];
for (const hz of RATE_CANDIDATES) {
  for (const ease of ['lin', 'smooth']) {
    let worst = 0, where = '';
    for (const clip of clips) {
      const act = playOnce(clip);
      const nk = Math.max(2, Math.round(clip.duration * hz) + 1);
      const kt = [], kp = [];
      for (let i = 0; i < nk; i++) { const t = (i / (nk - 1)) * clip.duration; kt.push(t); kp.push(poseAt(t)); }
      const ng = Math.max(2, Math.round(clip.duration * GROUND_TRUTH_HZ) + 1);
      for (let i = 0; i < ng; i++) {
        const t = (i / (ng - 1)) * clip.duration;
        let s = 0; while (s < kt.length - 2 && kt[s + 1] < t) s++;
        const span = kt[s + 1] - kt[s];
        const f = span > 1e-9 ? EASE[ease](Math.min(1, Math.max(0, (t - kt[s]) / span))) : 0;
        const truth = poseAt(t);
        for (const b of ORDER) {
          const a = kp[s].get(b), c = kp[s + 1].get(b), g = truth.get(b);
          if (!a || !c || !g) continue;
          const e = angBetween(a.clone().slerp(c, f), g);
          if (e > worst) { worst = e; where = `${clip.name}/${b}`; }
        }
      }
      act.stop();
    }
    rateRows.push({ hz, ease, worst, where });
  }
}
const passing = rateRows.filter((r) => r.worst <= RATE_ACCEPT_DEG).sort((a, b) => a.hz - b.hz || a.worst - b.worst);
const CHOSEN = passing[0] || rateRows.slice().sort((a, b) => a.worst - b.worst)[0];
const FPS = CHOSEN.hz, EASE_NAME = CHOSEN.ease;

/* ── the emit pass ──────────────────────────────────────────────────────────────────────────── */
const out = {};
const report = [];
const sparseAudit = [];
const gimbalAny = new Set();

for (const clip of clips) {
  const act = playOnce(clip);
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const keys = [];
  const range = {}, swing = {}, samples = {};
  const gimbal = new Set();
  let hips0 = null; const travel = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * clip.duration;
    const pose = poseAt(t);
    const P = {};
    for (const b of ORDER) {
      const q = pose.get(b);
      if (!q) continue;
      const d = quantise(q);
      /* Emit EVERY sampled bone at EVERY key — `Clips.js`'s `trackFromKeys` SKIPS absent keys
         rather than reading them as identity, so dropping a near-identity key deletes the
         crossing (§212.1: 11.59° on `toeR` in `hang_crawl_left`). Bones that never move in a clip
         are dropped wholesale below instead. */
      P[b] = d;
      (samples[b] = samples[b] || []).push(q);
      /* Quaternion angle, NOT the largest Euler component: near gimbal a modest rotation produces
         huge individual components, and a max-component metric called a modest rotation a "180°
         hips" in the Sly job and cost two days (§212). */
      range[b] = Math.max(range[b] || 0, angBetween(q, new THREE.Quaternion()));
      if (Math.max(...d.map(Math.abs)) > 100 && range[b] < 100) gimbal.add(b);
    }
    const hp = new THREE.Vector3().setFromMatrixPosition(resolve('Hips').matrixWorld);
    if (!hips0) hips0 = hp.clone();
    const off = hp.clone().sub(hips0);
    travel.max(new THREE.Vector3(Math.abs(off.x), Math.abs(off.y), Math.abs(off.z)));
    keys.push({
      t: +t.toFixed(3), e: EASE_NAME, P,
      pos: [+off.x.toFixed(3), +off.y.toFixed(3), +off.z.toFixed(3)],
    });
  }
  act.stop();

  /* peak-to-peak amplitude within the clip — the honest "how much does this actually move"
     number. `range` above is measured from BIND, so it also contains the static difference
     between the source's bind pose and the clip's neutral, which for this rig is large. */
  for (const b of Object.keys(samples)) {
    const qs = samples[b];
    let mx = 0;
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) mx = Math.max(mx, angBetween(qs[i], qs[j]));
    swing[b] = mx;
  }

  /* ---- drop bones that never move, and audit what the OLD sparse rule would have cost ---- */
  const moves = new Set();
  for (const b of ORDER) {
    let mx = 0;
    for (const k of keys) { const d = k.P[b]; if (d) mx = Math.max(mx, Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])); }
    if (mx > 0.05) moves.add(b);
  }
  let auditWorst = 0, auditBone = '', dropped = 0;
  for (const b of moves) {
    const kept = keys.filter((k) => k.P[b].some((v) => Math.abs(v) > 0.05));   // the OLD rule
    for (const k of keys) {
      if (k.P[b].some((v) => Math.abs(v) > 0.05)) continue;
      dropped++;
      let lo = null, hi = null;
      for (const c of kept) { if (c.t <= k.t) lo = c; else { hi = c; break; } }
      if (!lo && !hi) continue;
      const qa = qOf((lo || hi).P[b]), qb = qOf((hi || lo).P[b]);
      const f = (lo && hi && hi.t > lo.t) ? (k.t - lo.t) / (hi.t - lo.t) : 0;
      const err = angBetween(qa.clone().slerp(qb, f), qOf(k.P[b]));
      if (err > auditWorst) { auditWorst = err; auditBone = b; }
    }
  }
  for (const k of keys) for (const b of ORDER) if (!moves.has(b)) delete k.P[b];
  sparseAudit.push({ name: clip.name, dropped, worst: auditWorst, bone: auditBone, bones: moves.size });
  for (const b of gimbal) gimbalAny.add(b);

  /* loop closure: how far the last key sits from the first. Reported for every clip, including the
     ones marked non-looping, so the LOOPS table is checkable against the data. */
  let closure = 0, closureBone = '';
  for (const b of moves) {
    const a = angBetween(qOf(keys[0].P[b]), qOf(keys[keys.length - 1].P[b]));
    if (a > closure) { closure = a; closureBone = b; }
  }

  /* The quantity `tests/carmelita.test.mjs` uses to decide "is this clip a stack of identical
     poses": the largest angle ANY emitted bone travels from its own first key. Computed here so
     the test's threshold is set against a number this report actually prints, rather than the
     other way round. */
  let alive = 0, aliveBone = '';
  for (const b of moves) {
    const q0 = qOf(keys[0].P[b]);
    for (const k of keys) {
      const a = angBetween(q0, qOf(k.P[b]));
      if (a > alive) { alive = a; aliveBone = b; }
    }
  }

  out[clip.name] = { dur: +clip.duration.toFixed(3), loop: !!LOOPS[clip.name], keys };
  report.push({
    name: clip.name, dur: clip.duration, keys: keys.length, range, swing, travel,
    gimbal: [...gimbal], bones: moves.size, closure, closureBone, alive, aliveBone,
    srcKeys: srcKeyCount.get(clip.name) || 0, srcInterp: srcInterp.get(clip.name) || '?',
  });
}

/* ── report ─────────────────────────────────────────────────────────────────────────────────── */
console.log(`source: ${SRC.pathname.split('/').pop()}`);
const mappedCount = Object.keys(MAP).filter((m) => restWorld.has(m)).length;
console.log(`source nodes: ${nodes.size}   mapped: ${mappedCount}/${Object.keys(MAP).length}   RIG3 bones: ${RIG3.BONE_ORDER.length}`);
if (missing.length) console.log(`  !! absent from the GLB: ${missing.join(', ')}`);
if (badTargets.length) console.log(`  !! map targets that are NOT RIG3 bones: ${badTargets.join(', ')}`);
console.log(`RIG3 bones with no source (stay procedural): ${NO_SOURCE.join(', ')}`);

/* the tail claim, re-measured on every run rather than trusted from this file's header */
{
  let tailMax = 0;
  const restLocal = new Map(SOURCE_TAIL.map((n) => [n, resolve(n)?.quaternion.clone()]));
  for (const clip of clips) {
    const act = playOnce(clip);
    const n = Math.max(2, Math.round(clip.duration * 30) + 1);
    for (let i = 0; i < n; i++) {
      seek((i / (n - 1)) * clip.duration);
      for (const b of SOURCE_TAIL) {
        const o = resolve(b), r = restLocal.get(b);
        if (o && r) tailMax = Math.max(tailMax, angBetween(o.quaternion, r));
      }
    }
    act.stop();
  }
  console.log(`source tail Tail1..Tail8 exists and is rigged; max LOCAL rotation over all 11 clips: ${tailMax.toFixed(3)} deg`
    + (tailMax < 0.05 ? '  -> no motion to retarget' : '  -> !! there IS tail motion, revisit NO_SOURCE'));
}

console.log('\nsampling-rate audit — reconstruction error vs a 120 Hz ground truth');
console.log(`bar declared before the run: choose the LOWEST rate with worst error <= ${RATE_ACCEPT_DEG.toFixed(1)} deg`);
console.log(' hz  ease     worst err   where');
for (const r of rateRows) {
  console.log(`${String(r.hz).padStart(3)}  ${r.ease.padEnd(7)} ${r.worst.toFixed(3).padStart(8)} deg  ${r.where}`
    + (r.hz === FPS && r.ease === EASE_NAME ? '   <- CHOSEN' : ''));
}
console.log(`chosen: ${FPS} Hz, easing '${EASE_NAME}'`);
/* The audit's own explanation, read from the file rather than inferred from the error curve: these
   clips are authored at exactly 60 fps LINEAR, so sampling at 60 Hz is a frame-for-frame TRANSFER
   and not a resample at all. The residual 0.04 deg is the 0.1 deg Euler quantisation of §212, not
   interpolation error. `srcKeys == emitted keys` below is the check that this actually happened. */
console.log('source authoring rate, per clip (from the GLB sampler inputs):');
for (const r of report) {
  const expect = Math.max(2, Math.round(r.dur * FPS) + 1);
  console.log(`  ${r.name.padEnd(22)} source ${String(r.srcKeys).padStart(4)} keys ${r.srcInterp.padEnd(7)}`
    + ` -> emitted ${String(r.keys).padStart(4)}   ${r.keys === r.srcKeys ? '1:1 transfer' : `RESAMPLED (expected ${expect})`}`);
}

console.log(`\nclips: ${report.length}`);
console.log('name                     dur  keys bones  swing within the clip (deg)                                   loop  closure');
for (const r of report) {
  const pick = ['hips', 'chest', 'head', 'upperArmL', 'upperLegL', 'lowerLegL']
    .map((b) => `${b} ${(r.swing[b] ?? 0).toFixed(0)}`).join(' ');
  console.log(`${r.name.padEnd(22)} ${r.dur.toFixed(3)} ${String(r.keys).padStart(4)} ${String(r.bones).padStart(5)}  ${pick.padEnd(58)} ${String(!!LOOPS[r.name]).padEnd(5)} ${r.closure.toFixed(1)}deg ${r.closureBone}`);
}

/* "Is this clip alive?" — the exact quantity tests/carmelita.test.mjs asserts on, printed so the
   test's 2 deg bar (inherited unchanged from tests/mixamo.test.mjs) can be read against real data
   and any legitimately-static clip can be NAMED rather than excused by a looser threshold. */
console.log('\nliveness — largest angle any emitted bone travels from its own first key:');
for (const r of report.slice().sort((a, b) => a.alive - b.alive)) {
  console.log(`  ${r.name.padEnd(22)} ${r.alive.toFixed(2).padStart(8)} deg  ${r.aliveBone}`
    + (r.alive < 2 ? '   <- STATIC, must be named in the test' : ''));
}

console.log('\nsame clips, rotation measured FROM BIND (comparable to mixamo2clips output)');
console.log('name                   hips chest  head armL  legL  legL2   hips travel x/y/z (m)');
for (const r of report) {
  const pick = ['hips', 'chest', 'head', 'upperArmL', 'upperLegL', 'lowerLegL']
    .map((b) => (r.range[b] ?? 0).toFixed(0).padStart(5)).join(' ');
  console.log(`${r.name.padEnd(22)} ${pick}   ${r.travel.x.toFixed(3)}/${r.travel.y.toFixed(3)}/${r.travel.z.toFixed(3)}`);
}

/* SANITY — "a humanoid walk should swing the thigh tens of degrees, not hundreds and not ~0".
 *
 * BOTH metrics are printed against the SAME 12..110 deg window `mixamo2clips` uses, and neither is
 * adjusted. They are different quantities and it matters which one the window was written for:
 *
 *   from-bind  — the largest rotation from the BIND pose, which is what mixamo2clips measures and
 *                what the 12..110 window was chosen against. Directly comparable to the Sly job.
 *   swing      — peak-to-peak WITHIN the clip. Strictly the larger number on this rig, because
 *                from-bind is measured from a bind pose that is not the clip's neutral, so it can
 *                sit inside the travel rather than at one end of it.
 *
 * `Run` exceeds 110 on swing and passes on from-bind. That disagreement is reported, not resolved
 * by widening the window: a 0.5 s sprint cycle genuinely swings a thigh further than a walk, and
 * the from-bind reading is the one the bar was calibrated on. */
console.log('\nsanity — thigh (upperLegL), both metrics against the unchanged 12..110 deg window:');
console.log('clip              from-bind (mixamo2clips metric)   peak-to-peak swing');
for (const nm of ['PatrolWalk', 'CasualWalking', 'Run', 'Run.001']) {
  const r = report.find((x) => x.name === nm);
  if (!r) continue;
  const fb = r.range.upperLegL ?? 0, sw = r.swing.upperLegL ?? 0;
  const verdict = (v) => (v > 12 && v < 110 ? 'in window' : '!! OUTSIDE');
  console.log(`  ${nm.padEnd(16)} ${fb.toFixed(1).padStart(6)} deg  ${verdict(fb).padEnd(12)}`
    + `     ${sw.toFixed(1).padStart(6)} deg  ${verdict(sw)}`);
}
console.log(`gimbal-artefact bones (Euler >100deg while true rotation <100deg): ${gimbalAny.size ? [...gimbalAny].join(', ') : 'none'}`);

/* how much the Neck1/Neck2 choice actually decides */
{
  const altMap = { ...MAP }; delete altMap.Neck2; altMap[NECK_ALT] = 'neck';
  let worstNeck = 0, worstHead = 0, where = '';
  for (const clip of clips) {
    const act = playOnce(clip);
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * clip.duration;
      const a = poseAt(t), b = poseAt(t, { map: altMap });
      if (a.get('neck') && b.get('neck')) {
        const d = angBetween(a.get('neck'), b.get('neck'));
        if (d > worstNeck) { worstNeck = d; where = clip.name; }
      }
      if (a.get('head') && b.get('head')) worstHead = Math.max(worstHead, angBetween(a.get('head'), b.get('head')));
    }
    act.stop();
  }
  console.log(`\nneck mapping: Neck2 (chosen) vs ${NECK_ALT} — local neck differs by up to ${worstNeck.toFixed(1)}deg`
    + ` and local head by ${worstHead.toFixed(1)}deg (worst in ${where}); head WORLD orientation is identical by construction.`);
}

/* Run vs Run.001 — a `.001` suffix is Blender's duplicate-name marker, so the obvious reading is
   "same clip twice". Measured instead. */
{
  const a = report.find((r) => r.name === 'Run'), b = report.find((r) => r.name === 'Run.001');
  if (a && b) {
    const diffs = ORDER.map((n) => `${n} ${Math.abs((a.swing[n] ?? 0) - (b.swing[n] ?? 0)).toFixed(0)}`)
      .filter((s) => +s.split(' ')[1] >= 10);
    console.log(`Run vs Run.001 are NOT duplicates — swing differs by >=10deg on: ${diffs.join(', ') || 'nothing'}`);
  }
}

console.log('\nsparse-key audit — error the OLD "drop near-identity keys" rule would introduce:');
console.log('clip                   bones  dropped keys   worst deviation');
for (const r of sparseAudit.slice().sort((x, y) => y.worst - x.worst)) {
  console.log(`${r.name.padEnd(22)} ${String(r.bones).padStart(3)}   ${String(r.dropped).padStart(8)}       ${r.worst.toFixed(2)}deg  ${r.bone}`);
}
{
  const w = sparseAudit.slice().sort((x, y) => y.worst - x.worst)[0];
  console.log(`worst across all clips: ${w.worst.toFixed(2)}deg on ${w.bone || '(none)'} in ${w.name}`);
}

const wi = process.argv.indexOf('--write');
if (wi !== -1 && process.argv[wi + 1]) {
  const path = process.argv[wi + 1];
  writeFileSync(path,
    `/* GENERATED by tools/carmelita2clips.mjs — do not hand-edit.\n`
    + ` *\n`
    + ` * Retargeted onto RIG3 from public/assets/sly-anim/carmelita-anims.glb (199 bones, 11 clips);\n`
    + ` * provenance and licence status are in that directory's PROVENANCE.md. This is a GUARD set:\n`
    + ` * PatrolWalk and Lookaround are the two clips a stealth guard cannot do without.\n`
    + ` *\n`
    + ` * Format is Clips.js's authoring shape: P is bone -> [x,y,z] Euler XYZ DEGREES on top of bind,\n`
    + ` * pos is a hips offset in metres. Sampled at ${FPS} Hz with '${EASE_NAME}' easing (see the tool's\n`
    + ` * sampling-rate audit). Every bone that moves in a clip is keyed at EVERY key of that clip.\n`
    + ` *\n`
    + ` * NOT PRESENT, and they must stay procedural: ${NO_SOURCE.join(', ')}.\n`
    + ` * The source rig HAS a tail (Tail1..Tail8) but holds it at 0.00 deg in all 11 clips, so there is\n`
    + ` * no tail motion to carry across; emitting it would pin the tail rigid to bind.\n`
    + ` *\n`
    + ` * The source character is 1.687 m tall; RIG3 is ${RIG3.TUNE.height} m. The 'pos' offsets are RAW SOURCE\n`
    + ` * METRES and are not rescaled — a consumer targeting a different height must scale them.\n`
    + ` */\n`
    + `export const GUARD_CLIPS = ${JSON.stringify(out)};\n`);
  console.log(`\nwrote ${path}`);
} else {
  console.log('\n(report only — pass --write <path> to emit)');
}
