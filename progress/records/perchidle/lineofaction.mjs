/**
 * lineofaction.mjs — quantifies the LATERAL line of action of an authored pose.
 *
 * Written for the tracked item "`perch_idle` has zero lateral line of action" (§7.3's
 * "Pose is A-pose/T-pose/stiff instead of a confident line-of-action" checkbox). The item
 * quotes three numbers — hips 0.000, chest 0.006, head -0.007 — which come from
 * `tools/poseprobe.mjs`'s `S-curve` line, i.e. the ABSOLUTE model-space x of three joints.
 *
 * WHY THAT IS NOT A LINE OF ACTION, AND WHAT THIS MEASURES INSTEAD
 * ---------------------------------------------------------------
 * A line of action is a SHAPE, not a POSITION. `poseprobe`'s triple slides rigidly with the
 * clip's `pos.x` hips offset: translate the whole figure 5 cm to his left and all three numbers
 * gain 5 cm while the drawing is unchanged. So an absolute triple can report a large "S" for a
 * pose whose centre line is still a plumb line, and vice versa. Every metric below is therefore
 * measured RELATIVE TO THE FIGURE, never in absolute model coordinates.
 *
 * Chain: hips -> spine -> chest -> neck -> head. All five bind at x = 0 in both rigs (verified
 * at run time and asserted), so every lateral coordinate reported here is authored pose, not rig
 * asymmetry.
 *
 * Frontal plane = the character's own (x, y): +x is his LEFT, +y up (Rig.js conventions). This
 * is the plane a camera in front of him sees, and it is the plane the item's own numbers are in.
 *
 *   latEx   PRIMARY. max_i |x_i - x_hips| over the chain — how far the centre line departs from
 *           the plumb line dropped through the pelvis. Zero for a straight vertical spine and
 *           for any rigid lateral translation. Reported in cm and as % of standing height.
 *   bow     max signed perpendicular distance of {spine, chest, neck} from the hips->head chord,
 *           in the frontal plane. This is the CURVE — the C or S — with the overall lean divided
 *           out. A straight diagonal spine scores latEx > 0 and bow = 0.
 *   tilt    signed angle of the hips->head chord off vertical, in the frontal plane. The LEAN.
 *           A confident line of action needs |tilt| or bow to be non-trivial; both zero is the
 *           mannequin the item describes.
 *   span    (max x - min x) over the five joints. The closest single number to what the item
 *           quoted, kept so the two are commensurable.
 *   baseEx  latEx measured from the mid-ankle instead of the pelvis, because Clips.js's own
 *           definition runs the curve "from the planted foot through the hips and spine to the
 *           head". Included because the pelvis is not obviously the right base for a crouch.
 *   hipTilt / shoTilt  frontal-plane tilt of the pelvis (upperLegL->upperLegR) and the shoulder
 *           line (shoulderL->shoulderR), degrees, + = his-left side high. `opp` = the two tilts
 *           have opposite sign, i.e. genuine counter-rotation. `perch_idle`'s authoring note
 *           claims the read is carried by tilt opposition rather than by offsets, so it is
 *           scored separately rather than folded into one number.
 *
 * NORMALISER. % figures divide by the rig's STANDING height (a rig constant, not the pose's own
 * height) so a crouch is not flattered by being short: legacy rig 1.8538 m, the number
 * `tools/headratio.mjs` prints for `idle_confident` and the one AGENTS.md §7.3 now quotes.
 *
 * BOTH RIGS. `poseprobe`/`headratio`/`shotsil` build `src/player/SlyModel.js`; `src/main.js`
 * ships `SlyModelDLRig.js`, which poses `RIG3.SKELETON` from `SlyModel3.js`. The two skeletons
 * are not identical, so every conclusion is checked on both and the script prints both.
 *
 * WHAT THIS CANNOT SEE (§11). Authored clip pose only: no foot IK, no tail spring, no look-at,
 * no ink hull, no mesh — joints, not silhouette. `--proj` additionally projects through a shot
 * camera, which adds the framing and nothing else: still no occlusion, no hull, no lighting.
 * A pass here is necessary, never sufficient; settle a read against a frame.
 *
 *   node progress/records/perchidle/lineofaction.mjs            # all clips, both rigs
 *   node progress/records/perchidle/lineofaction.mjs --idles    # the five idles only
 *   node progress/records/perchidle/lineofaction.mjs --proj     # + screen-space px at the shots
 *   node progress/records/perchidle/lineofaction.mjs --sens     # gain of each roll lever on perch_idle
 *
 * `--sens` MEASURES A LEVER, IT DOES NOT PROPOSE A POSE. It patches the compiled quaternions in
 * memory (never the file) to answer "how many degrees buy how many centimetres, and what do they
 * cost the stance". Any actual change to a shipped pose needs a sealed PREREG with a frame-side
 * criterion first; this only prices the options.
 */
