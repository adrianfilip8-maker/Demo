#!/usr/bin/env node
/**
 * ringprobe.mjs — what the GPU was actually handed for the `ring` batch, read off the buffers.
 *
 *   CHROME_PATH=… SANDS_NO_HMR=1 node tools/ringprobe.mjs [shot]      # default: impact
 *
 * Captures no PNGs. Boot, read four typed arrays, release — the lock is held for as short a
 * time as possible, per `fxrim.mjs`'s census path, which this follows.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────
 * `ringspill` measured the ring's drawn boundary at 1.115x the size the catalogue predicts,
 * uniformly over azimuth, with light 0.5 m outside the quad's own geometry in the two axis
 * directions where the quad is the limit. That is a claim about `sz`, and `sz` is
 * `mix(aSize.x, aSize.y, pow(u, aSize.z)) * uSizeScale` evaluated on attributes this process
 * can simply read. Inferring a cause from a ratio is what put 1.50 m into four consumers
 * (§405) and 0.55 m into two bars (§407); the attributes are three lines of `page.evaluate`.
 *
 * The arms also report `ring live 2` where `dive_ring` declares `count: [1, 1]`, and `_emit`
 * writes one instance per particle — so the batch holds a second sprite nobody has named. Both
 * questions are answered by the same read, which is why they are one tool and one boot.
 *
 * ── What it reads, and why each one ─────────────────────────────────────────────────────────
 *   aTime  x = birth (t - age), y = life, z = seed, w = wind gain   -> the AGE at render time
 *   aSize  x,y = size ramp ends AFTER scale, z = exponent, w = spin -> the SIZE ramp
 *   aP0    the spawn point                                          -> where each one is
 *   uTime / uSizeScale                                              -> the other two factors
 *
 * `sz` is then recomputed here from those numbers by the vertex shader's own expression, and
 * printed next to what `STAGE_IMPACT` intends. A derivation that is never projected back is
 * how both of the above got in (§407.2), so this prints both and their ratio every run.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

/**
 * `--counts` — WHY THERE WERE TWO RINGS, asked of the catalogue instead of the buffers.
 *
 * Boots nothing and takes no lock. Runs before the harness import does any work.
 *
 * The two `dive_ring` instances share birth, life, tile and position and differ only in their
 * per-particle draws, which is one `_emit` call whose loop ran twice — not two stagings. The
 * count comes from
 *
 *     n = Math.round( R.range( count[0], count[1] + 0.999 ) * countScale )
 *
 * and the `+ 0.999` idiom is built for `Math.floor`: `floor(range(a, b+0.999))` is uniform on
 * the integers a..b, which is plainly what was meant. With `Math.round` the whole distribution
 * shifts half a count upward — `count: [a, b]` yields a..b+1, and `count: [n, n]` is a coin
 * flip between n and n+1. `Rand.js` already exports the correct primitive, `f.int(lo, hi)` =
 * `floor(lo + f()*(hi-lo+1))`, and this call site does not use it.
 *
 * Reported, not repaired: it is `src/**`, other lanes are in that tree, and the population size
 * of every emitter in the game is a decision about the look and the budget, not a typo to fix
 * inside an FX measurement tool.
 */
