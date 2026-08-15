/**
 * PREREG-rim §1.1 / §1.2 — the REGISTERED silhouette-edge instrument and edge list.
 *
 * Sealed before any frame of `progress/records/rim1/` existed. Shared by `rim-offline.mjs`
 * (which reproduces every number in the PREREG from `shots/r12` and the shipped constants) and
 * by `rim-score.mjs` (which scores the capture). One definition, two consumers, so the seal's
 * derivation and its verdict cannot drift apart.
 *
 * ── The statistic ────────────────────────────────────────────────────────────────────────────
 * A ray is walked from deep INSIDE Sly to deep in the BACKGROUND, axis-aligned, `inner` px in
 * and `outer` px out of a registered nominal boundary.
 *
 *   i0    the INK MINIMUM: argmin L within +-SEARCH px of the nominal boundary. The inverted-hull
 *         outline is near-black and lies on every character silhouette, so it is the one landmark
 *         present whether or not a rim is. `pinned` (i0 at either end of the window) means the ink
 *         was NOT FOUND and the edge is instrument-invalid -- it is not a small failure to be
 *         averaged in, it means the walk never crossed a luminance feature at all.
 *   RIM   max L over the RIMW px immediately inside i0. Sized from the two rim terms' own
 *         contracts: PostFX's band is rimInner 1.2 -> rimOuter 4.4 px (PostFX.js:69-72) and the
 *         critic logged the surface band as "2 px cyan" (toon.glsl.js:1010).
 *   BODY  median L of the inside samples, EXCLUDING EXCL px either side of i0
 *   BG    median L of the outside samples, same exclusion
 *
 *   spike = RIM - BODY          <- THE statistic. PREREG §1.3(b): >= 20.0 L is "a rim is present",
 *   sep   = RIM - BG               a threshold that sits inside a 13.3 L empty gap in the measured
 *   dCool = (B-R)|RIM - median(B-R)|BODY     population, not one chosen for convenience.
 *
 * The medians and the exclusion zone are both load-bearing. A mean would let one blown pixel of
 * background sky set BG; without the exclusion the rim band leaks into its own BODY reference and
 * every spike is understated (measured: hero/chest-front reads +23.9 with a 7 px exclusion and
 * +28.5 with 6 px of exclusion plus a full-depth median).
 *
 * L is Rec.709 luma on the sRGB bytes scaled to 0-100. On the `raw` arm the bytes are the LINEAR
 * scene target undecoded (PREREG §7 M2 / KNOWN_ISSUES §333), so the same arithmetic there is a
 * linear-domain statistic; that is intended and is why M2's two bands are BOTH derived in linear.
 */

export const SEARCH = 6;   // px the ink minimum may sit from the registered boundary
export const RIMW = 5;     // px inside the ink centre the rim band may occupy
export const EXCL = 6;     // px each side of the ink centre excluded from BODY / BG
export const SPIKE_L = 20.0;          // PREREG §1.3(b) — sealed
export const PF_NIGHT_SEP_MAX = 8.0;  // PREREG §5 PF_NIGHT — night must still be the worst case
/**
 * PREREG §5 PF_EDGE — "the ray really crossed a silhouette", as an RGB distance between the BODY
 * and BG channel medians and NOT as a luminance difference.
 *
 * This bar was a luminance test until the scorer's own smoke run rejected `sly-profile/torso-front`
 * — the single strongest key-side edge in the whole seal, spike +30.0 — because Sly's blue costume
 * and the red wall behind him sit 1.7 L apart. A silhouette can be a pure CHROMA boundary at equal
 * luminance, and that is precisely the case a rim light exists to separate; a luminance-only
 * validity gate throws away the seal's best evidence for the reason the seal exists.
 *
 * 8.0 is half the smallest distance any of the 21 registered edges shows on r12 (16.0, at
 * `night/head-front`, where Sly is nearly invisible against his background — the worst case, and
 * still 2x this bar). Measured, not chosen.
 */
export const PF_RGBDIST_MIN = 8.0;

export const L709 = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55;
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]); };

