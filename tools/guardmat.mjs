/**
 * §290 guard-render diagnosis — one boot on the `guard` shot, no candidate, read-only.
 *
 * The r10 frame shows the garrison guard as dark-navy gloss with light forearms and a pale
 * cube head. The body/metal materials ride ONE vertex-colour channel (Guard.js:1148), so the
 * suspects are: (a) the geometry's `color` attribute missing or zeroed — a toon material
 * multiplying by ~black; (b) the GROUPS→material index swapped; (c) the toon build silently
 * replaced by the MeshStandardMaterial fallback. This dumps, for every SkinnedMesh whose
 * material name starts `guard_`: the material names per group index, isToon flags, map
 * presence, and per-group vertex-colour samples (min/mean/max per channel over the group's
 * index range). charmat.mjs's traversal pattern.
 */
import { withGame } from './harness.mjs';

const got = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 },
  async ({ page }) => page.evaluate(async () => {
    const eng = window.__ENGINE;
    await window.__GAME.setShot('guard', { dt: 0 });
    const out = [];
    eng.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => m && typeof m.name === 'string' && m.name.startsWith('guard_'))) return;

      const g = o.geometry;
      const col = g.getAttribute('color');
      const groups = (g.groups || []).map((gr) => ({ start: gr.start, count: gr.count, mi: gr.materialIndex }));
      const idx = g.getIndex();

      const groupColorStats = groups.map((gr) => {
        if (!col) return null;
        const mins = [1, 1, 1], maxs = [0, 0, 0], sums = [0, 0, 0];
        let n = 0;
        for (let i = gr.start; i < gr.start + gr.count && i < (idx ? idx.count : col.count); i++) {
          const v = idx ? idx.getX(i) : i;
          const c = [col.getX(v), col.getY(v), col.getZ(v)];
          for (let k = 0; k < 3; k++) { mins[k] = Math.min(mins[k], c[k]); maxs[k] = Math.max(maxs[k], c[k]); sums[k] += c[k]; }
          n++;
        }
        return { n, min: mins.map((x) => x.toFixed(2)), mean: sums.map((x) => (x / n).toFixed(2)), max: maxs.map((x) => x.toFixed(2)) };
      });

      out.push({
        name: o.name || '(unnamed)',
        hasColorAttr: !!col, colorItemSize: col ? col.itemSize : null,
        vertexColorsOnMats: mats.map((m) => m?.vertexColors ?? null),
        groups,
        mats: mats.map((m) => ({
          name: m?.name, type: m?.type,
          isToon: !!m?.userData?.slyUniforms || (m?.type === 'ShaderMaterial'),
          hasMap: !!(m?.map || m?.userData?.slyUniforms?.map?.value),
          uniformMap: !!m?.userData?.slyUniforms,
        })),
        groupColorStats,
      });
    });
    return out;
  }));

console.log(JSON.stringify(got, null, 1));
