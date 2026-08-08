import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';
import {
  TUNE, ContactDecals, contactDiscGeometry, groundFootprint, baseRadiusOf,
  reachFor, shadowLengthOf, tintMultiplier, SHADOW_LEN_MAX,
} from '../src/world/Decals.js';

/**
 * Props — the geometric contact decal, and hull presence on KayKit set dress.
 *
 * The defect these guard, measured on `progress/records/grain1/interior.g00.png` by profiling
 * median luminance in 1 px rings outward from each KayKit prop's rasterised silhouette: the
 * floor PEAKS 5 px out from the silhouette and falls away from there — +2.06 L pooled, up to
 * +12.91 L on the coin stack beside Sly, against a settled floor at 18–26 px. Props were not
 * un-grounded, they were ANTI-grounded. Same 4–5 px peak in `temple` and `courtyard`.
 *
 * Nothing here renders a frame. What is checkable in plain Node in milliseconds is the class of
 * mistake this project keeps paying for — a knob whose stated meaning and applied value
 * diverge, a shape claim the geometry does not actually have, and a screen size that was
 * assumed rather than computed:
 *
 *  1. THE SHAPE IS BANDED, NOT A GRADIENT. The whole argument for this decal over a soft blob
 *     is that a cel frame with a 3-band ramp cannot carry a smooth one. That is a property of
 *     the geometry, so it is asserted on the geometry.
 *  2. THE SCREEN SIZE CLEARS THE TEXEL FLOOR AT EVERY SHIPPED SHOT. This feature exists because
 *     POSTFX's 4.5 cm screen-space term subtends 1.11 px at `courtyard`. A geometric decal that
 *     also vanished there would be a second null. Every camera, fov and placement is importable
 *     and every KayKit footprint is on disk, so this is arithmetic, not a thing to discover in
 *     a capture.
 *  3. THE REACH STAYS INSIDE THE REAL CAST SHADOW. Shadow maps are on; this term is the
 *     contact, not a second cast shadow. An earlier revision scaled the reach off the RADIUS
 *     and produced a 5.3 m ellipse under a crate whose real shadow is 4.4 m long.
 *  4. THE FOOTPRINT DOES NOT DEPEND ON TESSELLATION. The revision before that averaged over
 *     azimuth wedges, which collapsed a 10-sided vessel's radius to a third of the truth.
 *  5. THE OFF ARM IS ACTUALLY OFF, and `state()` reports the uniform rather than `TUNE`.
 *  6. HULL PRESENCE TRACKS ROLE. KayKit is set dress; §2.1.2 gives the inverted hull to
 *     characters and hero props. Asserted against the source so the call site cannot come back.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KAYKIT_SRC = fs.readFileSync(path.join(HERE, '../src/world/KayKit.js'), 'utf8');
const DECALS_SRC = fs.readFileSync(path.join(HERE, '../src/world/Decals.js'), 'utf8');
const ASSETS = path.join(HERE, '../public/assets/kaykit');

// ---------------------------------------------------------------------------------------------
// 1. the shape
// ---------------------------------------------------------------------------------------------

test('contact decal: the profile is two flat bands, not a gradient', () => {
  const d = contactDiscGeometry();
  const levels = [...new Set(Array.from(d.alpha))].sort((a, b) => b - a);
  /* 1.0 (core), the skirt, and 0.0 at the rim. Three levels is the 3-band ramp's own grammar
     (AGENTS §2.1.1); a soft blob would have one level per ring. */
  assert.equal(levels.length, 3, `expected 3 alpha levels, got ${levels.join(', ')}`);
  assert.equal(levels[0], 1);
  // the alphas live in a Float32Array, so compare at float32 precision rather than exactly
  assert.ok(Math.abs(levels[1] - TUNE.skirt) < 1e-6, `skirt level ${levels[1]} != ${TUNE.skirt}`);
  assert.equal(levels[2], 0);

  // monotonically non-increasing outward — a contact shadow never gets darker away from contact
  for (let i = 1; i < d.alphas.length; i++) {
    assert.ok(d.alphas[i] <= d.alphas[i - 1],
      `alpha rises outward at ring ${i}: ${d.alphas[i - 1]} -> ${d.alphas[i]}`);
  }
  // rings are ordered and the outermost is exactly 1, so `radius` means what it says
  for (let i = 1; i < d.rings.length; i++) assert.ok(d.rings[i] >= d.rings[i - 1]);
  assert.equal(d.rings[d.rings.length - 1], 1);
});

