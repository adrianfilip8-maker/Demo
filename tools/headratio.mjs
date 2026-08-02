/**
 * THE BINDING INSTRUMENT for AGENTS.md §7.3's head:body condition. Promoted from scratch into
 * `tools/` because §7.3 cites it by path and a checklist that names an unreproducible tool is a
 * checklist item nobody can score (KNOWN_ISSUES §66.2). Do not move it back.
 *
 * If you want a different head:body number, change §7.3's DEFINITION first and this tool second.
 * `tools/propprobe.mjs` prints a different ratio from a different chin and crown; it is a
 * diagnostic breakdown and is NOT this measure — see the header it now carries.
 *
 * The head:body number §58.3 says does not exist yet: total standing height ÷ head height where
 * head height is CHIN → TOP OF CRANIUM, excluding the cap and the ear tips.
 *
 * Why this measure and not the two already published. `shotsil`'s `headH` is
 * `max(y over head-cluster bones) − chin`, and that cluster contains `capBrim`, `earL` and
 * `earR` — so it measures chin to the top of whichever of {cap crown, ear tip} is highest, which
 * inflates the head and DEFLATES the ratio (4.14 / 4.44). Its `skullH` is a span read off the
 * `SlyModel.HEAD` profile table, which is narrower than the rendered skull and INFLATES the ratio
 * (5.79 / 6.73). §7.3's "~1:5" sits between them, which is exactly why the condition is currently
 * unscoreable: the two instruments bracket the target instead of testing it.
 *
 * Animation convention is chin to the top of the cranium with headwear and ears excluded, so that
 * is what this computes, off the SKINNED vertices in a named pose.
 *
 * WHAT THIS IS, AS THE GAP (§11): authored mesh, authored clip pose, no foot IK, no projection,
 * no ink hull. Head:body is a rig property, so none of those apply to it — but `total` here is the
 * skinned vertical extent of the AUTHORED pose, so for a crouch (`perch_idle`) it is the crouched
 * height and NOT a stature. Read the standing pose for the §7.3 number.
 */
import * as THREE from 'three';

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};

const { SlyModel, TUNE } = await import('/home/user/Demo/src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('/home/user/Demo/src/player/Clips.js');
const { PoseBuffer } = await import('/home/user/Demo/src/player/Rig.js');

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', warnings); process.exit(1); }

const poseBuf = new PoseBuffer(sly.boneNames);
function applyClip(name) {
  const clip = CLIPS[name];
  if (!clip) return false;
  poseBuf.clear();
  sampleInto(clip, clip.hold ?? 0, poseBuf, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (poseBuf.w[n] > 0) b.quaternion.copy(poseBuf.q[n]); else b.quaternion.identity();
    if (poseBuf.sw[n] > 0) b.scale.copy(poseBuf.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + poseBuf.pos.x, base.y + poseBuf.pos.y, base.z + poseBuf.pos.z);
  sly.root.updateMatrixWorld(true);
  sly.skeleton.update();
  return true;
}

const g = sly.mesh.geometry;
const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
const bi = {}; sly.mesh.skeleton.bones.forEach((b, i) => { bi[b.name] = i; });

// Material group per vertex, via the index buffer. PART_COL (tools/shotsil.mjs:160): group 3 is
// the cap crown, group 4 the cap hem + bill. Those two are the headwear we must exclude.
const groupOf = new Int8Array(pos.count).fill(-1);
const idx = g.index;
for (const grp of g.groups) {
  for (let k = grp.start; k < grp.start + grp.count; k++) {
    const v = idx ? idx.getX(k) : k;
    if (v < pos.count) groupOf[v] = grp.materialIndex;
  }
}
const CAP_GROUPS = new Set([3, 4]);
const EAR = new Set(['earL', 'earR'].map((n) => bi[n]));
const CRANIUM = new Set(['head', 'browL', 'browR'].map((n) => bi[n]).filter((v) => v !== undefined));
const JAW = bi.jaw;

const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };

function skinAll() {
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), t = new THREE.Vector3(), m = new THREE.Matrix4();
  for (let i = 0; i < pos.count; i++) {
    t.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (!w) continue;
      const b = si.getComponent(i, k);
      m.multiplyMatrices(bones[b].matrixWorld, inv[b]);
      v.fromBufferAttribute(pos, i).applyMatrix4(m).multiplyScalar(w);
      t.add(v);
    }
    out[i * 3] = t.x; out[i * 3 + 1] = t.y; out[i * 3 + 2] = t.z;
  }
  return out;
}

/* §7.3 names `idle_confident`, so that is the default. Printing nothing and exiting 0 on no
   arguments — which this did — is the silent-success failure mode of §59.1: a tool that says
   nothing looks exactly like a tool that found nothing wrong. */
const CLIPS_ARG = process.argv.slice(2);
if (!CLIPS_ARG.length) console.log('(no clip given — defaulting to idle_confident, the clip §7.3 names)\n');
for (const clip of (CLIPS_ARG.length ? CLIPS_ARG : ['idle_confident'])) {
  if (!applyClip(clip)) { console.log(`${clip}: NO SUCH CLIP`); continue; }
  const V = skinAll();
  let allMin = 1e9, allMax = -1e9;
  let cranMax = -1e9, chin = 1e9, capMax = -1e9, earMax = -1e9;
  let nCran = 0, nJaw = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = V[i * 3 + 1];
    if (y < allMin) allMin = y; if (y > allMax) allMax = y;
    const d = dominant(i), grp = groupOf[i];
    if (CAP_GROUPS.has(grp)) { if (y > capMax) capMax = y; continue; }   // headwear excluded
    if (EAR.has(d)) { if (y > earMax) earMax = y; continue; }            // ears excluded
    if (CRANIUM.has(d)) { if (y > cranMax) cranMax = y; nCran++; }
    if (d === JAW) { if (y < chin) chin = y; nJaw++; }
  }
  const total = allMax - allMin;
  const headH = cranMax - chin;
  console.log(`=== ${clip} ===`);
  console.log(`  total skinned height      ${total.toFixed(4)} m   (authored pose; a crouch is not a stature)`);
  console.log(`  chin y ${chin.toFixed(4)} (n=${nJaw})   cranium top y ${cranMax.toFixed(4)} (n=${nCran})`);
  console.log(`  HEAD HEIGHT chin->cranium ${headH.toFixed(4)} m   [cap top ${capMax.toFixed(4)}  ear top ${earMax.toFixed(4)} — both EXCLUDED]`);
  console.log(`  >>> HEAD:BODY = ${(total / headH).toFixed(2)} heads   (cap+ears excluded, chin to cranium)`);
  console.log(`      for contrast: incl. cap/ears ${(total / (Math.max(capMax, earMax, cranMax) - chin)).toFixed(2)} heads`);
  console.log('');
}
