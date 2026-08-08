/**
 * glovecheck — measure and photograph the shipped model's hands, before and after the curl bake.
 *
 * §202's blind round called the gloves "splayed rake fingers". The offline rig dump disagrees with
 * the word *splayed* and agrees with the complaint: index-to-pinky spread is 6.0°, so the fingers
 * are not fanned — they are straight (base-to-tip straightness 0.990–0.995), parallel, and held
 * 42.7° off the forearm. Four rigid prongs, because our rig has no finger bones and all twenty per
 * hand fold into the wrist.
 *
 * Run it on both sides of the change:
 *
 *     node glovecheck.mjs before      # current shipped geometry
 *     node glovecheck.mjs after       # with the curl baked in
 *
 * It measures rather than only photographing, because the render is at gameplay distance where a
 * 5 % change in finger reach is a couple of pixels. The numbers come off the SAME attribute the
 * GPU draws, so they cannot agree with an intention that the geometry does not carry.
 *
 * Registers no band and gates nothing — the curl is a look fix, not an A/B. What the numbers are
 * for is proving the bake LANDED and that it moved the fingers the way the offline validation
 * said it would; whether it reads better is the frames' job and the owner's call.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ARM = (process.argv[2] || 'before').trim();
const OUT = '/home/user/Demo/progress/records/glovecheck';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 40 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok (${ARM}) — warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  await page.evaluate(async () => { await window.__GAME.setShot('sly-closeup', { dt: 0 }); await window.__GAME.step(4, 0); });

  /* ---- measurement: the hand cloud, in the character's own local space ----
     Taken from the bound geometry rather than from bone transforms, because the curl is baked
     into vertices and the bones are unchanged by construction — reading bones would report a
     confident null for a change that did land (§11's instrument family, exactly).

     READ `L` ONLY. `handR` is not just the right glove: `BONE_MAP` sends the FBX's `staff` bone to
     `handR`, so the whole cane is inside that vertex cloud, and the numbers say so plainly — R
     reports a 1.98 m z-extent and reachMax 1.06 m against L's 0.25 m and 0.24 m. Nothing is wrong
     with the model; the metric is measuring a hand plus a two-metre stick and calling it a hand.
     Left alone deliberately rather than filtered, because the cane's presence in `handR` is a real
     property of the rig that a future reader should see rather than have silently hidden. */
  const m = await page.evaluate(() => {
    const c = window.__ENGINE.get('character');
    const g = c?.mesh?.geometry;
    if (!g) return { fatal: 'no mesh' };
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!si) return { fatal: 'no skin indices' };
    const names = c.boneNames || [];
    const hL = names.indexOf('handL'), hR = names.indexOf('handR');
    const out = { verts: pos.count, handL: hL, handR: hR, hands: {} };

    for (const [label, bi] of [['L', hL], ['R', hR]]) {
      if (bi < 0) continue;
      /* vertices the hand bone dominates */
      const pts = [];
      for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (si.array[i * 4 + k] === bi) w += sw.array[i * 4 + k];
        if (w > 0.5) pts.push(i);
      }
      if (!pts.length) { out.hands[label] = { n: 0 }; continue; }
      /* centroid, and the farthest vertex from it — the fingertip reach */
      let cx = 0, cy = 0, cz = 0;
      for (const i of pts) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
      cx /= pts.length; cy /= pts.length; cz /= pts.length;
      let far = 0, fx = 0, fy = 0, fz = 0;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const i of pts) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        lo[0] = Math.min(lo[0], x); hi[0] = Math.max(hi[0], x);
        lo[1] = Math.min(lo[1], y); hi[1] = Math.max(hi[1], y);
        lo[2] = Math.min(lo[2], z); hi[2] = Math.max(hi[2], z);
        const d = Math.hypot(x - cx, y - cy, z - cz);
        if (d > far) { far = d; fx = x; fy = y; fz = z; }
      }
      /* mean distance too: one far vertex can be an outlier, the mean cannot */
      let sum = 0;
      for (const i of pts) sum += Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz);
      out.hands[label] = {
        n: pts.length,
        centroid: [cx, cy, cz].map((v) => +v.toFixed(4)),
        reachMax: +far.toFixed(4),
        reachMean: +(sum / pts.length).toFixed(4),
        farVert: [fx, fy, fz].map((v) => +v.toFixed(4)),
        size: hi.map((v, i) => +(v - lo[i]).toFixed(4)),
      };
    }
    return out;
  });
  log(`measure: ${JSON.stringify(m)}`);

  /* ---- frames: the closeup, and `hero` where the right hand grips the cane ---- */
  for (const shot of ['sly-closeup', 'hero']) {
    const png = await page.evaluate(async (s) => {
      const G = window.__GAME;
      await G.setShot(s, { dt: 0 });
      await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
      return G.capture('image/png');
    }, shot);
    await writeFile(path.join(OUT, `${shot}.${ARM}.png`), Buffer.from(png.split(',')[1], 'base64'));
    log(`  wrote ${shot}.${ARM}.png`);
  }
  await writeFile(path.join(OUT, `measure.${ARM}.json`), JSON.stringify(m, null, 2));
});
log('DONE');