test('contact decal: each step is HARD — its radial width is at most 2 x TUNE.soft', () => {
  const d = contactDiscGeometry();
  const outer = TUNE.edge + TUNE.soft;                  // pre-normalisation scale
  const width = (2 * TUNE.soft) / outer;
  for (let i = 1; i < d.alphas.length; i++) {
    if (d.alphas[i] === d.alphas[i - 1]) continue;      // flat band, not a step
    const w = d.rings[i] - d.rings[i - 1];
    assert.ok(w <= width + 1e-9,
      `step ${i} spans ${w.toFixed(4)} of the radius, wanted <= ${width.toFixed(4)}`);
  }
  /* And the softening is small enough to read as an edge rather than as a gradient: at
     `interior`'s ~90 px/m and a 0.6 m decal it is about 3 px, comparable to the 2.5 px ink
     line, and sub-pixel by `courtyard`'s far field. */
  assert.ok(TUNE.soft > 0 && TUNE.soft <= 0.06, `TUNE.soft = ${TUNE.soft}`);
});

test('contact decal: the geometry is closed and indexed, with no NaN', () => {
  const d = contactDiscGeometry();
  assert.equal(d.position.length / 3, d.alpha.length);
  assert.ok(d.index.length % 3 === 0);
  for (const v of d.position) assert.ok(Number.isFinite(v));
  for (const a of d.alpha) assert.ok(a >= 0 && a <= 1);
  const maxIdx = Math.max(...d.index);
  assert.ok(maxIdx < d.alpha.length, `index ${maxIdx} out of range ${d.alpha.length}`);
});

test('contact decal: darkening goes toward the SHADOW HUE and stays transparent', () => {
  // §2.2 SHADOW HUE #2a3f66, §2.1.3 shadows are coloured and you can read detail inside them.
  const t = tintMultiplier(new THREE.Color(0x2a3f66));
  assert.ok(t.b > t.g && t.g > t.r, `multiplier is not cool: ${t.r} ${t.g} ${t.b}`);
  // never a black hole — the paving must survive inside the contact
  assert.ok(Math.min(t.r, t.g, t.b) > 0.12, `multiplier bottoms out at ${Math.min(t.r, t.g, t.b)}`);
  // and it must actually darken
  assert.ok(Math.max(t.r, t.g, t.b) < 1, 'multiplier does not darken');

  /* The fragment shader is a MULTIPLY, so the floor's own texture is preserved by construction.
     Asserted on the source because "it is a multiply" is the load-bearing half of §2.1.3. */
  assert.match(DECALS_SRC, /blending:\s*THREE\.MultiplyBlending/);
  assert.match(DECALS_SRC, /gl_FragColor = vec4\( mix\( vec3\( 1\.0 \), uTint, a \), 1\.0 \);/);
});

// ---------------------------------------------------------------------------------------------
// 2. screen size at every shipped shot — the reason this is geometric and not screen-space
// ---------------------------------------------------------------------------------------------

