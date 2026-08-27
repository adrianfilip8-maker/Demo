#!/usr/bin/env node
/**
 * magreach — what the ring magnet actually rescues, on a player who APPROACHES.
 *
 *   node tools/magreach.mjs                 # both arms, the sweep, and the bisect
 *   node tools/magreach.mjs --arm wide      # one arm (child process per arm)
 *   node tools/magreach.mjs --scale 0.75    # an arbitrary reduction, for the bisect
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────
 * §720 halved the hook rings' acquisition volume on the owner's instruction (3.30 -> 1.65), and
 * the two instruments the brief named — `spawn2eye` and `telegraph` — came back BYTE-IDENTICAL.
 * That is a suspicious kind of pass. Both drive the chain through `HookSwing`'s own fly-through
 * clause (`!grounded && distance <= hookAuto 2.9`), which never consults the magnet at all, so
 * they are insensitive to the exact quantity that changed. An arm that cannot move is not
 * evidence that nothing moved (§442), and reporting their green as "the halving is free" would
 * be exactly the mistake this file exists to prevent.
 *
 * So this measures the magnet on its own terms: **how far off the ring can a real arc be and
 * still be rescued?** That is the question "magnetic distance" names, and it is answered by
 * sweeping the arc sideways until the catch stops happening.
 *
 * ── §435.4 — APPROACHED, NOT PLACED ───────────────────────────────────────────────────────
 * Every sample settles a real capsule on real geometry, then LAUNCHES it on a ballistic arc
 * past the ring at a swept lateral offset. Nothing is teleported next to a ring and asked
 * whether it is in range; the assist has to act on a body that is already moving, which is the
 * only condition under which `predictMiss` means anything.
 *
 * ── §418.3 DOMAIN ─────────────────────────────────────────────────────────────────────────
 * passes on : the shipped level. A dead-on arc is caught in every arm — if it were not, the
 *             instrument is broken rather than the level.
 * fails  on : RUN IN-ARM — an arc displaced 8 m sideways must be caught by NOTHING in any arm.
 *             An instrument that reports a catch there is reading its own optimism.
 * does NOT  : judge whether the resulting difficulty is good. It reports the reach and the
 * discrim.    mechanism; the ruling is the owner's.
 */
import './_domshim.mjs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARM = arg('--arm', '');
const SCALE = arg('--scale', '');

/* The volumes live in a module-level table read at level build, so an arm is a PROCESS. The
   parent re-execs itself once per arm, exactly as `tools/gripgap.mjs` does for its regimes. */
if (!ARM && !SCALE) {
  const run = (args) => execFileSync(process.execPath, [path.join(ROOT, 'tools/magreach.mjs'), ...args],
    { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] });
  process.stdout.write(run(['--arm', 'wide']));
  process.stdout.write(run(['--arm', 'half']));
  /* THE BISECT the brief asked for: what reduction does the chain tolerate? Reported as the
     reach each scale delivers, so the answer is a curve rather than a single verdict. */
  console.log('\n=== bisect: uniform scale on the rings\' acquisition volume ===');
  for (const s of ['1', '0.75', '0.5', '0.4', '0.3', '0.2']) {
    const out = run(['--scale', s]);
    process.stdout.write(out.split('\n').filter((l) => l.startsWith('  scale')).join('\n') + '\n');
  }
  process.exit(0);
}

if (ARM === 'wide') globalThis.__MAG_AB = 'wide';

const { realWorld, hardReset, DT } = await import('../tests/_moveset.mjs');
const { TUNE } = await import('../src/player/Controller.js');
const { MAG } = await import('../src/world/EgyptLevel.js');

const { engine, c } = await realWorld();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Every hook ring the level authored, read off the registry rather than retyped. */
const RINGS = c.targets.list.filter((t) => t.userData?.kind === 'hook');
if (!RINGS.length) throw new Error('magreach: no hook targets registered — the level did not build');

/* An arbitrary scale for the bisect. Applied to the LIVE registry rather than to the source, so
   the sweep can walk a curve in one process; the two named arms above go through the shipped
   module-load path instead, and the `1` row of the bisect must reproduce the `half` arm or the
   two paths disagree and neither reading is safe. */
if (SCALE) for (const t of RINGS) t.volume *= Number(SCALE);

/**
 * One sample: fly the chain leg ring A -> ring B, aimed `off` metres to the side of B.
 *
 * Modelled on `tests/telegraph.test.mjs`'s T8 leg, which is the committed driver for this beat,
 * with ONE addition: the aim point is displaced sideways, which is what "the player let go a bit
 * off" means. Two things had to be got right and the first version got neither:
 *
 *   · THE STICK IS HELD. A bare `velocity.set()` on a falling capsule is erased within a frame —
 *     air control steers toward `wishDir`, and with no stick that is zero. The first draft
 *     launched a clean ballistic solve and measured a dead drop: every offset, every speed, the
 *     same closest approach of 4.38 m. A player flies a chain with the stick held, and so does
 *     this.
 *   · THE APPROACH IS A CHAIN LEG, not a jump at a ring. Ring 3 sits 5.9 m above the kiosk
 *     lintel and `jumpV0` 11 buys 2.5 m of rise — no ballistic arc from a stance reaches it at
 *     all, which is why §8.1 takes it with an E-grab. The beat where the magnet is actually the
 *     mechanism is ring-to-ring, so that is the beat measured.
 */
