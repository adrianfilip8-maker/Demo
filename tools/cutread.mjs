/* Does a REAL CUT read? Projected reveal width per VISIBLE PIXEL, per recipe, per shot.
 *
 * TEXTURES has established that the normal-map carve bevel is sub-pixel at every framing that
 * carries a carved recipe (column_papyrus 0.98 px at `temple`, hieroglyph_wall 0.90 px at
 * `traversal`, hieroglyph_gilded 1.85 px at `hero`) and that there is no headroom to widen it:
 * glyph heights run 3.8–63.9 texels, so the smallest signs are already narrower than two
 * bevels. The remaining lever is recessed GEOMETRY. This answers *where that pays* before
 * anything is modelled, because the failure being escaped has an exact geometric twin in
 * triangles and it is easy to walk straight into it.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUANTITY
 *
 * A sunk-relief cut of depth `d` into a surface with normal n has three faces:
 *
 *   - the FACE   (normal n)
 *   - the FLOOR  (normal n, offset by d along -n)   <- SAME NORMAL AS THE FACE
 *   - the REVEAL (the side wall, normal m ⊥ n, in-plane)
 *
 * The floor shades *identically* to the face — same normal, same light, same cel band — so it
 * contributes nothing on its own. **Every bit of relief a real cut delivers is carried by the
 * reveal**, and the reveal's projected width is therefore the whole question:
 *
 *        reveal_px  =  d · sin θ · pxPerM        (cos θ = n·v, v = unit surface -> eye)
 *
 * ZERO face-on, maximal at grazing. That is the *opposite* dependence to the texture bevel,
 * which is an IN-PLANE ramp of width w_b and projects as w_b · cos θ · pxPerM — widest face-on,
 * vanishing at grazing. The two levers are complements, not substitutes, and they fail in
 * opposite places.
 *
 * THE TRAP, named before anyone models anything: cutting glyphs into a wall the camera is
 * looking straight at reproduces the sub-pixel failure exactly, in triangles instead of texels.
 * sin θ -> 0 there, the floor is normal-identical to the face, and the only remaining carrier
 * would be occlusion — which §81.2 records as ruled out on a sunlit wall (`aoKey = 0`, SHADING,
 * final). A face-on cut in this renderer is not weak; it is *provably* invisible, at any
 * triangle count.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS RASTERISES INSTEAD OF WEIGHTING BY SOLID ANGLE
 *
 * The first version of this tool weighted triangles by projected area with no occlusion, and
 * reported `column_papyrus` as 11.0% of `temple`. `frontmap.mjs`, which z-buffers, reports
 * **53.81%** — matching TEXTURES' independently measured 53.8% to three figures. The colonnade
 * stands in front of the hall walls, and counting the hidden walls inflated the denominator and
 * buried the columns 5×. A carving question answered on hidden surfaces is worthless, so this
 * z-buffers and samples only pixels the frame actually contains.
 *
 * Props are built and DO occlude (a colossus in front of a pylon hides that pylon), but only
 * architecture recipes are tallied. `--noprops` drops them.
 *
 *   node tools/cutread.mjs                       # every canonical shot
 *   node tools/cutread.mjs temple traversal hero
 *   node tools/cutread.mjs --depths 0.015,0.03,0.06 --thresh 2 --w 640 --h 360
 */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i === -1) return false; argv.splice(i, 1); return true; };
const DEPTHS = String(opt('depths', '0.015,0.03,0.06,0.12')).split(',').map(Number);
const THRESH = parseFloat(opt('thresh', '2'));
const W = parseInt(opt('w', '640'), 10), H = parseInt(opt('h', '360'), 10);
const NOPROPS = flag('noprops');
const only = argv.filter((a) => !a.startsWith('--'));

const { root } = await buildLevel({ withProps: !NOPROPS });
root.updateMatrixWorld(true);

const names = only.length ? only : Object.keys(SHOTS);

function wq(pairs, q) {
  if (!pairs.length) return NaN;
  pairs.sort((a, b) => a - b);
  return pairs[Math.min(pairs.length - 1, Math.floor(pairs.length * q))];
}

