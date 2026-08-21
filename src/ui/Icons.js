/**
 * Icons — every glyph the HUD draws, as inline SVG strings.
 *
 * No image files, no icon font: AGENTS.md §1 says everything is generated in code, and a HUD
 * that ships as vectors also stays crisp from 1280×720 to 4K without a second asset set.
 *
 * House rules for every shape in here (AGENTS.md §2.1):
 *   · a thick ink outline on the silhouette — `#1a1210`, never pure black
 *   · flat saturated fills from the §2.2 palette, no gradients doing the modelling work
 *   · one hard specular notch instead of a soft highlight — it reads as painted, not rendered
 *   · a dark "thickness" shape offset downward so the icon sits on the screen like a sticker
 */

/** The only colours anything in the UI is allowed to use (AGENTS.md §2.2). */
export const C = {
  ink:     '#1a1210',
  inkCool: '#161022',
  inkSoft: '#241a16',
  gold:    '#e8b942',
  goldL:   '#ffe9a8',
  goldD:   '#966a18',
  goldSpec:'#fffbe8',
  spark:   '#8fd8ff',
  lapis:   '#2a7fd4',
  lapisD:  '#1f4f96',
  paint:   '#f2e8d4',
  carn:    '#b8452c',
  mala:    '#2f8f5a',
  turq:    '#2fa8a0',
};

/** SVG text needs a real family name; this container only ships DejaVu / Liberation. */
const FONT = "'DejaVu Sans','Liberation Sans',Arial,sans-serif";

let _uid = 0;
const uid = (p) => `${p}${++_uid}`;

/**
 * Every icon carries an explicit `aspect-ratio` taken from its viewBox. Inline SVG sized with
 * `height: Xem; width: auto` is otherwise at the mercy of intrinsic-ratio resolution, and a
 * keycap that collapses to zero width takes the whole control reference with it.
 */
