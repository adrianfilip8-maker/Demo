#!/usr/bin/env node
/**
 * idlecensus.mjs — every standing/near-static pose the reference project contains, found by
 * CONTENT, on our rig, in both readings.
 *
 * WHY THIS EXISTS. The standing idle has now been ruled on four times (§479.15 → §479.18) and
 * rejected four times. Each round chose a target, matched it by measurement, and measured clean
 * before the user looked. The failure is no longer "does our pose match the number we chose" —
 * it is that WE keep choosing which pose they mean. So this stops choosing and enumerates: find
 * every candidate in the corpus, render each one, and let the user point.
 *
 * BY CONTENT, NOT BY NAME, and the corpus is bigger than the audit's. Four Sly glTFs carry
 * animation (Anims27 24 clips, Anims19 21, Anims14 13, Anims4 9) and the names do NOT line up
 * across them: Anims27's `Standupright` is `UprightStand` in Anims14 AND in Anims4, Anims14 has
 * a `CrouchingstandStand` that exists nowhere else, and Anims4 carries four `[Action Stash]`
 * clips whose names say nothing at all. A name filter would have missed most of the corpus, so
 * every clip in every file is measured and the classifier is geometric:
 *
 *   STATIC-ISH   hips world travel over the clip < TRAVEL_M, and mean per-second joint sweep
 *                (mean over the mapped set of world-rotation path) < SWEEP_DPS
 *   STANDING     both feet within FOOT_BAND of the pose's own lowest foot (i.e. planted, not
 *                one leg lifted), hips at >= HIP_FRAC of the rest hip height (rules out the
 *                crouches without ever reading a name), torso upright: chest-above-hips
 *                direction within UPRIGHT_DEG of world up
 *
 * BOTH READINGS PER CANDIDATE, because §479.17 measured that they differ and the user may be
 * pointing at a look only one of them produces:
 *
 *   raw       their clip retargeted straight onto RIG3 — "port the clip". The world-delta
 *             retarget composes their motion onto OUR rest, whose arms sit ~14.5° wider
 *             (§479.6), so a faithful port of a 47.7 cm pose arrives ~70 cm wide.
 *   matched   the same clip with ONE correction per arm: a rest-abduction delta solved (in the
 *             upperArm's raise channel, the rig's own sign table) so each hand lands at THEIR
 *             measured outboard distance. Nothing else is touched — this is the rest-pose
 *             difference removed, not a re-authoring of their pose.
 *
 * OUTPUT: `shots/idle19/candidates.json` — the census table for every clip in the corpus plus,
 * for each candidate, the two RIG3-space poses in Clips.js authoring format, ready for
 * `tools/idlesheet.mjs` to inject through the real `compile()` → `play()` seam and photograph.
 *
 *   node tools/idlecensus.mjs --src <checkout-root>
 */
import './_domshim.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { extractGLB, buildRetarget } from './godot2clips.mjs';
import { carry, fmtCarry } from './_posecarry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'shots/idle19');
const DEG = 180 / Math.PI;

/* Classifier thresholds. Each is a POSE property with a stated reason, not a tuned constant:
   a standing idle does not travel, does not sweep, keeps both feet down and the spine up. */
const TRAVEL_M = 0.25;     // their Walk moves the root ~0.75 m/cycle; an idle should not budge
const SWEEP_DPS = 45;      // mean joint angular speed; their Run peaks in the hundreds
const FOOT_BAND = 0.12;    // both feet within 12 cm of the lower one ⇒ planted, not stepping
const HIP_FRAC = 0.80;     // hips above 80% of REST hip height ⇒ upright, not a crouch
const UPRIGHT_DEG = 35;    // chest-above-hips within 35° of up ⇒ standing, not hanging/prone

const SOURCES = [
  'Assets/Models/Characters/SlyCooper_Anims27.gltf',
  'Assets/Temp Imports/tempsly/SlyCooper_Anims19.gltf',
  'Assets/Temp Imports/tempsly/SlyCooper_Anims14.gltf',
  'Assets/Temp Imports/tempsly/SlyCooper_Anims4.gltf',
];

const argv = process.argv.slice(2);
const si = argv.indexOf('--src');
if (si < 0 || !argv[si + 1]) throw new Error('idlecensus: --src <checkout-root> required');
const SRC_ROOT = path.resolve(argv[si + 1]);

