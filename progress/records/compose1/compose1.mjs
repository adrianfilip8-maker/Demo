/**
 * compose1 — PREREG-compose1.md arms A (composition) and B (Outline per-group ink), ONE BOOT.
 *
 * ONE BOOT, live TUNE/uniform pokes, dt = 0 between arms (Debug.js:162's within-boot rule),
 * following progress/records/drift/sweep2.mjs, which is the instrument §115 was measured on.
 *
 * ORDER IS PART OF THE SEAL:
 *   1. `night` FIRST (PREREG A.4 P-night). Night is what the cool terms are paid for; a night
 *      regression voids the day arms regardless of what they show.
 *   2. hero / temple / sly-closeup — the three shots the bands are registered on.
 *   3. The ink arms LAST, on sly-closeup, so a defect in the new attribute path cannot
 *      contaminate the composition numbers that are the point of the run.
 *
 * WHAT THIS IS NOT (§11 — the suffix between this and the published claim):
 *   - Arms are live pokes of the running page, not rebuilds. Anything that differs outside
 *     src/render is present identically in EVERY arm, so arm-vs-arm deltas are valid even
 *     while GEOMETRY edits src/world — but the absolute frames are of THIS tree, which is
 *     stamped below and must be re-checked after the run.
 *   - `base2` / `inknull` are self-controls, not treatments. If they are not bit-identical to
 *     their base, the poke/restore path leaked and every number in the run is void.
 *   - Frame-wide b-r cannot localise anything (§115.2: it cannot see green at all). The ROI
 *     hue scoring in roiscore.mjs carries the hue line; this file only produces frames.
 *   - The ink-null tests the POKE path and the attribute's inertness at 1.0. It cannot test
 *     this-code vs pre-change code, because one boot is one build. That residual rests on
 *     every shipped material declaring outline 1.0 (grepped) and on multiply-by-1.0 being
 *     bit-exact — stated as a claim, not smuggled in as a measurement.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

/* Subset selector, added for the item-B re-run (§133.3). Two flags, both opt-in, so the
   default invocation is byte-for-byte the run this file already documents:
     --only=ink   skip the composition loop entirely
     --tag=<t>    write frames/json under scratchpad/compose1-<t>/ instead of compose1/
   `--only=ink` exists because §133.1's composition result STANDS and must not be re-run: the
   bands are scored and closed, and a second run would mint a second set of composition numbers
   for the same question, which is §122.1's failure mode with one owner instead of two. The ink
   arms are the only part of this file with an open question attached. */
const ARGV = process.argv.slice(2);
const ONLY = (ARGV.find((a) => a.startsWith('--only=')) || '').slice(7);
const TAG = (ARGV.find((a) => a.startsWith('--tag=')) || '').slice(6);
const RUNDIR = `/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/compose1${TAG ? '-' + TAG : ''}`;
const OUT = path.join(RUNDIR, 'frames');
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

/* §121.4: stamp the SOURCE TREE, not the git SHA — three arms once stamped three SHAs on a
   byte-identical tree. src/world is being edited live by GEOMETRY, so this is re-read after. */
