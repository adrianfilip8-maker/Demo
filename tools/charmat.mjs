#!/usr/bin/env node
/* charmat — what materials the PLAYER CHARACTER actually has, per model token.
 *
 * The material census that prompted this reported the whole scene; this one walks only the
 * player root, so "how many materials does Sly have, on what, with what shading response" is
 * answered by the build rather than by reading the constructor.
 *
 * Reports, per material: the mesh(es) and submesh index that carry it, its toon uniforms
 * (uSpec/uGloss/uMetal/uRough/uRim/uSSS), its colour, and whether it is a toon material at all.
 *
 * usage: node tools/charmat.mjs [char=dlrig] [char=godot] ...     default: shipped (no ?char=)
 */
import { withGame } from './harness.mjs';

const toks = process.argv.slice(2);
const arms = toks.length ? toks : [''];

for (const arm of arms) {
  const query = arm ? (arm.includes('=') ? arm : `char=${arm}`) : '';
  const label = arm || '(shipped default)';
  /* eslint-disable no-await-in-loop */
  const out = await withGame({ width: 640, height: 360, quality: 'high', query }, async ({ page, info }) => page.evaluate(() => {
    const eng = window.__ENGINE;
    /* Find the player root without assuming a module name: the character modules all park a
       root whose userData carries `height` (set by every model file). Fall back to a scan. */
    const cand = [];
    eng.scene.traverse((o) => { if (o.userData && o.userData.height != null && o.children.length) cand.push(o); });
    const roots = cand.length ? cand : [];
    const seen = new Map();
    const meshes = [];
    const walk = (root, tag) => root.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      if (!ms.length) return;
      meshes.push({
        tag, node: o.name || '(unnamed)', type: o.type,
        tris: o.geometry?.index ? o.geometry.index.count / 3 : (o.geometry?.attributes?.position?.count ?? 0) / 3,
        groups: (o.geometry?.groups || []).length,
        mats: ms.map((m) => m?.name || '(unnamed)'),
      });
      for (const m of ms) {
        if (!m) continue;
        const k = m.name || `(unnamed:${m.uuid.slice(0, 6)})`;
        if (seen.has(k)) { seen.get(k).on.push(`${tag}/${o.name || o.type}`); continue; }
        const u = m.userData?.slyUniforms || null;
        seen.set(k, {
          on: [`${tag}/${o.name || o.type}`],
          toon: !!u,
          color: m.color ? '#' + m.color.getHexString() : null,
          map: m.map ? (m.map.name || m.map.source?.data?.currentSrc?.split('/').pop() || 'yes') : null,
          spec: u?.uSpec?.value ?? null,
          gloss: u?.uGloss?.value ?? null,
          metal: u?.uMetal?.value ?? null,
          rough: u?.uRough?.value ?? null,
          rim: u?.uRim?.value ?? null,
          sss: u?.uSSS?.value ?? null,
          specColor: u?.uSpecColor?.value ? '#' + u.uSpecColor.value.getHexString() : null,
          detail: u?.uDetailStrength?.value ?? null,
          vertexColors: !!m.vertexColors,
        });
      }
    });
    roots.forEach((r, i) => walk(r, r.name || `root${i}`));
    /* Also catch anything named like the character/cane that the root walk missed. */
    eng.scene.traverse((o) => {
      const n = (o.name || '').toLowerCase();
      if (!/sly|cane|char/.test(n)) return;
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) {
        const k = m?.name || '';
        if (k && !seen.has(k)) seen.set(k, { on: [`LOOSE/${o.name}`], toon: !!m.userData?.slyUniforms, color: m.color ? '#' + m.color.getHexString() : null, spec: m.userData?.slyUniforms?.uSpec?.value ?? null, gloss: m.userData?.slyUniforms?.uGloss?.value ?? null, metal: m.userData?.slyUniforms?.uMetal?.value ?? null, rough: m.userData?.slyUniforms?.uRough?.value ?? null, rim: m.userData?.slyUniforms?.uRim?.value ?? null, sss: m.userData?.slyUniforms?.uSSS?.value ?? null, vertexColors: !!m.vertexColors });
      }
    });
    return { roots: roots.map((r) => r.name || r.type), meshes, mats: Object.fromEntries(seen) };
  }));

  console.log(`\n${'='.repeat(78)}\n=== ${label}   roots: ${JSON.stringify(out.roots)}`);
  console.log('--- meshes ---');
  for (const m of out.meshes) console.log(`  ${m.node.padEnd(24)} ${m.type.padEnd(12)} tris ${String(Math.round(m.tris)).padEnd(7)} groups ${String(m.groups).padEnd(3)} mats [${m.mats.join(', ')}]`);
  console.log(`--- materials (${Object.keys(out.mats).length}) ---`);
  const H = ['name', 'toon', 'color', 'spec', 'gloss', 'metal', 'rough', 'rim', 'sss'];
  console.log('  ' + H[0].padEnd(24) + H.slice(1).map((h) => h.padEnd(8)).join(''));
  for (const [k, v] of Object.entries(out.mats)) {
    console.log('  ' + k.padEnd(24)
      + String(v.toon).padEnd(8) + String(v.color ?? '-').padEnd(8)
      + String(v.spec ?? '-').padEnd(8) + String(v.gloss ?? '-').padEnd(8)
      + String(v.metal ?? '-').padEnd(8) + String(v.rough ?? '-').padEnd(8)
      + String(v.rim ?? '-').padEnd(8) + String(v.sss ?? '-').padEnd(8));
    console.log('      on: ' + v.on.join(', ') + (v.map ? `   map: ${v.map}` : '') + (v.vertexColors ? '   vertexColors' : ''));
  }
}
