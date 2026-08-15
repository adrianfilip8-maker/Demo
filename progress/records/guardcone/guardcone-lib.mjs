/**
 * guardcone-lib.mjs — shared plumbing for guardcone-score.mjs.
 *
 * FORK of progress/records/guardpass/guardpass-lib.mjs, re-scoped to the cone-only capture
 * per PREREG-guardcone AMENDMENT A1 (§309 parks the guard mannequin; the shared guardart
 * seal is WAIVED-UNSCORED, so the two-seal plumbing has one consumer left). The pixel lens,
 * the diff, the rect machinery and the R bars are copied VERBATIM from the sealed lib — not
 * one predicate is re-derived. What changed, and only this:
 *
 *   - DIR            guardpass1/ -> guardcone1/                      (A1.3 run identity)
 *   - treeBar rows   82 -> 49                                        (A1.2, a census not a band)
 *   - rBars          restated in place instead of "shared by citation" (A1.2 — same predicate,
 *                    same [0,0] band, same fail-closed wiring; the seal it cited is waived)
 *   - parkBar        NEW (A1.2 PARK1) — the §309 parking measured, not assumed
 *   - guardart-only accessors (guardBoxes, anyGuardInFrame) dropped: no consumer.
 *
 * AMENDMENT A2 (per-shot chunking) changes exactly one more thing here, and A2.9 permits only
 * this one: **`treeBar` is replaced by `chunkTreeBar` + `chunksBar`.** V-TREE as sealed is *49
 * rows in ONE manifest, one distinct `tree.src` across them, equal to `manifest.expect.head`* —
 * a predicate about a single process. Under chunking there is no single process, so the bar has
 * no object to evaluate. A2.4 replaces it with a STRICTLY STRONGER pair, both fail-closed and
 * neither able to turn a FAIL into a PASS:
 *
 *   V_CHUNK_TREE  every one of the 16 chunk manifests records the same `srcHash`, and that hash
 *                 equals HEAD's `git archive HEAD src` hash — the tree verified at sixteen points
 *                 in time instead of two
 *   V_CHUNKS      all 16 chunks present, one per ROSTER entry, 49 rows total, `guard`
 *                 contributing 4 and every other shot 3
 *
 * The 49-row census half of V-TREE survives verbatim inside `V_CHUNKS`. The count does not move.
 *
 * One further change that is ergonomics rather than a bar, stated so it is not mistaken for one:
 * the loader now BAILS with a message instead of throwing when there is nothing to score, and
 * `DIR` accepts an override (argv/`GUARDCONE_DIR`) so it can be pointed at an archived run. A
 * scorer that crashes on the wrong input is a scorer nobody dares point at a real capture.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DIR = path.resolve(ROOT, process.argv[2] || process.env.GUARDCONE_DIR
  || 'progress/records/guardcone1');

export const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
/* A2.2's chunk shape: 15 x 3 + guard's 4 = 49. */
export const armsFor = (shot) => (shot === 'guard' ? ['off', 'bon', 'blamp', 'back'] : ['off', 'bon', 'back']);
export const EXPECT_ROWS = 49;
export const EXPECT_CHUNKS = ROSTER.length;

/**
 * Say plainly that there is nothing to score, and stop. This is NOT a VOID — a VOID needs a
 * capture to void, and "no capture" must never be reported in the same shape as "a capture that
 * failed its validity gates", or an absent run reads later as a refutation.
 */
function bail(msg, code = 3) {
  console.log(`guardcone scorer — cannot score ${path.relative(ROOT, DIR) || DIR}`);
  console.log(`  ${msg}`);
  console.log('  Nothing is claimed. This is not a VOID (a VOID needs a capture to void).');
  process.exit(code);
}
if (!existsSync(DIR)) bail('directory does not exist — no chunk of this seal has been captured yet.');
const MF = path.join(DIR, 'manifest.json');
if (!existsSync(MF)) {
  const seen = readdirSync(DIR).slice(0, 12);
  bail(`no manifest.json. Directory holds: ${seen.length ? seen.join(', ') : '(empty)'}`
    + `${seen.length === 12 ? ' …' : ''}. Each chunk rebuilds manifest.json when it finishes (A2.4).`);
}
let _m;
try { _m = JSON.parse(readFileSync(MF, 'utf8')); } catch (e) { bail(`manifest.json is not valid JSON — ${e.message}`); }
if (!Array.isArray(_m.rows)) bail(`manifest.json has no \`rows\` array (keys: ${Object.keys(_m).join(', ')}).`);
if (_m.rows.length === 0) {
  bail('manifest.json carries 0 rows — this is a launched-but-frameless run (A2\'s census found '
    + 'exactly this shape left by run 7). There is no capture here to score.');
}

export const manifest = _m;
export const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;

const _imgCache = new Map();
export const img = (r) => {
  if (!r) return null;
  if (_imgCache.has(r.file)) return _imgCache.get(r.file);
  const f = path.join(DIR, r.file);
  const im = existsSync(f) ? readPNG(f) : null;
  _imgCache.set(r.file, im);
  return im;
};

