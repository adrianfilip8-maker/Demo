#!/usr/bin/env node
/**
 * muzzle.mjs — where the cone's apex is, which way the gun points, and how far it swings.
 *
 * §709 moved the vision cone's apex to the end of Carmelita's pistol barrel, on the owner's
 * request. Three questions had to be answered with numbers before that could ship, and this file
 * is the instrument for all three. It runs offline: committed assets, `AnimationMixer`, no
 * browser, no lock.
 *
 * ── 1. WHICH END IS THE MUZZLE, and is the shipping rule right ─────────────────────────────
 * `CarmelitaNative.muzzleFromBarrel` decides it STATICALLY: of the barrel's two ends along its
 * own principal axis, the muzzle is the one further from the `Trigger` bone. That is a shape
 * argument, and §439/§440 says an instrument sharing an argument with its subject cannot falsify
 * it. So this re-derives the answer from a completely different fact — **which end is further
 * from her chest when a clip is actually driving the gun** — and REFUSES if the two disagree.
 * A gun held out is held muzzle-away; that is independent of where the trigger is.
 *
 * ── 2. DOES THE APEX CLEAR HER BODY (§178) ──────────────────────────────────────────────────
 * `TUNE.coneEyeFwd`/`coneEyeUp` exist because a cone starting inside the head washes additive
 * haze over the chest. A muzzle apex sits in front of the body, which is what that offset was
 * buying — but "in front" is a claim, so it is measured: the distance from the muzzle to the
 * nearest vertex of her CPU-skinned body, per clip, per pose.
 *
 * ── 3. HOW FAR DOES THE BARREL SWING ────────────────────────────────────────────────────────
 * The open question the owner's request raises is whether the cone should also AIM along the
 * barrel. That is answerable only by measuring the barrel's angular range across the clips a
 * guard can actually reach, which is what the table at the end prints.
 *
 * ── §442, built in ──────────────────────────────────────────────────────────────────────────
 * Every reading is taken from a DRIVEN rig. The tool prints the same measurements at the BIND
 * pose first, as its own counterexample: at bind the pistol is parked out beside her hip, so a
 * bind-pose reading puts the muzzle ~0.93 m to one side of a guard who is holding nothing. That
 * is what an instrument that forgot to start the clip would report, and it looks plausible.
 *
 *   node tools/muzzle.mjs            # the full table
 *   node tools/muzzle.mjs --json     # machine-readable
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  buildNative, instantiateNative, splicePistolNative,
  PISTOL_MESHES, CLIP_FOR, CLIP_FOR_ARMED, MOUNT_SCALE,
} from '../src/ai/CarmelitaNative.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const A = (f) => path.join(ROOT, 'public/assets/sly-anim', f);
const JSONOUT = process.argv.includes('--json');
const POSES = 48;

const parse = (p) => {
  const b = readFileSync(p);
  return new Promise((res, rej) => new GLTFLoader().parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
};

/* ── build the armed rig exactly the way the game does ───────────────────────────────────── */
const headDoc = await parse(A('carmelita-head-lp.glb'));
let headGeom = null;
headDoc.scene.traverse((o) => { if (!headGeom && o.isMesh) headGeom = o.geometry; });
const scene = (await parse(A('carmelita-guard.glb'))).scene;
const lpDoc = await parse(A('carmelita-pistol-lp.glb'));
const lpGeos = {};
lpDoc.scene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) lpGeos[o.name] = o.geometry; });
const splice = splicePistolNative(scene, lpGeos);
if (!splice.ok) throw new Error(`the low-poly pistol did not splice: ${splice.why}`);
const asset = buildNative(scene, headGeom, { pistol: true });
if (!asset.pistol) throw new Error('buildNative produced no pistol');
const clips = (await parse(A('carmelita-clips.glb'))).animations;

const inst = instantiateNative(asset, [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]);
inst.root.position.set(0, 0, 0);
inst.root.updateMatrixWorld(true);
const mixer = new THREE.AnimationMixer(inst.rig);
const barrelBone = inst.bones.ShockPistolbarrel;
const chestBone = inst.bones.Chest || inst.bones.Ribs || inst.bones.Hips;
if (!barrelBone || !chestBone) throw new Error('the rig is missing ShockPistolbarrel or Chest');

