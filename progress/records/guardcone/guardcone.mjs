/**
 * guardcone.mjs — the CHUNKED cone-only poke runner for PREREG-guardcone
 * (+ AMENDMENT A1, cone-only re-scope; + AMENDMENT A2, per-shot chunking).
 *
 * ONE SHOT PER BOOT. Sixteen invocations, 49 frames, the sealed table unchanged.
 *
 *   bash tools/launch.sh /home/user/Demo/progress/records/guardcone/guardcone.mjs \
 *     /home/user/Demo/progress/records/logs/guardcone-<shot>.log \
 *     /tmp/sands-of-ra/guardcone-<shot>.pid <shot>
 *
 * (the shot goes AFTER the pid path — `launch.sh` forwards trailing argv to the script.)
 * Force-add the chunk (A2.6), then launch the next. When all sixteen are in:
 *
 *   node progress/records/guardcone/guardcone-score.mjs
 *
 * ── Why this file changed, and exactly how much ───────────────────────────────────────────────
 *
 * AMENDMENT A2 §A2.9 enumerates the implementing change as four things and forbids anything else
 * moving with them. Those four, and where each lives:
 *
 *   1. `process.argv[2]` selects the chunk; per-shot `manifest.<shot>.json`   — CHUNK block below
 *   2. `WARMUP = 2` discarded renders on the ARM's own render path (§331)     — `WARM`
 *   3. per-chunk PF7 (this chunk's own files, not the whole out-dir)          — PF7 block
 *   4. the scorer's chunk merge, `V_CHUNK_TREE` + `V_CHUNKS` for `treeBar`    — guardcone-lib.mjs
 *
 * The merged `manifest.json` this runner rebuilds after every chunk is what item 4 consumes:
 * `rows` (49 when complete) plus `chunks` (16, one `srcHash` across all of them).
 *
 * ONE DISCLOSED DEVIATION FROM A2, deliberate and unable to move a band. It is named here rather
 * than buried because A2.9 says nothing else may move, and this is "else":
 *
 *   - two additive readback fields, `coneShapeTune` / `glowTune`. `uConeShape` and `uGlow` are
 *     poked as UNIFORMS (they are built from TUNE once at `_buildCones`, Guard.js:1559-1568, and
 *     never republished), so the live uniform and the TUNE field legitimately disagree in every
 *     candidate arm. Recording both makes that divergence diagnosable instead of alarming. No bar
 *     reads either field; they can only add evidence.
 *
 * **Staging stays `{ dt: 0 }`, as A2 specifies.** It is worth saying why, because A2.8's stated
 * REASON for it is refuted while the CHOICE stands: A2.8 risk-2 mitigation 1 calls `{dt:0}`
 * "deterministic by construction", and KNOWN_ISSUES §334 measured the opposite on this seal's own
 * runs 4 and 5 (same src tree, two boots, 0 of 12 frames byte-identical). A refuted justification
 * is not authorisation to change a sealed method: §141.1 binds the method as well as the bars, no
 * bar of this seal depends on cross-boot frame identity (the A2.3 audit re-checked against the
 * scorer below), and changing what the frames SHOW belongs in an A3 with its own argument. The
 * full reasoning, and what a future lane would have to argue to move it, is written down in
 * `NOTE-a2-staging.md` beside this file rather than left in a comment.
 *
 * ── What this runner is obliged to get right, and where each obligation comes from ────────────
 *
 * **It installs nothing.** Every lever of §2's tuple is a live-read of an existing field, checked
 * against `src` at this sha before this file was written — not one of them needs an `src` edit:
 *
 *   - `TUNE.colPatrol`   re-read every frame in `_updateCones` (Guard.js:1918)
 *   - `TUNE.beamBase`    ditto (Guard.js:1958)
 *   - `TUNE.beamCoreScale` ditto (Guard.js:1972 — "Read per frame so a TUNE poke sticks")
 *   - `TUNE.poolMix`     ditto (Guard.js:1989)
 *   - `TUNE.lampToon`    re-read every frame in `_publishLamp` (Guard.js:2069, recompute-on-publish)
 *   - `uConeShape` / `uGlow`  live uniforms on `_beamMat`, written once at build and never
 *     republished (only `uTime`/`uOpacity` are, Guard.js:1902-1910), so direct assignment sticks
 *   - `gd.TUNE` is the module's own live TUNE object (Guard.js:1254, "so the capture harness can
 *     bracket a value")
 *
 * `_updateCones` is called unconditionally from `Guards.update(dt, t)` (Guard.js:1860) and gates
 * on nothing but `beamMesh`, so every lever above is consumed at `dt = 0`. That is why the arms
 * are reachable under `step(2, 0)` at all, and it is why `V_CHUNK_TREE` can demand ONE `src` hash
 * across sixteen boots: there is nothing here to install, so the tree cannot move because of us.
 *
 * **Readback comes from the LIVE uniform objects, never from `this.tune`** (PostFX.js:1900 states
 * the rule and the reason: §40's decisive A/B arm never ran because a bias clamp floored two arms
 * to the same value, and the only thing that could have caught it was reading the value the
 * shader got rather than the value that was requested). Every readback here is taken AFTER
 * `renderFrame(0)`, off `_beamMat.uniforms` and `shading.uniforms`.
 *
 * **§309: the parked guard-model levers are READ, never written.** `TUNE.guardArt`,
 * `TUNE.guardSkin` and `applyArt()` are not touched anywhere in this file. Their state is
 * measured on every arm (`readback.park`) and gated by PARK1, and a boot-side abort fires before
 * the first frame if they are not inert — sixteen times now instead of once (A2.3).
 *
 * **Force-add the frames of every completed chunk immediately** (A2.6/§329.1) —
 * `progress/records/*​/**​/*.png` is gitignored (`.gitignore:49`), so an un-force-added chunk has
 * no durable copy anywhere and the next rollback destroys it exactly as thoroughly as an
 * in-flight one. That is how four runs' frames and run 1's entire 49-frame archive were lost.
 * A chunked seal that does not force-add its chunks is a chunked seal in name only.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/guardcone1');

/* ── sealed by PREREG-guardcone §2/§3 as amended by A1 and A2; none of it may move (§141.1) ─── */
const SEAL = 'PREREG-guardcone + AMENDMENT A1 (cone-only; PREREG-guardart WAIVED-UNSCORED per §309) + AMENDMENT A2 (chunked)';
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
/* A2.2: fifteen chunks are 3 frames, the `guard` chunk is 4. 15x3 + 4 = 49, unchanged. */
const ARMS = ['off', 'bon', 'blamp', 'back'];
const armsFor = (shot) => (shot === 'guard' ? ['off', 'bon', 'blamp', 'back'] : ['off', 'bon', 'back']);
const WARMUP = 2;                       // A2.5, §331
const EXPECT_ROWS = 49;                 // A1.2's census, unmoved by A2
const EXPECT_CHUNKS = ROSTER.length;    // 16

