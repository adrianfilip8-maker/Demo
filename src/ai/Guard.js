import * as THREE from 'three';
import { rng } from '../core/Rand.js';
import { buildGuardAssets, instantiate, GROUPS } from './GuardModel.js';
import { GuardAnim } from './GuardAnim.js';
import {
  ROSTER, buildRoutes, Senses, VISION, DETECT, STATE, stateForSuspicion, speedFor,
} from './Patrol.js';

/**
 * Guards — the assembly layer over GuardModel / GuardAnim / Patrol.
 *
 * Nothing in this file models, animates or tunes a guard. `GuardModel.js` owns the meshes,
 * `GuardAnim.js` owns the clips, `Patrol.js` owns the routes and the detection maths. This
 * file walks the ROSTER, wires one of each together, moves them through the level without
 * letting them through a wall, and draws the thing the whole stealth loop is read through:
 * the vision cone.
 *
 * ── How the cone is rendered ─────────────────────────────────────────────────────────────
 * It is **geometry we render ourselves**, not a `lighting.addLocalLight()` spotlight, because
 * LIGHTING's local lights are budgeted point lights — they can spill onto the pavement but
 * they cannot draw a *volume*, and the volume is the readable part. Two pieces, one instanced
 * draw call each for the whole garrison:
 *
 *   1. **The beam.** A cone shell along the guard's sight line, additive, depth-tested but not
 *      depth-writing. The vertex shader reconstructs the world-space cone normal analytically
 *      from the instance matrix (the instance scale is anisotropic, so the baked normal is
 *      wrong), and the fragment shader weights it by `|N·V|`. That single term is what makes
 *      it read as a light rather than as a wireframe gizmo: the surface facing you is bright
 *      and the silhouette feathers to nothing, so front and back shells sum to a soft solid
 *      beam with no hard edge anywhere. On top of that: inverse-square attenuation down its
 *      length, a feathered tip so there is no bright end-cap disc, a fade off the apex so it
 *      doesn't emanate from a point inside his skull, and a slow two-octave shimmer for dust
 *      hanging in the beam.
 *   2. **The pool.** The beam's own footprint, laid flat on the pavement from his feet — a
 *      wedge that widens at exactly the cone's half-angle and starts exactly where the cone's
 *      lower rim meets the floor, so the pool's edges *are* the beam's edges. A beam with no
 *      pool reads as a transparent cone; a beam with one reads as a lamp. A third of the
 *      beam's intensity, and it shortens with the beam when a pillar clips the throw.
 *   3. **The lamp.** Four more vertices in the beam's own geometry, flagged and turned into a
 *      camera-facing card at the apex by the vertex shader. It costs no extra draw call and
 *      it gives POSTFX's bloom a tight coloured source instead of a grey wash (§7.3).
 *
 * Colour is white-yellow while patrolling and goes red as the meter fills; brightness is
 * driven by `Senses.gain`, so the cone visibly *reacts* the instant it starts filling — the
 * suspicion meter is legible in world space with no HUD element (Patrol.js §detection). The
 * whole effect fades out as the sun comes up: a torch beam is a night-time read, and leaving
 * it at full strength would hang additive haze over every golden-hour frame in the game.
 * One `lighting.addLocalLight()` handle — the guard nearest the camera, and only him — spills
 * a little real light onto nearby stone. That is a garnish, not the effect (see `_updateSpill`).
 *
 * ── Draw budget ──────────────────────────────────────────────────────────────────────────
 * 11 guards × (body + metal + ink shell) = 33, plus 1 beam + 1 pool = **35 draw calls** for
 * the entire garrison. Geometry is built once per type and shared; only the `Skeleton` is
 * per-instance, which is all a SkinnedMesh needs to animate independently.
 */

/* ============================== TUNE ====================================== */

const TUNE = {
  seed: 0x9a2d10,

  /* --- bodies --- */
  radius: { temple: 0.42, heavy: 0.56, scarab: 0.26 },
  headTop: { temple: 1.95, heavy: 2.22, scarab: 0.34 },
  chestY: { temple: 1.15, heavy: 1.30, scarab: 0.20 },

  /* --- locomotion --- */
  stepUp: 0.85,            // how high a guard will climb without a stair
  stepDown: 1.05,          // and how far he will drop. Beyond this he refuses to move —
                           // which is precisely what keeps the rooftop patrol on the roof.
  rejoinSnap: 1.6,         // metres off-route before `u` stops advancing and he walks back
  arriveEps: 0.30,
  knockback: 3.4,          // m/s impulse from a cane hit
  knockDamp: 6.5,
  hitsToKo: 3,

  /* --- cone geometry. The first ring is deliberately not zero: a degenerate apex ring makes
         the analytic cone normal undefined and NaN varyings bleed into the first band. --- */
  coneSeg: 26,
  coneRings: [0.02, 0.06, 0.14, 0.27, 0.44, 0.66, 0.85, 1.0],
  coneMinThrow: 0.55,      // never clip the beam below this fraction of its authored length
  conePitch: 0.115,        // radians below horizontal — a guard scans the ground, not the sky
  // The apex sits well clear of his own skull: a cone starting inside the head washes an
  // additive white haze over his chest and kills the very silhouette it should reveal.
  coneEyeFwd: 0.45,
  coneEyeUp: 0.08,

  /* --- cone look --- */
  colPatrol: 0xfff0c2,     // §2.2 sun, pushed pale: a lamp, not a headlight
  colWarn: 0xffb14a,
  colAlert: 0xff3a22,
  /* Calibrated against a night capture: much above this and the additive volume clips to a
     flat wedge of solid colour, which reads as a painted decal instead of light. */
  beamBase: 0.30,          // intensity floor while patrolling
  beamGain: 0.62,          // extra brightness per unit of Senses.gain
  beamAlert: 1.28,         // multiplier once he is actually chasing
  beamFlicker: 0.09,
  glowSize: 0.34,          // radius of the lamp card at the apex, metres at full throw
  beamDayFloor: 0.26,      // how much of the cone survives full daylight
  poolMix: 0.24,           // pool intensity as a fraction of the beam's
  poolRings: [0.03, 0.10, 0.20, 0.34, 0.50, 0.68, 0.85, 1.0],
  poolLat: 14,

  beamLit: 0.85,           // how lit a player standing in another guard's beam counts as

  /* --- local light spill. Only the two guards nearest the camera ever hold a slot. --- */
  lightRadius: 8.5,
  lightIntensity: 4.2,
  lightAhead: 2.2,

  /* --- pickpocket --- */
  pocketBack: 0.34,        // the pouch hangs off the back of his belt
  pocketUp: 0.62,
  pocketRange: 2.4,
  loot: { temple: [45, 90], heavy: [80, 150], scarab: [10, 25] },
};

/** Loot table. Charms are the reason a thief bothers with a scarab sentinel. */
const ITEMS = {
  temple: ['bronze key', 'ration token', 'wine chit', null, null],
  heavy: ['vault key', 'seal ring', 'gold tooth', null],
  scarab: ['lapis chip', 'turquoise bead', null, null],
};

/**
 * Which canonical shot (§7.2) each guard stars in, and how he is posed. Anything not listed
 * keeps patrolling normally.
 *
 * The subject is **placed by probing the level**, not by literal coordinates. The `guard`
 * camera is fixed at (3, 2, 4.2) on a 38° lens, but the geometry in front of it is not mine
 * and has already moved once: the first attempt at hardcoded coordinates put the guard on a
 * terrace 2.8 m above the lens, entirely out of frame, because ARCHITECTURE built up where
 * §8.1 says the courtyard is flat. `_solveShotPose` instead walks out along the lens axis,
 * ground-probes each candidate, checks the camera can actually see it, and keeps the stand
 * that frames him best — so the shot survives whatever the level does next.
 *
 * `x`/`z` are only the fallback for when COLLISION isn't up.
 */
const SHOT_POSE = {
  guard: {
    index: 0, clip: 'look_around', t: 1.15, look: [0.30, -0.05],
    x: -0.70, z: -1.81, yaw: -0.670,
    /* Aim him so the beam rakes across the frame instead of down the barrel: side-on to the
       lens, tipped this far back toward the viewer so we still catch his muzzle and nemes. */
    towardCamera: 0.35, screenSide: -1,
    minDist: 4.5, maxDist: 17,
  },
};

/* ============================ cone shaders ================================ */

