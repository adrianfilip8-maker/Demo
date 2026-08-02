/**
 * !! THE RATIOS THIS PRINTS ARE **NOT** AGENTS.md §7.3's BINDING head:body MEASURE. !!
 *
 * §7.3 defines head:body as chin -> TOP OF CRANIUM with cap AND ears excluded, and the binding
 * instrument is `tools/headratio.mjs`. On the same rig that reads **5.72 heads (FAILING)**.
 * This file prints **1 : 3.98**, which is inside §7.3's 4.5-5.5 pass band — so quoting it reads
 * as a PASS on a condition that is failing by 0.72 heads. That is why this warning exists.
 *
 * The two disagree because they are different measurements, not because either is wrong:
 *   - `chin` here is the LOWEST vertex over the whole head cluster, and that cluster includes
 *     `capBrim`, `earL` and `earR` — so the cap's brim edge and the ear bottoms drag it down to
 *     1.315, against headratio's jaw-only 1.3774.
 *   - `skull crown` here excludes cap and ears BY BONE, but cap crown geometry weighted to `head`
 *     still counts, giving 1.762 against headratio's material-group-excluded cranium at 1.6875.
 * Net: a taller head over the same figure, hence a smaller ratio.
 *
 * Keep this file — the limb fractions, ground contact and cap-share breakdown are useful and are
 * not published anywhere else. Just do not quote its head:body against §7.3. See KNOWN_ISSUES
 * §58.3 (four numbers, one figure), §65.4 (the definition landing) and §66.2 (this hazard).
 *
 * Head:body ratio, limb fractions and per-clip ground contact — the numbers behind §7.3's
 * proportion condition, measured off the built mesh in a named pose.
 *
 * Why it exists: `shotsil.mjs` prints a head count for whichever shot it renders first, and a
 * head count without a pose attached is meaningless (the same mesh measures 3.37 heads standing
 * and 2.68 crouched). This reports the standing figure by default, states the pose it used, and
 * separates the three quantities people conflate — chin→crown, chin→cap-crown, and the whole
 * figure — by *material group*, so the cap's contribution is visible rather than assumed.
 *
 * It also sweeps every clip for the lowest vertex in the mesh, which is the check that a rig
 * proportion change has to pass: a longer leg with the same knee angles puts feet through the
 * floor, and nothing in the harness reports that.
 *
 *   node tools/propprobe.mjs [clip]        · node tools/propprobe.mjs --clips
 */
import * as THREE from 'three';

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, CLIP_NAMES, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const sly = new SlyModel(engine);
await sly.init();
if (!sly.mesh) { console.error('BUILD FAILED', warnings); process.exit(1); }

const geo = sly.mesh.geometry;
const pb = new PoseBuffer(sly.boneNames);
const _sv = new THREE.Vector3(), _st = new THREE.Vector3(), _sm = new THREE.Matrix4();

function pose(name, t) {
  const clip = CLIPS[name];
  pb.clear();
  sampleInto(clip, t ?? clip.hold ?? 0, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n];
    if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  sly.skeleton.update();
}

function skin() {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _st.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w === 0) continue;
      _sm.multiplyMatrices(bones[si.getComponent(i, k)].matrixWorld, inv[si.getComponent(i, k)]);
      _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
      _st.addScaledVector(_sv, w);
    }
    out[i * 3] = _st.x; out[i * 3 + 1] = _st.y; out[i * 3 + 2] = _st.z;
  }
  return out;
}

/* Material index → group name, so "how much of the head is hat" is measured, not guessed. */
const GNAME = sly.mesh.material.map((m) => m.name || '');
const groupOfVert = new Int8Array(geo.attributes.position.count).fill(-1);
for (const g of geo.groups) {
  for (let k = g.start; k < g.start + g.count; k++) groupOfVert[geo.index.array[k]] = g.materialIndex;
}

if (process.argv.includes('--clips')) {
  const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
  console.log('clip                 lowestY   (sole plane is 0; negative = through the floor)');
  const bad = [];
  for (const n of CLIP_NAMES) {
    pose(n);
    const v = skin();
    let lo = 1e9;
    for (let i = 0; i < v.length; i += 3) if (v[i + 1] < lo) lo = v[i + 1];
    const flag = lo < -0.06 ? '  ** sunk' : lo > 0.10 ? '  ** floating' : '';
    console.log(`${n.padEnd(20)} ${lo.toFixed(3).padStart(7)}${flag}`);
    if (flag) bad.push(n);
  }
  console.log(`\n${bad.length} clip(s) outside [-0.06, 0.10]: ${bad.join(' ') || 'none'}`);
  process.exit(0);
}

const clipName = process.argv[2] || 'idle_confident';
pose(clipName);
const V = skin();

const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const dominant = (i) => { let b = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } } return b; };
const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]));

let figTop = -1e9, figLow = 1e9, chin = 1e9, skullTop = -1e9, capTop = -1e9, earTop = -1e9;
const CAP = GNAME.indexOf('cloth') >= 0 ? null : null;   // group names are not set; use bones
for (let i = 0; i < geo.attributes.position.count; i++) {
  const y = V[i * 3 + 1];
  if (y < figLow) figLow = y;
  if (y > figTop) figTop = y;
  const d = dominant(i);
  if (!HEADB.has(d)) continue;
  if (y < chin) chin = y;
  if (d === bi.capBrim) { if (y > capTop) capTop = y; continue; }
  if (d === bi.earL || d === bi.earR) { if (y > earTop) earTop = y; continue; }
  if (y > skullTop) skullTop = y;
}
const total = figTop - figLow;
const skull = skullTop - chin;
const withCap = Math.max(skullTop, capTop) - chin;

const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);
const hip = at('hips'), ank = at('footL'), sh = at('shoulderL'), hand = at('handL');

console.log(`pose ${clipName}`);
console.log(`  figure            ${figLow.toFixed(3)} … ${figTop.toFixed(3)}  =  ${total.toFixed(3)} m`);
console.log(`  chin              ${chin.toFixed(3)}`);
console.log('  NOTE: the two ratios below are NOT §7.3\'s binding measure — run tools/headratio.mjs.');
console.log(`  skull crown       ${skullTop.toFixed(3)}   head ${skull.toFixed(3)} m  ⇒  1 : ${(total / skull).toFixed(2)}  [diagnostic, not §7.3]`);
console.log(`  cap crown         ${capTop.toFixed(3)}   head+cap ${withCap.toFixed(3)} m  ⇒  1 : ${(total / withCap).toFixed(2)}`);
console.log(`  ear tip           ${earTop.toFixed(3)}`);
console.log(`  cap adds          ${(Math.max(0, capTop - skullTop)).toFixed(3)} m above the crown (${(100 * Math.max(0, capTop - skullTop) / skull).toFixed(0)}% of head height)`);
console.log(`  hip height        ${hip.y.toFixed(3)}   leg (hip→ankle) ${(hip.y - ank.y).toFixed(3)} m = ${(100 * (hip.y - ank.y) / total).toFixed(1)}% of figure`);
console.log(`  arm (sh→hand)     ${sh.distanceTo(hand).toFixed(3)} m = ${(100 * sh.distanceTo(hand) / total).toFixed(1)}% of figure`);
if (warnings.length) console.log('warnings:', warnings);
