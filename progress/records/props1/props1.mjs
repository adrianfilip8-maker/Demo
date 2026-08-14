/**
 * props1.mjs — the PROPS lane's ONE shared capture run.
 *
 * Serves two seals in one boot:
 *   (b) PREREG-coinlit — a same-boot, per-shot POKE A/B on the coin + hook-ring read.
 *   (c) PREREG-colossus — the binding LOOK frames. The `off` arm IS the LOOK frame, so the
 *       sculpt costs this run no extra captures.
 *
 * §186 ORDERING: this runner performs acquire -> install -> boot -> capture -> revert ->
 * release ITSELF. The candidate patch must not exist in `src/**` while the runner sits in the
 * FIFO queue (measured at 20-60 minutes), because two other lanes' boots would compile against
 * it and record the result as their own.
 *
 * §302: every pixel bar here is SAME-BOOT. `diff(off, back)` per shot is the only validity
 * block; no cross-boot [0,0] is claimed anywhere. The LOOK read is explicitly cross-boot and
 * explicitly NOT pixel-differenced.
 *
 * §296 finding 2: every capture stamps {sha, srcTree, dirty}; the scorer VOIDs across any
 * stamp change.
 *
 *   bash tools/launch.sh progress/records/props1/props1.mjs \
 *        /home/user/Demo/progress/records/logs/props1-run1.log /tmp/sands-of-ra/props1-run1.pid
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/props1run1');
const PATCH = path.join(ROOT, 'progress/records/props1/cand-colossus.patch');
/* courtyard is the r12 frame that raised BOTH complaints; hero/night/traversal/dunes carry the
   ring family at other keys and distances; kaykit is the second colossus staging. */
const ROSTER = ['courtyard', 'hero', 'night', 'traversal', 'dunes', 'kaykit'];
const METAL_ON = 0.30, DOME = 0.75;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const die = (m) => { console.error(m); process.exit(2); };

/* ── PF6 launch pins ─────────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6 ABORT: src/ dirty at launch:\n${dirt}`);
  if (!existsSync(PATCH)) die(`PF6 ABORT: no candidate patch at ${PATCH}`);
  try { execFileSync('git', ['apply', '--check', PATCH], { cwd: ROOT }); }
  catch (e) { die(`PF6 ABORT: cand-colossus.patch does not apply to this tree — ${e.message}`); }
}
if (existsSync(OUT) && readdirSync(OUT).length) die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes; archive it (mv ${OUT} ${OUT}-void-runN) and relaunch.`);
mkdirSync(OUT, { recursive: true });

const HEAD_TREE = treeState();
const manifest = {
  seal: 'PREREG-coinlit (poke A/B) + PREREG-colossus (LOOK, the `off` arms)',
  head: git('rev-parse', 'HEAD'),
  headSrc: HEAD_TREE.src,
  install: 'progress/records/props1/cand-colossus.patch',
  values: { METAL_ON, DOME },
  roster: ROSTER,
  launchedAt: new Date().toISOString(), pid: process.pid, rows: [],
};
const save = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
save();

/* ── page-side ───────────────────────────────────────────────────────────────────────────── */

const STAGE = async (name) => {
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  window.__ENGINE.renderFrame(0);
  return { staged: name };
};

