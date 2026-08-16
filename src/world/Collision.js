import * as THREE from 'three';
import {
  TriangleSoup, TriBVH, TAG_NAMES, TAG_ID, MAT_NAMES, MAT_ID,
  FLAG_ONEWAY, FLAG_CLIMBABLE, FLAG_ANALYTIC,
  closestSegTriangle,
} from './BVH.js';

/**
 * Collision — the world's spatial query service (AGENTS.md §4.6).
 *
 * No visuals, no gameplay logic: it turns every registered mesh into one flat triangle BVH
 * plus a spatial hash of traversal affordances, and answers questions about them fast enough
 * that MOVEMENT can ask dozens per frame without thinking about it.
 *
 * ============================== CAPSULE CONVENTION ==============================
 * `from` / `to` / `pos` are the character's **feet** (the bottom of the capsule), because
 * §8.1 fixes the courtyard floor at y = 0 and spawns Sly at (0, 0, 30). `height` is the full
 * feet-to-crown height (1.8 m for Sly) and `radius` the capsule radius, so the interior
 * segment runs from `pos + (0, radius, 0)` to `pos + (0, height - radius, 0)`.
 * Pass `opts.anchor = 'center'` if you would rather work from the capsule centre.
 * ================================================================================
 *
 * Zero allocation per call. Every query returns an object drawn from a small ring pool, or
 * writes into an `out` argument you own. Pooled results stay valid for the next few calls
 * only — copy anything you intend to keep past the current frame.
 *
 * Two things worth knowing about the sweep, because they are what make it feel right:
 *
 *  1. Contact resolution is conservative advancement on the exact segment-triangle distance
 *     (see BVH.js), so the TOI is correct at any speed and the true Voronoi-region normal
 *     comes out of it — face, edge or vertex.
 *  2. A raw edge normal is nonetheless the *wrong* thing to slide on where two coplanar
 *     triangles meet. Three defences, in order: the geometric normal is snapped onto the
 *     triangle's plane normal when they broadly agree; contacts that do not oppose the
 *     motion are discarded from the sweep and left to depenetration; and near-identical
 *     normals are deduped across slide iterations so a corner cannot buzz.
 */

/* Feel/perf constants. The critic loop is allowed to tune these without archaeology. */
const TUNE = {
  slopeWalkableDeg: 50,      // §4.4: ground is walkable up to here
  slopeWallDeg: 70,          // §4.4: steeper than this is a wall-run surface
  skin: 0.004,               // contact offset kept between capsule and surface, metres
  maxSlides: 4,              // §4.6 requirement: resolve → project → repeat, up to 4×
  depenIters: 4,
  depenPad: 0.30,            // AABB inflation so one gather covers every push-out iteration
  normalDedupeCos: 0.995,    // ≈5.7°: closer than this counts as the same plane
  faceSnapCos: 0.20,         // how eagerly an edge contact is rewritten to the face normal
  groundLift: 0.06,          // probe start above the feet, so a slight sink still reads right
  hashCell: 10,              // affordance spatial hash cell, metres
  splineSample: 0.5,         // rail/pole polyline sampling, metres
  facingBias: 1.35,          // how much an off-axis affordance is penalised inside the cone
  behindPenalty: 2.6,        // …and beyond it. Soft, never a hard cutoff (§4.6).
  minSweep: 1e-7,
  debugMaxLines: 380000,
  debugOffset: 0.012,        // nudge debug lines off the surface to stop z-fighting
};

const D2R = Math.PI / 180;

/**
 * Tags that stop a capsule. Affordance markers (rail tubes, hook rings, spire tips) and
 * trigger volumes (vent, water, hazard) deliberately do not: MOVEMENT attaches to those, and
 * a hook ring that blocked the swing it exists to enable would be absurd. Override per call
 * with `opts.onlyTags`.
 */
const SOLID_TAGS = ['ground', 'wall', 'ledge', 'pole', 'misc'];

/** Debug visualisation colours, one merged LineSegments per tag. */
const TAG_COLOR = {
  ground: 0x4ade80, wall: 0xef4444, ledge: 0x22d3ee, rail: 0xfacc15, pole: 0xe879f9,
  hook: 0xfb923c, spire: 0xffffff, vent: 0x3b82f6, water: 0x2fa8a0, hazard: 0xdc143c,
  misc: 0x9a8462,
};

const AFF_POINT = 0, AFF_SPLINE = 1, AFF_BOX = 2;
/**
 * Published names for the three routes above, so a consumer can ask which one resolved instead
 * of inferring it. See the `kind` field on `nearest()` / `query()` results.
 */
const AFF_KIND = ['point', 'spline', 'box'];

/* ---- module-scope scratch. Nothing in a query path allocates. ---- */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _box = new THREE.Box3();
const _mat = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

export class Collision {
  constructor(engine) {
    this.engine = engine;

    this.ready = false;
    this.TUNE = TUNE;

    /** §4.6: slope thresholds live here so MOVEMENT never hardcodes them. Radians. */
    this.SLOPE = { walkable: TUNE.slopeWalkableDeg * D2R, wall: TUNE.slopeWallDeg * D2R };
    this.WALKABLE_COS = Math.cos(this.SLOPE.walkable);
    this.WALL_COS = Math.cos(this.SLOPE.wall);
    this.TAGS = TAG_NAMES.slice();
    this.SOLID_TAGS = SOLID_TAGS.slice();

    this.recs = [];
    this.bvh = new TriBVH();
    this._dirty = false;
    this._building = false;
    this._warned = new Set();

    this.stats = {
      tris: 0, nodes: 0, leaves: 0, depth: 0, buildMs: 0, recs: 0,
      degenerate: 0, nonFinite: 0,
      sweeps: 0, grounds: 0, rays: 0, overlaps: 0, nearests: 0, queries: 0, us: 0,
    };

    /* ---- tag masks ---- */
    this._maskAll = new Uint8Array(32).fill(1);
    this._maskSolid = new Uint8Array(32);
    for (const t of SOLID_TAGS) this._maskSolid[TAG_ID[t]] = 1;
    this._maskTmp = new Uint8Array(32);

    /* ---- result ring pools. Consecutive queries do not clobber each other. ---- */
    this._pools = {
      sweep: ring(8, makeSweepResult),
      ground: ring(6, makeGroundResult),
      ray: ring(8, makeRayResult),
      near: ring(6, makeNearResult),
    };
    this._overlapOut = [];
    this._queryOut = [];
    this._queryPool = [];

    /* ---- affordances ---- */
    this._aff = [];
    this._hash = new Map();
    this._stamp = null;
    this._gen = 1;
    this._cList = new Int32Array(512);
    this._cCount = 0;

    /* ---- volume recs (vent / hazard / water): tested as OBBs, not triangles ---- */
    this._volumes = [];

    /* ---- scratch used by the slide loop ---- */
    this._nrmBuf = new Float32Array(TUNE.maxSlides * 3);
    this._nrmCount = 0;
    this._dpx = 0; this._dpy = 0; this._dpz = 0; this._dpMoved = 0;
    this._dpNx = 0; this._dpNy = 1; this._dpNz = 0; this._dpTri = -1;

    /* ---- debug viz ---- */
    this.debugRoot = new THREE.Group();
    this.debugRoot.name = 'collision:debug';
    this.debugRoot.visible = false;
    this._debugBuilt = false;
    this._debugGeoms = [];
    this._debugMats = [];
    this._offShow = null;
  }

  /* ===================================================================== */
  /* lifecycle                                                             */
  /* ===================================================================== */

