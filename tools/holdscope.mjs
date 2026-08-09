/**
 * §269/§271 / PREREG-holdscope.md — the A/B for scoping the held shade band by camera enclosure.
 *
 * ONE INVOCATION, ONE BOOT, ONE TREE. That is not a style preference, it is the registered
 * provenance guard (PREREG §6). `shot.mjs` takes the FIFO capture lock once per invocation, so
 * env-var arms queue as SEPARATE invocations and the working tree moves between them — three
 * other agents commit to this tree while a capture runs, and a run was voided today because its
 * A0 and A1 arms were twenty commits apart across a change that re-framed the shots. Every arm
 * below is captured inside this one process, in one browser boot, and the SHA-256 digest of
 * `src/` is recorded before and after so the scorer can VOID the run if the code moved.
 *
 *   node tools/holdscope.mjs [outdir]
 *
 * Phases, in order, all inside the single boot:
 *
 *   1. PROBE      per canonical shot: the enclosure fan (with its convergence trace) and
 *                 criterion C, the sunlit fraction of the frame read off `debugTerm(5)`'s blue
 *                 channel through `postfx.debugRaw('scene')`, plus the `debugTerm(4)`
 *                 self-calibration that says whether that channel can be read at all.
 *   2. THRESHOLD  the registered rule (PREREG §5) applied mechanically to phase 1's numbers:
 *                 T = midpoint of the gap between the most-enclosed OPEN shot and the
 *                 least-enclosed ROOFED shot, or REFUTED if they overlap. Nothing here chooses
 *                 a threshold; the rule does, and the rule was sealed before the probe ran.
 *   3. ARMS       A0..A5 on the four decision frames, A0/A4 on the other six.
 *
 * Scoring is `tools/holdscopescore.mjs`. This file measures and does not judge.
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.argv[2] || 'shots/holdscope';
mkdirSync(OUT, { recursive: true });

/* The ten frames the critics score. The probe runs on all of them because the scope decision is
   a property of every camera in the game, not of the four this lane can afford to capture. */
const PROBE_SHOTS = ['combat', 'courtyard', 'dunes', 'hero', 'interior', 'night',
                     'sly-closeup', 'sly-perch', 'temple', 'traversal'];
/* Full six arms. `temple` is the frame that decides the threshold; `interior` is the frame §269
   was refused on; `dunes` and `hero` are the two §269 measured the fix on. */
const FULL_SHOTS = ['dunes', 'hero', 'temple', 'interior'];
const LITE_ARMS = ['A0-base', 'A4-scoped'];

/* ---------------------------------------------------------------- provenance --- */

/** SHA-256 over every file under src/, sorted by path. The only tree state that can reach a render. */
function srcDigest(dir = path.join(ROOT, 'src')) {
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.isFile()) files.push(p);
    }
  })(dir);
  const h = createHash('sha256');
  for (const f of files) { h.update(path.relative(ROOT, f)); h.update('\0'); h.update(readFileSync(f)); }
  return { digest: h.digest('hex').slice(0, 32), files: files.length };
}
const git = (c) => { try { return execSync(c, { cwd: ROOT }).toString().trim(); } catch { return null; } };
const provenance = () => ({
  head: git('git rev-parse HEAD'), headSrc: git('git rev-parse HEAD:src'),
  src: srcDigest(), at: new Date().toISOString(),
});

const PROV_START = provenance();
console.log(`provenance @start  HEAD ${PROV_START.head?.slice(0, 8)}  HEAD:src ${PROV_START.headSrc?.slice(0, 8)}  ` +
            `src digest ${PROV_START.src.digest} (${PROV_START.src.files} files)`);

/* ------------------------------------------------------------------ the run --- */

