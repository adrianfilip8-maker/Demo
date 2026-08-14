/**
 * guardpass.mjs — the SHARED one-boot poke runner for critic family #3's two seals
 * (DESIGN-guardpass.md):
 *
 *   PREREG-guardart   (A) the garrison into the art pipeline — guards.TUNE.guardArt/guardSkin
 *                         pokes + applyArt()
 *   PREREG-guardcone  (B) the patrol cone as a real volume — uConeShape/uGlow uniform pokes +
 *                         guards.TUNE cone-tuple pokes (colPatrol/beamBase/poolMix/
 *                         beamCoreScale/lampToon)
 *
 * One boot, HEAD tree, NO install: every mechanism ships inert in HEAD (gates untaken at the
 * defaults, pinned by tests/guardart.test.mjs) — the gradetrio no-install chassis. The two
 * seals score and ship INDEPENDENTLY; each scorer consumes only the rows its PREREG names;
 * the per-shot off/back bracket (R bars) is shared by citation.
 *
 *   bash tools/launch.sh progress/records/guardpass/guardpass.mjs \
 *     /home/user/Demo/progress/records/logs/guardpass-run1.log /tmp/sands-of-ra/guardpass1.pid
 *
 * Per canonical shot (all 16, roster order): stage once ({dt:0}, step(3,0), renderFrame(0),
 * NOT captured), then arms — each arm assigns the FULL lever tuple (restore-first, the
 * fxartifact ARM shape), settles step(2,0) + renderFrame(0), captures + readbacks + PROBE
 * (per-guard projected boxes, beam/pool footprints, crown-vertex bone mapping, shell and
 * material state — the §291-lesson "verify the channel state live" instrument):
 *
 *   off    art 0/0  cone defaults
 *   askin  art 0/1  cone defaults          [guard only]
 *   aon    art 1/1  cone defaults
 *   bon    art 0/0  cone candidate
 *   blamp  art 0/0  cone candidate, lampToon 0   [guard only]
 *   abon   art 1/1  cone candidate
 *   back   art 0/0  cone defaults — diff(off, back) brackets EVERY intervening poke
 *
 * {dt:0} everywhere, no retries, no resume (PF7). 82 frames.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/guardpass1');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];

/* Lever tuples — the PREREGs' §2 tables, spelled once. */
const CONE_OFF = { shape: 0, colPatrol: 0xfff0c2, beamBase: 0.30, glow: 0.34, poolMix: 0.24, coreScale: 1.0, lamp: 0.0 };
const CONE_ON = { shape: 1, colPatrol: 0xffd9a0, beamBase: 0.26, glow: 0.42, poolMix: 0.30, coreScale: 0.62, lamp: 1.0 };
const CONE_ON_NOLAMP = { ...CONE_ON, lamp: 0.0 };

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins ────────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6 ABORT: src/ dirty at launch:\n${dirt}`);
  const gj = gitRaw('show', 'HEAD:src/ai/Guard.js');
  for (const [re, what] of [
    [/guardArt: 0,/, 'inert guardArt: 0'],
    [/guardSkin: 0,/, 'inert guardSkin: 0'],
    [/coneShape: 0,/, 'inert coneShape: 0'],
    [/lampToon: 0\.0,/, 'inert lampToon: 0.0'],
    [/beamCoreScale: 1\.0,/, 'identity beamCoreScale: 1.0'],
    [/coneAtten: 13\.0,/, 'registered coneAtten 13.0'],
    [/coneCap: 1\.30,/, 'registered coneCap 1.30'],
    [/colPatrol: 0xfff0c2,/, 'HEAD colPatrol 0xfff0c2'],
    [/beamBase: 0\.30,/, 'HEAD beamBase 0.30'],
    [/glowSize: 0\.34,/, 'HEAD glowSize 0.34'],
    [/poolMix: 0\.24,/, 'HEAD poolMix 0.24'],
    [/if \( uConeShape > 0\.5 \)/, 'the uConeShape gate'],
    [/1\.0 \/ \( 1\.0 \+ 7\.0 \* t \* t \)/, 'the legacy attenuation'],
    [/clamp\( a, 0\.0, 4\.0 \)/, 'the legacy 4.0 cap'],
  ]) if (!re.test(gj)) die(`PF6 ABORT: HEAD Guard.js lacks ${what} — either a ship write landed (a seal is stale) or the mechanism commit is missing`);
  const gl = gitRaw('show', 'HEAD:src/render/shaders/toon.glsl.js');
  if (!/uniform vec4 uGuardLampPos;/.test(gl) || !/if \( uGuardLampPos\.w > 0\.0 \)/.test(gl))
    die('PF6 ABORT: HEAD toon.glsl.js lacks the uGuardLampPos gate — the lamp has no lever');
  const tm = gitRaw('show', 'HEAD:src/render/ToonMaterial.js');
  if (!/uGuardLampPos:\s*\{ value: new THREE\.Vector4\(0, 0, 0, 0\) \}/.test(tm))
    die('PF6 ABORT: HEAD ToonMaterial.js lacks the zero-w uGuardLampPos uniform');
}

/* Expected src hash: git archive HEAD (never the working tree). */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `guardpass-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')} verified (guardart+guardcone mechanisms inert); expected src hash ${EXPECT_HEAD}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes. Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const manifest = {
  seal: 'PREREG-guardart + PREREG-guardcone (shared runner)',
  head: git('rev-parse', 'HEAD'),
  expect: { head: EXPECT_HEAD },
  values: { CONE_OFF, CONE_ON },
  launchedAt: new Date().toISOString(), pid: process.pid,
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

