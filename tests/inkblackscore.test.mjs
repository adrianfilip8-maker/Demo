import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * §13: a metric never shown to move on a state known to have the defect is not a metric. The
 * §270 ink scorer decides whether the hull or the crease owns the ink black point, so both of its
 * answers get a synthetic frame with a known correct verdict — and, critically, a frame that must
 * make its primary FAIL. A gate that cannot fail is not a gate, and this repo has already shipped
 * a scorer that printed SHIP on a defect it had itself detected (§263.1).
 *
 * Synthetic rather than real captures on purpose: a unit test must not depend on a two-hour
 * capture existing, and scoring a subset of a registered ten-frame run is how a scope gets
 * quietly reduced.
 */

const W = 200, H = 100;
const BG = 120, HULL = 20;

function png(fn) {
  const p = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, v = fn(x, y);
      p.data[i] = v; p.data[i + 1] = v; p.data[i + 2] = v; p.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(p);
}

const TREE = { src: 'deadbeefcafe0001', head: 'abc123abc123', at: '2026-08-09T00:00:00Z' };

/** Build a four-arm synthetic shot where the crease ink has luminance `creaseVal`, and score it.
 *  `trees` optionally overrides the per-arm provenance stamp, for the G-TREE calibration. */
function scoreWith(creaseVal, trees = null) {
  const dir = mkdtempSync(join(tmpdir(), 'inkblackscore-'));
  try {
    const inHull = (x) => x >= 40 && x < 44;
    const inCrease = (x) => x >= 100 && x < 104;
    const bufs = {
      'A-ship': png((x) => (inHull(x) ? HULL : inCrease(x) ? creaseVal : BG)),
      'B-nocrease': png((x) => (inHull(x) ? HULL : BG)),
      'C-noink': png(() => BG),
    };
    bufs['C0-visible'] = bufs['B-nocrease'];   // PRED-1: the broken lever changes nothing
    const arms = Object.entries(bufs).map(([arm, buf]) => {
      const file = join(dir, `synth-${arm}.png`);
      writeFileSync(file, buf);
      return {
        shot: 'synth', arm, file,
        sha: createHash('sha256').update(buf).digest('hex').slice(0, 16),
        applied: { hulls: 7 },
        tree: trees ? trees[arm] : TREE,
      };
    });
    writeFileSync(join(dir, 'arms.json'), JSON.stringify(arms));
    return execFileSync('node', ['tools/inkblackscore.mjs'],
      { env: { ...process.env, SANDS_OUT: dir }, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('inkblackscore: every calibration passes on a well-formed synthetic shot', () => {
  const out = scoreWith(90);
  for (const g of ['CAL-1 crease lever live', 'CAL-2 hull lever live', 'CAL-3 mask is ink',
    'CAL-4 lever sensitivity']) {
    assert.match(out, new RegExp(`PASS\\s+${g.replace(/[-]/g, '[-]')}`), `${g} should PASS`);
  }
});

test('inkblackscore: P1 passes when the hull supplies the darkest decile of the union mask', () => {
  /* Crease at 90 is lighter than the hull at 20, so the union mask's darkest decile is hull-owned
     and dec(hull, B) must equal dec(ink, A). */
  const out = scoreWith(90);
  assert.match(out, /PASS\s+P1 hull dominates/);
  assert.match(out, /OUTCOME: P1 MET/);
});

test('inkblackscore: CALIBRATION — a crease DARKER than the hull must refute P1', () => {
  /* This is the arm that proves the gate can fail. Crease at 5 is darker than the hull at 20, so
     the union mask's darkest decile is crease-owned and F1 must fire. */
  const out = scoreWith(5);
  assert.match(out, /FAIL\s+P1 hull dominates/);
  assert.match(out, /OUTCOME: FAIL/);
  assert.doesNotMatch(out, /OUTCOME: P1 MET/);
});

test('inkblackscore: G-TREE — arms rendered from DIFFERENT source trees void the run', () => {
  /* The hazard the lead voided another lane for: two arms of one comparison captured from trees
     that had moved underneath them. Here arm C claims a different src content hash, and the run
     must VOID rather than score -- a comparison across tree states is not a comparison. */
  const out = scoreWith(90, {
    'A-ship': TREE, 'B-nocrease': TREE, 'C0-visible': TREE,
    'C-noink': { src: 'deadbeefcafe0002', head: 'def456def456', at: '2026-08-09T01:00:00Z' },
  });
  assert.match(out, /FAIL\s+G-TREE/);
  assert.match(out, /OUTCOME: VOID/);
  assert.doesNotMatch(out, /==> SHIP/);
});

test('inkblackscore: G-TREE — UNRECORDED provenance is VOID, not PASS', () => {
  /* A resumed shot from a run that predates provenance recording has tree: null. An unverifiable
     guard did not produce a verdict, and VOID is not PASS (tools/gate.mjs). */
  const nul = { 'A-ship': null, 'B-nocrease': null, 'C0-visible': null, 'C-noink': null };
  const out = scoreWith(90, nul);
  assert.match(out, /VOID\s+G-TREE/);
  assert.match(out, /OUTCOME: VOID/);
});

test('inkblackscore: G-TREE-ACROSS — two SHOTS from different trees void the run', () => {
  /* The lead's instance: the hero lane moved the staged player in `hero` and `courtyard` while a
     ten-shot run was in flight. Each shot's four arms are still internally consistent, so G-TREE
     passes -- and the run must STILL void, because P1 takes a worst case and a worst case over
     several builds is not a statement about the registered ten frames. This is the arm that
     distinguishes "reported" from "gated"; without it the upgrade is untested prose. */
  const dir = mkdtempSync(join(tmpdir(), 'inkblackscore-'));
  try {
    const inHull = (x) => x >= 40 && x < 44;
    const inCrease = (x) => x >= 100 && x < 104;
    const bufs = {
      'A-ship': png((x) => (inHull(x) ? HULL : inCrease(x) ? 90 : BG)),
      'B-nocrease': png((x) => (inHull(x) ? HULL : BG)),
      'C-noink': png(() => BG),
    };
    bufs['C0-visible'] = bufs['B-nocrease'];
    const rows = [];
    for (const [shot, tree] of [['alpha', TREE], ['beta', { ...TREE, src: 'deadbeefcafe0009' }]]) {
      for (const [arm, buf] of Object.entries(bufs)) {
        const file = join(dir, `${shot}-${arm}.png`);
        writeFileSync(file, buf);
        rows.push({
          shot, arm, file,
          sha: createHash('sha256').update(buf).digest('hex').slice(0, 16),
          applied: { hulls: 7 }, tree,
        });
      }
    }
    writeFileSync(join(dir, 'arms.json'), JSON.stringify(rows));
    const out = execFileSync('node', ['tools/inkblackscore.mjs'],
      { env: { ...process.env, SANDS_OUT: dir }, encoding: 'utf8' });
    assert.match(out, /PASS\s+G-TREE arms of a shot share one tree/,
      'within-shot uniformity still holds and must still PASS');
    assert.match(out, /FAIL\s+G-TREE-ACROSS/);
    assert.match(out, /OUTCOME: VOID/);
    assert.doesNotMatch(out, /==> SHIP/);
    assert.match(out, /re-shoot:/, 'the scorer must name the remedy, not just refuse');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inkblackscore: VOID is not PASS — a missing arm cannot ship', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inkblackscore-'));
  try {
    const buf = png(() => BG);
    const file = join(dir, 'synth-A-ship.png');
    writeFileSync(file, buf);
    writeFileSync(join(dir, 'arms.json'), JSON.stringify([
      { shot: 'synth', arm: 'A-ship', file, sha: 'x', applied: {} },
    ]));
    const out = execFileSync('node', ['tools/inkblackscore.mjs'],
      { env: { ...process.env, SANDS_OUT: dir }, encoding: 'utf8' });
    assert.match(out, /OUTCOME: VOID/);
    assert.doesNotMatch(out, /==> SHIP/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
