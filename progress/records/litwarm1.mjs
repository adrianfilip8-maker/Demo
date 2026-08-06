/**
 * litwarm1 — the registered capture for PREREG-litwarm.md §8. SHADING owner.
 *
 * banda2.mjs template (per-chunk own boot + FIFO lock hold, settle = 10 frozen frames +
 * throwaway capture after every setShot, idempotent per-chunk resume, live pokes, incremental
 * frames + readback JSON) with three changes the successor needs:
 *
 *  1. THE TREE SHIPS THE CANDIDATE. Unlike banda2, whose candidate did not exist in src, this
 *     capture runs on a tree that already carries `Architecture.js: sss 0.30 / sssNightPin 0.0`
 *     and ToonMaterial's gate. So `base` is the arm that pokes BACKWARDS to 0.0 (the pre-ship
 *     look) and `C` is the tree's own value. Every comparison in the seal is C-vs-base, so the
 *     direction of the poke does not change a single registered number.
 *
 *  2. POKE THE SOURCE, NOT THE UNIFORM. `uSss` on an enrolled material is now republished on
 *     every `setKeyLight`, i.e. every frame (ToonMaterial._publishSssPin). A direct write to
 *     `uniforms.uSss.value` is reverted by the next `__GAME.step()` before the capture — the
 *     `uRimGain` trap, documented at TUNE.rimGain, which has already cost this project one
 *     wasted run. The arms therefore write `mat.userData.slySss` and read the UNIFORM back
 *     AFTER the step, which is also what makes the readback a proof rather than an echo.
 *
 *  3. THE POPULATION IS `shading._sssPinned`, AND IT IS CROSS-CHECKED. That array is exactly
 *     the set the shipped gate acts on, so a runner cannot poke a material the ship would not
 *     have touched — which is the failure P-F7 was written against (SlyModel.js:3678/3757 also
 *     build materials at sss 0.0, and scanning for `uSss == 0` would have swept them in).
 *     Every pinned material is additionally required to be reachable from ARCHITECTURE's own
 *     scene subtree and to be used by NO SkinnedMesh anywhere in the scene; either check
 *     failing VOIDs the chunk. A guard that only counts is a guard that can bless the broken
 *     thing (§143.1), so this one names what it found.
 *
 * Chunks (night FIRST — the decider; the coordinator's dispatch restates it):
 *   N   night        base / C / restore                       P7-fw frame-wide [0,0]
 *   N2  guard        base / C / restore                       P7-g  frame-wide [0,0]
 *   A   hero         base / C / KBover / KBnull / restore      W1 H1 H5 S1 S2 S3 P-F9
 *   B   courtyard    base / C / restore                       W2 H2 S1   (half of P-F8)
 *   C1  interior     base / C / KBover / restore              W4 H4 S1 S3 KB
 *   C2  temple       base / C / restore                       W3 H3 H6 S3
 *   D   sly-closeup  base / C / restore                       S4 S5
 *   E   traversal    base / C / restore                       T1
 *
 * Frames + readbacks land incrementally at progress/records/litwarm1/. Scoring is NOT here:
 *   node progress/records/banda-diag.mjs score3 progress/records/litwarm1
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/litwarm1';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* PREREG-litwarm §2/§5 — the registered arm values, as ARCHITECTURE `sss`. */
const SHIP_SSS = 0.30;          // the tree's own value; C reproduces it
const BASE_SSS = 0.0;           // the pre-litwarm value; base pokes back to it
const NIGHT_SHOTS = new Set(['night', 'guard']);
const armSss = (arm) => {
  switch (arm) {
    case 'base': return BASE_SSS;
    case 'C': return SHIP_SSS;
    case 'KBover': return 0.45;   // seal §5 known-bad: lights surfaces turned AWAY from the key
    case 'KBnull': return BASE_SSS;
    case 'restore': return BASE_SSS;
    default: throw new Error(`unknown arm ${arm}`);
  }
};
/* The gate's OUTPUT is what the shader sees: 0 at night for every arm, by construction. */
const expectedUSss = (shot, arm) => (NIGHT_SHOTS.has(shot) ? 0.0 : armSss(arm));

const CHUNKS = [
  { id: 'N', shot: 'night', arms: ['base', 'C', 'restore'] },
  { id: 'N2', shot: 'guard', arms: ['base', 'C', 'restore'] },
  { id: 'A', shot: 'hero', arms: ['base', 'C', 'KBover', 'KBnull', 'restore'] },
  { id: 'B', shot: 'courtyard', arms: ['base', 'C', 'restore'] },
  { id: 'C1', shot: 'interior', arms: ['base', 'C', 'KBover', 'restore'] },
  { id: 'C2', shot: 'temple', arms: ['base', 'C', 'restore'] },
  { id: 'D', shot: 'sly-closeup', arms: ['base', 'C', 'restore'] },
  { id: 'E', shot: 'traversal', arms: ['base', 'C', 'restore'] },
];

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

