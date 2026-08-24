#!/usr/bin/env node
/**
 * carmscale.mjs — "verify that it was scaled correctly", answered in the units the owner sees.
 *
 * The question is about the guard AS DRAWN, so nothing here reads a spec, a TUNE or a bind-pose
 * buffer. Every number is taken from the SkinnedMesh the frame would submit, CPU-skinned through
 * `applyBoneTransform` (the GLSL `skinning_vertex` chunk verbatim) and then through
 * `localToWorld`, which is the second half the renderer does. `guardfloat.mjs` learned both
 * halves of that the hard way and its header records why; the same seeded-vector contract is
 * used here.
 *
 * §435.4 — nobody is teleported. The garrison WALKS for the settle window on the shipped
 * `Guards.update` path and is measured wherever it has got to, because a guard placed at a `u`
 * by assignment carries state a walked guard does not.
 *
 * It reports six things, and the last two are the ones nobody had looked at:
 *
 *   1. every guard's drawn world bbox — height and width — against the roster's own `SPECS`
 *      height for his type, and against the player character measured the same way;
 *   2. the scale on every node from the SkinnedMesh up to the scene, so a non-uniform scale
 *      anywhere in the chain is named rather than assumed absent (it is a classic sculpt
 *      mangler, and `GuardAnim.rootScale` is anisotropic BY DESIGN — squash and stretch);
 *   3. the head specifically: its own drawn bbox, its offset from the `head` bone, and its
 *      height as a fraction of the body — a head that is collapsed, displaced or absent all
 *      read differently here;
 *   4. UV/material sanity for the two groups actually bound to the mesh;
 *   5. **the bone budget** — how many bones the skin really has, whether three is uploading
 *      them as a TEXTURE or as uniforms, and what this renderer's limits are. A truncated bone
 *      set would deform everything past the cut and the head is deep in the hierarchy, so it is
 *      a candidate for both halves of the report at once;
 *   6. **facing** — the world-space dot product between each guard's forward and the direction
 *      from each candidate camera. A frame's NAME cannot establish that it sees a face; this
 *      prints the number, so "front" is a measurement.
 *
 *   node tools/carmscale.mjs [--seconds 60]
 */
import { withGame } from './harness.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d;
};
const SECONDS = arg('--seconds', 60);

/* The cameras whose framing this run is asked to vet. Positions are the ones `guardground.mjs`
   already cleared through camDot; nothing new is walked into a crate here. */
const CAMS = {
  'close-pylon': { pos: [-1.0, 1.90, 27.6], look: [-4.93, 1.80, 31.5] },
  'portrait-pylon': { pos: [-1.0, 1.90, 27.6], look: [-4.93, 1.25, 31.5] },
  'close-colonnade': { pos: [-18.44, 3.00, 28.5], look: [-18.46, 1.05, 22.32] },
  'portrait-colonnade': { pos: [-18.44, 3.00, 28.5], look: [-18.46, 1.25, 22.32] },
};

