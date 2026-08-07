/**
 * KayKit — loader for the supplied CC0 architecture pack, INERT unless asked for.
 *
 * The pack (KayKit Dungeon Asset Pack 1.1, Kay Lousberg, CC0 1.0 — licence and provenance in
 * `public/assets/kaykit/`) is 58 curated glTF models sharing one 1024² atlas. This module exists
 * to answer the question that has to come before any placement: **do these read correctly under
 * this project's cel shading and desert palette, at this project's scale?** Installing files is
 * not using them, and designing a temple around assets whose look has never been rendered would
 * be building on an assumption.
 *
 * GATED, deliberately. It builds nothing unless `?kaykit=1` is in the URL, so the shipped build is
 * untouched while the look is being judged. Placement in the actual level is a separate, later
 * change that should be captured and judged on its own.
 *
 * `?kaykit=1`      showcase row using the SANDSTONE-retinted atlas (this game's palette)
 * `?kaykit=raw`    the same row using the pack's own dungeon-grey atlas, for comparison
 *
 * The models load from `public/` rather than being bundled through `src/`: each `.gltf` references
 * its `.bin` and the atlas by RELATIVE uri, and vite hashes anything imported through `src/`,
 * which would break those references. `public/` is copied verbatim, so the paths survive and the
 * build stays self-contained — served from the app's own origin, nothing fetched externally.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* One of each kind worth judging: vertical architecture, an opening, ground, a light source,
   and a vessel. Enough to see how the pack's forms and its atlas sit in our grade. */
const SHOWCASE = [
  { file: 'pillar_decorated', x: -6.0 },
  { file: 'column', x: -3.6 },
  { file: 'wall_arched', x: -0.8 },
  { file: 'stairs', x: 2.2 },
  { file: 'torch_mounted', x: 4.4 },
  { file: 'barrel_large_decorated', x: 5.8 },
  { file: 'chest_gold', x: 7.0 },
];

const BASE = 'assets/kaykit/';

export class KayKit {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'kaykit';
    this.mode = null;
    this.stats = { loaded: 0, failed: 0, tris: 0 };
  }

  async init() {
    let flag = '';
    try {
      if (typeof location !== 'undefined' && location.search) {
        flag = new URLSearchParams(location.search).get('kaykit') || '';
      }
    } catch { /* no location in a plain-module host — that is the shipped path */ }
    if (!flag) return;                              // inert by default
    this.mode = flag === 'raw' ? 'raw' : 'sandstone';

    /* The pack's own atlas, or this game's retint of it. One texture serves all 58 models. */
    const atlasFile = this.mode === 'raw' ? 'dungeon_texture.png' : 'dungeon_texture_sandstone.png';
    const atlas = await new THREE.TextureLoader().loadAsync(BASE + atlasFile);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.flipY = false;                            // glTF convention, unlike OBJ — see SlyModelDL
    atlas.anisotropy = 4;

    const shading = this.engine?.get?.('shading');
    const mat = shading?.make
      ? shading.make({ name: 'kaykit:atlas', color: 0xffffff, map: atlas, bands: 3, rim: 0.5, outline: 0.0034, outlineColor: 0x1a1210 })
      : new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9 });

    /* Placed on the courtyard deck (y = 9.0, the plane `perch_idle`'s crook clearance is measured
       against) so the row stands on real level geometry rather than floating in a void — the
       mistake §203.1 caught in the cone instrument, which scored "clearance" against an empty
       scene and ranked a buried crook first of 10,351. */
    const loader = new GLTFLoader();
    const DECK_Y = 9.0, Z = 6.0;
    for (const item of SHOWCASE) {
      try {
        const g = await loader.loadAsync(`${BASE}${item.file}.gltf`);
        const root = g.scene;
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.material = mat;
          o.castShadow = true;
          o.receiveShadow = true;
          const p = o.geometry?.attributes?.position;
          if (p) this.stats.tris += p.count / 3;
        });
        root.position.set(item.x, DECK_Y, Z);
        root.name = `kaykit:${item.file}`;
        this.group.add(root);
        this.stats.loaded++;
      } catch (err) {
        this.stats.failed++;
        this.engine?.warn?.(`KayKit: ${item.file} failed — ${err?.message || err}`);
      }
    }

    this.engine.scene.add(this.group);
    this.engine?.warn?.(`KayKit showcase (${this.mode}): ${this.stats.loaded} loaded, ${this.stats.failed} failed, ${Math.round(this.stats.tris)} tris`);
  }

  update() { /* static */ }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    const m = this.group.children[0];
    m?.material?.map?.dispose?.();
    this.group.parent?.remove(this.group);
  }
}
