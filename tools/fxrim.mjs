#!/usr/bin/env node
/**
 * fxrim.mjs — the capture half of §379.4's objective test: does the largest sprite in the game
 * carry any ink at all?
 *
 *   CHROME_PATH=… SANDS_NO_HMR=1 node tools/fxrim.mjs [shot]      # default: impact
 *
 * Scoring is `tools/fxrimscore.mjs`, which never opens a browser. Splitting them is not tidiness:
 * §400 records five container rollbacks, every one of which ate an in-flight capture, so the run
 * that holds the FIFO lock does the least work it can and the analysis happens later against
 * PNGs on disk.
 *
 * ── Why this is a DIFFERENCE instrument and not a colour threshold ──────────────────────────
 * The obvious reading of §379.4 is "count near-black pixels along the rim". §270 is the record of
 * that instrument being VOIDed: a detector that decides for itself which pixels are ink found, on
 * `night.png`, an "ink" median BRIGHTER than the frame median. And the authored hex is not what
 * lands in the file — `Outline.js`'s hull ink goes through the whole grade (display L 12.3–23.4),
 * while `PostFX.js:1373`'s crease ink is composited display-referred but leaks 5% of the
 * background through `inkStrength 0.95`, is faded by `smoothstep(0.05, 0.20, lum)`, and is then
 * multiplied by the vignette and smeared by FXAA. There is no threshold that is correct for both
 * systems and no threshold this project has ever agreed on.
 *
 * `inkblack.mjs` established the answer and its levers are reused here verbatim: **the ink is the
 * pixels the ink passes actually change.** Turn each pass off, diff, and the mask needs no
 * threshold and cannot be argued with.
 *
 * ── The arms, and what each one is for ──────────────────────────────────────────────────────
 *
 *   A-ship      shipped                                        the frame under test
 *   B-nocrease  postfx.tune.inkStrength = 0                    A−B = the CREASE (edge-detect) ink
 *   C-noink     B, plus `.layers.disable(0)` per `slyInk_*`    A−C = ALL ink;  B−C = the HULL ink
 *   N-nofx      shipped ink, `fx.root.visible = false`         A−N = every pixel FX draws
 *   S-nosly     shipped ink, `character.root.visible = false`  A−S = every pixel SLY draws
 *   Z-null      shipped again, nothing touched                 A−Z MUST be empty
 *
 * `A−C` is the ink map. `A−N` is the FX map, and it is the probe without which a rim measurement
 * is worthless: "no ink on the rim" and "the rim band is not on the ring" produce the identical
 * number, and only `A−N` can tell them apart. `Z-null` is the other side of the same worry — if
 * two renders of the same state already differ, every mask above is noise. It is captured LAST so
 * it also catches an arm that failed to restore what it changed.
 *
 * ── Why `S-nosly` exists, and it is the arm that keeps the comparison honest ─────────────────
 * §379.4 requires the rim to be measured against **the hero's silhouette boundary in the same
 * frame**, and that boundary has to be located by something other than the ink, or the
 * calibration probe is "ink is where the ink is". The hull mask `B−C` would locate it and is
 * exactly that circle. So Sly is located the same way the FX is: hide him and diff. `A−S` is the
 * region Sly occupies, its outline is his silhouette, and neither the locator nor its band knows
 * anything about where ink landed.
 *
 * `character.root.visible` is the lever `Debug.setShot` itself uses one line above `applyShot`
 * (`if (character?.root) character.root.visible = !shot.hidePlayer`), so it is the shipped
 * hide path rather than a new one — and §357-adjacent history says to arm it: `courtyard` once
 * passed every projection check while hiding the character changed zero pixels. `A != S` is
 * therefore asserted from the shas, not assumed.
 *
 * The hull lever is `layers.disable(0)` and not `.visible = false` for the reason `inkblack.mjs`
 * states and proved with its `C0` arm: `PostFX._renderChain`'s normal prepass calls
 * `shading.endNormalPass()` → `setOutlinesVisible(true)`, which writes `visible = true` back onto
 * every shell, so the `.visible` lever is dead by the second of the four rendered frames.
 * `setOutlinesVisible` never touches `.layers`.
 *
 * The FX lever is the ROOT group (`Particles.js:2268`, `this.root.name = 'fx'`). Nothing in
 * `Particles` ever writes `root.visible` — the auto-hide at :1532/:1907/:2116/:2244 and
 * `Decals.js:236` all act on child meshes, and their own comments say they never re-show a mesh
 * they did not hide. Hiding the parent cannot be undone by any of them.
 *
 * No shipped code changes inside the experiment: every lever is page-side, so no arm can perturb
 * arm A.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SHOT = process.argv[2] || 'impact';
const OUT = process.env.SANDS_OUT || `shots/fxrim-${SHOT}`;
mkdirSync(OUT, { recursive: true });

/**
 * ── The per-BATCH arms, and why they are batches and not emitters ───────────────────────────
 * §379.1 is a claim about particles as a class, and round 16 measured exactly one sprite. The
 * other three staged by `_stageImpact` need their own footprints, and the only non-perturbing
 * lever is `Batch.mesh.visible` — `_fold()`'s own comment guarantees it survives, because it
 * "only ever re-shows a mesh *it* hid, so an external `mesh.visible = false` (the A/B
 * harnesses' apply step) survives the next update instead of being fought over".
 *
 * `this.batches` is keyed by BATCH, not by emitter, and `dive_dust` and `dive_debris` both draw
 * into `dust` — so that arm isolates the PAIR and is reported as the pair. The alternative,
 * poking `EMITTERS[name].count` to zero through the documented harness seam, was rejected: it
 * requires re-running `_stageShot`, which re-draws the RNG for every other emitter too, so the
 * diff would carry their differences as well as the removed one. A lever that perturbs the
 * control is not a lever.
 *
 * Each arm records the live instance count of every batch, so "this population was empty" can
 * never be mistaken for "this population carries no ink" (§211.1).
 */
