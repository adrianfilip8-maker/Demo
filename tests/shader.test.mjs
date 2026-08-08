import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SLY_COMMON, TOON_PARS, TOON_DETAIL, TOON_SHADE, TOON_DITHER, OUTLINE_VERT, OUTLINE_FRAG,
  DEBUG_CALIB,
} from '../src/render/shaders/toon.glsl.js';
import { Shading } from '../src/render/ToonMaterial.js';
import { OUTLINE_VERT_PATCHED } from '../src/render/Outline.js';

/**
 * Static integrity of the GLSL, and of the debug channels' self-calibration.
 *
 * ── Why this file exists ────────────────────────────────────────────────────────────────
 * Commit 6e0cc8f added the mode-5 RAMP channel and appended thirteen lines of prose AFTER the
 * close-comment marker that ended the previous block. GLSL therefore received:
 *
 *     * Mode 5 is the RAMP channel, added for the defect critic pass 7 called "there is no toon
 *
 * as executable source. The cel fragment program stopped linking — `ERROR: 0:2502: '*' : syntax
 * error`, LINK_STATUS false, ACTIVE_UNIFORMS 0 — so every toon-shaded pixel in the game silently
 * stopped drawing, for five hours, while sky/ink/post kept rendering a plausible-looking frame.
 *
 * Nothing caught it. `vite build` does not parse GLSL (it is a template literal). The commit
 * message records that scope was "checked by reading brace depth ... because a GLSL scope error
 * fails at runtime, not in the vite build" — the right worry, checked by eye, on the wrong
 * property. Three separate diagnostics then read the resulting frame and concluded, each with
 * confidence, that a *uniform* was not reaching the shader: KNOWN_ISSUES §210.2, §217 (later
 * retracted), and the `nUniforms: 0` reading §217 dismissed as impossible — which was in fact
 * the correct and decisive measurement, since an unlinked program has no active uniforms.
 *
 * Every assertion below runs in plain Node in milliseconds, with no GPU and no capture lock.
 * The comment-state scan alone would have turned that day into a red test.
 *
 * ── What this file does NOT establish ───────────────────────────────────────────────────
 * That the shader COMPILES. A GLSL compiler is the only thing that can say that, and there is
 * none in `node --test`. These are necessary conditions, not sufficient ones: they catch the
 * class of damage that is visible in the source text (comment state, stray quotes, brace
 * balance, missing splice needles, a debug channel with no calibration). For the sufficient
 * check, compile the patched source on the harness's own ANGLE/SwiftShader stack:
 * `node progress/records/glslink.mjs` does exactly that in ~15 s and takes no capture lock.
 * It is not part of `npm test` because it needs a browser; run it after any GLSL edit.
 */

/* OUTLINE_VERT_PATCHED, not just OUTLINE_VERT: `Outline.js` rewrites the depth push into clip
   space by string patch before handing the source to `ShaderMaterial`, so the patched text is the
   text that compiles — and §219's damage was damage to source text. Scanning only the unpatched
   form would check a program nothing renders. */
const SOURCES = {
  SLY_COMMON, TOON_PARS, TOON_DETAIL, TOON_SHADE, TOON_DITHER, OUTLINE_VERT, OUTLINE_FRAG,
  OUTLINE_VERT_PATCHED,
};

/**
 * Strip GLSL comments the way a compiler does, and report the comment state at EOF.
 * Returns code with comments blanked (line numbers and columns preserved).
 */
function stripComments(src) {
  let out = '';
  let mode = 0;                       // 0 = code, 1 = block comment, 2 = line comment
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === 0) {
      if (c === '/' && d === '*') { mode = 1; out += '  '; i++; continue; }
      if (c === '/' && d === '/') { mode = 2; out += '  '; i++; continue; }
      out += c;
      continue;
    }
    if (mode === 1) {
      if (c === '*' && d === '/') { mode = 0; out += '  '; i++; continue; }
      out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '\n') { mode = 0; out += '\n'; continue; }
    out += ' ';
  }
  return { code: out, endMode: mode };
}

/* ======================================================================
   1. Comment state — the exact defect that broke the build
====================================================================== */

test('GLSL: no source ends inside an unterminated comment', () => {
  for (const [name, src] of Object.entries(SOURCES)) {
    assert.equal(stripComments(src).endMode, 0,
      `${name} ends inside an open comment — everything after the last opener is invisible to GLSL`);
  }
});

