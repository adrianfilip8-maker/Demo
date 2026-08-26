#!/usr/bin/env node
/**
 * carmnative.mjs — what the NATIVE import actually produces, measured. §704.
 *
 *   node tools/carmnative.mjs             # the full report
 *   node tools/carmnative.mjs --scale     # just re-derive MOUNT_SCALE and check it has not drifted
 *
 * Reads only committed assets. No fetch, no lock, no browser, no renderer.
 *
 * ── what this answers, and why each needs an instrument rather than an argument ──────────────
 *
 *  1. **What the build kept, cut, and by what rule** — and the head fiducial in both directions,
 *     because a gate that has only ever been seen to pass is not known to be a gate.
 *
 *  2. **Does §309's skinIndex off-by-one survive?** Reports the max `skinIndex` against the bone
 *     count — and then does the discriminating thing, because that number cannot answer it.
 *
 *     The arm this section had FIRST was: CPU-skin the BIND pose with the indices shifted 0 / +1 /
 *     −1 and see which returns the geometry unmoved. It measured 1.845e-6 / 1.855e-6 / 1.879e-6 —
 *     all three zero, and zero for a reason with nothing to do with the indices: at the rest pose
 *     every bone's skinning matrix is the identity, so reading the wrong bone reads another
 *     identity. That instrument shared the assumption it was testing (§439/§440) and could not
 *     have produced a different answer for a broken file.
 *
 *     What replaced it: pose the skeleton off a real clip, and compare against GROUND TRUTH FROM A
 *     DIFFERENT OBJECT — the source `SkinnedMesh` in the GLB, skinned by its own skeleton, which
 *     owes nothing to anything this import did. `applyBoneTransform` is the GLSL `skinning_vertex`
 *     chunk verbatim and OVERWRITES the vector it is handed; `guardfloat.mjs` records the 1e+189
 *     that seeding it wrong produces, and it is seeded on both sides here.
 *
 *  3. **The scale and the ground numbers**, both arms side by side, from the same measurement.
 *
 *  4. **The bone cost**, in both units that matter: nine skeletons' worth of bone matrices and
 *     bone texture, and — the half that could actually stop this shipping — the per-frame UPDATE
 *     TIME of nine 199-bone mixers against nine 25-bone `GuardAnim`s, each stepped through its own
 *     shipped update path. The two arms are interleaved over three passes and every run is
 *     printed, because a drift that lands entirely on whichever arm ran second is an instrument
 *     rather than a result (§439), and quoting only the flattering run is §703.2.
 *
 * ── §442, in a tool that reads two files that look alike ────────────────────────────────────
 * `carmelita-anims.glb` and `carmelita-guard.glb` are the same rig and differ only in what was cut
 * out of each. Every figure below names which file it came from, because "a measurement correctly
 * performed on the wrong subject" is exactly the failure this pair invites.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildNative, instantiateNative, headFiducial, spliceHeadNative, CarmelitaNativeAnim, MOUNT_SCALE, CLIP_FOR, UNUSED_CLIPS, CARMELITA_CLIPS_ASSET } from '../src/ai/CarmelitaNative.js';
import { bindToRig3, spliceHead } from '../src/ai/CarmelitaGuard.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const ONLY_SCALE = argv.includes('--scale');
const A = (p) => path.join(ROOT, 'public/assets/sly-anim', p);

async function load(f) {
  if (!existsSync(f)) throw new Error(`missing ${f}`);
  const buf = readFileSync(f);
  const g = await new Promise((res, rej) => new GLTFLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
  g.scene.updateMatrixWorld(true);
  return g;
}
const headGeomFrom = (g) => { let h = null; g.scene.traverse((o) => { if (!h && o.isMesh) h = o.geometry; }); return h; };

/* ── build both arms from the SAME source file, so the comparison is of the paths ───────────── */
const guardA = await load(A('carmelita-guard.glb'));      // for the native arm
const guardB = await load(A('carmelita-guard.glb'));      // for the rebind arm (bindToRig3 mutates)
const headG = await load(A('carmelita-head-lp.glb'));

const native = buildNative(guardA.scene, headGeomFrom(headG));
const rebindSplice = spliceHead(guardB.scene, headGeomFrom(await load(A('carmelita-head-lp.glb'))));
const rebind = bindToRig3(guardB.scene);