function fly(A, B, off, speed, hold) {
  const dir = V(B.x - A.x, 0, B.z - A.z).normalize();
  const perp = V(-dir.z, 0, dir.x);
  const aimPt = B.clone().addScaledVector(perp, off);
  const start = A.clone().addScaledVector(dir, -2.0); start.y = A.y - MAG.hookL;
  hardReset(engine, c, start, Math.PI);
  c.grounded = false; c.sm.set('fall');
  c.velocity.copy(dir).multiplyScalar(speed);

  const aim = (t) => {
    const dx = t.x - c.position.x, dz = t.z - c.position.z;
    const l = Math.hypot(dx, dz) || 1;
    engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };

  let relAt = -1, released = false, locked = false, closest = Infinity, everSwung = false;
  for (let i = 0; i < 400; i++) {
    aim(aimPt);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (c.sm.name === 'hookSwing') {
      everSwung = true;
      if (relAt < 0) relAt = i;
      if (i - relAt === hold) engine.input.hold('jump');
    }
    engine.time = i * DT; c.update(DT, i * DT);
    if (c.stateName === 'toTarget') locked = true;
    if (relAt >= 0 && !released && c.sm.name !== 'hookSwing') released = true;
    if (released) {
      closest = Math.min(closest, c.position.distanceTo(B));
      if (c.sm.name === 'hookSwing' && c.anchor && c.anchor.distanceTo(B) < 0.5) {
        return { end: locked ? 'magnet' : 'auto', at: i, closest };
      }
      if (c.grounded || c.position.y < 0) break;
    }
  }
  return { end: everSwung ? 'missed' : 'never-swung', closest };
}

/* The subject: the courtyard chain's first leg, which is `telegraph` T8's own leg 0 and
   `spawn2eye` leg 5a. The ring coordinates come from the REGISTRY, not retyped. */
const CHAIN = ['hook-main-3', 'hook-main-4', 'hook-main-5'].map((id) => RINGS.find((t) => t.id === id))
  .filter(Boolean).map((t) => t.point.clone());
if (CHAIN.length < 2) throw new Error('magreach: the courtyard chain is not in the registry under the expected ids');
const A = CHAIN[0], B = CHAIN[1];
const SPEEDS = [8, 12, 16];
const HOLDS = [14, 20, 28];
const OFFS = [0, 0.8, 1.6, 2.4, 3.2, 4.0, 12.0];

const label = SCALE ? `scale ${Number(SCALE).toFixed(2)}x` : `${ARM} (volume ${RINGS[0].volume.toFixed(3)})`;
const rows = [];
for (const sp of SPEEDS) {
  for (const off of OFFS) {
    /* Best-of over the release phases, exactly as T8's `chainsFrom` does: a leg counts as
       reachable if SOME hold gets there, because a player picks their moment. */
    let best = { end: 'missed', closest: Infinity };
    for (const h of HOLDS) {
      const r = fly(A, B, off, sp, h);
      if (r.end === 'magnet' || r.end === 'auto') { best = r; break; }
      if (r.closest < best.closest) best = r;
    }
    rows.push({ sp, off, ...best });
  }
}

if (!SCALE) {
  console.log(`\n=== magreach · ${label} · leg ${A.toArray().map((v) => v.toFixed(1))} -> ${B.toArray().map((v) => v.toFixed(1))}`
    + ` (${A.distanceTo(B).toFixed(2)} m) · catch ${RINGS[0].catch} · hookAuto ${TUNE.hookAuto} ===`);
  console.log('  the release is aimed `off` metres to the SIDE of the destination ring; best of 3 release phases.');
  console.log('  `magnet` = toTarget flew him in · `auto` = HookSwing\'s own fly-through caught him, no assist.');
  console.log('  off(m)' + SPEEDS.map((s) => `${s} m/s`.padStart(20)).join(''));
  for (const off of OFFS) {
    const cells = SPEEDS.map((sp) => {
      const r = rows.find((x) => x.sp === sp && x.off === off);
      return `${r.end}${r.end === 'magnet' || r.end === 'auto' ? `@${r.at}` : ` d${r.closest.toFixed(2)}`}`.padStart(20);
    });
    console.log(`  ${String(off).padStart(6)}` + cells.join(''));
  }
  /* §418.3's fail input, RUN: 12 m to the side must be caught by nothing, in every arm. */
  const wild = rows.filter((r) => r.off === 12.0);
  if (wild.some((r) => r.end === 'magnet' || r.end === 'auto')) {
    throw new Error(`magreach: a release aimed 12 m off the ring was caught (${wild.map((r) => r.end).join(', ')}) — `
      + 'the instrument reports catches that are not there and none of the rows above can be trusted');
  }
  if (!rows.some((r) => r.off === 0 && (r.end === 'magnet' || r.end === 'auto'))) {
    throw new Error('magreach: the dead-on release was not caught in this arm — the driver is broken, not the level');
  }
}

const caught = rows.filter((r) => r.end === 'magnet' || r.end === 'auto');
const byMagnet = rows.filter((r) => r.end === 'magnet');
const reach = caught.length ? Math.max(...caught.map((r) => r.off)) : 0;
console.log(`  ${label.padEnd(28)} caught ${caught.length}/${rows.length} `
  + `(magnet ${byMagnet.length}, auto ${caught.length - byMagnet.length}) · widest aim error still caught ${reach.toFixed(2)} m`
  /* The LIVE registry values, not `MAG.volumeSwing` — under `?mag=wide` the constants in MAG are
     still the halved pair and only `swingVolume()` returns the old one, so printing the constant
     here would annotate the wide arm with the halved number. Exactly the stale-label defect this
     section is otherwise about. */
  + `  [live: main ${RINGS.find((t) => t.id === 'hook-main-3')?.volume.toFixed(3)}, `
  + `low ${RINGS.find((t) => t.id === 'hook-low-0')?.volume.toFixed(3)}]`);