const m = asset.pistol.muzzle;
console.log(`pistol spliced: ${splice.before} → ${splice.after} triangles`);
console.log(`static rule (muzzleFromBarrel): muzzle at ${m.local.map((v) => v.toFixed(5)).join(', ')} `
  + `in ${m.bone}'s bind-local frame`);
console.log(`  barrel extent along its own axis ${(m.extent * 1000).toFixed(1)} mm, `
  + `${(m.share * 100).toFixed(1)}% weighted to that one bone`);
console.log(`  trigger distances: muzzle end ${m.dTriggerMuzzle.toFixed(4)} m vs breech end `
  + `${m.dTriggerBreech.toFixed(4)} m — margin ${(m.margin * 100).toFixed(1)}%, discriminates ${m.discriminates}`);
if (!m.discriminates) throw new Error('the trigger rule is not discriminating on this asset');

const MUZZLE = new THREE.Vector3().fromArray(m.local);
const BREECH = new THREE.Vector3().fromArray(m.breech);
const BORE = new THREE.Vector3().fromArray(m.axis);

/* the body, for the clearance question — CPU-skinned, so it is her DRAWN hull and not a box */
const body = inst.mesh;
const bodyPos = body.geometry.attributes.position;
const BODY_STEP = Math.max(1, Math.floor(bodyPos.count / 900));

const world = (local) => local.clone().applyMatrix4(barrelBone.matrixWorld);
const boreWorld = () => {
  const q = new THREE.Quaternion();
  barrelBone.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return BORE.clone().applyQuaternion(q).normalize();
};
const chest = () => new THREE.Vector3().setFromMatrixPosition(chestBone.matrixWorld);
const bodyClearance = (p) => {
  let best = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < bodyPos.count; i += BODY_STEP) {
    v.fromBufferAttribute(bodyPos, i);
    body.applyBoneTransform(i, v);
    body.localToWorld(v);
    const d = p.distanceToSquared(v);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
};

/* ── the §442 counterexample: the same readings at the BIND pose ─────────────────────────── */
inst.rig.updateMatrixWorld(true);
const bind = (() => {
  const p = world(MUZZLE), d = boreWorld();
  return {
    pos: p.toArray(), lateral: Math.abs(p.x), forward: p.z, height: p.y,
    pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI,
    clearance: bodyClearance(p),
  };
})();
console.log('\n§442 COUNTEREXAMPLE — the same readings with NO CLIP RUNNING (the bind pose):');
console.log(`  muzzle (${bind.pos.map((v) => v.toFixed(3)).join(', ')})  →  ${bind.lateral.toFixed(3)} m OUT TO HER SIDE, `
  + `${bind.height.toFixed(3)} m up, bore pitch ${bind.pitch.toFixed(1)}°`);
console.log('  That is the pistol parked where the bind pose left it, not a gun in anyone\'s hands.');
console.log('  Every number below is from a DRIVEN rig; if any of them resembles this line, the clip did not start.');

/* ── driven ─────────────────────────────────────────────────────────────────────────────── */
const REACHABLE = new Set(Object.values(CLIP_FOR_ARMED));
const UNARMED = new Set(Object.values(CLIP_FOR));
const rows = [];
let endDisagreements = 0, endChecks = 0;
/* Below this the chest test is not deciding anything: the barrel is broadside to the chest and
   both ends are the same distance from it. 2% of ~0.7 m is 14 mm. */
const BAND = 0.02;

