/**
 * critic10postfx2 — one boot for PREREG-critic10-postfx2.md (the reseal): five shots x
 * {base, subj1, [bloomoff,] back}, subject-mask dumps, NO retries, NO world-clock steps.
 * §186: candidate installed onLocked, restored onReleasing, sha-verified; treestamp at the
 * lock-acquisition transition. Launch via tools/launch.sh (detached) — §298.3.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import path from 'node:path';

const SRC = '/home/user/Demo/src/render/PostFX.js';
const CAND = '/home/user/Demo/progress/records/critic10postfx/PostFX.cand.js';
const OUT = '/home/user/Demo/shots/c10postfx2';
const W = 1280, H = 720;

const sha = (b) => createHash('sha256').update(b).digest('hex');
const origBytes = readFileSync(SRC);
const candBytes = readFileSync(CAND);
console.log(`orig sha ${sha(origBytes)}  cand sha ${sha(candBytes)}`);

const APPLY = `(cfg) => {
  const E = window.__ENGINE, pf = E.get('postfx');
  pf.setEnabled('bloom', true);
  pf.tune.bloomThreshold = 2.20; pf.tune.bloomKnee = 0.30; pf.tune.bloomSubjectCut = 0;
  const seen = [];
  if (cfg.tune) for (const [k, v] of Object.entries(cfg.tune)) { pf.tune[k] = v; seen.push(k + '=' + v); }
  if (cfg.bloomOff) { pf.setEnabled('bloom', false); seen.push('bloom OFF'); }
  return seen.join(' ') || 'baseline';
}`;

const PROBE = `() => {
  const E = window.__ENGINE, pf = E.get('postfx'), L = E.get('lighting');
  const T = window.__GAME.THREE, A = L?.atmosphere, cam = E.camera;
  cam.updateMatrixWorld(true);
  const out = {
    time: +E.time.toFixed(4), tod: A ? +A.tod.toFixed(4) : null,
    applied: {
      bloomEnabled: !!pf.passes.bloom.enabled,
      threshold: pf.brightMat ? [+pf.brightMat.uniforms.uThreshold.value.x.toFixed(3), +pf.brightMat.uniforms.uThreshold.value.y.toFixed(3)] : null,
      subjCut: pf.brightMat?.uniforms?.uSubjCut ? +pf.brightMat.uniforms.uSubjCut.value.toFixed(3) : 'ABSENT',
    },
    subjBBox: null,
  };
  const ch = E.get('character');
  if (ch?.root) {
    const c = ch.root.position, v = new T.Vector3();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
    for (const [dx, dy, dz] of [[-1.2,0,-1.2],[1.2,0,-1.2],[-1.2,0,1.2],[1.2,0,1.2],
                                [-1.2,1.9,-1.2],[1.2,1.9,-1.2],[-1.2,1.9,1.2],[1.2,1.9,1.2]]) {
      v.set(c.x + dx, c.y + dy, c.z + dz).project(cam);
      if (v.z > 1) behind = true;
      x0 = Math.min(x0, (v.x * 0.5 + 0.5) * ${W}); y0 = Math.min(y0, (-v.y * 0.5 + 0.5) * ${H});
      x1 = Math.max(x1, (v.x * 0.5 + 0.5) * ${W}); y1 = Math.max(y1, (-v.y * 0.5 + 0.5) * ${H});
    }
    out.subjBBox = behind ? 'BEHIND' : [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
  }
  return out;
}`;

/* Subject-mask readback: normalRT alpha < 128 -> subject. Returned as base64 of one byte per
   pixel (0/255), Y-flipped to image orientation. ~921 KB raw per shot; acceptable. */
