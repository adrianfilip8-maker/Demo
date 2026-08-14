#!/usr/bin/env node
/* canegold3 — does the DIELECTRIC cell make Sly's cane read as gold?
 *
 * Scores `progress/records/PREREG-canegold3.md`, sealed and pushed before this file existed.
 * Read that seal, not this header, for why each threshold is what it is.
 *
 * ONE boot. Every arm is a live poke of `mat.userData.slyUniforms` (+ `mat.roughness`,
 * + `mat.color`) on the material named `slydlrig:cane` and NOTHING else, followed by
 * `setShot(shot, { dt: 0 })` (§251). No recompile can reorder draws between arms, and because
 * this runner installs nothing into `src/**` it cannot trip §186's install-then-launch hazard:
 * the edit that does not exist cannot sit on disk during an hour of FIFO wait.
 *
 * §302: the ONLY [0,0] bars registered anywhere here are SAME-BOOT — after every candidate arm
 * the cane is restored from the live-read base state and re-rendered against that shot's own
 * `base` frame. No cross-boot pixel bar is claimed.
 *
 * §282: the one inherited constant is the `sly-closeup` cane-mask ceiling 55 000, derived in
 * RESULT-caneswap2 for THIS shot on THIS asset. It is not applied to `sly-key`, where no
 * ceiling has ever been derived — that mask is reported and gates nothing. Stated in the seal
 * §3 and again at the check itself.
 *
 * The cane's screen footprint comes from ALBEDO TAGGING (recolour the material, difference the
 * frames), never from hiding: hiding a mesh changes the shadow map and everything downstream of
 * the object being in the scene — `tools/canegold.mjs` measured 66 941 px of "cane" that way for
 * a 1 356-triangle prop. Recolouring leaves geometry, shadows and pose bit-identical, so the
 * pixels that move are exactly the pixels that material paints.
 *
 *   usage:  node tools/canegold3.mjs             # boot, capture, score, write
 *           node tools/canegold3.mjs --score-only  # re-score result.json, no boot, no lock
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { withGame } from './harness.mjs';
import { shipVerdict, verdictLine, guardState } from './gate.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'progress/records/canegold3');
const SCORE_ONLY = process.argv.includes('--score-only');

/* §296, "one locked boot is NOT one tree". Five other lanes are queueing runs on this shared
 * working tree right now and four `src/**` files carry their uncommitted mechanisms as I write
 * this. A boot compiles whatever is on disk at the moment the bundler reads it, so the tree is
 * stamped INSIDE the held lock (§192.1: a stamp taken at process construction samples the queue,
 * not the boot — the FIFO wait here is measured in tens of minutes) and again at the end. A
 * mid-boot move does not invalidate the run by itself, but an unstamped one is unfalsifiable,
 * and this lane's arms are all runtime pokes, so a moving tree can only enter as a common-mode
 * term across every arm. Both stamps land in result.json. */
const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* Gate shot first. `sly-closeup` carries every G-bar (it is the shot PREREG-charmat's G1/G2
   were always registered on, and the shot RESULT-caneswap2 derived the mask ceiling on).
   `sly-key` carries R1 only — the replication gate. `sly-profile` is BASE-ONLY and gates
   nothing: it is the positive control for DIAG-charmat13's re-aimed tail item, captured here
   because the boot is already paid for. */
const GATE_SHOT = 'sly-closeup';
const REP_SHOT = 'sly-key';
const DIAG_SHOT = 'sly-profile';
const SHOTS = [GATE_SHOT, REP_SHOT, DIAG_SHOT];

/* PREREG-canegold3 §5 — the provenance of every number is in the seal's table. Nothing here is
   a taste choice: 0xe8b942 is this material's OWN no-asset fallback colour and Props.js
   MATERIALS.gold.color; 0.90 is MATERIALS.gold.spec; 96 is MATERIALS.gold.gloss; 0.25 is the
   asset's own metalRough green channel (tools/glbpeek.mjs, quoted in tools/canegold.mjs). */