  async init() {
    this.engine?.scene?.add(this.debugRoot);

    // F3 → engine.emit('showColliders'). This is how the level's tagging gets verified, so
    // it is wired before anything else can go wrong.
    if (this.engine?.on) {
      this._offShow = this.engine.on('showColliders', (on) => this._showColliders(!!on));
    }

    // TERRAIN and ARCHITECTURE register during their own init(), which runs before this one
    // (see the MANIFEST order in main.js), so almost everything is already in. Anything that
    // lands later flips `_dirty` and gets folded in on the next frame.
    this.build();
  }

  /** §4.6 `collision.add(rec)` — called by engine.registerCollider, before or after build(). */
  add(rec) {
    if (!rec || !rec.mesh) {
      this._warn('collision: registerCollider called without a mesh');
      return;
    }
    let tag = rec.tag || 'ground';
    if (TAG_ID[tag] === undefined) {
      // Treat an unknown tag as solid ground rather than silently dropping it — a hole in
      // the floor is a much worse failure than a mislabelled surface.
      this._warn(`collision: unknown tag "${tag}" on "${rec.mesh.name || 'unnamed'}" — treating as ground`);
      tag = 'ground';
    }
    let material = rec.material || 'stone';
    if (MAT_ID[material] === undefined) {
      this._warn(`collision: unknown material "${material}" on "${rec.mesh.name || 'unnamed'}"`);
      material = 'stone';
    }
    rec.tag = tag;
    rec.material = material;
    rec._tagId = TAG_ID[tag];
    rec._matId = MAT_ID[material];
    rec._flags = (rec.oneWay ? FLAG_ONEWAY : 0) | (rec.climbable ? FLAG_CLIMBABLE : 0) |
      (rec.mesh.userData?.analytic ? FLAG_ANALYTIC : 0);
    rec._index = this.recs.length;
    this.recs.push(rec);
    this._dirty = true;
  }

  /** §4.6 `collision.build()` — (re)build the BVH. Idempotent, never throws. */
  build() {
    if (this._building) return;
    this._building = true;
    const t0 = now();
    try {
      const soup = new TriangleSoup();
      for (let i = 0; i < this.recs.length; i++) {
        const rec = this.recs[i];
        const mesh = rec.mesh;
        try {
          // Architecture builds with transforms and its proxies are invisible; never filter
          // on .visible, and always trust matrixWorld over local position.
          mesh.updateWorldMatrix(true, true);
          const n = soup.addObject(mesh, i, rec._tagId, rec._matId, rec._flags,
            (msg) => this._warn(`collision: ${msg} (rec #${i}, tag ${rec.tag})`));
          rec._tris = n;
          if (n === 0) {
            this._warn(`collision: "${mesh.name || 'unnamed'}" (tag ${rec.tag}) contributed 0 usable triangles`);
          }
        } catch (err) {
          this._warn(`collision: failed to read "${mesh?.name || 'unnamed'}" — ${err?.message || err}`);
        }
      }

      const s = this.bvh.build(soup);
      this.stats.tris = s.tris;
      this.stats.nodes = s.nodes;
      this.stats.leaves = s.leaves;
      this.stats.depth = s.depth;
      this.stats.recs = this.recs.length;
      this.stats.degenerate = soup.skipped.degenerate;
      this.stats.nonFinite = soup.skipped.nonFinite;

      this._buildAffordances();
      this._disposeDebug();

      this._dirty = false;
      this.ready = s.tris > 0;
      this.stats.buildMs = now() - t0;

      const sk = soup.skipped;
      const skipTxt = (sk.degenerate || sk.nonFinite || sk.noPosition)
        ? `  skipped ${sk.degenerate} degenerate, ${sk.nonFinite} non-finite, ${sk.noPosition} without positions`
        : '';
      console.log(
        `%c COLLISION %c ${s.tris.toLocaleString()} tris · ${s.nodes.toLocaleString()} nodes · ` +
        `${s.leaves} leaves · depth ${s.depth} · ${this.recs.length} colliders · ` +
        `${this._aff.length} affordances · ${this.stats.buildMs.toFixed(1)} ms${skipTxt} `,
        'background:#2fa8a0;color:#08121c;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px',
        'background:#1a1210;color:#bfe6ff;border-radius:0 3px 3px 0;padding:2px 6px'
      );
      if (!this.ready) this._warn('collision: BVH built with zero triangles — nothing is solid');
    } catch (err) {
      this._warn(`collision: build failed — ${err?.message || err}`);
      console.error('[collision] build failed', err);
      this.ready = false;
    }
    this._building = false;
  }

  update() {
    this.stats.sweeps = 0; this.stats.grounds = 0; this.stats.rays = 0;
    this.stats.overlaps = 0; this.stats.nearests = 0; this.stats.queries = 0; this.stats.us = 0;
    // Colliders registered after build() (PROPS, GUARDS) fold in here rather than stalling
    // whichever query happens to notice first.
    if (this._dirty) this.build();
  }

  dispose() {
    this._offShow?.();
    this._disposeDebug();
    this.debugRoot.parent?.remove(this.debugRoot);
    this.bvh.dispose();
    this.recs.length = 0;
    this._aff.length = 0;
    this._hash.clear();
    this.ready = false;
  }

  _ensure() {
    if (this._dirty && !this._building) this.build();
    return this.ready;
  }

  _warn(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    if (this.engine?.warn) this.engine.warn(msg);
    else if (this.engine?.warnings) this.engine.warnings.push(msg);
    else console.warn(msg);
  }

  /* ===================================================================== */
  /* §4.6 capsuleSweep — the workhorse                                     */
  /* ===================================================================== */

