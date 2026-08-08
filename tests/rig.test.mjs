import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { CLIPS, MISSING } from '../src/player/Clips.js';

/**
 * Structural guards on the skeleton and the 52 hand-authored clips.
 *
 * This project had no automated tests at all before this file: every claim was verified by a
 * ~5-minute headless capture holding a global lock, which is the right instrument for "does this
 * look better" and a terrible one for "does this data contradict itself". `Clips.js` is over two
 * thousand lines of hand-written keyframes naming bones as strings, and a typo in a bone name is
 * silent — the pose simply omits that bone and the character is subtly wrong in one frame of one
 * clip, which no capture would isolate.
 *
 * The pattern is borrowed, with thanks, from PauliusOS/pallet-town-3d (MIT), whose `sculpt.test.mjs`
 * makes the same argument about a silent winding bug: the failure mode that costs the most time is
 * the one that renders plausibly. Node's built-in test runner needs no dependency.
 *
 * ── Read the compiled form, not the authored form ──────────────────────────────────────
 * The first draft of this file asserted over `CLIPS[name].keys`. `CLIPS` holds the **compiled**
 * clip — `{ bones, scales, pos, cane, events }` flat typed-array tracks — and has no `keys` at
 * all, so `(c.keys || [])` iterated nothing and three tests passed by asserting `[]` against `[]`.
 * They were reported as `ok` and checked exactly zero bones. That is the same shape of failure as
 * every instrument that has cost this project a day (`bootId` comparing null to null,
 * `material.program` reading a field three removed years ago): a green result that never touched
 * its subject. So every data-driven test below counts what it inspected and asserts the count is
 * non-zero — a passing test has to prove it looked.
 *
 * Compiling first loses nothing: `quatTrack` carries the authored bone name through as `tr.name`,
 * and `eulerDeg` propagates a NaN degree into a NaN quaternion component, so name typos and
 * non-finite authoring are both still visible here — and this is the data the game samples.
 *
 * Deliberately NOT tested here: anything importing `import.meta.glob` (SlyModelDL*, which resolve
 * assets through Vite) cannot be loaded by plain Node. Those need the browser harness. Animation.js
 * imports fine but keeps `TREE` / `TREE_CLIPS` module-private, so the locomotion tree's clip names
 * are not reachable from here; `Clips.js`'s own `REQUIRED`/`MISSING` covers part of that ground.
 */

const BONES = new Set(RIG3.BONE_ORDER);
const PARENT = new Map(RIG3.SKELETON.map(([n, p]) => [n, p]));
const clipNames = Object.keys(CLIPS);

/* Loop-seam tolerance. Track values are stored as float32 quaternions, so a clip that closes its
   cycle exactly still reads a few hundredths of a degree apart. Measured across the 31 clips that
   do close: worst case 0.04°. Anything above this is an authored discontinuity, not rounding. */
const SEAM_TOL_DEG = 0.5;

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/* ------------------------------------------------------------- skeleton ---- */

test('skeleton: BONE_ORDER and SKELETON describe the same bones', () => {
  const fromSkel = RIG3.SKELETON.map(([n]) => n);
  assert.ok(fromSkel.length > 0, 'SKELETON is empty — this test would be vacuous');
  assert.equal(fromSkel.length, RIG3.BONE_ORDER.length,
    'SKELETON and BONE_ORDER disagree on how many bones exist');
  assert.deepEqual(new Set(fromSkel), BONES);
});

test('skeleton: every parent exists and roots at "root"', () => {
  let checked = 0;
  for (const [name, parent] of RIG3.SKELETON) {
    if (parent === 'root') continue;
    assert.ok(BONES.has(parent), `bone "${name}" names a parent "${parent}" that does not exist`);
    checked++;
  }
  assert.ok(checked > 0, 'inspected no parents');
});

test('skeleton: no cycles, and every chain terminates at root', () => {
  for (const name of BONES) {
    const seen = new Set([name]);
    let cur = PARENT.get(name);
    while (cur && cur !== 'root') {
      assert.ok(!seen.has(cur), `cycle in the skeleton at "${cur}"`);
      seen.add(cur);
      cur = PARENT.get(cur);
    }
    assert.equal(cur, 'root', `bone "${name}" does not reach root`);
  }
});

