import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  INK_PX, INK_NO_FALLOFF, INK_REF_ROWS, INK_PX_MIN, INK_PX_MAX,
  inkPixels, inkResScale, syncInkResolution, OUTLINE_VERT_PATCHED,
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

/* ──────────────────────────────────────────────────────────────────────────────────────────
   ONE WIDTH, AND NOW ALSO ONE *SCALE* — critic pass 8's ranked ink complaint.
   "Ink width varies 1 px -> 29 px on a single character in one frame ... at 76 px tall in
   `courtyard`, median ink is 5 px = 6.6% of his height."

   The half of that this file owns is the denominator. `INK_PX` was a constant number of DEVICE
   pixels, so the line's share of the frame doubled every time the frame height halved: 2.5 px is
   0.23% of a 1080-row frame and 0.69% of a 360-row one. The tests below lock the fraction, not
   the pixel count, and each carries an arm on the SHIPPED model that must fail the same test.
   ────────────────────────────────────────────────────────────────────────────────────── */

test('ink: width is a constant FRACTION of the frame, not a constant pixel count', () => {
  const rows = [540, 720, 900, 1080, 1440, 2160];
  const frac = rows.map((r) => inkPixels(r) / r);
  const spread = Math.max(...frac) / Math.min(...frac);
  assert.ok(spread < 1.001,
    `ink is ${spread.toFixed(3)}x heavier at one resolution than another`);
  assert.equal(inkPixels(INK_REF_ROWS), INK_PX, 'the reference height must return the authored width');
  assert.equal(inkResScale(INK_REF_ROWS), 1, 'the crease pass must be unscaled at the reference');

  /* CALIBRATION: the shipped model — a constant INK_PX at every resolution — MUST fail this, or
     the assertion above is a property the defect also had. */
  const old = rows.map((r) => INK_PX / r);
  const oldSpread = Math.max(...old) / Math.min(...old);
  assert.ok(oldSpread > 3.9,
    `calibration arm is dead: the constant-px model spanned only ${oldSpread.toFixed(2)}x`);
});

test('ink: the clamps bind where they are documented to and nowhere else', () => {
  assert.equal(inkPixels(360), INK_PX_MIN, '360 rows is below the floor and must clamp');
  assert.equal(inkPixels(2160), INK_PX_MAX, '4K sits exactly at the ceiling');
  assert.ok(inkPixels(1439) < INK_PX_MAX, 'the ceiling must not bind below 4K');
  assert.ok(inkPixels(541) > INK_PX_MIN, 'the floor must not bind at 540 rows');
  /* A missing or nonsense row count falls back to the authored width, never to 0 — a zero width is
     every ink line in the game gone, silently. */
  for (const bad of [undefined, null, NaN, 0, -720, Infinity]) assert.equal(inkPixels(bad), INK_PX);
});

test('ink: one resolution sync retunes every live material, including ones made after it', () => {
  const sh = new Shading(fakeEngine());
  const a = sh.outline(boxMesh(), { thickness: 1 }).material;
  const b = sh.outline(boxMesh({ weights: [0.85] }), { thickness: 1.05 }).material;
  try {
    assert.notEqual(inkPixels(720), INK_PX, 'the arm is inert if 720 rows is the reference');
    assert.equal(syncInkResolution(720), 720);
    assert.equal(a.uniforms.uThickness.value, inkPixels(720));
    assert.equal(b.uniforms.uThickness.value, inkPixels(720));

    /* A material created AFTER a sync must be born at the current width: the sync early-outs on an
       unchanged row count, so nothing would ever correct it. */
    const c = sh.outline(boxMesh({ weights: [0.6] }), { thickness: 1.25 }).material;
    assert.equal(c.uniforms.uThickness.value, inkPixels(720));

    /* The instrument seam: a per-material scale that SURVIVES the per-frame sync, so a one-boot A/B
       can double the line without the next frame overwriting its poke. The first inkw run lost its
       whole hull arm to a lever that was overwritten exactly like that. */
    a.userData.slyInkScale = 2;
    syncInkResolution(1080);
    assert.equal(a.uniforms.uThickness.value, inkPixels(1080) * 2);
    assert.equal(b.uniforms.uThickness.value, inkPixels(1080));
  } finally {
    syncInkResolution(INK_REF_ROWS);
  }
});

