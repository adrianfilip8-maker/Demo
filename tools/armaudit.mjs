/**
 * armaudit.mjs — which arms in a test file cannot fail, and which assert nothing new?
 *
 * Today produced five independent instances of one defect class, found by four lanes, every one of
 * them **by accident in the course of other work**: a bar no camera could pass (§407), a bar no
 * frame could fail because a neighbour entailed it (§408.3), a predicate that could not say "no" on
 * one of its paths (§409), a symmetry probe whose sampling was commensurate with what it sampled
 * (§414), and this file's own sibling `sweepcensus` printing a total as a breakdown (§412.2).
 *
 * Knowing the class does not prevent writing one. So this is the systematic version.
 *
 * ── The two questions, and what counts as evidence for each ──────────────────────────────────
 *
 * **1. Can this assertion fail?** Two modes, and they need different instruments:
 *
 *   · NEVER RUNS — decidable, and this tool decides it. Every `assert.*` site the source contains
 *     is compared against every site a real run observed (`tools/_armhook.mjs`). The difference is
 *     a list of assertions that have never been evaluated, however confidently they are worded.
 *   · ALWAYS TRUE — undecidable in general, so it is attacked by INVERSION: rewrite one assertion
 *     to its negation, run only its own arm, and see whether the arm goes red. An assertion whose
 *     inversion leaves the arm green is one whose truth value does not affect the outcome. This
 *     costs one process per assertion, so it is opt-in (`--invert`) and takes a subset.
 *
 * **2. Is it entailed by another arm?** Reported as CANDIDATES, never as a verdict. Entailment is
 * a claim about all reachable inputs and this tool sees one run, so it flags the shapes worth a
 * human look — two sites in one arm asserting the same measured quantity where one threshold
 * strictly dominates the other — and says so rather than pretending to have proved anything.
 *
 * ── The rule this exists to enforce ──────────────────────────────────────────────────────────
 * Same as §412.1's, in a different costume: **an audit that enumerates by reading the code misses
 * exactly the assertions the reader's model of the code does not reach.** So it enumerates by
 * running.
 *
 *   node tools/armaudit.mjs [tests/traversal.test.mjs] [--invert N] [--only <substring>]
 */
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const FILE = argv.find((a) => !a.startsWith('--')) || 'tests/traversal.test.mjs';
const numAfter = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? Number(argv[i + 1]) : dflt;
};
const strAfter = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const INVERT = argv.includes('--invert') ? numAfter('--invert', 12) : 0;
const ONLY = strAfter('--only');
const ABS = path.join(ROOT, FILE);
const src = readFileSync(ABS, 'utf8');
const lines = src.split('\n');

