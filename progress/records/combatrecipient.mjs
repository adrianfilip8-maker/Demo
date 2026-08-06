#!/usr/bin/env node
/**
 * combatrecipient — capture harness for PREREG-combatrecipient.md.
 *
 *   node progress/records/combatrecipient.mjs <arm> [shot ...]
 *
 * ONE ARM PER BOOT. The arms are source values in `src/ai/Guard.js` (`SHOT_POSE.combat` and
 * `_poseForShot`'s restore), and the bundler reads the tree at BOOT, not at capture (§124.4) —
 * so the tree must already be in the arm's state before this is launched, and this script does
 * NOT edit source. It records the tree hash it actually rendered so a mis-staged arm is
 * detectable afterwards rather than silently scored (§121.4: hash `src/**\/*.js`, not the git SHA
 * — five owners commit concurrently and three arms of one A/B once stamped different SHAs on a
 * byte-identical tree).
 *
 * What it adds over `tools/critic.mjs`, and why:
 *
 *   TELEMETRY. After every staged shot it dumps every guard's world position/yaw/type/route/clip,
 *   the resolved camera, and which roster index `_shotLock` holds. That is free — it is a
 *   `page.evaluate`, not a frame — and it is what lets ONE captured `sly-profile` gate the
 *   residue for all five shots that stage the player at (0,0,30) (P4c/P4d).
 *
 *   READ THE HEADER OF WHAT THIS PROVES, NOT ITS USAGE (§143.1). The telemetry reads
 *   `g.position`, which is the value the mechanism under test SETS. It therefore cannot fail if
 *   the code ran: it is a PLUMBING CHECK, not a result. Every decisive gate in the prereg is a
 *   pixel gate. Where telemetry and pixels disagree, the pixels win.
 *
 * Frames land in `progress/records/combatrecipient1/<shot>-<arm>.png`, telemetry in
 * `telemetry-<arm>.json`, written INCREMENTALLY — each shot's PNG is on disk before the next is
 * staged, because the container rolls back roughly every 45 minutes (§163) and a chunk that dies
 * half way must still leave behind whatever it actually captured.
 */
import { withGame, grab, ROOT } from '../../tools/harness.mjs';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join(ROOT, 'progress', 'records', 'combatrecipient1');
const argv = process.argv.slice(2);
const ARM = argv[0];
if (!ARM) { console.error('usage: combatrecipient.mjs <arm> [shot ...]'); process.exit(2); }
const SHOTS = argv.slice(1).length ? argv.slice(1) : ['combat', 'sly-profile'];

/** sha256 of the rendered source tree. Paths are relative to ROOT deliberately: `sha256sum`
 *  hashes the path too, so an absolute path gives a different digest for a bit-identical tree. */
async function srcHash() {
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(js|glsl\.js|mjs)$/.test(e.name)) files.push(p);
    }
  };
  await walk(path.join(ROOT, 'src'));
  files.sort();
  const h = createHash('sha256');
  for (const f of files) { h.update(path.relative(ROOT, f)); h.update(readFileSync(f)); }
  return { hash: h.digest('hex').slice(0, 16), files: files.length };
}

/* The five shots that stage the player at exactly (0,0,30) plus the one at (4,0,30), read out of
   src/core/Shots.js. P4d projects the dumped guard positions through these without capturing
   them: a guard body that misses all six viewports cannot regress any of them. */
const SPAWN_CAMS = {
  'sly-closeup': { pos: [-1.6, 1.45, 33.2], target: [0.0, 0.95, 30.0], fov: 38 },
  'sly-startle': { pos: [-2.21, 1.60, 31.78], target: [-0.08, 1.11, 30.03], fov: 22 },
  'sly-perch': { pos: [-1.6, 1.15, 33.2], target: [0.0, 0.65, 30.0], fov: 38 },
  'sly-arm': { pos: [-3.10, 1.45, 28.21], target: [0.0, 0.95, 30.0], fov: 38 },
  'sly-profile': { pos: [2.21, 1.70, 33.13], target: [0.0, 0.88, 30.0], fov: 38 },
  'sly-key': { pos: [2.4, 1.45, 33.2], target: [4.0, 0.95, 30.0], fov: 38 },
};