  /**
   * Sweep a capsule from `from` to `to` and resolve it: stop at first contact, project the
   * remaining motion onto the contact plane, repeat up to TUNE.maxSlides times, then push
   * out of any residual overlap.
   *
   * → { hit, position, normal, distance, tag, material, rec, toi, slid, contacts, normals }
   *   `position` is the resolved feet position; `distance` is how far along the original
   *   direction the capsule got before the first blocking contact; `normals` holds the
   *   deduped contact planes (clip your velocity against all of them).
   */
  capsuleSweep(from, to, radius, height, opts, out) {
    const t0 = now();
    const res = out && out.position ? out : this._pools.sweep.next();
    resetSweep(res);
    res.position.copy(to);

    const r = Math.max(0.02, radius || 0.35);
    const h = Math.max(2 * r + 1e-4, height || 1.8);
    const centred = opts?.anchor === 'center';
    const loY = centred ? -(h * 0.5) + r : r;
    const hiY = centred ? (h * 0.5) - r : h - r;
    const allowOneWay = !(opts?.skipOneWay);

    if (!this._ensure()) { this.stats.us += now() - t0; return res; }
    this._applyMask(opts, this._maskSolid);

    const bvh = this.bvh;
    let px = from.x, py = from.y, pz = from.z;
    let rx = to.x - from.x, ry = to.y - from.y, rz = to.z - from.z;
    const totalLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    this._nrmCount = 0;

    let firstTri = -1, firstDist = totalLen, firstNx = 0, firstNy = 1, firstNz = 0;
    let blocked = false;

    for (let iter = 0; iter < TUNE.maxSlides; iter++) {
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (len < TUNE.minSweep) break;

      const t = bvh.sweepCapsule(
        px, py + loY, pz, px, py + hiY, pz, rx, ry, rz, r,
        allowOneWay, TUNE.faceSnapCos, TUNE.skin + 0.01
      );

      if (t < 0) {
        px += rx; py += ry; pz += rz;
        rx = ry = rz = 0;
        break;
      }

      const dirX = rx / len, dirY = ry / len, dirZ = rz / len;
      const advance = Math.max(0, t * len - TUNE.skin);
      px += dirX * advance; py += dirY * advance; pz += dirZ * advance;

      const nx = bvh.hitNx, ny = bvh.hitNy, nz = bvh.hitNz;
      const dup = this._isDupNormal(nx, ny, nz);

      if (!blocked) {
        blocked = true;
        firstTri = bvh.hitTri;
        firstNx = nx; firstNy = ny; firstNz = nz;
        // Distance along the *original* direction, which is what MOVEMENT wants for
        // "how far did I actually get".
        firstDist = totalLen > 1e-9
          ? ((px - from.x) * (to.x - from.x) + (py - from.y) * (to.y - from.y) + (pz - from.z) * (to.z - from.z)) / totalLen
          : 0;
        res.toi = totalLen > 1e-9 ? clamp01(firstDist / totalLen) : 0;
      } else {
        res.slid = true;
      }

      // Slid into the same plane twice and got nowhere: we are wedged, stop burning iterations.
      if (dup && advance < 1e-5) break;

      let leftover = len - advance;
      if (leftover < TUNE.minSweep) { rx = ry = rz = 0; break; }

      // Clip the remaining motion into the contact plane. Pure projection, so the tangential
      // component is preserved exactly — a wall must not slow a run along it.
      let vx = dirX * leftover, vy = dirY * leftover, vz = dirZ * leftover;
      let d = vx * nx + vy * ny + vz * nz;
      vx -= nx * d; vy -= ny * d; vz -= nz * d;

      // Two-plane crease: if the clipped motion now digs into a plane we already resolved,
      // travel along the crease instead of alternating between them (Quake's ClipVelocity).
      for (let k = 0; k < this._nrmCount; k++) {
        const mx = this._nrmBuf[k * 3], my = this._nrmBuf[k * 3 + 1], mz = this._nrmBuf[k * 3 + 2];
        if (vx * mx + vy * my + vz * mz >= -1e-6) continue;
        let cx = ny * mz - nz * my, cy = nz * mx - nx * mz, cz = nx * my - ny * mx;
        const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (cl < 1e-6) { vx = vy = vz = 0; break; }
        cx /= cl; cy /= cl; cz /= cl;
        const s = vx * cx + vy * cy + vz * cz;
        vx = cx * s; vy = cy * s; vz = cz * s;
      }

      if (!dup) this._pushNormal(nx, ny, nz);
      rx = vx; ry = vy; rz = vz;
    }

    /* Push out of anything we are still inside: numerical drift, a start position already
       overlapping, or geometry that moved under us. */
    this._depenetrate(px, py, pz, loY, hiY, r, allowOneWay);
    px = this._dpx; py = this._dpy; pz = this._dpz;

    if (this._dpMoved > 1e-5) {
      if (!blocked) {
        blocked = true;
        firstTri = this._dpTri;
        firstNx = this._dpNx; firstNy = this._dpNy; firstNz = this._dpNz;
        firstDist = totalLen;
        res.toi = 1;
      }
      if (!this._isDupNormal(this._dpNx, this._dpNy, this._dpNz)) {
        this._pushNormal(this._dpNx, this._dpNy, this._dpNz);
      }
    }

    res.position.set(px, py, pz);
    res.hit = blocked;
    res.distance = blocked ? Math.max(0, firstDist) : totalLen;
    if (blocked) {
      res.normal.set(firstNx, firstNy, firstNz);
      this._fillTriInfo(res, firstTri);
    } else {
      res.normal.set(0, 1, 0);
      res.toi = 1;
    }
    res.contacts = this._nrmCount;
    for (let k = 0; k < this._nrmCount; k++) {
      res.normals[k].set(this._nrmBuf[k * 3], this._nrmBuf[k * 3 + 1], this._nrmBuf[k * 3 + 2]);
    }
    res.normals.length = TUNE.maxSlides;

    this.stats.sweeps++;
    this.stats.us += now() - t0;
    return res;
  }

  _isDupNormal(nx, ny, nz) {
    for (let k = 0; k < this._nrmCount; k++) {
      if (this._nrmBuf[k * 3] * nx + this._nrmBuf[k * 3 + 1] * ny + this._nrmBuf[k * 3 + 2] * nz
        > TUNE.normalDedupeCos) return true;
    }
    return false;
  }

  _pushNormal(nx, ny, nz) {
    if (this._nrmCount >= TUNE.maxSlides) return;
    const k = this._nrmCount++ * 3;
    this._nrmBuf[k] = nx; this._nrmBuf[k + 1] = ny; this._nrmBuf[k + 2] = nz;
  }

  /**
   * Iterative push-out. One candidate gather (inflated by TUNE.depenPad) serves every
   * iteration; each iteration resolves the single deepest overlap completely, which converges
   * on a corner instead of oscillating between its two walls.
   */
  _depenetrate(px, py, pz, loY, hiY, r, allowOneWay) {
    this._dpx = px; this._dpy = py; this._dpz = pz;
    this._dpMoved = 0; this._dpTri = -1;
    const bvh = this.bvh;
    const rad = r + TUNE.skin;
    const pad = rad + TUNE.depenPad;

    let cand = bvh.overlapBox(px - pad, py + loY - pad, pz - pad, px + pad, py + hiY + pad, pz + pad);
    if (cand === 0) return;
    if (bvh.candOverflow) this._warn('collision: depenetration candidate buffer overflowed');

    for (let it = 0; it < TUNE.depenIters; it++) {
      const pen = bvh.deepestContact(
        this._dpx, this._dpy + loY, this._dpz, this._dpx, this._dpy + hiY, this._dpz,
        rad, allowOneWay, TUNE.faceSnapCos, cand
      );
      if (!(pen > 1e-5)) break;
      this._dpx += bvh.hitNx * pen;
      this._dpy += bvh.hitNy * pen;
      this._dpz += bvh.hitNz * pen;
      if (this._dpTri < 0 || it === 0) {
        this._dpTri = bvh.hitTri;
        this._dpNx = bvh.hitNx; this._dpNy = bvh.hitNy; this._dpNz = bvh.hitNz;
      }
      this._dpMoved += pen;
      // Wandered outside the gathered box — refresh it rather than resolve against stale data.
      if (this._dpMoved > TUNE.depenPad * 0.5) {
        const qx = this._dpx, qy = this._dpy, qz = this._dpz;
        cand = bvh.overlapBox(qx - pad, qy + loY - pad, qz - pad, qx + pad, qy + hiY + pad, qz + pad);
        if (cand === 0) break;
      }
    }
  }

  /* ===================================================================== */
  /* §4.6 groundCheck                                                       */
  /* ===================================================================== */

