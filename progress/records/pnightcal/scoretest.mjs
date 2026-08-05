/**
 * Selftest for pncscore.mjs — run BEFORE the capture lands, on constructed inputs whose
 * verdicts are known by construction (§143.1: a guard can bless the broken thing; §160.3:
 * the null and known-bad arms are what license reading the table).
 *
 * Construction, from the O2 synthetic rotations of the durable pnight1 base frame:
 *   base    = rot0   (bit-identical re-encode)
 *   sbm020  = rot2   (+2 deg global)   -> G2 expects |dHue| ~1.84 >= 0.50
 *   sbm040  = rot5   (+5 deg global)   -> G3 expects 5.21 > 1.84
 *   compose = rot1   (+1 deg global)   -> L1 expects ~0.96 <= 1.40 PASS
 *   base2   = rot0   (same bytes)      -> V1 expects 0 differing px
 *
 * PREDICTED, before running: V1 PASS, V2/V3/V4 PASS (stub run JSON with matching hashes and
 * empty mismatch lists), G1..G3 PASS, L1 PASS, L3 PASS, and — the half that makes this a
 * test rather than a formality — **L2 must FAIL** (sky moves ~1.0 deg > 0.30), because a
 * global rotation is exactly the failure class the sky control exists to catch. Expected
 * provisional verdict: FAIL. A scorer that passes L2 here is broken.
 *
 * Uses PNC_DIR so the REAL pncscore.mjs runs unmodified.
 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SYN = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnightcal-synth';
const TD = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/pnc-scoretest';
mkdirSync(`${TD}/frames`, { recursive: true });

const map = { base: 'rot0', sbm020: 'rot2', sbm040: 'rot5', compose: 'rot1', base2: 'rot0' };
for (const [arm, rot] of Object.entries(map)) copyFileSync(`${SYN}/night-${rot}.png`, `${TD}/frames/night-${arm}.png`);

/* ROI: the durable pnight1 stride-4 ROI, with a srcTree stamp matching the stub run. */
const roi = JSON.parse(readFileSync('/home/user/Demo/progress/records/pnight1/roi-night.json', 'utf8'));
roi.srcTree = 'selftest0000';
writeFileSync(`${TD}/roi-night-cal.json`, JSON.stringify(roi));

const rows = Object.keys(map).map((arm) => ({ kind: 'night', shot: 'night', arm, mismatch: [] }));
writeFileSync(`${TD}/pnightcal.json`, JSON.stringify({
  prov: { prereg: 'selftest', sha: 'selftest', srcTreeBefore: 'selftest0000', srcTreeAfter: 'selftest0000' },
  ship: {}, rows,
}, null, 1));

console.log('scoretest — constructed inputs, predicted: V1..V4 PASS, G1..G3 PASS, L1 PASS, L2 FAIL, verdict FAIL\n');
try {
  console.log(execSync('node /home/user/Demo/progress/records/pnightcal/pncscore.mjs', {
    encoding: 'utf8', env: { ...process.env, PNC_DIR: TD },
  }));
  console.log('scoretest: scorer exited 0 — UNEXPECTED (predicted verdict FAIL exits 0? check verdict line above)');
} catch (e) {
  console.log(e.stdout || '');
  console.log('scoretest: scorer exited nonzero or verdict FAIL — check the lines above against the predictions.');
}