/* Screen bbox of an upright 2r x h x 2r box, and whether it OVERLAPS the viewport.
   Not "is a corner inside the viewport": a body that straddles the whole frame has every
   corner outside it, which reported `sly-startle` — where the residue fills the frame — as
   safe while I was writing the prereg. */
function bodyBox(cam, stand, h = 1.95, r = 0.42, W = 1280, H = 720) {
  const [px, py, pz] = cam.pos, [tx, ty, tz] = cam.target;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const back = nrm(sub([px, py, pz], [tx, ty, tz]));
  let right = crs([0, 1, 0], back);
  right = dot(right, right) < 1e-12 ? [1, 0, 0] : nrm(right);
  const up = crs(back, right);
  const t = Math.tan((cam.fov * Math.PI / 180) * 0.5), aspect = W / H;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity, ok = false;
  for (const dx of [-r, r]) for (const dz of [-r, r]) for (const dy of [0, h]) {
    const w = [stand[0] + dx, stand[1] + dy, stand[2] + dz];
    const v = sub(w, [px, py, pz]);
    const depth = -dot(v, back);
    if (depth <= 1e-6) continue;
    ok = true;
    const sx = (dot(v, right) / (t * aspect * depth) + 1) * 0.5 * W;
    const sy = (1 - dot(v, up) / (t * depth)) * 0.5 * H;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    d0 = Math.min(d0, depth); d1 = Math.max(d1, depth);
  }
  if (!ok) return { behind: true, overlaps: false };
  return {
    behind: false, x0: +x0.toFixed(1), x1: +x1.toFixed(1), y0: +y0.toFixed(1), y1: +y1.toFixed(1),
    d0: +d0.toFixed(2), d1: +d1.toFixed(2), overlaps: x1 > 0 && x0 < W && y1 > 0 && y0 < H,
  };
}

const ANCHOR = [0.3146, 1.3849, 28.9963];   // Particles._stageShot()'s hardcoded impact point
const STAND = [0.102, 0.0, 29.035];         // the predicted screenSide:+1 recipient stand

async function dumpGuards(page) {
  return page.evaluate(() => {
    const e = window.__ENGINE;
    const G = e?.get?.('guards');
    const cam = e?.camera;
    const out = { guards: [], lock: null, cam: null, warnings: (window.__GAME?.warnings || []).length };
    if (cam) {
      cam.updateMatrixWorld(true);
      const p = cam.position;
      out.cam = { pos: [p.x, p.y, p.z], fov: cam.fov, aspect: cam.aspect };
    }
    if (!G?.list) return out;
    out.lock = G._shotLock ? G.list.indexOf(G._shotLock) : -1;
    out.shot = G._shot ?? null;
    /* GuardAnim stores the clip OBJECT, not its name, so recover the name by identity —
       reading back "which clip is frozen" is the only way to confirm SHOT_POSE.clip took. */
    const clipName = (anim) => {
      if (!anim?.clip || !anim.clips) return null;
      for (const k of Object.keys(anim.clips)) if (anim.clips[k] === anim.clip) return k;
      return null;
    };
    for (let i = 0; i < G.list.length; i++) {
      const g = G.list[i];
      out.guards.push({
        i, type: g.type, name: g.name,
        pos: [+g.position.x.toFixed(4), +g.position.y.toFixed(4), +g.position.z.toFixed(4)],
        yaw: +g.yaw.toFixed(4), u: +(g.u ?? 0).toFixed(4), state: g.state,
        clip: clipName(g.anim),
        frozen: !!g.anim?._frozen, animT: +(g.anim?.time ?? 0).toFixed(4),
        visible: !!g.root?.visible,
      });
    }
    return out;
  });
}

