#!/usr/bin/env node
/* fxcluster-diag — offline diagnosis for the five FX defects CRITIC-sbs1 §3 measured.
 *
 * Everything here runs on COMMITTED frames (progress/records/**), no GPU, no lock, no
 * src/** edit. Each section (A–E) reproduces the CRITIC's number on the newest committed
 * frame of that shot, states its threshold with every count (§122.1), and then carries the
 * in-source attribution: a CPU port or geometric argument naming the exact lines that put
 * (or fail to put) those pixels there.
 *
 * Frames used (newest committed capture of each shot, provenance per its RESULT/manifest):
 *   guard    progress/records/hullkerb/frames/guard-base.png    (tree 0aaea246…, no hull)
 *   night    progress/records/hullkerb/frames/night-base.png    (same boot family)
 *   traversal progress/records/gold1/traversal.png              (2026-08-05T06:42Z, 36d9b90+dirty)
 *   combat   progress/records/gold1/combat.png (+ sbs1/combat.png cross-boot, 8640769 clean)
 *   interior progress/records/hullkerb/frames/interior-base.png (tree 520bd541…)
 *            + progress/records/cand1/frames/interior.base.png  (fx22 base arm, gate OFF)
 *   dunes    progress/records/cand1/frames/dunes.base.png       (fx22 base arm, gate OFF —
 *            the only committed dunes; fx22's D1 leak was 258 px on courtyard, none recorded
 *            on dunes, and base==gated on dunes by byte size; caveat stated, not hidden)
 *
 * Section A — guard patrol cone (CRITIC: air column 700,300,850,500 medL 27.0, zero readable
 *   pixels, while wedge1's probe says beams live). CPU port of Guard.js's beam: the stand
 *   solve (Guard.js:1758-1837), the heading (SHOT_POSE guard, Guard.js:152-161: towardCamera
 *   0.35, screenSide -1), the cone transform (Guard.js:1592-1601), and the fragment
 *   arithmetic (BEAM_FRAG, Guard.js:262-291: body|N·V|^1.85 · atten 1/(1+7t²) ·
 *   near smoothstep(0,.16,t) · tip · dust · camFade · uOpacity), with uOpacity = the day
 *   fade at _light(tod 0.10)=0.263 (Guard.js:1543, 1411-1414) and vTint = colPatrol→colNight
 *   night-graded patrol colour × bright (Guard.js:1551-1590, TUNE 89-118). The beam writes
 *   LINEAR premultiplied additive into PostFX's HalfFloat scene RT — renderer.toneMapping is
 *   NoToneMapping while PostFX owns the frame (PostFX.js:1387-1391), so the ShaderMaterial's
 *   tonemapping_fragment include is a no-op and the shell's contribution is vTint·a in scene
 *   linear. The port answers: which t-range of the cone projects into the frame at all,
 *   which into the air column, and the max linear addition the shipped shader can put there.
 *
 * Section B — traversal sparkle (CRITIC: 0 px within ±40/±35/±40 of #8fd8ff frame-wide).
 *   Reproduces the count, then projects the 11 authored hook points
 *   (EgyptLevel.js:888-891 main chain, :908 low chain) through the traversal camera and
 *   samples a disc at each: present-but-miscoloured vs absent-at-source. Attribution targets:
 *   Particles.js SparkleField (uCore lin(#8fd8ff)×2.4, :1605; SPARKLE_FRAG :747-777),
 *   _updateSparkles collision query (:3223-3255, tags TUNE.sparkleTags :380).
 *
 * Section C — combat flash + slash arc (CRITIC: figure 360,390,720,670 medSat 0.165,
 *   21 blue px, arc monochrome white). Reproduces the figure stats on both committed combat
 *   frames, sizes the flash, and checks the arc's brightest band saturation. Attribution:
 *   _stageShot combat impact (Particles.js:2564-2570) → _onCaneHit (:2506-2521) → EMITTERS
 *   cane_flash alpha 2.6 / size 1.5→0.5 m / goldLight→goldMid (Emitters.js:450-455),
 *   cane_arc col0 goldSpec #fffbe8 (near-white in the emitted spectrum, Emitters.js:469-474)
 *   — the same "chroma must be in the emitted spectrum" mechanism PAL.flameBody's own note
 *   records (Emitters.js:41-54). Boundary: the AgX-shoulder desaturation of whatever is
 *   emitted is SHADING's (PostFX composite); the emitted energy/spectrum is FX's.
 *
 * Section D — interior detached warm-bright ceiling shapes (CRITIC: up to 156 px wide,
 *   11.3% of rect 500,0,1280,200). Connected components under a stated warm-bright mask,
 *   width/coverage, distance-to-nearest-flame-core. Attribution split: the clamped mote
 *   populations CANNOT be these shapes (TUNE.moteMaxH 0.028 → 20 px ceiling at 720p,
 *   Particles.js:106 + :608-611 min(); batches 'motes' :2059-2065 and 'airMotes' :2012);
 *   the unclamped warm-bright populations are fire_body (0.30→0.55 m, additive spark batch,
 *   GLOW/SMOKE tiles, Emitters.js:557-562), torch_smoke (0.16→1.1 m, lit smoke batch,
 *   Emitters.js:563-568), and the FlameField billboard — plus POSTFX bloom on top (noted,
 *   not FX's half).
 *
 * Section E — dunes pyramid/sky separation (CRITIC: ΔmedL 9.5 vs ref 21.4, "curve shape").
 *   Projects pyramid_105 (Terrain.js:275-289: base y 6.5, apex 111.5, centre (-150,-190),
 *   halfBase 82) through the dunes camera, measures pyramid-face vs same-row sky medL, and
 *   ports the APPLIED haze curve — which is NOT Atmosphere's published one: setAtmosphere()
 *   has no caller (ToonMaterial.js:1495-1497, 1639-1652), so world geometry gets
 *   slyHaze (toon.glsl.js:84-93: LINEAR-exponential height integral, falloff hardcoded
 *   TUNE.hazeFalloff 0.055, ToonMaterial.js:579) fed by scene.fog.density × 2.6
 *   (ToonMaterial.js:1645) where scene.fog is Sky's fallback FogExp2 carrying Atmosphere's
 *   fog.density (Sky.js:581-585). Atmosphere's fogHeight/inscatter (the published curve's
 *   height + sun terms, Atmosphere.js:339-341, applyAerial :433-436) never reach a world
 *   pixel. The port quantifies both curves at the pyramid so the routing is evidence.
 *
 * usage: node progress/records/fxcluster-diag.mjs [A|B|C|D|E ...]  (default: all)
 * Writes progress/records/fxcluster-diag-out.json beside the human-readable stdout.
 */
import { readPNG } from '../../tools/png.mjs';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

/* Minimal PNG writer (RGB8, filter 0) for evidence crops. */
function writePNG(path, w, h, rgb) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
function saveCrop(im, x0, y0, x1, y1, path) {
  const w = x1 - x0, h = y1 - y0;
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y + y0) * im.w + (x + x0)) * im.ch, di = (y * w + x) * 3;
    rgb[di] = im.data[si]; rgb[di + 1] = im.data[si + 1]; rgb[di + 2] = im.data[si + 2];
  }
  writePNG(path, w, h, rgb);
}

