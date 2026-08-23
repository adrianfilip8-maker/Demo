#!/usr/bin/env node
/**
 * idlesheetpage.mjs — assemble §479.19's contact sheet into one self-contained page.
 *
 * The deliverable is a picture the user can point at, so this builds a page rather than a
 * report: the yes/no answer first, then the one standing pose the corpus actually contains,
 * then every other static pose it holds, each in BOTH readings (their clip retargeted straight,
 * and the same clip with the rest-abduction delta removed). Toggles flip reading and view
 * across the whole sheet so the two can be compared in place.
 *
 * Frames are cropped to the figure before downscaling — the shipped level fills most of each
 * capture with scenery that costs bytes and distracts from the pose being judged.
 *
 *   node tools/idlesheetpage.mjs <out.html>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { readPNG } from './png.mjs';
import { shrink, encodePNG } from './sheetgrid.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'shots/idle19');
const OUTF = process.argv[2] || path.join(SHOTS, 'contact-sheet.html');

/* the capture is 620x820 with the figure centred; this window holds him head to toe */
const CROP = { x0: 168, x1: 452, y0: 30, y1: 800 };

function tile(file, f) {
  if (!existsSync(file)) return null;
  const img = readPNG(file);
  const w = CROP.x1 - CROP.x0, h = CROP.y1 - CROP.y0, ch = img.ch;
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + CROP.y0) * img.w + (x + CROP.x0)) * ch, o = (y * w + x) * 3;
      out[o] = img.data[i]; out[o + 1] = img.data[i + 1]; out[o + 2] = img.data[i + 2];
    }
  }
  const small = shrink({ w, h, ch: 3, data: out }, f);
  return `data:image/png;base64,${encodePNG(small.w, small.h, small.data).toString('base64')}`;
}

const { sheet, rows } = JSON.parse(readFileSync(path.join(SHOTS, 'candidates.json'), 'utf8'));
const slug = (c) => `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)}`
  + `-${(c.file.match(/Anims(\d+)/) || [, 'x'])[1]}`;

let bytes = 0;
const cards = [];
for (const c of sheet) {
  const s = slug(c);
  const img = {};
  for (const reading of ['raw', 'matched']) {
    img[`${reading}-front`] = tile(path.join(SHOTS, `pose-${s}-${reading}-front34.png`), 2);
    img[`${reading}-profile`] = tile(path.join(SHOTS, `pose-${s}-${reading}-profile.png`), 3);
  }
  const missing = Object.entries(img).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.log(`  !! ${c.name}: missing ${missing.join(', ')}`);
  for (const v of Object.values(img)) bytes += v ? v.length : 0;
  cards.push({ ...c, slug: s, img });
}
console.log(`${cards.length} cards · ${(bytes / 1024 / 1024).toFixed(1)} MB of embedded image`);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* DISPLAY TIERS, decided by the numbers already measured — never by reading the name, which is
   the trap this whole round exists to avoid. The census's `standing` flag admits three things a
   reader would not call a standing idle, and each is separable by a quantity:
     · a zero-length clip is a bind/rest pose, not an idle            (dur === 0)
     · arms raised above shoulder height is a hang, not a stance      (abduction >= 60 either arm)
   What survives both is a resting standing pose. */
const RAISED = 60;
for (const c of cards) {
  const abd = Math.max(Math.abs(c.ref.abdL), Math.abs(c.ref.abdR));
  c.why = c.dur === 0 ? 'zero-length rest/bind pose'
    : abd >= RAISED ? 'arms raised — a hang, not a stance'
      : c.standing ? 'resting stance' : String(c.verdict).replace('static, not standing ', '').replace(/[()]/g, '');
  c.tier = c.standing && c.dur > 0 && abd < RAISED ? 'stand' : c.standing ? 'upright' : 'other';
}
const standing = cards.filter((c) => c.tier === 'stand');
const upright = cards.filter((c) => c.tier === 'upright');
const other = cards.filter((c) => c.tier === 'other');
const hero = cards.find((c) => c.name === 'Standupright');
const probeRow = (n) => rows.find((r) => r.name === n) || {};

