#!/usr/bin/env node
/**
 * Progress page generator. Captures the canonical shots, folds in the agent roster, the
 * critic's verdicts and the commit log, and writes a self-contained HTML page.
 *
 * Self-contained matters: the page is published as an Artifact under a CSP that blocks every
 * external host, so screenshots are embedded as JPEG data URIs rather than linked.
 *
 *   node tools/progress.mjs                 capture + regenerate
 *   node tools/progress.mjs --no-shoot      regenerate from the last capture (fast)
 *   node tools/progress.mjs --w 1120        capture width
 */
import { withGame, grab, ROOT } from './harness.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i === -1) return false; argv.splice(i, 1); return true; };

const WIDTH = parseInt(opt('w', '1120'), 10);
const HEIGHT = Math.round((WIDTH * 9) / 16);
const QUALITY = opt('q', 'high');
const NO_SHOOT = flag('no-shoot');
const OUT = path.join(ROOT, 'progress');
const CACHE = path.join(OUT, 'capture.json');
const STATE = path.join(OUT, 'state.json');

/* ----------------------------- pipeline order ----------------------------- */
// Mirrors the MANIFEST in src/main.js — this row is the real module update order, not decoration.
const PIPELINE = [
  ['textures', 'Textures'], ['shading', 'Shading'], ['sky', 'Sky'], ['lighting', 'Lighting'],
  ['terrain', 'Terrain'], ['architecture', 'Architecture'], ['props', 'Props'],
  ['collision', 'Collision'], ['character', 'Character'], ['animation', 'Animation'],
  ['movement', 'Movement'], ['camera', 'Camera'], ['guards', 'Guards'], ['fx', 'FX'],
  ['audio', 'Audio'], ['hud', 'HUD'], ['postfx', 'Post FX'],
];

const SHOT_BLURB = {
  hero: 'The money shot — Sly on the courtyard architrave, golden hour raking across the complex.',
  temple: 'Hypostyle hall: column forest, clerestory shafts, carved walls.',
  'sly-closeup': 'Character sheet — cel bands, ink lines, fur, cloth, cane.',
  courtyard: 'Composition and props: obelisk, colossi, braziers, palms.',
  dunes: 'Terrain, sky and aerial perspective from the approach ridge.',
  interior: 'Tomb lighting: torch warm against cold fill, heavy volumetrics.',
  night: 'Palette flip — moonlit stealth, rim light, blue sparkles.',
  traversal: 'Motion tech caught mid-arc: cane hook swing over the courtyard.',
  combat: 'Impact frame — third hit of the cane combo.',
  guard: 'Guard silhouette, uniform, patrol light cone.',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function readJson(p, dflt) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return dflt; }
}

function gitLog(n = 14) {
  try {
    const out = execFileSync('git', ['log', `-${n}`, '--pretty=format:%h%s%ar'], { cwd: ROOT }).toString();
    return out.split('\n').filter(Boolean).map((l) => { const [h, s, when] = l.split(''); return { h, s, when }; });
  } catch { return []; }
}

function fmtElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/* -------------------------------- capture -------------------------------- */
async function capture() {
  process.stdout.write(`· capturing at ${WIDTH}x${HEIGHT} (q=${QUALITY})\n`);
  return withGame({ width: WIDTH, height: HEIGHT, quality: QUALITY }, async ({ page, info }) => {
    const shots = [];
    for (const name of info.shots) {
      try {
        const t0 = Date.now();
        const r = await grab(page, name, { mime: 'image/jpeg', quality: 0.82, maxWidth: 1120 });
        shots.push({ name, ok: true, ms: Date.now() - t0, stats: r.stats, dataUrl: r.dataUrl });
        process.stdout.write(`  ✓ ${name}\n`);
      } catch (err) {
        shots.push({ name, ok: false, error: err.message.split('\n')[0] });
        process.stdout.write(`  ✗ ${name}: ${err.message.split('\n')[0]}\n`);
      }
    }
    return {
      at: new Date().toISOString(), width: WIDTH, height: HEIGHT, quality: QUALITY,
      modules: info.modules, warnings: info.warnings, renderer: info.renderer,
      consoleErrors: info.consoleErrors.slice(0, 20), poses: info.poses, shots,
    };
  });
}