/* ---- page-side functions ------------------------------------------------------------------ */

const STAGE_ONLY = async (name) => {
  const eng = window.__ENGINE;
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name };
};

/* Every arm assigns ALL levers (restore-first — poke and restore are the same code path, so
   `back` is the `off` assignment repeated). guards.TUNE is the live module object (the
   Lighting.js bracket precedent); applyArt() re-reads it; the two material uniforms are
   republished by nothing, so direct assignment sticks (the uShadowHold contract). */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const gd = eng.get('guards');
  const sh = eng.get('shading');
  const T = gd.TUNE;
  T.guardArt = cfg.art;
  T.guardSkin = cfg.skin;
  gd.applyArt();
  T.colPatrol = cfg.cone.colPatrol;
  T.beamBase = cfg.cone.beamBase;
  T.poolMix = cfg.cone.poolMix;
  T.beamCoreScale = cfg.cone.coreScale;
  T.lampToon = cfg.cone.lamp;
  if (gd._beamMat) {
    gd._beamMat.uniforms.uConeShape.value = cfg.cone.shape;
    gd._beamMat.uniforms.uGlow.value = cfg.cone.glow;
  }
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);

  /* ---- capture ---- */
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);

  /* ---- probe (the §291-lesson live-state instrument + the PROT containers) ---- */
  const cam = eng.camera;
  const W = src.width, H = src.height;
  const V = cam.position.clone();                      // any Vector3 instance is a full THREE vector
  const proj = (x, y, z) => {
    V.set(x, y, z).project(cam);
    return [(V.x * 0.5 + 0.5) * W, (1 - (V.y * 0.5 + 0.5)) * H, V.z];
  };
  const rectOf = (pts) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, seen = 0;
    for (const [x, y, z] of pts) {
      if (!(z > -1 && z < 1)) continue;                // behind/past the frustum planes
      seen++;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    if (!seen) return null;
    const r = [Math.max(0, x0), Math.max(0, y0), Math.min(W, x1), Math.min(H, y1)];
    return (r[2] > r[0] && r[3] > r[1]) ? r.map((v) => Math.round(v)) : null;
  };

  const guards = [];
  const carm = gd.carmelita || null;
  for (let i = 0; i < gd.guards.length; i++) {
    const g = gd.guards[i];
    const top = (gd.TUNE.headTop[g.type] ?? 1.95) + 0.15;
    const p = g.position;
    const pts = [];
    for (const dx of [-0.55, 0.55]) for (const dy of [0, top]) for (const dz of [-0.55, 0.55])
      pts.push(proj(p.x + dx, p.y + dy, p.z + dz));
    let beamRect = null, poolRect = null, apexS = null, farS = null;
    if (gd.beamMesh) {
      const m = gd.beamMesh.instanceMatrix.array, o = i * 16;
      const ax = [m[o + 12], m[o + 13], m[o + 14]];
      const xc = [m[o], m[o + 1], m[o + 2]], yc = [m[o + 4], m[o + 5], m[o + 6]], zc = [m[o + 8], m[o + 9], m[o + 10]];
      const bp = [];
      for (const t of [0.06, 0.27, 0.66, 1.0]) for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, cs = Math.cos(a) * t, sn = Math.sin(a) * t;
        bp.push(proj(ax[0] + xc[0] * cs + yc[0] * sn + zc[0] * t,
                     ax[1] + xc[1] * cs + yc[1] * sn + zc[1] * t,
                     ax[2] + xc[2] * cs + yc[2] * sn + zc[2] * t));
      }
      bp.push(proj(ax[0], ax[1], ax[2]));
      beamRect = rectOf(bp);
      apexS = proj(ax[0], ax[1], ax[2]).map((v) => Math.round(v));
      farS = proj(ax[0] + zc[0], ax[1] + zc[1], ax[2] + zc[2]).map((v) => Math.round(v));
      const pm = gd.poolMesh.instanceMatrix.array;
      const pxc = [pm[o], pm[o + 1], pm[o + 2]], pzc = [pm[o + 8], pm[o + 9], pm[o + 10]];
      const pT = [pm[o + 12], pm[o + 13], pm[o + 14]];
      const pp = [];
      for (const u of [-1, 0, 1]) for (const t of [0.05, 0.5, 1.0])
        pp.push(proj(pT[0] + pxc[0] * u * t + pzc[0] * t, pT[1] + pxc[1] * u * t + pzc[1] * t, pT[2] + pxc[2] * u * t + pzc[2] * t));
      poolRect = rectOf(pp);
    }
    guards.push({
      i, type: g.type, state: g.state, pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      bbox: rectOf(pts), beamRect, poolRect, apexS, farS,
      carm: !!(carm && g.mesh.geometry === carm.geometry),
      shell: !!g.mesh.userData.slyShell, shellVisible: !!g.mesh.userData.slyShell?.visible,
      mats: (Array.isArray(g.mesh.material) ? g.mesh.material : [g.mesh.material])
        .map((mm) => ({ name: mm?.name, sly: !!mm?.userData?.sly, vc: !!mm?.vertexColors })),
    });
  }

  /* subject + spill + pool-ahead disc */
  const subjIdx = gd._shotLock ? gd.guards.indexOf(gd._shotLock) : 0;
  let spill = null;
  for (const l of gd._lights || []) if (l.handle?.enabled) {
    const hp = l.handle.position;
    const r = gd.TUNE.lightRadius;
    const pts = [];
    for (const dx of [-r, r]) for (const dy of [-r, r]) for (const dz of [-r, r])
      pts.push(proj(hp.x + dx, hp.y + dy, hp.z + dz));
    spill = { guard: gd.guards.indexOf(l.guard), rect: rectOf(pts) };
  }
  let ahead = null;
  if (subjIdx >= 0 && gd.guards[subjIdx]) {
    const g = gd.guards[subjIdx];
    const cx = g.position.x + g.forward.x * 2.2, cz = g.position.z + g.forward.z * 2.2;
    const ctr = proj(cx, g.position.y + 0.03, cz);
    const rim = proj(cx + 0.6, g.position.y + 0.03, cz);
    if (ctr[2] > -1 && ctr[2] < 1) {
      ahead = { c: [Math.round(ctr[0]), Math.round(ctr[1])], r: Math.round(Math.max(8, Math.hypot(rim[0] - ctr[0], rim[1] - ctr[1]))) };
    }
  }

  /* crown mapping + hair sample — the off-by-one and the paint, measured live */
  let crown = null, hair = null;
  if (carm?.geometry && gd.guards.length) {
    const gm = gd.guards.find((g) => g.mesh.geometry === carm.geometry);
    if (gm) {
      const geo = carm.geometry;
      const pos = geo.getAttribute('position'), si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
      let maxY = -1e9;
      for (let v = 0; v < pos.count; v++) { const y = pos.getY(v); if (y > maxY) maxY = y; }
      const hist = new Map();
      for (let v = 0; v < pos.count; v++) {
        if (pos.getY(v) <= maxY - 0.08) continue;
        for (let k = 0; k < 4; k++) {
          const w = sw.array[v * 4 + k];
          if (w > 0) { const j = si.array[v * 4 + k]; hist.set(j, (hist.get(j) || 0) + w); }
        }
      }
      let bi = -1, bw = -1;
      for (const [j, w] of hist) if (w > bw) { bw = w; bi = j; }
      crown = { idx: bi, bone: gm.skeleton?.bones?.[bi]?.name ?? null, shift: !!geo.userData.slyGuardSkinShift };
      const hr = (carm.regions || []).find((r) => r.name === 'Hair_LP');
      const col = geo.getAttribute('color');
      if (hr && col) hair = [+col.getX(hr.start).toFixed(3), +col.getY(hr.start).toFixed(3), +col.getZ(hr.start).toFixed(3)];
    }
  }

  const bu = gd._beamMat?.uniforms || {};
  const su = sh?.uniforms || {};
  return {
    png: c.toDataURL('image/png'),
    readback: {
      guardArt: gd.TUNE.guardArt, guardSkin: gd.TUNE.guardSkin,
      colPatrol: gd.TUNE.colPatrol, beamBase: gd.TUNE.beamBase, poolMix: gd.TUNE.poolMix,
      beamCoreScale: gd.TUNE.beamCoreScale, lampToon: gd.TUNE.lampToon,
      uConeShape: bu.uConeShape ? bu.uConeShape.value : null,
      uGlow: bu.uGlow ? bu.uGlow.value : null,
      uConeAtten: bu.uConeAtten ? bu.uConeAtten.value : null,
      uConeCap: bu.uConeCap ? bu.uConeCap.value : null,
      uGuardLampW: su.uGuardLampPos ? su.uGuardLampPos.value.w : null,
      uGuardLampColor: su.uGuardLampColor
        ? [+su.uGuardLampColor.value.r.toFixed(4), +su.uGuardLampColor.value.g.toFixed(4), +su.uGuardLampColor.value.b.toFixed(4)] : null,
      uLocalToon: su.uLocalToon ? su.uLocalToon.value : null,
      light: gd._light, timeOfDay: eng.debug?.timeOfDay ?? null,
      painted: !!carm?.geometry?.userData?.slyGuardPainted,
    },
    probe: { subjIdx, guards, spill, ahead, crown, hair },
  };
};