const ARMS = [
  { tag: 'A-ship',     crease: null, hull: 'on',     fx: true,  sly: true,  batch: null },
  { tag: 'B-nocrease', crease: 0,    hull: 'on',     fx: true,  sly: true,  batch: null },
  { tag: 'C-noink',    crease: 0,    hull: 'layers', fx: true,  sly: true,  batch: null },
  { tag: 'N-nofx',     crease: null, hull: 'on',     fx: false, sly: true,  batch: null },
  { tag: 'S-nosly',    crease: null, hull: 'on',     fx: true,  sly: false, batch: null },
  { tag: 'P-noring',   crease: null, hull: 'on',     fx: true,  sly: true,  batch: 'ring'  },
  { tag: 'P-nodust',   crease: null, hull: 'on',     fx: true,  sly: true,  batch: 'dust'  },
  { tag: 'P-nospark',  crease: null, hull: 'on',     fx: true,  sly: true,  batch: 'spark' },
  { tag: 'Z-null',     crease: null, hull: 'on',     fx: true,  sly: true,  batch: null },
];

/**
 * ── SANDS_CENSUS=1: the hull half of §379.1, asked of the scene graph instead of the pixels ──
 *
 * §379.4's rim measurement settles the CREASE treatment and deliberately says nothing about the
 * HULL one, because the only pixel-side locator for a hero silhouette is the hull's own
 * footprint and measuring hull ink on it is circular.
 *
 * The hull question does not need pixels. `buildOutlineShell` stamps `mesh.userData.slyShell`
 * on every mesh it inks and `shell.userData.slyOutline` on the shell itself, and those two
 * markers are the hull system's own record of what it has done. So: walk the shipped scene,
 * enumerate every shell, report which subtree each one belongs to, and separately report every
 * mesh under `fx.root` with whether it carries the marker. No stub, no reimplementation of the
 * gate, no threshold — the hull system is simply asked what it inked.
 *
 * `Outline.inkAudit()` was written for exactly this and **is never called anywhere in `src/`** —
 * exported, and referenced only in comments (`Outline.js:55`, `KayKit.js:403`). That is the
 * §357.1 shape once more, so it is invoked here through the page's own module rather than
 * reimplemented, when it can be reached; the marker census below does not depend on it.
 *
 * Captures no PNGs. Boot, probe, release — the lock is held for as short a time as possible.
 */