import * as THREE from 'three';

const ROOT = '/home/user/Demo';
const { CLIPS, sampleInto } = await import(`${ROOT}/src/player/Clips.js`);
const { PoseBuffer } = await import(`${ROOT}/src/player/Rig.js`);
const { RIG3 } = await import(`${ROOT}/src/player/SlyModel3.js`);
const { SHOTS } = await import(`${ROOT}/src/core/Shots.js`);

const ARGS = process.argv.slice(2);
const ONLY_IDLES = ARGS.includes('--idles');
const DO_PROJ = ARGS.includes('--proj');
const DO_SENS = ARGS.includes('--sens');
const DO_BREATH = ARGS.includes('--breath');

const CHAIN = ['hips', 'spine', 'chest', 'neck', 'head'];
const EXTRA = ['shoulderL', 'shoulderR', 'upperLegL', 'upperLegR', 'footL', 'footR', 'handL', 'handR'];
const IDLES = ['idle_confident', 'idle_bored', 'idle_look', 'perch_idle', 'balance_idle'];

/* ---------------------------------------------------------------- rigs ---- */

/**
 * The legacy skeleton is a module-private const in SlyModel.js, so it is read off a built
 * instance (`sly.bp(name)` is the absolute bind position — the same table the class builds its
 * bones from). Building the model costs a few seconds of procedural geometry; it happens once.
 */
async function legacyBindTable() {
  const warnings = [];
  const engine = {
    quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
    warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  };
  const { SlyModel } = await import(`${ROOT}/src/player/SlyModel.js`);
  const sly = new SlyModel(engine);
  await sly.init();
  if (!sly.mesh) throw new Error(`legacy SlyModel failed to build: ${warnings.join(' | ')}`);
  const tbl = [];
  for (const n of sly.boneNames) {
    if (n === 'root') continue;
    const b = sly.bones[n];
    const parent = b.parent?.name ?? 'root';
    const p = sly.bp(n);
    if (!p) continue;
    tbl.push([n, parent, [p.x, p.y, p.z]]);
  }
  return tbl;
}

/** Bare bone hierarchy from a table of ABSOLUTE bind positions — exactly what both models do. */
function buildRig(table) {
  const root = new THREE.Group();
  const bones = {};
  const abs = { root: new THREE.Vector3(0, 0, 0) };
  for (const [name, parent, p] of table) {
    const b = new THREE.Bone();
    b.name = name;
    const wp = new THREE.Vector3().fromArray(p);
    abs[name] = wp;
    const par = abs[parent];
    if (!par) throw new Error(`bone ${name} names unknown parent ${parent}`);
    b.position.copy(wp).sub(par);
    (parent === 'root' ? root : bones[parent]).add(b);
    bones[name] = b;
  }
  return { root, bones, bind: abs, names: table.map((t) => t[0]) };
}

/** Pose the rig from a clip at `t` and return world positions of the bones we care about. */
function poseAt(rig, clip, t) {
  const pb = new PoseBuffer(rig.names).clear();
  sampleInto(clip, t, pb, 1);
  for (const n of rig.names) {
    const b = rig.bones[n];
    if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const hb = rig.bind.hips;
  rig.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);
  rig.root.updateMatrixWorld(true);
  const out = {};
  for (const n of [...CHAIN, ...EXTRA]) {
    const b = rig.bones[n];
    if (!b) continue;
    out[n] = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  }
  return out;
}

/* ------------------------------------------------------------- metrics ---- */

const deg = (r) => r * 180 / Math.PI;

/**
 * `lat(v)` returns the lateral coordinate of a joint. Model-frame measurement passes
 * `(v) => v.x`; the projected variant passes a dot against the screen-right axis.
 */