/* ---- the one boot -------------------------------------------------------------------------- */

function saveFrame(shot, arm, got, ordinal) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  const t = treeState();
  manifest.rows.push({
    shot, arm, file,
    sha256: createHash('sha256').update(buf).digest('hex'),
    tree: { src: t.src, head: t.head },
    readback: got.readback,
    probe: got.probe,
    ordinal, at: new Date().toISOString(),
  });
  saveManifest();
  const rb = got.readback, pr = got.probe;
  const inframe = pr.guards.filter((g) => g.bbox).length;
  console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${manifest.rows.at(-1).sha256.slice(0, 12)}  art=${rb.guardArt}/${rb.guardSkin} cone=${rb.uConeShape} lampW=${rb.uGuardLampW?.toFixed?.(2) ?? rb.uGuardLampW} crown=${pr.crown?.bone ?? '-'} painted=${rb.painted} inframe=${inframe}`);
}

const onLocked = async () => {
  const dirtNow = git('status', '--porcelain', '--', 'src/');
  if (dirtNow) {
    console.log(`ABORT — src/ dirty at lock grant (foreign residue; §186 — NOT ours, do not restore):\n${dirtNow}`);
    throw new Error('src dirty at lock grant');
  }
  const tree = treeState();
  if (tree.src !== EXPECT_HEAD) {
    console.log(`ABORT — working src hash ${tree.src} != git-archive HEAD ${EXPECT_HEAD}`);
    throw new Error('tree verification failed at lock grant');
  }
  console.log(`HEAD tree verified under the lock — src ${tree.src} (no install; both mechanisms inert in HEAD)`);
};
const onReleasing = async () => {
  const dirt = git('status', '--porcelain', '--', 'src/');
  console.log(dirt
    ? `!! src/ dirty at release — NOT this runner's doing (it installs nothing): report, do not touch:\n${dirt}`
    : 'src/ clean at release (nothing was installed).');
};