const run = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 900000 }, async ({ page }) => {
  /* Everything the page needs, installed once. Kept small: the analysis that has to be pixel
     exact (byte identity, the frozen hue instrument) happens in the scorer, on the PNGs. */
  await page.evaluate(() => {
    const W = window;
    W.__E = () => W.__ENGINE;
    W.__sh = () => W.__ENGINE.get('shading');
    W.__pf = () => W.__ENGINE.get('postfx');
    W.__lt = () => W.__ENGINE.get('lighting');
    W.__grab = () => {
      const eng = W.__ENGINE;
      eng.renderFrame(0);
      const src = eng.canvas;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(src, 0, 0);
      return { url: c.toDataURL('image/png'), w: c.width, h: c.height,
               d: g.getImageData(0, 0, c.width, c.height).data };
    };
    /* Modal RGB + its share, for the debugTerm(4) self-calibration. */
    W.__modal = (d) => {
      const m = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        m.set(k, (m.get(k) || 0) + 1);
      }
      let bk = -1, bn = 0;
      for (const [k, n] of m) if (n > bn) { bn = n; bk = k; }
      return { rgb: [(bk >> 16) & 255, (bk >> 8) & 255, bk & 255], share: bn / (d.length / 4), distinct: m.size };
    };
    /* criterion C: share of pixels whose mode-5 BLUE channel (key = ramp * sh) clears the bar. */
    W.__litFrac = (d, bar) => {
      let n = 0; const tot = d.length / 4;
      for (let i = 0; i < d.length; i += 4) if (d[i + 2] >= bar) n++;
      return n / tot;
    };
  });

  const evalP = (fn, arg) => page.evaluate(fn, arg);
  const shots = {};

  /* ================================ phase 1 — probe ================================ */
  console.log(`\n${'='.repeat(78)}\n### phase 1 — enclosure fan + criterion C\n`);
  console.log('shot         encl  target  conv    litFrac   calib rgb        share   note');

  for (const shot of PROBE_SHOTS) {
    const rec = await evalP(async (s) => {
      const lt = window.__lt(), sh = window.__sh(), pf = window.__pf();
      await window.__GAME.setShot(s, { dt: 0 });

      /* Run the fan. The threshold value is irrelevant to what the fan READS — it only decides
         how the reading is classified — so any non-negative value turns the probe on. */
      const was = lt.TUNE.holdEnclose;
      lt.TUNE.holdEnclose = 0.5;
      const trace = [];
      for (let i = 0; i < 5; i++) {
        await window.__GAME.step(1, 0);
        trace.push([+lt.enclosure.toFixed(6), +(lt._encloseTarget ?? -1).toFixed(6)]);
      }
      const enclosure = lt.enclosure, target = lt._encloseTarget ?? null;
      const camPos = lt.engine.camera.getWorldPosition(new (lt.engine.camera.position.constructor)()).toArray();

      /* criterion C, through the raw scene buffer. Mode 4 first: a reading mode on a channel
         that has not proven itself is not quotable (ToonMaterial._debugGuard says so). */
      pf.debugRaw(true, 'scene');
      sh.debugTerm(4);
      await window.__GAME.step(2, 0);
      const g4 = window.__grab();
      const cal = window.__modal(g4.d);
      const want = sh.debugCalib.term.u8;
      const calOk = cal.rgb[0] === want[0] && cal.rgb[1] === want[1] && cal.rgb[2] === want[2];
      sh.confirmDebugCalibration('term', calOk, `modal ${cal.rgb} want ${want} share ${cal.share.toFixed(3)}`);

      sh.debugTerm(5);
      await window.__GAME.step(2, 0);
      const g5 = window.__grab();
      const litFrac = window.__litFrac(g5.d, 13);
      const litHist = [0, 1, 4, 13, 32, 64, 128, 200].map((b) => +window.__litFrac(g5.d, b).toFixed(5));

      sh.debugTerm(0);
      pf.debugRaw(false);
      lt.TUNE.holdEnclose = was;
      await window.__GAME.step(1, 0);

      return { shot: s, enclosure, target, trace, camPos, litFrac, litHist,
               calib: { rgb: cal.rgb, want, share: cal.share, distinct: cal.distinct, ok: calOk },
               health: sh.programHealth?.() ?? null,
               png4: g4.url, png5: g5.url };
    }, shot);

    writeFileSync(`${OUT}/${shot}-key5.png`, Buffer.from(rec.png5.split(',')[1], 'base64'));
    writeFileSync(`${OUT}/${shot}-calib4.png`, Buffer.from(rec.png4.split(',')[1], 'base64'));
    delete rec.png4; delete rec.png5;
    shots[shot] = rec;

    const conv = Math.abs(rec.enclosure - (rec.target ?? NaN));
    console.log(`${shot.padEnd(12)} ${rec.enclosure.toFixed(2)}  ${String(rec.target).padEnd(6)}  ` +
                `${conv.toFixed(4)}  ${(100 * rec.litFrac).toFixed(3).padStart(7)}%  ` +
                `${JSON.stringify(rec.calib.rgb).padEnd(16)} ${(100 * rec.calib.share).toFixed(1).padStart(5)}%  ` +
                `${rec.calib.ok ? '' : 'CALIB FAIL'}`);
  }

  /* ============================== phase 2 — the rule =============================== */
  console.log(`\n${'='.repeat(78)}\n### phase 2 — the registered threshold rule (PREREG §5)\n`);
  const LIT_BAR = 0.05;
  const open = PROBE_SHOTS.filter((s) => shots[s].litFrac >= LIT_BAR);
  const roofed = PROBE_SHOTS.filter((s) => shots[s].litFrac < LIT_BAR);
  const eO = open.length ? Math.max(...open.map((s) => shots[s].enclosure)) : null;
  const eR = roofed.length ? Math.min(...roofed.map((s) => shots[s].enclosure)) : null;
  let T = null, refuted = false, why = '';
  if (!open.length || !roofed.length) {
    refuted = true; why = `one side of the partition is empty (open ${open.length}, roofed ${roofed.length})`;
  } else if (eO < eR) {
    T = Math.round(((eO + eR) / 2) * 1000) / 1000;
  } else {
    refuted = true; why = `enclosure overlaps: max(open) ${eO} >= min(roofed) ${eR}`;
  }
  const marginRays = T === null ? null : Math.round((eR - eO) / 0.2);
  console.log(`OPEN   (litFrac >= ${LIT_BAR}): ${open.join(', ') || '(none)'}`);
  console.log(`ROOFED (litFrac <  ${LIT_BAR}): ${roofed.join(', ') || '(none)'}`);
  console.log(`max enclosure over OPEN   eO = ${eO}`);
  console.log(`min enclosure over ROOFED eR = ${eR}`);
  console.log(refuted ? `==> PROXY REFUTED — ${why}` : `==> T = ${T}   (margin ${marginRays} ray${marginRays === 1 ? '' : 's'} of 5)`);

  /* =============================== phase 3 — arms ================================== */
  console.log(`\n${'='.repeat(78)}\n### phase 3 — arms\n`);

  /** Every arm as an explicit machine state. No arm inherits another arm's leftovers. */
  const armState = (tag, T) => ({
    'A0-base':    { holdEnclose: -1, tuneHold: 0, pokeHold: 0, ns: 0, nf: 0 },
    'A1-null':    { holdEnclose: T,  tuneHold: 0, pokeHold: null, ns: 0, nf: 0 },
    'A2-ctlgrey': { holdEnclose: -1, tuneHold: 0, pokeHold: 0, ns: 1, nf: 0 },
    'A3-global':  { holdEnclose: -1, tuneHold: 0, pokeHold: 1, ns: 0, nf: 0 },
    'A4-scoped':  { holdEnclose: T,  tuneHold: 1, pokeHold: null, ns: 0, nf: 0 },
    'A5-restore': { holdEnclose: -1, tuneHold: 0, pokeHold: 0, ns: 0, nf: 0 },
  }[tag]);
  const ALL_ARMS = ['A0-base', 'A1-null', 'A2-ctlgrey', 'A3-global', 'A4-scoped', 'A5-restore'];

  const arms = [];
  for (const shot of PROBE_SHOTS) {
    const tags = FULL_SHOTS.includes(shot) ? ALL_ARMS : LITE_ARMS;
    /* An arm needing a threshold cannot run if the rule refused to produce one. Recorded as a
       skip rather than silently substituted with a guess. */
    for (const tag of tags) {
      const st = armState(tag, T);
      if (st.holdEnclose !== -1 && T === null) {
        console.log(`${shot.padEnd(12)} ${tag.padEnd(11)} SKIPPED — the threshold rule returned REFUTED`);
        arms.push({ shot, arm: tag, skipped: 'threshold REFUTED' });
        continue;
      }
      const r = await evalP(async ([s, state]) => {
        const lt = window.__lt(), sh = window.__sh(), u = sh.uniforms;
        await window.__GAME.setShot(s, { dt: 0 });
        lt.TUNE.holdEnclose = state.holdEnclose;
        sh.TUNE.shadowHold = state.tuneHold;
        if (state.pokeHold !== null) u.uShadowHold.value = state.pokeHold;
        u.uNeutralShadow.value = state.ns;
        u.uNeutralFill.value = state.nf;
        await window.__GAME.step(4, 0);
        const g = window.__grab();
        return {
          url: g.url,
          applied: {
            hold: u.uShadowHold.value, knee: u.uShadowHoldKnee.value,
            ns: u.uNeutralShadow.value, nf: u.uNeutralFill.value,
            holdEnclose: lt.TUNE.holdEnclose, tuneHold: sh.TUNE.shadowHold,
            enclosure: +lt.enclosure.toFixed(6), target: +(lt._encloseTarget ?? -1).toFixed(6),
            skyOpen: lt._skyOpen, encloseStrength: lt.TUNE.encloseStrength,
          },
        };
      }, [shot, st]);

      const buf = Buffer.from(r.url.split(',')[1], 'base64');
      const file = `${OUT}/${shot}-${tag}.png`;
      writeFileSync(file, buf);
      const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      arms.push({ shot, arm: tag, file, sha, applied: r.applied });
      console.log(`${shot.padEnd(12)} ${tag.padEnd(11)} hold=${String(r.applied.hold).padEnd(4)} ` +
                  `he=${String(r.applied.holdEnclose).padEnd(5)} encl=${r.applied.enclosure.toFixed(2)} ` +
                  `open=${String(r.applied.skyOpen).padEnd(5)} ns=${r.applied.ns} nf=${r.applied.nf}  sha=${sha}`);
    }
  }

  /* Leave the build exactly as it shipped, so nothing downstream inherits a poked uniform. */
  await evalP(async () => {
    const lt = window.__lt(), sh = window.__sh();
    lt.TUNE.holdEnclose = -1; sh.TUNE.shadowHold = 0;
    sh.uniforms.uShadowHold.value = 0;
    sh.uniforms.uNeutralShadow.value = 0; sh.uniforms.uNeutralFill.value = 0;
    await window.__GAME.step(1, 0);
  });

  return { shots, partition: { open, roofed, eO, eR, T, refuted, why, marginRays, litBar: LIT_BAR }, arms };
});

/* ------------------------------------------------------------------- record --- */

const PROV_END = provenance();
const out = { prereg: 'progress/records/PREREG-holdscope.md', out: OUT,
              provStart: PROV_START, provEnd: PROV_END, ...run };
writeFileSync(`${OUT}/run.json`, JSON.stringify(out, null, 1));

console.log(`\nprovenance @end    HEAD ${PROV_END.head?.slice(0, 8)}  HEAD:src ${PROV_END.headSrc?.slice(0, 8)}  ` +
            `src digest ${PROV_END.src.digest} (${PROV_END.src.files} files)`);
console.log(`src digest unchanged across the run: ${PROV_START.src.digest === PROV_END.src.digest}` +
            `${PROV_START.head === PROV_END.head ? '' : '   (HEAD moved — another lane committed; see PREREG I3)'}`);
console.log(`\nwrote ${OUT}/run.json`);
