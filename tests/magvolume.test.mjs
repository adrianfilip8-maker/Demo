import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { MAG } from '../src/world/EgyptLevel.js';   // swingVolume() is exercised in the child arms below
import { TUNE } from '../src/player/Controller.js';

/**
 * §720 arm B — "Reduce the magnetic distance of the move to hook onto the hanging rings by 50%."
 *
 * The change is two numbers, and everything below is about keeping them honest: that the halving
 * landed on the RINGS and nowhere else, that the derived term's comment still describes its
 * value, that the invariant survives, that the token reverts, and — the part nobody asked for and
 * the coordinator was right to want — that the VISUAL CUE does not advertise a reach the magnet
 * no longer has.
 *
 * ── DOMAIN (§418.3) ───────────────────────────────────────────────────────────────────────
 * passes on : the shipped level at the halved volumes.
 * fails  on : RUN IN-ARM — the same level built with `?mag=wide` in a child process, where every
 *             ring must read the pre-§720 pair. A token arm that only ever ran one way is not an
 *             arm.
 * does NOT  : say whether the chain is still completable. That is `tools/magreach.mjs` and the
 * discrim.    two acceptance drives, which measure flight rather than registry entries — and
 *             which found that the chain never depended on this quantity at all.
 */

/** The 11 hook rings, read off what the level actually registered. */
async function targets() {
  const { c } = await realWorld();
  return c.targets.list;
}
const isHook = (t) => t.userData?.kind === 'hook';

/**
 * Fall straight onto a ring and record when the CUE fires against when the CATCH lands.
 *
 * The approach is a drop from 10.5 m above the ring, offset 35 cm laterally — `telegraph`'s own
 * driven auto-grab shape, which is the one beat where the mark has time to appear before the
 * grab. Returns frames, plus the ring's live volume so a reader can tell which arm produced a
 * row without trusting its label.
 */
async function cueDrive() {
  const { engine, c } = await realWorld();
  const RING = c.targets.list.find((t) => t.id === 'hook-main-3');
  if (!RING) throw new Error('hook-main-3 is not registered');
  const start = RING.point.clone(); start.y += 10.5; start.x += 0.35;
  hardReset(engine, c, start, Math.PI);
  c.grounded = false; c.sm.set('fall');
  let teleAt = -1, grabAt = -1, teleKind = '', frame = 0, locked = false;
  const off = [
    engine.on('telegraph', (p) => { if (teleAt < 0 && p) { teleAt = frame; teleKind = p.kind; } }),
    engine.on('hookGrab', () => { if (grabAt < 0) grabAt = frame; }),
  ];
  for (; frame < 200 && grabAt < 0; frame++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = frame * DT; c.update(DT, frame * DT);
    if (c.stateName === 'toTarget') locked = true;
  }
  for (const o of off) try { o?.(); } catch { /* some buses return no unsubscribe */ }
  return { teleAt, grabAt, teleKind, locked, volume: RING.volume, state: c.stateName, frames: frame };
}

/* CHILD MODE — the same drive in a process where `?mag=` was set before any module loaded. */
if (process.env.MAG_CHILD) {
  const token = process.env.MAG_CHILD === 'default' ? undefined : process.env.MAG_CHILD;
  assert.equal(globalThis.__MAG_AB, token,
    'child mode ran without the token set before import — the arm would compare the default to itself');
  process.stdout.write(`\n__MAG_RESULT__${JSON.stringify(await cueDrive())}\n`);
  process.exit(0);
}

