import * as THREE from 'three';

/**
 * Atmosphere — the single source of truth for "what colour is the world right now".
 *
 * Sky.js and Lighting.js both resolve their state through `evalAtmosphere()`, which is a
 * pure function of `engine.debug.timeOfDay`. Two modules deriving the sun from one model is
 * the only way the sky and the key light can never disagree: if the sun disc in the dome sat
 * somewhere other than where the shadows point, the frame would die instantly.
 *
 * The palette anchors below ARE AGENTS.md §2.2. The scattering maths shapes the *gradient*;
 * the anchors pin the *hues*, so golden hour lands exactly on zenith #3f7fc4 / horizon
 * #f0c88a / haze #e8b878 rather than on whatever a physical model happens to produce.
 *
 * Everything here is allocation-free after construction — `evalAtmosphere` writes into a
 * state object you own (AGENTS.md §5).
 */

/* ── §2.2, verbatim ─────────────────────────────────────────────────────────── */
export const PALETTE = {
  keySun:     0xffd9a0,
  fillSky:    0x6fa8d8,
  bounceSand: 0xe8a852,
  rimCool:    0x7fd4ff,
  rimWarm:    0xff9a5c,
  skyZenith:  0x3f7fc4,
  skyHorizon: 0xf0c88a,
  skyHaze:    0xe8b878,
  shadowHue:  0x2a3f66,
  moon:       0x9ec4ff,
  inkWarm:    0x1a1210,
  inkCool:    0x161022,
  sandLight:  0xe6b878,
  sandMid:    0xc9915a,
};

/** Shadows may never fall below this fraction of key luminance (§2.2 "never below").
 *
 *  ── §214.3: this export is NOT the operative floor, and raising it does nothing ──────────
 *  `ToonMaterial.setKeyLight()` takes it as `ambient.floor` and applies
 *  `this._shadowFloor = Math.min(TUNE.shadowFloor, ambient.floor)` against its own
 *  `TUNE.shadowFloor = 0.125`. The min() means the shipped effective floor is **0.125**, this
 *  0.14 never binds, and moving this number UP is a silent no-op while moving it DOWN is live.
 *  Recorded here because the asymmetry is invisible from this file and §2.2 quotes 14 %.
 *
 *  Left at 0.14 deliberately. See §214.4 for why lowering it is not the fix for "nothing is
 *  black": on §2.2 SANDSTONE mid the floor term ALONE — with every fill light switched off —
 *  already lands at display L ≈ 100 through the shipped tone chain, so the display black has
 *  to come from low-albedo materials (PAINT black #241a16 → L 13, CREVICE #4a2f22 → L 28) and
 *  from AO, not from this constant. */
export const SHADOW_FLOOR = 0.14;

/* §214.2. Both legs are 0.50: the night boost is withdrawn, daylight is untouched. Named
   rather than inlined so the next sweep moves a constant instead of editing an expression. */
const RIM_STRENGTH_DAY = 0.50;
const RIM_STRENGTH_NIGHT = 0.50;

/* ── Sun / moon track ───────────────────────────────────────────────────────────
   Art-directed rather than astronomical. A real 24 h sinusoid puts sunset at tod 0.75,
   but Shots.js asks for 22° of elevation at tod 0.79, so the track is a keyed table:
   the canonical shots then land on exact, repeatable sun angles.
   Azimuth: 0° = +X east, 90° = +Z south, 180° = −X west. Summer-Egypt track, so the
   sun sets a touch north of west — that is what rakes the north–south temple axis.

   ── §256: this azimuth is why the frames have no highlight range, and it is not a small effect
   ────────────────────────────────────────────────────────────────────────────────────────────
   §214.1 measured that both MOON-keyed shots are ~180° backlit and stopped there. The same
   arithmetic on daylight says **twelve of the fourteen daylight shots, including all seven
   environment shots, have every camera-facing vertical surface at ramp 0 or 0.5** — the
   canonical cameras are pointed into the sun. Camera-facing wall N·L against `termLo` 0.14 /
   `termHi` 0.52:

     ramp 0    hero -0.6308 · kaykit -0.3152 · temple -0.0496 · courtyard +0.1393
               dunes -0.5400 · traversal -0.4264 · combat -0.6129 · sly-profile -0.6243
     ramp 0.5  sly-closeup +0.3168 · sly-perch +0.3168 · sly-key +0.3168 · interior +0.2125
     ramp 1    sly-startle +0.6470 · sly-arm +0.8578      <- character turnarounds only

   Confirmed against the real geometry, not just that model: raycasting each camera through
   ARCHITECTURE + PROPS and evaluating ToonMaterial's own `slyRamp` on each hit's world normal
   (scratchpad/ndlmap.mjs; its calibration arm — slyRamp returning exactly 1 at N·L 1 and 0 at
   −1 — fired) gives the share of VISIBLE surface by ramp level:

     shot          ramp=0 (no key)   ramp~0.5   ramp=1    mean ramp
     hero              72.3 %          27.3 %     0.4 %     0.140
     temple            54.8 %          23.8 %    21.4 %     0.311
     courtyard         60.1 %          23.8 %    16.1 %     0.279
     sly-closeup       32.3 %          45.0 %    22.7 %     0.452
     dunes             85.2 %          13.1 %     1.7 %     0.080
     traversal         79.6 %          19.6 %     0.8 %     0.106
     combat            66.7 %          33.3 %     0.1 %     0.166

   Sweeping an OFFSET onto this table (same instrument), mean visible ramp / share at full key:

     shot          shipped        +200°          +240°          +280°
     hero        0.138 / 0.5%   0.673 / 40.5%  0.720 / 44.7%  0.532 / 32.3%
     courtyard   0.260 / 15.1%  0.454 / 13.1%  0.704 / 56.9%  0.722 / 56.3%
     temple      0.308 / 20.8%  0.383 / 27.3%  0.611 / 52.4%  0.613 / 55.2%
     sly-closeup 0.443 / 21.7%  0.377 /  1.2%  0.538 / 31.5%  0.644 / 32.2%
     dunes       0.080 /  1.7%  0.635 / 29.3%  0.837 / 68.7%  0.748 / 64.1%
     traversal   0.106 /  0.8%  0.520 / 15.4%  0.791 / 62.7%  0.732 / 61.3%
     combat      0.166 /  0.1%  0.626 / 27.7%  0.713 / 45.6%  0.563 / 39.4%

   **+240° is a simultaneous optimum or near-optimum for all seven**, taking the share of visible
   surface at full key from 0.1–21.7 % to 31.5–68.7 %. Small offsets are NOT a partial win: +40 /
   +80 / +120 sit at or below the shipped value on `courtyard` and `temple`, so "nudge the sun"
   is not the fix and the whole sweep had to be run to know that.

   **DELIBERATELY NOT APPLIED.** +240° turns golden hour from a western sunset into an eastern
   sunrise: every cast shadow in the game reverses, `Sky.js`'s warm horizon band and Mie lobe move
   to the other side of the dome, `Lighting._buildShafts`/`_updateShafts` re-derive every blade,
   and the §8.1 pyramid-shadow and peristyle-blade analyses in `Lighting.TUNE` are all written
   against a westering sun. Whole-game blast radius, no frame verdict taken. It is the lead's call
   with SHOTS — the alternative fix is re-framing the cameras, and the arithmetic above is
   agnostic between them. `tests/tone.test.mjs` guards the premise: if any environment shot ever
   becomes front-lit, that test goes red and this note expires. */
