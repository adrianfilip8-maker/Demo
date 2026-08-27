/**
 * SlyModelDLRig — the supplied model, unrevised, on its OWN artist rig.
 *
 * This is the answer to "rig the unrevised one", and it is the approach I should have taken from
 * the start. The supplied FBX carries a full production rig: 117 bones and artist-authored skin
 * weights on all four meshes. Every previous attempt discarded that and auto-generated weights
 * from bone-segment distance, which was adequate for limbs and never worked on the tail — the
 * artist spreads the tail across TWELVE bones with hand-tuned falloff, and no nearest-segment
 * heuristic reproduces that.
 *
 * WHAT IS PRESERVED. The mesh is the asset's own, vertex for vertex, with its authored normals
 * and its four textures — the same geometry as `SlyModelDLRaw`, which is why this counts as
 * rigging the unrevised model rather than another revision of it. The skin weights are the
 * artist's, not mine.
 *
 * WHAT IS TRANSLATED, and why translation is necessary at all. The game's animation is procedural:
 * Rig and Animation pose bones BY NAME against this project's skeleton, with identity bind
 * rotations. Driving the FBX's 117-bone hierarchy instead would need a full retarget layer and
 * would leave every clip, spring chain, shot and guard interaction to be rewritten. So the
 * artist's weights are re-expressed over OUR bones:
 *
 *   1. each FBX bone maps to the project bone it corresponds to (`BONE_MAP`), and every
 *      unmapped bone — face, fingers, ears, brows, the hat — folds into its nearest mapped
 *      ancestor, so its influence is kept rather than dropped;
 *   2. per vertex, the FBX influences are accumulated per project bone, the four strongest kept,
 *      and the result renormalised. The artist's RELATIVE weighting survives; only the bone
 *      count collapses;
 *   3. the mesh is carried from the FBX's bind pose into ours by the same per-bone
 *      rotate/scale/translate used elsewhere — now driven by good weights instead of guessed ones.
 *
 * The twelve tail bones collapse onto our four, which is a real loss of articulation. What it is
 * not is a loss of SMOOTHNESS: the artist's falloff across those twelve becomes a smooth blend
 * across our four, which is exactly the property my nearest-segment weighting could not produce
 * and the reason the tail kept collapsing into a flat fan.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from './SlyModel3.js';
import { Cane, CANE_TUNE, albedoTint } from './Cane.js';
import { loadCaneAsset, ASSET_HOOK_ALBEDO } from './CaneAsset.js';

const FBX_URL = new URL('../assets/sly-dl/sly.fbx', import.meta.url);
const TEX_FILES = import.meta.glob('../assets/sly-dl/*.png', { eager: true, query: '?url', import: 'default' });

/**
 * ── The FBX's own texture names, pointed at the files vite actually emitted (§666) ────────────
 *
 * `sly.fbx` names its maps internally as `sly_body.png`, `sly_head.png`, `sly_tail.png` and
 * `sly_eyeball.png`, and three's `FBXLoader` resolves those against the FBX's OWN path. In dev
 * that is `src/assets/sly-dl/`, where the PNGs sit beside it, so it works and always has. A
 * production build emits the FBX hashed into `assets/` and the PNGs under *different* hashed
 * names, so the same four names resolve to files that were never emitted — four 404s on every
 * load, photographed in the user's console on the live site:
 *
 *     GET https://<user>.github.io/Demo/assets/sly_body.png   404
 *
 * **This has never worked in a production build, and no instrument here could have seen it**:
 * every test, capture and probe in this project loads the dev server (§666). `TEX_FILES` above
 * already holds the right URLs — the loader was simply never told.
 *
 * A URL modifier is the fix rather than `setResourcePath`, because there is no single resource
 * path to give: vite hashes each PNG independently, so the mapping is per-file and is exactly
 * what the glob is. It answers the question the loader is asking — *where is this file* — which
 * keeps working if anything ever does read the FBX's own materials. Today nothing does: the
 * materials built below take every map from `textureUrl()`, off the same glob, so the practical
 * effect is that four failing requests become four that hit the browser cache entry the model's
 * real maps already populated.
 */
const FBX_MANAGER = new THREE.LoadingManager();
FBX_MANAGER.setURLModifier((url) => {
  const m = /([^/\\?#]+\.png)(?:[?#].*)?$/i.exec(String(url));
  if (!m) return url;
  const key = Object.keys(TEX_FILES).find((k) => k.endsWith(`/${m[1]}`));
  return key ? TEX_FILES[key] : url;
});

/* FBX bone -> project bone. Everything absent folds into its nearest mapped ancestor at load. */
const BONE_MAP = {
  a_body: 'hips', pelvis: 'hips',
  lower_back: 'spine', mid_back: 'spine',
  chest: 'chest', top_shoulders: 'chest',
  base_neck: 'neck', mid_neck: 'neck',
  base_head: 'head',
  L_clavicle: 'shoulderL', LF_shoulder: 'upperArmL', LF_elbow: 'lowerArmL', LF_wrist: 'handL',
  RT_clavicle: 'shoulderR', RT_shoulder: 'upperArmR', RT_elbow: 'lowerArmR', RT_wrist: 'handR',
  LF_hip: 'upperLegL', LF_knee: 'lowerLegL', LF_ankle: 'footL', LF_ball: 'toeL',
  RT_hip: 'upperLegR', RT_knee: 'lowerLegR', RT_ankle: 'footR', RT_ball: 'toeR',
  /* Twelve tail bones onto four, chosen by arc position against our chain
     (ours run z = -0.165, -0.517, -0.853, -1.122 against the asset's -22 … -127). */
  tail_base: 'tailA', tail1: 'tailA', tail2: 'tailA',
  tail3: 'tailB', tail4: 'tailB', tail6: 'tailB',
  tail7: 'tailC', tail8: 'tailC', tail9: 'tailC',
  tail11: 'tailD', tail12: 'tailD', tail_tip: 'tailD',
  staff: 'handR',                       // the cane, held in the right hand
  /* jaw, hat and the ears are DELIBERATELY absent, so they fold into `head` with the rest of the
     face. Mapping them onto our like-named detail bones looked tidy and distorted the muzzle:
     `jaw` collected six of the asset's lip and mouth bones, and our clips then drove that whole
     block with jaw motion authored for the PROCEDURAL model's small jaw blob — a compressed,
     smeared face under any crouching pose. The asset's expression rig has no counterpart in our
     procedural animation, so the face rides the skull rigidly, which is what it should do. */
};

/**
 * Which FBX bone ANCHORS each project bone's bind position — a separate question from which
 * bones carry weight, and conflating them cost a 60 % stretch in the tail root.
 *
 * `BONE_MAP` answers "whose influence is this?", so several asset bones fold onto one of ours.
 * Taking the bind position from whichever of those happened to be listed first put `tailB` on
 * `tail3`, giving a tailA→tailB span of 0.218 against our 0.354 and a conform-scale of 1.605.
 * Anchors are therefore chosen by ARC POSITION against our chain: our tail joints sit at
 * z = -0.165, -0.517, -0.853, -1.122, and the asset's nearest are tail_base (-0.214),
 * tail4 (-0.564), tail7 (-0.836) and tail11 (-1.131). Anything not named here falls back to the
 * first `BONE_MAP` entry, which is correct wherever the mapping is one-to-one.
 */
const ANCHOR = {
  tailA: 'tail_base', tailB: 'tail4', tailC: 'tail7', tailD: 'tail11',
  hips: 'a_body', spine: 'lower_back', chest: 'chest', neck: 'base_neck', head: 'base_head',
};

/**
 * The grip solve (critic pass 7 #5, "the cane is not held").
 *
 * Every number here is either measured off the asset or fixed on a stated physical rule; none is
 * tuned against the wrap score it produces, because that score is the thing being judged.
 *
 * `wrapDeg` is the only free choice and it is a SHAPE choice, decided before anything was
 * measured: each finger must lie along at least this much of the grip's circumference, which is
 * what separates a closed fist from a hook. 120° is comfortably inside the ~180° a real hand
 * manages, and it is what sizes the grip — see `_solveGrip`, where the largest grip radius
 * admitting it is derived from the phalanx chain lengths and the glove's own flesh radius.
 */
export const GRIP = {
  wrapDeg: 120,
  fingerCap: 3.0,        // hard stop on the curl-scale bisection: 3 × 86° ≈ full flexion
  thumbAimMax: 70,       // degrees the thumb may swing across the palm to oppose
  band: [0.05, 0.95],    // percentile window of the digit block that counts as the grip section
};

/**
 * `?grip=open` — the calibration lever for this fix, at RUNTIME.
 *
 * It disables the solved curl and leaves the cane socketed, which is the defect the fix exists to
 * remove: an open hand beside a cane. Offline it takes the wrap from 11/12 to 6/12 and the median
 * digit-to-cane distance from 25 mm to 63 mm, so a capture that cannot separate this arm from the
 * default has a dead pixel instrument and the run is void whatever else it shows.
 *
 * It is a URL token and not a source edit ON PURPOSE. `progress/records/PROVENANCE-critic7.md`
 * establishes that a run straddling two builds is void and must be re-shot; editing a file between
 * arms is exactly that. Read at module-load time for the same reason `?char=` is — the harness
 * cannot poke it in-page after boot.
 */
function gripMode() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search).get('grip');
      if (q) return String(q);
    }
    if (typeof globalThis !== 'undefined' && globalThis.__GRIP_AB != null) return String(globalThis.__GRIP_AB);
  } catch { /* plain-module hosts have no location; that is the offline path */ }
  return 'solved';
}
const GRIP_MODE = gripMode();

