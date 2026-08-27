/**
 * godotlib2clips — open the reference repo's SEALED AnimationLibrary containers (.res) and
 * retarget the clips this project binds from them onto RIG3, offline. §715's tool.
 *
 * WHY A SECOND IMPORTER EXISTS. `tools/godot2clips.mjs` consumes `SlyCooper_Anims27.gltf` — the
 * metarig export, 24 clips, all of which are already baked into `GodotClips.js`. The repo's
 * OTHER animations live in `Assets/Animations/*.res`: Godot COMPRESSED resource containers
 * (`RSCC` magic) that §714.2 proved unreadable by `strings` — a name-scan returned zero on all
 * thirteen including the walk library, a uniform false negative caught only by its positive
 * control. This tool decompresses the container (mode 2 = Zstd, via node:zlib), parses the
 * inner binary resource (Godot 4.3, format 6), and enumerates + extracts the clips. It is OUR
 * code reading THEIR data — an asset importer, not a ported mechanic.
 *
 * WHAT THE LIBRARIES HOLD (the §715 census, measured not assumed):
 *   · `Library Sly MASTER 001–005` — 32 clips each on a %GeneralSkeleton HUMANOID retarget
 *     (Godot bone-profile names; one stray `mixamorig1_HeadTop_End` leaf betrays the Mixamo-
 *     format source). 002–005 differ ONLY in `Idle Teeter` (four saves iterating one clip);
 *     001 is an older generation (11 clips differ). 005 is the canonical latest.
 *   · `Library Sly Air/Idle/Walk`, `Library_Sly_air_anims_01` — smaller sets, same skeleton.
 *   · `Library Sly MASTER 006`, `Library_Sly_19`, `Library_Sly_14`, `Library_SlyCooper_Anims6`,
 *     and `Assets/Temp Imports/tempsly/SlyCooper_Anims4_Anims.res` — metarig-era sets whose
 *     useful clips are already shipped via the gltf path (duplicates, not new material).
 *   NONE of the humanoid libraries is referenced by any scene or script in their project —
 *   shelf stock, never wired. Their game's own tree plays only Sly_19 + Sly_14 + two inline
 *   libraries. So every clip below is "authored by the reference project" but NOT "delivered
 *   by their game"; provenance is recorded per-clip in PROVENANCE.md.
 *
 * TWO STAGES, same shape as godot2clips, so the emitted module is reproducible from this
 * repository alone:
 *
 *   node tools/godotlib2clips.mjs --extract --src <checkout-root>
 *       builds `public/assets/sly-godot/sly-godot-lib.glb` — the KEPT clips only, re-expressed
 *       as a standard glTF: a node hierarchy carrying the humanoid skeleton with its REST pose,
 *       plus quaternion/translation tracks at the source's own key times. Finger and leaf
 *       channels RIG3 cannot consume are dropped and counted, nothing silent.
 *   node tools/godotlib2clips.mjs                 # report only, from the committed GLB
 *   node tools/godotlib2clips.mjs --write src/player/GodotLibClips.js
 *
 * THE REST POSE PROBLEM, and where this file gets one. A .res library carries track data only —
 * no skeleton, no bone offsets — and no model file in their repo carries the %GeneralSkeleton
 * rig. What the MASTER libraries DO carry is `00 T-Pose`: a one-key bake of every bone's local
 * rest rotation plus the hips rest position (measured: zero deviation across its keys). The
 * world-delta retarget needs exactly that and nothing more: rest world rotations compose from
 * rest LOCALS down the parent chain, animated world rotations compose the same way, and source
 * bone OFFSETS never enter the math — rotation composition is position-free, and the hips
 * offset comes from the source's own position track. That is what makes a .res with no model
 * retargetable at all. (The profile parent chain is Godot's SkeletonProfileHumanoid, a public
 * constant of their engine, not of their game.)
 *
 * THE RETARGET is godot2clips' world-space method with ONE addition, measured before it was
 * coded. Their T-pose rest holds the arms HORIZONTAL; RIG3's bind arm points down-and-out
 * ([.72,−.69] — §479.6's constant). A world delta measured from a horizontal-arm rest, composed
 * onto RIG3's identity bind, lands every arm pose lower by the angle between those two rest
 * directions — measured on the humanoid runs: ~50–58° of spurious upperArm Z against the
 * shipped metarig Run's −3.6/+11.1, while the LEGS agreed (both rests are vertical, so legs
 * carry no skew — the discriminating observation). Correction: D′ = D·C⁻¹ per side over the arm
 * chain (upperArm/lowerArm/hand), where C is the minimal rotation carrying the T direction (±X)
 * to RIG3's own bind upperArm→lowerArm direction — a constant of OUR rig, not a fitted number.
 * At W(t) = source rest the character shows a T-pose; at arms-down the pose lands as authored.
 * After the correction the humanoid Run 1 upperArm Z means sit within 2–12° of the shipped
 * metarig Run — the §479.6 style band.
 *
 * FACING is measured, not assumed (§714's lesson, again): the metarig export needed a 180° yaw
 * conjugation; this humanoid import does NOT — nine gait clips drag their feet toward −Z (body
 * travel +Z, our forward) with no conjugation, and `Cane Hit 2`'s strike hand peaks +0.66 m IN
 * FRONT of the hips. The check below re-derives that from the committed GLB on every run and
 * throws if the sign flips.
 *
 * PHASE. The locomotion tree runs ONE shared stride phase (Animation.js), so a gait joining the
 * tree must put its footfalls where its blend partners put theirs. The shipped godot Walk/Run
 * land R@0.22–0.27 / L@0.69–0.77 of the cycle. `rotate` below shifts a loop's sampled origin by
 * a fraction of its duration to align: Run 1 lands R@0.27/L@0.77 against Run's 0.267/0.767
 * (0.4% residual — run and run_fast mix continuously across the speed axis, so theirs is the
 * alignment that must be exact). Walk Crouch 4 needs none: its native footfalls (R@0.34,
 * L@0.77) already sit in the family's neighbourhood, and its only phase partners are brief
 * cross-stance fades (the KEEP comment below carries the crouch-take comparison). Rotation
 * happens on the SAMPLE ARRAY, not by re-driving the mixer at wrapped times —
 * godot2clips documents the `clampWhenFinished` pause trap for non-ascending setTime, and a
 * rotated loop is exactly that; reindexing the one ascending capture never touches the mixer.
 *
 * WHAT IT CANNOT DO, so nobody reads the output as complete: no cane channel exists in the
 * source (donor fill carries the procedural cane — §474.1's attach-point rule), no tail (this
 * skeleton has none; the donor's tail fills), no jaw/ears/cap/brows, and fingers land nowhere
 * (RIG3 has no finger bones — §207's baked curl). The refusals — clips measured and NOT taken
 * (Fall Glide's 84.6° prone pitch vs the paraglide verb's hang, RailrunStand's 0.46 m floating
 * ankles, Walk Sneak Slow's 0.17 m/s creep against a 1.4 m/s verb) — are recorded in §715 with
 * their numbers.
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RIG3 } from '../src/player/SlyModel3.js';
import { toGLB } from './godot2rig.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET = path.join(ROOT, 'public/assets/sly-godot/sly-godot-lib.glb');
const LIB_DIR = 'Assets/Animations';
const REST_LIB = 'Library Sly MASTER 005.res';   // canonical latest (001 older gen; 002–005 differ only in Idle Teeter)

/**
 * The clips this project binds, each with the library it is read from and the loop/phase
 * decision that was MEASURED for it (§715.3):
 *   · loop: `Idle Anim 1` is authored loop_mode 0 but seams at 1.4° worst-bone with identical
 *     start/end root — it is a loop that was saved without the flag. The others carry loop_mode 1.
 *   · rotate: fraction of the cycle the sampling origin shifts, to align footfall phase with the
 *     shipped godot gaits (derivation in the header).
 *   · centerYaw: the three idles were captured facing OFF-AXIS — a constant authored hips yaw
 *     of −54° (`Idle Anim 1`), +43° mean under a ±35° scan (`Idle Look`), +52° (`Idle Crouch
 *     2`) — mocap-style takes their project never wired and so never had to normalize. Played
 *     raw at our play sites, the character would stand ~50° off the controller's yaw and SNAP
 *     straight on every idle→gait blend. The bake removes the clip's own circular-mean hips
 *     yaw: every world target is premultiplied by Ry(−mean) and the root offset rotated with
 *     it — a rigid re-base of the same authored motion (the FLIP conjugation's class, with the
 *     angle measured per clip and printed), so every pose metric in §715 is unchanged by it.
 *     The gaits are NOT centered: their facing is already proven by travel direction.
 */