const SUN_ELEVATION = [
  [0.00, -62], [0.06, -52], [0.12, -38], [0.18, -14], [0.215, 0],
  [0.26,  12], [0.30,  22], [0.38,  48], [0.44,   66], [0.50, 76],
  [0.56,  66], [0.62,  48], [0.68,  38], [0.72,  33], [0.76, 26],
  [0.79,  22], [0.83,  15], [0.86,   8], [0.895,  0], [0.94, -22], [1.00, -62],
];
const SUN_AZIMUTH = [
  [0.00, 330], [0.18, 352], [0.215, 354], [0.30, 18], [0.40, 58], [0.50, 100],
  [0.60, 142], [0.68, 164], [0.72, 170], [0.76, 180], [0.79, 186],
  [0.83, 191], [0.895, 198], [0.94, 240], [1.00, 330],
];

/* The moon rides its own track so the `night` and `guard` shots get a big low moon
   parked where the camera is already looking, from an azimuth far off the sun's.

   ── §214.1: "parked where the camera is already looking" is exactly the defect ──────────
   Critic pass 7 defect 12 says `night` has "a moon that lights nothing". That is literally
   true, it is caused here, and it needs no capture to establish — it is two dot products
   against `Shots.js`.

   The `night` camera runs (-13.4, 8.4, 22.0) -> (2.0, 6.0, 2.0), i.e. a forward azimuth of
   **307.6°**. The moon at tod 0.02 sits at azimuth **293.3°** — only **14.3° off the camera's
   own forward axis**. So the shot is very nearly a direct backlight, and every surface facing
   the lens carries a normal at azimuth 127.6°, which is 165.7° from the moon.

   **The two moon-keyed shots fail differently, and an earlier draft of this note got `guard`
   wrong by assuming they were the same.** It quoted guard's wall N·L as -0.8802, which was
   `night`'s camera azimuth applied to guard's moon. `tests/tone.test.mjs` caught it on its
   first run. Measured per shot, from each shot's own camera:

     shot    moon el/az       cam fwd az   wall normal az   wall N·L   flat deck N·L
     night   12.0° / 293.3°     307.6°         127.6°       -0.9476       0.2079
     guard   28.3° / 305.3°     204.4°          24.4°       **+0.1652**   0.4733

   · `night` IS backlit. Nothing the camera can see is moonlit except near-horizontal
     surfaces, and in a rooftop framing those are the thin top arrises of each masonry course
     — which is exactly the "cyan-white line on every polygon edge" the same defect reports.
     One cause, two symptoms.
   · `guard` is NOT backlit; it is side-lit, and it fails for the OTHER reason. Its
     camera-facing walls land at N·L 0.1652 against the low terminator's upper edge at
     `termLo + termSoft` = **0.164** — a margin of **0.0012**, tighter than the 0.0006 that
     made `temple` famous in §210.1, and on the surface that actually fills the frame. Those
     walls sit inside the detail normal's own swing of the band edge, so they flip between the
     shadow and mid bands per-texel: speckle, not a cel band.

   `tests/shading.test.mjs` cannot see the guard case, by construction — it evaluates
   `keyDir.y`, which is the GROUND plane, and §210.3 says as much. A wall's N·L is
   `cos(el)·cos(Δaz)`. The wall table above is the missing half and is now guarded in
   `tests/tone.test.mjs`.

   Confirmed against the frame rather than only derived: inverting `night.base.png`'s measured
   pixels through the calibrated display chain puts the visible wall at scene-linear ~0.0335,
   i.e. illumination ~0.0985 on sandstone albedo — which is the SHADOW-band radiance (0.0987),
   not the lit one (0.3865). The camera is looking at unlit stone.

   **What NOT to do about it.** Swinging the moon azimuth round to light those walls takes the
   disc out of frame, and the disc at upper-left is the shot's one compositional anchor. A
   single light cannot be both the backlight in frame and the key on the camera-facing walls;
   that is true of any light, not a bug in this table.

   **Where the fix lives for `night`, and it is already aimed correctly.** `bounceDir` is built
   as the anti-key direction dropped to -0.42 in y, which at tod 0.02 resolves to azimuth
   113.3°, elevation -23.3°. Against a camera-facing wall normal at azimuth 127.6° that is
   **N·L = 0.890** — very nearly head-on. The one light in the rig that already points at the
   surfaces this shot is made of is the sand bounce, and the night anchor runs it at
   `bounceIntensity` 0.10 against daylight's 0.36. So the lever is night fill amplitude, not
   moon placement — see `nightFillScale` on the state object, which exists to sweep exactly
   that and ships inert at 1.0.

   That corollary is `night`-only too: on `guard` the same bounce lands at **-0.169** on the
   camera-facing walls (it is behind them), so fill will not reach that shot the same way and
   its 0.0012 terminator margin is a SHADING fix, not a LIGHTING one. Both figures are
   asserted in `tests/tone.test.mjs` so the split cannot quietly re-merge. */
