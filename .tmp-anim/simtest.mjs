/**
 * Headless sanity run: build SlyModel's skeleton only (no WebGL), drive Animation through
 * every clip and a locomotion sweep, and assert nothing throws / no NaNs reach a bone.
 */
import * as THREE from 'three';
import { SlyModel } from '/home/user/Demo/src/player/SlyModel.js';
import { Animation } from '/home/user/Demo/src/player/Animation.js';

const warnings = [];
const engine = {
  warnings,
  warn: (m) => warnings.push(m),
  _mods: new Map(),
  get(k) { return this._mods.get(k) ?? null; },
  on() { return () => {}; },
  emit() {},
  debug: {},
};

const ch = new SlyModel(engine);
ch._buildSkeleton();
ch.root.updateMatrixWorld(true);
ch._attachPoints = { cane: new THREE.Group() };
ch.bones.handR.add(ch._attachPoints.cane);
ch._attachPoints.cane.rotation.set(Math.PI * 0.5, 0, 0.16);
engine._mods.set('character', ch);

const anim = new Animation(engine);
engine._mods.set('animation', anim);
await anim.init();
console.log('bound:', anim.ready, 'clips:', anim.clipNames().length);

function checkFinite(tag) {
  for (const n of ch.boneNames) {
    const b = ch.bones[n];
    const q = b.quaternion, s = b.scale, p = b.position;
    if (![q.x, q.y, q.z, q.w, s.x, s.y, s.z, p.x, p.y, p.z].every(Number.isFinite)) {
      throw new Error(`NaN on bone ${n} during ${tag}`);
    }
  }
}

/* 1. every clip, frozen at hold, plus a scrub through all 8 filmstrip phases */
const events = [];
anim.onEvent('footstep', (e) => events.push(['footstep', e.foot, e.surface]));
anim.onEvent('cane_hit', (e) => events.push(['cane_hit', e.index]));
anim.onEvent('land', (e) => events.push(['land', e.force]));

for (const name of anim.clipNames()) {
  for (let i = 0; i < 8; i++) {
    anim.freezePose(name, i / 8);
    anim.update(1 / 60, i / 60);
    checkFinite(`freeze ${name}@${i}`);
  }
}
anim.unfreezePose();

/* 2. play every clip live for its duration */
for (const name of anim.clipNames()) {
  anim.play(name, { fade: 0.1, loop: false });
  anim.setLocomotion({ speed: 3, maxSpeed: 7.2, grounded: true, turnRate: 0.4, surface: 'sand' });
  for (let f = 0; f < 60; f++) { anim.update(1 / 60, f / 60); checkFinite(`play ${name}`); }
}

/* 3. locomotion sweep: idle → walk → run → sprint → sneak → crouch, with turns */
let t = 0;
const loco = { speed: 0, maxSpeed: 7.2, grounded: true, sneaking: false, crouching: false, airborne: false, verticalVelocity: 0, turnRate: 0, slope: 0, surface: 'stone' };
anim.play('idle_confident');
for (let f = 0; f < 900; f++) {
  const u = f / 900;
  loco.speed = u < 0.5 ? u * 2 * 7.6 : (1 - (u - 0.5) * 2) * 7.6;
  loco.turnRate = Math.sin(u * 12) * 2.4;
  loco.sneaking = u > 0.72 && u < 0.86;
  loco.crouching = u > 0.86;
  anim.setLocomotion(loco);
  if (u > 0.86) anim.play('crouch_walk');
  else if (u > 0.72) anim.play('sneak_walk');
  else anim.play(loco.speed > 5 ? 'run_fast' : loco.speed > 1 ? 'run' : 'idle_confident');
  anim.setLookAt(u > 0.3 && u < 0.6 ? new THREE.Vector3(3, 2, 4) : null);
  t += 1 / 60;
  anim.update(1 / 60, t);
  checkFinite('sweep');
}

/* 4. impulses + one-shots over the tree */
anim.addImpulse({ bone: 'root', dir: new THREE.Vector3(0, -1, 0), strength: 1, decay: 9 });
anim.addImpulse({ bone: 'chest', dir: new THREE.Vector3(1, 0.2, 0), strength: 0.8, decay: 7 });
for (let f = 0; f < 120; f++) { t += 1 / 60; anim.update(1 / 60, t); checkFinite('impulse'); }

anim.play('cane_combo_1', { loop: false });
for (let f = 0; f < 40; f++) { t += 1 / 60; anim.update(1 / 60, t); }
anim.play('cane_combo_2', { loop: false });
for (let f = 0; f < 40; f++) { t += 1 / 60; anim.update(1 / 60, t); }
anim.play('cane_combo_3', { loop: false });
for (let f = 0; f < 60; f++) { t += 1 / 60; anim.update(1 / 60, t); }
checkFinite('combo');

/* 5. dt = 0 (paused / shot mode) must be safe */
for (let f = 0; f < 5; f++) anim.update(0, t);
checkFinite('dt0');

console.log('events fired:', events.length, JSON.stringify(events.slice(0, 6)));
const kinds = {};
for (const e of events) kinds[e[0]] = (kinds[e[0]] || 0) + 1;
console.log('event kinds:', kinds);
console.log('warnings:', warnings.length ? warnings : 'none');

/* 6. report how far the pose actually travels — a rig that barely moves is the failure mode */
const ranges = {};
anim.unfreezePose();
for (const name of ['walk', 'run', 'idle_confident', 'cane_combo_3', 'hook_swing']) {
  let min = 1e9, max = -1e9;
  const probe = 'handR';
  for (let i = 0; i <= 32; i++) {
    anim.freezePose(name, i / 32);
    anim.update(1 / 60, i / 60);
    ch.root.updateMatrixWorld(true);
    const p = new THREE.Vector3().setFromMatrixPosition(ch.bones[probe].matrixWorld);
    min = Math.min(min, p.y); max = Math.max(max, p.y);
  }
  ranges[name] = +(max - min).toFixed(3);
}
console.log('handR vertical travel per clip (m):', ranges);
console.log('OK');