const hN = native.height, hR = (() => {
  rebind.geometry.computeBoundingBox();
  const b = rebind.geometry.boundingBox;
  return b.max.y - b.min.y;
})();
const derived = hR / hN;

if (ONLY_SCALE) {
  console.log(`rebind bind-pose height ${hR.toFixed(5)} m / native ${hN.toFixed(5)} m = ${derived.toFixed(6)}`);
  console.log(`MOUNT_SCALE in src/ai/CarmelitaNative.js = ${MOUNT_SCALE}`);
  const drift = Math.abs(derived - MOUNT_SCALE);
  console.log(drift <= 5e-5 ? `OK — drift ${drift.toExponential(2)}` : `DRIFTED by ${drift.toExponential(2)} — re-derive it`);
  process.exit(drift <= 5e-5 ? 0 : 1);
}

console.log('══ 1. what the native build kept and cut (carmelita-guard.glb) ══');
const s = native.stats;
console.log(`  source skinned meshes ${s.meshes}   kept ${s.kept}   merged groups ${s.groups} (body ${s.bodyMeshes}, head ${s.headMeshes})`);
console.log(`  rule: ${s.propRule}`);
console.log(`  body armature roots (measured, not named): ${s.bodyRoots.join(', ')}`);
console.log(`  dropped as prop    : ${s.droppedProps.join(', ') || '(none)'}`);
console.log(`  dropped as interior: ${s.droppedInterior.join(', ') || '(none)'}`);
console.log(`  head splice: ${JSON.stringify({ ok: s.head?.ok, before: s.head?.before, after: s.head?.after, worst: s.head?.fiducial?.worst })}`);

console.log('\n══ 2. the head fiducial, both directions (§418.3) ══');
{
  const g2 = await load(A('carmelita-guard.glb'));
  let stub = null, hair = null;
  g2.scene.traverse((o) => { if (o.name === 'Head_LP') stub = o.geometry; if (o.name === 'Hair_LP') hair = o.geometry; });
  const good = headFiducial(stub, headGeomFrom(await load(A('carmelita-head-lp.glb'))));
  const bad = headFiducial(stub, hair);
  console.log(`  PASSES on the recovered head : worst ${good.worst.toExponential(3)} m over ${good.n} vertices → ok=${good.ok}`);
  console.log(`  FAILS  on Hair_LP substituted: worst ${bad.worst.toExponential(3)} m over ${bad.n} vertices → ok=${bad.ok}`);
}

console.log('\n══ 3. scale and ground ══');
console.log(`  rebind (RIG3)  bind-pose height ${hR.toFixed(4)} m   lowest vertex ${rebind.geometry.boundingBox.min.y.toFixed(6)}   soleLift ${rebind.stats.soleLift}`);
console.log(`  native (hers)  bind-pose height ${hN.toFixed(4)} m   lowest vertex ${native.geometry.boundingBox.min.y.toFixed(6)}   soleLift ${s.soleLift}`);
console.log(`  MOUNT_SCALE ${MOUNT_SCALE}  (derived ${derived.toFixed(6)}; drift ${Math.abs(derived - MOUNT_SCALE).toExponential(2)})`);
console.log(`  native × MOUNT_SCALE = ${(hN * MOUNT_SCALE).toFixed(4)} m  against the rebind's ${hR.toFixed(4)} m`);
{
  const bbN = native.geometry.boundingBox, bbR = rebind.geometry.boundingBox;
  console.log(`  bind-pose WIDTH  native ${((bbN.max.x - bbN.min.x) * MOUNT_SCALE).toFixed(4)} m (scaled)  vs rebind ${(bbR.max.x - bbR.min.x).toFixed(4)} m`);
  console.log(`     — narrower is her authored proportion; the rebind splayed the arms to reach RIG3's bind.`);
}

console.log('\n══ 4. triangles and draws ══');
console.log(`  native ${native.tris} tris in ${native.geometry.groups.length} group(s)`);
console.log(`  rebind ${rebind.tris} tris in ${rebind.geometry.groups.length} group(s)`);
console.log(`  Δ ${native.tris - rebind.tris} triangles per guard, ${(native.tris - rebind.tris) * 9} over the garrison of nine`);
console.log(`  draws per guard = groups = ${native.geometry.groups.length}; a per-mesh import would have been ${s.kept}`);
console.log(`  garrison: ${native.geometry.groups.length * 9} draws merged vs ${s.kept * 9} unmerged`);