/* Lever tuples — PREREG-guardcone §2's table, spelled once. Unchanged by A1 and by A2 (§A2.9:
   "It does not re-tune the candidate. CONE_ON is §2's tuple, verbatim."). */
const CONE_OFF = { shape: 0, colPatrol: 0xfff0c2, beamBase: 0.30, glow: 0.34, poolMix: 0.24, coreScale: 1.0, lamp: 0.0 };
const CONE_ON = { shape: 1, colPatrol: 0xffd9a0, beamBase: 0.26, glow: 0.42, poolMix: 0.30, coreScale: 0.62, lamp: 1.0 };
const CONE_ON_NOLAMP = { ...CONE_ON, lamp: 0.0 };

/* THE STAGING MODE — spelled once, recorded in every chunk manifest, cross-checked at merge.
   `{ dt: 0 }` freezes the world clock THROUGH staging as well as after it (Debug.js:95: an
   undefined dt would mean the documented 1/60 live settle instead). It is what AMENDMENT A2
   specifies (A2.8) and what the sealed single-process runner did, so the frames a chunk produces
   are the frames that runner would have produced. Every arm of the chunk then renders at the same
   world time — `step(3, 0)`, the warm-ups and each arm are all dt 0 — so all arms share ONE world
   state, which is what `R_<shot>` at [0,0] proves.

   A2.8's *justification* for this mode ("deterministic by construction") is refuted by §334 and
   the CHOICE still stands; that is not a contradiction and it is written out in full in
   NOTE-a2-staging.md beside this file. Short version: no bar of this seal compares frames across
   boots, so the instability §334 measured costs this seal nothing, and §141.1 binds the method as
   well as the bands.

   Changing this const changes what every frame SHOWS. It may only be changed by an amendment,
   BEFORE the first chunk of a run — never after (§141.1) — and the merge below catches it if it
   is not: two chunks staged differently are not one capture. */
