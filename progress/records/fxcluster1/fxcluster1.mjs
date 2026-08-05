/**
 * fxcluster1 — the registered capture for PREREG-fxcluster.md §2. FX owner.
 *
 * §164 chunks, each its OWN withGame boot (own FIFO lock hold via tools/harness.mjs →
 * tools/lock.mjs, released between chunks). Every registered pair is WITHIN one boot; arms
 * are live pokes of the running page (never rebuilds — §124.4: the bundle is fixed at boot).
 *
 *   chunk 1  guard             base / base2 / cand (debug.guardTowardCamera=-0.20, re-setShot)
 *                              / restore (delete flag, re-setShot)
 *   chunk 2  traversal         base / cand (debug.sparklePreroll=true, re-setShot) / restore
 *            combat            base / cand (EMITTERS cane block poke, re-setShot) / restore
 *                              (shipped values poked back, re-setShot)
 *   chunk 3  dunes             base / cand (fog.color poke + step(2,0), NO re-setShot)
 *                              / restore (exact base floats poked back + step(2,0))
 *            interior          ship (fresh setShot AFTER E-restore — sub-arm D rails frame)
 *
 * PRE-EDIT (PREREG-fxcluster §1, one ticketed unit, applied under the capture lock BEFORE
 * chunk 1, idempotent so a rollback-resume re-asserts it; commit is the coordinator's):
 *   Guard.js      _solveShotPose heading tip reads engine.debug?.guardTowardCamera ??
 *                 spec.towardCamera; clamp widened (0,0.9)→(−0.6,0.9). Look-neutral: the
 *                 flag is undefined by default and the shipped 0.35 is inside both clamps.
 *   Particles.js  (a) SparkleField.preroll(sec) — inert unless called;
 *                 (b) _stageShot calls sparkles.preroll(0.25) ONLY when
 *                     engine.debug?.sparklePreroll === true (default: bit-exact shipped);
 *                 (c) constructor exposes this.EMITTERS (poke path; data untouched).
 *   No seam for E: fog colours are live-pokeable instance state.
 *
 * Readback per arm (§40/§94.4 requested-vs-applied), frames + JSON INCREMENTALLY to
 * progress/records/fxcluster1/ (<shot>.<arm>.png flat, readback-<chunk>.json per chunk),
 * every row stamped tod + camera + srcAtArm tree hash (the fx19 gap). Idempotent resume per
 * chunk: a chunk whose frames all exist is skipped. Scoring is NOT here (banda's rule):
 * the sealed scorer fxcluster-diag.mjs runs offline afterwards with env-overridden frames.
 * No git — the coordinator sweeps.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { acquire } from '/home/user/Demo/tools/lock.mjs';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const OUT = path.join(ROOT, 'progress/records/fxcluster1');
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);
const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* ================================================================ pre-edit (seal §1) */

const SEAMS = [
  {
    name: 'A: Guard.js heading tip + widened clamp',
    file: 'src/ai/Guard.js',
    probe: 'guardTowardCamera',
    old: `    const t = clamp(spec.towardCamera ?? 0.35, 0, 0.9);`,
    neu: `    /* PREREG-fxcluster §1 seam (sub-arm A lever). Look-neutral by construction: the debug
       flag is undefined outside the registered capture, and the widened clamp only differs
       for negative inputs no shipped SHOT_POSE produces (guard ships towardCamera 0.35). */
    const t = clamp(this.engine.debug?.guardTowardCamera ?? spec.towardCamera ?? 0.35, -0.6, 0.9);`,
  },
  {
    /* Anchored on the dispose-directly-before-the-FlameField-banner sequence: the
       _autoHidden fold + one-line dispose alone appears in FOUR classes (LightShafts, Batch,
       SparkleField, FlameField) and a first-occurrence replace landed the method in
       LightShafts on the first attempt — caught by chunk 1's lever probe, no frames taken. */
    name: 'B-a: Particles.js SparkleField.preroll',
    file: 'src/fx/Particles.js',
    probe: 'preroll(sec)',
    old: `  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* =========================================================================================
   FlameField — one analytic billboard per live fire. See FLAME_VERT for why this exists.`,
    neu: `  /** PREREG-fxcluster §1 seam (a): back-date every live marker's born stamp so SPARKLE_VERT's
   *  pop is fully open at a staged capture — \`_prerollFires\`' treatment, which this field
   *  never had. Inert unless called; the only caller is debug-gated (see \`_stageShot\`). */
  preroll(sec) {
    for (let i = 0; i < this.count; i++) this.aData.array[i * 4 + 2] = -sec;
    this.aData.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* =========================================================================================
   FlameField — one analytic billboard per live fire. See FLAME_VERT for why this exists.`,
  },
  {
    name: 'B-b: Particles.js _stageShot debug-gated preroll call',
    file: 'src/fx/Particles.js',
    probe: 'sparklePreroll',
    old: `    this._sparkleTimer = 0;
    this._prerollFires();`,
    neu: `    this._sparkleTimer = 0;
    /* PREREG-fxcluster §1 seam (sub-arm B): a staged still captures ~3 frames after the
       SECOND clock re-base (Debug.setShot applies the shot twice), inside the sparkle pop
       window — fires get _prerollFires below; the field had no preroll. Debug-gated OFF by
       default: shipped behaviour is bit-exact unless the capture harness opts in. */
    if (this.engine.debug?.sparklePreroll === true) this.sparkles?.preroll(0.25);
    this._prerollFires();`,
  },
  {
    name: 'C-c: Particles.js EMITTERS poke path',
    file: 'src/fx/Particles.js',
    probe: 'this.EMITTERS = EMITTERS',
    old: `    this.TUNE = TUNE;`,
    neu: `    this.TUNE = TUNE;
    this.EMITTERS = EMITTERS;  // PREREG-fxcluster §1 seam (c): harness poke path; data untouched`,
  },
];

