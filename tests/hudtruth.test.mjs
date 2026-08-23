/**
 * hudtruth.test.mjs — §549. The HUD audit: is what it shows TRUE, and does every wired element
 * actually move?
 *
 * Three questions, in the order they matter:
 *
 *   U1  Does the Thief-o-Vision bracket point at what the player locked? It did not: the HUD kept
 *       `Collision`'s POOLED result vectors and its own affordance poll overwrote them.
 *   U2  The §357.1 sweep with the third check A1 established in §548 — not "is there a wire" and
 *       not "does the handler survive", but **does anything on screen change**.
 *   U3  Discoverability, measured: how much of the moveset is reachable without first finding a
 *       screen, and can a pad player find that screen at all.
 *   U4  The control card's pad column names buttons the game actually binds.
 *
 * `_hudshim.mjs` supplies the DOM (§424 — the harness already existed; this adds no second copy).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { installDom, fakeEngine } from './_hudshim.mjs';

installDom();
const { HUD } = await import('../src/ui/HUD.js');
const { Collision } = await import('../src/world/Collision.js');
const { PAD_BINDINGS } = await import('../src/core/Input.js');
const { PAD_GLYPH_FILES } = await import('../src/ui/Icons.js');

const HUD_SRC = readFileSync(new URL('../src/ui/HUD.js', import.meta.url), 'utf8');

/* ------------------------------------------------------------------ serialiser */

/**
 * A HUD handler can change the screen through FOUR channels and `outerHTML` carries THREE of them.
 * `_hudshim`'s `Style` keeps `setProperty()` values in a private Map and takes direct
 * `.style.opacity =` writes as own properties; neither is serialised. `HUD.js` uses both style
 * paths (17 direct assignments plus `setProperty`), so a reader that skips them reports "this
 * handler changed nothing" for the vignette, the shake, every projected marker and the suspicion
 * lash. §439: the instrument must be able to see the thing it is hunting. `U2 instrument` below
 * proves all four channels are visible before any verdict is read off them.
 */
function styleOf(st) {
  if (!st) return '';
  const parts = [];
  if (st._props) for (const [k, v] of [...st._props].sort()) parts.push(`${k}:${v}`);
  for (const k of Object.keys(st).sort()) if (k !== '_props') parts.push(`${k}=${String(st[k])}`);
  return parts.join(';');
}
function ser(node, out = []) {
  if (!node || !node.tagName) { out.push(String(node)); return out; }
  const at = [...node.attributes].sort().map(([k, v]) => `${k}="${v}"`).join(' ');
  const cls = [...node._classes].sort().join('.');
  const ds = Object.keys(node.dataset || {}).sort().map((k) => `${k}=${node.dataset[k]}`).join(',');
  out.push(`<${node.tagName} ${at}|c:${cls}|d:${ds}|s:${styleOf(node.style)}|t:${node._text}`);
  for (const c of node.childNodes) ser(c, out);
  return out;
}
const snap = (r) => ser(r).join('\n');

const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
camera.position.set(0, 3, 14);
camera.lookAt(0, 3, 0);
camera.updateMatrixWorld(true);

async function boot({ device = 'key', get = () => null } = {}) {
  const en = fakeEngine(camera);
  en.debug = { hideHud: false, paused: false };
  const held = new Set();
  en.input = {
    lastDevice: device,
    pressed: (a) => held.has(a),
    releaseLock() { en.input.released = (en.input.released || 0) + 1; },
  };
  en.get = get;
  const h = new HUD(en);
  await h.init();
  const r = document.body.children.filter((c) => c.id === 'sly-hud').pop();
  assert.ok(r, 'the HUD root never reached the body — the shim or init is broken');
  return { en, h, r, held, tick: (n = 2) => { for (let i = 0; i < n; i++) h.update(1 / 60); } };
}

/* ================================================================== U1 */