const BEAM_VERT = /* glsl */`
attribute float aT;          // 0→1 along the cone; −1 flags the four lamp-glow corners
uniform float uGlow;
varying float vT;
varying vec3 vN;
varying vec3 vV;
varying vec3 vAxis;
varying vec3 vTint;
varying vec2 vQuad;
varying float vSeed;

void main() {
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
  #else
    mat4 im = mat4( 1.0 );
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3( 1.0 );
  #endif

  mat4 m = modelMatrix * im;
  vec3 apex = ( m * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  vec3 axis = normalize( ( m * vec4( 0.0, 0.0, 1.0, 0.0 ) ).xyz );
  vec3 wpos;

  if ( aT < -0.5 ) {

    /* The lamp itself: a camera-facing card at the apex, sized off the throw so a scarab's
       glow is a spark and a temple guard's is a lantern. It rides in the beam's own draw
       call, and it exists to give POSTFX's bloom a tight coloured source to grab — §7.3
       fails a frame whose bloom is a grey wash with nothing bright underneath it. */
    vec3 camR = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
    vec3 camU = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
    float R = uGlow * clamp( length( m[ 2 ].xyz ) / 15.0, 0.35, 1.2 );
    wpos = apex + camR * position.x * R + camU * position.y * R;
    vN = vec3( 0.0, 0.0, 1.0 );
    vQuad = position.xy;

  } else {

    wpos = ( m * vec4( position, 1.0 ) ).xyz;
    vQuad = vec2( 0.0 );

    /* The instance scale is anisotropic (radius, radius, length), so the baked cone normal is
       sheared into nonsense. Rebuild it from the world-space cone instead: the outward normal
       of a cone is the radial direction tilted back along the axis by its own slope. */
    vec3 rel = wpos - apex;
    float along = dot( rel, axis );
    vec3 radial = rel - axis * along;
    float rad = length( radial );
    vec3 rdir = rad > 1e-4 ? radial / rad : vec3( 0.0, 1.0, 0.0 );
    float slope = rad / max( along, 1e-3 );
    vN = normalize( rdir - axis * slope );

  }

  vAxis = axis;
  vV = cameraPosition - wpos;
  vT = aT;
  vSeed = apex.x * 0.71 + apex.z * 1.37;

  gl_Position = projectionMatrix * viewMatrix * vec4( wpos, 1.0 );
}
`;

const BEAM_FRAG = /* glsl */`
uniform float uTime;
uniform float uOpacity;
varying float vT;
varying vec3 vN;
varying vec3 vV;
varying vec3 vAxis;
varying vec3 vTint;
varying vec2 vQuad;
varying float vSeed;

/* No *_pars_fragment includes here: three already injects the tone-mapping and colour-space
   helper blocks into every non-raw ShaderMaterial's fragment prefix. Including them again
   redefines the functions and the program fails to link. */

void main() {
  vec3 V = normalize( vV );

  /* --- the lamp card --- */
  if ( vT < -0.5 ) {
    float d = length( vQuad );
    float ga = pow( max( 0.0, 1.0 - d ), 3.0 ) * 1.7 * uOpacity;
    ga *= smoothstep( 0.4, 1.6, length( vV ) );
    gl_FragColor = vec4( vTint * ga, ga );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  /* The whole illusion. A shell weighted by how squarely it faces the eye is bright through
     the middle and vanishes at its own silhouette; front + back shell sum to a soft volume
     with no visible geometry edge. Weight it the other way and you get a glowing tube. */
  float body = pow( abs( dot( normalize( vN ), V ) ), 1.85 );

  /* Staring down the beam should be blinding, not blank — the shell is edge-on from there. */
  float glare = pow( max( 0.0, dot( -vAxis, V ) ), 6.0 ) * 0.55;

  float t = vT;
  float atten = 1.0 / ( 1.0 + 7.0 * t * t );
  // The throat of the cone stays faint. It overlaps the guard's own head and shoulders, and
  // an additive white wash there erases the silhouette the shot exists to show.
  float near = smoothstep( 0.0, 0.16, t );
  float tip = 1.0 - smoothstep( 0.56, 1.0, t );

  /* Dust in the air. Two incommensurable frequencies so it drifts instead of pulsing. */
  float dust = 0.84 + 0.16 * sin( t * 21.0 - uTime * 1.55 + vSeed )
                          * sin( t * 7.3 + uTime * 0.72 - vSeed * 0.5 );

  /* Never let the camera end up inside a solid wall of additive white. */
  float camFade = smoothstep( 0.4, 2.0, length( vV ) );

  float a = ( body + glare ) * atten * near * tip * dust * camFade * uOpacity;
  a = clamp( a, 0.0, 4.0 );

  gl_FragColor = vec4( vTint * a, a );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const POOL_VERT = /* glsl */`
attribute vec2 aRT;          // x = |lateral| across the wedge, y = distance along it
attribute float aOnset;      // per instance: where the cone's lower rim meets the floor
varying float vR;
varying float vT;
varying float vOnset;
varying vec3 vTint;
varying vec3 vV;
varying float vSeed;

