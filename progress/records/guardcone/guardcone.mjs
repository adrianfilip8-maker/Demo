/**
 * guardcone.mjs — the CONE-ONLY one-boot poke runner for PREREG-guardcone
 * (+ AMENDMENT A1, written before this file captured a single frame).
 *
 * FORK of progress/records/guardpass/guardpass.mjs. That runner served two seals sharing one
 * boot; KNOWN_ISSUES §309 parked the guard MANNEQUIN mid-run and marked PREREG-guardart
 * WAIVED-UNSCORED, so this one serves the surviving seal alone:
 *
 *   PREREG-guardcone  the patrol cone as a real volume — uConeShape/uGlow uniform pokes +
 *                     guards.TUNE cone-tuple pokes (colPatrol/beamBase/poolMix/beamCoreScale/
 *                     lampToon). The candidate is §2's tuple, verbatim.
 *
 * What A1 changed here and nowhere else:
 *   - arms:  off -> bon -> (blamp, guard only) -> back        [askin/aon/abon DROPPED]
 *   - frames: 82 -> 49
 *   - the runner NEVER writes TUNE.guardArt / TUNE.guardSkin and NEVER calls applyArt().
 *     Under §309 the right posture is not "assign zero", it is "do not reach for the lever".
 *     Their state is READ every arm instead (readback.park) and gated by PARK1.
 *   - out-dir / log / pidfile re-pointed (A1.3) so the stopped run's archive is untouched.
 *   - the crown-bone and hair-colour probes are gone: guard-model instrumentation with no
 *     consumer in this seal's bar table.
 *
 * Not changed: the candidate tuple, every band, the {dt:0} discipline, the PF6 launch pins
 * (which now also stand as HEAD-side proof that the parked levers are still inert), PF7's
 * one-run-one-out-dir, the no-install chassis (every mechanism ships inert in HEAD, pinned by
 * tests/guardart.test.mjs) and the per-shot same-boot off/back bracket (§302).
 *
 *   bash tools/launch.sh progress/records/guardcone/guardcone.mjs \
 *     /home/user/Demo/progress/records/logs/guardcone-run1.log /tmp/sands-of-ra/guardcone1.pid
 *
 * Per canonical shot (all 16, roster order): stage once ({dt:0}, step(3,0), renderFrame(0),
 * NOT captured), then arms — each arm assigns the FULL cone lever tuple (restore-first, the
 * fxartifact ARM shape), settles step(2,0) + renderFrame(0), captures + readbacks + PROBE
 * (per-guard projected boxes, beam/pool footprints, spill and pool-ahead disc — the rects
 * §4's protection-classification rule is written in):
 *
 *   off    cone defaults
 *   bon    cone candidate
 *   blamp  cone candidate, lampToon 0   [guard only]
 *   back   cone defaults — diff(off, back) brackets EVERY intervening poke
 *
 * {dt:0} everywhere, no retries, no resume (PF7). 49 frames.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/guardcone1');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];

/* Lever tuples — PREREG-guardcone §2's table, spelled once. Unchanged by A1. */
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
    /* §309: the parked guard-model levers must still be inert in HEAD. This runner never
       writes them; this pin is the HEAD-side half of that guarantee. */
    [/guardArt: 0,/, 'PARKED guardArt: 0 (§309)'],
    [/guardSkin: 0,/, 'PARKED guardSkin: 0 (§309)'],
    [/coneShape: 0,/, 'inert coneShape: 0'],
    [/lampToon: 0\.0,/, 'inert lampToon: 0.0'],
    [/beamCoreScale: 1\.0,/, 'identity beamCoreScale: 1.0'],
    [/coneAtten: 13\.0,/, 'registered coneAtten 13.0'],
    [/coneCap: 1\.30,/, 'registered coneCap 1.30'],
    [/coneEdge: 0\.35,/, 'registered coneEdge 0.35'],
    [/coneDust: 0\.65,/, 'registered coneDust 0.65'],
    [/coneGrad: 0\.85,/, 'registered coneGrad 0.85'],
    [/colPatrol: 0xfff0c2,/, 'HEAD colPatrol 0xfff0c2'],
    [/beamBase: 0\.30,/, 'HEAD beamBase 0.30'],
    [/glowSize: 0\.34,/, 'HEAD glowSize 0.34'],
    [/poolMix: 0\.24,/, 'HEAD poolMix 0.24'],
    /* task #14's shipped night grade (d526dd8) — prior art this seal composes with. */
    [/colNight: 0xbfe6ff,/, 'task #14 colNight 0xbfe6ff'],
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
const _tmp = path.join(process.env.TMPDIR || '/tmp', `guardcone-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')} verified (cone mechanism inert; §309 guard-model levers inert); expected src hash ${EXPECT_HEAD}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes. Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const manifest = {
  seal: 'PREREG-guardcone + AMENDMENT A1 (cone-only; PREREG-guardart WAIVED-UNSCORED per §309)',
  head: git('rev-parse', 'HEAD'),
  expect: { head: EXPECT_HEAD },
  values: { CONE_OFF, CONE_ON },
  arms: ['off', 'bon', 'blamp (guard only)', 'back'],
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

/* Every arm assigns ALL cone levers (restore-first — poke and restore are the same code path,
   so `back` is the `off` assignment repeated). guards.TUNE is the live module object (the
   Lighting.js bracket precedent); the two beam uniforms are republished by nothing, so direct
   assignment sticks (the uShadowHold contract).

   §309: guardArt / guardSkin are NOT written here, and applyArt() is NOT called. They are
   read back every arm (park) and gated by PARK1. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const gd = eng.get('guards');
  const sh = eng.get('shading');
  const T = gd.TUNE;
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

  /* ---- probe (the rects §4's classification rule is written in) ---- */
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

  /* §309 PARK1 — the parked levers, MEASURED. Nothing above writes them. */
  const carmGeo = gd.carmelita?.geometry || null;
  const park = {
    guardArt: gd.TUNE.guardArt, guardSkin: gd.TUNE.guardSkin,
    painted: !!carmGeo?.userData?.slyGuardPainted,
    skinShift: !!carmGeo?.userData?.slyGuardSkinShift,
  };

  const bu = gd._beamMat?.uniforms || {};
  const su = sh?.uniforms || {};
  return {
    png: c.toDataURL('image/png'),
    readback: {
      park,
      colPatrol: gd.TUNE.colPatrol, beamBase: gd.TUNE.beamBase, poolMix: gd.TUNE.poolMix,
      beamCoreScale: gd.TUNE.beamCoreScale, lampToon: gd.TUNE.lampToon,
      uConeShape: bu.uConeShape ? bu.uConeShape.value : null,
      uGlow: bu.uGlow ? bu.uGlow.value : null,
      uConeAtten: bu.uConeAtten ? bu.uConeAtten.value : null,
      uConeCap: bu.uConeCap ? bu.uConeCap.value : null,
      uConeEdge: bu.uConeEdge ? bu.uConeEdge.value : null,
      uConeDust: bu.uConeDust ? bu.uConeDust.value : null,
      uConeGrad: bu.uConeGrad ? bu.uConeGrad.value : null,
      uGuardLampW: su.uGuardLampPos ? su.uGuardLampPos.value.w : null,
      uGuardLampColor: su.uGuardLampColor
        ? [+su.uGuardLampColor.value.r.toFixed(4), +su.uGuardLampColor.value.g.toFixed(4), +su.uGuardLampColor.value.b.toFixed(4)] : null,
      uLocalToon: su.uLocalToon ? su.uLocalToon.value : null,
      light: gd._light, timeOfDay: eng.debug?.timeOfDay ?? null,
    },
    probe: { subjIdx, guards, spill, ahead },
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
  console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${manifest.rows.at(-1).sha256.slice(0, 12)}  cone=${rb.uConeShape} lampW=${rb.uGuardLampW?.toFixed?.(2) ?? rb.uGuardLampW} park=${rb.park.guardArt}/${rb.park.guardSkin}/${rb.park.painted ? 'PAINTED!' : 'clean'} inframe=${inframe}`);
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
  console.log(`HEAD tree verified under the lock — src ${tree.src} (no install; the cone mechanism is inert in HEAD)`);
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
    /* §309 gate, boot-side: if the parked levers are not at 0 in this boot, stop before the
       first frame rather than capture a run the owner constraint forbids. */
    const parked = await page.evaluate(() => {
      const gd = window.__ENGINE.get('guards');
      const geo = gd.carmelita?.geometry || null;
      return {
        art: gd.TUNE.guardArt, skin: gd.TUNE.guardSkin,
        painted: !!geo?.userData?.slyGuardPainted, shift: !!geo?.userData?.slyGuardSkinShift,
      };
    });
    if (parked.art !== 0 || parked.skin !== 0 || parked.painted || parked.shift)
      throw new Error(`§309 ABORT: guard-model levers not inert at boot: ${JSON.stringify(parked)}`);
    console.log(`§309 parking verified at boot: guardArt ${parked.art}, guardSkin ${parked.skin}, unpainted, unshifted`);

    /* All 16 shots stage under the same published lever values — the defaults, set
       explicitly before the first staging (uniform staging disclosure, torchlight3 §6). */
    await page.evaluate((off) => {
      const gd = window.__ENGINE.get('guards');
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
      const arms = [['off', { cone: CONE_OFF }], ['bon', { cone: CONE_ON }]];
      if (shot === 'guard') arms.push(['blamp', { cone: CONE_ON_NOLAMP }]);
      arms.push(['back', { cone: CONE_OFF }]);
      for (const [arm, cfg] of arms) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal);
      }
    }
    /* leave the page at the published defaults */
    await page.evaluate((off) => {
      const gd = window.__ENGINE.get('guards');
      gd.TUNE.colPatrol = off.colPatrol; gd.TUNE.beamBase = off.beamBase;
      gd.TUNE.poolMix = off.poolMix; gd.TUNE.beamCoreScale = off.coreScale;
      gd.TUNE.lampToon = off.lamp;
      if (gd._beamMat) {
        gd._beamMat.uniforms.uConeShape.value = off.shape;
        gd._beamMat.uniforms.uGlow.value = off.glow;
      }
    }, CONE_OFF);
  });
console.log('DONE. Score with: node progress/records/guardcone/guardcone-score.mjs');