/* ── pixels ─────────────────────────────────────────────────────────────────────────────── */

export const lumaOf = (im, o) =>
  0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];

/** display-byte stats over a rect (gradetrio-lib's lens + L>=235 blown share). */
export function stats(im, [x0, y0, x1, y1]) {
  let n = 0, sl = 0, srb = 0, ss = 0, cx = 0, cy = 0, wsum = 0, blown = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const R = im.data[o] / 255, G = im.data[o + 1] / 255, B = im.data[o + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    let h = 0;
    if (d > 1e-6) {
      if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const L = (0.2126 * R + 0.7152 * G + 0.0722 * B) * 255;
    n++; sl += L; srb += (R - B) * 255;
    ss += mx > 1e-6 ? d / mx : 0;
    if (L >= 235) blown++;
    cx += d * Math.cos(h * Math.PI / 180); cy += d * Math.sin(h * Math.PI / 180); wsum += d;
  }
  return {
    n, meanL: n ? sl / n : NaN, meanRB: n ? srb / n : NaN, meanS: n ? ss / n : NaN,
    blown: n ? blown / n : NaN,
    hMean: wsum > 1e-9 ? ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360 : NaN,
  };
}

/** strict differing-px count (any |Δ| >= 1 in R,G,B), full frame or rect. */
export function diffPx(a, b, rect = null) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  const [x0, y0, x1, y1] = rect || [0, 0, a.w, a.h];
  let d = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const oa = (y * a.w + x) * a.ch, ob = (y * b.w + x) * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1]
      || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}

/** differing px split against a container rect-union: {inside, outside, total}. */
export function diffSplit(a, b, rects) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let inside = 0, outside = 0;
  const rs = rects.filter(Boolean);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const oa = (y * a.w + x) * a.ch, ob = (y * b.w + x) * b.ch;
    if (a.data[oa] === b.data[ob] && a.data[oa + 1] === b.data[ob + 1]
      && a.data[oa + 2] === b.data[ob + 2]) continue;
    let inRect = false;
    for (const [rx0, ry0, rx1, ry1] of rs) {
      if (x >= rx0 && x < rx1 && y >= ry0 && y < ry1) { inRect = true; break; }
    }
    if (inRect) inside++; else outside++;
  }
  return { inside, outside, total: inside + outside };
}

/* ── rects ──────────────────────────────────────────────────────────────────────────────── */

export const dilate = (r, px, W = 1280, H = 720) => (r
  ? [Math.max(0, r[0] - px), Math.max(0, r[1] - px), Math.min(W, r[2] + px), Math.min(H, r[3] + px)]
  : null);
export const erode = (r, fx = 0.15) => (r
  ? [Math.round(r[0] + (r[2] - r[0]) * fx), Math.round(r[1] + (r[3] - r[1]) * fx),
     Math.round(r[2] - (r[2] - r[0]) * fx), Math.round(r[3] - (r[3] - r[1]) * fx)]
  : null);
export const rectArea = (r) => (r ? Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]) : 0);
export const intersect = (a, b) => {
  if (!a || !b) return null;
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return (r[2] > r[0] && r[3] > r[1]) ? r : null;
};
export const discRect = (d) => (d ? [d.c[0] - d.r, d.c[1] - d.r, d.c[0] + d.r, d.c[1] + d.r] : null);

/* ── probe accessors ────────────────────────────────────────────────────────────────────── */

export const probeOf = (shot, arm) => row(shot, arm)?.probe || null;
export const subjectBox = (shot, arm) => {
  const p = probeOf(shot, arm);
  if (!p) return null;
  return p.guards?.[p.subjIdx]?.bbox || null;
};
/** every probe container rect for one arm (PREREG-guardcone §4's union). */
export function coneContainers(shot, arm, pad = 24) {
  const p = probeOf(shot, arm);
  if (!p) return [];
  const out = [];
  for (const g of p.guards || []) {
    if (g.bbox) out.push(dilate(g.bbox, pad));
    if (g.beamRect) out.push(dilate(g.beamRect, pad));
    if (g.poolRect) out.push(dilate(g.poolRect, pad));
  }
  if (p.spill?.rect) out.push(p.spill.rect);
  if (p.ahead) out.push(dilate(discRect(p.ahead), pad));
  return out.filter(Boolean);
}

/* ── shared bars ────────────────────────────────────────────────────────────────────────── */

/**
 * R bars — strict differing-px of diff(off, back) per shot, same boot, band [0,0] each,
 * fail-closed in every consumer. AMENDMENT A1.2: restated here in place (the sealed text
 * cited PREREG-guardart §4 for the row definition, and that seal is WAIVED-UNSCORED). The
 * predicate and the band are copied, not re-derived.
 */
export function rBars(report) {
  const guards = {};
  for (const shot of ROSTER) {
    const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
    report.push(`R ${shot.padEnd(12)} off-vs-back ${d} px`);
    guards[`R_${shot}`] = d === null ? null : d === 0;
  }
  return guards;
}