  /**
   * Downward probe. `pos` is the feet position; the probe is the capsule's bottom sphere,
   * so the reported slope is the one the character actually rests on — a 49° ramp comes back
   * walkable and a 51° one does not.
   *
   * → { hit, y, normal, slope, tag, material, rec, distance, walkable, oneWay, climbable }
   */
  groundCheck(pos, radius, maxDist, out) {
    const t0 = now();
    const res = out && out.normal ? out : this._pools.ground.next();
    resetGround(res);

    const r = Math.max(0.02, radius || 0.35);
    const md = maxDist > 0 ? maxDist : 0.6;
    const lift = TUNE.groundLift;
    const cy = pos.y + r + lift;
    const span = md + lift;

    let found = false, isTerrain = false;

    if (this._ensure()) {
      this._applyMask(null, this._maskSolid);
      const bvh = this.bvh;
      const t = bvh.sweepCapsule(pos.x, cy, pos.z, pos.x, cy, pos.z, 0, -span, 0, r,
        true, TUNE.faceSnapCos, 0.02);
      if (t >= 0) {
        const centerY = cy - span * t;
        res.y = centerY - r;
        res.normal.set(bvh.hitNx, bvh.hitNy, bvh.hitNz);
        this._fillTriInfo(res, bvh.hitTri);
        found = true;
        isTerrain = !!(res.rec && (res.rec._flags & FLAG_ANALYTIC));
      }
    }

    /* TERRAIN's collision proxy is a 4 m grid; its analytic heightAt/normalAt is the real
       surface. Refine against it when the sand won, and fall back to it when the coarse
       proxy chorded away below a crest and the BVH found nothing at all. */
    const terrain = this.engine?.get?.('terrain');
    if (terrain?.heightAt) {
      let th = NaN;
      try { th = terrain.heightAt(pos.x, pos.z); } catch { th = NaN; }
      if (Number.isFinite(th) && th <= pos.y + lift + 1e-3) {
        if (isTerrain) {
          res.y = th;
          try { terrain.normalAt(pos.x, pos.z, res.normal); } catch { /* keep BVH normal */ }
        } else if (!found && pos.y - th <= md) {
          res.y = th;
          res.normal.set(0, 1, 0);
          try { terrain.normalAt(pos.x, pos.z, res.normal); } catch { /* flat is fine */ }
          res.tag = 'ground'; res.material = 'sand';
          res.rec = this._terrainRec();
          found = true;
        }
      }
    }

    if (found) {
      res.hit = true;
      res.distance = pos.y - res.y;
      if (res.normal.lengthSq() < 1e-9) res.normal.set(0, 1, 0);
      res.slope = Math.acos(clamp(res.normal.y, -1, 1));
      res.walkable = res.slope <= this.SLOPE.walkable;
      res.oneWay = !!(res.rec?.oneWay);
      res.climbable = !!(res.rec?.climbable);
      // A probe that only found ground above the feet is not support.
      if (res.distance < -lift - 1e-3) { res.hit = false; }
    }

    this.stats.grounds++;
    this.stats.us += now() - t0;
    return res;
  }

  _terrainRec() {
    if (this._tRec !== undefined) return this._tRec;
    this._tRec = this.recs.find((r) => r._flags & FLAG_ANALYTIC) || null;
    return this._tRec;
  }

  /* ===================================================================== */
  /* §4.6 raycast                                                           */
  /* ===================================================================== */

  /** → { hit, point, normal, distance, tag, material, rec }. `dir` need not be normalised. */
  raycast(origin, dir, maxDist, opts, out) {
    const t0 = now();
    const res = out && out.point ? out : this._pools.ray.next();
    resetRay(res);
    const md = maxDist > 0 ? maxDist : 100;

    const l = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    if (l < 1e-9 || !this._ensure()) { this.stats.us += now() - t0; return res; }
    const dx = dir.x / l, dy = dir.y / l, dz = dir.z / l;

    this._applyMask(opts, this._maskSolid);
    const bvh = this.bvh;
    const t = bvh.raycast(origin.x, origin.y, origin.z, dx, dy, dz, md,
      !(opts?.skipOneWay), !(opts?.frontOnly));

    if (t >= 0) {
      res.hit = true;
      res.distance = t;
      res.point.set(origin.x + dx * t, origin.y + dy * t, origin.z + dz * t);
      res.normal.set(bvh.hitNx, bvh.hitNy, bvh.hitNz);
      this._fillTriInfo(res, bvh.hitTri);
    }
    this.stats.rays++;
    this.stats.us += now() - t0;
    return res;
  }

  /* ===================================================================== */
  /* §4.6 overlap                                                           */
  /* ===================================================================== */

  /**
   * Which colliders touch a sphere. Volume tags (vent / hazard / water) are tested as boxes,
   * not as triangles — inside a 1.35 m crawl vent no wall triangle is within the capsule
   * radius of the centre, so a triangle-only test would report nothing.
   *
   * → rec[] (pooled array — read it now, don't retain it)
   */
  overlap(pos, radius, tags) {
    const t0 = now();
    const out = this._overlapOut;
    out.length = 0;
    if (!this._ensure()) { this.stats.us += now() - t0; return out; }

    const r = Math.max(0.01, radius || 0.35);
    const mask = this._applyMask(tags ? { onlyTags: tags } : null, this._maskAll);
    const gen = ++this._gen;

    for (let i = 0; i < this._volumes.length; i++) {
      const rec = this._volumes[i];
      if (!mask[rec._tagId]) continue;
      if (this._volumeDistance(rec, pos) <= r) { rec._stamp = gen; out.push(rec); }
    }

    const bvh = this.bvh;
    const n = bvh.overlapBox(pos.x - r, pos.y - r, pos.z - r, pos.x + r, pos.y + r, pos.z + r);
    const P = bvh.pos, NR = bvh.nrm;
    for (let ci = 0; ci < n; ci++) {
      const i = bvh._cand[ci];
      const rec = this.recs[bvh.rec[i]];
      if (!rec || rec._stamp === gen) continue;
      const p = i * 9, q = i * 3;
      const d2 = closestSegTriangle(pos.x, pos.y, pos.z, pos.x, pos.y, pos.z,
        P[p], P[p + 1], P[p + 2], P[p + 3], P[p + 4], P[p + 5], P[p + 6], P[p + 7], P[p + 8],
        NR[q], NR[q + 1], NR[q + 2]);
      if (d2 <= r * r) { rec._stamp = gen; out.push(rec); }
    }

    this.stats.overlaps++;
    this.stats.us += now() - t0;
    return out;
  }

  /** Distance from a point to a rec's oriented box (0 when inside). */
  _volumeDistance(rec, pos) {
    if (!rec._inv) return Infinity;
    _v1.copy(pos).applyMatrix4(rec._inv);
    const b = rec._local;
    const cx = clamp(_v1.x, b.min.x, b.max.x);
    const cy = clamp(_v1.y, b.min.y, b.max.y);
    const cz = clamp(_v1.z, b.min.z, b.max.z);
    if (cx === _v1.x && cy === _v1.y && cz === _v1.z) return 0;
    _v2.set(cx, cy, cz).applyMatrix4(rec.mesh.matrixWorld);
    return _v2.distanceTo(pos);
  }

  /* ===================================================================== */
  /* §4.6 nearest / query — the moveset's discovery mechanism               */
  /* ===================================================================== */

  /**
   * Nearest traversal affordance of a tag.
   *  · rail / pole → closest point on the spline, with its parameter `t` and `tangent`
   *  · hook / spire → userData.point
   *  · anything else → closest point on the collider's box (ledges resolve to their top face,
   *    which is the line you actually grab)
   *
   * `opts.facing` + `opts.maxAngle` bias the choice toward what is in front of the player.
   * The bias is a weight, never a filter: a hard cone cutoff reads as the game ignoring you.
   *
   * → { rec, point, t, tangent, distance, arc } | null
   */
  nearest(pos, tag, maxDist, opts, out) {
    const t0 = now();
    if (!this._ensure()) { this.stats.us += now() - t0; return null; }
    const tagId = TAG_ID[tag];
    if (tagId === undefined) { this._warn(`collision.nearest: unknown tag "${tag}"`); return null; }

    const md = maxDist > 0 ? maxDist : 12;
    const n = this._gatherCells(pos, md);
    if (n === 0) { this.stats.nearests++; this.stats.us += now() - t0; return null; }

    const facing = opts?.facing || null;
    const maxAngle = opts?.maxAngle || Math.PI / 2;
    const ignore = opts?.ignoreRec || null;
    const minDist = opts?.minDist || 0;

    let bestScore = Infinity, bestIdx = -1, bestDist = 0, bestT = 0, bestArc = 0;
    let bx = 0, by = 0, bz = 0, tx = 0, ty = 1, tz = 0;

    for (let k = 0; k < n; k++) {
      const e = this._aff[this._cList[k]];
      if (!e || e.tagId !== tagId || e.rec === ignore) continue;
      this._evalAffordance(e, pos);
      const d = _aDist;
      if (d > md || d < minDist) continue;
      const score = d * this._facingPenalty(_aX - pos.x, _aY - pos.y, _aZ - pos.z, d, facing, maxAngle);
      if (score >= bestScore) continue;
      bestScore = score; bestIdx = this._cList[k]; bestDist = d;
      bestT = _aT; bestArc = _aArc;
      bx = _aX; by = _aY; bz = _aZ;
      tx = _aTx; ty = _aTy; tz = _aTz;
    }

    this.stats.nearests++;
    this.stats.us += now() - t0;
    if (bestIdx < 0) return null;

    const res = out && out.point ? out : this._pools.near.next();
    const e = this._aff[bestIdx];
    res.rec = e.rec;
    res.point.set(bx, by, bz);
    res.tangent.set(tx, ty, tz);
    res.t = bestT;
    res.arc = bestArc;
    res.distance = bestDist;
    res.tag = e.rec.tag;
    res.material = e.rec.material;
    res.spline = e.curve || null;
    res.length = e.len || 0;
    res.kind = AFF_KIND[e.type] || 'box';
    return res;
  }