export const KEEP_LIB_CLIPS = [
  { lib: 'Library Sly MASTER 005.res', clip: 'Idle Anim 1', loop: true, centerYaw: true },
  { lib: 'Library Sly Idle.res', clip: 'Idle Look', loop: true, centerYaw: true },
  { lib: 'Library Sly MASTER 005.res', clip: 'Idle Crouch 2', loop: true, centerYaw: true },
  { lib: 'Library Sly MASTER 005.res', clip: 'Walk Crouch 4', loop: true },
  { lib: 'Library Sly MASTER 005.res', clip: 'Run 1', loop: true, rotate: 0.196 },
];
/* WHICH crouch walk, measured (§715.3): `Walk Crouch 2` and `4` tie on depth (hips −0.274 vs
 * −0.283) and speed (1.45 vs 1.47 m/s); the discriminator is contact geometry. 2 is an authored
 * asymmetric prowl — the right foot's stance WRAPS the loop seam (in contact 65→39% of the
 * cycle) while the left only toe-taps at 69–83%, so its footfalls cluster 30 ms apart and a
 * blend phase is not well defined for it. 4 alternates cleanly (R@0.34, L@0.77 of the cycle),
 * which is already the shipped godot Walk family's phase neighbourhood (R@0.22, L@0.69) with no
 * rotation at all, and its two footsteps are audible as steps rather than a cluster. `Walk
 * Crouch 1` (hips −0.148) and `3` (−0.226, a two-stride bake) lost on depth against the verb's
 * own incumbent, whose crouch sits at −0.52. Phase rotation is applied only where the mix is
 * HELD: run↔run_fast blend continuously across the speed axis, so Run 1 is rotated to land
 * within 0.4% of Run's footfalls; crouch↔stand fades are brief and already tolerate the proc
 * sneak's 0.67-cycle offset in the shipped tree. */

/* ───────────────────────── Godot container + resource readers ─────────────────────────
 * RSCC (FileAccessCompressed): magic, u32 mode (0 FastLZ / 1 DEFLATE / 2 Zstd / 3 GZip),
 * u32 block_size, u32 read_total, then (read_total/block_size)+1 u32 compressed block sizes,
 * then the blocks. Each inflates to block_size (last: remainder). The inner payload is the
 * binary resource BODY — the RSRC magic is consumed by Godot's loader before the wrapper, so
 * the payload begins at the endianness word. */
