/* Where the §1 budget actually goes.
 *
 * `shots/report.json` gives one number for draw calls and one for triangles, which is enough to
 * know the budget is breached and useless for knowing whose it is. Every agent can then assume
 * it is someone else's. This boots the real page at the `high` preset, poses each requested
 * shot, and walks the scene attributing *rendered* draws and triangles to the owning root —
 * counting only what survives frustum culling for that camera, because a triangle behind the
 * camera costs nothing and should not be billed to anyone.
 *
 * Inverted-hull ink shells are billed separately from their hosts: a shell is a second draw of
 * its host's geometry, so a module that outlines everything silently doubles itself, and that
 * is invisible in any total.
 *
 *   node tools/budget.mjs                 # hero
 *   node tools/budget.mjs hero night      # any subset of the canonical shots
 */
import { withGame } from './harness.mjs';

const shots = process.argv.slice(2).filter((a) => !a.startsWith('--'));

await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  const names = shots.length ? shots : ['hero'];
  console.log(`renderer: ${info.renderer}\n`);

  for (const nm of names) {
    if (!info.shots.includes(nm)) { console.log(`unknown shot ${nm}`); continue; }
    const rows = await page.evaluate(async (n) => {
      const THREE = window.__THREE || (await import('three'));
      await window.__GAME.setShot(n);
      const engine = window.__ENGINE;
      const cam = engine.camera;
      cam.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));

      /* Attribute to the highest ancestor under the scene that has a name — that is the
         module's root group (`architecture`, `props`, `vegetation`, ...). */
      const ownerOf = (o) => {
        let best = o, p = o;
        while (p && p.parent && p.parent !== engine.scene) { p = p.parent; if (p.name) best = p; }
        return (p && p.name) || best.name || '(unnamed)';
      };

      const agg = new Map();
      engine.scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine) return;
        if (o.visible === false) return;
        if (o.userData?.collisionProxy) return;
        const g = o.geometry;
        if (!g?.attributes?.position) return;
        if (o.material?.visible === false) return;
        if (o.frustumCulled !== false) {
          if (!g.boundingSphere) g.computeBoundingSphere();
          const s = g.boundingSphere.clone().applyMatrix4(o.matrixWorld);
          if (!frustum.intersectsSphere(s)) return;
        }
        const tris = (g.index ? g.index.count / 3 : g.attributes.position.count / 3)
          * (o.isInstancedMesh ? o.count : 1);
        const shell = !!(o.userData?.isOutlineShell || o.userData?.slyOutline);
        const key = ownerOf(o) + (shell ? '  [ink shell]' : '');
        const r = agg.get(key) || { draws: 0, tris: 0 };
        r.draws += 1; r.tris += tris;
        agg.set(key, r);
      });
      return [...agg].map(([k, v]) => [k, v.draws, v.tris]).sort((a, b) => b[1] - a[1]);
    }, nm);

    const tot = rows.reduce((a, r) => [0, a[1] + r[1], a[2] + r[2]], [0, 0, 0]);
    console.log(`=== ${nm}    ${tot[1]} draws / ${(tot[2] / 1e6).toFixed(3)}M tris   (budget 250 / 1.200M)`);
    for (const [k, d, t] of rows) {
      if (d === 0) continue;
      console.log(`  ${String(d).padStart(4)} draws  ${String((t / 1000).toFixed(0)).padStart(6)}k tris   ${k}`);
    }
    console.log();
  }
});
