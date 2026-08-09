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
 * `tombchaser/` is staged in its entirety and wired to nothing — 22 MB, deliberately deferred
 * because its normal and metallic maps may fight the cel ramp. Enumerating 59 filenames here would
 * be noise; what matters is that the whole directory ships and none of it is fetched.
 *
 * `kaykit/` is the opposite and more interesting: it is a pack the game DOES use, of which roughly
 * half is dead weight. `KayKit.js` names the props it places; the rest — candles, most stairs, most
 * wall variants, floor tiles — ship because they arrived in the same download.
 */
const TOMBCHASER_ALL = haveAssets
  ? walk(join(PUBLIC, 'tombchaser')).filter((f) => !NOT_PAYLOAD.test(f)).map((f) => f.slice(PUBLIC.length + 1))
  : [];
const KAYKIT_UNUSED = haveAssets
  ? walk(join(PUBLIC, 'kaykit')).filter((f) => !NOT_PAYLOAD.test(f))
    .map((f) => f.slice(PUBLIC.length + 1))
    .filter((rel) => !namedInSrc(rel.slice(rel.lastIndexOf('/') + 1)) && !sidecars.has(rel))
  : [];

/**
 * Shipped, never fetched. Each entry is megabytes of download bought for nothing.
 *
 *   tombchaser/*             a CC0 Egyptian art pack, staged and deliberately never wired — its
 *                            normal and metallic maps may fight the cel ramp, which was the right
 *                            call to defer and the wrong thing to ship while deferring.
 *   sly-rig.glb              11 MB, zero references anywhere.
 *   sly-anims.glb            BUILD-TIME input to `mixamo2clips`; the runtime loads MixamoClips.js.
 *   carmelita-anims.glb      BUILD-TIME input to `carmelita2clips`; runtime loads GuardClips.js.
 *   sly-godot-anims.glb      split out to keep 2,620 channels OFF the boot path, then shipped.
 *   museum-…mp3, footstep    not in `STEM_FILES`; nothing can name them.
 *   sly-cane.glb             owner-supplied, staged 2026-08-09, correctly not yet wired.
 *
 * The fix is to move these out of Vite's copy path while keeping them in git — not to delete them.
 * Queued behind the capture lock (§186), as the texture bake is (§232.7).
 */
const KNOWN_UNSHIPPED_PAYLOAD = [
  'audio/footstep.mp3',
  'audio/museum-of-natural-history.mp3',
  'sly-anim/carmelita-anims.glb',
  'sly-anim/carmelita-body.png',
  'sly-anim/carmelita-head.png',
  'sly-anim/sly-anims.glb',
  'sly-anim/sly-body.png',
  'sly-anim/sly-cane.glb',
  'sly-anim/sly-head.png',
  'sly-anim/sly-rig.glb',
  'sly-cane/sly-cane.glb',
  'sly-godot/sly-godot-anims.glb',
  ...KAYKIT_UNUSED,
  ...TOMBCHASER_ALL,
];

test('bundle: the scan sees a real asset tree and real source', () => {
  /* §211.1 — the assertions below are set comparisons. A scan that found nothing would pass them
     all while inspecting nothing, so prove the subject exists and that the scan can see BOTH
     states before trusting either. */
  assert.ok(haveAssets, 'public/assets is missing');
  assert.ok(assets.length > 20, `only ${assets.length} shipped assets found`);
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
