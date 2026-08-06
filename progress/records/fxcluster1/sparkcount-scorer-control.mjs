#!/usr/bin/env node
/* sparkcount-scorer-control — exercises sparkcount-score.mjs against SYNTHETIC dumps whose answer
 * is known by construction.
 *
 * THIS MEASURES THE SCORER, NOT THE GAME. No fixture here is evidence about Sands of Ra; every
 * number is one I chose so that the correct output is known in advance. Its only purpose is to
 * establish, BEFORE the probe lands, that the ported predicate actually discriminates — i.e. that
 * SPARKCOUNT is not itself "a guard that cannot fail" (KNOWN_ISSUES §177/§184).
 *
 * Each clause of the registered predicate gets a fixture that it alone can reject, plus F3, which
 * must make KB1 FAIL — because a control that cannot fail proves nothing when it passes.
 *
 * usage: node sparkcount-scorer-control.mjs
 */
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TMP = mkdtempSync(path.join(tmpdir(), 'sparkctl-'));
const CAM = { pos: [0, 0, 0], fwd: [0, 0, -1], fov: 50, aspect: 1280 / 720 };

/* pop = smoothstep(0, 0.22, dt).  dt 0.033 -> 0.0608 (the b2 clock re-base);  dt 0.11 -> exactly
 * 0.5 (the half-open POP_MIN boundary);  dt >= 0.22 -> 1. */
const IN = [0, 0, -10];        // projects to frame centre (640,360)
const BEHIND = [0, 0, 10];     // z <= 0.01 -> project() returns null
const OFFSCREEN = [500, 0, -1];// far outside [0,1280)

const mk = (arm, n, { dt, pos = () => IN, scale = () => 1 }) => ({
  arm, dump: {
    rawCount: n, instanceCount: n, meshVisible: true, uTimeFx: dt, fxT0: 0, engineTime: dt,
    aPos: Array.from({ length: n }, (_, i) => pos(i)),
    aData: Array.from({ length: n }, (_, i) => [0.5, scale(i), 0, 0]),  // born = 0 => dt = uTimeFx
    camera: CAM, prerollFlag: null,
  },
});

const FIX = [
  { id: 'F1', why: 'KB1 shape — the b2 defect exactly: 17 markers latched, in frustum, scale>0, but pop 0.061 (dt 0.033)',
    arms: [mk('traversal-prerollOFF', 17, { dt: 0.033 })],
    expect: { arm: 'traversal-prerollOFF', rawCount: 17, popOpen: 0, inFrustum: 17, SPARKCOUNT: 0, pass: true } },

  { id: 'F2', why: 'KB2 shape — 14 markers fully popped (dt 1.0) and on-screen',
    arms: [mk('traversal-prerollON', 14, { dt: 1.0 })],
    expect: { arm: 'traversal-prerollON', rawCount: 14, popOpen: 14, inFrustum: 14, SPARKCOUNT: 14, pass: true } },

  { id: 'F3', why: 'GATE-DEAD DETECTOR — KB1 arm with the pop gate satisfied (dt 1.0). KB1 MUST FAIL here; if it passes, SPARKCOUNT is a guard that cannot fail and the instrument is void',
    arms: [mk('traversal-prerollOFF', 17, { dt: 1.0 })],
    expect: { arm: 'traversal-prerollOFF', rawCount: 17, popOpen: 17, inFrustum: 17, SPARKCOUNT: 17, pass: false } },

  { id: 'F4', why: 'frustum clause alone — 10 popped, scale>0; 3 on-screen, 3 behind camera, 4 off-screen',
    arms: [mk('night', 10, { dt: 1.0, pos: (i) => (i < 3 ? IN : i < 6 ? BEHIND : OFFSCREEN) })],
    expect: { arm: 'night', rawCount: 10, popOpen: 10, inFrustum: 3, SPARKCOUNT: 3, pass: false } },

  { id: 'F5', why: 'scale clause alone — 10 popped and on-screen, 6 with scale 0',
    arms: [mk('night', 10, { dt: 1.0, scale: (i) => (i < 4 ? 1 : 0) })],
    expect: { arm: 'night', rawCount: 10, popOpen: 10, inFrustum: 10, SPARKCOUNT: 4, pass: false } },

  { id: 'F6', why: 'POP_MIN half-open boundary — dt 0.11 gives pop EXACTLY 0.5, which the seal admits (>=)',
    arms: [mk('traversal-prerollON', 12, { dt: 0.11 })],
    expect: { arm: 'traversal-prerollON', rawCount: 12, popOpen: 12, inFrustum: 12, SPARKCOUNT: 12, pass: true } },

  { id: 'F7', why: 'KB3 must reject the re-acquired sky population — 62 markers all visible is NOT in 16 +/- 4',
    arms: [mk('night', 62, { dt: 1.0 })],
    expect: { arm: 'night', rawCount: 62, popOpen: 62, inFrustum: 62, SPARKCOUNT: 62, pass: false } },

  { id: 'F8', why: 'P-S5 shape — arms present, dump fatal. Must report P-S5 FATAL, distinct from NO DATA',
    arms: [{ arm: 'traversal-prerollOFF', dump: { fatal: 'fx.sparkles absent' } }],
    expectState: 'P-S5 FATAL (arms present, no readable dump)' },
];

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
say('sparkcount-scorer-control — SYNTHETIC fixtures, measures the SCORER not the game');
say(`scorer: sparkcount-score.mjs   POP_MIN 0.5 (registered, untouched)\n`);

