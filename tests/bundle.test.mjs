import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Everything in `public/assets/` ships. This pins which of it is never fetched.
 *
 * `npm run build` produces **104 MB**, and **54 MB of it — 52% — no code path requests** (§265).
 * The cause is that `public/` means two different things to two audiences. To this project it is a
 * **staging area**: an import lands there with its `PROVENANCE.md` while somebody decides whether to
 * use it. To Vite it is the **verbatim-copy directory** — everything in it is shipped, referenced or
 * not. So every careful decision to stage an asset *without* wiring it silently added megabytes to
 * the download.
 *
 * The sharpest case is `sly-godot-anims.glb`: its own provenance records that it was split out of
 * the mesh **specifically to keep 2,620 animation channels off the boot path**, and it ships at
 * 932 KB loaded by nothing.
 *
 * ── Why the reference check is not a grep ───────────────────────────────────────────────────────
 * Three ways a naive scan gets this wrong, all of which bit the manual audit first:
 *
 *   1. **Comments.** `sly-anims.glb` and `carmelita-anims.glb` are *compiler inputs* — the
 *      retargeting tools read them offline and emit `MixamoClips.js` / `GuardClips.js`, which is
 *      what the runtime loads. Both appear in `src/` **only inside comments**, which is what
 *      demoted them from "referenced once" to "documented once". Comments are stripped below.
 *   2. **Prefix construction.** Paths are built as `` `assets/audio/${STEM_FILES[name]}` ``, so the
 *      directory and the filename never appear adjacent. Searching for the **basename** handles it:
 *      `bc-explore.mp3` is a literal inside `STEM_FILES` and is found;
 *      `museum-of-natural-history.mp3` appears nowhere and is not.
 *   3. **`src/assets/` is a different mechanism** — resolved by `import.meta.glob` and
 *      `new URL(…, import.meta.url)`, bundled and hashed by Vite. Only `public/` is copied
 *      verbatim, so only `public/` is scanned here.
 *   4. **The extension is often appended in code.** `KayKit.js` builds `` `${BASE}${file}.gltf` ``
 *      from a table of bare names, so `barrel_large.gltf` never appears as a literal anywhere —
 *      only `barrel_large` does. Matching the basename *without* its extension is required, and a
 *      first draft that did not flagged the entire KayKit pack as dead.
 *   5. **glTF sidecars are named by the glTF, not by source.** `barrel_large.gltf` declares
 *      `buffers[0].uri = "barrel_large.bin"` and `images[0].uri = "dungeon_texture.png"`. Those
 *      files are fetched by the loader and are correctly invisible to any scan of `src/`. Every
 *      referenced `.gltf` is parsed below and its `uri`s counted as referenced.
 *   6. **Data files carry paths too.** `Textures.js` imports `baked.json`, which contains
 *      `"assets/tex/textures.bin"` — the 24 MB the runtime actually fetches. JSON under `src/` is
 *      part of the corpus.
 *
 * §254 is the reason for the care: earlier the same day, two capture runs were called duplicates
 * from `ps` output that had been truncated by the person reading it, and the flag distinguishing
 * them sat past the cut. **"I grepped and found nothing" is a statement about the grep.**
 *
 * ── The list is a register, not a permission ────────────────────────────────────────────────────
 * Pinned exactly and failing in BOTH directions, as `tests/api.test.mjs` does. A newly staged asset
 * turns this red — which is the point, since staging one is exactly when somebody should be told it
 * will ship. Wiring or moving one also turns it red, prompting deletion of the line rather than a
 * stale exception left behind.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const PUBLIC = join(ROOT, 'public/assets');
const SRC = join(ROOT, 'src');

