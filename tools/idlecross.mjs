#!/usr/bin/env node
/**
 * idlecross.mjs — "the arms are still crossed when in the idle position", measured where the
 * eye looks: at the SKINNED MESH on the SHIPPED rig, not at bone origins.
 *
 * §479.5's census and §532's repair both measure bone origins through `SlyModel`'s skeleton.
 * That instrument is blind to one whole term, and §470.1 already paid for it once: the shipped
 * character is `SlyModelDLRig`, whose carry rotates each bone's GEOMETRY to align the FBX bind
 * axis with ours. Geometry is what gets skinned; bone origins do not move with it. So a pose
 * can measure uncrossed at every joint and still photograph with the forearms crossed — which
 * is precisely the shape of a report that survives two rounds of "measured clean".
 *
 * Per arm this reports, in the pose's own shoulder-line frame (yaw-invariant, §479.5's frame):
 *   · BONE   lateral of handL/handR — what the census sees;
 *   · MESH   the skin-weighted vertex centroid of each forearm and hand — what the player sees;
 *   and the visible separation, negative = the forearms/gloves are on each other's sides.
 *
 * Arms, the §470 pattern: default (dlrig, shipped) vs `CHAR=model3` (the procedural rebuild, no
 * FBX carry). Same clip, same beat. A defect on both is CLIP DATA; a defect only on dlrig is
 * the CARRY, and no amount of re-authoring `Clips.js` would ever have reached it.
 *
 *   node tools/idlecross.mjs                 shipped rig      -> shots/idlecross/dlrig-*
 *   CHAR=model3 node tools/idlecross.mjs     control arm      -> shots/idlecross/model3-*
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHAR = process.env.CHAR || '';
const ARM = CHAR || 'dlrig';
const OUT = process.env.OUT || `${ROOT}/shots/idlecross`;
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);

async function freePort(start = 6100) {
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startServer(port) {
  const proc = spawn(`${ROOT}/node_modules/.bin/vite`,
    ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 240; i++) {
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite never listened:\n${log}`);
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/'], { cwd: ROOT, encoding: 'utf8' }).trim();
await mkdir(OUT, { recursive: true });
const release = await acquire('idlecross');
console.log(`[idle] lock · sha ${sha}${dirty ? ' · DIRTY' : ' · clean'} · arm ${ARM}`);

const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const log = [];
try {
  await page.goto(`http://127.0.0.1:${port}/?shot=1&q=high${CHAR ? `&char=${CHAR}` : ''}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => {
    window.__ENGINE.stopLoop();
    window.__GAME.hideHud(true);
    window.__ENGINE.debug.freeCam = false;
    window.__ENGINE.input.locked = true;
    const e = window.__ENGINE;
    window.__simStep = (n, dt) => {
      for (let i = 0; i < n; i++) {
        e.input?.beginFrame?.();
        e.dt = Math.min(dt, 1 / 20) * e.timeScale;
        if (e.debug.paused || e.paused) e.dt = 0;
        e.time += e.dt; e.frame++;
        for (const { mod } of e._ordered) {
          if (typeof mod.update === 'function') { try { mod.update(e.dt, e.time); } catch {} }
        }
      }
    };
    /* BONE vs MESH, in the shoulder-line body frame. The mesh half is the point of the tool:
       it walks the skinned geometry with the same bone transform the GPU uses, so the number
       moves when the DL carry rotates a forearm's geometry — which bone origins never do. */
    window.__armProbe = () => {
      const e = window.__ENGINE, ch = e.get('character'), a = e.get('animation');
      const B = ch?.bones || {};
      /* THREE is not resolvable as a bare specifier inside the page, and importing the app's
         copy is unnecessary: the engine already holds live instances, so borrow the class off
         one of them. (First run of this tool died on `await import('three')` here.) */
      const V3 = e.camera.position.constructor;
      const V = (x, y, z) => new V3(x, y, z);
      const wp = (b) => { b.updateWorldMatrix(true, false); const m = b.matrixWorld.elements; return V(m[12], m[13], m[14]); };
      const ua = wp(B.upperArmL), ub = wp(B.upperArmR), hip = wp(B.hips);
      const lat = ua.clone().sub(ub); lat.y = 0; lat.normalize();
      const latOf = (p) => p.clone().sub(hip).dot(lat) / 0.28;
      const want = { lowerArmL: 1, handL: 1, lowerArmR: 1, handR: 1 };
      const acc = {}; for (const k in want) acc[k] = { sum: V(0, 0, 0), w: 0 };
      const _v = V(0, 0, 0);
      ch.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const g = o.geometry, pos = g.attributes.position;
        const sIdx = g.attributes.skinIndex, sW = g.attributes.skinWeight;
        if (!sIdx || !sW) return;
        const names = o.skeleton.bones.map((b) => b.name);
        for (let v = 0; v < pos.count; v++) {
          for (let k = 0; k < 4; k++) {
            const w = sW.getComponent(v, k);
            if (w <= 0.15) continue;
            const nm = names[sIdx.getComponent(v, k)];
            if (!acc[nm]) continue;
            _v.fromBufferAttribute(pos, v);
            if (o.applyBoneTransform) o.applyBoneTransform(v, _v); else o.boneTransform(v, _v);
            _v.applyMatrix4(o.matrixWorld);
            acc[nm].sum.add(_v.clone().multiplyScalar(w)); acc[nm].w += w;
          }
        }
      });
      /* THE VOLUME TEST — the one the census never ran. A hand ORIGIN can sit on its own side
         while the arm's geometry laps the other arm: hands are ~10 cm wide and a forearm is a
         tube. This walks both arms' skinned vertices and reports the signed lateral gap
         between the left arm's innermost point and the right arm's innermost point. Negative
         = the two arms occupy each other's side, which is what an eye calls "crossed". */
      const LSET = { shoulderL: 1, upperArmL: 1, lowerArmL: 1, handL: 1 };
      const RSET = { shoulderR: 1, upperArmR: 1, lowerArmR: 1, handR: 1 };
      let lMin = Infinity, rMax = -Infinity;
      ch.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const g = o.geometry, pos = g.attributes.position;
        const sIdx = g.attributes.skinIndex, sW = g.attributes.skinWeight;
        if (!sIdx || !sW) return;
        const names = o.skeleton.bones.map((b) => b.name);
        for (let v = 0; v < pos.count; v++) {
          let wl = 0, wr = 0;
          for (let k = 0; k < 4; k++) {
            const w = sW.getComponent(v, k); if (w <= 0) continue;
            const nm = names[sIdx.getComponent(v, k)];
            if (LSET[nm]) wl += w; else if (RSET[nm]) wr += w;
          }
          if (wl < 0.6 && wr < 0.6) continue;
          _v.fromBufferAttribute(pos, v);
          if (o.applyBoneTransform) o.applyBoneTransform(v, _v); else o.boneTransform(v, _v);
          _v.applyMatrix4(o.matrixWorld);
          const x = latOf(_v) * 0.28;                       // back to metres
          if (wl >= 0.6) { if (x < lMin) lMin = x; } else if (x > rMax) rMax = x;
        }
      });

      const out = { clip: null, bone: {}, mesh: {} };
      out.gapCm = Number.isFinite(lMin) && Number.isFinite(rMax) ? +((lMin - rMax) * 100).toFixed(1) : null;
      /* ATTRIBUTION (§479.11). The standing idles are TREE-driven, so `a.tracks` is EMPTY for
         them and the first run of this tool wrote `clip: ""` on all seven frames — a capture
         that cannot name what it photographed, which is the §510 trap in a capture tool. The
         tree's own selection is the honest read: `idleVariant` is the standing idle the tree's
         node 0 is showing, and `idleBlend < 1` means a variant crossfade is in flight. Both are
         printed on every frame so a frame labelled `idle3-look` that is actually still showing
         `idle_confident` refutes itself on its own telemetry. */
      const tr = (a?.tracks || []).filter((t) => t.clip && t.w > 0.01)
        .map((t) => `${t.clip.name}:${t.w.toFixed(2)}`);
      out.clip = tr.join(' ');
      out.idleVariant = a?.idleVariant ?? null;
      out.idleBlend = a?.idleBlend != null ? +a.idleBlend.toFixed(2) : null;
      out.bored = (() => { const st = e.get('movement')?.sm?.current; return st && '_bored' in st ? +st._bored.toFixed(1) : null; })();
      for (const n of ['handL', 'handR', 'lowerArmL', 'lowerArmR']) {
        if (B[n]) out.bone[n] = +latOf(wp(B[n])).toFixed(2);
        if (acc[n] && acc[n].w > 0) {
          const c = acc[n].sum.clone().multiplyScalar(1 / acc[n].w);
          out.mesh[n] = { lat: +latOf(c).toFixed(2), y: +c.y.toFixed(2) };
        }
      }
      out.boneSep = +(out.bone.handL - out.bone.handR).toFixed(2);
      out.meshSep = out.mesh.handL && out.mesh.handR
        ? +(out.mesh.handL.lat - out.mesh.handR.lat).toFixed(2) : null;
      out.meshSepFore = out.mesh.lowerArmL && out.mesh.lowerArmR
        ? +(out.mesh.lowerArmL.lat - out.mesh.lowerArmR.lat).toFixed(2) : null;
      return out;
    };
  });
  const sim = (n = 1) => page.evaluate((k) => window.__simStep(k, 1 / 60), n);
  const snap = async (name, az, dist = 2.6, h = 1.15) => {
    const tel = await page.evaluate(([azDeg, d, hh]) => {
      const e = window.__ENGINE, m = e.get('movement');
      const t = window.__armProbe();
      const a2 = (m.yaw ?? 0) + (azDeg * Math.PI / 180);
      e.debug.freeCam = true;
      e.camera.position.set(m.position.x + Math.sin(a2) * d, m.position.y + hh, m.position.z + Math.cos(a2) * d);
      e.camera.lookAt(m.position.x, m.position.y + 0.95, m.position.z);
      e.camera.updateMatrixWorld(true);
      /* §479.14: the frame records WHICH SIDE it was shot from, measured, not named. The
         camera sits at yaw+az and looks back at the character, and RIG3 faces +Z, so
         cam·facing = cos(az): +1 is in front of him, −1 is behind him. Stamped per frame
         because `front34` was composed at az 145 for this tool's whole life, which is
         cam·facing −0.82 — a REAR three-quarter under a name that says front. */
      const camDot = Math.cos(azDeg * Math.PI / 180);
      return { st: m?.stateName, az: azDeg,
        camDot: +camDot.toFixed(2),
        view: camDot > 0.3 ? 'front' : camDot < -0.3 ? 'REAR' : 'profile',
        ...t };
    }, [az, dist, h]);
    const uri = await page.evaluate(() => window.__GAME.capture('image/png'));
    await page.evaluate(() => { window.__ENGINE.debug.freeCam = false; });
    await writeFile(`${OUT}/${ARM}-${name}.png`, Buffer.from(uri.split(',')[1], 'base64'));
    if (/front/.test(name) && tel.view !== 'front') {
      throw new Error(`idlecross: "${name}" was shot from ${tel.view} (cam·facing ${tel.camDot}) `
        + '— a frame named front must BE one; §479.14');
    }
    log.push({ frame: `${ARM}-${name}`, az, ...tel });
    console.log(`  -> ${ARM}-${name}.png  BONE sep ${tel.boneSep}  MESH sep ${tel.meshSep}`
      + `  GAP ${tel.gapCm} cm${tel.gapCm < 0 ? ' *** ARMS OVERLAP ***' : ''}`
      + `  showing ${tel.idleVariant}${tel.idleBlend != null && tel.idleBlend < 1 ? ` (fading ${tel.idleBlend})` : ''}`
      + ` bored ${tel.bored}${tel.clip ? ` [${tel.clip}]` : ''}`);
    return tel;
  };

  await sim(40);
  await page.evaluate(() => { const m = window.__ENGINE.get('movement'); m.position.set(0, 0, 30); m.velocity.set(0, 0, 0); });
  await sim(120);                                  // settle into the real standing idle

  /* THE BIND BASELINE (§479.13) — the calibration every earlier run of this tool was missing.
   *
   * `gapCm` is a SURFACE clearance: innermost left-arm vertex minus innermost right-arm vertex.
   * It therefore reads limb BULK as well as limb placement, and the two arms of this experiment
   * are two entirely different meshes — an FBX-authored character carried onto RIG3 versus a
   * procedural rebuild. Comparing their gaps at a pose conflates "the carry rotated a forearm"
   * with "this model simply has chunkier gloves", and §479.12 read the sum of both as carry cost.
   *
   * With every bone forced to identity and the hips at bind, NO clip and NO carry rotation of a
   * POSED bone is involved: what remains is each model's own geometry. The difference between
   * the two arms here is the constant that must be subtracted from every posed comparison before
   * any of it can be called a defect. Probed without stepping the sim, so ANIMATION overwrites
   * it again on the next frame and nothing downstream sees a bind-posed character. */
  const bindTel = await page.evaluate(() => {
    const ch = window.__ENGINE.get('character');
    for (const n of ch.boneNames || Object.keys(ch.bones || {})) {
      const b = ch.bones[n]; if (!b) continue;
      b.quaternion.identity(); b.scale.set(1, 1, 1);
    }
    if (ch.bones.hips && ch.bp) ch.bones.hips.position.copy(ch.bp('hips'));
    ch.root.updateMatrixWorld(true);
    const t = window.__armProbe();
    t.clip = 'BIND (all bones identity)';
    return t;
  });
  log.push({ frame: `${ARM}-idle0-bind`, az: null, ...bindTel });
  console.log(`  [bind baseline] BONE sep ${bindTel.boneSep}  MESH sep ${bindTel.meshSep}`
    + `  GAP ${bindTel.gapCm} cm   <- geometry only, no clip, no posed carry`);
  /* HAND THE BODY BACK. The probe above wrote identity onto every bone and did NOT step the
     sim, so ANIMATION had not yet re-posed the skeleton when the next capture ran: the first
     run of this baseline photographed and measured BIND under the label `idle1-confident`
     (gap 23.9 and boneSep 3.68 — bit-identical to the bind row that preceded it, which is what
     gave it away). A capture that cannot be told apart from the probe before it is the §479.11
     trap wearing a new hat. Stepping here restores the real standing idle before anything is
     labelled, and the assertion below refuses to continue if it has not. */
  await sim(30);
  const restored = await page.evaluate(() => window.__armProbe());
  if (Math.abs(restored.boneSep - bindTel.boneSep) < 1e-6) {
    throw new Error(`idlecross: the skeleton is still in BIND after the baseline `
      + `(boneSep ${restored.boneSep}) — every idle capture below would be mislabelled bind`);
  }

  /* The boredom timer is SIMULATED time, and 13 s of it on a loaded box is many minutes of wall
     clock spent producing frames whose content is a pure function of one number. `Idle.update`
     picks the clip from `this._bored` alone (Moveset.js:141), so this sets that field directly
     and lets the real state machine do the choosing: same code path, same 0.3 s crossfade, ~800
     fewer simulated frames. It cannot fake the result — every frame's telemetry names the track
     actually playing, so if the jump did not take, the frame says `idle_confident` and the
     evidence refutes itself. */
  const boredTo = (v) => page.evaluate((n) => {
    const st = window.__ENGINE.get('movement').sm.current;
    if (st && '_bored' in st) { st._bored = n; return true; }
    return false;
  }, v);

  /* THE IDLE POSITION IS THREE CLIPS, and the boredom timer decides which: Moveset.js:141 gives
     `idle_confident` for the first 6 s, `idle_bored` past 6, and `idle_look` past 13. A player
     who stands still and looks at his character — which is exactly what a reviewer does — is
     looking at `idle_look` within fifteen seconds. Every earlier idle capture in this project
     (§531's pair included) settled ~2 s and therefore only ever photographed the first of the
     three. Two samples per stage, profile + front-quarter (§466.5). */
  await snap('idle1-confident-profile', 90);
  await snap('idle1-confident-front34', 35, 2.4);
  await snap('idle1-confident-rear34', 145, 2.4);
  await boredTo(7);   await sim(24);               // past the 6 s step, without simulating it
  await snap('idle2-bored-profile', 90);
  await snap('idle2-bored-front34', 35, 2.4);
  await boredTo(14);  await sim(24);               // past the 13 s step — the suspect
  await snap('idle3-look-profile', 90);
  await snap('idle3-look-front34', 35, 2.4);
  await sim(50);
  await snap('idle3-look-b-profile', 90);

  /* THE SURFACE SWEEP (§479.13) — the volume predicate over the WHOLE table, on the real rig.
   *
   * §479.10 swept the predicate offline through `SlyModel`'s skin and flagged ten clips; its own
   * honest limit was that those numbers are NOT the shipped `SlyModelDLRig`. Run here, the same
   * measurement lands on whichever character `CHAR=` selected, so the pair of runs prices the
   * carry across the animation surface instead of the idle family alone. Posed through the real
   * `animation.play()` seam with the movement module parked — §479's pose-take precedent: clip
   * table, splice, donor fill, skinning and renderer all shipped, only the state machine that
   * would immediately re-base the clip is stopped. No frames: this is the numeric arm, and the
   * frames the eye needs are the idle captures above. */
  const SWEEP = (process.env.SWEEP || '').trim();
  if (SWEEP) {
    await page.evaluate(() => { window.__SKIPMOVE = true; });
    await sim(4);
    for (const name of SWEEP.split(',').map((s) => s.trim()).filter(Boolean)) {
      const row = await page.evaluate(async (n) => {
        const { ACTIVE } = await import('/src/player/Animation.js');
        const c = ACTIVE[n];
        if (!c) return { clip: n, missing: true };
        window.__ENGINE.get('animation').play(n, { fade: 0, loop: c.loop, speed: 1 });
        return { clip: n, dur: c.dur, loop: !!c.loop };
      }, name);
      if (row.missing) { console.log(`  [sweep] ${name}: NOT IN TABLE`); continue; }
      await sim(8);                                  // let the track reach full weight
      /* worst (most negative) gap over the clip's own phases — a crossing that exists for
         three frames is still a crossing the eye catches */
      let worst = Infinity, worstPh = null, probed = 0;
      for (const ph of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const t = await page.evaluate(async ([n, p]) => {
          const { ACTIVE } = await import('/src/player/Animation.js');
          const a = window.__ENGINE.get('animation');
          const tr = a.tracks.find((x) => x.clip && x.clip.name === n);
          /* §479.11's trap, refused rather than repeated: a TREE-driven clip (the standing
             idles, sneak_idle) never appears in `tracks`, so a silent miss here would measure
             whatever the tree happens to be showing and report it under this clip's name. No
             track, no number. */
          if (!tr) return { noTrack: true };
          tr.time = p * ACTIVE[n].dur; tr.w = 1; tr.target = 1;
          a.update(1 / 600, window.__ENGINE.time);   // resample at the forced playhead
          const out = window.__armProbe();
          const live = a.tracks.find((x) => x.clip && x.clip.name === n);
          out.trackW = live ? +live.w.toFixed(2) : 0;
          return out;
        }, [name, ph]);
        if (t && t.noTrack) { worst = NaN; break; }
        if (t && t.gapCm != null && t.trackW >= 0.9) {
          probed++;
          if (t.gapCm < worst) { worst = t.gapCm; worstPh = ph; }
        }
      }
      const treeDriven = Number.isNaN(worst);
      const rec = { frame: `${ARM}-sweep-${name}`, sweep: true, clip: name,
        worstGapCm: Number.isFinite(worst) ? worst : null, worstPhase: worstPh, phases: probed,
        treeDriven };
      log.push(rec);
      console.log(`  [sweep] ${name.padEnd(16)} `
        + (treeDriven
          ? 'TREE-DRIVEN — no track, not measurable this way (§479.11)'
          : `worst gap ${String(rec.worstGapCm).padStart(7)} cm @ph ${worstPh} (${probed}/5 phases)`
            + `${rec.worstGapCm < 0 ? '   *** OVERLAP ***' : ''}`));
    }
  }
} finally {
  await writeFile(`${OUT}/telemetry-${ARM}.json`, JSON.stringify({ sha, dirty, W, H, ARM, errs, log }, null, 2));
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await release();
  console.log(`[idle] done · ${log.length} frames · errs ${errs.length}`);
  if (errs.length) console.log(errs.slice(0, 6).join('\n'));
}
