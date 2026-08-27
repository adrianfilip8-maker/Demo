#!/usr/bin/env node
/**
 * godotsurvey.mjs — READ-ONLY census of the reference Godot checkout, for §718.
 *
 * §718 is a survey, and Controller.js:221 states the rule it has to satisfy: *a claim about what
 * is in a file is only a measurement if something re-reads it*. Every count §718 quotes is
 * produced here, so the section can be re-verified against a fresh clone instead of trusted.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────────────────────
 *
 * The reference repository states **no licence**. This tool therefore emits **counts, flag
 * values and identifiers only** — never a line of their source, never a function body, never a
 * block of their constants. It is a census, not an extractor, and its output is safe to paste
 * into the ledger because there is nothing in it to paste.
 *
 * It also never walks their audio tree. Sidecars are selected by their `importer=` field
 * (`scene` / `texture`), which is a content test, not a path test — so no path under §364.3's
 * exclusion is named in this file, matched against, or opened. §711 tripped the `audiowired` A2
 * scan twice by spelling such a path in a comment; nothing here spells one.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────────────────────
 *
 *   node tools/godotsurvey.mjs <path-to-reference-checkout> [--json]
 *
 * Exit 0 on success, 2 if the path is not a Godot project (no project.godot).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

/* ============================== walk ====================================== */

/** Every file under `dir`, skipping VCS and Godot's own import cache. */
function walk(dir, out = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name === '.git' || e.name === '.godot') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function read(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

/* ============================== census ==================================== */

/**
 * Scripts: file count, line count, and the biggest few by line count.
 *
 * Line counts are the only "size" measure used, because they are the one number that can be
 * quoted without quoting anything. Names are file names, which are identifiers, not content.
 */
function censusScripts(root, files) {
  const gd = files.filter((f) => extname(f) === '.gd');
  const rows = gd.map((f) => ({
    file: relative(root, f),
    lines: read(f).split('\n').length,
  })).sort((a, b) => b.lines - a.lines);
  return {
    count: rows.length,
    totalLines: rows.reduce((s, r) => s + r.lines, 0),
    largest: rows.slice(0, 6),
    /* Shader sources are counted separately: they are not GDScript and §718 does not survey them. */
    shaders: files.filter((f) => extname(f) === '.gdshader').length,
  };
}

/**
 * `[global_group]` in project.godot is their capability-tag vocabulary — the mechanism §718's
 * SLIP finding is about. For each declared group we count how many `.gd` files mention it, which
 * is what separates a live tag from a declared-and-unused one.
 *
 * The mention test is a plain substring of the quoted group name. It over-counts a group whose
 * name is also an ordinary word, so the number is reported as "files mentioning", never as
 * "files using".
 */
function censusGroups(root, files, projectText) {
  const block = projectText.split(/^\[global_group\]$/m)[1] || '';
  const body = block.split(/^\[/m)[0] || '';
  const names = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*"?([^"=]+?)"?\s*=/);
    if (m && m[1].trim()) names.push(m[1].trim());
  }
  const gd = files.filter((f) => extname(f) === '.gd').map((f) => ({ f, t: read(f) }));
  const scenes = files.filter((f) => extname(f) === '.tscn').map((f) => ({ f, t: read(f) }));
  return names.map((n) => ({
    group: n,
    scriptsMentioning: gd.filter((x) => x.t.includes(`"${n}"`)).length,
    scenesMentioning: scenes.filter((x) => x.t.includes(`"${n}"`)).length,
  })).sort((a, b) => b.scriptsMentioning - a.scriptsMentioning);
}

/**
 * Import sidecars. Two questions §718 asks:
 *
 *   1. Which importer flags are non-default? Godot 4 defaults `generate_lods`,
 *      `create_shadow_meshes`, `ensure_tangents` and `remove_immutable_tracks` to true and
 *      `animation/fps` to 30, so the *majority* value of each is evidence of nothing. Only the
 *      minority rows are decisions, and those are listed by name.
 *   2. How far does the external-material remap dedup go? `use_external/enabled` on a material
 *      sub-resource replaces a mesh's embedded material with a shared project resource. The
 *      slot-count : distinct-target ratio is the dedup factor.
 *
 * Sidecars are selected by `importer="scene"`; nothing else is opened.
 */
function censusImports(root, files) {
  const sidecars = files.filter((f) => f.endsWith('.import'));
  const flags = {};
  const minority = {};
  let sceneCount = 0;
  const remapSlots = [];
  const remapTargets = new Set();
  const filesWithRemap = [];

  const FLAGS = [
    'meshes/generate_lods',
    'meshes/create_shadow_meshes',
    'meshes/ensure_tangents',
    'animation/remove_immutable_tracks',
    'animation/fps',
  ];

  for (const f of sidecars) {
    const t = read(f);
    if (!/^importer="scene"$/m.test(t)) continue;   // content test, never a path test
    sceneCount++;
    for (const k of FLAGS) {
      const m = t.match(new RegExp(`^${k.replace('/', '\\/')}=(.*)$`, 'm'));
      if (!m) continue;
      const v = m[1].trim();
      (flags[k] ||= {});
      flags[k][v] = (flags[k][v] || 0) + 1;
      (minority[k] ||= []).push({ file: basename(f), value: v });
    }
    const paths = [...t.matchAll(/"use_external\/path":\s*"([^"]+)"/g)].map((m) => m[1]);
    if (paths.length) {
      filesWithRemap.push(basename(f));
      for (const p of paths) { remapSlots.push(p); remapTargets.add(p); }
    }
  }

  /* Keep only the rows that differ from their flag's majority value — the actual decisions. */
  const decisions = {};
  for (const k of Object.keys(flags)) {
    const hist = flags[k];
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0][0];
    const odd = (minority[k] || []).filter((r) => r.value !== top);
    if (odd.length) decisions[k] = { majority: top, exceptions: odd };
  }

  return {
    sceneSidecars: sceneCount,
    flagHistogram: flags,
    nonMajorityDecisions: decisions,
    materialRemap: {
      filesWithRemap: filesWithRemap.length,
      slotsRemapped: remapSlots.length,
      distinctTargets: remapTargets.size,
      dedupFactor: remapTargets.size
        ? +(remapSlots.length / remapTargets.size).toFixed(2)
        : 0,
    },
  };
}

