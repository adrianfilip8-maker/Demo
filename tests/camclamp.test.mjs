import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, V, DT } from './_moveset.mjs';
import { CameraRig, TUNE } from '../src/player/CameraRig.js';

/**
 * camclamp.test.mjs — rule 6: the subject-containment clamp, priced against the frames that
 * forced it.
 *
 * The user's ruling on the hardware sheet is one sentence — "Sly should always remain in frame"
 * — and it overrides item 12's decline, which was a cost-based call (§467: three bounds compose;
 * every single-term retune was "better everywhere, in frame nowhere", −1.04..−1.11, and each
 * cost the colonnade jumps). The clamp is therefore built as its own FINAL stage in `_write`,
 * engaging at `clampMargin` and contributing a bit-identical pose when the subject is inside it.
 * These arms hold the three photographed failure classes (the 16 m slam impact, the ring
 * arrival behind the camera plane, the climb-mount debt second), the zero-cost controls the
 * decline existed to protect, and the release dynamics at touchdown.
 *
 * Trajectories are recorded once through the REAL Controller on the real BVH (the
 * climbcam/camdrive pattern) and replayed through rigs that differ ONLY in `TUNE.clampMargin` —
 * 0.88 shipped vs 0 (the pre-ruling rig, genuinely RUN, not recalled). Controller-issued shakes
 * (the dive slam's `shake(0.35, 0.25)`) are recorded per frame and replayed into both arms, so
 * the post-clamp stages — shake and roll — are inside the measurement, not assumed away.
 */

/* ---- record ---------------------------------------------------------------------------- */

async function trace(frames, drive, start, yaw, pre) {
  const { engine, c } = await realWorld();
  hardReset(engine, c, start, yaw);
  /* The cached world SHARES one StubInput and one aim camera across traces, and both carry
     state a drive leaves behind: a phase-change while a key is down leaves it down FOREVER, and
     an `aim()`ed camera rotation persists into the next trace's camera-relative input — the
     first run of these arms had the jumps route read 47.8° of clamp because the debt drive's
     held jump and lintel aim rode into it and drove the runner up a dune it never visits when
     traced alone. Clear both: each trace starts from a released keyboard and the fresh-boot
     camera, exactly the state a single-trace process measures. */
  engine.input.clear?.();
  engine.camera.rotation.set(0, 0, 0);
  engine.camera.updateMatrixWorld(true);
  if (pre) pre(c);
  /* The moveset's shakes are BUS EVENTS (`emit('shake', amount)`), recorded off the event queue
     per frame so replay can hand the rig the same impacts on the same frames. The first version
     of this recorder stubbed `engine.get('camera')` and recorded zero across a real 16 m slam —
     which is how §475.4 was found: nothing in the game called the camera's shake either. */
  const shakes = [];
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const samples = [];
  for (let fi = 0; fi < frames; fi++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    const stop = drive(engine.input, fi, c, aim);
    engine.time = fi * DT; c.update(DT, fi * DT);
    for (const e of engine.events) if (e.evt === 'shake') shakes.push({ i: fi, s: e.payload });
    engine.events.length = 0;
    samples.push({ state: c.stateName, px: c.position.x, py: c.position.y, pz: c.position.z,
      vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z, grounded: c.grounded, yaw: c.yaw,
      at: c.attached ? c.attached.tag : null });
    if (stop) break;
  }
  return { samples, shakes };
}

/* ---- replay ---------------------------------------------------------------------------- */

const _subj = new THREE.Vector3(), _rel = new THREE.Vector3(), _fwd = new THREE.Vector3();

/** One passive rig over a recorded trajectory. `margin` is the arm switch: 0.88 shipped,
 *  0 = the pre-ruling rig. The §471 pole gate stays live in BOTH arms (attached published). */