function analyse(dump) {
  const a = { minDistToAnchor: null, minDistToStand: null, lockPos: null, spawnHits: {} };
  if (!dump.guards?.length) return a;
  let mA = Infinity, mS = Infinity;
  for (const g of dump.guards) {
    mA = Math.min(mA, Math.hypot(g.pos[0] - ANCHOR[0], g.pos[2] - ANCHOR[2]));
    mS = Math.min(mS, Math.hypot(g.pos[0] - STAND[0], g.pos[2] - STAND[2]));
  }
  a.minDistToAnchor = +mA.toFixed(4);
  a.minDistToStand = +mS.toFixed(4);
  if (dump.lock >= 0) a.lockPos = dump.guards[dump.lock]?.pos ?? null;
  // P4d: project EVERY guard through the six spawn cameras.
  for (const [name, cam] of Object.entries(SPAWN_CAMS)) {
    const hits = [];
    for (const g of dump.guards) {
      const h = TUNE_HEAD[g.type] ?? 1.95, r = TUNE_RAD[g.type] ?? 0.42;
      const b = bodyBox(cam, g.pos, h, r);
      if (b.overlaps) hits.push({ i: g.i, type: g.type, pos: g.pos, box: b });
    }
    a.spawnHits[name] = hits;
  }
  return a;
}
const TUNE_HEAD = { temple: 1.95, heavy: 2.22, scarab: 0.34 };
const TUNE_RAD = { temple: 0.42, heavy: 0.56, scarab: 0.26 };

async function main() {
  await mkdir(OUT, { recursive: true });
  const tree = await srcHash();
  process.stdout.write(`· arm "${ARM}"  srcTree ${tree.hash} (${tree.files} files)  shots: ${SHOTS.join(', ')}\n`);

  const telemetry = {
    arm: ARM, at: new Date().toISOString(), srcTree: tree.hash, srcFiles: tree.files,
    order: SHOTS, shots: {},
  };
  const flush = () => writeFile(path.join(OUT, `telemetry-${ARM}.json`),
    JSON.stringify(telemetry, null, 2));

  await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
    /* Re-hash the tree AFTER the boot, not only before the lock wait. The launch-time hash is
       taken minutes (sometimes an hour) before `withGame` acquires the FIFO lock and Vite reads
       the tree, so on its own it is a number that does not depend on the thing it claims to
       measure — the DIGEST's recurring defect. Both are recorded; `srcStable` is the one to
       read, and a false there voids the arm. */
    const boot = await srcHash();
    telemetry.srcTreeAtBoot = boot.hash;
    telemetry.srcStable = boot.hash === tree.hash;
    if (!telemetry.srcStable) {
      process.stdout.write(`!! TREE MOVED between launch (${tree.hash}) and boot (${boot.hash}) `
        + '— this arm is VOID, the frames do not render the tree that was registered\n');
    }
    telemetry.renderer = info.renderer;
    telemetry.bootWarnings = info.warnings;
    telemetry.consoleErrors = info.consoleErrors;
    telemetry.modules = info.modules;
    await flush();

    for (const name of SHOTS) {
      const t0 = Date.now();
      const r = await grab(page, name);
      const png = path.join(OUT, `${name}-${ARM}.png`);
      await writeFile(png, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      /* The PNG is already on disk. Telemetry must never be able to cost a captured frame or
         the shot that would have followed it — a diagnostic that kills the run destroys the
         evidence (Debug.js's own rule, §5). */
      let dump = { error: null }, derived = { error: null };
      try { dump = await dumpGuards(page); } catch (err) { dump = { error: String(err?.message || err) }; }
      try { derived = analyse(dump); } catch (err) { derived = { error: String(err?.message || err) }; }
      telemetry.shots[name] = {
        secs: +((Date.now() - t0) / 1000).toFixed(1),
        stats: r.stats, warnings: r.warnings,
        guards: dump, derived,
      };
      await flush();                                   // incremental: survive a rollback
      const d = telemetry.shots[name].derived;
      const hits = d.spawnHits
        ? Object.entries(d.spawnHits).filter(([, v]) => v.length).map(([k, v]) => `${k}:${v.length}`).join(',') || 'none'
        : 'n/a';
      process.stdout.write(
        `  OK ${name}  ${telemetry.shots[name].secs}s  lock=${dump.lock}`
        + `  minDist(anchor)=${d.minDistToAnchor}  minDist(stand)=${d.minDistToStand}`
        + `  spawnHits=${hits}\n`);
    }
  });

  await flush();
  process.stdout.write(`DONE arm=${ARM} srcTree=${tree.hash}\n`);
}

main().catch((e) => { console.error('FAILED:', e?.stack || e); process.exit(1); });