test('skeleton: parents are declared before their children', () => {
  /* Load order matters: SlyModelDLRig and mixamo2clips both resolve a parent's transform before the
     child's in a single forward pass, so a child declared first would silently read an unset parent. */
  const idx = new Map(RIG3.SKELETON.map(([n], i) => [n, i]));
  let checked = 0;
  for (const [name, parent] of RIG3.SKELETON) {
    if (parent === 'root') continue;
    assert.ok(idx.get(parent) < idx.get(name), `"${name}" is declared before its parent "${parent}"`);
    checked++;
  }
  assert.ok(checked > 0, 'inspected no parents');
});

test('skeleton: every bind position is finite', () => {
  for (const [name, , p] of RIG3.SKELETON) {
    assert.equal(p.length, 3, `bone "${name}" bind position is not a 3-vector`);
    for (const v of p) assert.ok(Number.isFinite(v), `bone "${name}" has a non-finite bind position`);
  }
});

/* ---------------------------------------------------------------- clips ---- */

test('clips: REQUIRED is satisfied — Clips.js own invariant', () => {
  /* Clips.js builds this list itself at module load; nothing was ever asserting it was empty. */
  assert.deepEqual(MISSING, [], `clips named in REQUIRED were never defined: ${MISSING.join(', ')}`);
});

test('clips: the set is non-empty and every clip has a positive duration', () => {
  assert.ok(clipNames.length > 0);
  for (const n of clipNames) {
    const c = CLIPS[n];
    assert.ok(Number.isFinite(c.dur) && c.dur > 0, `clip "${n}" has a non-positive duration`);
  }
});

/**
 * §211.3 IS RESOLVED, IN THE RETIRE DIRECTION. These four tracks are scheduled for deletion from
 * `Clips.js`; this list empties when that diff lands, and this comment is the reason it should.
 *
 * What they are. `Rig.js`'s `addScale` returns early on a name it does not hold
 * (`if (cur === undefined) return`), so all four are silent no-ops. `pupilL`/`pupilR` are real
 * bones on the LEGACY model — `SlyModel.js:1005` mints them dynamically for SPEC-startle-pupils,
 * outside its static table because "their bind position IS the eye's pupil centre" — and `RIG3`,
 * the skeleton the SHIPPED character binds to whatever mesh rides on it (§216:
 * `SlyModelDLRig.js:39` imports RIG3 and builds its bones from `RIG3.SKELETON`), has 31 bones and
 * no pupil among them.
 *
 * Why RETIRE and not "give RIG3 the two bones". `tests/eyes.test.mjs` measures the shipped mesh
 * and finds nothing a pupil bone could hold:
 *
 *   · the eyeball submesh is two 242-vertex artist domes, 100.00 % of both weighted to `head`
 *     (the asset's own `LF_eyeball`/`RT_eyeball` are absent from BONE_MAP and fold into it);
 *   · the pupil is PAINT — 64² `sly_eyeball.png`, an amber iris ringed and cored in black — on a
 *     dome whose vertices are spread evenly over the whole UV square. 46 of 242 land anywhere on
 *     the painted eye, about seven across its diameter, and the painted pupil's boundary runs
 *     302 texels against 9 vertices: the geometry is **33× coarser than the paint** it would have
 *     to move, so no vertex deformation can follow the painted edge;
 *   · the one handle the asset does offer — mapping `LF_eyeball`/`RT_eyeball` onto pupil bones,
 *     one line each — drives the WHOLE eyeball, and the head mesh does not close behind it
 *     (0 head vertices within 40° of the eye's outward axis, against 21 eyeball vertices). At the
 *     authored 0.35 that does not constrict a pupil, it opens an 82 × 125 mm socket.
 *
 * So adding the bones to RIG3 could not revive the feature on the path that ships — and it would
 * make `addScale` find the names, turning these four from LOUD and dead into SILENT and dead
 * while this very assertion went green. That is §213's failure exactly: a guard converting a
 * defect into a permanent silent pass. `tests/eyes.test.mjs` now asserts that RIG3 does not grow
 * pupil bones, so that route fails loudly with its reasons attached.
 *
 * What retiring costs, stated rather than glossed. The feature is real: sealed at ΔdarkFrac
 * +0.726 / +0.731 against a ≥0.12 band (§27.2), and `Shots.js` carries `sly-startle` — a shot
 * whose camera was re-authored specifically so both eyes present equally while it is judged, so
 * §211.3's "no screenshot in the suite freezes either" is wrong. `?char=legacy` still has the
 * bones and the geometry, so deletion costs that path a working effect. It is deleted anyway
 * because a live `sc:` key and a source comment claiming "any frozen capture of `hurt` shows the
 * startle" are false on the character that ships, and only deletion makes them stop saying it.
 *
 * HOW TO LAND THE DELETION: remove the `pupilL`/`pupilR` entries from `hurt`'s three `sc:` keys
 * and `ko`'s two in `Clips.js`, then set this list to `[]`. Nothing else moves — `hurt`'s
 * `t: 0.42` key becomes empty and should go with them.
 */
