/**
 * critic10postfx — one boot for PREREG-critic10-postfx.md:
 *   item 1: traversal's blooming character — candidate `bloomSubjectCut` (arms {0,1}) plus the
 *           critic's own threshold/knee lever (T260/T290, report-only) and the bloomoff /
 *           sparkoff attribution arms;
 *   item 2: the r10 "lens-ghost" blobs — sandHigh/sandLow/shimmer attribution arms on the four
 *           ghost shots (NO ship; routing evidence for FX per §135/§138/fx22).
 *
 * §186 ordering: the candidate is installed `onLocked` (after the FIFO grant, before vite reads
 * the tree) and restored `onReleasing`, so the edit never exists under src/** outside the lock
 * window. Original bytes are snapshotted before anything runs and the restore is sha-verified.
 *
 * World clock: every setShot passes { dt: 0 } and every arm re-render is renderFrame(0), so all
 * arms of a shot are phase-aligned (§251). The ghost retry rule (PREREG §6) advances the clock
 * by step(300, 1/60) ONCE for a shot whose base/nosandhigh pair shows no >=800 px component,
 * then captures a full second generation of that shot's arms at the new frozen time.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import path from 'node:path';

const SRC = '/home/user/Demo/src/render/PostFX.js';
const CAND = '/home/user/Demo/progress/records/critic10postfx/PostFX.cand.js';
const OUT = '/home/user/Demo/shots/c10postfx';
const W = 1280, H = 720;

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const origBytes = readFileSync(SRC);
const candBytes = readFileSync(CAND);
console.log(`orig  ${SRC}  sha256 ${sha(origBytes)}`);
console.log(`cand  ${CAND} sha256 ${sha(candBytes)}`);

/* ---- per-arm configuration, applied restore-first so each job is independent ---- */
const APPLY = `(cfg) => {
  const E = window.__ENGINE, fx = E.get('fx'), pf = E.get('postfx');
  const seen = [];
  /* restore-first */
  for (const [, b] of fx.batches) if (b?.mesh) b.mesh.visible = true;
  for (const n of ['sparkles', 'flames', 'shafts']) if (fx[n]?.mesh) fx[n].mesh.visible = true;
  pf.setEnabled('bloom', true);
  pf.tune.bloomThreshold = 2.20;
  pf.tune.bloomKnee = 0.30;
  pf.tune.bloomSubjectCut = 0;

  if (cfg.tune) for (const [k, v] of Object.entries(cfg.tune)) { pf.tune[k] = v; seen.push(k + '=' + v); }
  if (cfg.bloomOff) { pf.setEnabled('bloom', false); seen.push('bloom OFF'); }
  if (cfg.off) {
    const b = fx.batches.get(cfg.off);
    if (b?.mesh) { b.mesh.visible = false; seen.push('OFF batch ' + cfg.off); }
    else seen.push('!! NO BATCH NAMED ' + cfg.off);
  }
  if (cfg.offSystem) {
    const s = fx[cfg.offSystem];
    if (s?.mesh) { s.mesh.visible = false; seen.push('OFF system ' + cfg.offSystem); }
    else seen.push('!! NO SYSTEM ' + cfg.offSystem);
  }
  return seen.join(' ') || 'baseline';
}`;

