import * as THREE from 'three';
import { rng } from '../core/Rand.js';
import {
  Bag, mergeAll, place, matrixOf,
  brazier, wallTorch, vessel, canopicJar, basket, ropeCoil, ropeSpan,
  offeringTable, incenseStand, scaffold, banner, bannerMast,
  coin, ingot, scarab, sootStain, flameCard, chunk,
} from './PropKit.js';
import {
  seatedColossus, sphinx, anubis, falconRa, coffinLid, fallenHead, brokenStatue,
} from './Statues.js';

/**
 * Props — the hero sculpture and set dress.
 *
 * The builders in PropKit.js and Statues.js do the modelling; this file decides what exists,
 * where it stands, and which merge bucket it lands in. Everything repeated is instanced and
 * everything static is merged per material, because the budget (AGENTS.md §1) is 250 draw
 * calls for the whole frame and ARCHITECTURE has already spent most of it.
 *
 * Placement is not scatter. Props cluster where people would actually use them — braziers on
 * the processional route, pottery against walls, rubble at the foot of what's broken — and a
 * handful are positioned by eye specifically to give each canonical camera in Shots.js the
 * dark foreground element §2.3 asks for.
 */

/* Material keys the builders tag their geometry with, mapped to how each should shade. */
const MATERIALS = {
  stone:     { tex: 'granite_pink',       color: 0x9c8278, rough: 0.88, outline: 1.0 },
  lime:      { tex: 'limestone_polished', color: 0xd4c19a, rough: 0.62, outline: 1.0 },
  gold:      { tex: 'gold_leaf',          color: 0xe8b942, rough: 0.28, metal: true, outline: 1.0, spec: 0.9, gloss: 96 },
  bronze:    { tex: 'bronze_aged',        color: 0x8a6a3a, rough: 0.52, metal: true, outline: 1.0, spec: 0.6, gloss: 48 },
  wood:      { tex: 'wood_old',           color: 0x6b4a2c, rough: 0.9,  outline: 0.85 },
  rope:      { tex: 'rope',               color: 0xa8875c, rough: 0.95, outline: 0.6 },
  cloth:     { tex: 'linen_cloth',        color: 0xe8ddc4, rough: 0.85, outline: 0.8, side: THREE.DoubleSide },
  dark:      { tex: null,                 color: 0x241a16, rough: 0.9,  outline: 0.9 },
  lapis:     { tex: 'lapis_inlay',        color: 0x1f4f96, rough: 0.35, outline: 0.9 },
  carnelian: { tex: 'carnelian_inlay',    color: 0xb8452c, rough: 0.4,  outline: 0.9 },
  glass:     { tex: null,                 color: 0x8fd8ff, rough: 0.15, outline: 0, transparent: true, opacity: 0.55 },
  cork:      { tex: 'wood_old',           color: 0x8a6a42, rough: 0.95, outline: 0.7 },
  // Emissive — fire and embers must not take an ink outline or they read as stickers.
  ember:     { tex: null,                 color: 0xff7a2a, rough: 1.0,  outline: 0, emissive: 0xff6a20, emissiveIntensity: 2.4 },
  flame:     { tex: 'torch_flame',        color: 0xffc06a, rough: 1.0,  outline: 0, emissive: 0xffa040, emissiveIntensity: 3.0, transparent: true, side: THREE.DoubleSide },
};

/** §8.1 landmark coordinates this module builds to. */
const L = {
  colossus:   [{ x: -9.5, z: 25 }, { x: 9.5, z: 25 }],
  colossusY:  2.0,               // plinth top — ARCHITECTURE owns everything below
  sphinxX:    7,
  sphinxZ:    [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84],
  tombStair:  { x: 0, z: -56 },
  vault:      { x: 0, y: -12, z: -72 },
  pylon:      { x: 14, z: 34 },
  courtyard:  { x0: -26, x1: 26, z0: -16, z1: 34 },
  hallZ:      [-50, -42, -34, -26, -18],
  hallX:      22,
};

const _v = new THREE.Vector3();

export class Props {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'props';