/** Strip `/* … *\/` and `// …` so a documented filename is not mistaken for a loaded one. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const haveAssets = existsSync(PUBLIC);
const srcCode = haveAssets
  ? walk(SRC)
    .filter((f) => f.endsWith('.js') || f.endsWith('.json'))
    .map((f) => (f.endsWith('.json') ? readFileSync(f, 'utf8') : stripComments(readFileSync(f, 'utf8'))))
    .join('\n')
  : '';

/**
 * Does `src/` name this file — by full basename, or by the stem an extension is appended to?
 *
 * The stem match is **quoted**, not a bare substring, and that distinction is load-bearing in both
 * directions. `KayKit.js` builds `` `${BASE}${file}.gltf` `` from a table of quoted bare names, so
 * `'barrel_large'` must count. But a bare substring search also matched `footstep.mp3` against the
 * *word* "footstep" in ordinary prose and in identifiers like `guardEarshot`, marking a 12 KB file
 * nothing loads as live. A quoted stem is a name; an unquoted one is usually a sentence.
 */
const namedInSrc = (base) => {
  if (srcCode.includes(base)) return true;
  /* Stem matching applies ONLY to `.gltf`, because `KayKit.js`'s `` `${BASE}${file}.gltf` `` is the
     one place in this codebase that appends an extension in code. Allowing it for every extension
     produced a false NEGATIVE that took two attempts to see: `'footstep'` is quoted all over
     `Audio.js`, `Particles.js` and `Clips.js` — as an ANIMATION EVENT NAME — so `footstep.mp3`
     looked live while nothing loads it. A stem is only a filename where the code makes it one. */
  if (!base.endsWith('.gltf')) return false;
  const stem = base.slice(0, -5);
  return srcCode.includes(`'${stem}'`) || srcCode.includes(`"${stem}"`) || srcCode.includes(`\`${stem}\``);
};

/**
 * Files a referenced glTF pulls in itself. A `.gltf` names its own `.bin` and its images through
 * `uri`, so the loader fetches them and `src/` never mentions them. Missing this made the whole
 * KayKit pack look dead.
 */
function gltfSidecars() {
  const out = new Set();
  if (!haveAssets) return out;
  for (const f of walk(PUBLIC)) {
    const isGltf = f.endsWith('.gltf');
    const isGlb = f.endsWith('.glb');
    if (!isGltf && !isGlb) continue;
    const base = f.slice(f.lastIndexOf('/') + 1);
    if (!namedInSrc(base)) continue;
    const dir = f.slice(PUBLIC.length + 1, f.lastIndexOf('/') + 1);
    let json;
    try {
      if (isGltf) json = JSON.parse(readFileSync(f, 'utf8'));
      else {
        /* A .glb carries the same `uri` references in its JSON chunk. `sly-godot.glb` names its two
           2 MB albedos that way, and parsing only .gltf reported both as dead — three false
           positives in one directory, on files the runtime certainly fetches. */
        const buf = readFileSync(f);
        json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
      }
    } catch { continue; }
    for (const u of [...(json.buffers || []), ...(json.images || [])]) {
      if (u && typeof u.uri === 'string' && !u.uri.startsWith('data:')) out.add(dir + decodeURIComponent(u.uri));
    }
  }
  return out;
}

/** Documentation and licence records are not payload and are not the subject. */
const NOT_PAYLOAD = /\.(md|txt)$/i;

const assets = haveAssets
  ? walk(PUBLIC).filter((f) => !NOT_PAYLOAD.test(f)).map((f) => ({
    rel: f.slice(PUBLIC.length + 1),
    base: f.slice(f.lastIndexOf('/') + 1),
    kb: statSync(f).size / 1024,
  }))
  : [];

const sidecars = gltfSidecars();
const unreferenced = assets.filter((a) => !namedInSrc(a.base) && !sidecars.has(a.rel));

/**
 * The two art packs, listed by rule rather than by name.
 *
 * `tombchaser/` **has left `public/`** — 21.1 MB of CC0 Egyptian art staged in its entirety and
 * wired to nothing, now under `staging/assets/tombchaser/` where git keeps it and Vite does not
 * copy it. `packFiles` returns nothing for it and the register shrank accordingly, which is the
 * behaviour the guard below was written for.
 *
 * `kaykit/` is the opposite and is still here: it is a pack the game DOES use, of which roughly
 * half is dead weight. `KayKit.js` names the props it places; the rest — candles, most stairs, most
 * wall variants, floor tiles — ship because they arrived in the same download. They stay listed
 * rather than moved because they are interleaved file-for-file with the 18 that ARE placed, in one
 * directory, sharing `dungeon_texture.png`; splitting them is a separate operation from moving a
 * directory nothing touches, and doing it blind while `KayKit.js` is live is how a placed prop
 * turns into a 404 at boot. §265.2's point stands: they were never decided about, and the register
 * is what keeps that visible until someone decides.
 */
