import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDom } from './_hudshim.mjs';

/**
 * padreach — the vent route, driven through the REAL `Input`, once per device (§662).
 *
 * ── The gap this fills, and it is a whole class of gap ────────────────────────────────────────
 *
 * `ventroute.test.mjs` is the check §602 shipped behind, and it drives the shipped Controller with
 * `tests/_moveset.mjs`'s `StubInput` — writing `inp.move.y = 1` directly into the movement vector.
 * `src/core/Input.js` is not in that circuit at all: no radial deadzone, no `moveFloor` remap, no
 * `_padStick`, no `_padValue` trust gate, no d-pad fold, no device arbitration. **The vent has
 * never been driven through the class a player's hands reach, on either device**, and the user has
 * now reported it inaccessible three times while that check stayed green.
 *
 * This drives the identical waypoints with a real `Input` and swaps only the device beneath it.
 *
 * ── The hypothesis it was built to test, and the answer ───────────────────────────────────────
 *
 * The standing theory was: entering the vent needs a crawl, crawl needs crouch, and `crouch` is
 * `PAD_BINDINGS.crouch = [6]` — L2, an analogue trigger behind §542's trust gate — so a DS4 whose
 * L2 never reads at or below `triggerOff` could never crouch and the vent would be unreachable by
 * construction, while every keyboard test passed.
 *
 * **Refuted, and refuted by driving rather than by reading.** `Moveset.Crawl.canEnter` is
 * `c.inVent()`; the vent decides, not the player. Arm V2 pins L2 AND R2 at +1 for the whole drive
 * — §542's non-conformant pad, the exact state in which `crouch` can never fire — and the walker
 * still enters `crawl` and arrives at the same coordinate as the keyboard, to the centimetre.
 *
 * ── What this file does NOT settle, said plainly ──────────────────────────────────────────────
 *
 * Both arms snap the camera at the next waypoint every frame, exactly as `ventroute.test.mjs`
 * does, so that the ONLY variable is which class produced `move`. That means this measures whether
 * the geometry and the input layer admit a player who already knows where the mouth is and walks a
 * perfect line into it. It says nothing about FINDING it, about steering with a right stick, or
 * about the camera — and the user's report may be about any of those. See §667.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

const { doc, win } = installDom();
function listenable(o) {
  const h = new Map();
  const add = o.addEventListener;
  o.addEventListener = (t, fn) => { add?.call?.(o, t, fn); if (!h.has(t)) h.set(t, new Set()); h.get(t).add(fn); };
  o.removeEventListener = (t, fn) => h.get(t)?.delete(fn);
  o.fire = (t, ev = {}) => { const e = { preventDefault() {}, stopPropagation() {}, ...ev }; for (const fn of [...(h.get(t) || [])]) fn(e); };
  return o;
}
listenable(doc);
doc.pointerLockElement = null;
listenable(win);
const canvas = listenable({
  width: 1280, height: 720, style: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
});
globalThis.self = globalThis;

let padState = null;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (padState ? [padState, null, null, null] : [null, null, null, null]) },
  configurable: true, writable: true,
});

const { Input } = await import('../src/core/Input.js');
const M = await import('./_moveset.mjs');

const DT = 1 / 60;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const freshPad = (trigRest = 0) => ({
  id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  index: 0, connected: true, mapping: 'standard', timestamp: 0,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: false, value: (i === 6 || i === 7) ? trigRest : 0,
  })),
  axes: [0, 0, 0, 0],
});

/** Hold forward, using only the affordance the named device has. Nothing writes `input.move`. */
const DRIVERS = {
  keyboard: {
    start: () => win.fire('keydown', { code: 'KeyW', repeat: false }),
    frame: () => {},
  },
  stick: {
    start: () => { padState.axes = [0, -1, 0, 0]; },        // axis 1 is +down, so forward is -1
    frame: () => { padState.timestamp++; },
  },
};