/**
 * §719 — the cane hook's gold, and the token that reverts it.
 *
 * `?hook=cream` (or `globalThis.__HOOK_AB = 'cream'`) hands the crook back its authored albedo:
 * `Cane._tagHook` is then asked for no colour, writes an all-white `COLOR_0`, and the material
 * multiplies by 1 — which is not "approximately what shipped before §719", it is BIT-IDENTICAL to
 * it, because `1 + (c - 1) * 0` is exactly 1 on every driver. That exactness is the point: it
 * makes the A/B's null arm an equality rather than a tolerance, the same property §3's
 * `shadowHold: 0` note records for the same reason.
 *
 * Read when the cane is BUILT rather than at module load — unlike `?char=` and `?grip=` above,
 * which have to be constants because module-scope tables are built from them. There is nothing to
 * gain by freezing it earlier and one thing to lose: read at build time, an offline guard can set
 * `globalThis.__HOOK_AB` before `init()` and exercise the revert without a second module load.
 * Either way it cannot be poked after boot, because the attribute is authored during `init()`.
 */
function hookGoldOn() {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('hook') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__HOOK_AB != null) raw = String(globalThis.__HOOK_AB);
  } catch { /* plain-module hosts have no location; that is the offline path */ }
  return String(raw).trim().toLowerCase() !== 'cream';
}

const TEX_BY_PART = { body: 'sly_body', eyeball: 'sly_eyeball', head: 'sly_head', tail: 'sly_tail' };
const FALLBACK = { body: 0x2f5fc4, eyeball: 0xd9821a, head: 0xcfcdc4, tail: 0x8d8b84 };

/**
 * How each part of him SHADES, as distinct from what colour it is.
 *
 * Until this table existed every part of the character reached the shader at an identical
 * `spec 0.25 / gloss 32 / metal 0`, inherited from `TUNE`, because this constructor passed
 * colour, bands, rim and outline and nothing else. Five materials wearing one shading response
 * is what KNOWN_ISSUES §262's census saw when it reported the character has "no metal on him in
 * any of these frames" — see §266 for what that census got right and wrong.
 *
 * **Nothing here is invented.** Every row is `SlyModel.js:_matSpec` — the pre-rebuild procedural
 * model's art direction for THIS character, which carries its evidence inline ("fur scatters; it
 * has no highlight to speak of, and a wide soft one is exactly the cue that reads as moulded
 * vinyl"). The rebuild onto a skinned FBX dropped the table, not the decision, and dropped it in
 * `SlyModelDL`, `SlyModelDLRaw`, `SlyModelGodot` and `SlyModel3` as well.
 *
 * `body` is a COMPROMISE row and worth naming as one: the FBX carries coat, gloves, boots and
 * trousers in a single submesh, so unlike the procedural model there is no seam at which leather
 * could get its own answer. `cloth` wins because the coat is most of those pixels.
 *
 * Measured on `sly-closeup` against PREREG-charmat's registered guards (§266): on the character's
 * own footprint (70 657 px, isolated by albedo tag) this moves mean L 111.6 → 109.5 and p99
 * 199.5 → 197.3 — duller, never brighter, which is G5′, and measurably non-zero, which is G6.
 *
 * `eyeball` is deliberately ABSENT and must stay absent: it keeps the `TUNE` defaults it has
 * always had (§15's eye hierarchy). Do not "complete" this table.
 */
const SURFACE = {
  body: { spec: 0.085, gloss: 20, sss: 0.14 },   // _matSpec `cloth`
  head: { spec: 0.025, gloss: 8 },               // _matSpec `fur` — sss stays TUNE.furSSS
  tail: { spec: 0.03, gloss: 9, sss: 0.228 },    // _matSpec `furDark` — TUNE.furSSS * 0.6
};

const partOf = (name = '') => (/tail/i.test(name) ? 'tail' : /eyeball/i.test(name) ? 'eyeball'
  : /head/i.test(name) ? 'head' : 'body');

/**
 * `?face=raw` — the calibration lever for the head-albedo correction (critic 9 D11).
 *
 * The head ships on `sly_head_fix.png`, derived from the supplied `sly_head.png` by
 * `tools/slyface.mjs`: the muzzle-tip blob is painted black (the asset has nose GEOMETRY and
 * never painted it — 146 triangles sampling a mean (89, 81, 74) of plain fur), and the fur is
 * white-balanced off the Godot project's independent Sly head, taking HSV saturation 0.182 to
 * 0.031 and R/B 1.215 to 0.981 at unchanged median luma. The drawn black — mask, mouth, ear
 * line — is not touched at any point.
 *
 * `?face=raw` restores the supplied texture. Read at module-load time for the same reason
 * `?char=` and `?grip=` are: a harness cannot poke a URL param in-page after this evaluates,
 * and an A/B that needs a source edit between arms is void by `PROVENANCE-critic7.md`.
 */
function faceMode() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search).get('face');
      if (q) return String(q);
    }
    if (typeof globalThis !== 'undefined' && globalThis.__FACE_AB != null) return String(globalThis.__FACE_AB);
  } catch { /* plain-module hosts have no location; that is the offline path */ }
  return 'fix';
}
const FACE_MODE = faceMode();

/**
 * `?body=fix` — the calibration lever for the costume-hue correction (critic 9 D2, §277/§278).
 *
 * **Default is `raw`, i.e. OFF and pixel-identical to before.** The correction is derived and
 * measured on the texture, but its effect on a FRAME has never been captured, and a lane does not
 * get to ship a pixel change on an offline argument.
 *
 * `sly_body_fix.png` is derived from the supplied `sly_body.png` by `tools/slybody.mjs`: a pure
 * HSV hue rotation of −21.1° over the costume-blue window (hue 190–270°, sat > 0.15), leaving
 * saturation and value byte-identical — §277 measured the supplied saturation at 0.927 against the
 * reference's 0.909, i.e. already correct, so a fix that moves it is fixing the wrong thing. The
 * shorts, sash, belt, mask and white are untouched; cap, gloves and boots ARE rotated, because
 * §196's "ONE blue" rule covers the costume rather than just the torso.
 *
 * Why −21.1° and not the −15.5° that lands the albedo on the reference's 213.5°: that reference
 * number is a hue measured in a FRAME, and our own render adds +5.6° of violet on top of the
 * albedo (§277), so an albedo at 213.5° still renders at 219.1°. Pre-compensating gives a target
 * albedo of 207.9°. The non-circular check on that: the original hand-authored `SlyModel.js` shirt
 * `0x2f7fc4` sits at **207.8°** — 0.1° from the derived target — so the original blue was chosen to
 * land on the reference AFTER the render's shift, and §278 records that the compensation was lost
 * when the supplied asset replaced it. This restores it; it is not a taste preference.
 *
 * Read at module-load time for the same reason `?char=`, `?grip=` and `?face=` are.
 */
function bodyMode() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search).get('body');
      if (q) return String(q);
    }
    if (typeof globalThis !== 'undefined' && globalThis.__BODY_AB != null) return String(globalThis.__BODY_AB);
  } catch { /* plain-module hosts have no location; that is the offline path */ }
  /* Default flipped 'raw' → 'fix' by PREREG-bodyhue6's PASS (RESULT-bodyhue6.md): the -11.3°
     costume rotation landed 213.5 ± 6.0 on both close-ups, all gates green. `?body=raw` is the
     escape. Scope: close range only — §281's mid-distance attractor is a separate, open defect. */
  return 'fix';
}
const BODY_MODE = bodyMode();

function textureUrl(part) {
  const stem = TEX_BY_PART[part];
  /* Degrade to the supplied texture if the derived one is absent from the glob — a missing
     product must never stop the character loading (same rule as `?char=`'s MODULE_FILES check). */
  if (part === 'head' && FACE_MODE !== 'raw') {
    const fix = Object.keys(TEX_FILES).find((k) => k.endsWith('/sly_head_fix.png'));
    if (fix) return TEX_FILES[fix];
  }
  /* Default-ON like the head since PREREG-bodyhue6's PASS; `?body=raw` opts back out. Same
     degrade rule — a missing derived file falls through to the supplied one rather than failing
     the load. */
  if (part === 'body' && BODY_MODE === 'fix') {
    const fix = Object.keys(TEX_FILES).find((k) => k.endsWith('/sly_body_fix.png'));
    if (fix) return TEX_FILES[fix];
  }
  const key = Object.keys(TEX_FILES).find((k) => k.endsWith(`/${stem}.png`));
  return key ? TEX_FILES[key] : null;
}