/**
 * Walk a pack directory, tolerating its absence.
 *
 * **This guard must survive being obeyed.** The first version called `walk()` directly and threw
 * `ENOENT` the moment `tombchaser/` was moved out of the copy path — which is precisely the fix
 * this file exists to recommend. A register that goes red when you act on it teaches people to
 * stop acting on it, and it would have read as "the move broke the tests" rather than "the move
 * worked". Verified by doing it: moved the directory, watched the suite fail 0/1 on ENOENT, moved
 * it back.
 *
 * Absent now means an empty contribution, so the day these packs leave `public/` the register
 * simply shrinks and stays green.
 */
const packFiles = (name) => (haveAssets && existsSync(join(PUBLIC, name))
  ? walk(join(PUBLIC, name)).filter((f) => !NOT_PAYLOAD.test(f)).map((f) => f.slice(PUBLIC.length + 1))
  : []);

const TOMBCHASER_ALL = packFiles('tombchaser');
const KAYKIT_UNUSED = packFiles('kaykit')
  .filter((rel) => !namedInSrc(rel.slice(rel.lastIndexOf('/') + 1)) && !sidecars.has(rel));

/**
 * Shipped, never fetched. Each entry is megabytes of download bought for nothing.
 *
 * **Ten of the twelve entries this list used to carry are gone, because the files moved rather
 * than because the scan stopped seeing them.** `MOVED_OUT_OF_PUBLIC` below pins where each one
 * went and is asserted separately, so "shrank because it was fixed" cannot be confused with
 * "shrank because it went blind" — which is the only way a register like this dies quietly.
 *
 * What is left, and why each one is still here:
 *
 *   sly-anims.glb            BUILD-TIME input to `mixamo2clips`; the runtime loads MixamoClips.js.
 *   carmelita-anims.glb      BUILD-TIME input to `carmelita2clips` AND `carmelita2guard`, and
 *                            `tests/carmguard.test.mjs:278` asserts it exists at this exact path
 *                            so the tool can be re-run. Moving it is a four-file change across two
 *                            other agents' live work; it is a decision with an owner, not a sweep.
 *   sly-godot-anims.glb      split out to keep 2,620 channels OFF the boot path, then shipped.
 *                            `tools/godot2rig.mjs` writes it to this path.
 *   kaykit/*                 40 models nobody chose to include (§265.2) — see `packFiles` above.
 *   museum-…mp3              6.94 MB, the largest single unreferenced file left, and it stays on
 *                            purpose. The **owner instructed that it be used** as the game's
 *                            background music and nothing has wired it yet. Moving it out of the
 *                            copy path would not honour that instruction — it would put another
 *                            step between the file and somebody honouring it, and an agent wiring
 *                            the music would find it missing from the directory its own provenance
 *                            names. The outstanding work is to wire it, not to hide it.
 *
 * The rule the move followed: an asset may leave `public/` when **no code path and no tool names
 * it**, so that no boot and no build can notice. That is a strictly stronger condition than the
 * one this register measures, which is why the three build-time inputs above did not qualify. The
 * music is the one entry held back on a judgement rather than on that rule, and it is written down
 * here so it reads as a decision instead of an oversight.
 */
const KNOWN_UNSHIPPED_PAYLOAD = [
  'audio/museum-of-natural-history.mp3',
  'sly-anim/carmelita-anims.glb',
  'sly-anim/sly-anims.glb',
  'sly-godot/sly-godot-anims.glb',
  ...KAYKIT_UNUSED,
  ...TOMBCHASER_ALL,
];

