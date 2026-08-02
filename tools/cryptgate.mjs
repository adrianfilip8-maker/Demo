/**
 * Verification for the widened crypt reverse-gate. Runs the whole pre-registered protocol in
 * ONE boot, because between-boot comparisons of this scene are not trustworthy: texture prewarm,
 * lazy program compilation and the shadow cache's warm-up all differ run to run, and any of them
 * can move a byte or a draw count for reasons that have nothing to do with the gate.
 *
 * Protocol (see PREREG-cryptgate-widen.md):
 *   V1  BYTE-IDENTITY, the actual proof of unseeability. Pose `interior`, capture with the
 *       widened gate ON, flip `cryptGateWide` off, resetCryptGate(), settle, capture again.
 *       The two PNGs must be identical byte for byte. A geometric argument about sight lines is
 *       not evidence; this is.
 *   V2  BUDGET, reconciled against the cache's own stats. renderer.info in both states, read in
 *       STEADY STATE — FX's static-caster cache (002f27e) treats an effective-visibility change
 *       as an invalidation trigger, so the flip frame itself carries a full static re-render for
 *       every cached cascade and is not representative. Frames are advanced until
 *       `_cacheStats.refreshes` stops moving before either reading is taken.
 *   V3  EXTERIOR CONTROL, per camera. The sealed predicate is a pure function of camera
 *       position and is false for all nine non-`interior` cameras, so they are safe by
 *       construction; this renders two of them in both lever states anyway and requires
 *       byte-identity, because "safe by construction" has been wrong before.
 *   V4  HYGIENE. Boot warnings and console errors, both states.
 *
 *   node tools/cryptgate.mjs [--out shots/gate2]
 */
import { withGame } from './harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUT = opt('out', 'shots/gate2');
await mkdir(OUT, { recursive: true });

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

/* Settle to steady state, then report renderer.info and the shadow cache's own counters.
   `refreshes` must be unchanged across the last two settle frames or the reading is from a
   cache-rebuild frame and means nothing.

   Frames are stepped with `__GAME.step(1)`, NOT with bare requestAnimationFrame. `setShot()`
   calls `engine.stopLoop()`, so after it `Engine._tick` returns on its first line: rAF still
   fires but renders nothing — no `renderFrame`, so no module `update()`, no `info.reset()` and
   no draw. A settle loop built on rAF therefore returns whatever `renderer.info` happened to
   hold when `setShot` finished, identical in every leg regardless of the lever under test.
   That is exactly how this tool's V2 BUDGET leg came to report zero deltas. See KNOWN_ISSUES §19. */
const SETTLE = `async (frames) => {
  const eng = window.__ENGINE;
  const L = eng.get('lighting') || eng.modules?.lighting || null;
  const stats = () => {
    const s = L && (L._cacheStats || null);
    return s ? { refreshes: s.refreshes, blits: s.blits, dynDraws: s.dynDraws, engaged: s.engaged } : null;
  };
  let prev = stats(), stable = 0;
  for (let i = 0; i < frames; i++) {
    await window.__GAME.step(1);
    const now = stats();
    if (!now || !prev || now.refreshes === prev.refreshes) stable++; else stable = 0;
    prev = now;
    if (stable >= 3 && i > 6) break;
  }
  const info = eng.renderer.info;
  return {
    calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length ?? 0,
    cache: stats(), stableFrames: stable,
  };
}`;