test('§720 mag: the halving landed on the hanging rings and on nothing else', async () => {
  const list = await targets();
  const hooks = list.filter(isHook);
  assert.ok(hooks.length >= 11, `expected the level's 11+ hook rings, saw ${hooks.length}`);

  /* THE OWNER'S 50%, on the number their sentence names. */
  assert.equal(MAG.volumeSwing, 1.65, 'the courtyard chain must be exactly half of the 3.30 it was');
  assert.equal(+(MAG.volumeSwing * 2).toFixed(4), MAG.volume,
    'volumeSwing is no longer half of the general acquisition volume — one of the two moved alone');
  assert.equal(MAG.volumeLow, 1.535, 'the lower chain must be exactly half of the 3.07 it was');
  assert.equal(+(MAG.volumeLow * 2).toFixed(4), 3.07,
    'volumeLow is no longer half of the 3.07 it replaced — the 50% is not 50% on this chain');

  const main = hooks.filter((t) => t.id.startsWith('hook-main-'));
  const low = hooks.filter((t) => t.id.startsWith('hook-low-'));
  assert.ok(main.length && low.length, 'both chains must be registered');
  for (const t of main) assert.equal(t.volume, MAG.volumeSwing, `${t.id} did not take the halved volume`);
  for (const t of low) assert.equal(t.volume, MAG.volumeLow, `${t.id} did not take the halved low volume`);

  /* SCOPE, asserted rather than described. `spireTarget` carries `group: 'swing'` too, and a
     future reader halving "the swing group" by that field would break §8.1's Ninja Spire
     Landing. The owner asked about the hanging rings. */
  const spires = list.filter((t) => t.userData?.kind === 'spire');
  assert.ok(spires.length >= 3, `expected the level's spire tips, saw ${spires.length}`);
  for (const t of spires) {
    assert.equal(t.volume, MAG.volume,
      `${t.id} lost the general 3.30 — §720 is scoped to the hanging rings, and a spire tip is `
      + 'reached by a jump off a pole top with catchJump, not by a rope release');
  }
  const notches = list.filter((t) => t.group === 'notch');
  for (const t of notches) assert.equal(t.volume, MAG.volume, `${t.id} is not a ring and must keep 3.30`);
});

test('§720 mag: the derivation comment on volumeLow describes the value beside it', () => {
  /* §589 left a draw-call comment reading 11 guards after two were removed; §705 and §710 each
     corrected arithmetic that had been believed. `volumeLow` used to BE its derivation — the cap
     (6.36 - magSnapRadius) / 2 — and after the halving it is not. The comment now says so, and
     this arm is what stops that sentence from rotting back into a claim.
     Both facts it asserts are checkable: the cap still bounds, and the value no longer meets it. */
  const TIGHTEST_GAP = 6.36;                       // the lower chain's tightest ring gap
  const cap = (TIGHTEST_GAP - TUNE.magSnapRadius) / 2;
  assert.ok(Math.abs(cap - 3.0769) < 5e-4, `the cap re-derives to ${cap}, not the 3.0769 the text quotes`);
  assert.ok(MAG.volumeLow < cap,
    'volumeLow exceeds the pairwise cap — overlapping spheres on the tightest gap in the level');
  const air = TIGHTEST_GAP - 2 * MAG.volumeLow;
  assert.ok(Math.abs(air - 3.29) < 0.01,
    `the comment claims 3.29 m of clear air at this value; it is ${air.toFixed(3)}`);
  assert.ok(air > TUNE.magSnapRadius * 10,
    'the cap is claimed to be slack and it is not — rewrite the comment or the value');
});

test('§720 mag: catchSwing did not move, and the no-self-recapture invariant holds', () => {
  /* `catchSwing` is a TIME window in metres — how far a body on our rope travels during
     `jumpBufferMs` — and halving it would be halving the input buffer for one move. It was left
     alone; this arm is the proof, and it also re-derives it so a future edit cannot quietly
     change what it is made of. */
  const derived = Math.sqrt(2 * 24 * MAG.hookL) * 0.140;
  assert.ok(Math.abs(derived - MAG.catchSwing) < 5e-4,
    `catchSwing ${MAG.catchSwing} no longer equals sqrt(2 * 24 * hookL) * jumpBufferMs = ${derived.toFixed(4)}`);
  assert.ok(MAG.catchSwing < MAG.hookL,
    'catchSwing >= hookL — a released ring can recapture the player from its own release sphere');

  /* THE CONSEQUENCE, recorded as a number rather than as prose: the acquisition sphere used to be
     2.29x the catch window and is now 1.147x it, so the volume is now usually the binding test
     where it almost never was. Asserted so that a later widening of `catch` cannot silently
     overtake the volume and make the sphere irrelevant in the other direction. */
  const ratio = MAG.volumeSwing / MAG.catchSwing;
  assert.ok(ratio > 1, `the acquisition sphere ${MAG.volumeSwing} is inside the catch window `
    + `${MAG.catchSwing} (ratio ${ratio.toFixed(3)}) — the catch could never fire`);
  assert.ok(ratio < 1.3, `the sphere/catch ratio is ${ratio.toFixed(3)}; §720 measured 1.147 and the `
    + 'section is written around that figure');
});

