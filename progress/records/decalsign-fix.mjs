/**
 * The candidate change under test in `PREREG-decalsign.md`, as an idempotent source edit.
 *
 * It lives here rather than being applied by hand so it can be installed from `withGame`'s
 * `onLocked` seam — after the capture lock is granted and before vite reads the tree, which is
 * the only moment §186/§194 allows `src/**` to move. Running it twice is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(import.meta.dirname, '../../src/world/Decals.js');

const ANCHOR = '      blending: THREE.MultiplyBlending,\n';

const PATCH = `      blending: THREE.MultiplyBlending,
      /**
       * REQUIRED with \`MultiplyBlending\`, and its absence was a live defect rather than a
       * warning to tidy away. \`three@0.185\`'s \`WebGLState.setBlending()\` has no
       * non-premultiplied multiply path *at all*: with the flag false it logs
       *
       *     THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true
       *
       * and **returns without calling \`gl.blendFunc\`**, then caches \`currentBlending =
       * MultiplyBlending\` so the switch is skipped on every subsequent frame too. The decal was
       * therefore drawn with whatever function the previously-programmed material had left in the
       * context — the birds at \`renderOrder\` 5, one step ahead of this batch at 6.
       *
       * That is the whole of the inverted contact shadow. \`FRAG\` emits a MULTIPLIER: 1.0 (white)
       * at the rim, falling to ~0.44 luma at the core. Under \`dst * src\` that is a shadow whose
       * rim is a no-op. Under anything else — src-alpha lerp, additive, straight replace — the
       * same value composites as *paint*, and it is brightest exactly at the outer rim. A halo
       * that grows outward from the prop, which is what the critic scored as
       * "the contact shadow is INVERTED".
       *
       * With the flag set, three programs \`blendFuncSeparate(DST_COLOR, ONE_MINUS_SRC_ALPHA,
       * ZERO, ONE)\`. \`FRAG\` writes \`a = 1.0\` unconditionally, so \`ONE_MINUS_SRC_ALPHA\` is zero
       * and the RGB result is exactly \`src * dst\`, with the destination alpha left alone. A
       * colour whose alpha is 1 *is* its own premultiplication — the flag names the blend
       * equation here and says nothing about any stored colour. If \`FRAG\` ever stops writing
       * 1.0, this line has to be revisited with it.
       *
       * **Not the §224 flag.** §224 is \`premultiplyAlpha\` on a TEXTURE round-tripped through a
       * 2D canvas, which came back with 57 % of \`torch_flame\`'s bytes wrong and ±184 on red.
       * Different flag, different object: this material has no map of any kind, and the
       * decalsign run measured the frame outside the decals to confirm nothing else moved.
       */
      premultipliedAlpha: true,
`;

export function applyFix() {
  const src = readFileSync(FILE, 'utf8');
  if (/premultipliedAlpha:\s*true/.test(src)) return { changed: false, why: 'already applied' };
  const i = src.indexOf(ANCHOR);
  if (i < 0) throw new Error(`decalsign-fix: anchor not found in ${FILE}`);
  writeFileSync(FILE, src.slice(0, i) + PATCH + src.slice(i + ANCHOR.length));
  return { changed: true, why: 'premultipliedAlpha: true installed' };
}

if (process.argv[1] && process.argv[1].endsWith('decalsign-fix.mjs')) console.log(applyFix());