function replay(samples, shakes, collision, margin, camYaw) {
  const keep = TUNE.clampMargin;
  TUNE.clampMargin = margin;
  try {
    const movement = { position: new THREE.Vector3(), velocity: new THREE.Vector3(),
      grounded: true, stateName: 'idle', yaw: Math.PI, attached: null };
    const cam = new THREE.PerspectiveCamera(TUNE.fovBase, 16 / 9, 0.1, 2000);
    /* A REAL listener bus (camdrive's pattern), because the shakes are re-delivered as the bus
       events they were — through the §475.4 subscription itself, not around it. */
    const L = new Map();
    const engine = {
      input: { look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, zoom: 0, pressed: () => false, down: () => false },
      camera: cam, scene: new THREE.Scene(), movement, collision,
      time: 0, dt: 0, timeScale: 1, debug: { freeCam: false }, warn() {}, has() { return false; },
      on(e, f) { if (!L.has(e)) L.set(e, new Set()); L.get(e).add(f); return () => {}; },
      emit(e, p) { for (const f of L.get(e) || []) f(p); },
      get(n) { return n === 'movement' ? movement : n === 'collision' ? collision : null; },
    };
    const rig = new CameraRig(engine);
    rig.init?.();
    const byFrame = new Map();
    for (const s of shakes) { if (!byFrame.has(s.i)) byFrame.set(s.i, []); byFrame.get(s.i).push(s); }
    const feed = (s) => {
      movement.position.set(s.px, s.py, s.pz);
      movement.velocity.set(s.vx, s.vy, s.vz);
      movement.stateName = s.state; movement.grounded = s.grounded; movement.yaw = s.yaw;
      movement.attached = s.at ? { tag: s.at } : null;
    };
    feed(samples[0]);
    rig.snap(true);
    if (camYaw !== undefined) { rig.yaw = camYaw; rig.snap(false); }
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      feed(s);
      for (const sh of byFrame.get(i) || []) engine.emit('shake', sh.s);
      engine.dt = DT; engine.time = i * DT;
      rig.update(DT, i * DT);
      _subj.set(s.px, s.py + TUNE.clampAnchorY, s.pz);
      cam.getWorldDirection(_fwd);
      _rel.copy(_subj).sub(cam.position);
      const inFront = _rel.dot(_fwd) > cam.near;      // §419: never trust a behind-plane ndc
      const ndc = _subj.clone().project(cam);
      out.push({ state: s.state, boom: rig.boom, inFront, ndcY: ndc.y, ndcX: ndc.x,
        clamp: rig._clampPitch, moved: rig._clampMoved, slide: rig._clampSlide,
        shakeAmp: rig._shakeAmp * rig._shakeEnv(),
        pos: cam.position.clone(), quat: cam.quaternion.clone() });
    }
    return out;
  } finally { TUNE.clampMargin = keep; }
}

/** Largest one-frame rotation of the WRITTEN view (shake and roll included), degrees. */
function maxStepDeg(arm, from, to) {
  let m = 0;
  for (let i = Math.max(1, from); i <= Math.min(to, arm.length - 1); i++) {
    m = Math.max(m, arm[i].quat.angleTo(arm[i - 1].quat) * 180 / Math.PI);
  }
  return m;
}

/** Bit-identical pose. Component equality, NOT `angleTo === 0`: `angleTo` runs acos over a dot
 *  whose value for two IDENTICAL normalized-to-one-ulp quaternions can sit one ulp under 1 and
 *  read ~3e-8 rad — the first version of these arms failed on exactly that, an instrument
 *  manufacturing the divergence it was built to detect (§439). */
const samePose = (a, b) => a.pos.x === b.pos.x && a.pos.y === b.pos.y && a.pos.z === b.pos.z
  && a.quat.x === b.quat.x && a.quat.y === b.quat.y && a.quat.z === b.quat.z && a.quat.w === b.quat.w;

/** In frame means BOTH axes — the T1 debt take is what forced ndcX into this predicate. */
const contained = (f) => f.inFront && Math.abs(f.ndcY) < 1.0 && Math.abs(f.ndcX) < 1.0;

/** The ruling as a predicate over a frame range: in front and inside the frame, EVERY frame. */
function assertContained(arm, from, to, label) {
  for (let i = from; i <= to; i++) {
    const f = arm[i];
    assert.ok(contained(f),
      `${label} frame ${i} (${f.state}): anchor ${f.inFront ? `ndc (${f.ndcX.toFixed(2)}, ${f.ndcY.toFixed(2)})` : 'BEHIND the camera plane'} — the ruling is violated`);
  }
}

/** Neither translate stage may fire on the committed capture classes — the slam and the
 *  arrival need ≤ ~66° of the 80° pitch authority and stay centred laterally. A fire here
 *  means the geometry got stranger than measured; the T1 debt arm is where fires are real,
 *  and it counts them instead of forbidding them. */
