/**
 * framelib.mjs — the projection and occlusion primitives a shot-staging tool needs.
 *
 * Extracted from `alertframe.mjs` when the second such tool (`impactframe.mjs`) was written,
 * for the reason this project keeps re-learning: a second copy is a second thing to keep true,
 * and the copy is always the one that goes stale. `alertframe` had `camFor`, `project`, `boxOf`,
 * `margins` and `clear` and they were all correct; `impactframe` needs the identical five, and
 * the one thing that must never happen is the two tools disagreeing about where a point lands.
 *
 * ── The frame is 1280x720, and that is not the harness's resolution ─────────────────────────
 * Captures render 900 rows. A critic reads a frame at 1280x720. Margins measured at the wrong
 * size are a different claim, so this file fixes the size and every tool inherits it.
 *
 * ── What this can and cannot see, inherited by every consumer ───────────────────────────────
 * `clear()` tests against ARCHITECTURE TRIANGLES ONLY, exactly as `tools/lvl.mjs` and
 * `charvis.mjs` warn in their own headers: props, FX, decals, sky and terrain are invisible to
 * it, and so is a character's self-occlusion. Subjects are approximated as upright boxes, not
 * skinned meshes. **A candidate these primitives like can still be a bad frame; a candidate
 * they reject cannot be a good one.** `charvis` is the tool for real silhouette visibility and
 * should be run on anything this likes.
 *
 * They also say nothing at all about light.
 */
import * as THREE from 'three';
import { execFileSync } from 'node:child_process';
import { buildLevel, trisIn, rayTri } from './lvl.mjs';

export const W = 1280, H = 720;

/** Sly is 1.8 m; a guard reads about 1.95 m in the nemes. Upright boxes, deliberately coarse. */
export const SLY = { w: 0.62, h: 1.80 };
export const GUARD = { w: 0.78, h: 1.95 };

/**
 * Provenance, for the reason `charvis.mjs` states in its own header: these tools load
 * `src/world/**`, so their numbers describe the tree at the moment they ran. A figure from one
 * without a commit beside it has been measured against a tree that may no longer exist.
 */
export const provenance = (() => {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/'], { encoding: 'utf8' })
      .split('\n').filter((l) => l.length > 3).length > 0;
    return `${sha}${dirty ? ' +dirty(src)' : ''}`;
  } catch { return 'unknown'; }
})();

/** A camera built the way `Shots.applyShot` builds one, including the roll. */
export function camFor(spec) {
  const cam = new THREE.PerspectiveCamera(spec.fov, W / H, 0.1, 600);
  cam.position.fromArray(spec.pos);
  cam.lookAt(new THREE.Vector3().fromArray(spec.target));
  if (spec.roll) cam.rotateZ(THREE.MathUtils.degToRad(spec.roll));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Project a world point to pixels. Returns null when it is behind the lens. */
export function project(cam, x, y, z) {
  const v = new THREE.Vector3(x, y, z);
  const view = v.clone().applyMatrix4(cam.matrixWorldInverse);
  if (view.z > -1e-6) return null;                 // behind the camera
  v.project(cam);
  return { px: (v.x * 0.5 + 0.5) * W, py: (1 - (v.y * 0.5 + 0.5)) * H };
}

/** Pixel box of an upright box subject standing at (x, z) on ground `y`. */
export function boxOf(cam, x, y, z, dims) {
  const pts = [];
  for (const dx of [-dims.w / 2, dims.w / 2]) {
    for (const dz of [-dims.w / 2, dims.w / 2]) {
      for (const dy of [0, dims.h]) {
        const p = project(cam, x + dx, y + dy, z + dz);
        if (!p) return null;                       // any corner behind the lens: unusable
        pts.push(p);
      }
    }
  }
  return {
    x0: Math.min(...pts.map((p) => p.px)), x1: Math.max(...pts.map((p) => p.px)),
    y0: Math.min(...pts.map((p) => p.py)), y1: Math.max(...pts.map((p) => p.py)),
  };
}

/**
 * Pixel box of a HORIZONTAL disc of radius `r` lying on the ground at (x, y, z).
 *
 * Not the same shape as `boxOf` and not substitutable for it: a ground ring is flat, so an
 * upright box would over-report its vertical extent by the box's height and under-report the
 * near/far spread that perspective gives a disc seen from a low camera. Sampled around the rim
 * rather than corner-projected, because a circle's silhouette is not its bounding square.
 *
 * ── `rim` is the samples, not a second projection ───────────────────────────────────────────
 * The returned object also carries `rim`, the `segments` projected rim points this already
 * computed, in order. `tools/fxrim.mjs` measures ink *along* the ring rather than inside its
 * box, and the one thing that must not happen is a consumer re-deriving the same circle with
 * its own loop — that is a second copy of the recipe, and the copy is the one that goes stale
 * when `discOf` changes. Existing consumers read `x0/x1/y0/y1` and are unaffected.
 */
export function discOf(cam, x, y, z, r, segments = 24) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const p = project(cam, x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    if (!p) return null;
    pts.push(p);
  }
  return {
    x0: Math.min(...pts.map((p) => p.px)), x1: Math.max(...pts.map((p) => p.px)),
    y0: Math.min(...pts.map((p) => p.py)), y1: Math.max(...pts.map((p) => p.py)),
    rim: pts,
  };
}

