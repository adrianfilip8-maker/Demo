import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * routeplay.test.mjs — does the ROUTE play as a thief's playground, or as a walk with furniture?
 *
 * `reachcensus.test.mjs` answers "how many affordances exist and can they be entered" (31 and 29).
 * That is not the question the user asked. They asked for more places where thief movement is
 * required, and the way to fail that while passing `reachcensus` is to have plenty of affordances
 * that the player never stands next to. So this file measures the route rather than the map.
 *
 * ── The three quantities, all at the mechanism (§439) ───────────────────────────────────────
 *   BRANCH FACTOR  at a point: how many distinct affordance records a player standing there
 *                  could commit to, using the moveset's OWN canEnter gates — PoleClimb's
 *                  `poleMount * 1.5`, RailSlide's `railMount * 1.6`, HookSwing's `hookGrab`,
 *                  Crawl's `inVent` overlap — measured from AFFORD's own eye offsets.
 *   GAP            a maximal run of walked route with branch factor 0 on ground under 12°.
 *   OFFSET         each affordance's distance to the route polyline, beats included. Measuring
 *                  only the walked segments made every hook ring look 20 m off-route when the
 *                  hook chain IS a route segment; that error is corrected here.
 *
 * ── What it found on the shipped level ─────────────────────────────────────────────────────
 * The route is 5 WALK segments (85 m driven) and 5 BEAT segments (a jump, a double jump, a
 * hook grab, a swing, a retrace). A beat is the opposite of a gap, so beats are excluded.
 *
 *   branch factor over 170 walked samples : **0 on every one of them**
 *   gap total                             : 58.0 m of 85.0 m walked (68 %)
 *   worst gap                             : **35.5 m** — the hypostyle hall floor, z −20 → −54.6
 *   then                                  : 12.0 m crypt · 8.0 m spawn approach
 *   offset                                : 5 affordances within 3 m of the route, 7 within
 *                                           3–9 m, 7 within 9–20 m, and 12 beyond 20 m
 *
 * The 12 far ones are the ROOFTOP RUN (§8.6), a separate authored line — that is expected, not a
 * defect. The 35.5 m is, and §570 records why the fill for it is priced and not shipped.
 *
 * ── What this file deliberately does NOT measure ───────────────────────────────────────────
 * Branch factor counts AFFORDANCES, not every traversal choice. The spawn approach scores 0 and
 * still has a real line: the colossi plinth courses step 0 → 1 → 2 → 3.6 → 4.5 and a driven
 * run-and-jump reaches grounded y 4.90 on the anchor stone, which is where §495.B's rope is
 * walked on from. Arm R3 drives that, so the limitation is measured rather than asserted.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R2D = 180 / Math.PI;

/* The moveset's own entry gates, with AFFORD's own eye offsets. */
const GATES = [
  ['pole', 0.95, TUNE.poleMount * 1.5],
  ['rail', 0.55, TUNE.railMount * 1.6],
  ['hook', 1.15, TUNE.hookGrab],
  ['spire', 0.30, TUNE.spireGrab ?? 3.0],
];
/* The tomb descent is a dog-leg whose walkable lane is not its drawn centre (§561). */
const LANES = {
  'descent-landing->vault-floor': [
    V(0, 0, -56.6), V(-3, -1.6, -56.8), V(-6, -3.4, -56.8), V(-9.4, -5.5, -56.8),
    V(-9.6, -5.6, -57.8), V(-5, -9, -57.8), V(0.4, -12, -57.6),
  ],
};
const BEATS = new Set([
  'terrace-1->terrace-2', 'terrace-2->kiosk-lintel', 'kiosk-lintel->hook-chain',
  'hook-chain->hall-front-cornice', 'hall-front-cornice->hall-floor',
]);

