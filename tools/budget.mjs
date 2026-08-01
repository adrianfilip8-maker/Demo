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
 *   node tools/budget.mjs                          # hero
 *   node tools/budget.mjs hero night               # any subset of the canonical shots
 *   node tools/budget.mjs --detail hero            # per-mesh rows inside each owner
 *   node tools/budget.mjs --png shots/bud hero     # also write the frame, same boot
 *
 * NOTE on the frustum test: this deliberately does its own matrix maths rather than importing
 * three. `page.evaluate` bodies are not modules Vite transforms, so a bare `import('three')`
 * inside one does not resolve in the browser — the previous version of this file did exactly
 * that and could never have produced a number.
 */
import { withGame } from './harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i === -1) return false; argv.splice(i, 1); return true; };

const PNG = opt('png', '');
const DETAIL = flag('detail');
const shots = argv.filter((a) => !a.startsWith('--'));

if (PNG) await mkdir(PNG, { recursive: true });

await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  const names = shots.length ? shots : ['hero'];
  console.log(`renderer: ${info.renderer}\n`);

  for (const nm of names) {
    if (!info.shots.includes(nm)) { console.log(`unknown shot ${nm}`); continue; }
    const res = await page.evaluate(async ([n, wantPng]) => {
      const r = await window.__GAME.setShot(n);
      const engine = window.__ENGINE;
      const cam = engine.camera;
      cam.updateMatrixWorld(true);
      engine.scene.updateMatrixWorld(true);

      /* --- frustum planes straight off the view-projection, no three import --- */
      const a = cam.projectionMatrix.elements, b = cam.matrixWorldInverse.elements;
      const m = new Array(16).fill(0);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[i + k * 4] * b[k + j * 4];
        m[i + j * 4] = s;
      }
      const row = (i) => [m[i], m[i + 4], m[i + 8], m[i + 12]];
      const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
      const mk = (p, q, sg) => {
        const v = [p[0] + sg * q[0], p[1] + sg * q[1], p[2] + sg * q[2], p[3] + sg * q[3]];
        const L = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / L, v[1] / L, v[2] / L, v[3] / L];
      };
      const planes = [mk(r3, r0, 1), mk(r3, r0, -1), mk(r3, r1, 1), mk(r3, r1, -1), mk(r3, r2, 1), mk(r3, r2, -1)];
      const visible = (cx, cy, cz, rad) => {
        for (const p of planes) if (p[0] * cx + p[1] * cy + p[2] * cz + p[3] < -rad) return false;
        return true;
      };

      /* Attribute to the highest ancestor under the scene that has a name — that is the
         module's root group (`architecture`, `props`, `vegetation`, ...). */
      const ownerOf = (o) => {
        let best = o, p = o;
        while (p && p.parent && p.parent !== engine.scene) { p = p.parent; if (p.name) best = p; }
        return (p && p.name) || best.name || '(unnamed)';
      };

      const agg = new Map();
      const rowsOut = [];
      let culled = 0, culledTris = 0;
      engine.scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine) return;
        if (o.visible === false) return;
        if (o.userData?.collisionProxy) return;
        const g = o.geometry;
        if (!g?.attributes?.position) return;
        if (o.material?.visible === false) return;

        const tris = (g.index ? g.index.count / 3 : g.attributes.position.count / 3)
          * (o.isInstancedMesh ? o.count : 1);

        let inView = true;
        if (o.frustumCulled !== false) {
          let sph = o.boundingSphere || null;               // InstancedMesh keeps its own
          if (!sph) { if (!g.boundingSphere) g.computeBoundingSphere(); sph = g.boundingSphere; }
          if (sph) {
            const e = o.matrixWorld.elements, c = sph.center;
            const cx = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12];
            const cy = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13];
            const cz = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
            const s = Math.sqrt(Math.max(
              e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
              e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
              e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
            inView = visible(cx, cy, cz, sph.radius * s);
          }
        }
        if (!inView) { culled++; culledTris += tris; return; }

        const shell = !!(o.userData?.isOutlineShell || o.userData?.slyOutline);
        const key = ownerOf(o) + (shell ? '  [ink shell]' : '');
        const rec = agg.get(key) || { draws: 0, tris: 0 };
        rec.draws += 1; rec.tris += tris;
        agg.set(key, rec);
        rowsOut.push([key, o.name || '(unnamed mesh)', tris, o.isInstancedMesh ? o.count : 1]);
      });

      return {
        stats: r.stats,
        owners: [...agg].map(([k, v]) => [k, v.draws, v.tris]).sort((x, y) => y[1] - x[1]),
        meshes: rowsOut,
        culled, culledTris,
        png: wantPng ? window.__GAME.capture() : null,
      };
    }, [nm, !!PNG]);

    const tot = res.owners.reduce((s, r) => [s[0] + r[1], s[1] + r[2]], [0, 0]);
    console.log(`=== ${nm}    ${tot[0]} draws / ${(tot[1] / 1e6).toFixed(3)}M tris   (budget 250 / 1.200M)`);
    console.log(`    renderer.info says: ${res.stats.drawCalls} draws / ${(res.stats.triangles / 1e6).toFixed(3)}M tris` +
      `   · frustum-culled here: ${res.culled} meshes / ${(res.culledTris / 1000).toFixed(0)}k`);
    for (const [k, d, t] of res.owners) {
      if (d === 0) continue;
      const pctD = (100 * d / tot[0]).toFixed(1), pctT = (100 * t / tot[1]).toFixed(1);
      console.log(`  ${String(d).padStart(4)} draws (${pctD.padStart(5)}%)  ${String((t / 1000).toFixed(0)).padStart(6)}k tris (${pctT.padStart(5)}%)   ${k}`);
    }
    if (DETAIL) {
      const byOwner = new Map();
      for (const [k, name, tris, cnt] of res.meshes) {
        if (!byOwner.has(k)) byOwner.set(k, []);
        byOwner.get(k).push([name, tris, cnt]);
      }
      for (const [k, d] of res.owners) {
        if (d < 8) continue;
        const list = (byOwner.get(k) || []).sort((x, y) => y[1] - x[1]);
        console.log(`  ── ${k} — ${list.length} meshes, largest first`);
        for (const [name, tris, cnt] of list.slice(0, 26)) {
          console.log(`      ${String((tris / 1000).toFixed(1)).padStart(8)}k  ${cnt > 1 ? `x${cnt} ` : ''}${name}`);
        }
        if (list.length > 26) console.log(`      … ${list.length - 26} more`);
      }
    }
    console.log();

    if (PNG && res.png) {
      const f = path.join(PNG, `${nm}.png`);
      await writeFile(f, Buffer.from(res.png.split(',')[1], 'base64'));
      console.log(`  → ${f}\n`);
    }
  }
});