function assertNoTranslate(arm, label) {
  for (let i = 0; i < arm.length; i++) {
    assert.ok(arm[i].moved === 0 && arm[i].slide === 0,
      `${label} frame ${i}: a translate stage fired (dy ${arm[i].moved}, dx ${arm[i].slide})`);
  }
}

/* ========================================================================================= */

test('camclamp: the slam impact holds the subject, the release beats the fallPitch cut, and the pre-fall pose is untouched', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : margin 0.88 — over BOTH drops (16 m and 8 m, slamtrace's staging verbatim:
   *               settle, raw position.set, attack at frames 14/15), every frame from the drop
   *               to impact+30 keeps the chest anchor in front of the near plane and inside the
   *               frame — N = 0 consecutive out-of-frame frames, the ruling as an invariant,
   *               with the shipped dive shake replayed into the arm so the post-clamp stages
   *               are measured. The release after touchdown: the worst one-frame rotation of
   *               the written view stays under 10°/frame — the size of the fallPitch unwind the
   *               shipped rig performs at every fast landing, which §467.3 calls a cut; the
   *               clamp must not recreate what it exists to absorb. The bar predates the run
   *               (§141.1): it is the rig's own worst shipped step, not a number fit to output.
   * ran, fails  : margin 0 — the pre-ruling rig, same trajectory, same shakes: the §467 empty
   *               impact frame reconstructed as a run result (anchor out of frame or behind the
   *               plane at impact on the 16 m drop, out of frame on the 8 m drop).
   * does NOT    : judge whether the held edge frame READS as impact or as a lost camera — that
   * discriminate  is the hardware question the sheet's item 12 verdict box now carries; the boom
   *               and pivot channels (untouched by construction — asserted identical between
   *               arms); the browser pixels (the camlane5 re-photograph holds those).
   */
  const { collision } = await realWorld();
  for (const drop of [16, 8]) {
    let impact = -1, dropAt = -1;
    const { samples, shakes } = await trace(400, (inp, i, c) => {
      if (i === 30) { dropAt = i; c.position.set(0, c.position.y + drop, 30); c.velocity.set(0, 0, 0); }
      if (i === 44 || i === 45) inp.hold('attack'); else inp.let_go('attack');
      if (impact < 0 && i > 46 && c.grounded && c.stateName !== 'dive') impact = i;
      return impact > 0 && i >= impact + 30;
    }, V(0, 0, 30), Math.PI);
    assert.ok(impact > 46, `drop ${drop}: never landed (impact ${impact})`);
    assert.ok(samples.some((s) => s.state === 'dive'), `drop ${drop}: the attack press never became a dive — the staging is not a slam`);
    assert.ok(shakes.length > 0, `drop ${drop}: the dive slam never shook the camera — the recorder is not seeing the Controller's calls`);

    const on = replay(samples, shakes, collision, 0.88);
    const off = replay(samples, shakes, collision, 0);

    /* The failing input, run: the pre-ruling rig loses the subject at impact. */
    const offImp = off[impact];
    assert.ok(!offImp.inFront || offImp.ndcY <= -1.0,
      `drop ${drop}: the pre-ruling rig kept the subject in frame at impact (ndcY ${offImp.ndcY.toFixed(2)}) — the defect this clamp answers did not reproduce, so the pass below proves nothing`);

    /* The ruling, N = 0: drop through impact+30, every frame. */
    assertContained(on, dropAt, impact + 30, `drop ${drop} (on)`);
    assertNoTranslate(on, `drop ${drop}`);
    assert.ok(Math.abs(on[impact].ndcY) <= 0.97,
      `drop ${drop}: impact frame ndcY ${on[impact].ndcY.toFixed(3)} — margin plus the post-stage budget must stay under 0.97`);
    /* §475.4 end-to-end: the recorded bus event reached the rig THROUGH the subscription and
       the impact frames above were measured with the wobble live, not against a dead stage. */
    assert.ok(on[impact + 1].shakeAmp > 0.1,
      `drop ${drop}: the slam shake never reached the replay rig (amp ${on[impact + 1].shakeAmp}) — the §475.4 wiring is not being exercised`);

    /* Release: the worst one-frame view rotation after touchdown, shake included. */
    const rel = maxStepDeg(on, impact, impact + 30);
    assert.ok(rel < 10.0,
      `drop ${drop}: release step ${rel.toFixed(2)}°/frame — as large as the fallPitch cut the clamp exists to absorb`);

    /* Zero when inactive: before the drop the subject is centred and the arms are one rig. */
    for (let i = 1; i < dropAt; i++) {
      assert.ok(samePose(on[i], off[i]),
        `drop ${drop} frame ${i}: pre-fall pose differs between arms — the clamp is not zero-cost when inactive`);
    }
    /* And the clamp never touches the boom, engaged or not. */
    for (let i = 0; i < samples.length; i++) {
      assert.equal(on[i].boom, off[i].boom, `drop ${drop} frame ${i}: the clamp moved the boom`);
    }
    const held = on.slice(dropAt, impact + 1).filter((f) => f.clamp !== 0).length;
    console.log(`[camclamp] slam ${drop} m: off impact ndcY ${offImp.inFront ? offImp.ndcY.toFixed(2) : 'behind-plane'}`
      + ` -> on ${on[impact].ndcY.toFixed(2)} · engaged ${held}f of fall · release max ${rel.toFixed(2)}°/f`
      + ` · max |clamp| ${(Math.max(...on.map((f) => Math.abs(f.clamp))) * 180 / Math.PI).toFixed(1)}°`);
  }
});

