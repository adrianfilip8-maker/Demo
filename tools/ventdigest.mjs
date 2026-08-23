/* Collider + art digest. `node tools/ventdigest.mjs out.json` writes it; two files diff. */
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { realWorld } from '../tests/_moveset.mjs';

const { engine, collision } = await realWorld();

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

const art = [];
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
});
art.sort();

const byTag = {};
for (const r of recs) byTag[r.tag] = (byTag[r.tag] || 0) + 1;

const out = { colliders: recs.length, byTag, rows, art };
writeFileSync(process.argv[2] || 'digest.json', JSON.stringify(out, null, 1));
console.log(`colliders ${recs.length}  art meshes ${art.length}  ->  ${process.argv[2]}`);
console.log('byTag', JSON.stringify(byTag));
process.exit(0);
