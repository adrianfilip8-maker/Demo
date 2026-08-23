/**
 * celshot.mjs — photograph the two things §682-§685 changed that a player actually SEES.
 *
 *   1. the control cel in PAD mode, which must now read R3 for Thief-o-Vision and show no R2 row
 *      at all (§682 left that button bound to nothing and deleted its glyph);
 *   2. the Thief-o-Vision overlay itself, which is the answer to "a mode that silences the music
 *      must announce itself" — it already did, and this is the frame that says so rather than a
 *      claim that it does.
 *
 * Boots WITHOUT `?shot`, because the HUD only reaches its real state on the path a player takes
 * (§661), and because the pad-glyph swap is driven by the `inputDevice` event rather than by a
 * capture pose.
 *
 * Usage: node tools/celshot.mjs [--out shots/]
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, (process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'shots'));
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--js-flags=--max-old-space-size=4096'];

async function freePort(s = 6600) {
  for (let p = s; p < s + 400; p++) {
    const ok = await new Promise((r) => { const x = net.createServer(); x.once('error', () => r(false)); x.once('listening', () => x.close(() => r(true))); x.listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startVite(port) {
  const proc = spawn(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  proc.stdout.on('data', () => {}); proc.stderr.on('data', () => {});
  for (let i = 0; i < 200; i++) {
    const up = await new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { r(true); s.destroy(); }); s.once('error', () => r(false)); s.setTimeout(2000, () => { r(false); s.destroy(); }); });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite never listened');
}

mkdirSync(OUT, { recursive: true });
const release = await acquire({ onWait: (ms) => process.stdout.write(`· waiting for capture lock (${(ms / 1000) | 0}s)\n`) });
const port = await freePort();
const server = await startVite(port);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || CHROME.find((p) => existsSync(p)), args: ARGS });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 1000 });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(800);
  await page.evaluate(() => { try { window.__ENGINE.renderFrame(1 / 60); } catch {} });

  /* ---- 1. the control cel, in PAD mode ---- */
  const cel = await page.evaluate(() => {
    const hud = window.__ENGINE.get('hud');
    hud.setPaused(true);
    window.__ENGINE.input.lastDevice = 'pad';
    window.__ENGINE.emit('inputDevice', 'pad');
    const cols = hud.el.pause.querySelector('.sly-cols');
    const html = cols ? cols.innerHTML : '';
    const files = [...new Set([...html.matchAll(/assets\/prompts\/([^"]+)/g)].map((m) => m[1]))].sort();
    /* The two claims this frame is evidence for, read out of the DOM as well as photographed. */
    return {
      glyphs: files,
      mentionsR2: files.some((f) => /trigger_r2/.test(f)),
      tovRowText: [...cols.querySelectorAll('*')].map((e) => e.textContent)
        .find((t) => t && t.includes('Thief-o-Vision')) || null,
    };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'cel-pad-r3.png') });
  console.log(`[celshot] control cel (pad mode) -> shots/cel-pad-r3.png`);
  console.log(`          glyphs rendered: ${cel.glyphs.join(', ')}`);
  console.log(`          any R2 glyph:    ${cel.mentionsR2}   <- must be false (§682)`);

  /* ---- 2. the Thief-o-Vision tell ---- */
  await page.evaluate(() => {
    window.__ENGINE.get('hud').setPaused(false);
    window.__ENGINE.emit('thiefVision', true);
    window.__ENGINE.get('hud').thiefVision(true);
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => { try { window.__ENGINE.renderFrame(1 / 60); } catch {} });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'tov-tell.png') });
  const tell = await page.evaluate(() => {
    const t = document.querySelector('.sly-tov');
    const tag = document.querySelector('.sly-tov-tag');
    const cs = t ? getComputedStyle(t) : null;
    return { onClass: !!t?.classList.contains('on'), opacity: cs ? cs.opacity : null, tagText: tag ? tag.textContent : null };
  });
  console.log(`[celshot] Thief-o-Vision tell -> shots/tov-tell.png`);
  console.log(`          overlay on: ${tell.onClass}  opacity ${tell.opacity}  tag "${tell.tagText}"`);

  if (cel.mentionsR2) { console.log('!! the cel still names an R2 glyph'); process.exitCode = 1; }
  if (!tell.onClass || tell.opacity === '0') { console.log('!! the TOV overlay is not visible'); process.exitCode = 1; }
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 3000);
  release();
}