  /**
   * § 4.6 query — everything of a tag within radius, near→far. Pooled; don't retain.
   *
   * → [{ rec, point, tangent, t, distance, tag, spline, length }, …]
   *
   * `spline` and `length` are the same two fields `nearest()` returns and they carry the same
   * meaning: the affordance's own curve (null for a box or a point) and its arc length in
   * metres (0 for a box or a point). Two affordances of the same class answering the same
   * question in two different shapes is the defect; `nearest()` has published both since it was
   * written and `query()` published neither, so a consumer that switched from one to the other
   * silently lost the route's extent.
   *
   * ONE ARGUMENT FOR THIS WAS CHECKED AND IS FALSE, and it is recorded because it was nearly
   * written into the code as fact: `hit.rec.mesh.userData.spline` — the reach `src/player/
   * CameraRig.js:888` makes today behind a `typeof getPoint === 'function'` guard — is NOT
   * missing on poles whose curve was synthesised rather than authored. `_buildAffordances`
   * writes the synthesised curve straight back to `ud.spline`, so after `build()` all 23
   * rail/pole recs in the shipped level carry it and the fallback resolves on every one of
   * them. Measured, not assumed.
   *
   * What survives is narrower and still worth the two fields:
   *   · `length` is NOT reachable that way at all. From `userData.spline` you get a curve, and
   *     turning it into metres means calling `curve.getLength()`, which builds and caches a
   *     200-segment length table on first call. COLLISION resolved that in `_addSplineEntry`
   *     and has been sitting on it as `e.len` ever since.
   *   · the fallback works only because of an internal side effect of this class. It is an
   *     authoring field on a mesh, backfilled during `build()`, inside a `try` that shrugs off
   *     a frozen `userData` — so "the reach resolves" is a property of when you ask, not a
   *     contract. The result shape is a contract.
   *
   * `kind` is `'point' | 'spline' | 'box'` — **which of `_buildAffordances`' three routes this
   * hit resolved through**, which is a different question from its tag and the only one that
   * answers "does this point stay put, or is it the nearest bit of a box that tracks the
   * player". `src/fx/Particles.js:pinnedAffordance` has to ask exactly that, and its spline half
   * already prefers this class's result field over `userData.spline` for the reason given there.
   *
   * I WROTE A SHARPER JUSTIFICATION THAN THE CODE SUPPORTS AND IT WAS WRONG. The claim here was
   * that the guard's point half is a false positive waiting to happen — that a `wall`/`ledge`/
   * `ground` rec carrying a `userData.point` would pass it and still resolve AFF_BOX, because
   * the classification is `isPoint = tag === 'hook' || tag === 'spire'`. **It is not.** Line 909
   * reads `ud.point` for *every* rec whatever its tag; `isPoint` only decides whether a point is
   * DERIVED from bounds when userData has none. So a wall with an authored point really does
   * resolve AFF_POINT, and the guard is right. Measured after authoring exactly that case — 583
   * query hits over six stations on the shipped level, `pinnedAffordance` against this field:
   * **0 disagreements**, including the 4 hits on the one `wall` rec that now carries a point.
   *
   * What survives is narrower, and is the same argument the spline half already won: the guard
   * currently *re-derives* the classification by reading the two authoring fields this method
   * reads, so it agrees because it mirrors the logic rather than because it is told. A mirror
   * diverges silently the day the original changes — and "someone gates the point branch on
   * `isPoint`" is a plausible change, since that is what I assumed it already did. `kind` is the
   * answer from the affordance itself and cannot disagree with it.
   *
   * ── HOW A CONSUMER SHOULD USE IT (this is the whole recommendation) ──────────────────────
   * **Prefer `kind`, and KEEP the existing derivation as the fallback** — precisely the shape
   * `pinnedAffordance`'s spline half already has, and for the reason written there: a result
   * field that is absent on an older `query()` must not be read as "box", or the guard fails
   * closed on every rail in the level the day the two modules are out of step. So:
   *
   *     const kind = e.kind || null;
   *     if (kind) return kind !== 'box';
   *     …existing userData derivation, unchanged…
   *
   * Not `e.kind !== 'box'` on its own. `kind` is `''` on a slot from a build that predates this
   * field, and `'' !== 'box'` is **true** — which would turn every box hit in the level into a
   * sparkle, the exact smearing defect the guard exists to prevent, and it would do it silently.
   * The empty string is deliberate rather than `null` for that reason: it is falsy, so the
   * guard-clause form above is the natural thing to write and the dangerous form has to be
   * chosen on purpose.
   *
   * WORLD does not need this to change. The guard as it stands is correct on this level and
   * measured so; this is a hardening against skew, not a bug report.
   *
   * Cost is one reference copy, one number and one interned string per hit — `e.curve`, `e.len`
   * and `e.type` are already resolved on the affordance entry, so nothing new is computed.
   */
  query(pos, radius, tags) {
    const t0 = now();
    const out = this._queryOut;
    out.length = 0;
    if (!this._ensure()) { this.stats.us += now() - t0; return out; }

    const md = radius > 0 ? radius : 12;
    const mask = this._maskTmp;
    mask.fill(0);
    if (!tags) mask.fill(1);
    else if (typeof tags === 'string') { const id = TAG_ID[tags]; if (id !== undefined) mask[id] = 1; }
    else for (let i = 0; i < tags.length; i++) { const id = TAG_ID[tags[i]]; if (id !== undefined) mask[id] = 1; }

    const n = this._gatherCells(pos, md);
    for (let k = 0; k < n; k++) {
      const e = this._aff[this._cList[k]];
      if (!e || !mask[e.tagId]) continue;
      this._evalAffordance(e, pos);
      if (_aDist > md) continue;
      const slot = out.length < this._queryPool.length
        ? this._queryPool[out.length]
        : (this._queryPool[out.length] = {
          rec: null, point: new THREE.Vector3(), tangent: new THREE.Vector3(),
          t: 0, distance: 0, tag: '', spline: null, length: 0, kind: '',
        });
      slot.rec = e.rec;
      slot.point.set(_aX, _aY, _aZ);
      slot.tangent.set(_aTx, _aTy, _aTz);
      slot.t = _aT;
      slot.distance = _aDist;
      slot.tag = e.rec.tag;
      slot.spline = e.curve || null;
      slot.length = e.len || 0;
      slot.kind = AFF_KIND[e.type] || 'box';
      out.push(slot);
    }
    out.sort(byDistance);
    this.stats.queries++;
    this.stats.us += now() - t0;
    return out;
  }