const STAGE_OPTS = { dt: 0 };
const STAGE_DESC = 'setShot(name, { dt: 0 }) — clock frozen through staging (A2.8, sealed runner); then step(3,0) + renderFrame(0), uncaptured';

/* ── the chunk ───────────────────────────────────────────────────────────────────────────────
   A2.2: the runner takes a shot name as process.argv[2] and captures only that shot's arms.
   §A2.1: the roster is a hardcoded const with no env or argv path — argv selects WHICH of the
   sixteen sealed shots runs now, it can never select a SUBSET of the seal. */
const SHOT = process.argv[2];
if (!SHOT || !ROSTER.includes(SHOT)) {
  console.error(`usage: node guardcone.mjs <shot>   where <shot> is one of:\n  ${ROSTER.join(' ')}`);
  console.error('(AMENDMENT A2 §A2.2 — one shot per boot; 15 chunks of 3 arms + `guard` of 4 = 49 frames.');
  console.error(' Run all sixteen, force-adding each as it lands (A2.6), then score.)');
  process.exit(4);
}
const PLAN = armsFor(SHOT);

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins — A2.2 runs these PER CHUNK, sixteen independent verifications that the
      cone mechanism and §309's parked levers are still inert in HEAD, where the single-process
      run checked once. Copied verbatim from the sealed runner; not one regex moves. ─────────── */
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