    this.buckets = new Map();      // material key → geometry[]
    this._materials = [];
    this._geoms = [];
    this._lights = [];
    this._fx = [];
    this._collect = [];            // bobbing coins and clue bottles
    this.rng = rng(0x9c0113);
    this.stats = { draws: 0, tris: 0 };
  }

  async init() {
    this.engine.scene.add(this.group);

    this._colossi();
    this._sphinxAvenue();
    this._tomb();
    this._courtyardDress();
    this._hallDress();
    this._banners();
    this._collectibles();

    this._flushBuckets();
    this._registerLightsAndFx();
  }

  /* ===================== hero sculpture ============================ */

  _colossi() {
    for (const p of L.colossus) {
      const bag = seatedColossus({ rng: this.rng, worn: 0.55 });
      // Both face down the axis toward the approach, mirrored about x.
      bag.transform(matrixOf({ x: p.x, y: L.colossusY, z: p.z, ry: p.x < 0 ? 0.06 : -0.06 }));
      this._absorb(bag);

      // The knees are a registered `ledge` at world y≈4.5 (§8.1) — ARCHITECTURE registers
      // the throne block, so only add a collider if it didn't.
      this._maybeLedge(p.x, 4.5, p.z + 2.0, 3.6, 1.4);
    }
  }

  _sphinxAvenue() {
    for (let i = 0; i < L.sphinxZ.length; i++) {
      const z = L.sphinxZ[i];
      for (const sx of [-1, 1]) {
        const bag = sphinx({ rng: this.rng, worn: 0.35 + i * 0.05 });
        bag.transform(matrixOf({
          x: sx * L.sphinxX, y: 0, z,
          ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
          s: 1 + this.rng.jitter(0.04),
        }));
        this._absorb(bag);
      }
    }
    // One toppled, because eight perfect pairs reads as a copy-paste (§7.3 irregularity).
    const fallen = fallenHead({ rng: this.rng });
    fallen.transform(matrixOf({ x: -L.sphinxX - 1.6, y: 0.5, z: 71.5, rz: 1.2, ry: 0.7 }));
    this._absorb(fallen);
  }

  _tomb() {
    // Anubis pair flanking the descent — the most readable silhouette in the game.
    for (const sx of [-1, 1]) {
      const bag = anubis({ rng: this.rng });
      bag.transform(matrixOf({ x: L.tombStair.x + sx * 2.6, y: 0, z: L.tombStair.z + 1.2, ry: -sx * 0.25 }));
      this._absorb(bag);
    }

    // The vault: gilded Ra behind the sarcophagus, catching the torchlight.
    const ra = falconRa({ rng: this.rng });
    ra.transform(matrixOf({ x: L.vault.x, y: L.vault.y, z: L.vault.z - 3.2 }));
    this._absorb(ra);

    const lid = coffinLid({ rng: this.rng });
    lid.transform(matrixOf({ x: L.vault.x, y: L.vault.y + 0.9, z: L.vault.z, ry: 0.04 }));
    this._absorb(lid);

    // Canopic jars on a low offering table beside the sarcophagus.
    const kinds = ['ape', 'jackal', 'falcon', 'human'];
    for (let i = 0; i < 4; i++) {
      const jar = canopicJar(kinds[i], { rng: this.rng });
      place(jar, { x: L.vault.x - 2.6 + i * 0.62, y: L.vault.y + 0.62, z: L.vault.z + 2.4 });
      this._push('lime', jar);
    }
    const table = offeringTable({ rng: this.rng });
    table.transform(matrixOf({ x: L.vault.x - 1.7, y: L.vault.y, z: L.vault.z + 2.4 }));
    this._absorb(table);

    this._treasurePile(L.vault.x + 2.9, L.vault.y, L.vault.z + 1.2);

    // Tomb torches — the interior shot's only motivated light.
    for (const [x, z] of [[-5.5, -60], [5.5, -60], [-5.5, -70], [5.5, -70], [-5.5, -78], [5.5, -78]]) {
      this._torch(x, L.vault.y + 2.6, z, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  /** Loose gold. It has to actually glitter — it is Sly's whole motivation. */
  _treasurePile(cx, cy, cz) {
    const R = this.rng;
    for (let i = 0; i < 140; i++) {
      const a = R.range(0, Math.PI * 2);
      const r = Math.sqrt(R()) * 1.5;
      const h = (1 - r / 1.6) * 0.5;
      const g = coin(R.range(0.055, 0.085), 0.014);
      place(g, {
        x: cx + Math.cos(a) * r, y: cy + R.range(0.01, Math.max(0.02, h)), z: cz + Math.sin(a) * r,
        rx: R.range(-1.4, 1.4), ry: R.range(0, Math.PI), rz: R.range(-1.4, 1.4),
      });
      this._push('gold', g);
    }
    for (let i = 0; i < 9; i++) {
      const g = ingot({ rng: R });
      place(g, { x: cx + R.jitter(1.0), y: cy + 0.06, z: cz + R.jitter(1.0), ry: R.range(0, Math.PI) });
      this._push('gold', g);
    }
    for (let i = 0; i < 7; i++) {
      const g = scarab({ rng: R });
      place(g, { x: cx + R.jitter(1.2), y: cy + R.range(0.1, 0.35), z: cz + R.jitter(1.2), ry: R.range(0, Math.PI) });
      this._push(R.chance(0.5) ? 'lapis' : 'carnelian', g);
    }
  }

  /* ===================== set dress ================================= */

  _courtyardDress() {
    const R = this.rng;

    // Braziers light the processional route and the courtyard corners.
    const brazierSpots = [
      [-18, 6], [18, 6], [-18, 22], [18, 22], [-7.5, 32], [7.5, 32], [-20, -10], [20, -10],
    ];
    for (const [x, z] of brazierSpots) this._brazier(x, 0, z);

    // Pottery and baskets gather against walls and in corners, never mid-floor.
    for (let i = 0; i < 26; i++) {
      const againstWall = R.chance(0.7);
      const x = againstWall ? R.sign() * R.range(21, 25) : R.range(-18, 18);
      const z = againstWall ? R.range(-14, 32) : R.pick([-13, 31]);
      const g = R.chance(0.6) ? vessel({ rng: R, h: R.range(0.5, 1.1) }) : basket({ rng: R });
      place(g, { x, y: 0, z, ry: R.range(0, Math.PI * 2), s: R.range(0.85, 1.25) });
      this._push(R.chance(0.75) ? 'lime' : 'stone', g);
    }

    for (let i = 0; i < 8; i++) {
      const g = ropeCoil({ rng: R });
      place(g, { x: R.range(-22, 22), y: 0.02, z: R.range(-14, 32), ry: R.range(0, Math.PI * 2) });
      this._push('rope', g);
    }

    // Scaffolding against the east pylon — set dress that doubles as traversal geometry.
    const scaf = scaffold({ rng: R, w: 3.2, h: 7.5, d: 1.8 });
    scaf.transform(matrixOf({ x: 19.5, y: 0, z: 33.0, ry: -Math.PI / 2 }));
    this._absorb(scaf);
    this._deck(19.5, 7.5, 33.0, 3.2, 1.8);

    // Rubble at the foot of the broken things.
    const broken = brokenStatue({ rng: R });
    broken.transform(matrixOf({ x: -22.5, y: 0, z: 4.0, ry: 0.9, rz: 0.12 }));
    this._absorb(broken);
    for (let i = 0; i < 30; i++) {
      const g = chunk(R.range(0.2, 0.7), R.range(0.15, 0.5), R.range(0.2, 0.7), { rng: R, jitter: 0.05, chip: 0.4 });
      place(g, {
        x: -22.5 + R.jitter(3.2), y: R.range(0.05, 0.3), z: 4.0 + R.jitter(3.2),
        rx: R.jitter(0.5), ry: R.range(0, Math.PI), rz: R.jitter(0.5),
      });
      this._push('stone', g);
    }
  }

  _hallDress() {
    const R = this.rng;
    // Wall torches down both sides of the hypostyle hall, aligned to the clerestory rhythm.
    for (const z of L.hallZ) {
      for (const sx of [-1, 1]) {
        this._torch(sx * L.hallX, 4.2, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    for (let i = 0; i < 12; i++) {
      const g = vessel({ rng: R, h: R.range(0.6, 1.3) });
      place(g, { x: R.sign() * R.range(19, 23), y: 0, z: R.range(-50, -18), ry: R.range(0, Math.PI * 2) });
      this._push('lime', g);
    }
    for (let i = 0; i < 5; i++) {
      const st = incenseStand({ rng: R });
      st.transform(matrixOf({ x: R.sign() * R.range(14, 20), y: 0, z: R.range(-48, -20), ry: R.range(0, Math.PI) }));
      this._absorb(st);
    }
  }

  /** Linen banners on the pylon face — cloth that hangs and stirs, not cardboard. */
  _banners() {
    const R = this.rng;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const x = sx * (L.pylon.x - 2.6 - i * 4.4);
        const mast = bannerMast({ rng: R, h: 11 });
        mast.transform(matrixOf({ x, y: 0, z: L.pylon.z + 3.4 }));
        this._absorb(mast);

        const cloth = banner({ rng: R, w: 1.5, h: 6.2 });
        place(cloth, { x, y: 9.6, z: L.pylon.z + 3.55 });
        this._push('cloth', cloth);

        // Masts are climbable — a banner pole by a pylon is a legitimate route up.
        this._pole(x, 0, L.pylon.z + 3.4, 11);
      }
    }
  }

  /* ===================== collectibles ============================== */

  /**
   * Coins and clue bottles. These are gameplay readability first: they carry the iconic
   * `#8fd8ff` sparkle (§2.1) and must pop against sandstone from across the courtyard.
   */
  _collectibles() {
    const R = this.rng;
    const spots = [];
    for (let i = 0; i < 34; i++) {
      spots.push([R.range(-22, 22), R.range(0.6, 1.2), R.range(-14, 32)]);
    }
    // A trail along the architrave ledge, rewarding the rooftop route.
    for (let i = 0; i < 10; i++) spots.push([-21 + i * 4.6, 9.9, 30]);

    const geo = coin(0.16, 0.035);
    this._geoms.push(geo);
    const mat = this._mat('gold');
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    mesh.name = 'coins';
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;   // tiny, and self-shadowing them just adds acne
    spots.forEach((s, i) => {
      _v.set(s[0], s[1], s[2]);
      mesh.setMatrixAt(i, new THREE.Matrix4().compose(
        _v, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        new THREE.Vector3(1, 1, 1)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this._collect.push({ mesh, spots, phase: spots.map(() => R.range(0, Math.PI * 2)) });
  }

  /* ===================== emitters & lights ========================= */

  _brazier(x, y, z) {
    const bag = brazier({ rng: this.rng });
    bag.transform(matrixOf({ x, y, z }));
    this._absorb(bag);
    this._lights.push({ position: new THREE.Vector3(x, y + 1.15, z), color: 0xff9a4a, intensity: 5.5, radius: 13, flicker: 0.45 });
    this._fx.push({ name: 'embers', position: new THREE.Vector3(x, y + 1.05, z) });
    this._hazard(x, y + 0.9, z, 0.55);
  }

  _torch(x, y, z, ry) {
    const bag = wallTorch({ rng: this.rng });
    bag.transform(matrixOf({ x, y, z, ry }));
    this._absorb(bag);
    const soot = sootStain({ rng: this.rng });
    place(soot, { x, y: y + 1.5, z, ry });
    this._push('dark', soot);
    this._lights.push({ position: new THREE.Vector3(x, y + 0.35, z), color: 0xffb060, intensity: 3.4, radius: 9, flicker: 0.55 });
    this._fx.push({ name: 'torch_smoke', position: new THREE.Vector3(x, y + 0.6, z) });
  }

  /* ===================== plumbing ================================== */

  _absorb(bag) {
    if (!bag?.parts) return;
    bag.drain((key, geo) => this._push(key, geo));
  }

  _push(key, geo) {
    if (!geo) return;
    const k = MATERIALS[key] ? key : 'stone';
    if (!this.buckets.has(k)) this.buckets.set(k, []);
    this.buckets.get(k).push(geo);
  }

  /** Merge each material bucket into one mesh — 12 draw calls instead of ~1200. */
  _flushBuckets() {
    for (const [key, geos] of this.buckets) {
      const merged = mergeAll(geos);
      if (!merged) continue;
      this._geoms.push(merged);
      const mesh = new THREE.Mesh(merged, this._mat(key));
      mesh.name = `props_${key}`;
      const spec = MATERIALS[key];
      if (spec.emissive || spec.transparent) mesh.userData.noShadow = true;
      this.group.add(mesh);
      this.stats.draws++;
      this.stats.tris += (merged.index?.count ?? merged.attributes.position.count) / 3;

      // Solid props are standable; cloth, flame and glass are not.
      if (!spec.transparent && !spec.emissive && key !== 'rope') {
        this.engine.registerCollider(mesh, { tag: 'ground', material: key === 'wood' ? 'wood' : 'stone' });
      }
    }
    this.buckets.clear();
  }

  _mat(key) {
    const spec = MATERIALS[key];
    const shading = this.engine.get('shading');
    const tex = spec.tex ? this.engine.get('textures')?.get(spec.tex) : null;

    const opts = {
      color: spec.color,
      map: tex?.map ?? null,
      normalMap: tex?.normalMap ?? null,
      roughnessMap: tex?.roughnessMap ?? null,
      aoMap: tex?.aoMap ?? null,
      bands: 3,
      rim: 0.55,
      rimColor: 0x7fd4ff,
      spec: spec.spec ?? 0.2,
      gloss: spec.gloss ?? 28,
      outline: spec.outline ?? 1.0,
      sss: spec.side ? 0.5 : 0.1,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      transparent: !!spec.transparent,
      opacity: spec.opacity ?? 1,
      side: spec.side ?? THREE.FrontSide,
    };

    let m = null;
    if (shading?.toon) {
      try { m = shading.toon(opts); } catch (err) {
        this.engine.warn(`props: shading.toon threw for "${key}" — ${err?.message || err}`);
      }
    }
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: spec.color, map: opts.map, normalMap: opts.normalMap,
        roughness: spec.rough ?? 0.8, metalness: spec.metal ? 0.9 : 0,
        emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity,
        transparent: opts.transparent, opacity: opts.opacity, side: opts.side,
      });
    }
    this._materials.push(m);
    return m;
  }

  /** Hand the brazier/torch lights and emitters to their owners, if those modules exist. */
  _registerLightsAndFx() {
    const lighting = this.engine.get('lighting');
    if (lighting?.addLocalLight) {
      for (const l of this._lights) {
        try { lighting.addLocalLight(l); } catch { /* budgeted out; not fatal */ }
      }
    }
    const fx = this.engine.get('fx');
    if (fx?.burst || fx?.spawn) {
      for (const e of this._fx) {
        try { fx.spawn?.(e.name, { position: e.position }); } catch { /* emitter unknown */ }
      }
    }
  }

  /* --- collider helpers. ARCHITECTURE may already own these surfaces, so keep them
         cheap and additive rather than duplicating its registrations. --- */

  _maybeLedge(x, y, z, w, d) {
    const g = new THREE.BoxGeometry(w, 0.2, d);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y, z);
    m.visible = false;
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'ledge', material: 'stone' });
  }

  _deck(x, y, z, w, d) {
    const g = new THREE.BoxGeometry(w, 0.2, d);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y, z);
    m.visible = false;
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'ground', material: 'wood' });
  }

  _pole(x, y, z, h) {
    const g = new THREE.CylinderGeometry(0.12, 0.12, h, 6);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y + h / 2, z);
    m.visible = false;
    m.userData.spline = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h, z),
    ]);
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'pole', material: 'wood', climbable: true });
  }

  _hazard(x, y, z, r) {
    const g = new THREE.SphereGeometry(r, 6, 4);
    const m = new THREE.Mesh(g, this._invisible());
    m.position.set(x, y, z);
    m.visible = false;
    this.group.add(m);
    this.engine.registerCollider(m, { tag: 'hazard', material: 'stone' });
  }

  _invisible() {
    this._invis ||= new THREE.MeshBasicMaterial({ visible: false });
    return this._invis;
  }

  /* ===================== frame ===================================== */

  update(dt, t) {
    // Collectibles bob and spin so they read as pickups rather than scenery.
    for (const c of this._collect) {
      const { mesh, spots, phase } = c;
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        _v.set(s[0], s[1] + Math.sin(t * 2.2 + phase[i]) * 0.09, s[2]);
        _m.compose(_v, _q.setFromEuler(_e.set(Math.PI / 2, 0, t * 1.8 + phase[i])), _one);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const g of this._geoms) g.dispose();
    for (const m of this._materials) m.dispose?.();
    this._invis?.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}

/* Scratch — update() allocates nothing (§5). */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