async function harness() {
  const { engine, collision, arch, c } = await realWorld();
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (s) => {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    s(engine.input); engine.time += DT; c.update(DT, engine.time); engine.events.length = 0;
  };
  const options = (feet, gates = GATES) => {
    const recs = new Set();
    for (const [tag, eye, range] of gates) {
      for (const h of collision.query(V(feet.x, feet.y + eye, feet.z), range, [tag]) || []) if (h.rec) recs.add(h.rec);
    }
    for (const h of collision.overlap(V(feet.x, feet.y + 0.05, feet.z), TUNE.radius + 0.05, ['vent']) || []) recs.add(h.rec || h);
    for (const rec of collision.recs) {
      if (!rec.handholds?.length) continue;
      for (const h of rec.handholds) if (h.point.distanceTo(feet) < 2.4) { recs.add(rec); break; }
    }
    return recs;
  };
  const walkSeg = (from, wps, frames = 1400) => {
    hardReset(engine, c, from.clone().add(V(0, 0.6, 0)), Math.atan2(wps[0].x - from.x, wps[0].z - from.z));
    for (let i = 0; i < 45; i++) step(() => {});
    if (!c.grounded) return { path: [] };
    const path = [c.position.clone()];
    let wi = 0;
    for (let i = 0; i < frames; i++) {
      const t = wps[Math.min(wi, wps.length - 1)];
      step((inp) => { aim(t.x, t.z); inp.move.y = 1; });
      if (path[path.length - 1].distanceTo(c.position) > 0.4) path.push(c.position.clone());
      if (Math.hypot(c.position.x - t.x, c.position.z - t.z) < 1.0 && Math.abs(c.position.y - t.y) < 2.0) {
        if (wi < wps.length - 1) wi++; else break;
      }
    }
    return { path };
  };
  return { engine, collision, arch, c, step, aim, options, walkSeg };
}

/** Resample a driven path at 0.5 m and score each sample. */
function scorePath(collision, options, key, path) {
  const out = [];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const n = Math.max(1, Math.round(a.distanceTo(b) / 0.5));
    for (let j = 0; j < n; j++) {
      const p = a.clone().lerp(b, j / n);
      const g = collision.groundCheck(V(p.x, p.y + 1.0, p.z), TUNE.radius, 4);
      out.push({ key, p, opts: options(p).size, slope: g?.hit ? Math.acos(Math.min(1, g.normal.y)) * R2D : 0 });
    }
  }
  return out;
}
function gapsOf(samples) {
  const gaps = []; let run = null;
  for (const s of samples) {
    if (s.opts === 0 && s.slope < 12) { if (!run) run = { key: s.key, from: s.p.clone(), n: 0 }; run.n++; run.to = s.p.clone(); }
    else if (run) { gaps.push(run); run = null; }
  }
  if (run) gaps.push(run);
  return gaps.sort((a, b) => b.n - a.n);
}

/* ====================================================================================== */
test('routeplay R1: the walked route\'s gap distribution, as a seal', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — 5 walk segments driven, ~85 m, worst gap 35.5 m in the
   *             hall, gap total under 75 % of the walked route.
   * fails  on : the same measurement with the gate ranges widened to 40 m — RUN IN-ARM. Every
   *             sample then has an option and the worst gap collapses, which proves the gaps
   *             are a property of REACH and not an artefact of the resampling or of the route.
   * does NOT  : count non-affordance lines (plinth courses, step-ups) — arm R3 covers the one
   * discrim.    that matters; judge whether a gap is *bad*, only how long it is; or look at the
   *             rooftop run, which is a separate authored line.
   */
  const { collision, arch, options, walkSeg } = await harness();
  const R = arch.api.route.map(([n, x, y, z]) => ({ n, p: V(x, y, z) }));
  R.push({ n: 'eye-of-ra', p: V(0, -11.20, -74.30) });
  let samples = [];
  let walks = 0;
  for (let i = 0; i < R.length - 1; i++) {
    const key = `${R[i].n}->${R[i + 1].n}`;
    if (BEATS.has(key)) continue;
    const r = walkSeg(R[i].p, LANES[key] || [R[i + 1].p]);
    if (r.path.length < 3) continue;
    walks++;
    samples = samples.concat(scorePath(collision, options, key, r.path));
  }
  assert.ok(walks >= 4, `only ${walks} walk segments drove — the route census has nothing to measure`);
  assert.ok(samples.length > 120, `only ${samples.length} samples over the walked route`);

  const gaps = gapsOf(samples);
  const worst = gaps[0];
  const totalGap = gaps.reduce((s, g) => s + g.n, 0);
  /* The bar is now a CEILING, not a floor. It was `>= 25` when it recorded a 35.5 m gap nobody
     had filled; §571's nave rope split that run to 20.0 m, so the useful thing to protect is the
     fill. If the rope is removed or moved out of the walked line's reach this goes straight back
     to ~35.5 and reddens here. */
  assert.ok(worst && worst.n * 0.5 <= 25,
    `the worst gap is now ${(worst ? worst.n * 0.5 : 0).toFixed(1)} m, measured at 20.0 m after §571 hung `
    + 'the nave rope (35.5 m before it). A gap back near 35 m means the rope has moved outside '
    + `poleMount*1.5 = ${(TUNE.poleMount * 1.5).toFixed(2)} m of the walked line, or gone`);
  assert.ok(totalGap / samples.length < 0.75,
    `${(100 * totalGap / samples.length).toFixed(0)}% of the walked route is gap, measured at 68% before `
    + '§571 and lower after. Something has removed affordances from beside the route');

  /* the failing input: widen the gates and the gaps must collapse */
  const WIDE = GATES.map(([t, e]) => [t, e, 40]);
  const wideSamples = samples.map((s) => ({ ...s, opts: options(s.p, WIDE).size }));
  const wideWorst = gapsOf(wideSamples)[0];
  const wideLen = wideWorst ? wideWorst.n * 0.5 : 0;
  assert.ok(wideLen < worst.n * 0.5 * 0.5,
    `ABLATION: widening every entry gate to 40 m left the worst gap at ${wideLen.toFixed(1)} m against `
    + `${(worst.n * 0.5).toFixed(1)} m. The gaps are supposed to be a property of REACH; if they survive a `
    + '40 m reach they are an artefact of this instrument and the numbers above mean nothing');
  console.log(`[routeplay R1] ${walks} walk segments, ${samples.length} samples (${(samples.length * 0.5).toFixed(0)} m) · `
    + `worst gap ${(worst.n * 0.5).toFixed(1)} m in ${worst.key} · total ${(100 * totalGap / samples.length).toFixed(0)}% `
    + `· ablated worst ${wideLen.toFixed(1)} m`);
});