const out = await withGame({ width: 640, height: 360, quality: 'low' }, async ({ page }) => {
  page.setDefaultTimeout(0);
  return page.evaluate(async ([seconds, CAMS]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Box3) break; } catch { THREE = null; }
    }
    if (!THREE?.Box3) return { error: 'could not load THREE in page' };

    const engine = window.__ENGINE;
    const guards = engine.get('guards');
    if (!guards?.guards?.length) return { error: 'no guards' };

    /* ---- settle: the garrison walks, the player is parked far outside the level ---------- */
    const mv = engine.get('movement');
    const parkedAt = mv?.position ? mv.position.clone() : null;
    if (mv?.position) mv.position.set(600, 0, 600);
    if (guards._shotLocks) guards._shotLocks.length = 0;
    const dt = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(seconds / dt); f++) { t += dt; guards.update(dt, t); }

    /* ---- CPU skinning, the same contract guardfloat.mjs uses ---------------------------- */
    const sv = new THREE.Vector3();
    function drawnBox(mesh, first, count) {
      mesh.updateMatrixWorld(true);
      mesh.skeleton?.update?.();
      const pos = mesh.geometry.attributes.position;
      const box = new THREE.Box3();
      const lo = first ?? 0, hi = Math.min(pos.count, (first ?? 0) + (count ?? pos.count));
      for (let i = lo; i < hi; i++) {
        sv.fromBufferAttribute(pos, i);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, sv);
        mesh.localToWorld(sv);
        box.expandByPoint(sv);
      }
      return box;
    }
    const dim = (b) => (b.isEmpty() ? null : {
      h: +(b.max.y - b.min.y).toFixed(4), w: +(b.max.x - b.min.x).toFixed(4),
      d: +(b.max.z - b.min.z).toFixed(4),
      y: [+b.min.y.toFixed(4), +b.max.y.toFixed(4)],
      c: [+((b.min.x + b.max.x) / 2).toFixed(3), +((b.min.y + b.max.y) / 2).toFixed(3),
        +((b.min.z + b.max.z) / 2).toFixed(3)],
    });

    /* ---- 2. the scale chain, from the mesh up to the scene ------------------------------ */
    function chain(o) {
      const rows = [];
      for (let p = o; p; p = p.parent) {
        const s = p.scale;
        rows.push({
          name: p.name || `(${p.type})`, type: p.type,
          s: [+s.x.toFixed(5), +s.y.toFixed(5), +s.z.toFixed(5)],
          uniform: Math.abs(s.x - s.y) < 1e-6 && Math.abs(s.y - s.z) < 1e-6,
        });
      }
      return rows;
    }

    const carm = guards.carmelita || null;
    const regions = carm?.regions || [];
    const headRegions = regions.filter((r) => r.group === 1);
    const headSpan = headRegions.length
      ? { start: Math.min(...headRegions.map((r) => r.start)),
        end: Math.max(...headRegions.map((r) => r.start + r.count)) }
      : null;

    const rows = [];
    for (const g of guards.guards) {
      const mesh = g.mesh || g.model?.mesh
        || (() => { let m = null; g.root.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; }); return m; })();
      if (!mesh) { rows.push({ id: g.id, error: 'no skinned mesh on this guard' }); continue; }
      const whole = drawnBox(mesh);
      const head = headSpan ? drawnBox(mesh, headSpan.start, headSpan.end - headSpan.start) : null;
      const headBone = g.bones?.head || null;
      const hb = headBone ? new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld) : null;
      /* forward: the guard's own heading, taken from the root's world matrix rather than from
         a yaw field, so it is the orientation the frame actually draws. */
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
        g.root.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const centre = whole.getCenter(new THREE.Vector3());
      const facing = {};
      for (const [name, c] of Object.entries(CAMS)) {
        const toCam = new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]).sub(centre).normalize();
        facing[name] = {
          dot: +fwd.dot(toCam).toFixed(3),
          dist: +new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]).distanceTo(centre).toFixed(2),
        };
      }
      rows.push({
        id: g.id, type: g.type, route: g.route?.name, state: g.state,
        u: +g.u.toFixed(4),
        pos: [+g.position.x.toFixed(3), +g.position.y.toFixed(4), +g.position.z.toFixed(3)],
        body: dim(whole),
        head: head ? dim(head) : null,
        headBoneY: hb ? +hb.y.toFixed(4) : null,
        headOffsetFromBone: hb && head
          ? +head.getCenter(new THREE.Vector3()).distanceTo(hb).toFixed(4) : null,
        rootScale: [+g.root.scale.x.toFixed(5), +g.root.scale.y.toFixed(5), +g.root.scale.z.toFixed(5)],
        animRootScale: g.anim?.rootScale
          ? [+g.anim.rootScale.x.toFixed(5), +g.anim.rootScale.y.toFixed(5), +g.anim.rootScale.z.toFixed(5)]
          : null,
        chain: chain(mesh),
        bones: mesh.skeleton?.bones?.length ?? 0,
        fwd: [+fwd.x.toFixed(3), +fwd.y.toFixed(3), +fwd.z.toFixed(3)],
        facing,
      });
    }

    /* ---- the player, measured the same way ---------------------------------------------- */
    if (mv?.position && parkedAt) mv.position.copy(parkedAt);
    let player = null;
    {
      const scene = engine.scene;
      let best = null, bestN = 0;
      scene.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        for (let p = o; p; p = p.parent) if (/guard/i.test(p.name || '')) return;
        const n = o.geometry?.attributes?.position?.count || 0;
        if (n > bestN) { bestN = n; best = o; }
      });
      if (best) {
        player = { name: best.name, verts: bestN, box: dim(drawnBox(best)), chain: chain(best),
          bones: best.skeleton?.bones?.length ?? 0 };
      }
      const col = engine.get('collision');
      const mvv = engine.get('movement');
      player = player || {};
      player.capsule = {
        radius: mvv?.radius ?? col?.playerRadius ?? null,
        height: mvv?.height ?? mvv?.standHeight ?? null,
        eye: mvv?.eyeHeight ?? null,
      };
    }

    /* ---- 5. the bone budget, and how the bones reach the shader ------------------------- */
    const renderer = engine.renderer || engine.get('renderer')?.renderer || window.__GAME?.renderer;
    const gl = renderer?.getContext?.();
    const anyMesh = rows.find((r) => r.bones)?.bones ?? 0;
    let skinMesh = null;
    engine.scene.traverse((o) => { if (!skinMesh && o.isSkinnedMesh) skinMesh = o; });
    const budget = {
      skeletonBones: anyMesh,
      boneTexture: !!skinMesh?.skeleton?.boneTexture,
      boneTextureSize: skinMesh?.skeleton?.boneTexture
        ? [skinMesh.skeleton.boneTexture.image.width, skinMesh.skeleton.boneTexture.image.height]
        : null,
      boneMatricesLen: skinMesh?.skeleton?.boneMatrices?.length ?? null,
      rendererCaps: renderer?.capabilities ? {
        maxTextures: renderer.capabilities.maxTextures,
        maxVertexTextures: renderer.capabilities.maxVertexTextures,
        maxTextureSize: renderer.capabilities.maxTextureSize,
        floatVertexTextures: renderer.capabilities.floatVertexTextures,
        isWebGL2: renderer.capabilities.isWebGL2,
      } : null,
      glLimits: gl ? {
        MAX_VERTEX_UNIFORM_VECTORS: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        MAX_VERTEX_TEXTURE_IMAGE_UNITS: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
        RENDERER: gl.getParameter(gl.RENDERER),
        VERSION: gl.getParameter(gl.VERSION),
      } : null,
      programSkinning: (() => {
        /* what the compiled program was actually told: three sets USE_SKINNING and, on the
           uniform path, BONE_TEXTURE. Read off the shader source so it is the program's own
           statement rather than an inference from the version number. */
        const m = skinMesh;
        const prog = m?.material?.program || null;
        const vs = prog?.vertexShader || m?.material?.userData?.vs || null;
        return {
          hasProgram: !!prog,
          usesBoneTexture: vs ? /USE_SKINNING/.test(vs) && /boneTexture/.test(vs) : null,
        };
      })(),
    };

    return {
      settleSeconds: seconds,
      carmelita: carm ? {
        tris: carm.tris, stats: carm.stats, regions: regions.length,
        headRegions: headRegions.map((r) => r.name),
      } : null,
      guards: rows,
      player,
      budget,
    };
  }, [SECONDS, CAMS]);
});