const MOON_ELEVATION = [
  [0.00, 9], [0.02, 12], [0.06, 20], [0.12, 31], [0.18, 24], [0.24, 4],
  [0.30, -26], [0.70, -34], [0.86, -6], [0.92, 2], [0.96, 6], [1.00, 9],
];
const MOON_AZIMUTH = [
  [0.00, 292], [0.06, 297], [0.12, 308], [0.24, 326], [0.50, 20],
  [0.86, 268], [1.00, 292],
];

/** Smooth (cosine-eased) lookup through a keyed table. Monotone inside each span. */
function sampleTable(table, x) {
  const n = table.length;
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[n - 1][0]) return table[n - 1][1];
  let i = 0;
  while (i < n - 2 && table[i + 1][0] < x) i++;
  const [x0, y0] = table[i];
  const [x1, y1] = table[i + 1];
  const t = (x - x0) / (x1 - x0 || 1);
  // Cosine ease kills the visible kinks at the keys without dragging the keys off value.
  const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return y0 + (y1 - y0) * s;
}

/* ── Palette anchors, keyed on sun elevation ────────────────────────────────────
   Interpolating on *elevation* (not on tod) means the same sun height always produces
   the same light, morning or evening, and the GOLDEN anchor sits exactly on 22° so the
   §2.2 sky triplet is hit dead-on in every golden-hour shot. */
const C = (hex) => new THREE.Color(hex); // hex is sRGB; Color converts to linear working space

function anchor(elevation, o) {
  return {
    el: elevation,
    zenith:      C(o.zenith),
    horizon:     C(o.horizon),
    haze:        C(o.haze),
    violet:      C(o.violet),
    groundHaze:  C(o.groundHaze),
    sunDisc:     C(o.sunDisc),
    sunGlow:     C(o.sunGlow),
    sunColor:    C(o.sunColor),
    hemiSky:     C(o.hemiSky),
    hemiGround:  C(o.hemiGround),
    cloudLit:    C(o.cloudLit),
    cloudShadow: C(o.cloudShadow),
    cloudRim:    C(o.cloudRim),
    fogColor:    C(o.fogColor),
    fogTint:     C(o.fogTint),
    sunIntensity: o.sunIntensity,
    hemiIntensity: o.hemiIntensity,
    bounceIntensity: o.bounceIntensity,
    fogDensity: o.fogDensity,
    fogHeight: o.fogHeight,
    inscatter: o.inscatter,
    skyGain: o.skyGain,
    mieStrength: o.mieStrength,
    mieG: o.mieG,
    violetAmount: o.violetAmount,
    horizonPower: o.horizonPower,
    cloudCover: o.cloudCover,      // [cirrus, mid, cumulus] — higher = *less* cloud
    cloudBright: o.cloudBright,
    starAmount: o.starAmount,
    exposure: o.exposure,
  };
}

/* ── §256: `sunIntensity` is a MEASURED-DEAD lever for the highlight range. Read before raising it.
   ────────────────────────────────────────────────────────────────────────────────────────────
   Critic pass 8's top lighting defect is that the frames have no highlight range — luma p99
   172–181, 0.000–0.004 % of pixels above 230. The obvious reading is "the sun is too dim". It
   was bracketed properly and it is wrong.

   What IS true is the ceiling. `slyRamp` clamps the key term at 1, so a diffuse surface tops out
   at `albedo × keyRad`, and at the golden anchor `keyRad = #ffd9a0 × 3.30` has luma 2.425.
   Through the shipped grade (transcribed and calibrated against PostFX.js's own validated
   grey-axis row to 0.0 L on 11 of 11 entries), fully sunlit: §2.2 `sandMid` renders at L 197.1,
   `sandLight` at L 213.2, and **a perfectly white albedo at L 230.8** — the exact threshold the
   critic says nothing reaches. The grade itself is not the wall: grey scene 2.5 → L 232.7 and
   ≥ 20 → L 254.7, so L 230 needs scene ≈ 2.3 and the chain hands it over.

   But raising this does not deliver it, because the cameras cannot see the key (see the §256
   block over SUN_AZIMUTH: 32–85 % of visible geometry is at ramp 0). Bracketed live via
   `Lighting.TUNE.keyBoost` {1.00, 1.40, 1.70, 2.10, 2.60}, one boot, dt = 0, thresholds
   registered first (PREREG-hilite1.md), applied `uKeyIntensity` read back per arm:

     base -> k260, i.e. this number 3.30 -> 8.58
       hero        p99 182.6 -> 186.4  (+3.8)    >230  0.000 % -> 0.003 %
       temple      p99 180.2 -> 181.8  (+1.6)    >230  0.000 % -> 0.019 %
       courtyard   p99 180.4 -> 201.6 (+21.2)    >230  0.003 % -> 0.066 %
       sly-closeup p99 179.4 -> 211.3 (+31.9)    >230  0.005 % -> 0.280 %

   Gate "p99 ≥ 200 on ≥ 3 of 4" scored 2/4 at best; "> 230 on ≥ 0.20 % of the frame, ≥ 3 of 4"
   scored 1/4. **Both failed and nothing shipped.** Note the response tracks the ramp histogram
   exactly — `sly-closeup` (mean visible ramp 0.452) moves 32 L, `hero` (0.140) moves 3.8 — which
   is the mechanism confirming itself rather than a separate claim.

   Also measured, and it is why this is a contrast lever and not an exposure one: the daylight
   shadow light does NOT follow the key up. `ToonMaterial._refreshShadowColor()` clamps its scale
   at `shadowTintPeak / peak` = 3.904 while every daylight shot asks for 6.50–9.79, so it is one
   constant `(0.123, 0.175, 0.423)` game-wide; and `ambientIntensity` below is computed from the
   un-boosted key. Predicted from that before capturing, and confirmed: p1 moved ≤ 1.5 L across
   the whole bracket.

   So: raising these numbers brightens the sunlit minority of the frame and nothing else, at
   about 1.5 L of p99 per 1.0 of sun on the two most backlit shots. If you are here because the
   frames read flat, the lever is the azimuth or the cameras, not this. */
