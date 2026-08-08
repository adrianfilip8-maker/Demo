/**
 * Alert.js — the guard alert ladder, as pure data.
 *
 * WHY THIS IS A SEPARATE MODULE, AND PURE
 *
 * `src/ai/Patrol.js` ships a five-state machine with hysteresis, and `src/ai/Guard.js` paints a
 * vision cone whose colour is a three-stop ramp pinned to that machine's own thresholds — so in
 * the world, *the colour of the cone is the state*. The HUD has to speak the same sentence or it
 * is a second, contradictory language for one fact.
 *
 * Keeping the mapping here, with no DOM and no THREE import, buys three things:
 *   · the HUD renders FROM this table, so the badge cannot drift from what the tests assert;
 *   · every state→visual claim is checkable in plain Node with no browser and no capture lock;
 *   · the colours are declared once, next to the cone constants they are pinned to.
 *
 * ANALOG vs DISCRETE — the division of labour that makes this readable.
 * The cone already carries the *continuous* signal: it brightens and warms as the meter fills, so
 * a player looking at a guard can see how close he is to committing. The HUD badge therefore
 * carries the *discrete* one — which of the five states he is actually in. That is the half the
 * player cannot otherwise get, because a guard behind them has a cone they cannot see. Making the
 * badge a second meter would duplicate the analog channel and leave the discrete one unreadable,
 * which is precisely the failure this module replaces: five states rendered as one gold arc at
 * five slightly different fill fractions.
 *
 * `ring` below is therefore a fixed, canonical fraction per state, not a live suspicion readout.
 */

/**
 * The vision cone's three stops, from `src/ai/Guard.js` TUNE (`colPatrol` / `colWarn` /
 * `colAlert`). Duplicated as hex strings rather than imported because `src/ai/*` is another
 * agent's file and this module must stay free of THREE; `tests/hud.test.mjs` asserts the two
 * stay identical, so the duplication cannot silently rot.
 */
export const CONE = {
  cream: '#fff0c2',   // he has noticed nothing
  amber: '#ffb14a',   // from the instant he turns suspicious, held through the search
  red:   '#ff3a22',   // only once he commits to the chase
};

/**
 * Every state `Patrol.STATE` can emit, and exactly how it is presented.
 *
 *   glyph  — what is struck inside the badge. Distinct per state.
 *   colour — pinned to the cone ramp above, so badge and cone agree.
 *   ring   — canonical arc fraction, 0..1. Distinct per state (see the note above).
 *   label  — the words under the badge. This is what actually gets read at a glance.
 *   rank   — position on the ladder; drives the aggregate threat readout.
 *   live   — is he currently a threat? Live states persist until the guard leaves them.
 *            Non-live states linger briefly for feedback, then retire.
 */
export const ALERT_STATES = {
  patrol:     { glyph: '',   colour: CONE.cream, ring: 0,    label: 'UNSEEN',    rank: 0, live: false },
  suspicious: { glyph: '?',  colour: CONE.amber, ring: 0.34, label: 'NOTICED',   rank: 1, live: true  },
  searching:  { glyph: '?!', colour: CONE.amber, ring: 0.72, label: 'SEARCHING', rank: 2, live: true  },
  chase:      { glyph: '!',  colour: CONE.red,   ring: 1,    label: 'SPOTTED',   rank: 3, live: true  },
  lost:       { glyph: '··', colour: CONE.amber, ring: 0.55, label: 'LOST YOU',  rank: 2, live: true  },
  stunned:    { glyph: '✱',  colour: '#8fd8ff',  ring: 0.18, label: 'STUNNED',   rank: 0, live: false },
  ko:         { glyph: '×',  colour: '#8fd8ff',  ring: 0.09, label: 'OUT COLD',  rank: 0, live: false },
};

/** The five states the ladder actually walks. `stunned`/`ko` are interruptions, not rungs. */
export const LIVE_LADDER = ['patrol', 'suspicious', 'searching', 'chase', 'lost'];

