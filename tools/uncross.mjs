#!/usr/bin/env node
/**
 * uncross.mjs — solve a crossed arm chain back onto its own side, against the shipped FK.
 *
 * §532: the user, on the live build — *"The arms are still tucked in too much and crossed in
 * some animations."* §479.5 fixed the two states they named (ledge/balance) and left a measured
 * census of clips carrying the same defect, on the record so the next report would start from a
 * list. This is that list being cashed.
 *
 * THE DEFECT (§479.5's mechanism, unchanged): the raise-amplitude poses author their big
 * upperArm Z with the gait family's sign habit — `upperArmL` NEGATIVE / `upperArmR` POSITIVE —
 * and per Rig.js's own table ("upperArm: L +Z raises, R −Z raises") that swings each arm
 * DOWN-ACROSS the body at hang amplitude. Symmetric gloves hide it until something uncrossed
 * sits next to it.
 *
 * WHY A SOLVER AND NOT A REFLECTION. The pure sagittal reflection of each arm's own channels
 * ((x,y,z) → (x,−y,−z), the transform `mir()` applies across sides) does uncross 7 of these 8
 * poses — measured — but it reflects the WHOLE arm, so forward reach and height inverft with it:
 * `wall_cling`'s hands leave the wall (z +0.30 → −0.19) and rise 35 cm. The verb's intent lives
 * in height and reach; only the lateral is wrong. So each keyed arm chain is solved numerically
 * to put its hand on its OWN side at the same height and reach, with the elbow fold held at its
 * current value so this repair does not move the §531 "tucked" metric — the two complaints stay
 * separable, and the lever's ladder keeps meaning what it measured.
 *
 * Coordinate descent over the key's own euler triples against the real
 * compile → sampleInto → SlyModel FK path, so what it reports is what the rig delivers.
 *
 *   node tools/uncross.mjs                      report every crossed clip in the shipped build
 *   node tools/uncross.mjs --solve wall_cling   solve one clip, print keys to paste
 *   node tools/uncross.mjs --solve-all          solve every crossed clip
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

const { RAW_CLIPS, compile, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SlyModel } = await import('../src/player/SlyModel.js');
const { buildClipSet } = await import('../src/player/Animation.js');

const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: () => {}, get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const sly = new SlyModel(engine);
await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);

const ARM_L = ['shoulderL', 'upperArmL', 'lowerArmL', 'handL'];
const ARM_R = ['shoulderR', 'upperArmR', 'lowerArmR', 'handR'];

/**
 * Which arm bones each key writes EXPLICITLY in the source, read from the file itself.
 *
 * A key authored as `P({ ... })` merges the STAND base, so at runtime `key.P` carries every
 * bone in STAND and a solver cannot tell an authored value from an inherited one. Solving an
 * inherited bone produces a value that exists nowhere in the source text — the applier then
 * has nothing to patch (`ko` aborted on exactly this). Reading the source keeps the solver and
 * the applier looking at the same set: only what the animator actually wrote for this key.
 */
const SRC_TEXT = readFileSync(new URL('../src/player/Clips.js', import.meta.url), 'utf8');
function explicitArmBones(name) {
  const start = SRC_TEXT.indexOf(`def('${name}', {`);
  if (start < 0) return null;
  const end = SRC_TEXT.indexOf('\n});', start);
  const block = SRC_TEXT.slice(start, end);
  /* key literals start at `    { t: ` — one indented open brace per key */
  const parts = block.split(/\n    \{ t: /).slice(1);
  return parts.map((p) => new Set([...ARM_L, ...ARM_R].filter((b) => new RegExp(`\\b${b}:`).test(p))));
}

/** Pose the shipped skeleton from a compiled clip at t, and read the arm geometry. */
function poseAt(clip, t) {
  pb.clear();
  sampleInto(clip, t, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  const hips = at('hips');
  const ang = (a, b, c) => {
    const u = at(a).sub(at(b)).normalize(), w = at(c).sub(at(b)).normalize();
    return Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1)) * 180 / Math.PI;
  };
  /* BODY frame, not model space: the lateral axis is the shoulder line, horizontalised. A pose
     may yaw the whole body (several of these verbs face a wall or a pole), and model X is then
     not the character's left — measuring the wrong frame is how the first pass of this solver
     reported uncrossed hands while the census still read crossed. §479.5's metric, verbatim. */
  const lat = at('upperArmL').sub(at('upperArmR')); lat.y = 0; lat.normalize();
  const fwd = new THREE.Vector3(0, 1, 0).cross(lat).normalize();
  const rel = (n) => {
    const v = at(n).sub(hips);
    return { lat: v.dot(lat), y: v.y, fwd: v.dot(fwd), v };
  };
  return {
    hips, lat, fwd,
    hl: rel('handL'), hr: rel('handR'),
    el: ang('upperArmL', 'lowerArmL', 'handL'), er: ang('upperArmR', 'lowerArmR', 'handR'),
  };
}

/** Lateral separation in shoulder-widths — §479.5's metric, the one the census is stated in. */
function sepOf(clip, t) {
  const p = poseAt(clip, t);
  return (p.hl.lat - p.hr.lat) / 0.28;
}

