/**
 * treestate.mjs — what tree was this frame rendered from?
 *
 * The lead voided a run today on exactly this: the materials lane captured its A0 and A1 arms
 * twenty commits apart, and those commits included `src/core/Shots.js` — so the two arms were
 * framed differently and nothing in the scorer noticed until someone went looking.
 *
 * **A commit sha is not enough here, and that is the whole reason this file exists.** Four agents
 * are editing this branch simultaneously and their edits sit in the WORKING TREE for long stretches
 * before they are committed — at the time of writing `src/world/Props.js` and `src/world/Statues.js`
 * are both modified and uncommitted. Vite bundles the working tree, not `HEAD`, so two captures at
 * the identical commit can render different pictures. A sha would report those two frames as the
 * same provenance and be wrong.
 *
 * So the identity recorded is a content hash of every file under `src/`, plus the commit sha for
 * human readability. The hash is what a guard should compare; the sha is what a person reads.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.env.SANDS_SRC || '/home/user/Demo/src';

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Content hash of the source tree actually on disk, including uncommitted edits and untracked
 * files. Paths are sorted and hashed alongside their bytes, so a rename is a change.
 */
export function srcHash(root = ROOT) {
  const h = createHash('sha256');
  for (const f of walk(root)) {
    h.update(path.relative(root, f));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

/** Commit sha, for a human. Never used as the identity — see the header. */
export function headSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'],
      { cwd: path.dirname(ROOT), encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

/** The provenance stamp a capture should attach to every arm it renders. */
export function treeState() {
  return { src: srcHash(), head: headSha(), at: new Date().toISOString() };
}

if (process.argv[1] && process.argv[1].endsWith('treestate.mjs')) {
  const t = treeState();
  console.log(`src content hash ${t.src}   HEAD ${t.head}   ${t.at}`);
}
