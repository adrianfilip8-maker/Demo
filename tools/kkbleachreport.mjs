#!/usr/bin/env node
/**
 * kkbleachreport.mjs — reads a `kkbleach.mjs` run (or any PNG that shares its camera) and
 * prints the three tables §737 needs: the per-object split, the ATTRIBUTION delta per term, and
 * the curvature correlation.
 *
 * Kept out of the capture tool on purpose: the mask and the frames are on disk, so every table
 * below can be re-derived, re-cut and argued with WITHOUT taking the capture lock. §736 spent
 * 45 minutes of exclusive hold on an instrument whose positive control then failed.
 *
 *   node tools/kkbleachreport.mjs shots/kkbleach                      # the whole run
 *   node tools/kkbleachreport.mjs shots/kkbleach --fixture shots/look/interior.png
 *   node tools/kkbleachreport.mjs shots/kkbleach --objects 24         # widen the per-object table
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMask, score, pool } from './kkbleachmask.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const DIR = argv.find((a) => !a.startsWith('--')) || 'shots/kkbleach';
const FIXTURE = opt('fixture', '');
const NOBJ = +opt('objects', '16');
const MINPIX = +opt('minpix', '24');
const f3 = (x) => (x == null ? '  —  ' : x.toFixed(3));
const f1 = (x) => (x == null ? ' — ' : x.toFixed(1));

const rep = JSON.parse(await readFile(path.join(DIR, 'report.json'), 'utf8'));
console.log(`\nkkbleach report — ${DIR}  (sha ${rep.sha}, ${rep.w}x${rep.h}, stride ${rep.stride})`);

for (const [shot, rec] of Object.entries(rep.shots)) {
  if (!rec.mask) continue;
  const mask = await loadMask(path.join(DIR, rec.mask));

  for (const [grade, g] of Object.entries(rec.grades || {})) {
    const arms = {};
    for (const [aid, file] of Object.entries(g.pngs)) {
      arms[aid] = await score(path.join(DIR, file), mask, { minPix: MINPIX });
    }
    const base = arms.A0;
    if (!base) continue;
    const by = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
    const idx = Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, by(v)]));

    console.log(`\n${'='.repeat(104)}\n${shot} · ${grade}${g.tod != null ? ` (tod ${g.tod})` : ''}\n${'='.repeat(104)}`);

    /* ---- per object, biggest first, split by population -------------------------------- */
    const sortRows = (p) => base.filter((r) => r.pop === p && !r.thin).sort((a, b) => b.n - a.n);
    console.log(`\n  PER OBJECT (A0, eroded masks, n = sampled grid cells)`);
    console.log(`    ${'object'.padEnd(34)} ${'pop'.padEnd(5)} ${'n'.padStart(6)} ${'sat'.padStart(6)} ${'val'.padStart(6)} ${'hue'.padStart(6)} ${'hueR'.padStart(5)} ${'disp°'.padStart(6)} ${'fres'.padStart(6)} ${'edge'.padStart(5)}  rgb`);
    for (const p of ['PROP', 'ARCH', 'CHAR', 'OTHER']) {
      const rows = sortRows(p).slice(0, NOBJ);
      if (!rows.length) continue;
      for (const r of rows) {
        console.log(`    ${r.mesh.slice(0, 34).padEnd(34)} ${r.pop.padEnd(5)} ${String(r.n).padStart(6)} ${f3(r.sat).padStart(6)} ${f3(r.val).padStart(6)} ${f1(r.hue).padStart(6)} ${f3(r.hueR).padStart(5)} ${f1(r.disp).padStart(6)} ${f3(r.fres).padStart(6)} ${f3(r.edgeFrac).padStart(5)}  ${r.rgb.join(',')}`);
      }
      const pl = pool(base, p);
      if (pl) console.log(`    ${('  POOLED ' + p + ' (the statistic §736 published)').padEnd(41)} ${String(pl.n).padStart(6)} ${f3(pl.sat).padStart(6)} ${f3(pl.val).padStart(6)} ${f1(pl.hue).padStart(6)}`);
      console.log('');
    }

    /* ---- attribution ------------------------------------------------------------------- */
    const armIds = Object.keys(arms).filter((a) => a !== 'A0');
    if (armIds.length) {
      console.log(`  ATTRIBUTION — Δsat vs A0 on the SAME masks (positive = the term was costing saturation)`);
      const head = ['population / object'.padEnd(34), ...armIds.map((a) => a.padStart(9))].join(' ');
      console.log(`    ${head}`);
      const line = (label, rowsOf) => {
        const b = rowsOf(base);
        if (!b) return;
        const cells = armIds.map((a) => {
          const r = rowsOf(arms[a]);
          return r == null ? '     —   ' : ((r - b >= 0 ? '+' : '') + (r - b).toFixed(3)).padStart(9);
        });
        console.log(`    ${label.slice(0, 34).padEnd(34)} ${cells.join(' ')}   (A0 ${f3(b)})`);
      };
      for (const p of ['PROP', 'ARCH', 'CHAR']) {
        line(`POOLED ${p}`, (rows) => pool(rows, p)?.sat);
      }
      console.log('');
      const focus = sortRows('PROP').slice(0, NOBJ).concat(sortRows('ARCH').slice(0, 4));
      for (const r of focus) line(`  ${r.mesh}`, (rows) => (rows === base ? r.sat : idx[Object.keys(arms).find((k) => arms[k] === rows)]?.[r.id]?.sat));
      console.log('');
    }

    /* ---- curvature correlation ---------------------------------------------------------- */
    const props = sortRows('PROP');
    if (props.length > 3) {
      const n = props.length;
      const mx = props.reduce((s, r) => s + r.disp, 0) / n;
      const my = props.reduce((s, r) => s + r.sat, 0) / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (const r of props) { sxy += (r.disp - mx) * (r.sat - my); sxx += (r.disp - mx) ** 2; syy += (r.sat - my) ** 2; }
      const rr = sxy / Math.sqrt(sxx * syy || 1);
      const corr = (get) => {
        const mm = props.reduce((s, r) => s + get(r), 0) / n;
        let xy = 0, xx = 0;
        for (const r of props) { xy += (get(r) - mm) * (r.sat - my); xx += (get(r) - mm) ** 2; }
        return xy / Math.sqrt(xx * syy || 1);
      };
      console.log(`  SHAPE — over ${n} prop bodies, correlation of A0 saturation with:`);
      console.log(`    normal dispersion ${rr.toFixed(3)}   fresnel ${corr((r) => r.fres).toFixed(3)}   silhouette fraction ${corr((r) => r.edgeFrac).toFixed(3)}   log screen area ${corr((r) => Math.log(r.n)).toFixed(3)}`);
      /* The same four, on the CONFOUND arm where every body wears one albedo. A correlation
         that survives KKUNI is geometry; one that does not was the atlas all along. */
      if (arms.KKUNI) {
        const u = by(arms.KKUNI);
        const P = props.filter((r) => u[r.id]);
        if (P.length > 3) {
          const uy = P.reduce((s, r) => s + u[r.id].sat, 0) / P.length;
          let uyy = 0; for (const r of P) uyy += (u[r.id].sat - uy) ** 2;
          const uc = (get) => {
            const mm = P.reduce((s, r) => s + get(r), 0) / P.length;
            let xy = 0, xx = 0;
            for (const r of P) { xy += (get(r) - mm) * (u[r.id].sat - uy); xx += (get(r) - mm) ** 2; }
            return xy / Math.sqrt(xx * uyy || 1);
          };
          console.log(`    KKUNI (one albedo, n ${P.length}, mean sat ${uy.toFixed(3)}): dispersion ${uc((r) => r.disp).toFixed(3)}   fresnel ${uc((r) => r.fres).toFixed(3)}   silhouette ${uc((r) => r.edgeFrac).toFixed(3)}   log area ${uc((r) => Math.log(r.n)).toFixed(3)}`);
        }
      }
      const lo = props.slice().sort((a, b) => a.disp - b.disp).slice(0, 3);
      const hi = props.slice().sort((a, b) => b.disp - a.disp).slice(0, 3);
      console.log(`    flattest 3: ${lo.map((r) => `${r.mesh} disp ${f1(r.disp)} sat ${f3(r.sat)}`).join(' | ')}`);
      console.log(`    roundest 3: ${hi.map((r) => `${r.mesh} disp ${f1(r.disp)} sat ${f3(r.sat)}`).join(' | ')}`);
    }
  }

  /* ---- the on-disk fixture, scored through the SAME code path -------------------------- */
  if (FIXTURE) {
    const rows = await score(FIXTURE, mask, { minPix: MINPIX });
    console.log(`\n  FIXTURE ${FIXTURE} scored against ${shot}'s mask (registration + metric check)`);
    for (const p of ['PROP', 'ARCH']) {
      const pl = pool(rows, p);
      if (pl) console.log(`    POOLED ${p.padEnd(5)} n ${String(pl.n).padStart(6)}  sat ${f3(pl.sat)}  val ${f3(pl.val)}  hue ${f1(pl.hue)}`);
    }
    for (const r of rows.filter((x) => !x.thin).sort((a, b) => b.n - a.n).slice(0, NOBJ)) {
      console.log(`    ${r.mesh.slice(0, 34).padEnd(34)} ${r.pop.padEnd(5)} ${String(r.n).padStart(6)} sat ${f3(r.sat)} val ${f3(r.val)} hue ${f1(r.hue)} disp ${f1(r.disp)}  rgb ${r.rgb.join(',')}`);
    }
  }
}
console.log('');