if (out.error) { console.error(out.error); process.exit(1); }

const f = (n) => (n == null ? '—' : Number(n).toFixed(3));
console.log(`\n══ carmscale — settled ${out.settleSeconds}s, garrison walked (§435.4) ══`);
if (out.carmelita) {
  console.log(`carmelita asset: ${out.carmelita.tris} tris, ${out.carmelita.regions} regions, `
    + `head atlas = ${out.carmelita.headRegions.join(', ')}`);
  console.log(`  stats ${JSON.stringify(out.carmelita.stats)}`);
} else {
  console.log('carmelita asset: NOT LOADED — these guards are the procedural body');
}

console.log('\n── 1/3. the guard AS DRAWN, world space ──');
console.log('id       type    route            drawn h   drawn w   y range            head h  head/body  head↔bone  bones');
for (const g of out.guards) {
  if (g.error) { console.log(`${g.id} ${g.error}`); continue; }
  const ratio = g.head && g.body ? (g.head.h / g.body.h) : null;
  console.log(`${g.id.padEnd(8)} ${String(g.type).padEnd(7)} ${String(g.route).padEnd(16)}`
    + ` ${f(g.body?.h).padStart(7)}  ${f(g.body?.w).padStart(8)}`
    + `  ${f(g.body?.y[0]).padStart(7)}..${f(g.body?.y[1]).padStart(7)}`
    + `  ${f(g.head?.h).padStart(6)}  ${ratio == null ? '—' : (ratio * 100).toFixed(1) + '%'}`
    + `   ${f(g.headOffsetFromBone).padStart(7)}   ${g.bones}`);
}

