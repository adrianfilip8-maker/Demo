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
   and a vessel. Enough to see how the pack's forms and its atlas sit in our grade.
 *
 * NO x COORDINATES HERE, on purpose. The first version of this row hand-placed them at 1.2–2.8 m
 * apart and the capture came back an unreadable pile-up, because these models are 4–5 m pieces,
 * not the 1–2 m props the spacing assumed (`pillar` 1.5×1.5×4, `wall_arched` 4×4×1, `stairs`
 * 5×5.1×4). Spacing is now PACKED FROM EACH MODEL'S OWN BOUNDING BOX at load, so the row cannot
 * disagree with the geometry it contains and swapping an entry needs no re-measurement. */
const SHOWCASE = [
  'pillar_decorated', 'column', 'wall_arched', 'stairs', 'torch_mounted',
  'barrel_large_decorated', 'chest_gold',
];
const GAP = 1.0;                                  // clear metres between neighbouring bounding boxes

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

    /* Stood on the COURTYARD PAVING at y = 0, in the clear band x ∈ [−26, 26], z ∈ [−14, 0]. That
       band is uninterrupted: `EgyptLevel`'s paving holes are the obelisk terrace (z 2.2…19.8), the
       colossi plinths (z 21.4…28.6) and the pylon feet (z 30.6…34), and none of them reach z < 2.2.
       Real level geometry underfoot rather than a void — the mistake §203.1 caught in the cone
       instrument, which scored "clearance" against an empty scene and ranked a buried crook first
       of 10,351. The first version parked the row on the y = 9.0 kiosk deck at z = 6.0, which is
       SOUTH of the kiosk's own z 7.4…14.6 footprint, i.e. it was floating after all. */
    const loader = new GLTFLoader();
    const GROUND_Y = 0, Z = -6.0;

    /* pass 1 — load and measure */
    const items = [];
    const box = new THREE.Box3(), size = new THREE.Vector3();
    for (const file of SHOWCASE) {
      try {
        const g = await loader.loadAsync(`${BASE}${file}.gltf`);
        const root = g.scene;
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.material = mat;
          o.castShadow = true;
          o.receiveShadow = true;
          const p = o.geometry?.attributes?.position;
          if (p) this.stats.tris += p.count / 3;
        });
        root.updateMatrixWorld(true);
        box.setFromObject(root);
        if (!box.isEmpty() && Number.isFinite(box.min.x) && Number.isFinite(box.max.y)) {
          box.getSize(size);
          items.push({ file, root, w: size.x, minX: box.min.x, minY: box.min.y });
          this.stats.loaded++;
        } else {
          this.stats.failed++;
          this.engine?.warn?.(`KayKit: ${file} has no finite bounds — skipped`);
        }
      } catch (err) {
        this.stats.failed++;
        this.engine?.warn?.(`KayKit: ${file} failed — ${err?.message || err}`);
      }
    }

    /* pass 2 — pack left to right on measured widths, centred on x = 0, every base on the paving.
       `torch_mounted` is authored around its wall bracket (y −0.38…0.68), so sitting each model's
       own bbox floor on the ground is what keeps the row level for all of them alike. */
    const total = items.reduce((s, it) => s + it.w, 0) + GAP * Math.max(0, items.length - 1);
    let cursor = -total / 2;
    for (const it of items) {
      it.root.position.set(cursor - it.minX, GROUND_Y - it.minY, Z);
      it.root.name = `kaykit:${it.file}`;
      this.group.add(it.root);
      cursor += it.w + GAP;
    }
    this.rowWidth = total;

    this.engine.scene.add(this.group);
    this.engine?.warn?.(`KayKit showcase (${this.mode}): ${this.stats.loaded} loaded, ${this.stats.failed} failed, ${Math.round(this.stats.tris)} tris, row ${this.rowWidth.toFixed(1)} m`);
  }

  update() { /* static */ }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    const m = this.group.children[0];
    m?.material?.map?.dispose?.();
    this.group.parent?.remove(this.group);
  }
}