async function applySeams() {
  const missing = SEAMS.filter((s) => !readFileSync(path.join(ROOT, s.file), 'utf8').includes(s.probe));
  if (!missing.length) { log(`pre-edit: all ${SEAMS.length} seams already present (srcTree ${treeHash()})`); return; }
  log(`pre-edit: ${missing.length} seam(s) to apply — taking the capture lock (seal §1: queued on the lock, before chunk 1)`);
  const release = await acquire({
    onWait: (ms, pid) => log(`  waiting for capture lock to apply pre-edit (${(ms / 1000) | 0}s, held by pid ${pid})`),
  });
  try {
    log(`pre-edit: lock held; srcTree before ${treeHash()}`);
    for (const s of SEAMS) {
      const p = path.join(ROOT, s.file);
      let txt = readFileSync(p, 'utf8');
      if (txt.includes(s.probe)) { log(`  seam [${s.name}]: already present`); continue; }
      if (!txt.includes(s.old)) throw new Error(`seam [${s.name}]: anchor text not found in ${s.file} — tree drifted under the seal; ABORTING before any capture`);
      txt = txt.replace(s.old, s.neu);
      writeFileSync(p, txt);
      log(`  seam [${s.name}]: applied`);
    }
    log(`pre-edit: done; srcTree after ${treeHash()}`);
  } finally { release(); }
}

/* ================================================================ shared helpers */

const FRAME = (shot, arm) => path.join(OUT, `${shot}.${arm}.png`);

function makeReport(chunk) {
  const report = {
    prereg: 'PREREG-fxcluster.md', chunk,
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, `readback-${chunk}.json`), JSON.stringify(report, null, 1));
  save();
  return { report, save };
}

/** Stage + settle + probe + capture one arm. `pokeFn`/`probeFn` run in the page. */
async function armCapture(page, report, save, shot, arm, { poke = null, pokeArg = null, restage = true, probe = null } = {}) {
  const ta = Date.now();
  const row = { shot, arm, at: new Date().toISOString() };
  if (poke) row.poke = await page.evaluate(poke, pokeArg);
  if (restage) {
    row.setShot = await page.evaluate(async (n) => {
      const r = await window.__GAME.setShot(n);
      return {
        tod: window.__ENGINE.debug.timeOfDay,
        drift: r?.subject?.drift, onScreen: r?.subject?.onScreen,
        draws: r?.stats?.drawCalls, tris: r?.stats?.triangles, warnings: r?.warnings?.length,
      };
    }, shot);
    /* Settle per banda's voidA lesson: frozen steps + one thrown-away capture absorb program
       compiles and the one-off async settle BEFORE any scored frame. dt=0 — world clock
       frozen, so arms differ only by their poke. */
    await page.evaluate(async () => { await window.__GAME.step(10, 0); window.__GAME.capture('image/png'); });
  }
  if (probe) row.probe = await page.evaluate(probe);
  const dataUrl = await page.evaluate(() => window.__GAME.capture('image/png'));
  writeFileSync(FRAME(shot, arm), Buffer.from(dataUrl.split(',')[1], 'base64'));
  row.cam = await page.evaluate(() => {
    const c = window.__ENGINE.camera; const d = new window.__GAME.THREE.Vector3();
    c.getWorldDirection(d);
    return { pos: c.position.toArray().map((v) => +v.toFixed(3)), fwd: d.toArray().map((v) => +v.toFixed(3)), fov: c.fov };
  });
  row.tod = await page.evaluate(() => window.__ENGINE.debug.timeOfDay);
  row.srcAtArm = treeHash();
  row.secs = Math.round((Date.now() - ta) / 1000);
  report.arms.push(row); save();
  log(`  ${shot}.${arm.padEnd(8)} ${String(row.secs).padStart(3)}s  tod ${row.tod}  ${JSON.stringify(row.probe ?? {}).slice(0, 220)}`);
  return row;
}