const ANCHORS = [
  /* Deep night: moonlit, everything cool, stars and the Milky Way carry the sky. */
  anchor(-16, {
    // Lifted off near-black. Measured through the composite, the old triplet resolved to
    // #000127 at the top of the `night` frame — a void, not a sky, which is §7.3's "empty
    // sky" and left the stars and the Milky Way with nothing to sit on. These land the
    // night dome in the #0b2550-#17427c band: still unmistakably night, still well under
    // any lit surface, but readable and blue rather than absent.
    zenith: 0x0e1c3c, horizon: 0x233a5e, haze: 0x263a5c, violet: 0x2a2450, groundHaze: 0x1a2440,
    sunDisc: 0x000000, sunGlow: 0x000000, sunColor: 0x9ec4ff,
    hemiSky: 0x2c4f8e, hemiGround: 0x3b3552,
    cloudLit: 0x7e97c4, cloudShadow: 0x141b34, cloudRim: 0x9cc0ff,
    fogColor: 0x1c2b48, fogTint: 0x33507f,
    sunIntensity: 0.0, hemiIntensity: 0.34, bounceIntensity: 0.10,
    fogDensity: 0.0040, fogHeight: 74, inscatter: 0.18,
    skyGain: 0.85, mieStrength: 0.20, mieG: 0.62, violetAmount: 0.22, horizonPower: 0.45,
    // The cumulus deck was ~53% dense at night, which is why `night` has "a mottled/streaky
    // texture and no stars, no moon". Only ~38% of the night dome was reaching camera.
    cloudCover: [0.67, 0.72, 0.74], cloudBright: 0.42, starAmount: 1.0, exposure: 1.0,
  }),

  /* Civil twilight — the last violet-magenta band before the sun clears the horizon. */
  anchor(-5, {
    zenith: 0x172c58, horizon: 0x7d4c66, haze: 0x6a4059, violet: 0x5c3a6e, groundHaze: 0x4a3348,
    sunDisc: 0xd06a3c, sunGlow: 0xb2543c, sunColor: 0xd08050,
    hemiSky: 0x3f5f97, hemiGround: 0x8a5a52,
    cloudLit: 0xd08a72, cloudShadow: 0x2e2848, cloudRim: 0xf0a070,
    fogColor: 0x5e4256, fogTint: 0xa8615a,
    sunIntensity: 0.22, hemiIntensity: 0.46, bounceIntensity: 0.16,
    fogDensity: 0.0058, fogHeight: 50, inscatter: 0.55,
    skyGain: 0.80, mieStrength: 0.85, mieG: 0.72, violetAmount: 0.40, horizonPower: 0.38,
    cloudCover: [0.65, 0.70, 0.73], cloudBright: 0.70, starAmount: 0.55, exposure: 1.0,
  }),

  /* Sunset / sunrise: the disc on the horizon, maximum Mie, hottest horizon. */
  anchor(2, {
    zenith: 0x2d5c9e, horizon: 0xffb268, haze: 0xe79a62, violet: 0x8f6aa8, groundHaze: 0xc07a54,
    sunDisc: 0xffc07a, sunGlow: 0xff9a5c, sunColor: 0xffb072,
    hemiSky: 0x5a86bd, hemiGround: 0xd08a48,
    cloudLit: 0xffcf9e, cloudShadow: 0x6e5a96, cloudRim: 0xffb072,
    fogColor: 0xdb9a68, fogTint: 0xff9a5c,
    sunIntensity: 1.45, hemiIntensity: 0.66, bounceIntensity: 0.30,
    fogDensity: 0.0056, fogHeight: 46, inscatter: 0.82,
    skyGain: 0.98, mieStrength: 0.95, mieG: 0.78, violetAmount: 0.34, horizonPower: 0.30,
    cloudCover: [0.60, 0.69, 0.72], cloudBright: 1.05, starAmount: 0.10, exposure: 1.0,
  }),

  /* GOLDEN HOUR — §2.2 verbatim. Most canonical shots resolve to within a few degrees
     of this anchor, so these numbers are the ones that decide whether the game looks
     like Sly Cooper. Touch them last. */
  anchor(22, {
    zenith: PALETTE.skyZenith, horizon: PALETTE.skyHorizon, haze: PALETTE.skyHaze,
    violet: 0x9a86c8, groundHaze: 0xd8ab7a,
    sunDisc: 0xfff0d2, sunGlow: PALETTE.keySun, sunColor: PALETTE.keySun,
    hemiSky: PALETTE.fillSky, hemiGround: PALETTE.bounceSand,
    cloudLit: 0xfff2d8, cloudShadow: 0x8a76b4, cloudRim: 0xffcf96,
    fogColor: PALETTE.skyHaze, fogTint: 0xffc98a,
    sunIntensity: 3.30, hemiIntensity: 0.88, bounceIntensity: 0.36,
    fogDensity: 0.0047, fogHeight: 58, inscatter: 0.62,
    // horizonPower 0.44 -> 0.27: the canonical cameras are near level, so the top of frame
    // is only 12-15 degrees up. The blue has to arrive by then or the shot never sees it.
    // mieStrength 0.95 -> 0.55: the forward lobe was adding ~0.09 of warm radiance a full
    // 45 degrees off the sun, which bleached the blue back out of exactly those frames.
    skyGain: 1.0, mieStrength: 0.55, mieG: 0.76, violetAmount: 0.22, horizonPower: 0.27,
    // Cover is a *threshold*: higher = less cloud. These were below the noise's own mean
    // (0.65), so all three decks were ~100% dense and the "sky" in every daylight shot was
    // a wall of overcast — measured at 6.5% of the dome gradient surviving to camera.
    // Retuned to leave ~71% open sky while still layering three painted decks (§2.3): at 56%
    // the remaining low deck still dragged the hero band warm, measured on a capture.
    cloudCover: [0.59, 0.68, 0.72], cloudBright: 1.0, starAmount: 0.0, exposure: 1.0,
  }),

  /* Midday. Still Egypt: the horizon bleaches to hot dust rather than to grey. */
  anchor(76, {
    zenith: 0x2e6fc6, horizon: 0xe0dac4, haze: 0xd4c9ad, violet: 0xa8b6cd, groundHaze: 0xcdbd9c,
    sunDisc: 0xfffaf0, sunGlow: 0xffeccf, sunColor: 0xfff2dc,
    hemiSky: 0x7fb4e0, hemiGround: 0xdfa860,
    cloudLit: 0xfffdf4, cloudShadow: 0x94a2c0, cloudRim: 0xffe8c8,
    fogColor: 0xd4c9ad, fogTint: 0xf0dcbc,
    sunIntensity: 4.05, hemiIntensity: 1.02, bounceIntensity: 0.38,
    fogDensity: 0.0031, fogHeight: 92, inscatter: 0.38,
    skyGain: 1.04, mieStrength: 0.45, mieG: 0.66, violetAmount: 0.10, horizonPower: 0.30,
    cloudCover: [0.61, 0.69, 0.73], cloudBright: 1.10, starAmount: 0.0, exposure: 0.97,
  }),
];