console.log('\n══ 5. §309 — does the skinIndex off-by-one survive the native path? ══');
console.log(`  max skinIndex written ${s.maxSkinIndex}, bones ${s.bones} → in range: ${s.maxSkinIndex < s.bones}`);
console.log(`  bone order is the source's own, unprepended: [0]=${native.boneOrder[0]} … [${s.bones - 1}]=${native.boneOrder[s.bones - 1]}`);
{
  /* ── the instrument this section had first, and why it could not answer ────────────────────
     The obvious arm — CPU-skin the BIND pose with the indices shifted 0 / +1 / −1 and see which
     returns the geometry unmoved — measured 1.845e-6 / 1.855e-6 / 1.879e-6. All three are zero,
     and they are zero for a reason that has nothing to do with the indices: at the rest pose
     EVERY bone's skinning matrix is the identity, so reading the wrong bone reads another
     identity. The instrument shared the assumption it was testing (§439/§440) and could not have
     produced a different answer for a broken file.

     What discriminates: pose the skeleton, and compare against GROUND TRUTH FROM A DIFFERENT
     OBJECT — the source `SkinnedMesh` in the GLB, skinned by its own skeleton, which is the
     artist's file and owes nothing to anything this import did. `regions` maps each merged
     vertex range back to the source mesh it came from in order, so the correspondence is exact
     by construction rather than by search.

     `applyBoneTransform` is the GLSL `skinning_vertex` chunk verbatim and OVERWRITES the vector
     it is handed — `guardfloat.mjs` records the 1e+189 that seeding it wrong produces. It is
     seeded with the vertex on both sides. */
  const mat = new THREE.MeshBasicMaterial();
  const rig = instantiateNative(native, [mat, mat], { scale: 1 });

  const srcScene = await load(A('carmelita-guard.glb'));
  /* The merged buffer's `Head_LP` region is the RECOVERED 5,000-triangle face, so the source side
     has to carry it too or the two sides are comparing different meshes — 15,000 vertices against
     3,040, which is not a subtle disagreement but an index out of range. Splicing it here keeps
     every region in the comparison instead of excusing one. */
  spliceHeadNative(srcScene.scene, headGeomFrom(await load(A('carmelita-head-lp.glb'))));
  srcScene.scene.updateMatrixWorld(true);
  const srcMeshes = new Map();
  srcScene.scene.traverse((o) => { if (o.isSkinnedMesh) srcMeshes.set(o.name, o); });
  const srcSkel = [...srcMeshes.values()][0].skeleton;

  /* Pose BOTH skeletons identically, off a real clip so the pose is one the character actually
     reaches. Same clip, same time, same bone names — written by name, so the two orders cannot
     silently disagree. */
  const cg = await load(A('carmelita-clips.glb'));
  const clip = cg.animations.find((c) => c.name === 'PatrolWalk');
  const T = 0.37;
  const byName = new Map(rig.boneList.map((b) => [b.name, b]));
  const srcByName = new Map(srcSkel.bones.map((b) => [b.name, b]));
  let posed = 0;
  for (const t of clip.tracks) {
    const [node, prop] = [t.name.split('.')[0], t.name.split('.').slice(1).join('.')];
    const a = byName.get(node), b = srcByName.get(node);
    if (!a || !b) continue;
    const stride = prop === 'quaternion' ? 4 : 3;
    let k = 0; while (k < t.times.length - 1 && t.times[k + 1] <= T) k++;
    const off = k * stride;
    if (prop === 'position') { a.position.fromArray(t.values, off); b.position.fromArray(t.values, off); posed++; }
    else if (prop === 'quaternion') { a.quaternion.fromArray(t.values, off); b.quaternion.fromArray(t.values, off); posed++; }
    else if (prop === 'scale') { a.scale.fromArray(t.values, off); b.scale.fromArray(t.values, off); posed++; }
  }
  rig.root.updateMatrixWorld(true);
  srcScene.scene.updateMatrixWorld(true);
  console.log(`  posed both skeletons from PatrolWalk @ ${T}s — ${posed} channels written to each`);

  const geo = rig.mesh.geometry;
  const pos = geo.getAttribute('position');
  const si = geo.getAttribute('skinIndex');
  const orig = si.array.slice();
  const v = new THREE.Vector3(), mine = new THREE.Vector3(), theirs = new THREE.Vector3();

  /* Sample every region, so a defect confined to one body part cannot average away. */
  const arm = (shift) => {
    for (let i = 0; i < si.array.length; i++) {
      const n = orig[i] + shift;
      si.array[i] = n < 0 ? 0 : (n >= s.bones ? s.bones - 1 : n);
    }
    si.needsUpdate = true;
    let worst = 0, n = 0;
    for (const r of native.regions) {
      const src = srcMeshes.get(r.name);
      if (!src) continue;
      const sp = src.geometry.getAttribute('position');
      for (let j = 0; j < r.count; j += 5) {
        const mi = r.start + j;
        mine.fromBufferAttribute(pos, mi);
        /* Undo the base-origin lift BEFORE skinning. Undoing it after is wrong and was wrong
           here first: the lift lives in the bind pose, so a rotated bone carries it off the y
           axis and a post-hoc `mine.y -= lift` leaves up to 2× it behind — 0.449 mm of apparent
           disagreement from a 0.237 mm translation, which is most of a fictitious defect. */
        mine.y -= native.soleLift;
        rig.mesh.applyBoneTransform(mi, mine);
        theirs.fromBufferAttribute(sp, j);
        v.copy(theirs);
        src.applyBoneTransform(j, theirs);
        worst = Math.max(worst, mine.distanceTo(theirs));
        n++;
      }
    }
    return { worst, n };
  };
  const a0 = arm(0), ap = arm(+1), am = arm(-1);
  for (let i = 0; i < si.array.length; i++) si.array[i] = orig[i];
  si.needsUpdate = true;
  console.log(`  vs the SOURCE SkinnedMesh at the same pose, largest disagreement over ${a0.n} sampled vertices:`);
  console.log(`    shift  0 (as shipped): ${a0.worst.toExponential(3)} m   ← must be ~0`);
  console.log(`    shift +1             : ${ap.worst.toExponential(3)} m   ← must NOT be 0`);
  console.log(`    shift -1             : ${am.worst.toExponential(3)} m   ← must NOT be 0`);
  const decided = a0.worst < 1e-5 && ap.worst > 1e-3 && am.worst > 1e-3;
  console.log(`  => ${decided ? "the shipped indices reproduce the artist's file EXACTLY; §309's off-by-one is ABSENT from the native path" : 'NOT discriminated by this arm'}`);
}