export const overlapArea = (a, b) => {
  if (!a || !b) return 0;
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
};

export const margins = (b) => (b ? { l: b.x0, r: W - b.x1, t: b.y0, b: H - b.y1 } : null);

/** The built architecture, shared by every tool that imports this. Built once. */
export const { A } = await buildLevel();

/**
 * Is the straight line from the lens to `p` clear of architecture?
 *
 * ── `T.t`, NOT `T` — and this was wrong for the whole life of `alertframe` ──────────────────
 * `trisIn` returns `{ t: [ax, ay, az, bx, …], name }`; `rayTri` takes the nine-number ARRAY.
 * Passed the object, `T[3]` is `undefined`, `det` is `NaN`, every `NaN < x` and `NaN > x`
 * comparison is false so no early return fires, and the function falls through to
 * `return t > 1e-6 ? t : -1` with `t = NaN` — which is **−1, on every triangle in the level.**
 *
 * So `clear()` returned `true` unconditionally. Every "clear" this tool has ever printed was
 * vacuous, including the ones on the `alert` shot's certificate. `lvl.mjs`'s own `firstHit`
 * does it correctly (`rayTri(..., tr.t)`), which is why nothing else in the project had the
 * defect.
 *
 * The shape of the bug is the one this project keeps meeting: **a wrong call that cannot fail.**
 * There is no exception, no zero, no implausible number — the permissive answer comes back
 * looking exactly like the true one, and the only way to catch it is to point the check at
 * something that MUST be occluded and see whether it says so. `assertOccluded()` below is that
 * probe, and any consumer of `clear()` should run it once.
 */
export function clear(cam, p) {
  const o = cam.position;
  const d = new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z);
  const len = d.length();
  if (len < 1e-6) return true;
  d.multiplyScalar(1 / len);
  const box = new THREE.Box3().setFromPoints([o.clone(), new THREE.Vector3(p.x, p.y, p.z)]);
  box.expandByScalar(1.0);
  const tris = trisIn(A.root ?? A.group ?? A, box);
  for (const T of tris) {
    const t = rayTri(o.x, o.y, o.z, d.x, d.y, d.z, T.t);
    /* The 0.25 m near-cut keeps a subject's own footing slab from counting as its occluder. */
    if (t > 0.25 && t < len - 0.25) return false;
  }
  return true;
}

/**
 * Prove `clear()` can say no. Returns a one-line verdict string for a tool to print.
 *
 * A visibility check that always answers "visible" passes every frame it is pointed at, and
 * that is precisely what shipped here. So the ray is fired from a lens BURIED INSIDE the level
 * toward a point on the far side of it — geometry between them is not a matter of opinion — and
 * the check must report an occluder. Any tool whose verdicts depend on `clear()` should run
 * this at startup rather than trusting it.
 */
export function assertOccluded() {
  const cam = { position: new THREE.Vector3(0, 1.0, 40) };
  const through = { x: 0, y: 1.0, z: -40 };            // straight across the whole courtyard
  const ok = clear(cam, through) === false;
  return ok
    ? 'clear() CALIBRATED — a ray across the level reports an occluder'
    : 'clear() IS BROKEN — a ray straight through the level reports NO occluder; every '
      + '"clear" this tool prints is vacuous';
}

/**
 * EVERY architecture surface in the column over (x, z), highest first.
 *
 * A single-number ground query is the wrong shape here and this project has paid for it four
 * times: **a ground query returns the topmost surface below the cast origin, so the origin
 * selects which floor you are asking about.** Casting from y = 60 over the courtyard at
 * (0, 30) returns **18.12** — the roof — and returns it as a plausible number with no error,
 * while the paving the character stands on is at 0.
 *
 * So this returns the whole stack and makes the caller choose, rather than choosing for them
 * with a default nobody reads. `groundUnder` below is the convenience, and it takes the ceiling
 * as a required argument for the same reason.
 */
export function groundColumn(x, z, fromY = 200) {
  const o = new THREE.Vector3(x, fromY, z);
  const d = new THREE.Vector3(0, -1, 0);
  const box = new THREE.Box3(
    new THREE.Vector3(x - 0.5, -50, z - 0.5), new THREE.Vector3(x + 0.5, fromY, z + 0.5));
  const hits = [];
  for (const T of trisIn(A.root ?? A.group ?? A, box)) {
    const t = rayTri(o.x, o.y, o.z, d.x, d.y, d.z, T.t);   // `.t`: see `clear()`'s note
    if (t > 0) hits.push(fromY - t);
  }
  /* Coalesce coincident hits: a slab is two triangles and its top face reports twice. */
  hits.sort((a, b) => b - a);
  return hits.filter((v, i) => i === 0 || Math.abs(v - hits[i - 1]) > 1e-3);
}

/**
 * The highest architecture surface at or below `ceiling`.
 *
 * `ceiling` is REQUIRED, and that is the whole design: a caller asking "what is Sly standing
 * on" knows roughly where Sly is, and saying so is what stops the query answering about a
 * terrace three storeys up. Returns null when the column is empty below that height — which,
 * given this sees architecture only, may also mean the surface is TERRAIN.
 */
export function groundUnder(x, z, ceiling) {
  const col = groundColumn(x, z);
  for (const y of col) if (y <= ceiling) return y;
  return null;
}