/** Every clip in the shipped (godot-regime) build whose wrists sit past each other. */
export function census(table) {
  const rows = [];
  for (const [name, clip] of Object.entries(table)) {
    let crossed = 0, min = Infinity;
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const s = sepOf(clip, f * clip.dur);
      if (s < 0) crossed++;
      if (s < min) min = s;
    }
    if (crossed >= 3) rows.push({ name, crossed, min: +min.toFixed(2) });
  }
  return rows;
}

/* ─────────────────────────── the solve ─────────────────────────── */

const LAT_FLOOR = 0.15;   // m — a hand at the midline must still clear the torso to read as "its own side"

/**
 * Solve one clip's keyed arm chains onto their own side. For each key that carries arm
 * channels, only the bones that key ALREADY overrides are touched, so the file's sparse
 * structure (and every unkeyed bone's inheritance) survives exactly.
 */
function solveClip(name, { latFloor = LAT_FLOOR, verbose = true } = {}) {
  const raw = RAW_CLIPS[name];
  if (!raw) throw new Error(`uncross: no such clip ${name}`);
  const work = { ...raw, keys: raw.keys.map((k) => ({ ...k, P: k.P ? { ...k.P } : k.P })) };
  const explicit = explicitArmBones(name);
  if (!explicit) throw new Error(`uncross: cannot read source keys for ${name}`);

  /* A cycle's last key is not an independent pose — it IS the first key repeated. Closure is
     decided PER BONE, not per key: a key authored as `P({...})` merges the STAND base, so the
     two ends of a loop routinely differ on inherited bones while the authored ones match
     exactly. Comparing whole keys called `wall_cling` open when its `upperArm*` — the only
     bones that failed the seam — closed perfectly. */
  const lastIdx = work.keys.length - 1;
  const closingBones = new Set();
  if (raw.loop && lastIdx > 0) {
    const a = raw.keys[0].P || {}, b = raw.keys[lastIdx].P || {};
    const ownA = explicit[0] || new Set(), ownB = explicit[lastIdx] || new Set();
    for (const bone of [...ARM_L, ...ARM_R]) {
      if (ownA.has(bone) && ownB.has(bone) && JSON.stringify(a[bone]) === JSON.stringify(b[bone])) {
        closingBones.add(bone);
      }
    }
  }

  for (let ki = 0; ki < work.keys.length; ki++) {
    const key = work.keys[ki];
    if (!key.P) continue;
    const own = explicit[ki] || new Set();
    const bonesL = ARM_L.filter((b) => key.P[b] && own.has(b));
    const bonesR = ARM_R.filter((b) => key.P[b] && own.has(b));
    if (!bonesL.length && !bonesR.length) continue;

    /* targets read off THIS key's own delivered pose: own side, same height, same reach */
    const cur = poseAt(compile(name, work), key.t);
    const targets = {};
    if (bonesL.length) {
      targets.L = { lat: Math.max(Math.abs(cur.hl.lat), latFloor), y: cur.hl.y, fwd: cur.hl.fwd, elb: cur.el };
    }
    if (bonesR.length) {
      targets.R = { lat: -Math.max(Math.abs(cur.hr.lat), latFloor), y: cur.hr.y, fwd: cur.hr.fwd, elb: cur.er };
    }

    for (const [side, bones] of [['L', bonesL], ['R', bonesR]]) {
      if (!bones.length) continue;
      const T = targets[side];
      const params = [];
      for (const b of bones) for (let i = 0; i < 3; i++) params.push([b, i]);

      /* SEED from the known mechanism rather than from the defect: the raise sign is what is
         wrong (Rig.js — "upperArm: L +Z raises, R −Z raises"), so flip the upperArm's Z and let
         the descent refine from there. Without the seed the search sits in the defect's own
         basin and buys the hand position with a 67° shoulder yaw — geometrically valid, and a
         shoulder that no longer deforms like a shoulder. */
      const upper = `upperArm${side}`;
      if (key.P[upper]) {
        const wantPositiveZ = side === 'L';
        const z = key.P[upper][2];
        if ((wantPositiveZ && z < 0) || (!wantPositiveZ && z > 0)) {
          key.P[upper] = key.P[upper].slice();
          key.P[upper][2] = -z;
        }
      }
      /* Anchor: the regularizer pulls toward the SEEDED pose — the authored values with the
         raise sign corrected — not toward what the animator wrote. Anchoring to the raw values
         anchors to the defect: a sign flip then costs ~0.9 against position terms of ~1e-3, so
         the descent dutifully walks the seed back and buys the hand position with a twisted
         upper arm whose BETWEEN-key interpolation crosses again. Measured, not reasoned: the
         first run of this solver hit every key target and still left the cycle at −0.81.
         The shoulder stays anchored ~25× harder — a corrective bone that carries mesh
         deformation may not be turned inside out to save an arm. */
      const anchor = Object.fromEntries(bones.map((b) => [b, key.P[b].slice()]));
      const anchorW = (b) => (b.startsWith('shoulder') ? 1e-4 : 2e-7);

      const cost = () => {
        const p = poseAt(compile(name, work), key.t);
        const h = side === 'L' ? p.hl : p.hr;
        const e = side === 'L' ? p.el : p.er;
        let reg = 0;
        for (const b of bones) {
          for (let i = 0; i < 3; i++) reg += anchorW(b) * (key.P[b][i] - anchor[b][i]) ** 2;
        }
        return 8 * (h.lat - T.lat) ** 2 + 8 * (h.y - T.y) ** 2 + 8 * (h.fwd - T.fwd) ** 2
          + 0.0004 * (e - T.elb) ** 2      // hold the fold: this repair must not move §531's metric
          + reg;
      };
      let best = cost();
      for (let iter = 0; iter < 200; iter++) {
        let improved = false;
        for (const [b, i] of params) {
          for (const d of [12, -12, 5, -5, 2, -2]) {
            const old = key.P[b][i];
            const next = old + d;
            if (Math.abs(next) > 178) continue;
            key.P[b] = key.P[b].slice();
            key.P[b][i] = next;
            const c = cost();
            if (c < best - 1e-9) { best = c; improved = true; } else { key.P[b][i] = old; }
          }
        }
        if (!improved) break;
      }
      /* LOOP CLOSURE. A cycle's last key must equal its first or the seam pops — `rig.test`'s
         "a looping clip closes its loop" arm measures exactly that, and it caught this solver
         doing it: keys are solved independently, so a clip whose source repeated key 0's arm
         values at the end came back with the two ends solved to different poses (jump_apex
         99.7°, wall_cling 91.8°, pole_swing 107.1°, paraglide 88.8° at the seam). The last key
         of a loop is not an independent pose — it IS the first key — so it is copied, never
         solved. Clips whose source did not already close (the two ends authored differently)
         are left alone here and reported, because forcing closure would change the motion. */
      if (verbose) {
        const p = poseAt(compile(name, work), key.t);
        const h = side === 'L' ? p.hl : p.hr;
        const e = side === 'L' ? p.el : p.er;
        console.log(`   key t=${key.t} ${side}: hand lat ${h.lat.toFixed(2)} y ${h.y.toFixed(2)} fwd ${h.fwd.toFixed(2)}`
          + `  target lat ${T.lat.toFixed(2)} y ${T.y.toFixed(2)} fwd ${T.fwd.toFixed(2)}  elbow ${e.toFixed(0)}° (was ${T.elb.toFixed(0)}°)`);
      }
    }
  }
  /* Close the loop: every bone whose two ends were authored equal takes key 0's SOLVED value
     at the last key too. Bones the source deliberately left open are not touched — forcing
     those closed would change the motion, not repair it. */
  if (closingBones.size) {
    const first = work.keys[0], last = work.keys[lastIdx];
    for (const b of closingBones) last.P[b] = first.P[b].slice();
    if (verbose) console.log(`   loop closed on ${[...closingBones].join(', ')}`);
  }
  return work;
}