console.log(`frames -> ${OUT}`);
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    const roster = [...info.shots].sort();
    if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
      throw new Error(`roster drift: page has [${info.shots}]`);
    }
    /* All 16 shots stage under the same published lever values — the defaults, set
       explicitly before the first staging (uniform staging disclosure, torchlight3 §6). */
    await page.evaluate((off) => {
      const gd = window.__ENGINE.get('guards');
      gd.TUNE.guardArt = 0; gd.TUNE.guardSkin = 0;
      gd.TUNE.colPatrol = off.colPatrol; gd.TUNE.beamBase = off.beamBase;
      gd.TUNE.poolMix = off.poolMix; gd.TUNE.beamCoreScale = off.coreScale;
      gd.TUNE.lampToon = off.lamp;
      if (gd._beamMat) {
        gd._beamMat.uniforms.uConeShape.value = off.shape;
        gd._beamMat.uniforms.uGlow.value = off.glow;
      }
    }, CONE_OFF);
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      await page.evaluate(STAGE_ONLY, shot);
      console.log(`-- staged ${shot} (${++n}/16, ${((Date.now() - t0) / 1000) | 0}s)`);
      const arms = [['off', { art: 0, skin: 0, cone: CONE_OFF }]];
      if (shot === 'guard') arms.push(['askin', { art: 0, skin: 1, cone: CONE_OFF }]);
      arms.push(['aon', { art: 1, skin: 1, cone: CONE_OFF }]);
      arms.push(['bon', { art: 0, skin: 0, cone: CONE_ON }]);
      if (shot === 'guard') arms.push(['blamp', { art: 0, skin: 0, cone: CONE_ON_NOLAMP }]);
      arms.push(['abon', { art: 1, skin: 1, cone: CONE_ON }]);
      arms.push(['back', { art: 0, skin: 0, cone: CONE_OFF }]);
      for (const [arm, cfg] of arms) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal);
      }
    }
    /* leave the page at the published defaults */
    await page.evaluate((off) => {
      const gd = window.__ENGINE.get('guards');
      gd.TUNE.guardArt = 0; gd.TUNE.guardSkin = 0; gd.applyArt();
      gd.TUNE.colPatrol = off.colPatrol; gd.TUNE.beamBase = off.beamBase;
      gd.TUNE.poolMix = off.poolMix; gd.TUNE.beamCoreScale = off.coreScale;
      gd.TUNE.lampToon = off.lamp;
      if (gd._beamMat) {
        gd._beamMat.uniforms.uConeShape.value = off.shape;
        gd._beamMat.uniforms.uGlow.value = off.glow;
      }
    }, CONE_OFF);
  });
console.log('DONE. Score with: node progress/records/guardpass/guardart-score.mjs && node progress/records/guardpass/guardcone-score.mjs');