/**
 * Walk the waypoint list on `device`, camera snapped at the next waypoint each frame —
 * deliberately identical to `ventroute.test.mjs`'s `walk`, so the only variable is the input class.
 */
async function walk(device, start, waypoints, { budget = 3000, trigRest = 0 } = {}) {
  const { engine, c } = await M.realWorld();
  if (!engine.canvas) engine.canvas = canvas;
  padState = freshPad(trigRest);
  const input = new Input(engine);
  engine.input = input;
  c.input = input;

  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const tick = () => { input._lastReal = performance.now() - 1000 / 60; input.beginFrame(DT); };

  M.hardReset(engine, c, V(...start), Math.atan2(waypoints[0][0] - start[0], waypoints[0][1] - start[2]));
  for (let i = 0; i < 30; i++) { tick(); engine.time += DT; c.update(DT, engine.time); input.endFrame(); }
  const settled = c.grounded;

  const d = DRIVERS[device];
  d.start();
  let wp = 0, sawCrawl = false, frames = 0, magMin = Infinity, magMax = 0;
  for (let i = 0; i < budget; i++) {
    const t = waypoints[Math.min(wp, waypoints.length - 1)];
    aim(t[0], t[1]);
    d.frame();
    tick();
    const m = Math.hypot(input.move.x, input.move.y);
    if (m < magMin) magMin = m;
    if (m > magMax) magMax = m;
    engine.time += DT; c.update(DT, engine.time);
    input.endFrame();
    frames = i;
    if (c.stateName === 'crawl') sawCrawl = true;
    const dd = Math.hypot(c.position.x - t[0], c.position.z - t[1]);
    if (dd < 1.1 && wp < waypoints.length - 1) wp++;
    else if (wp === waypoints.length - 1 && dd < 1.1) break;
  }
  /* `crouch` is bound to pad 6; if the trust arm worked, it never once went down. */
  const everCrouched = input.down('crouch');
  input.dispose?.();
  return {
    device, settled, sawCrawl, frames, magMin, magMax, everCrouched,
    end: c.position.clone(), state: c.stateName, grounded: c.grounded,
  };
}

const START = [-21.85, 0.20, -46.0];
const WPS = [[-21.85, -52], [-21.85, -60], [-18.0, -63.0], [-11.4, -63.0]];
const FOOT_Y = -5.40;
const arrived = (r) => r.end.x > -12.5 && r.grounded && Math.abs(r.end.y - FOOT_Y) < 0.2;

