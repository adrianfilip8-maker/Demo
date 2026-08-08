/**
 * glslink — does the cel fragment program LINK? Four arms, offline, NO CAPTURE LOCK.
 *
 * This is the reproducer for §219's table. It boots no vite server and no game: it serves the
 * three shader modules over a scratch http server, imports them in headless Chromium on the
 * same ANGLE/SwiftShader stack the harness uses, builds a real `Shading.toon()` material,
 * renders one 64x64 frame to force compilation, and reads LINK_STATUS and the driver's info
 * log straight off the GL program.
 *
 * Why it exists as a standing tool rather than as a one-off: for five hours the game's entire
 * cel material failed to link and nothing noticed, because a dead program and a working one
 * produce equally plausible PNGs (sky, ink and post have their own programs). Three diagnostics
 * read the image instead of the driver and each concluded a *uniform* was not reaching the
 * shader. `npm test` catches the source-text form of that damage; this catches everything else,
 * in about fifteen seconds, without queueing behind the capture lock.
 *
 * ── Arms, two of which must fail ────────────────────────────────────────────────────────
 *   CONTROL   stock MeshStandardMaterial      MUST LINK   — else the instrument is dead
 *   PRE-REGR  6e0cc8f^ Shading.toon()         MUST LINK   — the last known-good cel program
 *   CURRENT   working tree Shading.toon()     the subject
 *   POISON    patched + injected garbage      MUST FAIL   — else the instrument is BLIND
 *
 * The POISON arm is the one that matters. An earlier version of this probe ran every arm on a
 * shared renderer and reported the subject as healthy — because both `Shading` builds return
 * the same `customProgramCacheKey` ("sly:00"), so three's program cache handed the subject the
 * arm before it. Each arm therefore gets its own WebGLRenderer, and each prints a hash of the
 * fragment source it actually compiled so that silent sharing is visible rather than inferred.
 *
 * PRE-REGR needs the pre-regression sources on disk; skipped automatically if absent:
 *     mkdir -p /tmp/glslink-old/shaders
 *     git show 6e0cc8f^:src/render/ToonMaterial.js       > /tmp/glslink-old/ToonMaterial.js
 *     git show 6e0cc8f^:src/render/Outline.js            > /tmp/glslink-old/Outline.js
 *     git show 6e0cc8f^:src/render/shaders/toon.glsl.js  > /tmp/glslink-old/shaders/toon.glsl.js
 *
 * Run:  node progress/records/glslink.mjs        (exit 0 = subject links, 1 = it does not)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OLD = process.env.GLSLINK_OLD || '/tmp/glslink-old';
const HAS_OLD = fs.existsSync(path.join(OLD, 'ToonMaterial.js'));
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
  const isOld = url.startsWith('/old/');
  const f = path.join(isOld ? OLD : ROOT, isOld ? url.slice(4) : url);
  if (!f.startsWith(isOld ? OLD : ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
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

const out = await page.evaluate(async (hasOld) => {
  const THREE = await import('three');
  const cur = await import('/src/render/ToonMaterial.js');
  const old = hasOld ? await import('/old/ToonMaterial.js') : null;
  const results = [];
  const hash = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0; return x.toString(16); };

  function arm(name, must, make) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    document.getElementById('host').appendChild(canvas);
    /* One renderer per arm: a shared one lets three's program cache serve arm N the program
       arm N-1 compiled, because both Shading builds share a customProgramCacheKey. */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.z = 3;
    const dl = new THREE.DirectionalLight(0xffffff, 1);
    dl.castShadow = true;
    scene.add(dl);
    const gl = renderer.getContext();
    const material = make();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    try { renderer.compile(scene, cam); renderer.render(scene, cam); } catch { /* read below */ }
    const prog = (renderer.properties.get(material) || {}).currentProgram;
    let linked = null, nUni = null, log = '', fragHash = '-', fragLen = 0;
    if (prog && prog.program) {
      linked = gl.getProgramParameter(prog.program, gl.LINK_STATUS);
      nUni = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
      for (const s of (gl.getAttachedShaders(prog.program) || [])) {
        const src = gl.getShaderSource(s) || '';
        if (src.includes('slyRamp') || src.includes('pc_fragColor')) { fragHash = hash(src); fragLen = src.length; }
        const l = (gl.getShaderInfoLog(s) || '').trim();
        if (l) log += (log ? '\n' : '') + l;
      }
    }
    renderer.dispose();
    results.push({ name, must, linked: !!linked, nUni, fragHash, fragLen, log: log.slice(0, 300) });
  }

  arm('CONTROL   stock MeshStandardMaterial', 'link', () => new THREE.MeshStandardMaterial({ color: 0x888888 }));
  if (old) arm('PRE-REGR  6e0cc8f^ Shading.toon()', 'link', () => new old.Shading({}).toon({ color: 0xc9915a }));
  arm('CURRENT   working tree Shading.toon()', 'subject', () => new cur.Shading({}).toon({ color: 0xc9915a }));
  arm('POISON    patched + injected garbage', 'fail', () => {
    const stub = { _patchWarned: false, _warn() {} };
    const m = new THREE.MeshStandardMaterial({ color: 0x888888 });
    m.customProgramCacheKey = () => 'poison';
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = cur.Shading.prototype._patch.call(stub, sh.fragmentShader)
        .replace('void main() {', 'void main() {\n@@@ not glsl @@@\n');
    };
    return m;
  });
  return results;
}, HAS_OLD);

if (!HAS_OLD) console.log('(PRE-REGR arm skipped — see the header for how to stage it)\n');

let instrumentOk = true;
let subjectOk = false;
const hashes = new Set();
for (const r of out) {
  console.log(`${r.linked ? 'LINK OK  ' : 'LINK FAIL'}  uniforms=${String(r.nUni).padEnd(4)} fragHash=${r.fragHash} len=${String(r.fragLen).padEnd(7)} ${r.name}`);
  if (r.log) console.log(`             ${r.log.split('\n')[0]}`);
  if (r.fragHash !== '-') {
    if (hashes.has(r.fragHash)) console.log('             !! same fragment source as an earlier arm — the program cache is sharing, this arm is void');
    hashes.add(r.fragHash);
  }
  if (r.must === 'link' && !r.linked) instrumentOk = false;
  if (r.must === 'fail' && r.linked) instrumentOk = false;
  if (r.must === 'subject') subjectOk = r.linked && r.nUni > 0;
}
console.log('');
if (!instrumentOk) console.log('=> INSTRUMENT INVALID — a must-link arm failed or the POISON arm linked. Ignore the subject.');
else console.log(subjectOk ? '=> SUBJECT LINKS. The cel fragment program is alive.'
  : '=> SUBJECT DOES NOT LINK. Every toon-shaded pixel in the game is missing (§219).');

await browser.close();
server.close();
process.exit(instrumentOk && subjectOk ? 0 : 1);
