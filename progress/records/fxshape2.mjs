#!/usr/bin/env node
/**
 * fxshape2 — WHICH object family draws D12's dark floating rings/discs, measured by
 * suppression arms rather than argued. Sealed by PREREG-fxshape2.md; read that first.
 *
 * Six arms x five shots in ONE boot, every arm a page-side scene-graph detach — no source arm
 * exists on disk at any point, so §186 is satisfied by construction. Arms:
 *
 *   base        everything on
 *   nocoins     `pickup_coins` (Pickups' InstancedMesh: route trail + adopted spots) detached
 *   notreasure  the three `treasure_*` meshes detached (Pickups.update re-asserts `.visible`
 *               every frame — the same trap Trails set for fxshape — so DETACH, never hide)
 *   noringfx    the `ring` particle batch mesh detached — cane_ring/land_ring/dive_ring/
 *               dust_ring all render through it. THIS ARM TESTS THE REGISTERED §5.1 PRIOR.
 *   nopickups   the whole `pickups` root detached (the union / subject-present ceiling)
 *   base2       everything re-attached — VALIDITY + restore check
 *
 * Uniform background condition in EVERY arm (both bases included): `coin_sparkle` and
 * `coin_pop` are blocked at `_emit`. They spawn through the module-level rng sequence, which
 * is NOT re-seeded per arm, and they spawn AT the coins — the exact ROI pixels — so leaving
 * them live puts arm-to-arm rng jitter on the pixels under test. Blocked identically
 * everywhere, they never enter any diff.
 *
 * Clock (§275.1): `engine.time = 0` before every setShot, then `{ dt: 1/60 }`. Every arm
 * renders every shot at the same absolute 0.283 s, so coin bob/spin, treasure bob, flames,
 * gusts and guards are phase-identical across arms; particles left from the previous arm carry
 * a t0 from the old timeline, age negative, and are clipped by the vertex shader.
 *
 * Ride-along, base arm only: a THREE.Raycaster through every registered ROI centre against the
 * LIVE scene, first five hits into the manifest. `tools/pixat.mjs` cannot see Pickups (its
 * headless builder is Architecture + Props only), so this is the instrument that names live
 * meshes. Evidence, not a gate.
 *
 * This run makes NO ship claim and moves no parameter.
 *
 *   node progress/records/fxshape2.mjs
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROIS, SHOTS_UNDER_TEST, ARMS } from './fxshape2rois.mjs';

/* Provenance is sampled inside `onLocked` — after the FIFO grants and before vite spawns —
   which is fxdraw's seam, not fxshape's process-start defect (RESULT-fxshape §4). */
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
const PROVENANCE = { sha: null, shaWhen: 'onLocked', srcDirty: null, at: null };
const stampProvenance = () => {
  PROVENANCE.sha = git('rev-parse', 'HEAD');
  PROVENANCE.srcDirty = git('status', '--porcelain', 'src/') || '';
  PROVENANCE.at = new Date().toISOString();
};

const OUT = path.join(ROOT, 'shots', 'fxshape2');
await mkdir(OUT, { recursive: true });

