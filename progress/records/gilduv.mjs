/**
 * gilduv — which part of a tile a material's ON-SCREEN pixels actually sample, per canonical shot.
 *
 * The question §121.10 left open is "does the once-per-repeat landmark recur N times across the
 * frame", and every instrument in this repository answers a different one. `ringpx` gives mm/px
 * (scale) but not tile position; `angsize` gives share; `wallstrip` renders the WHOLE tile at a
 * framing's px/repeat, which is the right instrument for a wall and the wrong one for a band —
 * `hieroglyph_gilded`'s consumers sample a V window of +/-0.02..0.20 around the seam, so a
 * full-tile render shows a mid-tile frieze that no architrave in the level can display.
 *
 * So: rasterise the level, keep the interpolated UV of every pixel a named material wins, and
 * report the tile-space FOOTPRINT — a V histogram, the U repeat count, px/repeat, and the number
 * of distinct repeats in which a named landmark box is visible and at what pixel size.
 *
 * SCOPE — the transforms between what this computes and what the renderer draws, i.e. the suffix
 * NOT implemented (KNOWN_ISSUES §11):
 *   - ARCHITECTURE only unless `--props`; no terrain, character, FX, sky. A pixel any of those
 *     covers in the real frame is attributed here to the masonry behind it, so counts are UPPER
 *     BOUNDS.
 *   - NO LIGHTING, NO SHADOW MAP, NO GRADE. This is the mistake §121.8 names: a geometric
 *     availability measure is not a visibility measure. `hero` is 98.6 % shadowed on this
 *     material and would still show a full landmark count here.
 *   - No mips and no anisotropic filtering. A landmark 3 px wide here is averaged away in the
 *     real frame; a landmark's PIXEL SIZE below is what decides that, not its count.
 *   - Near-plane clipped (§10's raster.mjs artefact), z-buffered against all architecture.
 *   - Geometry from the CURRENT tree; a capture at an older SHA can disagree.
 *
 *   node progress/records/gilduv.mjs <shot|--all> [--mat arch:hieroglyph_gilded] [--w 1280]
 *        [--h 720] [--props] [--tile 3.2] [--landmark name:u0,u1,v0,v1 ...] [--json out.json]
 *
 * `--tile` is the recipe's declared tile; texture UV = geometry uv / tile (Textures.js:286).
 */
import * as THREE from 'three';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';

/**
 * Provenance: a hash over the sources this tool actually reads, NOT the git SHA.
 *
 * §121.4 records why: with several owners committing concurrently the SHA moves for reasons that
 * have nothing to do with the geometry, and — the case that bit here — it does NOT move when a
 * working-tree edit does. `src/world/EgyptLevel.js` and `Kit.js` were both modified and unstaged
 * during this tool's first measurement pass, so two runs an hour apart at the same SHA measured
 * two different levels. A run that cannot say which level it measured is not comparable to
 * anything, including itself.
 */
function treeHash() {
  const h = createHash('sha256');
  const files = [];
  for (const d of ['src/world', 'src/core']) {
    for (const f of readdirSync(`/home/user/Demo/${d}`).sort()) if (f.endsWith('.js')) files.push(`${d}/${f}`);
  }
  for (const f of files) h.update(f).update(readFileSync(`/home/user/Demo/${f}`));
  return { hash: h.digest('hex').slice(0, 12), n: files.length };
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const W = parseInt(opt('w', '1280'), 10), H = parseInt(opt('h', '720'), 10);
const MAT = opt('mat', 'arch:hieroglyph_gilded');
const TILE = parseFloat(opt('tile', '3.2'));
const LAND = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--landmark') continue;
  const [nm, box] = argv[i + 1].split(':');
  const [u0, u1, v0, v1] = box.split(',').map(Number);
  LAND.push({ nm, u0, u1, v0, v1 });
}
const shotNames = has('all') ? Object.keys(SHOTS) : argv.filter((a) => !a.startsWith('--') && SHOTS[a]);
if (!shotNames.length) { console.error('usage: gilduv.mjs <shot|--all>'); process.exit(1); }