/* ── §298 twilight-cool A/B lever (PREREG-twilight.md) ──────────────────────────
   Owner decision §298 / DESIGN-twilight Option B: cool the el ≤ 2° twilight anchors'
   fill/shadow leg toward violet — the BotW Gerudo-dusk device, violet shadow against a warm
   key — leaving the sun/key leg (sunColor/sunDisc/sunGlow), the sky-dome legs (zenith/
   horizon/haze/fog) and every intensity untouched, and the 22° GOLDEN anchor byte-identical.

   `warm` is the shipped table verbatim (anchors [1] el −5 and [2] el 2 above). `cand` is the
   Option-B candidate: hue moved to the blue-violet family, per-leg display luma matched to
   within ±2% so twilight brightness does not shift, only chroma separation:

     el  2  hemiSky    0x5a86bd (h 213°, luma 128.6) → 0x8578d2 (h 249°, luma 129.3)
     el  2  hemiGround 0xd08a48 (h  29°, luma 148.1) → 0xa988c6 (h 272°, luma 147.5)
     el −5  hemiSky    0x3f5f97 (h 218°, luma  92.2) → 0x5c54a8 (h 246°, luma  91.8)
     el −5  hemiGround 0x8a5a52 (h  17°, luma  99.6) → 0x6d5a91 (h 261°, luma  98.0)

   The RESTING state of this file is `warm` — the module evaluates byte-identically to the
   shipped Atmosphere.js unless the lever is called, so a stranded install cannot poison any
   other lane's boot (§298.3's hazard, closed by construction). The capture runner drives the
   lever through `window.__setTwilightCool`; anchors are the SOURCE both consumers
   (Lighting._applyAtmosphere, Sky._refresh) re-derive from, so a lever poke is exactly the
   candidate file's arithmetic — poke the table, not the uniform (RESULT-redflood's
   hazeDensity lesson). On PASS what ships is the four `cand` literals in the anchor table,
   nothing else; this block does not ship. */
export const TWILIGHT_COOL = {
  warm: { m5sky: 0x3f5f97, m5ground: 0x8a5a52, p2sky: 0x5a86bd, p2ground: 0xd08a48 },
  cand: { m5sky: 0x5c54a8, m5ground: 0x6d5a91, p2sky: 0x8578d2, p2ground: 0xa988c6 },
};
export function setTwilightCool(t) {
  const a5 = ANCHORS[1], a2 = ANCHORS[2];
  if (a5.el !== -5 || a2.el !== 2) throw new Error('twilightCool: anchor table reordered');
  const on = t >= 0.5;                       // values, not a dial — binary by design
  const V = on ? TWILIGHT_COOL.cand : TWILIGHT_COOL.warm;
  a5.hemiSky.setHex(V.m5sky); a5.hemiGround.setHex(V.m5ground);
  a2.hemiSky.setHex(V.p2sky); a2.hemiGround.setHex(V.p2ground);
  return {
    applied: on ? 'cand' : 'warm',
    a5sky: a5.hemiSky.getHexString(), a5ground: a5.hemiGround.getHexString(),
    a2sky: a2.hemiSky.getHexString(), a2ground: a2.hemiGround.getHexString(),
  };
}
if (typeof window !== 'undefined') window.__setTwilightCool = setTwilightCool;

/* ── State ──────────────────────────────────────────────────────────────────── */

