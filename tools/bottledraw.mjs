#!/usr/bin/env node
/**
 * bottledraw.mjs — what the twelve clue bottles actually cost, MEASURED.
 *
 * The reference project's `BOTTLE.glb` carries three materials where the procedural bottle it
 * replaces had one, and there are twelve bottles. The obvious reading of that is "3× on a set
 * that ships twelve times", and the obvious reading is exactly the kind of claim this project
 * has been burned by reasoning about instead of measuring (§589 left a draw-call comment in
 * `Guard.js` reading 11 guards after two had been removed). So this measures it.
 *
 * TWO INSTRUMENTS, because the first one alone is not trustworthy here (§466.5):
 *
 *   ISOLATED  hide every mesh in the scene, render, count; reveal ONLY the clue set, render,
 *             count again. The difference is exactly the draw submissions those meshes make.
 *             Deterministic — `pickup_clues` is `frustumCulled = false`, so it draws whatever
 *             the camera is doing — and it is the number that answers "did three materials
 *             become three draws".
 *   IN SITU   the same A/B against the live frame, sampled N times and reduced to a MEDIAN.
 *             The first version of this tool did it once and its own restore-check caught the
 *             result contaminated: 275 visible / 275 hidden / 277 restored, because guards,
 *             the player and the camera all move between reads and the frame's draw count moves
 *             with them. A single-frame difference on a live scene is noise, and it is quoted
 *             here with its spread rather than as a figure.
 *
 * Run it in a worktree at the parent commit for the BEFORE, and in the tree with the import for
 * the AFTER. Both numbers come out of the same instrument.
 *
 *   node tools/bottledraw.mjs
 */
import { withGame } from './harness.mjs';

export const NAMES = ['pickup_clues', 'clue_bottles'];

/**
 * The whole measurement, as ONE function so `bottleshot.mjs` can run it inside its own boot
 * instead of taking the capture lock a second time. Playwright serialises this to the page, so
 * it must close over nothing — everything it needs arrives in `names`.
 *
 * A boot on this container is minutes of exclusive lock; two tools measuring the same frame is
 * two waits for one answer.
 */
export const measureInPage = async (names) => {
    const eng = window.__ENGINE;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    /* Several frames, not one: `Engine.stats` is written at the end of a frame and the first
       one after a visibility flip can still be reporting the previous state. */
    const settle = async (n = 12) => { for (let i = 0; i < n; i++) await frame(); };
    const read = async () => { await settle(); return { draws: eng.stats.drawCalls, tris: eng.stats.triangles }; };

    /* The set is every mesh in the clue chain — the live `pickup_clues`, PROPS' decorative twin
       `clue_bottles` (hidden by Pickups, listed anyway so a regression that un-hides it is
       visible here), and any outline shell parented to either. Collected by name off the live
       scene rather than assumed, and reported, so a rename shows up as an empty set instead of
       as a delta of zero. */
    const found = [];
    eng.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      let p = o;
      while (p) { if (names.includes(p.name)) { found.push(o); return; } p = p.parent; }
    });

    const census = found.map((m) => ({
      name: m.name,
      instanced: !!m.isInstancedMesh,
      count: m.count ?? 1,
      visible: m.visible,
      material: m.material?.name || m.material?.type,
      vertexColors: !!m.material?.vertexColors,
      transparent: !!m.material?.transparent,
      side: m.material?.side,
      hasColorAttr: !!m.geometry?.attributes?.color,
      verts: m.geometry?.attributes?.position?.count ?? 0,
      tris: (m.geometry?.index?.count ?? m.geometry?.attributes?.position?.count ?? 0) / 3,
    }));

    /* ---- instrument 1: isolated render ---------------------------------------------------
       `renderer.render()` resets `info` at the top of every call, so each render below yields a
       clean count. This bypasses the PostFX composer deliberately — the question is how many
       draws the SCENE makes, and a composer pass is the same whatever the bottles are made of. */
    const r = eng.renderer, sc = eng.scene, cam = eng.camera;
    const meshes = [];
    sc.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes.push([o, o.visible]); });
    r.info.autoReset = true;
    meshes.forEach(([o]) => { o.visible = false; });
    r.render(sc, cam);
    const empty = r.info.render.calls;
    found.forEach((m) => { m.visible = true; });
    r.render(sc, cam);
    const onlyClues = r.info.render.calls;
    /* And each mesh alone, so a set of two reports as two rather than hiding a second draw. */
    const per = [];
    for (const m of found) {
      found.forEach((x) => { x.visible = false; });
      m.visible = true;
      r.render(sc, cam);
      per.push({ name: m.name, calls: r.info.render.calls - empty, tris: r.info.render.triangles });
    }
    meshes.forEach(([o, v]) => { o.visible = v; });

    /* ---- instrument 2: in-situ A/B, sampled ---------------------------------------------- */
    const was = found.map((m) => m.visible);
    const onS = [], offS = [];
    for (let i = 0; i < 9; i++) {
      found.forEach((m, k) => { m.visible = was[k]; });
      onS.push((await read()).draws);
      found.forEach((m) => { m.visible = false; });
      offS.push((await read()).draws);
    }
    found.forEach((m, k) => { m.visible = was[k]; });
    const back = await read();

    const med = (a) => [...a].sort((x, y) => x - y)[(a.length / 2) | 0];
    return {
      census,
      isolated: { empty, onlyClues, cost: onlyClues - empty, per },
      insitu: {
        on: med(onS), off: med(offS), onS, offS,
        spread: Math.max(...onS) - Math.min(...onS),
      },
      back,
    };
};

