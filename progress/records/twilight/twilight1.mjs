/**
 * twilight1 — one boot for PREREG-twilight.md (§298 owner decision, DESIGN-twilight Option B).
 * Nine staging blocks x {base, cand, back}, all arms lever pokes on the anchor SOURCE
 * (window.__setTwilightCool from Atmosphere.cand.js), {dt:0} everywhere, NO retries, NO
 * world-clock steps — 36 single renders. §186: candidate installed onLocked (REFUSED if src/
 * is dirty at grant), restored onReleasing, sha-verified. §296: tree stamped PER CAPTURE.
 * Launch ONLY via tools/launch.sh (detached) — §298.3.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { treeState } from '/home/user/Demo/tools/treestate.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const SRC = `${ROOT}/src/render/Atmosphere.js`;
const CAND = `${ROOT}/progress/records/twilight/Atmosphere.cand.js`;
const OUT = `${ROOT}/shots/twilight1`;
const W = 1280, H = 720;

const sha = (b) => createHash('sha256').update(b).digest('hex');
const origBytes = readFileSync(SRC);
const candBytes = readFileSync(CAND);
console.log(`orig sha ${sha(origBytes)}\ncand sha ${sha(candBytes)}`);

/* PREREG §3: expected resolved-state hexes per (tod, lever) — code-derived, asserted V2. */
const EXPECT = {
  anchors: {
    0: { a5sky: '3f5f97', a5ground: '8a5a52', a2sky: '5a86bd', a2ground: 'd08a48' },
    1: { a5sky: '5c54a8', a5ground: '6d5a91', a2sky: '8578d2', a2ground: 'a988c6' },
  },
  state: {
    '0.8':    { 0: ['6fa8d8', 'e8a852'], 1: ['6fa8d8', 'e8a854'], el: 20.975, moon: false },
    '0.8833': { 0: ['5a86bd', 'd08a48'], 1: ['8578d2', 'a988c6'], el: 2.010, moon: false },
    '0.86':   { 0: ['5f8ec3', 'd5914a'], 1: ['8184d3', 'b990b5'], el: 8.000, moon: false },
    '0.9026': { 0: ['4e74ab', 'b1754d'], 1: ['7368be', '8f74ae'], el: -1.512, moon: true },
    '0.83':   { 0: ['6a9fd1', 'e2a04f'], 1: ['769cd6', 'd9a081'], el: 15.000, moon: false },
    '0.79':   { 0: ['6fa8d8', 'e8a852'], 1: ['6fa8d8', 'e8a852'], el: 22.000, moon: false },
    '0.72':   { 0: ['71a9d9', 'e7a854'], 1: ['71a9d9', 'e7a854'], el: 33.000, moon: false },
    '0.76':   { 0: ['6fa8d8', 'e8a852'], 1: ['6fa8d8', 'e8a852'], el: 26.000, moon: false },
    '0.5':    { 0: ['7fb4e0', 'dfa860'], 1: ['7fb4e0', 'dfa860'], el: 76.000, moon: false },
  },
};

/* Staging matrix — PREREG §3. `tod: null` = the shot's own staged tod (no restage). */
const MATRIX = [
  { shot: 'sly-perch', block: 'perch-80',   tod: null,   key: '0.8',    subj: true },
  { shot: 'sly-perch', block: 'perch-TWI1', tod: 0.8833, key: '0.8833', subj: true },
  { shot: 'sly-perch', block: 'perch-TWI2', tod: 0.86,   key: '0.86',   subj: true },
  { shot: 'sly-perch', block: 'perch-TWI3', tod: 0.9026, key: '0.9026', subj: true },
  { shot: 'sly-arm',   block: 'arm-80',     tod: null,   key: '0.8',    subj: true },
  { shot: 'sly-arm',   block: 'arm-TWI1',   tod: 0.8833, key: '0.8833', subj: true },
  { shot: 'sly-arm',   block: 'arm-TWI2',   tod: 0.86,   key: '0.86',   subj: true },
  { shot: 'dunes',     block: 'dunes',      tod: null,   key: '0.83',   subj: false },
  { shot: 'hero',      block: 'hero',       tod: null,   key: '0.79',   subj: false },
  { shot: 'temple',    block: 'temple',     tod: null,   key: '0.72',   subj: false },
  { shot: 'courtyard', block: 'courtyard',  tod: null,   key: '0.76',   subj: false },
  { shot: 'interior',  block: 'interior',   tod: null,   key: '0.5',    subj: false },
];

/* In-page: stage (setShot once per shot, tod reassign WITHOUT emit for twilight blocks),
   apply lever, re-derive through the shipped consumers, render 3x dt=0, probe, capture. */
