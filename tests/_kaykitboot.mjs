/**
 * _kaykitboot.mjs — the seam that lets `src/world/KayKit.js` run in plain Node.
 *
 * ── why this file exists ──────────────────────────────────────────────────────────────────────
 * KNOWN_ISSUES §393.2 recorded that `KayKit.js:180` is `new THREE.TextureLoader().loadAsync(...)`,
 * "which needs `document`", and concluded: **"KayKit cannot be booted headless at all."** That was
 * the stated reason the module had never been measured, and §393's thesis was that the one module
 * no instrument can reach is the one that accumulated a false comment.
 *
 * **The conclusion was wrong, and it needed no source change to disprove.** three's loaders consult
 * `Cache` BEFORE they touch the DOM or the network:
 *
 *     ImageLoader.js:53    const cached = Cache.get( `image:${url}` );   // returns before
 *     ImageLoader.js:86    const image = createElementNS( 'img' );       // ...this line
 *     FileLoader.js:86     const cached = Cache.get( `file:${url}` );    // returns before
 *     FileLoader.js:141    fetch( req )                                  // ...this line
 *
 * So a primed `THREE.Cache` short-circuits both, and `document` is never reached. Verified: this
 * module boots KayKit to completion in a Node process where `typeof document === 'undefined'`.
 *
 * Exactly ONE global is still required, and it is not the DOM:
 *
 *     GLTFLoader.js:3301   const URL = self.URL || self.webkitURL;
 *
 * — read unconditionally for every glTF image, including URI-backed ones where it is then unused.
 * `globalThis.self = globalThis` satisfies it. `tools/_domshim.mjs` has shipped that same line for
 * other loaders since before this file; the DOM half of that shim is NOT needed here.
 *
 * ── what this seam does and does not stub ─────────────────────────────────────────────────────
 * It replaces the TRANSPORT only. Every byte handed to `GLTFLoader` is the real `.gltf`/`.bin` off
 * disk, so geometry, bounds, re-centring, footprint radii, placement transforms, collider boxes
 * and decal queueing are the shipped code running on the shipped assets. Only two things are not
 * real, and neither is on that path:
 *
 *   - the atlas PNG is a `{complete:true, 1024x1024}` marker rather than decoded pixels. Nothing
 *     in the placement path reads texels; `KayKit.init` only sets `colorSpace`/`flipY`/`anisotropy`.
 *   - `engine.get('shading')` returns null, so the material falls back to the `MeshStandardMaterial`
 *     branch at `KayKit.js:188`. Material choice does not reach placement or registration.
 *
 * The `?kaykit=` / `?kaykithull=` flags read `location`, which is absent here, so the shipped
 * `props` path is what runs — the same branch the game takes. That is the point: this measures
 * what ships, not a mode built for the harness.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const SRC_URL = new URL('../src/world/KayKit.js', import.meta.url);
const ASSET_DIR = fileURLToPath(new URL('../public/assets/kaykit/', import.meta.url));

export const KAYKIT_SRC = readFileSync(SRC_URL, 'utf8');

/**
 * KayKit's own `BASE` prefix, read out of the module rather than duplicated.
 *
 * The cache keys must match the URLs `KayKit` asks for byte for byte. If `BASE` ever changes and
 * this file hard-coded it, every model would miss the cache, `loadAsync` would fall through to a
 * `fetch` of a relative URL — which, per `CarmelitaGuard.js:330`, does not reject in Node, it never
 * settles — and the suite would hang rather than fail. So it is parsed, and a parse miss throws.
 */
function readBase() {
  const m = /^const BASE = '([^']+)';/m.exec(KAYKIT_SRC);
  if (!m) throw new Error('_kaykitboot: could not read `const BASE` out of src/world/KayKit.js');
  return m[1];
}

export const BASE = readBase();

