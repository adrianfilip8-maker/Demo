#!/usr/bin/env node
/* propshull — Task #28's gated hero-prop hull shells. Pre-registered in PREREG-propshull.md.
 *
 * ONE boot, four arms per shot, toggled by DETACHING the tagged shells from their hosts.
 *
 * Why detach and not `.visible`: PostFX runs beginNormalPass()/endNormalPass() every frame and
 * `setOutlinesVisible()` rewrites `.visible` on every shell in ToonMaterial's `_shells` list.
 * A per-shell `.visible = false` is therefore reverted before the frame is drawn, and the
 * "off" arm silently would not be off — the exact shape of trap that voids a sweep.
 *
 * Why dt=0 on every step: two arms in one boot otherwise render at different animation phases
 * (KNOWN_ISSUES §28 — a gold-bloom sweep was voided when its DUPLICATE arm moved more pixels
 * than its strongest real arm). `base2` exists solely to prove the pin held.
 *
 * Shot list carries its own arm set. `courtyard` and `interior` take all four arms because
 * they carry the Task #28 judgement and the validity gates have to be established somewhere.
 * `guard` and `night` take only base/hull: they are here to serve a *different* question —
 * whether the `guard` cyan contact line survives (PREREG-propshull.md's sibling note, and
 * §137's never-verified-in-a-frame item) — and they ride along in this boot rather than
 * costing a second lock acquisition. Their base/hull pair also answers, for free, whether the
 * hull change introduced anything at those junctions.
 *
 * usage: node progress/records/propshull.mjs [shot ...]
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FULL = ['base', 'base2', 'hull', 'restore'];
const PAIR = ['base', 'hull'];
const PLAN = [
  { shot: 'courtyard', arms: FULL },
  { shot: 'interior', arms: FULL },
  { shot: 'guard', arms: PAIR },
  { shot: 'night', arms: PAIR },
];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SHOTS = only.length ? PLAN.filter((p) => only.includes(p.shot)) : PLAN;
const OUT = path.join(ROOT, 'shots', 'propshull');

await mkdir(OUT, { recursive: true });

const res = await withGame({ width: 1280, height: 720, quality: 'high', verbose: false }, async ({ page, info }) => {
  /* ---- inventory: prove the shells exist and are the ones we think, before any arm ---- */
  const inv = await page.evaluate(() => {
    const out = [];
    window.__ENGINE.scene.traverse((o) => {
      if (!o.userData?.propsHull) return;
      const g = o.geometry;
      out.push({
        name: o.name,
        host: o.parent?.name ?? null,
        tris: (g.index?.count ?? g.attributes.position.count) / 3,
        castShadow: o.castShadow,
        noShadow: !!o.userData.noShadow,
        isOutlineShell: !!o.userData.isOutlineShell,
        thickness: o.material?.userData?.slyInkBase ? true : false,
      });
    });
    return out;
  });

  console.log(`\nprops hull shells found: ${inv.length}`);
  for (const s of inv) {
    console.log(`  ${s.name.padEnd(22)} host ${String(s.host).padEnd(18)} ${String(Math.round(s.tris)).padStart(6)} tris  ` +
                `castShadow ${s.castShadow} noShadow ${s.noShadow} isOutlineShell ${s.isOutlineShell}`);
  }
  if (!inv.length) throw new Error('no shells tagged propsHull — the gate did not fire, nothing to test');
  const bad = inv.filter((s) => s.castShadow || !s.noShadow || !s.isOutlineShell);
  if (bad.length) throw new Error(`${bad.length} shell(s) would reach the shadow map: ${bad.map((b) => b.name).join(', ')}`);

  /* Detach / attach, returning the count actually moved so an arm can never silently no-op. */
  const setHulls = (on) => page.evaluate((want) => {
    const stash = (window.__propsHullStash ||= new Map());
    let n = 0;
    if (want) {
      for (const [shell, host] of stash) { host.add(shell); n++; }
      stash.clear();
    } else {
      const found = [];
      window.__ENGINE.scene.traverse((o) => { if (o.userData?.propsHull) found.push(o); });
      for (const s of found) { stash.set(s, s.parent); s.removeFromParent(); n++; }
    }
    let live = 0;
    window.__ENGINE.scene.traverse((o) => { if (o.userData?.propsHull) live++; });
    return { moved: n, live };
  }, on);

  const arms = [];
  const shoot = async (shot, label, on) => {
    const t = await setHulls(on);
    if (on && t.live !== inv.length) throw new Error(`${label}: ${t.live} shells live, expected ${inv.length}`);
    if (!on && t.live !== 0) throw new Error(`${label}: ${t.live} shells still live with hulls off`);
    await page.evaluate(async () => { await window.__GAME.step(3, 0); });
    const r = await page.evaluate(() => ({ png: window.__GAME.capture(), stats: { ...window.__ENGINE.stats } }));
    const file = path.join(OUT, `${shot}-${label}.png`);
    await writeFile(file, Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`  ✓ ${label.padEnd(8)} live ${String(t.live).padStart(2)}  draws ${String(r.stats.drawCalls).padStart(4)}  tris ${(r.stats.triangles / 1000) | 0}k  -> ${path.relative(ROOT, file)}`);
    arms.push({ shot, label, file, draws: r.stats.drawCalls, tris: r.stats.triangles, live: t.live });
  };

  for (const { shot, arms } of SHOTS) {
    console.log(`\ncapturing ${shot} [${arms.join(' ')}] (dt pinned to 0 on every step):`);
    await page.evaluate(async (s) => { await window.__GAME.setShot(s); }, shot);
    await page.evaluate(async () => { await window.__GAME.step(6, 0); });
    for (const a of arms) await shoot(shot, a, a === 'hull');
  }

  return { arms, inv, warnings: info.warnings, consoleErrors: info.consoleErrors };
});

await writeFile(path.join(OUT, 'arms.json'), JSON.stringify(res, null, 2));
console.log(`\n→ ${path.relative(ROOT, OUT)}/  (${res.arms.length} frames)`);
if (res.consoleErrors?.length) {
  console.log(`· ${res.consoleErrors.length} console error(s):`);
  for (const e of res.consoleErrors.slice(0, 6)) console.log(`    ! ${e.split('\n')[0]}`);
}
