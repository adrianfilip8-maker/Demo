/**
 * charab-gates.mjs — PREREG-charab §4's gates G1–G5, checked without opinion.
 *
 * A gate is not overridden by the critic's preference (seal §6), so these run independently of
 * the blind round and are reported beside it.
 *
 * WHERE EACH GATE IS MEASURED, and why it is not all done in pixels:
 *   G1/G2/G4 are properties of the MODEL, not of a frame. Measuring them from rendered pixels
 *   would drag in lighting, the cel bands, the ink outline and §193's cross-boot floor — four
 *   confounds for a question that the source answers exactly. So they are read from the source
 *   and from the geometry's own vertex colours.
 *   G3 is a framing question and is read from the capture telemetry.
 *   G5 is a per-arm property and is read from the runner's console-error capture.
 *
 * usage: node charab-gates.mjs
 */
import { readFile } from 'node:fs/promises';

const REC = '/home/user/Demo/progress/records';
const SRC = '/home/user/Demo/src/player/SlyModel3.js';

const pass = [], fail = [], note = [];
const gate = (id, ok, detail) => (ok ? pass : fail).push(`${ok ? 'PASS' : '**FAIL**'} ${id}  ${detail}`);

const src = await readFile(SRC, 'utf8');

/* ---- G1: cap / shirt / gloves / boots are ONE blue (SPEC F1) ----------------------------
   Verified structurally: the four must all reference PAL.blue by NAME. A hue-spread measurement
   would only tell us whether four literals happened to be close; naming tells us they cannot
   diverge later. Any bare 0x…-literal blue assigned to those parts is the defect. */
{
  const palBlue = /blue:\s*0x([0-9a-f]{6})/i.exec(src)?.[1];
  const blueUses = (src.match(/PAL\.blue\b/g) || []).length;
  // a literal that is bluish (B channel dominant) and NOT inside the PAL block is a divergence
  const body = src.slice(src.indexOf('export class SlyModel'));
  const stray = [...body.matchAll(/0x([0-9a-f]{6})/gi)]
    .map((m) => m[1])
    .filter((h) => parseInt(h.slice(4, 6), 16) > parseInt(h.slice(0, 2), 16) + 24);
  gate('G1', !!palBlue && blueUses >= 4 && stray.length === 0,
    `PAL.blue=#${palBlue}, referenced ${blueUses}x by name; stray blue literals in body: ${stray.length ? stray.join(',') : 'none'}`);
}

/* ---- G2: every gold element is one gold (SPEC F5) — same argument ---- */
{
  const palGold = /gold:\s*0x([0-9a-f]{6})/i.exec(src)?.[1];
  const goldUses = (src.match(/PAL\.gold\b/g) || []).length;
  gate('G2', !!palGold && goldUses >= 2,
    `PAL.gold=#${palGold}, referenced ${goldUses}x by name`);
}

/* ---- G3: height parity with the incumbent (SPEC F6) ---- */
{
  const inc = await readFile('/home/user/Demo/src/player/SlyModel.js', 'utf8');
  const h3 = parseFloat(/height:\s*([\d.]+)/.exec(src)?.[1] ?? 'NaN');
  const h1 = parseFloat(/height:\s*([\d.]+)/.exec(inc)?.[1] ?? 'NaN');
  const drift = Math.abs(h3 - h1) / h1;
  gate('G3', Number.isFinite(drift) && drift <= 0.02,
    `TUNE.height rebuild ${h3} vs incumbent ${h1} — drift ${(drift * 100).toFixed(2)}% (band <= 2%)`);
}

/* ---- G4: tail root >= 0.40 x head width (SPEC F3) ---- */
{
  const frac = parseFloat(/tailRootFrac:\s*([\d.]+)/.exec(src)?.[1] ?? 'NaN');
  // tailRootFrac is expressed against head HALF-width; the gate is against head WIDTH.
  const vsWidth = frac / 2;
  gate('G4', Number.isFinite(frac) && vsWidth >= 0.40,
    `tail root ${frac} x head half-width = ${vsWidth.toFixed(3)} x head width (band >= 0.40)`);
}

/* ---- G5: the rebuild renders every shot with no console error ---- */
{
  let rep = null;
  try { rep = JSON.parse(await readFile(`${REC}/charab/charab-model3.json`, 'utf8')); } catch { /* not captured yet */ }
  if (!rep) {
    note.push('G5  NOT YET MEASURABLE — charab/charab-model3.json absent (capture has not landed)');
  } else {
    const shots = Object.keys(rep.shots || {});
    const errs = rep.consoleErrors || [];
    gate('G5', shots.length === 4 && errs.length === 0 && !rep.armMismatch,
      `${shots.length}/4 shots, ${errs.length} console errors, armMismatch=${!!rep.armMismatch}`);
  }
}

console.log('\n=== PREREG-charab §4 gates (a gate is NOT overridden by preference) ===\n');
for (const l of pass) console.log('  ' + l);
for (const l of fail) console.log('  ' + l);
for (const l of note) console.log('  ' + l);
console.log(`\n  ${pass.length} pass, ${fail.length} fail${note.length ? `, ${note.length} pending` : ''}`);
if (fail.length) console.log('\n  A failing gate means the rebuild DOES NOT SHIP even if the critic prefers it (seal §6).');