  /**
   * Distance/angle blend. 1.0 dead ahead, ~2.3 at the cone edge, growing beyond it — so a
   * ring behind Sly can still be chosen when it is the only one in reach, but never wins
   * over the one he is flying toward.
   */
  _facingPenalty(dx, dy, dz, dist, facing, maxAngle) {
    if (!facing) return 1;
    let ang;
    const fh = Math.sqrt(facing.x * facing.x + facing.z * facing.z);
    if (fh > 0.35) {
      // A horizontal facing vector must not penalise a hook that is simply overhead.
      const dh = Math.sqrt(dx * dx + dz * dz);
      if (dh < 1e-4) return 1;
      ang = Math.acos(clamp((dx * facing.x + dz * facing.z) / (dh * fh), -1, 1));
    } else {
      const fl = Math.sqrt(facing.x * facing.x + facing.y * facing.y + facing.z * facing.z) || 1;
      ang = Math.acos(clamp((dx * facing.x + dy * facing.y + dz * facing.z) / (Math.max(dist, 1e-4) * fl), -1, 1));
    }
    const k = ang / (maxAngle > 1e-3 ? maxAngle : Math.PI / 2);
    let pen = 1 + TUNE.facingBias * k * k;
    if (k > 1) pen *= 1 + TUNE.behindPenalty * (k - 1);
    return pen;
  }

  /* ===================================================================== */
  /* affordance hash                                                        */
  /* ===================================================================== */

  _buildAffordances() {
    this._aff.length = 0;
    this._hash.clear();
    this._volumes.length = 0;
    this._tRec = undefined;

    for (const rec of this.recs) {
      const mesh = rec.mesh;
      if (!mesh) continue;
      const ud = mesh.userData || {};

      /* World box for every rec: used by the box affordance and the volume test. */
      let world = null;
      try {
        if (!mesh.geometry?.boundingBox) mesh.geometry?.computeBoundingBox?.();
        if (mesh.geometry?.boundingBox) {
          rec._local = mesh.geometry.boundingBox.clone();
          rec._inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
          world = rec._local.clone().applyMatrix4(mesh.matrixWorld);
        } else {
          world = new THREE.Box3().setFromObject(mesh);
          rec._local = null; rec._inv = null;
        }
      } catch {
        rec._local = null; rec._inv = null;
      }
      rec._world = world;
      rec._stamp = 0;

      if (rec.tag === 'vent' || rec.tag === 'hazard' || rec.tag === 'water') this._volumes.push(rec);

      const isLine = rec.tag === 'rail' || rec.tag === 'pole';
      const isPoint = rec.tag === 'hook' || rec.tag === 'spire';

      let curve = ud.spline && typeof ud.spline.getPoint === 'function' ? ud.spline : null;
      if (isLine && !curve) {
        curve = this._synthCurve(rec, ud, world);
        if (curve) {
          // Two synth branches, only one is worth a warning. From authored top/bottom the
          // synthesised vertical is affine-exact — identical to an authored 2-point spline —
          // so it is silent. From bounds the spline is a guess (and for an InstancedMesh the
          // bounds ignore instances entirely), so that branch stays loud.
          if (!(Number.isFinite(ud.top) && Number.isFinite(ud.bottom))) {
            this._warn(`collision: ${rec.tag} "${mesh.name || 'unnamed'}" has no userData.spline — synthesised one from its world bounds, which may not match the visible geometry (instanced meshes especially)`);
          }
          try { ud.spline = curve; } catch { /* frozen userData, fine */ }
        }
      }

      if (curve) { this._addSplineEntry(rec, curve); continue; }

      let point = ud.point && ud.point.isVector3 ? ud.point : null;
      if (isPoint && !point && world) {
        // A spire's affordance is its tip, not its centroid.
        point = rec.tag === 'spire'
          ? new THREE.Vector3((world.min.x + world.max.x) / 2, world.max.y, (world.min.z + world.max.z) / 2)
          : world.getCenter(new THREE.Vector3());
        this._warn(`collision: ${rec.tag} "${mesh.name || 'unnamed'}" has no userData.point — derived one from its bounds`);
      }
      if (point) { this._addPointEntry(rec, point); continue; }

      if (world && Number.isFinite(world.min.x)) this._addBoxEntry(rec, world);
    }

    this._stamp = new Int32Array(this._aff.length);
    if (this._cList.length < this._aff.length) this._cList = new Int32Array(this._aff.length);
  }

  /** Straight-line spline for a pole/rail proxy that never published one. */
  _synthCurve(rec, ud, world) {
    let a = null, b = null;
    if (Number.isFinite(ud.top) && Number.isFinite(ud.bottom)) {
      const p = _v1.setFromMatrixPosition(rec.mesh.matrixWorld);
      a = new THREE.Vector3(p.x, ud.bottom, p.z);
      b = new THREE.Vector3(p.x, ud.top, p.z);
    } else if (world && Number.isFinite(world.min.x)) {
      const sx = world.max.x - world.min.x, sy = world.max.y - world.min.y, sz = world.max.z - world.min.z;
      const c = world.getCenter(new THREE.Vector3());
      a = c.clone(); b = c.clone();
      if (sy >= sx && sy >= sz) { a.y = world.min.y; b.y = world.max.y; }
      else if (sx >= sz) { a.x = world.min.x; b.x = world.max.x; }
      else { a.z = world.min.z; b.z = world.max.z; }
    }
    if (!a || a.distanceToSquared(b) < 1e-6) return null;
    const mid = a.clone().lerp(b, 0.5);
    return new THREE.CatmullRomCurve3([a, mid, b], false, 'catmullrom', 0.0);
  }

  _addSplineEntry(rec, curve) {
    let len = 0;
    try { len = curve.getLength(); } catch { len = 0; }
    if (!Number.isFinite(len) || len < 1e-4) {
      this._warn(`collision: ${rec.tag} "${rec.mesh.name || 'unnamed'}" spline has zero length — skipped`);
      return;
    }
    const n = Math.max(8, Math.min(256, Math.round(len / TUNE.splineSample) + 1));
    const pts = new Float32Array(n * 3);
    const tans = new Float32Array(n * 3);
    const ts = new Float32Array(n);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      ts[i] = u;
      try { curve.getPoint(u, tmp); } catch { tmp.set(0, 0, 0); }
      if (!Number.isFinite(tmp.x + tmp.y + tmp.z)) tmp.set(0, 0, 0);
      pts[i * 3] = tmp.x; pts[i * 3 + 1] = tmp.y; pts[i * 3 + 2] = tmp.z;
    }
    // Tangents by central difference on the samples: exact enough at 0.5 m spacing and,
    // unlike Curve.getTangent(), free of per-call allocation at query time.
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3;
      let dx = pts[i1] - pts[i0], dy = pts[i1 + 1] - pts[i0 + 1], dz = pts[i1 + 2] - pts[i0 + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      tans[i * 3] = dx / l; tans[i * 3 + 1] = dy / l; tans[i * 3 + 2] = dz / l;
    }

    const idx = this._aff.length;
    this._aff.push({ type: AFF_SPLINE, rec, tagId: rec._tagId, curve, pts, tans, ts, n, len, box: null });