function rsccDecompress(buf, label) {
  const magic = buf.toString('latin1', 0, 4);
  if (magic !== 'RSCC') throw new Error(`${label}: not an RSCC container (magic ${JSON.stringify(magic)})`);
  const mode = buf.readUInt32LE(4);
  const blockSize = buf.readUInt32LE(8);
  const readTotal = buf.readUInt32LE(12);
  const bc = Math.floor(readTotal / blockSize) + 1;
  let off = 16;
  const sizes = [];
  for (let i = 0; i < bc; i++) { sizes.push(buf.readUInt32LE(off)); off += 4; }
  const out = Buffer.alloc(readTotal);
  let wr = 0;
  for (let i = 0; i < bc; i++) {
    const want = i === bc - 1 ? readTotal - wr : blockSize;
    if (want === 0) break;
    const comp = buf.subarray(off, off + sizes[i]);
    off += sizes[i];
    let plain;
    if (mode === 2) plain = zlib.zstdDecompressSync(comp);
    else if (mode === 1) plain = zlib.inflateSync(comp);
    else if (mode === 3) plain = zlib.gunzipSync(comp);
    else throw new Error(`${label}: compression mode ${mode} (FastLZ) is not implemented here`);
    if (plain.length !== want) throw new Error(`${label}: block ${i} inflated to ${plain.length}, expected ${want}`);
    plain.copy(out, wr); wr += plain.length;
  }
  if (wr !== readTotal) throw new Error(`${label}: payload ${wr} != declared ${readTotal}`);
  return out;
}

/* RSRC body (Godot 4.x binary resource, ver_format 6). Only the variant types an
 * AnimationLibrary actually uses are implemented; anything else throws LOUDLY — a parser that
 * guesses past an unknown tag would be §714.2's blind scan wearing a suit. */
function parseRSRC(buf, label) {
  let p = 0;
  const u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
  const u16 = () => { const v = buf.readUInt16LE(p); p += 2; return v; };
  const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
  const f64 = () => { const v = buf.readDoubleLE(p); p += 8; return v; };
  const ustr = () => { const n = u32(); const s = buf.toString('utf8', p, p + n); p += n; return s.replace(/\0+$/, ''); };

  const bigEndian = u32(); const useReal64 = u32();
  if (bigEndian) throw new Error(`${label}: big-endian resource`);
  const real = () => (useReal64 ? f64() : f32());
  p += 12; // ver_major, ver_minor, ver_format
  ustr(); // resource class
  p += 8; // importmd_ofs
  const flags = u32();
  p += 8; // uid slot (written either way)
  if (flags & 8) ustr(); // script_class
  p += 4 * 11; // reserved
  const stringMap = [];
  for (let i = 0, n = u32(); i < n; i++) stringMap.push(ustr());
  const nExt = u32();
  for (let i = 0; i < nExt; i++) { ustr(); ustr(); if (flags & 2) p += 8; }
  const internal = [];
  for (let i = 0, n = u32(); i < n; i++) internal.push({ path: ustr(), offset: Number(buf.readBigUInt64LE(p)) + 0 * (p += 8) });

  const getString = () => {
    const id = u32();
    if (id & 0x80000000) { const n = id & 0x7fffffff; const s = buf.toString('utf8', p, p + n).replace(/\0+$/, ''); p += n; return s; }
    return stringMap[id];
  };
  function variant() {
    const t = u32();
    switch (t) {
      case 1: return null;
      case 2: return !!u32();
      case 3: return u32() | 0;
      case 4: return real();
      case 5: return ustr();
      case 22: { // NODE_PATH
        const nc = u16(); let sc = u16(); const abs = !!(sc & 0x8000); sc &= 0x7fff;
        const names = []; for (let i = 0; i < nc; i++) names.push(getString());
        const subs = []; for (let i = 0; i < sc; i++) subs.push(getString());
        return { nodepath: (abs ? '/' : '') + names.join('/') + (subs.length ? ':' + subs.join(':') : '') };
      }
      case 24: { const ot = u32(); if (ot === 0) return { obj: 'empty' }; if (ot === 2) return { obj: 'internal', index: u32() }; if (ot === 3) return { obj: 'ext', index: u32() }; throw new Error(`${label}: object subtype ${ot}`); }
      case 26: { let n = u32() & 0x7fffffff; const d = new Map(); for (let i = 0; i < n; i++) { const k = variant(); d.set(typeof k === 'string' ? k : JSON.stringify(k), variant()); } return { dict: d }; }
      case 30: { let n = u32() & 0x7fffffff; const a = []; for (let i = 0; i < n; i++) a.push(variant()); return a; }
      case 31: { const n = u32(); const b = buf.subarray(p, p + n); p += n + ((4 - (n % 4)) % 4); return { bytes: b }; }
      case 32: { const n = u32(); const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = u32() | 0; return { i32: a }; }
      case 33: { const n = u32(); const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = f32(); return { f32: a }; }
      case 34: { const n = u32(); const a = []; for (let i = 0; i < n; i++) a.push(ustr()); return { strs: a }; }
      case 40: { const v = buf.readBigInt64LE(p); p += 8; return Number(v); }
      case 41: return f64();
      case 44: return ustr();
      default: throw new Error(`${label}: variant type ${t} at ${p - 4} — extend the parser, do not guess`);
    }
  }
  const resources = internal.map((ir) => {
    p = ir.offset;
    const type = ustr();
    const props = new Map();
    for (let i = 0, n = u32(); i < n; i++) { const nm = getString(); props.set(nm, variant()); }
    return { path: ir.path, type, props };
  });
  return { resources };
}