/* Expected src hash: git archive HEAD (never the working tree). Each chunk re-derives its own
   expectation before it renders and re-checks it under the lock — A2.4's "sixteen points in time
   instead of two". One differing hash across the sixteen chunk manifests VOIDs the run. */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `guardcone-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
const HEAD = git('rev-parse', 'HEAD');
console.log(`${SEAL}`);
console.log(`chunk "${SHOT}" (${PLAN.join(' -> ')}) — HEAD ${HEAD.slice(0, 12)} verified `
  + `(cone mechanism inert; §309 guard-model levers inert); expected src hash ${EXPECT_HEAD}`);

/* ── PF7, PER CHUNK (A2.2) ───────────────────────────────────────────────────────────────────
   The sealed runner refused a non-empty out-dir outright; under chunking that would refuse every
   chunk after the first. So the predicate narrows to THIS chunk's own files: a chunk aborts if
   its own frames or its own manifest already exist. A half-finished chunk is archived and re-run
   WHOLE — chunks are never resumed mid-shot. */
mkdirSync(OUT, { recursive: true });
{
  const mine = readdirSync(OUT).filter((f) => f.startsWith(`${SHOT}.`) || f === `manifest.${SHOT}.json`);
  if (mine.length) {
    die(`PF7 ABORT: ${OUT} already holds ${mine.length} file(s) for shot "${SHOT}". This runner never `
      + `resumes a chunk. Archive them (they may be an earlier run's orphans — A2's census found 12 `
      + `unreferenced run-4 PNGs here) and relaunch this chunk whole:\n  ${mine.join('\n  ')}`);
  }
  /* A pre-A2 merged manifest is not a PF7 violation — the merge below rebuilds it from the chunk
     manifests — but a run-7-shaped 0-row file sitting here is exactly the sort of thing that gets
     read later as evidence, so say what will happen to it. */
  const chunkFiles = readdirSync(OUT).filter((f) => f.startsWith('manifest.') && f !== 'manifest.json');
  if (existsSync(path.join(OUT, 'manifest.json')) && chunkFiles.length === 0) {
    console.log('NOTE: a manifest.json with no chunk manifests beside it is present (a pre-A2 or dead '
      + "run's file). It will be REBUILT by this chunk's merge; nothing reads its current contents.");
  }
}
console.log(`frames -> ${OUT}`);

/* ---- page-side functions ------------------------------------------------------------------ */

/* THE STAGING CALL. See STAGE_OPTS: frozen through staging AND after it — `step(3, 0)` and the
   uncaptured render are dt 0, and every warm-up and arm after them is dt 0 too, so the whole chunk
   shares ONE world state. Warnings come back verbatim rather than as a count: `setShot` announces
   a LIVE clock into engine.warnings when `opts.dt` is not finite (Debug.js:116), so at `{ dt: 0 }`
   that particular notice must be ABSENT — its appearance would mean the staging mode did not take,
   and a run that staged differently from what it claims should say so in its own manifest instead
   of in a comment. */
const STAGE = async ({ name, opts }) => {
  const eng = window.__ENGINE;
  const r = await window.__GAME.setShot(name, opts);
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name, warnings: r.warnings.slice() };
};

/* A discarded settling render (§331/A2.5): the ARM's OWN render path with nothing written that
   an arm would not write. `convprobe` rendered eight times with NO `step()` between renders, so
   it cannot answer whether a `step()` re-dirties whatever settles — the warm-up therefore has to
   be the arm's path, not a bare `renderFrame`. Assign CONE_OFF, step(2,0), render, discard.
   Never written, never measured. */
const WARM = async (cone) => {
  const eng = window.__ENGINE;
  const gd = eng.get('guards');
  const T = gd.TUNE;
  T.colPatrol = cone.colPatrol;
  T.beamBase = cone.beamBase;
  T.poolMix = cone.poolMix;
  T.beamCoreScale = cone.coreScale;
  T.lampToon = cone.lamp;
  if (gd._beamMat) {
    gd._beamMat.uniforms.uConeShape.value = cone.shape;
    gd._beamMat.uniforms.uGlow.value = cone.glow;
  }
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
};

/* Every arm assigns ALL cone levers (restore-first — poke and restore are the same code path,
   so `back` is the `off` assignment repeated rather than a second opinion about what the shipped
   default is). guards.TUNE is the live module object (Guard.js:1254, the Lighting.js bracket
   precedent); the two beam uniforms are republished by nothing, so direct assignment sticks (the
   uShadowHold contract).

   §309: guardArt / guardSkin are NOT written here, and applyArt() is NOT called. They are read
   back every arm (park) and gated by PARK1. */
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
    /* Read AFTER the render, off the LIVE uniform objects — never from a `tune` mirror
       (PostFX.js:1900 states the rule and the reason). The five TUNE levers are read back from
       `gd.TUNE` because THAT is what `_updateCones`/`_publishLamp` consume every frame — for
       those, the live object IS the TUNE object (Guard.js:1254). `uConeShape`/`uGlow` are the
       opposite case: poked as uniforms, so both halves are recorded (`coneShapeTune`/`glowTune`
       carry HEAD's inert TUNE values and are expected to DISAGREE with the uniform on every
       candidate arm — see deviation (b) in the header; no bar reads them). */
    readback: {
      park,
      colPatrol: gd.TUNE.colPatrol, beamBase: gd.TUNE.beamBase, poolMix: gd.TUNE.poolMix,
      beamCoreScale: gd.TUNE.beamCoreScale, lampToon: gd.TUNE.lampToon,
      uConeShape: bu.uConeShape ? bu.uConeShape.value : null,
      uGlow: bu.uGlow ? bu.uGlow.value : null,
      coneShapeTune: gd.TUNE.coneShape, glowTune: gd.TUNE.glowSize,
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

/* ---- the one boot, one shot ----------------------------------------------------------------- */

/* Rows accumulate in memory and the chunk manifest is written ONCE, after the chunk exits clean.
   The sealed runner wrote its manifest at launch and re-saved it per frame; that is exactly how
   run 7 left behind a 0-row `manifest.json` that A2's frame census then had to explain, and how
   run 4's manifest could be archived while its twelve PNGs stayed on disk as unreferenced bytes.
   Under chunking the right failure mode is cleaner: a chunk that dies mid-shot leaves PNGs and NO
   manifest, so PF7 sees the orphans on relaunch and refuses until they are archived — "a
   half-finished chunk is archived and re-run whole" (A2.2), enforced rather than requested. */
const rows = [];
let stagingWarnings = [];

function saveFrame(shot, arm, got, ordinal) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  const t = treeState();
  rows.push({
    shot, arm, file,
    sha256: createHash('sha256').update(buf).digest('hex'),
    tree: { src: t.src, head: t.head },
    readback: got.readback,
    probe: got.probe,
    ordinal, at: new Date().toISOString(),
  });
  const rb = got.readback, pr = got.probe;
  const inframe = pr.guards.filter((g) => g.bbox).length;
  console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${rows.at(-1).sha256.slice(0, 12)}`
    + `  cone=${rb.uConeShape} glow=${rb.uGlow} col=0x${(rb.colPatrol ?? 0).toString(16)} base=${rb.beamBase}`
    + ` pool=${rb.poolMix} core=${rb.beamCoreScale} lampToon=${rb.lampToon}`
    + ` lampW=${rb.uGuardLampW?.toFixed?.(2) ?? rb.uGuardLampW}`
    + ` park=${rb.park.guardArt}/${rb.park.guardSkin}/${rb.park.painted ? 'PAINTED!' : 'clean'} inframe=${inframe}`);
}