/** Print the solved keys in the file's own authoring shape, ready to paste. */
function printKeys(name, work) {
  const raw = RAW_CLIPS[name];
  console.log(`\n──── ${name}: solved arm channels ────`);
  work.keys.forEach((k, i) => {
    if (!k.P) return;
    const changed = [...ARM_L, ...ARM_R].filter((b) => k.P[b]
      && JSON.stringify(k.P[b]) !== JSON.stringify(raw.keys[i].P?.[b]));
    if (!changed.length) return;
    console.log(`  t ${k.t}:`);
    for (const b of changed) {
      console.log(`      ${b}: [${k.P[b].join(', ')}],`
        + `        // was [${raw.keys[i].P[b].join(', ')}]`);
    }
  });
}

/* ─────────────────────────── entry ─────────────────────────── */

const argv = process.argv.slice(2);
const table = buildClipSet('godot').table;

if (argv.includes('--solve') || argv.includes('--solve-all')) {
  const names = argv.includes('--solve-all')
    ? census(table).map((r) => r.name)
    : [argv[argv.indexOf('--solve') + 1]];
  for (const n of names) {
    console.log(`\n=== solving ${n} ===`);
    const work = solveClip(n);
    const before = compile(n, RAW_CLIPS[n]), after = compile(n, work);
    const phases = [0.1, 0.3, 0.5, 0.7, 0.9];
    const bMin = Math.min(...phases.map((f) => sepOf(before, f * before.dur)));
    const aMin = Math.min(...phases.map((f) => sepOf(after, f * after.dur)));
    console.log(`   min hand separation over the cycle: ${bMin.toFixed(2)} → ${aMin.toFixed(2)} shoulder-widths`);
    printKeys(n, work);
  }
} else {
  const rows = census(table);
  console.log('crossed clips in the shipped build (handL lateral < handR lateral at ≥3 of 5 phases):');
  for (const r of rows) console.log(`  ${r.name.padEnd(16)} ${r.crossed}/5   min ${r.min.toFixed(2)} shoulder-widths`);
  console.log(`  total ${rows.length}`);
}