/* ====================================================================================== */
test('routeplay R2: affordance offset from the route, and the hall floor has nothing above it', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — at least 10 of the 30 offered affordances lie within 9 m of
   *             the route polyline (beats included), so the route is not merely adjacent to the
   *             level's content.
   * fails  on : the same measure against a route of ONE waypoint (spawn alone) — RUN IN-ARM,
   *             where almost nothing is within 9 m. That is the control proving the metric
   *             responds to the route and is not just measuring how clustered the level is.
   * does NOT  : say a far affordance is wasted. The 12 beyond 20 m are the §8.6 rooftop run.
   */
  const { collision, arch } = await harness();
  const R = arch.api.route.map(([n, x, y, z]) => V(x, y, z));
  R.push(V(0, -11.20, -74.30));
  const segDist = (q, a, b) => {
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, q.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
    return q.distanceTo(a.clone().addScaledVector(ab, t));
  };
  const distTo = (q, poly) => {
    if (poly.length === 1) return q.distanceTo(poly[0]);
    let best = Infinity;
    for (let i = 0; i < poly.length - 1; i++) best = Math.min(best, segDist(q, poly[i], poly[i + 1]));
    return best;
  };
  const affs = [];
  for (const e of collision._aff) {
    if (!['pole', 'rail', 'hook', 'spire', 'vent'].includes(e.rec.tag)) continue;
    const pts = [];
    if (e.curve) for (let i = 0; i < 9; i++) pts.push(e.curve.getPoint(i / 8));
    else if (typeof e.x === 'number') pts.push(V(e.x, e.y, e.z));
    else if (e.box) pts.push(e.box.getCenter(new THREE.Vector3()));
    affs.push({ tag: e.rec.tag, pts });
  }
  assert.equal(affs.length, 31,
    `${affs.length} offered affordances, expected 31 (§568 retagged the 0.4 m north mast out of the pole `
    + 'count, §571 added the nave rope). If this moved, re-run the offset census before the bands below');
  const near = affs.filter((a) => Math.min(...a.pts.map((p) => distTo(p, R))) <= 9).length;
  assert.ok(near >= 10,
    `only ${near} of ${affs.length} affordances are within 9 m of the route. The level's content has `
    + 'drifted away from where the player goes, which is the failure this file exists to catch');

  /* the control: the same metric against a one-point "route" must find far fewer */
  const nearSpawn = affs.filter((a) => Math.min(...a.pts.map((p) => distTo(p, [V(0, 0, 30)]))) <= 9).length;
  assert.ok(nearSpawn < near / 2,
    `ABLATION: measuring against the spawn point alone found ${nearSpawn} affordances within 9 m against `
    + `${near} for the whole route. The metric is supposed to respond to the ROUTE; if a single point `
    + 'scores nearly as well, it is measuring level density and not route adjacency');

  /* The hall floor, station by station: §571's rope must be inside the walked line's own gate
     where it was hung, and the rest of the floor is still bare — which is what keeps the 20.0 m
     residual gap in R1 honest rather than an artefact. */
  const optsAt = (z) => {
    const o = new Set();
    for (const [tag, eye, range] of GATES) {
      for (const h of collision.query(V(0, 0.02 + eye, z), range, [tag]) || []) if (h.rec) o.add(h.rec);
    }
    return o.size;
  };
  assert.ok(optsAt(-33) >= 1,
    'the hall floor at (0, 0, -33) offers nothing. §571 hung the nave rope 2.40 m off the walked line '
    + `specifically so it lands inside poleMount*1.5 = ${(TUNE.poleMount * 1.5).toFixed(2)} m from it; if `
    + 'this is 0 the rope is out of reach of the route it was hung for');
  for (const z of [-25, -47]) {
    assert.equal(optsAt(z), 0,
      `the hall floor at (0, 0, ${z}) now offers ${optsAt(z)} affordance(s) — if a second line went in, `
      + "update §570's numbers and R1's ceiling with it");
  }
  console.log(`[routeplay R2] ${near}/${affs.length} affordances within 9 m of the route (spawn-only control: ${nearSpawn}) · hall floor offers ${optsAt(-33)} at the rope station and 0 at z -25/-47`);
});

