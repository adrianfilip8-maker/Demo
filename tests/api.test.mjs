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
 * adding a new bad call turns this red, and fixing one of these turns it red too — telling whoever
 * fixed it to delete the entry rather than leaving a stale exception behind.
 *
 * `make` — five call sites: `KayKit.js:181`, **`SlyModel3.js:701` (the SHIPPED character)**,
 * `SlyModelDL.js:445`, `SlyModelDLRig.js:352`, `SlyModelDLRaw.js:160`. Every one falls through to a
 * plain `MeshStandardMaterial`, so the player character and every KayKit prop have never once
 * rendered on the cel material, while the world (`Architecture`, `Terrain`, `Props`, `Guard`, and
 * the legacy `SlyModel`) calls `toon()` and does. That is critic pass 7's #1 defect — "THERE IS NO
 * TOON RAMP, ANYWHERE" — as a spelling mistake.
 *
 * NOT fixed in this commit on purpose. The fix is one line (`make(opts) { return this.toon(opts); }`)
 * and it is the single largest visual change available in this project: it flips the protagonist and
 * all set dress onto a different shader in one step. It gets a sealed A/B, not a drive-by.
 */
const KNOWN_MISSING = ['make'];

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

test('api: the character and the world are still on different material paths', () => {
  /* The consequence, asserted directly rather than inferred, so it cannot quietly half-change.
     When `make` is aliased this test goes red and should be deleted along with KNOWN_MISSING. */
  const src = (p) => readFileSync(join(SRC, p), 'utf8');
  for (const p of ['player/SlyModel3.js', 'world/KayKit.js']) {
    assert.ok(/shading\s*\??\.\s*make/.test(src(p)), `${p} no longer calls the missing make()`);
  }
  for (const p of ['world/Architecture.js', 'world/Terrain.js', 'world/Props.js']) {
    assert.ok(/shading\s*\??\.\s*toon/.test(src(p)), `${p} no longer calls toon()`);
  }
});