const { A, root } = await buildLevel({ withProps: has('props') });
const world = root || A.root;
world.updateMatrixWorld(true);

/* Flatten to world triangles once, carrying UV. */
const tris = [];
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  world.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const name = o.material?.name || o.name || '?';
    const pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
    const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        p0.fromBufferAttribute(pos, i0).applyMatrix4(m);
        p1.fromBufferAttribute(pos, i1).applyMatrix4(m);
        p2.fromBufferAttribute(pos, i2).applyMatrix4(m);
        tris.push({
          a: p0.clone(), b: p1.clone(), c: p2.clone(), name,
          uv: uv ? [uv.getX(i0), uv.getY(i0), uv.getX(i1), uv.getY(i1), uv.getX(i2), uv.getY(i2)] : null,
        });
      }
    }
  });
}
const PROV = treeHash();
console.log(`# gilduv  ${W}x${H}  props=${has('props')}  tris=${tris.length}  mat="${MAT}"  tile=${TILE} (world ${TILE * 2} m/repeat)`);
console.log(`# src/world+src/core tree hash ${PROV.hash} over ${PROV.n} files  (NOT the git SHA — see the treeHash note)`);

const out = {};
for (const shotName of shotNames) {
  const s = SHOTS[shotName];
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 900);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  const zb = new Float32Array(W * H).fill(Infinity);
  const isMat = new Uint8Array(W * H);
  const uu = new Float32Array(W * H), vv = new Float32Array(W * H);
  const ny = new Float32Array(W * H);      // |world normal.y| — separates side faces from soffits

  const NEAR = cam.near;
  const clipNear = (poly) => {
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a.p.w >= NEAR, bin = b.p.w >= NEAR;
      if (ain) res.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.p.w) / (b.p.w - a.p.w);
        res.push({
          p: new THREE.Vector4(a.p.x + (b.p.x - a.p.x) * t, a.p.y + (b.p.y - a.p.y) * t, a.p.z + (b.p.z - a.p.z) * t, a.p.w + (b.p.w - a.p.w) * t),
          u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t,
        });
      }
    }
    return res;
  };
  const toScreen = (q) => ({ x: (q.p.x / q.p.w * 0.5 + 0.5) * W, y: (1 - (q.p.y / q.p.w * 0.5 + 0.5)) * H, w: q.p.w, u: q.u, v: q.v });

  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3();
  for (const T of tris) {
    _e1.subVectors(T.b, T.a); _e2.subVectors(T.c, T.a); _n.crossVectors(_e1, _e2);
    const nlen = _n.length();
    const absNy = nlen > 1e-12 ? Math.abs(_n.y / nlen) : 0;
    const V = [T.a, T.b, T.c].map((p, i) => ({
      p: new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(VP),
      u: T.uv ? T.uv[i * 2] : 0, v: T.uv ? T.uv[i * 2 + 1] : 0,
    }));
    const poly = clipNear(V);
    if (poly.length < 3) continue;
    const S = poly.map(toScreen);
    const mine = T.name === MAT ? 1 : 0;
    for (let f = 1; f + 1 < S.length; f++) {
      const a = S[0], b = S[f], c = S[f + 1];
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      const dt = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      if (Math.abs(dt) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / dt;
          const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / dt;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const iw = w0 / a.w + w1 / b.w + w2 / c.w;
          const z = 1 / iw;
          const k = y * W + x;
          if (z >= zb[k]) continue;
          zb[k] = z; isMat[k] = mine; ny[k] = absNy;
          if (mine) {
            /* Perspective-correct UV, then into texture space (Textures.js:286: repeat = 1/tile). */
            uu[k] = ((w0 * a.u / a.w + w1 * b.u / b.w + w2 * c.u / c.w) / iw) / TILE;
            vv[k] = ((w0 * a.v / a.w + w1 * b.v / b.w + w2 * c.v / c.w) / iw) / TILE;
          }
        }
      }
    }
  }

  /* ── report ── */
  const px = [];
  for (let k = 0; k < W * H; k++) if (isMat[k]) px.push(k);
  const share = 100 * px.length / (W * H);
  console.log(`\n=== ${shotName}  fov ${s.fov ?? 50}  ${px.length} px of ${MAT}  (${share.toFixed(2)} % of frame)`);
  if (!px.length) { out[shotName] = { px: 0 }; continue; }

  /* V histogram in tile space (mod 1), 20 bins, split by face orientation.
     `glyphArchitrave` reasons about V as "height up a band", which holds only where box
     projection took V from local Y — i.e. on the SIDE faces. On a beam's soffit or top, V comes
     from a horizontal axis, so mid-tile V appears there for reasons that have nothing to do with
     the register layout. Splitting the histogram is what makes that visible. */
  const bins = new Array(20).fill(0), binsSide = new Array(20).fill(0), binsFlat = new Array(20).fill(0);
  let nSide = 0, nFlat = 0;
  for (const k of px) {
    const v = ((vv[k] % 1) + 1) % 1, b = Math.min(19, (v * 20) | 0);
    bins[b]++;
    if (ny[k] < 0.5) { binsSide[b]++; nSide++; } else { binsFlat[b]++; nFlat++; }
  }
  console.log(`  faces: ${(100 * nSide / px.length).toFixed(1)} % side (|n.y|<0.5, V = height up the band)  ${(100 * nFlat / px.length).toFixed(1)} % soffit/top (V from a horizontal axis)`);
  const hist = (a, tot) => a.map((n, i) => `${(i * 0.05).toFixed(2)}:${(100 * n / Math.max(1, tot)).toFixed(1)}`).join(' ');
  console.log('  tile-V hist, ALL  (bins 0 and 19 straddle the seam): ' + hist(bins, px.length));
  console.log('  tile-V hist, SIDE faces only                       : ' + hist(binsSide, nSide));

  /* U extent: distinct integer repeat indices touched, and px per repeat. */
  const reps = new Map();
  let umin = Infinity, umax = -Infinity;
  for (const k of px) {
    const r = Math.floor(uu[k]);
    reps.set(r, (reps.get(r) || 0) + 1);
    if (uu[k] < umin) umin = uu[k];
    if (uu[k] > umax) umax = uu[k];
  }
  /**
   * px/repeat: median over pixels of |du/dx|^-1, from horizontal neighbours — reported for the
   * whole material AND separately for the seam band and the mid-tile frieze band.
   *
   * The split is the point. A single material-wide median is an average over surfaces that
   * present the tile at wildly different scales, and it will be quoted against a feature that
   * lives on only one of them. `hieroglyph_gilded`'s mid-tile frieze is reached only by geometry
   * that shows it heavily foreshortened, so the material's headline px/repeat overstates the
   * frieze's scale several-fold — which is exactly how a 0.064-of-a-repeat disc that "should" be
   * 18 px at 277 px/repeat lands as a 5 px smudge.
   */
  const bandPxRep = (lo, hi) => {
    const a = [];
    for (const k of px) {
      const x = k % W;
      if (x + 1 >= W || !isMat[k + 1]) continue;
      const v = ((vv[k] % 1) + 1) % 1;
      const vin = lo <= hi ? (v >= lo && v <= hi) : (v >= lo || v <= hi);
      if (!vin) continue;
      const d = Math.abs(uu[k + 1] - uu[k]);
      if (d > 1e-6 && d < 0.5) a.push(1 / d);
    }
    a.sort((p, q) => p - q);
    return { n: a.length, med: a.length ? a[a.length >> 1] : NaN };
  };
  const all = bandPxRep(0, 1);
  const seam = bandPxRep(0.9336, 0.0664);      // the row `glyphArchitrave` draws about the seam
  const frieze = bandPxRep(0.4635, 0.5365);    // the secondary mid-tile frieze
  const pxrep = all.med;
  console.log(`  U span ${umin.toFixed(2)} .. ${umax.toFixed(2)} = ${(umax - umin).toFixed(2)} repeats over ${reps.size} distinct repeat indices`);
  console.log(`  px per repeat (median):  all ${all.med.toFixed(0)} [n=${all.n}]   seam row ${isFinite(seam.med) ? seam.med.toFixed(0) : 'n/a'} [n=${seam.n}]   mid-tile frieze ${isFinite(frieze.med) ? frieze.med.toFixed(0) : 'n/a'} [n=${frieze.n}]`);

  const landOut = [];
  for (const L of LAND) {
    /**
     * Pixels inside the landmark's tile box, grouped into CONNECTED COMPONENTS in screen space.
     *
     * The first version of this grouped by `floor(u)` — the repeat index — and reported the
     * bounding box of each group as "screen extent". That is wrong twice over: two different
     * architraves on opposite sides of the frame can both be in repeat index 0, so the group is
     * not one mark, and its bounding box then spans the gap between them and reports a 932 px
     * "landmark" that is two smudges 900 px apart. A mark is a connected run of pixels; count
     * those. §11's shape — the arithmetic was fine and the quantity was not the one named.
     */
    const inBox = new Uint8Array(W * H);
    let tot = 0;
    for (const k of px) {
      const u = ((uu[k] % 1) + 1) % 1, v = ((vv[k] % 1) + 1) % 1;
      if (u < L.u0 || u > L.u1) continue;
      /* A seam-row landmark wraps, so v0 > v1 means "outside [v1, v0]". */
      const vin = L.v0 <= L.v1 ? (v >= L.v0 && v <= L.v1) : (v >= L.v0 || v <= L.v1);
      if (!vin) continue;
      inBox[k] = 1; tot++;
    }
    const comps = [];
    const stack = [];
    for (let k0 = 0; k0 < W * H; k0++) {
      if (!inBox[k0]) continue;
      let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
      stack.push(k0); inBox[k0] = 0;
      while (stack.length) {
        const k = stack.pop();
        n++;
        const x = k % W, y = (k / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && inBox[k - 1]) { inBox[k - 1] = 0; stack.push(k - 1); }
        if (x + 1 < W && inBox[k + 1]) { inBox[k + 1] = 0; stack.push(k + 1); }
        if (y > 0 && inBox[k - W]) { inBox[k - W] = 0; stack.push(k - W); }
        if (y + 1 < H && inBox[k + W]) { inBox[k + W] = 0; stack.push(k + W); }
      }
      comps.push({ n, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    /* A mark under ~4 px across is below what a mip chain will preserve; count both. */
    const big = comps.filter((c) => Math.max(c.w, c.h) >= 4).sort((p, q) => q.n - p.n);
    const sizes = big.map((c) => Math.max(c.w, c.h)).sort((p, q) => p - q);
    console.log(`  landmark "${L.nm}" u[${L.u0},${L.u1}] v[${L.v0},${L.v1}]: ${tot} px in ${comps.length} components, ` +
      `${big.length} of them >= 4 px across` + (big.length ? `  (extent max ${sizes[sizes.length - 1]} px, median ${sizes[sizes.length >> 1]} px; largest blob ${big[0].n} px = ${big[0].w}x${big[0].h})` : ''));
    landOut.push({ nm: L.nm, px: tot, comps: comps.length, comps4: big.length, extentMax: sizes.length ? sizes[sizes.length - 1] : 0, extentMed: sizes.length ? sizes[sizes.length >> 1] : 0 });
  }
  out[shotName] = { px: px.length, sharePct: +share.toFixed(2), uSpan: +(umax - umin).toFixed(2), pxPerRepeat: +pxrep?.toFixed(0), vbins: bins.map((n) => +(100 * n / px.length).toFixed(1)), land: landOut };
}
const jp = opt('json', null);
if (jp) { writeFileSync(jp, JSON.stringify({ W, H, mat: MAT, tile: TILE, props: has('props'), tree: PROV, shots: out }, null, 1)); console.log('\njson ->', jp); }