/* ================================================================ probes (page-side) */

const probeGuard = () => {
  const e = window.__ENGINE;
  const gd = e.get('guards');
  const g0 = gd?.guards?.[0];
  const ic = gd?.beamMesh?.instanceColor;
  return {
    guardTowardCamera: e.debug.guardTowardCamera ?? null,
    guard0: g0 ? {
      pos: g0.position.toArray().map((v) => +v.toFixed(3)),
      yaw: +g0.yaw.toFixed(4),
      forward: g0.forward.toArray().map((v) => +v.toFixed(3)),
    } : null,
    light: gd ? +gd._light.toFixed(4) : null,
    uOpacity: gd?._beamMat ? +gd._beamMat.uniforms.uOpacity.value.toFixed(4) : null,
    beamCol0: ic ? Array.from(ic.array.slice(0, 3)).map((v) => +v.toFixed(4)) : null,
  };
};

const probeSparkle = () => {
  const e = window.__ENGINE;
  const fx = e.get('fx');
  const sp = fx?.sparkles;
  const uTime = sp?.material?.uniforms?.uTime?.value ?? null;
  const mk = [];
  if (sp) {
    for (let i = 0; i < Math.min(sp.count, 24); i++) {
      const born = sp.aData.array[i * 4 + 2];
      const dtb = uTime - born;
      const t = Math.min(1, Math.max(0, dtb / 0.22));
      mk.push({
        pos: [sp.aPos.array[i * 3], sp.aPos.array[i * 3 + 1], sp.aPos.array[i * 3 + 2]].map((v) => +v.toFixed(2)),
        born: +born.toFixed(4), pop: +(t * t * (3 - 2 * t)).toFixed(3),
      });
    }
  }
  return {
    sparklePreroll: e.debug.sparklePreroll ?? null,
    hasPreroll: typeof sp?.preroll === 'function',
    count: sp?.count ?? null, uTime: uTime === null ? null : +uTime.toFixed(4),
    playerPos: e.get('movement')?.position?.toArray().map((v) => +v.toFixed(2)) ?? null,
    markers: mk,
  };
};

const probeCane = () => {
  const fx = window.__ENGINE.get('fx');
  const out = { hasEMITTERS: !!fx?.EMITTERS, defs: {} };
  if (fx?.EMITTERS) {
    for (const k of ['cane_flash', 'cane_arc', 'cane_spark', 'cane_ring']) {
      const d = fx.EMITTERS[k];
      out.defs[k] = d ? { alpha: [...d.alpha], col0: d.col0, col1: d.col1 } : null;
    }
  }
  out.playerPos = window.__ENGINE.get('movement')?.position?.toArray().map((v) => +v.toFixed(3)) ?? null;
  return out;
};

const probeFog = () => {
  const e = window.__ENGINE;
  const sky = e.get('sky');
  const sh = e.get('shading');
  return {
    sunElevation: +sky.atmosphere.sunElevation.toFixed(3),
    atmoFogColor: sky.atmosphere.fog.color.toArray(),
    atmoFogHex: sky.atmosphere.fog.color.getHexString(),
    sceneFogColor: sky._sceneFog ? sky._sceneFog.color.toArray() : null,
    sceneFogHex: sky._sceneFog ? sky._sceneFog.color.getHexString() : null,
    fogDensity: sky.atmosphere.fog.density,
    uHaze: sh?.uniforms?.uHaze ? sh.uniforms.uHaze.value.toArray().map((v) => +v.toFixed(6)) : null,
    uHazeDensity: sh?.uniforms?.uHazeDensity?.value ?? null,
  };
};