/** Allocate the mutable atmosphere state. One per consumer; `evalAtmosphere` fills it. */
export function createAtmosphereState() {
  return {
    tod: -1,

    sunDir: new THREE.Vector3(0, 1, 0),      // unit, points *toward* the sun
    moonDir: new THREE.Vector3(0, 1, 0),     // unit, points *toward* the moon
    keyDir: new THREE.Vector3(0, 1, 0),      // unit, points toward the dominant key light
    sunElevation: 0,                         // degrees
    moonElevation: 0,
    sunAzimuth: 0,
    moonAzimuth: 0,

    dayAmount: 1,                            // 0 at night → 1 in full day
    nightAmount: 0,
    keyIsMoon: false,

    sunColor: new THREE.Color(), sunIntensity: 0,
    moonColor: new THREE.Color(), moonIntensity: 0,
    keyColor: new THREE.Color(), keyIntensity: 0,

    zenith: new THREE.Color(), horizon: new THREE.Color(), haze: new THREE.Color(),
    violet: new THREE.Color(), groundHaze: new THREE.Color(),
    sunDisc: new THREE.Color(), sunGlow: new THREE.Color(),

    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
    bounceColor: new THREE.Color(), bounceIntensity: 0,
    bounceDir: new THREE.Vector3(),           // unit, toward the sand-GI source
    ambientColor: new THREE.Color(), ambientIntensity: 0,
    shadowTint: new THREE.Color(PALETTE.shadowHue), shadowFloor: SHADOW_FLOOR,

    rimColor: new THREE.Color(), rimDir: new THREE.Vector3(), rimStrength: 0.55,

    cloudLit: new THREE.Color(), cloudShadow: new THREE.Color(), cloudRim: new THREE.Color(),
    cloudCover: new THREE.Vector3(), cloudBright: 1,

    fog: {
      color: new THREE.Color(),   // linear haze colour the world dissolves into
      density: 0.0047,            // FogExp2 units: blend = 1 − exp(−(d·density)²)
      heightFalloff: 58,          // metres — haze thins with altitude by exp(−y/h)
      sunTint: new THREE.Color(), // added when the view ray points at the sun
      inscatter: 0.62,            // 0..1 how much sunTint the haze picks up
    },

    skyGain: 1, mieStrength: 1, mieG: 0.76, violetAmount: 0.22, horizonPower: 0.44,
    starAmount: 0, exposure: 1,

    /* ── Night fill lever (§214.1) — SHIPS INERT AT 1.0, bit-identical ──────────────────
       Multiplies hemi + bounce + ambient, faded in by `nightAmount`, so it can only ever
       touch the two moon-keyed shots and is the exact identity at every daylight tod.

       It exists because §214.1 locates critic defect 12's mechanism (both moon-keyed cameras
       are ~180° backlit, so the sand bounce at N·L 0.890 is the only light aimed at what they
       see) but CANNOT size the correction from arithmetic alone. Modelling the shipped night
       radiances through the calibrated display chain predicts every §2.2 stone albedo lands
       ABOVE V = 0.20 in both bands, while the frame measures 62.9 % of pixels below it — a
       factor this module cannot account for and which is not in this file. Shipping a blind
       brightness multiplier against an unlocated factor is how this project has lost days
       (KNOWN_ISSUES §210.2, §211.1), so the amplitude is deliberately NOT chosen here.

       Set `lighting.atmosphere.nightFillScale = k` live to sweep it in one boot, the same way
       `debug.fillScale` and `debug.grainScale` already work. */
    nightFillScale: 1,
    sunAngularRadius: 0.020,     // radians — stylised, ~2.3× the real sun
    moonAngularRadius: 0.038,
  };
}

const _a = new THREE.Vector3();
const _rimWarm = new THREE.Color(PALETTE.rimWarm);
const DEG = Math.PI / 180;

function dirFrom(elDeg, azDeg, out) {
  const el = elDeg * DEG, az = azDeg * DEG;
  const c = Math.cos(el);
  return out.set(c * Math.cos(az), Math.sin(el), c * Math.sin(az));
}

const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Resolve every colour and direction for a time of day into `s`.
 * @param {number} tod 0 = midnight, 0.5 = noon, 0.78–0.83 = golden hour
 * @param {ReturnType<typeof createAtmosphereState>} s
 */