function metrics(P, H, lat = (v) => v.x, vert = (v) => v.y) {
  const pts = CHAIN.map((n) => ({ n, x: lat(P[n]), y: vert(P[n]) }));
  const hips = pts[0], head = pts[pts.length - 1];

  let latEx = 0, latExAt = '';
  for (const p of pts) {
    const d = p.x - hips.x;
    if (Math.abs(d) > Math.abs(latEx)) { latEx = d; latExAt = p.n; }
  }

  // perpendicular offset of the interior joints from the hips->head chord, in (x, y)
  const cx = head.x - hips.x, cy = head.y - hips.y;
  const cl = Math.hypot(cx, cy) || 1e-9;
  let bow = 0, bowAt = '';
  for (const p of pts.slice(1, -1)) {
    const d = ((p.x - hips.x) * cy - (p.y - hips.y) * cx) / cl;   // signed, + = his left of the chord
    if (Math.abs(d) > Math.abs(bow)) { bow = d; bowAt = p.n; }
  }

  const tilt = deg(Math.atan2(cx, cy));
  const xs = pts.map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  /* Scale-free curvature: bow as a fraction of the chord it bows off. A crouch has a shorter
     frontal chord than a stand, so the same centimetres are a bigger bend — this says by how
     much, and stops the cm columns quietly penalising every crouched pose. */
  const bowChord = 100 * bow / cl;

  // base at the mid-ankle: Clips.js runs the curve from the planted foot, not the pelvis
  const ankleX = (lat(P.footL) + lat(P.footR)) / 2;
  let baseEx = 0;
  for (const p of pts) {
    const d = p.x - ankleX;
    if (Math.abs(d) > Math.abs(baseEx)) baseEx = d;
  }

  const tiltOf = (a, b) => deg(Math.atan2(vert(P[a]) - vert(P[b]), lat(P[a]) - lat(P[b])));
  const hipTilt = tiltOf('upperLegL', 'upperLegR');
  const shoTilt = tiltOf('shoulderL', 'shoulderR');

  return {
    latEx, latExAt, latExPct: 100 * latEx / H,
    bow, bowAt, bowPct: 100 * bow / H, chord: cl, bowChord,
    tilt, span, spanPct: 100 * span / H,
    baseEx, baseExPct: 100 * baseEx / H,
    hipTilt, shoTilt, opp: (hipTilt * shoTilt) < 0,
    absHips: lat(P.hips), absChest: lat(P.chest), absHead: lat(P.head),
  };
}

/* ---------------------------------------------------------------- run ----- */

const legacy = buildRig(await legacyBindTable());
const rig3 = buildRig(RIG3.SKELETON.map(([n, p, v]) => [n, p, v]));

// Assert the premise every lateral number here rests on: the chain is bilaterally neutral in bind.
for (const [label, rig] of [['legacy', legacy], ['rig3', rig3]]) {
  for (const n of CHAIN) {
    const x = rig.bind[n]?.x;
    if (x === undefined) throw new Error(`${label}: no bind position for ${n}`);
    if (Math.abs(x) > 1e-6) throw new Error(`${label}: ${n} binds at x=${x}, lateral numbers would not be pose`);
  }
}

const HEIGHT = { legacy: 1.8538, rig3: RIG3.TUNE.height };

const names = ONLY_IDLES ? IDLES : Object.keys(CLIPS);
const rows = [];
let touched = 0;
for (const name of names) {
  const clip = CLIPS[name];
  if (!clip) { console.log(`${name}: NO SUCH CLIP`); continue; }
  const t = clip.hold ?? 0;
  const row = { name, t };
  for (const [label, rig] of [['legacy', legacy], ['rig3', rig3]]) {
    row[label] = metrics(poseAt(rig, clip, t), HEIGHT[label]);
  }
  rows.push(row);
  touched++;
}
// §211.1: a tool that inspected nothing must not report `ok`.
if (!touched) { console.error('FAIL: measured 0 clips'); process.exit(1); }