/**
 * V_CHUNK_TREE (AMENDMENT A2.4) — ONE src tree across all sixteen chunks, equal to HEAD's
 * `git archive HEAD src` hash. Replaces the tree half of the sealed V-TREE, which could only be
 * stated about a single process. Each chunk re-derives its expectation before it renders and
 * re-checks it under the lock, so this verifies the tree at sixteen points in time instead of
 * two — one differing hash VOIDs the whole run, which is A2.8's disclosed cost of a longer
 * window in which `src/` must not move (§315 killed run 1 exactly this way).
 *
 * The per-ROW `tree.src` stamps are folded in as well as the per-chunk `srcHash`: a row whose
 * tree moved mid-chunk is caught by the same predicate, so the sealed bar's reach is not lost.
 */
export function chunkTreeBar(report) {
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  const chunkHashes = [...new Set(chunks.map((c) => c.srcHash || '?'))];
  const rowHashes = [...new Set(manifest.rows.map((r) => r.tree?.src || '?'))];
  const all = [...new Set([...chunkHashes, ...rowHashes])];
  const expect = manifest.expect?.head ?? manifest.srcHash ?? null;
  report.push(`V_CHUNK_TREE trees across ${chunks.length} chunk(s) + ${manifest.rows.length} row(s): `
    + `{${all.join(', ')}} expected ${expect ?? '(none recorded)'}`);
  /* A2.4 registers the failure classification for BOTH new gates as **VOID**, not FAIL, and the
     distinction is the one tools/gate.mjs draws: a FAIL is a result about the candidate, a VOID
     is a defect in the run. A tree that moved between chunks says nothing whatever about the
     cone tuple. So the predicate returns `true` or nothing — never `false`. Fail-closed either
     way; neither branch can turn a FAIL into a PASS. */
  if (!chunks.length || !expect) return null;
  return (all.length === 1 && all[0] === expect) ? true : null;
}

/**
 * V_CHUNKS (AMENDMENT A2.4) — the census. All 16 `manifest.<shot>.json` present, one per ROSTER
 * entry, 49 rows total, `guard` contributing 4 and every other shot 3. A1.2 already established
 * that the row count is a CENSUS, not a threshold, and A2 does not move it: the roster stays at
 * 16 and the frame count stays at 49.
 */
export function chunksBar(report) {
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  const seen = chunks.map((c) => c.shot);
  const missing = ROSTER.filter((s) => !seen.includes(s));
  const extra = seen.filter((s) => !ROSTER.includes(s));
  const wrong = [];
  for (const shot of ROSTER) {
    const want = armsFor(shot);
    const got = manifest.rows.filter((r) => r.shot === shot).map((r) => r.arm);
    if (!seen.includes(shot)) continue;
    if (got.length !== want.length || want.some((a) => !got.includes(a))) {
      wrong.push(`${shot}: [${got.join(',')}] want [${want.join(',')}]`);
    }
  }
  report.push(`V_CHUNKS ${chunks.length}/${EXPECT_CHUNKS} chunks, ${manifest.rows.length}/${EXPECT_ROWS} rows`
    + (missing.length ? `; MISSING ${missing.join(', ')}` : '')
    + (extra.length ? `; UNEXPECTED ${extra.join(', ')}` : '')
    + (wrong.length ? `; ARM MISMATCH ${wrong.slice(0, 4).join(' | ')}${wrong.length > 4 ? ` (+${wrong.length - 4})` : ''}` : ''));
  /* VOID, not FAIL, on violation — see chunkTreeBar. An incomplete census is a defect in the
     run, never a statement about the candidate. */
  return (chunks.length === EXPECT_CHUNKS && missing.length === 0 && extra.length === 0
    && wrong.length === 0 && manifest.rows.length === EXPECT_ROWS) ? true : null;
}

/**
 * PARK1 (AMENDMENT A1.2, NEW) — the §309 parking measured rather than assumed: EVERY captured
 * row must read guardArt 0, guardSkin 0, painted false, skin-shift flag false. The runner does
 * not write those levers at all, so any non-zero here means the parking did not hold in the
 * boot and the capture is VOID (not FAIL — it is a validity bar). Strictly one-directional: it
 * can turn a PASS into a VOID, never a FAIL into a PASS.
 */
export function parkBar(report) {
  let ok = 0;
  const bad = [];
  for (const r of manifest.rows) {
    const p = r.readback?.park;
    if (!p) { bad.push(`${r.shot}.${r.arm}: no park readback`); continue; }
    if (p.guardArt === 0 && p.guardSkin === 0 && p.painted === false && p.skinShift === false) ok++;
    else bad.push(`${r.shot}.${r.arm}: art=${p.guardArt} skin=${p.guardSkin} painted=${p.painted} shift=${p.skinShift}`);
  }
  report.push(`PARK1 §309 guard-model levers inert in ${ok}/${manifest.rows.length} rows`
    + (bad.length ? ` — VIOLATIONS: ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ''}` : ''));
  return manifest.rows.length > 0 && bad.length === 0;
}
