import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  INK_PX, INK_NO_FALLOFF,
  createOutlineMaterial, applyInkWeights, buildOutlineShell, weldNormals, inkAudit,
} from '../src/render/Outline.js';
import { Shading, TUNE } from '../src/render/ToonMaterial.js';

/**
 * ONE INK SYSTEM — the invariants behind critic pass 7 defect #3.
 *
 * The complaint was measured as "ink weight varies 20x across the frame and tracks asset
 * provenance rather than intent". The vertex shader's width is exactly
 *
 *     w_px = uThickness * slyInk * mix(1.0, 0.62, smoothstep(18.0, uFalloff, dist))
 *
 * — three factors, all three readable in plain Node, so the whole width distribution of the
 * shipped level can be checked here rather than inferred from a five-minute capture. What this
 * file locks is that each of the three has exactly one value, and that the *call sites' own
 * arguments* (which is where provenance entered) can no longer move any of them.
 *
 * ── Calibration ────────────────────────────────────────────────────────────────────────
 * Every claim below is paired with an arm that MUST come out differently: the falloff test
 * computes the same expression at the OLD uFalloff (150 m) and requires it to thin the line,
 * so a test that passed because the arithmetic was inert would be caught. Four instruments in
 * this project have returned confident, plausible, wrong nulls (KNOWN_ISSUES §210.2, §211.1,
 * §211.4); an unfalsifiable green is worth less than a red.
 */

/* Widths every call site in `src/` asks for today, read off the source:
     Props.js:575       spec.outline           -> 1.0
     Guard.js:1147      'scarab' ? 0.7 : 1.05
     KayKit.js:277,324  1.0
     SlyModel.js:3898   TUNE.outline / 0.0034  -> 1.0     (legacy model only)
     SlyModel.js:3972   1.25                              (legacy cane)
   Before this change these produced 1.75 / 2.50 / 2.625 / 3.125 device px. */
const CALL_SITE_THICKNESS = [0.7, 1.0, 1.05, 1.25];

/** float32 evaluation of the shader's own width expression. */
const f32 = (x) => Math.fround(x);
function shaderWidth(uThickness, slyInk, uFalloff, dist) {
  const t = Math.min(1, Math.max(0, f32(f32(dist - 18) / f32(uFalloff - 18))));
  const ss = f32(f32(t * t) * f32(3 - f32(2 * t)));
  return f32(f32(uThickness * slyInk) * f32(1 + f32(ss * f32(0.62 - 1))));
}

function fakeEngine() {
  return {
    quality: 'high', scene: new THREE.Scene(), renderer: null,
    warn() {}, get: () => null, on() {}, emit() {},
  };
}

function boxMesh({ weights = [1], grouped = false } = {}) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const mats = weights.map((w) => {
    const m = new THREE.MeshBasicMaterial();
    m.userData.outline = w;
    return m;
  });
  if (grouped) {
    g.clearGroups();
    const per = Math.floor(36 / weights.length);
    weights.forEach((_, i) => g.addGroup(i * per, per, i));
  }
  return new THREE.Mesh(g, mats.length === 1 ? mats[0] : mats);
}

const inkRange = (geo) => {
  const a = geo.getAttribute('slyInk');
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.count; i++) { const v = a.getX(i); if (v < mn) mn = v; if (v > mx) mx = v; }
  return [mn, mx];
};

/* ────────────────────────────────────────────────────────────────────────────────────── */

test('ink: every call site in the level gets the same device-pixel width', () => {
  const sh = new Shading(fakeEngine());
  const widths = new Set();
  for (const t of CALL_SITE_THICKNESS) {
    const shell = sh.outline(boxMesh(), { thickness: t });
    assert.ok(shell, `thickness ${t} produced no shell`);
    widths.add(shell.material.uniforms.uThickness.value);
  }
  assert.equal(widths.size, 1, `call sites still disagree about width: ${[...widths]}`);
  assert.equal([...widths][0], INK_PX);

  /* CALIBRATION: the old rule was `TUNE.inkPx * thickness`, and it MUST have disagreed —
     otherwise this test would pass on a build that never had the defect. */
  const old = new Set(CALL_SITE_THICKNESS.map((t) => Math.max(TUNE.inkPx * t, 0.35)));
  assert.ok(old.size > 1, 'calibration arm is dead: the call sites never differed');
  assert.ok(Math.max(...old) / Math.min(...old) > 1.5,
    `calibration arm too weak: old spread was only ${Math.max(...old) / Math.min(...old)}x`);
});

test('ink: thickness <= 0 is still a refusal, not a hairline', () => {
  const sh = new Shading(fakeEngine());
  assert.equal(sh.outline(boxMesh(), { thickness: 0 }), null);
  assert.equal(sh.outline(boxMesh(), { thickness: -1 }), null);
});