const MASK = `() => {
  const E = window.__ENGINE, pf = E.get('postfx');
  const rt = pf.normalRT; if (!rt) return null;
  const w = rt.width, h = rt.height;
  const buf = new Uint8Array(w * h * 4);
  E.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y; // GL origin flip
    for (let x = 0; x < w; x++) m[y * w + x] = buf[(sy * w + x) * 4 + 3] < 128 ? 255 : 0;
  }
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < m.length; i += CH) s += String.fromCharCode.apply(null, m.subarray(i, Math.min(i + CH, m.length)));
  return { w, h, b64: btoa(s) };
}`;

const MATRIX = [
  ['traversal', [['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['back', {}]]],
  ['night', [['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['bloomoff', { bloomOff: true }], ['back', {}]]],
  ['interior', [['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['bloomoff', { bloomOff: true }], ['back', {}]]],
  ['sly-closeup', [['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['back', {}]]],
  ['hero', [['base', {}], ['subj1', { tune: { bloomSubjectCut: 1 } }], ['back', {}]]],
];

let installed = false;
const res = await withGame({
  width: W, height: H, quality: 'high', timeout: 3300000,
  onLocked: async () => {
    const stamp = {
      head: execSync('git rev-parse HEAD', { cwd: '/home/user/Demo' }).toString().trim(),
      dirty: execSync('git status --short -- src/', { cwd: '/home/user/Demo' }).toString().trim().split('\n').filter(Boolean),
      at: new Date().toISOString(),
    };
    writeFileSync('/home/user/Demo/progress/records/critic10postfx/treestamp2.json', JSON.stringify(stamp, null, 1));
    console.log(`treestamp: head ${stamp.head} dirty src: ${stamp.dirty.join(', ') || '(none)'}`);
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
  const acc = { renderer: info.renderer, warnings: info.warnings, jobs: {} };

  for (const [shot, arms] of MATRIX) {
    let first = true;
    for (const [label, cfg] of arms) {
      const t0 = Date.now();
      const wantMask = label === 'base';
      const r = await page.evaluate(async ([n, c, applyBody, probeBody, maskBody, doStage, dumpMask]) => {
        const G = window.__GAME, E = window.__ENGINE;
        if (doStage) await G.setShot(n, { dt: 0 });
        const applied = (0, eval)('(' + applyBody + ')')(c);
        for (let i = 0; i < 3; i++) E.renderFrame(0);
        const mask = dumpMask ? (0, eval)('(' + maskBody + ')')() : null;
        return { applied, probe: (0, eval)('(' + probeBody + ')')(), mask, dataUrl: G.capture('image/png') };
      }, [shot, cfg, APPLY, PROBE, MASK, first, wantMask]);
      first = false;
      writeFileSync(path.join(OUT, `${shot}.${label}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      if (r.mask) {
        const { w, h, b64 } = r.mask;
        const raw = Buffer.from(b64, 'base64');
        const p = new PNG({ width: w, height: h });
        for (let i = 0; i < w * h; i++) { const v = raw[i]; p.data[i * 4] = v; p.data[i * 4 + 1] = v; p.data[i * 4 + 2] = v; p.data[i * 4 + 3] = 255; }
        writeFileSync(path.join(OUT, `MASK.${shot}.png`), PNG.sync.write(p));
      }
      acc.jobs[`${shot}.${label}`] = { applied: r.applied, probe: r.probe, maskDumped: !!r.mask };
      const p = r.probe;
      console.log(`--- ${shot}.${label}  ${((Date.now() - t0) / 1000) | 0}s  t=${p.time} tod=${p.tod}`
        + `  bloom=${p.applied.bloomEnabled} T=${JSON.stringify(p.applied.threshold)} subjCut=${p.applied.subjCut}`
        + `  subjBBox=${JSON.stringify(p.subjBBox)}${r.mask ? ' mask:dumped' : ''}`);
    }
  }
  return acc;
});

writeFileSync(path.join(OUT, 'c10postfx2.json'), JSON.stringify(res, null, 1));
console.log(`\ncritic10postfx2 DONE -> ${OUT}/c10postfx2.json`);