test('GLSL: no prose escapes its comment block (6e0cc8f regression guard)', () => {
  /* A quote character is the cheapest unambiguous signal: GLSL ES has no string literals at
     all, so a `"` or a typographic quote outside a comment cannot be anything but escaped
     prose. This is precisely what 6e0cc8f leaked ("there is no toon ramp anywhere"). */
  for (const [name, src] of Object.entries(SOURCES)) {
    const { code } = stripComments(src);
    code.split('\n').forEach((line, i) => {
      const bad = line.match(/["'“”‘’]/);
      assert.equal(bad, null,
        `${name}:${i + 1} has a quote character outside any comment — prose has escaped its block:\n    ${line.trim()}`);
    });
  }
});

test('GLSL: no line of escaped prose survives as code', () => {
  /* The second signature of the same defect, for prose that happens to contain no quotes: a
     line that still opens with the comment-continuation asterisk after comments are stripped.
     Real GLSL never begins a line with `*` followed by a word and no operator context —
     except a wrapped multiply, so lines whose remainder parses as an expression are allowed. */
  for (const [name, src] of Object.entries(SOURCES)) {
    const { code } = stripComments(src);
    code.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (!/^\*\s+[A-Za-z]/.test(t)) return;
      const isWrappedMultiply = /[();,]/.test(t);   // a continuation line of a real expression
      assert.ok(isWrappedMultiply,
        `${name}:${i + 1} looks like comment prose that escaped its block:\n    ${t}`);
    });
  }
});

test('GLSL: braces and parens balance in every source', () => {
  for (const [name, src] of Object.entries(SOURCES)) {
    const { code } = stripComments(src);
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      const o = (code.match(new RegExp(`\\${open}`, 'g')) || []).length;
      const c = (code.match(new RegExp(`\\${close}`, 'g')) || []).length;
      assert.equal(o, c, `${name}: ${o} "${open}" against ${c} "${close}"`);
    }
  }
});

test('JS: no backtick inside any GLSL template literal', () => {
  /* The file is one template literal per export; a stray backtick in a comment terminates it
     and turns the rest of the shader into JavaScript. That is a boot-time SyntaxError, not a
     shader warning, and it is easy to reintroduce while documenting — it happened while
     writing the fix this test ships with. */
  for (const [name, src] of Object.entries(SOURCES)) {
    assert.ok(!src.includes('`'), `${name} contains a backtick, which would end its template literal`);
  }
});

/* ======================================================================
   2. Every debug channel self-calibrates
====================================================================== */

test('every debug channel declares a calibration mode with known constants', () => {
  const channels = Object.entries(DEBUG_CALIB);
  assert.ok(channels.length >= 2, 'DEBUG_CALIB must cover every channel the shader defines');

  /* Every `uDebugX` uniform declared in the shader must appear in the table. This is the
     assertion that makes the audit self-maintaining: adding a channel without a calibration
     turns this test red. */
  const declared = [...TOON_PARS.matchAll(/uniform\s+float\s+(uDebug\w+)\s*;/g)].map((m) => m[1]);
  assert.deepEqual(declared.sort(), ['uDebugShadow', 'uDebugTerm'],
    'a debug uniform was added or removed — give it a DEBUG_CALIB entry and update this list');

  for (const [key, c] of channels) {
    assert.equal(typeof c.mode, 'number', `${key}: mode must be a number`);
    assert.ok(c.mode > 0, `${key}: mode 0 is "off", it cannot be the calibration`);
    assert.equal(c.rgb.length, 3);
    assert.equal(c.u8.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(c.u8[i], Math.round(c.rgb[i] * 255),
        `${key}: u8[${i}] must be the 8-bit value rgb[${i}] rounds to — a probe compares against it`);
      /* Every constant must sit at the CENTRE of its 8-bit bucket, half an LSB from either
         edge. The original triple used 0.50, and 0.50 * 255 = 127.5 is a rounding TIE whose
         resolution is the driver's business — measured offline, mode 4 came back as three
         different modal triples. A calibration constant may not be a coin flip. */
      assert.ok(Math.abs(c.rgb[i] * 255 - c.u8[i]) < 0.01,
        `${key}: rgb[${i}] = ${c.rgb[i]} quantises to ${c.rgb[i] * 255}, not to the bucket centre ${c.u8[i]}`);
    }
  }
});

test('the emitted GLSL literal round-trips to the documented u8 triple', () => {
  /* The shader carries the constant as a decimal literal, not as the JS number, so the thing
     a probe compares against is what `toFixed` produced — assert on that, not on the source. */
  for (const [key, c] of Object.entries(DEBUG_CALIB)) {
    const literal = `vec3( ${c.rgb.map((v) => v.toFixed(6)).join(', ')} )`;
    assert.ok(TOON_SHADE.includes(literal), `${key}: the shader does not carry ${literal}`);
    c.rgb.forEach((v, i) => {
      const written = Number(v.toFixed(6));
      assert.equal(Math.round(written * 255), c.u8[i],
        `${key}: the literal ${written} quantises to ${Math.round(written * 255)}, not ${c.u8[i]}`);
    });
  }
});