/** All Animation resources of a library file, keyed by resource_name. */
function readLibrary(srcDir, relName) {
  const file = path.join(srcDir, LIB_DIR, relName);
  if (!existsSync(file)) throw new Error(`godotlib2clips: missing ${file} — --src must be the reference checkout root`);
  const { resources } = parseRSRC(rsccDecompress(readFileSync(file), relName), relName);
  const anims = new Map();
  for (const r of resources) if (r.type === 'Animation') anims.set(r.props.get('resource_name'), r);
  return anims;
}

/** Decode one Animation's tracks: [time, transition, x,y,z(,w)] interleaved floats per key. */
function decodeTracks(anim, label) {
  const tracks = [];
  for (let i = 0; ; i++) {
    const type = anim.props.get(`tracks/${i}/type`);
    if (type === undefined) break;
    const pathV = anim.props.get(`tracks/${i}/path`);
    const keys = anim.props.get(`tracks/${i}/keys`);
    const bone = String(pathV && pathV.nodepath || '').replace(/^%GeneralSkeleton:/, '');
    if (!(keys && keys.f32)) throw new Error(`${label}: track ${i} (${bone}) keys are not a packed float array`);
    const stride = type === 'rotation_3d' ? 6 : 5;
    if (keys.f32.length % stride) throw new Error(`${label}: track ${i} length ${keys.f32.length} % ${stride}`);
    const times = [], values = [];
    for (let k = 0; k < keys.f32.length; k += stride) {
      times.push(keys.f32[k]);
      values.push(Array.from(keys.f32.subarray(k + 2, k + stride)));
    }
    tracks.push({ type, bone, times, values });
  }
  return tracks;
}

/* ─────────────────────────── the humanoid skeleton (profile subset) ───────────────────────────
 * Godot SkeletonProfileHumanoid parent chain, restricted to what RIG3 can consume. Fingers and
 * the stray Mixamo head-tip leaf are dropped at extract (counted): they sit BELOW every mapped
 * joint, so no mapped world rotation ever composes through them. */
const HU_PARENT = {
  Hips: null, Spine: 'Hips', Chest: 'Spine', UpperChest: 'Chest', Neck: 'UpperChest', Head: 'Neck',
  LeftShoulder: 'UpperChest', LeftUpperArm: 'LeftShoulder', LeftLowerArm: 'LeftUpperArm', LeftHand: 'LeftLowerArm',
  RightShoulder: 'UpperChest', RightUpperArm: 'RightShoulder', RightLowerArm: 'RightUpperArm', RightHand: 'RightLowerArm',
  LeftUpperLeg: 'Hips', LeftLowerLeg: 'LeftUpperLeg', LeftFoot: 'LeftLowerLeg', LeftToes: 'LeftFoot',
  RightUpperLeg: 'Hips', RightLowerLeg: 'RightUpperLeg', RightFoot: 'RightLowerLeg', RightToes: 'RightFoot',
};
const HU_BONES = Object.keys(HU_PARENT);

/* Humanoid → RIG3. `chest` takes the DEEPER joint (UpperChest) — godot2clips' spine.004 rule:
 * neck and shoulders hang off it in the source, so its world delta puts our chest where their
 * upper chest is; Chest's motion is absorbed into chest's local, lost to nothing. */
const HU_MAP = {
  Hips: 'hips', Spine: 'spine', UpperChest: 'chest', Neck: 'neck', Head: 'head',
  LeftShoulder: 'shoulderL', LeftUpperArm: 'upperArmL', LeftLowerArm: 'lowerArmL', LeftHand: 'handL',
  RightShoulder: 'shoulderR', RightUpperArm: 'upperArmR', RightLowerArm: 'lowerArmR', RightHand: 'handR',
  LeftUpperLeg: 'upperLegL', LeftLowerLeg: 'lowerLegL', LeftFoot: 'footL', LeftToes: 'toeL',
  RightUpperLeg: 'upperLegR', RightLowerLeg: 'lowerLegR', RightFoot: 'footR', RightToes: 'toeR',
};

/* RIG3 parent order for the world→local pass — godot2clips' PARENT/ORDER minus the tail (this
 * source has none; the donor fill carries it, same as it carries jaw/ears/cap/brows). */
const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', lowerArmL: 'upperArmL', handL: 'lowerArmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', lowerArmR: 'upperArmR', handR: 'lowerArmR',
  upperLegL: 'hips', lowerLegL: 'upperLegL', footL: 'lowerLegL', toeL: 'footL',
  upperLegR: 'hips', lowerLegR: 'upperLegR', footR: 'lowerLegR', toeR: 'footR',
};
const ORDER = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'lowerArmL', 'handL', 'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'toeL', 'upperLegR', 'lowerLegR', 'footR', 'toeR'];

const EMIT_FPS = 20;            // same rate, same reasoning as godot2clips/mixamo2clips
const CHECK_FPS = 60;
const SNAP_DEG = 120;
const DEG = 180 / Math.PI;

/* ───────────────────────────── extract: checkout → committed GLB ───────────────────────────── */