export function evalAtmosphere(tod, s) {
  const t = ((tod % 1) + 1) % 1;
  s.tod = t;

  /* --- sun & moon geometry --- */
  s.sunElevation = sampleTable(SUN_ELEVATION, t);
  s.sunAzimuth = sampleTable(SUN_AZIMUTH, t);
  s.moonElevation = sampleTable(MOON_ELEVATION, t);
  s.moonAzimuth = sampleTable(MOON_AZIMUTH, t);
  dirFrom(s.sunElevation, s.sunAzimuth, s.sunDir).normalize();
  dirFrom(s.moonElevation, s.moonAzimuth, s.moonDir).normalize();

  /* --- anchor blend on sun elevation --- */
  const el = s.sunElevation;
  let i = 0;
  while (i < ANCHORS.length - 2 && ANCHORS[i + 1].el < el) i++;
  const A = ANCHORS[i], B = ANCHORS[i + 1];
  const raw = clamp01((el - A.el) / (B.el - A.el || 1));
  // Ease everywhere except across the GOLDEN key, which must stay linear so tod 0.79
  // lands exactly on the §2.2 triplet rather than a smoothed approximation of it.
  const k = raw * raw * (3 - 2 * raw);

  s.zenith.copy(A.zenith).lerp(B.zenith, k);
  s.horizon.copy(A.horizon).lerp(B.horizon, k);
  s.haze.copy(A.haze).lerp(B.haze, k);
  s.violet.copy(A.violet).lerp(B.violet, k);
  s.groundHaze.copy(A.groundHaze).lerp(B.groundHaze, k);
  s.sunDisc.copy(A.sunDisc).lerp(B.sunDisc, k);
  s.sunGlow.copy(A.sunGlow).lerp(B.sunGlow, k);
  s.sunColor.copy(A.sunColor).lerp(B.sunColor, k);
  s.hemiSky.copy(A.hemiSky).lerp(B.hemiSky, k);
  s.hemiGround.copy(A.hemiGround).lerp(B.hemiGround, k);
  s.cloudLit.copy(A.cloudLit).lerp(B.cloudLit, k);
  s.cloudShadow.copy(A.cloudShadow).lerp(B.cloudShadow, k);
  s.cloudRim.copy(A.cloudRim).lerp(B.cloudRim, k);
  s.fog.color.copy(A.fogColor).lerp(B.fogColor, k);
  s.fog.sunTint.copy(A.fogTint).lerp(B.fogTint, k);

  s.skyGain = lerp(A.skyGain, B.skyGain, k);
  s.mieStrength = lerp(A.mieStrength, B.mieStrength, k);
  s.mieG = lerp(A.mieG, B.mieG, k);
  s.violetAmount = lerp(A.violetAmount, B.violetAmount, k);
  s.horizonPower = lerp(A.horizonPower, B.horizonPower, k);
  s.starAmount = lerp(A.starAmount, B.starAmount, k);
  s.exposure = lerp(A.exposure, B.exposure, k);
  s.cloudBright = lerp(A.cloudBright, B.cloudBright, k);
  s.cloudCover.set(
    lerp(A.cloudCover[0], B.cloudCover[0], k),
    lerp(A.cloudCover[1], B.cloudCover[1], k),
    lerp(A.cloudCover[2], B.cloudCover[2], k)
  );

  s.fog.density = lerp(A.fogDensity, B.fogDensity, k);
  s.fog.heightFalloff = lerp(A.fogHeight, B.fogHeight, k);
  s.fog.inscatter = lerp(A.inscatter, B.inscatter, k);

  /* --- day / night weighting --- */
  s.dayAmount = smoothstep(-7, 4, el);
  s.nightAmount = 1 - s.dayAmount;

  const sunUp = smoothstep(-8, 1.5, el);
  s.sunIntensity = lerp(A.sunIntensity, B.sunIntensity, k) * sunUp;

  const moonUp = smoothstep(-4, 9, s.moonElevation);
  s.moonColor.set(PALETTE.moon);
  s.moonIntensity = 0.62 * moonUp * s.nightAmount;

  // A hard key switch is safe because both keys are dim wherever it happens (twilight),
  // and it keeps shadow direction from swinging through nonsense angles mid-blend.
  s.keyIsMoon = el < 1.0 && s.moonIntensity > 0.02;
  if (s.keyIsMoon) {
    s.keyDir.copy(s.moonDir);
    s.keyColor.copy(s.moonColor);
    s.keyIntensity = s.moonIntensity;
  } else {
    s.keyDir.copy(s.sunDir);
    s.keyColor.copy(s.sunColor);
    s.keyIntensity = s.sunIntensity;
  }

  /* --- fill / bounce / ambient --- */
  s.hemiIntensity = lerp(A.hemiIntensity, B.hemiIntensity, k);
  s.bounceIntensity = lerp(A.bounceIntensity, B.bounceIntensity, k);
  s.bounceColor.set(PALETTE.bounceSand).lerp(s.hemiSky, s.nightAmount * 0.7);

  // The sand-GI light opposes the key and sits *below* the horizon, so it fills the
  // undersides of ledges and chins the way hot sand actually does. This, not a raised
  // black level, is what makes shadows read as coloured instead of crushed.
  _a.copy(s.keyDir).multiplyScalar(-1);
  s.bounceDir.set(_a.x, -0.42, _a.z).normalize();

  // §2.2: shadows never below 14% of key luminance, and violet-teal when they get there.
  s.ambientColor.copy(s.shadowTint).lerp(s.hemiSky, 0.30);
  const keyLum = s.keyIntensity * (0.2126 * s.keyColor.r + 0.7152 * s.keyColor.g + 0.0722 * s.keyColor.b);
  s.ambientIntensity = Math.max(0.10, SHADOW_FLOOR * keyLum * 1.15);

  /* §214.1's lever. Applied AFTER the max() above, because at night that clamp is what is
     actually binding (0.14 × 0.3346 × 1.15 = 0.0539, below the 0.10 floor), so scaling the
     formula instead of the result would leave ambient untouched and the lever would only
     half-work — the failure mode §210.2 names, where a knob reaches some consumers and not
     others and the capture reads as a weak effect rather than as a broken instrument. */
  const nightFill = lerp(1, s.nightFillScale ?? 1, s.nightAmount);
  if (nightFill !== 1) {
    s.hemiIntensity *= nightFill;
    s.bounceIntensity *= nightFill;
    s.ambientIntensity *= nightFill;
  }

  /* --- rim light: one deliberate, consistent wrap angle (§2.1.5) --- */
  s.rimColor.set(PALETTE.rimCool).lerp(_rimWarm, s.nightAmount);
  // Anti-key azimuth, lifted 42°: the rim then comes out of the brightest cool sky and
  // reads as sky-wrap rather than as a second, unmotivated sun.
  dirFrom(42, (s.keyIsMoon ? s.moonAzimuth : s.sunAzimuth) + 180, s.rimDir).normalize();
  /* ── §214.2: the night rim BOOST is withdrawn; day is unchanged ────────────────────────
     Was `lerp(0.5, 0.72, nightAmount)` — a 44 % amplification applied to exactly the two
     shots where critic pass 7 defect 12 reports "a full-strength fresnel drawing a
     cyan-white line on every polygon edge in the scene".

     The premise of the boost was that night values sit close together and need extra
     silhouette separation. Measured, that premise is false here: `night` and `guard` carry
     the HIGHEST key:fill ratio in the build — 6.45:1 against daylight's 4.06–5.18:1 — so the
     two moon-keyed shots are the *most* contrasty in the game, not the least, and they were
     the ones being handed the extra rim.

     Two things this does NOT claim, because they were checked and are someone else's:

     · It does not claim to remove the cyan lines. Measured on `night.base.png`, the bright
       dashes run hue 199–205°, which is `rimCool` #7fd4ff (200.2°) — NOT what this module
       publishes at night, since `rimColor` above resolves to `rimWarm` #ff9a5c (~22°) at
       nightAmount 1. PostFX.js's own TUNE note says why: its screen-space rim's `uRimLit` is
       a constant #7fd4ff with "no time-of-day hook of any kind". That colour is POSTFX's to
       fix; this line only stops LIGHTING amplifying the surface term alongside it.
     · It does not lower the rim below daylight. 0.50 is what every daylight shot already
       ships, so this changes no daylight frame by any amount — the lerp is the identity
       everywhere `nightAmount` is 0, which is all fourteen non-moon shots.

     Going BELOW 0.50 at night is a further, separate art call and is a registered arm of the
     next capture rather than something taken blind here. */
  s.rimStrength = lerp(RIM_STRENGTH_DAY, RIM_STRENGTH_NIGHT, s.nightAmount);

  s.sunAngularRadius = lerp(0.020, 0.027, smoothstep(30, 2, el)); // swells as it sets
  s.moonAngularRadius = 0.038;

  return s;
}