/* The T3 drive, transplanted from climbcam (which transplanted thiefspots — the drive that
   shipped the line is the drive that measures it): walk-on mount, climb the SE drainpipe, vault
   onto the ring platform. The arrival is the behind-the-plane case on the record (§472:
   t3t2-ring ndcY −41.59, ndcZ −0.99, boom 0.55, camera ~3.1 m overhead). */
async function t3Trace() {
  let ph = 'walk', doneAt = -1;
  return trace(900, (inp, i, c, aim) => {
    if (doneAt >= 0) {
      /* Arrived: keys up, let the arrival settle — the committed takes were shot exactly this
         way (the smoke run that kept W held walked off the ring's far side instead). */
      inp.let_go('jump'); inp.let_go('interact');
      return i >= doneAt + 40;
    }
    if (c.stateName !== 'poleClimb' && ph === 'walk') {
      aim(21.35, -2.0); inp.move.y = 1;
      if (i % 8 === 0) inp.hold('interact'); else inp.let_go('interact');
    } else if (c.stateName === 'poleClimb') {
      ph = 'climb';
      if (c.position.y < 9.35) { inp.move.y = 1; }
      else { aim(22.6, -2.0); inp.move.y = 1; inp.hold('jump'); }
    } else { aim(22.6, -2.0); inp.move.y = 1; inp.let_go('jump'); }
    if (ph === 'climb' && c.stateName !== 'poleClimb' && c.grounded && c.position.y > 8.6 && c.position.x > 21.7 && i > 100) doneAt = i;
    return false;
  }, V(19.8, 0.02, -2.0), Math.PI);
}