function doExtract(srcDir) {
  const restAnims = readLibrary(srcDir, REST_LIB);
  const tpose = restAnims.get('00 T-Pose');
  if (!tpose) throw new Error('godotlib2clips: the rest provider has no "00 T-Pose"');
  const restLocal = new Map();
  let restHips = null;
  for (const tr of decodeTracks(tpose, '00 T-Pose')) {
    if (tr.type === 'rotation_3d' && HU_PARENT[tr.bone] !== undefined) restLocal.set(tr.bone, tr.values[0]);
    if (tr.type === 'position_3d' && tr.bone === 'Hips') restHips = tr.values[0];
  }
  if (!restHips || restLocal.size < 21) throw new Error(`godotlib2clips: T-pose incomplete (${restLocal.size} rest rotations)`);

  /* nodes: one per profile bone, rest rotation from the T-pose, hips carries the rest position */
  const nodes = [];
  const nodeIndex = new Map();
  for (const b of HU_BONES) { nodeIndex.set(b, nodes.length); nodes.push({ name: b, rotation: [0, 0, 0, 1] }); }
  for (const b of HU_BONES) {
    const n = nodes[nodeIndex.get(b)];
    const q = restLocal.get(b);
    if (q) n.rotation = q.map((v) => +v.toFixed(7));
    if (b === 'Hips') n.translation = restHips.map((v) => +v.toFixed(6));
    const p = HU_PARENT[b];
    if (p !== null) {
      const pn = nodes[nodeIndex.get(p)];
      (pn.children || (pn.children = [])).push(nodeIndex.get(b));
    }
  }

  /* animations: rotation tracks for profile bones + the Hips translation, source key times */
  const bin = [];
  let binLen = 0;
  const bufferViews = [], accessors = [];
  const pushData = (f32arr, type, withBounds) => {
    const b = Buffer.from(f32arr.buffer, f32arr.byteOffset, f32arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: b.length });
    bin.push(b); binLen += b.length;
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: bufferViews.length - 1, componentType: 5126, count: f32arr.length / n, type };
    if (withBounds) {
      const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity);
      for (let i = 0; i < f32arr.length; i++) { const c = i % n; mn[c] = Math.min(mn[c], f32arr[i]); mx[c] = Math.max(mx[c], f32arr[i]); }
      acc.min = mn; acc.max = mx;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const animations = [];
  const dropped = { fingers: 0, leaves: 0, positions: 0, kept: 0 };
  const libCache = new Map();
  for (const keep of KEEP_LIB_CLIPS) {
    const anims = keep.lib === REST_LIB ? restAnims
      : (libCache.get(keep.lib) || libCache.set(keep.lib, readLibrary(srcDir, keep.lib)).get(keep.lib));
    const anim = anims.get(keep.clip);
    if (!anim) throw new Error(`godotlib2clips: ${keep.lib} has no clip ${JSON.stringify(keep.clip)} (has: ${[...anims.keys()].join(' | ')})`);
    const length = anim.props.get('length');
    const channels = [], samplers = [];
    for (const tr of decodeTracks(anim, keep.clip)) {
      if (HU_PARENT[tr.bone] === undefined) { dropped[/Thumb|Index|Middle|Ring|Little/.test(tr.bone) ? 'fingers' : 'leaves']++; continue; }
      if (tr.type === 'scale_3d') { dropped.leaves++; continue; }
      if (tr.type === 'position_3d' && tr.bone !== 'Hips') { dropped.positions++; continue; }
      dropped.kept++;
      const input = pushData(Float32Array.from(tr.times), 'SCALAR', true);
      const flat = new Float32Array(tr.values.length * tr.values[0].length);
      tr.values.forEach((v, i) => flat.set(v, i * v.length));
      const output = pushData(flat, tr.type === 'rotation_3d' ? 'VEC4' : 'VEC3', false);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex.get(tr.bone), path: tr.type === 'rotation_3d' ? 'rotation' : 'translation' } });
    }
    animations.push({ name: keep.clip, channels, samplers, extras: { srcLib: keep.lib, srcLength: length, loop: !!keep.loop, rotate: keep.rotate || 0, centerYaw: !!keep.centerYaw } });
  }

  const json = {
    asset: { version: '2.0', generator: 'godotlib2clips (§715)' },
    scene: 0,
    scenes: [{ nodes: [nodeIndex.get('Hips')] }],
    nodes, animations, accessors, bufferViews,
    buffers: [{ byteLength: binLen }],
  };
  const out = toGLB(json, Buffer.concat(bin, binLen));
  writeFileSync(ASSET, out);
  console.log(`wrote ${ASSET}  ${(out.length / 1024).toFixed(0)} KB`);
  console.log(`  ${animations.length} clips: ${animations.map((a) => a.name).join(', ')}`);
  console.log(`  channels kept ${dropped.kept}; dropped ${dropped.fingers} finger, ${dropped.leaves} leaf/scale, `
    + `${dropped.positions} non-root translation (RIG3 consumes none of them)`);
}

/* ─────────────────────────── retarget: committed GLB → module ─────────────────────────────── */

/* The arm rest alignment (derivation in the header). Constants of OUR rig, printed at run. */
function armAlignQuats() {
  const abs = Object.create(null);
  for (const [n, , p] of RIG3.SKELETON) abs[n] = p;
  const dir = (a, b) => new THREE.Vector3(abs[b][0] - abs[a][0], abs[b][1] - abs[a][1], abs[b][2] - abs[a][2]).normalize();
  const dL = dir('upperArmL', 'lowerArmL'), dR = dir('upperArmR', 'lowerArmR');
  return {
    CLinv: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dL).invert(),
    CRinv: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), dR).invert(),
    degL: Math.acos(Math.max(-1, Math.min(1, dL.x))) * DEG,
    degR: Math.acos(Math.max(-1, Math.min(1, -dR.x))) * DEG,
  };
}
const ARM_CHAIN = { upperArmL: 'L', lowerArmL: 'L', handL: 'L', upperArmR: 'R', lowerArmR: 'R', handR: 'R' };

