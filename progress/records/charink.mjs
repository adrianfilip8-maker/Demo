/**
 * charink.mjs — the `char-ink` capture, re-launched after the §139 rollback.
 *
 * PREREG: progress/records/PREREG-tuftbias.md (§1 and §5b). Scored by progress/records/chipscore.mjs
 * against the 27.81% dark / 17.76% very-dark baseline recorded at §131.2, AND by eye at a 4x crop —
 * the statistic does not rule (chipscore.mjs's own header says why).
 *
 * KNOB UNDER TEST: `SlyModel.TUNE.tuftInk = 0.40` (SlyModel.js:515), the ink-hull weight carried by
 * the three `furTuft*` card groups. REGISTERED PREDICTION IS A NULL: the chips do not visibly shrink.
 *
 * WHY THIS FILE EXISTS RATHER THAN `tools/shot.mjs`
 * §131.1 credited SHADING's in-page INK PROBE with closing the dead-knob escape *before* this run's
 * frame existed — which is what makes a null confirmatory rather than merely un-falsifying. That
 * probe output lived in `compose1/run.log`, which the rollback destroyed. The `src` state that
 * produced it survived, so the knob is still live, but a guarantee that rests on a log nobody can
 * open is not a guarantee. This run RE-STAMPS the probe from the same mesh, in its own log, in the
 * same boot as the frames it licenses. `tools/shot.mjs` is LOCKED and cannot carry a probe.
 *
 * WHAT IS BETWEEN THIS AND WHAT THE RENDERER DRAWS (§11 — the suffix NOT implemented):
 *  - The probe reads `material[i].userData.outline` and the `slyInk` vertex attribute. That is the
 *    data the outline shader multiplies its thickness by; it is NOT a measurement that the shell
 *    was *drawn* thinner. `hasShell` reports only that a `userData.slyOutline` mesh exists.
 *  - No arm, no poke: this is ONE tree captured once. It cannot compare 0.40 against 1.0 within
 *    the boot. The before-side is §131.2's committed baseline, taken at a different commit, so
 *    every agent's work sits in the delta — which is exactly why the crop rules and the number does
 *    not, and why the group-count assertion below aborts rather than warns.
 *  - `hero` is captured for the §7.3 silhouette/pose report, NOT for the ink question: at 185 px
 *    the chip population is not resolvable (§131.6).
 *
 * GROUP-COUNT ASSERTION: §133.3 — an ink arm hardcoded 8 groups against a mesh that has 11, and the
 * three it missed were the fur cards, i.e. the entire subject. The list is derived from the mesh and
 * cross-checked against the names; a mismatch ABORTS the run instead of producing a plausible number.
 */
import { withGame, grab } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/shots/char-ink';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

/* §121.4: stamp the SOURCE TREE, not the git SHA — three arms once stamped three SHAs on a
   byte-identical tree. Other agents edit live, so both are re-read after the run. */