if (process.env.SANDS_CENSUS === '1') {
  let ctree = null;
  const census = await withGame({
    width: 1280, height: 720, quality: 'high', timeout: 900000,
    onLocked: () => { ctree = treeState(); },
  }, async ({ page }) => {
    await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, SHOT);
    return page.evaluate(() => {
      const eng = window.__ENGINE;
      const fx = eng.get('fx');
      const fxRoot = fx?.root ?? eng.scene.getObjectByName('fx') ?? null;

      /* Every shell in the scene, and which subtree owns it. `slyOutline` is the marker
         `buildOutlineShell` puts on the shell; `slyShell` is the back-pointer on the host. */
      const shells = [];
      eng.scene.traverse((o) => {
        if (!o.userData?.slyOutline) return;
        const chain = [];
        for (let p = o; p; p = p.parent) chain.push(p.name || p.type);
        shells.push({ mat: o.material?.name ?? null, chain: chain.slice(0, 6).join(' < ') });
      });

      /* Every mesh under the FX root, and whether the hull system inked it. */
      const fxMeshes = [];
      fxRoot?.traverse?.((o) => {
        if (!o.isMesh) return;
        fxMeshes.push({
          name: o.name || o.type,
          mat: Array.isArray(o.material) ? o.material.map((m) => m?.name).join(',') : (o.material?.name ?? null),
          instanced: !!o.isInstancedMesh || !!o.geometry?.isInstancedBufferGeometry,
          shell: !!o.userData?.slyShell,
          outlineDecl: Array.isArray(o.material)
            ? o.material.map((m) => m?.userData?.outline ?? null)
            : (o.material?.userData?.outline ?? null),
        });
      });
      const underFx = new Set();
      fxRoot?.traverse?.((o) => underFx.add(o));
      return {
        fxRootFound: !!fxRoot,
        shells: shells.length,
        shellsUnderFx: shells.filter((s) => s.chain.includes(' < fx')).length,
        shellSample: shells.slice(0, 4),
        fxMeshes,
        fxMeshCount: fxMeshes.length,
        fxInked: fxMeshes.filter((m) => m.shell).length,
      };
    });
  });
  console.log(`census · shot ${SHOT} · tree ${ctree?.src} (HEAD ${ctree?.head})`);
  console.log(`fx root found      ${census.fxRootFound}`);
  console.log(`meshes under fx    ${census.fxMeshCount}`);
  console.log(`  of those, inked  ${census.fxInked}   <- hull shells the system built for FX`);
  console.log(`shells in scene    ${census.shells}  (under fx: ${census.shellsUnderFx})`);
  for (const s of census.shellSample) console.log(`  shell ${s.mat}  ${s.chain}`);
  for (const m of census.fxMeshes) {
    console.log(`  fxmesh ${String(m.name).padEnd(18)} instanced ${String(m.instanced).padEnd(5)} shell ${String(m.shell).padEnd(5)} outlineDecl ${JSON.stringify(m.outlineDecl)}`);
  }
  writeFileSync(`${OUT}/census.json`, JSON.stringify({ shot: SHOT, tree: ctree, ...census }, null, 2));
  console.log(`\n→ ${OUT}/census.json`);
  process.exit(0);
}

let tree = null;
const got = await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 900000,
  /* Read inside `onLocked`, so it describes the tree vite is about to bundle rather than the
     tree at queue time — on this FIFO those can be an hour apart (harness.mjs's own note). */
  onLocked: () => { tree = treeState(); },
}, async ({ page, info }) => {
  await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, SHOT);
  const out = [];
  for (const a of ARMS) {
    out.push(await page.evaluate(async (arm) => {
      const eng = window.__ENGINE;
      const postfx = eng.get('postfx');
      const fx = eng.get('fx');

      /* Every arm restores all three channels before applying its own, so arm order cannot
         leak. PostFX copies tune.inkStrength into its uniform every frame. */
      postfx.tune.inkStrength = (arm.crease === null) ? 0.95 : arm.crease;

      let hulls = 0;
      eng.scene.traverse((o) => {
        if (!(o.isMesh && o.material && typeof o.material.name === 'string'
              && o.material.name.startsWith('slyInk_'))) return;
        hulls++;
        o.visible = true;
        o.layers.enable(0);
        if (arm.hull === 'layers') o.layers.disable(0);
      });

      /* Counted, not assumed: an arm that matched no FX root would answer "FX draws nothing"
         and the rim probe below would then read as a confirmation of the hypothesis. */
      const fxRoot = fx?.root ?? eng.scene.getObjectByName('fx') ?? null;
      if (fxRoot) fxRoot.visible = arm.fx;

      const slyRoot = eng.get('character')?.root ?? null;
      if (slyRoot) slyRoot.visible = arm.sly;

      /* Batches: restore every one, then hide this arm's. Live counts recorded for all of them
         so an empty population can never be read as an un-inked one. */
      const live = {};
      let batchFound = false;
      if (fx?.batches?.forEach) {
        fx.batches.forEach((b, name) => {
          if (!b?.mesh) return;
          live[name] = b.geometry?.instanceCount ?? b._used ?? null;
          if (live[name] > 0) b.mesh.visible = true;
          if (arm.batch && name === arm.batch) { b.mesh.visible = false; batchFound = true; }
        });
      }

      await window.__GAME.step(3, 0);
      eng.renderFrame(0);
      const src = eng.canvas;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
      return {
        tag: arm.tag,
        applied: {
          inkStrength: postfx.tune.inkStrength, hullDefeat: arm.hull, hulls,
          fxRootFound: !!fxRoot, fxVisible: fxRoot ? fxRoot.visible : null,
          slyRootFound: !!slyRoot, slyVisible: slyRoot ? slyRoot.visible : null,
          batchHidden: arm.batch ?? null, batchFound, live,
        },
        png: c.toDataURL('image/png'),
      };
    }, a));
  }
  return { arms: out, renderer: info.renderer, warnings: info.warnings };
});