const HOOK_A = [-4, 3, 0], HOOK_B = [-3, 3, 0], POLE = [4, 3, 0];

function buildCollision() {
  const box = (name, tag, [x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.name = name; m.position.set(x, y, z); m.updateMatrixWorld(true);
    return { mesh: m, tag };
  };
  const C = new Collision({ warn: () => {}, on: () => () => {}, emit: () => {}, get: () => null });
  C.add(box('hookA', 'hook', HOOK_A));
  C.add(box('hookB', 'hook', HOOK_B));
  C.add(box('poleNear', 'pole', POLE));
  C.build();
  return C;
}

test('U1 premise: Collision really does hand out pooled, reused result vectors', () => {
  /* The whole of U1 rests on this. If `Collision` ever starts cloning, U1's fix becomes
     unnecessary rather than wrong, and this arm is what says so instead of leaving a test that
     passes for a reason that has evaporated. The contract is the module's own (Collision.js:25):
     "Pooled results stay valid for the next few calls only — copy anything you intend to keep." */
  const C = buildCollision();
  const q1 = C.query(new THREE.Vector3(...HOOK_A), 3, ['hook']);
  const slot = q1[0], point = q1[0].point, before = point.clone();
  const q2 = C.query(new THREE.Vector3(...POLE), 3, ['pole']);

  assert.equal(slot, q2[0], 'the query no longer reuses its slot objects — U1 premise moved');
  assert.equal(point, q2[0].point, 'the query no longer reuses its point vectors — U1 premise moved');
  assert.ok(!point.equals(before),
    `a retained point should have been overwritten in place; it read ${point.toArray()} both times`);
  console.log(`  [U1] pool confirmed: a point kept from query 1 reads ${point.toArray().join(',')} `
    + `after query 2 (was ${before.toArray().join(',')})`);
});

test('U1: a Thief-o-Vision bracket stays on the hold the player locked', async () => {
  const C = buildCollision();
  const movement = { position: new THREE.Vector3(...POLE), yaw: 0 };
  const { en, h, r } = await boot({ get: (k) => (k === 'collision' ? C : k === 'movement' ? movement : null) });

  /* Enter ToV exactly as `Controller._thiefVision` does — the LIVE query array, straight into the
     emit, with no copy anywhere in between. That is the shipped call, not a model of it. */
  en.emit('thiefVision', true);
  en.emit('thiefTargets', C.query(new THREE.Vector3(...HOOK_A), 3, ['hook']));

  const locked = h._targets.map((t) => t.point.clone());
  assert.ok(locked.length >= 2, `expected both hooks in the lock list, got ${locked.length}`);
  assert.equal(locked[0].x, HOOK_A[0], 'the list did not start on the hook it was queried for');

  /* Within one update() the marks are drawn (_tickWorldMarks) and THEN the affordance prompt
     re-queries (_tickAffordancePrompt) — draw first, re-query second. So the corruption this
     guards against only becomes visible from frame 2, and one frame is not enough to see it. */
  const drawn = [];
  for (let f = 0; f < 4; f++) {
    h.update(1 / 60);
    drawn.push(r.querySelectorAll('.sly-mark').map((m) => m.style.transform || ''));
  }

  for (let i = 0; i < locked.length; i++) {
    assert.ok(h._targets[i].point.equals(locked[i]),
      `target ${i} moved from ${locked[i].toArray()} to ${h._targets[i].point.toArray()} — `
      + 'the HUD is holding a pooled Collision vector instead of a copy of it');
  }
  assert.deepEqual(drawn[3], drawn[1],
    `the bracket moved between frames 2 and 4 with a still camera: ${drawn[1]} -> ${drawn[3]}`);

  /* The direct statement of the rule, so a future refactor that reintroduces the reference is
     caught even if the affordance poll is what changes. */
  const fresh = C.query(new THREE.Vector3(...HOOK_A), 3, ['hook']);
  for (const t of h._targets) {
    for (const hit of fresh) {
      assert.notEqual(t.point, hit.point,
        'a retained target point IS one of the query pool vectors — it must be a copy');
    }
  }
  console.log(`  [U1] bracket held at ${drawn[3][0]} across 4 frames; `
    + `${h._targets.length} retained points, none aliasing the pool`);
});

/* ================================================================== U2 */

test('U2 instrument: the serialiser can see all four ways the HUD changes the screen', async () => {
  const { r } = await boot();
  const probes = [
    ['class', () => r.classList.add('__probe'), () => r.classList.remove('__probe')],
    ['attribute', () => r.setAttribute('data-probe', '1'), () => { r.attributes.delete('data-probe'); delete r.dataset.probe; }],
    ['style setProperty', () => r.style.setProperty('--probe', '1'), () => r.style._props.delete('--probe')],
    ['style direct', () => { r.style.opacity = '0.5'; }, () => { delete r.style.opacity; }],
  ];
  for (const [name, mutate, undo] of probes) {
    const before = snap(r);
    mutate();
    assert.notEqual(snap(r), before, `the serialiser is BLIND to ${name} — every U2 verdict below would be worthless`);
    undo();
  }
});

/**
 * Payloads of the shape each handler actually reads.
 *
 * §548/A1's lesson, which cost that sweep a false positive and cost this one three: a single
 * permissive object is not a payload. `playerState` reads a STRING; `thiefTargets` reads `point`
 * and ignores `pos`; `hideHud` re-reads `engine.debug.hideHud` and never looks at its argument;
 * `treasureBanked` CLEARS a carry and needs one to exist. Each of those looked like a dead handler
 * on the first run and none of them was.
 */
const PRE = {
  thiefTargets: (en) => en.emit('thiefVision', true),
  treasureBanked: (en) => en.emit('treasurePickup', { name: 'Eye of Ra', value: 500 }),
  pointerlock: (en) => en.emit('pointerlock', true),
};
/**
 * A few events carry no information in the payload at all — the handler re-reads engine state.
 * `hideHud` is the whole class: `on('hideHud', () => this._applyVisibility())` never looks at its
 * argument, so the state change has to be part of the ACT and not the setup. Putting it in `PRE`
 * made the baseline snapshot already-hidden and the event a genuine no-op, which this sweep then
 * correctly reported as a dead handler. The handler was fine; the arm was wrong.
 */
const ACT = {
  hideHud: (en) => { en.debug.hideHud = true; en.emit('hideHud', true); },
};
const PAYLOAD = {
  prompt: { key: 'E', text: 'Cane hook' },
  lockOn: { pos: new THREE.Vector3(1, 3, 0), body: {} },
  playerState: 'sneak',
  toast: { text: 'probe toast' },
  coins: 42,
  coin: 3,
  guardPickpocket: { coins: 60, item: 'a temple key' },
  health: { hp: 2, max: 5, charms: 1, down: false, charmProgress: 0.4 },
  treasurePickup: { name: 'Eye of Ra', value: 500 },
  treasureBanked: { name: 'Eye of Ra', value: 500 },
  treasureDropped: { name: 'Eye of Ra', value: 500, pos: new THREE.Vector3(3, 3, 0) },
  thiefVision: true,
  thiefTargets: [{ point: new THREE.Vector3(1, 3, 0), tag: 'hook' }],
  telegraph: { point: new THREE.Vector3(2, 3, 0), kind: 'hook' },
  binocucom: true,
  guardAlert: { id: 'g1', state: 'alert', level: 0, pos: new THREE.Vector3(2, 3, 0) },
  objective: { title: 'Probe objective', sub: 'probe sub' },
  shake: 0.6,
  pointerlock: false,
  hideHud: true,
  inputDevice: 'pad',
};

test('U2: every event the HUD subscribes to changes something on screen', async () => {
  /* The subscription list is read off the BUS, not grepped — a `.on(` the census cannot see is
     exactly the wiring this is meant to find. */
  const subscribed = new Set();
  {
    const en = fakeEngine(camera);
    en.debug = { hideHud: false, paused: false };
    en.input = { lastDevice: 'key', pressed: () => false, releaseLock() {} };
    const realOn = en.on.bind(en);
    en.on = (evt, fn) => { subscribed.add(evt); return realOn(evt, fn); };
    const h = new HUD(en);
    await h.init();
    h.dispose?.();
  }
  assert.ok(subscribed.size >= 20, `only ${subscribed.size} subscriptions found — the census went blind`);

  const missing = [...subscribed].filter((e) => !(e in PAYLOAD));
  assert.deepEqual(missing, [],
    `these subscriptions have no payload in this test, so they are UNMEASURED rather than passing: ${missing.join(', ')}`);

  const still = [];
  for (const evt of [...subscribed].sort()) {
    const { en, h, r } = await boot();
    PRE[evt]?.(en);
    h.update(1 / 60);
    const before = snap(r);
    if (ACT[evt]) ACT[evt](en); else en.emit(evt, PAYLOAD[evt]);
    for (let i = 0; i < 3; i++) h.update(1 / 60);
    if (snap(r) === before) still.push(evt);
    h.dispose?.(); r.remove?.();
  }

  assert.deepEqual(still, [],
    `these handlers ran and changed nothing on screen — the §357.1 shape that a wire census and a `
    + `no-throw arm both pass: ${still.join(', ')}`);
  console.log(`  [U2] ${subscribed.size} subscribed events, all ${subscribed.size} move the screen`);
});

test('U2 control: an idle HUD is still, and a hollow handler reads as still', async () => {
  /* The whole of U2 is a snapshot diff across four frames, so it is only meaningful if a HUD that
     receives NOTHING produces an identical snapshot across those same four frames. If the HUD
     animated on its own, every event would read as "moves" and U2 would pass vacuously. This is
     the idle baseline F3 needed for the same reason.

     Note the first `update()` is excluded on purpose: it legitimately paints (visibility, the coin
     row, the threat chip, the suspicion arc). Snapshotting before it and calling the difference an
     event's doing was this arm's own first bug. */
  const { en, h, r } = await boot();
  h.update(1 / 60);
  const idle = snap(r);
  for (let i = 0; i < 4; i++) h.update(1 / 60);
  assert.equal(snap(r), idle,
    'an idle HUD changed on its own across four frames — every U2 verdict would be noise');

  /* And the diff still discriminates: a handler that runs and draws nothing reads as still.
     `toast` with an empty string returns early at `if (!this._built || !text) return`. */
  en.emit('toast', { text: '' });
  for (let i = 0; i < 3; i++) h.update(1 / 60);
  assert.equal(snap(r), idle,
    'an empty toast drew something — the sweep is reacting to something other than the handler');
});

/* ================================================================== U3 */

test('U3: what a cold player is told, and that he can reach the card at all', async () => {
  const { r } = await boot();
  const cel = r.querySelector('.sly-pause');
  const rows = cel.querySelectorAll('.sly-row').length;

  /* Verbs that can reach the screen DURING PLAY, read off the shipped tables. Parsed as a whole
     block: the entries share source lines, and a per-line regex sees one of five. */
  const affBlock = /const AFF_VERB = \{([\s\S]*?)\};/.exec(HUD_SRC)?.[1] || '';
  const affVerbs = [...affBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const steal = /const STEAL_VERB = '([^']+)'/.exec(HUD_SRC)?.[1];
  const inPlay = [...affVerbs, steal].filter(Boolean);
  assert.equal(affVerbs.length, 5, `AFF_VERB should carry 5 traversal verbs, parsed ${affVerbs.length}`);

  console.log(`  [U3] the control card documents ${rows} rows; ${inPlay.length} verbs can appear in play `
    + `(${inPlay.join(', ')}); ${rows - inPlay.length} rows are card-only`);

  /* This is a RECORD, not a target. It exists so that a change to either number is noticed and
     re-argued rather than absorbed silently — the card is the only place most of the moveset is
     named, and how much of it needs finding is a design fact worth keeping in view. */
  assert.ok(rows >= 20, `the control card collapsed to ${rows} rows`);
  assert.ok(inPlay.length >= 6, `in-play verbs fell to ${inPlay.length}`);

  /* All three routes to the card, DRIVEN. The pad route is the one that was broken (§543): the
     cel advertised Options and Options reached nothing but the debug freeze. */
  {
    const { r: r1, tick } = await boot({ device: 'key' });
    tick();
    window.dispatch('keydown', { code: 'Escape' });
    tick();
    assert.ok(r1.querySelector('.sly-pause').classList.contains('on'), 'Escape does not open the control card');
  }
  {
    const { en, r: r2, tick } = await boot({ device: 'key' });
    tick();
    en.emit('pointerlock', true);
    en.emit('pointerlock', false);
    tick();
    assert.ok(r2.querySelector('.sly-pause').classList.contains('on'),
      'losing pointer lock does not open the control card — the route a playing keyboard user takes');
  }
  {
    const { en, r: r3, held, tick } = await boot({ device: 'pad' });
    tick();
    held.add('pause');
    en.debug.paused = true;          // Debug.js:328 does this before the module loop
    tick(1);
    assert.ok(r3.querySelector('.sly-pause').classList.contains('on'),
      'pad Options does not open the control card — a pad player cannot reach the only place the moveset is written down');
    assert.ok((en.input.released || 0) >= 1, 'pausing on the pad did not release the pointer');
  }
});