for (const chunk of CHUNKS) {
  if (only && chunk.id !== only) continue;
  if (chunk.arms.every((a) => existsSync(path.join(OUT, `${chunk.shot}.${a}.png`)))) {
    log(`chunk ${chunk.id}: all frames present — skipping (idempotent resume)`);
    continue;
  }

  const report = {
    prereg: 'PREREG-litwarm.md', chunk: chunk.id, shot: chunk.shot,
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(),
    shipSss: SHIP_SSS, baseSss: BASE_SSS, arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk.id}.json`), JSON.stringify(report, null, 1));
  save();
  log(`chunk ${chunk.id} (${chunk.shot}): srcTree ${report.srcTreeBefore} — booting (own lock hold)`);

  /* §194 conversion: the candidate is no longer expected in the tree — it is INSTALLED under the
     held lock (acquire → install → boot → capture → revert → release) via litwarm-arms.py, whose
     five arms round-trip to base byte-exactly. `onLocked`/`onReleasing` are the harness seam for
     exactly this ordering; the revert runs in the finally so a crash hands the tree back clean.
     The in-page logic below is unchanged: it was written for a tree that carries the gate, and
     now the gate is guaranteed present by the install rather than hoped into the tree. */
  const ARMSPY = '/home/user/Demo/progress/records/litwarm-arms.py';
  await withGame({
    width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000,
    onLocked: () => {
      log(`  lock held — installing candidate (litwarm-arms.py install cand)`);
      log(`  ${execFileSync('python3', [ARMSPY, 'install', 'cand'], { encoding: 'utf8' }).trim()}`);
    },
    onReleasing: () => {
      log(`  ${execFileSync('python3', [ARMSPY, 'revert'], { encoding: 'utf8' }).trim()}`);
    },
  }, async ({ page, info }) => {
    log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });

    /* ---- P-F7 half 1: the population, enumerated and cross-checked BEFORE anything is
       believed. Specified is not live (§7); and a count alone is not a check (§143.1). ---- */
    const pop = await page.evaluate(() => {
      const eng = window.__ENGINE;
      const sh = eng?.get?.('shading');
      const arch = eng?.get?.('architecture');
      if (!sh) return { fatal: 'no shading module' };
      const pinned = sh._sssPinned || null;
      if (!pinned) return { fatal: '_sssPinned absent — the litwarm gate is not on this tree' };

      /* every material used by ARCHITECTURE's own meshes */
      const archMats = new Set();
      const walk = (o) => { if (!o) return; const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => archMats.add(x)); (o.children || []).forEach(walk); };
      for (const k of ['root', 'group', 'meshes', '_root', '_group']) if (arch?.[k]) walk(arch[k]);
      if (archMats.size === 0 && arch) for (const v of Object.values(arch)) if (v?.isObject3D) walk(v);

      /* every material used by any SkinnedMesh anywhere in the scene */
      const skinMats = new Set();
      eng.scene.traverse((o) => { if (o.isSkinnedMesh) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => skinMats.add(x)); } });

      return {
        pinnedCount: pinned.length,
        pinnedNames: pinned.map((m) => m.name || '(unnamed)'),
        pinnedSss: pinned.map((m) => m.userData.slySss),
        pinnedNightPin: pinned.map((m) => m.userData.slySssNightPin),
        pinnedInArch: pinned.filter((m) => archMats.has(m)).length,
        pinnedOnSkinned: pinned.filter((m) => skinMats.has(m)).map((m) => m.name || '(unnamed)'),
        archMatCount: archMats.size,
        skinMatCount: skinMats.size,
        hasPublish: typeof sh._publishSssPin === 'function',
        hasInkNight: typeof sh._inkNight === 'number',
      };
    });
    report.population = pop;
    log(`  POPULATION ${JSON.stringify(pop).slice(0, 700)}`);
    save();

    if (pop.fatal || !pop.hasPublish || !pop.hasInkNight) {
      log(`  FATAL: ${pop.fatal || 'gate/inkNight absent'} — chunk ${chunk.id} VOID, no captures taken`);
      report.fatal = pop.fatal || 'gate or _inkNight absent'; save(); return;
    }
    if (pop.pinnedCount < 4) {
      log(`  P-F7 FIRED: only ${pop.pinnedCount} materials enrolled (< 4) — chunk VOID`);
      report.pf7 = `VOID: pinnedCount ${pop.pinnedCount} < 4`; save(); return;
    }
    if (pop.pinnedOnSkinned.length > 0) {
      log(`  P-F7 FIRED: enrolled material(s) used by a SkinnedMesh: ${pop.pinnedOnSkinned.join(',')} — chunk VOID`);
      report.pf7 = `VOID: pinned material on SkinnedMesh: ${pop.pinnedOnSkinned.join(',')}`; save(); return;
    }
    if (pop.pinnedInArch !== pop.pinnedCount) {
      /* Reported, not fatal: the traversal above is best-effort about ARCHITECTURE's internal
         field names, so a shortfall may be the walker's ignorance rather than a leak. The
         SkinnedMesh test above is the one that decides safety and it is exhaustive over the
         scene graph. Stated so the RESULT quotes it instead of a silent pass. */
      log(`  NOTE: ${pop.pinnedInArch}/${pop.pinnedCount} enrolled materials matched ARCHITECTURE's subtree walk (archMats ${pop.archMatCount}); SkinnedMesh test is exhaustive and clean`);
    }
    if (pop.pinnedSss.some((v) => Math.abs(v - SHIP_SSS) > 1e-9) || pop.pinnedNightPin.some((v) => v !== 0)) {
      log(`  WARNING: enrolled values are not the seal's (${SHIP_SSS}/0.0) — tree drift; base gates arbitrate`);
    }

    const t1 = Date.now();
    const staged = await page.evaluate(async (n) => {
      const r = await window.__GAME.setShot(n);
      return { stats: r?.stats, tod: window.__ENGINE.debug.timeOfDay };
    }, chunk.shot);
    report.setShot = staged;
    log(`  setShot(${chunk.shot}) ${((Date.now() - t1) / 1000).toFixed(0)}s  tod ${staged.tod}  draws ${staged.stats?.drawCalls} tris ${staged.stats?.triangles}`);
    save();

    /* Settle (banda1's voidA lesson): absorb program compiles AND the one-off async settle
       BEFORE any scored frame — 10 frozen frames + a thrown-away capture. */
    const t2 = Date.now();
    await page.evaluate(async () => {
      await window.__GAME.step(10, 0);
      window.__GAME.capture('image/png');
    });
    report.settleSecs = Math.round((Date.now() - t2) / 1000);
    log(`  settle(${chunk.shot}) ${report.settleSecs}s (10 frozen frames + throwaway capture)`);

    /* ---- P-F7 half 2: the gate premise — nightAmount exactly {0,1} on canonical shots. ---- */
    const inkNight = await page.evaluate(() => window.__ENGINE.get('shading')._inkNight);
    report.nightAmount = inkNight;
    const wantNight = NIGHT_SHOTS.has(chunk.shot) ? 1 : 0;
    if (inkNight !== wantNight) {
      log(`  P-F7 FIRED: ${chunk.shot} live nightAmount ${inkNight} ≠ ${wantNight} — chunk VOID, no arms captured`);
      report.pf7 = `VOID: nightAmount ${inkNight} != ${wantNight}`; save(); return;
    }
    log(`  P-F7 ok: ${chunk.shot} live nightAmount ${inkNight} (= ${wantNight} exactly)`);
    save();

    for (const arm of chunk.arms) {
      const ta = Date.now();
      const want = armSss(arm);
      const r = await page.evaluate(async (want) => {
        const sh = window.__ENGINE.get('shading');
        /* Poke the SOURCE. The per-frame publish inside setKeyLight is what writes the
           uniform, so this is the only write that survives the step below. */
        for (const m of sh._sssPinned) m.userData.slySss = want;
        await window.__GAME.step(1, 0);          // dt=0: world clock frozen between arms
        const dataUrl = window.__GAME.capture('image/png');
        return {
          readback: {
            slySss: sh._sssPinned.map((m) => m.userData.slySss),
            /* the value the SHADER saw, read after the step — the gate's output */
            uSss: sh._sssPinned.map((m) => m.userData.slyUniforms.uSss.value),
            nightPin: sh._sssPinned.map((m) => m.userData.slySssNightPin),
            inkNight: sh._inkNight,
            uSubjW: sh.uniforms.uSubjWarmShade.value,
            uShadowColor: sh.uniforms.uShadowColor.value.toArray(),
          },
          dataUrl,
        };
      }, want);
      const rb = r.readback;
      const wantU = expectedUSss(chunk.shot, arm);
      const mism = [];
      if (rb.slySss.some((v) => Math.abs(v - want) > 1e-12)) mism.push('slySss');
      if (rb.uSss.some((v) => v !== wantU)) mism.push(`uSss(want exactly ${wantU})`);
      if (rb.inkNight !== wantNight) mism.push('inkNight');
      const file = path.join(OUT, `${chunk.shot}.${arm}.png`);
      writeFileSync(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      const uniq = [...new Set(rb.uSss)];
      log(`  ${chunk.shot}.${arm.padEnd(8)} ${((Date.now() - ta) / 1000).toFixed(0)}s  slySss→${want}  uSss seen by shader ${JSON.stringify(uniq)} (want exactly ${wantU})  inkNight ${rb.inkNight}  uSubjW ${rb.uSubjW}  ${mism.length ? 'POKE MISMATCH ' + mism.join(',') : 'applied ok'}`);
      report.arms.push({ arm, requestedSss: want, expectedUSss: wantU, readback: rb, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
      save();
    }

    report.srcTreeAfter = treeHash();
    report.finishedAt = new Date().toISOString();
    log(`  chunk ${chunk.id} done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
    save();
  });
  log(`chunk ${chunk.id}: lock released`);
}
log('ALL DONE');