/**
 * Where each moved asset went. **Kept in git, out of Vite's copy path** — the whole point is that
 * nothing was deleted.
 *
 * Asserted in both directions below: still present at the new path, and absent from the old one.
 * Without the first half, deleting an asset outright would look identical to moving it and the
 * register would applaud. Without the second, moving it back would go unnoticed.
 */
const MOVED_OUT_OF_PUBLIC = [
  ['audio/footstep.mp3', 'staging/assets/audio/footstep.mp3'],
  ['sly-anim/carmelita-body.png', 'staging/assets/sly-anim/carmelita-body.png'],
  ['sly-anim/carmelita-head.png', 'staging/assets/sly-anim/carmelita-head.png'],
  ['sly-anim/sly-body.png', 'staging/assets/sly-anim/sly-body.png'],
  ['sly-anim/sly-cane.glb', 'staging/assets/sly-anim/sly-cane.glb'],
  ['sly-anim/sly-head.png', 'staging/assets/sly-anim/sly-head.png'],
  ['sly-anim/sly-rig.glb', 'staging/assets/sly-anim/sly-rig.glb'],
  ['sly-cane/sly-cane.glb', 'staging/assets/sly-cane/sly-cane.glb'],
  ['tombchaser/PalmTree_Art.glb', 'staging/assets/tombchaser/PalmTree_Art.glb'],
];

test('bundle: the scan sees a real asset tree and real source', () => {
  /* §211.1 — the assertions below are set comparisons. A scan that found nothing would pass them
     all while inspecting nothing, so prove the subject exists and that the scan can see BOTH
     states before trusting either. */
  assert.ok(haveAssets, 'public/assets is missing');
  assert.ok(assets.length > 20, `only ${assets.length} shipped assets found`);
  /* The register is allowed to shrink to nothing — that is the goal — but it must never be
     silently empty because the scan stopped finding anything. */
  assert.ok(KNOWN_UNSHIPPED_PAYLOAD.length === 0 || unreferenced.length > 0,
    'the register lists entries but the scan found none — it has gone blind rather than clean');
  assert.ok(srcCode.length > 200000, `only ${srcCode.length} chars of source scanned`);
  assert.ok(assets.some((a) => namedInSrc(a.base)), 'no asset resolves as referenced — the scan is blind');
  assert.ok(sidecars.size > 10, `only ${sidecars.size} glTF sidecars resolved — .bin/.png siblings will look dead`);
  assert.ok(unreferenced.length > 0, 'no asset resolves as unreferenced — the comment stripper is over-eager');
  /* The prefix-construction case must still resolve, or every audio file looks dead. */
  assert.ok(srcCode.includes('bc-explore.mp3'),
    'STEM_FILES no longer names its stems literally — the basename strategy needs revisiting');
});

test('bundle: no NEWLY staged asset silently joins the download', () => {
  const found = unreferenced.map((a) => a.rel).sort();
  assert.deepEqual(found, [...KNOWN_UNSHIPPED_PAYLOAD].sort(),
    'assets in public/ that no src/ code path names:\n'
    + unreferenced.map((a) => `  ${a.rel}  (${a.kb.toFixed(0)} KB)`).join('\n')
    + '\n\nEverything in public/ is copied into dist/ verbatim, referenced or not (§265).\n'
    + 'If you STAGED one deliberately, add it here and accept that it ships until moved.\n'
    + 'If you WIRED or MOVED one, delete its line — a stale exception is worse than none.');
});