test('U3: the five traversal affordances each announce themselves in play, at their own range', async () => {
  /**
   * The other half of §585, which measured the same question from the world and reported the nave
   * rope as *"visible, silent"*. That is exactly right about the TELEGRAPH — `TELEGRAPH_KINDS` is
   * `['hook','rail','ledge']` and has no `pole` — but the telegraph is not the only channel. The
   * HUD runs its own affordance poll over `hook/rail/pole/spire/vent` at `AFF_RANGE`, and the nave
   * rope is registered through `poleProxy` (`EgyptLevel.js:2748`), so it IS announced — by a
   * different channel, at a much shorter range, with a verb instead of a mark.
   *
   * The two channels disagree about which kinds exist, in BOTH directions, and that is the finding:
   *   hook, rail    both marked and named
   *   pole, spire, vent    named by the HUD, never marked
   *   ledge         marked, never named
   */
  const AFF_RANGE = Number(/const AFF_RANGE = ([\d.]+)/.exec(HUD_SRC)?.[1]);
  assert.ok(AFF_RANGE > 0, 'could not read AFF_RANGE out of HUD.js');

  for (const tag of ['hook', 'rail', 'pole', 'spire', 'vent']) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = tag; mesh.position.set(0, 3, 0); mesh.updateMatrixWorld(true);
    const C = new Collision({ warn: () => {}, on: () => () => {}, emit: () => {}, get: () => null });
    C.add({ mesh, tag });
    C.build();

    const near = { position: new THREE.Vector3(0, 3, AFF_RANGE * 0.4), yaw: 0 };
    const { r, tick } = await boot({ get: (k) => (k === 'collision' ? C : k === 'movement' ? near : null) });
    tick(3);
    const text = r.querySelector('.sly-prompt').textContent.trim();
    assert.ok(text.length > 0, `standing ${near.position.z.toFixed(1)} m from a '${tag}' produced no prompt at all`);
    console.log(`  [U3] '${tag}' at ${near.position.z.toFixed(1)} m -> "${text}"`);
  }
});