/* ====================================================================================== */
test('routeplay R3: branch factor 0 does not mean no line — the colossi plinth, driven', async () => {
  /* The limitation of R1, measured instead of asserted. The spawn approach scores 0 branch
   * factor for its whole 8 m and still has a real alternative line: the colossi plinth courses
   * step 0 → 1 → 2 → 3.6 → 4.5, and §495.B's rope is walked on from the anchor stone at 4.90.
   * If that drive ever stops working the rope loses its near side, which no other arm would see.
   *
   * DOMAIN (§418.3)
   * passes on : a run-and-jump from the courtyard floor beside either colossus reaching grounded
   *             y >= 4.4 — the knee shelf band.
   * fails  on : the same drive with jump suppressed — RUN IN-ARM: held forward alone stays on
   *             the paving at y 0.00, so the arm is measuring the climb and not the walk.
   * does NOT  : say the climb is easy or discoverable; it is one scripted cadence, not a sweep.
   */
  const { engine, c, step, aim } = await harness();
  const climb = (sx, jump) => {
    hardReset(engine, c, V(sx, 0.4, 29.5), Math.atan2(-sx, 0));
    for (let i = 0; i < 45; i++) step(() => {});
    if (!c.grounded) return -99;
    let hi = c.position.y;
    for (let i = 0; i < 420; i++) {
      step((inp) => {
        aim(sx * 0.9, 27.0); inp.move.y = 1;
        if (jump) { const ph = i % 34; if (ph < 6 || (ph >= 11 && ph < 17)) inp.hold('jump'); else inp.let_go('jump'); }
      });
      if (c.grounded) hi = Math.max(hi, c.position.y);
    }
    return hi;
  };
  const east = climb(7.5, true), west = climb(-7.5, true);
  assert.ok(Math.max(east, west) >= 4.4,
    `neither colossus plinth carried a driven climb to the knee band (east ${east.toFixed(2)}, west `
    + `${west.toFixed(2)}, want >= 4.4). §495.B's rope is walked on from there, so this is its near side`);
  const flat = Math.max(climb(7.5, false), climb(-7.5, false));
  assert.ok(flat < 1.0,
    `ABLATION: with jump suppressed the same drive still reached y ${flat.toFixed(2)}. It is supposed to `
    + 'stay on the paving; if walking alone climbs the plinth, this arm is not measuring a climb');
  console.log(`[routeplay R3] plinth climb reaches grounded y ${Math.max(east, west).toFixed(2)} (east ${east.toFixed(2)} / west ${west.toFixed(2)}); walk-only ${flat.toFixed(2)}`);
});
