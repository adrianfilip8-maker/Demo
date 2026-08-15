/**
 * hud.css.js — the entire UI stylesheet, injected from JS (index.html is locked).
 *
 * Everything is namespaced under `#sly-hud` so nothing here can reach the boot veil or the
 * debug overlay. Two rules run through the whole sheet:
 *
 *   1. Nothing is a translucent grey panel. Every element is an inked shape with a flat
 *      §2.2 fill, a hard offset shadow, and a degree or two of rotation, so the UI reads as
 *      hand-placed comic art rather than an engine overlay (AGENTS.md §2.1).
 *   2. Every text run carries an 8-direction ink halo. The game's sky blows out to near
 *      white at golden hour and the tomb interiors go almost black; only an outlined glyph
 *      survives both, and "legible on exactly one background" is a broken HUD.
 */

export const HUD_CSS = /* css */ `
#sly-hud {
  /* One unit drives every size in the UI, so the whole thing scales 1280×720 → 4K. */
  --u: clamp(11px, 1.52vmin, 27px);
  --ink: #1a1210;
  --ink-cool: #161022;
  --gold: #e8b942;
  --gold-l: #ffe9a8;
  --gold-d: #966a18;
  --spark: #8fd8ff;
  --lapis: #2a7fd4;
  --lapis-d: #1f4f96;
  --paint: #f2e8d4;
  --carn: #b8452c;

  --pop: cubic-bezier(.16, 1.44, .38, 1);      /* overshoot — cartoon snap */
  --settle: cubic-bezier(.32, .9, .28, 1);

  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  font-family: 'DejaVu Sans', 'Liberation Sans', ui-sans-serif, system-ui, Arial, sans-serif;
  font-weight: 700;
  color: var(--paint);
  -webkit-font-smoothing: antialiased;
  /* Deliberately no z-index and no CSS containment: either one would isolate this subtree
     into its own blending group, and then the damage multiply, the hit-flash screen and the
     Binocucom backdrop-filter would composite against nothing instead of against the rendered
     game. DOM order already puts us above #app, and #boot/#dbg/#err carry higher indices. */
}

/* The screenshot harness owns this. It must cost zero pixels, instantly. */
#sly-hud[data-hidden='1'] { display: none !important; }

#sly-hud svg { display: block; overflow: visible; }

/* ---------------------------------------------------------------- ink text */

.sly-ink {
  text-shadow:
    var(--ts) 0 0 var(--ink), calc(var(--ts) * -1) 0 0 var(--ink),
    0 var(--ts) 0 var(--ink), 0 calc(var(--ts) * -1) 0 var(--ink),
    var(--ts2) var(--ts2) 0 var(--ink), calc(var(--ts2) * -1) var(--ts2) 0 var(--ink),
    var(--ts2) calc(var(--ts2) * -1) 0 var(--ink), calc(var(--ts2) * -1) calc(var(--ts2) * -1) 0 var(--ink),
    0 calc(var(--u) * .2) 0 rgba(26, 18, 16, .5),
    0 calc(var(--u) * .3) calc(var(--u) * .7) rgba(26, 18, 16, .55);
  --ts: calc(var(--u) * .17);
  --ts2: calc(var(--u) * .12);
}
.sly-ink-s { --ts: calc(var(--u) * .11); --ts2: calc(var(--u) * .08); }

.sly-drop { filter: drop-shadow(0 calc(var(--u) * .16) 0 rgba(26,18,16,.55))
                    drop-shadow(0 calc(var(--u) * .3) calc(var(--u) * .5) rgba(26,18,16,.5)); }

/* ============================================================== SHAKE ROOT */

.sly-shake { position: absolute; inset: 0; z-index: 4; will-change: transform; }

/* ============================================================= TOP-LEFT HUD */

.sly-tl {
  position: absolute;
  left: calc(var(--u) * 1.9);
  top: calc(var(--u) * 1.5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * .5);
  align-items: flex-start;
}

/* ------- health pips ------- */

.sly-pips {
  display: flex;
  gap: calc(var(--u) * .28);
  align-items: center;
  transform: rotate(-1.4deg);
  transform-origin: left center;
}
.sly-pips > span {
  width: calc(var(--u) * 1.72);
  height: calc(var(--u) * 1.72);
  display: block;
  transition: opacity .25s ease, transform .3s var(--pop);
}
.sly-pips > span svg { width: 100%; height: 100%; }
/* Hand-placed: each pip sits a hair off the line. */
.sly-pips > span:nth-child(2n)   { transform: translateY(calc(var(--u) * .1)) rotate(4deg); }
.sly-pips > span:nth-child(3n)   { transform: translateY(calc(var(--u) * -.09)) rotate(-5deg); }
.sly-pips > span:nth-child(5n)   { transform: translateY(calc(var(--u) * .06)) rotate(2.5deg); }
.sly-pips > span.sly-pip-lost    { opacity: .92; }

/* ------- coin counter ------- */

.sly-coins {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * .42);
  transform: rotate(-1.8deg);
  transform-origin: left center;
}
.sly-coin-icon { width: calc(var(--u) * 2.25); height: calc(var(--u) * 2.25); }
.sly-coin-icon svg { width: 100%; height: 100%; }
.sly-coin-num {
  display: flex;
  align-items: baseline;
  font-size: calc(var(--u) * 2.05);
  line-height: 1;
  letter-spacing: .01em;
  color: var(--gold-l);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'lnum' 1;
  transform: skewX(-6deg);      /* the italic lean of a comic caption */
}
.sly-coin-num > i {
  font-style: normal;
  display: inline-block;
  width: calc(var(--u) * 1.18);
  text-align: center;
  transform-origin: 50% 65%;
}
.sly-coin-plus {
  font-size: calc(var(--u) * 1.05);
  color: var(--gold-l);
  margin-left: calc(var(--u) * .1);
  opacity: 0;
  transform: translateY(0);
}

/* ------- threat / exposure chip ------- */

/* The one-glance answer to "does anyone see me". It sits directly under the coins because that
   corner is where the eye already goes, and it is deliberately the only element in the HUD whose
   COLOUR changes with game state — so a change here is unmissable in peripheral vision. The three
   colours are the vision cone's own stops (see Alert.js), so the chip and the cone agree. */
.sly-threat {
  --threat-col: #fff0c2;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * .38);
  margin-top: calc(var(--u) * .12);
  padding: calc(var(--u) * .22) calc(var(--u) * .62) calc(var(--u) * .26) calc(var(--u) * .34);
  background: rgba(20, 14, 12, .82);
  border: calc(var(--u) * .13) solid var(--ink);
  border-radius: calc(var(--u) * .42);
  box-shadow: inset 0 0 0 calc(var(--u) * .06) color-mix(in srgb, var(--threat-col) 55%, transparent),
              0 calc(var(--u) * .22) 0 rgba(26,18,16,.6);
  transform: rotate(-1.5deg);
  transform-origin: left center;
  transition: box-shadow .18s ease;
}
.sly-threat-eye { width: calc(var(--u) * 1.5); flex: none; color: var(--threat-col); }
.sly-threat-eye svg { width: 100%; height: auto; }
.sly-threat-lbl {
  font-size: calc(var(--u) * .82);
  letter-spacing: .17em;
  color: var(--threat-col);
  transform: skewX(-5deg);
}
.sly-threat-num {
  font-size: calc(var(--u) * .72);
  letter-spacing: .06em;
  color: var(--threat-col);
  opacity: .92;
}

/* Shut lid while unseen — shape carries the state even before colour does. */
.sly-threat[data-state='hidden'] .sly-eye-iris,
.sly-threat[data-state='hidden'] .sly-eye-open { opacity: 0; }
.sly-threat:not([data-state='hidden']) .sly-eye-lid { opacity: 0; }

/* ------- the analog half: suspicion, before it becomes a state ------- */

/* The chip's discrete rungs answer "who has seen me". The lash arc answers "how close is
   anybody to deciding", which is the question a stealth player is actually asking between
   thresholds — and the only channel that moves at all during the fill from 0 to SUSPICIOUS,
   or during the drain back down out of a search. It is driven per frame, so no transition
   here: an eased meter lags the thing it is warning you about. */
.sly-eye-fill, .sly-eye-fill-ink { transition: none; }
/* Sub-threshold the arc is the only thing moving, so it gets its own presence; once the chip
   itself has gone loud the arc stops competing with it. */
.sly-threat[data-state='hidden'] .sly-eye-fill { filter: drop-shadow(0 0 calc(var(--u) * .3) var(--sus-col)); }

/* Escalation reads as urgency, not decoration: only the top rung pulses. */
.sly-threat[data-state='spotted'] { animation: sly-threat-pulse .58s ease-in-out infinite alternate; }
@keyframes sly-threat-pulse {
  from { box-shadow: inset 0 0 0 calc(var(--u) * .06) var(--threat-col), 0 calc(var(--u) * .22) 0 rgba(26,18,16,.6); }
  to   { box-shadow: inset 0 0 0 calc(var(--u) * .09) var(--threat-col),
                     0 0 calc(var(--u) * .9) color-mix(in srgb, var(--threat-col) 70%, transparent),
                     0 calc(var(--u) * .22) 0 rgba(26,18,16,.6); }
}

/* ------- carried loot ------- */

/* Picking a treasure up credits nothing (Pickups.js): it only pays at the fence, and being
   driven to CHASE while holding it drops it back into the world. So "I am carrying 320 coins
   of risk" is a live game state with a real failure mode attached, and it had no readout at
   all — one toast at pickup, then silence for the whole return leg. It sits under the threat
   chip because those two facts are read together: the value of what you are holding only
   matters next to how close you are to losing it. */
.sly-carry {
  display: none;
  align-items: center;
  gap: calc(var(--u) * .4);
  margin-top: calc(var(--u) * .18);
  padding: calc(var(--u) * .2) calc(var(--u) * .66) calc(var(--u) * .24) calc(var(--u) * .3);
  background: rgba(20, 14, 12, .82);
  border: calc(var(--u) * .13) solid var(--ink);
  border-radius: calc(var(--u) * .42);
  box-shadow: inset 0 0 0 calc(var(--u) * .06) rgba(232, 185, 66, .75),
              0 calc(var(--u) * .22) 0 rgba(26,18,16,.6);
  transform: rotate(-2.1deg);
  transform-origin: left center;
}
.sly-carry.on { display: flex; animation: sly-carry-in .34s var(--pop) both; }
@keyframes sly-carry-in {
  from { opacity: 0; transform: translateX(calc(var(--u) * -1.2)) rotate(-7deg) }
  to   { opacity: 1; transform: translateX(0) rotate(-2.1deg) }
}
.sly-carry-ic { width: calc(var(--u) * 1.5); height: calc(var(--u) * 1.5); flex: none; }
.sly-carry-ic svg { width: 100%; height: 100%; }
.sly-carry-name {
  font-size: calc(var(--u) * .84);
  letter-spacing: .1em;
  color: var(--paint);
  max-width: calc(var(--u) * 12);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transform: skewX(-5deg);
}
.sly-carry-val {
  font-size: calc(var(--u) * .84);
  letter-spacing: .04em;
  color: var(--gold-l);
  transform: skewX(-5deg);
}
/* The risk half, made visible: the instant anybody is above PATROL, the thing you are holding
   starts flashing, because that is the state in which a chase would take it off you. */
#sly-hud:not([data-threat='hidden']) .sly-carry.on {
  animation: sly-carry-risk .5s ease-in-out infinite alternate;
}
@keyframes sly-carry-risk {
  from { box-shadow: inset 0 0 0 calc(var(--u) * .06) rgba(232,185,66,.75),
                     0 calc(var(--u) * .22) 0 rgba(26,18,16,.6) }
  to   { box-shadow: inset 0 0 0 calc(var(--u) * .1) var(--gold-l),
                     0 0 calc(var(--u) * .8) rgba(232,185,66,.6),
                     0 calc(var(--u) * .22) 0 rgba(26,18,16,.6) }
}

/* ============================================================ OBJECTIVE CARD */

.sly-obj {
  position: absolute;
  right: calc(var(--u) * 1.9);
  top: calc(var(--u) * 1.7);
  max-width: min(42vw, calc(var(--u) * 26));
  opacity: 0;
  transform: translateX(calc(var(--u) * 5)) rotate(4deg);
  transition: opacity .34s ease, transform .34s ease;
}
.sly-obj.on {
  opacity: 1;
  transform: translateX(0) rotate(-1.9deg);
  transition: opacity .16s ease, transform .5s var(--pop);
}
/* The panel behind, offset the other way — two stacked comic cels. */
.sly-obj::before {
  content: '';
  position: absolute;
  inset: calc(var(--u) * .35) calc(var(--u) * -.45) calc(var(--u) * -.5) calc(var(--u) * .5);
  background: var(--lapis-d);
  border: calc(var(--u) * .17) solid var(--ink);
  transform: rotate(2.6deg);
  border-radius: calc(var(--u) * .18);
}
.sly-obj-card {
  position: relative;
  background: var(--paint);
  border: calc(var(--u) * .21) solid var(--ink);
  border-radius: calc(var(--u) * .2);
  box-shadow: calc(var(--u) * .38) calc(var(--u) * .4) 0 var(--ink),
              0 calc(var(--u) * .5) calc(var(--u) * 1.2) rgba(26,18,16,.45);
  padding: calc(var(--u) * .62) calc(var(--u) * .95) calc(var(--u) * .72);
  overflow: hidden;
}
/* Halftone — the single strongest "this is printed" cue. */
.sly-obj-card::after {
  content: '';
  position: absolute; inset: 0;
  background-image: radial-gradient(circle at 50% 50%, rgba(26,18,16,.17) 26%, transparent 28%);
  background-size: calc(var(--u) * .42) calc(var(--u) * .42);
  opacity: .8;
  pointer-events: none;
}
.sly-obj-kick {
  display: inline-block;
  /* --lapis-d, not --lapis: pale gold on #2a7fd4 measures 3.44:1 and fails the 4.5:1 bar this
     HUD is held to (tests/hud.test.mjs M2). On #1f4f96 the same text clears at 6.68:1. */
  background: var(--lapis-d);
  color: var(--gold-l);
  font-size: calc(var(--u) * .74);
  letter-spacing: .22em;
  padding: calc(var(--u) * .16) calc(var(--u) * .5) calc(var(--u) * .2);
  border: calc(var(--u) * .13) solid var(--ink);
  border-radius: calc(var(--u) * .12);
  transform: rotate(-1.2deg);
  position: relative; z-index: 1;
}
.sly-obj-title {
  position: relative; z-index: 1;
  margin-top: calc(var(--u) * .38);
  font-size: calc(var(--u) * 1.32);
  line-height: 1.02;
  color: var(--ink);
  letter-spacing: -.005em;
  transform: skewX(-5deg);
  text-shadow: calc(var(--u) * .07) calc(var(--u) * .07) 0 rgba(232,185,66,.9);
}
.sly-obj-sub {
  position: relative; z-index: 1;
  margin-top: calc(var(--u) * .28);
  font-size: calc(var(--u) * .78);
  font-weight: 700;
  letter-spacing: .1em;
  color: #6b503c;
  max-height: calc(var(--u) * 1.4);
  overflow: hidden;
  transition: max-height .4s var(--settle), opacity .3s ease, margin-top .4s var(--settle);
}
.sly-obj-eye {
  position: absolute;
  right: calc(var(--u) * -.35); bottom: calc(var(--u) * -.5);
  width: calc(var(--u) * 4.4); opacity: .17; z-index: 0;
  transform: rotate(-8deg);
}
.sly-obj-eye svg { width: 100%; height: auto; }
.sly-obj.mini .sly-obj-sub { max-height: 0; opacity: 0; margin-top: 0; }
.sly-obj.mini .sly-obj-title { font-size: calc(var(--u) * 1.02); }
.sly-obj.mini .sly-obj-card { padding: calc(var(--u) * .48) calc(var(--u) * .8) calc(var(--u) * .5); }
.sly-obj.mini { opacity: .93; }

/* ================================================================== TOASTS */

.sly-toasts {
  position: absolute;
  left: 50%; top: calc(var(--u) * 1.6);
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center;
  gap: calc(var(--u) * .42);
  width: max-content; max-width: 70vw;
}
.sly-toast {
  display: flex; align-items: center; gap: calc(var(--u) * .5);
  background: var(--ink);
  border: calc(var(--u) * .15) solid var(--gold);
  border-radius: calc(var(--u) * 1.4);
  padding: calc(var(--u) * .34) calc(var(--u) * .95) calc(var(--u) * .38) calc(var(--u) * .42);
  box-shadow: 0 calc(var(--u) * .3) 0 rgba(26,18,16,.6),
              0 calc(var(--u) * .5) calc(var(--u) * 1.1) rgba(26,18,16,.5);
  font-size: calc(var(--u) * .95);
  letter-spacing: .045em;
  color: var(--paint);
  white-space: nowrap;
  opacity: 0;
  transform: translateY(calc(var(--u) * -1.3)) scale(.86);
  transition: opacity .3s ease, transform .3s ease;
}
.sly-toast > .ic { width: calc(var(--u) * 1.55); height: calc(var(--u) * 1.55); flex: none; }
.sly-toast > .ic svg { width: 100%; height: 100%; }
.sly-toast.on {
  opacity: 1; transform: translateY(0) scale(1) rotate(-.8deg);
  transition: opacity .1s ease, transform .34s var(--pop);
}

/* ================================================================ PROMPT */

.sly-prompt {
  position: absolute;
  left: 50%; bottom: calc(var(--u) * 4.4);
  display: flex; align-items: center; gap: calc(var(--u) * .62);
  padding: calc(var(--u) * .32) calc(var(--u) * 1.05) calc(var(--u) * .36) calc(var(--u) * .42);
  background: rgba(20, 14, 12, .9);
  border: calc(var(--u) * .16) solid var(--ink);
  border-radius: calc(var(--u) * .55);
  box-shadow: inset 0 0 0 calc(var(--u) * .07) rgba(232,185,66,.5),
              0 calc(var(--u) * .32) 0 rgba(26,18,16,.65),
              0 calc(var(--u) * .55) calc(var(--u) * 1.3) rgba(26,18,16,.55);
  opacity: 0;
  transform: translate(-50%, calc(var(--u) * 1.1)) scale(.9);
  transition: opacity .32s ease, transform .34s ease;
}
.sly-prompt.on {
  opacity: 1;
  transform: translate(-50%, 0) scale(1) rotate(-.7deg);
  transition: opacity .09s ease, transform .17s var(--pop);
}
.sly-prompt .sly-key { height: calc(var(--u) * 2.15); width: auto; }
.sly-prompt-dash {
  width: calc(var(--u) * .8); height: calc(var(--u) * .17);
  background: var(--gold); border-radius: 2px; flex: none;
}
.sly-prompt-verb {
  font-size: calc(var(--u) * 1.08);
  letter-spacing: .05em;
  color: var(--paint);
  transform: skewX(-5deg);
  white-space: nowrap;
}

/* ======================================================= DAMAGE / HIT FX */

/* Driven per-frame from HUD._tickFx, so no transition here — it would smear the hit. */
.sly-vig {
  position: absolute; inset: 0; z-index: 7; opacity: 0;
  background:
    radial-gradient(ellipse 78% 72% at 50% 50%, transparent 42%, rgba(184,69,44,.42) 82%, rgba(90,20,14,.72) 100%);
  mix-blend-mode: multiply;
}
.sly-flash {
  position: absolute; inset: 0; z-index: 8; opacity: 0;
  background: radial-gradient(ellipse at 50% 50%, rgba(255,233,168,.5), rgba(184,69,44,.62));
  mix-blend-mode: screen;
}

/* ========================================================= THIEF-O-VISION */

.sly-tov { position: absolute; inset: 0; z-index: 1; opacity: 0; transition: opacity .22s ease; }
.sly-tov.on { opacity: 1; }
/* Drains the world through the compositor — it never touches the WebGL buffer, so the
   canonical screenshots stay untouched even if someone forgets to hide the HUD. */
.sly-tov-drain {
  position: absolute; inset: 0;
  -webkit-backdrop-filter: grayscale(.86) contrast(1.45) brightness(.74);
  backdrop-filter: grayscale(.86) contrast(1.45) brightness(.74);
  background: rgba(22, 30, 52, .3);
}
/* Fallback drain that needs no backdrop-filter: a flat grey in mix-blend-mode saturation
   strips chroma straight out of whatever the renderer put on the canvas. */
.sly-tov-desat { position: absolute; inset: 0; background: #8e8e8e; mix-blend-mode: saturation; opacity: .8; }
.sly-tov-crush { position: absolute; inset: 0; background: rgba(16, 22, 40, .34); mix-blend-mode: multiply; }
.sly-tov-vig {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 66% 62% at 50% 50%, transparent 34%, rgba(10,14,26,.62) 78%, rgba(6,9,18,.9) 100%),
    radial-gradient(ellipse 88% 84% at 50% 50%, transparent 62%, rgba(42,127,212,.3) 92%);
}
.sly-tov-rings {
  position: absolute; inset: -20%;
  background: repeating-radial-gradient(circle at 50% 50%,
    transparent 0 calc(var(--u) * 3.4), rgba(143,216,255,.075) calc(var(--u) * 3.4) calc(var(--u) * 3.55));
  animation: sly-tov-pulse 3.4s linear infinite;
}
@keyframes sly-tov-pulse { from { transform: scale(1); opacity: .85 } to { transform: scale(1.13); opacity: 0 } }
.sly-tov-tag {
  position: absolute; left: 50%; bottom: calc(var(--u) * 1.5); transform: translateX(-50%);
  font-size: calc(var(--u) * .82); letter-spacing: .42em; color: var(--spark);
  animation: sly-flicker 2.6s steps(1) infinite;
}
@keyframes sly-flicker { 0%,88%,100% { opacity: .95 } 90% { opacity: .35 } 93% { opacity: .95 } 96% { opacity: .5 } }

/* ============================================ SCREEN-PROJECTED WORLD MARKS */

.sly-marks { position: absolute; inset: 0; z-index: 3; }
.sly-mark {
  position: absolute; left: 0; top: 0;
  width: calc(var(--u) * 3.1); height: calc(var(--u) * 3.1);
  margin: calc(var(--u) * -1.55) 0 0 calc(var(--u) * -1.55);
  color: var(--spark);
  opacity: 0;
  transition: opacity .18s ease;
  will-change: transform;
}
.sly-mark.on { opacity: 1; }
.sly-mark.gold { color: var(--gold); }
.sly-mark svg { width: 100%; height: 100%; animation: sly-spin 7s linear infinite; }
.sly-mark .lbl {
  position: absolute; left: 50%; top: 104%; transform: translateX(-50%);
  font-size: calc(var(--u) * .72); letter-spacing: .2em; white-space: nowrap; color: inherit;
}
@keyframes sly-spin { to { transform: rotate(360deg) } }

/* ---- objective marker ---- */

/* "Where is my objective" answered in world space rather than as a line of prose. It only ever
   points at something that exists right now — the fence while a treasure is in hand, or the spot
   a chase knocked it out of your hands — so it is never ambient clutter, and it retires itself
   the moment the loop closes.

   The direction chevron orbits the head instead of replacing it, and the head does not spin:
   during a fast pan the eye tracks a stable shape and reads the *bearing* off the part that
   moves. A marker that rotates as a whole reads as a wobble. */
.sly-goal {
  position: absolute; left: 0; top: 0;
  width: calc(var(--u) * 3.3); height: calc(var(--u) * 3.3);
  margin: calc(var(--u) * -1.65) 0 0 calc(var(--u) * -1.65);
  opacity: 0; transition: opacity .2s ease;
  will-change: transform;
}
.sly-goal.on { opacity: 1; }
.sly-goal-pin {
  position: absolute; inset: 0;
  animation: sly-goal-bob 1.9s ease-in-out infinite alternate;
}
.sly-goal-pin svg { width: 100%; height: 100%; }
@keyframes sly-goal-bob {
  from { transform: translateY(calc(var(--u) * -.16)) scale(1) }
  to   { transform: translateY(calc(var(--u) * .16)) scale(1.04) }
}
/* Ring carries the bearing; the arrow rides at its top edge. */
.sly-goal-ring { position: absolute; inset: 0; opacity: 0; transition: opacity .18s ease; }
.sly-goal.edge .sly-goal-ring { opacity: 1; }
.sly-goal-arrow {
  position: absolute; left: 50%; top: calc(var(--u) * -1.15);
  width: calc(var(--u) * 1.5); height: calc(var(--u) * 1.5);
  margin-left: calc(var(--u) * -.75);
}
.sly-goal-arrow svg { width: 100%; height: 100%; }
/* Off-screen, the head shrinks and the chevron takes over: it has become a direction, not a place. */
.sly-goal.edge .sly-goal-pin { transform: scale(.8); animation: none; }
.sly-goal-txt {
  position: absolute; left: 50%; top: 100%;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center;
  gap: calc(var(--u) * .04);
  white-space: nowrap;
}
.sly-goal-lbl {
  font-size: calc(var(--u) * .78);
  letter-spacing: .16em;
  color: var(--gold-l);
  transform: skewX(-5deg);
}
.sly-goal-dist {
  font-size: calc(var(--u) * .74);
  letter-spacing: .08em;
  color: var(--paint);
  font-variant-numeric: tabular-nums;
}

/* ---- guard suspicion / alert ---- */

.sly-alert {
  position: absolute; left: 0; top: 0;
  width: calc(var(--u) * 2.9); height: calc(var(--u) * 2.9);
  margin: calc(var(--u) * -1.45) 0 0 calc(var(--u) * -1.45);
  opacity: 0; transition: opacity .16s ease;
  will-change: transform;
}
.sly-alert.on { opacity: 1; }
/* The root carries the projected translate; scale/throb lives on .inner so the two never fight. */
.sly-alert .inner { position: absolute; inset: 0; }
.sly-alert svg { width: 100%; height: 100%; }
.sly-alert-glyph {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  font-size: calc(var(--u) * 1.5);
  color: var(--alert-col, var(--gold-l));
  transform: skewX(-6deg);
}
/* Two-character glyphs ('?!', '··') would overflow the badge at the single-char size. */
.sly-alert-glyph[data-wide='1'] { font-size: calc(var(--u) * 1.08); letter-spacing: -.02em; }

/* The words are what actually get read. Without them the ladder is five shapes the player has
   to have learned; with them it is five states they can name on first sight. */
.sly-alert-lbl {
  position: absolute; left: 50%; top: 101%;
  transform: translateX(-50%) skewX(-5deg);
  /* At the --u floor (11px, i.e. 1280x720) .58 rendered at 6.4px — smaller than the pause
     menu's own footnotes, for the single most urgent read in the game. See M6. */
  font-size: calc(var(--u) * .86);
  letter-spacing: .16em;
  white-space: nowrap;
  color: var(--alert-col, var(--gold-l));
}
.sly-alert.full .sly-alert-glyph { font-size: calc(var(--u) * 1.9); }
.sly-alert.full .inner { animation: sly-alert-throb .42s ease-in-out infinite alternate; }
/* A downed guard is information, not a threat — it recedes instead of competing. */
.sly-alert.down { opacity: .62; }
.sly-alert.down .inner { transform: scale(.8); }
@keyframes sly-alert-throb { from { transform: scale(1) } to { transform: scale(1.14) } }
/* Pinned to the frame edge: dimmed so an off-screen guard reads as a direction, not a target. */
.sly-alert.edge { opacity: .8; }
.sly-alert.edge .inner { transform: scale(.82); }

/* ============================================================== BINOCUCOM */

.sly-binoc {
  position: absolute; inset: 0; z-index: 6;
  opacity: 0; visibility: hidden;
  transition: opacity .2s ease, visibility 0s .2s;
}
.sly-binoc.on { opacity: 1; visibility: visible; transition: opacity .13s ease, visibility 0s; }

/* The gameplay cluster stands down while the optics are up — see HUD.binocucom(). */
#sly-hud[data-binoc='1'] .sly-shake { opacity: 0; transition: opacity .16s ease; }
#sly-hud .sly-shake { transition: opacity .2s ease; }

/* The lens. Its own box-shadow paints the entire surround, so the "looking through
   optics" mask needs no SVG and can't stretch with the viewport aspect. */
.sly-binoc-lens {
  position: absolute;
  inset: 4.6% 3.4%;
  border-radius: clamp(14px, 3.4vmin, 60px);
  overflow: hidden;
  border: calc(var(--u) * .22) solid var(--ink);
  -webkit-backdrop-filter: saturate(1.22) contrast(1.1) brightness(.94) hue-rotate(-5deg);
  backdrop-filter: saturate(1.22) contrast(1.1) brightness(.94) hue-rotate(-5deg);
  background: rgba(30, 60, 96, .1);
  box-shadow:
    0 0 0 100vmax rgba(12, 10, 9, .93),
    inset 0 0 0 calc(var(--u) * .11) rgba(232, 185, 66, .55),
    inset 0 0 calc(var(--u) * 3.6) calc(var(--u) * 1.1) rgba(8, 12, 20, .55),
    inset 0 0 calc(var(--u) * 1.2) rgba(143, 216, 255, .22);
  transform: scale(.93);
  transition: transform .26s ease;
}
.sly-binoc.on .sly-binoc-lens { transform: scale(1); transition: transform .3s var(--pop); }
.sly-binoc-lens > div { position: absolute; inset: 0; pointer-events: none; }

/* Phosphor scanlines. */
.bx-scan {
  background: repeating-linear-gradient(to bottom,
    rgba(6, 10, 18, .34) 0 calc(var(--u) * .12),
    transparent calc(var(--u) * .12) calc(var(--u) * .3));
  mix-blend-mode: multiply;
}
/* A second, much finer aperture grille — it's what stops the scanlines reading as blinds. */
.bx-grille {
  background: repeating-linear-gradient(to right,
    rgba(143, 216, 255, .07) 0 1px, transparent 1px 3px);
}
/* CRT: barrel-corner falloff plus one glass specular high on the left. */
.bx-crt {
  background:
    radial-gradient(118% 128% at 50% 50%, transparent 48%, rgba(8,10,16,.34) 76%, rgba(6,8,14,.82) 100%),
    radial-gradient(62% 40% at 30% 17%, rgba(255,255,255,.085), transparent 64%),
    radial-gradient(40% 26% at 74% 88%, rgba(143,216,255,.07), transparent 70%);
}
/* Chromatic fringe: cyan pooling on one edge, carnelian on the other. */
.bx-fringe {
  mix-blend-mode: screen;
  background:
    radial-gradient(120% 130% at 50% 50%, transparent 60%, rgba(143,216,255,.22) 89%, rgba(143,216,255,.06) 100%),
    linear-gradient(90deg, rgba(184,69,44,.3) 0 .5%, rgba(184,69,44,.09) 2.4%, transparent 6%),
    linear-gradient(270deg, rgba(143,216,255,.3) 0 .5%, rgba(143,216,255,.09) 2.4%, transparent 6%),
    linear-gradient(180deg, rgba(143,216,255,.2) 0 .6%, transparent 4%),
    linear-gradient(0deg, rgba(184,69,44,.2) 0 .6%, transparent 4%);
}
.bx-sweep {
  background: linear-gradient(to bottom, transparent 0 46%,
    rgba(143,216,255,.16) 48%, rgba(230,250,255,.4) 50%, rgba(143,216,255,.16) 52%, transparent 54%);
  mix-blend-mode: screen;
  animation: sly-sweep 4.6s linear infinite;
}
@keyframes sly-sweep { from { transform: translateY(-52%) } to { transform: translateY(52%) } }

.bx-corner { position: absolute; width: calc(var(--u) * 2.6); height: calc(var(--u) * 2.6); }
.bx-corner svg { width: 100%; height: 100%; }
.bx-corner.tl { left: calc(var(--u) * .55); top: calc(var(--u) * .55); }
.bx-corner.tr { right: calc(var(--u) * .55); top: calc(var(--u) * .55); transform: scaleX(-1); }
.bx-corner.br { right: calc(var(--u) * .55); bottom: calc(var(--u) * .55); transform: scale(-1); }
.bx-corner.bl { left: calc(var(--u) * .55); bottom: calc(var(--u) * .55); transform: scaleY(-1); }

/* Readouts live above the lens, inside its inset, in the surround-safe margin. */
.bx-ui { position: absolute; inset: 4.6% 3.4%; padding: calc(var(--u) * 1.1) calc(var(--u) * 1.3); }
.bx-mono {
  position: absolute;
  font-family: 'DejaVu Sans Mono', ui-monospace, monospace;
  font-size: calc(var(--u) * .74);
  letter-spacing: .13em;
  color: var(--spark);
  text-shadow: 0 0 calc(var(--u) * .5) rgba(143,216,255,.75), 0 calc(var(--u) * .08) 0 var(--ink);
  line-height: 1.72;
  white-space: pre;
}
/* Clear of the corner brackets. Each bracket is 2.6u square inset .55u, so it occupies
   .55u to 3.15u from its corner; a readout starting at 1.15u ran straight through the
   bracket's arm. 3.35u puts the text past it on the axis it would otherwise collide on. */
.bx-tl { left: calc(var(--u) * 1.4); top: calc(var(--u) * 3.35); }
.bx-bl { left: calc(var(--u) * 1.4); bottom: calc(var(--u) * 3.35); }
.bx-br { right: calc(var(--u) * 1.4); bottom: calc(var(--u) * 3.35); text-align: right; }
.bx-mono b { color: var(--gold-l); font-weight: 700; }
.bx-mono .sig { display: inline-block; height: calc(var(--u) * .82); vertical-align: -.14em; }
.bx-mono .sig svg { height: 100%; width: auto; }

.bx-rec {
  position: absolute; right: calc(var(--u) * 1.4); top: calc(var(--u) * 3.35);
  display: flex; align-items: center; gap: calc(var(--u) * .42);
  font-family: 'DejaVu Sans Mono', ui-monospace, monospace;
  font-size: calc(var(--u) * .8); letter-spacing: .3em; color: #ffd9d0;
}
.bx-rec i {
  width: calc(var(--u) * .72); height: calc(var(--u) * .72); border-radius: 50%;
  background: var(--carn); border: calc(var(--u) * .1) solid var(--ink);
  box-shadow: 0 0 calc(var(--u) * .7) rgba(184,69,44,.95);
  animation: sly-rec 1.15s steps(1) infinite;
}
@keyframes sly-rec { 0%, 74% { opacity: 1 } 75%, 100% { opacity: .18 } }

.bx-cross {
  position: absolute; left: 50%; top: 50%;
  width: calc(var(--u) * 9.5); height: calc(var(--u) * 9.5);
  transform: translate(-50%, -50%);
  animation: sly-cross-breathe 3.1s ease-in-out infinite alternate;
}
.bx-cross svg { width: 100%; height: 100%; }
.sly-x-ring { transform-origin: 100px 100px; animation: sly-spin 22s linear infinite; }
@keyframes sly-cross-breathe { from { transform: translate(-50%,-50%) scale(1) } to { transform: translate(-50%,-50%) scale(1.045) } }

/* Vertical ranging ruler on the left of the lens. */
.bx-ruler {
  position: absolute; left: calc(var(--u) * 1.35); top: 50%;
  transform: translateY(-50%);
  display: flex; flex-direction: column; gap: calc(var(--u) * .5);
  align-items: flex-start;
}
.bx-ruler i {
  display: block; height: calc(var(--u) * .14); width: calc(var(--u) * .8);
  background: rgba(143,216,255,.75);
  box-shadow: 0 0 calc(var(--u) * .4) rgba(143,216,255,.6);
}
.bx-ruler i:nth-child(3n+1) { width: calc(var(--u) * 1.5); background: var(--gold); }

/* ---- caller panel ---- */

.bx-caller {
  position: absolute;
  left: calc(var(--u) * 1.4); bottom: calc(var(--u) * 3.3);
  display: flex; align-items: stretch; gap: calc(var(--u) * .6);
  background: rgba(14, 11, 10, .92);
  border: calc(var(--u) * .18) solid var(--ink);
  box-shadow: inset 0 0 0 calc(var(--u) * .09) rgba(232,185,66,.45),
              calc(var(--u) * .3) calc(var(--u) * .32) 0 rgba(10,8,7,.7);
  padding: calc(var(--u) * .42);
  transform: rotate(-1.4deg);
  max-width: min(46vw, calc(var(--u) * 24));
  transition: opacity .3s ease, transform .4s var(--pop);
}
.sly-binoc.on .bx-caller { animation: sly-caller-in .42s var(--pop) both .1s; }
@keyframes sly-caller-in {
  from { opacity: 0; transform: translateX(calc(var(--u) * -2.5)) rotate(-6deg) }
  to   { opacity: 1; transform: translateX(0) rotate(-1.4deg) }
}
.bx-caller-pic {
  position: relative; flex: none;
  width: calc(var(--u) * 4.6); height: calc(var(--u) * 4.6);
  border: calc(var(--u) * .13) solid var(--gold);
  overflow: hidden;
}
.bx-caller-pic svg { width: 100%; height: 100%; }
.bx-caller-pic::after {
  content: ''; position: absolute; inset: 0;
  background: repeating-linear-gradient(to bottom, rgba(8,14,26,.4) 0 1px, transparent 1px 3px),
              linear-gradient(to bottom, transparent 40%, rgba(143,216,255,.35) 50%, transparent 60%);
  background-size: 100% 3px, 100% 200%;
  animation: sly-portrait-scan 2.8s linear infinite;
}
@keyframes sly-portrait-scan { from { background-position: 0 0, 0 -100% } to { background-position: 0 0, 0 100% } }
.bx-caller-meta { display: flex; flex-direction: column; justify-content: center; gap: calc(var(--u) * .18); min-width: 0; }
.bx-caller-name {
  font-size: calc(var(--u) * .92); letter-spacing: .2em; color: var(--gold-l);
}
.bx-caller-line {
  font-size: calc(var(--u) * .78); font-weight: 700; color: var(--paint); opacity: .93;
  line-height: 1.35; letter-spacing: .015em;
}
.bx-wave { display: flex; align-items: flex-end; gap: calc(var(--u) * .13); height: calc(var(--u) * .7); }
.bx-wave i {
  width: calc(var(--u) * .16); height: 40%; background: var(--spark); border-radius: 1px;
  animation: sly-wave .62s ease-in-out infinite alternate;
}
.bx-wave i:nth-child(2) { animation-delay: .09s } .bx-wave i:nth-child(3) { animation-delay: .18s }
.bx-wave i:nth-child(4) { animation-delay: .27s } .bx-wave i:nth-child(5) { animation-delay: .36s }
.bx-wave i:nth-child(6) { animation-delay: .45s } .bx-wave i:nth-child(7) { animation-delay: .54s }
@keyframes sly-wave { from { height: 22% } to { height: 100% } }

/* ================================================================ PAUSE */

.sly-pause {
  position: absolute; inset: 0; z-index: 9;
  display: grid; place-items: center;
  opacity: 0; visibility: hidden;
  background: rgba(10, 7, 14, .62);
  -webkit-backdrop-filter: blur(calc(var(--u) * .4)) saturate(.62) brightness(.72);
  backdrop-filter: blur(calc(var(--u) * .4)) saturate(.62) brightness(.72);
  transition: opacity .2s ease, visibility 0s .2s;
  padding: calc(var(--u) * 1.4);
}
.sly-pause.on { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity .16s ease, visibility 0s; }

.sly-pause-panel {
  position: relative;
  width: min(96vw, calc(var(--u) * 62));
  max-height: 92vh; overflow: auto;
  background: var(--paint);
  border: calc(var(--u) * .24) solid var(--ink);
  border-radius: calc(var(--u) * .24);
  box-shadow: calc(var(--u) * .5) calc(var(--u) * .55) 0 var(--ink),
              0 calc(var(--u) * 1.2) calc(var(--u) * 3) rgba(0,0,0,.6);
  padding: calc(var(--u) * 1.1) calc(var(--u) * 1.4) calc(var(--u) * 1.2);
  transform: scale(.92) rotate(1.2deg);
  transition: transform .3s ease;
  scrollbar-width: thin;
}
.sly-pause.on .sly-pause-panel { transform: scale(1) rotate(-.6deg); transition: transform .34s var(--pop); }
.sly-pause-panel::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle at 50% 50%, rgba(26,18,16,.13) 26%, transparent 28%);
  background-size: calc(var(--u) * .4) calc(var(--u) * .4);
}
.sly-pause-head { display: flex; align-items: center; gap: calc(var(--u) * .8); position: relative; }
.sly-pause-head .mark { width: calc(var(--u) * 3.2); flex: none; }
.sly-pause-head .mark svg { width: 100%; height: auto; }
.sly-pause-title {
  font-size: calc(var(--u) * 2.2); line-height: .95; color: var(--ink);
  letter-spacing: -.01em; transform: skewX(-6deg);
  text-shadow: calc(var(--u) * .09) calc(var(--u) * .09) 0 var(--gold);
}
.sly-pause-title em {
  display: block; font-style: normal; font-size: calc(var(--u) * .78);
  letter-spacing: .3em; color: var(--lapis-d); text-shadow: none; margin-top: calc(var(--u) * .22);
}
.sly-pause-rule {
  height: calc(var(--u) * .18); background: var(--ink); border-radius: 2px;
  margin: calc(var(--u) * .7) 0 calc(var(--u) * .8); position: relative;
}
.sly-pause-rule .cane {
  position: absolute; right: 0; top: calc(var(--u) * -1.7); height: calc(var(--u) * 2.6);
  transform: rotate(12deg);
}
.sly-pause-rule .cane svg { height: 100%; width: auto; }

.sly-cols {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(var(--u) * 22), 1fr));
  gap: calc(var(--u) * .5) calc(var(--u) * 1.6);
}
.sly-grp { break-inside: avoid; margin-bottom: calc(var(--u) * .5); }
.sly-grp > h4 {
  display: inline-block;
  font-size: calc(var(--u) * .72); letter-spacing: .24em; color: var(--gold-l);
  background: var(--ink); padding: calc(var(--u) * .14) calc(var(--u) * .5);
  border-radius: calc(var(--u) * .1);
  transform: rotate(-.9deg); margin-bottom: calc(var(--u) * .34);
}
.sly-row {
  display: grid;
  grid-template-columns: calc(var(--u) * 11.4) 1fr;
  align-items: center; gap: calc(var(--u) * .5);
  padding: calc(var(--u) * .12) 0;
}
.sly-row + .sly-row { border-top: 1px dashed rgba(26,18,16,.2); }
.sly-row .ks { display: flex; align-items: center; gap: calc(var(--u) * .2); flex-wrap: wrap; }
.sly-row .ks .sly-key { height: calc(var(--u) * 1.6); width: auto; }
.sly-row .ks .sly-key.wide { height: calc(var(--u) * 1.6); }
.sly-row .ks .plus { font-size: calc(var(--u) * .7); color: #6b503c; }
.sly-row .dsc { font-size: calc(var(--u) * .84); color: var(--ink); font-weight: 700; line-height: 1.28; }
.sly-row .dsc small {
  display: block; font-size: calc(var(--u) * .68); color: #6b503c; letter-spacing: .04em;
  font-weight: 700;
}
.sly-pause-foot {
  position: relative;
  margin-top: calc(var(--u) * .8);
  display: flex; align-items: center; justify-content: space-between; gap: calc(var(--u) * 1);
  flex-wrap: wrap;
}
.sly-btn {
  pointer-events: auto; cursor: pointer;
  font-family: inherit; font-weight: 700;
  font-size: calc(var(--u) * .95); letter-spacing: .16em; color: var(--gold-l);
  background: var(--ink); border: calc(var(--u) * .14) solid var(--ink);
  border-radius: calc(var(--u) * .18);
  padding: calc(var(--u) * .38) calc(var(--u) * 1.1);
  box-shadow: calc(var(--u) * .22) calc(var(--u) * .24) 0 var(--lapis-d);
  transform: rotate(-.8deg);
  transition: transform .12s var(--pop), box-shadow .12s ease;
}
.sly-btn:hover { transform: rotate(-.8deg) translate(calc(var(--u) * -.06), calc(var(--u) * -.06)); }
.sly-btn:active { transform: rotate(-.8deg) translate(calc(var(--u) * .16), calc(var(--u) * .18)); box-shadow: 0 0 0 var(--lapis-d); }
.sly-pause-tip { font-size: calc(var(--u) * .74); color: #6b503c; letter-spacing: .08em; }

/* ============================================================ reduced motion */

@media (prefers-reduced-motion: reduce) {
  #sly-hud *, #sly-hud *::before, #sly-hud *::after {
    animation-duration: .001s !important;
    animation-iteration-count: 1 !important;
    transition-duration: .05s !important;
  }
  .bx-rec i { opacity: 1 !important; }
  .sly-tov-rings { display: none; }
}
`;