console.log('\n══ 6. bone cost, nine guards ══');
{
  const nB = s.bones, nR = rebind.stats.bones;
  const tex = (n) => { let sz = Math.sqrt(n * 4); sz = Math.ceil(sz / 4) * 4; sz = Math.max(sz, 4); return sz; };
  const fmt = (n) => `${n} bones → matrices ${n * 16 * 4} B, bone texture ${tex(n)}×${tex(n)} RGBA32F = ${tex(n) * tex(n) * 16} B`;
  console.log(`  native  ${fmt(nB)}`);
  console.log(`  rebind  ${fmt(nR)}`);
  const per = (n) => n * 16 * 4 + tex(n) * tex(n) * 16;
  console.log(`  per guard: native ${per(nB)} B vs rebind ${per(nR)} B  → ×9 = ${(per(nB) * 9 / 1024).toFixed(1)} KB vs ${(per(nR) * 9 / 1024).toFixed(1)} KB`);
  console.log(`  Δ over the garrison: ${((per(nB) - per(nR)) * 9 / 1024).toFixed(1)} KB`);
  console.log(`  bone matrices recomputed per frame per guard: ${nB} vs ${nR}  → garrison ${nB * 9} vs ${nR * 9}`);
}

console.log('\n══ 6b. bone cost in UPDATE TIME, nine guards at 60 Hz ══');
{
  /* The memory half of the bone question is arithmetic; this half is not, and it is the half
     that could actually stop this shipping. Both drivers are stepped through their own SHIPPED
     update path — `CarmelitaNativeAnim.update` and `GuardAnim.update` — never a synthetic loop.
     The two arms are INTERLEAVED and run three passes each, because a thermal or GC drift that
     lands entirely on whichever arm ran second is an instrument, not a result (§439), and every
     run is printed rather than the best one (§703.2). */
  const { instantiate } = await import('../src/ai/GuardModel.js');
  const { GuardAnim } = await import('../src/ai/GuardAnim.js');
  const mat = new THREE.MeshBasicMaterial();
  const N = 9, FRAMES = 1800;
  const cg = existsSync(A('carmelita-clips.glb')) ? await load(A('carmelita-clips.glb')) : null;
  if (!cg) console.log('  carmelita-clips.glb is absent — skipped');
  else {
    const nativeSet = [], rebindSet = [];
    for (let i = 0; i < N; i++) {
      const r = instantiateNative(native, [mat, mat]);
      const a = new CarmelitaNativeAnim(r, cg.animations, i * 3.17 + 0.61);
      a.play('walk_patrol', { fade: 0 });
      nativeSet.push(a);
      const r2 = instantiate(rebind, [mat, mat]);
      const a2 = new GuardAnim(r2.bones, 'temple', i * 3.17 + 0.61);
      a2.play('walk_patrol', { fade: 0 });
      rebindSet.push(a2);
    }
    const bench = (set) => {
      for (let f = 0; f < 300; f++) for (const a of set) a.update(1 / 60);
      const t0 = process.hrtime.bigint();
      for (let f = 0; f < FRAMES; f++) for (const a of set) a.update(1 / 60);
      return Number(process.hrtime.bigint() - t0) / 1e6 / FRAMES;
    };
    const nres = [], rres = [];
    for (let pass = 0; pass < 3; pass++) { rres.push(bench(rebindSet)); nres.push(bench(nativeSet)); }
    const med = (a) => a.slice().sort((x, y) => x - y)[1];
    console.log(`  rebind (GuardAnim, ${rebind.stats.bones} bones)  ms/frame for all nine: ${rres.map((x) => x.toFixed(4)).join(', ')}   median ${med(rres).toFixed(4)}`);
    console.log(`  native (Mixer, ${s.bones} bones)      ms/frame for all nine: ${nres.map((x) => x.toFixed(4)).join(', ')}   median ${med(nres).toFixed(4)}`);
    console.log(`  ratio ${(med(nres) / med(rres)).toFixed(2)}×  — of a 16.7 ms frame: `
      + `${(med(rres) * 6).toFixed(1)}% vs ${(med(nres) * 6).toFixed(1)}%`);
  }
}