test('the dither is suppressed for debug draws and only for them', () => {
  /* three's dithering chunk adds up to half an LSB of hash noise AFTER this file has written
     its calibration constant, which is enough to move it by one. Every cel material ships
     dithering: true — a deliberate look decision for the haze gradient — so the fix is to
     branch, not to turn it off. */
  assert.ok(TOON_DITHER.includes('dithering( gl_FragColor.rgb )'),
    'the guard must still call three\'s own dithering(), not reimplement it');
  assert.ok(TOON_DITHER.includes('uDebugTerm < 0.5') && TOON_DITHER.includes('uDebugShadow < 0.5'),
    'the guard must be conditioned on BOTH debug channels');

  const stub = { _patchWarned: false, _warn: (m) => assert.fail(`splice missed: ${m}`) };
  const patched = Shading.prototype._patch.call(stub, THREE.ShaderLib.physical.fragmentShader);
  assert.ok(!patched.includes('#include <dithering_fragment>'), 'the stock dither include survived the splice');
  assert.ok(patched.includes('dithering( gl_FragColor.rgb )'), 'the guarded dither did not land');
});

test('calibration triples are distinct between channels', () => {
  /* So a probe that reads one channel and gets the other's constants can tell. */
  const seen = new Map();
  for (const [key, c] of Object.entries(DEBUG_CALIB)) {
    const sig = c.u8.join(',');
    assert.equal(seen.has(sig), false, `${key} shares its calibration triple with ${seen.get(sig)}`);
    seen.set(sig, key);
  }
  /* And no triple may be a flat grey or a primary — those occur naturally in a frame. */
  for (const [key, c] of Object.entries(DEBUG_CALIB)) {
    assert.equal(new Set(c.u8).size, 3, `${key}: all three channels differ, or the triple is a grey/primary a real pixel can produce`);
  }
});

test('each calibration constant is gated on its own channel mode', () => {
  /* The literal itself is asserted above; this is about the branch that selects it. */
  const { code } = stripComments(TOON_SHADE);
  const termGuard = code.indexOf(`uDebugTerm < ${DEBUG_CALIB.term.mode}.5`);
  assert.ok(termGuard > -1, 'debugTerm calibration is not gated on its documented mode number');
  assert.ok(code.includes(`uDebugShadow > ${DEBUG_CALIB.shadow.mode - 0.5}`),
    'debugShadow calibration is not gated on its documented mode number');
});

test('both debug channels are written AFTER the haze mix', () => {
  /* KNOWN_ISSUES §1: a diagnostic carried through the haze reports the pipeline, not the term,
     and it cost eight dead ends. The haze mix is the last thing this shader does to
     outgoingLight, so both channels must overwrite it strictly afterwards. */
  const { code } = stripComments(TOON_SHADE);
  const haze = code.indexOf('outgoingLight = mix( outgoingLight, slyHazeColor( rd ), haze )');
  assert.ok(haze > -1, 'the haze mix moved — this test needs updating with it');
  const termWrite = code.indexOf('uDebugTerm > 0.5');
  const shadowWrite = code.indexOf('uDebugShadow > 0.5 && slyDbgOn > 0.5');
  assert.ok(termWrite > haze, 'debugTerm is written before the haze mix and is therefore hazed');
  assert.ok(shadowWrite > haze, 'debugShadow is written before the haze mix and is therefore hazed');
});

/* ======================================================================
   3. The splice still lands
====================================================================== */

test('_patch finds every needle in three r185 meshphysical', () => {
  const warnings = [];
  const stub = { _patchWarned: false, _warn: (m) => warnings.push(m) };
  const src = THREE.ShaderLib.physical.fragmentShader;
  const patched = Shading.prototype._patch.call(stub, src);

  assert.deepEqual(warnings, [], `a shader splice missed: ${warnings.join('; ')}`);
  assert.ok(patched.length > src.length * 4,
    `patched source is ${patched.length} chars against ${src.length} — the splice did not land`);

  for (const needle of ['slyRamp', 'TOON_SHADE' in {} ? '' : 'slyMetalOut', 'vSlySkin']) {
    if (needle) assert.ok(patched.includes(needle), `${needle} missing from the patched source`);
  }
  /* The PBR accumulation must be gone, not merely shadowed. */
  for (const cut of ['#include <lights_physical_fragment>', '#include <lights_fragment_begin>']) {
    assert.ok(!patched.includes(cut), `${cut} survived the cut`);
  }
});