/* §186 — the chains every number here comes out of. Dirt in them at lock grant means the tree
   cannot be reconstructed later, so the boot is not worth spending. NOT ours: do not touch, do
   not restore, report and abort. */
const CRITICAL = ['src/render', 'src/player'];

const onLocked = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) {
    console.log('ABORT at lock grant — src/render or src/player carries uncommitted work '
      + `(§186: NOT ours, do not touch, do not restore):\n${crit}`);
    throw new Error('critical src chains dirty at lock grant');
  }
  const dirtNow = git('status', '--porcelain', '--', 'src/');
  if (dirtNow) {
    console.log(`ABORT — src/ dirty at lock grant (foreign residue; §186 — NOT ours, do not restore):\n${dirtNow}`);
    throw new Error('src dirty at lock grant');
  }
  const tree = treeState();
  if (tree.src !== EXPECT_HEAD) {
    console.log(`ABORT — working src hash ${tree.src} != git-archive HEAD ${EXPECT_HEAD} `
      + '(V_CHUNK_TREE: one differing hash across the sixteen chunks VOIDs the whole run — A2.4/A2.8)');
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

await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    /* The roster is checked WHOLE in every chunk, not narrowed to this chunk's shot: A2.1's
       point is that the container never gets to decide what the seal proves, and a boot whose
       page lost a shot is a boot whose remaining chunks cannot be trusted either. */
    const roster = [...info.shots].sort();
    if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
      throw new Error(`roster drift: page has [${info.shots}]`);
    }

    /* §309 gate, boot-side: if the parked levers are not at 0 in this boot, stop before the
       first frame rather than capture a run the owner constraint forbids. A2.3: this now fires
       sixteen times instead of once, which is why PARK1 gets STRONGER under chunking. */
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

    /* Stage under the PUBLISHED defaults, set explicitly before staging (uniform staging
       disclosure, torchlight3 §6). In the single-process run this ran once for all sixteen
       shots; under A2 each chunk does it for its own, which is the same guarantee. */
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

    /* 1. stage ONCE. Not captured. */
    const t0 = Date.now();
    const st = await page.evaluate(STAGE, { name: SHOT, opts: STAGE_OPTS });
    stagingWarnings = st.warnings;
    console.log(`-- staged ${SHOT} (${((Date.now() - t0) / 1000) | 0}s) — ${STAGE_DESC}`);
    console.log(`   ${stagingWarnings.length} engine warning(s) at staging, recorded verbatim in manifest.${SHOT}.json`);
    for (const w of stagingWarnings) console.log(`   ! ${w}`);
    /* At `{ dt: 0 }` Debug.js:116's live-clock notice must NOT fire. If it does, `opts.dt` did not
       arrive as a finite number and this chunk staged on a running clock — a method divergence, so
       say it loudly and let the fold adjudicate rather than silently banking the frames. */
    if (stagingWarnings.some((w) => /world clock is LIVE/.test(w))) {
      console.log('!! STAGING MODE DID NOT TAKE — Debug.js:116 announced a LIVE world clock while '
        + `STAGE_OPTS is ${JSON.stringify(STAGE_OPTS)}. This chunk is NOT staged the way the seal `
        + 'specifies (A2.8). Recorded, not corrected — archive this chunk and diagnose.');
    }

    /* 2. §331 warm-up, discarded, on the arm's own render path (A2.5). */
    for (let w = 0; w < WARMUP; w++) await page.evaluate(WARM, CONE_OFF);
    console.log(`-- warm-up ${WARMUP} render(s) discarded (§331: the first render after staging is unconverged; `
      + `1125 px at maxD 21, and every render after it bit-exact). \`off\` is render #${WARMUP + 2} after staging.`);

    /* 3. this chunk's arms, all from the frozen world state left by that single staging. */
    let ordinal = 0;
    for (const arm of PLAN) {
      const cone = arm === 'bon' ? CONE_ON : arm === 'blamp' ? CONE_ON_NOLAMP : CONE_OFF;
      const got = await page.evaluate(ARM, { cone });
      saveFrame(SHOT, arm, got, ++ordinal);
    }

    /* The arms must actually differ in the state they were POKED into. This is not a bar — the
       seal's bars are the scorer's — it is the §40 check that the A/B happened at all, and it is
       cheap enough to run before the frames leave the boot. §40's decisive arm never ran because
       two arms were floored to the same value and nothing read the applied state back.

       THROW, never `process.exit`, from inside this callback. `withGame` releases the capture
       lock, kills vite and runs `onReleasing` in a `finally` (harness.mjs:135-146); a
       `process.exit` here skips all three and LEAKS THE LOCK, which would block every capture in
       the queue behind a runner that aborted for a good reason. A throw aborts the chunk, hands
       the tree back, and still exits non-zero. (`die` remains correct for the PF6/PF7/argv
       checks — those all run before the lock is acquired.) */
    const armState = (a) => {
      const r = rows.find((q) => q.arm === a)?.readback;
      if (!r) return `<missing ${a}>`;
      return `${r.uConeShape}/${r.uGlow}/${r.colPatrol}/${r.beamBase}/${r.poolMix}/${r.beamCoreScale}/${r.lampToon}`;
    };
    if (armState('off') === armState('bon')) {
      throw new Error(`§40 ABORT: \`off\` and \`bon\` were rendered in the SAME state (${armState('off')}) — `
        + 'every target bar and every PROT row would be measuring nothing. An arm whose state '
        + 'collapses onto another scores nothing.');
    }
    if (SHOT === 'guard' && armState('bon') === armState('blamp')) {
      throw new Error(`§40 ABORT: \`bon\` and \`blamp\` were rendered in the SAME state (${armState('bon')}) — `
        + 'BL1 cannot attribute the lamp to a lever both arms share.');
    }
    if (armState('off') !== armState('back')) {
      console.log(`!! \`off\` and \`back\` differ in poked state (${armState('off')} vs ${armState('back')}) `
        + `— R_${SHOT} is expected to FAIL; recorded, not corrected.`);
    } else {
      console.log(`-- arm states distinct: off != bon${SHOT === 'guard' ? ', bon != blamp' : ''}; off == back`);
    }

    /* The DERIVED lamp state is reported, never aborted on: `uGuardLampW` is an outcome of
       §303's window arithmetic, not a lever this runner sets, and BV1/BL1 are where it is
       adjudicated. A diagnostic that kills the run destroys the evidence (Debug.js:151). */
    if (SHOT === 'guard') {
      const w = (a) => rows.find((q) => q.arm === a)?.readback?.uGuardLampW;
      if (!(w('bon') > 0)) {
        console.log(`!! guard.bon uGuardLampW = ${w('bon')} (want > 0). BV1 will VOID and BL1 has nothing `
          + 'to attribute. RECORDED, not corrected — this is a finding about §303\'s window, not a knob.');
      }
      if (w('bon') === w('blamp')) {
        console.log(`!! guard.bon and guard.blamp read the SAME uGuardLampW (${w('bon')}) — BL1's pair `
          + 'does not discriminate. Recorded, not corrected.');
      }
    }
    if (SHOT === 'interior') {
      const w = rows.find((q) => q.arm === 'bon')?.readback?.uGuardLampW;
      const l = rows.find((q) => q.arm === 'bon')?.readback?.light;
      console.log(`-- BV1's interior clause: interior.bon lampW=${w} _light=${l} (want lampW exactly 0). `
        + 'A2.7 item 3: a 0 here does NOT by itself distinguish the §303 underground window from '
        + '"this shot simply sits above the 0.56 knee" — the fold adjudicates from the whole '
        + '_light/lampW curve across all sixteen bon rows, not from this one zero.');
    }

    const t1 = treeState();
    if (t1.src !== EXPECT_HEAD) {
      throw new Error(`V_CHUNK_TREE ABORT: src moved DURING this chunk (${t1.src} != ${EXPECT_HEAD}). `
        + 'The frames just written are orphans — archive them; PF7 will refuse this chunk until '
        + 'they are gone (A2.8 risk 1: a chunk whose HEAD has moved should not be launched).');
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

/* ── per-chunk manifest, then the merged one the scorer reads ─────────────────────────────── */
writeFileSync(path.join(OUT, `manifest.${SHOT}.json`), JSON.stringify({
  seal: SEAL, warmup: WARMUP, shot: SHOT, head: HEAD, srcHash: EXPECT_HEAD,
  expect: { head: EXPECT_HEAD },
  staging: STAGE_DESC, stagingWarnings,
  values: { CONE_OFF, CONE_ON },
  arms: PLAN,
  capturedAt: new Date().toISOString(), pid: process.pid,
  rows,
}, null, 1));

/* The scorer reads a SINGLE `manifest.json` carrying `rows` (49) and `chunks` (16, one src hash
   across all of them — V_CHUNK_TREE / V_CHUNKS, A2.4). Rebuilt from whatever chunks exist after
   every run, so the last chunk to finish produces the complete file and an incomplete set is
   visibly incomplete rather than absent. Rows are emitted in sealed shot x arm order, so the
   merged file reads the same however the sixteen chunks were interleaved. */
const chunkFiles = readdirSync(OUT)
  .filter((f) => f.startsWith('manifest.') && f !== 'manifest.json' && f.endsWith('.json'));
const chunks = chunkFiles
  .map((f) => { try { return JSON.parse(readFileSync(path.join(OUT, f), 'utf8')); } catch { return null; } })
  .filter((c) => c && ROSTER.includes(c.shot))
  .sort((a, b) => ROSTER.indexOf(a.shot) - ROSTER.indexOf(b.shot));
const allRows = [];
for (const shot of ROSTER) {
  const ch = chunks.find((c) => c.shot === shot);
  if (!ch) continue;
  for (const arm of ARMS) {
    const r = ch.rows.find((q) => q.arm === arm);
    if (r) allRows.push(r);
  }
}
const hashes = [...new Set(chunks.map((c) => c.srcHash))];
const stagings = [...new Set(chunks.map((c) => c.staging))];
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  seal: SEAL, warmup: WARMUP, head: HEAD,
  srcHash: hashes.length === 1 ? hashes[0] : null,
  expect: { head: EXPECT_HEAD },
  staging: stagings.length === 1 ? stagings[0] : null,
  stagingModes: stagings,
  values: { CONE_OFF, CONE_ON },
  arms: ['off', 'bon', 'blamp (guard only)', 'back'],
  expectRows: EXPECT_ROWS, expectChunks: EXPECT_CHUNKS,
  chunks: chunks.map((c) => ({
    shot: c.shot, srcHash: c.srcHash, head: c.head, rows: c.rows.length,
    staging: c.staging, capturedAt: c.capturedAt,
  })),
  mergedAt: new Date().toISOString(), rows: allRows,
}, null, 1));