const RETIRED_PUPIL_TRACKS = [
  'hurt scale -> "pupilL"',
  'hurt scale -> "pupilR"',
  'ko scale -> "pupilL"',
  'ko scale -> "pupilR"',
];

test('clips: every animated bone exists in the skeleton', () => {
  /* A typo'd bone name compiles to a track nothing consumes: the bone holds bind through a clip
     that meant to move it. Silent, and invisible in any single frame. */
  const bad = [];
  let tracks = 0;
  for (const n of clipNames) {
    for (const tr of CLIPS[n].bones) {
      tracks++;
      if (!BONES.has(tr.name)) bad.push(`${n} -> "${tr.name}"`);
    }
    for (const tr of CLIPS[n].scales) {
      tracks++;
      if (!BONES.has(tr.name)) bad.push(`${n} scale -> "${tr.name}"`);
    }
  }
  assert.ok(tracks > 100, `only ${tracks} tracks inspected — the clip data did not load`);
  assert.deepEqual(bad.sort(), RETIRED_PUPIL_TRACKS,
    `clips animate bones that do not exist (see RETIRED_PUPIL_TRACKS above):\n  ${bad.join('\n  ')}`);
});

test('clips: track times ascend and stay inside the duration', () => {
  /* `seg()` walks times forward assuming they are sorted, and clamps outside the ends. A key past
     `dur` is unreachable on a looping clip — authored work that never plays. */
  const bad = [];
  let tracks = 0;
  for (const n of clipNames) {
    const c = CLIPS[n];
    const all = [...c.bones, ...c.scales, ...(c.pos ? [{ name: 'pos', ...c.pos }] : []),
      ...(c.cane ? [{ name: 'cane', ...c.cane }] : [])];
    for (const tr of all) {
      tracks++;
      let prev = -Infinity;
      for (const t of tr.times) {
        if (!Number.isFinite(t)) { bad.push(`${n}/${tr.name} non-finite time`); break; }
        if (t < prev) { bad.push(`${n}/${tr.name} t=${t} goes backwards from ${prev}`); break; }
        prev = t;
      }
      if (tr.times[tr.times.length - 1] > c.dur + 1e-6) {
        bad.push(`${n}/${tr.name} last key ${tr.times[tr.times.length - 1]} exceeds dur ${c.dur}`);
      }
    }
  }
  assert.ok(tracks > 100, `only ${tracks} tracks inspected`);
  assert.deepEqual(bad, []);
});

test('clips: every quaternion is finite and unit-length', () => {
  /* `eulerDeg` turns a NaN degree into a NaN quaternion, and a NaN reaching the skinning matrix
     collapses the whole mesh to a point — spectacular, but only in the one frame that samples it. */
  const bad = [];
  let quats = 0;
  for (const n of clipNames) {
    for (const tr of CLIPS[n].bones) {
      for (let i = 0; i < tr.times.length; i++) {
        const a = i * 4;
        const L = Math.hypot(tr.q[a], tr.q[a + 1], tr.q[a + 2], tr.q[a + 3]);
        quats++;
        if (!Number.isFinite(L)) { bad.push(`${n}/${tr.name} key${i} non-finite`); break; }
        if (Math.abs(L - 1) > 1e-3) { bad.push(`${n}/${tr.name} key${i} |q|=${L.toFixed(5)}`); break; }
      }
    }
  }
  assert.ok(quats > 500, `only ${quats} quaternions inspected`);
  assert.deepEqual(bad, []);
});