if (process.argv.includes('--counts')) {
  const { EMITTERS } = await import('../src/fx/Emitters.js');
  const draw = (c0, c1) => {
    /* The exact distribution, integrated rather than sampled: R.range is uniform on
       [c0, c1+0.999), so P(n = k) is the length of the sub-interval that rounds to k. */
    const lo = c0, hi = c1 + 0.999, span = hi - lo;
    const out = new Map();
    for (let k = Math.round(lo); k <= Math.round(hi); k++) {
      const a = Math.max(lo, k - 0.5), b = Math.min(hi, k + 0.5);
      if (b > a) out.set(Math.max(1, k), (out.get(Math.max(1, k)) || 0) + (b - a) / span);
    }
    return out;
  };
  console.log('emitter count draws — declared vs what `_emit` actually yields\n');
  console.log(`  ${'emitter'.padEnd(20)} ${'declared'.padEnd(10)} yields`);
  let over = 0, total = 0, exact = 0;
  for (const [name, def] of Object.entries(EMITTERS)) {
    if (!def.count) continue;
    total++;
    const d = draw(def.count[0], def.count[1]);
    const keys = [...d.keys()].sort((a, b) => a - b);
    const mean = keys.reduce((s, k) => s + k * d.get(k), 0);
    const beyond = keys.filter((k) => k > def.count[1]).reduce((s, k) => s + d.get(k), 0);
    if (beyond > 1e-9) over++;
    if (keys.length === 1 && keys[0] === def.count[0] && def.count[0] === def.count[1]) exact++;
    console.log(`  ${name.padEnd(20)} ${`[${def.count[0]}, ${def.count[1]}]`.padEnd(10)} `
      + `${keys.map((k) => `${k}:${(d.get(k) * 100).toFixed(0)}%`).join(' ')}   mean ${mean.toFixed(3)}`
      + (beyond > 1e-9 ? `   ${(beyond * 100).toFixed(0)}% ABOVE the declared max` : ''));
  }
  console.log(`\n  ${over} of ${total} emitters can exceed their own declared maximum.`);
  console.log('  `count: [n, n]` is a coin flip between n and n+1, which is where the second');
  console.log('  `dive_ring` came from. `Rand.js` exports `f.int(lo, hi)` and this call site');
  console.log('  does not use it.');

  /* ── AND THE TEST SUITE WAS ALREADY SCORING THE FIXED BEHAVIOUR ──────────────────────────
   * `fxfeel.test.mjs` T3 grades the stealth ladder on `meanOf(count) * meanOf(alpha) * size^2`
   * with `meanOf = (r) => (r[0] + r[1]) / 2` — the DECLARED midpoint. The renderer was drawing
   * `(r[0] + r[1])/2 + 0.5`. So T3 has been asserting a ladder computed from counts the build
   * never emitted: the test was right, the renderer was wrong, and the fix makes them agree
   * rather than moving the ladder.
   *
   * This also corrects the commit that landed the fix, which said the shift was "uniform on
   * every rung". It is not — it runs 0.833x on a [2,3] rung to 0.950x on an [8,11] one, because
   * the half-count is a larger share of a smaller burst. The conclusion drawn from it survives
   * and gets stronger: the STEPS between rungs all WIDEN, so T3's 1.6x bar gains headroom
   * instead of losing it. Second time §407.2 has turned on one of my own commit messages this
   * session; printed here so the correction lives with the numbers rather than in prose. */
  const { ALERT_LADDER } = await import('../src/fx/Emitters.js');
  const meanOf = (r) => (r[0] + r[1]) / 2;
  const oldMean = (c) => {
    const lo = c[0], hi = c[1] + 0.999, span = hi - lo; let s = 0;
    for (let k = Math.round(lo); k <= Math.round(hi); k++) {
      const a = Math.max(lo, k - 0.5), b = Math.min(hi, k + 0.5);
      if (b > a) s += Math.max(1, k) * (b - a) / span;
    }
    return s;
  };
  const loud = (d, m) => m(d.count) * meanOf(d.alpha) * d.size[0] ** 2;
  const RUNGS = ['patrol', 'suspicious', 'searching', 'chase'];
  console.log('\n  the stealth ladder (fxfeel T3), old renderer vs declared counts:\n');
  const rows = [];
  for (const k of RUNGS) {
    const d = EMITTERS[ALERT_LADDER[k]?.emitter];
    if (!d?.count) continue;
    rows.push({ k, lo: loud(d, oldMean), ln: loud(d, meanOf) });
    console.log(`    ${k.padEnd(11)} loudness ${rows[rows.length - 1].lo.toFixed(5)} -> ${rows[rows.length - 1].ln.toFixed(5)}   x${(rows[rows.length - 1].ln / rows[rows.length - 1].lo).toFixed(4)}`);
  }
  console.log('\n    step ratios (T3 requires strictly increasing, >= 1.6x):');
  for (let i = 1; i < rows.length; i++) {
    const so = rows[i].lo / rows[i - 1].lo, sn = rows[i].ln / rows[i - 1].ln;
    console.log(`    ${rows[i - 1].k} -> ${rows[i].k}   OLD ${so.toFixed(4)}x   NEW ${sn.toFixed(4)}x   ${sn > so ? 'WIDENED' : 'narrowed'}`);
  }
  console.log('\n    The NEW column is T3\'s own published ladder and the ledger\'s, to five places.');
  console.log('    The fix does not move the ladder — it makes the build agree with its documentation.');
  process.exit(0);
}

const SHOT = process.argv[2] || 'impact';
const OUT = process.env.SANDS_OUT || `shots/ringprobe-${SHOT}`;
mkdirSync(OUT, { recursive: true });

let tree = null;
const got = await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 900000,
  onLocked: () => { tree = treeState(); },
}, async ({ page }) => {
  const subject = await page.evaluate(async (s) => {
    const r = await window.__GAME.setShot(s, { dt: 0 });
    return r?.subject ?? null;
  }, SHOT);

  /* Stepped exactly as `fxrim` steps before its capture, so the attributes read here are the
     ones that produced those PNGs rather than the ones one frame earlier. */
  const probe = await page.evaluate(async () => {
    await window.__GAME.step(3, 0);
    window.__ENGINE.renderFrame(0);
    const fx = window.__ENGINE.get('fx');
    const out = { batches: {}, fxT: fx?._t ?? null, fxT0: fx?._t0 ?? null, engineTime: window.__ENGINE.time ?? null };
    fx?.batches?.forEach((b, name) => {
      const n = b.geometry?.instanceCount ?? 0;
      const u = b.material?.uniforms ?? {};
      const rows = [];
      const at = b.aTime?.array, az = b.aSize?.array, ap = b.aP0?.array, ad = b.aDyn?.array, ash = b.aShape?.array;
      for (let i = 0; i < n; i++) {
        rows.push({
          i,
          birth: at?.[i * 4], life: at?.[i * 4 + 1], seed: at?.[i * 4 + 2],
          size0: az?.[i * 4], size1: az?.[i * 4 + 1], sizeExp: az?.[i * 4 + 2], spin: az?.[i * 4 + 3],
          p: ap ? [ap[i * 3], ap[i * 3 + 1], ap[i * 3 + 2]] : null,
          tile: ash?.[i * 4], fadeIn: ash?.[i * 4 + 1], fadeOut: ash?.[i * 4 + 2],
          alpha: ad?.[i * 4 + 3],
        });
      }
      out.batches[name] = {
        instanceCount: n, visible: !!b.mesh?.visible,
        uTime: u.uTime?.value ?? null, uSizeScale: u.uSizeScale?.value ?? null,
        uMaxSize: u.uMaxSize?.value ?? null, uOpacity: u.uOpacity?.value ?? null,
        uAlphaGain: u.uAlphaGain?.value ?? null,
        rows,
      };
    });
    return out;
  });
  return { subject, probe };
});