const f = (v, w = 6, d = 1) => v.toFixed(d).padStart(w);
function table(label, rs) {
  console.log(`\n=== ${label} rig — frontal-plane line of action, at each clip's hold frame ===`);
  console.log(`    (H = ${HEIGHT[label].toFixed(4)} m standing; latEx/bow/span in cm, %H in brackets; + = his left)`);
  console.log('clip                 hold   latEx@         bow@          tilt   span   baseEx  chord bow/chord  hipTilt shoTilt opp');
  for (const r of rs) {
    const m = r[label];
    console.log(
      r.name.padEnd(20),
      f(r.t, 4, 1),
      `${f(m.latEx * 100, 6, 2)}[${f(m.latExPct, 4, 1)}%] ${m.latExAt.padEnd(5)}`,
      `${f(m.bow * 100, 6, 2)}[${f(m.bowPct, 4, 1)}%] ${m.bowAt.padEnd(5)}`,
      f(m.tilt, 6, 1), f(m.span * 100, 6, 2), f(m.baseEx * 100, 7, 2),
      f(m.chord * 100, 6, 1), `${f(m.bowChord, 8, 1)}%`,
      f(m.hipTilt, 7, 1), f(m.shoTilt, 7, 1), m.opp ? ' Y' : ' .',
    );
  }
}

const byLat = (label) => rows.slice().sort((a, b) => Math.abs(b[label].latEx) - Math.abs(a[label].latEx));

/* Cross-check against the instrument the tracked item quotes. `tools/poseprobe.mjs` prints
   `S-curve hips x / chest x / head x` — ABSOLUTE model x on the legacy rig. If these three do not
   reproduce it, the rig rebuilt here is not the rig the item is about and nothing below applies. */
console.log('\n=== cross-check vs tools/poseprobe.mjs `S-curve` (legacy rig, absolute model x, m) ===');
for (const r of rows.filter((x) => ONLY_IDLES || IDLES.includes(x.name))) {
  const m = r.legacy;
  console.log(`  ${r.name.padEnd(16)} hips x ${m.absHips.toFixed(3)}  chest x ${m.absChest.toFixed(3)}  head x ${m.absHead.toFixed(3)}`
    + `   |  relative to hips: chest ${(m.absChest - m.absHips >= 0 ? '+' : '')}${(m.absChest - m.absHips).toFixed(3)}`
    + `  head ${(m.absHead - m.absHips >= 0 ? '+' : '')}${(m.absHead - m.absHips).toFixed(3)}`);
}

for (const label of ['legacy', 'rig3']) {
  table(label, ONLY_IDLES ? rows : byLat(label));
  const ranked = byLat(label);
  const i = ranked.findIndex((r) => r.name === 'perch_idle');
  const idleRank = ranked.filter((r) => IDLES.includes(r.name)).findIndex((r) => r.name === 'perch_idle');
  console.log(`\n  perch_idle latEx rank ${i + 1} of ${ranked.length} clips; ${idleRank + 1} of ${IDLES.length} idles`);
  const med = ranked[Math.floor(ranked.length / 2)];
  console.log(`  median clip by latEx: ${med.name} ${(med[label].latEx * 100).toFixed(2)} cm (${med[label].latExPct.toFixed(1)}%H)`);
}

/* ------------------------------------------------------ projected check --- */

