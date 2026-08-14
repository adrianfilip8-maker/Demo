/**
 * PREREG-fxghost2 / PREREG-rimfloor2 — the shared one-boot poke runner (run 1 of the §306
 * follow-ups).
 *
 *   bash tools/launch.sh progress/records/fxfix/fxfix1.mjs \
 *        /home/user/Demo/progress/records/logs/fxfix1-run1.log /tmp/sands-of-ra/fxfix1.pid
 *
 * ONE boot, torchlight3's per-shot poke pattern (§302/§303: on this renderer a [0,0] pixel bar
 * is legitimate ONLY same-boot; neither seal claims a cross-boot bar). Nine shots, staged once
 * each ({dt:0}). Per staged shot: `off` (all levers base) -> per-seal poke arms -> `back` (all
 * levers base). diff(off, back) brackets every intervening poke of that shot, fail-closed.
 *
 * *** THIS RUNNER INSTALLS NOTHING. *** Both seals' mechanisms are already in HEAD, inert and
 * pin-tested (tests/fxghost2.test.mjs, tests/rimfloor2.test.mjs), so every lever below is a
 * live uniform poke and no src byte changes inside the lock window. That is the whole reason
 * there is no PostFX.cand.js here and no §186 install/restore machinery: the parent run needed
 * it, this one provably does not, and a run that writes nothing to src cannot leave residue if
 * it is killed mid-boot.
 *
 * Levers (all live, §40 readbacks per arm):
 *   A  fx.batches.get('sandHigh').material.uniforms.uAmbGain    (base 1.0) — PREREG-fxghost2
 *      fx.batches.get('sandHigh').material.uniforms.uAlphaGain  (base 1.0)
 *      + sandHigh mesh.visible for the `ahide` pool-free reference arm
 *   C  postfx.tune.rimFloorOffCut          (composite re-reads per frame; base 0) — PREREG-rimfloor2
 *      shading.uniforms.uRimShadowFloorArch (sticky; base 0.55)
 *      postfx.tune.rimShadowFloor          (base 0.45; the `rimz` reference arm only)
 *
 * Every arm application is RESTORE-FIRST (c10postfx pattern): all five levers are reset to
 * base, then the arm's change is applied — so no arm can inherit a stale lever.
 *
 * PF7: one run = one out-dir; it never resumes. PF-mech: if the boot's composite lacks
 * uRimFloorOffCut, or the sandHigh batch lacks uAmbGain, or postfx has fallen back to direct
 * rendering, the run ABORTS before spending the lock on frames that cannot be scored.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/fxfix1');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const die = (m) => { console.error(m); process.exit(2); };

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} non-empty. Archive it (mv fxfix1 fxfix1-void-runN) and relaunch. No resume.`);
mkdirSync(OUT, { recursive: true });

/* ── the matrix ──────────────────────────────────────────────────────────────────────────── */
const A_SHOTS = new Set(['temple', 'night', 'interior', 'dunes', 'hero', 'courtyard']);
const A_LOOK = new Set(['sly-profile']);   // no gating ghost bar there — LOOK/census only
const C_SHOTS = new Set(['dunes', 'night', 'guard', 'hero', 'courtyard', 'sly-closeup', 'sly-profile']);
const ROSTER = ['hero', 'temple', 'sly-closeup', 'courtyard', 'dunes', 'interior', 'night',
  'guard', 'sly-profile'];

const armsFor = (shot) => {
  const arms = [['off', {}]];
  if (A_SHOTS.has(shot)) {
    arms.push(['ahide', { aHide: 1 }], ['g25', { amb: 0.25 }], ['g00', { amb: 0.0 }],
      ['t30', { alp: 0.30 }], ['t18', { alp: 0.18 }]);
  } else if (A_LOOK.has(shot)) {
    arms.push(['ahide', { aHide: 1 }], ['g00', { amb: 0.0 }], ['t18', { alp: 0.18 }]);
  }
  if (C_SHOTS.has(shot)) {
    arms.push(['k10', { cArch: 0.10 }], ['rimz', { sFloor: 0.0 }],
      ['w35', { offCut: 0.35 }], ['w45', { offCut: 0.45 }],
      ['b35', { cArch: 0.10, offCut: 0.35 }], ['b45', { cArch: 0.10, offCut: 0.45 }]);
  }
  arms.push(['back', {}]);
  return arms;
};

const manifest = {
  seals: ['PREREG-fxghost2', 'PREREG-rimfloor2'],
  head: git('rev-parse', 'HEAD'),
  installs: 'none — both mechanisms ship inert in HEAD; every arm is a live uniform poke',
  launchedAt: new Date().toISOString(), pid: process.pid,
  consoleErrors: [],
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

/* ── page-side ───────────────────────────────────────────────────────────────────────────── */

const STAGE = async (name) => {
  const eng = window.__ENGINE;
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name, t: eng.time };
};

/* One-shot mechanism probe: both knobs must be reachable in THIS boot's tree, and the
   composite must actually be running. A shader that failed to compile degrades PostFX to
   direct rendering and still produces a plausible-looking frame (§210.2's class) — which is
   precisely the failure a new composite branch can introduce, so it is checked, not assumed. */
const PROBE = async () => {
  const eng = window.__ENGINE;
  const fx = eng.get('fx'), pf = eng.get('postfx');
  const sand = fx.batches.get('sandHigh');
  return {
    postfxOk: !!pf?.ok,
    hasAmbGain: !!sand?.material?.uniforms?.uAmbGain,
    hasAlphaGain: !!sand?.material?.uniforms?.uAlphaGain,
    hasOffCut: !!pf?.compositeMat?.uniforms?.uRimFloorOffCut,
    hasTuneOffCut: typeof pf?.tune?.rimFloorOffCut === 'number',
    sandLive: sand?._used ?? -1,
    batches: [...fx.batches.keys()],
  };
};