const { probe, subject } = got;
console.log(`ringprobe · shot ${SHOT} · tree ${tree?.src} (HEAD ${tree?.head})`);
console.log(`subject: ${JSON.stringify(subject)}`);
console.log(`fx clock: _t ${probe.fxT}  _t0 ${probe.fxT0}  engine.time ${probe.engineTime}\n`);

/* The vertex shader's own expression, applied to the numbers it was handed. */
const szOf = (r, uTime, uSizeScale) => {
  const age = uTime - r.birth;
  const u = age / Math.max(r.life, 1e-4);
  if (age < 0 || u >= 1) return { age, u, sz: 0, dead: true };
  return { age, u, sz: (r.size0 + (r.size1 - r.size0) * Math.pow(u, r.sizeExp)) * uSizeScale, dead: false };
};

for (const [name, b] of Object.entries(probe.batches)) {
  if (!b.instanceCount) continue;
  console.log(`── batch ${name}  ${b.instanceCount} instance(s) · visible ${b.visible} · `
    + `uTime ${b.uTime} · uSizeScale ${b.uSizeScale} · uMaxSize ${b.uMaxSize} · uOpacity ${b.uOpacity} · uAlphaGain ${b.uAlphaGain}`);
  if (name !== 'ring' && b.instanceCount > 6) { console.log(`   (${b.instanceCount} instances — not printed)\n`); continue; }
  for (const r of b.rows) {
    const s = szOf(r, b.uTime, b.uSizeScale);
    console.log(`   #${r.i}  birth ${r.birth?.toFixed(5)}  life ${r.life?.toFixed(4)}  age ${s.age?.toFixed(5)}  u ${s.u?.toFixed(5)}`
      + `  size ramp ${r.size0?.toFixed(3)}..${r.size1?.toFixed(3)} exp ${r.sizeExp?.toFixed(3)}`
      + `  tile ${r.tile}  alpha ${r.alpha?.toFixed(3)}`);
    console.log(`        p ${r.p?.map((v) => v.toFixed(3)).join(', ')}   ->  sz ${s.dead ? 'DEAD (u >= 1, clipped in the vertex shader)' : `${s.sz.toFixed(4)} m  (quad ${(2 * s.sz).toFixed(3)} m across)`}`);
  }
  console.log('');
}

/* ── project the derivation back, every run (§407.2) ─────────────────────────────────────── */
const ring = probe.batches.ring;
if (ring?.instanceCount) {
  const INTENDED_AGE = 0.088, LIFE = 0.34, S0 = 0.4 * 1.25, S1 = 5.0 * 1.25, EXP = 0.36;
  const uI = INTENDED_AGE / LIFE;
  const szI = S0 + (S1 - S0) * Math.pow(uI, EXP);
  console.log(`── the derivation, projected back ──────────────────────────────────────────────`);
  console.log(`   STAGE_IMPACT intends  age ${INTENDED_AGE} / life ${LIFE} = u ${uI.toFixed(5)}  ->  sz ${szI.toFixed(4)} m`);
  for (const r of ring.rows) {
    const s = szOf(r, ring.uTime, ring.uSizeScale);
    console.log(`   instance #${r.i} draws at sz ${s.dead ? '— (dead)' : `${s.sz.toFixed(4)} m`}`
      + (s.dead ? '' : `   ratio to intended ${(s.sz / szI).toFixed(4)}`));
  }
  const live = ring.rows.map((r) => szOf(r, ring.uTime, ring.uSizeScale)).filter((s) => !s.dead);
  if (live.length) {
    const widest = live.reduce((a, b) => (b.sz > a.sz ? b : a));
    console.log(`   WIDEST LIVE RING  sz ${widest.sz.toFixed(4)} m  at age ${widest.age.toFixed(5)} s`);
    console.log(`   ringspill measured the drawn boundary at 1.115x the ${szI.toFixed(3)} m model = ${(szI * 1.115).toFixed(3)} m`);
  }
}

writeFileSync(`${OUT}/probe.json`, JSON.stringify({ shot: SHOT, tree, subject, ...probe }, null, 2));
console.log(`\n→ ${OUT}/probe.json`);