if (DO_PROJ) {
  console.log('\n=== projected through the shot that freezes each clip (1600x900) ===');
  console.log('    lateral axis = screen right; px/m measured on a 1 m vertical at the character');
  console.log('    latShare = |model-X component of the screen-right axis|. THIS IS THE ONE THAT MATTERS:');
  console.log('    at latShare 0.29 a frontal-plane excursion is 29% of itself on screen and the rest of');
  console.log('    the screen excursion is the SAGITTAL line of action wearing a lateral costume.');
  console.log('    latEx px is the total; latEx-X px is only the frontal-plane part of it.');
  console.log('shot          clip              view°   px/m   latEx px   bow px   span px  latShare  latEx-X px');
  let n = 0;
  const up = new THREE.Vector3(0, 1, 0);
  for (const [sname, s] of Object.entries(SHOTS)) {
    if (!s.player?.pose) continue;
    const clip = CLIPS[s.player.pose];
    if (!clip) continue;
    const yaw = s.player.yaw ?? 0;
    const origin = new THREE.Vector3(...s.player.pos);
    const cam = new THREE.PerspectiveCamera(s.fov ?? 45, 16 / 9, 0.1, 500);
    cam.position.set(...s.pos);
    cam.lookAt(new THREE.Vector3(...s.target));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    const toWorld = (v) => v.clone().applyAxisAngle(up, yaw).add(origin);
    const px = (v) => {
      const q = toWorld(v).project(cam);
      return { x: q.x * 800, y: q.y * 450 };   // 1600x900, y up
    };
    const P = poseAt(legacy, clip, clip.hold ?? 0);
    const S = {};
    for (const k in P) S[k] = px(P[k]);
    const m = metrics(S, 1, (v) => v.x, (v) => v.y);

    // px per metre, measured on a vertical metre at the character's own position
    const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0, 1, 0);
    const pm = Math.abs(px(b).y - px(a).y);

    const facing = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const toCam = new THREE.Vector3(...s.pos).sub(origin).setY(0).normalize();
    const view = deg(Math.atan2(facing.clone().cross(toCam).y, facing.dot(toCam)));

    /* Screen-right in the CHARACTER's own frame. The frontal plane is the model (x, y) plane, so
       |axis.x| is how much of a frontal-plane excursion survives to the screen at this bearing. */
    const dir = origin.clone().sub(new THREE.Vector3(...s.pos)).setY(0).normalize();
    const axis = dir.clone().cross(up).normalize().applyAxisAngle(up, -yaw);
    const latShare = Math.abs(axis.x);
    const mm = metrics(P, 1);                       // frontal-plane, metres, model frame
    const latExX = mm.latEx * axis.x * pm;          // only the frontal part, in px, signed on screen

    /* charview.mjs's caveat, reproduced: a point behind the lens still projects to a finite NDC
       pair, so these columns are numbers about nothing for `guard`. Flag rather than print. */
    const fwd = new THREE.Vector3(...s.target).sub(new THREE.Vector3(...s.pos)).normalize();
    const behind = origin.clone().sub(new THREE.Vector3(...s.pos)).dot(fwd) <= 0;

    console.log(
      sname.padEnd(13), s.player.pose.padEnd(17),
      f(view, 6, 1), f(pm, 6, 1), f(m.latEx, 10, 2), f(m.bow, 8, 2), f(m.span, 8, 2),
      f(latShare, 9, 2), f(latExX, 11, 2), behind ? '  BEHIND CAMERA — meaningless' : '',
    );
    n++;
  }
  if (!n) { console.error('FAIL: no shot freezes a pose'); process.exit(1); }
}

/* --------------------------------------------- breath check (--breath) --- */

/* `hold` is one frame of a looping clip. Clips.js warns twice in `perch_idle`'s own comments
   that in-between keys carry ABSOLUTE angles (§9's orphaned-key trap), so a property authored
   into the base pose can be present at `hold` and absent for the rest of the cycle. If a lateral
   line of action only exists on the frozen frame, it exists for stills and not for the game. */
if (DO_BREATH) {
  console.log('\n=== perch_idle through its 3.2 s loop (legacy rig) ===');
  console.log('    t     latEx cm   span cm    tilt   bow cm   (hold = 0.0; keys at 0, 0.8, 1.7, 2.3, 3.2)');
  let n = 0;
  for (let t = 0; t <= 3.2001; t += 0.2) {
    const m = metrics(poseAt(legacy, CLIPS.perch_idle, t), HEIGHT.legacy);
    console.log(f(t, 6, 1), f(m.latEx * 100, 10, 2), f(m.span * 100, 9, 2), f(m.tilt, 7, 1), f(m.bow * 100, 8, 2));
    n++;
  }
  if (!n) { console.error('FAIL: sampled 0 frames'); process.exit(1); }
}

/* ------------------------------------------------- lever gains (--sens) --- */