const R = (p) => new URL(p, import.meta.url).pathname;
const FRAMES = {
  guard: R('./hullkerb/frames/guard-base.png'),
  guardHull: R('./hullkerb/frames/guard-hull.png'),
  night: R('./hullkerb/frames/night-base.png'),
  traversal: R('./gold1/traversal.png'),
  combat: R('./gold1/combat.png'),
  combatSbs: R('./sbs1/combat.png'),
  interior: R('./hullkerb/frames/interior-base.png'),
  interiorCand: R('./cand1/frames/interior.base.png'),
  dunes: R('./cand1/frames/dunes.base.png'),
};

/* ---------------------------------------------------------------- helpers --- */

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // Rec.709 on 0..255, same as CRITIC
const satOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
};
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const srgb2lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const hex2lin = (hex) => [srgb2lin((hex >> 16) & 255), srgb2lin((hex >> 8) & 255), srgb2lin(hex & 255)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };

/** Camera model = Shots.js applyShot: pos, lookAt(target) with up (0,1,0), optional roll (deg),
 *  vertical fov, 1280x720. Returns { project(worldPoint) -> {px, py, depth, ndcx, ndcy} }. */
function makeCamera({ pos, target, fov, roll = 0 }, W = 1280, H = 720) {
  const P = V(...pos);
  const fwd = norm(sub(V(...target), P));
  let right = cross(fwd, V(0, 1, 0));
  if (len(right) < 1e-6) right = V(1, 0, 0);
  right = norm(right);
  let up = norm(cross(right, fwd));
  if (roll) {
    // cam.rotateZ(deg): camera local x/y rotate about local z (= -fwd) CCW by theta.
    const th = (roll * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const r2 = add(mul(right, c), mul(up, s));
    const u2 = add(mul(right, -s), mul(up, c));
    right = r2; up = u2;
  }
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * (W / H);
  return {
    pos: P, fwd, right, up, tanV, tanH, W, H,
    project(w) {
      const v = sub(w, P);
      const zc = dot(v, fwd);                 // metres in front of the lens
      const xc = dot(v, right), yc = dot(v, up);
      if (zc <= 1e-6) return { visible: false, behind: true, depth: zc };
      const ndcx = xc / (zc * tanH), ndcy = yc / (zc * tanV);
      return {
        visible: Math.abs(ndcx) <= 1 && Math.abs(ndcy) <= 1,
        behind: false, depth: zc, ndcx, ndcy,
        px: (ndcx + 1) / 2 * W, py: (1 - ndcy) / 2 * H,
      };
    },
  };
}

function rectStats(im, x0, y0, x1, y1) {
  const Ls = [], Rs = [], Gs = [], Bs = [], sats = [];
  for (let y = Math.max(0, y0); y < Math.min(im.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(im.w, x1); x++) {
      const i = (y * im.w + x) * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      Ls.push(lum(r, g, b)); Rs.push(r); Gs.push(g); Bs.push(b); sats.push(satOf(r, g, b));
    }
  }
  return {
    n: Ls.length, medL: median(Ls), medR: median(Rs), medG: median(Gs), medB: median(Bs),
    medSat: median(sats),
    meanRmB: Rs.reduce((s, v, i) => s + v - Bs[i], 0) / (Ls.length || 1),
  };
}

/* three.js AgXToneMapping port (linear rec709 in, sRGB-display-linear out) — used only for
 * qualitative context. The shipped composite is PostFX's slyAgX plus exposure/split/sat/
 * contrast; fx9/fx12 measured that model class at 1.25–1.71x spread, so NOTHING registered
 * in the prereg hangs on this function — registered quantities are frame measurements. */
function agx(r, g, b) {
  const m1 = [0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859];
  const m2 = [1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405];
  const mm = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
  let [x, y, z] = mm(m1, r, g, b);
  const lo = -12.47393, hi = 4.026069;
  const enc = (v) => clamp((Math.log2(Math.max(v, 1e-10)) - lo) / (hi - lo), 0, 1);
  x = enc(x); y = enc(y); z = enc(z);
  const sig = (v) => {
    const v2 = v * v, v4 = v2 * v2;
    return 15.5 * v4 * v2 - 40.14 * v4 * v + 31.96 * v4 - 6.868 * v2 * v + 0.4298 * v2 + 0.1191 * v - 0.00232;
  };
  [x, y, z] = [sig(x), sig(y), sig(z)];
  [x, y, z] = mm(m2, x, y, z);
  return [clamp(x, 0, 1), clamp(y, 0, 1), clamp(z, 0, 1)];
}
const lin2srgb255 = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

const OUT = { at: new Date().toISOString(), sections: {} };
const say = (...a) => console.log(...a);

/* ============================== A — guard cone ============================== */

function sectionA() {
  say('\n=== A. guard patrol cone — hullkerb/frames/guard-base.png ===');
  const im = readPNG(FRAMES.guard);
  const A = { frame: 'hullkerb/frames/guard-base.png' };

  // A1 — reproduce the CRITIC's air column (rect exclusive of x1,y1; Rec.709 luma 0-255).
  A.airColumn = rectStats(im, 700, 300, 850, 500);
  say(`A1 air column (700,300,850,500): medL ${A.airColumn.medL.toFixed(1)} ` +
    `(CRITIC on wedge1/guard-fix: 27.0)  medRGB ${A.airColumn.medR}/${A.airColumn.medG}/${A.airColumn.medB}  meanR-B ${A.airColumn.meanRmB.toFixed(1)}`);

  // Warm-additive signature inside the column: beam tint is warm (R>G>B, wedge1 beam0
  // 0.253/0.233/0.163), so beam-lit air must read R-B > 0. Threshold stated: R-B >= 12 at L >= 40.
  let warm = 0, n = 0;
  for (let y = 300; y < 500; y++) for (let x = 700; x < 850; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    n++;
    if (r - b >= 12 && lum(r, g, b) >= 40) warm++;
  }
  A.warmAdditivePx = warm; A.airColumnN = n;
  say(`A1 warm-additive px in column (R-B>=12 & L>=40): ${warm} of ${n}`);

  // Consistency across the boot's other arm (hull attach must not touch the beam).
  const imHull = readPNG(FRAMES.guardHull);
  A.airColumnHullArm = rectStats(imHull, 700, 300, 850, 500).medL;
  say(`A1 same rect on guard-hull arm: medL ${A.airColumnHullArm.toFixed(1)} (arm consistency)`);

  /* A2 — CPU port. Stand solve per Guard.js:1758-1837 with ground y = 0 (courtyard floor at
     the staged brazier, Shots.js guard comment) — validated below against the frame's own
     figure. LOS is assumed clear for near candidates (the plinth sits north of the walk). */
  const cam = makeCamera({ pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0], fov: 38 });
  const side = -1, height = 1.95 + 0.15;
  let best = null;
  for (let d = 4.5; d <= 17; d += 0.5) {
    const lateral = -side * 0.34 * d * cam.tanV * (16 / 9);
    const c = add(add(cam.pos, mul(cam.fwd, d)), mul(cam.right, lateral));
    const gy = 0; // ground assumption
    const axis = cam.pos.y + cam.fwd.y * d;
    const half = cam.tanV * d;
    const feet = (gy - axis) / half, head = (gy + height - axis) / half;
    if (head > 0.94 || feet < -0.96) continue;
    const fill = head - feet, centre = Math.abs((head + feet) / 2);
    const score = fill * 1.6 - centre * 1.1;
    if (!best || score > best.score) best = { d, score, pos: V(c.x, gy, c.z) };
  }
  A.stand = { d: best.d, x: +best.pos.x.toFixed(2), z: +best.pos.z.toFixed(2) };
  // Heading per Guard.js:1823-1836.
  const rgtFlat = norm(V(cam.right.x, 0, cam.right.z));
  const fwdFlat = norm(V(cam.fwd.x, 0, cam.fwd.z));
  const t = 0.35;
  let h = add(mul(mul(rgtFlat, side), Math.sqrt(1 - t * t)), mul(fwdFlat, -t));
  h = norm(h);
  const yaw = Math.atan2(h.x, h.z);
  A.heading = { x: +h.x.toFixed(3), z: +h.z.toFixed(3), yaw: +yaw.toFixed(3) };

  // Validate the model against the frame: projected head/feet rows vs CRITIC's guard rect 852,220,990,700.
  const headP = cam.project(V(best.pos.x, 1.95, best.pos.z));
  const feetP = cam.project(V(best.pos.x, 0, best.pos.z));
  A.figureCheck = { headPx: [Math.round(headP.px), Math.round(headP.py)], feetPx: [Math.round(feetP.px), Math.round(feetP.py)] };
  say(`A2 stand d=${best.d} at (${A.stand.x}, 0, ${A.stand.z}); heading (${A.heading.x}, ${A.heading.z})`);
  say(`A2 projected head px ${A.figureCheck.headPx}  feet px ${A.figureCheck.feetPx}  (CRITIC guard rect 852,220,990,700 — model valid if head lands near its top)`);

  /* Beam per Guard.js:1561-1601: eye = head + fwd*coneEyeFwd(0.45), +coneEyeUp(0.08);
     pitch 0.115 down; temple VISION: coneLength 15, halfAngle 0.60, eyeHeight 1.66. */
  const eyeY = 1.66 + 0.08;
  const eye = V(best.pos.x + h.x * 0.45, eyeY, best.pos.z + h.z * 0.45);
  const cp = Math.cos(0.115);
  const bdir = norm(V(h.x * cp, -Math.sin(0.115), h.z * cp));
  const reach = 15.0; // updateReach: no occluder assumed straight ahead (open air past the lens)
  const halfAngle = 0.60;

  // Opacity + tint per Guard.js:1543-1553, 1583-1590 at tod 0.10.
  const light = 0.10 + 0.80 * Math.max(0, Math.sin(Math.PI * clamp((0.10 - 0.04) / 0.92, 0, 1)));
  const day = clamp(1 - (light - 0.12) * 1.15, 0.26, 1);
  const night = 1 - smoothstep(0.14, 0.30, light);
  const bright = 0.30 * (1 - night * (1 - 0.55));
  const colP = hex2lin(0xfff0c2), colN = hex2lin(0xbfe6ff);
  const tint = colP.map((c, i) => (c + (colN[i] - c) * night) * bright);
  A.uniforms = { light: +light.toFixed(4), dayOpacity: +day.toFixed(4), night: +night.toFixed(4), bright: +bright.toFixed(4), tint: tint.map((v) => +v.toFixed(4)) };
  say(`A2 _light ${A.uniforms.light}  uOpacity(day) ${A.uniforms.dayOpacity}  night ${A.uniforms.night}  beam tint linear [${A.uniforms.tint}]  (wedge1 guard-fix beam0 was 0.253/0.233/0.163)`);

  /* Rasterize the shell: rings x segments as in _buildCones (26 seg, rings up to 1), but
     densified (600 x 96) so per-pixel accumulation is smooth. For each shell sample compute
     the BEAM_FRAG alpha (dust at its 0.84 mean, flicker at 1) and accumulate vTint·a per
     40x40 px bucket. Both facings arrive via abs(N·V). */
  const rBase = Math.tan(halfAngle) * reach;
  const bright2 = null; void bright2;
  // Cone basis (Guard.js:1594-1598).
  let brgt = cross(V(0, 1, 0), bdir); if (len(brgt) < 1e-6) brgt = V(1, 0, 0); brgt = norm(brgt);
  const bup = norm(cross(bdir, brgt));
  const NT = 600, NS = 96;
  const buckets = new Map();
  const tInFrame = []; let bodyInFrame = 0, bodySamples = 0;
  let colMax = 0, colMaxT = 0;
  for (let it = 1; it <= NT; it++) {
    const tt = it / NT;
    const ringR = rBase * tt;
    for (let is = 0; is < NS; is++) {
      const a = (is / NS) * Math.PI * 2;
      const wpos = add(add(add(eye, mul(bdir, tt * reach)), mul(brgt, Math.cos(a) * ringR)), mul(bup, Math.sin(a) * ringR));
      // Analytic cone normal (BEAM_VERT 211-221).
      const rel = sub(wpos, eye);
      const along = dot(rel, bdir);
      const radial = sub(rel, mul(bdir, along));
      const rl = len(radial);
      const rdir = rl > 1e-4 ? mul(radial, 1 / rl) : V(0, 1, 0);
      const slope = rl / Math.max(along, 1e-3);
      const N = norm(sub(rdir, mul(bdir, slope)));
      const view = sub(cam.pos, wpos);
      const Vv = norm(view);
      const body = Math.pow(Math.abs(dot(N, Vv)), 1.85);
      const glare = Math.pow(Math.max(0, dot(mul(bdir, -1), Vv)), 6.0) * 0.55;
      const atten = 1 / (1 + 7 * tt * tt);
      const near = smoothstep(0, 0.16, tt);
      const tip = 1 - smoothstep(0.56, 1.0, tt);
      const dust = 0.84;
      const camFade = smoothstep(0.4, 2.0, len(view));
      let alpha = (body + glare) * atten * near * tip * dust * camFade * day;
      alpha = clamp(alpha, 0, 4);
      const p = cam.project(wpos);
      if (tt >= 0.16 && tt <= 0.56) { bodySamples++; if (p.visible) bodyInFrame++; }
      if (!p.visible) continue;
      tInFrame.push(tt);
      const bx = Math.floor(p.px / 40), by = Math.floor(p.py / 40);
      const k = bx + ',' + by;
      const cur = buckets.get(k) || 0;
      // premultiplied additive: contribution = tint·a, summed over shell facings/samples.
      const contrib = tint[0] * alpha; // R channel (largest) as the scalar
      buckets.set(k, cur + contrib);
      if (p.px >= 700 && p.px < 850 && p.py >= 300 && p.py < 500) {
        if (contrib > colMax) { colMax = contrib; colMaxT = tt; }
      }
    }
  }
  const tMax = tInFrame.length ? Math.max(...tInFrame) : 0;
  A.port = {
    shellSamplesInFrame: tInFrame.length, tMaxInFrame: +tMax.toFixed(3),
    bodyShare: +(bodyInFrame / (bodySamples || 1)).toFixed(4),
    airColumnMaxSampleContrib: +colMax.toFixed(5), airColumnMaxSampleT: +colMaxT.toFixed(3),
  };
  say(`A3 shell samples in frame: ${tInFrame.length} of ${NT * NS}; max t in frame ${A.port.tMaxInFrame}`);
  say(`A3 BEAM BODY t in [0.16,0.56]: ${(A.port.bodyShare * 100).toFixed(2)}% of its samples project inside the frame`);
  say(`A3 air-column: max single-sample linear contribution ${A.port.airColumnMaxSampleT ? colMax.toFixed(5) : 'NONE'} at t=${A.port.airColumnMaxSampleT}`);

  /* Per-pixel estimate in the air column: sum shell contributions per bucket; two facings of
     a thin shell overlap ~2 samples deep, so a screen bucket's summed value / its sample
     count x2 approximates the per-pixel add. Report the max bucket inside the column. */
  let colBucketMax = 0;
  for (const [k, v] of buckets) {
    const [bx, by] = k.split(',').map(Number);
    const px = bx * 40, py = by * 40;
    if (px >= 680 && px < 860 && py >= 280 && py < 520) colBucketMax = Math.max(colBucketMax, v);
  }
  A.port.airColumnBucketSum = +colBucketMax.toFixed(4);
  // Display-space context (approximate AgX only — see header):
  const backLin = [srgb2lin(A.airColumn.medR), srgb2lin(A.airColumn.medG), srgb2lin(A.airColumn.medB)];
  const addLin = colMax * 2; // two facings
  const withBeam = agx(backLin[0] + addLin * (tint[0] / tint[0]), backLin[1] + addLin * (tint[1] / tint[0]), backLin[2] + addLin * (tint[2] / tint[0]));
  const without = agx(...backLin);
  A.port.approxDisplayDeltaL = +(lum(...withBeam.map(lin2srgb255)) - lum(...without.map(lin2srgb255))).toFixed(2);
  say(`A3 approx display ΔL if that max sample x2 facings landed on the column median backdrop: ${A.port.approxDisplayDeltaL} L (approximate AgX, context only)`);

  /* A4 — adjudication: the port says a sliver of UN-suppressed beam body (t 0.16-0.265,
     near()=1, alpha per facing up to ~0.5) projects in frame low-left. If the beam renders
     at all in this capture, THOSE pixels must carry a warm additive lift. Measure the frame
     at the strongest predicted buckets, against a same-size control offset +80 px right. */
  const bodyBuckets = [];
  {
    // re-walk shell, keep only t>0.16 in-frame samples, bucket 24 px
    const bmap = new Map();
    for (let it = Math.ceil(0.16 * NT); it <= NT; it++) {
      const tt = it / NT;
      const ringR = rBase * tt;
      for (let is = 0; is < NS; is++) {
        const a = (is / NS) * Math.PI * 2;
        const wpos = add(add(add(eye, mul(bdir, tt * reach)), mul(brgt, Math.cos(a) * ringR)), mul(bup, Math.sin(a) * ringR));
        const p = cam.project(wpos);
        if (!p.visible) continue;
        const rel = sub(wpos, eye);
        const along = dot(rel, bdir);
        const radial = sub(rel, mul(bdir, along));
        const rl = len(radial);
        const rdir = rl > 1e-4 ? mul(radial, 1 / rl) : V(0, 1, 0);
        const N = norm(sub(rdir, mul(bdir, rl / Math.max(along, 1e-3))));
        const view = sub(cam.pos, wpos);
        const body = Math.pow(Math.abs(dot(N, norm(view))), 1.85);
        const alpha = clamp(body * (1 / (1 + 7 * tt * tt)) * smoothstep(0, 0.16, tt) * (1 - smoothstep(0.56, 1, tt)) * 0.84 * smoothstep(0.4, 2.0, len(view)) * day, 0, 4);
        const k = `${(p.px / 24) | 0},${(p.py / 24) | 0}`;
        const cur = bmap.get(k) || { sum: 0, n: 0 };
        cur.sum += alpha; cur.n++;
        bmap.set(k, cur);
      }
    }
    const rows = [...bmap.entries()].map(([k, v]) => {
      const [bx, by] = k.split(',').map(Number);
      return { px: bx * 24 + 12, py: by * 24 + 12, meanAlpha: v.sum / v.n, n: v.n };
    }).filter((r) => r.meanAlpha > 0.05).sort((a, b2) => b2.meanAlpha - a.meanAlpha);
    for (const r of rows.slice(0, 8)) {
      // frame measurement in a 24px box at the bucket vs control box +80 px to the right
      const meas = (cx, cy) => {
        let warmN = 0, tot = 0; const Ls = []; let rmb = 0;
        for (let y = cy - 12; y < cy + 12; y++) for (let x = cx - 12; x < cx + 12; x++) {
          if (x < 0 || y < 0 || x >= im.w || y >= im.h) continue;
          const i = (y * im.w + x) * im.ch;
          const rr2 = im.data[i], gg = im.data[i + 1], bb = im.data[i + 2];
          tot++; Ls.push(lum(rr2, gg, bb)); rmb += rr2 - bb;
          if (rr2 - bb >= 12 && lum(rr2, gg, bb) >= 40) warmN++;
        }
        return { medL: +median(Ls).toFixed(1), meanRmB: +(rmb / (tot || 1)).toFixed(1), warmN };
      };
      bodyBuckets.push({
        px: r.px, py: r.py, predMeanAlphaPerFacing: +r.meanAlpha.toFixed(3),
        frame: meas(r.px, r.py), control: meas(Math.min(im.w - 13, r.px + 80), r.py),
      });
    }
  }
  A.bodySliver = bodyBuckets;
  say('A4 predicted un-suppressed beam-body buckets in frame (t>0.16) vs the actual frame:');
  for (const b of bodyBuckets) {
    say(`   px(${b.px},${b.py}) predAlpha/facing ${b.predMeanAlphaPerFacing}  frame medL ${b.frame.medL} meanR-B ${b.frame.meanRmB} warm ${b.frame.warmN}  | control(+80px) medL ${b.control.medL} meanR-B ${b.control.meanRmB}`);
  }
  saveCrop(im, 0, 250, 480, 620, R('./fxcluster-A-guard-bodysliver-crop.png'));
  saveCrop(im, 700, 300, 850, 500, R('./fxcluster-A-guard-aircolumn-crop.png'));
  say('A4 crops saved: fxcluster-A-guard-bodysliver-crop.png (0,250..480,620), fxcluster-A-guard-aircolumn-crop.png');

  OUT.sections.A = A;
}