test('clips: hips offsets and scales are finite, and scales are positive', () => {
  const bad = [];
  let vals = 0;
  for (const n of clipNames) {
    const c = CLIPS[n];
    if (c.pos) for (const v of c.pos.v) { vals++; if (!Number.isFinite(v)) bad.push(`${n} pos`); }
    for (const tr of c.scales) {
      for (const v of tr.v) {
        vals++;
        if (!Number.isFinite(v) || v <= 0) bad.push(`${n}/${tr.name} scale ${v}`);
      }
    }
  }
  assert.ok(vals > 50, `only ${vals} values inspected`);
  assert.deepEqual(bad, []);
});

test('clips: `hold` is a time inside the clip, not an index', () => {
  /* `freezePose(name)` with no phase shows exactly `c.hold` seconds in, and half the shipped
     screenshots go through that path. `compile()` clamps the top end but not the bottom. */
  const bad = [];
  for (const n of clipNames) {
    const { hold, dur } = CLIPS[n];
    if (!(Number.isFinite(hold) && hold >= 0 && hold <= dur + 1e-6)) bad.push(`${n} hold=${hold} dur=${dur}`);
  }
  assert.deepEqual(bad, []);
});

test('clips: stride is either the 0 sentinel or a positive distance', () => {
  /* `compile()` writes `d.stride || 0`, and Animation.js reads `c.stride > 0` as "this clip's rate
     is driven by real speed". 0 is therefore meaningful — it is 40 of the 52 clips — and a
     negative stride would run the cycle backwards. */
  const bad = [];
  let locomotor = 0;
  for (const n of clipNames) {
    const s = CLIPS[n].stride;
    if (!Number.isFinite(s) || s < 0) bad.push(`${n} stride=${s}`);
    if (s > 0) locomotor++;
  }
  assert.deepEqual(bad, []);
  assert.ok(locomotor > 0, 'no clip declares a stride — the locomotion tree cannot rate-match');
});

test('clips: events land inside the clip and are named', () => {
  const bad = [];
  for (const n of clipNames) {
    for (const e of CLIPS[n].events) {
      if (typeof e.n !== 'string' || !e.n) bad.push(`${n} event with no name`);
      if (!Number.isFinite(e.t) || e.t < 0 || e.t > CLIPS[n].dur + 1e-6) {
        bad.push(`${n} event "${e.n}" at t=${e.t} outside [0, ${CLIPS[n].dur}]`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('clips: a looping clip closes its loop', () => {
  /* THE one test here that found a shipped bug. `compile()` defaults `loop` to true — `d.loop
     !== false` — so an action clip that never mentions loop becomes a cycle. `sampleInto` then
     wraps `t` by `dur`, and `baseClip()` holds a track with unbounded time, so any state that
     outlasts its clip snaps the body back to key 0 mid-move. jump_rise's shoulder swung 75° in one
     frame that way: the arm thrown up at launch (-30/14/-78) reset to the coiled crouch (10/12/-22).
     Found four such clips; all four now declare `loop: false`, which makes `sampleInto` clamp and
     hold the final pose — the intent for a rise, a twirl, a kick-off and a dive. */
  const bad = [];
  let looping = 0;
  for (const n of clipNames) {
    const c = CLIPS[n];
    if (!c.loop) continue;
    looping++;
    for (const tr of c.bones) {
      const L = tr.times.length - 1;
      if (L < 1) continue;
      _qa.set(tr.q[0], tr.q[1], tr.q[2], tr.q[3]);
      _qb.set(tr.q[L * 4], tr.q[L * 4 + 1], tr.q[L * 4 + 2], tr.q[L * 4 + 3]);
      const deg = 2 * Math.acos(Math.min(1, Math.abs(_qa.dot(_qb)))) * 180 / Math.PI;
      if (deg > SEAM_TOL_DEG) bad.push(`${n}/${tr.name} seam ${deg.toFixed(2)}° — cycle, or loop:false?`);
    }
    /* A looping clip whose last key falls short of `dur` freezes on that key and then jumps. */
    let last = 0;
    for (const tr of c.bones) last = Math.max(last, tr.times[tr.times.length - 1]);
    if (c.dur - last > 1e-3) bad.push(`${n} last key ${last} is ${(c.dur - last).toFixed(3)}s short of dur ${c.dur}`);
  }
  assert.ok(looping > 0, 'no looping clips inspected');
  assert.deepEqual(bad, [], `looping clips discontinuous at the seam:\n  ${bad.join('\n  ')}`);
});