/* Find the two subject meshes + the treasures ONCE, snapshot everything the arms restore. */
const PREP = async () => {
  const eng = window.__ENGINE;
  const st = { coins: null, rings: null, treasures: [] };
  eng.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'pickup_coins') st.coins = o;
    else if (o.name === 'hooks:rings' || /hooks?:rings/.test(o.name)) st.rings = o;
    else if (/^treasure_/.test(o.name)) st.treasures.push(o);
  });
  window.__PROPS1 = {
    coins: st.coins, rings: st.rings, treasures: st.treasures,
    baseMatCoins: st.coins ? st.coins.material : null,
    baseMatRings: st.rings ? st.rings.material : null,
    /* exact restore copies — the back arm writes these back, byte for byte */
    baseNorm: st.coins?.geometry?.attributes?.normal
      ? new Float32Array(st.coins.geometry.attributes.normal.array) : null,
    domeNorm: null, candMatCoins: null, candMatRings: null,
  };
  const P = window.__PROPS1;
  /* dome normals: N = normalize(mix(flat, radial-from-centre, DOME)). Positions and indices
     are untouched, so this is a zero-triangle change. */
  if (P.baseNorm && st.coins) {
    const g = st.coins.geometry, pos = g.attributes.position.array, n = new Float32Array(P.baseNorm);
    const d = 0.75;
    for (let i = 0; i < n.length; i += 3) {
      const px = pos[i], py = pos[i + 1], pz = pos[i + 2];
      const L = Math.hypot(px, py, pz) || 1;
      let x = n[i] * (1 - d) + (px / L) * d, y = n[i + 1] * (1 - d) + (py / L) * d, z = n[i + 2] * (1 - d) + (pz / L) * d;
      const m = Math.hypot(x, y, z) || 1;
      n[i] = x / m; n[i + 1] = y / m; n[i + 2] = z / m;
    }
    P.domeNorm = n;
  }
  const sh = eng.get('shading');
  const mk = (src, name, metal) => {
    if (!src || !sh?.make) return null;
    try {
      return sh.make({
        name, color: src.color ? src.color.getHex() : 0xe8b942,
        map: src.map || null, normalMap: src.normalMap || null, roughnessMap: src.roughnessMap || null,
        aoMap: src.aoMap || null, metalnessMap: src.metalnessMap || null,
        bands: 3, rim: 0.62, rimColor: 0x7fd4ff, spec: 0.75, gloss: 72, rough: 0.34, metal,
      });
    } catch { return null; }
  };
  P.candMatCoins = mk(P.baseMatCoins, 'pickups:coin', 0.30);
  P.candMatRings = mk(P.baseMatRings, 'arch:gold_ring', 0.30);
  return {
    coins: !!st.coins, coinInstances: st.coins?.count ?? 0,
    rings: !!st.rings, ringInstances: st.rings?.count ?? 0,
    treasures: st.treasures.map((t) => t.name),
    baseMetalCoins: P.baseMatCoins?.uniforms?.uMetal?.value ?? null,
    baseMetalRings: P.baseMatRings?.uniforms?.uMetal?.value ?? null,
    candMade: !!P.candMatCoins && !!P.candMatRings,
  };
};

/* Restore-first ARM: every arm assigns BOTH levers, so poke and restore are one code path. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE, P = window.__PROPS1;
  if (P.coins) {
    P.coins.material = cfg.metal ? (P.candMatCoins || P.baseMatCoins) : P.baseMatCoins;
    const na = P.coins.geometry?.attributes?.normal;
    if (na && P.baseNorm) { na.array.set(cfg.dome && P.domeNorm ? P.domeNorm : P.baseNorm); na.needsUpdate = true; }
  }
  if (P.rings) P.rings.material = cfg.metal ? (P.candMatRings || P.baseMatRings) : P.baseMatRings;
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);

  /* ROIs are re-derived from the LIVE instance matrices every arm, so they follow the object
     rather than a number typed off a picture (PREREG-coinlit §4). */
  const cam = eng.camera; cam.updateMatrixWorld(true);
  const W = eng.canvas.width, H = eng.canvas.height;
  const f = H / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
  const proj = (v) => {
    const p = v.clone().project(cam);
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z, d: v.distanceTo(cam.position) };
  };
  const THREE = eng.THREE || window.THREE;
  const roisOf = (mesh, size) => {
    const out = [];
    if (!mesh) return out;
    mesh.updateMatrixWorld(true);
    const n = mesh.isInstancedMesh ? mesh.count : 1;
    const m = new (mesh.matrixWorld.constructor)();
    for (let i = 0; i < n; i++) {
      let v;
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, m); m.premultiply(mesh.matrixWorld); v = { x: m.elements[12], y: m.elements[13], z: m.elements[14] }; }
      else { const w = mesh.matrixWorld.elements; v = { x: w[12], y: w[13], z: w[14] }; }
      const vv = new (cam.position.constructor)(v.x, v.y, v.z);
      const p = proj(vv);
      if (p.z >= 1) continue;
      const px = (size / p.d) * f;
      const half = Math.max(5, 0.55 * px);
      if (px < 10) continue;
      if (p.x - half < 16 || p.x + half > W - 16 || p.y - half < 8 || p.y + half > H - 8) continue;
      out.push([Math.round(p.x - half), Math.round(p.y - half), Math.round(p.x + half), Math.round(p.y + half), +px.toFixed(1), +p.d.toFixed(1)]);
    }
    return out;
  };
  const rois = {
    coins: roisOf(P.coins, 0.32),
    rings: roisOf(P.rings, 1.24),
    treasures: P.treasures.flatMap((t) => roisOf(t, 0.7)),
  };
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return {
    png: c.toDataURL('image/png'),
    rois,
    readback: {
      metalCoins: P.coins?.material?.uniforms?.uMetal?.value ?? null,
      metalRings: P.rings?.material?.uniforms?.uMetal?.value ?? null,
      matCoins: P.coins?.material?.name ?? null,
      matRings: P.rings?.material?.name ?? null,
      normSig: (() => { const a = P.coins?.geometry?.attributes?.normal?.array; if (!a) return null; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (i + 1); return +s.toFixed(6); })(),
      camY: eng.camera?.position?.y ?? null,
      timeOfDay: eng.debug?.timeOfDay ?? null,
    },
  };
};