console.log('\n══ 7. clips ══');
{
  const cg = existsSync(A('carmelita-clips.glb')) ? await load(A('carmelita-clips.glb')) : null;
  if (!cg) console.log(`  ${CARMELITA_CLIPS_ASSET} is absent — run tools/carmelita2native.mjs --write`);
  else {
    const have = new Set(cg.animations.map((c) => c.name));
    console.log(`  ${cg.animations.length} clips loaded from carmelita-clips.glb`);
    for (const [g, src] of Object.entries(CLIP_FOR)) {
      const c = cg.animations.find((x) => x.name === src);
      console.log(`    ${g.padEnd(12)} → ${src.padEnd(22)} ${c ? `${c.duration.toFixed(3)}s  ${c.tracks.length} tracks` : 'MISSING'}`);
    }
    const unused = [...have].filter((n) => !Object.values(CLIP_FOR).includes(n));
    console.log(`  reached by no guard state: ${unused.join(', ')}`);
    console.log(`  declared UNUSED_CLIPS    : ${UNUSED_CLIPS.join(', ')}`);
    console.log(`  agree: ${unused.slice().sort().join(',') === UNUSED_CLIPS.slice().sort().join(',')}`);
    /* every track must bind to a bone of the instantiated rig, or the clip drives nothing */
    const mat = new THREE.MeshBasicMaterial();
    const rig = instantiateNative(native, [mat, mat]);
    const names = new Set(rig.boneList.map((b) => b.name));
    let unbound = 0, checked = 0;
    for (const c of cg.animations) for (const t of c.tracks) { checked++; if (!names.has(t.name.split('.')[0])) unbound++; }
    console.log(`  tracks that bind to a bone of the instantiated rig: ${checked - unbound}/${checked} (unbound ${unbound})`);
  }
}

console.log('\n══ 8. the merged buffer ══');
{
  const g = native.geometry;
  const attrs = Object.keys(g.attributes).sort().join(', ');
  console.log(`  attributes: ${attrs}`);
  console.log(`  vertices ${g.getAttribute('position').count}   indices ${g.index?.count ?? 0}`);
  console.log(`  regions ${native.regions.length}: ${native.regions.map((r) => `${r.name}[${r.group}]`).join(' ')}`);
}