/* ---- our rig, for the delivered readings ------------------------------------------------- */
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { compile, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const ourAt = (role) => new THREE.Vector3().setFromMatrixPosition(sly.bones[role].matrixWorld);

/** Pose one RIG3 authoring-format clip and read its carry() geometry. */
function ourCarry(raw) {
  const c = compile('cand', raw);
  pb.clear();
  sampleInto(c, c.hold ?? 0.5, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  return carry(ourAt);
}

/* ---- their rig: the joints carry() needs, by role ----------------------------------------- */
const SRC_ROLE = {
  hips: 'spine.001', chest: 'spine.004',
  upperArmL: 'upper_arm.L', lowerArmL: 'forearm.L', handL: 'hand.L',
  upperArmR: 'upper_arm.R', lowerArmR: 'forearm.R', handR: 'hand.R',
};
/* the joints the classifier needs beyond that */
const CLASS_JOINTS = ['spine.001', 'spine.004', 'foot.L', 'foot.R', 'toe.L', 'toe.R'];

/* ---- --probe: is a named clip ACTUALLY a sustained static pose? -----------------------------
   §479.19's first question is existence, not variety: the user asked "for the static pose, first
   check to see if it exists in the godot repo". "Their graph routes it as the idle" (§479.16) and
   "it is a sustained static standing pose" are DIFFERENT claims and only the first was ever
   established. This mode settles the second one by watching the pose over its own duration:
   a transition drifts, a one-frame pose has nothing to drift, and a real held idle stays put
   while breathing. Reported per clip: keyframe count, duration, and the maximum excursion of
   each tracked joint from its own mean across the whole clip. */
const PROBE = argv.includes('--probe');
const rows = [];
const probeRows = [];
const candidates = [];

for (const rel of SOURCES) {
  const gp = path.join(SRC_ROOT, rel);
  const { buf } = extractGLB(gp, null);                 // every clip, mesh-free
  const gltf = await new GLTFLoader().parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const { mixer, sample, resolve, root } = buildRetarget(gltf, false);
  const file = path.basename(rel);

  const _v = new THREE.Vector3();
  const at = (nm) => { const n = resolve(nm); return n ? _v.setFromMatrixPosition(n.matrixWorld).clone() : null; };
  const srcAt = (role) => at(SRC_ROLE[role]);
  /* rest hip height on THEIR rig, before anything plays — the crouch test's reference */
  root.updateMatrixWorld(true);
  const restHipY = at('spine.001').y;
  const restFootY = Math.min(at('foot.L').y, at('foot.R').y);
  const restHipAboveFoot = restHipY - restFootY;

  for (const clip of gltf.animations) {
    const name = clip.name;
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.reset(); act.play();

    /* one ascending pass (the §478.2 trap: clampWhenFinished freezes a re-sampled action) */
    const N = Math.max(3, Math.min(61, Math.round(clip.duration * 20) + 1));
    let hipMin = null, hipMax = null, sweepSum = 0, prevW = null;
    let footSpread = 0, hipFrac = 0, uprightDeg = 0, samples = 0;
    const mid = Math.floor(N / 2);
    let midSample = null, midCarry = null;
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * clip.duration;
      const s = sample(t);                                // advances the mixer AND matrixWorld
      const hip = at('spine.001'), chest = at('spine.004');
      const fl = at('foot.L'), fr = at('foot.R');
      if (!hipMin) { hipMin = hip.clone(); hipMax = hip.clone(); }
      hipMin.min(hip); hipMax.max(hip);
      footSpread += Math.abs(fl.y - fr.y);
      hipFrac += (hip.y - Math.min(fl.y, fr.y)) / restHipAboveFoot;
      const up = chest.clone().sub(hip).normalize();
      uprightDeg += Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)) * DEG;
      samples++;
      if (prevW) {
        let sum = 0, n = 0;
        for (const [b, w] of s.world) {
          const d = prevW.get(b).clone().invert().multiply(w);
          sum += 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG; n++;
        }
        sweepSum += n ? sum / n : 0;
      }
      prevW = s.world;
      if (i === mid) { midSample = s; midCarry = carry(srcAt); }
    }
    act.stop();

    if (PROBE) {
      /* re-walk the clip collecting joint tracks, then report excursion about the mean */
      const track = { hand: [], hips: [], foot: [] };
      const act2 = mixer.clipAction(clip);
      act2.setLoop(THREE.LoopOnce, 1); act2.clampWhenFinished = true; act2.reset(); act2.play();
      const M = Math.max(3, Math.min(81, Math.round(clip.duration * 20) + 1));
      for (let i = 0; i < M; i++) {
        sample((i / (M - 1)) * clip.duration);
        track.hand.push(at('hand.L').clone());
        track.hips.push(at('spine.001').clone());
        track.foot.push(at('foot.L').clone());
      }
      act2.stop();
      const excursion = (arr) => {
        const m = arr.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / arr.length);
        return +(Math.max(...arr.map((v) => v.distanceTo(m))) * 100).toFixed(2);
      };
      const nKeys = clip.tracks.length ? Math.max(...clip.tracks.map((t) => t.times.length)) : 0;
      probeRows.push({
        file, name: name.trim(), dur: +clip.duration.toFixed(2), keys: nKeys, samples: M,
        handCm: excursion(track.hand), hipsCm: excursion(track.hips), footCm: excursion(track.foot),
        kind: clip.duration <= 0 ? 'ZERO-LENGTH (a rest/bind pose, not an idle)'
          : excursion(track.hand) < 2 && excursion(track.hips) < 2 ? 'SUSTAINED STATIC POSE'
            : excursion(track.hand) < 8 ? 'held pose with motion (breathing/fidget)' : 'TRANSITION or cycle — not static',
      });
    }

    const travel = hipMax.distanceTo(hipMin);
    const dps = clip.duration > 0 ? sweepSum / clip.duration : 0;
    const footAvg = footSpread / samples;
    const hipAvg = hipFrac / samples;
    const upAvg = uprightDeg / samples;

    const isStatic = travel < TRAVEL_M && dps < SWEEP_DPS;
    const isStanding = footAvg < FOOT_BAND && hipAvg >= HIP_FRAC && upAvg < UPRIGHT_DEG;
    const verdict = isStatic && isStanding ? 'CANDIDATE'
      : isStatic ? `static, not standing (${footAvg >= FOOT_BAND ? 'feet split' : hipAvg < HIP_FRAC ? 'hips low' : 'torso off-axis'})`
        : isStanding ? 'standing, but moving' : '—';

    rows.push({
      file, name: name.trim(), dur: +clip.duration.toFixed(2),
      travel: +travel.toFixed(3), dps: +dps.toFixed(0),
      footSplit: +footAvg.toFixed(3), hipFrac: +hipAvg.toFixed(2), upright: +upAvg.toFixed(0),
      verdict, sepCm: midCarry.sepCm, outL: midCarry.L.handOutCm, outR: midCarry.R.handOutCm,
    });

    /* THE SHEET TIER IS WIDER THAN THE CANDIDATE TIER, deliberately. The user is pointing at a
       pose we keep failing to identify, so the sheet shows every STATIC pose the corpus holds —
       the crouched idles their graph routes to `idle crouch`, the perched/rail/pole idles, the
       unnamed `[Action Stash]` rest — not just the ones that pass the standing test. Filtering
       the sheet down to what I think they meant is the exact move that has failed four times. */
    if (!isStatic) continue;

    /* ---- the two readings, both as held 2-key poses at the clip's own mid phase ---------- */
    const P = midSample.P, pos = midSample.pos;
    const held = (pp) => ({ dur: 1, loop: true, hold: 0.5,
      keys: [{ t: 0, e: 'soft', P: pp, pos }, { t: 1, e: 'soft', P: pp, pos }] });
    const raw = held(P);
    const rawCarry = ourCarry(raw);

    /* matched: solve ONE rest-abduction delta per arm, in the upperArm raise channel
       ("upperArm: L +Z raises, R −Z raises" — Rig.js's own sign table), so each hand lands at
       THEIR measured outboard distance. Bisection on a monotone scalar; nothing else moves. */
    const solveArm = (S, targetCm) => {
      const idx = 2;                                       // Z channel — the raise
      const sign = S === 'L' ? 1 : -1;
      const bone = `upperArm${S}`;
      if (!P[bone]) return 0;
      const base = P[bone][idx];
      const evalD = (d) => {
        const pp = JSON.parse(JSON.stringify(P));
        pp[bone][idx] = base + sign * d;
        return ourCarry(held(pp))[S].handOutCm;
      };
      let lo = -60, hi = 60;
      const fLo = evalD(lo), fHi = evalD(hi);
      if ((fLo - targetCm) * (fHi - targetCm) > 0) {
        return Math.abs(fLo - targetCm) < Math.abs(fHi - targetCm) ? lo : hi;   // clamp, honestly
      }
      for (let i = 0; i < 34; i++) {
        const midD = (lo + hi) / 2;
        const f = evalD(midD);
        if ((f - targetCm) * (fLo - targetCm) > 0) lo = midD; else hi = midD;
      }
      return +((lo + hi) / 2).toFixed(2);
    };
    const dL = solveArm('L', midCarry.L.handOutCm);
    const dR = solveArm('R', midCarry.R.handOutCm);
    const Pm = JSON.parse(JSON.stringify(P));
    if (Pm.upperArmL) Pm.upperArmL[2] = P.upperArmL[2] + dL;
    if (Pm.upperArmR) Pm.upperArmR[2] = P.upperArmR[2] - dR;
    const matched = held(Pm);
    const matchedCarry = ourCarry(matched);

    candidates.push({
      file, name: name.trim(), dur: +clip.duration.toFixed(2), verdict,
      standing: isStanding,
      /* Dedupe fingerprint: the same authored pose is re-exported under different names in
         different files (Standupright / UprightStand / CrouchingStand), and the sheet must show
         it ONCE. Quantised deliberately — re-exports of one pose differ by export float noise
         (measured: CaneSwing Idle 26.7 vs 27.1 cm, Crouching stand 57.9 vs 57.8), and an exact
         fingerprint splits them into duplicate tiles that then collide on filename and silently
         overwrite each other's frames. 2 cm and 5° are far below the gap between DISTINCT poses
         here (the nearest pair is 8.4 cm apart) and far above the noise. */
      fp: [Math.round(midCarry.sepCm / 2), Math.round(midCarry.L.handOutCm / 2),
        Math.round(midCarry.R.handOutCm / 2), Math.round(midCarry.L.fold / 5),
        Math.round(midCarry.R.fold / 5), Math.round(hipAvg * 10)].join('|'),
      ref: { sepCm: midCarry.sepCm, outL: midCarry.L.handOutCm, outR: midCarry.R.handOutCm,
        abdL: midCarry.L.abduction, abdR: midCarry.R.abduction, foldL: midCarry.L.fold, foldR: midCarry.R.fold },
      raw: { pose: raw, sepCm: rawCarry.sepCm, outL: rawCarry.L.handOutCm, outR: rawCarry.R.handOutCm,
        foldL: rawCarry.L.fold, foldR: rawCarry.R.fold },
      matched: { pose: matched, dL, dR, sepCm: matchedCarry.sepCm, outL: matchedCarry.L.handOutCm,
        outR: matchedCarry.R.handOutCm, foldL: matchedCarry.L.fold, foldR: matchedCarry.R.fold },
    });
  }
}