const GOLD_HEX = 0xe8b942;
const ARMS = [
  ['fillonly',  { color: GOLD_HEX }],
  ['speconly',  { spec: 0.90, rough: 0.25, metal: 0 }],
  ['hardgold',  { color: GOLD_HEX, spec: 0.90, gloss: 32, rough: 0.25, metal: 0 }],
  ['hardgold2', { color: GOLD_HEX, spec: 0.90, gloss: 96, rough: 0.25, metal: 0 }],
];
const CAND = ['hardgold', 'hardgold2'];          // the two ship candidates; the others attribute
const OTHER_MATS = ['slydlrig:body', 'slydlrig:head', 'slydlrig:tail', 'slydlrig:eyeball'];

/* PREREG-canegold3 §4 — sealed. Do not edit these after a candidate frame exists (§141.1). */
const BAR = {
  pingL: 248,          // above r12's max 244.0/244.8 and canegold run 2's base max 239.4
  pingPx: 200,         // PREREG-specnorm2's H1 visibility unit: 0.02% of 1280x720 = 184, rounded up
  sep: 60,             // 2x the measured defective separation (29.4 / 30.2 L)
  satMin: 0.44,        // midpoint of measured cream 0.172 and the anchor 0xe8b942's 0.7155
  hueLo: 30, hueHi: 55, // contains BOTH base 37.7 and anchor 43.0 — a hue HOLD, not a hue ask
  lMin: 140, lMax: 200, // 0.75 x anchor luma 186.4 ; toon.glsl.js's own quoted lit-stone cap
  haloMin: 300,        // a third of canegold run 2's measured 1074/1076 px whole-cane halo
  haloNearFrac: 0.50,  // the discriminating half: a ping concentrates its halo, a wash does not
  nearPx: 12,          // calibrate-then-accept, disclosed in the seal §4
  maskLo: 30000, maskHi: 55000,   // sly-closeup ONLY (§282; RESULT-caneswap2 measured 41 084)
};

/* ------------------------------------------------------------------ capture ---------------- */