test('§720 mag: the visual cue does NOT track the acquisition volume — measured, both arms', async () => {
  /* THE QUESTION, in the coordinator's words: if the volume halves and the cue still advertises
     the old radius, the player is told they can catch a ring they cannot.
     THE ANSWER is structural and is asserted here as a fact about the wiring, then DRIVEN below:
     the sparkle (`SparkleField`) and the telegraph mark (`Controller._telegraph`) are both drawn
     from COLLISION's affordance query, whose hook range is `TUNE.hookGrab`. Neither reads
     `magVolume` at all — so the cue never advertised 3.30 in the first place, and halving it
     cannot make the cue a lie. The direction matters: the cue tracks `hookGrab` 9.0 / `hookAuto`
     2.9, and `hookAuto` is what actually catches on a chain (tools/magreach.mjs), so the cue is
     still describing the mechanism that does the work. */
  assert.ok(TUNE.hookGrab > MAG.volume,
    'the affordance range fell below the magnet volume — the reasoning above no longer holds');

  /* DRIVEN, BOTH ARMS, in child processes — because if the mark were keyed to the magnet,
     halving the magnet would move the mark, and only a build that actually has the old volume
     can show that it does not. */
  const { execFileSync } = await import('node:child_process');
  const url = new URL(import.meta.url);
  const run = (token) => {
    const setup = token === 'default' ? '' : `globalThis.__MAG_AB = ${JSON.stringify(token)};\n`;
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e',
      `${setup}await import(${JSON.stringify(url.href)});\n`],
    { env: { ...process.env, MAG_CHILD: token }, encoding: 'utf8', maxBuffer: 32 << 20 });
    const m = /__MAG_RESULT__(\{.*\})/.exec(raw);
    assert.ok(m, `the ?mag=${token} child produced no result line`);
    return JSON.parse(m[1]);
  };
  const half = run('default');
  const wide = run('wide');

  assert.equal(half.volume, 1.65, 'the default child did not build the halved rings');
  assert.equal(wide.volume, 3.30, 'the ?mag=wide child did not build the old rings');
  for (const [name, r] of [['default', half], ['wide', wide]]) {
    assert.ok(r.teleAt >= 0, `${name}: nothing was telegraphed on a fall straight onto a ring — the cue is dead`);
    assert.ok(r.grabAt >= 0, `${name}: never grabbed the ring in ${r.frames} frames (state ${r.state})`);
    assert.equal(r.teleKind, 'hook', `${name}: the mark named "${r.teleKind}", not the ring`);
    assert.ok(r.teleAt < r.grabAt, `${name}: the mark landed at ${r.teleAt} and the grab at ${r.grabAt} — a `
      + 'telegraph that does not precede its own event is not a telegraph');
  }

  /* THE FINDING: the mark fires on the SAME frame in both arms. It is drawn from the affordance
     query at `hookGrab` 9.0 and has never had anything to do with `magVolume`, so halving the
     magnet cannot make the cue promise a catch the game will not deliver. */
  assert.equal(half.teleAt, wide.teleAt,
    `the telegraph fired at frame ${half.teleAt} with the rings at 1.65 and at ${wide.teleAt} with them `
    + 'at 3.30 — the cue DOES track the acquisition volume, and halving it has made the mark a promise '
    + 'the magnet can no longer keep. That is a defect to report, not a number to update.');

  console.log(`[§720 cue] telegraph@${half.teleAt} (kind ${half.teleKind}) in BOTH arms · `
    + `hookGrab@${half.grabAt} at volume 1.65 vs @${wide.grabAt} at 3.30 · `
    + `warning ${half.grabAt - half.teleAt} frames vs ${wide.grabAt - wide.teleAt} · `
    + `magnet locked: ${half.locked} vs ${wide.locked} · the cue's own range is hookGrab ${TUNE.hookGrab}`);
});

