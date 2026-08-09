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

/** Build a four-arm synthetic shot where the crease ink has luminance `creaseVal`, and score it. */
function scoreWith(creaseVal) {
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
      return { shot: 'synth', arm, file, sha: createHash('sha256').update(buf).digest('hex').slice(0, 16), applied: { hulls: 7 } };
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