if (DO_SENS) {
  /* Patch the compiled quaternions in memory — the same technique `scratchpad/tailsweep.mjs`
     uses, and for the same reason: it reproduces exactly what editing the authored degrees would
     do (both go through `eulerDeg`), without touching src/. Restored after every probe. */
  const clip = CLIPS.perch_idle;
  const t = clip.hold ?? 0;
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();

  function withRoll(bone, dz, fn) {
    const tr = clip.bones.find((b) => b.name === bone);
    if (!tr) throw new Error(`perch_idle has no track for ${bone} — cannot price this lever`);
    const saved = tr.q.slice();
    for (let i = 0; i < tr.times.length; i++) {
      q.set(tr.q[i * 4], tr.q[i * 4 + 1], tr.q[i * 4 + 2], tr.q[i * 4 + 3]);
      e.setFromQuaternion(q, 'XYZ');
      e.z += dz * Math.PI / 180;
      q.setFromEuler(e);
      tr.q[i * 4] = q.x; tr.q[i * 4 + 1] = q.y; tr.q[i * 4 + 2] = q.z; tr.q[i * 4 + 3] = q.w;
    }
    try { return fn(); } finally { tr.q.set(saved); }
  }

  const probe = () => {
    const P = poseAt(legacy, clip, t);
    const m = metrics(P, HEIGHT.legacy);
    return { latEx: m.latEx, span: m.span, bow: m.bow, footL: P.footL.clone(), footR: P.footR.clone() };
  };
  const base = probe();

  /* `hero` is the shot §7.3 scores this clip in; `sly-perch` is the twin built to verify the
     lean. Both gains are printed because a lever that only moves the twin has not fixed `hero`. */
  const HERO = { latShare: 0.29, pxm: 170.2 };
  const TWIN = { latShare: 0.84, pxm: 354.3 };

  console.log('\n=== roll-lever gains on perch_idle (legacy rig; base latEx '
    + `${(base.latEx * 100).toFixed(2)} cm) ===`);
  console.log('    NOT a proposal. Degrees are absolute deltas on the bone\'s authored Z in ALL FOUR keys.');
  console.log('    footShift = how far the feet move — the stance cost the authoring note paid for in');
  console.log('    counter-rolls. hips carries the legs; spine and chest do not.');
  /* `span` — not `latEx` — is the readout under a lever sweep. Rolling the chain far enough
     flips which joint is furthest from the pelvis (chest-out C becomes head-over lean), so
     signed latEx is non-monotone in the lever while the centre line's frontal WIDTH is not. */
  console.log('bone     +deg   latEx cm   span cm  d(span)/deg  footShift cm   hero px   sly-perch px');
  let probes = 0;
  for (const bone of ['hips', 'spine', 'chest']) {
    for (const dz of [5, 10]) {
      const r = withRoll(bone, dz, probe);
      const dFoot = Math.max(r.footL.distanceTo(base.footL), r.footR.distanceTo(base.footR));
      console.log(
        bone.padEnd(8), f(dz, 4, 0), f(r.latEx * 100, 10, 2), f(r.span * 100, 9, 2),
        f((r.span - base.span) * 100 / dz, 12, 3), f(dFoot * 100, 13, 2),
        f(r.span * HERO.latShare * HERO.pxm, 9, 2),
        f(r.span * TWIN.latShare * TWIN.pxm, 14, 2),
      );
      probes++;
    }
  }
  if (!probes) { console.error('FAIL: priced 0 levers'); process.exit(1); }

  const after = probe();
  if (Math.abs(after.latEx - base.latEx) > 1e-9) {
    console.error('FAIL: in-memory patch did not restore — do not trust these numbers');
    process.exit(1);
  }
  console.log('  (tracks verified restored to their shipped values after the sweep)');

  const need = (target, k) => target / (k.latShare * k.pxm);
  console.log(`\n  Shipped frontal span ${(base.span * 100).toFixed(2)} cm reads as `
    + `${(base.span * HERO.latShare * HERO.pxm).toFixed(2)} px at hero and `
    + `${(base.span * TWIN.latShare * TWIN.pxm).toFixed(2)} px at sly-perch.`);
  console.log(`  To clear a ~2.5 px ink hull (§2.1) by 2x, i.e. 5 px of FRONTAL span:`);
  console.log(`    at hero      needs span >= ${(need(5, HERO) * 100).toFixed(1)} cm `
    + `(${(need(5, HERO) / base.span).toFixed(1)}x the shipped ${(base.span * 100).toFixed(2)} cm)`);
  console.log(`    at sly-perch needs span >= ${(need(5, TWIN) * 100).toFixed(1)} cm `
    + `(${(need(5, TWIN) / base.span).toFixed(1)}x the shipped ${(base.span * 100).toFixed(2)} cm) — already clears it`);
}
