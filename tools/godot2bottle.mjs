#!/usr/bin/env node
/**
 * godot2bottle.mjs — import the reference project's clue-bottle mesh, and re-measure the
 * committed copy of it.
 *
 * ── Which file, and how that was established ────────────────────────────────────────────────
 *
 * By reading the Godot scene graph, not by matching a filename — the same discipline
 * `public/assets/sly-godot/PROVENANCE.md` had to use when it found two different `Sly_Body.png`:
 *
 *     Scenes/Design Tools/bottle.tscn
 *       ├─ ExtResource("1_q8b3u") = res://Assets/Models/Pickups/BOTTLE.glb   ← THE PICKUP
 *       ├─ Area3D/CollisionShape3D  SphereShape3D radius 0.625 at y 0.666
 *       └─ BOTTLE ROT/BOTTLE        Transform3D(scale 0.875, translate y 0.125)
 *
 * `Assets/Models/Detail Items/ParisWineBottle.glb` is a scenery prop and is NOT this. Nothing
 * else in the repository instances `BOTTLE.glb`.
 *
 * ── Why this bakes a module instead of loading the .glb at runtime ──────────────────────────
 *
 * `PropKit.clueBottle()` is synchronous and is called during `Props`' and `Pickups`' build, so a
 * runtime fetch would mean restructuring both. At 190 verts / 272 tris the whole mesh is smaller
 * than the loader that would fetch it, and a baked module has no asset URL — which is the entire
 * class of fault §666 is about (a leading-slash URL 404ing under `/Demo/`, a sidecar emitted
 * under a hashed name). The `.glb` is still committed beside the character import so the claim
 * below is checkable against the bytes rather than trusted.
 *
 * ── What is taken, stated exactly ───────────────────────────────────────────────────────────
 *
 * Geometry and the three `baseColorFactor`s. The mesh carries **no images** — the factors ARE
 * the surface authoring, so importing the shape and repainting it would be importing half the
 * asset. No animation is taken from the `.glb` because it has none; the motion lives in
 * `bottle.tscn`'s AnimationPlayer and is re-implemented in our own bob, from its numbers.
 * Nothing from `Assets/Music/` or `Assets/Effects/` is read, referenced or emitted here.
 *
 * usage:
 *   node tools/godot2bottle.mjs --import --src <checkout root>   # checkout → glb + module
 *   node tools/godot2bottle.mjs                                  # measure the committed asset
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET = path.join(ROOT, 'public/assets/sly-godot/bottle.glb');
const OUT = path.join(ROOT, 'src/world/BottleMesh.js');
const REL = 'Assets/Models/Pickups/BOTTLE.glb';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

/* ---------------------------------------------------------------- glb read */

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a glb`);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942 && !bin) bin = data;
    off += 8 + len;
  }
  if (!json) throw new Error(`${file}: no JSON chunk`);
  return { json, bin, bytes: buf.length };
}

/** Read one accessor out of the BIN chunk. Interleaved views are honoured via byteStride. */
function accessor(g, bin, i) {
  const a = g.accessors[i];
  const n = NC[a.type], Ctor = CT[a.componentType];
  const out = new Float32Array(a.count * n);
  if (a.bufferView == null) return out;                       // sparse-free zero accessor
  const bv = g.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || n * Ctor.BYTES_PER_ELEMENT;
  for (let e = 0; e < a.count; e++) {
    const at = base + e * stride;
    const v = new Ctor(bin.buffer, bin.byteOffset + at, n);
    for (let c = 0; c < n; c++) out[e * n + c] = v[c];
  }
  return out;
}

function intAccessor(g, bin, i) {
  const a = g.accessors[i], Ctor = CT[a.componentType];
  const bv = g.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from(new Ctor(bin.buffer, bin.byteOffset + base, a.count));
}

/* ------------------------------------------------------------------ import */

/** Pull the three primitives out, rebased so the bottle's base sits at y = 0 like ours. */
function extract(file) {
  const { json: g, bin, bytes } = readGlb(file);
  if ((g.images || []).length) throw new Error('this bottle has images — the baker assumes flat factors');
  if ((g.animations || []).length) throw new Error('this bottle has animations — the baker takes none');
  if (g.meshes.length !== 1) throw new Error(`expected 1 mesh, found ${g.meshes.length}`);

  /* The scene's single node carries no transform in this file, but read it rather than assume:
     a node matrix here would silently offset every vertex. */
  const node = g.nodes[g.scenes[g.scene || 0].nodes[0]];
  if (node.matrix || node.translation || node.rotation || node.scale) {
    throw new Error('the bottle node carries a transform — bake it before trusting these bounds');
  }

  const prims = [];
  let lo = Infinity, hi = -Infinity;
  for (const p of g.meshes[0].primitives) {
    if (p.mode != null && p.mode !== 4) throw new Error(`primitive mode ${p.mode} is not triangles`);
    const pos = accessor(g, bin, p.attributes.POSITION);
    const nor = accessor(g, bin, p.attributes.NORMAL);
    const uv = p.attributes.TEXCOORD_0 != null ? accessor(g, bin, p.attributes.TEXCOORD_0) : new Float32Array((pos.length / 3) * 2);
    const idx = intAccessor(g, bin, p.indices);
    const mat = g.materials[p.material];
    for (let i = 1; i < pos.length; i += 3) { if (pos[i] < lo) lo = pos[i]; if (pos[i] > hi) hi = pos[i]; }
    prims.push({ name: mat.name, colour: mat.pbrMetallicRoughness.baseColorFactor.slice(0, 3), pos, nor, uv, idx });
  }
  return { prims, lo, hi, bytes, generator: g.asset?.generator || '' };
}

const r6 = (v) => Number(v.toFixed(6));

function bake(src, out) {
  const { prims, lo, hi, bytes, generator } = extract(src);
  const height = hi - lo;
  /* Rebase to a base-origin mesh of unit height, so `clueBottle()`'s only job is one scalar.
     Ours is base-origin too (`bbox.min.y === 0`), which is why the pickup point cannot move. */
  const groups = prims.map((p) => {
    const pos = Array.from(p.pos);
    for (let i = 1; i < pos.length; i += 3) pos[i] = (pos[i] - lo) / height;
    for (let i = 0; i < pos.length; i++) if (i % 3 !== 1) pos[i] /= height;
    return {
      name: p.name,
      colour: p.colour.map(r6),
      /* The same colour in sRGB, converted ONCE here rather than at every reader. `Icons.js`
         draws the toast bottle from these so the HUD and the world object cannot drift apart —
         they are required to be one object, and a hand-typed hex is exactly how that breaks. */
      hex: hex(p.colour),
      position: pos.map(r6),
      normal: Array.from(p.nor).map(r6),
      uv: Array.from(p.uv).map(r6),
      index: p.idx,
    };
  });

  const verts = groups.reduce((s, x) => s + x.position.length / 3, 0);
  const tris = groups.reduce((s, x) => s + x.index.length / 3, 0);

  const body = `/* GENERATED by tools/godot2bottle.mjs — do not hand-edit.
 *
 * Sly's clue bottle, imported from ${REL} in
 * NoahChase/Sly-Cooper--A-Thief-in-Godot. Identified through the scene graph
 * (Scenes/Design Tools/bottle.tscn instances it), not by filename — provenance, licence status
 * and the full chain are in public/assets/sly-godot/PROVENANCE.md. The .glb itself is committed
 * at public/assets/sly-godot/bottle.glb; this module is its bake, so that PropKit.clueBottle()
 * can stay synchronous and no asset URL is added to the runtime (§666).
 *
 * Normalised to UNIT HEIGHT with the base at y = 0, matching the procedural bottle it replaces,
 * so a caller scales by the height it wants and the pickup point does not move.
 *
 * ${verts} verts / ${tris} tris across ${groups.length} groups. Colours are the glTF
 * baseColorFactors verbatim and are therefore LINEAR — they go straight into a vertex-colour
 * attribute, which three also treats as linear working space. Do not sRGB-convert them.
 */