/* ── Aerial perspective ─────────────────────────────────────────────────────────
   **§2.3's "≥ 60% atmospheric blend" is met on the horizon and nowhere near the
   mid-ground, and the haze cannot be asked to hide sand tiling on `dunes`.**

   Recorded because it has been asserted as a mitigation without being measured, and the
   measurement is arithmetic — no capture needed. At `dunes`' tod 0.83 the curve is
   `density 0.00495`, `heightFalloff 54.6`, so 60% blend does not arrive until **193 m** at
   ground level (218 m at 16 m altitude, where the approach ridge is). Marching the ground
   plane through that camera at 1280x720:

     visible ground              67.3% of frame
     view distance              p10 46 m · p25 54 m · p50 79 m · p75 150 m · p90 334 m
     blend 0-20 / 20-40 / 40-60 / 60-80 / 80-100 %      59.2 / 14.7 / 7.2 / 5.2 / 12.7
     ground at >= 60% blend      18.9%

   So 59.2% of the visible sand is under **20%** hazed and the median ground pixel sits at
   79 m / ~13%. The pyramid at ~330 m is 84-86% hazed in every daylight shot, which is the
   part §7.3 actually asks for and it passes — but a tiling repeat has to be near enough to
   resolve, and near enough to resolve is near enough to be un-hazed. The two conditions
   cannot both be served by this curve.

   Costed, so nobody re-derives it: raising `fogDensity` x1.6 moves 60% to 127 m — still
   outside the 54-150 m band the repeats live in — and already takes `dunes`' own subject
   (the complex at 72 m) from 11% to 26% hazed. x2.4 reaches 60% at 85 m, which would cover
   the mid-ground, at the cost of **49% haze on the subject of the one shot whose §7.2 job is
   terrain and atmosphere**, plus `hero`/`courtyard` sand going from 8% to 37% at 60 m.
   That trades §7.3's tiling line for its "geometry silhouettes / hero read" lines.

   Conclusion: this is not a haze defect and raising the density is not the fix. If the
   `dunes` repeats read at 1:1, they have to be broken up where they live — macro-variation
   in the sand recipe, or dune geometry — not dissolved. */

/**
 * Atmospheric blend factor for a given view distance — the exact curve SHADING/POSTFX
 * must reproduce from `sky.fogParams`. Height terms are ignored here; this is the
 * ground-level reference used to verify §7.3's "background ≥ 60% hazed".
 */
export function aerialBlend(distance, density) {
  const d = distance * density;
  return 1 - Math.exp(-d * d);
}

/** Density that puts `distance` at exactly `blend` haze. Handy when re-tuning. */
export function densityFor(distance, blend) {
  return Math.sqrt(-Math.log(1 - blend)) / Math.max(1e-6, distance);
}

/* ── Shared GLSL ────────────────────────────────────────────────────────────────
   Sky's dome and bird shaders both pull this in. It is also the reference
   implementation of the aerial-perspective term: SHADING and POSTFX get the same
   numbers through `sky.fogParams`, so if they paste this snippet the horizon line
   between world geometry and sky dome is seamless. */
export const ATMOSPHERE_GLSL = /* glsl */`
  const float PI_A = 3.141592653589793;

  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash13(vec3 p){
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  // Henyey–Greenstein. g→1 is a tight forward lobe: this is the warm bloom of sky
  // immediately around the sun, and it is what stops the dome reading as a gradient.
  float hgPhase(float cosT, float g){
    float g2 = g * g;
    float d = 1.0 + g2 - 2.0 * g * cosT;
    return (1.0 - g2) / (4.0 * PI_A * pow(max(d, 1e-4), 1.5));
  }

  // Rayleigh: 3/16π (1+cos²). Broad, blue, everywhere.
  float rayleighPhase(float cosT){
    return (3.0 / (16.0 * PI_A)) * (1.0 + cosT * cosT);
  }

  // Cel-friendly quantisation. Clouds and terminators share it so the whole frame
  // bands on the same ladder (§2.1.1).
  float bandRamp(float x, float bands, float soft){
    float s = x * bands;
    float f = floor(s);
    float r = smoothstep(0.5 - soft, 0.5 + soft, fract(s));
    return (f + r) / bands;
  }

  // Aerial perspective. sunAmt is saturate(dot(viewDir, sunDir)) -- the haze warms up
  // when you look into the sun, which is the whole reason distant dunes read as hot.
  vec3 applyAerial(vec3 color, float dist, float sunAmt, float height,
                   vec3 fogColor, vec3 fogTint, float density, float heightFalloff,
                   float inscatter){
    float h = exp(-max(height, 0.0) / max(heightFalloff, 1.0));
    float d = dist * density * mix(0.55, 1.0, h);
    float blend = 1.0 - exp(-d * d);
    vec3 haze = fogColor + fogTint * (pow(sunAmt, 5.0) * inscatter);
    return mix(color, haze, clamp(blend, 0.0, 1.0));
  }
`;