test('camclamp: the ring arrival — the behind-plane case — is contained, and the composed climb is bit-identical', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : margin 0.88 — through the arrival window (touchdown to +40) the anchor is in
   *               front and inside the frame every frame; the rotation the arrival needs stays
   *               inside `clampPitchMax` (the branch that would translate fires nowhere); and
   *               on every poleClimb frame — the composed beat §471 delivered, the control the
   *               climb fix was verified against — the pose is bit-identical to the margin-0
   *               arm, because a composed frame is inside the margin and the clamp is stateless.
   * ran, fails  : margin 0 — the same replay reproduces the §472 arrival: subject behind the
   *               camera plane (or out of frame) within the arrival window.
   * does NOT    : fix the arrival's underlying crush (boom 0.55 at want 6.2 stands in both arms
   * discriminate  and climbcam pins it); judge the close-up's readability; cover the T2 rope.
   */
  const { collision } = await realWorld();
  const { samples, shakes } = await t3Trace();
  const climbIdx = [];
  samples.forEach((s, i) => { if (s.state === 'poleClimb') climbIdx.push(i); });
  assert.ok(climbIdx.length > 100, `T3 recorded ${climbIdx.length} poleClimb frames — the drive lost the pipe`);
  const touchdown = samples.findIndex((s, i) => i > climbIdx[climbIdx.length - 1] && s.grounded && s.py > 8.6 && s.px > 21.7);
  assert.ok(touchdown > 0, 'T3 never arrived on the ring platform');
  const end = Math.min(touchdown + 40, samples.length - 1);

  const t3yaw = Math.atan2(21.35 - 19.8, 0);
  const on = replay(samples, shakes, collision, 0.88, t3yaw);
  const off = replay(samples, shakes, collision, 0, t3yaw);

  const offBad = off.slice(touchdown, end + 1).filter((f) => !contained(f)).length;
  assert.ok(offBad > 0,
    'the pre-ruling arrival kept the subject in frame throughout — the §472 case did not reproduce, so the containment pass proves nothing');

  assertContained(on, touchdown, end, 'T3 arrival (on)');
  assertNoTranslate(on, 'T3');
  const maxClamp = Math.max(...on.map((f) => Math.abs(f.clamp))) * 180 / Math.PI;
  assert.ok(maxClamp * Math.PI / 180 < TUNE.clampPitchMax,
    `the arrival needed ${maxClamp.toFixed(1)}° — at or past the pitch authority; the translate branch is no longer headroom`);

  /* The statelessness claim, per frame: any climb frame whose pre-ruling subject is inside the
     margin must be bit-identical. Mount-transition frames beyond the margin are the ruling's to
     move and are counted, not equated. */
  let climbSame = 0, climbInside = 0;
  for (const i of climbIdx) {
    if (off[i].inFront && Math.abs(off[i].ndcY) <= 0.88) {
      climbInside++;
      if (samePose(on[i], off[i])) climbSame++;
    }
  }
  assert.ok(climbInside > 80, `only ${climbInside} inside-margin climb frames — the composed beat regressed`);
  assert.equal(climbSame, climbInside,
    `${climbInside - climbSame} inside-margin poleClimb frames moved under the clamp — the §471 control is no longer a control`);
  const behind = off.slice(touchdown, end + 1).filter((f) => !f.inFront).length;
  console.log(`[camclamp] T3 arrival: off ${offBad}/${end - touchdown + 1} frames uncontained (${behind} behind-plane)`
    + ` -> on 0 · max clamp ${maxClamp.toFixed(1)}° of ${(TUNE.clampPitchMax * 180 / Math.PI).toFixed(0)}° authority`);
});