/** Fallback when a payload names a state this build does not know. */
export const UNKNOWN = { glyph: '?', colour: CONE.amber, ring: 0.5, label: 'ALERTED', rank: 1, live: true };

/**
 * `Patrol` publishes `DETECT.chase = 1.00` and derives `level = suspicion / chase`, so these are
 * the fractions a numeric-only payload lands on. Used only when no usable `state` string is
 * present — a legacy or third-party emitter.
 */
const NUMERIC_BANDS = [
  [0.99, 'chase'],
  [0.72, 'searching'],
  [0.34, 'suspicious'],
];

/**
 * Resolve one `guardAlert` payload to its presentation.
 *
 * ORDER MATTERS: `state` wins over `level`. The shipped emitter sets BOTH on every transition
 * (`Guard.js:642`), and the previous consumer read `level` first — which, because `level` is
 * always a number, meant `state` was never read at all and the whole five-state ladder collapsed
 * into one arc at five fill fractions. The string is the authoritative signal; the number is the
 * fallback for an emitter that does not send one.
 */
export function alertFor(p) {
  if (p == null) return null;
  const raw = typeof p === 'string' ? p : (p.state ?? p.status ?? '');
  const key = String(raw).toLowerCase().trim();
  if (ALERT_STATES[key]) return { state: key, ...ALERT_STATES[key] };

  const lvl = typeof p === 'object'
    ? firstNumber(p.level, p.suspicion, p.alert, p.value)
    : null;
  if (lvl == null) return { state: key || 'unknown', ...UNKNOWN };
  for (const [floor, name] of NUMERIC_BANDS) {
    if (lvl >= floor) return { state: name, ...ALERT_STATES[name] };
  }
  return { state: 'patrol', ...ALERT_STATES.patrol };
}

/* ------------------------------------------------------------------ threat */

/**
 * The aggregate "am I hidden or exposed" readout.
 *
 * There is no `playerHidden` event anywhere in the build — the emitted set is fixed and does not
 * contain one. But exposure is not an independent fact: the player is exposed exactly insofar as
 * some guard believes something. So this is derived from the guard states the HUD is already
 * receiving, which needs no new hook from another agent's module.
 */
export const THREAT = {
  hidden:  { label: 'HIDDEN',  colour: CONE.cream, rank: 0 },
  noticed: { label: 'NOTICED', colour: CONE.amber, rank: 1 },
  hunted:  { label: 'HUNTED',  colour: CONE.amber, rank: 2 },
  spotted: { label: 'SPOTTED', colour: CONE.red,   rank: 3 },
};

const BY_RANK = ['hidden', 'noticed', 'hunted', 'spotted'];

/**
 * Worst-of over every guard the HUD currently tracks. `states` is any iterable of state strings.
 * Returns the threat entry plus how many guards sit at that top rank, so the HUD can say
 * "HUNTED ×2" — a number the player uses to decide whether to break line or hold.
 */
export function threatFor(states) {
  let top = 0;
  let count = 0;
  let seen = 0;
  for (const s of states || []) {
    const e = ALERT_STATES[String(s).toLowerCase()];
    if (!e) continue;
    seen++;
    if (!e.live) continue;
    if (e.rank > top) { top = e.rank; count = 1; }
    else if (e.rank === top && top > 0) count++;
  }
  const key = BY_RANK[Math.max(0, Math.min(BY_RANK.length - 1, top))];
  return { key, ...THREAT[key], count, inspected: seen };
}

/* ----------------------------------------------------------------- helpers */

function firstNumber(...vals) {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/* ------------------------------------------------------- contrast (shared) */

/** sRGB channel → linear. WCAG 2.1 relative-luminance transfer. */
function lin(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** `#rgb` / `#rrggbb` → [r,g,b] 0..255. */
export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG 2.1 relative luminance. */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio between two opaque colours. Always >= 1. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