/* ====================================================================== */
test('padreach V1: the crawl runs hall -> crypt on a real keyboard AND a real left stick', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level and the shipped `Input` — a `keydown` on KeyW and a left stick
   *             at full forward each reach the crypt side of the tomb west wall (x > -12.5) at
   *             the gallery's y, having been in `crawl`.
   * fails on  : the SAME drive 10 m east, at x -12.0, where the hall's north wall was never cut —
   *             run in-arm, on the stick. It must stop, never crawl, and stop at §563's -49.56
   *             (the wall face -49.90 plus the 0.34 capsule radius), which is the control and a
   *             reproduction of another lane's number in one. Without it a rig that walked
   *             through walls would pass both device rows and read as a clean result.
   * does not discriminate: FINDING the mouth. Both rows snap the camera at the next waypoint
   *             every frame, so neither says anything about steering, about the camera, or about
   *             a player who does not already know where the hole is (§667). */
  const kbd = await walk('keyboard', START, WPS);
  assert.ok(kbd.settled, 'the keyboard stance did not settle grounded');
  assert.ok(kbd.sawCrawl, 'the keyboard walker never entered `crawl`');
  assert.ok(arrived(kbd), `keyboard ended at (${kbd.end.x.toFixed(2)}, ${kbd.end.y.toFixed(2)}, ${kbd.end.z.toFixed(2)}) state ${kbd.state}`);
  assert.ok(Math.abs(kbd.magMax - 1) < 1e-6, `a held key should give |move| exactly 1, got ${kbd.magMax}`);

  const pad = await walk('stick', START, WPS);
  assert.ok(pad.settled, 'the pad stance did not settle grounded');
  assert.ok(pad.sawCrawl, 'the left stick never entered `crawl` — the vent IS device-gated, and '
    + 'this is the first instrument that could have said so');
  assert.ok(arrived(pad), `stick ended at (${pad.end.x.toFixed(2)}, ${pad.end.y.toFixed(2)}, ${pad.end.z.toFixed(2)}) state ${pad.state}`);

  /* The two devices must agree, or "the vent works" is a claim about one of them. */
  assert.ok(pad.end.distanceTo(kbd.end) < 0.05,
    `keyboard and stick ended ${pad.end.distanceTo(kbd.end).toFixed(3)} m apart`);

  /* The failing input, run in-arm: the same drive 10 m east, where the wall was never cut. */
  const ctrl = await walk('stick', [-12.0, 0.20, -46.0], [[-12.0, -52], [-12.0, -60], [-12.0, -63.0]], { budget: 900 });
  assert.ok(!ctrl.sawCrawl && ctrl.end.z > -50.2,
    `10 m east the stick reached z ${ctrl.end.z.toFixed(2)} (crawl ${ctrl.sawCrawl}) — the wall is `
    + 'uncut there and must stop it, so this rig is not measuring the doorway');
  assert.ok(Math.abs(ctrl.end.z + 49.56) < 0.2,
    `the uncut control stopped at z ${ctrl.end.z.toFixed(2)}, not §563's -49.56`);

  console.log(`[padreach V1] keyboard ${kbd.frames} frames -> (${kbd.end.x.toFixed(2)}, ${kbd.end.y.toFixed(2)}, ${kbd.end.z.toFixed(2)}); `
    + `stick ${pad.frames} frames -> (${pad.end.x.toFixed(2)}, ${pad.end.y.toFixed(2)}, ${pad.end.z.toFixed(2)}); `
    + `control stops at z ${ctrl.end.z.toFixed(2)} (§563)`);
});

/* ====================================================================== */
test('padreach V2: the vent does not need crouch, so a dead L2 cannot shut it', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level driven on a left stick with buttons 6 and 7 pinned at +1 for
   *             the WHOLE drive — §542's non-conformant pad, in which `_padValue` never trusts
   *             either trigger and `crouch` can therefore never fire. `crawl` is still entered
   *             and the walker still arrives.
   * fails on  : `down('crouch')` being true at any point — asserted, and run in-arm as the
   *             premise check. If the trust gate ever let that trigger through, this arm would be
   *             driving a pad that CAN crouch and would prove nothing about one that cannot.
   * does not discriminate: whether crouch is reachable on a good pad (that is `padparity`'s), and
   *             everything V1's last line excludes. */
  const stuck = await walk('stick', START, WPS, { trigRest: 1 });

  assert.equal(stuck.everCrouched, false,
    'crouch went down during the +1-trigger drive — §542\'s gate did not hold, so this arm was '
    + 'not testing a pad that cannot crouch');
  assert.ok(stuck.sawCrawl,
    'with crouch permanently unavailable the walker never entered `crawl` — the vent IS gated on '
    + 'crouch and the hypothesis is confirmed rather than refuted');
  assert.ok(arrived(stuck),
    `the +1-trigger pad ended at (${stuck.end.x.toFixed(2)}, ${stuck.end.y.toFixed(2)}, ${stuck.end.z.toFixed(2)}) state ${stuck.state}`);

  console.log(`[padreach V2] L2/R2 pinned at +1 for the whole drive, crouch never down: crawl `
    + `entered, arrived at (${stuck.end.x.toFixed(2)}, ${stuck.end.y.toFixed(2)}, ${stuck.end.z.toFixed(2)}) `
    + `in ${stuck.frames} frames`);
});
