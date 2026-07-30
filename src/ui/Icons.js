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

const wrap = (vb, inner, cls = '', extra = '') =>
  `<svg class="${cls}" viewBox="${vb}" ${extra} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

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
 * Health pip: a cut gem, not a bar segment. Carnelian reads as "life" instantly and stays
 * clear of the gold (loot) and cyan (traversal) channels of the palette.
 */
export function pip(filled = true, cls = '') {
  if (filled) {
    return wrap('0 0 46 46', `
      <g transform="rotate(45 23 23)">
        <rect x="9.5" y="12" width="27" height="27" rx="7.5" fill="${C.ink}" opacity=".55"/>
        <rect x="9.5" y="9.5" width="27" height="27" rx="7.5" fill="${C.carn}"
              stroke="${C.ink}" stroke-width="3.6"/>
        <path d="M13.5 20.5v-3.4a3.6 3.6 0 0 1 3.6-3.6h3.4" stroke="${C.goldL}"
              stroke-width="3.2" stroke-linecap="round" opacity=".95"/>
      </g>
      <circle cx="29.5" cy="29" r="1.9" fill="${C.goldL}" opacity=".7"/>
    `, cls);
  }
  return wrap('0 0 46 46', `
    <g transform="rotate(45 23 23)">
      <rect x="9.5" y="9.5" width="27" height="27" rx="7.5" fill="${C.inkSoft}" fill-opacity=".62"
            stroke="${C.ink}" stroke-width="3.6"/>
      <rect x="14" y="14" width="18" height="18" rx="4.5" fill="none" stroke="${C.carn}"
            stroke-width="2" opacity=".45"/>
    </g>
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

/** Small utility glyphs for toasts. */
export function glyph(name, cls = '') {
  switch (name) {
    case 'coin': return coin(cls);
    case 'eye': return eyeOfRa(cls);
    case 'cooper': return cooperMark(cls);
    case 'alert':
      return wrap('0 0 40 40', `
        <path d="M20 3 38 35H2z" fill="${C.carn}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
        <rect x="17.6" y="13" width="4.8" height="11" rx="2.4" fill="${C.goldL}"/>
        <circle cx="20" cy="28.5" r="2.7" fill="${C.goldL}"/>
      `, cls);
    case 'health': return pip(true, cls);
    default: return sparkle(cls);
  }
}