/**
 * The 21 registered edges. `face` KEY = the outward normal points toward the key (up / left in
 * `hero` and `sly-profile`); SHADOW = away from it. `spike5` marks the five edges that spiked on
 * `shots/r12` and that PF_REPRO_KEY is measured over. `dir` is the unit step from the deepest
 * INSIDE sample toward the background. Coordinates are 1280x720 frame pixels.
 */
export const EDGES = [
  // ---- hero -----------------------------------------------------------------------------
  { shot: 'hero', id: 'cap-top',      face: 'KEY',    spike5: true,  from: [410, 206], dir: [0, -1], inner: 20, outer: 16 },
  { shot: 'hero', id: 'muzzle-front', face: 'KEY',    spike5: false, from: [400, 215], dir: [-1, 0], inner: 20, outer: 16 },
  { shot: 'hero', id: 'chest-front',  face: 'KEY',    spike5: true,  from: [403, 260], dir: [-1, 0], inner: 24, outer: 24 },
  { shot: 'hero', id: 'torso-back',   face: 'SHADOW', spike5: false, from: [399, 260], dir: [1, 0],  inner: 24, outer: 24 },
  { shot: 'hero', id: 'tail-top',     face: 'KEY',    spike5: true,  from: [505, 264], dir: [0, -1], inner: 24, outer: 20 },
  { shot: 'hero', id: 'tail-right',   face: 'SHADOW', spike5: false, from: [512, 300], dir: [1, 0],  inner: 24, outer: 20 },
  { shot: 'hero', id: 'glove-left',   face: 'KEY',    spike5: false, from: [340, 320], dir: [-1, 0], inner: 20, outer: 16 },
  { shot: 'hero', id: 'glove-right',  face: 'SHADOW', spike5: false, from: [338, 320], dir: [1, 0],  inner: 20, outer: 16 },
  // ---- sly-profile ----------------------------------------------------------------------
  { shot: 'sly-profile', id: 'cap-top',      face: 'KEY',    spike5: false, from: [665, 128], dir: [0, -1], inner: 22, outer: 16 },
  { shot: 'sly-profile', id: 'cap-front',    face: 'KEY',    spike5: false, from: [669, 125], dir: [-1, 0], inner: 25, outer: 20 },
  { shot: 'sly-profile', id: 'cap-back',     face: 'SHADOW', spike5: false, from: [676, 130], dir: [1, 0],  inner: 24, outer: 20 },
  { shot: 'sly-profile', id: 'muzzle-front', face: 'KEY',    spike5: false, from: [634, 175], dir: [-1, 0], inner: 20, outer: 20 },
  { shot: 'sly-profile', id: 'torso-front',  face: 'KEY',    spike5: true,  from: [624, 270], dir: [-1, 0], inner: 24, outer: 24 },
  { shot: 'sly-profile', id: 'torso-back',   face: 'SHADOW', spike5: false, from: [662, 270], dir: [1, 0],  inner: 24, outer: 24 },
  { shot: 'sly-profile', id: 'tail-top',     face: 'KEY',    spike5: true,  from: [790, 358], dir: [0, -1], inner: 22, outer: 16 },
  { shot: 'sly-profile', id: 'tail-right',   face: 'SHADOW', spike5: false, from: [850, 390], dir: [1, 0],  inner: 24, outer: 20 },
  // ---- night ----------------------------------------------------------------------------
  { shot: 'night', id: 'cap-top',     face: 'KEY',    spike5: false, from: [747, 412], dir: [0, -1], inner: 22, outer: 18 },
  { shot: 'night', id: 'head-front',  face: 'KEY',    spike5: false, from: [753, 404], dir: [-1, 0], inner: 15, outer: 15 },
  { shot: 'night', id: 'glove-top',   face: 'KEY',    spike5: false, from: [773, 443], dir: [0, -1], inner: 14, outer: 14 },
  { shot: 'night', id: 'glove-right', face: 'SHADOW', spike5: false, from: [768, 440], dir: [1, 0],  inner: 12, outer: 16 },
  /* PINNED on r12 and registered anyway, so its exclusion is a recorded fact rather than a
     quiet omission: the ink and the background are BOTH near black there, no minimum exists
     inside the search window, and the walk decays monotonically from L 14.7 to L 4.7. There is
     no luminance feature of any kind at that silhouette. PREREG §1.3(f). */
  { shot: 'night', id: 'torso-right', face: 'SHADOW', spike5: false, from: [748, 418], dir: [1, 0],  inner: 12, outer: 20 },
];

