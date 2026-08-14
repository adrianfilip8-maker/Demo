/**
 * canegold3 — the seal's own §141.1 enforcement, mechanised.
 *
 * §141.1 is the rule that has cost this project the most runs: **no post-hoc threshold moves.**
 * It has always been enforced by discipline, i.e. by a person remembering that the number in the
 * scorer is the number in the seal. Every other seal in the ledger relies on a reader noticing.
 *
 * This file makes it a test. `tools/canegold3.mjs`'s `BAR` block is the operative copy of
 * `progress/records/PREREG-canegold3.md` §4, and the two are asserted to agree — parsed out of
 * the sealed markdown, not re-typed here, so this file cannot become a third place where a
 * threshold lives and silently disagrees with both.
 *
 * If a candidate frame exists and someone edits either the seal or the scorer, the suite goes
 * red before the push, instead of a reviewer discovering it in a post-mortem.
 *
 * It also pins the two structural properties the seal argues from, both of which are claims about
 * the RUNNER rather than about any capture: that the run installs nothing into `src/**` (so §186's
 * install-then-launch hazard cannot arise) and that every registered pixel-identity bar is
 * same-boot (§302 — a cross-boot [0,0] bar is unachievable on this renderer).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER = readFileSync(path.join(ROOT, 'tools/canegold3.mjs'), 'utf8');
const SEAL = readFileSync(path.join(ROOT, 'progress/records/PREREG-canegold3.md'), 'utf8');

/** The scorer's operative constants, read out of the source rather than imported: importing
 *  `canegold3.mjs` runs it (it is a runner, not a library), which would boot a game. */
function bars() {
  const m = RUNNER.match(/const BAR = \{([\s\S]*?)\n\};/);
  assert.ok(m, 'expected a single `const BAR = { ... };` block in tools/canegold3.mjs');
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)) out[k] = Number(v);
  return out;
}

test('the scorer carries exactly the bars PREREG-canegold3 §4 sealed', () => {
  const B = bars();
  /* Each expectation is quoted from the seal's §4 table by searching for the sentence that
     fixes it, so a seal edit that moves a number fails here even if the scorer was edited to
     match — which is the direction §141.1 actually cares about. */
  const seal = (re, what) => {
    const m = SEAL.match(re);
    assert.ok(m, `PREREG-canegold3.md no longer states ${what} in the form this test reads it`);
    return Number(m[1]);
  };
  assert.equal(B.pingL, seal(/count\( L >= (\d+) \) >= 200 px/, 'the ping threshold'));
  assert.equal(B.pingPx, seal(/count\( L >= 248 \) >= (\d+) px/, 'the ping population'));
  assert.equal(B.sep, seal(/p999\(M\) - p50\(M\) >= (\d+) L/, 'the separation bar'));
  assert.equal(B.satMin, seal(/sat p50\(M\) >= ([\d.]+)/, 'the saturation bar'));
  assert.equal(B.hueLo, seal(/hue p50\(M\) in \[(\d+),55\] deg/, 'the hue hold, low edge'));
  assert.equal(B.hueHi, seal(/hue p50\(M\) in \[30,(\d+)\] deg/, 'the hue hold, high edge'));
  assert.equal(B.lMin, seal(/L p50\(M\) in \[(\d+), 200\]/, 'the value band, floor'));
  assert.equal(B.lMax, seal(/L p50\(M\) in \[140, (\d+)\]/, 'the value band, ceiling'));
  assert.equal(B.haloMin, seal(/`halo >= (\d+) px`/, 'the halo floor'));
  assert.equal(B.haloNearFrac, seal(/haloNearPing \/ halo >= ([\d.]+)/, 'the halo concentration'));
  assert.equal(B.nearPx, seal(/within \*\*(\d+) px Chebyshev\*\*/, 'the ping neighbourhood'));
  /* §282's one inherited constant, and the band it sits in. */
  assert.equal(B.maskHi, seal(/`\[30 000, (\d+) 000\]` px on `sly-closeup`/, 'the mask ceiling') * 1000);
  assert.equal(B.maskLo, 30000);
});