test('camclamp: the hook-ring debt sequence — the harshest pose on record — is contained end to end', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : margin 0.88 — item 15's mount-dip mechanism (§472: the E-mash cadence
   *               catches the kiosk hook ring beside the obelisk, the swing is crushed to the
   *               0.55 hard-min against the shaft, and the recovery debt rides ~1.5 s into
   *               whatever follows), driven DELIBERATELY here: jump-grab the ring, ride the
   *               crushed swing, bail to the rope, climb out. From the ring grab to the top,
   *               EVERY frame keeps the anchor in front and inside the frame on BOTH axes —
   *               through the crushed swing, a failed bail that falls and re-catches, the
   *               behind-plane rope transfer, and the recovery tail. The translate stages are
   *               EXPECTED to fire here (the transfer needs the full 80° pitch authority, and
   *               the lateral slide is what holds a subject orbiting a 0.55 m boom) — they are
   *               counted and reported, not forbidden; containment through their fires is the
   *               assertion. Composed climb frames (inside margin, clamp idle) stay
   *               bit-identical to the margin-0 arm.
   * ran, fails  : margin 0 — the same trajectory loses the subject on DOZENS of frames
   *               (measured while building: |ndcY| to 27 behind the plane on the swing,
   *               |ndcX| to 3.05 at the transfer, §475.2's table), asserted as ≥ 20
   *               uncontained frames so a quiet re-route of the drive cannot hollow the arm.
   * does NOT    : shorten the debt (the recovery clock is item 12's lever 2, priced not
   * discriminate  shipped); assert the swing's boom (0.55 stands in both arms — §472's
   *               mechanism is untouched); reproduce the browser's exact cadence (the browser
   *               caught the ring by accident at one to two E-presses; this drive catches it
   *               on purpose — same collider, same crush, same debt).
   */
  const { collision } = await realWorld();
  let phase = 'jump', swingN = 0;
  const { samples, shakes } = await trace(1200, (inp, i, c, aim) => {
    if (phase === 'jump') {
      aim(-0.34, 11.36); inp.move.y = 1;                    // at the kiosk ring's shadow
      if (i >= 2 && i < 14) inp.hold('jump'); else inp.let_go('jump');
      if (i >= 4 && i % 2 === 0) inp.hold('interact'); else inp.let_go('interact');
      if (c.stateName === 'hookSwing') { phase = 'swing'; inp.let_go('interact'); }
      else if (c.stateName === 'poleClimb') phase = 'climb';
    } else if (phase === 'swing') {
      swingN++; inp.move.y = 1;                             // pump the crushed swing
      if (swingN > 55) phase = 'bail';
    } else if (phase === 'bail') {
      aim(0, 13.0); inp.move.y = 1;
      if (c.stateName === 'hookSwing') inp.hold('jump'); else inp.let_go('jump');
      if (i % 3 === 0) inp.hold('interact'); else inp.let_go('interact');
      if (c.stateName === 'poleClimb') phase = 'climb';
      if (c.grounded) phase = 'jump';                       // fell back — rejump, recatch
    } else {
      inp.move.y = 1;
      return c.position.y > 19.6;
    }
    return false;
  }, V(2.3, 9.02, 13.55), Math.PI);
  const firstHook = samples.findIndex((s) => s.state === 'hookSwing');
  const ropeAfter = samples.findIndex((s, i) => i > firstHook && s.state === 'poleClimb');
  assert.ok(firstHook >= 0, 'the drive never caught the kiosk ring — the debt mechanism is not on the trace');
  assert.ok(ropeAfter > firstHook, 'the drive never transferred from the ring to the rope');
  assert.ok(samples.some((s) => s.py > 19.5), 'the climb never topped out');

  const t1yaw = Math.atan2(0 - 2.3, 13.0 - 13.55);
  const on = replay(samples, shakes, collision, 0.88, t1yaw);
  const off = replay(samples, shakes, collision, 0, t1yaw);

  const offBad = off.slice(firstHook).filter((f) => !contained(f)).length;
  assert.ok(offBad >= 20,
    `the pre-ruling rig lost the subject on only ${offBad} frames — the §472 debt did not reproduce, so the containment pass proves nothing`);

  assertContained(on, firstHook, on.length - 1, 'debt sequence (on)');

  let fires = 0, maxSlide = 0, maxNeed = 0;
  for (const f of on) {
    if (f.moved !== 0 || f.slide !== 0) fires++;
    maxSlide = Math.max(maxSlide, Math.abs(f.slide));
    maxNeed = Math.max(maxNeed, Math.abs(f.clamp));
  }

  let composedSame = 0, composedAll = 0;
  for (let i = ropeAfter; i < samples.length; i++) {
    if (samples[i].state !== 'poleClimb') continue;
    if (off[i].inFront && Math.abs(off[i].ndcY) <= 0.88 && Math.abs(off[i].ndcX) <= 0.88 && on[i].clamp === 0) {
      composedAll++;
      if (samePose(on[i], off[i])) composedSame++;
    }
  }
  assert.ok(composedAll > 50, `only ${composedAll} composed climb frames after the transfer — the recovery never composed`);
  assert.equal(composedSame, composedAll, 'a composed climb frame moved under the clamp');
  console.log(`[camclamp] debt: off ${offBad} uncontained frames -> on 0 · translate fires ${fires}f`
    + ` (max slide ${maxSlide.toFixed(2)} m) · max need ${(maxNeed * 180 / Math.PI).toFixed(1)}°`
    + ` · composed climb ${composedSame}/${composedAll} bit-identical`);
});
test('camclamp: the routes the decline protected pay nothing they were not already paying, and the detector is itself checked', async () => {
  /* ── DOMAIN (§418.3) ─────────────────────────────────────────────────────────────────────
   * ran, passes : margin 0.88 — three routes under the exact claim the ruling's coordinator
   *               specified: |Δ| = 0 per frame WHEREVER the subject is inside the margin, and
   *               containment wherever it is not. The run-with-jumps — the colonnade-jump
   *               class, the specific cost that justified declining every item-12 lever —
   *               engages at most as a sub-visible graze, asserted under 1° so a route
   *               re-author that starts YANKING ordinary jumps trips this arm by name. The
   *               DESERT RUN is deliberately not under that bar, because building this arm
   *               found a case nobody had photographed (§475.5): past frame ~230 the route
   *               bounds up a dune face the §515 slopes fix made walkable, the boom
   *               occlusion-crushes to the 0.55 hard-min INTO the sand behind the runner, and
   *               the subject walks off the top of frame — ndcY +2.7..+3.3, plain `move`
   *               state, ordinary W-held play. The clamp catches it at up to ~41°; that is
   *               the ruling working on a genuine loss, not the protected class paying, and
   *               the engaged frames are asserted contained like any other. The into-masonry
   *               fall (camdrive's route, the one that ends in occlusion cuts) engages
   *               properly and every engaged frame is contained.
   * ran, fails  : the detector, deliberately: the same jumps replay at margin 0.30 must
   *               diverge somewhere, proving the bit-identical assertions are a discriminating
   *               instrument and not a vacuous equality between two dead arms. 0.30 sits under
   *               the route's own measured excursion (max |ndcY| 0.342, at a landing) — a
   *               first draft used 0.5 and never engaged, which is itself the finding: an
   *               ordinary jump lives 2.6× inside the margin, so the shipped 0.88 has a whole
   *               jump arc of headroom before ordinary play can ever meet it.
   * does NOT    : price the feel of the masonry catch (hardware's); cover the chain swings
   * discriminate  (the debt arm and spawn2eye's observer hold those); clamp ndcX anywhere it
   *               is not already clamped (reported only).
   */
  const { collision } = await realWorld();

  const run = await trace(240, (inp) => { inp.move.y = -1; }, V(0, 0.1, 30), 0);
  const jumps = await trace(300, (inp, i) => {
    inp.move.y = -1;
    if (i % 60 === 20 || i % 60 === 21) inp.hold('jump'); else inp.let_go('jump');
  }, V(0, 0.1, 30), 0);
  const masonry = await trace(200, (inp) => { inp.move.y = -1; }, V(14, 12.0, 24.5), Math.PI,
    (c) => { c.grounded = false; c.velocity.set(0, 2.0, -7.0); c.sm.set('fall'); });

  let maxX = 0;
  const profile = [];
  for (const [name, tr, ordinary] of [['desert run', run, false], ['run + jumps', jumps, true], ['into masonry', masonry, false]]) {
    const on = replay(tr.samples, tr.shakes, collision, 0.88);
    const off = replay(tr.samples, tr.shakes, collision, 0);
    let engaged = 0, maxNeed = 0;
    for (let i = 0; i < on.length; i++) {
      const offInside = off[i].inFront && Math.abs(off[i].ndcY) <= 0.88 && Math.abs(off[i].ndcX) <= 0.88;
      if (offInside) {
        assert.ok(samePose(on[i], off[i]),
          `${name} frame ${i}: an inside-margin frame moved under the clamp — the zero-cost guarantee broke`);
      } else {
        engaged++;
        maxNeed = Math.max(maxNeed, Math.abs(on[i].clamp));
        assert.ok(contained(on[i]),
          `${name} frame ${i}: out-of-margin frame not contained (${on[i].inFront ? on[i].ndcY.toFixed(2) : 'behind-plane'})`);
      }
      if (on[i].inFront) maxX = Math.max(maxX, Math.abs(on[i].ndcX));
    }
    if (ordinary) {
      assert.ok(maxNeed < 1 * Math.PI / 180,
        `${name}: an ordinary-jump catch reached ${(maxNeed * 180 / Math.PI).toFixed(2)}° — no longer a sub-visible graze; the paying row is paying`);
    }
    if (name !== 'debt') assertNoTranslate(on, name);
    profile.push(`${name} ${engaged}f engaged (max ${(maxNeed * 180 / Math.PI).toFixed(2)}°)`);
  }

  /* The detector's own falsification: at margin 0.30 — under the route's measured 0.342
     excursion — the jumps must engage and diverge. */
  const tight = replay(jumps.samples, jumps.shakes, collision, 0.30);
  const off2 = replay(jumps.samples, jumps.shakes, collision, 0);
  let div = 0;
  for (let i = 0; i < tight.length; i++) {
    if (tight[i].clamp !== 0 || !samePose(tight[i], off2[i])) div++;
  }
  assert.ok(div > 0,
    'a margin of 0.30 never engaged over 300 frames of jumps — the bit-identical assertions above are vacuous (two dead arms), not a zero-cost result');

  console.log(`[camclamp] controls: ${profile.join(' · ')} · margin-0.30 falsification ${div}f diverged`
    + ` · max |ndcX| ${maxX.toFixed(2)}`);
});