const treeHash = () => execSync(
  `find /home/user/Demo/src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();
const renderHash = () => execSync(
  `find /home/user/Demo/src/render -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();

const PROV = {
  startedAt: new Date().toISOString(),
  sha: execSync('git -C /home/user/Demo rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  dirty: execSync('git -C /home/user/Demo status --porcelain', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  srcTreeBefore: treeHash(),
  renderTreeBefore: renderHash(),
};
log(`provenance sha ${PROV.sha}  srcTree ${PROV.srcTreeBefore}  renderTree ${PROV.renderTreeBefore}  dirty ${PROV.dirty.length} file(s)`);

/* Ship values — read off ToonMaterial.TUNE, restated here so a mismatch in the readback is
   loud rather than silent. */
const SHIP = { fillSkyMix: 0.70, shadowBounceMix: 0.05, shadowBounceMixLit: 0.05 };
/* §119.4's ledger ceiling on the UNIFORM knob is ~0.10 (temple binds). "Uniform" means both
   ends of the depth gate take the same value, i.e. the §119 gate stays inert. */
const UNI = 0.10;

const ARMS = [
  ['base', {}],
  ['sbm010', { shadowBounceMix: UNI, shadowBounceMixLit: UNI }],
  ['fill0', { fillSkyMix: 0.0 }],
  ['compose', { shadowBounceMix: UNI, shadowBounceMixLit: UNI, fillSkyMix: 0.0 }],
  ['base2', {}],
];

/* night first — P-night. Then the three registered shots. */
const PLAN = ONLY === 'ink' ? [] : ['night', 'hero', 'temple', 'sly-closeup'];

/* Ink arms, sly-closeup only. `inkbase` re-establishes a base AFTER the composition arms have
   restored, so the ink deltas are measured against their own reference rather than across a
   restore. `allink0` is the DENOMINATOR: it is the total-figure-ink floor the registered
   prediction is a fraction of, which is why it is captured rather than estimated.

   *** DEFECT IN THE 16:11 RUN — READ BEFORE QUOTING ANY ITEM-B NUMBER ***
   The run that produced compose1.json / run.log used an EIGHT-name GROUPS list below. The
   character actually has ELEVEN material groups (`SlyModel.js:703`): the eight here plus
   `furTuft`, `furTuftCream`, `furTuftDark` — the fur *cards*, which carry `TUNE.tuftInk = 0.40`
   (`SlyModel.js:515`). The in-page ink probe recorded this in the run's own provenance and it
   was not read at the time: weights `[1,1,1,1,1,1,1,1,0.4,0.4,0.4]`, mats 11.

   Two consequences, both of which make the 16:11 item-B ratio answer a different question than
   the one PREREG B.3 registered:
     - `fur0` zeroed the fur BODY groups and left the fur CARDS inked at 0.4. B.3's prediction is
       explicitly about cards ("a 2.5 px border on every edge of an 18-26 px card"), so the arm
       did not apply the treatment its own prediction names.
     - `allink0` zeroed 8 of 11 groups, leaving 577 of 8454 verts (6.8%) still inked, so it is
       not the total-figure-ink floor it is described as — the DENOMINATOR is short.
   Numerator and denominator are therefore both understated and the net bias is not determinable
   from this run. The 26.3% / 28.8% figures are REAL measurements of body-fur ink against a
   partial floor; they are NOT a score of B.3. Fixed below for the re-run; the numbers already
   published stand as what the eight-name list measured. §11: the arm's name described something
   other than what it did. */
const FUR = ['fur', 'furCream', 'furDark'];
/* The fur CARDS — B.3's actual subject. Split from FUR so a re-run can size the cards alone,
   the body alone, and both, rather than conflating them again. */
const FUR_CARDS = ['furTuft', 'furTuftCream', 'furTuftDark'];
const INK_ARMS = [
  ['inkbase', null],
  ['inknull', { set: 'all', w: 1 }],      // self-control: must be 0 px vs inkbase
  ['furcards0', { set: 'cards', w: 0 }],  // B.3's ACTUAL subject: the tuft cards alone
  ['furbody0', { set: 'fur', w: 0 }],     // the body fur alone (what 16:11's `fur0` measured)
  ['furall0', { set: 'furall', w: 0 }],   // body + cards, the honest "fur" treatment
  ['allink0', { set: 'all', w: 0 }],      // TRUE floor: all 11 groups, zeroVerts must hit 8454
  ['inkrestore', { set: 'restore', w: 1 }], // restore control: must be 0 px vs inkbase
];

const rows = [];
const save = () => writeFileSync(
  path.join(OUT, '..', 'compose1.json'),
  JSON.stringify({ prov: PROV, ship: SHIP, uniform: UNI, rows }, null, 1),
);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 3 * 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — ${info.renderer || '?'}  warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`  WARN ${w}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 240)}`); });

  /* The new attribute must exist on the character's geometry before anything is believed.
     An unbound float attribute reads 0.0 and would erase every ink line — so this is checked
     in-page, on the real mesh, rather than inferred from the unit test. */
  const inkProbe = await page.evaluate(() => {
    const E = window.__ENGINE, ch = E.get('character');
    const mesh = ch?.mesh;
    if (!mesh) return { ok: false, why: 'no character mesh' };
    const a = mesh.geometry.getAttribute('slyInk');
    if (!a) return { ok: false, why: 'slyInk attribute ABSENT on sly_body' };
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < a.count; i++) { const v = a.getX(i); if (v < mn) mn = v; if (v > mx) mx = v; }
    return {
      ok: true, count: a.count, min: mn, max: mx,
      groups: mesh.geometry.groups.length,
      mats: Array.isArray(mesh.material) ? mesh.material.length : 1,
      weights: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m?.userData?.outline),
      hasShell: !!mesh.userData.slyShell,
      sig: mesh.geometry.userData.slyInkSig?.slice(0, 80),
    };
  });
  log(`INK PROBE ${JSON.stringify(inkProbe)}`);
  PROV.inkProbe = inkProbe;
  save();

  for (const shot of PLAN) {
    log(`===== ${shot} =====`);
    const st = await page.evaluate(async (n) => {
      const t = performance.now(); const r = await window.__GAME.setShot(n);
      return { ms: performance.now() - t, stats: r?.stats };
    }, shot);
    log(`  staged ${(st.ms / 1000).toFixed(0)}s  draws ${st.stats?.drawCalls} tris ${st.stats?.triangles}`);

    for (const [name, poke] of ARMS) {
      const ta = Date.now();
      const r = await page.evaluate(async ([SHIP, poke]) => {
        const E = window.__ENGINE, sh = E.get('shading');
        const v = { ...SHIP, ...poke };
        sh.tune.shadowBounceMix = v.shadowBounceMix;
        sh.tune.shadowBounceMixLit = v.shadowBounceMixLit;
        sh.tune.fillSkyMix = v.fillSkyMix;
        sh._refreshShadowColor();               // shadow knobs only reach the uniform here
        sh.uniforms.uFillSkyMix.value = v.fillSkyMix;
        await window.__GAME.step(1, 0);         // dt = 0: no sim advance between arms
        const dataUrl = window.__GAME.capture('image/png');
        const sc = sh.uniforms.uShadowColor.value, sl = sh.uniforms.uShadowColorLit.value;
        return {
          requested: v,
          readback: {
            fillSkyMix: sh.uniforms.uFillSkyMix.value,
            shadowBounceMix: sh.tune.shadowBounceMix,
            shadowBounceMixLit: sh.tune.shadowBounceMixLit,
            uShadowColor: [sc.r, sc.g, sc.b],
            uShadowColorLit: [sl.r, sl.g, sl.b],
          },
          dataUrl,
        };
      }, [SHIP, poke]);

      const mism = Object.keys(r.requested).filter((k) => Math.abs(r.readback[k] - r.requested[k]) > 1e-9);
      writeFileSync(path.join(OUT, `${shot}-${name}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      log(`  ${name.padEnd(11)} ${((Date.now() - ta) / 1000).toFixed(0)}s  shadow(${r.readback.uShadowColor.map((x) => x.toFixed(3)).join(',')}) lit(${r.readback.uShadowColorLit.map((x) => x.toFixed(3)).join(',')}) fill ${r.readback.fillSkyMix}  ${mism.length ? 'MISMATCH ' + mism.join(',') : 'applied ok'}`);
      rows.push({ kind: 'compose', shot, arm: name, ...r.readback, mismatch: mism });
      save();
    }
  }

  /* ---------------- item B: per-group ink weight, sly-closeup ---------------- */
  log('===== sly-closeup / INK ARMS =====');
  await page.evaluate(async () => { await window.__GAME.setShot('sly-closeup'); });

  for (const [name, poke] of INK_ARMS) {
    const ta = Date.now();
    const r = await page.evaluate(async ([poke, FUR, FUR_CARDS]) => {
      const E = window.__ENGINE, sh = E.get('shading'), ch = E.get('character');
      const mesh = ch?.mesh;
      /* Must match SlyModel.js:703 exactly. Derived from the mesh where possible rather than
         retyped, because retyping it eight-long is the defect this arm already shipped once. */
      const GROUPS = ['fur', 'furCream', 'furDark', 'cloth', 'clothDark', 'gold', 'ink', 'eye',
        'furTuft', 'furTuftCream', 'furTuftDark'];
      const n = Array.isArray(mesh?.material) ? mesh.material.length : 0;
      if (n !== GROUPS.length) return { fatal: `group-count mismatch: mesh has ${n}, list has ${GROUPS.length}` };
      /* Captured on the FIRST arm so `restore` puts the shipped weights back (tufts are 0.4,
         not 1.0 — restoring them to 1.0 would silently ship a thicker tuft hull). */
      if (!window.__inkShip) window.__inkShip = mesh.material.map((m) => m?.userData?.outline);
      let applied = null;
      if (poke && mesh) {
        const want = { fur: FUR, cards: FUR_CARDS, furall: [...FUR, ...FUR_CARDS], all: GROUPS,
          restore: GROUPS }[poke.set] || [];
        GROUPS.forEach((g, i) => {
          if (!want.includes(g)) return;
          mesh.material[i].userData.outline = poke.set === 'restore' ? window.__inkShip[i] : poke.w;
        });
        sh.reink(mesh);                        // the live re-derive path
        applied = GROUPS.map((g, i) => mesh.material[i]?.userData?.outline);
      }
      await window.__GAME.step(1, 0);
      const dataUrl = window.__GAME.capture('image/png');
      const a = mesh?.geometry.getAttribute('slyInk');
      let zero = 0;
      if (a) for (let i = 0; i < a.count; i++) if (a.getX(i) === 0) zero++;
      return { applied, zeroVerts: zero, totalVerts: a?.count ?? 0, dataUrl };
    }, [poke, FUR, FUR_CARDS]);
    if (r.fatal) { log(`  *** ${name}: ${r.fatal} — item B arms ABORTED ***`); break; }

    writeFileSync(path.join(OUT, `sly-closeup-${name}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    log(`  ${name.padEnd(11)} ${((Date.now() - ta) / 1000).toFixed(0)}s  weights ${JSON.stringify(r.applied)}  zeroVerts ${r.zeroVerts}/${r.totalVerts}`);
    rows.push({ kind: 'ink', shot: 'sly-closeup', arm: name, applied: r.applied, zeroVerts: r.zeroVerts, totalVerts: r.totalVerts });
    save();
  }
});

PROV.srcTreeAfter = treeHash();
PROV.renderTreeAfter = renderHash();
PROV.finishedAt = new Date().toISOString();
save();
log(`srcTree  before ${PROV.srcTreeBefore} after ${PROV.srcTreeAfter}  ${PROV.srcTreeBefore === PROV.srcTreeAfter ? 'STABLE' : '*** MOVED — arms straddle an edit, see PREREG note ***'}`);
log(`renderTree before ${PROV.renderTreeBefore} after ${PROV.renderTreeAfter}  ${PROV.renderTreeBefore === PROV.renderTreeAfter ? 'STABLE' : '*** MOVED ***'}`);
log('done');