/* ---- 1. static inventory: every assert site, and the arm that lexically owns it ------------ */
const arms = [];                       // { name, start, end }
for (let i = 0; i < lines.length; i++) {
  const m = /^test\(\s*(['"`])((?:[^\\]|\\.)*?)\1\s*,/.exec(lines[i]);
  /* Un-escape the JS string literal. The SOURCE spells an apostrophe `\'`; the runtime test name
     has no backslash, so passing the raw text to `--test-name-pattern` matched nothing, the arm
     never ran, and its assertions came back "unreached". Two of them did, and they were an
     instrument artefact reported as a property of the suite — which is the failure this whole tool
     is about, so it is fixed rather than filtered. */
  if (m) arms.push({ name: m[2].replace(/\\(['"`\\])/g, '$1'), start: i + 1, end: lines.length });
}
for (let k = 0; k < arms.length - 1; k++) arms[k].end = arms[k + 1].start - 1;
const armAt = (ln) => arms.find((a) => ln >= a.start && ln <= a.end)?.name || '(top level)';

const staticSites = [];                // { line, method, arm, text }
for (let i = 0; i < lines.length; i++) {
  const m = /assert\.(ok|equal|notEqual|deepEqual|notDeepEqual|strictEqual|match|fail|throws)\s*\(/.exec(lines[i]);
  if (!m) continue;
  if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;      // a mention in prose, not a call
  staticSites.push({ line: i + 1, method: m[1], arm: armAt(i + 1), text: lines[i].trim() });
}

/* ---- 2. runtime evidence -------------------------------------------------------------------- */
const REUSE = strAfter('--reuse');
const OUT = REUSE || path.join(tmpdir(), `armhook-${process.pid}.json`);
console.log(`[armaudit] ${FILE}: ${arms.length} arms, ${staticSites.length} assert sites`);
if (REUSE && existsSync(REUSE)) {
  console.log(`[armaudit] reusing hook output ${REUSE} (analysis only, suite not re-run)`);
} else {
  console.log('[armaudit] running the suite under the hook (this is the slow part)...');
  const t0 = Date.now();
  const run = spawnSync(process.execPath,
    ['--import', './tools/_armhook.mjs', '--test', FILE],
    { cwd: ROOT, env: { ...process.env, ARM_HOOK_OUT: OUT }, encoding: 'utf8', maxBuffer: 1 << 28 });
  const suiteOk = /^# fail 0$/m.test(run.stdout || '');
  console.log(`[armaudit] run finished in ${((Date.now() - t0) / 1000).toFixed(0)} s, suite ${suiteOk ? 'GREEN' : 'RED'}`);
}
if (!existsSync(OUT)) {
  console.error('[armaudit] the hook produced no output — the preload did not reach the test file.');
  process.exit(2);
}
const observed = JSON.parse(readFileSync(OUT, 'utf8'));
if (!REUSE) rmSync(OUT, { force: true });

const hit = new Map();                 // line -> record
for (const [site, rec] of Object.entries(observed)) {
  if (!site.endsWith('.mjs') && !/:\d+$/.test(site)) continue;
  const m = /:(\d+)$/.exec(site);
  if (!m) continue;
  if (!site.includes(path.basename(FILE))) continue;
  hit.set(Number(m[1]), rec);
}

/* The hook is only sound if it saw roughly what the file contains. A hook that silently missed
   every site would report "nothing ever runs", which is a spectacular false positive. */
const live = staticSites.filter((s) => hit.has(s.line));
console.log(`[armaudit] hook observed ${hit.size} distinct sites; ${live.length}/${staticSites.length} static sites matched\n`);
if (live.length === 0) {
  console.error('[armaudit] ZERO static sites matched the runtime record. The line attribution is');
  console.error('           broken — refusing to report "nothing runs", which is what a broken');
  console.error('           instrument and a dead suite look like from here.');
  process.exit(2);
}

/* ---- 3. NEVER RUNS ------------------------------------------------------------------------- */
const dead = staticSites.filter((s) => !hit.has(s.line));
console.log(`=== A. ASSERTIONS THAT NEVER EXECUTED: ${dead.length} of ${staticSites.length} ===`);
const deadByArm = new Map();
for (const d of dead) {
  if (!deadByArm.has(d.arm)) deadByArm.set(d.arm, []);
  deadByArm.get(d.arm).push(d);
}
for (const [arm, ds] of [...deadByArm.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${arm}   (${ds.length} never ran)`);
  for (const d of ds) console.log(`    ${FILE}:${d.line}  ${d.text.slice(0, 108)}`);
}

/* ---- 4. arms with no live assertion at all -------------------------------------------------- */
const armLive = new Map(arms.map((a) => [a.name, 0]));
for (const s of live) armLive.set(s.arm, (armLive.get(s.arm) || 0) + 1);
const silent = [...armLive.entries()].filter(([, n]) => n === 0);
console.log(`\n=== B. ARMS WITH ZERO EXECUTED ASSERTIONS: ${silent.length} ===`);
for (const [name] of silent) console.log(`    ${name}`);

/* ---- 5. entailment CANDIDATES, flagged not proved ------------------------------------------- */
/* Only SAME-DIRECTION pairs can entail. Two bounds in opposite directions are a bracket — `left > 0`
   with `left < 2.5 * expect` is two different claims and good practice, and an earlier version of
   this detector reported nine of them as suspects. A detector whose hits are mostly legitimate is
   the same defect as a bar that cannot fail, one level up: it costs attention instead of coverage,
   and it trains its reader to skim. */
const DIR = { '>': 'lower', '>=': 'lower', '<': 'upper', '<=': 'upper' };
console.log('\n=== C. ENTAILMENT CANDIDATES — same quantity, SAME direction (suspects, not verdicts) ===');
let cand = 0;
for (const a of arms) {
  const mine = live.filter((s) => s.arm === a.name);
  const byExpr = new Map();
  for (const s of mine) {
    const q = /assert\.ok\(\s*([A-Za-z_$][\w$.[\]()'"]*)\s*(>=|>|<=|<)/.exec(s.text);
    if (!q) continue;
    const key = `${q[1]} ${DIR[q[2]]}`;
    if (!byExpr.has(key)) byExpr.set(key, []);
    byExpr.get(key).push({ ...s, op: q[2] });
  }
  for (const [key, group] of byExpr) {
    if (group.length < 2) continue;
    cand++;
    const [expr, dir] = key.split(' ');
    console.log(`\n  ${a.name}`);
    console.log(`    "${expr}" bounded from ${dir === 'lower' ? 'BELOW' : 'ABOVE'} ${group.length}x — the weaker one asserts nothing new:`);
    for (const g of group) console.log(`      :${g.line}  ${g.text.slice(0, 100)}`);
  }
}
if (!cand) console.log('    none of this shape found.');

/* ---- 6. INVERSION: does flipping the assertion turn its arm red? ---------------------------- */
if (INVERT > 0) {
  let pool = live.slice();
  if (ONLY) pool = pool.filter((s) => s.arm.includes(ONLY));
  // Widest coverage first: one site from every arm before a second from any arm, so a truncated
  // run still spans the file instead of exhausting arm 1.
  const perArm = new Map();
  const ordered = [];
  for (const s of pool) {
    const n = perArm.get(s.arm) || 0;
    perArm.set(s.arm, n + 1);
    ordered.push({ ...s, rank: n });
  }
  ordered.sort((x, y) => x.rank - y.rank || x.line - y.line);
  const subject = ordered.slice(0, INVERT === Infinity ? ordered.length : INVERT);
  console.log(`\n=== D. INVERSION: ${subject.length} live sites, one process each, against the REAL file ===`);
  console.log('    kills     = inverting it turned its arm red. The assertion constrains something.');
  console.log('    SURVIVES  = arm stayed green with the assertion inverted. It constrains nothing.');
  console.log('    unreached = the site never ran under its own arm\'s name filter; NOT a finding.\n');
  let survived = 0, unreached = 0, killed = 0;
  for (const s of subject) {
    const r = spawnSync(process.execPath,
      ['--import', './tools/_armhook.mjs', '--test', '--test-name-pattern', escapeRe(s.arm), FILE],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28,
        env: { ...process.env, ARM_INVERT: `${path.basename(FILE)}:${s.line}`, ARM_HOOK_OUT: path.join(tmpdir(), 'armhook-inv.json') } });
    const out = r.stdout || '';
    const fired = /ARM_INVERT_FIRED=1/.test(out);
    const red = !/^# fail 0$/m.test(out);
    let verdict;
    if (!fired) { verdict = 'unreached'; unreached++; }
    else if (red) { verdict = 'kills    '; killed++; }
    else { verdict = 'SURVIVES '; survived++; }
    console.log(`  ${verdict} :${String(s.line).padEnd(5)} ${s.arm.slice(0, 56)}`);
    if (verdict.startsWith('SURVIVES')) console.log(`            ${s.text.slice(0, 104)}`);
  }
  console.log(`\n  kills ${killed} · SURVIVES ${survived} · unreached ${unreached}  (of ${subject.length})`);
  if (survived) console.log('  The SURVIVES list is the finding: those assertions cannot fail their own arm.');
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

console.log('\n[armaudit] A is decidable and is evidence. C is a list of suspects, not findings.');
console.log('[armaudit] "executed" is not "able to fail" — see the note in tools/_armhook.mjs.');