const treeHash = () => execSync(
  `find /home/user/Demo/src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();
const playerHash = () => execSync(
  `find /home/user/Demo/src/player -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();

const PROV = {
  run: 'char-ink',
  startedAt: new Date().toISOString(),
  sha: execSync('git -C /home/user/Demo rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  dirty: execSync('git -C /home/user/Demo status --porcelain', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  srcTreeBefore: treeHash(),
  playerTreeBefore: playerHash(),
};
log(`provenance sha ${PROV.sha}  srcTree ${PROV.srcTreeBefore}  playerTree ${PROV.playerTreeBefore}  dirty ${PROV.dirty.length} file(s)`);

const PLAN = ['sly-closeup', 'hero'];
const rows = [];
const save = () => writeFileSync(path.join(OUT, 'charink.json'), JSON.stringify({ prov: PROV, rows }, null, 1));

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 3 * 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`booted. renderer=${info.renderer}  warnings=${info.warnings.length}  consoleErrors=${info.consoleErrors.length}`);
  if (info.warnings.length) info.warnings.forEach((w) => log(`  warn: ${w}`));

  /* ---- the re-stamped INK PROBE, before any frame is captured ---- */
  const probe = await page.evaluate(() => {
    const E = window.__ENGINE, ch = E.get('character');
    const mesh = ch?.mesh;
    if (!mesh) return { ok: false, why: 'no character mesh' };
    /* Must match SlyModel.js:703. Retyping this eight-long is the defect §133.3 records, so the
       count is asserted against the mesh and the names are only used for labelling. */
    const NAMES = ['fur', 'furCream', 'furDark', 'cloth', 'clothDark', 'gold', 'ink', 'eye',
      'furTuft', 'furTuftCream', 'furTuftDark'];
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const weights = mats.map((m) => m?.userData?.outline);
    const a = mesh.geometry.getAttribute('slyInk');
    let min = Infinity, max = -Infinity, zero = 0;
    if (a) for (let i = 0; i < a.count; i++) { const v = a.getX(i); if (v < min) min = v; if (v > max) max = v; if (v === 0) zero++; }
    let hasShell = false;
    E.scene.traverse((o) => { if (o.userData?.slyOutline) hasShell = true; });
    /* Per-group vertex counts, so "0.40 on 8454 verts" can be attributed to the CARDS rather than
       asserted. geometry.groups indexes the same array as material. */
    const perGroup = (mesh.geometry.groups || []).map((g, i) => ({
      i, name: NAMES[g.materialIndex] ?? `#${g.materialIndex}`,
      w: mats[g.materialIndex]?.userData?.outline, count: g.count,
    }));
    return {
      ok: true, matCount: mats.length, expected: NAMES.length, names: NAMES, weights,
      inkCount: a ? a.count : 0, inkMin: a ? min : null, inkMax: a ? max : null, inkZero: zero,
      hasShell, perGroup,
    };
  });

  PROV.probe = probe;
  log(`INK PROBE ${JSON.stringify({ ok: probe.ok, count: probe.inkCount, min: probe.inkMin, max: probe.inkMax, groups: probe.matCount, mats: probe.matCount, weights: probe.weights, hasShell: probe.hasShell })}`);
  save();

  if (!probe.ok || probe.matCount !== probe.expected) {
    log(`*** ABORT: group-count mismatch — mesh has ${probe.matCount}, list has ${probe.expected} (§133.3). No frame from this run may be scored. ***`);
    PROV.aborted = 'group-count mismatch';
    save();
    return;
  }
  const cards = probe.perGroup.filter((g) => g.name.startsWith('furTuft'));
  const cardVerts = cards.reduce((s, g) => s + g.count, 0);
  log(`  cards: ${cards.map((g) => `${g.name}=${g.w}(${g.count}v)`).join(' ')}  total ${cardVerts} indices across ${cards.length} groups`);
  if (!cards.length || cards.some((g) => g.w !== 0.40)) {
    log('  *** the furTuft* groups are NOT at 0.40 — this run does not test the knob it is named for ***');
  }

  for (const shot of PLAN) {
    const ta = Date.now();
    const r = await grab(page, shot);
    writeFileSync(path.join(OUT, `${shot}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    log(`  ${shot.padEnd(12)} ${((Date.now() - ta) / 1000).toFixed(0)}s  draws ${r.stats.drawCalls} tris ${r.stats.triangles} warn ${r.warnings}`);
    rows.push({ shot, stats: r.stats, warnings: r.warnings });
    save();
  }
});

PROV.srcTreeAfter = treeHash();
PROV.playerTreeAfter = playerHash();
PROV.finishedAt = new Date().toISOString();
save();
log(`srcTree  before ${PROV.srcTreeBefore} after ${PROV.srcTreeAfter}  ${PROV.srcTreeBefore === PROV.srcTreeAfter ? 'STABLE' : '*** MOVED — other agents edited during the run ***'}`);
log(`player   before ${PROV.playerTreeBefore} after ${PROV.playerTreeAfter}  ${PROV.playerTreeBefore === PROV.playerTreeAfter ? 'STABLE' : '*** MOVED — MY OWN FILES CHANGED MID-RUN, frames are not of a single tree ***'}`);
log(`done. frames in ${OUT}`);