/* ============================== B — traversal sparkle ============================== */

function sectionB() {
  say('\n=== B. traversal sparkle — gold1/traversal.png ===');
  const im = readPNG(FRAMES.traversal);
  const B = { frame: 'gold1/traversal.png' };

  // B1 — CRITIC's exact count: within ±40/±35/±40 of #8fd8ff (143,216,255).
  let inBand = 0, blueBright = 0;
  let best = { d: Infinity };
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    if (Math.abs(r - 143) <= 40 && Math.abs(g - 216) <= 35 && Math.abs(b - 255) <= 40) inBand++;
    if (b - r >= 30 && b >= 180 && lum(r, g, b) >= 80) blueBright++;
    const d = Math.abs(r - 143) + Math.abs(g - 216) + Math.abs(b - 255);
    if (d < best.d) best = { d, x, y, r, g, b };
  }
  B.pxInBand = inBand; B.blueBrightPx = blueBright;
  B.nearestPixel = best;
  say(`B1 px within ±40/±35/±40 of #8fd8ff: ${inBand} (CRITIC: 0)`);
  say(`B1 relaxed bright-blue (B-R>=30 & B>=180 & L>=80): ${blueBright} px`);
  say(`B1 nearest pixel to #8fd8ff anywhere: (${best.x},${best.y}) rgb ${best.r}/${best.g}/${best.b} L1-dist ${best.d}`);

  // B2 — project the 11 authored hook points (EgyptLevel.js:888-891, :908; hook lift 0.0
  // per Particles.js:3249) through the traversal camera and sample 24 px-radius discs.
  const cam = makeCamera({ pos: [6.0, 14.0, 6.0], target: [-3.0, 11.0, -12.0], fov: 44, roll: -3.0 });
  const hooks = [
    [20.0, 14.9, 27.0], [14.0, 14.9, 20.0], [8.5, 14.9, 12.0],
    [4.2, 14.8, 4.5], [1.0, 14.5, -3.0], [-4.0, 13.9, -8.5], [-9.5, 13.2, -13.0],
    [-16.5, 11.6, 24.0], [-11.0, 11.7, 19.0], [-6.0, 11.8, 14.0], [-1.5, 11.9, 9.5],
  ];
  const player = V(1.0, 12.4, -3.0); // Shots.js traversal player
  B.hooks = hooks.map(([x, y, z], idx) => {
    const p = cam.project(V(x, y, z));
    const rec = { i: idx, world: [x, y, z], distToPlayer: +len(sub(V(x, y, z), player)).toFixed(1) };
    if (p.behind) { rec.status = 'behind camera'; return rec; }
    rec.px = [Math.round(p.px), Math.round(p.py)]; rec.depth = +p.depth.toFixed(1);
    if (!p.visible) { rec.status = 'out of frame'; return rec; }
    rec.status = 'in frame';
    // sample a 24-px disc
    const rr = 24; const Ls = []; let maxBmr = -255, maxL = 0, bAt = null;
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > rr * rr) continue;
      const X = Math.round(p.px) + dx, Y = Math.round(p.py) + dy;
      if (X < 0 || Y < 0 || X >= im.w || Y >= im.h) continue;
      const i = (Y * im.w + X) * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      const L = lum(r, g, b); Ls.push(L);
      if (b - r > maxBmr) { maxBmr = b - r; bAt = [X, Y, r, g, b]; }
      if (L > maxL) maxL = L;
    }
    rec.discMedL = +median(Ls).toFixed(1); rec.discMaxL = +maxL.toFixed(0);
    rec.discMaxBminusR = maxBmr; rec.discMaxBpix = bAt;
    return rec;
  });
  const inFrame = B.hooks.filter((h) => h.status === 'in frame');
  say(`B2 hooks in frame: ${inFrame.length} of 11 (expected: sparkleRadius 34 m covers ` +
    `${B.hooks.filter((h) => h.distToPlayer <= 34).length} of them from the staged player)`);
  for (const h of B.hooks) {
    say(`   hook#${h.i} ${JSON.stringify(h.world)} d(player) ${h.distToPlayer}m -> ${h.status}` +
      (h.px ? ` px ${h.px} depth ${h.depth}m` : '') +
      (h.discMedL !== undefined ? ` | disc medL ${h.discMedL} maxL ${h.discMaxL} maxB-R ${h.discMaxBminusR} at ${JSON.stringify(h.discMaxBpix)}` : ''));
  }

  // B3 — what the shader WOULD emit if a marker drew: uCore lin(#8fd8ff)*2.4 through approx AgX.
  const core = hex2lin(0x8fd8ff).map((v) => v * 2.4);
  const gainRange = [0.5, 1.0, 1.76, 2.48];
  B.modelledCore = gainRange.map((g) => {
    const c = agx(core[0] * (0.9 + 0.9 * g) * 0.5, core[1] * (0.9 + 0.9 * g) * 0.5, core[2] * (0.9 + 0.9 * g) * 0.5).map(lin2srgb255).map((v) => Math.round(v));
    return { vGain: g, addedHalf: c };
  });
  say(`B3 modelled sparkle core (uCore x (0.9+0.9·vGain), half strength, approx AgX): ${JSON.stringify(B.modelledCore)}`);
  say('B3 => tells whether an in-frame marker could even land inside the ±40/±35/±40 box after the grade');

  /* B4 — where do the relaxed bright-blue pixels actually live (sky vs sparkle-shaped
     blobs), and does ANY committed frame show a drawn sparkle? Cross-check the sly-closeup
     (sbs1) — the one staging whose in-page probe recorded `sparkles latched=17 fresh=17`. */
  const blueBox = { minX: im.w, maxX: 0, minY: im.h, maxY: 0 };
  const blueBins = new Map();
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * im.ch;
    const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    if (b - r >= 30 && b >= 180 && lum(r, g, b) >= 80) {
      blueBox.minX = Math.min(blueBox.minX, x); blueBox.maxX = Math.max(blueBox.maxX, x);
      blueBox.minY = Math.min(blueBox.minY, y); blueBox.maxY = Math.max(blueBox.maxY, y);
      const k = `${(x / 64) | 0},${(y / 64) | 0}`;
      blueBins.set(k, (blueBins.get(k) || 0) + 1);
    }
  }
  B.relaxedBlue = {
    bbox: [blueBox.minX, blueBox.minY, blueBox.maxX, blueBox.maxY],
    topBins64: [...blueBins.entries()].sort((p, q) => q[1] - p[1]).slice(0, 5)
      .map(([k, n2]) => ({ bin: k.split(',').map((v) => v * 64), n: n2 })),
  };
  say(`B4 relaxed bright-blue bbox ${JSON.stringify(B.relaxedBlue.bbox)}  top 64px bins ${JSON.stringify(B.relaxedBlue.topBins64)}`);
  try {
    const im2 = readPNG(R('./sbs1/sly-closeup.png'));
    let n2 = 0, band2 = 0;
    for (let y = 0; y < im2.h; y++) for (let x = 0; x < im2.w; x++) {
      const i = (y * im2.w + x) * im2.ch;
      const r = im2.data[i], g = im2.data[i + 1], b = im2.data[i + 2];
      if (b - r >= 30 && b >= 180 && lum(r, g, b) >= 80) n2++;
      if (Math.abs(r - 143) <= 40 && Math.abs(g - 216) <= 35 && Math.abs(b - 255) <= 40) band2++;
    }
    B.slyCloseup = { relaxedBluePx: n2, inBandPx: band2 };
    say(`B4 sbs1/sly-closeup.png: in-band px ${band2}, relaxed bright-blue px ${n2} (probe once latched 17 sparkles at this staging)`);
  } catch (e) { say('B4 sly-closeup check skipped:', e.message); }
  saveCrop(im, Math.max(0, 591 - 60), Math.max(0, 185 - 60), Math.min(im.w, 591 + 60), Math.min(im.h, 185 + 60), R('./fxcluster-B-hook4-crop.png'));
  say('B4 crop saved: fxcluster-B-hook4-crop.png (120px box on hook#4, the swing hook)');

  OUT.sections.B = B;
}

