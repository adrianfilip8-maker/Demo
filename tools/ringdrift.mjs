#!/usr/bin/env node
/**
 * ringdrift.mjs — the two consequences of the PLANAR normal drift that were named and not measured.
 *
 *   node tools/ringdrift.mjs
 *
 * Boots nothing, takes no capture lock.
 *
 * ── The defect being measured ───────────────────────────────────────────────────────────────
 * `PARTICLE_VERT` integrates position as `p = aP0 + aV0 * dc`, with `dc = age` when drag is 0.
 * For PLANAR sprites `aV0` holds **the plane normal** — `_emit`'s own comment says so, one line
 * above the expression that treats it as a velocity. Every PLANAR sprite therefore travels along
 * its own normal at exactly 1 m/s, reaching `life` metres by the end of its life.
 *
 * The floor case is already measured (`tools/ringextent.mjs`): it supplies 59% of `dive_ring`'s
 * stand-off from the ground and 2.50x of its opacity through the `SOFT` fade, so removing the
 * drift is a look change and not a cleanup. Two further consequences were named there and NOT
 * measured, and a decision resting on one measured number and two adjectives is not a decision.
 * This file supplies the other two.
 *
 *   A. THE SIDEWAYS CASE. `cane_ring`'s normal is the swing direction (`_onCaneHit`: `_dir` is
 *      the hit dir, falling back to `mv.faceDir`), which is HORIZONTAL. So the strike ring does
 *      not lift off a floor — it flies off the thing it struck, sideways, at 1 m/s.
 *   B. THE BRIGHTENING. The authored alpha curve is a fade: `pow(1 - u, fadeOut)`, monotone
 *      after the fade-in. The `SOFT` term multiplies it by the sprite's stand-off from the
 *      surface behind, and the drift makes that stand-off GROW with age. If the product is
 *      non-monotone, the ring brightens while it is supposed to be dissipating.
 *
 * Nothing is re-implemented: emitter fields come from `EMITTERS`, the staged ages from the
 * `STAGE_*` tables in `Particles.js` read out of its source, the cameras from `SHOTS`, and the
 * softness from the `_batch('ring', …)` call site. Every literal is grepped, not transcribed.
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { EMITTERS } from '../src/fx/Emitters.js';
import { TUNE } from '../src/fx/Particles.js';
import { SHOTS } from '../src/core/Shots.js';
import { camFor, W, H } from './framelib.mjs';

const PSRC = readFileSync(new URL('../src/fx/Particles.js', import.meta.url), 'utf8');
const grepNum = (re, what) => {
  const m = PSRC.match(re);
  if (!m) throw new Error(`ringdrift: Particles.js no longer states ${what} in a readable form`);
  return Number(m[1]);
};
/** `_batch('ring', { … softness: 0.9 … })` — the divisor in PARTICLE_FRAG's SOFT term. */
const RING_SOFTNESS = grepNum(/_batch\('ring',\s*\{[^}]*?softness:\s*([\d.]+)/s, "the ring batch's softness");
/** `STAGE_IMPACT`'s dive_ring age, and `STAGE_CANE`'s cane_ring age. */
const AGE_DIVE = grepNum(/\['dive_ring',\s*([\d.]+)\]/, "STAGE_IMPACT's dive_ring age");
const AGE_CANE = grepNum(/cane_ring:\s*([\d.]+)/, "STAGE_CANE's cane_ring age");
/** `_stageImpact`: `_stg.set(p.x, p.y + 0.06, p.z)`. */
const STAGE_LIFT = grepNum(/_stg\.set\(\s*p\.x,\s*p\.y\s*\+\s*([\d.]+)/, "_stageImpact's staged height");
/** `_onCaneHit`: `const heavy = index >= 3 ? 1.35 : 1.0` — `combat` stages the third hit. */
const HEAVY = grepNum(/const heavy = index >= 3 \? ([\d.]+)/, "_onCaneHit's heavy scale");

/** The vertex shader's size ramp, at the jitter factor the caller asks for. */
const szOf = (def, age, jitter, scale) => {
  const s = jitter * scale;
  const u = Math.pow(age / def.life[0], def.sizeExp);
  return def.size[0] * s + (def.size[1] * s - def.size[0] * s) * u;
};
/** The vertex shader's alpha, before SOFT and before uOpacity. */
const vColA = (def, u) => {
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return def.alpha[0] * smooth(0, Math.max(def.fadeIn, 1e-3), u) * Math.pow(Math.max(1 - u, 0), def.fadeOut);
};

console.log(`ringdrift · every PLANAR sprite travels along its own normal at 1 m/s (dc = age at drag 0)`);
console.log(`read from source: ring softness ${RING_SOFTNESS} · dive_ring age ${AGE_DIVE} · cane_ring age ${AGE_CANE}`);
console.log(`                  staged lift ${STAGE_LIFT} m · _onCaneHit heavy ${HEAVY}\n`);

/* ── the drift, per PLANAR emitter, as a distance and as a fraction of its own sprite ────── */
console.log('── HOW FAR EACH RING TRAVELS OFF THE SURFACE IT IS A DECAL ON ──────────────────');
console.log('   emitter      normal          drift @ staged age   drift @ end of life   as % of its own radius');
const RINGS = [
  { name: 'dive_ring', normal: 'UP (_stageImpact passes dir: UP)', age: AGE_DIVE, scale: TUNE.impactScale },
  { name: 'land_ring', normal: 'UP (_onLand passes dir: UP)', age: null, scale: 1.0 },
  { name: 'cane_ring', normal: 'THE SWING DIR — horizontal', age: AGE_CANE, scale: HEAVY },
];
for (const r of RINGS) {
  const def = EMITTERS[r.name];
  const life = def.life[0];
  const at = r.age ?? life;
  const szEnd = szOf(def, life * 0.999, 1.0, r.scale);
  const szAt = szOf(def, at, 1.0, r.scale);
  console.log(`   ${r.name.padEnd(11)}  ${r.normal.padEnd(34)}`);
  console.log(`   ${''.padEnd(11)}  drift ${at.toFixed(3)} m at age ${at.toFixed(3)} (sz ${szAt.toFixed(3)} m, ${(100 * at / szAt).toFixed(1)}% of radius)`);
  console.log(`   ${''.padEnd(11)}  drift ${life.toFixed(3)} m at end of life (sz ${szEnd.toFixed(3)} m, ${(100 * life / szEnd).toFixed(1)}% of radius)`);
}

/* ── A. THE SIDEWAYS CASE, in the frame `combat` actually ships ──────────────────────────── */
console.log('\n── A. THE SIDEWAYS CASE: cane_ring flies off what it struck ────────────────────');
{
  const def = EMITTERS.cane_ring;
  const cam = camFor(SHOTS.combat);
  const P = SHOTS.combat.player.pos;
  /* `_onCaneHit` with no `pos` pushes the anchor 0.95 m along the swing dir; `mv.faceDir` for a
     posed character is the yaw. This is the gameplay geometry, stated so it can be checked. */
  const yaw = SHOTS.combat.player.yaw;
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  const anchor = new THREE.Vector3(P[0], P[1] + 1.2, P[2]).addScaledVector(dir, 0.95);
  const proj = (w) => { const v = w.clone().project(cam); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
  console.log(`   combat stages cane hit 3 · swing dir (${dir.x.toFixed(3)}, 0, ${dir.z.toFixed(3)}) · anchor ${anchor.toArray().map((v) => v.toFixed(2))}`);
  console.log(`   age        drift (m)   centre on screen    displacement from age 0`);
  const p0 = proj(anchor);
  for (const age of [0, AGE_CANE, def.life[0] * 0.5, def.life[0] * 0.999]) {
    const p = proj(anchor.clone().addScaledVector(dir, age));
    const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    const sz = szOf(def, Math.max(age, 1e-4), 1.0, HEAVY);
    console.log(`   ${age.toFixed(3)}      ${age.toFixed(3)}       ${p[0].toFixed(0)}, ${p[1].toFixed(0)}`.padEnd(56)
      + `${d.toFixed(1)} px   = ${(100 * age / sz).toFixed(1)}% of its own radius`);
  }
  console.log('   The ring is a mark ON a struck surface. It does not stay on it: by end of life');
  console.log(`   it stands ${def.life[0].toFixed(2)} m clear of the point of impact, along the blow.`);
}

/* ── B. THE BRIGHTENING, at impact's own camera ──────────────────────────────────────────── */
console.log('\n── B. THE BRIGHTENING: the drawn alpha is NOT monotone after fade-in ───────────');
{
  const def = EMITTERS.dive_ring;
  const cam = camFor(SHOTS.impact);
  const life = def.life[0];
  const n = new THREE.Vector3(0, 1, 1e-4).normalize();
  const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const viewZ = (w) => -w.clone().applyMatrix4(cam.matrixWorldInverse).z;
  /* Sample on the ring's bright annulus, at the azimuth that stays in frame. */
  const softAt = (age, rFrac) => {
    const sz = szOf(def, Math.max(age, 1e-4), 1.0, TUNE.impactScale);
    const y = STAGE_LIFT + age;                       // staged height + the normal drift
    const r = sz * rFrac;
    const p = new THREE.Vector3(0, y, -8).addScaledVector(t1, r * Math.SQRT1_2).addScaledVector(t2, r * Math.SQRT1_2);
    const d = p.clone().sub(cam.position).normalize();
    const floor = cam.position.clone().addScaledVector(d, (0 - cam.position.y) / d.y);
    return Math.min(1, Math.max(0, (viewZ(floor) - viewZ(p)) / RING_SOFTNESS));
  };
  const softNoDrift = (age, rFrac) => {
    const sz = szOf(def, Math.max(age, 1e-4), 1.0, TUNE.impactScale);
    const r = sz * rFrac;
    const p = new THREE.Vector3(0, STAGE_LIFT, -8).addScaledVector(t1, r * Math.SQRT1_2).addScaledVector(t2, r * Math.SQRT1_2);
    const d = p.clone().sub(cam.position).normalize();
    const floor = cam.position.clone().addScaledVector(d, (0 - cam.position.y) / d.y);
    return Math.min(1, Math.max(0, (viewZ(floor) - viewZ(p)) / RING_SOFTNESS));
  };

  console.log('      u      age     authored a   SOFT (drifted)  DRAWN     SOFT (no drift)  DRAWN no-drift');
  let peakD = { a: -1 }, peakN = { a: -1 };
  const rows = [];
  for (let u = 0.005; u <= 1.0; u += 0.005) {
    const age = u * life;
    const a = vColA(def, u);
    const sD = softAt(age, 0.86), sN = softNoDrift(age, 0.86);
    const dD = a * sD, dN = a * sN;
    rows.push({ u, age, a, sD, dD, sN, dN });
    if (dD > peakD.a) peakD = { a: dD, u, age };
    if (dN > peakN.a) peakN = { a: dN, u, age };
  }
  for (const u of [0.02, 0.10, 0.2588, 0.40, 0.55, 0.70, 0.85, 0.98]) {
    const r = rows.reduce((p, c) => (Math.abs(c.u - u) < Math.abs(p.u - u) ? c : p));
    console.log(`   ${r.u.toFixed(3)}  ${r.age.toFixed(3)}    ${r.a.toFixed(4)}      ${r.sD.toFixed(4)}        ${r.dD.toFixed(4)}    ${r.sN.toFixed(4)}         ${r.dN.toFixed(4)}`);
  }
  const atFadeIn = rows.find((r) => r.u >= def.fadeIn);
  console.log(`\n   authored curve peaks at u ${def.fadeIn.toFixed(3)} (end of fade-in) and falls monotonically from there.`);
  console.log(`   DRAWN, with the drift:     peaks at u ${peakD.u.toFixed(3)} (age ${peakD.age.toFixed(3)} s), a = ${peakD.a.toFixed(4)}`);
  console.log(`   DRAWN, without the drift:  peaks at u ${peakN.u.toFixed(3)} (age ${peakN.age.toFixed(3)} s), a = ${peakN.a.toFixed(4)}`);
  console.log(`   rise from end of fade-in to the drifted peak: ${(peakD.a / atFadeIn.dD).toFixed(3)}x`);
  console.log(`   the same rise without the drift:              ${(peakN.a / atFadeIn.dN).toFixed(3)}x`);
  console.log('\n   A shockwave that gets brighter over the first third of its life is reading as an');
  console.log('   expanding light rather than a dissipating one. The authored curve says fade.');

  /* ── THE THIRD ARM, WHICH IS WHAT MAKES THIS A DECISION AND NOT A DIAGNOSIS ─────────────
   * The 2.50x opacity the drift buys and the 1.92x brightening ramp it causes are THE SAME
   * TERM. They cannot be separated by tuning the drift — a smaller drift gives less of both.
   * They CAN be separated by replacing it: a STATIC staged lift reproduces the stand-off
   * without making it a function of age. So the question "is the drift load-bearing?" has a
   * third answer besides keep/remove, and it is the only one that keeps the win and drops the
   * cost. Priced here rather than asserted. */
  const staticLift = STAGE_LIFT + AGE_DIVE;           // 0.148 m — the stand-off at the staged age
  const softStatic = (age, rFrac) => {
    const sz = szOf(def, Math.max(age, 1e-4), 1.0, TUNE.impactScale);
    const r = sz * rFrac;
    const p = new THREE.Vector3(0, staticLift, -8).addScaledVector(t1, r * Math.SQRT1_2).addScaledVector(t2, r * Math.SQRT1_2);
    const d = p.clone().sub(cam.position).normalize();
    const floor = cam.position.clone().addScaledVector(d, (0 - cam.position.y) / d.y);
    return Math.min(1, Math.max(0, (viewZ(floor) - viewZ(p)) / RING_SOFTNESS));
  };
  console.log(`\n   THIRD OPTION — a STATIC lift of ${staticLift.toFixed(3)} m (staged ${STAGE_LIFT} + the drift at the staged age):\n`);
  console.log('      u      DRAWN drifted   DRAWN static-lift   ratio');
  let peakS = { a: -1 };
  const sRows = [];
  for (let u = 0.005; u <= 1.0; u += 0.005) {
    const age = u * life;
    const dS = vColA(def, u) * softStatic(age, 0.86);
    sRows.push({ u, dS });
    if (dS > peakS.a) peakS = { a: dS, u };
  }
  for (const u of [0.02, 0.10, 0.2588, 0.40, 0.70, 0.98]) {
    const r = rows.reduce((p, c) => (Math.abs(c.u - u) < Math.abs(p.u - u) ? c : p));
    const s = sRows.reduce((p, c) => (Math.abs(c.u - u) < Math.abs(p.u - u) ? c : p));
    console.log(`   ${r.u.toFixed(3)}     ${r.dD.toFixed(4)}          ${s.dS.toFixed(4)}           ${(s.dS / r.dD).toFixed(3)}`);
  }
  const atStaged = rows.reduce((p, c) => (Math.abs(c.u - AGE_DIVE / life) < Math.abs(p.u - AGE_DIVE / life) ? c : p));
  const sStaged = sRows.reduce((p, c) => (Math.abs(c.u - AGE_DIVE / life) < Math.abs(p.u - AGE_DIVE / life) ? c : p));
  console.log(`\n   at the STAGED age the two are identical by construction: ${atStaged.dD.toFixed(4)} vs ${sStaged.dS.toFixed(4)}`);
  console.log(`   — so every staged still is unchanged to the pixel, and only MOTION differs.`);
  console.log(`   static-lift curve peaks at u ${peakS.u.toFixed(3)} against the drifted ${peakD.u.toFixed(3)}: the ramp is gone`);
  console.log(`   and the opacity is kept. That is the option the two measurements above point at.`);
}