let allOk = true;
for (const f of FIX) {
  const rbP = path.join(TMP, `${f.id}-rb.json`), scP = path.join(TMP, `${f.id}-sc.json`);
  writeFileSync(rbP, JSON.stringify({ prereg: 'SYNTHETIC-FIXTURE', startedAt: 'n/a', arms: f.arms }, null, 1));
  execFileSync('node', [path.join(HERE, 'sparkcount-score.mjs'), rbP, scP], { encoding: 'utf8' });
  const got = JSON.parse(readFileSync(scP, 'utf8'));

  let ok = true, detail;
  if (f.expectState) {
    ok = got.state === f.expectState;
    detail = `state ${JSON.stringify(got.state)}`;
  } else {
    const e = f.expect, a = got.arms[e.arm] ?? {};
    const fields = ['rawCount', 'popOpen', 'inFrustum', 'SPARKCOUNT', 'pass'];
    const bad = fields.filter((k) => a[k] !== e[k]);
    ok = bad.length === 0;
    detail = `raw ${a.rawCount} popOpen ${a.popOpen} inFrust ${a.inFrustum} SPARKCOUNT ${a.SPARKCOUNT} gate ${a.pass ? 'PASS' : 'FAIL'}`
      + (bad.length ? `   MISMATCH on ${bad.map((k) => `${k}: got ${a[k]} want ${e[k]}`).join(', ')}` : '');
  }
  allOk &&= ok;
  say(` ${ok ? 'OK  ' : 'BAD '} ${f.id}  ${detail}`);
  say(`        ${f.why}`);
}

say('');
say(allOk
  ? 'ALL FIXTURES AS CONSTRUCTED — the ported predicate discriminates on all three clauses,'
  : 'FIXTURE MISMATCH — the scorer does not compute the registered predicate. Do not use it.');
if (allOk) {
  say('F3 is the load-bearing one: KB1 FAILS when the pop gate is satisfied, so a KB1 pass on real');
  say('data is informative rather than automatic. F1 reproduces the b2 defect (raw 17 -> SPARKCOUNT 0).');
  say('');
  say('This licenses NOTHING about the game. It says only that when the probe lands, the arithmetic');
  say('applied to it will be the seal\'s. KB1-KB4 remain un-run; skyCut remains primary.');
}
writeFileSync(path.join(HERE, 'sparkcount-scorer-control.txt'), lines.join('\n') + '\n');
console.log('\nwrote sparkcount-scorer-control.txt');
process.exit(allOk ? 0 : 1);