    const cs = TUNE.hashCell;
    let lastKey = NaN;
    for (let i = 0; i < n; i++) {
      const key = cellKey(Math.floor(pts[i * 3] / cs), Math.floor(pts[i * 3 + 1] / cs), Math.floor(pts[i * 3 + 2] / cs));
      if (key !== lastKey) { this._hashPush(key, idx); lastKey = key; }
    }
    // Neighbour cells too: the closest point on a rail can be well outside the cell the
    // query point sits in when the rail only clips its corner.
    this._hashSpread(idx, pts, n);
  }

  _addPointEntry(rec, point) {
    const idx = this._aff.length;
    this._aff.push({
      type: AFF_POINT, rec, tagId: rec._tagId, curve: null,
      x: point.x, y: point.y, z: point.z, box: null, len: 0,
    });
    const cs = TUNE.hashCell;
    this._hashPush(cellKey(Math.floor(point.x / cs), Math.floor(point.y / cs), Math.floor(point.z / cs)), idx);
  }

  _addBoxEntry(rec, world) {
    const idx = this._aff.length;
    this._aff.push({ type: AFF_BOX, rec, tagId: rec._tagId, curve: null, box: world, len: 0 });
    const cs = TUNE.hashCell;
    const x0 = Math.floor(world.min.x / cs), x1 = Math.floor(world.max.x / cs);
    const y0 = Math.floor(world.min.y / cs), y1 = Math.floor(world.max.y / cs);
    const z0 = Math.floor(world.min.z / cs), z1 = Math.floor(world.max.z / cs);
    const cells = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (cells > 4096) return;    // absurdly large collider: leave it to the linear fallback
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) this._hashPush(cellKey(x, y, z), idx);
  }

  _hashSpread(idx, pts, n) {
    const cs = TUNE.hashCell;
    const step = Math.max(1, Math.floor(n / 24));
    for (let i = 0; i < n; i += step) {
      const cx = Math.floor(pts[i * 3] / cs), cy = Math.floor(pts[i * 3 + 1] / cs), cz = Math.floor(pts[i * 3 + 2] / cs);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) this._hashPush(cellKey(cx + dx, cy + dy, cz + dz), idx);
    }
  }

  _hashPush(key, idx) {
    let list = this._hash.get(key);
    if (!list) { list = []; this._hash.set(key, list); }
    if (list[list.length - 1] !== idx) list.push(idx);
  }

  /** Deduped affordance indices within `r` of `pos`, into this._cList. Returns the count. */
  _gatherCells(pos, r) {
    const total = this._aff.length;
    if (total === 0) return 0;
    if (this._cList.length < total) this._cList = new Int32Array(total);

    const cs = TUNE.hashCell;
    const x0 = Math.floor((pos.x - r) / cs), x1 = Math.floor((pos.x + r) / cs);
    const y0 = Math.floor((pos.y - r) / cs), y1 = Math.floor((pos.y + r) / cs);
    const z0 = Math.floor((pos.z - r) / cs), z1 = Math.floor((pos.z + r) / cs);
    const cells = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);

    let count = 0;
    if (cells > 900 || cells >= total) {
      // Cheaper to look at every affordance than to walk that many buckets.
      for (let i = 0; i < total; i++) this._cList[count++] = i;
      return count;
    }

    const gen = ++this._gen;
    const stamp = this._stamp;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const list = this._hash.get(cellKey(x, y, z));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (stamp[e] === gen) continue;
            stamp[e] = gen;
            this._cList[count++] = e;
          }
        }
      }
    }
    return count;
  }

  /** Exact closest point / parameter / tangent for one affordance. Writes the _a* scalars. */
  _evalAffordance(e, pos) {
    if (e.type === AFF_POINT) {
      _aX = e.x; _aY = e.y; _aZ = e.z;
      _aT = 0; _aArc = 0;
      _aTx = 0; _aTy = 1; _aTz = 0;
      const dx = _aX - pos.x, dy = _aY - pos.y, dz = _aZ - pos.z;
      _aDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return;
    }
    if (e.type === AFF_SPLINE) {
      closestOnPolyline(e, pos.x, pos.y, pos.z);
      return;
    }
    const b = e.box;
    // For a ledge the useful point is on its walking surface, not buried in the middle.
    const wantTop = e.rec.tag === 'ledge';
    _aX = clamp(pos.x, b.min.x, b.max.x);
    _aY = wantTop ? b.max.y : clamp(pos.y, b.min.y, b.max.y);
    _aZ = clamp(pos.z, b.min.z, b.max.z);
    _aT = 0; _aArc = 0;
    _aTx = 0; _aTy = 1; _aTz = 0;
    const dx = _aX - pos.x, dy = _aY - pos.y, dz = _aZ - pos.z;
    _aDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* ===================================================================== */
  /* helpers                                                                */
  /* ===================================================================== */

  _applyMask(opts, dflt) {
    const A = this.bvh.tagAllow;
    A.set(dflt);
    if (opts) {
      const only = opts.onlyTags;
      if (only && only.length) {
        A.fill(0);
        for (let i = 0; i < only.length; i++) {
          const id = TAG_ID[only[i]];
          if (id !== undefined) A[id] = 1;
          else this._warn(`collision: unknown tag "${only[i]}" in onlyTags`);
        }
      }
      const ig = opts.ignoreTags;
      if (ig && ig.length) {
        for (let i = 0; i < ig.length; i++) {
          const id = TAG_ID[ig[i]];
          if (id !== undefined) A[id] = 0;
        }
      }
    }
    return A;
  }

  _fillTriInfo(res, tri) {
    if (tri < 0 || !this.bvh.rec) { res.rec = null; return; }
    const rec = this.recs[this.bvh.rec[tri]] || null;
    res.rec = rec;
    res.tag = TAG_NAMES[this.bvh.tag[tri]] || 'ground';
    res.material = MAT_NAMES[this.bvh.mat[tri]] || 'stone';
  }

  /* ===================================================================== */
  /* debug visualisation — F3                                              */
  /* ===================================================================== */

  _showColliders(on) {
    if (on && !this._debugBuilt) this._buildDebug();
    this.debugRoot.visible = on;
  }

  /**
   * One merged LineSegments per tag, colour-coded (§ the tag table): ground green, wall red,
   * ledge cyan, rail yellow, pole magenta, hook orange, spire white, vent blue, hazard
   * crimson. Built on first toggle so it costs nothing until asked for.
   */
  _buildDebug() {
    this._debugBuilt = true;
    const bvh = this.bvh;
    if (!bvh.triCount) return;

    const perTag = new Int32Array(TAG_NAMES.length);
    for (let i = 0; i < bvh.triCount; i++) perTag[bvh.tag[i]]++;

    // 3 edges × 2 vertices per triangle. Decimate rather than blow out memory on a big level.
    let lines = bvh.triCount * 3;
    const stride = lines > TUNE.debugMaxLines ? Math.ceil(lines / TUNE.debugMaxLines) : 1;
    if (stride > 1) {
      this._warn(`collision: debug view decimated 1:${stride} (${bvh.triCount} triangles)`);
    }

    const counts = new Int32Array(TAG_NAMES.length);
    for (let i = 0; i < bvh.triCount; i += stride) counts[bvh.tag[i]]++;

    const arrays = [];
    for (let t = 0; t < TAG_NAMES.length; t++) {
      arrays.push(counts[t] ? new Float32Array(counts[t] * 18) : null);
    }
    const fill = new Int32Array(TAG_NAMES.length);
    const P = bvh.pos, NR = bvh.nrm, off = TUNE.debugOffset;

    for (let i = 0; i < bvh.triCount; i += stride) {
      const t = bvh.tag[i];
      const arr = arrays[t];
      if (!arr) continue;
      const p = i * 9, q = i * 3;
      const nx = NR[q] * off, ny = NR[q + 1] * off, nz = NR[q + 2] * off;
      const ax = P[p] + nx, ay = P[p + 1] + ny, az = P[p + 2] + nz;
      const bx = P[p + 3] + nx, by = P[p + 4] + ny, bz = P[p + 5] + nz;
      const cx = P[p + 6] + nx, cy = P[p + 7] + ny, cz = P[p + 8] + nz;
      let o = fill[t]++ * 18;
      arr[o] = ax; arr[o + 1] = ay; arr[o + 2] = az; arr[o + 3] = bx; arr[o + 4] = by; arr[o + 5] = bz;
      arr[o + 6] = bx; arr[o + 7] = by; arr[o + 8] = bz; arr[o + 9] = cx; arr[o + 10] = cy; arr[o + 11] = cz;
      arr[o + 12] = cx; arr[o + 13] = cy; arr[o + 14] = cz; arr[o + 15] = ax; arr[o + 16] = ay; arr[o + 17] = az;
    }

    for (let t = 0; t < TAG_NAMES.length; t++) {
      if (!arrays[t]) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arrays[t], 3));
      const name = TAG_NAMES[t];
      const mat = new THREE.LineBasicMaterial({
        color: TAG_COLOR[name] ?? 0xffffff,
        transparent: true, opacity: 0.75, depthWrite: false, fog: false,
      });
      mat.name = `collision:${name}`;
      const ls = new THREE.LineSegments(geo, mat);
      ls.name = `collision:${name} (${perTag[t]} tris)`;
      ls.frustumCulled = false;
      ls.renderOrder = 9;
      this.debugRoot.add(ls);
      this._debugGeoms.push(geo);
      this._debugMats.push(mat);
    }

    this._buildDebugAffordances();
  }

  /** Splines drawn as bright polylines, points as 0.4 m crosses. This is the tagging audit. */
  _buildDebugAffordances() {
    const byTag = new Map();
    const push = (tag, ax, ay, az, bx, by, bz) => {
      let a = byTag.get(tag);
      if (!a) { a = []; byTag.set(tag, a); }
      a.push(ax, ay, az, bx, by, bz);
    };
    const C = 0.45;
    for (const e of this._aff) {
      const tag = e.rec.tag;
      if (e.type === AFF_SPLINE) {
        for (let i = 0; i < e.n - 1; i++) {
          push(tag, e.pts[i * 3], e.pts[i * 3 + 1], e.pts[i * 3 + 2],
            e.pts[i * 3 + 3], e.pts[i * 3 + 4], e.pts[i * 3 + 5]);
        }
      } else if (e.type === AFF_POINT) {
        push(tag, e.x - C, e.y, e.z, e.x + C, e.y, e.z);
        push(tag, e.x, e.y - C, e.z, e.x, e.y + C, e.z);
        push(tag, e.x, e.y, e.z - C, e.x, e.y, e.z + C);
      }
    }
    for (const [tag, verts] of byTag) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      const mat = new THREE.LineBasicMaterial({
        color: TAG_COLOR[tag] ?? 0xffffff, fog: false, depthTest: false, depthWrite: false,
      });
      mat.name = `collision:aff:${tag}`;
      const ls = new THREE.LineSegments(geo, mat);
      ls.name = `collision:affordance:${tag}`;
      ls.frustumCulled = false;
      ls.renderOrder = 10;
      this.debugRoot.add(ls);
      this._debugGeoms.push(geo);
      this._debugMats.push(mat);
    }
  }

  _disposeDebug() {
    for (const g of this._debugGeoms) g.dispose();
    for (const m of this._debugMats) m.dispose();
    this._debugGeoms.length = 0;
    this._debugMats.length = 0;
    while (this.debugRoot.children.length) this.debugRoot.remove(this.debugRoot.children[0]);
    this._debugBuilt = false;
  }
}