/* ---- provenance probe: applied uniforms (§40), batch state, camera, subject bbox ---- */
const PROBE = `() => {
  const E = window.__ENGINE, fx = E.get('fx'), pf = E.get('postfx'), L = E.get('lighting');
  const T = window.__GAME.THREE, A = L?.atmosphere, cam = E.camera;
  cam.updateMatrixWorld(true);
  const p = new T.Vector3(); cam.getWorldPosition(p);
  const out = {
    time: +E.time.toFixed(4), frame: E.frame,
    tod: A ? +A.tod.toFixed(4) : null,
    cam: { pos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], fov: +cam.fov.toFixed(2) },
    /* the values the shaders actually got, never tune (§40) */
    applied: {
      bloomEnabled: !!pf.passes.bloom.enabled,
      threshold: pf.brightMat ? [+pf.brightMat.uniforms.uThreshold.value.x.toFixed(3), +pf.brightMat.uniforms.uThreshold.value.y.toFixed(3)] : null,
      subjCut: pf.brightMat?.uniforms?.uSubjCut ? +pf.brightMat.uniforms.uSubjCut.value.toFixed(3) : 'ABSENT',
    },
    batches: {}, systems: {},
    subjBBox: null,
  };
  for (const [n, b] of fx.batches) out.batches[n] = { live: b._used ?? -1, vis: !!b.mesh?.visible };
  for (const n of ['sparkles', 'flames', 'shafts']) if (fx[n]) out.systems[n] = { vis: !!fx[n].mesh?.visible };
  /* character screen bbox: root +/- 1.2 m radius, root -> +1.9 m up, projected (PREREG B2) */
  const ch = E.get('character');
  if (ch?.root) {
    const c = ch.root.position, v = new T.Vector3();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
    for (const [dx, dy, dz] of [[-1.2,0,-1.2],[1.2,0,-1.2],[-1.2,0,1.2],[1.2,0,1.2],
                                [-1.2,1.9,-1.2],[1.2,1.9,-1.2],[-1.2,1.9,1.2],[1.2,1.9,1.2]]) {
      v.set(c.x + dx, c.y + dy, c.z + dz).project(cam);
      if (v.z > 1) behind = true;
      const sx = (v.x * 0.5 + 0.5) * ${W}, sy = (-v.y * 0.5 + 0.5) * ${H};
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    out.subjBBox = behind ? 'BEHIND' : [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
  }
  return out;
}`;

