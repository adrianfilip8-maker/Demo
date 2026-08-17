/**
 * armaudit.mjs — which arms in a test file cannot fail, and which assert nothing new?
 *
 * One session produced **nine** independent instances of one defect class across four lanes, every
 * one found **by accident in the course of other work** — consolidated as §418. Among them: a bar
 * no camera could pass (§407), a bar no frame could fail because a neighbour entailed it (§408.3),
 * a predicate that could not say "no" on one of its paths (§409), a symmetry probe whose sampling
 * was commensurate with what it sampled (§414), and this file's own sibling `sweepcensus` printing
 * a total as a breakdown (§412.2).
 *
 * Knowing the class does not prevent writing one — three lanes reintroduced it inside the very
 * work written to demonstrate it, this file included (see the tripwire note at §418.5, and the
 * over-matching detector below). So this is the systematic version.
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
 * **3. Has anyone asked either question of this arm?** (§418.3) The three modes above find bars
 * that are vacuous NOW. This finds the larger set: bars nobody has checked either way. Every arm
 * is scanned for a `DOMAIN (§418.3)` block naming a `passes on :` and a `fails on :` case, and the
 * gap is REPORTED, never failed — the discipline is prospective, so reddening the suite would only
 * punish arms that predate it. Runs standalone in under a second with `--domain-only`.
 *
 * Two things it deliberately does not flatten:
 *   · an arm whose failing case is honestly recorded as UNREACHABLE counts as documented, not as
 *     a gap. §418.5: a bar with no failing input is a TRIPWIRE, which is a legitimate thing to
 *     have; what is not legitimate is not knowing which one you wrote. Scoring the honest label as
 *     a failure would teach people to delete the label rather than the ambiguity.
 *   · arms named "(calibration)" are counted as PRIOR ART. Their whole job is to remove a guard
 *     and show a sibling can go red — §418.3's failing input, expressed as an arm instead of a
 *     comment, years before the rule was written.
 *
 * ── The rule this exists to enforce ──────────────────────────────────────────────────────────
 * Same as §412.1's, in a different costume: **an audit that enumerates by reading the code misses
 * exactly the assertions the reader's model of the code does not reach.** So it enumerates by
 * running.
 *
 * And what it CANNOT do, stated because a coverage number invites the wrong reading: a DOMAIN
 * block is a claim by its author, not a proof. This tool checks that the question was ASKED and
 * answered in writing. Whether the two named inputs are real is `--invert`'s job for one of them
 * and nobody's job for the other. 56/56 here would not mean the suite is sound.
 *
 *   node tools/armaudit.mjs [tests/traversal.test.mjs] [--domain-only] [--invert N] [--only <s>]
 */
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
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

/* ---- 1. static inventory: every assert site, and the arm that lexically owns it ------------
 * Written as functions so `--all` measures every file through EXACTLY this code. A second
 * implementation for the project-wide pass would drift from this one and the two numbers would
 * stop being comparable — which is how a baseline quietly stops being a baseline. */
const DOMAIN_TAG = /DOMAIN\s*\(§418\.3\)/;

