/**
 * Does the patched AgX compile in the DRIVER, and does the shoulder do the arithmetic the
 * float64 model says it does?
 *
 * §24.6's pattern: the model agreeing with itself is not evidence the shader is right. This
 * compiles the real GLSL_AGX string on the same ANGLE/SwiftShader the harness uses, renders a
 * set of known radiances through slyAgX at several shoulder values, reads the bytes back, and
 * compares against tonecurve.mjs's float64 chain.
 *
 * Renders 1x1 per sample into an 8x8 buffer. Does NOT take the capture lock — this is two
 * triangles, not a frame.
 */
import { chromium } from 'playwright';
import { agx, agxShipped } from './tonecurve.mjs';
import { shoulder } from './toneclosed.mjs';
import { readFileSync } from 'node:fs';

const GLSL_AGX = (await import('/home/user/Demo/src/render/passes/Common.js')).GLSL_AGX;

const SAMPLES = [
  [0.02, 0.02, 0.02], [0.18, 0.18, 0.18], [0.50, 0.50, 0.50],
  [0.9338, 0.9338, 0.9338], [2.0, 2.0, 2.0], [5.0, 5.0, 5.0],
  [0.42, 0.28, 0.16], [0.05, 0.09, 0.22],           // warm stone / cool shadow, off the grey axis
];
const BS = [1.0, 1.2, 1.5];

import { existsSync } from 'node:fs';
const exe = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  page error:', m.text()); });

const out = await page.evaluate(({ glsl, samples, bs }) => {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const gl = cv.getContext('webgl2');
  if (!gl) return { error: 'no webgl2' };
  const vs = `#version 300 es
  in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
  const fs = `#version 300 es
  precision highp float;
  ${glsl}
  uniform vec3 uIn; uniform float uB;
  out vec4 o;
  void main(){ o = vec4( slyAgX( uIn, 1.0, uB ), 1.0 ); }`;
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { error: 'link: ' + gl.getProgramInfoLog(prog) };
  } catch (e) { return { error: 'compile: ' + e.message }; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uIn = gl.getUniformLocation(prog, 'uIn'), uB = gl.getUniformLocation(prog, 'uB');
  const px = new Uint8Array(4);
  const res = [];
  for (const b of bs) for (const s of samples) {
    gl.uniform3f(uIn, s[0], s[1], s[2]); gl.uniform1f(uB, b);
    gl.viewport(0, 0, 8, 8); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    res.push({ b, s, got: [px[0], px[1], px[2]] });
  }
  return { res, glError: gl.getError(), renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
}, { glsl: GLSL_AGX, samples: SAMPLES, bs: BS });

await browser.close();

if (out.error) { console.log('SHADER FAILED:', out.error); process.exit(1); }
console.log(`renderer: ${out.renderer}`);
console.log(`glError:  ${out.glError} ${out.glError === 0 ? 'OK' : 'FAIL'}`);

// the shader writes linear-sRGB into an UNORM8 target, so the model must be compared in the
// same encoding: no sRGB transfer here, just the 0..1 clamp and the 8-bit quantiser.
const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
let worst = 0, worstAt = null;
console.log('\n  b     scene                    shader RGB      model RGB       d');
for (const r of out.res) {
  const curve = r.b === 1.0 ? agxShipped : shoulder(r.b);
  const m = agx(r.s, curve).map(q);
  const d = Math.max(...[0, 1, 2].map((i) => Math.abs(m[i] - r.got[i])));
  if (d > worst) { worst = d; worstAt = r; }
  console.log(`  ${r.b.toFixed(2)}  [${r.s.map((x) => x.toFixed(3)).join(',')}]  ${String(r.got).padEnd(15)} ${String(m).padEnd(15)} ${d}`);
}
console.log(`\nmax |shader - model| = ${worst} of 255  ${worst <= 2 ? 'OK' : 'FAIL — model and shader disagree'}`);
if (worstAt && worst > 2) console.log('worst at', JSON.stringify(worstAt));

// the load-bearing guarantee: b=1.0 must be bit-identical to the shipped curve
const b1 = out.res.filter((r) => r.b === 1.0);
console.log(`\nb=1.0 arms: ${b1.length}, all must equal the shipped-curve model exactly`);
let exact = true;
for (const r of b1) { const m = agx(r.s, agxShipped).map(q); if (String(m) !== String(r.got)) { exact = false; console.log('  MISMATCH', r.s, r.got, m); } }
console.log(exact ? '  bit-identical OK' : '  FAIL');