/* Restore-first, then the arm's change; settle {dt:0}; capture; read back every lever (§40). */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const fx = eng.get('fx'), pf = eng.get('postfx'), sh = eng.get('shading');
  const sand = fx.batches.get('sandHigh');
  /* base state, unconditionally */
  sand.material.uniforms.uAmbGain.value = 1;
  sand.material.uniforms.uAlphaGain.value = 1;
  if (sand.mesh) sand.mesh.visible = true;
  pf.tune.rimFloorOffCut = 0;
  pf.tune.rimShadowFloor = 0.45;
  sh.uniforms.uRimShadowFloorArch.value = 0.55;
  /* the arm */
  if (cfg.amb !== undefined) sand.material.uniforms.uAmbGain.value = cfg.amb;
  if (cfg.alp !== undefined) sand.material.uniforms.uAlphaGain.value = cfg.alp;
  if (cfg.aHide) sand.mesh.visible = false;
  if (cfg.offCut !== undefined) pf.tune.rimFloorOffCut = cfg.offCut;
  if (cfg.sFloor !== undefined) pf.tune.rimShadowFloor = cfg.sFloor;
  if (cfg.cArch !== undefined) sh.uniforms.uRimShadowFloorArch.value = cfg.cArch;

  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const cu = pf.compositeMat?.uniforms;
  /* Any OTHER batch carrying a non-1 gain would mean the per-batch scoping argument is false. */
  const strayGains = [];
  for (const [k, b] of fx.batches) {
    if (k === 'sandHigh') continue;
    const a = b?.material?.uniforms?.uAmbGain?.value ?? 1;
    const p = b?.material?.uniforms?.uAlphaGain?.value ?? 1;
    if (a !== 1 || p !== 1) strayGains.push(`${k}:${a}/${p}`);
  }
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uAmbGain: sand.material.uniforms.uAmbGain.value,
      uAlphaGain: sand.material.uniforms.uAlphaGain.value,
      sandVis: !!sand.mesh?.visible,
      sandLive: sand._used ?? -1,
      uRimShadowFloorArch: sh.uniforms.uRimShadowFloorArch.value,
      uRimShadowFloor: cu?.uRimShadowFloor ? cu.uRimShadowFloor.value : 'ABSENT',
      uRimFloorOffCut: cu?.uRimFloorOffCut ? cu.uRimFloorOffCut.value : 'ABSENT',
      postfxOk: !!pf.ok,
      strayGains,
      t: eng.time,
    },
  };
};

function saveFrame(shot, arm, got, ordinal, consoleErrors) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  /* per-capture tree stamp (§296: a multi-arm run stamps the tree PER CAPTURE) */
  const t = treeState();
  manifest.rows.push({
    shot, arm, file, sha256: sha256(buf),
    tree: { src: t.src, head: t.head },
    readback: got.readback, consoleErrors: consoleErrors.length, ordinal,
    at: new Date().toISOString(),
  });
  saveManifest();
  const rb = got.readback;
  console.log(`  #${String(ordinal).padStart(2)} ${shot}.${arm}  sha ${manifest.rows.at(-1).sha256.slice(0, 16)}`
    + `  amb=${rb.uAmbGain} alp=${rb.uAlphaGain} sandVis=${rb.sandVis}`
    + `  arch=${rb.uRimShadowFloorArch} sfloor=${rb.uRimShadowFloor} offCut=${rb.uRimFloorOffCut}`
    + `  ok=${rb.postfxOk}${rb.strayGains.length ? ` STRAY[${rb.strayGains}]` : ''}`);
}

console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')}; src ${treeState().src}; frames -> ${OUT}`);
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  console.log(dirt ? `NOTE — src/ is dirty at launch (shared tree, other lanes):\n${dirt}`
    : 'src/ clean at launch');
}
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000 },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    for (const s of ROSTER) if (!info.shots.includes(s)) throw new Error(`roster drift: page lacks shot '${s}' (has [${info.shots}])`);

    const probe = await page.evaluate(PROBE);
    console.log(`probe: ${JSON.stringify(probe)}`);
    if (!probe.postfxOk) throw new Error('ABORT — postfx.ok is false at boot: the composite fell back to direct rendering (PF7/PF-mech). Nothing scoreable can come out of this boot.');
    if (!probe.hasAmbGain || !probe.hasAlphaGain) throw new Error('ABORT — sandHigh batch has no uAmbGain/uAlphaGain: PREREG-fxghost2\'s mechanism is not in this boot\'s tree.');
    if (!probe.hasOffCut || !probe.hasTuneOffCut) throw new Error('ABORT — composite has no uRimFloorOffCut: PREREG-rimfloor2\'s mechanism is not in this boot\'s tree.');
    manifest.probe = probe;
    saveManifest();

    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      const st = await page.evaluate(STAGE, shot);
      console.log(`-- staged ${shot} (${++n}/${ROSTER.length}, ${((Date.now() - t0) / 1000) | 0}s, t=${st.t})`);
      for (const [arm, cfg] of armsFor(shot)) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal, info.consoleErrors);
      }
    }
    manifest.consoleErrors = info.consoleErrors.slice(0, 40);
    saveManifest();
    if (info.consoleErrors.length) console.log(`!! ${info.consoleErrors.length} page console errors — V3 will VOID:\n${info.consoleErrors.slice(0, 5).join('\n')}`);
  });
console.log('DONE. Score with:');
console.log('  node progress/records/fxfix/fxghost2-score.mjs');
console.log('  node progress/records/fxfix/rimfloor2-score.mjs');