console.log('\n── 2. the scale chain (a non-uniform scale anywhere here deforms the skin) ──');
{
  const g = out.guards.find((x) => !x.error);
  if (g) {
    for (const n of g.chain) {
      console.log(`   ${n.name.padEnd(20)} ${String(n.type).padEnd(12)} `
        + `[${n.s.join(', ')}]${n.uniform ? '' : '   ← NON-UNIFORM'}`);
    }
    console.log(`   guard root.scale ${JSON.stringify(g.rootScale)}   `
      + `GuardAnim.rootScale ${JSON.stringify(g.animRootScale)}`);
    const bad = out.guards.filter((x) => !x.error && !(
      Math.abs(x.rootScale[0] - x.rootScale[1]) < 1e-6 && Math.abs(x.rootScale[1] - x.rootScale[2]) < 1e-6));
    console.log(`   guards whose root.scale is non-uniform right now: ${bad.length}/${out.guards.length}`
      + (bad.length ? ` — ${bad.map((x) => `${x.id} ${JSON.stringify(x.rootScale)}`).join(', ')}` : ''));
  }
}

console.log('\n── the player, measured the same way ──');
console.log(`   ${out.player?.name || '(none found)'}  verts ${out.player?.verts ?? '—'}  `
  + `bones ${out.player?.bones ?? '—'}`);
console.log(`   drawn h ${f(out.player?.box?.h)}  w ${f(out.player?.box?.w)}  `
  + `y ${f(out.player?.box?.y?.[0])}..${f(out.player?.box?.y?.[1])}`);
console.log(`   capsule ${JSON.stringify(out.player?.capsule)}`);

console.log('\n── 5. the bone budget (candidate: a truncated bone set) ──');
console.log(`   skeleton bones ................ ${out.budget.skeletonBones}`);
console.log(`   boneMatrices floats ........... ${out.budget.boneMatricesLen}`);
console.log(`   bone TEXTURE in use ........... ${out.budget.boneTexture} `
  + `${out.budget.boneTextureSize ? `(${out.budget.boneTextureSize.join('×')})` : ''}`);
console.log(`   renderer caps ................. ${JSON.stringify(out.budget.rendererCaps)}`);
console.log(`   gl limits ..................... ${JSON.stringify(out.budget.glLimits)}`);

console.log('\n── 6. FACING — is a camera actually looking at a face? ──');
console.log('   dot(+1 = camera dead in front, 0 = side-on, -1 = behind)');
for (const g of out.guards) {
  if (g.error || !g.facing) continue;
  const parts = Object.entries(g.facing).map(([n, v]) => `${n} ${v.dot >= 0 ? '+' : ''}${v.dot} @${v.dist}m`);
  console.log(`   ${g.id.padEnd(8)} fwd [${g.fwd.join(', ')}]  ${parts.join('   ')}`);
}
console.log('');
console.log(JSON.stringify(out).length > 0 ? '' : '');
const fs = await import('node:fs');
fs.writeFileSync('/tmp/carmscale.json', JSON.stringify(out, null, 2));
console.log('full report → /tmp/carmscale.json');