for (const nm of names) {
  const s = SHOTS[nm];
  if (!s) { console.log(`unknown shot ${nm}`); continue; }

  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(s.fov) * 0.5);

  const NEAR = cam.near;
  const clipNear = (poly) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a.w >= NEAR, bin = b.w >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.w) / (b.w - a.w);
        out.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
      }
    }
    return out;
  };
  const toScreen = (v) => new THREE.Vector3(
    (v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w);

  const zb = new Float32Array(W * H).fill(Infinity);
  const owner = new Int32Array(W * H).fill(-1);
  const cosb = new Float32Array(W * H);
  const recipes = [];
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  const vv = new THREE.Vector3();

  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    /* Architecture stamps every material `arch:<recipe>`; anything else is a prop, kept for
       occlusion but not tallied. */
    const mn = o.material?.name || '';
    const rec = mn.startsWith('arch:') ? mn.slice(5) : null;
    const rid = recipes.push(rec) - 1;
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        p0.fromBufferAttribute(pos, i0).applyMatrix4(m);
        p1.fromBufferAttribute(pos, i1).applyMatrix4(m);
        p2.fromBufferAttribute(pos, i2).applyMatrix4(m);
        e1.subVectors(p1, p0); e2.subVectors(p2, p0); nrm.crossVectors(e1, e2).normalize();
        vv.copy(p0).sub(cam.position);
        const dlen = vv.length() || 1e-6;
        const ndv = nrm.dot(vv) / dlen;
        if (ndv >= 0) continue;                       // backface
        const cosT = Math.min(1, Math.abs(ndv));
        const poly = clipNear([p0, p1, p2].map((v) => new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(VP)));
        if (poly.length < 3) continue;
        const S = poly.map(toScreen);
        for (let f = 1; f + 1 < S.length; f++) {
          const a = S[0], b = S[f], c = S[f + 1];
          const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
          const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
          const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
          const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
          if (minX > maxX || minY > maxY) continue;
          const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
          if (Math.abs(area) < 1e-9) continue;
          const inv = 1 / area;
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) * inv;
            const w1 = ((px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y)) * inv;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = 1 / (w2 / a.z + w1 / b.z + w0 / c.z);
            if (z <= 0) continue;
            const k = y * W + x;
            if (z >= zb[k]) continue;
            zb[k] = z; owner[k] = rid; cosb[k] = cosT;
          }
        }
      }
    }
  });

  const by = new Map();
  let filled = 0;
  for (let k = 0; k < W * H; k++) {
    if (owner[k] < 0) continue;
    filled++;
    const rec = recipes[owner[k]];
    if (!rec) continue;
    let R = by.get(rec);
    if (!R) { R = { px: 0, cos: [], ppm: [], clears: DEPTHS.map(() => 0) }; by.set(rec, R); }
    const cosT = cosb[k];
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const ppm = H / (2 * zb[k] * tanHalf);
    R.px++; R.cos.push(cosT); R.ppm.push(ppm);
    for (let i = 0; i < DEPTHS.length; i++) if (DEPTHS[i] * sinT * ppm >= THRESH) R.clears[i]++;
  }

  const TOT = W * H;
  console.log(`=== ${nm}   fov ${s.fov}   ${W}x${H}   world covers ${(100 * filled / TOT).toFixed(1)}% of frame`);
  console.log(`    recipe                frame%   med px/m  med cosθ  ` +
    DEPTHS.map((d) => `${(d * 1000).toFixed(0)}mm`.padStart(7)).join(''));
  const rows = [...by.entries()].filter(([, R]) => R.px > TOT * 0.004).sort((a, b) => b[1].px - a[1].px);
  for (const [rec, R] of rows) {
    const cells = R.clears.map((c) => `${(100 * c / R.px).toFixed(1)}%`.padStart(7)).join('');
    console.log(`    ${rec.padEnd(20)} ${(100 * R.px / TOT).toFixed(1).padStart(6)}%  ` +
      `${wq(R.ppm, 0.5).toFixed(0).padStart(8)}  ${wq(R.cos, 0.5).toFixed(2).padStart(8)}  ${cells}`);
  }
  console.log(`    (depth columns = % OF THAT RECIPE'S OWN VISIBLE PIXELS with reveal ≥ ${THRESH} px)\n`);
}
