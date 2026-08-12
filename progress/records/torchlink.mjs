/**
 * torchlink — does the cel program still LINK with the local-torch term compiled IN?
 *
 * glslink.mjs (§219's standing probe) renders its box under a DirectionalLight only, so
 * NUM_POINT_LIGHTS is 0 there and PREREG-torchlight's block is compiled OUT by its own
 * `#if NUM_POINT_LIGHTS > 0` guard — glslink alone cannot exercise this seal's GLSL. This
 * fork adds one live THREE.PointLight so NUM_POINT_LIGHTS = 1, plus a no-point-light arm to
 * prove the guard compiles both ways. Same stack as the harness (ANGLE/SwiftShader), no vite,
 * NO CAPTURE LOCK, ~15 s.
 *
 *   CONTROL   stock MeshStandardMaterial + point light   MUST LINK  — instrument alive
 *   PL        Shading.toon() + point light               subject    — must link AND its
 *             compiled fragment must CONTAIN uLocalToon + getPointLightInfo (the term is in)
 *   NOPL      Shading.toon(), no point light             MUST LINK  — guard compiles out;
 *             fragment must NOT contain getPointLightInfo
 *   POISON    PL arm with garbage injected inside the new block   MUST FAIL — else blind
 *
 * Run:  node progress/records/torchlink.mjs      (exit 0 = subject links, 1 = it does not)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => fs.existsSync(p)) || process.env.CHROME_PATH;
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8">'
      + '<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>'
      + '<div id="host"></div>');
    return;
  }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const out = await page.evaluate(async () => {
  const THREE = await import('three');
  const cur = await import('/src/render/ToonMaterial.js');
  const results = [];

  function arm(name, must, withPoint, make) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    document.getElementById('host').appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.z = 3;
    const dl = new THREE.DirectionalLight(0xffffff, 1);
    dl.castShadow = true;
    scene.add(dl);
    if (withPoint) {
      const pl = new THREE.PointLight(0xffb060, 3.4, 9, 2);
      pl.position.set(0.5, 0.8, 1.2);
      scene.add(pl);
    }
    const gl = renderer.getContext();
    const material = make();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    try { renderer.compile(scene, cam); renderer.render(scene, cam); } catch { /* read below */ }
    const prog = (renderer.properties.get(material) || {}).currentProgram;
    let linked = null, nUni = null, log = '', hasTerm = null, hasPLI = null;
    if (prog && prog.program) {
      linked = gl.getProgramParameter(prog.program, gl.LINK_STATUS);
      nUni = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
      for (const s of (gl.getAttachedShaders(prog.program) || [])) {
        const src = gl.getShaderSource(s) || '';
        if (src.includes('slyRamp') || src.includes('pc_fragColor')) {
          hasTerm = src.includes('uLocalToon');
          hasPLI = src.includes('getPointLightInfo');
        }
        const l = (gl.getShaderInfoLog(s) || '').trim();
        if (l) log += (log ? '\n' : '') + l;
      }
    }
    renderer.dispose();
    results.push({ name, must, linked: !!linked, nUni, hasTerm, hasPLI, log: log.slice(0, 240) });
  }

  arm('CONTROL  stock standard + PL', 'link', true, () => new THREE.MeshStandardMaterial({ color: 0x888888 }));
  arm('PL       toon + point light', 'subject', true, () => {
    const sh = new cur.Shading({});
    sh.uniforms.uLocalToon.value = 2.5;
    return sh.toon({ color: 0xc9915a });
  });
  arm('NOPL     toon, no point light', 'link', false, () => new cur.Shading({}).toon({ color: 0xc9915a }));
  arm('POISON   garbage inside the block', 'fail', true, () => {
    const stub = { _patchWarned: false, _warn() {} };
    const m = new THREE.MeshStandardMaterial({ color: 0x888888 });
    m.customProgramCacheKey = () => 'torchpoison';
    m.onBeforeCompile = (sh2) => {
      const patched = cur.Shading.prototype._patch.call(stub, sh2.fragmentShader);
      const anchor = 'if ( uLocalToon > 0.0 ) {';
      if (!patched.includes(anchor)) throw new Error('poison anchor missing');
      sh2.fragmentShader = patched.replace(anchor, anchor + '\n@@@ not glsl @@@\n');
    };
    return m;
  });
  return results;
});

let instrumentOk = true, subjectOk = false;
for (const r of out) {
  console.log(`${r.linked ? 'LINK OK  ' : 'LINK FAIL'} uniforms=${String(r.nUni).padEnd(4)} term=${r.hasTerm} pli=${r.hasPLI} ${r.name}`);
  if (r.log) console.log(`             ${r.log.split('\n')[0]}`);
  if (r.must === 'link' && !r.linked) instrumentOk = false;
  if (r.must === 'fail' && r.linked) instrumentOk = false;
  if (r.must === 'subject') subjectOk = r.linked && r.nUni > 0 && r.hasTerm === true && r.hasPLI === true;
  if (r.name.startsWith('NOPL') && r.hasPLI !== false) {
    instrumentOk = false;
    console.log('             !! NOPL arm still contains getPointLightInfo — the NUM_POINT_LIGHTS guard is not guarding');
  }
}
console.log('');
if (!instrumentOk) console.log('=> INSTRUMENT INVALID — a must-link arm failed, POISON linked, or the guard leaked.');
else console.log(subjectOk
  ? '=> SUBJECT LINKS with the torch term compiled in (and compiles out cleanly without point lights).'
  : '=> SUBJECT DOES NOT LINK (or the term is missing from the compiled source).');

await browser.close();
server.close();
process.exit(instrumentOk && subjectOk ? 0 : 1);