/* RIG3 FK grounding + stride — godot2clips' block, same constants, same gate, same reasons. */
const CONTACT_BAND = 0.030, IK_ANKLE = 0.086, PLANT_LIFT = 0.10;
const RIG_ABS = Object.create(null);
for (const [n, , p] of RIG3.SKELETON) RIG_ABS[n] = p;
function makeRig() {
  const rt = new THREE.Group(), bones = Object.create(null);
  for (const [name, parent, p] of RIG3.SKELETON) {
    const b = new THREE.Object3D();
    const pa = parent === 'root' ? [0, 0, 0] : RIG_ABS[parent];
    b.position.set(p[0] - pa[0], p[1] - pa[1], p[2] - pa[2]);
    (parent === 'root' ? rt : bones[parent]).add(b);
    bones[name] = b;
  }
  return { rt, bones, hipsBase: bones.hips.position.clone() };
}
const _e3 = new THREE.Euler(), _vk = new THREE.Vector3();
function fkTrack(keys, want) {
  const r = makeRig();
  const out = want.map(() => []);
  for (const k of keys) {
    for (const b of ORDER) {
      const d = k.P[b];
      if (d) { _e3.set(d[0] / DEG, d[1] / DEG, d[2] / DEG, 'XYZ'); r.bones[b].quaternion.setFromEuler(_e3); }
      else r.bones[b].quaternion.identity();
    }
    r.bones.hips.position.set(r.hipsBase.x + k.pos[0], r.hipsBase.y + k.pos[1], r.hipsBase.z + k.pos[2]);
    r.rt.updateMatrixWorld(true);
    want.forEach((n, i) => { _vk.setFromMatrixPosition(r.bones[n].matrixWorld); out[i].push(_vk.clone()); });
  }
  return out;
}
function deriveStride(keys, loop) {
  const [tL, tR, aL, aR] = fkTrack(keys, ['toeL', 'toeR', 'footL', 'footR']);
  const minY = (a) => a.reduce((m, v) => Math.min(m, v.y), Infinity);
  const lift = Math.max(0, Math.min(minY(aL), minY(aR)) - IK_ANKLE);
  const runsOf = (tr) => {
    const lo = minY(tr), on = tr.map((v) => v.y <= lo + CONTACT_BAND);
    const rr = []; let cur = null;
    for (let i = 0; i < on.length; i++) { if (on[i]) { if (!cur) { cur = []; rr.push(cur); } cur.push(i); } else cur = null; }
    return rr;
  };
  let num = [0, 0], den = 0;
  const steps = [];
  for (const [tr, side] of [[tL, 'L'], [tR, 'R']]) {
    /* Two cleanups godot2clips' original never needed, because its gaits strike cleanly and
       start mid-air: a LOOP whose stance spans the seam shows as two runs (one ending at the
       last sample, one starting at sample 0) — merged, or the seam half would emit a spurious
       footstep; and a shuffling gait flickers at the band edge — runs shorter than half the
       foot's longest are stance chatter, kept for the velocity fit but not given a footstep. */
    const rawRuns = runsOf(tr).filter((R) => R.length >= 2);
    /* the velocity fit stays on the RAW runs — each contributes a correct local slope; a
       seam-merged run would pool a discontinuous timeline into one wrong one */
    for (const R of rawRuns) {
      const ts = R.map((i) => keys[i].t);
      const tb = ts.reduce((a, b) => a + b, 0) / R.length;
      const pbx = R.reduce((s, i) => s + tr[i].x, 0) / R.length;
      const pbz = R.reduce((s, i) => s + tr[i].z, 0) / R.length;
      R.forEach((i, k2) => {
        const tt = ts[k2] - tb;
        num[0] += tt * (tr[i].x - pbx); num[1] += tt * (tr[i].z - pbz); den += tt * tt;
      });
    }
    /* the EVENTS use merged + gated runs */
    let runs = rawRuns.slice();
    if (loop && runs.length >= 2) {
      const first = runs[0], last = runs[runs.length - 1];
      if (first[0] === 0 && last[last.length - 1] === tr.length - 1) {
        runs = runs.slice(1, -1);
        runs.push(last.concat(first));            // one physical contact; its start is `last`'s
      }
    }
    const longest = runs.reduce((m, R) => Math.max(m, R.length), 0);
    for (const R of runs) {
      if (R.length >= longest / 2) steps.push({ t: keys[R[0]].t, n: 'footstep', d: { foot: side } });
    }
  }
  const vel = den > 0 ? [-num[0] / den, -num[1] / den] : [0, 0];
  const speed = Math.hypot(vel[0], vel[1]);
  const isLoco = loop && lift < PLANT_LIFT && speed > 0.2;
  const dur = keys[keys.length - 1].t;
  return {
    lift: +lift.toFixed(3), speed: +speed.toFixed(3),
    stride: isLoco ? +(speed * dur).toFixed(3) : 0,
    events: isLoco && steps.length ? steps.sort((a, b) => a.t - b.t) : null,
    velDir: den > 0 && speed > 0.05 ? [vel[0] / speed, vel[1] / speed] : null,
  };
}

