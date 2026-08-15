/**
 * granitab — attribute `granite_pink`'s red between its base hexes and its final `hueGrade`.
 *
 *   node progress/records/granite/granitab.mjs
 *   node progress/records/granite/granitab.mjs --all      # whole catalogue, both arms
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 *
 * The colossus's lit face measures linear R/G **5.48** against hero's 1.47 (§341, NOTE-colossus-
 * albedo). Route A.1 established offline that the 19 stone parts of `seatedColossus` resolve to
 * `Props.MAT.stone` -> tex `granite_pink` x tint `0x9c8278`, and that the shipped baked albedo of
 * `granite_pink` carries mean linear R/G **4.260** — rank 1 of 23, 56 % above the next material
 * and 2.06x `carnelian_inlay`, the recipe actually named for being red. 1.489 x 4.260 = 6.35
 * predicted against 5.48 measured.
 *
 * That located the red in the TEXTURE. It did not say **which stage of the texture**, and those
 * are different fixes:
 *
 *   - if the base hexes are red, the mineral mix is what wants changing;
 *   - if `hueGrade(s, HUE.granite)` is red, one row of an eleven-row table is.
 *
 * `HUE.granite` is `{ lo: -16, mid: -15, hi: -7, satLo: 1.35, satMid: 1.20, satHi: 1.02 }` and it
 * is conspicuous twice over in that table: the only entry of eleven whose three hue rotations are
 * **all negative** (1/11), and the only one whose **highlight saturation is boosted rather than
 * held or cut** (`satHi` 1.02; gold alone matches it at exactly 1.0, the other nine run 0.66–0.88).
 * So it is the obvious suspect — which is exactly why it gets measured rather than blamed.
 *
 * ── Why it can be trusted ────────────────────────────────────────────────────────────────────
 *
 * `hueGrade` ships with its own A/B lever (`abOff('huegrade')`, Canvas2D.js:1035) and `TEX_AB()` is
 * read **per call, never latched** (Textures.js:106) precisely so a lab can bake the same recipe
 * twice in one process with the treatment on and off. `Bake.bake()` is THREE-free and pure, so
 * this needs no browser, no capture lock, and no frame: it is CPU arithmetic on two byte buffers
 * built by the same function from the same seed.
 *
 * **The control is proven, not asserted** (§340). Before either arm is read, the CTL arm is baked
 * at the manifest's own `guardSize` and its albedo digest is checked against the `guard` string
 * committed in `baked.json` — the digest `bakeassets.mjs` recorded from a Node bake and
 * cross-checked against the browser's. If CTL does not reproduce that byte-for-byte the run
 * aborts and reports nothing, because an arm whose state I cannot prove is not a control.
 *
 * A second CTL arm at full `size` is checked against the shipped **slot** digest, which closes the
 * loop the other way: it proves the fresh build and the committed blob are the same bytes, so the
 * 4.260 read off `textures.bin` and the numbers printed here are measurements of one object.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

const { bake } = await import(path.join(ROOT, 'src/textures/Bake.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/textures/baked.json'), 'utf8'));

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);

/** `bakeassets.mjs`'s digest, copied rather than imported — that file is a script, not a module. */
const digest = (u8) => {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < u8.length; i++) {
    a ^= u8[i]; a = Math.imul(a, 0x01000193);
    b = Math.imul(b ^ u8[i], 0x85ebca6b); b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
};

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Mean sRGB byte and mean LINEAR channel of an RGBA buffer, plus the ratios that matter here. */
function stats(rgba) {
  const n = rgba.length / 4;
  let sr = 0, sg = 0, sb = 0, lr = 0, lg = 0, lb = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    sr += rgba[i]; sg += rgba[i + 1]; sb += rgba[i + 2];
    lr += LIN[rgba[i]]; lg += LIN[rgba[i + 1]]; lb += LIN[rgba[i + 2]];
  }
  const s = [sr / n, sg / n, sb / n], l = [lr / n, lg / n, lb / n];
  // HSV saturation of the mean sRGB colour — the "is it pink or is it terracotta" axis.
  const mx = Math.max(...s), mn = Math.min(...s);
  return { srgb: s, lin: l, linRG: l[0] / l[1], srgbRG: s[0] / s[1], satV: mx > 0 ? (mx - mn) / mx : 0 };
}

/** Bake one recipe on one A/B arm. `TEX_AB()` is read per call, so the flip is safe mid-process. */
function arm(name, size, ab) {
  globalThis.__TEX_AB = ab;
  const out = bake(name, size, 'high');
  globalThis.__TEX_AB = '';
  return out;
}

const GUARD = manifest.guardSize;
const TEX = manifest.texSize;

/* ═══════════════════ 1. prove the control (§340) ═══════════════════ */

function proveControl(name) {
  const rec = manifest.recipes[name];
  const wantGuard = rec.guard.split('/')[0];
  const g = arm(name, GUARD, '');
  const gotGuard = digest(g.albedo);
  const wantSlot = rec.slots.albedo.digest;
  const f = arm(name, TEX, '');
  const gotSlot = digest(f.albedo);
  const okG = gotGuard === wantGuard, okS = gotSlot === wantSlot;
  console.log(`  CTL guard@${GUARD}  want ${wantGuard}  got ${gotGuard}  ${okG ? 'MATCH' : '*** DIFFERS ***'}`);
  console.log(`  CTL slot @${f.size}  want ${wantSlot}  got ${gotSlot}  ${okS ? 'MATCH' : '*** DIFFERS ***'}`);
  return { ok: okG && okS, full: f };
}

/* ═══════════════════ 2. the arms ═══════════════════ */

function report(name) {
  console.log(`\n═══ ${name} ═══`);
  const { ok, full } = proveControl(name);
  if (!ok) {
    console.log('  CONTROL NOT PROVEN — aborting, no arm is readable from an unproven baseline.');
    return null;
  }
  const ctl = stats(full.albedo);
  const off = stats(arm(name, TEX, 'huegrade').albedo);
  const row = (tag, m) => console.log(
    `  ${tag.padEnd(16)} sRGB(${m.srgb.map((v) => v.toFixed(1).padStart(5)).join(',')})`
    + `  lin(${m.lin.map((v) => v.toFixed(4)).join(',')})`
    + `  linR/G ${m.linRG.toFixed(3).padStart(6)}  satV ${m.satV.toFixed(3)}`);
  row('CTL (shipped)', ctl);
  row('A1 no huegrade', off);
  const d = ctl.linRG - off.linRG;
  console.log(`  ATTRIBUTION      hueGrade contributes ${d >= 0 ? '+' : ''}${d.toFixed(3)} of linear R/G`
    + `  (${((d / (ctl.linRG - 1)) * 100).toFixed(1)}% of the excess over neutral)`);
  return { name, ctl, off, d };
}

const names = has('all') ? Object.keys(manifest.recipes).filter((n) => manifest.recipes[n].nodeBakeable)
  : ['granite_pink'];

const rows = [];
for (const n of names) { const r = report(n); if (r) rows.push(r); }

if (rows.length > 1) {
  rows.sort((a, b) => b.ctl.linRG - a.ctl.linRG);
  console.log(`\n${'material'.padEnd(22)}${'CTL R/G'.padStart(9)}${'A1 R/G'.padStart(9)}${'delta'.padStart(9)}`);
  console.log('-'.repeat(49));
  for (const r of rows) {
    console.log(r.name.padEnd(22) + r.ctl.linRG.toFixed(3).padStart(9)
      + r.off.linRG.toFixed(3).padStart(9) + (r.ctl.linRG - r.off.linRG).toFixed(3).padStart(9));
  }
}