function parseArms(lines) {
  const arms = [];                       // { name, start, end }
  for (let i = 0; i < lines.length; i++) {
    const m = /^test\(\s*(['"`])((?:[^\\]|\\.)*?)\1\s*,/.exec(lines[i]);
    /* Un-escape the JS string literal. The SOURCE spells an apostrophe `\'`; the runtime test name
       has no backslash, so passing the raw text to `--test-name-pattern` matched nothing, the arm
       never ran, and its assertions came back "unreached". Two of them did, and they were an
       instrument artefact reported as a property of the suite — which is the failure this whole
       tool is about, so it is fixed rather than filtered. */
    if (m) arms.push({ name: m[2].replace(/\\(['"`\\])/g, '$1'), start: i + 1, end: lines.length });
  }
  for (let k = 0; k < arms.length - 1; k++) arms[k].end = arms[k + 1].start - 1;
  return arms;
}

function parseSites(lines, armAt) {
  const out = [];                        // { line, method, arm, text }
  for (let i = 0; i < lines.length; i++) {
    const m = /assert\.(ok|equal|notEqual|deepEqual|notDeepEqual|strictEqual|match|fail|throws)\s*\(/.exec(lines[i]);
    if (!m) continue;
    if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;   // a mention in prose, not a call
    out.push({ line: i + 1, method: m[1], arm: armAt(i + 1), text: lines[i].trim() });
  }
  return out;
}

/* ---- §418.3 coverage: does the arm name the two inputs? ------------------------------------
 * Modes A-C find bars that are vacuous NOW. This finds bars nobody has checked either way, which
 * is the larger set and the one §418.3 is aimed at. It is REPORTED, never failed: the discipline
 * is prospective, so turning it into a red suite would only punish the arms that predate it.
 *
 * The distinction §418.5 draws is enforced here rather than flattened. An arm whose failing case
 * is honestly recorded as unreachable counts as DOCUMENTED, not as a gap. The rule is not "every
 * bar must be falsifiable"; a bar with no failing input is a TRIPWIRE and that is a legitimate
 * thing to have. The rule is that you must have found out which one you wrote, and said so.
 * Counting the honest tripwire as a failure would teach people to delete the label rather than
 * the ambiguity.
 */
function classifyDomains(arms, lines) {
  for (let k = 0; k < arms.length; k++) {
    const a = arms[k];
    /* Search the arm AND the comment block above `test(` — a doc comment there is the natural
       place for it, and scanning only the body would report those arms as undocumented. */
    const floor = k === 0 ? 1 : arms[k - 1].end + 1;
    const from = Math.max(floor, a.start - 40);
    const text = lines.slice(from - 1, a.end).join('\n');
    a.hasTag = DOMAIN_TAG.test(text);
    a.hasPass = /passes\s+on\s*:/i.test(text);
    a.hasFail = /fails\s+on\s*:/i.test(text);
    /* Scope the unreachable-case test to the `fails on :` LINES, not the whole window. Scanning
       the window matched the phrase "with NO INPUT" in two arms' scenario prose — they describe
       standing still, not an unreachable domain — and reported 3 tripwires where there is 1. A
       detector whose hits are mostly false costs attention instead of buying coverage, which is
       this file's own objection to its entailment pass, committed inside the fix for it. */
    const failLines = text.split('\n').filter((l) => /fails\s+on\s*:/i.test(l));
    a.tripwire = a.hasTag && failLines.some((l) => /NO INPUT|NOT REACHABLE|no failing input/i.test(l));
    a.domain = a.hasTag && a.hasPass && a.hasFail ? 'documented' : a.hasTag ? 'partial' : 'none';
  }
  return arms;
}

const arms = classifyDomains(parseArms(lines), lines);
const armAt = (ln) => arms.find((a) => ln >= a.start && ln <= a.end)?.name || '(top level)';
const staticSites = parseSites(lines, armAt);


/* ---- §418.3 report, printed FIRST because it is the cheap half and needs no run ------------- */
function reportDomains() {
  const by = (k) => arms.filter((a) => a.domain === k);
  const doc = by('documented'), part = by('partial'), none = by('none');
  const trip = arms.filter((a) => a.tripwire);
  console.log(`\n=== §418.3 COVERAGE: ${doc.length} of ${arms.length} arms name both inputs ===`);
  console.log(`    documented ${doc.length}  ·  partial ${part.length}  ·  MISSING ${none.length}`);
  /* Not a category of its own — an arm can hold ordinary bars AND one tripwire, which is exactly
     what the §409 census arm holds. Counting it as a third bucket would have said the arm was
     wholly unfalsifiable, which is false and would have hidden the bars that do discriminate. */
  if (trip.length) {
    console.log(`    of the documented, ${trip.length} record a failing case as UNREACHABLE — tripwires,`);
    console.log('    legitimate under §418.5 precisely because they are labelled:');
    for (const a of trip) console.log(`      :${String(a.start).padEnd(5)} ${a.name.slice(0, 80)}`);
  }
  if (part.length) {
    console.log('\n  PARTIAL — has the block, names only one side:');
    for (const a of part) console.log(`    :${String(a.start).padEnd(5)} ${a.name.slice(0, 84)}`);
  }
  /* Credit the practice that predates the rule. Several arms here carry a sibling named
     "(calibration)" whose whole job is to remove a guard and show the subject arm CAN go red —
     §418.3's failing input, expressed as an arm instead of a comment. Counting those as MISSING
     would be reporting the discipline's absence in a file that already has it in an older form,
     and would make the headline number mean less than it appears to. */
  const calib = arms.filter((a) => /\(calibration\)/i.test(a.name));
  if (calib.length) {
    console.log(`\n  PRIOR ART — ${calib.length} arms are themselves a failing-input demonstration for a`);
    console.log('  sibling, which is §418.3 in an older form (an arm, not a comment):');
    for (const a of calib) console.log(`    :${String(a.start).padEnd(5)} ${a.name.slice(0, 84)}`);
    console.log('  Those subjects are better covered than the raw MISSING count suggests. The comment');
    console.log('  form is still worth adding: it survives the sibling being renamed or deleted.');
  }
  if (none.length) {
    console.log('\n  MISSING — no DOMAIN block. Not a defect; an unanswered question:');
    console.log('    what input makes this arm pass, and what input makes it RED?');
    for (const a of none) console.log(`    :${String(a.start).padEnd(5)} ${a.name.slice(0, 84)}`);
  }
  console.log('\n  Reported, never failed. The discipline is prospective (§418.3): it is found while');
  console.log('  deciding what a bar MEANS, which is the only moment its domain is in front of you.');
  console.log('  Retrofitting it to an old arm means reconstructing a domain someone else had.');
}
/* ---- --all: the project-wide §418.3 baseline --------------------------------------------------
 * Gathered BEFORE anyone starts closing the gap, because a baseline measured after remediation
 * begins is not a baseline. Same three exemptions as the single-file pass, applied through the
 * same functions rather than a second implementation.
 *
 * Read the two possible outcomes differently, and decide that before seeing the number:
 *   · a low total means the project never had the discipline, and §418.3 is new work;
 *   · a HIGH total in files nobody touched today would be worse — it would mean the discipline
 *     already existed and the nine instances slipped past it anyway, which is a story about the
 *     rule being insufficient rather than absent.
 */
if (argv.includes('--all')) {
  const dir = path.join(ROOT, 'tests');
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
  let tArms = 0, tDoc = 0, tPart = 0, tNone = 0, tTrip = 0, tCal = 0, tSites = 0;
  const rows = [];
  for (const f of files) {
    const ls = readFileSync(path.join(dir, f), 'utf8').split('\n');
    const as = classifyDomains(parseArms(ls), ls);
    const at = (ln) => as.find((a) => ln >= a.start && ln <= a.end)?.name || '(top level)';
    const sites = parseSites(ls, at);
    const doc = as.filter((a) => a.domain === 'documented').length;
    const part = as.filter((a) => a.domain === 'partial').length;
    const none = as.filter((a) => a.domain === 'none').length;
    const trip = as.filter((a) => a.tripwire).length;
    const cal = as.filter((a) => /\(calibration\)/i.test(a.name)).length;
    tArms += as.length; tDoc += doc; tPart += part; tNone += none; tTrip += trip; tCal += cal;
    tSites += sites.length;
    rows.push({ f, n: as.length, doc, part, none, trip, cal, sites: sites.length });
  }
  rows.sort((a, b) => b.n - a.n);
  console.log(`\n=== §418.3 PROJECT BASELINE — ${files.length} test files ===\n`);
  console.log('file                          arms  asserts   documented  partial  MISSING  tripwire  calib');
  for (const r of rows) {
    if (!r.n) continue;
    console.log(`  ${r.f.padEnd(28)}${String(r.n).padStart(4)}${String(r.sites).padStart(9)}` +
      `${String(r.doc).padStart(13)}${String(r.part).padStart(9)}${String(r.none).padStart(9)}` +
      `${String(r.trip).padStart(10)}${String(r.cal).padStart(7)}`);
  }
  const pct = tArms ? (100 * tDoc / tArms) : 0;
  console.log(`  ${'TOTAL'.padEnd(28)}${String(tArms).padStart(4)}${String(tSites).padStart(9)}` +
    `${String(tDoc).padStart(13)}${String(tPart).padStart(9)}${String(tNone).padStart(9)}` +
    `${String(tTrip).padStart(10)}${String(tCal).padStart(7)}`);
  console.log(`\n  ${tDoc} of ${tArms} arms name both inputs — ${pct.toFixed(1)}%. ` +
    `${tSites} assert sites across the suite.`);
  /* The denominator's soundness check, and it is not decoration: an arm the parser fails to see is
     an arm silently dropped from the bottom of the fraction, which makes coverage look BETTER than
     it is. Cross-check it against the runner rather than trusting the regex — at the baseline these
     agreed exactly, 751 and 751. Same discipline as mode A refusing to report a zero when the hook
     matched nothing. */
  console.log(`  Cross-check the denominator: \`node --test "tests/*.test.mjs"\` should report ${tArms}`);
  console.log('  tests. If it reports more, this parser is missing arms and the percentage flatters.');
  console.log(`  ${tCal} arms are "(calibration)" siblings: §418.3's failing input as an arm, not a comment.`);
  console.log('\n  Reported, never failed. Measured before any remediation, so it is a baseline and');
  console.log('  not a progress report. A DOMAIN block is a claim by its author, not a proof —');
  console.log('  100% here would not mean the suite is sound, only that the question was asked.');
  process.exit(0);
}

reportDomains();
if (argv.includes('--domain-only')) process.exit(0);

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
    // JSON, not a raw separator: an earlier version joined with a NUL byte, which works but
    // makes `grep` classify this file as BINARY — hiding the auditor from exactly the kind of
    // source scan its own census arm depends on. A tool that cannot be grepped cannot be audited.
    const key = JSON.stringify([q[1], DIR[q[2]]]);
    if (!byExpr.has(key)) byExpr.set(key, []);
    byExpr.get(key).push({ ...s, op: q[2] });
  }
  for (const [key, group] of byExpr) {
    if (group.length < 2) continue;
    cand++;
    const [expr, dir] = JSON.parse(key);
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