/** KayKit placements that matter for framing. Mirrors KayKit.PLACEMENTS (model, x, groundY, z). */
const PLACEMENTS = KAYKIT_SRC
  .slice(KAYKIT_SRC.indexOf('const PLACEMENTS = ['), KAYKIT_SRC.indexOf('/* Props Sly should bump'))
  .split('\n')
  .map((l) => l.match(/^\s*\['([a-z_]+)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),/))
  .filter(Boolean)
  .map((m) => [m[1], +m[2], +m[3], +m[4]]);

test('the placement table parsed out of KayKit.js is the real one', () => {
  // If this ever drifts the two tests below become vacuous rather than wrong, so it is asserted.
  assert.ok(PLACEMENTS.length >= 30, `parsed only ${PLACEMENTS.length} placements`);
  const models = new Set(PLACEMENTS.map((p) => p[0]));
  assert.ok(models.has('barrel_large') && models.has('crates_stacked'));
  for (const [f] of models) assert.ok(typeof f === 'string');
});

/* Minimal glTF footprint reader: enough to get real vertex positions out of the committed
   assets, so the numbers below are the pack's own and not a restatement of them. */
const CT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const fpCache = new Map();
function kaykitFootprint(file) {
  if (fpCache.has(file)) return fpCache.get(file);
  const j = JSON.parse(fs.readFileSync(path.join(ASSETS, `${file}.gltf`), 'utf8'));
  const bin = fs.readFileSync(path.join(ASSETS, j.buffers[0].uri));
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const geos = [];
  const walk = (idx, parent) => {
    const n = j.nodes[idx];
    const m = new THREE.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else {
      m.compose(new THREE.Vector3().fromArray(n.translation || [0, 0, 0]),
        new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(n.scale || [1, 1, 1]));
    }
    const world = parent.clone().multiply(m);
    if (n.mesh != null) {
      for (const prim of j.meshes[n.mesh].primitives) {
        const acc = j.accessors[prim.attributes.POSITION];
        assert.equal(acc.componentType, 5126, `${file}: POSITION is not float32`);
        const bv = j.bufferViews[acc.bufferView];
        const stride = bv.byteStride || CT[acc.componentType] * NC[acc.type];
        const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const arr = new Float32Array(acc.count * 3);
        const v = new THREE.Vector3();
        for (let i = 0; i < acc.count; i++) {
          v.set(dv.getFloat32(base + i * stride, true),
            dv.getFloat32(base + i * stride + 4, true),
            dv.getFloat32(base + i * stride + 8, true)).applyMatrix4(world);
          arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        geos.push(g);
      }
    }
    for (const c of n.children || []) walk(c, world);
  };
  for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, new THREE.Matrix4());
  const fp = groundFootprint(geos);
  fpCache.set(file, fp);
  return fp;
}

function shotCamera(name) {
  const s = SHOTS[name];
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, 1280 / 720, 0.1, 2000);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

/**
 * The floor a decal has to clear, in device px of MINOR-AXIS DIAMETER, at 720 rows.
 *
 * Fixed before the numbers were read, and it is a floor rather than a target: POSTFX clamps its
 * own screen-space term at a 1.2 px RADIUS, i.e. 2.4 px of diameter, below which every tap lands
 * in one texel. 4 px is that floor with a margin, and it is the whole claim of this feature —
 * a decal that also fell under it would be a second null dressed as a fix.
 */
const MIN_DECAL_PX = 4;

test('contact decal: clears the texel floor at every shipped shot, where the screen-space term does not', () => {
  const rows = [];
  for (const name of Object.keys(SHOTS)) {
    const s = SHOTS[name];
    const cam = shotCamera(name);
    const focal = 720 / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    let worst = null;
    for (const [file, x, gy, z] of PLACEMENTS) {
      const p = new THREE.Vector3(x, gy, z);
      const ndc = p.clone().project(cam);
      if (ndc.x < -1.05 || ndc.x > 1.05 || ndc.y < -1.05 || ndc.y > 1.05 || ndc.z > 1) continue;
      const dist = cam.position.distanceTo(p);
      const r = Math.min(TUNE.maxRadius, kaykitFootprint(file).radius * TUNE.spread);
      const px = 2 * r * focal / dist;
      if (!worst || px < worst.px) worst = { file, dist, px, term: 0.045 * focal / dist };
    }
    if (!worst) continue;
    rows.push([name, worst]);
  }

  assert.ok(rows.length >= 8, `only ${rows.length} shots see a KayKit prop`);
  const report = rows.map(([n, w]) =>
    `${n}: worst ${w.file} at ${w.dist.toFixed(1)} m -> decal ${w.px.toFixed(1)} px, `
    + `screen-space term radius ${w.term.toFixed(2)} px`).join('\n  ');

  for (const [name, w] of rows) {
    assert.ok(w.px >= MIN_DECAL_PX,
      `${name}: decal minor diameter ${w.px.toFixed(2)} px < ${MIN_DECAL_PX}\n  ${report}`);
    /* And it must beat the thing it replaces by a real margin, not by a rounding error. The
       screen-space term is a RADIUS, so it is doubled here to compare like with like. */
    assert.ok(w.px > 3 * (2 * w.term),
      `${name}: decal ${w.px.toFixed(2)} px is not 3x the screen-space term's ${(2 * w.term).toFixed(2)} px\n  ${report}`);
  }

  // `courtyard` is the shot the handback named. Its term is below the texel floor by construction.
  const courtyard = rows.find(([n]) => n === 'courtyard');
  assert.ok(courtyard, 'courtyard sees no KayKit prop');
  assert.ok(courtyard[1].term < 1.2,
    `courtyard's screen-space term is ${courtyard[1].term.toFixed(2)} px — the premise of this `
    + 'feature is that it is below POSTFX\'s own 1.2 px clamp, so if this fails the argument changed');
});

// ---------------------------------------------------------------------------------------------
// 3. the reach stays inside the real cast shadow
// ---------------------------------------------------------------------------------------------

test('contact decal: the downwind reach is always a fraction of the true cast shadow', () => {
  const st = createAtmosphereState();
  const heights = [0.48, 1.02, 1.30, 2.00, 2.14, 2.56, 3.50];   // the KayKit set's real range
  const seen = [];
  for (const name of Object.keys(SHOTS)) {
    const tod = SHOTS[name].tod ?? 0.78;
    evalAtmosphere(tod, st);
    const sl = shadowLengthOf(st.keyDir);
    assert.ok(Number.isFinite(sl) && sl >= 0 && sl <= SHADOW_LEN_MAX,
      `${name}: shadow length ${sl} is not finite and clamped`);
    for (const h of heights) {
      const reach = reachFor(h, sl);
      const cast = h * sl;
      assert.ok(reach >= 0 && Number.isFinite(reach), `${name} h=${h}: reach ${reach}`);
      assert.ok(reach <= cast + 1e-9,
        `${name} h=${h}: reach ${reach.toFixed(2)} m exceeds the real cast shadow ${cast.toFixed(2)} m`);
    }
    seen.push([name, sl]);
  }
  /* The instrument must have exercised both extremes, or "always inside" is a claim about one
     sun angle. `interior` is a 76 degree sun (shadow length 0.25) and `night` is a moon at 12
     degrees (4.70). */
  const lens = seen.map(([, s]) => s);
  assert.ok(Math.min(...lens) < 0.4, `no near-overhead key was tested: min ${Math.min(...lens)}`);
  assert.ok(Math.max(...lens) > 3.5, `no raking key was tested: max ${Math.max(...lens)}`);
});

test('contact decal: a near-overhead sun gives a near-round decal', () => {
  const st = createAtmosphereState();
  evalAtmosphere(SHOTS.interior.tod, st);
  const sl = shadowLengthOf(st.keyDir);
  // interior is tod 0.5 — the sun is at 76 degrees and a barrel casts almost nothing sideways
  const reach = reachFor(1.02, sl);
  assert.ok(reach < 0.1,
    `interior's 76 degree sun should give a nearly circular contact, got ${reach.toFixed(3)} m of reach`);
});

test('contact decal: the shadow points AWAY from the key, at every shipped tod', () => {
  const st = createAtmosphereState();
  const decals = new ContactDecals(stubEngine(st), { name: 'test' });
  decals.add(0, 0, 0, 0.5, 1.0);
  decals.build(new THREE.Group());
  for (const name of Object.keys(SHOTS)) {
    evalAtmosphere(SHOTS[name].tod ?? 0.78, st);
    decals.refresh();
    const k = decals.material.uniforms.uKey.value;
    const dot = k.x * st.keyDir.x + k.y * st.keyDir.z;
    assert.ok(dot < 0,
      `${name}: the decal is stretched TOWARD the key (dot ${dot.toFixed(3)}) — a shadow `
      + 'pointing at the sun is the classic sign error this asserts against');
    assert.ok(Math.abs(Math.hypot(k.x, k.y) - 1) < 1e-5, `${name}: uKey is not unit`);
  }
  decals.dispose();
});

// ---------------------------------------------------------------------------------------------
// 4. the footprint does not depend on how finely the prop was modelled
// ---------------------------------------------------------------------------------------------

const cylinder = (r, h, sides) => {
  const g = new THREE.CylinderGeometry(r, r, h, sides);
  g.translate(0, h / 2, 0);
  return g;
};

test('groundFootprint: reads the same radius from a 6-gon and a 64-gon of the same size', () => {
  const coarse = groundFootprint(cylinder(0.5, 1, 6));
  const fine = groundFootprint(cylinder(0.5, 1, 64));
  /* A hexagon's flat-to-flat is cos(30) = 0.866 of its circumradius, so the two cannot agree
     exactly. 15 % is the geometry's own difference; the failure this guards against was 3x. */
  const err = Math.abs(coarse.radius - fine.radius) / fine.radius;
  assert.ok(err < 0.15,
    `6-gon reads ${coarse.radius.toFixed(3)} against a 64-gon's ${fine.radius.toFixed(3)} (${(err * 100).toFixed(0)}%)`);
  assert.ok(Math.abs(fine.radius - 0.5) < 0.02, `64-gon radius ${fine.radius.toFixed(3)}, wanted 0.5`);
});

test('groundFootprint: a box reports its half-width, not its half-diagonal', () => {
  const g = new THREE.BoxGeometry(2, 2, 2);
  g.translate(0, 1, 0);
  const fp = groundFootprint(g);
  assert.ok(Math.abs(fp.radius - 1) < 1e-6,
    `box of half-width 1 reports ${fp.radius.toFixed(3)} — the half-diagonal is 1.414 and would `
    + 'overshoot the crate by 41 % everywhere except four points');
  assert.ok(Math.abs(fp.height - 2) < 1e-6);
  assert.ok(Math.abs(fp.y) < 1e-6, `floor is ${fp.y}, wanted 0`);
});

test('groundFootprint: measures the BASE, not the widest point of the silhouette', () => {
  // a barrel: narrow foot, fat belly. `barrel_large` is 0.613 at the floor and 0.932 at the belly.
  const g = new THREE.LatheGeometry(
    [new THREE.Vector2(0.6, 0), new THREE.Vector2(0.95, 1), new THREE.Vector2(0.6, 2)], 48);
  const fp = groundFootprint(g);
  assert.ok(fp.radius < 0.75,
    `barrel base reads ${fp.radius.toFixed(3)} — a whole-silhouette measure would give ~0.95`);
  assert.ok(fp.radius > 0.55, `barrel base reads ${fp.radius.toFixed(3)}, wanted ~0.6`);
});

test('groundFootprint: a prop whose base is a point still gets a contact, not nothing', () => {
  const g = new THREE.ConeGeometry(1, 2, 24);   // apex down after the flip
  g.rotateX(Math.PI);
  g.translate(0, 2, 0);
  const fp = groundFootprint(g);
  assert.ok(fp && fp.radius > 0.05, `a tipped prop got radius ${fp?.radius}`);
});

test('baseRadiusOf agrees with groundFootprint().radius', () => {
  const g = new THREE.BoxGeometry(3, 1, 1);
  g.translate(0, 0.5, 0);
  assert.equal(baseRadiusOf(g), groundFootprint(g).radius);
});

// ---------------------------------------------------------------------------------------------
// 5. the OFF arm, and what `state()` reports
// ---------------------------------------------------------------------------------------------

function stubEngine(atmosphere) {
  return {
    debug: {},
    scene: new THREE.Scene(),
    get(key) { return key === 'lighting' ? { atmosphere } : null; },
  };
}

test('contact decal: debug.decalScale = 0 is a TRUE off arm, not a small strength', () => {
  const st = createAtmosphereState();
  evalAtmosphere(0.76, st);
  const engine = stubEngine(st);
  const d = new ContactDecals(engine, { name: 'test' });
  d.add(0, 0, 0, 0.5, 1.0);
  d.add(3, 0, 0, 0.8, 2.0);
  const mesh = d.build(new THREE.Group());
  assert.ok(mesh, 'no mesh built');

  d.refresh();
  assert.ok(d.state().strength > 0 && mesh.visible, 'default arm is not on');

  engine.debug.decalScale = 0;
  d.refresh();
  assert.equal(d.state().strength, 0, 'strength is not exactly zero');
  assert.equal(mesh.visible, false, 'the mesh still draws — this is not an OFF arm');

  engine.debug.decalScale = 1;
  d.refresh();
  assert.equal(d.state().strength, TUNE.strength);
  assert.equal(mesh.visible, true);
  d.dispose();
});

test('contact decal: state() reports the UNIFORM, never TUNE', () => {
  const st = createAtmosphereState();
  evalAtmosphere(0.76, st);
  const engine = stubEngine(st);
  const d = new ContactDecals(engine, { name: 'test' });
  d.add(0, 0, 0, 0.5, 1.0);
  d.build(new THREE.Group());

  /* KNOWN_ISSUES §40: a lever read back from its own source of truth cannot report that it
     failed to reach the shader. Poke the uniform behind the module's back and check state()
     follows the uniform rather than the tune. */
  engine.debug.decalScale = 0.5;
  d.refresh();
  assert.equal(d.state().strength, d.material.uniforms.uStrength.value);
  assert.notEqual(d.state().strength, TUNE.strength);

  engine.debug.decalRadius = 0.25;
  d.refresh();
  assert.equal(d.state().radius, 0.25);
  assert.equal(d.material.uniforms.uRadius.value, 0.25);
  d.dispose();
});

test('contact decal: refresh() allocates nothing — it runs every frame (AGENTS §5)', () => {
  const st = createAtmosphereState();
  evalAtmosphere(0.76, st);
  const d = new ContactDecals(stubEngine(st), { name: 'test' });
  d.add(0, 0, 0, 0.5, 1.0);
  d.build(new THREE.Group());
  const before = d._applied;
  const uKey = d.material.uniforms.uKey.value;
  const uTint = d.material.uniforms.uTint.value;
  for (let i = 0; i < 5; i++) d.refresh();
  assert.equal(d._applied, before, 'refresh() rebuilt its readback record');
  assert.equal(d.material.uniforms.uKey.value, uKey, 'refresh() rebuilt a uniform object');
  assert.equal(d.material.uniforms.uTint.value, uTint, 'refresh() rebuilt a uniform object');
  // state() is for tooling and may copy, but it must not hand out the live record
  assert.notEqual(d.state(), d._applied);
  d.dispose();
});

test('contact decal: never enters the shadow map, and opts out of the override prepass', () => {
  const st = createAtmosphereState();
  evalAtmosphere(0.76, st);
  const d = new ContactDecals(stubEngine(st), { name: 'test' });
  d.add(0, 0, 0, 0.5, 1.0);
  const mesh = d.build(new THREE.Group());

  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  /* main.js re-enables castShadow on every opaque mesh after init; this is the documented
     opt-out and without it a ground quad self-shadows the floor it sits on. */
  assert.equal(mesh.userData.noShadow, true);
  assert.equal(d.material.depthWrite, false, 'a decal that writes depth occludes the floor');
  assert.ok(d.material.polygonOffset, 'no polygon offset — this will z-fight the paving');

  /* POSTFX's normal prepass swaps `scene.overrideMaterial` in; a ground quad 1.2 cm above the
     floor writes a depth step the crease detector reads as an edge, i.e. an ink line drawn
     round every contact shadow. Same guard `fx/Decals.js` carries, checked the same way. */
  const other = new THREE.MeshNormalMaterial();
  const before = mesh.geometry.instanceCount;
  mesh.onBeforeRender(null, null, null, mesh.geometry, other);
  assert.equal(mesh.geometry.instanceCount, 0, 'the decal rasters into the normal buffer');
  mesh.onAfterRender(null, null, null, mesh.geometry, other);
  assert.equal(mesh.geometry.instanceCount, before, 'instanceCount was not restored');

  mesh.onBeforeRender(null, null, null, mesh.geometry, d.material);
  assert.equal(mesh.geometry.instanceCount, before, 'the decal hid itself from its own pass');
  d.dispose();
});

test('contact decal: bounds cover the displaced instances, not the centres', () => {
  const st = createAtmosphereState();
  evalAtmosphere(0.76, st);
  const d = new ContactDecals(stubEngine(st), { name: 'test' });
  d.add(0, 0, 0, 1.0, 2.0);
  const mesh = d.build(new THREE.Group());
  const bb = mesh.geometry.boundingBox;
  /* The vertex shader displaces every instance, so three's own bounds would be a point cloud of
     centres and the whole batch would frustum-cull at the screen edge — the far side of exactly
     the shots this feature exists for. */
  const reach = TUNE.maxRadius >= 1.2 ? 1.2 : TUNE.maxRadius;
  assert.ok(bb.max.x >= reach, `bounds only reach ${bb.max.x.toFixed(2)} in x`);
  assert.ok(bb.min.x <= -reach, `bounds only reach ${bb.min.x.toFixed(2)} in x`);
  assert.ok(mesh.geometry.boundingSphere.radius > 1, 'bounding sphere is a point');
  d.dispose();
});

test('contact decal: the GLSL is the arithmetic the JS mirror models', () => {
  /* `reachFor` is the number every test above reasons about; the frame runs the GLSL. Asserted
     as text, the same way tests/grounding.test.mjs pins slyBandStep, so the two cannot drift
     silently. */
  assert.match(DECALS_SRC,
    /float reach = min\( uReach\.y, uReach\.x \* iHeight \* uShadowLen \) \* uRadius;/);
  assert.match(DECALS_SRC, /float along = d\.x \* \( r \+ reach \) \+ reach \* uPush;/);
  // and the mirror's own shape
  assert.equal(reachFor(2, 1, { reachCap: 9, reachFrac: 0.5 }), 1);
  assert.equal(reachFor(2, 10, { reachCap: 0.9, reachFrac: 0.5 }), 0.9);
  assert.equal(reachFor(-5, 1), 0);
});

// ---------------------------------------------------------------------------------------------
// 6. hull presence tracks ROLE, not the loader
// ---------------------------------------------------------------------------------------------

test('KayKit: set dress carries no inverted hull unless a lever asks for one', () => {
  /* AGENTS §2.1.2 reserves the inverted hull for "characters and hero props" and gives
     architectural and interior edges to the post-process crease detector. KayKit is containers
     and rubble — this file's own header says so. The shipped state before this was set dress
     carrying a hull while the protagonist carried none (`Outline.js`'s header lists
     `SlyModelDLRig.js` among the meshes that never call `Shading.outline()`), which is hull
     presence tracking which module built a mesh. */
  /* Comments stripped first, and with the same byte count preserved so the offsets below still
     line up: this file argues the decision at length in prose that names `Shading.outline()`,
     and a naive match counts the argument as a call site. */
  const code = KAYKIT_SRC
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  const calls = [...code.matchAll(/\.outline\?\.\(|\.outline\(/g)];
  assert.equal(calls.length, 1,
    `expected exactly one outline() call site in KayKit.js, found ${calls.length}`);

  // and it must be inside the gate
  const gate = code.indexOf('_maybeHull(mesh) {');
  const end = code.indexOf('\n  }', gate);          // end of that method body
  assert.ok(gate > 0 && end > gate, 'the _maybeHull gate is gone');
  assert.ok(calls[0].index > gate && calls[0].index < end,
    'an outline() call escaped the _maybeHull gate');
  assert.match(KAYKIT_SRC, /if \(!this\._hullWanted\(\)\) return null;/);
});

test('KayKit: the hull lever defaults OFF and is defeatable both ways', () => {
  const KayKitMod = KAYKIT_SRC;
  // the lever exists in both spellings the harness can reach
  assert.match(KayKitMod, /this\.engine\?\.debug\?\.kaykitHull/);
  assert.match(KayKitMod, /kaykithull/);

  // and the default is off — checked by running the predicate, not by reading it
  const stub = { engine: { debug: {} } };
  const src = KayKitMod.slice(KayKitMod.indexOf('_hullWanted() {'));
  const body = src.slice(src.indexOf('{') + 1, src.indexOf('\n  }'));
  const fn = new Function(`return function () {${body}};`)();
  assert.equal(fn.call(stub), false, 'the hull is on by default');
  stub.engine.debug.kaykitHull = true;
  assert.equal(fn.call(stub), true, 'debug.kaykitHull does not restore the hull');
});

test('KayKit: every placement gets a contact decal, colliders or not', () => {
  /* The collider set is a gameplay decision (`SOLID` deliberately excludes coins and rubble —
     "a hoard you can wade through reads as treasure"). Grounding is not: a coin stack still has
     to sit on the floor. This is asserted because tying the two together is the obvious wrong
     refactor. */
  assert.match(KAYKIT_SRC, /this\.decals\.add\(x, groundY, z, entry\.rBase/);
  const addIdx = KAYKIT_SRC.indexOf('this.decals.add(x, groundY, z');
  const solidIdx = KAYKIT_SRC.indexOf('if (SOLID.has(file))');
  assert.ok(addIdx > 0 && solidIdx > addIdx,
    'the decal add() moved inside or after the SOLID gate');
});