/* ---- report ------------------------------------------------------------------------------- */
if (PROBE) {
  console.log('\nDOES A STATIC STANDING POSE EXIST? — every clip, watched over its own duration\n');
  console.log('file                        clip                    dur  keys   handL±   hips±   footL±   what it is');
  for (const r of probeRows) {
    console.log(`${r.file.padEnd(26)} ${r.name.padEnd(22)} ${String(r.dur).padStart(5)} ${String(r.keys).padStart(5)}`
      + `  ${(r.handCm + ' cm').padStart(8)} ${(r.hipsCm + ' cm').padStart(8)} ${(r.footCm + ' cm').padStart(8)}   ${r.kind}`);
  }
}

console.log('\nCENSUS — every clip in the four Sly glTFs, classified by CONTENT\n');
console.log('file                        clip                    dur  travel   °/s  footSplit hipFrac upright  verdict');
for (const r of rows) {
  console.log(`${r.file.padEnd(26)} ${r.name.padEnd(22)} ${String(r.dur).padStart(5)} `
    + `${String(r.travel).padStart(7)} ${String(r.dps).padStart(5)} ${String(r.footSplit).padStart(9)} `
    + `${String(r.hipFrac).padStart(7)} ${String(r.upright).padStart(7)}  ${r.verdict}`);
}

