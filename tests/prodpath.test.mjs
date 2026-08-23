import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * prodpath — the two ways an asset URL can be right in dev and wrong in production (§666).
 *
 * ── Why a whole file, for what looks like one missing character ───────────────────────────────
 *
 * The user photographed five 404s on the live demo. They were two bugs, and both were invisible
 * to every check this project has:
 *
 *   1. `src/textures/baked.json` carried `"blob": "/assets/tex/textures.bin"` — a LEADING SLASH,
 *      written by `bakeassets.mjs`'s `PUBLIC_URL`. `Textures.js` resolves it with
 *      `new URL(BAKED.blob, document.baseURI)`, and an absolute path takes only the ORIGIN from
 *      the base. At `/` that is right by accident. The demo is a GitHub **project** page served
 *      from `/Demo/`, where it resolved to the domain root and 404'd, so the 25 MB baked texture
 *      cache never loaded and every texture fell back to the procedural path.
 *      `vite.config.js`'s `base: './'` cannot help: this string is JSON fetched at runtime and
 *      never passes through the bundler.
 *
 *   2. `sly.fbx` names its maps internally (`sly_body.png`, …) and three's FBXLoader resolves
 *      them against the FBX's own emitted path. In dev the PNGs sit beside it in
 *      `src/assets/sly-dl/`; a production build emits both under separate hashes, so the names
 *      resolve to files that were never emitted. Four more 404s, on every load, forever.
 *
 * ── The general finding, which is bigger than either ─────────────────────────────────────────
 *
 * **Every verification this project has ever run loads the vite DEV SERVER at the domain root.**
 * `tools/harness.mjs`, `tools/shot.mjs`, every critic capture, every probe. The thing the user
 * plays is a `vite build` under a subpath. Both faults are invisible in dev *by construction* and
 * unconditional in production, so no amount of the testing that existed could ever have found
 * them — which is why three playtest rounds went by with the user reporting the same things.
 *
 * `tools/prodboot.mjs` is the instrument that closes it properly: it builds `dist/`, serves it
 * behind a `/Demo/`-shaped prefix that 404s everything outside, boots it, and fails on any non-2xx
 * response. It needs Playwright and a build, so it cannot live in this suite. What CAN live here
 * is the class each bug belongs to, and that is what these arms are: cheap, total over the source
 * tree, and red the moment either shape comes back.
 */

/* --------------------------------------------------------------- helpers */

function walk(dir, out = [], skip = /node_modules|\.git|dist|shots|progress|staging|\.tmp-anim/) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (skip.test(p)) continue;
    if (e.isDirectory()) walk(p, out, skip);
    else out.push(p);
  }
  return out;
}

/**
 * The predicate, isolated so both the live scan and its counterexample run the SAME code.
 * Matches a quoted string literal that begins `/assets` or `/public` — i.e. a runtime asset URL
 * anchored at the origin rather than at the document.
 */