test('ink: the distance falloff is off, bit-exactly, at every distance in the level', () => {
  const mat = createOutlineMaterial({}, { thickness: 9, falloff: 150 });
  assert.equal(mat.uniforms.uFalloff.value, INK_NO_FALLOFF);
  assert.equal(mat.uniforms.uThickness.value, INK_PX);

  /* The far plane in this level is a few hundred metres; 5000 is well past anything drawn. */
  for (const d of [0, 5, 18, 30, 60, 150, 400, 1000, 5000]) {
    assert.equal(shaderWidth(INK_PX, 1, INK_NO_FALLOFF, d), f32(INK_PX),
      `width changed with distance at ${d} m`);
  }

  /* CALIBRATION: the same arithmetic at the shipped uFalloff MUST thin the line, or the
     expression above is inert and this test proves nothing. */
  assert.equal(shaderWidth(INK_PX, 1, 150, 5), f32(INK_PX), 'falloff should be idle up close');
  const far = shaderWidth(INK_PX, 1, 150, 400);
  assert.ok(far < INK_PX * 0.63 && far > INK_PX * 0.61,
    `calibration arm is dead: old falloff gave ${far} px at 400 m, expected ~${INK_PX * 0.62}`);
});

test('ink: the caller\'s request survives on userData so an A/B can restore it', () => {
  const mat = createOutlineMaterial({}, { thickness: 3.125, falloff: 150 });
  assert.deepEqual(mat.userData.slyInkRequested, { thickness: 3.125, falloff: 150 });
});

test('ink: per-vertex weight is presence, not width', () => {
  /* Positive weights of every magnitude the codebase authors — including the
     fraction-of-frame-height 0.0034 that would otherwise erase the character's line. */
  for (const w of [0.0034, 0.4, 0.6, 0.7, 0.85, 0.9, 1.0, 1.25]) {
    const mesh = boxMesh({ weights: [w, w, w, w, w, w], grouped: true });
    weldNormals(mesh.geometry);
    applyInkWeights(mesh, true);
    assert.deepEqual(inkRange(mesh.geometry), [1, 1], `weight ${w} did not read as full ink`);
  }
  /* Zero is Props.js's documented topology refusal (cloth / glass / flame) and stays a refusal. */
  const refuse = boxMesh({ weights: [0, 0, 0, 0, 0, 0], grouped: true });
  weldNormals(refuse.geometry);
  applyInkWeights(refuse, true);
  assert.deepEqual(inkRange(refuse.geometry), [0, 0]);

  /* Mixed: refusing groups go to 0, everything else to 1, nothing in between. */
  const mixed = boxMesh({ weights: [1, 0, 0.55, 0, 0.0034, 0.85], grouped: true });
  weldNormals(mixed.geometry);
  applyInkWeights(mixed, true);
  const a = mixed.geometry.getAttribute('slyInk');
  for (let i = 0; i < a.count; i++) {
    const v = a.getX(i);
    assert.ok(v === 0 || v === 1, `slyInk[${i}] = ${v}, which is neither presence nor absence`);
  }
  assert.deepEqual(inkRange(mixed.geometry), [0, 1], 'mixed groups should give both states');
});

test('ink: a shelled geometry always carries a weight stream (0.0 would erase every line)', () => {
  const sh = new Shading(fakeEngine());
  const mesh = boxMesh();
  sh.outline(mesh, { thickness: 1 });
  const attr = mesh.geometry.getAttribute('slyInk');
  assert.ok(attr, 'no slyInk attribute: an unbound float attribute reads 0.0, not 1.0');
  assert.deepEqual(inkRange(mesh.geometry), [1, 1]);
});

test('ink: the total width spread across the whole level is 1.00x', () => {
  const sh = new Shading(fakeEngine());
  const seen = [];
  for (const t of CALL_SITE_THICKNESS) {
    const mesh = boxMesh({ weights: [1, 1, 0.85, 0.6, 1, 1], grouped: true });
    const shell = sh.outline(mesh, { thickness: t });
    const [, mx] = inkRange(mesh.geometry);
    for (const d of [2, 20, 120, 600]) {
      seen.push(shaderWidth(shell.material.uniforms.uThickness.value, mx,
        shell.material.uniforms.uFalloff.value, d));
    }
  }
  const lo = Math.min(...seen), hi = Math.max(...seen);
  assert.equal(lo, hi, `ink width still spans ${lo}..${hi} px (${(hi / lo).toFixed(2)}x)`);
  assert.equal(hi, f32(INK_PX));
});

test('ink: inkAudit names meshes that ask for ink and have none', () => {
  const root = new THREE.Group();
  const inked = boxMesh(); inked.name = 'has_shell';
  const bare = boxMesh(); bare.name = 'wants_ink_no_shell';
  const refused = boxMesh({ weights: [0] }); refused.name = 'cloth';
  root.add(inked, bare, refused);

  const mat = createOutlineMaterial({});
  buildOutlineShell(inked, mat);

  const a = inkAudit(root);
  assert.equal(a.inked, 1);
  assert.equal(a.missing, 1);
  assert.equal(a.refused, 1);
  assert.deepEqual(a.names, ['wants_ink_no_shell']);

  /* CALIBRATION: shelling the bare mesh MUST move the count, or the audit is reading nothing. */
  buildOutlineShell(bare, mat);
  const b = inkAudit(root);
  assert.equal(b.missing, 0);
  assert.equal(b.inked, 2);
});