test('§186: the runner installs nothing into src/** — the hazard is structural, not remembered', () => {
  /* The whole §186 incident class is "the candidate sat on disk while the runner waited in the
     FIFO". A runner with no `onLocked` and no write outside its own record directory cannot do
     that, and this asserts it rather than trusting the header that says so. */
  /* `onLocked` is the harness seam that EXISTS for installing a source arm (§186/§194), so its
     presence is not the test — what it does is. Here it must be a pure read: the §296 tree stamp
     and nothing else. A write inside it would be exactly the install this run must not perform. */
  const hook = RUNNER.match(/onLocked: \(\) => \{([^\n]*)\}/);
  assert.ok(hook, 'expected canegold3 to stamp the tree inside the held lock (§192.1/§296)');
  assert.ok(!/write|rename|unlink|cp |mv /.test(hook[1]),
    `canegold3's onLocked must not touch the tree — it is a poke-only run: ${hook[1]}`);
  const writes = [...RUNNER.matchAll(/writeFileSync\(\s*([^\n]*?)\s*,/g)].map((m) => m[1].trim());
  assert.ok(writes.length > 0, 'expected the runner to write its record');
  for (const w of writes) {
    assert.ok(w.startsWith('path.join(OUT'), `writeFileSync target outside OUT: ${w}`);
  }
  assert.match(RUNNER, /const OUT = path\.join\(ROOT, 'progress\/records\/canegold3'\)/);
});

test('§302: every registered pixel-identity bar is same-boot', () => {
  /* P1 is the only [0,0] bar and it is scored against `base` — a frame from the same boot,
     captured seconds earlier in the same page. There is no path in this runner that compares a
     frame to anything loaded from disk. */
  assert.match(RUNNER, /P1_back.*__diff\('base', `back_\$\{a\}`\)/s);
  assert.ok(!/readFileSync\([^)]*\.png/.test(RUNNER), 'no frame is read back off disk for a pixel bar');
  assert.match(SEAL, /no cross-boot \[0,0\] is registered anywhere in this seal/);
});

test('§294(2): the runner pokes material values only, and never geometry', () => {
  const poke = RUNNER.match(/W\.__poke = \(name, v\) => \{([\s\S]*?)\n      \};/);
  assert.ok(poke, 'expected the __poke helper');
  const fields = [...poke[1].matchAll(/v\.(\w+) != null/g)].map((m) => m[1]).sort();
  assert.deepEqual(fields, ['color', 'gloss', 'metal', 'rough', 'spec', 'sss'],
    'the poke surface is the material response and the albedo multiplier — nothing else. '
    + 'A field that reaches position, scale, the socket or the asset bytes would breach the '
    + 'owner instruction in KNOWN_ISSUES §294(2).');
  assert.match(RUNNER, /P7_geometry/);
});

test('the candidate values are quoted from shipped sites, not chosen', () => {
  /* Each of these appears in the tree already; the seal names where. If one of those sites moves,
     this goes red and the seal's provenance argument has to be restated rather than quietly
     becoming false. */
  const props = readFileSync(path.join(ROOT, 'src/world/Props.js'), 'utf8');
  assert.match(props, /gold:\s*\{[^}]*color: 0xe8b942[^}]*spec: 0\.9[^}]*gloss: 96/,
    'Props.js MATERIALS.gold no longer carries the colour/spec/gloss this seal quotes');
  const rig = readFileSync(path.join(ROOT, 'src/player/SlyModelDLRig.js'), 'utf8');
  assert.match(rig, /color: 0xe8b942, vertexColors: true/,
    'the cane material no longer carries 0xe8b942 as its own no-asset fallback colour');
  assert.match(RUNNER, /const GOLD_HEX = 0xe8b942;/);
});
