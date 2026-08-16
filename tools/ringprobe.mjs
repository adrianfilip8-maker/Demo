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
