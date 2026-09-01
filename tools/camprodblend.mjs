/**
 * camprodblend.mjs — is the SHIPPED ARTIFACT actually running the soft-start framing blend?
 *
 * §744's change is one numeric constant and one branch inside `_blendFrame`. `tools/prodboot.mjs`
 * proves the production build boots and asks for nothing that 404s; it cannot say which branch the
 * browser took. This asks that one question and nothing else, on `dist/`, in a real browser — and
 * it asks it of the MECHANISM rather than of a symptom (§439): it runs one frame of the blend on
 * the live rig and compares the number that comes out against the two closed forms.
 *
 *   first-order `ease`       Δ · (1 − e^(−dt/τ))
 *   critically damped        Δ · (1 − (1 + x + 0.48x² + 0.235x³)⁻¹ · (1 + x))   x = 2·dt/(τ·shape)
 *
 * For `dive` (`Δdist` −2.20 from a settled `idle`, `tau` 0.09) at 60 Hz the two are −0.3719 m and
 * −0.1747 m. There is no reading of one that could be mistaken for the other.
 *
 * **Deliberately NOT prodboot's job and deliberately not a second copy of it.** No 4xx gate, no
 * module census, no warning report — prodboot owns all of that and is run beside this. What is
 * duplicated is 30 lines of static file server, which is the price of not turning a boot checker
 * into a camera probe.
 *
 * Usage:  node tools/camprodblend.mjs            (expects an existing dist/; run `npm run build` first)
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PREFIX = '/Demo/';
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars',
  '--js-flags=--max-old-space-size=4096'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.fbx': 'application/octet-stream',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

if (!existsSync(DIST)) { console.error('[camprodblend] no dist/ — run `npm run build` first'); process.exit(1); }

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  s.on('error', rej);
});

function serve(port) {
  const srv = http.createServer((req, res) => {
    const raw = decodeURIComponent((req.url || '/').split('?')[0]);
    if (!raw.startsWith(PREFIX)) { res.writeHead(404); res.end('outside prefix'); return; }
    let rel = raw.slice(PREFIX.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('missing'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}

/**
 * One frame of the blend, run on the LIVE rig inside the page.
 *
 * It pokes `_frameKey` and `_frame.dist` directly, which §435.4 forbids for a claim about what a
 * player experiences — and this is not one. The claim is *which arithmetic the shipped bundle
 * executes*, the routing is not under test, and driving a real Cane Slam through the "Click to
 * play" veil (§731.2) would add a dozen failure modes to a question with a closed-form answer.
 * Everything it touches is restored before it returns.
 */
const PROBE = `(() => {
  const rig = window.__GAME && window.__GAME.engine && window.__GAME.engine.get('camera');
  if (!rig || typeof rig._blendFrame !== 'function') return { err: 'no camera rig on __GAME.engine' };
  const keep = { key: rig._frameKey, dist: rig._frame.dist, vel: rig._frameVel ? rig._frameVel.dist : null };
  try {
    rig._frameKey = 'dive';
    rig._frame.dist = 0;
    if (rig._frameVel) rig._frameVel.dist = 0;
    rig._blendFrame(1 / 60);
    const d1 = rig._frame.dist;
    /* §745: settle the RING SWING framing and read the two fractions it ships. The key has to
       move first: the probe above left it on the dive row, and reading the fractions there returned
       1.0/1.0 for both arms, which looked like the tokens being ignored and was the probe
       settling the wrong row. */
    rig._frameKey = 'hook_swing';
    for (let i = 0; i < 900; i++) rig._blendFrame(1 / 60);
    return { d1, hasVel: !!rig._frameVel,
      vtip: rig._frame.vtip, track: rig._frame.track, trackTau: null };
  } finally {
    rig._frameKey = keep.key; rig._frame.dist = keep.dist;
    if (rig._frameVel && keep.vel !== null) rig._frameVel.dist = keep.vel;
    if (rig.snap) rig.snap(false);   // put the framing channels back where play left them
  }
})()`;

const DT = 1 / 60, TAU = 0.09, D = -2.20;
const easeForm = D * (1 - Math.exp(-DT / TAU));
const dampForm = (shape) => {
  const x = 2 * DT / (TAU * shape);
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = 0 - D, goal = D, temp = (0 + (2 / (TAU * shape)) * change) * DT;
  return goal + (change + temp) * decay;
};

const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s)\n`) });
const port = await freePort();
const srv = await serve(port);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)), args: ARGS });
const out = [];
try {
  for (const q of ['', 'cam=hardblend,swingtip,swingtrack']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const url = `http://127.0.0.1:${port}${PREFIX}${q ? `?${q}` : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('!!(window.__GAME && window.__GAME.ready)', null, { timeout: 180000 });
    const r = await page.evaluate(PROBE);
    out.push({ q: q || '(default)', url, ...r });
    await page.close();
  }
} finally {
  await browser.close(); srv.close(); release();
}

console.log(`\n── §744 THE SHIPPED BLEND, READ OFF dist/ ────────────────────────────────`);
console.log(`   closed form, first-order ease   ${easeForm.toFixed(6)} m`);
console.log(`   closed form, damped @ shape .80 ${dampForm(0.80).toFixed(6)} m`);
let bad = 0;
for (const r of out) {
  if (r.err) { console.log(`   ${r.q.padEnd(14)} ERROR ${r.err}`); bad++; continue; }
  const dEase = Math.abs(r.d1 - easeForm), dDamp = Math.abs(r.d1 - dampForm(0.80));
  const verdict = dDamp < 1e-9 ? 'DAMPED (shape 0.80)' : dEase < 1e-9 ? 'first-order ease' : 'NEITHER';
  console.log(`   ${r.q.padEnd(14)} one frame of dive blend = ${r.d1.toFixed(6)} m  ->  ${verdict}`
    + `   (|Δ| ease ${dEase.toExponential(1)}, damped ${dDamp.toExponential(1)}, _frameVel present ${r.hasVel})`);
  const want = r.q === '(default)' ? 'DAMPED (shape 0.80)' : 'first-order ease';
  if (verdict !== want) { console.log(`      EXPECTED ${want}`); bad++; }
  /* §745, on the same live rig: the two ring-swing fractions, settled. */
  const wantV = r.q === '(default)' ? 0 : 1, wantT = r.q === '(default)' ? 0.2 : 1;
  const okV = Math.abs(r.vtip - wantV) < 1e-6, okT = Math.abs(r.track - wantT) < 1e-6;
  console.log(`   ${''.padEnd(14)} settled hook_swing vtip ${r.vtip.toFixed(4)} (want ${wantV}) ${okV ? 'ok' : 'WRONG'}`
    + `, track ${r.track.toFixed(4)} (want ${wantT}) ${okT ? 'ok' : 'WRONG'}`);
  if (!okV || !okT) bad++;
}
console.log(bad ? `\n   VERDICT: ${bad} check(s) wrong` : '\n   VERDICT: the artifact runs the §744 damped blend and the §745 ring-swing fractions, and the tokens restore all three');
process.exit(bad ? 1 : 0);