function dropNonFiniteTriangles(g) {
  const pos = g.attributes.position, tris = pos.count / 3, keep = [];
  for (let t = 0; t < tris; t++) {
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const i = (t * 3 + k) * 3;
      if (!Number.isFinite(pos.array[i]) || !Number.isFinite(pos.array[i + 1]) || !Number.isFinite(pos.array[i + 2])) ok = false;
    }
    if (ok) keep.push(t);
  }
  if (keep.length === tris) return { geo: g, dropped: 0 };
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize, span = 3 * n;
    const arr = new a.array.constructor(keep.length * span);
    for (let j = 0; j < keep.length; j++) arr.set(a.array.subarray(keep[j] * span, keep[j] * span + span), j * span);
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  return { geo: out, dropped: tris - keep.length };
}

/**
 * Split the triangles weighted to one FBX bone out of a non-indexed geometry.
 *
 * Used to lift the asset's `staff` submesh out of the body mesh. The crook baked into it is three
 * straight segments meeting at mitres (critic pass 7 #6, "a bent coat hanger, not a crook") and no
 * parameter smooths a baked polyline — the only fix is to stop drawing it and to draw `Cane.js`,
 * whose crook is a sampled 192° arc, in its place. Returns the surviving geometry plus the removed
 * corner positions, because the removed thing is also the only record of where the cane WAS, and
 * the socket keeps the replacement pointing the same way.
 */
function splitOffBone(g, boneIndex) {
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  if (!si || !sw) return { geo: g, removed: 0, points: [] };
  const tris = pos.count / 3, keep = [], points = [];
  const wOf = (i) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.array[i * 4 + k] === boneIndex) w += sw.array[i * 4 + k];
    return w;
  };
  for (let t = 0; t < tris; t++) {
    let onBone = 0;
    for (let k = 0; k < 3; k++) if (wOf(t * 3 + k) > 0.5) onBone++;
    if (onBone === 3) {
      for (let k = 0; k < 3; k++) {
        const i = (t * 3 + k) * 3;
        points.push(new THREE.Vector3(pos.array[i], pos.array[i + 1], pos.array[i + 2]));
      }
    } else keep.push(t);
  }
  if (!points.length) return { geo: g, removed: 0, points: [] };
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize, span = 3 * n;
    const arr = new a.array.constructor(keep.length * span);
    for (let j = 0; j < keep.length; j++) arr.set(a.array.subarray(keep[j] * span, keep[j] * span + span), j * span);
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  return { geo: out, removed: tris - keep.length, points };
}

/** Least-squares circle through 2-D points (Kåsa). Returns {cx, cy, r, rms}. */
function circleFit(pts) {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c] || 1e-12;
    for (let j = c; j < 4; j++) m[c][j] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let j = c; j < 4; j++) m[r][j] -= f * m[c][j];
    }
  }
  const cx = m[0][3] / 2, cy = m[1][3] / 2;
  const r = Math.sqrt(Math.max(1e-9, m[2][3] + cx * cx + cy * cy));
  let s = 0;
  for (const [x, y] of pts) s += (Math.hypot(x - cx, y - cy) - r) ** 2;
  return { cx, cy, r, rms: Math.sqrt(s / n) };
}

