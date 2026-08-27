#!/usr/bin/env node
/**
 * magtoken.mjs — §720's `?mag=wide` exercised through the URL, in the browser.
 *
 *   node tools/magtoken.mjs
 *
 * §719.12's standard, applied to this section's second token. An offline guard can drive
 * `globalThis.__MAG_AB`, and `tests/magvolume.test.mjs` does; the half it cannot reach is
 * `location.search`, and this project has shipped a token that never fired (§718.14 records the
 * reference project's own dead camera tag). `EgyptLevel.js` reads its token at module load, and
 * the module is loaded by ARCHITECTURE during boot — so the only way to know the query string
 * reaches it is to boot the page with it and read the LIVE registry back.
 *
 * What is read is deliberately the registry and not the constant: `MAG.volumeSwing` stays 1.65
 * under the token by design (only `swingVolume()` moves), so a probe that printed the constant
 * would report the halved value in both arms and look like a token that does nothing.
 */
import { chromium } from 'playwright';
import { acquire } from './lock.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

async function freePort(start = 6500) {
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function startServer(port) {
  const proc = spawn(`${ROOT}/node_modules/.bin/vite`,
    ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', SANDS_NO_HMR: '1' } });
  for (let i = 0; i < 240; i++) {
    const up = await new Promise((res) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { res(true); s.destroy(); });
      s.once('error', () => res(false));
      s.setTimeout(2000, () => { res(false); s.destroy(); });
    });
    if (up) return proc;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite never listened');
}

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const release = await acquire('magtoken');
console.log(`[magtoken] lock · sha ${sha}`);
const port = await freePort();
const server = await startServer(port);
const CHROME = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
});
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
const page = await ctx.newPage();

try {
  const read = async (query) => {
    await page.goto(`http://127.0.0.1:${port}/?shot=1&q=low${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null, { timeout: 600000, polling: 500 });
    return page.evaluate(async () => {
      const L = await import('/src/world/EgyptLevel.js');
      const t = window.__ENGINE.get('movement').targets.list;
      const of = (id) => t.find((x) => x.id === id)?.volume ?? null;
      return {
        search: location.search,
        liveMain: of('hook-main-3'), liveLow: of('hook-low-0'),
        liveSpire: t.find((x) => x.userData?.kind === 'spire')?.volume ?? null,
        accessor: [L.swingVolume(false), L.swingVolume(true)],
        constants: [L.MAG.volumeSwing, L.MAG.volumeLow, L.MAG.volume, L.MAG.catchSwing],
        rings: t.filter((x) => x.userData?.kind === 'hook').length,
      };
    });
  };

  const def = await read('');
  const wide = await read('&mag=wide');
  const show = (tag, r) => console.log(`  ${tag.padEnd(14)} search "${r.search}"  rings ${r.rings}  `
    + `live main ${r.liveMain} / low ${r.liveLow} / spire ${r.liveSpire}  `
    + `swingVolume() ${r.accessor.join(' , ')}  MAG [${r.constants.join(', ')}]`);
  show('DEFAULT', def);
  show('?mag=wide', wide);

  const fail = [];
  if (def.liveMain !== 1.65 || def.liveLow !== 1.535) fail.push('the default page did not build the halved rings');
  if (wide.liveMain !== 3.30 || wide.liveLow !== 3.07) fail.push('?mag=wide did not reach EgyptLevel through the URL');
  if (def.liveSpire !== 3.30 || wide.liveSpire !== 3.30) fail.push('a spire tip moved under the ring token');
  if (wide.constants[0] !== 1.65) fail.push('MAG.volumeSwing changed under the token — only swingVolume() should');
  if (def.rings < 11 || wide.rings !== def.rings) fail.push('the ring count differs between arms');
  if (fail.length) throw new Error(`magtoken:\n  - ${fail.join('\n  - ')}`);
  console.log('[magtoken] PASS — the token reaches the level through the URL, and only the rings move');
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  release();
}