/** Print a measurement produced by `measureInPage`. Shared for the same reason. */
export function reportDraw(res) {
console.log('clue-bottle meshes in the live scene:');
for (const c of res.census) {
  console.log(`  ${c.name.padEnd(14)} ${c.instanced ? `instanced ×${String(c.count).padStart(2)}` : 'mesh        '}` +
    `  visible ${String(c.visible).padEnd(5)}  ${String(c.verts).padStart(4)} verts ${String(c.tris).padStart(4)} tris` +
    `  mat=${c.material} vcol=${c.vertexColors} colorAttr=${c.hasColorAttr} transparent=${c.transparent} side=${c.side}`);
}
if (!res.census.length) console.log('  (none — the names have changed and this measurement is meaningless)');

const I = res.isolated, S = res.insitu;
console.log('\nISOLATED RENDER — every other mesh hidden, so the count is only these');
console.log(`  scene with nothing visible   ${String(I.empty).padStart(4)} draws`);
console.log(`  scene with ONLY the bottles  ${String(I.onlyClues).padStart(4)} draws`);
for (const p of I.per) console.log(`     ${p.name.padEnd(14)} alone: ${p.calls} draw(s), ${p.tris} tris`);
console.log(`  ==> the clue-bottle set costs ${I.cost} draw call(s)` +
  `  (${I.per.filter((p) => p.calls > 0).length} of ${I.per.length} meshes drawing)`);

console.log('\nIN SITU — the live frame, 9 paired samples, median');
console.log(`  bottles VISIBLE   median ${String(S.on).padStart(4)}   samples ${S.onS.join(' ')}`);
console.log(`  bottles HIDDEN    median ${String(S.off).padStart(4)}   samples ${S.offS.join(' ')}`);
console.log(`  ==> median delta ${S.on - S.off} draw call(s), against a frame-to-frame spread of ${S.spread}`);
if (S.spread > 2) {
  console.log(`  (the live frame moves by ${S.spread} draws on its own, so this arm is corroboration ` +
    'for the isolated count above, not a figure in its own right)');
}
if (res.consoleErrors?.length) console.log(`\nconsole errors:\n  ${res.consoleErrors.join('\n  ')}`);
}

/* Run standalone. `bottleshot.mjs` imports the two exports above and folds this measurement into
   its own boot, so the pair costs one capture lock rather than two. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) =>
    page.evaluate(measureInPage, NAMES)
      .then((r) => ({ ...r, renderer: info.renderer, consoleErrors: info.consoleErrors })));
  console.log(`renderer: ${res.renderer}\n`);
  reportDraw(res);
}