/* ============================== C — combat flash/arc ============================== */

function sectionC() {
  say('\n=== C. combat impact flash + slash arc — gold1/combat.png (+ sbs1 cross-boot) ===');
  const C = {};
  for (const [tag, file] of [['gold1', FRAMES.combat], ['sbs1', FRAMES.combatSbs]]) {
    const im = readPNG(file);
    const fig = rectStats(im, 360, 390, 720, 670);
    // stated thresholds: blue px = hue 190-260 & sat>=0.25 & L>=40; chalk = L>=180 & sat<=0.20;
    // warm-gold = hue 30-55 & sat>=0.35 & L>=120.
    let blue = 0, chalk = 0, gold = 0, n = 0;
    for (let y = 390; y < 670; y++) for (let x = 360; x < 720; x++) {
      const i = (y * im.w + x) * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      const L = lum(r, g, b), s = satOf(r, g, b), h = hueOf(r, g, b);
      n++;
      if (h >= 190 && h <= 260 && s >= 0.25 && L >= 40) blue++;
      if (L >= 180 && s <= 0.20) chalk++;
      if (h >= 30 && h <= 55 && s >= 0.35 && L >= 120) gold++;
    }
    // the arc/flash: brightest band across the whole frame
    const satsHi = []; let hiN = 0;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const i = (y * im.w + x) * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      if (lum(r, g, b) >= 230) { satsHi.push(satOf(r, g, b)); hiN++; }
    }
    C[tag] = {
      figure: { medL: +fig.medL.toFixed(1), medSat: +fig.medSat.toFixed(3), n },
      bluePx: blue, chalkPx: chalk, chalkShare: +(chalk / n).toFixed(3), goldPx: gold,
      brightBand: { n: hiN, medSat: +median(satsHi).toFixed(3) },
    };
    say(`C1 [${tag}] figure(360,390,720,670): medL ${C[tag].figure.medL}  medSat ${C[tag].figure.medSat}  ` +
      `(CRITIC on char10: medL 199.7 / medSat 0.165)`);
    say(`C1 [${tag}] blue px (hue190-260,s>=.25,L>=40): ${blue}  chalk px (L>=180,s<=.20): ${chalk} (${(100 * chalk / n).toFixed(1)}%)  warm-gold px: ${gold}`);
    say(`C1 [${tag}] frame-wide L>=230 band: ${hiN} px, medSat ${C[tag].brightBand.medSat}  (the arc/flash "monochrome" claim)`);
  }

  // C2 — geometry: where the staged impact fires and how big cane_flash is on screen.
  const cam = makeCamera({ pos: [4.6, 2.35, 31.4], target: [-0.6, 1.5, 27.0], fov: 40 });
  const dir = norm(V(0.30, 0.10, 0.95));
  const impact = add(V(0 + 0, 1.28, 28.0), mul(dir, 1.05)); // player (0,0,28) + y1.28 + dir*1.05  (Particles.js:2565-2569)
  const p = cam.project(impact);
  const pxPerM = 720 / (2 * p.depth * Math.tan((40 / 2) * Math.PI / 180));
  C.impact = {
    world: [+impact.x.toFixed(2), +impact.y.toFixed(2), +impact.z.toFixed(2)],
    px: [Math.round(p.px), Math.round(p.py)], depth: +p.depth.toFixed(2),
    pxPerMetre: +pxPerM.toFixed(1),
    flashStartDiameterPx: Math.round(1.5 * 1.35 * pxPerM), // cane_flash size[0] 1.5 m x heavy 1.35 (Emitters.js:453, Particles.js:2517)
  };
  say(`C2 staged impact at ${JSON.stringify(C.impact.world)} -> px ${C.impact.px}, depth ${C.impact.depth} m, ${C.impact.pxPerMetre} px/m`);
  say(`C2 cane_flash starts at 1.5 m x heavy 1.35 = ${C.impact.flashStartDiameterPx} px diameter, alpha 2.6 ADDITIVE (spark batch) — over the figure rect`);

  // C3 — emitted spectra through the approximate composite: what colour CAN the arc be?
  const spec = { goldSpec: 0xfffbe8, goldLight: 0xffe9a8, goldMid: 0xe8b942 };
  C.emitted = {};
  for (const [name, hex] of Object.entries(spec)) {
    const c = hex2lin(hex);
    for (const gain of [1.0, 2.6]) {
      const disp = agx(c[0] * gain, c[1] * gain, c[2] * gain).map(lin2srgb255).map((v) => Math.round(v));
      C.emitted[`${name}@${gain}`] = { srgb: disp, sat: +satOf(...disp).toFixed(3) };
    }
  }
  say('C3 emitted colours through approx AgX (sat after grade):');
  for (const [k, v] of Object.entries(C.emitted)) say(`   ${k}: rgb ${v.srgb} sat ${v.sat}`);
  say('C3 => goldSpec/goldLight arrive near-white at emitter gains; PAL.flameBody\'s own note (Emitters.js:41-54) names the mechanism');

  OUT.sections.C = C;
}