export const BOTTLE_MESH = ${JSON.stringify({
    source: REL,
    generator,
    glbBytes: bytes,
    sourceHeight: r6(height),
    sourceBase: r6(lo),
    verts,
    tris,
    groups,
  })};

/**
 * The three source colours in sRGB, by group name. The world mesh gets them as a linear vertex
 * stream and \`ui/Icons.js\` draws the toast from these, so "the toast icon and the object in the
 * world are one thing" is enforced by a shared constant instead of by two hand-typed hexes.
 */
export const BOTTLE_PALETTE = Object.freeze(Object.fromEntries(
  BOTTLE_MESH.groups.map((g) => [g.name.toLowerCase(), g.hex]),
));

export default BOTTLE_MESH;
`;
  writeFileSync(out, body);
  return { verts, tris, height, groups };
}

/* ------------------------------------------------------------------ report */

function report(file) {
  const { prims, lo, hi, bytes, generator } = extract(file);
  console.log(`${path.relative(ROOT, file)}  ${bytes} bytes   ${generator}`);
  console.log(`  source bounds y ${lo.toFixed(6)} .. ${hi.toFixed(6)}   height ${(hi - lo).toFixed(6)}`);
  let v = 0, t = 0;
  for (const p of prims) {
    let rx = 0;
    for (let i = 0; i < p.pos.length; i += 3) rx = Math.max(rx, Math.hypot(p.pos[i], p.pos[i + 2]));
    let ylo = Infinity, yhi = -Infinity;
    for (let i = 1; i < p.pos.length; i += 3) { ylo = Math.min(ylo, p.pos[i]); yhi = Math.max(yhi, p.pos[i + 0 - 0]); }
    v += p.pos.length / 3; t += p.idx.length / 3;
    console.log(`  ${p.name.padEnd(6)} ${String(p.pos.length / 3).padStart(4)} verts ${String(p.idx.length / 3).padStart(4)} tris` +
      `  y ${ylo.toFixed(4)}..${yhi.toFixed(4)}  maxR ${rx.toFixed(4)}` +
      `  linear [${p.colour.map((c) => c.toFixed(5)).join(', ')}]  sRGB ${hex(p.colour)}`);
  }
  console.log(`  total ${v} verts / ${t} tris, ${prims.length} materials, 0 images, 0 animations`);
}

/** Linear → sRGB hex, so the report can be compared against what the frame shows. */
export function hex(c) {
  const f = (l) => {
    const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, s)) * 255).toString(16).padStart(2, '0');
  };
  return `#${c.map(f).join('')}`;
}

/* -------------------------------------------------------------------- main */

if (has('--import')) {
  const src = val('--src');
  if (!src) throw new Error('--import needs --src <checkout root>');
  const glb = path.join(src, REL);
  if (!existsSync(glb)) throw new Error(`not found: ${glb}`);
  writeFileSync(ASSET, readFileSync(glb));
  const r = bake(ASSET, OUT);
  console.log(`imported ${REL}`);
  console.log(`  → ${path.relative(ROOT, ASSET)}`);
  console.log(`  → ${path.relative(ROOT, OUT)}  (${r.verts} verts / ${r.tris} tris, source height ${r.height.toFixed(6)})`);
  report(ASSET);
} else {
  report(existsSync(ASSET) ? ASSET : path.join(val('--src') || '', REL));
}