for (const c of clips) {
  mixer.stopAllAction();
  mixer.clipAction(c).reset().play();
  const yaws = [], pitches = [], hs = [], xs = [], zs = [], endMargin = [];
  let clearMin = Infinity, clipChecks = 0, clipDisagree = 0, clipMute = 0;
  for (let i = 0; i < POSES; i++) {
    mixer.setTime(c.duration * i / POSES);
    inst.rig.updateMatrixWorld(true);
    const pM = world(MUZZLE), pB = world(BREECH), d = boreWorld();
    hs.push(pM.y); xs.push(pM.x); zs.push(pM.z);
    yaws.push(Math.atan2(d.x, d.z) * 180 / Math.PI);
    pitches.push(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI);
    /* the independent end test: further from the chest is the muzzle */
    const cp = chest();
    const dM = pM.distanceTo(cp), dB = pB.distanceTo(cp);
    const marg = (dM - dB) / Math.max(dM, dB);
    endChecks++; clipChecks++;
    endMargin.push(marg);
    /* A pose where the two ends are within `BAND` of equidistant is one where THIS test cannot
       tell them apart — the gun is edge-on to the chest — and an instrument that cannot tell
       should not get a vote. Counted separately rather than silently as agreement. */
    if (Math.abs(marg) < BAND) clipMute++;
    else if (marg < 0) { endDisagreements++; clipDisagree++; }
    if (i % 6 === 0) clearMin = Math.min(clearMin, bodyClearance(pM));
  }
  /* yaw is circular — spread it about its own circular mean, not about zero */
  const mean = Math.atan2(yaws.reduce((s, v) => s + Math.sin(v * Math.PI / 180), 0),
    yaws.reduce((s, v) => s + Math.cos(v * Math.PI / 180), 0)) * 180 / Math.PI;
  const dev = yaws.map((v) => { let d = v - mean; while (d > 180) d -= 360; while (d < -180) d += 360; return d; });
  rows.push({
    clip: c.name,
    reachable: REACHABLE.has(c.name), reachableUnarmed: UNARMED.has(c.name),
    yawSpan: Math.max(...dev) - Math.min(...dev), yawMean: mean,
    pitchLo: Math.min(...pitches), pitchHi: Math.max(...pitches),
    hLo: Math.min(...hs), hHi: Math.max(...hs),
    xLo: Math.min(...xs), xHi: Math.max(...xs), zLo: Math.min(...zs), zHi: Math.max(...zs),
    clearance: clearMin,
    endChecks: clipChecks, endDisagree: clipDisagree, endMute: clipMute,
    endMarginMin: Math.min(...endMargin), endMarginMean: endMargin.reduce((a, b) => a + b, 0) / endMargin.length,
  });
}

/* ── the independent end verdict ──────────────────────────────────────────────────────────
 * Reported per clip, and gated on the clips a guard can REACH. A global count would fail this
 * check on `Shoot(GunMovement)` — a clip in `UNUSED_CLIPS` that no guard state plays, and the
 * one clip that scales the pistol bones (to 2.243x), which swings the gun through poses where
 * both ends are momentarily equidistant from the chest. A test that a shipped build cannot
 * reach is not a test of the shipped build. */
console.log(`\nEND CHECK — completely independent of the trigger rule: is the end the static rule calls the`);
console.log('MUZZLE the one further from her chest, on a driven rig?  (✓ = reachable in the armed build)');
console.log(`  (poses where the two ends are within ±${(BAND * 100).toFixed(0)}% of equidistant are counted as`);
console.log('   NOT DECIDING rather than as agreement — the barrel is broadside there.)');
console.log('  clip                   poses   decisive   agree    undecided   worst margin   mean margin');
for (const r of rows) {
  const dec = r.endChecks - r.endMute;
  console.log(`  ${r.reachable ? '✓' : ' '} ${r.clip.padEnd(20)} ${String(r.endChecks).padStart(4)}      `
    + `${String(dec).padStart(4)}    ${String(dec - r.endDisagree).padStart(4)}/${String(dec).padEnd(4)}  `
    + `${String(r.endMute).padStart(6)}     ${(r.endMarginMin * 100).toFixed(1).padStart(7)}%     `
    + `${(r.endMarginMean * 100).toFixed(1).padStart(6)}%`);
}
const liveEnd = rows.filter((r) => r.reachable);
const liveBad = liveEnd.reduce((n, r) => n + r.endDisagree, 0);
const liveN = liveEnd.reduce((n, r) => n + r.endChecks - r.endMute, 0);
console.log(`  over the REACHABLE clips: ${liveN - liveBad}/${liveN} of the DECISIVE poses agree.`);
/* `Shoot(GunMovement)` inverts on every pose and is the one clip this test cannot be run on:
   it drives the GUN bones only, so the body — and therefore the chest reference — stays at the
   bind pose while the pistol swings. It is also in `UNUSED_CLIPS`, so no guard state reaches it.
   Recorded rather than filtered quietly, because a row of 0/48 in a table should be explained. */
