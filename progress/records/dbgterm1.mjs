/**
 * dbgterm1 — does `debugTerm` work, and does every debug channel prove itself?
 *
 * ── Why this run exists ─────────────────────────────────────────────────────────────────
 * KNOWN_ISSUES §210.2 recorded that `debugTerm` "does not reach the shader": its own mode-4
 * calibration writes (0.25, 0.50, 0.75), which must arrive as (64, 128, 191), and zero pixels
 * carried them. §218 then found that `G.step(n, 0)` does not render and put §210.2 under
 * suspicion as the same artefact.
 *
 * It was neither. Offline, on the harness's own ANGLE/SwiftShader stack, the cel fragment
 * program at HEAD **failed to link**:
 *
 *     CONTROL   stock MeshStandardMaterial   LINK OK    23 active uniforms
 *     PRE-REGR  6e0cc8f^ Shading.toon()      LINK OK    75 active uniforms
 *     CURRENT   HEAD     Shading.toon()      LINK FAIL   0 active uniforms
 *                                            ERROR: 0:2502: '*' : syntax error
 *     POISON    patched + injected garbage   LINK FAIL   0 active uniforms
 *
 * Commit 6e0cc8f (11:13) appended the mode-5 documentation AFTER the close-comment marker that
 * ended the previous block, so thirteen lines of prose became GLSL. §210.2 was written at 11:32
 * — nineteen minutes later. Every toon-shaded pixel in the game had stopped drawing, and mode 4
 * reported that correctly; it was read as "the channel is broken" instead of "the program is
 * dead". `nUniforms: 0`, which §217 dismissed as an impossible reading from a wrong accessor,
 * was the same fact arriving a third time.
 *
 * The comment is fixed and the program links again. This run is the confirmation in a frame,
 * plus the audit: every channel must now prove itself before anything it says is quoted.
 *
 * ── Arms ────────────────────────────────────────────────────────────────────────────────
 *   A0  LINK HEALTH   shading.programHealth() against the live renderer — LINK_STATUS and
 *                     ACTIVE_UNIFORMS off every cel and ink program the game actually built.
 *                     This is the arm §210.2 needed and did not have.
 *   A1  RENDER PROOF  all-materials-red repaint, then RESTORE. Two-sided: red must differ from
 *                     base, and the restore must come back to base. A one-sided "it moved"
 *                     cannot tell a working lever from a drifting clock (see A2).
 *   A2  DRIFT CONTROL two captures, same step count, NO poke between them. Everything in this
 *                     project that diffs two frames captured at different sim times is measuring
 *                     this number plus its lever. Reported so the others can be read against it.
 *   A3  TERM CALIB    debugTerm(4) + debugRaw('scene') — the subject of §210.2.
 *   A4  SHADOW CALIB  debugShadow(9) + debugRaw('scene') — the channel that had no calibration
 *                     at all until this change, and whose readings rode the haze until it.
 *   A5  RAMP READ     debugTerm(5): ramp / N.L / key. QUOTED ONLY IF A3 PASSES.
 *
 * ── Registered bands — fixed here, before the run, and not to be moved afterwards ────────
 *   B0  A0 must report failed === 0 and linked > 0.  Otherwise STOP: nothing below means
 *       anything, and that is the entire lesson of §210.2.
 *   B1  A1 red-vs-base >= 200 px changed.  Below that the harness is not rendering and every
 *       other arm is void (§218's bug, carried as a live check rather than as a memory).
 *   B1b A1 restore-vs-base <= A2 drift + 200 px.  A repaint that cannot be undone means the
 *       arms are not independent.
 *   B3  A3: >= 10% of frame pixels read (64, 128, 191) EXACTLY -> debugTerm PROVEN.
 *       10% is a floor far below any plausible toon population on `temple` and far above the
 *       zero §210.2 measured; it is deliberately not a tuned number.
 *   B4  A4: >= 10% of frame pixels read (191, 64, 128) exactly -> debugShadow PROVEN.
 *   Tolerance: EXACT is the band. Counts at +/-1 and +/-3 are printed alongside because the
 *   scene target is MSAA-resolved at quality 'high' and a resolve averages across geometry
 *   edges — but no band is scored on them, so a near-miss cannot be talked into a pass.
 *
 * A calibration failure here does NOT mean the channel is broken. It means no pixel carrying
 * the constant reached the PNG, and A0 is what separates the two causes.
 *
 * Run:  node progress/records/dbgterm1.mjs        (takes the capture lock; ~2 min)
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { PNG } from 'pngjs';
import { DEBUG_CALIB } from '/home/user/Demo/src/render/shaders/toon.glsl.js';

const log = (s = '') => process.stdout.write(`${s}\n`);

/* ---- registered bands ---------------------------------------------------------------- */
const B1_RED_MIN_PX = 200;
const B1B_RESTORE_SLACK_PX = 200;
const B3_MIN_FRACTION = 0.10;
const B4_MIN_FRACTION = 0.10;
const SHOT = 'temple';