const card = (c, featured = false) => `
<figure class="card${featured ? ' card--hero' : ''}" data-pose="${esc(c.slug)}">
  <div class="frames">
    ${['raw', 'matched'].map((r) => ['front', 'profile'].map((v) => c.img[`${r}-${v}`]
    ? `<img class="shot" data-reading="${r}" data-view="${v}" src="${c.img[`${r}-${v}`]}" alt="${esc(c.name)}, ${r} port, ${v} view" loading="lazy">`
    : '').join('')).join('')}
  </div>
  <figcaption>
    <h3>${esc(c.name)}</h3>
    <p class="src">${esc(c.file.replace('SlyCooper_', '').replace('.gltf', ''))} · ${c.dur}s${c.alsoIn && c.alsoIn.length ? ` · also in ${c.alsoIn.length} more file${c.alsoIn.length > 1 ? 's' : ''}` : ''}</p>
    <p class="tier tier--${c.tier === 'stand' ? 'stand' : 'other'}">${esc(c.why)}</p>${c.name === 'Standupright' ? '\n    <p class="tier tier--ruled">shipped &middot; raw</p>' : ''}
    <dl class="nums">
      <div><dt>their rig</dt><dd>${c.ref.sepCm} cm</dd></div>
      <div data-reading="raw"><dt>raw port</dt><dd>${c.raw.sepCm} cm</dd></div>
      <div data-reading="matched"><dt>matched</dt><dd>${c.matched.sepCm} cm</dd></div>
    </dl>
  </figcaption>
</figure>`;