/** Seed three's `Cache` with the real asset bytes. Returns what it seeded, so callers can assert. */
export function primeKayKitAssets() {
  globalThis.self ??= globalThis;                 // GLTFLoader.js:3301, see header
  THREE.Cache.enabled = true;
  if (!existsSync(ASSET_DIR)) throw new Error(`_kaykitboot: ${ASSET_DIR} is missing`);
  let files = 0, images = 0;
  for (const f of readdirSync(ASSET_DIR)) {
    if (f.endsWith('.gltf') || f.endsWith('.bin')) {
      const b = readFileSync(ASSET_DIR + f);
      THREE.Cache.add(`file:${BASE}${f}`, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      files++;
    } else if (f.endsWith('.png')) {
      /* ImageLoader's cached branch requires `complete === true`; it then hands this straight to
         `texture.image` and never inspects it again. Real pixels would buy nothing here. */
      THREE.Cache.add(`image:${BASE}${f}`, { complete: true, width: 1024, height: 1024 });
      images++;
    }
  }
  if (!files || !images) throw new Error(`_kaykitboot: seeded ${files} files and ${images} images — expected both non-zero`);
  return { files, images };
}

/** Which module is currently registering — lets one engine serve Architecture, Props and KayKit. */
export const engineOwner = { tag: 'kaykit' };

/** A recording engine stub. Every `registerCollider` call lands in `REG` with its options intact. */
export function makeEngine() {
  const REG = [], WARN = [];
  return {
    REG,
    WARN,
    quality: 'high',
    scene: new THREE.Scene(),
    debug: {},
    stats: {},
    warn: (m) => WARN.push(String(m)),
    get: () => null,
    has: () => false,
    on: () => () => {},
    emit: () => {},
    registerCollider: (mesh, opts) => REG.push({ mesh, opts, owner: engineOwner.tag }),
  };
}

/**
 * Boot KayKit (optionally alongside Architecture and Props, which own the colliders KayKit's
 * props sit against). Returns the module, the engine and the per-model library `_load` produced.
 */
export async function bootKayKit({ withLevel = false } = {}) {
  primeKayKitAssets();
  const { KayKit } = await import('../src/world/KayKit.js');
  const engine = makeEngine();

  /* `_load`'s library is the only place per-model bounds and footprint radii exist by name — the
     merge downstream erases prop identity, exactly as `Props._push` does in basketvary. */
  const lib = new Map();
  const origLoad = KayKit.prototype._load;
  KayKit.prototype._load = async function (names) {
    const l = await origLoad.call(this, names);
    for (const [k, v] of l) lib.set(k, v);
    return l;
  };

  try {
    if (withLevel) {
      const { Architecture } = await import('../src/world/Architecture.js');
      const { Props } = await import('../src/world/Props.js');
      engineOwner.tag = 'arch'; await new Architecture(engine).init();
      engineOwner.tag = 'props'; await new Props(engine).init();
    }
    engineOwner.tag = 'kaykit';
    const kaykit = new KayKit(engine);
    await kaykit.init();
    return { kaykit, engine, lib, REG: engine.REG, WARN: engine.WARN };
  } finally {
    KayKit.prototype._load = origLoad;
  }
}

/** The shipped PLACEMENTS table, read as data. Source of truth for "how many rows, and where". */
export function readPlacements() {
  const m = /const PLACEMENTS = \[([\s\S]*?)\n\];/.exec(KAYKIT_SRC);
  if (!m) throw new Error('_kaykitboot: could not find the PLACEMENTS literal');
  const rows = [...m[1].matchAll(/\[\s*'([a-z_]+)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]/g)]
    .map((r) => ({ file: r[1], x: +r[2], y: +r[3], z: +r[4], ry: +r[5] }));
  if (!rows.length) throw new Error('_kaykitboot: parsed 0 placements — the table format changed');
  /* Where the camera block starts, so "the thirty above" and "the six below" are read rather
     than assumed. The banner is the anchor; a rename must fail loudly, not split silently. */
  const banner = /\/\* ---- and \w+ placed FOR THE CAMERAS/.exec(m[1]);
  if (!banner) throw new Error('_kaykitboot: could not find the FOR THE CAMERAS banner');
  const before = m[1].slice(0, banner.index);
  const nBefore = [...before.matchAll(/\[\s*'([a-z_]+)',/g)].length;
  return { rows, nBefore, nAfter: rows.length - nBefore };
}