test('bundle: what left public/ is still in the repo, and still out of the copy path', () => {
  /* Moving beats deleting and looks nothing like it from inside a test that only counts what is
     in `public/`. Both halves are asserted so the two cannot be confused: gone from the old path,
     present at the new one. 43.3 MB — 89 MB of `public/` down to 46 MB. */
  assert.ok(MOVED_OUT_OF_PUBLIC.length > 0, 'the moved-asset ledger has been emptied');
  for (const [was, now] of MOVED_OUT_OF_PUBLIC) {
    assert.ok(!existsSync(join(PUBLIC, was)),
      `${was} is back in public/assets — it ships again. If that was deliberate, move its line into `
      + 'KNOWN_UNSHIPPED_PAYLOAD; if it was a stray copy, delete it.');
    const abs = join(ROOT, now);
    assert.ok(existsSync(abs),
      `${was} left public/ and is not at ${now} either — it was DELETED, not moved. These are `
      + 'staged imports and build inputs; they are meant to stay in git.');
    assert.ok(statSync(abs).size > 1024, `${now} is ${statSync(abs).size} bytes — a stub, not the asset`);
  }
  /* And the tree as a whole, derived rather than quoted, because the ledger above names one
     representative of `tombchaser/` rather than all 59 of its files. An emptied `staging/` scores
     zero here even while every ledger line still passes. */
  const staged = walk(join(ROOT, 'staging')).reduce((a, f) => a + statSync(f).size, 0);
  assert.ok(staged > 30 * 1024 * 1024,
    `staging/ holds only ${(staged / 1048576).toFixed(1)} MB — the bulk of what left public/ is gone`);

  /* And the destination must genuinely be outside what Vite copies. `publicDir` defaults to
     `public/`; an override pointing anywhere near `staging/` would silently undo all of this. */
  const vite = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
  assert.ok(!/publicDir/.test(vite),
    'vite.config.js now sets publicDir — check it does not point at staging/, which would ship it all again');
});

test('bundle: the provenance record follows the asset', () => {
  /* An imported asset's licence status is only useful if you can find it from the file. Three of
     the moved directories carry their PROVENANCE.md with them; `sly-anim/` and `audio/` were split
     — some files moved, some stayed — so their records have to name the new location or the trail
     ends at a path that no longer exists. `sly-cane/`'s licence is recorded UNKNOWN, which is
     exactly the case where a broken trail costs the most. */
  const provFor = (rel) => {
    const dir = join(ROOT, rel.slice(0, rel.lastIndexOf('/')));
    for (let d = dir; d.startsWith(join(ROOT, 'staging')) || d.startsWith(join(ROOT, 'public')); d = d.slice(0, d.lastIndexOf('/'))) {
      const p = join(d, 'PROVENANCE.md');
      if (existsSync(p)) return { path: p, text: readFileSync(p, 'utf8') };
    }
    return null;
  };
  let checked = 0;
  for (const [was, now] of MOVED_OUT_OF_PUBLIC) {
    const base = now.slice(now.lastIndexOf('/') + 1);
    const rec = provFor(now);
    const pack = now.split('/')[2];          // the directory under staging/assets/
    assert.ok(rec, `${now} has no PROVENANCE.md anywhere above it — its licence status is now unfindable`);
    /* Named individually, or as the pack it belongs to — enumerating 59 tombchaser filenames in a
       licence record would be noise, but a record that identifies neither the file nor its pack is
       not a record of anything. */
    assert.ok(rec.text.includes(base) || rec.text.includes(pack),
      `${rec.path} names neither ${base} nor ${pack}; the record and the file have parted company`);
    checked++;
    /* The record left behind in public/ must say where the file went, not silently describe a
       path that is empty. Only for the split directories — a whole directory that moved took its
       record with it and has nothing left behind to be stale. */
    const oldDir = join(PUBLIC, was.slice(0, was.lastIndexOf('/')));
    if (!existsSync(join(oldDir, 'PROVENANCE.md'))) continue;
    const old = readFileSync(join(oldDir, 'PROVENANCE.md'), 'utf8');
    assert.ok(!old.includes(base) || /staging\/assets/.test(old),
      `${oldDir}/PROVENANCE.md still describes ${base} as if it were there, and never mentions `
      + 'staging/ — the next person to look for it follows the record to an empty path');
  }
  assert.equal(checked, MOVED_OUT_OF_PUBLIC.length);
});

