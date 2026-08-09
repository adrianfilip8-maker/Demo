#!/usr/bin/env node
/**
 * fxdraw — the D12 candidate run. Five arms, ONE invocation, ONE tree, no source arm.
 *
 * Sealed by `PREREG-fxdraw.md` + `ADDENDUM-fxdraw-sametree.md`. Everything about the arm
 * structure is that addendum's: the materials lane VOIDed a run today whose two arms were
 * twenty commits apart across a `src/core/Shots.js` re-framing, and with four agents committing
 * continuously and a FIFO between every capture, a comparison spanning two invocations spans
 * two trees by default.
 *
 *   base       shipped emitter table
 *   suspect    the named emitter suppressed             — denominator for D1/D3/D4
 *   cand       candidate values written into the emitter definition IN-PAGE
 *   candoff    candidate installed AND suppressed       — denominator's numerator
 *   base2      shipped table restored                   — VALIDITY + restore check
 *
 * `base2` does double duty: it proves the clock did not move between arms AND that installing
 * and removing the candidate left no residue. If it differs from `base`, the run is VOID.
 *
 * dt is **1/60, not 0** — see KNOWN_ISSUES §275. A frozen clock freezes particle age at 0,
 * where every emitter's `smoothstep(0, fadeIn, u)` is exactly zero, so `combat` staged at dt 0
 * contains no impact effect at all and every arm comes back byte-identical. This run's
 * predecessor spent a capture window discovering that.
 *
 *   node progress/records/fxdraw.mjs <emitter> '<json patch>'
 *   node progress/records/fxdraw.mjs cane_ring '{"size":[0.22,0.95],"col0":15241002}'
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const EMITTER = process.argv[2];
const PATCH = process.argv[3];
if (!EMITTER || !PATCH) {
  console.error('usage: node progress/records/fxdraw.mjs <emitter> \'<json patch>\'');
  process.exit(2);
}
const patch = JSON.parse(PATCH);

/* Provenance is read AT BOOT, not at process start, and the difference is the whole point.
   `withGame` acquires the FIFO lock first and the wait has been measured at 20-60 minutes; four
   agents commit continuously, so a sha sampled before the wait names a tree the boot will not
   compile. `fxshape.mjs`'s first cut sampled it at process start — a provenance record that is
   confidently wrong is worse than an absent one, so this samples inside `onLocked`, which the
   harness runs after the lock is granted and before vite spawns (§186's seam). */
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
const PROVENANCE = { sha: null, srcDirty: null, at: null, emitter: EMITTER, patch };
const stampProvenance = () => {
  PROVENANCE.sha = git('rev-parse', 'HEAD');
  PROVENANCE.srcDirty = git('status', '--porcelain', 'src/') || '';
  PROVENANCE.at = new Date().toISOString();
};

const OUT = path.join(ROOT, 'shots', 'fxdraw');
await mkdir(OUT, { recursive: true });

const ARMS = ['base', 'suspect', 'cand', 'candoff', 'base2'];

const res = await withGame({ width: 1280, height: 720, quality: 'high', verbose: false, onLocked: stampProvenance }, async ({ page, info }) => {
  /* Reach the live emitter definition object. `Particles._emit` reads `EMITTERS[name]` at emit
     time, so mutating that object is a genuine parameter change with no rebuild and no source
     arm. Inventory first: if the object is not reachable or the keys being patched do not
     already exist on it, every arm below would be a silent no-op. */
  const inv = await page.evaluate(async ([name, p]) => {
    const fx = window.__ENGINE?.get?.('fx');
    if (!fx) return { ok: false, why: 'no fx module' };
    const mod = await import('/src/fx/Emitters.js');
    const def = mod.EMITTERS?.[name];
    if (!def) return { ok: false, why: `no emitter ${name}` };
    const missing = Object.keys(p).filter((k) => !(k in def));
    if (missing.length) return { ok: false, why: `emitter ${name} has no key(s): ${missing.join(',')}` };
    window.__fxDef = def;
    window.__fxOrig = JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(p).map((k) => [k, def[k]]))));
    window.__fxPatch = p;
    window.__fxOrigEmit = fx._emit.bind(fx);
    fx._emit = function (n, ...rest) {
      if (window.__fxBlock && window.__fxBlock.has(n)) return null;
      return window.__fxOrigEmit(n, ...rest);
    };
    return { ok: true, before: window.__fxOrig };
  }, [EMITTER, patch]);
  if (!inv.ok) throw new Error(`lever inventory failed: ${inv.why}`);
  console.log(`tree ${PROVENANCE.sha} · src dirty: ${PROVENANCE.srcDirty ? 'YES — run is VOID' : 'no'}`);
  console.log(`patching ${EMITTER}: ${JSON.stringify(inv.before)} -> ${JSON.stringify(patch)}`);

  const out = {};
  for (const arm of ARMS) {
    const state = await page.evaluate(([a, name]) => {
      const on = a === 'cand' || a === 'candoff';
      const def = window.__fxDef;
      const src = on ? window.__fxPatch : window.__fxOrig;
      for (const k of Object.keys(window.__fxPatch)) def[k] = Array.isArray(src[k]) ? src[k].slice() : src[k];
      window.__fxBlock = new Set(a === 'suspect' || a === 'candoff' ? [name] : []);
      return JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(window.__fxPatch).map((k) => [k, def[k]]))));
    }, [arm, EMITTER]);

    const r = await page.evaluate(async () => {
      const res2 = await window.__GAME.setShot('combat', { dt: 1 / 60 });
      return { stats: res2.stats, t: window.__ENGINE?.time ?? null,
        dataUrl: window.__GAME.capture('image/png', 0.92, 0) };
    });
    await writeFile(path.join(OUT, `${arm}.png`),
      Buffer.from(r.dataUrl.slice(r.dataUrl.indexOf(',') + 1), 'base64'));
    out[arm] = { t: r.t, live: state, blocked: arm === 'suspect' || arm === 'candoff' };
    console.log(`  ${arm.padEnd(8)} t ${String(r.t).padStart(8)} · ${EMITTER} = ${JSON.stringify(state)}` +
      `${out[arm].blocked ? ' · SUPPRESSED' : ''}`);
  }
  return { out, info };
});

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ provenance: PROVENANCE, arms: res.out }, null, 2));
console.log(`\nwrote ${ARMS.length} frames to ${OUT}`);