test('§720 mag: `?mag=wide` restores the pre-§720 pair — the fail arm, in a child process', async () => {
  /* `swingVolume()` reads its token at module load, exactly as `?anim=`/`?idle=`/`?combo=`/
     `?pole=` do, so one process cannot hold both arms and a child is the only honest fail input.
     Asserting the flag instead would be §418.9's failure mode. */
  const { execFileSync } = await import('node:child_process');
  const src = (token) => `${token ? `globalThis.__MAG_AB = ${JSON.stringify(token)};\n` : ''}`
    + `const { MAG, swingVolume } = await import(${JSON.stringify(new URL('../src/world/EgyptLevel.js', import.meta.url).href)});\n`
    + 'process.stdout.write("__R__" + JSON.stringify({ main: swingVolume(false), low: swingVolume(true), '
    + 'constMain: MAG.volumeSwing, constLow: MAG.volumeLow, general: MAG.volume }));\n';
  const run = (token) => {
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', src(token)],
      { encoding: 'utf8', maxBuffer: 8 << 20 });
    const m = /__R__(\{.*\})/.exec(raw);
    assert.ok(m, `the ?mag=${token || 'default'} child produced no result line`);
    return JSON.parse(m[1]);
  };

  const def = run(null);
  assert.deepEqual({ main: def.main, low: def.low }, { main: 1.65, low: 1.535 },
    'the default build is not the halved pair');

  const wide = run('wide');
  assert.deepEqual({ main: wide.main, low: wide.low }, { main: 3.30, low: 3.07 },
    '`?mag=wide` did not restore the pre-§720 pair verbatim — the revert is not a revert');
  /* The CONSTANTS stay halved under the token; only the accessor moves. Stated as an assertion
     because it is exactly the thing that would make a printed diagnostic lie about which arm it
     is in, and `tools/magreach.mjs` had that bug before this arm was written. */
  assert.equal(wide.constMain, 1.65, 'MAG.volumeSwing changed under the token — only swingVolume() should');
  assert.equal(wide.general, 3.30, 'the general acquisition volume moved under the ring token');

  console.log(`[§720 token] default main/low ${def.main}/${def.low} · ?mag=wide ${wide.main}/${wide.low} `
    + `· general (spires, notch) ${def.general} in both`);
});

test('§720 mag: the two §720 arms revert independently', async () => {
  /* The coordinator's requirement, asserted rather than promised: a build may carry the pole
     animation without the magnet change, or the magnet change without the animation, or either
     alone. The two tokens are read in different modules from different query keys and neither
     is consulted by the other. */
  const { execFileSync } = await import('node:child_process');
  const probe = (setup) => {
    const src = `${setup}\n`
      + `const { swingVolume } = await import(${JSON.stringify(new URL('../src/world/EgyptLevel.js', import.meta.url).href)});\n`
      + `const { POLE_PORTED } = await import(${JSON.stringify(new URL('../src/player/Animation.js', import.meta.url).href)});\n`
      + 'process.stdout.write("__R__" + JSON.stringify({ vol: swingVolume(false), pole: POLE_PORTED }));\n';
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', src],
      { encoding: 'utf8', maxBuffer: 8 << 20 });
    return JSON.parse(/__R__(\{.*\})/.exec(raw)[1]);
  };
  assert.deepEqual(probe(''), { vol: 1.65, pole: true }, 'the shipped default is both arms live');
  assert.deepEqual(probe("globalThis.__MAG_AB='wide';"), { vol: 3.30, pole: true },
    '?mag=wide also reverted the pole animation — the arms are not independent');
  assert.deepEqual(probe("globalThis.__POLE_AB='climb';"), { vol: 1.65, pole: false },
    '?pole=climb also reverted the magnetism — the arms are not independent');
  assert.deepEqual(probe("globalThis.__MAG_AB='wide';globalThis.__POLE_AB='climb';"), { vol: 3.30, pole: false },
    'both tokens together do not revert both arms');
});
