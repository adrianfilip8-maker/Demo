/* Collider + art digest. `node tools/ventdigest.mjs out.json` writes it; two files diff. */
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { realWorld } from '../tests/_moveset.mjs';

const { engine, collision, arch } = await realWorld();

const recs = collision.list ?? collision.recs ?? collision.colliders ?? [];
const rows = [];
const bb = new THREE.Box3();
for (const r of recs) {
  const m = r.mesh;
  if (!m) { rows.push(`${r.tag}|nomesh`); continue; }
  m.updateMatrixWorld(true);
  bb.setFromObject(m);
  const f = (v) => v.toFixed(3);
  rows.push([r.tag, r.material || '', r.climbable ? 1 : 0, r.oneWay ? 1 : 0, r.crawl ? 1 : 0,
    f(bb.min.x), f(bb.min.y), f(bb.min.z), f(bb.max.x), f(bb.max.y), f(bb.max.z),
    m.geometry?.attributes?.position?.count ?? 0].join('|'));
}
rows.sort();

/**
 * §605 — instance matrices are hashed SEPARATELY from geometry, because an InstancedMesh shares
 * one `geometry.attributes.position` across every copy. Turning all sixteen hook rings changes
 * nothing the digest could see before: the geometry hash covers the ring shape, and the per-copy
 * transform deciding which way each one faces sat outside the digest entirely. A digest blind to
 * the thing being changed would have called this edit art-neutral and been believed.
 *
 * Split into TRANSLATION and ROTATION columns on purpose. The whole constraint here is "turn the
 * ring, do not move the anchor", and the halves have to be separately checkable: a rotation
 * column that moves is the request, a translation column that moves is the defect.
 */
const inst = [];
const art = [];
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
engine.scene.traverse((o) => {
  if (!o.isMesh || !o.geometry?.attributes?.position) return;
  if (o.userData?.collisionProxy) return;
  const pos = o.geometry.attributes.position;
  const h = createHash('sha1');
  const buf = Buffer.alloc(pos.count * 12);
  for (let i = 0; i < pos.count; i++) {
    buf.writeFloatLE(Math.round(pos.getX(i) * 1e4) / 1e4, i * 12);
    buf.writeFloatLE(Math.round(pos.getY(i) * 1e4) / 1e4, i * 12 + 4);
    buf.writeFloatLE(Math.round(pos.getZ(i) * 1e4) / 1e4, i * 12 + 8);
  }
  h.update(buf);
  art.push(`${o.name}|${pos.count}|${h.digest('hex').slice(0, 16)}`);

  if (o.isInstancedMesh) {
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, _m);
      _m.decompose(_p, _q, _s);
      const f = (v) => v.toFixed(4);
      inst.push(`${o.name}|${String(i).padStart(3, '0')}|T ${f(_p.x)},${f(_p.y)},${f(_p.z)}`
        + `|R ${f(_q.x)},${f(_q.y)},${f(_q.z)},${f(_q.w)}|S ${f(_s.x)}`);
    }
  }
});
art.sort();
inst.sort();

/* Magnetism targets: a `swingTarget` record is what a catch actually reads, and it is not a
   collider, so nothing above would notice one moving. */
const mags = [];
const specs = arch?.api?.targets ?? [];
if (!specs.length) throw new Error('ventdigest: 0 magnetism targets — the registry moved, and an '
  + 'empty column would read as "nothing changed" for the records this digest exists to protect');
for (const t of specs) {
  const p = t.point || t.position;
  if (!p) continue;
  mags.push(`${t.id}|${t.group || ''}|${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`
    + `|vol ${(t.volume ?? 0).toFixed(3)}|catch ${(t.catch ?? 0).toFixed(4)}`);
}
mags.sort();

const byTag = {};
for (const r of recs) byTag[r.tag] = (byTag[r.tag] || 0) + 1;

const out = { colliders: recs.length, byTag, rows, art, inst, mags };
writeFileSync(process.argv[2] || 'digest.json', JSON.stringify(out, null, 1));
console.log(`colliders ${recs.length}  art meshes ${art.length}  instances ${inst.length}  `
  + `magnets ${mags.length}  ->  ${process.argv[2]}`);
console.log('byTag', JSON.stringify(byTag));
process.exit(0);
