/**
 * dlprobe — why is the character absent from the frame?
 *
 * dlsmoke's `sly-closeup.dl.png` is the closeup camera with an EMPTY centre: same architecture,
 * same light, same framing as `charab/sly-closeup.model3.png`, and no character. The boot readback
 * says the model is there (root `slydl`, 39,963 verts, 31 bones, 4 materials), so it loads and
 * something between "loaded" and "on screen" fails.
 *
 * This probe boots, stages the same shot, and asks the scene directly — no capture, so it costs a
 * boot rather than a render. It takes the char token as argv[2] so the SAME questions can be put
 * to the shipped model as a control:
 *
 *     node dlprobe.mjs dl        # the supplied mesh
 *     node dlprobe.mjs model3    # the control — every number below has a known-good value
 *
 * Hypotheses it separates, in the order they'd bite:
 *   H1 NaN/degenerate skinning  -> skinWeight or skinIndex out of range; posed bone matrices NaN
 *   H2 wrong place              -> root/mesh world position far from the shot's player position
 *   H3 wrong scale              -> geometry bbox tiny or enormous after normalization
 *   H4 not in the graph         -> mesh not a descendant of the scene, or visible=false
 *   H5 material                 -> opacity 0, transparent, or the program failed to build
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const CHAR = (process.argv[2] || 'dl').trim();
const OUT = '/home/user/Demo/progress/records/dlprobe';
mkdirSync(OUT, { recursive: true });
const log = (s) => console.log(s);

await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 30 * 60 * 1000,
  query: CHAR ? `char=${CHAR}` : '',
}, async ({ page, info }) => {
  log(`boot ok (char=${CHAR}) — warnings ${info.warnings?.length ?? 0}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`  PAGE ERROR: ${m.text().slice(0, 300)}`); });

  await page.evaluate(async () => { await window.__GAME.setShot('sly-closeup', { dt: 0 }); await window.__GAME.step(4, 0); });

  const r = await page.evaluate(() => {
    const THREE = window.__GAME.THREE;
    const c = window.__ENGINE.get('character');
    const out = { root: c?.root?.name ?? null };
    if (!c?.mesh) return { ...out, fatal: 'no mesh' };
    const m = c.mesh, g = m.geometry;

    /* H4 — is it actually in the scene, and visible all the way up? */
    let p = m, inScene = false, hidden = [];
    while (p) { if (!p.visible) hidden.push(p.name || p.type); if (p === window.__ENGINE.scene) inScene = true; p = p.parent; }
    out.inScene = inScene; out.hiddenAncestors = hidden;

    /* H3 — geometry extent in local space */
    g.computeBoundingBox();
    const bb = g.boundingBox;
    out.geomBBox = { min: bb.min.toArray().map((v) => +v.toFixed(3)), max: bb.max.toArray().map((v) => +v.toFixed(3)) };

    /* H2 — where is it in the world? */
    c.root.updateMatrixWorld(true);
    out.rootPos = c.root.position.toArray().map((v) => +v.toFixed(3));
    out.rootWorld = new THREE.Vector3().setFromMatrixPosition(c.root.matrixWorld).toArray().map((v) => +v.toFixed(3));
    out.meshWorld = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld).toArray().map((v) => +v.toFixed(3));
    out.rootScale = c.root.scale.toArray();

    /* H1 — skin attributes sane? */
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!si || !sw) { out.skin = 'MISSING skinIndex/skinWeight'; } else {
      let maxIdx = 0, nanW = 0, zeroSum = 0, badSum = 0;
      const nb = c.mesh.skeleton?.bones?.length ?? 0;
      for (let i = 0; i < si.count; i++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          const idx = si.getComponent(i, k), w = sw.getComponent(i, k);
          if (idx > maxIdx) maxIdx = idx;
          if (!Number.isFinite(w)) nanW++;
          s += w;
        }
        if (s === 0) zeroSum++;
        else if (Math.abs(s - 1) > 0.01) badSum++;
      }
      out.skin = { boneCount: nb, maxSkinIndex: maxIdx, indexOutOfRange: maxIdx >= nb, nanWeights: nanW, zeroWeightVerts: zeroSum, weightSumOffVerts: badSum };
    }

    /* H1b — posed bone matrices finite? and where do they sit? */
    const sk = m.skeleton;
    out.boneMatrixNaN = 0;
    const bonePos = {};
    if (sk) {
      for (const b of sk.bones) {
        b.updateMatrixWorld(true);
        const e = b.matrixWorld.elements;
        if (e.some((v) => !Number.isFinite(v))) out.boneMatrixNaN++;
      }
      for (const nm of ['hips', 'head', 'handL', 'footR', 'tailD']) {
        const b = sk.bones.find((x) => x.name === nm);
        if (b) bonePos[nm] = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).toArray().map((v) => +v.toFixed(3));
      }
      out.boneInverseNaN = (sk.boneInverses || []).filter((mi) => mi.elements.some((v) => !Number.isFinite(v))).length;
    }
    out.bonePos = bonePos;

    /* H5 — materials */
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    out.materials = mats.map((x) => ({
      name: x?.name ?? null, type: x?.type ?? null, visible: x?.visible,
      opacity: x?.opacity, transparent: x?.transparent, colorHex: x?.color?.getHexString?.() ?? null,
      hasMap: !!x?.map, side: x?.side,
    }));
    out.groups = (g.groups || []).map((gr) => ({ start: gr.start, count: gr.count, mat: gr.materialIndex }));

    /* Where the shot expects the player, for H2 */
    const mv = window.__ENGINE.get('movement');
    out.movementPos = mv?.position?.toArray?.().map((v) => +v.toFixed(3))
      ?? (mv?.pos ? [+mv.pos.x.toFixed(3), +mv.pos.y.toFixed(3), +mv.pos.z.toFixed(3)] : null);

    /* Is the mesh in front of the camera at all? project its world bbox centre. */
    const cam = window.__ENGINE.camera;
    const centre = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5).applyMatrix4(m.matrixWorld);
    const proj = centre.clone().project(cam);
    out.geomCentreWorld = centre.toArray().map((v) => +v.toFixed(3));
    out.geomCentreScreen = [+((proj.x * 0.5 + 0.5) * 1280).toFixed(1), +((1 - (proj.y * 0.5 + 0.5)) * 720).toFixed(1), +proj.z.toFixed(3)];
    out.camPos = cam.position.toArray().map((v) => +v.toFixed(3));
    return out;
  });

  log(JSON.stringify(r, null, 1));
  writeFileSync(`${OUT}/probe-${CHAR}.json`, JSON.stringify(r, null, 1));
});
log('DONE');