const ROOT_ASSET_URL = /(['"`])\/(assets|public)\//g;
function offences(text) {
  const hits = [];
  for (const m of text.matchAll(ROOT_ASSET_URL)) hits.push(m[0]);
  return hits;
}

/* ====================================================================== */
test('prodpath P1: no runtime asset URL is anchored at the origin', () => {
  /* DOMAIN (§418.3)
   * passes on : the source tree as it stands — every asset URL under `src/` is relative
   *             (`assets/audio/…` in Audio.js, `assets/kaykit/` in KayKit.js, and now
   *             `assets/tex/textures.bin`), so all of them resolve against the document and are
   *             correct at `/` and at `/Demo/` alike.
   * fails on  : the pre-fix text of `src/textures/baked.json`, reconstructed and run through the
   *             SAME predicate in-arm below. It must be flagged. Without that, a predicate that
   *             matched nothing at all would pass this arm and read as a clean tree.
   * does not discriminate: whether the file the URL points at EXISTS (P2 and prodboot), whether
   *             the bundler rewrites it (it does not — that is the whole bug), and anything
   *             about the dev server, which is right either way and is why this went unseen. */
  const files = walk(path.join(ROOT, 'src'))
    .filter((f) => /\.(js|mjs|json|html|css)$/.test(f));
  files.push(path.join(ROOT, 'index.html'));

  const bad = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    /* `index.html`'s `src="/src/main.js"` is the vite ENTRY, not an asset: the bundler rewrites
       it to the hashed bundle under `base`. It is not matched by the predicate (`/src/`, not
       `/assets/`) and is called out here so the next reader does not "fix" it. */
    for (const hit of offences(text)) bad.push(`${path.relative(ROOT, f)}: ${hit}`);
  }
  assert.deepEqual(bad, [],
    'these asset URLs are anchored at the origin and will 404 on any project page:\n  ' + bad.join('\n  '));

  /* The failing input, run in-arm: exactly what `baked.json` line 6 said before §666. */
  const preFix = '  "blob": "/assets/tex/textures.bin",';
  assert.equal(offences(preFix).length, 1,
    'the predicate did not flag the string that actually shipped — it cannot catch a recurrence');

  console.log(`[prodpath P1] ${files.length} source files scanned, 0 origin-anchored asset URLs; `
    + 'the pre-fix baked.json string is still caught by the same predicate');
});

/* ====================================================================== */
test('prodpath P2: every texture name inside sly.fbx is a file we actually ship', () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped `src/assets/sly-dl/sly.fbx` — every `*.png` name embedded in it has
   *             a matching file in the same directory, which is what `SlyModelDLRig`'s
   *             `LoadingManager` URL modifier maps by (basename -> the URL vite emitted).
   * fails on  : a name that is not there, run in-arm — `sly_nonexistent.png` must be reported
   *             missing by the same lookup. Without it an FBX that embedded no names at all
   *             would pass, and "zero names, zero missing" is exactly the vacuous shape this
   *             project keeps producing, so the count is asserted too.
   * does not discriminate: whether the loader is WIRED to that mapping (a source read cannot say
   *             so — `tools/prodboot.mjs` observes the requests), and the hashed names vite
   *             emits, which only exist after a build. */
  const dir = path.join(ROOT, 'src/assets/sly-dl');
  const fbx = path.join(dir, 'sly.fbx');
  assert.ok(fs.existsSync(fbx), 'src/assets/sly-dl/sly.fbx is missing');

  /* FBX stores texture filenames as plain strings, in binary and ASCII variants alike. */
  const buf = fs.readFileSync(fbx);
  const names = new Set(
    (buf.toString('latin1').match(/[A-Za-z0-9_\-.]+\.png/g) || [])
      .map((n) => n.split(/[\\/]/).pop())
  );
  assert.ok(names.size >= 3,
    `only ${names.size} texture name(s) found inside the FBX — a scan that finds nothing cannot `
    + 'tell a complete asset set from an empty one');

  const onDisk = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.png')));
  const missing = [...names].filter((n) => !onDisk.has(n));
  assert.deepEqual(missing, [],
    `the FBX names textures this repo does not ship: ${missing.join(', ')}`);

  /* The failing input, run in-arm. */
  assert.equal(onDisk.has('sly_nonexistent.png'), false,
    'the on-disk lookup answers true for a file that does not exist — it cannot detect a gap');

  console.log(`[prodpath P2] sly.fbx names ${names.size} texture(s): ${[...names].sort().join(', ')} — all present in src/assets/sly-dl/`);
});

/* ====================================================================== */
test('prodpath P3: the baked manifest resolves under a project-page base', () => {
  /* DOMAIN (§418.3)
   * passes on : `baked.json`'s `blob`, resolved with the SAME expression `Textures.js` uses,
   *             against BOTH document bases — the dev root and a project page — landing under
   *             each one. This is the arm that would have gone red on the shipped string.
   * fails on  : the pre-fix value `/assets/tex/textures.bin`, run through the identical
   *             resolution in-arm, which must land at the origin under the project base and
   *             therefore outside the site.
   * does not discriminate: whether the file is SERVED (prodboot), and the origin itself — both
   *             bases below share a host on purpose, so the difference measured is the path. */
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/textures/baked.json'), 'utf8'));
  const DEV = 'http://127.0.0.1:5173/';
  const PAGES = 'https://example.github.io/Demo/';

  const resolved = (blob, base) => new URL(blob, base).href;

  assert.equal(resolved(manifest.blob, DEV), 'http://127.0.0.1:5173/assets/tex/textures.bin');
  assert.equal(resolved(manifest.blob, PAGES), 'https://example.github.io/Demo/assets/tex/textures.bin',
    'the baked blob does not resolve inside a project page — this is §666 all over again');

  /* The failing input, run in-arm: the string that actually shipped. */
  assert.equal(resolved('/assets/tex/textures.bin', PAGES), 'https://example.github.io/assets/tex/textures.bin',
    'the pre-fix string no longer escapes the site prefix, so this arm can no longer tell the '
    + 'two apart and is not measuring anything');

  console.log(`[prodpath P3] blob "${manifest.blob}" resolves to `
    + `${resolved(manifest.blob, PAGES)} under a project page (pre-fix: ${resolved('/assets/tex/textures.bin', PAGES)})`);
});