const ARM = `async (cfg) => {
  const G = window.__GAME, E = window.__ENGINE;
  const T = window.__GAME.THREE;
  if (cfg.stageShot) await G.setShot(cfg.stageShot, { dt: 0 });
  if (cfg.retod != null) { E.debug.timeOfDay = cfg.retod; }   // NO emit: PREREG §3
  if (typeof window.__setTwilightCool !== 'function') return { error: 'lever missing — cand not installed?' };
  const rb = window.__setTwilightCool(cfg.lever);
  const L = E.get('lighting'), sky = E.get('sky');
  L._applyAtmosphere();
  if (sky) sky._dirty = true;
  for (let i = 0; i < 3; i++) E.renderFrame(0);
  const A = L.atmosphere, p = L._keyPayload;
  const hx = (c) => c.getHexString();
  const probe = {
    time: +E.time.toFixed(4), tod: +A.tod.toFixed(4), el: +A.sunElevation.toFixed(3),
    keyIsMoon: A.keyIsMoon, key: hx(A.keyColor), keyI: +A.keyIntensity.toFixed(3),
    anchors: rb,
    state: [hx(A.hemiSky), hx(A.hemiGround), hx(A.ambientColor)],
    light: [hx(L._hemi.color), hx(L._hemi.groundColor), hx(L._ambient.color)],
    payload: [hx(p.ambient.sky), hx(p.ambient.ground)],
    subjBBox: null,
  };
  if (cfg.wantSubj) {
    const ch = E.get('character');
    if (ch?.root) {
      const c = ch.root.position, v = new T.Vector3(); const cam = E.camera;
      cam.updateMatrixWorld(true);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
      for (const [dx, dy, dz] of [[-1.2,0,-1.2],[1.2,0,-1.2],[-1.2,0,1.2],[1.2,0,1.2],
                                  [-1.2,1.9,-1.2],[1.2,1.9,-1.2],[-1.2,1.9,1.2],[1.2,1.9,1.2]]) {
        v.set(c.x + dx, c.y + dy, c.z + dz).project(cam);
        if (v.z > 1) behind = true;
        x0 = Math.min(x0, (v.x * 0.5 + 0.5) * ${W}); y0 = Math.min(y0, (-v.y * 0.5 + 0.5) * ${H});
        x1 = Math.max(x1, (v.x * 0.5 + 0.5) * ${W}); y1 = Math.max(y1, (-v.y * 0.5 + 0.5) * ${H});
      }
      probe.subjBBox = behind ? 'BEHIND' : [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
    }
  }
  return { probe, dataUrl: G.capture('image/png') };
}`;

let installed = false;
let abortReason = null;

const res = await withGame({
  width: W, height: H, quality: 'high', timeout: 3300000,
  onLocked: async () => {
    /* V0 (PREREG §5): refuse a dirty tree — the torch-run-2 failure class. Do NOT throw
       (onLocked runs outside withGame's try; a throw strands the lock on a dead pid). */
    const dirty = execSync('git status --short -- src/', { cwd: ROOT }).toString().trim();
    if (dirty) {
      abortReason = `src dirty at lock grant: ${dirty.split('\n').join(' | ')}`;
      console.log(`!! ABORT (V0): ${abortReason}`);
      return;
    }
    const stamp = { ...treeState(), at: new Date().toISOString() };
    writeFileSync(`${ROOT}/progress/records/twilight/treestamp-lock.json`, JSON.stringify(stamp, null, 1));
    console.log(`treestamp at lock: head ${stamp.head} srcTree ${stamp.src}`);
    writeFileSync(SRC, candBytes);
    installed = true;
    console.log(`installed candidate -> ${SRC} (sha ${sha(readFileSync(SRC))})`);
  },
  onReleasing: async () => {
    if (!installed) return;
    writeFileSync(SRC, origBytes);
    const back = sha(readFileSync(SRC));
    console.log(`restored ${SRC} (sha ${back}) ${back === sha(origBytes) ? '== orig OK' : '!! MISMATCH'}`);
  },
}, async ({ page, info }) => {
  if (abortReason) return { aborted: abortReason };
  console.log(`renderer: ${info.renderer}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);
  mkdirSync(OUT, { recursive: true });
  const acc = {
    prereg: 'PREREG-twilight.md', renderer: info.renderer, warnings: info.warnings,
    origSha: sha(origBytes), candSha: sha(candBytes), expect: EXPECT, jobs: {},
  };

  for (const b of MATRIX) {
    let firstArm = true;
    for (const [label, lever] of [['base', 0], ['cand', 1], ['back', 0]]) {
      const t0 = Date.now();
      const cfg = {
        stageShot: firstArm ? b.shot : null,
        // restage tod on the FIRST arm of a twilight block only (it survives the block):
        retod: firstArm ? b.tod : null,
        lever, wantSubj: b.subj,
      };
      const r = await page.evaluate(async ([armBody, c]) => (0, eval)('(' + armBody + ')')(c), [ARM, cfg]);
      if (r.error) { console.log(`!! ${b.block}.${label}: ${r.error}`); acc.jobs[`${b.block}.${label}`] = { error: r.error }; break; }
      firstArm = false;
      writeFileSync(path.join(OUT, `${b.block}.${label}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      const stamp = treeState();                       // §296: PER CAPTURE
      acc.jobs[`${b.block}.${label}`] = { probe: r.probe, tree: stamp };
      const p = r.probe;
      const exp = EXPECT.state[b.key];
      const okState = p.state[0] === exp[lever][0] && p.state[1] === exp[lever][1];
      const okProp = p.state[0] === p.light[0] && p.state[0] === p.payload[0]
        && p.state[1] === p.light[1] && p.state[1] === p.payload[1];
      const okEl = Math.abs(p.el - exp.el) <= (b.key === '0.9026' ? 0.1 : 0.05) && p.keyIsMoon === exp.moon;
      console.log(`--- ${b.block}.${label}  ${((Date.now() - t0) / 1000) | 0}s  tod=${p.tod} el=${p.el} `
        + `key=${p.key}@${p.keyI}${p.keyIsMoon ? ' MOON' : ''}  hemi=${p.state[0]}/${p.state[1]} `
        + `${okState ? 'state:OK' : 'state:MISMATCH!'} ${okProp ? 'prop:OK' : 'prop:MISMATCH!'} ${okEl ? 'el:OK' : 'el:MISMATCH!'} `
        + `tree=${stamp.src.slice(0, 12)}${p.subjBBox ? ` subj=${JSON.stringify(p.subjBBox)}` : ''}`);
    }
    writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(acc, null, 1));  // checkpoint per block
  }
  return acc;
});

if (res?.aborted) {
  console.log(`twilight1 VOID (V0): ${res.aborted}`);
  process.exit(2);
}
writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1));
console.log(`\ntwilight1 DONE -> ${OUT}/run.json`);