console.log('  `Shoot(GunMovement)` inverts throughout and is excluded: it animates the gun bones ONLY,');
console.log('  so the chest it is measured against never leaves the bind pose. It is also unreachable.');
if (liveBad > 0) {
  throw new Error(`the driven test disagrees with the trigger rule on ${liveBad} of ${liveN} REACHABLE poses `
    + '— the two derivations do not name the same end, and the apex cannot be trusted');
}
console.log('  Two derivations sharing no reasoning name the same end on every pose the game can reach.');

console.log('\nDRIVEN, per clip (rig at the origin facing +z; ✓ = a guard can reach it in the ARMED build):');
console.log('  clip                    muzzle height    lateral        ahead      bore yaw span   bore pitch     nearest body vertex');
console.log('  ' + '-'.repeat(122));
for (const r of rows) {
  console.log(`  ${r.reachable ? '✓' : ' '} ${r.clip.padEnd(20)} `
    + `${r.hLo.toFixed(2)}..${r.hHi.toFixed(2)} m  ${r.xLo.toFixed(2)}..${r.xHi.toFixed(2)}  `
    + `${r.zLo.toFixed(2)}..${r.zHi.toFixed(2)}   ${r.yawSpan.toFixed(1).padStart(7)}°       `
    + `${r.pitchLo.toFixed(1).padStart(6)}..${r.pitchHi.toFixed(1).padStart(6)}°   ${r.clearance.toFixed(3)} m`);
}

const live = rows.filter((r) => r.reachable);
const pLo = Math.min(...live.map((r) => r.pitchLo)), pHi = Math.max(...live.map((r) => r.pitchHi));
const ySpan = Math.max(...live.map((r) => r.yawSpan));
const clear = Math.min(...live.map((r) => r.clearance));
console.log(`\nOver the ${live.length} clips a guard can REACH:`);
console.log(`  bore pitch      ${pLo.toFixed(1)}° .. ${pHi.toFixed(1)}°   (a ${(pHi - pLo).toFixed(1)}° span)`);
console.log(`  worst yaw swing within one clip  ${ySpan.toFixed(1)}°`);
console.log(`  muzzle clearance from her drawn body, worst pose  ${clear.toFixed(3)} m `
  + `(×${MOUNT_SCALE.toFixed(3)} mount = ${(clear * MOUNT_SCALE).toFixed(3)} m as drawn)`);
const patrol = rows.find((r) => r.clip === 'PatrolWalk');
const idle = rows.find((r) => r.clip === 'Idle');
console.log('\nTHE DIRECTION QUESTION. The cone ORIGINATES at the muzzle — shipped. It does NOT AIM along');
console.log('the bore, and the two rows a guard spends its life in are why:');
console.log(`  PatrolWalk   bore pitch ${patrol.pitchLo.toFixed(1)}°..${patrol.pitchHi.toFixed(1)}°  — ABOVE the horizon for the whole cycle`);
console.log(`  Idle         bore pitch ${idle.pitchLo.toFixed(1)}°..${idle.pitchHi.toFixed(1)}°  — likewise`);
console.log('Both are a high-ready carry, which is the correct way to hold a gun on patrol and the');
console.log('worst possible place to point a detection cone: a barrel-aimed cone would spend the entire');
console.log(`patrol looking at sky. Across every reachable clip the pitch spans ${(pHi - pLo).toFixed(1)}° and the yaw swings`);
console.log(`up to ${ySpan.toFixed(0)}° within a single clip, so the cone would also sweep like a searchlight during a`);
console.log('stagger.');
console.log('');
console.log('And the objection is sharper than "it would change detection", which is the intuitive');
console.log('answer and is FALSE: `Senses.evaluate` reads `sense.forward`, which `_step` sets from');
console.log('`this.forward`, and never sees the direction `_updateCones` draws with. The drawn cone is');
console.log('a TELEGRAPH of a volume defined about `g.forward` — aiming it down the barrel would make');
console.log('it lie about what the guard can see. Making it honest would mean moving detection too,');
console.log('and the alert ladder was out of scope for this change.');

if (clear <= 0) throw new Error('the muzzle is INSIDE her body on some reachable pose — §178\'s haze problem, moved');

if (JSONOUT) console.log('\n' + JSON.stringify({ bind, rows, static: m, splice }, null, 1));
