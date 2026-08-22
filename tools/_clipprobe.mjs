/**
 * _clipprobe.mjs — what clips each state actually asks for, and which one-shots were ever live
 * together, recorded from the real suite rather than modelled.
 *
 * NOT a test file (the `_` prefix and the missing `.test` keep it out of `tests/*.test.mjs`).
 * Used as a preload, exactly like `tests/_smtrace.mjs`:
 *
 *     SM_CLIP_DIR=… node --test --import ./tools/_clipprobe.mjs "tests/*.test.mjs"
 *
 * ── WHY THIS EXISTS, and what it replaced ─────────────────────────────────────────────────
 *
 * `tools/seamcensus.mjs` needs two facts per state: which one-shot it fires on entry, and which
 * BASE clip it re-asserts every frame. The base clip is half the mechanism — a base clip whose
 * name is one of the blend-tree's ten routes `play()` into a branch that ends every non-locked
 * track, one-shots included, so the incoming state's base clip decides whether the outgoing
 * state's one-shot survives at all.
 *
 * The first attempt read both by calling `state.enter()` and `state.update()` against a recording
 * Proxy. `enter()` probes fine. `update()` does not, and the failure is silent in the direction
 * that flatters: every state's `update` begins with guard clauses (`this.landed(c)`,
 * `if (c.velocity.y <= 0) return 'fall'`), a Proxy answers those guards as "grounded, not
 * rising", and the state returns a transition BEFORE reaching its `baseClip` call. The probe
 * reported "no base clip" for almost every state — which reads like a finding and is an artefact.
 *
 * So the base clips are recorded from the machine actually running. `Controller.baseClip` and
 * `Controller.oneShot` are the only two routes from MOVEMENT to a clip, so patching that pair
 * sees every request there is, attributed to `this.stateName` — which `onStateChanged` sets, so
 * it is the machine's own answer rather than a second bookkeeping of it.
 *
 * ── THE SECOND RECORD: observed co-liveness ───────────────────────────────────────────────
 *
 * `Animation._advance` is the single place track weights move, so a wrapper there sees every
 * frame every mixer in the process ever ran. After each advance the live NON-LOOP tracks are
 * counted: two or more at once is the §525/§526 defect shape, and the pair is recorded with the
 * summed weight. This is evidence of a different kind from the census — the census says what
 * COULD overlap given the graph, this says what DID while 920 arms drove the game.
 *
 * ── WHAT IT CANNOT DISCRIMINATE (§418.3, third line) ──────────────────────────────────────
 *
 * It sees only processes that load `Controller`/`Animation` while it is installed, so an absence
 * here is a statement about the suite's coverage and not about the game — a transition no arm
 * drives cannot appear, and `seamcensus`'s graph-based ceiling is what covers that gap. It
 * attributes a clip to `stateName`, so a clip played by something other than a state (a cutscene,
 * a debug key) is filed under whatever state happened to be current. And it counts tracks, not
 * bones: two live one-shots that animate disjoint bones are recorded as an overlap here and
 * exonerated later by the census's shared-bone check.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Controller } from '../src/player/Controller.js';
import { Animation } from '../src/player/Animation.js';

/** state -> { one: Set, base: Set } */
export const clips = new Map();
/** "clipA|clipB" (sorted) -> { n, maxW, states: Set } */
export const overlaps = new Map();

function note(state, kind, name) {
  const s = String(state || '(none)');
  let r = clips.get(s);
  if (!r) { r = { one: new Set(), base: new Set() }; clips.set(s, r); }
  r[kind].add(String(name));
}

let installed = false;
export function install() {
  if (installed) return;
  installed = true;

  const realBase = Controller.prototype.baseClip;
  Controller.prototype.baseClip = function (name, fade) {
    if (name) note(this.stateName, 'base', name);
    return realBase.call(this, name, fade);
  };
  const realOne = Controller.prototype.oneShot;
  Controller.prototype.oneShot = function (name, speed, fade) {
    if (name) note(this.stateName, 'one', name);
    return realOne.call(this, name, speed, fade);
  };

  const realAdv = Animation.prototype._advance;
  Animation.prototype._advance = function (dt, t) {
    const out = realAdv.call(this, dt, t);
    /* EVERY live track, loops included — and the `tr.loop` filter this replaced is worth keeping
       in view, because it hid the very thing the probe exists to find.
       A state's `update` re-asserts its own one-shot as a BASE clip (`Jump` fires
       `oneShot('jump_rise')` then `baseClip('jump_rise')`), which takes `play()`'s retarget path
       and sets `tr.loop = true` on the track that is already running. So one frame after any air
       state is entered, its clip is a LOOP. Filtering loops out therefore discarded exactly the
       case in question — `land_soft` (a true one-shot, `Land` asserts no base clip) sitting at
       full weight underneath a promoted `jump_rise` — and left only the combo, whose slots are
       never promoted because `Combo` asserts no base clip either. The probe reported "no overlaps
       outside the combo", which reads as an all-clear and was an artefact of its own filter.
       Summed weight over ALL tracks is the invariant (`addQuat` is a normalised mean); a fading
       loop against a rising one-shot sums to 1.00 and is a hand-off. */
    const live = [];
    let w = 0;
    for (const tr of this.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      live.push(tr.clip.name); w += tr.w;
    }
    if (live.length >= 2 && w > 1.001) {
      const key = [...live].sort().join('|');
      let r = overlaps.get(key);
      if (!r) { r = { n: 0, maxW: 0, states: new Set() }; overlaps.set(key, r); }
      r.n++; r.maxW = Math.max(r.maxW, w);
    }
    return out;
  };
}
install();

export function snapshot() {
  const c = {}, o = {};
  for (const [k, v] of clips) c[k] = { one: [...v.one], base: [...v.base] };
  for (const [k, v] of overlaps) o[k] = { n: v.n, maxW: +v.maxW.toFixed(3) };
  return { clips: c, overlaps: o };
}

const DIR = process.env.SM_CLIP_DIR;
if (DIR) {
  process.on('exit', () => {
    try {
      mkdirSync(DIR, { recursive: true });
      const who = (process.argv[1] || 'proc').split('/').pop();
      writeFileSync(path.join(DIR, `${who}.${process.pid}.json`), JSON.stringify(snapshot()));
    } catch { /* a probe must never fail a run */ }
  });
}