test('every ramp/debug uniform is both declared and read in the patched source', () => {
  const stub = { _patchWarned: false, _warn() {} };
  const patched = Shading.prototype._patch.call(stub, THREE.ShaderLib.physical.fragmentShader);
  for (const u of ['uTermLo', 'uTermHi', 'uTermSoft', 'uBands', 'uDebugTerm', 'uDebugShadow']) {
    const declared = new RegExp(`uniform\\s+float\\s+${u}\\s*;`).test(patched);
    const uses = (patched.match(new RegExp(u, 'g')) || []).length;
    assert.ok(declared, `${u} is not declared in the patched fragment source`);
    assert.ok(uses >= 2, `${u} is declared but read ${uses - 1} times — it reaches nothing`);
  }
});

test('the vertex splice carries vSlySkin across', () => {
  const stub = { _patchWarned: false, _warn() {} };
  const v = Shading.prototype._patchVert.call(stub, THREE.ShaderLib.physical.vertexShader);
  assert.ok(v.includes('varying float vSlySkin;'), 'vSlySkin is not declared in the vertex stage');
  assert.ok(v.includes('#ifdef USE_SKINNING'), 'vSlySkin is not driven by USE_SKINNING');
  assert.ok(TOON_PARS.includes('varying float vSlySkin;'),
    'the fragment stage does not declare the matching varying');
});

/* ======================================================================
   4. The JS API agrees with the GLSL
====================================================================== */

test('Shading exposes the calibration API the channels document', () => {
  const s = new Shading({});
  assert.equal(typeof s.programHealth, 'function', 'programHealth() is how a dead program is told from a leaky bypass');
  assert.equal(typeof s.calibrate, 'function');
  assert.equal(typeof s.confirmDebugCalibration, 'function');
  assert.deepEqual(s.debugCalib, DEBUG_CALIB);

  /* calibrate() must select the mode the table names, on the real uniform. */
  assert.deepEqual(s.calibrate('term').u8, DEBUG_CALIB.term.u8);
  assert.equal(s.uniforms.uDebugTerm.value, DEBUG_CALIB.term.mode);
  s.calibrate('shadow');
  assert.equal(s.uniforms.uDebugShadow.value, DEBUG_CALIB.shadow.mode);

  /* Off is off, on both channels. */
  s.debugTerm(0); s.debugShadow(0);
  assert.equal(s.uniforms.uDebugTerm.value, 0);
  assert.equal(s.uniforms.uDebugShadow.value, 0);
});

test('programHealth reports honestly when it cannot see a renderer', () => {
  /* The failure mode this whole file exists to prevent is an instrument that returns a
     confident null. With no renderer there is nothing to report, and it must say so rather
     than return ok. */
  const h = new Shading({}).programHealth();
  assert.equal(h.ok, false);
  assert.match(h.reason, /no renderer/);
  assert.equal(h.failed, 0);
});

test('selecting a reading mode on an unproven channel warns at the call site', () => {
  const warnings = [];
  const s = new Shading({ warn: (m) => warnings.push(String(m)) });
  s.debugTerm(2);
  assert.ok(warnings.some((w) => /READING mode/.test(w) && /UNPROVEN/.test(w)),
    `expected a loud unproven-channel warning, got: ${JSON.stringify(warnings)}`);

  warnings.length = 0;
  s.confirmDebugCalibration('term', true);
  s.debugTerm(2);
  assert.deepEqual(warnings, [], 'a proven channel must stop warning');

  warnings.length = 0;
  s.confirmDebugCalibration('term', false, 'read (137,188,225)');
  assert.ok(warnings.some((w) => /FAILED its own calibration/.test(w)));
  warnings.length = 0;
  s.debugTerm(5);
  assert.ok(warnings.some((w) => /not quotable/.test(w)),
    'after a failed calibration a reading mode must refuse to look trustworthy');
});

/* ======================================================================
   5. The file on disk, not just the exported strings
====================================================================== */

test('toon.glsl.js parses and exports what the rest of the renderer imports', () => {
  const path = fileURLToPath(new URL('../src/render/shaders/toon.glsl.js', import.meta.url));
  const text = readFileSync(path, 'utf8');
  /* Guard the specific shape of the 6e0cc8f accident at the file level too: a line that is
     pure comment-continuation must never directly follow a line that closes a comment. */
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].trimEnd();
    const cur = lines[i].trim();
    if (prev.endsWith('*/') && /^\*\s/.test(cur)) {
      assert.fail(`toon.glsl.js:${i + 1} continues a comment that line ${i} already closed:\n    ${cur}`);
    }
  }
});