async function capture() {
  if (existsSync(OUT) && readdirSync(OUT).length > 0) {
    throw new Error(`ABORT: ${OUT} exists and is non-empty. This runner never resumes.\n`
      + `  Archive it (mv ${OUT} ${OUT}-void-runN) and relaunch under a NEW seal if the`
      + ` previous run produced a verdict.`);
  }
  mkdirSync(OUT, { recursive: true });

  let srcTreeBefore = null;
  return withGame({
    width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000,
    /* §192.1: read the tree once the FIFO ticket is HELD, not at process construction. */
    onLocked: () => { srcTreeBefore = treeHash(); console.log(`srcTree at lock: ${srcTreeBefore}`); },
  }, async ({ page, info }) => {
    await page.evaluate(() => {
      const W = window;
      W.__CAP = {};
      W.__mats = (name) => {
        const out = [];
        W.__ENGINE.scene.traverse((o) => {
          const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of ms) if (m && m.name === name) out.push(m);
        });
        return out;
      };
      W.__caneMesh = () => { let f = null; W.__ENGINE.scene.traverse((o) => { if (o.name === 'cane') f = o; }); return f; };
      W.__tagColor = (name, hex) => { const out = [];
        for (const m of W.__mats(name)) { out.push(m.color.getHex()); m.color.setHex(hex); } return out; };
      W.__restoreColor = (name, hexes) => { let i = 0; for (const m of W.__mats(name)) m.color.setHex(hexes[i++]); };
      /* Poke, then READ BACK. A poke that silently no-ops is the failure mode the whole
         measurement is worthless under, so the readback is returned and asserted by the caller. */
      W.__poke = (name, v) => {
        for (const m of W.__mats(name)) {
          const u = m.userData?.slyUniforms;
          if (!u) continue;
          if (v.spec != null) u.uSpec.value = v.spec;
          if (v.gloss != null) u.uGloss.value = v.gloss;
          if (v.metal != null) u.uMetal.value = v.metal;
          if (v.sss != null) u.uSss.value = v.sss;
          if (v.rough != null) m.roughness = v.rough;
          if (v.color != null) m.color.setHex(v.color);
        }
        return W.__readMat(name);
      };
      W.__readMat = (name) => W.__mats(name).map((m) => ({
        spec: m.userData?.slyUniforms?.uSpec?.value, gloss: m.userData?.slyUniforms?.uGloss?.value,
        metal: m.userData?.slyUniforms?.uMetal?.value, sss: m.userData?.slyUniforms?.uSss?.value,
        rim: m.userData?.slyUniforms?.uRim?.value, rough: m.roughness, color: m.color.getHex(),
      }));
      /* P7 (§294(2)): a material poke cannot move geometry. Anything that does is an instrument
         fault, and this is the cheapest exact witness of it — no extra render. */
      W.__geom = () => {
        const c = W.__caneMesh();
        if (!c) return null;
        const p = c.geometry.attributes.position;
        c.updateWorldMatrix(true, false);
        return { count: p.count, version: p.version, m: Array.from(c.matrixWorld.elements) };
      };
      W.__snap = async (key, shot) => {
        const r = await W.__GAME.setShot(shot, { dt: 0 });
        const url = W.__GAME.capture('image/png', 1.0, 0);
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        W.__CAP[key] = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data, url };
        return { w: img.width, h: img.height, warnings: r.warnings.length };
      };
      W.__png = (key) => W.__CAP[key].url;
      W.__drop = (key) => { if (W.__CAP[key]) W.__CAP[key].url = null; };
      W.__L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      W.__hsv = (d, i) => {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B), dd = mx - mn;
        let h = 0;
        if (dd) { if (mx === R) h = 60 * (((G - B) / dd) % 6); else if (mx === G) h = 60 * ((B - R) / dd + 2); else h = 60 * ((R - G) / dd + 4); }
        return [((h % 360) + 360) % 360, mx ? dd / mx : 0, mx];
      };
      W.__diff = (a, b, wantIdx) => {
        const A = W.__CAP[a], B = W.__CAP[b];
        let n = 0; const idx = [];
        for (let i = 0; i < A.d.length; i += 4) {
          if (A.d[i] !== B.d[i] || A.d[i + 1] !== B.d[i + 1] || A.d[i + 2] !== B.d[i + 2]) { n++; if (wantIdx) idx.push(i); }
        }
        return wantIdx ? { n, idx } : { n };
      };
      /* Everything §4 gates on, from one pass over the mask. Circular median for hue, because a
         linear median of an angle is a different statistic and this one straddles no wrap here
         but must not silently become wrong if a candidate moves it. */
      W.__stats = (key, idx, pingL) => {
        const A = W.__CAP[key];
        const L = new Float64Array(idx.length), S = new Float64Array(idx.length);
        let sx = 0, sy = 0, ping = 0;
        for (let k = 0; k < idx.length; k++) {
          const i = idx[k];
          L[k] = W.__L(A.d, i);
          const [h, s] = W.__hsv(A.d, i);
          S[k] = s;
          const r = h * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r);
          if (L[k] >= pingL) ping++;
        }
        L.sort(); S.sort();
        const q = (v, p) => (v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))] : null);
        let hue = Math.atan2(sy, sx) * 180 / Math.PI; if (hue < 0) hue += 360;
        return {
          n: idx.length, ping,
          Lp50: q(L, 0.5), Lp90: q(L, 0.9), Lp99: q(L, 0.99), Lp999: q(L, 0.999), Lmax: q(L, 1),
          satP50: q(S, 0.5), satP90: q(S, 0.9), hueMean: hue,
        };
      };
      W.__maskBox = (idx, w, h, pad) => {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const i of idx) { const p = i / 4, x = p % w, y = (p / w) | 0;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad),
          x1: Math.min(w - 1, x1 + pad), y1: Math.min(h - 1, y1 + pad) };
      };
      /* G4 + P6 in one pass. `far` is P6's environment guard (must be 0); `halo` is the bloom
         population; `haloNear` is the share of it that sits within `near` px of a ping pixel of
         the candidate frame — the statistic that separates a highlight from a wash. */
      W.__outside = (a, b, idx, box, pingL, near) => {
        const A = W.__CAP[a], B = W.__CAP[b], w = A.w, h = A.h;
        const inMask = new Uint8Array(A.d.length / 4);
        for (const i of idx) inMask[i / 4] = 1;
        const ping = [];
        for (const i of idx) if (W.__L(B.d, i) >= pingL) ping.push(i / 4);
        /* Stamp a dilated ping footprint once, then test halo pixels against it — O(area),
           not O(halo x ping), which at 40k mask px would not finish. */
        const near8 = new Uint8Array(A.d.length / 4);
        for (const p of ping) {
          const px = p % w, py = (p / w) | 0;
          for (let y = Math.max(0, py - near); y <= Math.min(h - 1, py + near); y++)
            for (let x = Math.max(0, px - near); x <= Math.min(w - 1, px + near); x++) near8[y * w + x] = 1;
        }
        let n = 0, far = 0, halo = 0, haloNear = 0;
        for (let i = 0; i < A.d.length; i += 4) {
          const p = i / 4;
          if (inMask[p]) continue;
          if (A.d[i] === B.d[i] && A.d[i + 1] === B.d[i + 1] && A.d[i + 2] === B.d[i + 2]) continue;
          n++;
          const x = p % w, y = (p / w) | 0;
          if (box && (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1)) far++;
          else { halo++; if (near8[p]) haloNear++; }
        }
        return { n, far, halo, haloNear, ping: ping.length };
      };
      /* DIAG-charmat13's re-aimed tail item: the exact in-frame band ratio on the tail's own
         pixels, to be read against the per-yaw ALBEDO ratios that record publishes. Diagnostic
         only — this seal registers no bar on it. */
      W.__bandRatio = (key, idx) => {
        const A = W.__CAP[key], v = new Float64Array(idx.length);
        for (let k = 0; k < idx.length; k++) v[k] = W.__L(A.d, idx[k]);
        v.sort();
        const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))] : null);
        const p05 = q(0.05), p95 = q(0.95);
        return { n: v.length, p10: q(0.10), p50: q(0.5), p90: q(0.90), p05, p95,
          ratio: q(0.10) > 0 ? q(0.90) / q(0.10) : null,
          michelson: (p95 + p05) > 0 ? (p95 - p05) / (p95 + p05) : null };
      };
    });

    const writePng = async (key, file) => {
      const url = await page.evaluate(([k]) => window.__png(k), [key]);
      if (!url) return;
      writeFileSync(path.join(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
      await page.evaluate(([k]) => window.__drop(k), [key]);   // free the data URL, keep the pixels
    };

    const BASE_STATE = await page.evaluate(([names]) => {
      const out = {};
      for (const n of names) out[n] = window.__readMat(n)[0] || null;
      return out;
    }, [['slydlrig:cane', ...OTHER_MATS]]);
    console.log('shipped material state, read off the live build (this is what "base" means):');
    for (const [k, v] of Object.entries(BASE_STATE)) console.log(`  ${k.padEnd(20)} ${JSON.stringify(v)}`);
    for (const [k, v] of Object.entries(BASE_STATE)) {
      if (!v) throw new Error(`${k} is not in the scene — the run would be VOID`);
    }

    const R = {
      at: new Date().toISOString(), renderer: info.renderer, srcTreeBefore,
      bootWarnings: info.warnings?.length ?? null, baseState: BASE_STATE, shots: {},
    };

    for (const shot of SHOTS) {
      console.log(`\n${'='.repeat(78)}\n### ${shot}`);
      const rec = { arms: {} };
      const diagOnly = shot === DIAG_SHOT;

      rec.geom0 = await page.evaluate(() => window.__geom());
      await page.evaluate(([s]) => window.__snap('base', s), [shot]);
      await page.evaluate(([s]) => window.__snap('base2', s), [shot]);
      rec.P2_null = (await page.evaluate(() => window.__diff('base', 'base2'))).n;
      await writePng('base', `${shot}.base.png`);

      /* ---- the cane mask: tag, difference, restore, prove the restore ---- */
      await page.evaluate(([s]) => {
        window.__CANEHEX = window.__tagColor('slydlrig:cane', 0xff00ff);
        return window.__snap('tag', s);
      }, [shot]);
      const mask = await page.evaluate(() => {
        const d = window.__diff('base', 'tag', true);
        window.__MASK = d.idx;
        window.__BOX = d.idx.length ? window.__maskBox(d.idx, window.__CAP.base.w, window.__CAP.base.h, 16) : null;
        return { n: d.n, box: window.__BOX };
      });
      await page.evaluate(([s]) => { window.__restoreColor('slydlrig:cane', window.__CANEHEX); return window.__snap('reshow', s); }, [shot]);
      rec.P3_mask = mask.n; rec.box = mask.box;
      rec.P4_reshow = (await page.evaluate(() => window.__diff('base', 'reshow'))).n;

      /* ---- the tail mask, DIAGNOSTIC only (DIAG-charmat13's re-aimed item) ---- */
      if (shot !== GATE_SHOT) {
        await page.evaluate(([s]) => { window.__TAILHEX = window.__tagColor('slydlrig:tail', 0x00ff00); return window.__snap('tailtag', s); }, [shot]);
        rec.tail = await page.evaluate(() => {
          const d = window.__diff('base', 'tailtag', true);
          return { mask: d.n, inFrame: window.__bandRatio('base', d.idx) };
        });
        await page.evaluate(([s]) => { window.__restoreColor('slydlrig:tail', window.__TAILHEX); return window.__snap('tailreshow', s); }, [shot]);
        rec.tailReshow = (await page.evaluate(() => window.__diff('base', 'tailreshow'))).n;
      }

      rec.baseStats = await page.evaluate(([p]) => window.__stats('base', window.__MASK, p), [BAR.pingL]);

      if (!diagOnly) {
        for (const [arm, v] of ARMS) {
          const readback = await page.evaluate(([n, val]) => window.__poke(n, val), ['slydlrig:cane', v]);
          const others = await page.evaluate(([names]) => { const o = {}; for (const n of names) o[n] = window.__readMat(n)[0]; return o; }, [OTHER_MATS]);
          const geom = await page.evaluate(() => window.__geom());
          await page.evaluate(([s, a]) => window.__snap(a, s), [shot, arm]);
          rec.arms[arm] = {
            readback, others, geom,
            stats: await page.evaluate(([a, p]) => window.__stats(a, window.__MASK, p), [arm, BAR.pingL]),
            outside: await page.evaluate(([a, p, n]) => window.__outside('base', a, window.__MASK, window.__BOX, p, n), [arm, BAR.pingL, BAR.nearPx]),
          };
          await writePng(arm, `${shot}.${arm}.png`);
          /* P1 §302: restore from the LIVE-READ base state and prove [0,0] in this same boot. */
          await page.evaluate(([v2]) => window.__poke('slydlrig:cane', v2), [BASE_STATE['slydlrig:cane']]);
          await page.evaluate(([s, a]) => window.__snap(`back_${a}`, s), [shot, arm]);
          rec.arms[arm].P1_back = (await page.evaluate(([a]) => window.__diff('base', `back_${a}`), [arm])).n;
          console.log(`  ${arm.padEnd(10)} ping ${String(rec.arms[arm].stats.ping).padStart(6)}  `
            + `Lp50 ${rec.arms[arm].stats.Lp50.toFixed(1)}  sat ${rec.arms[arm].stats.satP50.toFixed(3)}  `
            + `hue ${rec.arms[arm].stats.hueMean.toFixed(1)}  halo ${rec.arms[arm].outside.halo} `
            + `(near ${rec.arms[arm].outside.haloNear})  FAR ${rec.arms[arm].outside.far}  back ${rec.arms[arm].P1_back}`);
        }
      }
      rec.geom1 = await page.evaluate(() => window.__geom());
      R.shots[shot] = rec;
    }
    R.srcTreeAfter = treeHash();
    if (R.srcTreeAfter !== R.srcTreeBefore) {
      console.log(`\n!! §296 TREE MOVED DURING THE BOOT: ${R.srcTreeBefore} -> ${R.srcTreeAfter}`);
      console.log('   The bundler read the tree at boot, so this boot rendered the BEFORE tree;');
      console.log('   the move is recorded, not hidden, and every arm here is a runtime poke of');
      console.log('   one material, so a foreign edit can only enter as a common-mode term.');
    }
    return R;
  });
}

