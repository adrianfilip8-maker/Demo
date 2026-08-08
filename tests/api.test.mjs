import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Shading } from '../src/render/ToonMaterial.js';

/**
 * Does every method this codebase *calls* on the shading module actually exist?
 *
 * This test exists because the answer was no, for five call sites, silently, for the whole life of
 * the project — see KNOWN_ISSUES §213. The pattern that hid it is everywhere in this codebase and is
 * normally good practice:
 *
 * ```js
 * const mat = shading?.make ? shading.make({ … }) : new THREE.MeshStandardMaterial({ … });
 * ```
 *
 * The guard is meant to say "the shading module may not be registered yet, fall back". It *also*
 * silently absorbs "that method name is wrong" — and then the fallback is not a temporary degradation
 * during boot, it is what ships, forever, with no warning, on a material that renders perfectly
 * plausibly. A misspelled method in a language without interfaces costs nothing at parse time and
 * everything at runtime, and an optional-call guard converts the runtime error that would have caught
 * it into a permanent silent downgrade.
 *
 * So: scrape every `shading.X(` and `shading?.X` out of `src/`, and require X to exist on
 * `Shading.prototype`. Static text analysis, no browser, milliseconds. It generalises — any new
 * method called on the shading module from anywhere is checked the moment it is written.
 */

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Method names invoked on something called `shading`, however it is guarded. */
function shadingCallsIn(text) {
  const found = new Set();
  /* `shading.foo(`, `shading?.foo(`, and the bare `shading?.foo` of a ternary test. Also the
     `engine.get('shading')?.foo?.(…)` chain used by the character modules. */
  for (const m of text.matchAll(/\bshading\s*\??\.\s*(\w+)\s*\??\s*[(?]/g)) found.add(m[1]);
  for (const m of text.matchAll(/get\(\s*['"]shading['"]\s*\)\s*\??\.\s*(\w+)/g)) found.add(m[1]);
  return found;
}

const files = walk(SRC);
const proto = new Set(Object.getOwnPropertyNames(Shading.prototype));

/**
 * Methods that are CALLED but DO NOT EXIST. Asserted exactly, so both directions fail loudly:
 * adding a new bad call turns this red, and fixing one turns it red too — telling whoever fixed it
 * to delete the entry rather than leave a stale exception behind.
 *
 * **Now empty, and it did exactly that.** `make` sat here for one commit: five call sites
 * (`SlyModelDLRig.js:352` — the shipped character per §216 — `KayKit.js:181`, `SlyModel3.js:701`,
 * `SlyModelDL.js:445`, `SlyModelDLRaw.js:160`) all falling through to `MeshStandardMaterial`, so the
 * player character and every KayKit prop had never once rendered on the cel material. §213 aliased
 * it to `toon()` and this list emptied itself on the next run.
 *
 * Keep it empty. An entry here is a defect with a note attached, not a permission.
 */
const KNOWN_MISSING = [];

test('api: the shading module is scanned at all', () => {
  /* §211.1: a scan that finds nothing passes every assertion below while inspecting nothing. */
  assert.ok(files.length > 20, `only ${files.length} source files walked`);
  const callers = files.filter((f) => shadingCallsIn(readFileSync(f, 'utf8')).size > 0);
  assert.ok(callers.length >= 5, `only ${callers.length} files appear to call the shading module`);
  assert.ok(proto.has('toon') && proto.has('outline'),
    'Shading.prototype is missing methods that certainly exist — the import is wrong');
});

test('api: every method called on the shading module exists on it', () => {
  const missing = new Map();
  for (const f of files) {
    for (const name of shadingCallsIn(readFileSync(f, 'utf8'))) {
      if (proto.has(name)) continue;
      if (!missing.has(name)) missing.set(name, []);
      missing.get(name).push(f.slice(SRC.length));
    }
  }
  const names = [...missing.keys()].sort();
  assert.deepEqual(names, [...KNOWN_MISSING].sort(),
    'methods called on the shading module that do not exist on it:\n' +
    names.map((n) => `  ${n}() <- ${missing.get(n).join(', ')}`).join('\n'));
});

test('api: the character and the world now resolve to the same material factory', () => {
  /* Replaces a test that asserted the opposite. The previous version pinned the DEFECT — that
     SlyModel3/KayKit call a `make` that does not exist while the world calls `toon` — so that the
     split could not quietly half-change. §213 closed the split, so the assertion inverts: both
     groups must now reach a real factory, and `make` must resolve to `toon` rather than to some
     second implementation that could drift away from it. */
  const src = (p) => readFileSync(join(SRC, p), 'utf8');
  const callers = ['player/SlyModelDLRig.js', 'player/SlyModel3.js', 'world/KayKit.js'];
  for (const p of callers) {
    assert.ok(/shading\s*\??\.\s*make/.test(src(p)), `${p} no longer calls make()`);
  }
  for (const p of ['world/Architecture.js', 'world/Terrain.js', 'world/Props.js']) {
    assert.ok(/shading\s*\??\.\s*toon/.test(src(p)), `${p} no longer calls toon()`);
  }
  assert.equal(typeof Shading.prototype.make, 'function', 'make() is missing again');
  /* One factory, not two: `make` must BE `toon`'s caller, so a change to the cel material cannot
     reach the world and miss the character. */
  assert.match(Shading.prototype.make.toString(), /this\.toon\(/,
    'make() no longer delegates to toon() — the character and the world can now diverge');
});