await withGame({ width: 320, height: 180, quality: 'high', timeout: 20 * 60 * 1000 }, async ({ page }) => {
  const step = (n = 4) => page.evaluate(async (k) => { await window.__GAME.step(k, 1 / 60); }, n);
  const cap = async () => PNG.sync.read(Buffer.from(
    (await page.evaluate(() => window.__GAME.capture('image/png'))).split(',')[1], 'base64'));

  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
        + Math.abs(a.data[i + 2] - b.data[i + 2]) > 3) n++;
    }
    return n;
  };

  /** How many pixels carry `triple` within `tol` on every channel, plus the modal triple. */
  const score = (png, triple, tol) => {
    let hit = 0;
    const modes = new Map();
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      if (Math.abs(r - triple[0]) <= tol && Math.abs(g - triple[1]) <= tol && Math.abs(b - triple[2]) <= tol) hit++;
      const k = `${r},${g},${b}`;
      modes.set(k, (modes.get(k) || 0) + 1);
    }
    const top = [...modes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    return { hit, top };
  };

  await page.evaluate(async (s) => { await window.__GAME.setShot(s, { dt: 0 }); }, SHOT);
  await step(8);
  const base = await cap();
  const total = base.width * base.height;
  log(`shot ${SHOT}, ${base.width}x${base.height} = ${total} px\n`);

  /* ---- A0  LINK HEALTH ---------------------------------------------------------------- */
  const health = await page.evaluate(() => {
    const sh = window.__ENGINE.get('shading');
    if (typeof sh.programHealth !== 'function') return { missing: true };
    return sh.programHealth(window.__ENGINE.renderer);
  });
  log('A0  LINK HEALTH');
  if (health.missing) log('    programHealth() absent — this build predates the fix; STOP.');
  else {
    log(`    ${health.reason}`);
    log(`    checked=${health.checked} linked=${health.linked} failed=${health.failed} unbuilt=${health.unbuilt}`);
    for (const f of health.failures.slice(0, 3)) log(`    FAIL ${f.material} uniforms=${f.uniforms}: ${(f.log || '').split('\n')[0]}`);
  }
  const b0 = !health.missing && health.failed === 0 && health.linked > 0;
  log(`    B0 ${b0 ? 'PASS' : 'FAIL'}\n`);

  /* ---- A2  DRIFT CONTROL (measured before the destructive arm) ------------------------- */
  await step(4);
  const drift = diff(base, await cap());
  log('A2  DRIFT CONTROL  (no poke, same step count)');
  log(`    ${drift} / ${total} px move on their own between two captures 4 frames apart`);
  log('    Any diff-based arm in this project is this number plus its lever.\n');

  /* ---- A1  RENDER PROOF, two-sided ---------------------------------------------------- */
  await page.evaluate(() => {
    window.__slyRestore = [];
    window.__ENGINE.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m?.color) { window.__slyRestore.push([m, m.color.getHex()]); m.color.setRGB(1, 0, 0); m.needsUpdate = true; }
      }
    });
    return window.__slyRestore.length;
  });
  await step(4);
  const red = diff(base, await cap());
  await page.evaluate(() => {
    for (const [m, hex] of window.__slyRestore) { m.color.setHex(hex); m.needsUpdate = true; }
    window.__slyRestore = [];
  });
  await step(4);
  const restored = diff(base, await cap());
  const b1 = red >= B1_RED_MIN_PX;
  const b1b = restored <= drift + B1B_RESTORE_SLACK_PX;
  log('A1  RENDER PROOF');
  log(`    red vs base      : ${red} / ${total} px      B1  ${b1 ? 'PASS' : 'FAIL'} (>= ${B1_RED_MIN_PX})`);
  log(`    restored vs base : ${restored} / ${total} px      B1b ${b1b ? 'PASS' : 'FAIL'} (<= drift ${drift} + ${B1B_RESTORE_SLACK_PX})`);
  log('');

  /* ---- A3  TERM CALIBRATION ----------------------------------------------------------- */
  const T = DEBUG_CALIB.term.u8;
  await page.evaluate(() => {
    window.__ENGINE.get('postfx').debugRaw('scene');
    window.__ENGINE.get('shading').calibrate('term');
  });
  await step(4);
  const termPng = await cap();
  const t0 = score(termPng, T, 0), t1 = score(termPng, T, 1), t3 = score(termPng, T, 3);
  const b3 = t0.hit / total >= B3_MIN_FRACTION;
  log(`A3  TERM CALIBRATION  debugTerm(${DEBUG_CALIB.term.mode}) + debugRaw('scene'), expecting (${T.join(', ')})`);
  log(`    exact   : ${t0.hit} / ${total}  (${(100 * t0.hit / total).toFixed(1)}%)`);
  log(`    +/-1    : ${t1.hit} / ${total}  (${(100 * t1.hit / total).toFixed(1)}%)   [MSAA resolve, not scored]`);
  log(`    +/-3    : ${t3.hit} / ${total}  (${(100 * t3.hit / total).toFixed(1)}%)   [not scored]`);
  log(`    modal triples in frame: ${t0.top.map(([k, v]) => `(${k})x${v}`).join('  ')}`);
  log(`    B3 ${b3 ? 'PASS — debugTerm PROVEN' : 'FAIL'} (>= ${100 * B3_MIN_FRACTION}% exact)`);
  if (!b3) {
    /* Name the transform rather than just failing: an sRGB-encoded bypass reads (137,188,225)
       for this triple, and that is a different defect from a dead program. */
    const srgb = T.map((v) => Math.round(255 * (((v / 255) <= 0.0031308) ? (v / 255) * 12.92 : 1.055 * Math.pow(v / 255, 1 / 2.4) - 0.055)));
    const s = score(termPng, srgb, 1);
    log(`    sRGB-encoded variant (${srgb.join(', ')}): ${s.hit} px — ${s.hit > total * 0.05 ? 'THE BYPASS IS ENCODING, not dead' : 'not that either'}`);
  }
  await page.evaluate((ok) => window.__ENGINE.get('shading').confirmDebugCalibration('term', ok), b3);
  log('');

  /* ---- A4  SHADOW CALIBRATION --------------------------------------------------------- */
  const S = DEBUG_CALIB.shadow.u8;
  await page.evaluate(() => {
    window.__ENGINE.get('shading').debugTerm(0);
    window.__ENGINE.get('shading').calibrate('shadow');
  });
  await step(4);
  const shPng = await cap();
  const s0 = score(shPng, S, 0), s1 = score(shPng, S, 1);
  const b4 = s0.hit / total >= B4_MIN_FRACTION;
  log(`A4  SHADOW CALIBRATION  debugShadow(${DEBUG_CALIB.shadow.mode}) + debugRaw('scene'), expecting (${S.join(', ')})`);
  log(`    exact   : ${s0.hit} / ${total}  (${(100 * s0.hit / total).toFixed(1)}%)`);
  log(`    +/-1    : ${s1.hit} / ${total}  (${(100 * s1.hit / total).toFixed(1)}%)   [not scored]`);
  log(`    modal triples in frame: ${s0.top.map(([k, v]) => `(${k})x${v}`).join('  ')}`);
  log(`    B4 ${b4 ? 'PASS — debugShadow PROVEN' : 'FAIL'} (>= ${100 * B4_MIN_FRACTION}% exact)`);
  log(`    Cross-check: this frame must NOT carry debugTerm's triple (${T.join(', ')}) — found ${score(shPng, T, 0).hit} px.`);
  await page.evaluate((ok) => window.__ENGINE.get('shading').confirmDebugCalibration('shadow', ok), b4);
  log('');

  /* ---- A5  RAMP READBACK — quoted only if A3 passed ------------------------------------ */
  log('A5  RAMP READBACK  debugTerm(5): R = ramp, G = N.L, B = ramp * shadow');
  if (!b3) {
    log('    NOT RUN — A3 did not prove the channel, so nothing read here would be quotable.');
  } else {
    await page.evaluate(() => { window.__ENGINE.get('shading').debugShadow(0); window.__ENGINE.get('shading').debugTerm(5); });
    await step(4);
    const rampPng = await cap();
    /* Restrict to pixels the toon shader wrote, using A3's own population map: a pixel is
       toon-shaded iff it carried the calibration triple in the A3 frame. That is what mode 4
       is for, and it removes sky/ink/HUD without a guess. */
    const pop = [];
    for (let i = 0, p = 0; i < termPng.data.length; i += 4, p++) {
      if (termPng.data[i] === T[0] && termPng.data[i + 1] === T[1] && termPng.data[i + 2] === T[2]) pop.push(p);
    }
    const rampHist = new Array(17).fill(0);
    const ndlHist = new Array(17).fill(0);
    for (const p of pop) {
      rampHist[Math.min(16, rampPng.data[p * 4] >> 4)]++;
      ndlHist[Math.min(16, rampPng.data[p * 4 + 1] >> 4)]++;
    }
    log(`    population (from A3's mode-4 map): ${pop.length} px`);
    log('    Caveat: the map is 8 sim frames older than the readback, so animated pixels can');
    log('    be mislabelled. On a staged architectural shot that is a small edge population.');
    const show = (name, h) => log(`    ${name} 16ths: ${h.map((v, i) => (v ? `${i}:${v}` : '')).filter(Boolean).join(' ')}`);
    show('ramp R', rampHist);
    show('N.L  G', ndlHist);
    log('    Read R against G, not R alone: above N.L 0.544 the ramp is a flat 1.0 by construction.');
  }
  log('');

  /* ---- restore ------------------------------------------------------------------------- */
  await page.evaluate(() => {
    const sh = window.__ENGINE.get('shading');
    sh.debugTerm(0); sh.debugShadow(0);
    window.__ENGINE.get('postfx').debugRaw(false);
  });
  await step(4);
  const back = diff(base, await cap());
  log(`RESTORE  frame back to within ${back} px of base (drift alone was ${drift}).`);

  const warnings = await page.evaluate(() => window.__GAME.warnings.slice(-12));
  if (warnings.length) { log('\nengine warnings (tail):'); for (const w of warnings) log(`  ! ${w}`); }

  log('\n================ VERDICT ================');
  if (!b0) log('B0 FAILED — a cel program did not link. Nothing else in this run is interpretable.');
  else if (!b1) log('B1 FAILED — the harness is not rendering. Every arm above is void (§218).');
  else if (b3 && b4) log('debugTerm AND debugShadow both PROVEN. §210.2 should be RETRACTED: its null was the');
  else if (b3) log('debugTerm PROVEN; debugShadow did not prove itself — do not quote debugShadow.');
  else log('debugTerm did NOT prove itself even with a linking program and a rendering harness.');
  if (b3 && b4) log('unlinked program of 6e0cc8f, not a broken channel.');
});