/* ---- the matrix (PREREG §4) ---- */
const MATRIX = [
  ['traversal', [
    ['base', {}],
    ['subj1', { tune: { bloomSubjectCut: 1 } }],
    ['T260', { tune: { bloomThreshold: 2.60, bloomKnee: 0.30 } }],
    ['T290', { tune: { bloomThreshold: 2.90, bloomKnee: 0.20 } }],
    ['bloomoff', { bloomOff: true }],
    ['sparkoff', { offSystem: 'sparkles' }],
    ['back', {}],
  ]],
  ['night', [
    ['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['bloomoff', { bloomOff: true }],
    ['nosandhigh', { off: 'sandHigh' }], ['back', {}],
  ]],
  ['interior', [
    ['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['bloomoff', { bloomOff: true }], ['back', {}],
  ]],
  ['sly-closeup', [
    ['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['back', {}],
  ]],
  ['hero', [
    ['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['back', {}],
  ]],
  ['temple', [
    ['base', {}], ['nosandhigh', { off: 'sandHigh' }], ['nosandlow', { off: 'sandLow' }],
    ['noshimmer', { off: 'shimmer' }], ['back', {}],
  ]],
  ['sly-profile', [
    ['base', {}], ['nosandhigh', { off: 'sandHigh' }], ['nosandlow', { off: 'sandLow' }],
    ['noshimmer', { off: 'shimmer' }], ['back', {}],
  ]],
  ['kaykit', [
    ['base', {}], ['nosandhigh', { off: 'sandHigh' }], ['back', {}],
  ]],
];
/** Ghost shots whose base/nosandhigh pair drives the one-retry rule (PREREG §6). */
const GHOST_RETRY = new Set(['temple', 'sly-profile', 'kaykit', 'night']);

/* ---- runner-side pair check for the retry rule: largest |dL|>=4 component ---- */
function largestComponent(fileA, fileB) {
  const a = readPNG(fileA), b = readPNG(fileB);
  const w = a.w, h = a.h;
  const hot = new Uint8Array(w * h);
  const L = (im, o) => 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];
  for (let i = 0; i < w * h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (Math.abs(L(a, oa) - L(b, ob)) >= 4) hot[i] = 1;
  }
  const seen = new Uint8Array(w * h);
  let best = 0;
  for (let i = 0; i < w * h; i++) {
    if (!hot[i] || seen[i]) continue;
    let n = 0; const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); n++;
      const x = j % w, y = (j / w) | 0;
      if (x > 0 && hot[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && hot[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && hot[j - w] && !seen[j - w]) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && hot[j + w] && !seen[j + w]) { seen[j + w] = 1; stack.push(j + w); }
    }
    if (n > best) best = n;
  }
  return best;
}

let installed = false;
const res = await withGame({
  width: W, height: H, quality: 'high', timeout: 3300000,
  onLocked: async () => {
    /* §124.4: stamp the tree at the lock-acquisition transition — the only moment that
       matters. Records HEAD plus any OTHER lane's uncommitted src edits the boot will carry
       (seen at seal time: Lighting.js / ToonMaterial.js / toon.glsl.js, ~103 foreign lines).
       Every comparison in this run is within-boot, so foreign edits shift absolute radiances
       at worst; the RESULT discloses whatever this stamp caught. */
    const stamp = {
      head: execSync('git rev-parse HEAD', { cwd: '/home/user/Demo' }).toString().trim(),
      dirty: execSync('git status --short -- src/', { cwd: '/home/user/Demo' }).toString().trim().split('\n').filter(Boolean),
      dirtyDiffSha: sha(execSync('git diff -- src/', { cwd: '/home/user/Demo' }).toString()),
      at: new Date().toISOString(),
    };
    writeFileSync('/home/user/Demo/progress/records/critic10postfx/treestamp.json', JSON.stringify(stamp, null, 1));
    console.log(`treestamp: head ${stamp.head} dirty src: ${stamp.dirty.join(', ') || '(none)'}`);
    // §186: install inside the lock window, before vite reads the tree.
    copyFileSync(CAND, SRC);
    installed = true;
    console.log(`installed candidate -> ${SRC} (sha ${sha(readFileSync(SRC))})`);
  },
  onReleasing: async () => {
    if (!installed) return;
    writeFileSync(SRC, origBytes);
    const back = sha(readFileSync(SRC));
    console.log(`restored ${SRC} (sha ${back}) ${back === sha(origBytes) ? '== orig OK' : '!! MISMATCH'}`);
  },
}, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);
  mkdirSync(OUT, { recursive: true });
  const acc = { renderer: info.renderer, warnings: info.warnings, jobs: {}, retries: {} };

  async function job(shot, label, cfg, { stage = false, gen = '' } = {}) {
    const t0 = Date.now();
    const r = await page.evaluate(async ([n, c, applyBody, probeBody, doStage]) => {
      const G = window.__GAME, E = window.__ENGINE;
      if (doStage) await G.setShot(n, { dt: 0 });
      const applied = (0, eval)('(' + applyBody + ')')(c);
      for (let i = 0; i < 3; i++) E.renderFrame(0);
      return { applied, probe: (0, eval)('(' + probeBody + ')')(), dataUrl: G.capture('image/png') };
    }, [shot, cfg, APPLY, PROBE, stage]);
    const file = path.join(OUT, `${shot}.${label}${gen}.png`);
    writeFileSync(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    acc.jobs[`${shot}.${label}${gen}`] = { applied: r.applied, probe: r.probe };
    const p = r.probe;
    console.log(`--- ${shot}.${label}${gen}  ${((Date.now() - t0) / 1000) | 0}s  t=${p.time} tod=${p.tod}`
      + `  bloom=${p.applied.bloomEnabled} T=${JSON.stringify(p.applied.threshold)} subjCut=${p.applied.subjCut}`
      + `  subjBBox=${JSON.stringify(p.subjBBox)}`);
    console.log(`    applied: ${r.applied}`);
    return file;
  }

  for (const [shot, arms] of MATRIX) {
    const files = {};
    let first = true;
    for (const [label, cfg] of arms) {
      files[label] = await job(shot, label, cfg, { stage: first });
      first = false;
    }
    /* one-retry rule (PREREG §6): ghost shots whose pair shows no >=800 px component */
    if (GHOST_RETRY.has(shot) && files.base && files.nosandhigh) {
      const n = largestComponent(files.base, files.nosandhigh);
      console.log(`    [${shot}] largest base/nosandhigh component: ${n}px`);
      if (n < 800) {
        console.log(`    [${shot}] < 800 px -> RETRY: step(300, 1/60), full second generation`);
        acc.retries[shot] = { gen1Largest: n };
        await page.evaluate(async () => { await window.__GAME.step(300, 1 / 60); });
        for (const [label, cfg] of arms) await job(shot, label, cfg, { stage: false, gen: '2' });
        const n2 = largestComponent(path.join(OUT, `${shot}.base2.png`), path.join(OUT, `${shot}.nosandhigh2.png`));
        acc.retries[shot].gen2Largest = n2;
        console.log(`    [${shot}] gen2 largest component: ${n2}px`);
      }
    }
  }
  return acc;
});

writeFileSync(path.join(OUT, 'c10postfx.json'), JSON.stringify(res, null, 1));
console.log(`\ncritic10postfx DONE -> ${OUT}/c10postfx.json`);