/* ── PER-ARM tree stamping (§398, applied to this tool) ──────────────────────────────────────
   The first version of this file stamped `treeState()` ONCE, in `onLocked`, and wrote it onto
   every arm. That is precisely the defect §398 landed in `critic.mjs` and it bit here: a lane
   edited `src/player/Moveset.js` around the round-17 run and the artefact could not say whether
   any arm straddled it. One stamp per run says the tree was X when the run began; it cannot say
   which frame existed before the edit and which after.
   Under `SANDS_NO_HMR=1` the page is bundled once at boot, so a later edit almost certainly
   never reaches any arm — but "almost certainly" is the reasoning this project refuses, and the
   whole point of a stamp is to make the question answerable instead of arguable. */
const rows = [];
let straddled = false;
for (const r of got.arms) {
  const file = `${OUT}/${SHOT}-${r.tag}.png`;
  const buf = Buffer.from(r.png.split(',')[1], 'base64');
  writeFileSync(file, buf);
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const now = treeState();
  const moved = tree?.src && now.src !== tree.src;
  if (moved) straddled = true;
  rows.push({ shot: SHOT, arm: r.tag, file, sha, applied: r.applied, tree: now, treeAtLock: tree, treeMoved: !!moved });
  console.log(`${r.tag.padEnd(11)} ${sha}  ink ${r.applied.inkStrength}  hull ${r.applied.hullDefeat} (${r.applied.hulls} shells)  fx ${r.applied.fxVisible}`
    + (moved ? `  §186 TREE MOVED ${tree.src} → ${now.src}` : ''));
}
if (straddled) {
  console.log(`\n!! §186: src/** moved while this set was capturing. The arms are UNATTRIBUTABLE`);
  console.log(`   as a set — re-take in a quiet window, or score only questions that cannot turn`);
  console.log(`   on the files that moved, and say which in the write-up.`);
}
writeFileSync(`${OUT}/arms.json`, JSON.stringify({
  shot: SHOT, at: new Date().toISOString(), tree, renderer: got.renderer,
  warnings: got.warnings, arms: rows,
}, null, 2));

/* The two instrument checks that can be made from shas alone, printed here so a killed scoring
   run still leaves the verdict on them in the log. */
const sha = (t) => rows.find((r) => r.arm === t)?.sha;
console.log(`\nZ == A  ${sha('Z-null') === sha('A-ship') ? 'YES — the renderer is deterministic across arms' : 'NO — EVERY MASK BELOW IS NOISE'}`);
console.log(`C != A  ${sha('C-noink') !== sha('A-ship') ? 'YES — the ink levers move pixels' : 'NO — the ink defeat is dead, the ink map would be empty'}`);
console.log(`N != A  ${sha('N-nofx') !== sha('A-ship') ? 'YES — the FX lever moves pixels' : 'NO — the FX defeat is dead, the presence probe cannot fire'}`);
console.log(`S != A  ${sha('S-nosly') !== sha('A-ship') ? 'YES — the Sly lever moves pixels' : 'NO — the hero locator is dead, the MUST-FIND probe cannot fire'}`);
console.log(`\n→ ${OUT}/  · score with:  node tools/fxrimscore.mjs ${OUT}`);