test('U3: the control card renders pad glyphs to a pad player and keycaps to a keyboard player', async () => {
  const padHtml = await (async () => {
    const { en, r, tick } = await boot({ device: 'pad' });
    en.emit('inputDevice', 'pad');
    tick();
    return r.querySelector('.sly-cols').innerHTML;
  })();
  const keyHtml = await (async () => {
    const { r, tick } = await boot({ device: 'key' });
    tick();
    return r.querySelector('.sly-cols').innerHTML;
  })();
  const count = (s) => (s.match(/assets\/prompts\//g) || []).length;
  assert.ok(count(padHtml) > 15, `a pad player sees only ${count(padHtml)} pad glyphs on the card`);
  assert.equal(count(keyHtml), 0, 'a keyboard player is being shown pad glyphs');
  console.log(`  [U3] card glyphs — pad ${count(padHtml)}, keyboard ${count(keyHtml)}`);
});

/* ================================================================== U4 */

test('U4: every pad button the control card names is a button the game actually binds', () => {
  /* §516 already proves each glyph resolves to a shipped FILE. That is a different claim from the
     card telling the truth: a row naming a button nothing reads would pass a file check and still
     be a lie to the one player it is written for. */
  const SHAPE_INDEX = {
    cross: 0, circle: 1, square: 2, triangle: 3,
    L1: 4, R1: 5, L2: 6, R2: 7, OPT: 9, R3: 11, L3: 10,   /* §682: recentre moved to L3 */
  };
  const bound = new Set(Object.values(PAD_BINDINGS).flat());
  const named = [...HUD_SRC.matchAll(/P\('([A-Za-z0-9]+)'\)/g)].map((m) => m[1]);
  assert.ok(named.length > 15, `only ${named.length} pad columns parsed out of the card`);

  /* `_keysHtml` translates the two stick names before it reaches the glyph table
     (`k.pad === 'stick' ? 'LS' : k.pad === 'stickR' ? 'RS' : k.pad`), so the check has to apply
     the same alias. Asserting against the raw names reported two shipped glyphs as missing art,
     which was this arm's own bug and not the card's. */
  const ALIAS = { stick: 'LS', stickR: 'RS' };
  const glyph = (s) => ALIAS[s] ?? s;
  const unknown = [...new Set(named)].filter((s) => !(glyph(s) in PAD_GLYPH_FILES));
  assert.deepEqual(unknown, [], `the card names glyphs with no shipped art: ${unknown.join(', ')}`);

  const unbound = [...new Set(named)]
    .filter((s) => s in SHAPE_INDEX)
    .filter((s) => !bound.has(SHAPE_INDEX[s]));
  assert.deepEqual(unbound, [],
    `the card promises buttons that reach no action in PAD_BINDINGS: ${unbound.join(', ')}`);

  /* Sticks are axes, not buttons, so they are named here rather than looked up — and named
     explicitly so that a new stick-shaped glyph cannot slip through unchecked. */
  const sticks = [...new Set(named)].filter((s) => !(s in SHAPE_INDEX));
  assert.deepEqual(sticks.sort(), ['stick', 'stickR'],
    `unexpected non-button glyphs on the card: ${sticks.join(', ')}`);

  console.log(`  [U4] ${new Set(named).size} distinct pad glyphs on the card, `
    + `${[...new Set(named)].filter((s) => s in SHAPE_INDEX).length} buttons — all bound`);
});

test('U4: P and Options are one binding, and the card no longer implies otherwise', () => {
  /* §543 wired `pause` to the cel; that made "P — Freeze the simulation" understated, because P
     and Options are the SAME action and both now open the card. The row was corrected in §549 and
     this pins the reason rather than the wording. */
  assert.deepEqual(PAD_BINDINGS.pause, [9], 'Options is no longer the pad pause button');
  const row = /\{ k: \['P'\][^}]*\}/.exec(HUD_SRC)?.[0] || '';
  assert.ok(/P\('OPT'\)/.test(row),
    'the P row on the control card carries no pad column, but P and Options are one action');
});