test('ink: the depth push cannot move the hull in x or y', () => {
  assert.ok(!OUTLINE_VERT_PATCHED.includes('mvPosition.z *= 1.0 + uDepthPush'),
    'the view-space depth push is still in the program the shells compile');
  assert.ok(OUTLINE_VERT_PATCHED.includes('gl_Position.z = slyPushed.z'),
    'the clip-space replacement is not in the program the shells compile');
  assert.equal(createOutlineMaterial({}).vertexShader, OUTLINE_VERT_PATCHED,
    'the material compiles a different source than the one this test just checked');

  /* Reproduce both forms in float arithmetic. The shipped one scales gl_Position.w while leaving
     gl_Position.xy alone, so the whole shell is pulled toward the frame centre; the replacement
     copies only ndc.z across. CALIBRATION is the first assertion: the shipped form MUST displace,
     or this test would pass on a build that never had the defect. */
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 4000);
  cam.updateProjectionMatrix();
  const P = cam.projectionMatrix, k = 1.0022, W = 1920;
  const ndc = (v) => new THREE.Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
  const z = -10, tan = Math.tan(THREE.MathUtils.degToRad(46) / 2);
  const p = new THREE.Vector4(1.0 * tan * (16 / 9) * -z, 0, z, 1);      // NDC x = 1, the frame edge

  const plain = ndc(p.clone().applyMatrix4(P));
  const shipped = ndc(new THREE.Vector4(p.x, p.y, p.z * k, 1).applyMatrix4(P));
  const pushed = new THREE.Vector4(p.x, p.y, p.z * k, 1).applyMatrix4(P);
  const g = p.clone().applyMatrix4(P);
  g.z = pushed.z * (g.w / pushed.w);
  const fixed = ndc(g);

  const dxShipped = Math.abs(shipped.x - plain.x) * W / 2;
  assert.ok(dxShipped > 1.5,
    `calibration arm is dead: the shipped push displaced only ${dxShipped.toFixed(2)} px`);
  assert.ok(Math.abs(fixed.x - plain.x) * W / 2 < 1e-6, 'the replacement still displaces the hull');
  assert.ok(Math.abs(fixed.z - shipped.z) < 1e-6, 'the replacement changed the depth bias it exists for');
});

test('ink: the clip-space push is exact under an orthographic projection too', () => {
  /* The shells never reach the shadow map today, but the replacement must not be silently
     perspective-only: the w-ratio is what makes it general, and a future ortho path would
     otherwise get a bias that is wrong in a way nothing would report. */
  const cam = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 200);
  cam.updateProjectionMatrix();
  const P = cam.projectionMatrix, k = 1.0022;
  const ndc = (v) => new THREE.Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
  for (const z of [-1, -20, -150]) {
    const p = new THREE.Vector4(3, 2, z, 1);
    const shipped = ndc(new THREE.Vector4(p.x, p.y, p.z * k, 1).applyMatrix4(P));
    const pushed = new THREE.Vector4(p.x, p.y, p.z * k, 1).applyMatrix4(P);
    const g = p.clone().applyMatrix4(P);
    g.z = pushed.z * (g.w / pushed.w);
    const fixed = ndc(g);
    assert.ok(Math.abs(fixed.z - shipped.z) < 1e-9, `ortho depth bias differs at z = ${z}`);
    assert.ok(Math.abs(fixed.x - shipped.x) < 1e-12, `ortho x differs at z = ${z}`);
  }
});