export class SlyModel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'slydlrig';
    this.bones = {};
    this.boneNames = RIG3.BONE_ORDER;
    this.mesh = null;
    this.cane = null;
    this._bindWorld = {};
    this._restQ = {};
    this._socket = null;      // grip frame in FBX bind space, filled by _relaxGloves
    this.gripInfo = null;     // what the solve read and decided — the tests assert on this
  }

  async init() {
    /* ---- project skeleton ---- */
    const abs = {};
    for (const [name, parent, p] of RIG3.SKELETON) {
      const b = new THREE.Bone();
      b.name = name;
      const parAbs = parent === 'root' ? [0, 0, 0] : abs[parent];
      b.position.set(p[0] - parAbs[0], p[1] - parAbs[1], p[2] - parAbs[2]);
      abs[name] = p;
      (parent === 'root' ? this.root : this.bones[parent]).add(b);
      this.bones[name] = b;
      this._bindWorld[name] = new THREE.Vector3(p[0], p[1], p[2]);
    }
    const boneList = RIG3.BONE_ORDER.map((n) => this.bones[n]);
    const skeleton = new THREE.Skeleton(boneList);

    /* ---- the asset, rig and all ---- */
    const fbx = await new FBXLoader(FBX_MANAGER).loadAsync(FBX_URL.href);
    fbx.updateMatrixWorld(true);

    const skinned = [];
    fbx.traverse((o) => { if (o.isSkinnedMesh && o.geometry?.attributes?.skinWeight) skinned.push(o); });
    if (!skinned.length) throw new Error('SlyModelDLRig: FBX carries no skinned meshes');
    const srcSkel = skinned[0].skeleton;

    /* FBX bone index -> project bone index, folding unmapped bones into the nearest mapped
       ancestor so their influence is kept rather than silently dropped. */
    const resolve = (bone) => {
      for (let b = bone; b; b = b.parent) {
        if (b.name && BONE_MAP[b.name]) return BONE_MAP[b.name];
        if (!b.isBone) break;
      }
      return 'hips';
    };
    const fbxToOurs = srcSkel.bones.map((b) => RIG3.BONE_ORDER.indexOf(resolve(b)));
    const folded = srcSkel.bones.filter((b) => !BONE_MAP[b.name]).length;

    /* FBX bind-pose world positions, from the inverse bind matrices (authoritative, and
       independent of whatever pose the file happens to be left in). */
    const srcPos = {};
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    const anchored = new Set(Object.values(ANCHOR));
    /* Explicit anchors first, so an arc-matched choice always beats list order (see ANCHOR). */
    srcSkel.bones.forEach((b, i) => {
      if (!anchored.has(b.name)) return;
      const nm = Object.keys(ANCHOR).find((k) => ANCHOR[k] === b.name);
      if (!nm) return;
      m.copy(srcSkel.boneInverses[i]).invert();
      srcPos[nm] = v.setFromMatrixPosition(m).clone();
    });
    srcSkel.bones.forEach((b, i) => {
      const nm = BONE_MAP[b.name];
      if (!nm || srcPos[nm]) return;                       // fallback: first mapped bone wins
      m.copy(srcSkel.boneInverses[i]).invert();
      srcPos[nm] = v.setFromMatrixPosition(m).clone();
    });

    /* ---- geometry: world space, per part, sanitized ---- */
    const geos = [], parts = [];
    let dropped = 0;
    const staffBone = srcSkel.bones.findIndex((b) => b.name === 'staff');
    let staffPts = [], staffTris = 0;
    for (const sm of skinned) {
      let g = sm.geometry.clone();
      /* SkinnedMesh geometry is authored in bind space; its own matrixWorld is the bind
         transform, so baking it puts every part into one shared space. */
      g.applyMatrix4(sm.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      const r = dropNonFiniteTriangles(g);
      dropped += r.dropped;
      let gg = r.geo;
      if (staffBone >= 0) {
        const cut = splitOffBone(gg, staffBone);
        if (cut.points.length) { staffPts = cut.points; staffTris = cut.removed; gg = cut.geo; }
      }
      geos.push(gg);
      parts.push(partOf(sm.name));
    }
    if (dropped) this.engine?.warn?.(`SlyModelDLRig: dropped ${dropped} triangle(s) with non-finite corners`);

    for (const g of geos) {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const k of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      }
    }
    const merged = mergeGeometries(geos, true);
    if (!merged) throw new Error('SlyModelDLRig: merge failed — parts disagree on attributes');

    this._relaxGloves(merged, srcSkel, staffPts);

    /* ---- normalize: feet to the floor, uniform scale to our character height ---- */
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    if (![bb.min.y, bb.max.y].every(Number.isFinite) || !(bb.max.y > bb.min.y)) {
      throw new Error('SlyModelDLRig: non-finite or degenerate bounding box');
    }
    const S = RIG3.TUNE.height / (bb.max.y - bb.min.y);
    const yOff = -bb.min.y;
    merged.translate(0, yOff, 0);
    merged.scale(S, S, S);
    /* the same transform, applied to the FBX bind positions so both live in one space */
    for (const k of Object.keys(srcPos)) srcPos[k] = srcPos[k].clone().setY(srcPos[k].y + yOff).multiplyScalar(S);

    /* ---- re-express the artist's weights over our bones ---- */
    const si = merged.attributes.skinIndex, sw = merged.attributes.skinWeight;
    const n = merged.attributes.position.count;
    const bidx = new Uint16Array(n * 4), bwt = new Float32Array(n * 4);
    const bucket = new Map();
    for (let i = 0; i < n; i++) {
      bucket.clear();
      for (let k = 0; k < 4; k++) {
        const w = sw.array[i * 4 + k];
        if (!(w > 0)) continue;
        const ours = fbxToOurs[si.array[i * 4 + k]];
        if (ours < 0) continue;
        bucket.set(ours, (bucket.get(ours) || 0) + w);
      }
      const top = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, e) => s + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        bidx[i * 4 + k] = top[k] ? top[k][0] : 0;
        bwt[i * 4 + k] = top[k] ? top[k][1] / sum : 0;
      }
    }

    /* ---- carry the mesh from the FBX bind pose into ours -----------------------------------
     *
     * Two defects in the first version of this block, both visible in its capture:
     *
     * 1. STRUCTURAL CHILDREN ONLY. It took each bone's first child from the skeleton list without
     *    filtering. For `head` that is `jaw`, so the head's whole transform was derived from the
     *    head->jaw direction — a small facial offset, not a limb axis — which shrank the skull to
     *    about 0.70 and scrambled its orientation. A bone's transform must come from the next
     *    STRUCTURAL joint or from its parent, never from a detail bone hanging off it.
     *
     * 2. SCALE ONLY WHERE LENGTH MUST CONFORM. Per-bone scale exists so a limb whose proportions
     *    differ from ours still lands its joints on our bones — the asset's arms are longer
     *    relative to height (0.265 against our 0.19), so without it the hand overshoots. Applied
     *    to the spine, neck or head it does something else entirely: it resizes body parts to the
     *    ratio of two joint SPACINGS, so our short neck->head gap (0.064) against the asset's
     *    (0.080) shrinks the entire skull by a fifth for no reason. Limbs and tail conform;
     *    torso, neck and head are placed and turned but never resized.
     */
    const STRUCT = new Set([
      'hips', 'spine', 'chest', 'neck', 'head',
      'shoulderL', 'upperArmL', 'lowerArmL', 'handL',
      'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
      'upperLegL', 'lowerLegL', 'footL', 'toeL',
      'upperLegR', 'lowerLegR', 'footR', 'toeR',
      'tailA', 'tailB', 'tailC', 'tailD',
    ]);
    const CONFORMS = (nm) => /^(shoulder|upperArm|lowerArm|hand|upperLeg|lowerLeg|foot|toe|tail)/.test(nm);

    const structChild = {};
    for (const [nm, par] of RIG3.SKELETON) {
      if (STRUCT.has(nm) && STRUCT.has(par) && !structChild[par]) structChild[par] = nm;
    }
    const rot = {};
    for (const [nm, par] of RIG3.SKELETON) {
      const kid = structChild[nm];
      if (kid && srcPos[nm] && srcPos[kid]) {
        const dS = srcPos[kid].clone().sub(srcPos[nm]);
        const dO = new THREE.Vector3(...abs[kid]).sub(new THREE.Vector3(...abs[nm]));
        const lS = dS.length(), lO = dO.length();
        rot[nm] = (lS > 1e-6 && lO > 1e-6)
          ? {
            q: new THREE.Quaternion().setFromUnitVectors(dS.divideScalar(lS), dO.divideScalar(lO)),
            sc: CONFORMS(nm) ? lO / lS : 1,
          }
          : { q: new THREE.Quaternion(), sc: 1 };
      } else rot[nm] = rot[par] || { q: new THREE.Quaternion(), sc: 1 };
    }
    /* THE HEAD IS PLACED, NEVER TURNED (§522 defect 3, "permanently looking upward").
     *
     * `head` has no structural child, so the fallback above handed it its PARENT's carry
     * rotation — rot[neck], which exists to lay the throat geometry along our neck→head axis.
     * The asset's neck axis leans 13.2° forward of vertical and ours leans 1.2°
     * (tools/dlaxes.mjs, from the inverse bind matrices), so that fallback rotated the entire
     * skull −12.0° about X: chin up, baked into the geometry, in every state the game has.
     * rigfault.mjs photographed the composition: a walk whose head BONE points 9° below
     * horizontal still rendered muzzle-up on this model and level on `?char=model3`.
     *
     * The neck rotation is load-bearing for the NECK — its geometry must span two joints.
     * The skull spans nothing: it is a terminal mass whose orientation the artist authored
     * against gravity, so the identity carry keeps that authoring verbatim and the 12° meets
     * the throat as an ordinary skinning crease, the same one any head-turn key produces. */
    rot.head = { q: new THREE.Quaternion(), sc: 1 };
    const M = RIG3.BONE_ORDER.map((nm) => {
      const r = rot[nm] || { q: new THREE.Quaternion(), sc: 1 };
      const from = srcPos[nm] || new THREE.Vector3(...abs[nm]);
      return new THREE.Matrix4()
        .compose(new THREE.Vector3(...abs[nm]), r.q, new THREE.Vector3(r.sc, r.sc, r.sc))
        .multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
    });
    const Q = RIG3.BONE_ORDER.map((nm) => (rot[nm] ? rot[nm].q : new THREE.Quaternion()));

    const pos = merged.attributes.position, nrm = merged.attributes.normal;
    const p0 = new THREE.Vector3(), pa = new THREE.Vector3(), pt = new THREE.Vector3();
    const n0 = new THREE.Vector3(), na = new THREE.Vector3(), nt = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p0.fromBufferAttribute(pos, i); pa.set(0, 0, 0);
      n0.fromBufferAttribute(nrm, i); na.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = bwt[i * 4 + k];
        if (w > 0) {
          pa.addScaledVector(pt.copy(p0).applyMatrix4(M[bidx[i * 4 + k]]), w);
          na.addScaledVector(nt.copy(n0).applyQuaternion(Q[bidx[i * 4 + k]]), w);
        }
      }
      pos.setXYZ(i, pa.x, pa.y, pa.z);
      if (na.lengthSq() > 1e-12) { na.normalize(); nrm.setXYZ(i, na.x, na.y, na.z); }
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;

    merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bidx, 4));
    merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bwt, 4));
    /* authored normals are carried above — never recomputed (non-indexed input would go faceted) */

    /* ---- materials ---- */
    const shading = this.engine?.get?.('shading');
    const T = RIG3.TUNE;
    const loader = new THREE.TextureLoader();
    const materials = parts.map((part) => {
      const url = textureUrl(part);
      let map = null;
      if (url) {
        map = loader.load(url);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 4;
        /* REPEAT, not three's default clamp-to-edge. The tail's UVs run V from 0.114 to 1.504 —
           deliberately past 1.0, because the asset tiles its banded texture along the tail's
           length. Under clamping everything above V = 1 samples one edge row, so the rings
           flatten into a solid block, which is exactly what a blind critic reported: "a solid
           dark-brown lobe with zero ring pattern", costing this build identity twice and
           reference fidelity four times out of four. Body, head and eyeball stay inside [0,1]
           bar rounding, so only the tail was visibly affected — but the asset's UVs are the
           authority on wrap mode, and they say repeat. */
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
      }
      /* `eyeball` has no SURFACE row, so it spreads nothing and keeps the TUNE defaults
         byte-for-byte. Spread LAST so a row's own `sss` wins over `T.furSSS` above it. */
      const surf = SURFACE[part] || {};
      return shading?.make
        ? shading.make({
          name: `slydlrig:${part}`, color: map ? 0xffffff : FALLBACK[part], map,
          bands: T.bands, rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
          outline: T.outline, outlineColor: T.outlineColor,
          ...surf,
        })
        : new THREE.MeshStandardMaterial({ color: map ? 0xffffff : FALLBACK[part], map, roughness: 0.85 });
    });

    this.mesh = new THREE.SkinnedMesh(merged, materials.length === 1 ? materials[0] : materials);
    this.mesh.name = 'slydlrig:mesh';

    /* ---- the D2 A/B swap (PREREG-bodyhue2) -------------------------------------------------
       Run 1 of the costume-hue A/B was VOID because `?body=` is read at module load, so its two
       arms needed two page loads — and two page loads are not bit-identical. `sly-perch`'s
       difference mask came back 24.69% of the frame with 85.6% of it differing by <= 2 levels,
       i.e. boot noise rather than costume (ADDENDUM-bodyhue-run1.md, and §269 had already
       measured 2.69% cross-boot drift on `dunes`).

       This lets both arms be two renders of ONE boot, which restores the definitional mask: with
       the clock frozen and nothing else touched, the ONLY difference between the two frames is
       the body albedo.

       Deliberately LAZY and traversal-reachable:
         · lazy, so the shipped build loads exactly the textures it loaded before — an A/B fixture
           must not cost the player a second 228 KB texture it never samples;
         · on `userData` rather than a `Debug.js` lever, because nothing needs to read this every
           frame and the ink lane's `slyInk_*` traversal already set the precedent for a page-side
           handle that changes no shipped behaviour.
       Returns a promise so a capture can await the decode before rendering the arm. */
    {
      const bodyIdx = parts.indexOf('body');
      const bodyMat = bodyIdx >= 0 ? (materials.length === 1 ? materials[0] : materials[bodyIdx]) : null;
      if (bodyMat) {
        const original = bodyMat.map;
        const cache = new Map();
        this.mesh.userData.slySwapBodyTex = (mode) => new Promise((resolve, reject) => {
          /* Mode-faithful, whatever the boot policy: `original` is whichever file
             `textureUrl('body')` picked at load — since PREREG-bodyhue6's PASS flipped
             `bodyMode()` to 'fix', that is the FIX texture, and an earlier version of this
             swap that treated `original` as 'raw' silently rendered both arms identical
             (attractor run 1, every pair mask 0; CAL-2 caught it). The boot map is reused
             only when it IS the wanted mode; the other file loads on demand. */
          const want = mode === 'fix' ? 'fix' : 'raw';
          const boot = BODY_MODE === 'fix' ? 'fix' : 'raw';
          if (want === boot) { bodyMat.map = original; bodyMat.needsUpdate = true; resolve(want); return; }
          if (cache.has(want)) { bodyMat.map = cache.get(want); bodyMat.needsUpdate = true; resolve(want); return; }
          const stem = want === 'fix' ? '/sly_body_fix.png' : '/sly_body.png';
          const key = Object.keys(TEX_FILES).find((k) => k.endsWith(stem));
          if (!key) { reject(new Error(`${stem.slice(1)} is not in the texture glob`)); return; }
          loader.load(TEX_FILES[key], (t) => {
            /* Match the original's sampler exactly, or the arms differ by filtering as well as
               by hue and the mask stops being definitional. */
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = original ? original.anisotropy : 4;
            t.wrapS = original ? original.wrapS : THREE.RepeatWrapping;
            t.wrapT = original ? original.wrapT : THREE.RepeatWrapping;
            t.flipY = original ? original.flipY : t.flipY;
            cache.set(want, t);
            bodyMat.map = t; bodyMat.needsUpdate = true;
            resolve(want);
          }, undefined, reject);
        });
      }
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.add(boneList[0]);
    this.mesh.bind(skeleton);

    /* One ink system (critic 7 #3). The hull is what makes a cel silhouette read, and the shipped
       model has never built one; 50% of the cap's outline and 33% of the back's is currently bare.
       Width comes from Outline.js (INK_PX), so `thickness` is accepted and ignored. */
    this.engine?.get?.('shading')?.outline?.(this.mesh, { thickness: 1 });

    await this._buildCane(M, rot, abs, S, yOff, staffTris);

    this.root.userData.height = RIG3.TUNE.height;
    this.root.userData.artistWeights = true;
    this.root.userData.foldedBones = folded;
    this.root.updateMatrixWorld(true);
    for (const nm of RIG3.BONE_ORDER) this._restQ[nm] = this.bones[nm].quaternion.clone();
    this.engine?.scene?.add(this.root);
  }

  /**
   * Bake a relaxed curl into the gloves, in bind space, using the artist's own finger weights.
   *
   * §202's blind round called the hands "splayed rake fingers". The rig dump disagrees with the
   * word *splayed* and confirms the complaint: index-to-pinky spread is 6.0°, so they are not
   * fanned — they are DEAD STRAIGHT (base-to-tip straightness 0.990–0.995), parallel, and held
   * 42.7° off the forearm. Four rigid prongs. That is the T-pose the asset was authored in, and it
   * survives because our rig has no finger bones: all twenty per hand fold into `handL`/`handR`,
   * which is 19.56 % of the body mesh's skin weight moving as one block that can never curl.
   *
   * THIS IS THE LAST MOMENT THE FIX IS POSSIBLE. The influences are still the FBX's 117 bones here;
   * the block below collapses them onto ours and the per-finger detail is gone for good. So the
   * curl is applied once, at load, to bind-space geometry, and costs nothing at runtime.
   *
   * The flex axis is DERIVED, not typed in. `palmWard` is the component of the thumb direction
   * perpendicular to the fingers — the thumb is on the palm side by anatomy, so this points into
   * the palm on both hands, and `cross(fingerDir, palmWard)` therefore gives an axis whose positive
   * rotation curls inward for left and right alike with no mirrored special case. Verified before
   * it was written: every finger on both hands moves palm-ward (index tip 0.00 → 8.38 cm along
   * `palmWard`), tips bend 52–56°, and reach shortens only ~5 %.
   *
   * Only the body mesh carries finger weight — 6,070 of its 25,353 vertices — and the eye, head and
   * tail meshes carry exactly 0.00 %, so this cannot disturb the face.
   *
   * WHAT THIS DID NOT DO, and now does. The fixed 22/34/30 was chosen to un-splay a T-pose hand
   * and it knows nothing about the cane, which is weighted to `staff` and therefore moves 0 mm
   * while the curl moves 6,070 vertices by up to 12 asset units. So the flexion fix pulled the
   * fingers OFF the shaft: right-hand digit vertices sat a median 132 mm from the nearest staff
   * vertex with 0.9 % inside 10 mm, and 5 of 12 azimuth sectors around the shaft occupied.
   * Worse, the shaft never ran through the palm at all — measured
   * in this space, the staff's axis passes 5.2 units on the BACK of the knuckle line, so curling
   * harder moves the fingers further away and no amount of it can close the gap. That is the
   * whole of critic pass 7 #5 and it is a placement fault, not a flexion one.
   *
   * The cane hand therefore gets a solve instead of a constant (`_solveGrip`), and the cane is
   * built as a prop socketed to the frame that solve returns.
   */
  _relaxGloves(geo, srcSkel, staffPts = []) {
    const CURL = { finger: [22, 34, 30], thumb: [14, 20] };     // degrees, per joint down the chain
    const DIGITS = {
      index: ['index_base', 'index_midA', 'index_midB', 'index_tip'],
      mid:   ['mid_base', 'mid_midA', 'mid_midB', 'mid_tip'],
      ring:  ['ring_base', 'ring_midA', 'ring_midB', 'ring_tip'],
      pinky: ['pinky_base', 'pinky_midA', 'pinky_midB', 'pinky_tip'],
      thumb: ['thumb_base', 'thumb_mid', 'thumb_tip'],
    };
    const idx = new Map(srcSkel.bones.map((b, i) => [b.name, i]));
    const bind = (nm) => (idx.has(nm)
      ? new THREE.Vector3().setFromMatrixPosition(
        new THREE.Matrix4().copy(srcSkel.boneInverses[idx.get(nm)]).invert())
      : null);

    /* Which hand holds the cane is DERIVED: the staff we just lifted out of the mesh has a
       centroid, and the wrist nearer to it is the one that was holding it. */
    let caneSide = null;
    if (staffPts.length) {
      const sc = new THREE.Vector3();
      for (const v of staffPts) sc.add(v);
      sc.divideScalar(staffPts.length);
      let bestD = Infinity;
      for (const side of ['LF', 'RT']) {
        const w = bind(`${side}_wrist`);
        if (w && w.distanceTo(sc) < bestD) { bestD = w.distanceTo(sc); caneSide = side; }
      }
    }

    /* FBX bone index -> the bind-space matrix that curls whatever is weighted to it */
    const curl = new Map();
    for (const side of ['LF', 'RT']) {
      const ib = bind(`${side}_index_base`), it = bind(`${side}_index_tip`);
      const tb = bind(`${side}_thumb_base`), tt = bind(`${side}_thumb_tip`);
      if (!ib || !it || !tb || !tt) continue;                    // no fingers on this side
      const fingerDir = it.clone().sub(ib).normalize();
      const palmWard = tt.clone().sub(tb).normalize();
      palmWard.addScaledVector(fingerDir, -palmWard.dot(fingerDir));
      if (palmWard.lengthSq() < 1e-8) continue;                  // thumb parallel to the fingers
      palmWard.normalize();
      const axis = new THREE.Vector3().crossVectors(fingerDir, palmWard).normalize();

      /* The open hand keeps the constant. Only the hand that has something to hold is solved,
         which keeps the blast radius of the solve to one hand. */
      const solved = side === caneSide
        ? this._solveGrip({ geo, srcSkel, idx, bind, side, DIGITS, CURL, fingerDir, palmWard, axis, staffPts })
        : null;

      for (const [digit, chain] of Object.entries(DIGITS)) {
        const ang = (digit === 'thumb' ? CURL.thumb : CURL.finger)
          .map((a) => a * (solved ? solved.scale[digit] : 1));
        /* The thumb's opposition is a swing of the whole digit about its own base — flexion about
           the shared axis moves it PARALLEL to the fingers, which is why the shipped hand has no
           thumb across the cane no matter how hard it curls. */
        let acc = new THREE.Matrix4();                           // identity: the wrist does not move
        if (solved && digit === 'thumb' && solved.thumbAim) acc = solved.thumbAim.clone();
        for (let j = 0; j < chain.length; j++) {
          const nm = `${side}_${chain[j]}`;
          const bi = idx.get(nm);
          if (bi === undefined) continue;
          const p = bind(nm);
          if (j < ang.length && p) {
            /* rotate about THIS joint, after everything its parents already did */
            const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(ang[j]));
            acc = acc.clone().multiply(
              new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)
                .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
                .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)));
          }
          curl.set(bi, acc.clone());
        }
      }
    }
    if (!curl.size) { this.engine?.warn?.('SlyModelDLRig: no finger bones found — gloves left straight'); return; }

    const nrmOf = new Map();
    for (const [k, m] of curl) nrmOf.set(k, new THREE.Matrix3().setFromMatrix4(m));

    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    if (!si || !sw) { this.engine?.warn?.('SlyModelDLRig: no skin data at glove time — gloves left straight'); return; }
    const src = new THREE.Vector3(), tmp = new THREE.Vector3(), acc = new THREE.Vector3();
    const nsrc = new THREE.Vector3(), nacc = new THREE.Vector3();
    let touched = 0, maxMove = 0;
    for (let i = 0; i < pos.count; i++) {
      let wSum = 0;
      acc.set(0, 0, 0); nacc.set(0, 0, 0);
      src.fromBufferAttribute(pos, i);
      if (nrm) nsrc.fromBufferAttribute(nrm, i);
      for (let k = 0; k < 4; k++) {
        const w = sw.array[i * 4 + k];
        if (!(w > 0)) continue;
        const M = curl.get(si.array[i * 4 + k]);
        if (!M) continue;
        wSum += w;
        acc.addScaledVector(tmp.copy(src).applyMatrix4(M), w);
        if (nrm) nacc.addScaledVector(tmp.copy(nsrc).applyMatrix3(nrmOf.get(si.array[i * 4 + k])), w);
      }
      if (wSum <= 0) continue;
      /* the rest of the vertex stays put, so the knuckle band eases in instead of tearing at the
         weight boundary — this is ordinary linear blend skinning with identity on every other bone */
      const rest = 1 - Math.min(wSum, 1);
      acc.addScaledVector(src, rest);
      maxMove = Math.max(maxMove, acc.distanceTo(src));
      pos.setXYZ(i, acc.x, acc.y, acc.z);
      if (nrm) {
        nacc.addScaledVector(nsrc, rest);
        if (nacc.lengthSq() > 1e-12) { nacc.normalize(); nrm.setXYZ(i, nacc.x, nacc.y, nacc.z); }
      }
      touched++;
    }
    pos.needsUpdate = true;
    if (nrm) nrm.needsUpdate = true;
    this.engine?.warn?.(`SlyModelDLRig: relaxed ${touched} glove vertices, max move ${maxMove.toFixed(1)} (asset units)`);
  }

  /**
   * Build the cane and socket it to `handR` at the frame the grip solve returned.
   *
   * WHY THE PROP AND NOT THE SUBMESH. The asset's crook is three straight segments meeting at
   * mitres, baked into 774 vertices all weighted to one bone — "a bent coat hanger, not a crook",
   * and no parameter smooths a baked polyline. `Cane.js` samples an open 192° arc at
   * `hookRadius` 0.168, which is the shape the silhouette is supposed to carry.
   *
   * WHICH TRIANGLES THE SOCKET CARRIES (§294). Since the owner's instruction, the prop's
   * rendered geometry is the downloaded `sly-cane.glb`, adopted into `Cane.js`'s local frame —
   * grip at the origin, shaft +Y, hook to +Z, bbox conformed to the procedural extents — so
   * every word of this comment about the SOCKET remains true and only the drawn shape changed.
   * `Cane.js` still builds first (it is the frame and the measured conform target) and still
   * ships whole if the asset fails to parse.
   *
   * WHY A RIGID SOCKET AND NOT `_attachPoints.cane`. Registering an attach point would hand the
   * cane to `Animation._applyCane`, whose per-clip aims were authored against the LEGACY model's
   * `caneGrip` base and would swing this cane somewhere else in all 52 clips. The staff this
   * replaces was rigid to `handR`; the replacement is rigid to `handR` in the same place, so no
   * clip changes and the only difference is the geometry. Wiring the aim system up is a separate,
   * capture-backed job.
   *
   * SPACE. Every project bone is built with an identity rotation, so a bone's bind world matrix is
   * a pure translation and a child of `handR` is in project metres, unscaled. The socket arrives
   * in FBX bind units and is carried across by the same chain the mesh took: normalise, then the
   * per-bone matrix for `handR` — which is exact here, because the staff was weighted 1.0 to
   * `staff` and `staff` maps to `handR`, so its vertices took precisely that transform and nothing
   * else.
   */
  async _buildCane(M, rot, abs, S, yOff, staffTris) {
    const s = this._socket;
    if (!s) { this.engine?.warn?.('SlyModelDLRig: no grip socket solved — cane not built'); return; }
    const hi = RIG3.BONE_ORDER.indexOf('handR');
    const q = (rot.handR && rot.handR.q) || new THREE.Quaternion();
    const unit = S * ((rot.handR && rot.handR.sc) || 1);            // asset units -> project metres
    const toProj = (v) => v.clone().setY(v.y + yOff).multiplyScalar(S).applyMatrix4(M[hi]);
    const dir = (v) => v.clone().applyQuaternion(q).normalize();

    const Y = dir(s.Y), Z = dir(s.Z);
    Z.addScaledVector(Y, -Z.dot(Y)).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    const socket = new THREE.Group();
    socket.name = 'caneSocket';
    socket.position.copy(toProj(s.C)).sub(new THREE.Vector3(...abs.handR));
    socket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));

    const gripR = s.gripR * unit, shaftR = s.shaftR * unit;
    this.cane = new Cane(this.engine, { tune: { gripR, shaftR } });
    const shading = this.engine?.get?.('shading');
    /* §294, owner instruction: the downloaded cane replaces the procedural build where they
       conflict — which is here, the shipped character's hand. The procedural cane is still
       built first because it is the FRAME (its measured extent is the conform target and the
       grip/tip/hook contract lives on it); `adoptAsset` then swaps the rendered triangles for
       the asset's, shape untouched. `loadCaneAsset` resolves null on any failure and the
       procedural cane ships exactly as before — the game never loses the prop to a bad byte. */
    const asset = await loadCaneAsset((m) => this.engine?.warn?.(m));
    /* THE CANE IS GOLD IN ALBEDO AND IN NOTHING ELSE, AND THAT IS NOT AN OVERSIGHT ANY MORE —
     * it is a measured refusal. Read KNOWN_ISSUES §266 before "fixing" this.
     *
     * The obvious change is to add the house gold here: `spec 0.9, gloss 96, metal 0.85` from
     * `Props.js MATERIALS.gold`, which `Pickups.js` already copies and which the owner-supplied
     * cane independently corroborates at metal 0.80 / rough 0.25
     * (`src/assets/sly-cane/PROVENANCE.md`). It was captured against guards registered before
     * the candidate existed (`progress/records/PREREG-charmat.md`) and it **FAILED**, in the
     * opposite direction to the forecast. On `sly-closeup` the cane's own pixels went
     * **DARKER**: p99 −37.5 L at the asset's values, −41.0 L at Props gold's, against a
     * registered bar of **+10 L or better**.
     *
     * The mechanism is in the shader and it is not a tuning problem:
     *   · `diff *= mix( 1.0, 0.20, slyMetal )` removes 68 % of the diffuse at metal 0.85, and
     *     the cane is UNMAPPED, so unlike every gold in the world it has no `metalnessMap` to
     *     mask that kill down to a gild fraction.
     *   · `specStep` is a shape function capped at 1.35 for every `glossP`, and the shipped
     *     `uSpecNormPow` is **0**, so there is no energy normalisation. Raising `uGloss` 32 → 96
     *     therefore makes the highlight *smaller and no brighter* (§263), and it cannot pay back
     *     what the diffuse kill costs.
     *
     * So the cane cannot be made to read as metal by material values alone while
     * `uSpecNormPow` is 0. It is blocked on the same missing normalisation that blocks the
     * world's highlight — PREREG-specnorm2's `p ∈ (0.70, 0.90]`. When that ships, re-run
     * `node tools/canegold.mjs`; the gloss-96 lobe gains roughly ×10 amplitude at p 0.9, which
     * is precisely the factor missing here.
     *
     * Also NOT to be added: `detail: 'metal'`. The triplanar detail is sampled at
     * `slyWorldPos()` — WORLD space — so on a prop that moves with the hand the grain swims
     * across the surface. That is very likely why no character material carries one.
     */
    /* §719 — THE HOOK'S GOLD, AND WHY IT IS AN ALBEDO TINT AND NOTHING ELSE.
     *
     * The owner asked for "the gold color on the cane hook". That is a request about COLOUR, and
     * it is a DIFFERENT request from the one the block above refuses, which was about making the
     * cane read as METAL and which failed measurement in the opposite direction to its forecast.
     * Nothing under §719 touches `metal`, `gloss`, `spec`, `rough` or `detail`: the refusal above
     * stands exactly as written, and `tools/canehook.mjs` asserts on every run that those values
     * are identical before and after its arms, so a lane that drifts into the metal question
     * voids its own colour result instead of quietly reporting a contaminated one.
     *
     * WHAT WAS ACTUALLY WRONG WITH THE COLOUR, measured rather than assumed. The asset's authored
     * albedo is not neutral and never was. The crook's UV shell is a FLAT `ASSET_HOOK_ALBEDO`
     * (#ffe29c) — a pale cream already clipped in red — which tonemaps toward white under the key
     * and is why the hook has been read off frames as silver. The house gold (0xe8b942, the same
     * hex this material already falls back to below) is darker and far more saturated, and it
     * survives the tonemap because it has chroma to spend. So the fix is to carry the crook's
     * albedo the rest of the way to the house gold, and a vertex-colour multiply is exactly the
     * instrument for that — `Cane.js` already does it for the procedural grip, one draw call.
     *
     * `albedoTint` divides in LINEAR, the space `<color_fragment>` multiplies in, and clamps at 1
     * so this path can never make a surface brighter than its own albedo. Where there is no
     * texture the cane is ALREADY the house gold, so `want` equals `base`, the ratio is (1,1,1),
     * and the crook is tinted by nothing: one expression covers both forks with no branch to get
     * wrong. `Cane._tagHook` decides WHICH vertices; see its header.
     *
     * THE COLOR_0 TRAP IS CLOSED IN THREE PLACES, because this is the defect the note below was
     * written about. `Body.js` always writes a `color` attribute on the procedural build;
     * `Cane._tagHook` always writes one on the adopted geometry, INCLUDING on every refusal; and
     * the assertion after the adopt takes the flag off rather than draw a black cane if both of
     * those were somehow untrue. */
    const hookColor = hookGoldOn() ? albedoTint(0xe8b942, asset?.texture ? ASSET_HOOK_ALBEDO : 0xe8b942) : null;
    /* The material follows the same fork as the geometry. With the asset: its authored albedo
       as `map` (colour 0xffffff so the texture is the albedo, exactly the body-material
       pattern), and since §719 `vertexColors` — the glb carries no COLOR_0 of its own, so the
       attribute is AUTHORED by `Cane._tagHook`, which is what makes the flag safe here (a
       vertex-colour material over an unbound attribute multiplies to black, the PREREG-guardfix
       defect). Everything else stays at the house TUNE response per the refusal above; the
       asset's metal/rough VALUES are what §266 measured and declined. Without: today's gold,
       byte-for-byte, vertex colours darkening the procedural grip. */
    const gold = shading?.make
      ? shading.make({
        name: 'slydlrig:cane',
        ...(asset ? { color: asset.texture ? 0xffffff : 0xe8b942, map: asset.texture || null, vertexColors: true }
          : { color: 0xe8b942, vertexColors: true }),
        bands: RIG3.TUNE.bands, rim: RIG3.TUNE.rim, rimColor: RIG3.TUNE.rimColor,
        outline: RIG3.TUNE.outline, outlineColor: RIG3.TUNE.outlineColor,
      })
      : new THREE.MeshStandardMaterial(asset
        ? { color: asset.texture ? 0xffffff : 0xe8b942, map: asset.texture || null, vertexColors: true, metalness: 0.85, roughness: 0.3 }
        : { color: 0xe8b942, vertexColors: true, metalness: 0.85, roughness: 0.3 });
    this.cane.build([gold]);
    const adopted = asset ? this.cane.adoptAsset(asset, { hookColor }) : false;
    /* Belt and braces on the trap above. If anything upstream ever hands this material a geometry
       with no COLOR_0, drop the flag rather than draw a black cane — a pale hook is a defect, a
       black cane is a broken build. */
    if (gold.vertexColors && !this.cane.mesh.geometry.attributes.color) {
      gold.vertexColors = false;
      this.engine?.warn?.('SlyModelDLRig: the cane geometry carries no COLOR_0 — vertex colours disabled (§719)');
    }
    this._caneMaterial = gold;          // passed in, so Cane.dispose() does not own it
    socket.add(this.cane.object);
    this.bones.handR.add(socket);
    this._caneSocket = socket;
    /* the cane is hard metal among fur — its own, slightly heavier line. The hull is built
       AFTER the adopt so the ink wraps the triangles that render, not the ones they replaced;
       the asset's own baked outline shell (`shader` prim) is deliberately not drawn — one ink
       system, critic 7 #3, see CaneAsset.js. */
    shading?.outline?.(this.cane.mesh, { thickness: 1.25 });
    /* The hook's classification goes in the boot line, not just into a tool: a capture's own log
       is where the next person looks, and a refusal that only a tool can see is a refusal nobody
       reads (§699 — a claim written once and then trusted). */
    const ht = this.cane.hookTag;
    this.engine?.warn?.(`SlyModelDLRig: staff submesh dropped (${staffTris} tris), `
      + `${adopted ? `${this.cane.assetCane} (§294)` : 'Cane.js'} socketed to handR `
      + `(grip ${(gripR * 1000).toFixed(1)} mm, ${this.cane.triangles} tris`
      + `${ht ? `, hook ${ht.tinted ? `${ht.hook}/${ht.verts} verts gold (§719)`
        : `NOT tinted — ${ht.why}`}` : ''})`);
  }

  /**
   * Solve the cane hand: how far each digit curls, and where the cane has to be for that to be a
   * grip. Runs once at load, in FBX bind space, on the artist's own finger bones. Zero runtime cost.
   *
   * The order matters and is the opposite of the obvious one. Bending the fingers onto a cane
   * that is not in the palm cannot work — measured here, the asset's staff runs across the BACK
   * of the knuckles, so flexion increases the gap. So the hand is closed first, on a physical
   * target, and the cane is then put where the closed hand's tunnel actually is:
   *
   *   1. GRIP RADIUS from the glove. Each finger must lie along `GRIP.wrapDeg` of the grip's
   *      circumference, so the largest admissible radius is `chain / wrapRad - flesh`, minimised
   *      over the four fingers. `chain` is the summed phalanx length and `flesh` is the median
   *      distance of that digit's vertices from its own bone line — both measured, neither typed.
   *      This is why the authored 29.5 mm grip could never be held: it needs fingers half again
   *      as long as this glove has.
   *   2. CLOSURE. Curl all four by a shared scale on the shipped 22/34/30 profile and fit a circle
   *      through their sixteen joints projected onto the plane normal to the flexion axis. The
   *      fitted radius minus the mean flesh is the internal radius of the fist; bisect the scale
   *      until it equals the grip radius. The fitted centre is the tunnel, and it is where the
   *      cane goes.
   *   3. CONTACT. Each digit then closes on its own until its fingertip reaches the grip surface,
   *      so the four differ instead of moving as one block — the "four identical prongs" half of
   *      the complaint.
   *   4. THUMB. Flexion about the shared axis moves the thumb parallel to the fingers, never
   *      across them, which is why the shipped hand shows no thumb on the cane. It gets an
   *      opposition swing about the axis that aims its tip at the cane instead.
   *
   * Every quantity the fix is judged on is read out afterwards, in `gripInfo`; none is an input.
   */
  _solveGrip({ geo, srcSkel, idx, bind, side, DIGITS, CURL, fingerDir, palmWard, axis, staffPts }) {
    const FINGERS = ['index', 'mid', 'ring', 'pinky'];
    const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    if (!si || !sw) return null;
    const names = srcSkel.bones.map((b) => b.name);

    /* --- vertex sets and flesh radii, per digit --- */
    const vertsOf = {}, flesh = {};
    for (const d of Object.keys(DIGITS)) vertsOf[d] = [];
    const pre = `${side}_`;
    for (let i = 0; i < pos.count; i++) {
      for (let k = 0; k < 4; k++) {
        const w = sw.array[i * 4 + k];
        if (!(w > 0.5)) continue;
        const nm = names[si.array[i * 4 + k]] || '';
        if (!nm.startsWith(pre)) continue;
        const d = Object.keys(DIGITS).find((x) => nm.startsWith(`${pre}${x}_`));
        if (d) vertsOf[d].push(i);
      }
    }
    const v3 = new THREE.Vector3();
    for (const d of Object.keys(DIGITS)) {
      const chain = DIGITS[d];
      const a0 = bind(`${pre}${chain[0]}`), a1 = bind(`${pre}${chain[chain.length - 1]}`);
      if (!a0 || !a1 || !vertsOf[d].length) return null;
      const dir = a1.clone().sub(a0); const L = dir.length(); dir.normalize();
      const rs = [];
      for (const i of vertsOf[d]) {
        const q = v3.fromBufferAttribute(pos, i).clone().sub(a0);
        const u = THREE.MathUtils.clamp(q.dot(dir), 0, L);
        rs.push(q.addScaledVector(dir, -u).length());
      }
      rs.sort((a, b) => a - b);
      flesh[d] = rs[rs.length >> 1];
    }

    /* --- 1. grip radius the glove can actually close on --- */
    const chainLen = {};
    for (const d of Object.keys(DIGITS)) {
      let L = 0;
      for (let j = 0; j + 1 < DIGITS[d].length; j++) L += bind(`${pre}${DIGITS[d][j]}`).distanceTo(bind(`${pre}${DIGITS[d][j + 1]}`));
      chainLen[d] = L;
    }
    const wrapRad = THREE.MathUtils.degToRad(GRIP.wrapDeg);
    let gripR = Infinity;
    for (const d of FINGERS) gripR = Math.min(gripR, chainLen[d] / wrapRad - flesh[d]);
    if (!(gripR > 0)) return null;
    const shaftR = gripR * (CANE_TUNE.shaftR / CANE_TUNE.gripR);

    /* --- frame for the plane normal to the flexion axis --- */
    const e1 = new THREE.Vector3(1, 0, 0);
    if (Math.abs(e1.dot(axis)) > 0.9) e1.set(0, 1, 0);
    e1.addScaledVector(axis, -e1.dot(axis)).normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();

    /* forward kinematics for one digit, composed exactly as _relaxGloves composes it */
    const chainOf = (d, k, aim) => {
      const chain = DIGITS[d], ang = (d === 'thumb' ? CURL.thumb : CURL.finger).map((a) => a * k);
      let acc = aim ? aim.clone() : new THREE.Matrix4();
      const joints = [];
      for (let j = 0; j < chain.length; j++) {
        const nm = `${pre}${chain[j]}`, p = bind(nm);
        if (!p) continue;
        if (j < ang.length) {
          const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(ang[j]));
          acc = acc.clone().multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)
            .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
            .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)));
        }
        joints.push(p.clone().applyMatrix4(acc));
      }
      return joints;
    };

    /* --- 2. close the fist until its internal radius is the grip radius --- */
    const fleshMean = FINGERS.reduce((s, d) => s + flesh[d], 0) / FINGERS.length;
    const fitAt = (k) => {
      const pts = [];
      for (const d of FINGERS) for (const j of chainOf(d, k)) pts.push([j.dot(e1), j.dot(e2)]);
      return circleFit(pts);
    };
    let lo = 0.2, hi = GRIP.fingerCap;
    for (let s = 0; s < 40; s++) {
      const m = (lo + hi) / 2;
      if (fitAt(m).r - fleshMean > gripR) lo = m; else hi = m;
    }
    const kShared = (lo + hi) / 2, fit = fitAt(kShared);

    /* the grip section along the cane is the digit block's own axial footprint, which flexion —
       a rotation about that very axis — leaves EXACTLY invariant, so it is not a knob */
    const allD = Object.keys(DIGITS).flatMap((d) => vertsOf[d]);
    const axAll = allD.map((i) => v3.fromBufferAttribute(pos, i).dot(axis)).sort((a, b) => a - b);
    const band = [axAll[Math.floor(axAll.length * GRIP.band[0])], axAll[Math.floor(axAll.length * GRIP.band[1])]];
    const C = new THREE.Vector3()
      .addScaledVector(e1, fit.cx).addScaledVector(e2, fit.cy)
      .addScaledVector(axis, (band[0] + band[1]) / 2);
    const radial = (v) => { const q = v.clone().sub(C); return q.addScaledVector(axis, -q.dot(axis)).length(); };

    /* --- 3. each digit closes until its own tip touches --- */
    const scale = {};
    for (const d of FINGERS) {
      const target = gripR + flesh[d];
      let pick = null, bestE = Infinity, bestK = kShared;
      for (let k = 0; k <= GRIP.fingerCap + 1e-9; k += 0.01) {
        const r = radial(chainOf(d, k)[DIGITS[d].length - 1]);
        if (pick === null && r <= target) { pick = k; break; }
        if (Math.abs(r - target) < bestE) { bestE = Math.abs(r - target); bestK = k; }
      }
      scale[d] = pick === null ? bestK : pick;
      if (GRIP_MODE === 'open') scale[d] = 0;        // calibration arm — see gripMode()
    }

    /* --- 4. thumb opposition: swing the whole digit about the axis that aims it at the cane --- */
    const tChain = DIGITS.thumb;
    const tBase = bind(`${pre}${tChain[0]}`), tTip = bind(`${pre}${tChain[tChain.length - 1]}`);
    const nearest = C.clone().addScaledVector(axis, tTip.dot(axis) - C.dot(axis));
    const oppAxis = new THREE.Vector3().crossVectors(tTip.clone().sub(tBase), nearest.clone().sub(tBase));
    let thumbAim = null, thumbAimDeg = 0, thumbReach = radial(tTip);
    if (oppAxis.lengthSq() > 1e-9) {
      oppAxis.normalize();
      const swing = (deg) => new THREE.Matrix4().makeTranslation(tBase.x, tBase.y, tBase.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(
          new THREE.Quaternion().setFromAxisAngle(oppAxis, THREE.MathUtils.degToRad(deg))))
        .multiply(new THREE.Matrix4().makeTranslation(-tBase.x, -tBase.y, -tBase.z));
      const target = gripR + flesh.thumb;
      let bestE = Infinity, bestA = 0, bestK = 1;
      /* never STRAIGHTER than the relaxed thumb: a straight thumb is a fifth prong, which is the
         half of #5 that flexion already exists to answer. Only the opposition is free. */
      for (let a = 0; a <= GRIP.thumbAimMax + 1e-9; a += 1) {
        for (let k = 1; k <= 3.0 + 1e-9; k += 0.25) {
          const r = radial(chainOf('thumb', k, swing(a))[tChain.length - 1]);
          const e = Math.abs(r - target);
          if (e < bestE - 1e-6) { bestE = e; bestA = a; bestK = k; thumbReach = r; }
        }
      }
      thumbAim = swing(bestA); thumbAimDeg = bestA; scale.thumb = bestK;
    } else scale.thumb = 1;

    /* --- where the cane points: matched to the staff we just removed, so the silhouette the
           clips were authored against does not move. The hook end is the end with the wider
           perpendicular spread; the bend direction is that end's mean offset off the axis. --- */
    let Y = axis.clone(), Z = new THREE.Vector3();
    if (staffPts.length) {
      const sc = new THREE.Vector3();
      for (const v of staffPts) sc.add(v);
      sc.divideScalar(staffPts.length);
      let loS = 0, hiS = 0, loN = 0, hiN = 0;
      const loP = new THREE.Vector3(), hiP = new THREE.Vector3();
      for (const v of staffPts) {
        const q = v.clone().sub(sc); const a = q.dot(axis);
        q.addScaledVector(axis, -a);
        if (a < 0) { loS += q.length(); loN++; loP.add(q); } else { hiS += q.length(); hiN++; hiP.add(q); }
      }
      const hookHigh = (hiN ? hiS / hiN : 0) > (loN ? loS / loN : 0);
      Y = axis.clone().multiplyScalar(hookHigh ? 1 : -1);
      Z.copy(hookHigh ? hiP : loP);
      Z.addScaledVector(Y, -Z.dot(Y));
    }
    if (Z.lengthSq() < 1e-9) Z.copy(palmWard).addScaledVector(Y, -palmWard.dot(Y));
    Z.normalize();

    this._socket = { C: C.clone(), Y: Y.clone(), Z: Z.clone(), gripR, shaftR };

    /* read-outs — not inputs. Anything the fix is scored on is computed after it is decided. */
    let palmClear = Infinity;
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (names[si.array[i * 4 + k]] === `${pre}wrist`) w += sw.array[i * 4 + k];
      if (w <= 0.5) continue;
      const v = v3.fromBufferAttribute(pos, i).clone();
      const a = v.dot(axis);
      if (a < band[0] || a > band[1]) continue;
      palmClear = Math.min(palmClear, radial(v) - gripR);
    }
    this.gripInfo = {
      side, gripR, shaftR, kShared, scale: { ...scale }, thumbAimDeg,
      thumbReach: thumbReach - gripR, fitRms: fit.rms, fistRadius: fit.r - fleshMean,
      flesh: { ...flesh }, chainLen: { ...chainLen }, band, palmClear,
      C: C.clone(), axis: axis.clone(), Y: Y.clone(), Z: Z.clone(),
      /* Vertex indices are stable from here to the end of init() — the staff was the last thing
         removed — so this is the only handle a test has on "which vertices are fingers" once the
         117 FBX influences have been collapsed onto `handR`. 2.4k indices, ~10 kB. */
      digitVerts: Object.fromEntries(Object.entries(vertsOf).map(([d, a]) => [d, Uint32Array.from(a)])),
    };
    return { scale, thumbAim };
  }

  bp(name) { return this._bindWorld[name]; }
  update() { /* all motion comes from Rig/Animation */ }
  dispose() {
    this.cane?.dispose?.();
    this._caneMaterial?.dispose?.();
    this._caneSocket?.removeFromParent?.();
    this.cane = null; this._caneMaterial = null; this._caneSocket = null;
    this.mesh?.geometry?.dispose?.();
    const mm = this.mesh?.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x?.map?.dispose?.(); x?.dispose?.(); });
    this.root.parent?.remove(this.root);
    this.mesh = null;
  }
}