/* ============================== D — interior ceiling shapes ============================== */

function sectionD() {
  say('\n=== D. interior detached warm-bright ceiling shapes ===');
  const D = {};
  for (const [tag, file] of [['hullkerb', FRAMES.interior], ['cand1', FRAMES.interiorCand]]) {
    const im = readPNG(file);
    const x0 = 500, y0 = 0, x1 = 1280, y1 = 200;
    // Warm-bright mask, threshold stated; swept so the CRITIC's 11.3% has a bracket.
    const masks = {};
    for (const [mName, Lmin] of [['L120', 120], ['L140', 140], ['L160', 160]]) {
      const W = x1 - x0, H = y1 - y0;
      const m = new Uint8Array(W * H);
      let cov = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * im.w + x) * im.ch;
        const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
        if (r - b >= 10 && lum(r, g, b) >= Lmin) { m[(y - y0) * W + (x - x0)] = 1; cov++; }
      }
      // connected components (4-neighbour)
      const seen = new Uint8Array(W * H); const comps = [];
      for (let s = 0; s < W * H; s++) {
        if (!m[s] || seen[s]) continue;
        const stack = [s]; seen[s] = 1;
        let minX = W, maxX = 0, minY = H, maxY = 0, count = 0, sr = 0, sg = 0, sb = 0, sx = 0, sy = 0;
        while (stack.length) {
          const q = stack.pop(); count++;
          const qx = q % W, qy = (q / W) | 0;
          minX = Math.min(minX, qx); maxX = Math.max(maxX, qx);
          minY = Math.min(minY, qy); maxY = Math.max(maxY, qy);
          sx += qx; sy += qy;
          const gi = ((qy + y0) * im.w + (qx + x0)) * im.ch;
          sr += im.data[gi]; sg += im.data[gi + 1]; sb += im.data[gi + 2];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = qx + dx, ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (m[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
          }
        }
        if (count >= 20) comps.push({
          w: maxX - minX + 1, h: maxY - minY + 1, px: count,
          cx: Math.round(sx / count) + x0, cy: Math.round(sy / count) + y0,
          medRGB: [Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)],
        });
      }
      comps.sort((a, b) => b.w - a.w);
      masks[mName] = { coverage: +(cov / (W * H)).toFixed(4), nComps: comps.length, top: comps.slice(0, 6) };
    }
    // flame cores frame-wide: very bright warm saturated
    const cores = [];
    for (let y = 0; y < im.h; y += 2) for (let x = 0; x < im.w; x += 2) {
      const i = (y * im.w + x) * im.ch;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      if (lum(r, g, b) >= 225 && r - b >= 40 && satOf(r, g, b) >= 0.25) cores.push([x, y]);
    }
    // cluster cores coarsely (bin 40 px)
    const coreBins = new Map();
    for (const [x, y] of cores) {
      const k = `${(x / 40) | 0},${(y / 40) | 0}`;
      coreBins.set(k, (coreBins.get(k) || 0) + 1);
    }
    const coreCentres = [...coreBins.entries()].filter(([, n]) => n >= 3)
      .map(([k]) => k.split(',').map((v) => (+v) * 40 + 20));
    // detachment: distance from each big component to nearest core centre
    const detach = (c) => {
      let dmin = Infinity;
      for (const [cx, cy] of coreCentres) dmin = Math.min(dmin, Math.hypot(c.cx - cx, c.cy - cy));
      return Math.round(dmin);
    };
    for (const mName of Object.keys(masks)) for (const c of masks[mName].top) c.dNearestFlame = coreCentres.length ? detach(c) : null;
    D[tag] = { masks, flameCoreCentres: coreCentres };
    say(`D1 [${tag}] ceiling band (500,0,1280,200), warm-bright = R-B>=10 & L>=Lmin, comps >=20 px:`);
    for (const [mName, mv] of Object.entries(masks)) {
      say(`   ${mName}: coverage ${(mv.coverage * 100).toFixed(1)}%  comps ${mv.nComps}  ` +
        `widest ${mv.top[0] ? mv.top[0].w + 'px (at ' + mv.top[0].cx + ',' + mv.top[0].cy + ', medRGB ' + mv.top[0].medRGB + ', d(flame) ' + mv.top[0].dNearestFlame + 'px)' : '—'}`);
    }
    say(`   flame-core clusters found (L>=225 & R-B>=40 & sat>=.25, binned): ${coreCentres.length} at ${JSON.stringify(coreCentres)}`);
  }
  say('D2 moteMaxH ceiling = 0.028 x 720 = 20.2 px diameter (Particles.js:106, clamp :608-611):');
  say('   any component wider than ~21 px is NOT the clamped mote/airMotes population;');
  say('   unclamped warm-bright candidates: fire_body 0.30-0.55 m additive (Emitters.js:557-562),');
  say('   torch_smoke 0.16-1.1 m lit smoke (:563-568), FlameField billboard, + POSTFX bloom.');
  const imh = readPNG(FRAMES.interior);
  saveCrop(imh, 940, 100, 1120, 200, R('./fxcluster-D-interior-widest-crop.png'));
  saveCrop(imh, 500, 0, 1280, 200, R('./fxcluster-D-interior-ceilingband-crop.png'));
  say('D2 crops saved: fxcluster-D-interior-widest-crop.png (940,100..1120,200), fxcluster-D-interior-ceilingband-crop.png');
  OUT.sections.D = D;
}