/* ===================================================================== */
/* result pools                                                          */
/* ===================================================================== */

function ring(n, make) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = make();
  let i = 0;
  return { next() { const o = a[i]; i = (i + 1) % n; return o; }, all: a };
}

function makeSweepResult() {
  const normals = new Array(TUNE.maxSlides);
  for (let i = 0; i < TUNE.maxSlides; i++) normals[i] = new THREE.Vector3();
  return {
    hit: false, position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
    distance: 0, toi: 1, tag: '', material: '', rec: null,
    slid: false, contacts: 0, normals,
  };
}
function resetSweep(r) {
  r.hit = false; r.distance = 0; r.toi = 1; r.tag = ''; r.material = '';
  r.rec = null; r.slid = false; r.contacts = 0;
  r.normal.set(0, 1, 0);
}

function makeGroundResult() {
  return {
    hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0,
    tag: '', material: '', rec: null, distance: Infinity,
    walkable: false, oneWay: false, climbable: false,
  };
}
function resetGround(r) {
  r.hit = false; r.y = -Infinity; r.slope = 0; r.tag = ''; r.material = '';
  r.rec = null; r.distance = Infinity; r.walkable = false; r.oneWay = false; r.climbable = false;
  r.normal.set(0, 1, 0);
}

function makeRayResult() {
  return {
    hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
    distance: Infinity, tag: '', material: '', rec: null,
  };
}
function resetRay(r) {
  r.hit = false; r.distance = Infinity; r.tag = ''; r.material = ''; r.rec = null;
  r.point.set(0, 0, 0); r.normal.set(0, 1, 0);
}

function makeNearResult() {
  return {
    rec: null, point: new THREE.Vector3(), tangent: new THREE.Vector3(0, 1, 0),
    t: 0, arc: 0, distance: 0, tag: '', material: '', spline: null, length: 0, kind: '',
  };
}

/* ===================================================================== */
/* affordance evaluation scratch                                         */
/* ===================================================================== */

let _aX = 0, _aY = 0, _aZ = 0, _aT = 0, _aArc = 0, _aDist = 0;
let _aTx = 0, _aTy = 1, _aTz = 0;

/** Closest point on a sampled spline, with the curve parameter and tangent there. */
function closestOnPolyline(e, px, py, pz) {
  const pts = e.pts, tans = e.tans, ts = e.ts, n = e.n;
  let best = Infinity, bi = 0, bs = 0;
  for (let i = 0; i < n - 1; i++) {
    const i0 = i * 3, i1 = i0 + 3;
    const ax = pts[i0], ay = pts[i0 + 1], az = pts[i0 + 2];
    const dx = pts[i1] - ax, dy = pts[i1 + 1] - ay, dz = pts[i1 + 2] - az;
    const dd = dx * dx + dy * dy + dz * dz;
    let s = dd > 1e-12 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / dd : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const cx = ax + dx * s - px, cy = ay + dy * s - py, cz = az + dz * s - pz;
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 < best) { best = d2; bi = i; bs = s; }
  }
  const i0 = bi * 3, i1 = i0 + 3;
  _aX = pts[i0] + (pts[i1] - pts[i0]) * bs;
  _aY = pts[i0 + 1] + (pts[i1 + 1] - pts[i0 + 1]) * bs;
  _aZ = pts[i0 + 2] + (pts[i1 + 2] - pts[i0 + 2]) * bs;
  _aT = ts[bi] + (ts[bi + 1] - ts[bi]) * bs;
  _aArc = e.len * ((bi + bs) / (n - 1));
  let tx = tans[i0] + (tans[i1] - tans[i0]) * bs;
  let ty = tans[i0 + 1] + (tans[i1 + 1] - tans[i0 + 1]) * bs;
  let tz = tans[i0 + 2] + (tans[i1 + 2] - tans[i0 + 2]) * bs;
  const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
  _aTx = tx / tl; _aTy = ty / tl; _aTz = tz / tl;
  _aDist = Math.sqrt(best);
}

/* ===================================================================== */
/* misc                                                                  */
/* ===================================================================== */

function byDistance(a, b) { return a.distance - b.distance; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

/** Integer cell key. ±511 cells at 10 m covers ±5 km, far beyond the level bounds. */
function cellKey(ix, iy, iz) {
  const x = ix < -511 ? -511 : ix > 511 ? 511 : ix;
  const y = iy < -511 ? -511 : iy > 511 ? 511 : iy;
  const z = iz < -511 ? -511 : iz > 511 ? 511 : iz;
  return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
}
