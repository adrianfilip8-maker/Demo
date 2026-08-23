#!/usr/bin/env node
/**
 * camdot.mjs — refuse to photograph from a camera that is standing inside something (§604).
 *
 * Two frames in this project have now been shot from cameras that could not see their subject,
 * and in both cases the measurement that would have caught it already existed:
 *
 *   §601  the mouth camera was re-aimed west to escape a prop pile, the PROP census was re-run at
 *         the new position and came back clean, and the frame arrived with the hall's own west
 *         wall 0.48 m off the lens. One occluder fixed, only that occluder re-measured.
 *   §603  `eye-address` was sited 3 m back on the x -21.0 line. §603's own falloff table marks
 *         that exact stance "eye INSIDE the KayKit crate pile" one row above where the camera was
 *         put. The frame came back as a flat blue-grey field: the inside of a crate.
 *
 * So this is a pre-flight, not a post-mortem. It builds the level in Node WITH KayKit booted —
 * `tests/_moveset.mjs`'s `realWorld()` does not boot props, which is the hole §601 fell through —
 * and answers four questions about a camera before a browser is ever launched:
 *
 *   ENCLOSED  of 26 rays cast in every axis and diagonal direction, how many hit something within
 *             0.6 m. A camera inside a prop hits in nearly every direction; one standing in a room
 *             hits in a few. This is the check that catches "inside a crate".
 *   NEAREST   the closest surface in any direction. A lens buried in a wall reads here even when
 *             the camera is not enclosed — §601's failure, which was 0.48 m.
 *   FORWARD   the distance to the first surface along the look direction. A camera facing into a
 *             wall 0.4 m away has a clear near field behind it and is still useless.
 *   SUBJECT   whether that first hit is NEARER than the look target itself. This is the one that
 *             catches §603's other miss: `eye-approach` stood 7.0 m from its subject with a prop
 *             2.47 m in front of it and passed all three checks above. A clean near field says
 *             nothing about whether the frame will contain what it was aimed at.
 *
 * `node tools/camdot.mjs -21.5 1.6 -42.7 -21.5 0.15 -49.6` checks one camera from the CLI.
 * `ventshot.mjs` imports `camDot` and refuses a frame that fails, unless CAMDOT=0.
 */
import * as THREE from 'three';

let _scene = null;

/** Boot the level once per process, with props, and keep the drawn meshes. */
export async function drawnScene() {
  if (_scene) return _scene;
  const { bootKayKit } = await import('../tests/_kaykitboot.mjs');
  const { engine } = await bootKayKit({ withLevel: true });
  engine.scene.updateMatrixWorld(true);
  const meshes = [];
  engine.scene.traverse((o) => {
    if (!o.isMesh || o.userData?.collisionProxy) return;
    let p = o, vis = true;
    while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
    if (vis) meshes.push(o);
  });
  _scene = { engine, meshes };
  return _scene;
}

/** The 26 directions: 6 axes, 12 edges, 8 corners. */
const DIRS = [];
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
    }
  }
}

/**
 * @param {number[]} pos    camera position
 * @param {number[]} look   look-at target
 * @param {object}  [opts]  { enclosedAt = 0.6, minNearest = 0.35, minForward = 1.0, enclosedFrac = 0.7 }
 */
export async function camDot(pos, look, opts = {}) {
  const { enclosedAt = 0.6, minNearest = 0.35, minForward = 1.0, enclosedFrac = 0.7 } = opts;
  const { meshes } = await drawnScene();
  const P = new THREE.Vector3(...pos);
  const rc = new THREE.Raycaster();
  rc.near = 0.001;

  let near = 0, nearest = Infinity;
  for (const d of DIRS) {
    rc.set(P, d); rc.far = 60;
    const h = rc.intersectObjects(meshes, false);
    if (!h.length) continue;
    if (h[0].distance < enclosedAt) near++;
    if (h[0].distance < nearest) nearest = h[0].distance;
  }
  const fwd = new THREE.Vector3(...look).sub(P).normalize();
  rc.set(P, fwd); rc.far = 200;
  const fh = rc.intersectObjects(meshes, false);
  const forward = fh.length ? fh[0].distance : Infinity;
  const forwardName = fh.length ? (fh[0].object.name || 'unnamed') : 'sky';

  /* The check that actually earns this file's keep. The first three ask whether the camera is in
     a bad place; this one asks whether it can SEE WHAT IT IS AIMED AT, by comparing the first hit
     along the look direction against the distance to the look target itself. Something standing
     between the two means the frame will not show its subject however clean the near field is.
     Tuned on a real miss: §603's `eye-approach` sat 7.0 m from its target with `kaykit:props`
     2.47 m in front of it, and the first three checks all passed it — nearest 1.62 m, nothing
     enclosing, no wall in the lens. Only this one calls it. */
  const targetLen = new THREE.Vector3(...look).distanceTo(P);
  const subjectBlocked = forward < targetLen - 0.30;

  const enclosed = near / DIRS.length >= enclosedFrac;
  const reasons = [];
  if (enclosed) reasons.push(`ENCLOSED: ${near}/${DIRS.length} directions hit inside ${enclosedAt} m — the camera is inside something`);
  if (nearest < minNearest) reasons.push(`BURIED: nearest surface ${nearest.toFixed(2)} m (< ${minNearest})`);
  if (forward < minForward) reasons.push(`FACING A WALL: first hit along the look direction is ${forward.toFixed(2)} m away (${forwardName})`);
  if (subjectBlocked) reasons.push(`SUBJECT OCCLUDED: the look target is ${targetLen.toFixed(2)} m away but `
    + `${forwardName} stands at ${forward.toFixed(2)} m`);

  return {
    ok: reasons.length === 0, reasons,
    near, dirs: DIRS.length,
    nearest: nearest === Infinity ? null : +nearest.toFixed(3),
    forward: forward === Infinity ? null : +forward.toFixed(3),
    forwardName, targetLen: +targetLen.toFixed(3), subjectBlocked,
  };
}

/* ---- CLI ---- */
if (process.argv[1] && process.argv[1].endsWith('camdot.mjs')) {
  const a = process.argv.slice(2).map(Number);
  if (a.length < 6 || a.some(Number.isNaN)) {
    console.error('usage: node tools/camdot.mjs px py pz lx ly lz');
    process.exit(2);
  }
  const r = await camDot(a.slice(0, 3), a.slice(3, 6));
  console.log(`\n  camera (${a.slice(0, 3).join(', ')}) -> (${a.slice(3, 6).join(', ')})`);
  console.log(`  enclosed ${r.near}/${r.dirs}   nearest ${r.nearest} m   forward ${r.forward} m (${r.forwardName})   subject at ${r.targetLen} m`);
  console.log(r.ok ? '  VERDICT: ok\n' : `  VERDICT: REFUSE\n    - ${r.reasons.join('\n    - ')}\n`);
  process.exit(r.ok ? 0 : 1);
}