const wrap = (vb, inner, cls = '', extra = '') => {
  const [, , w, h] = vb.split(/\s+/).map(Number);
  return `<svg class="${cls}" viewBox="${vb}" ${extra} style="aspect-ratio:${w}/${h}" fill="none" ` +
         `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
};

/* ------------------------------------------------------------------ coin */

/**
 * A struck gold coin seen slightly from above: rim thickness below, flat face, ankh die,
 * one hard glint. Small enough to still read at 18 px.
 */
export function coin(cls = '') {
  return wrap('0 0 46 46', `
    <circle cx="23" cy="26.4" r="18.6" fill="${C.goldD}" stroke="${C.ink}" stroke-width="3.4"/>
    <circle cx="23" cy="22.4" r="18.6" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.4"/>
    <circle cx="23" cy="22.4" r="13.4" fill="none" stroke="${C.goldD}" stroke-width="2.1" opacity=".85"/>
    <g fill="${C.goldD}">
      <circle cx="23" cy="16.6" r="4.1" fill="none" stroke="${C.goldD}" stroke-width="2.7"/>
      <rect x="21.6" y="20.2" width="2.9" height="10.6" rx="1.2"/>
      <rect x="16.6" y="22.4" width="12.9" height="2.9" rx="1.3"/>
    </g>
    <path d="M11.6 15.6A14 14 0 0 1 20.4 9.2" stroke="${C.goldSpec}" stroke-width="3.1"
          stroke-linecap="round" opacity=".9"/>
  `, cls);
}

/* ---------------------------------------------------------------- health */

/**
 * Health pip. Carnelian reads as "life" instantly and stays clear of the gold (loot) and cyan
 * (traversal) channels of the palette.
 *
 * TWO SHAPES, because the row is not a bar. `PlayerHealth` defines `hp = 1 + charms` and says so
 * in as many words: *"Sly himself is the last pip."* A charm is a horseshoe you spent 100 coins
 * on and can lose; the last pip is the run. Drawing both as the same gem told the player he had
 * three of something, when what he had was two consumables and his life — and "the next hit ends
 * the run" is the single most consequential fact in a game whose health system exists to make
 * *not being seen* the only real defence.
 *
 *   `kind: 'life'`  — the Cooper calling card. A card among horseshoes is a silhouette
 *                     difference, so it survives the ~19 px this renders at on a 1280×720 frame
 *                     without relying on colour.
 *   `kind: 'charm'` — the horseshoe, the series' own lucky charm.
 */
export function pip(filled = true, kind = 'charm', cls = '') {
  return kind === 'life' ? lifePip(filled, cls) : charmPip(filled, cls);
}

/** The Cooper calling card: paint stock, ink mask, two spark eyes. */
function lifePip(filled, cls) {
  if (filled) {
    return wrap('0 0 46 46', `
      <g transform="rotate(-5 23 23)">
        <rect x="9" y="8.5" width="28" height="34" rx="3.6" fill="${C.ink}"/>
        <rect x="9" y="5" width="28" height="34" rx="3.6" fill="${C.paint}"
              stroke="${C.ink}" stroke-width="3.4"/>
        <path d="M12.4 18.4c4.4-4.2 17.8-4.2 22.2 0-1 5.8-5.1 8.4-8.7 6.3-1.4-.9-2.3-2.3-2.5-3.2
                 -.3.9-1.1 2.3-2.5 3.2-3.6 2.1-7.6-.5-8.5-6.3z" fill="${C.ink}"/>
        <ellipse cx="17.6" cy="19.6" rx="2.5" ry="2" fill="${C.spark}"/>
        <ellipse cx="28.4" cy="19.6" rx="2.5" ry="2" fill="${C.spark}"/>
        <path d="M23 27.4q-3.4 0-3.4 2.8T23 33.6t3.4-3T23 27.4z" fill="${C.carn}"
              stroke="${C.ink}" stroke-width="2.2"/>
      </g>
    `, cls);
  }
  // Down. The card is spent, not merely dimmed — it keeps its outline so the row still counts.
  return wrap('0 0 46 46', `
    <g transform="rotate(-5 23 23)">
      <rect x="9" y="5" width="28" height="34" rx="3.6" fill="${C.inkSoft}" fill-opacity=".62"
            stroke="${C.ink}" stroke-width="3.4"/>
      <path d="M14 12.5 32 31.5M32 12.5 14 31.5" stroke="${C.carn}" stroke-width="2.6"
            stroke-linecap="round" opacity=".55"/>
    </g>
  `, cls);
}

/** A lucky charm. Stroked rather than filled so the opening reads at pip size. */
function charmPip(filled, cls) {
  const shoe = 'M13.2 35.6C9.4 19.4 16 8.8 23 8.8s13.6 10.6 9.8 26.8';
  if (filled) {
    return wrap('0 0 46 46', `
      <path d="${shoe}" transform="translate(0 2.4)" stroke="${C.ink}" stroke-width="11"
            stroke-linecap="round" fill="none" opacity=".55"/>
      <path d="${shoe}" stroke="${C.ink}" stroke-width="11.6" stroke-linecap="round" fill="none"/>
      <path d="${shoe}" stroke="${C.carn}" stroke-width="6.4" stroke-linecap="round" fill="none"/>
      <g fill="${C.goldL}" opacity=".92">
        <circle cx="15.4" cy="24.6" r="1.7"/><circle cx="23" cy="14.4" r="1.7"/>
        <circle cx="30.6" cy="24.6" r="1.7"/>
      </g>
      <path d="M15.6 15.2a10 10 0 0 1 5-4.6" stroke="${C.goldL}" stroke-width="2.6"
            stroke-linecap="round" opacity=".8" fill="none"/>
    `, cls);
  }
  /**
   * The empty shoe carries the charm you are part-way through PAYING for.
   *
   * `.sly-charm-fill` is the same carnelian stroke, at the same 6.4 weight the filled pip uses,
   * traced from heel to heel by `HUD.setCharmProgress()`. So the pip does not sprout a second
   * widget when the player starts saving — it fills in and becomes its own finished form, which
   * is the one shape in the row that already means "a charm". `PlayerHealth` banks coins toward
   * this at `CHARM.charmCoins`, and before this existed 99 coins and 1 coin looked identical.
   *
   * `pathLength="100"` normalises the dash arithmetic exactly as `threatEye`'s lash does, so the
   * driver writes a percentage and never has to know the curve's real length. It rests at 100
   * (nothing drawn) so a pip nobody is saving toward is indistinguishable from the old art.
   */
  return wrap('0 0 46 46', `
    <path d="${shoe}" stroke="${C.ink}" stroke-width="11.6" stroke-linecap="round" fill="none"
          opacity=".62"/>
    <path d="${shoe}" stroke="${C.carn}" stroke-width="2.2" stroke-linecap="round" fill="none"
          opacity=".45"/>
    <path class="sly-charm-fill" d="${shoe}" stroke="${C.carn}" stroke-width="6.4"
          stroke-linecap="round" fill="none"
          pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
  `, cls);
}

/* --------------------------------------------------------------- keycaps */

const KEY_W = { 'W A S D': 132, 'Space': 116, 'Shift': 88, 'Ctrl': 74, 'Mouse': 92, 'Esc': 68, 'Tab': 68, 'Enter': 84 };

/**
 * A physically drawn keycap — ink outline, paint-white face, top gloss, and a hard ink
 * body underneath so it looks pressable. The whole point of the control reference is that
 * the player reads a *key*, not a word in brackets.
 */
export function keycap(label, cls = '') {
  const txt = String(label);
  const w = KEY_W[txt] ?? Math.max(46, 24 + txt.length * 15);
  const h = 52;
  const fs = txt.length > 3 ? 19 : 23;
  return wrap(`0 0 ${w} ${h}`, `
    <rect x="3" y="11" width="${w - 6}" height="38" rx="9" fill="${C.ink}"/>
    <rect x="3" y="3" width="${w - 6}" height="38" rx="9" fill="${C.paint}"
          stroke="${C.ink}" stroke-width="3.4"/>
    <rect x="8.5" y="7.5" width="${w - 17}" height="12" rx="6" fill="#fffdf6" opacity=".8"/>
    <text x="${w / 2}" y="23.5" text-anchor="middle" dominant-baseline="central"
          font-family="${FONT}" font-size="${fs}" font-weight="700" letter-spacing=".4"
          fill="${C.ink}">${txt}</text>
  `, `sly-key ${cls}`, `width="${w}" height="${h}"`);
}

/**
 * The one directory of image files the HUD uses (§516) — Kenney's "Input Prompts" pack (1.3),
 * CC0, 12 of ~1,500 glyphs, fetched from the pack's GitHub mirror because kenney.nl itself is
 * egress-blocked where this was built. Provenance, licence and the pinned mirror commit:
 * `public/assets/prompts/PROVENANCE.md`. The house rule this bends — "every glyph the HUD draws,
 * as inline SVG" — is bent knowingly: the user's instruction for the pad work was *"import any
 * online resource that may be relevant"*, and these ARE that import. They are still vectors,
 * still served from our own origin, still crisp at 4K.
 *
 * Basenames are written out literally, one per line, because `tests/bundle.test.mjs` decides
 * whether a `public/` asset ships-but-is-dead by searching src for its quoted basename — a
 * constructed `\`playstation_${x}.svg\`` would mark all twelve as unreferenced payload.
 */
export const PAD_GLYPH_DIR = 'assets/prompts/';
export const PAD_GLYPH_FILES = {
  cross:    'playstation_button_color_cross.svg',
  circle:   'playstation_button_color_circle.svg',
  square:   'playstation_button_color_square.svg',
  triangle: 'playstation_button_color_triangle.svg',
  L1:       'playstation_trigger_l1.svg',
  L2:       'playstation_trigger_l2.svg',
  R1:       'playstation_trigger_r1.svg',
  R2:       'playstation_trigger_r2.svg',
  R3:       'playstation_button_r3.svg',
  OPT:      'playstation4_button_options.svg',
  LS:       'playstation_stick_l.svg',
  RS:       'playstation_stick_r.svg',
};

/**
 * A PS4 pad button in the keycap idiom (§516): the keycap's own round ink body and sticker
 * offset, but a DARK face — a DualShock is black hardware, and it is also what makes the pack's
 * glyphs legible: eight of the twelve are white-on-transparent, invisible on the parchment the
 * keycaps use. The Kenney file rides on top via `<image>`, verbatim (the colour face buttons
 * keep Kenney's Sony hues; the knockout shapes read as the dark face showing through, which is
 * what the real controller looks like). Contrast is solved here, at composition time, so the
 * committed assets stay untouched.
 * `shape`: a `PAD_GLYPH_FILES` key. Anything else renders as a paint-ink text label, so a new
 * binding shows *something* legible while its glyph is still unchosen.
 */
export function padBtn(shape, cls = '') {
  const h = 52, w = 52;
  const file = PAD_GLYPH_FILES[shape];
  const mark = file
    ? `<image href="${PAD_GLYPH_DIR}${file}" x="5" y="2" width="42" height="42"/>`
    : `<text x="26" y="23.5" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="17" font-weight="700" fill="${C.paint}">${String(shape)}</text>`;
  return wrap(`0 0 ${w} ${h}`, `
    <circle cx="26" cy="31" r="22" fill="${C.ink}"/>
    <circle cx="26" cy="23" r="22" fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="3.4"/>
    <circle cx="26" cy="17" r="13.5" fill="#fffdf6" opacity=".14"/>
    ${mark}
  `, `sly-key ${cls}`, `width="${w}" height="${h}"`);
}

/** Mouse with one button lit gold — for the cane and Thief-o-Vision bindings. */
export function mouse(button = 'left', cls = '') {
  const id = uid('mc');
  const lit = button === 'left'
    ? `<rect x="5" y="5" width="16" height="19" fill="${C.gold}"/>`
    : button === 'right'
      ? `<rect x="21" y="5" width="16" height="19" fill="${C.gold}"/>`
      : `<rect x="17" y="9" width="8" height="12" rx="4" fill="${C.gold}"/>`;
  return wrap('0 0 42 56', `
    <defs><clipPath id="${id}"><rect x="5" y="5" width="32" height="44" rx="15.5"/></clipPath></defs>
    <rect x="5" y="12" width="32" height="42" rx="15.5" fill="${C.ink}"/>
    <rect x="5" y="5" width="32" height="44" rx="15.5" fill="${C.paint}" stroke="${C.ink}" stroke-width="3.4"/>
    <g clip-path="url(#${id})">${lit}</g>
    <path d="M5 24h32M21 5v19" stroke="${C.ink}" stroke-width="2.9" stroke-linecap="round"/>
  `, `sly-key ${cls}`, 'width="42" height="56"');
}

/* ------------------------------------------------------------ binocucom */

/** One L bracket. Drawn on a fixed square so it never stretches with the viewport. */
export function bracket(cls = '') {
  return wrap('0 0 64 64', `
    <path d="M6 34V6h28" stroke="${C.ink}" stroke-width="13" stroke-linecap="square"/>
    <path d="M6 34V6h28" stroke="${C.gold}" stroke-width="5.5" stroke-linecap="square"/>
    <path d="M6 46V40" stroke="${C.spark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M40 6h6" stroke="${C.spark}" stroke-width="4" stroke-linecap="round"/>
  `, cls);
}

/** Ranging reticle. Ink under-strokes keep it readable against a blown-out sky. */
export function crosshair(cls = '') {
  const paths = `
      <circle cx="100" cy="100" r="55" stroke-dasharray="11 13"/>
      <path d="M100 45v20M100 135v20M45 100h20M135 100h20"/>
      <rect x="87" y="87" width="26" height="26" rx="3" transform="rotate(45 100 100)"/>
  `;
  return wrap('0 0 200 200', `
    <g stroke="${C.ink}" stroke-width="8.5" opacity=".55" stroke-linecap="round">${paths}</g>
    <g stroke="${C.spark}" stroke-width="3.1" stroke-linecap="round" class="sly-x-ring">${paths}</g>
    <g stroke="${C.ink}" stroke-width="8" opacity=".5" stroke-linecap="square">
      <path d="M60 76V60h16M124 60h16v16M140 124v16h-16M76 140H60v-16"/>
    </g>
    <path d="M60 76V60h16M124 60h16v16M140 124v16h-16M76 140H60v-16"
          stroke="${C.gold}" stroke-width="4" stroke-linecap="square"/>
    <circle cx="100" cy="100" r="4.4" fill="${C.ink}"/>
    <circle cx="100" cy="100" r="2.6" fill="${C.spark}"/>
  `, cls);
}

/** Bentley on the other end of the line — turtle, spectacles, permanently worried. */
export function caller(cls = '') {
  return wrap('0 0 96 96', `
    <rect x="0" y="0" width="96" height="96" fill="${C.lapisD}"/>
    <circle cx="48" cy="70" r="40" fill="${C.lapis}" opacity=".55"/>
    <path d="M14 96c2-20 15-30 34-30s32 10 34 30z" fill="${C.goldD}" stroke="${C.ink}" stroke-width="3.4"/>
    <path d="M26 96c1-11 9-17 22-17s21 6 22 17z" fill="${C.mala}" stroke="${C.ink}" stroke-width="3"/>
    <ellipse cx="48" cy="44" rx="26" ry="25" fill="${C.mala}" stroke="${C.ink}" stroke-width="3.6"/>
    <path d="M28 30c5-7 13-11 20-11" stroke="#5fc98a" stroke-width="5" stroke-linecap="round" opacity=".85"/>
    <g>
      <circle cx="37" cy="43" r="12" fill="${C.paint}" stroke="${C.ink}" stroke-width="3.4"/>
      <circle cx="63" cy="43" r="12" fill="${C.paint}" stroke="${C.ink}" stroke-width="3.4"/>
      <path d="M49 43h2" stroke="${C.ink}" stroke-width="3.4"/>
      <circle cx="39" cy="44" r="4.2" fill="${C.ink}"/>
      <circle cx="61" cy="44" r="4.2" fill="${C.ink}"/>
      <circle cx="41" cy="41.5" r="1.6" fill="${C.paint}"/>
      <circle cx="63" cy="41.5" r="1.6" fill="${C.paint}"/>
      <path d="M27 38a12 12 0 0 1 7-6" stroke="#ffffff" stroke-width="3" opacity=".55" stroke-linecap="round"/>
    </g>
    <path d="M42 62q6 4 12 0" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round"/>
  `, cls);
}

/** Signal strength, 0..4 bars. */
export function signal(level = 3, cls = '') {
  let bars = '';
  for (let i = 0; i < 4; i++) {
    const h = 5 + i * 4;
    bars += `<rect x="${i * 8}" y="${20 - h}" width="5.4" height="${h}" rx="1.2"
             fill="${i < level ? C.spark : C.ink}" opacity="${i < level ? 1 : 0.5}"/>`;
  }
  return wrap('0 0 30 20', bars, cls, 'width="30" height="20"');
}

/* ---------------------------------------------------------------- threat */

/**
 * The exposure eye — the "does anyone see me" readout beside the coins.
 *
 * Drawn in `currentColor` rather than a fixed fill, because the same element has to carry all
 * four rungs of the threat ladder (cream → amber → red, pinned to the vision cone's own stops in
 * `Alert.js`). A lid closes over it via `.sly-threat[data-state='hidden']`, so the shape reads at
 * a glance even before the colour registers: shut eye = unseen, open eye = someone is looking.
 *
 * `.sly-eye-fill` is the ANALOG channel: the upper lash traced left→right by
 * `Guards.alertLevel`. It carries its own `--sus-col` rather than `currentColor` on purpose —
 * the whole point of the meter is that it warms and fills *before* the discrete state (and
 * therefore the chip's own colour) has moved. `pathLength="100"` normalises the dash arithmetic
 * so the driver never has to know the curve's real length.
 */
export function threatEye(cls = '') {
  const lash = 'M4 22C14 7 50 7 60 22';
  return wrap('0 0 64 44', `
    <path d="M4 22C14 7 50 7 60 22 50 37 14 37 4 22z" fill="${C.ink}" fill-opacity=".72"
          stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>
    <path class="sly-eye-open" d="M4 22C14 7 50 7 60 22 50 37 14 37 4 22z" fill="none"
          stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/>
    <circle class="sly-eye-iris" cx="32" cy="22" r="9.4" fill="currentColor"/>
    <circle class="sly-eye-iris" cx="32" cy="22" r="4" fill="${C.ink}"/>
    <path class="sly-eye-lid" d="M4 22C14 30 50 30 60 22" fill="none"
          stroke="currentColor" stroke-width="4.4" stroke-linecap="round"/>
    <path d="${lash}" fill="none" stroke="${C.ink}" stroke-width="9.5" stroke-linecap="round"
          pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" class="sly-eye-fill-ink"/>
    <!-- The live colour arrives from CSS (\`.sly-eye-fill { stroke: var(--sus-col) }\`): a
         presentation attribute cannot resolve a custom property, so this fill is only the
         value the meter rests at if the stylesheet ever fails to load. -->
    <path class="sly-eye-fill" d="${lash}" fill="none" stroke="${C.gold}"
          stroke-width="5.4" stroke-linecap="round"
          pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
  `, `sly-eye ${cls}`);
}

/* ------------------------------------------------------------- objective */

/**
 * The objective marker head. A gold die on a lapis disc — gold is the loot channel and this
 * marker only ever points at loot or at the fence that turns loot into money.
 *
 * Deliberately radially symmetric: it gets pinned to the frame edge when the target is behind
 * the camera, and a pin with a tail would be pointing at the floor half the time. Direction is
 * a separate rotating part (`goalArrow`) so the head never spins.
 */
export function goalPin(cls = '') {
  return wrap('0 0 72 72', `
    <circle cx="36" cy="40" r="25" fill="${C.ink}"/>
    <circle cx="36" cy="36" r="25" fill="${C.lapisD}" stroke="${C.ink}" stroke-width="6"/>
    <circle cx="36" cy="36" r="18" fill="none" stroke="${C.lapis}" stroke-width="2.6" opacity=".9"/>
    <rect x="24" y="24" width="24" height="24" rx="3.4" transform="rotate(45 36 36)"
          fill="${C.gold}" stroke="${C.ink}" stroke-width="4.4"/>
    <path d="M29 33.5a9 9 0 0 1 5-5" stroke="${C.goldSpec}" stroke-width="3"
          stroke-linecap="round" fill="none" opacity=".9"/>
  `, cls);
}

/** Off-screen direction chevron. Points UP at 0° so the driver can rotate it by a bearing. */
export function goalArrow(cls = '') {
  const p = 'M20 5 34 26 20 19.4 6 26z';
  return wrap('0 0 40 40', `
    <path d="${p}" fill="${C.ink}" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>
    <path d="${p}" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>
  `, cls);
}

/* ----------------------------------------------------------- alert / world */

/** Suspicion arc. The fill circle is driven by stroke-dashoffset from HUD.update(). */
export function alertArc(cls = '') {
  return wrap('0 0 100 100', `
    <circle cx="50" cy="50" r="36" fill="${C.ink}" fill-opacity=".55"/>
    <circle cx="50" cy="50" r="36" stroke="${C.ink}" stroke-width="13" opacity=".8"/>
    <circle cx="50" cy="50" r="36" stroke="${C.paint}" stroke-width="5" opacity=".22"/>
    <circle class="sly-alert-fill" cx="50" cy="50" r="36" stroke="${C.gold}" stroke-width="7"
            stroke-linecap="round" transform="rotate(-90 50 50)"
            stroke-dasharray="226.2" stroke-dashoffset="226.2"/>
  `, cls);
}

/** Lock-on bracket for Thief-o-Vision targets. */
export function lockOn(cls = '') {
  const p = 'M6 22V6h16M56 6h16v16M72 56v16H56M22 72H6V56';
  return wrap('0 0 78 78', `
    <path d="${p}" stroke="${C.ink}" stroke-width="10" stroke-linecap="square" opacity=".6"/>
    <path d="${p}" stroke="currentColor" stroke-width="4.2" stroke-linecap="square"/>
    <rect x="33" y="33" width="12" height="12" rx="2" transform="rotate(45 39 39)"
          stroke="currentColor" stroke-width="3"/>
  `, cls);
}

/**
 * The pocket mark — a pickpocketable pouch, in world space.
 *
 * AGENTS.md §2.1.6 names the shape and the colours outright: *"Interactive traversal points —
 * spire tips, hooks, rails, poles, **pickpocket targets** — carry the iconic blue-white diamond
 * sparkle (`#8fd8ff` core, `#2a7fd4` glow). This is Sly's UI grammar and it must be present."*
 * So the sparkle is not a choice, it is the spec; the ring around it is what makes the sparkle a
 * *target* rather than a collectable, and it is dashed with the same idiom `crosshair()` uses.
 *
 * Drawn in `currentColor` so one piece of art carries both readings the mark has to make:
 * spark-blue while the pocket is merely *available*, gold once MOVEMENT has committed Sly to the
 * approach. Same invitation-vs-statement split as `.sly-mark` against `.sly-lock`.
 *
 * `pathLength="100"` normalises the dash arithmetic — 11 + 14 divides 100 exactly four times, so
 * the ring is four even segments whatever radius this ends up rendering at.
 */
export function pocketMark(cls = '') {
  const dash = 'pathLength="100" stroke-dasharray="11 14" stroke-linecap="round" fill="none"';
  return wrap('0 0 64 64', `
    <circle cx="32" cy="32" r="26" stroke="${C.ink}" stroke-width="9" ${dash} opacity=".6"/>
    <circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="3.4" ${dash}
            class="sly-pocket-ring"/>
    <g transform="translate(12 12)">
      <path d="M20 2c2 11 7 16 18 18-11 2-16 7-18 18-2-11-7-16-18-18 11-2 16-7 18-18z"
            fill="currentColor" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
    </g>
  `, cls);
}

/**
 * A light footfall — the "you are moving quietly" mark on the exposure chip.
 *
 * A footprint rather than a crouched figure, because this renders at roughly 15 px on a 1280×720
 * frame and a silhouette of a body loses its limbs at that size while a sole and a heel do not.
 * Two shapes with a gap between them is a silhouette the eye resolves instantly, and the gap is
 * what makes it read as a *print* — a mark left behind — rather than as a blob.
 *
 * `currentColor` again, so the chip owns the tint.
 */
export function stealthMark(cls = '') {
  return wrap('0 0 36 46', `
    <g fill="currentColor" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round">
      <path d="M11 9c7-3 14 0 15 7 1 7-3 11-8 12-5 1-9-2-10-6-1-4 0-11 3-13z"/>
      <path d="M14 31c5-1 9 2 9 6.5 0 4-3 6.5-7 6.5s-6.5-2.5-6.5-6 1.5-6.5 4.5-7z"/>
    </g>
    <g fill="currentColor" stroke="${C.ink}" stroke-width="2.6">
      <circle cx="28" cy="4.6" r="3"/><circle cx="5.6" cy="8.4" r="2.6"/>
    </g>
  `, cls);
}

/* ------------------------------------------------------------- emblems */

/** The Cooper calling card: a masked raccoon struck on a gold coin. */
export function cooperMark(cls = '') {
  return wrap('0 0 68 68', `
    <circle cx="34" cy="35" r="28" fill="${C.goldD}"/>
    <circle cx="34" cy="33" r="28" fill="${C.gold}" stroke="${C.ink}" stroke-width="4"/>
    <path d="M15 17 20 5l10 8zM53 17 48 5l-10 8z" fill="${C.ink}"/>
    <path d="M10 30c9-9 39-9 48 0-2 11-11 16-18 12-3-2-5-5-6-7-1 2-3 5-6 7-7 4-16-1-18-12z" fill="${C.ink}"/>
    <ellipse cx="23" cy="32" rx="5.2" ry="4.2" fill="${C.spark}"/>
    <ellipse cx="45" cy="32" rx="5.2" ry="4.2" fill="${C.spark}"/>
    <path d="M34 45q-6.5 0-6.5 5.4T34 56t6.5-5.6T34 45z" fill="${C.paint}" stroke="${C.ink}" stroke-width="2.6"/>
    <circle cx="34" cy="48.5" r="2.7" fill="${C.ink}"/>
  `, cls);
}

/** Eye of Ra — the thing we came here to steal. */
export function eyeOfRa(cls = '') {
  return wrap('0 0 78 52', `
    <g stroke="${C.ink}" stroke-width="4.2" stroke-linecap="round">
      <path d="M7 27C19 10 45 8 60 23"/>
      <path d="M7 27c12 16 40 16 53 -4"/>
      <path d="M16 39 13 50"/>
      <path d="M37 39q9 11-2 9t-4-11"/>
      <path d="M56 13q10-7 17 2"/>
    </g>
    <circle cx="32" cy="25" r="8" fill="${C.lapis}" stroke="${C.ink}" stroke-width="3.6"/>
    <circle cx="29.5" cy="22.5" r="2.2" fill="${C.spark}"/>
  `, cls);
}

/** Sly's cane. Used as the pause-menu rule and the objective-card flourish. */
export function cane(cls = '') {
  const d = 'M14 94V36c0-16 24-18 24-4 0 11-13 13-13 2';
  return wrap('0 0 48 100', `
    <path d="${d}" stroke="${C.ink}" stroke-width="12" stroke-linecap="round"/>
    <path d="${d}" stroke="${C.gold}" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="14" cy="94" r="6" fill="${C.ink}"/>
    <circle cx="14" cy="92.5" r="3.2" fill="${C.lapis}"/>
  `, cls);
}

/** A four-point sparkle — Sly's traversal grammar, reused as the toast default icon. */
export function sparkle(cls = '', color = C.spark) {
  return wrap('0 0 40 40', `
    <path d="M20 2c2 11 7 16 18 18-11 2-16 7-18 18-2-11-7-16-18-18 11-2 16-7 18-18z"
          fill="${color}" stroke="${C.ink}" stroke-width="3"/>
  `, cls);
}

/**
 * Sly's clue bottle — the corked glass the twelve-bottle set is made of.
 *
 * `C.spark` #8fd8ff is the same §2.1.6 pickup blue `Props.MATERIALS.glass` and
 * `Pickups._clueMat` both draw the bottle in, so the toast and the object in the world are one
 * colour rather than two. House rules as the header states them: the dark thickness shape
 * offset downward, the ink silhouette, one hard specular notch and no gradient.
 */
export function clueBottle(cls = '') {
  return wrap('0 0 46 46', `
    <path d="M15.4 21.4c0-3.4 2.2-4.6 2.2-7.4V12h10.8v2c0 2.8 2.2 4 2.2 7.4v17.4a3.4 3.4 0 0 1-3.4 3.4H18.8a3.4 3.4 0 0 1-3.4-3.4z"
          fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M15.4 17.4c0-3.4 2.2-4.6 2.2-7.4V8h10.8v2c0 2.8 2.2 4 2.2 7.4v17.4a3.4 3.4 0 0 1-3.4 3.4H18.8a3.4 3.4 0 0 1-3.4-3.4z"
          fill="${C.spark}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round" opacity=".95"/>
    <rect x="16.4" y="4.2" width="13.2" height="6.2" rx="2" fill="${C.goldD}"
          stroke="${C.ink}" stroke-width="3.2"/>
    <path d="M19.6 22.6h6.8v9.4h-6.8z" fill="${C.paint}" stroke="${C.ink}" stroke-width="2.4"/>
    <path d="M18.9 14.4a9 9 0 0 0-.7 4.2v10.2" stroke="${C.goldSpec}" stroke-width="2.8"
          stroke-linecap="round" opacity=".85"/>
  `, cls);
}

/** Small utility glyphs for toasts. */
export function glyph(name, cls = '') {
  switch (name) {
    case 'coin': return coin(cls);
    case 'clue': return clueBottle(cls);
    case 'eye': return eyeOfRa(cls);
    case 'cooper': return cooperMark(cls);
    case 'alert':
      return wrap('0 0 40 40', `
        <path d="M20 3 38 35H2z" fill="${C.carn}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
        <rect x="17.6" y="13" width="4.8" height="11" rx="2.4" fill="${C.goldL}"/>
        <circle cx="20" cy="28.5" r="2.7" fill="${C.goldL}"/>
      `, cls);
    case 'health': return pip(true, 'charm', cls);
    case 'goal': return goalPin(cls);
    default: return sparkle(cls);
  }
}