/* ------------------------------------------------------------------ score ------------------- */

function score(R) {
  const g = R.shots[GATE_SHOT], r = R.shots[REP_SHOT];
  const base = g.baseStats;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  console.log(`\n${'='.repeat(78)}\n### PREREG-canegold3 §4/§5 — scored\n`);
  console.log(`  base (${GATE_SHOT}): |M| ${g.P3_mask} px  Lp50 ${base.Lp50.toFixed(1)}  `
    + `Lp999 ${base.Lp999.toFixed(1)}  sep ${(base.Lp999 - base.Lp50).toFixed(1)}  `
    + `sat ${base.satP50.toFixed(3)}  hue ${base.hueMean.toFixed(1)}  ping ${base.ping}`);

  /* Protections first: a protection FAIL voids the run whatever the G-bars read. */
  const prot = {
    P2_null: g.P2_null === 0 && r.P2_null === 0,
    P3_control: g.P3_mask > 0 && r.P3_mask > 0
      && g.P3_mask >= BAR.maskLo && g.P3_mask <= BAR.maskHi,   // §282: sly-closeup ONLY
    P4_reshow: g.P4_reshow === 0 && r.P4_reshow === 0,
    P1_backs: [g, r].every((s) => Object.values(s.arms).every((a) => a.P1_back === 0)),
    P5_others: [g, r].every((s) => Object.values(s.arms).every((a) => eq(a.others,
      Object.fromEntries(OTHER_MATS.map((n) => [n, R.baseState[n]]))))),
    P6_environment: [g, r].every((s) => Object.values(s.arms).every((a) => a.outside.far === 0)),
    P7_geometry: [g, r].every((s) => eq(s.geom0, s.geom1)
      && Object.values(s.arms).every((a) => eq(a.geom, s.geom0))),
    /* §5, declared before the numbers: a tint is a multiply and cannot create bright pixels. */
    I_attribution: g.arms.fillonly.stats.ping < BAR.pingPx,
  };
  for (const [k, v] of Object.entries(prot)) console.log(`  ${k.padEnd(16)} ${guardState(v)}`);

  const rows = [];
  for (const arm of CAND) {
    const s = g.arms[arm].stats, o = g.arms[arm].outside, sr = r.arms[arm].stats;
    const bars = {
      G1a_ping: s.ping >= BAR.pingPx,
      G1b_sep: (s.Lp999 - s.Lp50) >= BAR.sep,
      G2_gold: s.satP50 >= BAR.satMin && s.hueMean >= BAR.hueLo && s.hueMean <= BAR.hueHi,
      G3_value: s.Lp50 >= BAR.lMin && s.Lp50 <= BAR.lMax,
      G4_bloom: o.halo >= BAR.haloMin && o.halo > 0 && (o.haloNear / o.halo) >= BAR.haloNearFrac,
      R1_replicate: sr.ping >= BAR.pingPx,
    };
    rows.push({ arm, bars, s, o, sr, near: o.halo > 0 ? o.haloNear / o.halo : 0 });
    console.log(`\n  ${arm}`);
    console.log(`    ping>=${BAR.pingL}  ${String(s.ping).padStart(6)} px (bar ${BAR.pingPx})   `
      + `sep ${(s.Lp999 - s.Lp50).toFixed(1)} (bar ${BAR.sep})   Lp50 ${s.Lp50.toFixed(1)} (bar [${BAR.lMin},${BAR.lMax}])`);
    console.log(`    sat ${s.satP50.toFixed(3)} (bar ${BAR.satMin})   hue ${s.hueMean.toFixed(1)} (bar [${BAR.hueLo},${BAR.hueHi}])   `
      + `halo ${o.halo} near ${o.haloNear} = ${(o.halo ? o.haloNear / o.halo : 0).toFixed(3)} (bar ${BAR.haloNearFrac})   FAR ${o.far}`);
    console.log(`    ${REP_SHOT} ping ${sr.ping} (R1 bar ${BAR.pingPx})`);
    for (const [k, v] of Object.entries(bars)) console.log(`      ${k.padEnd(14)} ${guardState(v)}`);
  }

  /* Winner selection, written into the seal before the numbers existed: larger haloNear
     fraction; on a tie within 0.02, the LOWER gloss. */
  const clean = rows.filter((x) => Object.values(x.bars).every((v) => v === true));
  let winner = null;
  if (clean.length === 1) winner = clean[0];
  else if (clean.length > 1) {
    clean.sort((a, b) => (Math.abs(a.near - b.near) <= 0.02
      ? a.s.n - b.s.n || (a.arm === 'hardgold' ? -1 : 1)
      : b.near - a.near));
    winner = clean[0];
  }
  const pick = winner || rows[0];
  const verdict = shipVerdict({ ...prot, ...pick.bars });
  console.log(`\n  winner-selection: ${winner ? `${winner.arm} (haloNear frac ${winner.near.toFixed(3)})`
    : 'none clean — scoring the first candidate arm so the verdict names a real blocker'}`);
  console.log(`\n${verdictLine(verdict, `${pick.arm}: color 0x${GOLD_HEX.toString(16)}, spec 0.90, `
    + `gloss ${pick.arm === 'hardgold2' ? 96 : 32}, rough 0.25, metal 0 -> slydlrig:cane `
    + `(PREREG-canegold3 §6 outcome 1)`)}`);
  if (!verdict.ship) {
    console.log(`  (outcome ${verdict.voided.length ? '3 VOID — no verdict is claimed and a re-run needs a NEW seal'
      : '2 DO-NOT-SHIP — values stay as they ship; the numbers above are the record'}, PREREG-canegold3 §6)`);
  }
  console.log('\n  LOOK GATE (§7) IS BINDING AND IS NOT SCORED HERE: crop the hook out of\n'
    + `  ${OUT}/${GATE_SHOT}.{base,${pick.arm}}.png and judge it before any ship-write.`);

  /* Diagnostic block — DIAG-charmat13's re-aimed tail item. No bar, by design. */
  console.log(`\n  --- DIAGNOSTIC (no bars): in-frame tail band ratio vs the published albedo ratio ---`);
  for (const s of [REP_SHOT, DIAG_SHOT]) {
    const t = R.shots[s]?.tail;
    if (!t) continue;
    console.log(`    ${s.padEnd(12)} tail mask ${String(t.mask).padStart(6)} px   in-frame p90/p10 `
      + `${t.inFrame.ratio == null ? 'n/a' : t.inFrame.ratio.toFixed(2)}   michelson `
      + `${t.inFrame.michelson == null ? 'n/a' : t.inFrame.michelson.toFixed(3)}   `
      + `(albedo for this yaw: rear 2.24 / profile 2.62, DIAG-charmat13 (b))`);
  }
  return { verdict, prot, rows, winner: winner?.arm ?? null };
}

/* ------------------------------------------------------------------ main -------------------- */

let R;
if (SCORE_ONLY) {
  const f = path.join(OUT, 'result.json');
  if (!existsSync(f)) { console.error(`no ${f} — nothing to score`); process.exit(4); }
  R = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`re-scoring ${f} (captured ${R.at}) — no boot, no lock`);
} else {
  R = await capture();
  writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(R, null, 1));
  console.log(`\nframes + result.json -> ${OUT}`);
}
const scored = score(R);
if (!SCORE_ONLY) {
  writeFileSync(path.join(OUT, 'verdict.json'), JSON.stringify({
    at: R.at, ship: scored.verdict.ship, states: scored.verdict.states, winner: scored.winner,
  }, null, 1));
}
process.exit(scored.verdict.ship ? 0 : 1);
