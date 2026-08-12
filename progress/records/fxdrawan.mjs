#!/usr/bin/env node
/**
 * fxdrawan — score `shots/fxdraw/` against PREREG-fxdraw §4 (D1–D4) and the ADDENDUM's D2b.
 * Written BEFORE any candidate frames exist, implementing the registered gates verbatim; every
 * threshold below is quoted from those two documents and none may move now (§141.1).
 *
 *   D1 SHRINK       F1 <= 0.40 * F0
 *   D3 NOT DELETED  F1 >= 0.25 * F0        (D1+D3: a zeroed emitter must FAIL)
 *   D2a CHROMA      mean sat of the candidate's own contribution >= 0.35
 *   D2b SAME-RUN    that sat >= 2.5x the suspect's own contribution sat, same boot
 *   D4 HERO UNVEILED  over the character's projected box, candidate mean L lift
 *                     <= 0.40 * suspect's
 *
 * F0 = changed px between base and suspect (the suspect's own footprint, denominator);
 * F1 = changed px between cand and candoff (the candidate's). Contribution chroma is measured
 * in the WITH-emitter frame over that frame's own contribution pixels — "what it actually put
 * on screen after the grade" (PREREG §2). The D4 box is DERIVED from Shots.js at score time,
 * never typed in: a 1.8 m x 1.0 m box at the combat player stand, projected through the combat
 * camera.
 *
 * VOID conditions, each fail-closed and each blocking SHIP on its own (PREREG §4):
 *   · base vs base2 >= 200 changed px
 *   · the suppression arm removes 0 px
 *   · provenance missing / src dirty at capture / sha mismatch at scoring
 *
 *   node progress/records/fxdrawan.mjs
 */
import * as THREE from 'three';
import { readPNG } from '../../tools/png.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SHOTS } from '../../src/core/Shots.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '../../shots/fxdraw');
const DTHR = 4;

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };

function load(n) {
  const f = path.join(DIR, `${n}.png`);
  if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }
  return readPNG(f);
}
const base = load('base'), suspect = load('suspect'), nocane = load('nocane'),
  cand = load('cand'), candoff = load('candoff'), base2 = load('base2');
const { w, h, ch } = base;
const at = (im, i) => [im.data[i * ch], im.data[i * ch + 1], im.data[i * ch + 2]];
const diff = (a, b, i) => {
  const p = at(a, i), q = at(b, i);
  return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
};

let manifest = null;
try { manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')); } catch { manifest = null; }

/* ── VOIDs first, fail-closed ────────────────────────────────────────────────────────────── */
let VOID = [];

let dup = 0;
for (let i = 0; i < w * h; i++) if (diff(base, base2, i) >= DTHR) dup++;
console.log(`VALIDITY  base vs base2: ${dup} changed px (>=${DTHR}) — ${dup < 200 ? 'OK' : 'VOID'}`);
if (dup >= 200) VOID.push(`validity ${dup} px`);

/* contribution masks + stats */
function contribution(withIm, withoutIm) {
  let n = 0, sSat = 0;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (diff(withIm, withoutIm, i) < DTHR) continue;
    mask[i] = 1; n++;
    sSat += sat(...at(withIm, i));
  }
  return { n, meanSat: n ? sSat / n : 0, mask };
}
const C0 = contribution(base, suspect);       // the suspect's own footprint, in base
const C1 = contribution(cand, candoff);       // the candidate's own footprint, in cand
console.log(`SUBJECT   suspect footprint F0 = ${C0.n} px — ${C0.n > 0 ? 'OK' : 'VOID: lever did not bite'}`);
if (C0.n === 0) VOID.push('suspect removed 0 px');

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return null; } };
const PROV = manifest?.provenance ?? null;
const headNow = git('rev-parse', 'HEAD');
const dirtyNow = git('status', '--porcelain', 'src/') || '';
const provState = !PROV?.sha ? 'VOID: no provenance in manifest'
  : PROV.srcDirty ? 'VOID: src/ dirty at capture'
  : PROV.sha !== headNow ? `VOID: captured ${PROV.sha.slice(0, 8)} vs scored ${headNow?.slice(0, 8)}`
  : dirtyNow ? 'VOID: src/ dirty now'
  : `OK ${PROV.sha.slice(0, 8)}`;
console.log(`PROVENANCE ${provState}  (emitter ${PROV?.emitter}, patch ${JSON.stringify(PROV?.patch)})`);
if (!provState.startsWith('OK')) VOID.push('provenance');

/* ADDENDUM2 §1: per-capture tree stamps, whole-run fail-closed. One boot is not one tree
   (fxshape run 3); the stamps are what make the arms comparable at all. */
{
  const stamps = Object.entries(manifest?.arms ?? {}).filter(([, v]) => v?.tree).map(([k, v]) => [k, v.tree]);
  if (!stamps.length) { console.log('TREE      stamps MISSING — VOID'); VOID.push('tree stamps missing'); }
  else {
    const first = stamps[0][1];
    let bad = null;
    for (const [k, t] of stamps) {
      if (t.dirty) { bad = `${k} captured with dirty src/`; break; }
      if (t.sha !== first.sha || t.srcTree !== first.srcTree) { bad = `tree changed at arm '${k}'`; break; }
    }
    console.log(`TREE      ${stamps.length} stamps — ${bad ? `VOID: ${bad}` : `all identical (${first.sha?.slice(0, 8)}, src ${first.srcTree?.slice(0, 8)})`}`);
    if (bad) VOID.push('tree split');
  }
}