async function doRetarget(writePath) {
  if (!existsSync(ASSET)) throw new Error(`godotlib2clips: ${ASSET} not built — run --extract --src <checkout>`);
  const buf = readFileSync(ASSET);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const nodes = new Map();
  root.traverse((o) => { if (o.name) nodes.set(o.name, o); });
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const worldQuat = (node) => { node.matrixWorld.decompose(_p, _q, _s); return _q.clone(); };

  const restWorld = new Map();
  for (const hu of Object.keys(HU_MAP)) {
    const n = nodes.get(hu);
    if (n) restWorld.set(hu, worldQuat(n));
  }
  console.log(`source nodes: ${nodes.size}   mapped: ${restWorld.size}/${Object.keys(HU_MAP).length}`);
  if (restWorld.size < 21) throw new Error('godotlib2clips: mapping collapsed');

  const AA = armAlignQuats();
  console.log(`arm rest alignment: T(±X) → RIG3 bind arm, ${AA.degL.toFixed(1)}°/${AA.degR.toFixed(1)}° per side (derivation in header)`);

  const HIPS_ABS_Y = (RIG3.SKELETON.find(([n]) => n === 'hips'))[2][1];
  const hipsNode = nodes.get('Hips');
  const restHips = new THREE.Vector3().setFromMatrixPosition(hipsNode.matrixWorld);
  const K = HIPS_ABS_Y / restHips.y;
  console.log(`hips scale K = ${HIPS_ABS_Y.toFixed(4)} / ${restHips.y.toFixed(4)} = ${K.toFixed(4)}×  (offsets referenced to REST)`);

  const mixer = new THREE.AnimationMixer(root);
  const sample = () => {
    root.updateMatrixWorld(true);
    const worldTarget = new Map();
    for (const [hu, ours] of Object.entries(HU_MAP)) {
      if (!restWorld.has(hu)) continue;
      let d = worldQuat(nodes.get(hu)).multiply(restWorld.get(hu).clone().invert());
      const side = ARM_CHAIN[ours];
      if (side === 'L') d = d.multiply(AA.CLinv);
      else if (side === 'R') d = d.multiply(AA.CRinv);
      worldTarget.set(ours, d);
    }
    const P = {};
    const localW = new Map();
    for (const b of ORDER) {
      const w = worldTarget.get(b);
      if (!w) continue;
      const par = PARENT[b];
      const pw = par ? (localW.get(par) || new THREE.Quaternion()) : new THREE.Quaternion();
      localW.set(b, w.clone());
      const q = pw.clone().invert().multiply(w);
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      P[b] = [e.x * DEG, e.y * DEG, e.z * DEG].map((v) => +v.toFixed(1));
    }
    const hp = new THREE.Vector3().setFromMatrixPosition(hipsNode.matrixWorld);
    const off = hp.sub(restHips).multiplyScalar(K);
    return { P, pos: [+off.x.toFixed(4), +off.y.toFixed(4), +off.z.toFixed(4)], world: worldTarget };
  };

  const out = {};
  const table = [];
  for (const clip of gltf.animations) {
    const meta = (gltf.parser.json.animations.find((a) => a.name === clip.name) || {}).extras || {};
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.reset();
    act.play();

    /* ONE ascending pass (the clampWhenFinished trap — see godot2clips). Rotation happens on
       the captured array afterwards, never by re-driving the mixer at wrapped times. */
    const nChk = Math.max(2, Math.round(clip.duration * CHECK_FPS) + 1);
    let samples = [];
    for (let i = 0; i < nChk; i++) {
      const t = (i / (nChk - 1)) * clip.duration;
      mixer.setTime(t);
      samples.push({ t, ...sample() });
    }
    act.stop();
    mixer.setTime(0);

    if (meta.centerYaw) {
      /* remove the take's constant authored yaw (KEEP comment above): circular mean of the
         hips world yaw over the whole capture, then a rigid premultiplied re-base of every
         world target and the root offset. Printed, because a normalization that is not
         printed is a normalization nobody can dispute. */
      let sx = 0, sz = 0;
      for (const s2 of samples) {
        const v = new THREE.Vector3(0, 0, 1).applyQuaternion(s2.world.get('hips'));
        const n = Math.hypot(v.x, v.z) || 1;
        sx += v.x / n; sz += v.z / n;
      }
      const meanYaw = Math.atan2(sx, sz);
      const C = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -meanYaw);
      for (const s2 of samples) {
        for (const [bn, w] of s2.world) s2.world.set(bn, C.clone().multiply(w));
        const pv = new THREE.Vector3(s2.pos[0], s2.pos[1], s2.pos[2]).applyQuaternion(C);
        s2.pos = [+pv.x.toFixed(4), +pv.y.toFixed(4), +pv.z.toFixed(4)];
        /* locals re-derived from the re-based world targets */
        const P = {};
        const localW = new Map();
        for (const bn of ORDER) {
          const w = s2.world.get(bn);
          if (!w) continue;
          const par = PARENT[bn];
          const pw = par ? (localW.get(par) || new THREE.Quaternion()) : new THREE.Quaternion();
          localW.set(bn, w.clone());
          const q = pw.clone().invert().multiply(w);
          const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
          P[bn] = [e.x * DEG, e.y * DEG, e.z * DEG].map((v) => +v.toFixed(1));
        }
        s2.P = P;
      }
      console.log(`  ${clip.name}: centerYaw removed ${(meanYaw * DEG).toFixed(1)}° of authored facing offset`);
    }

    if (meta.rotate) {
      /* reindex the loop so every feature lands `rotate` LATER in the cycle (a footfall at
         normalized φ moves to φ + rotate): new[i] = old[i − rotate·n]. The seam pair is the
         clip's own loop seam, measured clean for every kept loop. The duplicated end sample
         (same pose as [0]) is dropped before rotating and re-appended after. The printed
         footfall column verifies the landing phase on every run — the direction of this shift
         once shipped backwards in a combat port (§479.8), so it is printed, not trusted. */
      const body = samples.slice(0, nChk - 1);
      const shift = (body.length - (Math.round(meta.rotate * body.length) % body.length)) % body.length;
      const rot = body.slice(shift).concat(body.slice(0, shift));
      samples = rot.map((s, i) => ({ ...s, t: (i / (nChk - 1)) * clip.duration }));
      samples.push({ ...rot[0], t: clip.duration });
    }

    /* metrics: max world step + snap detection + hips pitch sweep (godot2clips' instruments) */
    let prevW = null, maxStep = 0, maxStepBone = '', snaps = [], sweep = 0, prevA = null;
    for (const s of samples) {
      if (prevW) {
        for (const [b, w] of s.world) {
          const d = prevW.get(b).clone().invert().multiply(w);
          const ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
          if (ang > maxStep) { maxStep = ang; maxStepBone = b; }
          if (ang > SNAP_DEG) snaps.push({ t: +s.t.toFixed(3), b, ang: +ang.toFixed(0) });
        }
      }
      prevW = s.world;
      const v = new THREE.Vector3(0, 0, 1).applyQuaternion(s.world.get('hips'));
      const a = Math.atan2(v.y, v.z);
      if (prevA !== null) { let da = a - prevA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; sweep += da; }
      prevA = a;
    }

    /* emit: 60 Hz capture decimated to the 20 Hz grid, last key always included */
    const stride = Math.max(1, Math.round(CHECK_FPS / EMIT_FPS));
    const keys = [];
    for (let i = 0; i < samples.length; i += stride) keys.push(samples[i]);
    if (keys[keys.length - 1] !== samples[samples.length - 1]) keys.push(samples[samples.length - 1]);
    const emitted = keys.map((k) => ({ t: +k.t.toFixed(3), P: { ...k.P }, pos: k.pos, e: 'lin' }));
    const moves = new Set();
    for (const b of ORDER) {
      let mx = 0;
      for (const k of emitted) { const d = k.P[b]; if (d) mx = Math.max(mx, Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])); }
      if (mx > 0.05) moves.add(b);
    }
    for (const k of emitted) for (const b of ORDER) if (!moves.has(b)) delete k.P[b];

    const loop = !!meta.loop;
    const g = deriveStride(samples, loop);
    const rec = { dur: +clip.duration.toFixed(3), loop, keys: emitted };
    if (g.stride > 0) rec.stride = g.stride;
    if (g.events) rec.events = g.events.map((e) => ({ ...e, t: +e.t.toFixed(3) }));
    out[clip.name] = rec;
    table.push({
      name: clip.name, dur: clip.duration, keys: emitted.length, bones: moves.size, loop,
      maxStep: +maxStep.toFixed(0), maxStepBone, snaps, sweep: +(sweep * DEG).toFixed(0),
      posY: Math.min(...emitted.map((k) => k.pos[1])),
      lift: g.lift, stride: g.stride, speed: g.speed,
      steps: g.events ? g.events.map((e) => `${e.d.foot}@${(e.t / clip.duration).toFixed(2)}`).join(' ') : '—',
      velDir: g.velDir,
    });
  }

  console.log('\nclip            dur   keys bones loop  max 60Hz world step   hips sweep   min pos.y   lift  speed  stride  footfalls (norm)');
  for (const r of table) {
    const snap = r.snaps.length ? ` SNAP×${r.snaps.length}` : '';
    console.log(`${r.name.padEnd(14)} ${r.dur.toFixed(2)}  ${String(r.keys).padStart(4)} ${String(r.bones).padStart(4)}  ${r.loop ? 'yes' : ' no'}`
      + `  ${String(r.maxStep).padStart(4)}° ${r.maxStepBone.padEnd(10)}${snap.padEnd(8)} ${String(r.sweep).padStart(5)}°   ${r.posY.toFixed(3)}`
      + `   ${r.lift.toFixed(3)}  ${r.speed.toFixed(2)}  ${(r.stride ? r.stride.toFixed(3) : '—').padStart(6)}  ${r.steps}`);
  }

  /* FACING, re-derived on every run: the gait must travel +Z (our forward). Body-relative
     travel is minus the planted-foot drag the stride fit measures. */
  const gait = table.find((r) => r.name === 'Run 1');
  if (gait && gait.velDir) {
    const fw = gait.velDir[1];
    console.log(`\nfacing check (Run 1): body travel z ${fw >= 0 ? '+' : ''}${fw.toFixed(2)} — ${fw > 0.8 ? 'forward, no conjugation (correct)' : 'WRONG'}`);
    if (fw <= 0.8) throw new Error('godotlib2clips: facing check failed — the import no longer travels +Z');
  }

  if (writePath) {
    writeFileSync(writePath, `/* GENERATED by tools/godotlib2clips.mjs — do not hand-edit.\n`
      + ` * Retargeted from public/assets/sly-godot/sly-godot-lib.glb (the reference repo's sealed\n`
      + ` * AnimationLibrary containers, opened and re-expressed as glTF; provenance per clip in\n`
      + ` * public/assets/sly-godot/PROVENANCE.md). World-space delta retarget onto RIG3 with the\n`
      + ` * T-pose arm rest alignment (§715); tail/jaw/ears/cap/brows/cane are absent by\n`
      + ` * construction and stay procedural via the donor fill in Animation.js. Consumed through\n`
      + ` * Clips.js' own compile(). */\n`
      + `export const GODOT_LIB_CLIPS = ${JSON.stringify(out)};\n`);
    console.log(`\nwrote ${writePath}`);
  } else {
    console.log('\n(report only — pass --write <path> to emit)');
  }
}

/* ───────────────────────────── entry ───────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--extract')) {
    const i = argv.indexOf('--src');
    if (i < 0 || !argv[i + 1]) throw new Error('godotlib2clips --extract needs --src <checkout-root>');
    doExtract(path.resolve(argv[i + 1]));
  } else {
    const wi = argv.indexOf('--write');
    await doRetarget(wi !== -1 ? argv[wi + 1] : null);
  }
}