const html = `<title>Which Standing Pose Do You Mean</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{
  --ground:#eef1f6; --surface:#ffffff; --surface-2:#f6f8fc; --line:#d3dae6;
  --ink:#111725; --muted:#5b6883; --accent:#1750c4; --accent-soft:#e3ecfd;
  --stand:#12694a; --stand-soft:#d8f0e5; --other:#8a5a12; --other-soft:#f7ebd6;
  --shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0c1017; --surface:#141a25; --surface-2:#1b2331; --line:#2a3547;
  --ink:#e9edf5; --muted:#94a3bd; --accent:#7aa8ff; --accent-soft:#17233c;
  --stand:#6cd6a8; --stand-soft:#122b22; --other:#e2ab55; --other-soft:#2c2416;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.34);
}}
:root[data-theme="dark"]{
  --ground:#0c1017; --surface:#141a25; --surface-2:#1b2331; --line:#2a3547;
  --ink:#e9edf5; --muted:#94a3bd; --accent:#7aa8ff; --accent-soft:#17233c;
  --stand:#6cd6a8; --stand-soft:#122b22; --other:#e2ab55; --other-soft:#2c2416;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.34);
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.55;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:clamp(24px,5vw,64px) clamp(16px,4vw,40px) 96px}
h1,h2,h3{font-family:"Bricolage Grotesque","IBM Plex Sans",sans-serif;text-wrap:balance;margin:0}
h1{font-size:clamp(30px,4.6vw,50px);font-weight:700;letter-spacing:-.02em;line-height:1.08}
.eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted);margin:0 0 14px}
.verdict{background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:clamp(20px,3.4vw,34px);box-shadow:var(--shadow);margin:0 0 20px}
.verdict .answer{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.yes{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:clamp(34px,5.4vw,58px);
  color:var(--accent);letter-spacing:-.03em;line-height:1}
.verdict p{margin:0 0 12px;max-width:66ch;color:var(--ink)}
.verdict p:last-child{margin-bottom:0}
.verdict strong{font-weight:600}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:18px 0 0}
.fact{background:var(--surface-2);padding:12px 14px}
.fact dt{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.fact dd{margin:4px 0 0;font-size:19px;font-weight:600;font-variant-numeric:tabular-nums}
.controls{position:sticky;top:0;z-index:5;display:flex;gap:10px;flex-wrap:wrap;align-items:center;
  padding:12px 0;background:linear-gradient(var(--ground) 74%,transparent);margin-bottom:6px}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:3px;gap:3px}
.seg button{font:500 13px/1 "IBM Plex Sans",sans-serif;color:var(--muted);background:none;border:0;
  padding:8px 13px;border-radius:6px;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--accent);color:#fff}
.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.seg-label{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted);margin-right:2px}
section{margin-top:34px}
section > h2{font-size:clamp(19px,2.3vw,25px);font-weight:600;letter-spacing:-.01em}
section > .lede{color:var(--muted);margin:6px 0 18px;max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:16px}
.card{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;
  overflow:hidden;box-shadow:var(--shadow)}
.card--hero{grid-column:span 2}
.frames{background:var(--surface-2);display:flex;align-items:flex-end;justify-content:center;min-height:120px}
.shot{display:block;width:100%;height:auto;max-width:100%}
.shot[hidden]{display:none}
figcaption{padding:12px 13px 14px;border-top:1px solid var(--line)}
figcaption h3{font-size:15px;font-weight:600;letter-spacing:-.01em}
.src{margin:3px 0 0;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted)}
.tier{display:inline-block;margin:9px 0 0;padding:2px 8px;border-radius:100px;
  font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}
.tier--stand{background:var(--stand-soft);color:var(--stand)}
.tier--other{background:var(--other-soft);color:var(--other)}
.tier--ruled{background:var(--accent);color:#fff;margin-left:6px}
.ruled{border-left:3px solid var(--accent);padding-left:14px;margin:14px 0 0 !important}
.nums{margin:11px 0 0;display:grid;gap:3px}
.nums > div{display:flex;justify-content:space-between;gap:8px;font-size:12.5px}
.nums > div[hidden]{display:none}
.nums dt{color:var(--muted);font-family:"IBM Plex Mono",monospace;font-size:11px;margin:0}
.nums dd{margin:0;font-variant-numeric:tabular-nums;font-weight:500}
.note{background:var(--accent-soft);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:10px;padding:16px 18px;margin-top:18px}
.note h3{font-size:15px;font-weight:600;margin-bottom:6px}
.note p{margin:0;color:var(--ink);max-width:70ch;font-size:14.5px}
footer{margin-top:52px;padding-top:18px;border-top:1px solid var(--line);
  font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){.shot{transition:opacity .12s ease}}
</style>
<div class="wrap">
<p class="eyebrow">Reference audit · Sly Cooper — A Thief in Godot</p>
<h1>Which standing pose do you mean?</h1>

<div class="verdict">
  <div class="answer"><span class="yes">Yes</span>
    <span>— a real static standing pose exists in the repo. There is exactly one.</span></div>
  <p class="ruled"><strong>Ruled, and shipped:</strong> &ldquo;I like the raw standupright more.&rdquo;
  The standing idle now plays <strong>Standupright</strong> as a raw retarget, in both slots a standing
  player reaches. The <em>matched</em> reading below is kept only as the comparison that produced the
  decision &mdash; it is no longer what the game shows.</p>
  <p>It is <strong>Standupright</strong> (the same pose is called <strong>UprightStand</strong> in two of the
  four files). Their animation graph routes it as the default standing idle, and — checked this time
  rather than assumed — it really is a held resting pose: four seconds, 241 keyframes, and across the
  whole clip the left hand moves <strong>5.5&nbsp;mm</strong> and the hips <strong>4.9&nbsp;mm</strong>.
  Not a transition, not a one-frame stub.</p>
  <p>All 67 clips in all four character files were measured by content, never by name. Seven are
  sustained static poses; only this one is standing. The rest are crouches, hangs and perches.</p>
  <p><strong>The part worth your attention:</strong> this is the pose we already matched — our idle
  currently delivers 47.7&nbsp;cm of hand separation against their 47.6, per arm 10.7/9.0 against
  10.8/9.0 — and you told us it still is not right. So if the look you want is not on this page, it is
  not in this repository, and the target has to come from the real Sly 2 / Sly 3 instead. That is your
  call to make, not ours to guess a fifth time.</p>
  <dl class="facts">
    <div class="fact"><dt>Clips censused</dt><dd>67</dd></div>
    <div class="fact"><dt>Static poses</dt><dd>${cards.length}</dd></div>
    <div class="fact"><dt>Standing</dt><dd>${standing.length}</dd></div>
    <div class="fact"><dt>Hand drift over 4 s</dt><dd>5.5 mm</dd></div>
  </dl>
</div>

<div class="controls">
  <span class="seg-label">Reading</span>
  <div class="seg" role="group" aria-label="Which port to show">
    <button type="button" data-set="reading" data-val="raw" aria-pressed="true">Raw retarget &mdash; shipped</button>
    <button type="button" data-set="reading" data-val="matched" aria-pressed="false">Matched (superseded)</button>
  </div>
  <span class="seg-label">View</span>
  <div class="seg" role="group" aria-label="Camera">
    <button type="button" data-set="view" data-val="front" aria-pressed="true">Front</button>
    <button type="button" data-set="view" data-val="profile" aria-pressed="false">Profile</button>
  </div>
</div>

<div class="note">
  <h3>The two readings are not the same picture</h3>
  <p>Porting their clip does not reproduce their pose. Our rig's arms rest about 14.5° wider, and the
  retarget composes their motion onto our rest — so their 47.6&nbsp;cm pose arrives 70&nbsp;cm wide as a
  faithful port. <em>Matched</em> removes exactly one thing: a per-arm rest-abduction delta, so each hand
  lands where theirs does. Flip the toggle; you may be pointing at a look only one of them produces.</p>
</div>

<section>
  <h2>The one standing pose in the repository</h2>
  <p class="lede">Rendered on the shipped model through the real clip pipeline. Both entries are the
  same authored pose: it was re-exported into all four files, twice under each name.</p>
  <div class="grid">${hero ? card(hero, true) : ''}${standing.filter((c) => c !== hero).map((c) => card(c)).join('')}</div>
</section>

<section>
  <h2>Upright, but not a stance</h2>
  <p class="lede">Still and vertical, so the content classifier admitted them — but one is a ledge hang
  with the arms overhead and the other is the rig's zero-length bind pose left in the export. Here
  because the census does not filter by name, and neither should you have to.</p>
  <div class="grid">${upright.map((c) => card(c)).join('')}</div>
</section>

<section>
  <h2>Every other static pose it holds</h2>
  <p class="lede">Sustained and still, but not standing — crouched idles, a cane hang, pole and rail and
  spire perches, and one unnamed rest pose left in an old export. Shown in case the pose you have in
  mind is one of these.</p>
  <div class="grid">${other.map((c) => card(c)).join('')}</div>
</section>

<footer>
  Poses found by content across SlyCooper_Anims27 / 19 / 14 / 4 · rendered on the shipped rig through
  compile() → animation.play() · front views camera-verified · numbers are hand separation in the
  pose's own shoulder-line frame.
</footer>
</div>
<script>
(function(){
  var state = { reading: 'raw', view: 'front' };
  function apply(){
    document.querySelectorAll('.shot').forEach(function(el){
      el.hidden = !(el.dataset.reading === state.reading && el.dataset.view === state.view);
    });
    document.querySelectorAll('.nums > div[data-reading]').forEach(function(el){
      el.hidden = el.dataset.reading !== state.reading;
    });
    document.querySelectorAll('.seg button').forEach(function(b){
      b.setAttribute('aria-pressed', String(state[b.dataset.set] === b.dataset.val));
    });
  }
  document.querySelectorAll('.seg button').forEach(function(b){
    b.addEventListener('click', function(){ state[b.dataset.set] = b.dataset.val; apply(); });
  });
  apply();
})();
</script>`;

writeFileSync(OUTF, html);
console.log(`wrote ${OUTF}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB`);
