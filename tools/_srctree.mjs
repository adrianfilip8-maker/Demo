/**
 * _srctree.mjs — one definition of "which source tree produced this artefact".
 *
 * ── Why a shared module and not a line in each tool ─────────────────────────────────────────
 * `canegold3.mjs` has stamped `srcTreeBefore` / `srcTreeAfter` since §296, and the convention
 * it established is right: **a mid-run edit does not invalidate a capture by itself, but an
 * unstamped one is unfalsifiable.** The bundler reads the tree at boot, so a file that moves
 * afterwards has probably not reached the page — and "probably" is exactly the reasoning this
 * project refuses everywhere else.
 *
 * The hash must be BYTE-COMPARABLE across tools or the convention is worthless: a run stamped
 * by one tool and re-checked by another has to produce the same 16 characters for the same
 * tree. So there is one definition, here, and every consumer imports it.
 *
 * ── What it covers, and what it does not ────────────────────────────────────────────────────
 * `src/**\/*.js` only. That is the executable surface a capture renders — it deliberately
 * excludes `tests/`, `tools/` and assets, because a test edit cannot change a frame and an
 * asset edit is caught by the module census in the manifest instead. It also excludes shaders
 * carried in non-`.js` files, of which this project currently has none.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 16 hex characters identifying the current `src/**\/*.js` tree.
 *
 * Kept character-for-character identical to the command `canegold3.mjs` has used since §296 —
 * `find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16` — so stamps from
 * before this module existed remain comparable with stamps from after it.
 */
export const treeHash = () => execSync(
  "find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { cwd: ROOT, encoding: 'utf8' },
).trim();