await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  console.log(`boot warnings: ${info.warnings.length}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);

  const setWide = (on) => page.evaluate((v) => {
    const A = window.__ENGINE.get('architecture');
    if (!A) throw new Error('no architecture module');
    A.cryptGateWide = v;
    A.resetCryptGate();
    return A.cryptGateWide;
  }, on);

  /* What the gate is actually hiding, named and counted, before any rendering claim. */
  const inventory = await page.evaluate(() => {
    const A = window.__ENGINE.get('architecture');
    const wide = A._exteriorSets(true), narrow = A._exteriorSets(false);
    const narrowSet = new Set(narrow);
    const extra = wide.filter((o) => !narrowSet.has(o));
    const count = (o) => {
      let draws = 0, tris = 0;
      o.traverse((m) => {
        if (!m.isMesh) return;
        const g = m.geometry;
        const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        draws += 1; tris += n * (m.isInstancedMesh ? m.count : 1);
      });
      return { draws, tris };
    };
    const tally = (list) => list.reduce((t, o) => { const c = count(o); t.draws += c.draws; t.tris += c.tris; return t; }, { draws: 0, tris: 0 });
    return {
      narrow: { n: narrow.length, ...tally(narrow) },
      extra: { n: extra.length, ...tally(extra), names: extra.map((o) => o.name || o.type).slice(0, 12) },
      casters: extra.filter((o) => { let c = false; o.traverse((m) => { if (m.isMesh && m.castShadow) c = true; }); return c; }).map((o) => o.name || o.type),
    };
  });
  console.log(`\n--- what the widened half adds to the hidden set ---`);
  console.log(`  narrow (S1+S2): ${inventory.narrow.n} objects, ${inventory.narrow.draws} meshes, ${(inventory.narrow.tris / 1000).toFixed(0)}k tris`);
  console.log(`  extra  (S3+S4): ${inventory.extra.n} objects, ${inventory.extra.draws} meshes, ${(inventory.extra.tris / 1000).toFixed(0)}k tris`);
  console.log(`  extra names: ${inventory.extra.names.join(', ')}`);
  console.log(`  of those, shadow casters: ${inventory.casters.length ? inventory.casters.join(', ') : 'none'}`);

  const results = {};
  /* `interior` is the only shot the gate can fire in, so it carries V1 and V2 on its own; the
     others are the V3 exterior controls and are pure cost, so keep the default set small — this
     run queues behind every other agent's capture and a trimmed job is one that survives. */
  const shots = argv.filter((a) => !a.startsWith('--'));
  if (!shots.length) shots.push('interior', 'hero');

  for (const nm of shots) {
    const row = {};
    for (const wide of [true, false]) {
      await setWide(wide);
      await page.evaluate(async (n) => { await window.__GAME.setShot(n); }, nm);
      const st = await page.evaluate(`(${SETTLE})(40)`);
      const shot = await page.evaluate(() => ({ dataUrl: window.__GAME.capture() }));
      const buf = png(shot.dataUrl);
      await writeFile(path.join(OUT, `${nm}.${wide ? 'wide' : 'narrow'}.png`), buf);
      row[wide ? 'wide' : 'narrow'] = { ...st, sha: sha(buf), bytes: buf.length };
    }
    /* Gate state actually reached for this camera — the predicate, read back rather than
       assumed, so a shot that is not sealed cannot silently pass V1 for the wrong reason. */
    row.sealed = await page.evaluate(() => window.__ENGINE.get('architecture')._cryptSealed);
    results[nm] = row;
  }

  await setWide(true);

  console.log(`\n--- V1 byte-identity (wide vs narrow, same boot) ---`);
  for (const [nm, r] of Object.entries(results)) {
    const same = r.wide.sha === r.narrow.sha;
    console.log(`  ${nm.padEnd(10)} sealed=${String(r.sealed).padEnd(5)}  ${same ? 'IDENTICAL' : '*** DIFFERS ***'}  ` +
      `wide ${r.wide.sha}  narrow ${r.narrow.sha}`);
  }

  console.log(`\n--- V2 budget, steady state (cache refreshes settled) ---`);
  for (const [nm, r] of Object.entries(results)) {
    const d = r.narrow.calls - r.wide.calls, t = r.narrow.triangles - r.wide.triangles;
    console.log(`  ${nm}`);
    console.log(`     wide   calls ${String(r.wide.calls).padStart(4)}  tris ${(r.wide.triangles / 1e6).toFixed(3)}M  cache ${JSON.stringify(r.wide.cache)}`);
    console.log(`     narrow calls ${String(r.narrow.calls).padStart(4)}  tris ${(r.narrow.triangles / 1e6).toFixed(3)}M  cache ${JSON.stringify(r.narrow.cache)}`);
    console.log(`     saved by widening: ${d} calls, ${(t / 1000).toFixed(0)}k tris`);
  }

  const errs = await page.evaluate(() => window.__GAME.warnings.slice());
  console.log(`\n--- V4 hygiene ---`);
  console.log(`  runtime warnings: ${errs.length}`);
  for (const w of errs.slice(0, 10)) console.log(`   ! ${w}`);

  await writeFile(path.join(OUT, 'cryptgate.json'), JSON.stringify({ inventory, results, warnings: errs }, null, 2));
  console.log(`\n→ ${OUT}/`);
});
