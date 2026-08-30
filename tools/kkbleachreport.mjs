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
/* `--at 963,400 520,372 …` — WHICH OBJECT is at this pixel, and under which material.
   §730 put the vault's canopic jars back as PROCEDURAL bodies, so a hand patch on "a jar" in
   the crypt is not necessarily on the KayKit recipe at all. A comparison whose two halves turn
   out to wear different materials is §442 again, and the cheap defence is to measure the
   composition rather than derive it from what the object looks like. */
const AT = String(opt('at', '')).split(/\s+/).filter(Boolean);
const f3 = (x) => (x == null ? '  —  ' : x.toFixed(3));
const f1 = (x) => (x == null ? ' — ' : x.toFixed(1));

const rep = JSON.parse(await readFile(path.join(DIR, 'report.json'), 'utf8'));
console.log(`\nkkbleach report — ${DIR}  (sha ${rep.sha}, ${rep.w}x${rep.h}, stride ${rep.stride})`);

for (const [shot, rec] of Object.entries(rep.shots)) {
  if (!rec.mask) continue;
  const mask = await loadMask(path.join(DIR, rec.mask));

  if (AT.length) {
    console.log(`\n  WHAT IS AT THIS PIXEL — ${shot} mask (stride ${mask.stride})`);
    for (const spec of AT) {
      const [px, py] = spec.split(',').map(Number);
      const gx = Math.round(px / mask.stride), gy = Math.round(py / mask.stride);
      const gi = gy * mask.gw + gx;
      const id = (gx >= 0 && gx < mask.gw && gy >= 0 && gy < mask.gh) ? mask.ids[gi] : -1;
      const o = mask.objects.find((x) => x.id === id);
      const fr = id >= 0 ? (mask.fres[gi] / 255).toFixed(3) : '—';
      console.log(`    (${px},${py})  ${o ? `${o.pop.padEnd(5)} ${o.mesh}  material ${o.mat}` : 'no object (sky / hidden fx / out of frame)'}   fres ${fr}`);
    }
  }

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
    console.log(`    ${'object'.padEnd(34)} ${'pop'.padEnd(5)} ${'n'.padStart(6)} ${'sat'.padStart(6)} ${'val'.padStart(6)} ${'hue'.padStart(6)} ${'hueR'.padStart(5)} ${'disp°'.padStart(6)} ${'fres'.padStart(6)} ${'edge'.padStart(5)} ${'hp3'.padStart(6)} ${'sdL'.padStart(6)}  rgb`);
    for (const p of ['PROP', 'ARCH', 'CHAR', 'OTHER']) {
      const rows = sortRows(p).slice(0, NOBJ);
      if (!rows.length) continue;
      for (const r of rows) {
        console.log(`    ${r.mesh.slice(0, 34).padEnd(34)} ${r.pop.padEnd(5)} ${String(r.n).padStart(6)} ${f3(r.sat).padStart(6)} ${f3(r.val).padStart(6)} ${f1(r.hue).padStart(6)} ${f3(r.hueR).padStart(5)} ${f1(r.disp).padStart(6)} ${f3(r.fres).padStart(6)} ${f3(r.edgeFrac).padStart(5)} ${(r.hp3 == null ? '   —  ' : r.hp3.toFixed(2).padStart(6))} ${(r.sdL == null ? '   —  ' : r.sdL.toFixed(2).padStart(6))}  ${r.rgb.join(',')}`);
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
      /* The quantity that actually matters. The owner's sentence is comparative — the
         architecture reads right and the props do not — so a term only counts as a CAUSE of
         this complaint if removing it closes the gap. A term that lifts both populations
         equally is a global look decision, not this defect; a term that lifts the ARCHITECTURE
         more makes the complaint worse while raising every absolute number, which is exactly
         how a lane could ship a "+0.17 saturation" headline and be told the props still look
         faded. Negative = the gap narrowed = the term was costing the props specifically. */
      const gapOf = (rows) => {
        const a = pool(rows, 'ARCH')?.sat, p = pool(rows, 'PROP')?.sat;
        return a != null && p != null ? a - p : null;
      };
      const g0 = gapOf(base);
      if (g0 != null) {
        const cells = armIds.map((a) => {
          const gg = gapOf(arms[a]);
          return gg == null ? '     —   ' : ((gg - g0 >= 0 ? '+' : '') + (gg - g0).toFixed(3)).padStart(9);
        });
        console.log(`    ${'ARCH-PROP GAP (neg = gap closed)'.padEnd(34)} ${cells.join(' ')}   (A0 ${f3(g0)})`);
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
      /* VARIANCE, with the control §736 could not get to pass. Printed as a block because the
         numbers only mean anything next to each other: the flat-paint arm is the floor any
         within-body high-pass can reach through PostFX alone, and the textured architecture is
         the ceiling the props are being compared against. */
      const hpOf = (rows, pred) => {
        const r = rows.filter(pred).filter((x) => x.hp3 != null && x.hpN > 40);
        if (!r.length) return null;
        let s2 = 0, w = 0;
        for (const x of r) { s2 += x.hp3 * x.hpN; w += x.hpN; }
        return { hp: s2 / w, n: r.length, cells: w };
      };
      const pr = (x) => x.pop === 'PROP', ar = (x) => x.pop === 'ARCH';
      const rowsF = [
        ['PROP  A0 (shipped)', hpOf(base, pr)],
        ['ARCH  A0 (known-textured, NEG control)', hpOf(base, ar)],
        arms.CTLGREY ? ['PROP  CTLGREY flat paint (POS control: must collapse)', hpOf(arms.CTLGREY, pr)] : null,
        arms.CTLGREY ? ['ARCH  CTLGREY (untouched: must NOT move)', hpOf(arms.CTLGREY, ar)] : null,
        arms.KKUNI ? ['PROP  KKUNI one albedo, real shader', hpOf(arms.KKUNI, pr)] : null,
      ].filter(Boolean);
      console.log(`  WITHIN-BODY LUMA VARIANCE (hp3 = RMS of luma minus its local 7x7 mean, window wholly inside the eroded body)`);
      for (const [lab, v] of rowsF) {
        if (!v) { console.log(`    ${lab.padEnd(50)}  (no body large enough)`); continue; }
        console.log(`    ${lab.padEnd(50)}  hp3 ${v.hp.toFixed(2).padStart(6)}   over ${v.n} bodies / ${v.cells} cells`);
      }
      /* The verdict is PRINTED, not left to the reader. §736's variance instrument was quoted
         for a while before anyone looked at its control row; a control that has to be noticed
         to work is not a control. */
      const a0p = hpOf(base, pr), ctp = arms.CTLGREY ? hpOf(arms.CTLGREY, pr) : null;
      if (a0p && ctp) {
        const ok = ctp.hp < a0p.hp * 0.5;
        console.log(`    VERDICT: positive control ${ok ? 'PASSES' : 'FAILS'} — flat unlit paint reads hp3 ${ctp.hp.toFixed(2)} against ${a0p.hp.toFixed(2)} for the shipped textured body.`);
        if (!ok) {
          console.log(`    ==> NO VARIANCE CONCLUSION MAY BE DRAWN FROM THIS RUN. A surface with no texture at all cannot`);
          console.log(`        carry more local contrast than a textured one, so this statistic is measuring something other`);
          console.log(`        than the surface. The prime suspect is PostFX's INK pass, which draws depth/normal edges`);
          console.log(`        INSIDE a body's silhouette (a barrel's rim against its own staves) where no erosion can reach`);
          console.log(`        them; on flat paint those lines are the only signal there is. The arm that would settle it is`);
          console.log(`        the edge pass disabled in BOTH arms, which this run does not carry.`);
        }
      }
      console.log('');

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
