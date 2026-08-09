/**
 * chord.mjs — minimum-chord width and connected-component size for a boolean mask.
 *
 * **Lifted from `progress/records/inkw.mjs`**, which is a frozen run record and not a library, so
 * the functions are copied here rather than imported out of it. The reasoning below is that
 * record's and is reproduced because a metric without its argument is a number nobody can check.
 *
 * Width is the **minimum chord** through the mask: for each mask pixel take the maximal run of
 * mask pixels through it along four axes and keep the smallest. For a straight band of thickness
 * `t` the minimum chord is exactly `t` at 0/45/90 degrees and never worse than 1.08 t in between,
 * and — the property the whole thing turns on — **it does not grow when the band is long**. A
 * run-length or dark-pixel count reports a horizontal ink line as hundreds of pixels wide; this
 * reports it as its thickness. So a LINE has a small minimum chord everywhere along it and a
 * SMEAR does not, which is the distinction between an ink pass and a shading pass.
 */

/**
 * Maximal run of set pixels through each pixel along (dx, dy).
 *
 * Written as "find each run's head, walk it once, stamp its length onto every member" rather than
 * as a pair of prefix passes: the prefix form needs three sweeps and an in-place propagation to
 * get the *total* run rather than the distance-so-far, and getting that wrong yields a chord that
 * looks plausible and is quietly the wrong quantity. This form is O(n) with one visit per pixel
 * and is checked by `selfTest()` below.
 */
function runLengths(mask, w, h, dx, dy) {
  const out = new Uint16Array(w * h);
  const inb = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      // only start at a run head: the pixel behind us along the axis is outside or unset
      const px = x - dx, py = y - dy;
      if (inb(px, py) && mask[py * w + px]) continue;
      let n = 0, cx = x, cy = y;
      while (inb(cx, cy) && mask[cy * w + cx]) { n++; cx += dx; cy += dy; }
      cx = x; cy = y;
      for (let k = 0; k < n; k++) { out[cy * w + cx] = n; cx += dx; cy += dy; }
    }
  }
  return out;
}

/** Minimum chord through each mask pixel over the four axes; 0 where the mask is unset. */
export function minChord(mask, w, h) {
  const a = runLengths(mask, w, h, 1, 0);
  const b = runLengths(mask, w, h, 0, 1);
  const c = runLengths(mask, w, h, 1, 1);
  const d = runLengths(mask, w, h, 1, -1);
  const out = new Uint16Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (!mask[i]) continue;
    /* Diagonal runs are counted in diagonal steps, each sqrt(2) px long. Rounding rather than
       flooring keeps a 1 px diagonal line at 1 instead of collapsing it to 0. */
    out[i] = Math.min(a[i], b[i], Math.round(c[i] * Math.SQRT2), Math.round(d[i] * Math.SQRT2));
  }
  return out;
}

/** Median of the non-zero chords, i.e. the mask's typical width in pixels. */
export function medianChord(mask, w, h) {
  const ch = minChord(mask, w, h);
  const v = [];
  for (let i = 0; i < ch.length; i++) if (ch[i]) v.push(ch[i]);
  if (!v.length) return null;
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
}

/** Size in pixels of the largest 4-connected component of `mask`. */
export function largestComponent(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0, n = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const i = stack[--top];
      n++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
    }
    if (n > best) best = n;
  }
  return best;
}

/**
 * Self-test with known answers. Exported so a runner can assert its instrument before using it —
 * §13's rule: a metric never shown to move on a state known to have the property is not a metric.
 * Throws on failure rather than returning false, because a silently wrong width is the whole
 * hazard here.
 */
export function selfTest() {
  const W = 40, H = 40;
  // 1. a horizontal band 3 px thick and 30 px long: min chord must be 3, not 30
  const band = new Uint8Array(W * H);
  for (let y = 10; y < 13; y++) for (let x = 5; x < 35; x++) band[y * W + x] = 1;
  const mc = medianChord(band, W, H);
  if (mc !== 3) throw new Error(`chord self-test: 3px band measured ${mc}, want 3`);
  /* 2. a filled 20x20 square must NOT read as a line. The bound is derived, not observed: the
     median is dragged below the side length S because corner pixels have short DIAGONAL runs
     (my first draft asserted >= 15 and the self-test caught that expectation, which is the whole
     reason this function exists). At least half the square's pixels lie in the inscribed region
     where every one of the four runs is at least S/2, so median >= S/2 = 10 is guaranteed by the
     geometry. The discriminative property is the ratio: a blob must measure several times a
     3 px band, or the metric cannot tell an ink pass from a shading pass. */
  const blob = new Uint8Array(W * H);
  for (let y = 5; y < 25; y++) for (let x = 5; x < 25; x++) blob[y * W + x] = 1;
  const mb = medianChord(blob, W, H);
  if (mb < 10) throw new Error(`chord self-test: 20x20 blob measured ${mb}, want >= 10 (S/2)`);
  if (mb <= 3 * mc) throw new Error(`chord self-test: blob ${mb} vs 3px band ${mc} — the metric does not discriminate`);
  // 3. components: two disjoint squares, the larger one wins
  const two = new Uint8Array(W * H);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) two[y * W + x] = 1;     // 16 px
  for (let y = 20; y < 30; y++) for (let x = 20; x < 30; x++) two[y * W + x] = 1; // 100 px
  const lc = largestComponent(two, W, H);
  if (lc !== 100) throw new Error(`chord self-test: largest component ${lc}, want 100`);
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('chord.mjs')) {
  selfTest();
  console.log('chord.mjs self-test OK: 3px band reads 3, 20x20 blob does not read as a line, components counted');
}