const done = chunks.map((c) => c.shot);
const left = ROSTER.filter((s) => !done.includes(s));
console.log(`\n${rows.length} frames -> ${OUT}   `
  + `(${allRows.length}/${EXPECT_ROWS} rows across ${chunks.length}/${EXPECT_CHUNKS} chunks)`);
if (hashes.length > 1) console.log(`!! V_CHUNK_TREE will VOID — chunks carry ${hashes.length} src hashes: ${hashes.join(', ')}`);
if (stagings.length > 1) console.log(`!! chunks were staged ${stagings.length} DIFFERENT ways — the run is not one capture:\n   `
  + stagings.join('\n   '));

/* A2.6, registered as a STEP OF THE CAPTURE PROCEDURE, not as advice: `progress/records/*​/**​/*.png`
   is gitignored (.gitignore:49) and a rollback wipes the working tree AND /tmp, so a chunk that is
   not force-added has no durable copy anywhere and is destroyed exactly as thoroughly as an
   in-flight one. Four runs' frames and run 1's whole 49-frame archive went that way. */
console.log(`\nFORCE-ADD NOW, BEFORE THE NEXT CHUNK LAUNCHES (A2.6/§329.1 — these PNGs are gitignored):`);
console.log(`  git add -f progress/records/guardcone1/${SHOT}.*.png progress/records/guardcone1/manifest.${SHOT}.json progress/records/guardcone1/manifest.json`);
console.log(`  git commit --no-gpg-sign -m "guardcone chunk ${SHOT}: ${rows.length} frames (AMENDMENT A2)"`);
console.log('  git push');
console.log(left.length
  ? `\nremaining chunks (${left.length}): ${left.join(', ')}\n  next: bash tools/launch.sh progress/records/guardcone/guardcone.mjs `
    + `/home/user/Demo/progress/records/logs/guardcone-${left[0]}.log /tmp/sands-of-ra/guardcone-${left[0]}.pid ${left[0]}`
  : `\nall ${EXPECT_CHUNKS} chunks present — score with:\n  node progress/records/guardcone/guardcone-score.mjs`);