/* ============================== E — dunes pyramid/sky ============================== */

function sectionE() {
  say('\n=== E. dunes pyramid vs sky — cand1/frames/dunes.base.png ===');
  const im = readPNG(FRAMES.dunes);
  const E = { frame: 'cand1/frames/dunes.base.png' };
  const cam = makeCamera({ pos: [26.0, 19.5, 84.0], target: [-2.0, 9.0, 18.0], fov: 42 });

  // Pyramid_105: centre (-150, -190), plateau base y 6.5, apex y 111.5, halfBase 82 (Terrain.js:275-289).
  const apex = cam.project(V(-150, 111.5, -190));
  const baseL = cam.project(V(-150 - 82, 6.5, -190));
  const baseR = cam.project(V(-150 + 82, 6.5, -190));
  E.pyramid105 = {
    apexPx: apex.behind ? 'behind' : [Math.round(apex.px), Math.round(apex.py)],
    baseLeftPx: baseL.behind ? 'behind' : [Math.round(baseL.px), Math.round(baseL.py)],
    baseRightPx: baseR.behind ? 'behind' : [Math.round(baseR.px), Math.round(baseR.py)],
    apexDist: +len(sub(V(-150, 111.5, -190), cam.pos)).toFixed(0),
  };
  const p72 = cam.project(V(95, 6.5 + 72, -250));
  E.pyramid72ApexPx = p72.behind ? 'behind' : [Math.round(p72.px), Math.round(p72.py), p72.visible ? 'in' : 'out'];
  say(`E1 pyramid_105 apex px ${JSON.stringify(E.pyramid105.apexPx)}  base L/R ${JSON.stringify(E.pyramid105.baseLeftPx)} ${JSON.stringify(E.pyramid105.baseRightPx)}  (apex ${E.pyramid105.apexDist} m)`);
  say(`E1 pyramid_72 apex px ${JSON.stringify(E.pyramid72ApexPx)}`);

  /* E2 — measure faces vs sky on rows where the pyramid's upper silhouette is against sky.
     The silhouette edge: straight lines apex->baseL and apex->baseR in screen space (the
     projection of straight world edges is straight). Sample inside at 0.35-0.75 of the
     half-width, and sky just outside at 1.3-1.8 x, same rows. */
  if (!apex.behind && !baseL.behind && !baseR.behind) {
    const rows = [];
    const yTop = Math.max(2, Math.round(apex.py) + 4);
    const yBot = Math.min(im.h - 1, Math.round(apex.py) + 90); // upper 90 rows of the mass
    const inL = [], skyL = [];
    for (let y = yTop; y <= yBot; y++) {
      const f = (y - apex.py) / (baseL.py - apex.py);
      if (f <= 0 || f >= 1) continue;
      const xl = apex.px + (baseL.px - apex.px) * f;
      const xr = apex.px + (baseR.px - apex.px) * f;
      const half = (xr - xl) / 2, cx = (xl + xr) / 2;
      for (const s of [0.0, 0.35, -0.35, 0.6, -0.6]) {
        const X = Math.round(cx + s * half);
        if (X < 0 || X >= im.w) continue;
        const i = (y * im.w + X) * im.ch;
        inL.push(lum(im.data[i], im.data[i + 1], im.data[i + 2]));
      }
      for (const s of [1.5, 1.9, -1.5, -1.9]) {
        const X = Math.round(cx + s * half);
        if (X < 0 || X >= im.w) continue;
        const i = (y * im.w + X) * im.ch;
        skyL.push(lum(im.data[i], im.data[i + 1], im.data[i + 2]));
      }
      rows.push(y);
    }
    E.pyramidMedL = +median(inL).toFixed(1);
    E.skyMedL = +median(skyL).toFixed(1);
    E.deltaMedL = +(E.skyMedL - E.pyramidMedL).toFixed(1);
    E.rows = [rows[0], rows[rows.length - 1]];
    say(`E2 rows ${E.rows}: pyramid medL ${E.pyramidMedL}  same-row sky medL ${E.skyMedL}  |Δ| ${Math.abs(E.deltaMedL).toFixed(1)}  (CRITIC: 9.5; ref frame holds 21.4)`);
  }

  /* E3 — the two curves at the pyramid. Applied curve (toon.glsl.js:84-93 via ToonMaterial
     fallback): uHazeDensity = max(fog.density x 2.6, 0.004), uHazeFalloff 0.055, uHazeBase 0,
     uHazeStart 26, uHazeGain 1.30; published reference curve (Atmosphere.js:433-436 /
     applyAerial): blend = 1 - exp(-(d·density·mix(0.55,1,h))²) with h = exp(-y/heightFalloff).
     Atmosphere at tod 0.83: el 15° -> anchors el2/el22 at k=0.718: density 0.00495,
     heightFalloff 54.6 (recomputed here from the tables so a tune change shows up). */
  const el = 15; // SUN_ELEVATION has an exact key [0.83, 15]
  const raw = clamp((el - 2) / 20, 0, 1), k = raw * raw * (3 - 2 * raw);
  const density = 0.0056 + (0.0047 - 0.0056) * k;
  const fogH = 46 + (58 - 46) * k;
  const uHazeDensity = Math.max(density * 2.6, 0.004);
  const camY = 19.5;
  const slyHaze = (rdY, dist) => {
    const b = 0.055;
    const dy = rdY * b;
    const base = uHazeDensity * Math.exp(-(camY - 0) * b);
    const depth = Math.abs(dy) > 1e-4 ? base * (1 - Math.exp(-dist * dy)) / dy : base * dist;
    const gate = smoothstep(26, 26 * 3 + 1, dist);
    return clamp(1 - Math.exp(-Math.max(depth, 0)), 0, 1) * gate;
  };
  const reference = (dist, y) => {
    const h = Math.exp(-Math.max(y, 0) / fogH);
    const d = dist * density * (0.55 + 0.45 * h);
    return 1 - Math.exp(-d * d);
  };
  const pts = [['apex', V(-150, 111.5, -190)], ['mid', V(-150, 60, -190)], ['base', V(-150, 20, -190)]];
  E.curves = { density: +density.toFixed(5), uHazeDensity: +uHazeDensity.toFixed(5), fogHeightPublished: +fogH.toFixed(1), falloffApplied: 0.055 };
  E.blend = {};
  for (const [name, w] of pts) {
    const d = len(sub(w, cam.pos));
    const rdY = (w.y - camY) / d;
    E.blend[name] = { dist: +d.toFixed(0), applied: +slyHaze(rdY, d).toFixed(3), reference: +reference(d, w.y).toFixed(3) };
    say(`E3 ${name} (y ${w.y}): dist ${E.blend[name].dist} m  APPLIED slyHaze blend ${E.blend[name].applied}  vs published applyAerial ${E.blend[name].reference}`);
  }
  say('E3 => the curve the pyramid actually gets is the ToonMaterial fallback (density x2.6,');
  say('   falloff hardcoded 0.055 = 18 m scale height; Atmosphere fogHeight 54.6 and inscatter');
  say('   never reach it — setAtmosphere() has no caller, ToonMaterial.js:1495-1497).');

  // Haze colour the pyramid converges to: fog.color anchors lerped, x hazeGain 1.30, + sun term.
  const lerp3 = (a, b, t2) => a.map((v, i) => v + (b[i] - v) * t2);
  const fogCol = lerp3(hex2lin(0xdb9a68), hex2lin(0xe8b878), k);
  const disp = agx(...fogCol.map((v) => v * 1.30)).map(lin2srgb255).map((v) => Math.round(v));
  E.hazeColour = { linear: fogCol.map((v) => +v.toFixed(3)), displayApprox: disp, displayL: +lum(...disp).toFixed(1) };
  say(`E3 haze colour (fog.color x uHazeGain 1.30) ≈ display rgb ${disp} L ${E.hazeColour.displayL} (approx AgX) — vs measured sky ${E.skyMedL} and pyramid ${E.pyramidMedL}`);

  /* E4 — does the pyramid's silhouette EDGE exist at all in the frame? Along the predicted
     left edge (apex->baseL line), rows 4..110: mean |L(edge-8px out) - L(edge+8px in)|,
     against a control column 70 px further left in open sky (sky noise floor). */
  if (!apex.behind && !baseL.behind) {
    let edgeSum = 0, ctrlSum = 0, nRows = 0;
    for (let y = 4; y <= 110; y++) {
      const f = (y - apex.py) / (baseL.py - apex.py);
      if (f <= 0 || f >= 1) continue;
      const xe = Math.round(apex.px + (baseL.px - apex.px) * f);
      if (xe - 78 < 0 || xe + 8 >= im.w) continue;
      const g = (X) => { const i = (y * im.w + X) * im.ch; return lum(im.data[i], im.data[i + 1], im.data[i + 2]); };
      edgeSum += Math.abs(g(xe - 8) - g(xe + 8));
      ctrlSum += Math.abs(g(xe - 78) - g(xe - 62));
      nRows++;
    }
    E.leftEdge = { rows: nRows, meanEdgeStep: +(edgeSum / (nRows || 1)).toFixed(2), skyNoiseStep16px: +(ctrlSum / (nRows || 1)).toFixed(2) };
    say(`E4 predicted left-edge |ΔL| across 16 px: ${E.leftEdge.meanEdgeStep} vs open-sky control ${E.leftEdge.skyNoiseStep16px} over ${nRows} rows`);
    say('E4 => if edge step ≈ sky noise, the landmark silhouette is unrecoverable at these rows');
  }
  // CRITIC-style rect check for continuity with their numbers.
  E.rects = {
    pyramidInterior: rectStats(im, 470, 30, 650, 90),
    skyLeft: rectStats(im, 130, 30, 280, 90),
  };
  say(`E4 rect check: pyramid interior (470,30,650,90) medL ${E.rects.pyramidInterior.medL.toFixed(1)}  vs left sky (130,30,280,90) medL ${E.rects.skyLeft.medL.toFixed(1)}`);
  saveCrop(im, 240, 0, 760, 290, R('./fxcluster-E-dunes-pyramid-crop.png'));
  say('E4 crop saved: fxcluster-E-dunes-pyramid-crop.png (240,0..760,290)');

  OUT.sections.E = E;
}

/* ============================== run ============================== */

const want = process.argv.slice(2).map((s) => s.toUpperCase());
const all = !want.length;
try { if (all || want.includes('A')) sectionA(); } catch (e) { say('A FAILED:', e.message); OUT.sections.A = { error: e.message }; }
try { if (all || want.includes('B')) sectionB(); } catch (e) { say('B FAILED:', e.message); OUT.sections.B = { error: e.message }; }
try { if (all || want.includes('C')) sectionC(); } catch (e) { say('C FAILED:', e.message); OUT.sections.C = { error: e.message }; }
try { if (all || want.includes('D')) sectionD(); } catch (e) { say('D FAILED:', e.message); OUT.sections.D = { error: e.message }; }
try { if (all || want.includes('E')) sectionE(); } catch (e) { say('E FAILED:', e.message); OUT.sections.E = { error: e.message }; }

writeFileSync(R('./fxcluster-diag-out.json'), JSON.stringify(OUT, null, 1));
say('\nwrote fxcluster-diag-out.json');
