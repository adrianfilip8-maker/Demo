/**
 * PREREG-fxink2 — the one-boot poke runner for the FX-raster-time ink exclusion.
 *
 *   bash tools/launch.sh /home/user/Demo/progress/records/fxfix/fxfix2.mjs \
 *        /home/user/Demo/progress/records/logs/fxfix2-run1.log /tmp/sands-of-ra/fxfix2.pid
 *
 * ONE boot, torchlight3's per-shot poke pattern (§302/§303). Eleven shots, staged once each
 * ({dt:0}; `combat` LAST via the §275.1 rewind + dt 1/60 recipe, because the swing band is a
 * particle-age phenomenon and a dt-0 staging ages it 0). Per staged shot:
 *   off -> bfx0 (fx.root hidden: the FX footprint reference) -> bon (cut 1.0) -> b50 (0.5) -> back
 * diff(off, back) brackets every intervening poke of that shot, fail-closed.
 *
 * *** THIS RUNNER INSTALLS NOTHING. *** The mechanism (FX.beginMaskPass + PostFX's coverage
 * target + TUNE.fxInkCut) is already in HEAD, inert and pin-tested (7a06bf1,
 * tests/fxink2.test.mjs), so the lever is a live per-frame uniform and no src byte changes
 * inside the lock window.
 *
 * Two things this runner checks that a frame cannot show you (both ABORT, cheaply, before the
 * lock is spent on unscoreable captures):
 *   - postfx.ok — a composite that failed to compile degrades to direct rendering and still
 *     produces a plausible-looking frame (§210.2's class);
 *   - uFxMask bound at the poked arms — a green gate over an unbound sampler would be scoring
 *     nothing at all, which is exactly the shape of §263.1's false attestation.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/fxfix2');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const die = (m) => { console.error(m); process.exit(2); };

if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} non-empty. Archive it (mv fxfix2 fxfix2-void-runN) and relaunch. No resume.`);
mkdirSync(OUT, { recursive: true });

const ROSTER = ['hero', 'temple', 'sly-closeup', 'courtyard', 'dunes', 'interior', 'night',
  'traversal', 'guard', 'sly-profile', 'combat'];      // combat LAST (its staging rewinds time)
const ARMS = [['off', {}], ['bfx0', { fxOff: 1 }], ['bon', { cut: 1.0 }], ['b50', { cut: 0.5 }], ['back', {}]];

const manifest = {
  seals: ['PREREG-fxink2'],
  head: git('rev-parse', 'HEAD'),
  installs: 'none — the mechanism ships inert in HEAD (7a06bf1); every arm is a live uniform poke',
  launchedAt: new Date().toISOString(), pid: process.pid,
  consoleErrors: [],
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

const STAGE = async (name) => {
  const eng = window.__ENGINE;
  if (name === 'combat') {
    /* §275/§275.1: the swing band is particle-age; dt 0 stages age 0 = alpha 0. Rewind to one
       absolute timeline, stage at dt 1/60 (t lands at 0.2833 — the fxdraw/fxshape recipe). */
    eng.time = 0;
    await window.__GAME.setShot('combat', { dt: 1 / 60 });
    eng.renderFrame(0);
    return { staged: name, t: eng.time };
  }
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name, t: eng.time };
};

const PROBE = async () => {
  const eng = window.__ENGINE;
  const fx = eng.get('fx'), pf = eng.get('postfx');
  return {
    postfxOk: !!pf?.ok,
    hasTuneCut: typeof pf?.tune?.fxInkCut === 'number',
    hasCutUniform: !!pf?.compositeMat?.uniforms?.uFxInkCut,
    hasMaskUniform: !!pf?.compositeMat?.uniforms?.uFxMask,
    hasBeginMask: typeof fx?.beginMaskPass === 'function',
    hasSharedFlag: typeof fx?.shared?.maskPass?.value === 'number',
    hasDecals: !!fx?.decals?.mesh,
  };
};

const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const fx = eng.get('fx'), pf = eng.get('postfx');
  /* base state, unconditionally */
  pf.tune.fxInkCut = 0;
  fx.root.visible = true;
  /* the arm */
  if (cfg.cut !== undefined) pf.tune.fxInkCut = cfg.cut;
  if (cfg.fxOff) fx.root.visible = false;

  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const cu = pf.compositeMat?.uniforms;
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uFxInkCut: cu?.uFxInkCut ? cu.uFxInkCut.value : 'ABSENT',
      /* V4: was the coverage target actually bound for this frame? */
      maskBound: cu?.uFxMask ? cu.uFxMask.value !== null : 'ABSENT',
      /* the coverage flag must be back at 0 after the pass — a stuck flag would render the
         whole game as a white-on-black mask, and it would do it silently on the NEXT arm */
      maskFlag: fx?.shared?.maskPass?.value ?? 'ABSENT',
      fxRootVis: !!fx.root.visible,
      decalVis: fx?.decals?.mesh ? !!fx.decals.mesh.visible : 'ABSENT',
      postfxOk: !!pf.ok,
      t: eng.time,
    },
  };
};

function saveFrame(shot, arm, got, ordinal, consoleErrors) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
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
    + `  cut=${rb.uFxInkCut} maskBound=${rb.maskBound} maskFlag=${rb.maskFlag}`
    + `  fxVis=${rb.fxRootVis} decalVis=${rb.decalVis} ok=${rb.postfxOk}`);
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
    if (!probe.postfxOk) throw new Error('ABORT — postfx.ok is false at boot: the composite fell back to direct rendering. Nothing scoreable can come out of this boot.');
    if (!probe.hasTuneCut || !probe.hasCutUniform || !probe.hasMaskUniform) throw new Error('ABORT — PostFX has no fxInkCut/uFxMask: PREREG-fxink2\'s mechanism is not in this boot\'s tree.');
    if (!probe.hasBeginMask || !probe.hasSharedFlag) throw new Error('ABORT — FX has no beginMaskPass/shared.maskPass: PREREG-fxink2\'s mechanism is not in this boot\'s tree.');
    manifest.probe = probe;
    saveManifest();

    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      const st = await page.evaluate(STAGE, shot);
      console.log(`-- staged ${shot} (${++n}/${ROSTER.length}, ${((Date.now() - t0) / 1000) | 0}s, t=${st.t})`);
      for (const [arm, cfg] of ARMS) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal, info.consoleErrors);
      }
    }
    manifest.consoleErrors = info.consoleErrors.slice(0, 40);
    saveManifest();
    if (info.consoleErrors.length) console.log(`!! ${info.consoleErrors.length} page console errors — V3 will VOID:\n${info.consoleErrors.slice(0, 5).join('\n')}`);
  });
console.log('DONE. Score with:');
console.log('  node progress/records/fxfix/fxink2-score.mjs');