/* ---------------------------------- page --------------------------------- */
function page(cap, state, commits) {
  const started = state.started ? Date.parse(state.started) : Date.now();
  const elapsed = fmtElapsed(Date.now() - started);
  const built = new Date(cap.at);
  const live = PIPELINE.filter(([k]) => cap.modules?.[k]).length;
  const okShots = cap.shots.filter((s) => s.ok);
  const totalTris = okShots.reduce((a, s) => Math.max(a, s.stats?.triangles || 0), 0);
  const maxDraws = okShots.reduce((a, s) => Math.max(a, s.stats?.drawCalls || 0), 0);

  const agents = state.agents || [];
  const critic = state.critic || [];
  const criticByShot = Object.fromEntries(critic.map((c) => [c.shot, c]));

  const STATUS_LABEL = { running: 'In progress', done: 'Delivered', verified: 'Passed critic', blocked: 'Blocked', queued: 'Queued' };

  return `<title>Sands of Ra — build progress</title>
<style>
  /* Palette is lifted from the game's own art bible (AGENTS.md §2.2): tomb-dark violet ink,
     gold leaf, Sly's sparkle blue. Neutrals are biased violet toward the ink, never pure grey. */
  :root {
    --ink:#f4efe4; --ink-2:#e9e1d0; --raise:#fffdf7;
    --text:#241d26; --text-2:#5d5162; --text-3:#8a7d8e;
    --gold:#9a6f10; --gold-bright:#c99a22; --spark:#1f6fb8; --spark-dim:#5a9ed6;
    --good:#2f7a4e; --warn:#9a6a12; --bad:#a83c26;
    --groove-hi:#fffdf7; --groove-lo:#cdc2b0;
    --edge:#d8ccb8;
    --shadow:0 1px 2px rgba(36,29,38,.07), 0 8px 22px -12px rgba(36,29,38,.16);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink:#140f18; --ink-2:#1c1622; --raise:#241d2c;
      --text:#efe6d6; --text-2:#a99bb0; --text-3:#7b6f84;
      --gold:#e8b942; --gold-bright:#ffe9a8; --spark:#8fd8ff; --spark-dim:#2a7fd4;
      --good:#5cc48a; --warn:#e0ad4a; --bad:#e07a62;
      --groove-hi:#3a3046; --groove-lo:#0b0810;
      --edge:#332a3e;
      --shadow:0 1px 0 rgba(255,255,255,.03), 0 14px 34px -18px rgba(0,0,0,.85);
    }
  }
  :root[data-theme="light"] {
    --ink:#f4efe4; --ink-2:#e9e1d0; --raise:#fffdf7;
    --text:#241d26; --text-2:#5d5162; --text-3:#8a7d8e;
    --gold:#9a6f10; --gold-bright:#c99a22; --spark:#1f6fb8; --spark-dim:#5a9ed6;
    --good:#2f7a4e; --warn:#9a6a12; --bad:#a83c26;
    --groove-hi:#fffdf7; --groove-lo:#cdc2b0; --edge:#d8ccb8;
    --shadow:0 1px 2px rgba(36,29,38,.07), 0 8px 22px -12px rgba(36,29,38,.16);
  }
  :root[data-theme="dark"] {
    --ink:#140f18; --ink-2:#1c1622; --raise:#241d2c;
    --text:#efe6d6; --text-2:#a99bb0; --text-3:#7b6f84;
    --gold:#e8b942; --gold-bright:#ffe9a8; --spark:#8fd8ff; --spark-dim:#2a7fd4;
    --good:#5cc48a; --warn:#e0ad4a; --bad:#e07a62;
    --groove-hi:#3a3046; --groove-lo:#0b0810; --edge:#332a3e;
    --shadow:0 1px 0 rgba(255,255,255,.03), 0 14px 34px -18px rgba(0,0,0,.85);
  }

  /* Carved inscription for display; a grotesque for reading; mono for data. No webfont
     fetch — the CSP would silently drop it and fall back anyway. */
  :root { --serif:"Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style","Hoefler Text",Georgia,serif; }

  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--ink); color:var(--text);
    font:400 15px/1.62 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:1180px; margin:0 auto; padding:0 clamp(16px,4vw,40px) 88px; }

  /* An incised groove: highlight above, shadow below — how a chisel cut catches light. */
  .groove { height:0; border-top:1px solid var(--groove-lo); border-bottom:1px solid var(--groove-hi); }

  /* ---- masthead ---- */
  header { padding:clamp(38px,7vw,76px) 0 26px; }
  .eyebrow {
    font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    letter-spacing:.34em; text-transform:uppercase; color:var(--spark);
  }
  h1 {
    font-family:var(--serif); font-weight:600;
    font-size:clamp(30px,6.4vw,62px); line-height:1.02; letter-spacing:.055em;
    text-transform:uppercase; text-wrap:balance; margin:.42em 0 0; color:var(--text);
  }
  h1 span { display:block; font-size:.42em; letter-spacing:.3em; color:var(--gold); margin-top:.6em; }
  .lede { max-width:62ch; margin:22px 0 0; color:var(--text-2); font-size:16.5px; }

  /* ---- stat row ---- */
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(132px,1fr)); gap:1px;
           background:var(--edge); margin:30px 0 0; }
  .stat { background:var(--ink-2); padding:15px 16px 14px; }
  .stat dt { font:600 10.5px/1 ui-monospace,Menlo,monospace; letter-spacing:.2em;
             text-transform:uppercase; color:var(--text-3); margin:0 0 9px; }
  .stat dd { margin:0; font-family:var(--serif); font-size:26px; line-height:1;
             font-variant-numeric:tabular-nums; letter-spacing:.01em; }
  .stat dd small { font-size:12.5px; letter-spacing:.06em; color:var(--text-3); font-family:inherit; }

  /* ---- section heads ---- */
  section { margin-top:64px; }
  h2 {
    font-family:var(--serif); font-weight:600; font-size:19px; letter-spacing:.19em;
    text-transform:uppercase; margin:0 0 4px; color:var(--text);
  }
  .sub { color:var(--text-3); font-size:13.5px; margin:0 0 22px; }
  h2 + .sub { margin-top:6px; }

  /* ---- module register: a row of glyph-cells, in real pipeline order ---- */
  .register { display:grid; grid-template-columns:repeat(auto-fill,minmax(122px,1fr));
              gap:1px; background:var(--edge); }
  .cell { background:var(--ink-2); padding:12px 12px 11px; position:relative; }
  .cell .n { font:600 9.5px/1 ui-monospace,Menlo,monospace; color:var(--text-3);
             font-variant-numeric:tabular-nums; }
  .cell .m { font-family:var(--serif); font-size:14.5px; letter-spacing:.05em; margin-top:7px; }
  .cell .s { font:600 9.5px/1 ui-monospace,Menlo,monospace; letter-spacing:.14em;
             text-transform:uppercase; margin-top:8px; }
  .cell.on { background:var(--raise); }
  .cell.on .m { color:var(--text); }
  .cell.on .s { color:var(--good); }
  .cell.off .m { color:var(--text-3); }
  .cell.off .s { color:var(--text-3); }
  .cell.on::after { content:""; position:absolute; inset:0 0 auto 0; height:2px; background:var(--gold); }

  /* ---- agents ---- */
  .agents { display:grid; gap:1px; background:var(--edge); }
  .agent { background:var(--ink-2); display:grid;
           grid-template-columns:minmax(0,150px) minmax(0,1fr) auto; gap:16px;
           align-items:baseline; padding:13px 16px; }
  .agent .id { font-family:var(--serif); font-size:15px; letter-spacing:.11em; text-transform:uppercase; }
  .agent .note { color:var(--text-2); font-size:13.5px; min-width:0; }
  .agent .files { display:block; color:var(--text-3);
                  font:400 11.5px/1.5 ui-monospace,Menlo,monospace; margin-top:3px; }
  .pill { font:600 9.5px/1 ui-monospace,Menlo,monospace; letter-spacing:.14em;
          text-transform:uppercase; padding:5px 9px; border:1px solid currentColor;
          border-radius:2px; white-space:nowrap; }
  .pill.running { color:var(--spark); }
  .pill.done { color:var(--gold); }
  .pill.verified { color:var(--good); }
  .pill.blocked { color:var(--bad); }
  .pill.queued { color:var(--text-3); }
  @media (max-width:640px) { .agent { grid-template-columns:1fr auto; } .agent .note { grid-column:1/-1; } }

  /* ---- shot gallery ---- */
  .gallery { display:grid; gap:34px; }
  figure { margin:0; background:var(--ink-2); border:1px solid var(--edge); border-radius:2px;
           overflow:hidden; box-shadow:var(--shadow); }
  figure img { display:block; width:100%; height:auto; background:#0a0710; }
  figure .miss { display:grid; place-items:center; aspect-ratio:16/9; color:var(--text-3);
                 font:400 13px/1.6 ui-monospace,Menlo,monospace; text-align:center; padding:20px; }
  figcaption { padding:15px 18px 17px; }
  .capline { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:baseline; }
  .capline .name { font-family:var(--serif); font-size:16.5px; letter-spacing:.13em; text-transform:uppercase; }
  .capline .data { font:400 11.5px/1 ui-monospace,Menlo,monospace; color:var(--text-3);
                   font-variant-numeric:tabular-nums; margin-left:auto; }
  figcaption p { margin:8px 0 0; color:var(--text-2); font-size:13.5px; max-width:70ch; }
  .verdict { margin-top:12px; padding-top:12px; border-top:1px solid var(--edge);
             font-size:13.5px; color:var(--text-2); }
  .verdict b { font:600 10px/1 ui-monospace,Menlo,monospace; letter-spacing:.16em;
               text-transform:uppercase; color:var(--spark); display:block; margin-bottom:6px; }
  @media (min-width:900px) { .gallery { grid-template-columns:1fr 1fr; } .gallery figure.wide { grid-column:1/-1; } }

  /* ---- log ---- */
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  th { text-align:left; font:600 10px/1 ui-monospace,Menlo,monospace; letter-spacing:.16em;
       text-transform:uppercase; color:var(--text-3); padding:0 12px 10px 0; }
  td { padding:9px 12px 9px 0; border-top:1px solid var(--edge); vertical-align:baseline; }
  td.sha { font:400 12px/1 ui-monospace,Menlo,monospace; color:var(--gold); white-space:nowrap; }
  td.when { color:var(--text-3); white-space:nowrap; font-variant-numeric:tabular-nums; }
  .scroll { overflow-x:auto; }

  .notes { list-style:none; padding:0; margin:0; display:grid; gap:9px; }
  .notes li { color:var(--text-2); font:400 12.5px/1.6 ui-monospace,Menlo,monospace;
              padding-left:15px; position:relative; }
  .notes li::before { content:"·"; position:absolute; left:2px; color:var(--warn); }

  footer { margin-top:70px; padding-top:22px; border-top:1px solid var(--edge);
           color:var(--text-3); font-size:12.5px; display:flex; flex-wrap:wrap; gap:8px 22px; }
  footer b { color:var(--text-2); font-weight:600; }
  @media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
</style>

<div class="wrap">
<header>
  <p class="eyebrow">Build log · auto-generated</p>
  <h1>Sands of Ra<span>Sly Cooper · Three.js</span></h1>
  <p class="lede">A stealth-platformer built entirely in code — no downloaded meshes, no downloaded
  textures. Every screenshot below is rendered headless from the live build and judged against
  the art bible before its module is signed off.</p>

  <dl class="stats">
    <div class="stat"><dt>Elapsed</dt><dd>${esc(elapsed)}</dd></div>
    <div class="stat"><dt>Modules live</dt><dd>${live}<small> / ${PIPELINE.length}</small></dd></div>
    <div class="stat"><dt>Shots passing</dt><dd>${okShots.length}<small> / ${cap.shots.length}</small></dd></div>
    <div class="stat"><dt>Peak draws</dt><dd>${maxDraws}<small> / 250</small></dd></div>
    <div class="stat"><dt>Peak tris</dt><dd>${(totalTris / 1000).toFixed(0)}<small>k / 1200k</small></dd></div>
    <div class="stat"><dt>Commits</dt><dd>${commits.length}</dd></div>
  </dl>
</header>

<div class="groove"></div>

<section>
  <h2>Render pipeline</h2>
  <p class="sub">Modules in the order they update each frame — producers before consumers. A gold
  bar marks one that is live in the running build.</p>
  <div class="register">
    ${PIPELINE.map(([k, label], i) => {
      const on = !!cap.modules?.[k];
      return `<div class="cell ${on ? 'on' : 'off'}">
        <div class="n">${String(i + 1).padStart(2, '0')}</div>
        <div class="m">${esc(label)}</div>
        <div class="s">${on ? 'live' : 'pending'}</div>
      </div>`;
    }).join('\n    ')}
  </div>
</section>

${agents.length ? `<section>
  <h2>Agent roster</h2>
  <p class="sub">Each module is owned by one agent working a dedicated slice of the tree, then
  re-reviewed against the art bible's fail-list.</p>
  <div class="agents">
    ${agents.map((a) => `<div class="agent">
      <div><span class="id">${esc(a.id)}</span></div>
      <div class="note">${esc(a.note || '')}<span class="files">${esc(a.files || '')}</span></div>
      <div><span class="pill ${esc(a.status || 'queued')}">${esc(STATUS_LABEL[a.status] || a.status || 'queued')}</span></div>
    </div>`).join('\n    ')}
  </div>
</section>` : ''}

<section>
  <h2>Frames from the live build</h2>
  <p class="sub">Captured headless at ${cap.width}×${cap.height} on a software renderer, quality
  preset <em>${esc(cap.quality)}</em>. These are the fixed shots the visual critic judges.</p>
  <div class="gallery">
    ${cap.shots.map((s, i) => {
      const v = criticByShot[s.name];
      const wide = s.name === 'hero' || i === 0;
      const body = s.ok
        ? `<img src="${s.dataUrl}" alt="${esc(s.name)} shot from the live build" loading="lazy" />`
        : `<div class="miss">not yet renderable<br />${esc(s.error || '')}</div>`;
      const data = s.ok
        ? `${s.stats.drawCalls} draws · ${(s.stats.triangles / 1000).toFixed(0)}k tris`
        : 'failed';
      return `<figure${wide ? ' class="wide"' : ''}>
      ${body}
      <figcaption>
        <div class="capline"><span class="name">${esc(s.name)}</span><span class="data">${esc(data)}</span></div>
        <p>${esc(SHOT_BLURB[s.name] || '')}</p>
        ${v ? `<div class="verdict"><b>Critic${v.score != null ? ` · ${esc(v.score)}/10` : ''}</b>${esc(v.verdict)}</div>` : ''}
      </figcaption>
    </figure>`;
    }).join('\n    ')}
  </div>
</section>

${(cap.warnings?.length || cap.consoleErrors?.length) ? `<section>
  <h2>Open issues</h2>
  <p class="sub">Warnings and console errors surfaced by the last capture.</p>
  <ul class="notes">
    ${[...(cap.warnings || []), ...(cap.consoleErrors || [])].slice(0, 24)
      .map((w) => `<li>${esc(String(w).slice(0, 300))}</li>`).join('\n    ')}
  </ul>
</section>` : ''}

${commits.length ? `<section>
  <h2>Commit log</h2>
  <p class="sub">Most recent first.</p>
  <div class="scroll"><table>
    <thead><tr><th>Rev</th><th>Change</th><th>When</th></tr></thead>
    <tbody>${commits.map((c) => `<tr><td class="sha">${esc(c.h)}</td><td>${esc(c.s)}</td><td class="when">${esc(c.when)}</td></tr>`).join('')}</tbody>
  </table></div>
</section>` : ''}

<footer>
  <span>Generated <b>${esc(built.toISOString().replace('T', ' ').slice(0, 16))}</b> UTC</span>
  <span>Renderer <b>${esc((cap.renderer || 'unknown').replace(/^ANGLE \(|\)$/g, '').slice(0, 64))}</b></span>
  <span>Branch <b>claude/sly-cooper-ancient-egypt-0koo0u</b></span>
</footer>
</div>
`;
}

/* --------------------------------- main ---------------------------------- */
async function main() {
  await mkdir(OUT, { recursive: true });

  let cap;
  if (NO_SHOOT && existsSync(CACHE)) {
    cap = await readJson(CACHE, null);
    process.stdout.write('· reusing cached capture\n');
  }
  if (!cap) {
    cap = await capture();
    await writeFile(CACHE, JSON.stringify(cap));
  }

  const state = await readJson(STATE, { started: new Date().toISOString(), agents: [], critic: [] });
  const html = page(cap, state, gitLog());
  const file = path.join(OUT, 'index.html');
  await writeFile(file, html);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  process.stdout.write(`\n→ progress/index.html  (${kb} KB, ${cap.shots.filter((s) => s.ok).length} shots embedded)\n`);
}

main().catch((e) => { console.error('progress failed:', e.message); process.exit(1); });