const res = await withGame({ width: 1280, height: 720, quality: 'high', verbose: false, onLocked: stampProvenance }, async ({ page, info }) => {
  /* Inventory: prove every lever exists and reaches something before spending arms on it. A
     detach of a mesh nobody renders is an arm that silently does nothing — the failure this
     repo keeps paying for. */
  const inv = await page.evaluate(() => {
    const eng = window.__ENGINE;
    if (!eng) return { ok: false, why: 'no engine' };
    const fx = eng.get?.('fx');
    const pickups = eng.get?.('pickups');
    if (!fx) return { ok: false, why: 'no fx module' };
    if (!pickups) return { ok: false, why: 'no pickups module' };
    const ring = fx.batches?.get?.('ring');
    if (!ring?.mesh) return { ok: false, why: 'no ring batch mesh' };
    if (!pickups._coinMesh) return { ok: false, why: 'no pickup_coins mesh' };
    if (!pickups.root?.parent) return { ok: false, why: 'pickups root not in scene' };
    const treasures = (pickups.treasures ?? []).filter((t) => t.mesh);
    /* Uniform coin-FX block, installed once, applied in every arm. */
    window.__fxOrigEmit = fx._emit.bind(fx);
    window.__fxBlock = new Set(['coin_sparkle', 'coin_pop']);
    fx._emit = function (n, ...rest) {
      if (window.__fxBlock.has(n)) return null;
      return window.__fxOrigEmit(n, ...rest);
    };
    /* Detach registry: obj-and-parent pairs so every arm starts from a full restore. */
    window.__d12 = {
      detached: [],
      detach(o) { if (o?.parent) { this.detached.push([o, o.parent]); o.parent.remove(o); } },
      restoreAll() { for (const [o, p] of this.detached) p.add(o); this.detached = []; },
    };
    return {
      ok: true,
      coinInstances: pickups._coinMesh.count,
      treasures: treasures.map((t) => t.mesh.name),
      ringBatch: ring.mesh.name || 'fx ring batch',
      decoCoinsHidden: pickups._decoHidden ? pickups._decoHidden.visible === false : null,
    };
  });
  if (!inv.ok) throw new Error(`lever inventory failed: ${inv.why}`);
  console.log(`tree ${PROVENANCE.sha} · src dirty at capture: ${PROVENANCE.srcDirty ? 'YES' : 'no'}`);
  console.log(`levers: pickup_coins x${inv.coinInstances} · treasures [${inv.treasures.join(',')}] · ` +
    `ring batch ok · Props deco coins hidden: ${inv.decoCoinsHidden}`);

  const manifest = { provenance: PROVENANCE, inventory: inv, arms: {}, raycast: {} };

  /* PER-ARM tree stamps — added after fxshape run 3 VOIDed on exactly this. The FIFO lock
     serialises CAPTURES, not COMMITS: the working tree is shared, and run 3 measured another
     lane's commit (f4056f4, 18:59:16) landing between its `noring` and `noflash` arms — the
     later arms rendered a different tree and base2 diverged from base on 780k px. SANDS_NO_HMR
     ignores the watcher, but it does not make the boot immune (measured, not argued). A sha +
     src-content stamp per arm makes a mid-boot commit attributable to the exact arm boundary
     instead of poisoning the whole run silently; the scorer VOIDs across any stamp change.
     Content hash, not just sha (§273 rule 3): vite serves the working tree, and a dirty tree
     renders what is on disk whatever HEAD says. */
  const treeStamp = () => ({
    sha: git('rev-parse', 'HEAD'),
    srcTree: git('rev-parse', 'HEAD:src'),   // committed src/ content; moves iff a commit lands
    dirty: git('status', '--porcelain', 'src/') || '',   // the §186-install case
  });

  for (const arm of ARMS) {
    await page.evaluate((a) => {
      const eng = window.__ENGINE;
      const fx = eng.get('fx');
      const pickups = eng.get('pickups');
      const D = window.__d12;
      D.restoreAll();
      if (a === 'nocoins') D.detach(pickups._coinMesh);
      else if (a === 'notreasure') for (const t of pickups.treasures ?? []) { if (t.mesh) D.detach(t.mesh); }
      else if (a === 'noringfx') D.detach(fx.batches.get('ring').mesh);
      else if (a === 'nopickups') D.detach(pickups.root);
      return true;
    }, arm);

    manifest.arms[arm] = {};
    for (const shot of SHOTS_UNDER_TEST) {
      const r = await page.evaluate(async (s) => {
        window.__ENGINE.time = 0;              // §275.1: one absolute timeline for every arm
        const res2 = await window.__GAME.setShot(s, { dt: 1 / 60 });
        return { t: window.__ENGINE?.time ?? null, tris: res2.stats?.triangles,
          dataUrl: window.__GAME.capture('image/png', 0.92, 0) };
      }, shot);
      const b64 = r.dataUrl.slice(r.dataUrl.indexOf(',') + 1);
      await writeFile(path.join(OUT, `${arm}.${shot}.png`), Buffer.from(b64, 'base64'));
      manifest.arms[arm][shot] = { t: r.t, tris: r.tris, tree: treeStamp() };

      /* Ride-along ray-cast on the base arm, straight after this shot staged: what mesh is at
         each registered ROI centre, in the LIVE scene. */
      if (arm === 'base') {
        const rois = ROIS.filter((q) => q.shot === shot).map((q) => [q.id, q.x, q.y]);
        manifest.raycast[shot] = await page.evaluate(([list, W, H]) => {
          const eng = window.__ENGINE;
          const T = window.__GAME.THREE;   // Debug exposes THREE on the api (public surface)
          const ray = new T.Raycaster();
          const out = {};
          for (const [id, x, y] of list) {
            const ndc = new T.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1));
            ray.setFromCamera(ndc, eng.camera);
            const hits = ray.intersectObjects(eng.scene.children, true).slice(0, 5);
            out[id] = hits.map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(2)}m` +
              (h.instanceId !== undefined ? `#${h.instanceId}` : ''));
          }
          return out;
        }, [rois, 1280, 720]);
        console.log(`  base.${shot.padEnd(10)} rays: ${JSON.stringify(manifest.raycast[shot])}`);
      }
    }
    console.log(`  ${arm.padEnd(11)} captured ${SHOTS_UNDER_TEST.length} shots (t=${manifest.arms[arm][SHOTS_UNDER_TEST[0]].t})`);
  }

  /* Context ride-along for the separately-run combat attribution; nothing scored from it. */
  const ct = await page.evaluate(async () => {
    window.__ENGINE.time = 0;
    const r2 = await window.__GAME.setShot('combat', { dt: 1 / 60 });
    return { dataUrl: window.__GAME.capture('image/png', 0.92, 0), t: window.__ENGINE.time };
  });
  await writeFile(path.join(OUT, 'context.combat.png'),
    Buffer.from(ct.dataUrl.slice(ct.dataUrl.indexOf(',') + 1), 'base64'));
  console.log('  context.combat written (not an arm, nothing scored from it)');

  return { manifest, info };
});

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(res.manifest, null, 2));
console.log(`\nwrote ${ARMS.length}x${SHOTS_UNDER_TEST.length}+1 frames to ${OUT}`);