test('bundle: comment-only mentions do not count as references', () => {
  /* The specific discrimination this file turns on, asserted directly rather than trusted. Both
     files are named in `src/` prose and loaded by nothing; if the stripper regresses, they would
     silently drop off the register and the 4.9 MB they cost would stop being visible. */
  const raw = walk(SRC).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const base of ['sly-anims.glb', 'carmelita-anims.glb']) {
    assert.ok(raw.includes(base), `${base} is no longer mentioned in src/ at all — has it been removed?`);
    assert.ok(!namedInSrc(base),
      `${base} now appears in CODE, not just a comment. Either something started loading it — in `
      + 'which case delete it from KNOWN_UNSHIPPED_PAYLOAD — or the comment stripper has regressed.');
  }
});

test('bundle: the assets the runtime really does fetch are still present', () => {
  /* The mirror of the register. These are named in code, so they must exist on disk — a moved or
     renamed payload would otherwise 404 at boot with nothing failing beforehand. */
  for (const rel of ['tex/textures.bin', 'audio/bc-explore.mp3', 'audio/bc-sneak.mp3',
    'audio/bc-chase.mp3', 'sly-anim/carmelita-guard.glb', 'sly-godot/sly-godot.glb']) {
    assert.ok(existsSync(join(PUBLIC, rel)), `${rel} is referenced by src/ but missing from public/assets`);
    assert.ok(namedInSrc(rel.slice(rel.lastIndexOf('/') + 1)) || sidecars.has(rel),
      `${rel} is no longer referenced — has it become staged?`);
  }
});

test('bundle: every stem Audio.js fetches resolves under public/assets/audio (§292)', () => {
  /* §292's fear, made standing. `Audio.js` builds `` `assets/audio/${STEM_FILES[name]}` `` at
     runtime (its line ~394), so a stem missing from `public/` is a 404 at unlock time with
     nothing failing beforehand. The pinned list in the test above quotes today's three names;
     this one DERIVES the set from the export itself, so a fourth stem added without its file —
     or a rename that misses `public/` — goes red here instead of in a capture manifest.

     For the record (§295 / RESULT-audio404.md): when §292 was finally run down, all three stems
     resolved and always had — `footstep.mp3`'s move in §265 was never a break because nothing
     fetches it (it is an animation EVENT name in src/, not a filename; see correction 4 at the
     top of this file). The boot 404 was the favicon request, suppressed in index.html and pinned
     by the next test. */
  const audio = stripComments(readFileSync(join(SRC, 'audio/Audio.js'), 'utf8'));
  const block = audio.match(/STEM_FILES\s*=\s*\{([^}]*)\}/);
  assert.ok(block, 'STEM_FILES is no longer in src/audio/Audio.js — the fetch table moved; update this test');
  const stems = [...block[1].matchAll(/['"`]([^'"`]+\.(?:mp3|ogg|wav|m4a|opus))['"`]/g)].map((m) => m[1]);
  assert.ok(stems.length >= 3, `only ${stems.length} stem file(s) parsed out of STEM_FILES — the parse has gone blind`);
  for (const f of stems) {
    assert.ok(existsSync(join(PUBLIC, 'audio', f)),
      `Audio.js fetches assets/audio/${f} at runtime and it is not in public/assets/audio — that is a 404 at boot (§292)`);
  }
});

test('bundle: index.html answers the favicon request inline, so no boot fetch leaves the page (§295)', () => {
  /* The one URL a boot requests that NO code in this repo names: Chromium's full build fetches
     /favicon.ico on every navigation — headless included; only the separate headless *shell*
     skips it, and `tools/harness.mjs` launches the full build (`/opt/pw-browsers/chromium`).
     `public/` has never carried a favicon, so every capture manifest since the first critic run
     (2026-07-31, a week before any audio fetch existed) logged exactly one
     "Failed to load resource … 404". §292 routed that error to the audio path; the enumeration
     in RESULT-audio404.md exonerated it. A `data:` icon is answered from the page itself —
     no request leaves, nothing unwired ships, and the copy-path rule ("nothing fetched at
     runtime that isn't in the build") holds for the one fetch the app does not author. */
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(/<link\s+rel=["']icon["']\s+href=["']data:/.test(html),
    'index.html no longer declares its inline <link rel="icon" href="data:…"> — the browser will '
    + 'request /favicon.ico, nothing in public/ answers it, and the §292 boot 404 is back');
});