/* ================================================================ chunks */

async function chunk1() {
  const frames = ['base', 'base2', 'cand', 'restore'].map((a) => FRAME('guard', a));
  if (frames.every(existsSync)) { log('chunk 1: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport('1');
  log(`chunk 1 (guard): srcTree ${report.srcTreeBefore} — booting (own lock hold)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — renderer ${info.renderer?.slice(0, 40)} warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    /* Lever probe before anything is believed (§7): the seams must be IN THIS BOOT's bundle.
       fx.EMITTERS + sparkles.preroll come from the same pre-edit as the Guard seam, and the
       bundle is one tree read at boot — their presence proves the tree the boot compiled. */
    const lever = await page.evaluate(() => {
      const fx = window.__ENGINE?.get?.('fx');
      return { hasEMITTERS: !!fx?.EMITTERS, hasPreroll: typeof fx?.sparkles?.preroll === 'function', hasGuards: !!window.__ENGINE?.get?.('guards') };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever)}`);
    if (!lever.hasEMITTERS || !lever.hasPreroll || !lever.hasGuards) {
      report.fatal = 'seams not live in this boot — pre-edit missing from the tree the bundler read';
      save(); log(`  FATAL: ${report.fatal}`); return;
    }
    await armCapture(page, report, save, 'guard', 'base', { probe: probeGuard });
    await armCapture(page, report, save, 'guard', 'base2', { probe: probeGuard });
    await armCapture(page, report, save, 'guard', 'cand', {
      poke: (v) => { window.__ENGINE.debug.guardTowardCamera = v; return { set: v }; }, pokeArg: -0.20,
      probe: probeGuard,
    });
    await armCapture(page, report, save, 'guard', 'restore', {
      poke: () => { delete window.__ENGINE.debug.guardTowardCamera; return { deleted: true }; },
      probe: probeGuard,
    });
    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk 1 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk 1: lock released');
}

/* The registered C-block poke (seal §1 sub-arm C — ships as an Emitters.js edit only on PASS). */
const CANE_POKE = {
  cane_flash: { alpha: [1.3, 1.3], col0: 0xe8912a, col1: 0xd4823a },
  cane_arc: { alpha: [1.0, 1.6], col0: 0xe8912a },
  cane_spark: { alpha: [1.6, 2.4], col0: 0xffc84d },
  cane_ring: { alpha: [1.4, 1.4] },
};

async function chunk2() {
  const frames = [];
  for (const a of ['base', 'cand', 'restore']) { frames.push(FRAME('traversal', a), FRAME('combat', a)); }
  if (frames.every(existsSync)) { log('chunk 2: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport('2');
  log(`chunk 2 (traversal+combat): srcTree ${report.srcTreeBefore} — booting (own lock hold)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    const lever = await page.evaluate(() => {
      const fx = window.__ENGINE?.get?.('fx');
      return {
        hasEMITTERS: !!fx?.EMITTERS, hasPreroll: typeof fx?.sparkles?.preroll === 'function',
        shipped: fx?.EMITTERS ? Object.fromEntries(['cane_flash', 'cane_arc', 'cane_spark', 'cane_ring']
          .map((k) => [k, { alpha: [...fx.EMITTERS[k].alpha], col0: fx.EMITTERS[k].col0, col1: fx.EMITTERS[k].col1 }])) : null,
      };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever).slice(0, 300)}`);
    if (!lever.hasEMITTERS || !lever.hasPreroll) {
      report.fatal = 'seams not live in this boot'; save(); log(`  FATAL: ${report.fatal}`); return;
    }

    /* T — sparkle staging preroll. */
    await armCapture(page, report, save, 'traversal', 'base', { probe: probeSparkle });
    await armCapture(page, report, save, 'traversal', 'cand', {
      poke: () => { window.__ENGINE.debug.sparklePreroll = true; return { set: true }; },
      probe: probeSparkle,
    });
    await armCapture(page, report, save, 'traversal', 'restore', {
      poke: () => { delete window.__ENGINE.debug.sparklePreroll; return { deleted: true }; },
      probe: probeSparkle,
    });

    /* C — cane-impact emitted block, poked as one unit and restored as one unit. */
    await armCapture(page, report, save, 'combat', 'base', { probe: probeCane });
    await armCapture(page, report, save, 'combat', 'cand', {
      poke: (POKE) => {
        const fx = window.__ENGINE.get('fx');
        const before = {};
        for (const [k, v] of Object.entries(POKE)) {
          const d = fx.EMITTERS[k];
          before[k] = { alpha: [...d.alpha], col0: d.col0, col1: d.col1 };
          if (v.alpha) d.alpha = [...v.alpha];
          if (v.col0 !== undefined) d.col0 = v.col0;
          if (v.col1 !== undefined) d.col1 = v.col1;
        }
        window.__FXC_SHIPPED_CANE = before;   // held in-page for the restore arm
        return { requested: POKE, before };
      },
      pokeArg: CANE_POKE,
      probe: probeCane,
    });
    await armCapture(page, report, save, 'combat', 'restore', {
      poke: () => {
        const fx = window.__ENGINE.get('fx');
        const before = window.__FXC_SHIPPED_CANE;
        for (const [k, v] of Object.entries(before)) {
          const d = fx.EMITTERS[k];
          d.alpha = [...v.alpha]; d.col0 = v.col0; d.col1 = v.col1;
        }
        return { restoredFrom: before };
      },
      probe: probeCane,
    });
    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk 2 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk 2: lock released');
}

async function chunk3() {
  const frames = [...['base', 'cand', 'restore'].map((a) => FRAME('dunes', a)), FRAME('interior', 'ship')];
  if (frames.every(existsSync)) { log('chunk 3: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport('3');
  log(`chunk 3 (dunes+interior): srcTree ${report.srcTreeBefore} — booting (own lock hold)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    const lever = await page.evaluate(() => {
      const e = window.__ENGINE;
      const sky = e?.get?.('sky');
      return {
        hasSky: !!sky, hasAtmoFog: !!sky?.atmosphere?.fog?.color, hasSceneFog: !!sky?._sceneFog,
        hasUHaze: !!e?.get?.('shading')?.uniforms?.uHaze,
      };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever)}`);
    if (!lever.hasAtmoFog || !lever.hasSceneFog || !lever.hasUHaze) {
      report.fatal = 'fog poke path absent'; save(); log(`  FATAL: ${report.fatal}`); return;
    }

    /* E — far-haze convergence. base stages; cand/restore poke WITHOUT re-staging (a
       timeOfDay event between poke and capture would re-evaluate the anchors — seal §1E). */
    const base = await armCapture(page, report, save, 'dunes', 'base', { probe: probeFog });
    await armCapture(page, report, save, 'dunes', 'cand', {
      restage: false,
      poke: async () => {
        const e = window.__ENGINE;
        const sky = e.get('sky');
        const THREE = window.__GAME.THREE;
        /* el-15-blended colour of the two SEALED candidate literals, same arithmetic as
           evalAtmosphere: raw=(el-2)/20 eased, Color.lerp in the working space. */
        const el = sky.atmosphere.sunElevation;
        const raw = Math.min(1, Math.max(0, (el - 2) / 20));
        const k = raw * raw * (3 - 2 * raw);
        const c = new THREE.Color(0xc1875b).lerp(new THREE.Color(0xcca269), k);
        const saved = { atmo: sky.atmosphere.fog.color.toArray(), scene: sky._sceneFog.color.toArray() };
        window.__FXC_SHIPPED_FOG = saved;
        sky.atmosphere.fog.color.copy(c);
        sky._sceneFog.color.copy(c);
        await window.__GAME.step(2, 0);   // ToonMaterial per-update fog sync → uHaze + _refreshHazeSun
        return { el, k: +k.toFixed(4), poked: c.toArray(), pokedHex: c.getHexString(), saved };
      },
      probe: probeFog,
    });
    await armCapture(page, report, save, 'dunes', 'restore', {
      restage: false,
      poke: async () => {
        const sky = window.__ENGINE.get('sky');
        const saved = window.__FXC_SHIPPED_FOG;
        sky.atmosphere.fog.color.fromArray(saved.atmo);
        sky._sceneFog.color.fromArray(saved.scene);
        await window.__GAME.step(2, 0);
        return { restored: saved };
      },
      probe: probeFog,
    });
    void base;

    /* D — one interior frame, shipped state, staged fresh AFTER E-restore. */
    await armCapture(page, report, save, 'interior', 'ship', { probe: probeFog });

    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk 3 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk 3: lock released');
}

/* ================================================================ run */

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null;
await applySeams();
if (!only || only === '1') await chunk1();
if (!only || only === '2') await chunk2();
if (!only || only === '3') await chunk3();
log('ALL DONE');