/**
 * The global frame-phase counter. An autoload cycles a small integer every physics frame and
 * expensive per-object work is gated on a system-specific value of it. §718's amortisation
 * finding rests on this being *used*, and at more than one phase — a single phase would be
 * bunching, not staggering. Both facts are counted here.
 *
 * Detected structurally: any `<Identifier>.count == <int>` comparison in a `.gd` file, where the
 * identifier is one of the project's declared autoloads. No autoload name is hardcoded.
 */
function censusFramePhase(root, files, projectText) {
  const block = projectText.split(/^\[autoload\]$/m)[1] || '';
  const body = block.split(/^\[/m)[0] || '';
  const autoloads = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*=/);
    if (m) autoloads.push(m[1]);
  }
  const sites = [];
  const phases = new Set();
  for (const f of files.filter((x) => extname(x) === '.gd')) {
    const t = read(f);
    for (const a of autoloads) {
      const re = new RegExp(`${a}\\.count\\s*==\\s*(\\d+)`, 'g');
      for (const m of t.matchAll(re)) {
        sites.push({ file: relative(root, f), autoload: a, phase: +m[1] });
        phases.add(+m[1]);
      }
    }
  }
  return { autoloads, sites, distinctPhases: [...phases].sort((a, b) => a - b) };
}

/** Scenes per folder — the Design Tools prefab observation in §718 is this table. */
function censusScenes(root, files) {
  const byDir = {};
  for (const f of files.filter((x) => extname(x) === '.tscn')) {
    const d = relative(root, f).split('/').slice(0, -1).join('/') || '.';
    byDir[d] = (byDir[d] || 0) + 1;
  }
  const total = Object.values(byDir).reduce((s, n) => s + n, 0);
  return { total, byDir };
}

/* ============================== main ====================================== */

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const root = args.find((a) => !a.startsWith('--'));

  if (!root) {
    console.error('usage: node tools/godotsurvey.mjs <path-to-reference-checkout> [--json]');
    process.exit(2);
  }
  const proj = join(root, 'project.godot');
  if (!existsSync(proj) || !statSync(proj).isFile()) {
    console.error(`not a Godot project (no project.godot): ${root}`);
    process.exit(2);
  }

  const files = walk(root);
  const projectText = read(proj);

  const report = {
    root,
    files: files.length,
    scripts: censusScripts(root, files),
    scenes: censusScenes(root, files),
    groups: censusGroups(root, files, projectText),
    framePhase: censusFramePhase(root, files, projectText),
    imports: censusImports(root, files),
  };

  if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }

  const S = report.scripts;
  console.log(`reference checkout: ${root}`);
  console.log(`  files walked        ${report.files}`);
  console.log(`  GDScript            ${S.count} files, ${S.totalLines} lines  (+${S.shaders} shader sources, not surveyed)`);
  console.log(`  largest             ${S.largest.map((r) => `${basename(r.file)} ${r.lines}`).join(' · ')}`);
  console.log(`  scenes              ${report.scenes.total}`);
  for (const [d, n] of Object.entries(report.scenes.byDir).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(3)}  ${d}`);
  }

  console.log(`\n  [global_group] capability tags — "mentions" over-counts common words, so it is a ceiling:`);
  for (const g of report.groups) {
    console.log(`      ${g.group.padEnd(18)} scripts ${String(g.scriptsMentioning).padStart(3)}   scenes ${String(g.scenesMentioning).padStart(3)}`);
  }

  const F = report.framePhase;
  console.log(`\n  frame-phase amortisation — autoloads ${F.autoloads.join(', ') || '(none)'}`);
  console.log(`      call sites ${F.sites.length}, distinct phases [${F.distinctPhases.join(', ')}]`);
  for (const s of F.sites) console.log(`      phase ${s.phase}  ${s.file}`);

  const I = report.imports;
  console.log(`\n  scene import sidecars ${I.sceneSidecars}`);
  for (const [k, hist] of Object.entries(I.flagHistogram)) {
    console.log(`      ${k.padEnd(36)} ${Object.entries(hist).map(([v, n]) => `${v}×${n}`).join('  ')}`);
  }
  if (Object.keys(I.nonMajorityDecisions).length) {
    console.log(`      non-majority values (these are the decisions; the majority is the Godot default):`);
    for (const [k, d] of Object.entries(I.nonMajorityDecisions)) {
      console.log(`        ${k}  (majority ${d.majority})`);
      for (const e of d.exceptions) console.log(`          ${e.value.padEnd(8)} ${e.file}`);
    }
  }
  const M = I.materialRemap;
  console.log(`      external-material remap: ${M.slotsRemapped} slots across ${M.filesWithRemap} scenes → ${M.distinctTargets} shared materials (${M.dedupFactor}:1)`);
}

main();
