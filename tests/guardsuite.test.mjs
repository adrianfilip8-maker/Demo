import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Runs `src/ai/Guard.test.mjs` and fails if it does.
 *
 * That file holds 45 behaviour tests over the shipped `Guards` module — route following, the
 * LOS raycast, the suspicion model, the alert machine, the pickpocket and combat API, the cone
 * instances, the `guard` canonical shot, determinism and a five-minute soak. **Nothing ran
 * them.** `npm test` is `node --test "tests/*.test.mjs"`, and that file is neither in `tests/`
 * nor written against `node:test`: it predates the suite and carries its own three-function
 * harness with its own `check()` and its own pass counter.
 *
 * The cost of that was exactly what you would expect. When the patrol routes were re-authored
 * against the real level, two of its expectations went stale — a hardcoded `stops.length === 7`
 * and a stub floor plan with no terrace in it — and nothing noticed, because nothing was
 * looking. A test suite that has to be remembered is a suite that eventually is not.
 *
 * Rewriting 813 lines into `node:test` would risk losing coverage for no behavioural gain, and
 * the harness is not the problem — being unreachable was. So this shells out to it. It costs
 * ~4 s, it needs no change to `package.json`, and the day that file goes red `npm test` goes
 * red with it.
 *
 * The assertion deliberately checks the reported pass count as well as the exit status: the
 * child prints `N passed, M failed` and exits non-zero on failure, but a suite that crashed
 * before running anything could conceivably exit 0, and "0 passed" must never read as success
 * (§211.1 — a passing test has to prove it looked).
 *
 * **Both arms were calibrated against synthetic children before this was trusted**, because a
 * wrapper that cannot fail is worse than no wrapper — it certifies 45 tests it never read:
 *
 *   - a child printing `3 passed, 1 failed` and exiting 1  → wrapper fails. Correct.
 *   - a child printing `0 passed, 0 failed` and exiting 0   → wrapper fails. Correct.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, '..', 'src', 'ai', 'Guard.test.mjs');

test('src/ai/Guard.test.mjs passes (it is not in the npm test glob on its own)', () => {
  let out = '';
  let failed = null;
  try {
    out = execFileSync(process.execPath, [TARGET], {
      encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    failed = err;
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }

  const m = /(\d+) passed, (\d+) failed/.exec(out);
  assert.ok(m, `could not find a result line in the child's output:\n${out.slice(-2000)}`);
  const passed = Number(m[1]);
  const failures = Number(m[2]);
  console.log(`[guardsuite] src/ai/Guard.test.mjs: ${passed} passed, ${failures} failed`);

  assert.ok(passed > 0, 'the guard suite reported zero passing tests — it inspected nothing');
  assert.equal(failures, 0,
    `${failures} guard behaviour tests failed:\n`
    + out.split('\n').filter((l) => l.includes('✗')).join('\n'));
  assert.equal(failed, null, `the guard suite exited non-zero: ${failed?.message}`);
});