/** Sample the ray. Returns null if it leaves the frame. */
export function ray(im, e) {
  const [dx, dy] = e.dir, n = e.inner + e.outer, out = [];
  for (let i = 0; i <= n; i++) {
    const x = e.from[0] + dx * i, y = e.from[1] + dy * i;
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) return null;
    const o = (y * im.w + x) * im.ch;
    const R = im.data[o], G = im.data[o + 1], B = im.data[o + 2];
    out.push({ i, x, y, R, G, B, L: L709(R, G, B), cool: B - R });
  }
  return out;
}

/**
 * Profile one edge. `pinned` true => instrument-invalid, the caller must DROP it, never average
 * it in. `sample` carries the ray's own pixel indices so a CLIP gate can be measured on exactly
 * the pixels a statistic was computed from.
 */
export function profile(im, e) {
  const p = ray(im, e);
  if (!p) return null;
  const lo = Math.max(0, e.inner - SEARCH), hi = Math.min(p.length - 1, e.inner + SEARCH);
  let i0 = lo;
  for (let i = lo; i <= hi; i++) if (p[i].L < p[i0].L) i0 = i;
  const pinned = (i0 === lo || i0 === hi);

  let rim = null;
  for (let i = Math.max(0, i0 - RIMW); i <= i0 - 1; i++) if (!rim || p[i].L > rim.L) rim = p[i];

  const body = [], bg = [];
  for (let i = 0; i <= i0 - EXCL - 1; i++) body.push(p[i]);
  for (let i = i0 + EXCL + 1; i < p.length; i++) bg.push(p[i]);
  const BODY = body.length ? med(body.map((q) => q.L)) : null;
  const BG = bg.length ? med(bg.map((q) => q.L)) : null;
  const bodyCool = body.length ? med(body.map((q) => q.cool)) : null;
  const chan = (a, c) => (a.length ? med(a.map((q) => [q.R, q.G, q.B][c])) : null);
  const bodyRGB = [0, 1, 2].map((c) => chan(body, c));
  const bgRGB = [0, 1, 2].map((c) => chan(bg, c));
  const sepRGB = (body.length && bg.length)
    ? Math.hypot(bodyRGB[0] - bgRGB[0], bodyRGB[1] - bgRGB[1], bodyRGB[2] - bgRGB[2]) : null;

  return {
    edge: e, i0, i0off: i0 - e.inner, pinned, inkL: p[i0].L,
    RIM: rim ? rim.L : null, rimAt: rim ? rim.i - i0 : null,
    rimRGB: rim ? [rim.R, rim.G, rim.B] : null,
    BODY, BG, bodyRGB, bgRGB, sepRGB,
    spike: (rim && BODY !== null) ? rim.L - BODY : null,
    sep: (rim && BG !== null) ? rim.L - BG : null,
    dCool: (rim && bodyCool !== null) ? rim.cool - bodyCool : null,
    sample: p.map((q) => (q.y * im.w + q.x)),
  };
}

/** Registered r12 reference values (PREREG §1.2), for reproduction checks only. Never a bar. */
export const R12 = {
  'hero/cap-top': 27.0, 'hero/muzzle-front': -0.7, 'hero/chest-front': 28.5,
  'hero/torso-back': 1.3, 'hero/tail-top': 27.1, 'hero/tail-right': -0.6,
  'hero/glove-left': 6.2, 'hero/glove-right': 10.2,
  'sly-profile/cap-top': 6.1, 'sly-profile/cap-front': 5.5, 'sly-profile/cap-back': -6.2,
  'sly-profile/muzzle-front': -5.0, 'sly-profile/torso-front': 30.0,
  'sly-profile/torso-back': 1.1, 'sly-profile/tail-top': 28.7, 'sly-profile/tail-right': -3.4,
  'night/cap-top': 3.4, 'night/head-front': 13.7, 'night/glove-top': 0.8,
  'night/glove-right': 1.3, 'night/torso-right': null,
};
export const KEY5_MEAN_R12 = 28.27;   // PREREG §7 — mean spike over the 5 SPIKE edges on r12