/* ADDENDUM2 §2: falsifier 1 gets its same-boot denominator. If the suspect is not one
   dominant emitter — under half of everything the impact draws — the PREREG's own withdrawal
   clause fires and nothing ships regardless of the gates. */
let FN = 0;
for (let i = 0; i < w * h; i++) if (diff(base, nocane, i) >= DTHR) FN++;

/* ── D4 box, derived from Shots.js at score time ─────────────────────────────────────────── */
const s = SHOTS.combat;
const camera = new THREE.PerspectiveCamera(s.fov, w / h, 0.1, 600);
camera.position.fromArray(s.pos);
camera.lookAt(new THREE.Vector3().fromArray(s.target));
if (s.roll) camera.rotateZ(THREE.MathUtils.degToRad(s.roll));
camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
const P = new THREE.Vector3().fromArray(s.player.pos);
let bx0 = w, bx1 = 0, by0 = h, by1 = 0;
for (const dy of [0, 1.8]) for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
  const v = new THREE.Vector3(P.x + dx, P.y + dy, P.z + dz).project(camera);
  const px = (v.x * 0.5 + 0.5) * w, py = (1 - (v.y * 0.5 + 0.5)) * h;
  bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
}
bx0 = Math.max(0, Math.round(bx0)); bx1 = Math.min(w - 1, Math.round(bx1));
by0 = Math.max(0, Math.round(by0)); by1 = Math.min(h - 1, Math.round(by1));
console.log(`D4 box    hero 1.8x1.0 m at (${s.player.pos.join(',')}) -> px (${bx0},${by0})-(${bx1},${by1})`);

function meanLiftInBox(withIm, withoutIm) {
  let sL = 0, n = 0;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const i = y * w + x;
    sL += lum(...at(withIm, i)) - lum(...at(withoutIm, i)); n++;
  }
  return n ? sL / n : 0;
}
const lift0 = meanLiftInBox(base, suspect);
const lift1 = meanLiftInBox(cand, candoff);

/* ── gates ───────────────────────────────────────────────────────────────────────────────── */
const F0 = C0.n, F1 = C1.n;
const gates = [
  ['D1 SHRINK', F0 > 0 && F1 <= 0.40 * F0, `F1 ${F1} <= 0.40*F0 ${(0.40 * F0).toFixed(0)}`],
  ['D3 NOT-DELETED', F0 > 0 && F1 >= 0.25 * F0, `F1 ${F1} >= 0.25*F0 ${(0.25 * F0).toFixed(0)}`],
  ['D2a CHROMA', C1.meanSat >= 0.35, `candSat ${C1.meanSat.toFixed(3)} >= 0.35`],
  ['D2b SAME-RUN', C1.meanSat >= 2.5 * C0.meanSat, `candSat ${C1.meanSat.toFixed(3)} >= 2.5*suspectSat ${(2.5 * C0.meanSat).toFixed(3)}`],
  ['D4 HERO', lift0 > 0 ? lift1 <= 0.40 * lift0 : null, `candLift ${lift1.toFixed(4)} <= 0.40*suspectLift ${(0.40 * lift0).toFixed(4)}`],
];
console.log('');
let allPass = true;
for (const [name, ok, detail] of gates) {
  const state = ok === null ? 'VOID (no denominator)' : ok ? 'PASS' : 'FAIL';
  if (ok !== true) allPass = false;
  if (ok === null) VOID.push(`${name} denominator`);
  console.log(`${name.padEnd(16)} ${state.padEnd(6)} ${detail}`);
}
console.log(`\nsuspect contribution: ${F0} px at meanSat ${C0.meanSat.toFixed(3)} · hero-box lift ${lift0.toFixed(4)}`);
console.log(`candidate contribution: ${F1} px at meanSat ${C1.meanSat.toFixed(3)} · hero-box lift ${lift1.toFixed(4)}`);

const dominant = FN > 0 && F0 >= 0.50 * FN;
console.log(`FALSIFIER-1  suspect F0 ${F0} vs nocane ${FN}: ${FN ? (100 * F0 / FN).toFixed(1) + '%' : 'n/a'} — ` +
  (FN === 0 ? 'VOID (nocane removed nothing)' : dominant ? 'one dominant emitter, claim stands'
    : 'UNDER 50%: the one-dominant-emitter claim is WITHDRAWN (PREREG §5.1) — nothing ships'));
if (FN === 0) VOID.push('nocane removed 0 px');
else if (!dominant) VOID.push('falsifier 1: suspect under half of nocane');

if (VOID.length) {
  console.log(`\nVERDICT: VOID (${VOID.join('; ')}) — nothing ships from this run, PASS or not.`);
} else if (allPass) {
  console.log('\nVERDICT: PASS — the candidate may ship, applied to src/fx/Emitters.js as the');
  console.log('         exact values this run installed in-page (manifest.provenance.patch).');
} else {
  console.log('\nVERDICT: FAIL — the candidate does not ship. Gates stay where they are (§141.1);');
  console.log('         a revised candidate is a new fxdraw invocation, not a re-score.');
}