void main() {
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
  #else
    mat4 im = mat4( 1.0 );
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3( 1.0 );
  #endif
  mat4 m = modelMatrix * im;
  vec4 wp4 = m * vec4( position, 1.0 );
  vR = aRT.x;
  vT = aRT.y;
  vOnset = aOnset;
  vV = cameraPosition - wp4.xyz;
  vSeed = ( m * vec4( 0.0, 0.0, 0.0, 1.0 ) ).x * 0.83;
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

const POOL_FRAG = /* glsl */`
uniform float uTime;
uniform float uOpacity;
varying float vR;
varying float vT;
varying float vOnset;
varying vec3 vTint;
varying vec3 vV;
varying float vSeed;

void main() {
  /* Across the wedge: the same soft-edged falloff the beam has, so the pool's edges are the
     beam's edges and the two read as one light rather than as a decal under a cone. */
  float f = 1.0 - vR;
  float a = f * f * ( 0.55 + 0.45 * f );

  /* Along it: nothing until the lower rim of the cone actually reaches the floor, then the
     usual inverse-square falloff and a feathered end. */
  a *= smoothstep( vOnset * 0.55, vOnset * 1.45 + 0.03, vT );
  a *= ( 1.0 - smoothstep( 0.58, 1.0, vT ) ) / ( 1.0 + 3.0 * vT * vT );

  a *= 0.88 + 0.12 * sin( vT * 11.0 - uTime * 1.2 + vSeed );
  a *= smoothstep( 0.5, 2.2, length( vV ) ) * uOpacity;
  gl_FragColor = vec4( vTint * a, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ============================== scratch =================================== */
/* Hoisted so update() allocates nothing (AGENTS.md §5). */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _up = new THREE.Vector3();
const _scan = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _col = new THREE.Color();
const _colA = new THREE.Color();
const _colB = new THREE.Color();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const RAY_OPTS = { ignoreTags: ['hazard', 'water', 'rail', 'hook', 'spire', 'vent'] };

const clamp = THREE.MathUtils.clamp;
const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ========================================================================== */
/*  Guard                                                                      */
/* ========================================================================== */

class Guard {
  constructor(owner, index, entry, asset, materials, route) {
    this.owner = owner;
    this.engine = owner.engine;
    this.index = index;
    this.id = `guard${index}`;
    this.name = `${entry.type}_${entry.route}`;
    this.type = entry.type;
    this.route = route;
    this.speedScale = entry.speed ?? 1;
    this.vision = VISION[entry.type] || VISION.temple;
    this.radius = TUNE.radius[entry.type] ?? 0.42;
    this.rng = rng((TUNE.seed ^ Math.imul(index + 1, 2654435761)) >>> 0);

    const rig = instantiate(asset, materials);
    this.root = rig.root;
    this.mesh = rig.mesh;
    this.bones = rig.bones;
    this.skeleton = rig.skeleton;
    this.root.name = this.id;
    this.headBone = rig.bones.head || rig.bones.headS || rig.bones.hips || rig.bones.body;

    this.anim = new GuardAnim(rig.bones, entry.type, index * 3.17 + 0.61);
    this.senses = new Senses(entry.type, TUNE.seed + index * 977);

    /* --- route state --- */
    this.u = entry.u ?? 0;
    this.dirSign = 1;
    this.dwell = 0;
    this.dwellAction = null;
    this.laps = 0;
    this._advOut = { u: 0, dir: 1 };
    this._routePoint = new THREE.Vector3();
    this._offRoute = 0;
    this._oneShot = null;
    this._holdLook = null;

    /* --- transform --- */
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.yaw = 0;
    this.speed = 0;
    this.turnRate = 0;
    this.hadGround = false;
    this.knock = new THREE.Vector3();

    /* --- alert state --- */
    this.state = STATE.PATROL;
    this.stateTime = 0;
    this._react = 0;
    this._searchTimer = 0;
    this._lostTimer = 0;
    this._stunTimer = 0;
    this._attackCd = 0;
    this.hits = 0;

    /* --- pickpocket --- */
    this.pocketPosition = new THREE.Vector3();
    this.looted = false;
    const [lo, hi] = TUNE.loot[entry.type] || TUNE.loot.temple;
    const pool = ITEMS[entry.type] || ITEMS.temple;
    this._loot = { coins: Math.round(this.rng.range(lo, hi)), item: this.rng.pick(pool) };

    /* --- cone render state (smoothed, so nothing snaps) --- */
    this.reach = this.vision.coneLength;
    this.beam = TUNE.beamBase;

    /* Reused so a state change costs no allocation. */
    this._alertPayload = { guard: this, id: this.id, name: this.name, type: this.type,
      state: this.state, level: 0, suspicion: 0, pos: this.position };

    this._place(this.route.at(this.u, _v1));
    const tan = this.route.tangent(this.u, this.dirSign, _v2);
    this.yaw = Math.atan2(tan.x, tan.z);
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.root.position.copy(this.position);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.updateMatrixWorld(true);
    this.anim.play('idle', { fade: 0 });
  }

  /* --------------------------------------------------------------------- */
  /*  public API (AGENTS.md §4 — MOVEMENT calls these)                       */
  /* --------------------------------------------------------------------- */

  /** Alerted guards clutch their purse. Pickpocketing is a patrol-state move. */
  get canBePickpocketed() {
    if (this.looted) return false;
    if (this.state === STATE.KO) return false;
    return this.state === STATE.PATROL || this.state === STATE.STUNNED;
  }

  get alerted() {
    return this.state === STATE.SUSPICIOUS || this.state === STATE.SEARCHING ||
           this.state === STATE.CHASE || this.state === STATE.LOST;
  }

  /** @returns {{coins:number, item:string|null}|null} */
  pickpocket() {
    if (!this.canBePickpocketed) return null;
    this.looted = true;
    // He half-notices — funnier than not noticing, and it teaches the player the tell.
    this.senses.suspicion = Math.max(this.senses.suspicion, DETECT.pickpocketSuspicion);
    this._playOneShot('pickpocketed_reaction');
    try { this.engine.emit('guardPickpocket', { guard: this, id: this.id, pos: this.position, ...this._loot }); }
    catch { /* an event handler must never cost a guard his loot */ }
    return this._loot;
  }

  /** Sly landed on his head. @returns {boolean} true if it actually put him down. */
  bounce() {
    if (this.state === STATE.KO) return false;
    // The Heavy's helmet is a landing pad you bounce *off*, not on: free height, no stun,
    // and now he knows exactly where you are.
    if (this.type === 'heavy') {
      this.senses.suspicion = DETECT.ceiling;
      this.senses.lastSeen.copy(this.owner.playerPos);
      this.senses.lastSeenValid = true;
      this._setState(STATE.CHASE);
      return false;
    }
    this.hits = TUNE.hitsToKo;
    this._stunTimer = DETECT.koTime;
    this.senses.reset();
    this._setState(STATE.KO);
    return true;
  }

  /** Cane hit. `dir` is the horizontal knock direction, `force` roughly 0..3. */
  hit(dir, force = 1) {
    if (this.state === STATE.KO) return false;
    if (dir) {
      _v1.copy(dir); _v1.y = 0;
      if (_v1.lengthSq() > 1e-6) {
        this.knock.addScaledVector(_v1.normalize(), TUNE.knockback * clamp(force, 0.15, 3));
      }
    }
    this.hits++;
    if (this.hits >= TUNE.hitsToKo) {
      this._stunTimer = DETECT.koTime;
      this.senses.reset();
      this._setState(STATE.KO);
    } else {
      this._stunTimer = DETECT.stunTime;
      this._setState(STATE.STUNNED);
    }
    return true;
  }

  /* --------------------------------------------------------------------- */
  /*  frame                                                                 */
  /* --------------------------------------------------------------------- */

  update(dt, sense) {
    this.stateTime += dt;
    if (this._attackCd > 0) this._attackCd -= dt;

    /* --- senses. The LOS raycast lives in Patrol.Senses; it is handed the COLLISION
           module and guards it internally, so pillars genuinely hide the player. --- */
    sense.eye = this._eyePosition(_eye);
    sense.forward = this.forward;
    sense.alerted = this.alerted;
    if (this.state === STATE.KO || this.state === STATE.STUNNED) {
      this.senses.gain = 0;
      this.senses.timeSinceSeen += dt;
    } else {
      this.senses.evaluate(sense);
    }

    this._updateState(dt);
    this._locomote(dt);
    this._look(dt);

    this.anim.setLocomotion(this.speed, this.turnRate, 0);
    this.anim.update(dt);

    this.root.position.copy(this.position);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.scale.copy(this.anim.rootScale);
    // The cone reads off the head bone, so the bone matrices must be current *now* rather
    // than at render time — otherwise the beam lags the head by a frame and swims.
    this.root.updateMatrixWorld(true);
  }

  /* --- state machine: patrol → suspicious → searching → chase → lost → patrol --- */

  _updateState(dt) {
    if (this.state === STATE.KO || this.state === STATE.STUNNED) {
      this._stunTimer -= dt;
      if (this._stunTimer <= 0) {
        this.hits = 0;
        this.senses.reset();
        this._setState(STATE.PATROL);
      }
      return;
    }

    const s = this.senses.suspicion;
    const want = stateForSuspicion(s);

    switch (this.state) {
      case STATE.PATROL:
      case STATE.SUSPICIOUS:
      case STATE.SEARCHING: {
        if (this.state === STATE.SEARCHING) {
          this._searchTimer += dt;
          // A search that never ends is a guard that never gives the player the loop back.
          if (this._searchTimer > DETECT.searchTime) { this.senses.suspicion = 0; this._setState(STATE.PATROL); break; }
        }
        if (want === STATE.CHASE) {
          // He is slow on the draw. This window is the whole point of the reaction delay.
          this._react += dt;
          if (this._react >= DETECT.reactDelay) this._setState(STATE.CHASE);
        } else {
          this._react = 0;
          if (want !== this.state) this._setState(want);
        }
        break;
      }
      case STATE.CHASE: {
        if (this.senses.timeSinceSeen > DETECT.loseSight) this._setState(STATE.LOST);
        break;
      }
      case STATE.LOST: {
        this._lostTimer -= dt;
        if (this.senses.sawThisFrame && s >= DETECT.chase) { this._setState(STATE.CHASE); break; }
        if (this._lostTimer <= 0) {
          // Whatever the meter has drained to by now decides where he lands. It is almost
          // always `searching`, which walks him back along the route looking over his shoulder.
          this._setState(want === STATE.CHASE ? STATE.SEARCHING : want);
        }
        break;
      }
      default: this._setState(STATE.PATROL);
    }
  }

  _setState(next) {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.stateTime = 0;
    this._react = 0;
    this._oneShot = null;
    if (next === STATE.SEARCHING) this._searchTimer = 0;
    if (next === STATE.LOST) this._lostTimer = DETECT.lostLook;
    if (next === STATE.PATROL) {
      this.dwell = 0;
      this.dwellAction = null;
      // Rejoin the beat where he is standing, not where he abandoned it. Without this a
      // guard who chased 40 m down the hall walks all the way back to a stale `u` first,
      // which reads as a bug even though it is technically "returning to post".
      this._reanchor();
    }

    // The pop when he actually spots you: anticipate-and-squat, then run.
    if (next === STATE.CHASE) this._playOneShot('alert');
    else if (next === STATE.SUSPICIOUS && prev === STATE.PATROL) this._playOneShot('suspicious');

    const p = this._alertPayload;
    p.state = next;
    p.prev = prev;
    p.suspicion = this.senses.suspicion;
    p.level = clamp(this.senses.suspicion / DETECT.chase, 0, 1);
    try { this.engine.emit('guardAlert', p); } catch { /* never let a listener stop a guard */ }
  }

  /* --- locomotion ------------------------------------------------------- */

  _locomote(dt) {
    const target = this.owner.playerPos;
    const maxSpeed = speedFor(this.state, this.type) * this.speedScale;
    let wantYaw = this.yaw;
    let moved = false;
    let onRoute = false;

    switch (this.state) {
      case STATE.KO:
      case STATE.STUNNED:
        this.speed = 0;
        break;

      case STATE.SUSPICIOUS: {
        // Planted, squinting at whatever moved. Zero speed comes out of speedFor().
        this.speed = 0;
        if (this.senses.lastSeenValid) wantYaw = this._yawToward(this.senses.lastSeen);
        break;
      }

      case STATE.CHASE: {
        const aim = this.senses.sawThisFrame ? target
          : (this.senses.lastSeenValid ? this.senses.lastSeen : null);
        if (aim) {
          wantYaw = this._yawToward(aim);
          _v1.subVectors(aim, this.position); _v1.y = 0;
          const d = _v1.length();
          if (d <= DETECT.attackRange) {
            this.speed = 0;
            if (this._attackCd <= 0) { this._attackCd = DETECT.attackCooldown; this._playOneShot('attack'); }
          } else {
            moved = this._step(dt, aim.x, aim.z, maxSpeed);
          }
        }
        break;
      }

      case STATE.LOST: {
        if (this.senses.lastSeenValid) {
          _v1.subVectors(this.senses.lastSeen, this.position); _v1.y = 0;
          if (_v1.lengthSq() > 1.4 * 1.4) {
            wantYaw = this._yawToward(this.senses.lastSeen);
            moved = this._step(dt, this.senses.lastSeen.x, this.senses.lastSeen.z, maxSpeed);
          } else {
            // Standing on the spot he last saw you, sweeping. Give him a slow scan.
            this.speed = 0;
            wantYaw = this.yaw + Math.sin(this.stateTime * 1.35 + this.senses.phase) * 0.9 * dt * 4;
          }
        }
        break;
      }

      default: {
        // PATROL and SEARCHING both walk the route; SEARCHING just skips the dwell stops
        // and moves at alert speed, which reads as "retracing his beat, annoyed".
        onRoute = true;
        moved = this._followRoute(dt, maxSpeed, this.state === STATE.PATROL);
        if (moved || this.speed > 0.02) {
          this.route.tangent(this.u, this.dirSign, _v2);
          wantYaw = Math.atan2(_v2.x, _v2.z);
        }
        break;
      }
    }

    /* Steer toward the route point rather than along its tangent whenever he is off it —
       that is what walks him home after a chase, with no "return to post" code at all. */
    if (onRoute && moved && this._offRoute > TUNE.arriveEps) {
      _v1.subVectors(this._routePoint, this.position); _v1.y = 0;
      if (_v1.lengthSq() > 1e-6) wantYaw = Math.atan2(_v1.x, _v1.z);
    }

    /* --- knockback decays into the position; it is not a velocity the AI reasons about --- */
    if (this.knock.lengthSq() > 1e-5) {
      this._step(dt, this.position.x + this.knock.x * dt, this.position.z + this.knock.z * dt,
        this.knock.length() + 0.01);
      this.knock.multiplyScalar(Math.max(0, 1 - TUNE.knockDamp * dt));
    }

    /* --- turn --- */
    const rate = this.alerted ? DETECT.turnRateAlert : DETECT.turnRate;
    const delta = shortAngle(wantYaw - this.yaw);
    const step = clamp(delta, -rate * dt, rate * dt);
    this.turnRate = dt > 0 ? step / dt : 0;
    this.yaw += step;
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    this._chooseClip();
  }

  /**
   * Walk the spline. `u` only advances while he is actually near the route, so a guard held
   * up by a wall (or returning from a chase) never has the route run away from underneath him.
   */
  _followRoute(dt, maxSpeed, honourDwell) {
    if (this.dwell > 0 && honourDwell) {
      this.dwell -= dt;
      this.speed = 0;
      this._routePoint.copy(this.route.at(this.u, _v3));
      this._offRoute = 0;
      return false;
    }

    const stop = honourDwell ? this.route.nextStop(this.u, this.dirSign) : null;
    const prevU = this.u;
    if (this._offRoute < TUNE.rejoinSnap) {
      this.route.advance(this.u, this.dirSign, maxSpeed * dt, this._advOut);
      this.u = this._advOut.u;
      this.dirSign = this._advOut.dir;
      if (this.route.closed && this.u < prevU - 0.5) this.laps++;
    }

    if (stop) {
      // Did we step over a dwell stop this frame? Land exactly on it and stand there.
      let gap = this.dirSign > 0 ? stop.u - prevU : prevU - stop.u;
      let crossed = this.dirSign > 0 ? this.u - prevU : prevU - this.u;
      if (this.route.closed) {
        gap = ((gap % 1) + 1) % 1;
        crossed = ((crossed % 1) + 1) % 1;
      }
      if (crossed >= gap && gap >= 0) {
        this.u = stop.u;
        this.dwell = stop.dwell;
        this.dwellAction = stop.action;
      }
    }

    this._routePoint.copy(this.route.at(this.u, _v3));
    return this._step(dt, this._routePoint.x, this._routePoint.z, maxSpeed);
  }

  /**
   * Move toward (x, z), refusing anything that would put him through a wall or off a ledge.
   * Two forward rays (shin + chest) stop him at geometry; a downward probe decides whether
   * the destination has a floor at all. If it does not, he simply does not go — which is how
   * the rooftop patrol stays on the rooftop without a single hand-placed invisible fence.
   */
  _step(dt, x, z, maxSpeed) {
    const col = this.owner.collision;
    _v1.set(x - this.position.x, 0, z - this.position.z);
    const dist = _v1.length();
    this._offRoute = dist;
    if (dist < 1e-4 || maxSpeed <= 0 || dt <= 0) { this.speed = 0; return false; }
    _v1.divideScalar(dist);

    let allowed = Math.min(dist, maxSpeed * dt);

    if (col?.raycast) {
      const probe = allowed + this.radius;
      for (let i = 0; i < 2; i++) {
        _v2.copy(this.position);
        _v2.y += i === 0 ? this.radius * 0.9 : (TUNE.chestY[this.type] ?? 1.15);
        let hit = null;
        try { hit = col.raycast(_v2, _v1, probe, RAY_OPTS); } catch { hit = null; }
        if (hit?.hit) allowed = Math.min(allowed, Math.max(0, hit.distance - this.radius));
      }
    }

    if (allowed <= 1e-5) { this.speed = 0; return false; }

    const nx = this.position.x + _v1.x * allowed;
    const nz = this.position.z + _v1.z * allowed;

    let y = this.position.y;
    let ok = true;
    if (col?.groundCheck) {
      _v2.set(nx, this.position.y + TUNE.stepUp, nz);
      let g = null;
      try { g = col.groundCheck(_v2, this.radius * 0.7, TUNE.stepUp + TUNE.stepDown); } catch { g = null; }
      if (g?.hit && Number.isFinite(g.y)) { y = g.y; this.hadGround = true; }
      else if (this.hadGround) ok = false;              // a cliff. Refuse.
      else y = this.route.baseY ?? this.position.y;     // COLLISION doesn't cover this space
    } else {
      y = this.route.baseY ?? this.position.y;
    }

    if (!ok) { this.speed = 0; return false; }

    this.position.set(nx, y, nz);
    this.speed = allowed / dt;
    return true;
  }

  /** Snap `u` to the closest point on the route. Runs once per stand-down, never per frame. */
  _reanchor() {
    const N = 192;
    let bestU = this.u, bestD = Infinity;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      this.route.at(u, _scan);
      const dx = _scan.x - this.position.x, dz = _scan.z - this.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bestU = u; }
    }
    this.u = bestU;
    this._offRoute = Math.sqrt(bestD);
    this._routePoint.copy(this.route.at(bestU, _scan));
  }

  _place(p) {
    this.position.copy(p);
    const col = this.owner.collision;
    if (col?.groundCheck) {
      _v2.set(p.x, p.y + 2.0, p.z);
      let g = null;
      try { g = col.groundCheck(_v2, this.radius * 0.7, 5.0); } catch { g = null; }
      if (g?.hit && Number.isFinite(g.y)) { this.position.y = g.y; this.hadGround = true; return; }
    }
    if (this.route.baseY !== null && this.route.baseY !== undefined) this.position.y = this.route.baseY;
  }

  _yawToward(p) {
    _v1.subVectors(p, this.position); _v1.y = 0;
    if (_v1.lengthSq() < 1e-8) return this.yaw;
    return Math.atan2(_v1.x, _v1.z);
  }

  /* --- head aim --------------------------------------------------------- */

  _look(dt) {
    let want = null;
    if (this.state === STATE.CHASE && this.senses.sawThisFrame) want = this.owner.playerPos;
    else if (this.senses.lastSeenValid && this.alerted) want = this.senses.lastSeen;

    if (!want) { this.anim.setLook(0, 0, 0); return; }

    _v1.subVectors(want, this.position);
    const flat = Math.hypot(_v1.x, _v1.z);
    const world = Math.atan2(_v1.x, _v1.z);
    const local = shortAngle(world - this.yaw);
    const pitch = Math.atan2(_v1.y + 0.9 - this.vision.eyeHeight, Math.max(0.4, flat));
    this.anim.setLook(local, pitch, 1);
  }

  /* --- clip selection --------------------------------------------------- */

  _playOneShot(name) {
    this._oneShot = name;
    this.anim.play(name, { fade: 0.10, loop: false, restart: true });
  }

  _chooseClip() {
    if (this._oneShot) {
      if (!this.anim.finished) return;
      this._oneShot = null;
    }

    let clip = 'idle';
    let speed = 1;

    switch (this.state) {
      case STATE.KO: clip = 'ko'; break;
      case STATE.STUNNED: clip = 'stunned'; break;
      case STATE.SUSPICIOUS: clip = 'suspicious'; break;
      case STATE.CHASE:
        clip = this.speed > 0.15 ? 'run_chase' : 'alert';
        speed = this.speed > 0.15 ? clamp(this.speed / DETECT.chaseSpeed, 0.55, 1.6) : 1;
        break;
      case STATE.LOST:
      case STATE.SEARCHING:
        if (this.speed > 0.12) {
          clip = 'walk_alert';
          speed = clamp(this.speed / DETECT.alertSpeed, 0.5, 1.5);
        } else clip = 'look_around';
        break;
      default:
        if (this.speed > 0.10) {
          clip = 'walk_patrol';
          speed = clamp(this.speed / DETECT.patrolSpeed, 0.45, 1.6);
        } else if (this.dwellAction === 'look') clip = 'look_around';
        else if (this.dwellAction === 'bored') clip = 'idle_bored';
        else clip = 'idle';
        break;
    }

    if (this.anim.current !== clip) this.anim.play(clip, { fade: 0.18, speed });
    else this.anim.speed = speed;
  }

  /* --- world queries used by the owner ---------------------------------- */

  /** Eye position, taken off the live head bone so the beam bobs with his walk. */
  _eyePosition(out) {
    if (this.headBone) {
      out.setFromMatrixPosition(this.headBone.matrixWorld);
      out.addScaledVector(this.forward, TUNE.coneEyeFwd);
      out.y += TUNE.coneEyeUp;
      if (Number.isFinite(out.x)) return out;
    }
    return out.copy(this.position).setY(this.position.y + this.vision.eyeHeight);
  }

  /** Pouch on the back of his belt — the thing Sly's hand actually reaches for. */
  _updatePocket() {
    this.pocketPosition.copy(this.position)
      .addScaledVector(this.forward, -TUNE.pocketBack);
    this.pocketPosition.y += TUNE.pocketUp * (this.type === 'scarab' ? 0.4 : 1);
  }

  get headY() { return this.position.y + (TUNE.headTop[this.type] ?? 1.95); }

  dispose() {
    this.root.removeFromParent();
  }
}

/* ========================================================================== */
/*  Guards                                                                     */
/* ========================================================================== */

export class Guards {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'guards';

    this.guards = [];
    this.routes = null;
    this.collision = null;
    this.playerPos = new THREE.Vector3(0, 0, 30);
    this._sawCount = 0;

    this._assets = null;
    this._materials = [];
    this._geoms = [];
    this._lights = [];
    this._offs = [];
    this._hazards = [];
    this._shot = null;
    this._shotLock = null;
    this._light = 0.3;
    this.stats = { draws: 0, tris: 0 };

    /* One sense-parameter bag, mutated in place — Senses.evaluate reads it and keeps nothing. */
    this._sense = {
      eye: null, forward: null, target: this.playerPos, targetTop: 0.95,
      collision: null, moving: 0, sneaking: false, crouching: false, airborne: false,
      light: 0.3, alerted: false, dt: 1 / 60,
    };
  }

  /* ---------------------------------------------------------------- init --- */

  async init() {
    this.engine.scene.add(this.group);

    let assets = null;
    try { assets = buildGuardAssets(); }
    catch (err) {
      this.engine.warn(`guards: buildGuardAssets() failed — ${err?.message || err}`);
      return;
    }
    this._assets = assets;
    for (const k in assets) {
      this._geoms.push(assets[k].geometry);
      this.stats.tris += assets[k].tris | 0;
      if (assets[k].missing?.size) {
        this.engine.warn(`guards: ${k} rig references unknown bones: ${[...assets[k].missing].join(', ')}`);
      }
    }

    const materials = this._buildMaterials();
    this.routes = buildRoutes(TUNE.seed);
    this.collision = this.engine.get('collision');

    for (let i = 0; i < ROSTER.length; i++) {
      const entry = ROSTER[i];
      const asset = assets[entry.type];
      const route = this.routes[entry.route];
      if (!asset || !route) {
        this.engine.warn(`guards: roster #${i} wants type "${entry.type}" route "${entry.route}" — skipping`);
        continue;
      }
      let g = null;
      try { g = new Guard(this, i, entry, asset, materials, route); }
      catch (err) {
        this.engine.warn(`guards: failed to build roster #${i} — ${err?.message || err}`);
        continue;
      }
      this.group.add(g.root);
      this.guards.push(g);
      this.stats.draws += GROUPS.length;
    }

    this._applyOutlines();
    this._buildCones();
    this._registerHazards();
    this._registerLights();
    this._hookEvents();
  }

  /**
   * Two materials for the entire garrison: `body` and `metal`, one per GROUPS entry. Every
   * other colour a guard wears — linen, lapis, carnelian, eye whites, ink pupils — rides on
   * the vertex-colour channel, which is what keeps 11 characters inside the draw budget.
   */
  _buildMaterials() {
    const cloth = this._tex('linen_cloth');
    const bronze = this._tex('bronze_aged');

    const body = this._mat({
      name: 'guard_body',
      color: 0xffffff,
      map: cloth.map, normalMap: cloth.normalMap, roughnessMap: cloth.roughnessMap,
      repeat: 2.0,
      // A guard is fur, linen and leather at once; the strand detail layer reads as all three
      // and, being triplanar, it never shows the UV seam where a loft closes.
      detail: 'fur', detailStrength: 0.62, detailGrain: 0.34,
      bands: 3, rim: 0.72, rimColor: 0x7fd4ff,
      spec: 0.10, gloss: 16, rough: 0.84, sss: 0.34,
      fallbackColor: 0xb08050, fallbackRough: 0.85, fallbackMetal: 0,
    });

    const metal = this._mat({
      name: 'guard_metal',
      color: 0xffffff,
      normalMap: bronze.normalMap, roughnessMap: bronze.roughnessMap,
      repeat: 2.4,
      detail: 'metal', detailStrength: 0.38, detailGrain: 0.16,
      // §7.3: gold that doesn't read as metal is an auto-fail. Hard spec, tight highlight.
      bands: 3, rim: 0.85, rimColor: 0xffd9a0,
      spec: 0.95, gloss: 110, rough: 0.32, metal: 0.85, sss: 0,
      fallbackColor: 0xc9a24a, fallbackRough: 0.3, fallbackMetal: 0.9,
    });

    return [body, metal];
  }

  /** §4.4: textures.get() hands back a *bundle*, not a texture. Unwrap every slot. */
  _tex(name) {
    let set = null;
    try { set = this.engine.get('textures')?.get?.(name) ?? null; } catch { set = null; }
    const pick = (slot) => (set && set[slot]?.isTexture ? set[slot] : null);
    return { map: pick('map'), normalMap: pick('normalMap'), roughnessMap: pick('roughnessMap') };
  }

  _mat(spec) {
    const shading = this.engine.get('shading');
    let m = null;
    if (shading?.toon) {
      try {
        m = shading.toon({
          name: spec.name,
          color: spec.color,
          map: spec.map, normalMap: spec.normalMap, roughnessMap: spec.roughnessMap,
          bands: spec.bands, rim: spec.rim, rimColor: spec.rimColor,
          spec: spec.spec, gloss: spec.gloss, rough: spec.rough, metal: spec.metal ?? 0,
          sss: spec.sss, detail: spec.detail,
          detailStrength: spec.detailStrength, detailGrain: spec.detailGrain,
          outline: 1.0, vertexColors: true, side: THREE.FrontSide,
        });
      } catch (err) {
        this.engine.warn(`guards: shading.toon failed for "${spec.name}" — ${err?.message || err}`);
        m = null;
      }
    }
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        name: spec.name,
        color: spec.fallbackColor,
        map: spec.map ?? null,
        normalMap: spec.normalMap ?? null,
        roughnessMap: spec.roughnessMap ?? null,
        roughness: spec.fallbackRough, metalness: spec.fallbackMetal,
        vertexColors: true,
      });
      this._materials.push(m);
    }
    this._repeat(m, spec.repeat);
    return m;
  }

  /** Materials are cached by option hash, so a per-material repeat needs its own clone. */
  _repeat(m, r) {
    if (!r || r === 1) return;
    for (const slot of ['map', 'normalMap', 'roughnessMap']) {
      const t = m[slot];
      if (!t?.isTexture) continue;
      if (!t.__guardClone) {
        const c = t.clone();
        c.__guardClone = true;
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        c.needsUpdate = true;
        m[slot] = c;
        this._geoms.push(c);   // disposed alongside the geometry pool
      }
      m[slot].repeat.set(r, r);
    }
  }

  _applyOutlines() {
    const shading = this.engine.get('shading');
    if (!shading?.outline) return;
    for (const g of this.guards) {
      try {
        const shell = shading.outline(g.mesh, { thickness: g.type === 'scarab' ? 0.7 : 1.05 });
        if (shell) this.stats.draws++;
      } catch (err) {
        this.engine.warn(`guards: outline failed on ${g.id} — ${err?.message || err}`);
        break;
      }
    }
  }

  /* --------------------------------------------------------------- cones --- */

  _buildCones() {
    if (!this.guards.length) return;
    const n = this.guards.length;

    /* Beam. Unit cone: apex at the origin, radius == z, so the anisotropic instance scale
       (radius, radius, length) sets both the throw and the half-angle. */
    const seg = TUNE.coneSeg;
    const rings = TUNE.coneRings;
    const verts = [];
    const ts = [];
    for (let i = 0; i < rings.length; i++) {
      const z = rings[i];
      for (let j = 0; j <= seg; j++) {
        const a = (j % seg) / seg * Math.PI * 2;
        verts.push(Math.cos(a) * z, Math.sin(a) * z, z);
        ts.push(z);
      }
    }
    const idx = [];
    const row = seg + 1;
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * row + j, b = a + 1, c = a + row + 1, d = a + row;
        idx.push(a, b, c, a, c, d);
      }
    }
    // Four more verts, flagged aT = −1: the vertex shader turns them into a camera-facing
    // card at the apex — the lamp the beam comes out of. Same geometry, same draw call.
    const q0 = verts.length / 3;
    for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      verts.push(qx, qy, 0);
      ts.push(-1);
    }
    idx.push(q0, q0 + 1, q0 + 2, q0, q0 + 2, q0 + 3);

    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    beamGeo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    beamGeo.setIndex(idx);
    beamGeo.computeBoundingSphere();
    this._geoms.push(beamGeo);

    this._beamMat = new THREE.ShaderMaterial({
      name: 'guard_beam',
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uGlow: { value: TUNE.glowSize } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      /* Pre-multiplied, or three blends with (SRC_ALPHA, ONE) and the beam lands on screen
         as colour × alpha² — the shader's own brightness curve squared, which is most of
         why it read as nothing at all against a night frame. */
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      /* Without this three draws every DoubleSide transparent mesh twice — back then front —
         flipping `material.side` and setting `needsUpdate` on both, which rebuilds the
         program every single frame. The GPU rasterises both facings in one pass anyway. */
      forceSinglePass: true,
      toneMapped: true,
      fog: false,
    });
    this._materials.push(this._beamMat);

    this.beamMesh = new THREE.InstancedMesh(beamGeo, this._beamMat, n);
    this.beamMesh.name = 'guard_beams';
    this.beamMesh.frustumCulled = false;
    this.beamMesh.castShadow = false;
    this.beamMesh.receiveShadow = false;
    this.beamMesh.renderOrder = 12;
    this.beamMesh.userData.noShadow = true;
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    /* Pool. Not a disc: the footprint of the beam itself, a flat wedge widening as `x = ±z`
       exactly like the cone, so the pool's edges ARE the cone's edges and the two read as one
       light. The instance matrix scales it (tan(halfAngle)·reach, 1, reach) from the feet. */
    const pRings = TUNE.poolRings;
    const pLat = TUNE.poolLat;
    const pv = [], prt = [], pidx = [];
    for (let i = 0; i < pRings.length; i++) {
      const z = pRings[i];
      for (let j = 0; j <= pLat; j++) {
        const u = (j / pLat) * 2 - 1;
        pv.push(u * z, 0, z);
        prt.push(Math.abs(u), z);
      }
    }
    const prow = pLat + 1;
    for (let i = 0; i < pRings.length - 1; i++) {
      for (let j = 0; j < pLat; j++) {
        const a = i * prow + j, b = a + 1, c = a + prow + 1, d = a + prow;
        pidx.push(a, b, c, a, c, d);
      }
    }
    const poolGeo = new THREE.BufferGeometry();
    poolGeo.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
    poolGeo.setAttribute('aRT', new THREE.Float32BufferAttribute(prt, 2));
    poolGeo.setIndex(pidx);
    poolGeo.computeBoundingSphere();
    // Per-instance onset: an extra InstancedBufferAttribute rides alongside instanceMatrix,
    // so each guard's pool starts exactly where his own beam reaches the floor.
    this._poolOnset = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(0.13), 1);
    this._poolOnset.setUsage(THREE.DynamicDrawUsage);
    poolGeo.setAttribute('aOnset', this._poolOnset);
    this._geoms.push(poolGeo);

    this._poolMat = new THREE.ShaderMaterial({
      name: 'guard_pool',
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      /* Pre-multiplied, or three blends with (SRC_ALPHA, ONE) and the beam lands on screen
         as colour × alpha² — the shader's own brightness curve squared, which is most of
         why it read as nothing at all against a night frame. */
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      /* Without this three draws every DoubleSide transparent mesh twice — back then front —
         flipping `material.side` and setting `needsUpdate` on both, which rebuilds the
         program every single frame. The GPU rasterises both facings in one pass anyway. */
      forceSinglePass: true,
      toneMapped: true,
      fog: false,
    });
    this._materials.push(this._poolMat);

    this.poolMesh = new THREE.InstancedMesh(poolGeo, this._poolMat, n);
    this.poolMesh.name = 'guard_pools';
    this.poolMesh.frustumCulled = false;
    this.poolMesh.castShadow = false;
    this.poolMesh.receiveShadow = false;
    this.poolMesh.renderOrder = 11;
    this.poolMesh.userData.noShadow = true;
    this.poolMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // instanceColor must exist before the first compile or USE_INSTANCING_COLOR never fires.
    _col.setHex(TUNE.colPatrol);
    for (let i = 0; i < n; i++) {
      this.beamMesh.setColorAt(i, _col);
      this.poolMesh.setColorAt(i, _col);
    }
    this._skipOverridePasses(this.beamMesh, this._beamMat);
    this._skipOverridePasses(this.poolMesh, this._poolMat);
    this.group.add(this.beamMesh, this.poolMesh);
    this.stats.draws += 2;
  }

  /**
   * Keep the light out of every `scene.overrideMaterial` pass.
   *
   * POSTFX renders view-space normals by overriding the whole scene's material, and three
   * does the same for shadow maps. A light beam has no business in either: rendered as an
   * opaque normal surface it stamps its silhouette into the normal buffer, and the crease
   * pass then draws an ink line around the cone — which is precisely the "debug overlay"
   * read the whole effect is trying to avoid. Collapsing the draw range to zero when the
   * material being handed to us is not ours skips the draw entirely, with no hook into
   * anybody else's module.
   */
  _skipOverridePasses(mesh, own) {
    mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
      if (material !== own) geometry.setDrawRange(0, 0);
    };
    mesh.onAfterRender = (renderer, scene, camera, geometry) => {
      geometry.setDrawRange(0, Infinity);
    };
  }

  /**
   * §4.4 hazard volumes. COLLISION bakes its BVH once, so a proxy that moves with its guard
   * would leave a ghost behind: the proxies are therefore parked far below the world when the
   * BVH is built (their baked triangles are harmless there, and `hazard` is not a solid tag so
   * nothing sweeps against them) and driven purely through the *volume* path, whose cached
   * inverse we refresh in step with the guard. When a guard is not alerted his proxy goes back
   * under the world, which is what "hazard only while alerted" means here.
   */
  _registerHazards() {
    const mkGeo = () => new THREE.BoxGeometry(0.9, 1.5, 0.9);
    for (const g of this.guards) {
      const geo = mkGeo();
      this._geoms.push(geo);
      const m = new THREE.Mesh(geo, this._invisible());
      m.name = 'guard_hazard';
      m.visible = false;
      m.position.set(0, -900, 0);
      m.updateMatrixWorld(true);
      this.group.add(m);
      const rec = this.engine.registerCollider(m, { tag: 'hazard', material: 'metal' });
      this._hazards.push({ guard: g, mesh: m, rec, live: false });
    }
  }

  _invisible() {
    this._invis ||= new THREE.MeshBasicMaterial({ visible: false });
    return this._invis;
  }

  /** A little real spill so the beam lands on stone instead of hanging in front of it. */
  _registerLights() {
    const lighting = this.engine.get('lighting');
    if (!lighting?.addLocalLight) return;
    for (const g of this.guards) {
      if (g.type === 'scarab') continue;
      try {
        const h = lighting.addLocalLight({
          position: g.position, color: TUNE.colPatrol,
          intensity: TUNE.lightIntensity, radius: TUNE.lightRadius, flicker: 0.12,
        });
        if (h) this._lights.push({ guard: g, handle: h });
      } catch { /* budgeted out; the cone is the effect, this is garnish */ }
    }
  }

  _hookEvents() {
    const on = (evt, fn) => this._offs.push(this.engine.on(evt, fn));

    // MOVEMENT fires this from its Pickpocket state; it does not know about guards.
    on('pickpocket', (p) => {
      if (!p?.pos) return;
      _v1.set(Math.sin(p.yaw ?? 0), 0, Math.cos(p.yaw ?? 0));
      const target = this.nearestPickpocketTarget(p.pos, p.range ?? TUNE.pocketRange, _v1);
      target?.pickpocket();
    });

    // Cane combo. Whoever is in front of the swing takes it.
    on('caneHit', (p) => {
      if (!p?.pos) return;
      const dir = p.dir && p.dir.isVector3 ? p.dir : null;
      for (const g of this.guards) {
        if (g.state === STATE.KO) continue;
        _v1.subVectors(g.position, p.pos); _v1.y = 0;
        if (_v1.lengthSq() > 2.2 * 2.2) continue;
        if (dir && _v1.lengthSq() > 1e-6 && _v1.normalize().dot(dir) < 0.1) continue;
        _v2.subVectors(g.position, p.pos); _v2.y = 0;
        g.hit(_v2, 1 + (p.index ?? 1) * 0.35);
      }
    });

    on('shot', (p) => this._poseForShot(p?.name || null));
  }

  /* -------------------------------------------------------------- public --- */

  /** Every guard, in ROSTER order. */
  get list() { return this.guards; }

  /**
   * The guard whose pocket Sly can reach.
   * @param {THREE.Vector3} pos      Sly's position
   * @param {number} maxDist
   * @param {THREE.Vector3|number} facing  forward vector (or yaw) — targets behind him lose
   * @returns {Guard|null}
   */
  nearestPickpocketTarget(pos, maxDist = TUNE.pocketRange, facing = null) {
    if (!pos) return null;
    let f = null;
    if (typeof facing === 'number') f = _v3.set(Math.sin(facing), 0, Math.cos(facing));
    else if (facing?.isVector3) { f = _v3.copy(facing); f.y = 0; if (f.lengthSq() < 1e-6) f = null; else f.normalize(); }

    let best = null, bestScore = Infinity;
    for (const g of this.guards) {
      if (!g.canBePickpocketed) continue;
      _v1.subVectors(g.pocketPosition, pos);
      const d = _v1.length();
      if (d > maxDist) continue;
      let score = d;
      if (f) {
        _v2.subVectors(g.position, pos); _v2.y = 0;
        if (_v2.lengthSq() > 1e-6) {
          const dot = _v2.normalize().dot(f);
          if (dot < 0.1) continue;                 // he is behind Sly; not a target
          score *= 1.6 - dot * 0.6;
        }
      }
      if (score < bestScore) { bestScore = score; best = g; }
    }
    return best;
  }

  /** Nearest guard of any state — HUD lock-on and FX use this. */
  nearest(pos, maxDist = 12) {
    let best = null, bestD = maxDist * maxDist;
    for (const g of this.guards) {
      const d = g.position.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  /** Highest alert level in the garrison, 0..1. AUDIO reads this for the stealth stinger. */
  get alertLevel() {
    let a = 0;
    for (const g of this.guards) a = Math.max(a, g.senses.suspicion / DETECT.chase);
    return Math.min(1, a);
  }

  /* --------------------------------------------------------------- frame --- */

  update(dt, t) {
    if (!this.guards.length) return;
    if (!this.collision) this.collision = this.engine.get('collision');

    this._readPlayer(dt);

    const s = this._sense;
    s.collision = this.collision && this.collision.ready !== false ? this.collision : null;
    s.dt = dt;
    s.light = this._light;
    s.target = this.playerPos;

    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i];
      if (this._shotLock === g) { this._holdPose(g, dt); continue; }
      // Caught in somebody else's beam? Then you are lit, whatever the hour.
      const otherSees = this._sawCount - (g._sawPrev ? 1 : 0) > 0;
      s.light = otherSees ? Math.max(this._light, TUNE.beamLit) : this._light;
      g.update(dt, s);
      g._updatePocket();
    }

    this._updateCones(dt, t);
    this._updateHazards();
    this._checkBounce();
  }

  /** Pull the player's state through the MOVEMENT contract; degrade to a stub without it. */
  _readPlayer(dt) {
    const mv = this.engine.get('movement');
    const s = this._sense;
    if (mv?.position) {
      this.playerPos.copy(mv.position);
      const max = mv.maxSpeed || 7.2;
      s.moving = clamp((mv.speed ?? 0) / max, 0, 1);
      s.airborne = mv.grounded === false;
      const st = mv.stateName || '';
      s.sneaking = st === 'sneak' || st === 'tiptoe';
      s.crouching = st === 'crouch' || st === 'crawl' || st === 'roll';
    } else {
      s.moving = 0; s.airborne = false; s.sneaking = false; s.crouching = false;
    }

    /* How lit Sly is — the `light` term in DETECT. Time of day is the whole of it; a guard's
       own sight is deliberately NOT fed back into it, because "he can see you, therefore you
       are easier to see" is a loop that silently doubles every tuned fill rate in Patrol.js.
       Standing in *another* guard's beam does light you up, and that is applied per guard
       below from last frame's flags. */
    const tod = this.engine.debug?.timeOfDay ?? 0.78;
    const day = Math.max(0, Math.sin(Math.PI * clamp((tod - 0.04) / 0.92, 0, 1)));
    this._light += (0.10 + day * 0.80 - this._light) * Math.min(1, dt * 4);

    this._sawCount = 0;
    for (const g of this.guards) {
      g._sawPrev = g.senses.sawThisFrame;
      if (g._sawPrev) this._sawCount++;
    }
  }

  /**
   * Cone transforms + colour. One matrix and one colour per guard per frame, into two
   * instanced buffers — the whole garrison's lighting is two draw calls.
   */
  _updateCones(dt, t) {
    if (!this.beamMesh) return;
    this._beamMat.uniforms.uTime.value = t;
    this._poolMat.uniforms.uTime.value = t;

    /* A torch beam is a night-time read. In full sun a visible cone is both physically wrong
       and a wash of additive haze over somebody else's golden-hour frame, so it fades out as
       the sky comes up rather than sitting at full strength through every shot. */
    const day = clamp(1 - (this._light - 0.12) * 1.15, TUNE.beamDayFloor, 1);
    this._beamMat.uniforms.uOpacity.value = day;
    this._poolMat.uniforms.uOpacity.value = day;

    _colA.setHex(TUNE.colPatrol);
    _colB.setHex(TUNE.colAlert);

    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i];
      const cfg = g.vision;
      const down = g.state === STATE.KO;

      /* --- where the beam starts and which way it throws --- */
      g._eyePosition(_eye);
      const pitch = TUNE.conePitch;
      const cp = Math.cos(pitch);
      _dir.set(g.forward.x * cp, -Math.sin(pitch), g.forward.z * cp).normalize();

      /* Clip the throw to the first thing in front of him — a beam that shoots through a pylon
         and out the far side is the fastest way to look like a debug overlay.
         But only so far. `Senses.updateReach` casts a single ray straight down the axis, and
         a 34°-wide cone whose axis happens to clip a doorframe at 2 m is still 90% in open
         air; collapsing the whole volume to a 1.6 m stub made the beam vanish outright in the
         cluttered half of the temple. The floor below keeps it readable and lets the depth
         test do the fine occlusion, which it does per pixel and correctly. */
      const throwFloor = cfg.coneLength * TUNE.coneMinThrow;
      const reach = Math.max(throwFloor, g.senses.updateReach(
        this.collision && this.collision.ready !== false ? this.collision : null, _eye, _dir, dt));
      g.reach = reach;

      /* --- colour + brightness --- */
      const sus = clamp(g.senses.suspicion / DETECT.chase, 0, 1);
      const gain = clamp(g.senses.gain / DETECT.fillBase, 0, 1.6);
      _col.copy(_colA).lerp(_colB, THREE.MathUtils.smoothstep(sus, 0.12, 0.95));
      let bright = TUNE.beamBase + TUNE.beamGain * gain + sus * 0.35;
      if (g.state === STATE.CHASE) bright *= TUNE.beamAlert;
      bright *= 1 + TUNE.beamFlicker * Math.sin(t * 6.3 + g.senses.phase);
      if (down) bright = 0;
      _col.multiplyScalar(bright);

      /* --- beam instance --- */
      const r = Math.tan(cfg.halfAngle) * reach;
      _rgt.crossVectors(WORLD_UP, _dir);
      if (_rgt.lengthSq() < 1e-6) _rgt.set(1, 0, 0);
      _rgt.normalize();
      _up.crossVectors(_dir, _rgt).normalize();
      _mat.makeBasis(_rgt.multiplyScalar(r), _up.multiplyScalar(r), _v1.copy(_dir).multiplyScalar(reach));
      _mat.setPosition(_eye);
      this.beamMesh.setMatrixAt(i, _mat);
      this.beamMesh.setColorAt(i, _col);

      /* --- ground pool: the beam's own footprint, laid flat from his feet --- */
      _v1.copy(g.position);
      _v1.y += 0.035;                      // a hair above the paving, or it z-fights
      _rgt.set(g.forward.z, 0, -g.forward.x);
      _mat.makeBasis(_rgt.multiplyScalar(r), _v2.set(0, 1, 0), _v3.copy(g.forward).multiplyScalar(reach));
      _mat.setPosition(_v1);
      this.poolMesh.setMatrixAt(i, _mat);
      _col.multiplyScalar(TUNE.poolMix);
      this.poolMesh.setColorAt(i, _col);
      /* Where his lower rim meets the floor, as a fraction of the throw. Below that the beam
         is still in the air and there is nothing on the pavement to light. */
      const onset = cfg.eyeHeight / Math.tan(Math.min(1.45, pitch + cfg.halfAngle));
      this._poolOnset.array[i] = clamp(onset / reach, 0.01, 0.9);
    }

    this.beamMesh.instanceMatrix.needsUpdate = true;
    this.poolMesh.instanceMatrix.needsUpdate = true;
    this._poolOnset.needsUpdate = true;
    if (this.beamMesh.instanceColor) this.beamMesh.instanceColor.needsUpdate = true;
    if (this.poolMesh.instanceColor) this.poolMesh.instanceColor.needsUpdate = true;

    this._updateSpill();
  }

  /**
   * Real light spill from the beam.
   *
   * Two reasons this is deliberately tiny. LIGHTING's local pool is **4 slots** at `med` and
   * PROPS already has a dozen braziers competing for them, so nine always-on guard lamps
   * would quietly evict the courtyard's fires — someone else's shot, broken by my module.
   * And SHADING's toon material strips `lights_fragment_*` out of the physical shader, so a
   * point light currently contributes nothing to any toon surface at all; this is here for
   * the non-toon materials in the scene and for the day SHADING puts that block back.
   *
   * So: every guard keeps a handle, exactly one — the closest to the camera — is ever lit.
   * The cone itself is the effect; this is a garnish that must never cost anybody else a slot.
   */
  _updateSpill() {
    if (!this._lights.length) return;
    const cam = this.engine.camera;
    if (cam) cam.getWorldPosition(_v1);

    let a = null, da = Infinity;
    for (const l of this._lights) {
      const d = cam ? l.guard.position.distanceToSquared(_v1) : 0;
      if (d < da) { da = d; a = l; }
    }

    for (const l of this._lights) {
      const g = l.guard;
      const h = l.handle;
      const on = l === a && g.state !== STATE.KO;
      h.enabled = on;
      if (!on) continue;
      h.position.copy(g.position).addScaledVector(g.forward, TUNE.lightAhead);
      h.position.y += g.vision.eyeHeight * 0.55;
      const sus = clamp(g.senses.suspicion / DETECT.chase, 0, 1);
      h.color.setHex(TUNE.colPatrol).lerp(_colB, THREE.MathUtils.smoothstep(sus, 0.12, 0.95));
      h.intensity = TUNE.lightIntensity * (1 + sus * 0.6);
    }
  }

  /** Alerted guards become §4.4 `hazard` volumes; everyone else parks under the world. */
  _updateHazards() {
    for (const h of this._hazards) {
      const g = h.guard;
      const want = g.alerted && g.state !== STATE.KO;
      if (!want) {
        if (h.live) { h.mesh.position.set(0, -900, 0); h.mesh.updateMatrixWorld(true); h.live = false; this._refreshVolume(h); }
        continue;
      }
      h.live = true;
      h.mesh.position.copy(g.position);
      h.mesh.position.y += (TUNE.chestY[g.type] ?? 1.15) * 0.75;
      h.mesh.updateMatrixWorld(true);
      this._refreshVolume(h);
    }
  }

  /** COLLISION caches a volume's inverse world matrix at BVH build time; ours moves. */
  _refreshVolume(h) {
    const rec = h.rec;
    if (!rec?._inv) return;
    try { rec._inv.copy(h.mesh.matrixWorld).invert(); } catch { /* not fatal */ }
  }

  /** Enemy bounce (§6 moveset). Landing on a head is worth a jump and, usually, a KO. */
  _checkBounce() {
    const mv = this.engine.get('movement');
    if (!mv?.position || mv.grounded !== false) return;
    if ((mv.velocity?.y ?? 0) > -1.5) return;
    for (const g of this.guards) {
      if (g.state === STATE.KO) continue;
      const dy = mv.position.y - g.headY;
      if (dy < -0.35 || dy > 1.1) continue;
      _v1.set(mv.position.x - g.position.x, 0, mv.position.z - g.position.z);
      if (_v1.lengthSq() > (g.radius + 0.35) ** 2) continue;
      const stunned = g.bounce();
      try {
        this.engine.emit('enemyBounce', { strength: 0, guard: g, pos: g.position, stunned });
        this.engine.emit('shake', 0.18);
      } catch { /* ignore */ }
      break;
    }
  }

  /* ---------------------------------------------------------------- shots --- */

  /**
   * The `guard` canonical shot has no subject unless somebody stands in it. Park roster #0
   * on his first waypoint, three-quarter to the lens so the nemes, the muzzle and the spear
   * all read, with the beam raking off across the pavement rather than into the barrel.
   */
  _poseForShot(name) {
    this._shot = name;
    this._shotLock = null;
    const spec = name ? SHOT_POSE[name] : null;
    if (!spec) {
      for (const g of this.guards) g.anim.unfreeze();
      return;
    }
    const g = this.guards[spec.index];
    if (!g) return;
    g.senses.reset();
    g.state = STATE.PATROL;
    g.dwell = 99; g.dwellAction = 'look';
    g.u = 0;

    /* If no stand in front of the lens is both walkable and visible, leave him on his beat.
       A guard patrolling where he belongs beats a guard teleported behind a wall. */
    this._solveShotPose(g, spec);
    g.forward.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
    g.speed = 0;
    g.root.position.copy(g.position);
    g.root.rotation.set(0, g.yaw, 0);
    g._holdLook = spec.look || null;
    g.anim.freeze(spec.clip, spec.t);
    g.root.updateMatrixWorld(true);
    g.senses.blockedLength = g.vision.coneLength;
    this._shotLock = g;
  }

  /**
   * Stand the subject somewhere the fixed camera can actually see him.
   *
   * Walks out along the lens axis, ground-probes each candidate, throws away anything the
   * camera has no line of sight to, and scores the rest on how well the guard's silhouette
   * fills the frame — head inside the top edge, feet inside the bottom, body centred. The
   * winner also decides his heading, computed from the live camera basis so the beam always
   * rakes across the frame rather than into the lens.
   *
   * @returns {boolean} true if it found a stand; false to fall back to the authored one.
   */
  _solveShotPose(g, spec) {
    const cam = this.engine.camera;
    const col = this.collision;
    if (!cam || !col?.groundCheck || col.ready === false) return false;

    cam.updateMatrixWorld(true);
    _v1.setFromMatrixPosition(cam.matrixWorld);          // camera position
    cam.getWorldDirection(_dir);                          // camera forward
    _rgt.crossVectors(_dir, WORLD_UP);
    if (_rgt.lengthSq() < 1e-6) _rgt.set(1, 0, 0);
    _rgt.normalize();                                     // camera right, in world

    const halfV = THREE.MathUtils.degToRad((cam.fov ?? 50) * 0.5);
    const height = (TUNE.headTop[g.type] ?? 1.95) + 0.15;
    const side = spec.screenSide ?? -1;

    /* Line of sight is required, not preferred. The alternative — accepting the best framing
       and letting geometry occlude it — teleports the subject somewhere the lens cannot see,
       which is strictly worse than leaving him walking his beat. If this returns false the
       caller leaves him alone. */
    const best = this._shotStand || (this._shotStand = { x: 0, y: 0, z: 0 });
    let found = false;
    for (let pass = 0; pass < 1; pass++) {
      let bestScore = -Infinity;
      for (let d = spec.minDist ?? 4.5; d <= (spec.maxDist ?? 17); d += 0.5) {
        // A third of the way off-centre, on the side the beam is NOT sweeping into.
        const lateral = -side * 0.34 * d * Math.tan(halfV) * (cam.aspect || 1.78);
        _v2.copy(_v1).addScaledVector(_dir, d).addScaledVector(_rgt, lateral);

        _v3.set(_v2.x, _v1.y + 6, _v2.z);
        let gp = null;
        try { gp = col.groundCheck(_v3, 0.4, 26); } catch { gp = null; }
        if (!gp?.hit || !Number.isFinite(gp.y)) continue;

        if (pass === 0) {
          // Can the camera see his chest, or is a terrace in the way?
          _v3.set(_v2.x, gp.y + height * 0.55, _v2.z).sub(_v1);
          const reach = _v3.length();
          let block = null;
          try { block = col.raycast(_v1, _v3, reach, RAY_OPTS); } catch { block = null; }
          if (block?.hit && block.distance < reach - 0.6) continue;
        }

        /* Screen-space fit, −1 (bottom edge) to +1 (top edge) at this depth. */
        const axis = _v1.y + _dir.y * d;                 // where the lens axis sits at depth d
        const half = Math.tan(halfV) * d;
        const feet = (gp.y - axis) / half;
        const head = (gp.y + height - axis) / half;
        if (head > 0.94 || feet < -0.96) continue;

        const fill = head - feet;                         // fraction of frame height he covers
        const centre = Math.abs((head + feet) * 0.5);
        const score = fill * 1.6 - centre * 1.1;
        if (score > bestScore) {
          bestScore = score;
          best.x = _v2.x; best.y = gp.y; best.z = _v2.z;
          found = true;
        }
      }
    }

    if (!found) return false;
    g.position.set(best.x, best.y, best.z);
    g.hadGround = true;

    /* Heading: side-on to the lens so the beam crosses the frame, then tipped `towardCamera`
       back at the viewer so his muzzle and nemes read rather than the back of his head.
       `−camForward` is "toward the lens", so subtracting it is the tip we want. */
    _v3.set(_rgt.x, 0, _rgt.z);
    if (_v3.lengthSq() < 1e-6) return true;
    _v3.normalize().multiplyScalar(side);                  // pure profile, beam to screen-`side`
    const t = clamp(spec.towardCamera ?? 0.35, 0, 0.9);
    _v2.set(_dir.x, 0, _dir.z);
    if (_v2.lengthSq() > 1e-6) _v2.normalize();
    _v3.multiplyScalar(Math.sqrt(Math.max(0, 1 - t * t))).addScaledVector(_v2, -t);
    if (_v3.lengthSq() < 1e-6) return true;
    _v3.normalize();
    g.yaw = Math.atan2(_v3.x, _v3.z);
    return true;
  }

  /**
   * A locked guard still needs his overlays converged and his cone driven. GuardAnim's freeze
   * pins the clip time but keeps running the additive layers, so stepping it with a real dt
   * settles the look-at and the headcloth springs without moving the pose off its key.
   */
  _holdPose(g, dt) {
    if (g._holdLook) g.anim.setLook(g._holdLook[0], g._holdLook[1], 1);
    g.anim.setLocomotion(0, 0, 0);
    g.anim.update(dt);
    g.root.position.copy(g.position);
    g.root.rotation.set(0, g.yaw, 0);
    g.root.scale.copy(g.anim.rootScale);
    g.root.updateMatrixWorld(true);
    g._updatePocket();
    g.senses.gain = 0;
  }

  /* -------------------------------------------------------------- dispose --- */

  dispose() {
    for (const off of this._offs) { try { off(); } catch { /* ignore */ } }
    this._offs.length = 0;
    const lighting = this.engine.get('lighting');
    for (const l of this._lights) { try { lighting?.removeLocalLight?.(l.handle); } catch { /* ignore */ } }
    this._lights.length = 0;
    for (const g of this.guards) g.dispose();
    this.guards.length = 0;
    for (const geo of this._geoms) geo.dispose?.();
    this._geoms.length = 0;
    for (const m of this._materials) m.dispose?.();
    this._materials.length = 0;
    this._invis?.dispose();
    this.beamMesh?.dispose?.();
    this.poolMesh?.dispose?.();
    this.group.removeFromParent();
    this.group.clear();
  }
}

export default Guards;