/* ── the one boot ────────────────────────────────────────────────────────────────────────── */
let installed = false;
const onLocked = async () => {
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) { console.log(`ABORT — src/ dirty at lock grant (foreign residue, §186 — NOT ours, do not touch):\n${dirt}`); throw new Error('src dirty at lock grant'); }
  if (treeState().src !== HEAD_TREE.src) { console.log('ABORT — src moved between launch and lock grant'); throw new Error('tree drift before install'); }
  execFileSync('git', ['apply', PATCH], { cwd: ROOT });
  installed = true;
  const t = treeState();
  console.log(`INSTALLED cand-colossus.patch under the lock — src ${t.src} (was ${HEAD_TREE.src})`);
  manifest.installedSrc = t.src;
  save();
};
const onReleasing = async () => {
  if (!installed) { console.log('nothing was installed; nothing to restore'); return; }
  execFileSync('git', ['apply', '-R', PATCH], { cwd: ROOT });
  const t = treeState();
  const dirt = git('status', '--porcelain', '--', 'src/');
  console.log(dirt ? `!! src/ still dirty after revert — REPORT, do not touch:\n${dirt}` : `reverted; src ${t.src} (expected ${HEAD_TREE.src}) ${t.src === HEAD_TREE.src ? 'EXACT' : 'MISMATCH'}`);
};

console.log(`frames -> ${OUT}`);
await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    const prep = await page.evaluate(PREP);
    manifest.prep = prep; save();
    console.log(`inventory: coins=${prep.coins}(${prep.coinInstances}) rings=${prep.rings}(${prep.ringInstances}) treasures=[${prep.treasures}] baseMetal ${prep.baseMetalCoins}/${prep.baseMetalRings} candMade=${prep.candMade}`);
    if (!prep.coins && !prep.rings) throw new Error('SUBJECT ABSENT: neither pickup_coins nor hooks:rings is in the scene');
    let ord = 0;
    for (const shot of ROSTER) {
      if (!info.shots.includes(shot)) { console.log(`-- skip ${shot} (not in roster)`); continue; }
      await page.evaluate(STAGE, shot);
      console.log(`-- staged ${shot}`);
      for (const [arm, cfg] of [
        ['off', { metal: 0, dome: 0 }], ['mon', { metal: 1, dome: 0 }],
        ['non', { metal: 0, dome: 1 }], ['both', { metal: 1, dome: 1 }],
        ['back', { metal: 0, dome: 0 }],
      ]) {
        const got = await page.evaluate(ARM, cfg);
        const buf = Buffer.from(got.png.split(',')[1], 'base64');
        const file = `${shot}.${arm}.png`;
        writeFileSync(path.join(OUT, file), buf);
        const t = treeState();
        manifest.rows.push({
          shot, arm, file, sha256: createHash('sha256').update(buf).digest('hex'),
          tree: { src: t.src, head: t.head }, rois: got.rois, readback: got.readback,
          ordinal: ++ord, at: new Date().toISOString(),
        });
        save();
        console.log(`  #${String(ord).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${manifest.rows.at(-1).sha256.slice(0, 12)} metal ${got.readback.metalCoins}/${got.readback.metalRings} normSig ${got.readback.normSig} rois c${got.rois.coins.length} r${got.rois.rings.length} t${got.rois.treasures.length}`);
      }
    }
  });
console.log('DONE. Score with:  node progress/records/props1/coinlit-score.mjs');