/* one row per distinct authored pose; `alsoIn` records where else it appears verbatim */
const seen = new Map();
for (const c of candidates) {
  const hit = seen.get(c.fp);
  if (hit) { hit.alsoIn.push(`${c.file}/${c.name}`); continue; }
  c.alsoIn = [];
  seen.set(c.fp, c);
}
const sheet = [...seen.values()];
console.log(`\n${candidates.length} static pose(s) → ${sheet.length} DISTINCT after dedupe — their pose, our raw port, our matched port\n`);
for (const c of sheet) {
  console.log(`${c.file} / ${c.name}  (${c.dur} s)  [${c.verdict}]${c.alsoIn.length ? `  == ${c.alsoIn.join(', ')}` : ''}`);
  console.log(`   THEIR rig     sep ${String(c.ref.sepCm).padStart(6)} cm   hand out L ${String(c.ref.outL).padStart(6)} R ${String(c.ref.outR).padStart(6)}   fold ${c.ref.foldL}/${c.ref.foldR}   abduction ${c.ref.abdL}/${c.ref.abdR}`);
  console.log(`   raw port      sep ${String(c.raw.sepCm).padStart(6)} cm   hand out L ${String(c.raw.outL).padStart(6)} R ${String(c.raw.outR).padStart(6)}   fold ${c.raw.foldL}/${c.raw.foldR}`);
  console.log(`   matched port  sep ${String(c.matched.sepCm).padStart(6)} cm   hand out L ${String(c.matched.outL).padStart(6)} R ${String(c.matched.outR).padStart(6)}   fold ${c.matched.foldL}/${c.matched.foldR}   (Δabduction L ${c.matched.dL}° R ${c.matched.dR}°)`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify({ rows, sheet }, null, 1));
console.log(`\nwrote ${path.join(OUT, 'candidates.json')}  (${sheet.length} distinct poses for the sheet, ${rows.length} clips censused)`);
if (warnings.length) console.log(`warnings: ${warnings.slice(0, 3).join(' | ')}`);
