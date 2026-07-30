import * as THREE from 'three';

/**
 * GuardAnim — the guards' authored clip set and the little playback engine that runs it.
 *
 * The animation brief is the opposite of Sly's. Sly is quick, light and precise; the garrison
 * is **heavy and late**. Every action here is built out of the same four things:
 *
 *   · **Anticipation** — nobody moves without winding up first. The thrust pulls back for
 *     0.25 s before it goes anywhere; the alert squats before it pops.
 *   · **Overshoot + settle** — the pose always sails past its target and comes back. A guard
 *     who arrives exactly on his key reads as a robot.
 *   · **Squash and stretch** — carried on the root, about the feet, so it reads as weight
 *     rather than as a wobbling mesh. Contact frames squash, airborne frames stretch.
 *   · **One line of action** — hips, spine, chest and head are always rotating as one curve.
 *     Straight-spined poses are what make cheap animation look cheap.
 *
 * Poses are `{ bone: [rx, ry, rz] }` in radians, Euler XYZ, world-axis aligned (bones carry no
 * bind rotation). Conventions, worth memorising before editing anything below:
 *     +rx leans FORWARD · +ry turns LEFT · +rz leans RIGHT
 *     arms/legs swing FORWARD on NEGATIVE rx, knees flex on POSITIVE rx
 * Two extra channels ride alongside the bones:
 *     `pos`   [x, y, z]  hips offset in metres (the walk bob, the KO collapse)
 *     `sq`    [xz, y]    root scale — squash and stretch about the feet
 */

/* ============================== TUNE ====================================== */

export const TUNE = {
  fade: 0.16,             // default cross-fade, seconds
  lookMaxYaw: 1.05,       // head+neck look-at clamp, radians
  lookMaxPitch: 0.46,
  lookRate: 6.5,          // how fast the head chases the look target
  neckShare: 0.38,        // the rest goes to the head — splitting it reads as a real neck

  breathRate: 0.52,
  breathAmp: 0.020,

  /* secondary motion: the tail and the nemes lappets lag the body and overshoot it */
  lagStiffness: 46,
  lagDamping: 8.4,
  lagGain: 0.85,

  walkCycle: 1.34,        // seconds per full patrol stride at 1× speed
  alertCycle: 1.02,
  runCycle: 0.62,
};

/* ============================ humanoid clips ============================== */
/* Times are in seconds and must ascend. `e` picks the interpolation into that key:
   's' = smooth (default), 'l' = linear (snappy), 'p' = punch (fast-out, for impacts). */

const CLIPS = {
  /* Planted, watchful, faintly bored. Weight on his right leg, spear butt on the flagstones.
     Almost nothing moves — which is what makes the walk cycle read as heavy by contrast. */
  idle: {
    loop: true, dur: 4.6,
    keys: [
      { t: 0.0, pose: {
        hips: [0.02, 0.07, 0.035], spine: [0.01, -0.03, -0.025], chest: [-0.02, -0.06, -0.02],
        neck: [-0.04, 0.05, 0.01], head: [-0.03, 0.10, -0.03],
        upperArmL: [-0.06, 0.02, 0.24], lowerArmL: [-0.10, 0.10, 0.14], handL: [0, 0, 0.10],
        upperArmR: [-0.04, -0.02, -0.20], lowerArmR: [-0.26, -0.14, -0.10], handR: [0.05, 0, -0.06],
        upperLegR: [-0.02, -0.05, 0.02], lowerLegR: [0.04, 0, 0],
        upperLegL: [0.05, 0.09, -0.03], lowerLegL: [0.10, 0, 0], footL: [-0.06, 0.05, 0],
        tailA: [0.16, -0.06, 0], tailB: [0.10, 0.10, 0],
        earL: [-0.05, 0, -0.10], earR: [-0.02, 0, 0.06],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 1.7, pose: {
        hips: [0.01, 0.05, 0.030], spine: [0.02, -0.02, -0.020], chest: [-0.01, -0.05, -0.02],
        neck: [-0.03, 0.03, 0.01], head: [-0.05, 0.07, -0.02],
        upperArmL: [-0.04, 0.02, 0.26], lowerArmL: [-0.08, 0.10, 0.15], handL: [0, 0, 0.10],
        upperArmR: [-0.03, -0.02, -0.22], lowerArmR: [-0.24, -0.14, -0.10], handR: [0.05, 0, -0.06],
        upperLegR: [-0.02, -0.05, 0.02], lowerLegR: [0.04, 0, 0],
        upperLegL: [0.05, 0.09, -0.03], lowerLegL: [0.10, 0, 0], footL: [-0.06, 0.05, 0],
        tailA: [0.19, 0.02, 0], tailB: [0.06, -0.06, 0],
        earL: [-0.02, 0, -0.04], earR: [-0.06, 0, 0.12],
        pos: [0, 0.012, 0], sq: [0.995, 1.010],
      } },
      /* the weight shifts across to the other hip — the only real event in the clip */
      { t: 2.9, pose: {
        hips: [0.02, -0.05, -0.030], spine: [0.01, 0.03, 0.022], chest: [-0.02, 0.05, 0.02],
        neck: [-0.04, -0.04, -0.01], head: [-0.02, -0.09, 0.03],
        upperArmL: [-0.05, 0.02, 0.21], lowerArmL: [-0.10, 0.10, 0.13], handL: [0, 0, 0.10],
        upperArmR: [-0.05, -0.02, -0.24], lowerArmR: [-0.28, -0.14, -0.12], handR: [0.05, 0, -0.06],
        upperLegR: [0.05, -0.09, 0.03], lowerLegR: [0.10, 0, 0], footR: [-0.06, -0.05, 0],
        upperLegL: [-0.02, 0.05, -0.02], lowerLegL: [0.04, 0, 0],
        tailA: [0.14, 0.08, 0], tailB: [0.12, -0.10, 0],
        earL: [-0.08, 0, -0.14], earR: [-0.01, 0, 0.03],
        pos: [0, -0.006, 0], sq: [1.006, 0.994],
      } },
      { t: 4.6, pose: {
        hips: [0.02, 0.07, 0.035], spine: [0.01, -0.03, -0.025], chest: [-0.02, -0.06, -0.02],
        neck: [-0.04, 0.05, 0.01], head: [-0.03, 0.10, -0.03],
        upperArmL: [-0.06, 0.02, 0.24], lowerArmL: [-0.10, 0.10, 0.14], handL: [0, 0, 0.10],
        upperArmR: [-0.04, -0.02, -0.20], lowerArmR: [-0.26, -0.14, -0.10], handR: [0.05, 0, -0.06],
        upperLegR: [-0.02, -0.05, 0.02], lowerLegR: [0.04, 0, 0],
        upperLegL: [0.05, 0.09, -0.03], lowerLegL: [0.10, 0, 0], footL: [-0.06, 0.05, 0],
        tailA: [0.16, -0.06, 0], tailB: [0.10, 0.10, 0],
        earL: [-0.05, 0, -0.10], earR: [-0.02, 0, 0.06],
        pos: [0, 0, 0], sq: [1, 1],
      } },
    ],
  },

  /* The comedy clip. A jaw-cracking yawn (anticipate down, stretch tall, settle), a scratch
     behind the ear with the whole arm, then he gives up and leans on the spear. */
  idle_bored: {
    loop: true, dur: 7.6,
    keys: [
      { t: 0.0, pose: {
        hips: [0.03, 0.05, 0.03], spine: [0.02, -0.02, -0.02], chest: [-0.01, -0.04, -0.02],
        neck: [-0.02, 0.04, 0], head: [-0.02, 0.08, -0.02],
        upperArmL: [-0.05, 0, 0.23], lowerArmL: [-0.10, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.21], lowerArmR: [-0.26, -0.12, -0.10],
        upperLegL: [0.04, 0.08, -0.02], lowerLegL: [0.08, 0, 0],
        tailA: [0.16, 0, 0], pos: [0, 0, 0], sq: [1, 1],
      } },
      /* anticipation: he sags before the yawn */
      { t: 0.9, e: 's', pose: {
        hips: [0.10, 0.04, 0.02], spine: [0.09, -0.02, -0.02], chest: [0.10, -0.03, -0.01],
        neck: [0.16, 0.02, 0], head: [0.20, 0.05, -0.01], jaw: [0.06, 0, 0],
        upperArmL: [0.06, 0, 0.18], lowerArmL: [-0.05, 0.06, 0.10],
        upperArmR: [0.06, 0, -0.17], lowerArmR: [-0.20, -0.10, -0.08],
        upperLegL: [0.04, 0.08, -0.02], lowerLegL: [0.14, 0, 0], upperLegR: [0, 0, 0], lowerLegR: [0.12, 0, 0],
        pos: [0, -0.055, 0.01], sq: [1.045, 0.930],
      } },
      /* the yawn: chest up, head back, jaw wide, arms fling out. Stretch on the root. */
      { t: 1.45, e: 'l', pose: {
        hips: [-0.09, 0.02, 0.01], spine: [-0.12, 0, 0], chest: [-0.16, 0.01, 0],
        neck: [-0.30, 0, 0], head: [-0.44, 0.02, 0], jaw: [0.62, 0, 0],
        upperArmL: [-0.55, 0.10, 0.72], lowerArmL: [-0.35, 0.20, 0.55],
        upperArmR: [-0.50, -0.10, -0.62], lowerArmR: [-0.55, -0.22, -0.42],
        earL: [-0.30, 0, -0.26], earR: [-0.30, 0, 0.26],
        upperLegL: [0, 0.04, -0.02], lowerLegL: [0.02, 0, 0], lowerLegR: [0.02, 0, 0],
        pos: [0, 0.075, -0.02], sq: [0.945, 1.075],
      } },
      /* overshoot back down past neutral, then settle */
      { t: 2.15, e: 'p', pose: {
        hips: [0.09, 0.03, 0.02], spine: [0.08, -0.01, -0.01], chest: [0.07, -0.02, -0.01],
        neck: [0.12, 0.02, 0], head: [0.16, 0.04, -0.01], jaw: [0.04, 0, 0],
        upperArmL: [0.10, 0, 0.20], lowerArmL: [-0.12, 0.08, 0.12],
        upperArmR: [0.10, 0, -0.19], lowerArmR: [-0.30, -0.12, -0.10],
        pos: [0, -0.030, 0.01], sq: [1.028, 0.960],
      } },
      { t: 2.8, pose: {
        hips: [0.03, 0.05, 0.03], spine: [0.02, -0.02, -0.02], chest: [-0.01, -0.04, -0.02],
        neck: [-0.02, 0.04, 0], head: [-0.02, 0.08, -0.02],
        upperArmL: [-0.05, 0, 0.23], lowerArmL: [-0.10, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.21], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      /* scratch behind the ear — the free hand comes all the way up and the head tips into it */
      { t: 3.6, e: 's', pose: {
        hips: [0.02, 0.02, 0.05], spine: [0.02, 0.02, -0.05], chest: [0, 0.06, -0.06],
        neck: [0.04, 0.06, -0.10], head: [0.06, 0.14, -0.16],
        upperArmL: [-1.05, 0.30, 0.90], lowerArmL: [-0.60, 0.90, 1.55], handL: [0.2, 0.3, 0.2],
        upperArmR: [-0.04, 0, -0.21], lowerArmR: [-0.26, -0.12, -0.10],
        earL: [0.20, 0, -0.34], earR: [-0.04, 0, 0.06],
        pos: [0, -0.010, 0], sq: [1.01, 0.99],
      } },
      { t: 4.05, e: 'l', pose: {
        upperArmL: [-1.12, 0.36, 0.96], lowerArmL: [-0.52, 0.96, 1.72], handL: [0.3, 0.3, 0.2],
        head: [0.02, 0.18, -0.22], neck: [0.02, 0.08, -0.12], earL: [0.34, 0, -0.44],
        hips: [0.02, 0.02, 0.05], spine: [0.02, 0.02, -0.05], chest: [0, 0.06, -0.06],
        upperArmR: [-0.04, 0, -0.21], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, -0.010, 0], sq: [1.01, 0.99],
      } },
      { t: 4.5, e: 'l', pose: {
        upperArmL: [-1.02, 0.28, 0.86], lowerArmL: [-0.64, 0.86, 1.48], handL: [0.15, 0.3, 0.2],
        head: [0.10, 0.10, -0.12], neck: [0.06, 0.04, -0.08], earL: [0.14, 0, -0.28],
        hips: [0.02, 0.02, 0.05], spine: [0.02, 0.02, -0.05], chest: [0, 0.06, -0.06],
        upperArmR: [-0.04, 0, -0.21], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, -0.010, 0], sq: [1.01, 0.99],
      } },
      /* gives up and leans his whole weight onto the spear */
      { t: 5.4, e: 's', pose: {
        hips: [0.05, -0.06, -0.10], spine: [0.06, 0.04, 0.09], chest: [0.06, 0.08, 0.11],
        neck: [0.05, -0.03, 0.05], head: [0.08, -0.10, 0.08],
        upperArmL: [-0.02, 0, 0.16], lowerArmL: [-0.18, 0.06, 0.10],
        upperArmR: [-0.30, -0.08, -0.42], lowerArmR: [-0.10, -0.30, -0.36], handR: [0.1, 0, -0.2],
        upperLegR: [-0.06, -0.08, 0.05], lowerLegR: [0.03, 0, 0],
        upperLegL: [0.10, 0.12, -0.05], lowerLegL: [0.18, 0, 0], footL: [-0.10, 0.06, 0],
        tailA: [0.12, 0.10, 0], pos: [0.02, -0.030, 0], sq: [1.014, 0.982],
      } },
      { t: 6.6, pose: {
        hips: [0.05, -0.05, -0.09], spine: [0.06, 0.04, 0.08], chest: [0.05, 0.07, 0.10],
        neck: [0.04, -0.02, 0.05], head: [0.05, -0.06, 0.07],
        upperArmL: [-0.03, 0, 0.17], lowerArmL: [-0.16, 0.06, 0.11],
        upperArmR: [-0.28, -0.08, -0.40], lowerArmR: [-0.12, -0.30, -0.34], handR: [0.1, 0, -0.2],
        upperLegR: [-0.06, -0.08, 0.05], lowerLegR: [0.03, 0, 0],
        upperLegL: [0.10, 0.12, -0.05], lowerLegL: [0.18, 0, 0], footL: [-0.10, 0.06, 0],
        pos: [0.02, -0.026, 0], sq: [1.012, 0.984],
      } },
      { t: 7.6, pose: {
        hips: [0.03, 0.05, 0.03], spine: [0.02, -0.02, -0.02], chest: [-0.01, -0.04, -0.02],
        neck: [-0.02, 0.04, 0], head: [-0.02, 0.08, -0.02],
        upperArmL: [-0.05, 0, 0.23], lowerArmL: [-0.10, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.21], lowerArmR: [-0.26, -0.12, -0.10],
        upperLegL: [0.04, 0.08, -0.02], lowerLegL: [0.08, 0, 0],
        tailA: [0.16, 0, 0], pos: [0, 0, 0], sq: [1, 1],
      } },
    ],
  },

  /* The waddle. Wide stance, hips roll a long way, the torso counter-rotates late, and the
     body drops onto each foot with a squash. This is the clip that has to say "bumbling". */
  walk_patrol: {
    loop: true, dur: TUNE.walkCycle,
    keys: [
      /* left contact */
      { t: 0.00, e: 'p', pose: {
        hips: [0.04, -0.14, 0.10], spine: [0.03, 0.09, -0.06], chest: [0.02, 0.17, -0.08],
        neck: [-0.03, -0.08, 0.03], head: [-0.02, -0.12, 0.04],
        upperArmL: [0.34, 0.04, 0.26], lowerArmL: [-0.30, 0.14, 0.20],
        upperArmR: [-0.30, -0.04, -0.24], lowerArmR: [-0.44, -0.16, -0.14],
        upperLegL: [-0.44, 0.06, -0.04], lowerLegL: [0.10, 0, 0], footL: [0.22, 0, 0],
        upperLegR: [0.34, -0.06, 0.05], lowerLegR: [0.30, 0, 0], footR: [-0.16, 0, 0],
        tailA: [0.18, -0.14, 0], tailB: [0.10, 0.16, 0],
        pos: [-0.020, -0.038, 0], sq: [1.030, 0.958],
      } },
      /* left mid-stance: he rises over the planted foot, arms cross neutral */
      { t: 0.33, pose: {
        hips: [0.05, -0.06, 0.05], spine: [0.03, 0.04, -0.03], chest: [0.03, 0.08, -0.04],
        neck: [-0.03, -0.03, 0.01], head: [-0.03, -0.05, 0.02],
        upperArmL: [0.04, 0.02, 0.24], lowerArmL: [-0.32, 0.12, 0.18],
        upperArmR: [-0.02, -0.02, -0.22], lowerArmR: [-0.40, -0.14, -0.12],
        upperLegL: [-0.06, 0.04, -0.03], lowerLegL: [0.06, 0, 0], footL: [0.02, 0, 0],
        upperLegR: [-0.02, -0.04, 0.04], lowerLegR: [0.52, 0, 0], footR: [-0.28, 0, 0],
        tailA: [0.20, -0.04, 0], tailB: [0.06, 0.06, 0],
        pos: [-0.012, 0.030, 0], sq: [0.976, 1.036],
      } },
      /* right contact — mirrored, but not exactly: the right step is a touch heavier */
      { t: 0.67, e: 'p', pose: {
        hips: [0.04, 0.15, -0.11], spine: [0.03, -0.10, 0.07], chest: [0.02, -0.18, 0.09],
        neck: [-0.03, 0.09, -0.03], head: [-0.02, 0.13, -0.04],
        upperArmL: [-0.32, 0.04, 0.22], lowerArmL: [-0.42, 0.16, 0.14],
        upperArmR: [0.36, -0.04, -0.26], lowerArmR: [-0.28, -0.14, -0.20],
        upperLegR: [-0.46, -0.06, 0.04], lowerLegR: [0.10, 0, 0], footR: [0.24, 0, 0],
        upperLegL: [0.36, 0.06, -0.05], lowerLegL: [0.32, 0, 0], footL: [-0.16, 0, 0],
        tailA: [0.18, 0.16, 0], tailB: [0.10, -0.18, 0],
        pos: [0.022, -0.042, 0], sq: [1.034, 0.952],
      } },
      /* right mid-stance */
      { t: 1.00, pose: {
        hips: [0.05, 0.06, -0.05], spine: [0.03, -0.04, 0.03], chest: [0.03, -0.08, 0.04],
        neck: [-0.03, 0.03, -0.01], head: [-0.03, 0.05, -0.02],
        upperArmL: [-0.02, 0.02, 0.22], lowerArmL: [-0.40, 0.14, 0.12],
        upperArmR: [0.04, -0.02, -0.24], lowerArmR: [-0.32, -0.12, -0.18],
        upperLegR: [-0.06, -0.04, 0.03], lowerLegR: [0.06, 0, 0], footR: [0.02, 0, 0],
        upperLegL: [-0.02, 0.04, -0.04], lowerLegL: [0.52, 0, 0], footL: [-0.28, 0, 0],
        tailA: [0.20, 0.04, 0], tailB: [0.06, -0.06, 0],
        pos: [0.012, 0.030, 0], sq: [0.976, 1.036],
      } },
      { t: TUNE.walkCycle, e: 'p', pose: {
        hips: [0.04, -0.14, 0.10], spine: [0.03, 0.09, -0.06], chest: [0.02, 0.17, -0.08],
        neck: [-0.03, -0.08, 0.03], head: [-0.02, -0.12, 0.04],
        upperArmL: [0.34, 0.04, 0.26], lowerArmL: [-0.30, 0.14, 0.20],
        upperArmR: [-0.30, -0.04, -0.24], lowerArmR: [-0.44, -0.16, -0.14],
        upperLegL: [-0.44, 0.06, -0.04], lowerLegL: [0.10, 0, 0], footL: [0.22, 0, 0],
        upperLegR: [0.34, -0.06, 0.05], lowerLegR: [0.30, 0, 0], footR: [-0.16, 0, 0],
        tailA: [0.18, -0.14, 0], tailB: [0.10, 0.16, 0],
        pos: [-0.020, -0.038, 0], sq: [1.030, 0.958],
      } },
    ],
  },

  /* Same footwork, but hunched forward with the spear levelled and the head sweeping. */
  walk_alert: {
    loop: true, dur: TUNE.alertCycle,
    keys: [
      { t: 0.00, e: 'p', pose: {
        hips: [0.10, -0.12, 0.08], spine: [0.10, 0.08, -0.05], chest: [0.09, 0.14, -0.06],
        neck: [-0.10, -0.14, 0.02], head: [-0.08, -0.20, 0.03],
        upperArmL: [0.22, 0.06, 0.30], lowerArmL: [-0.55, 0.20, 0.30],
        upperArmR: [-0.62, -0.10, -0.30], lowerArmR: [-0.80, -0.30, -0.24], handR: [0.1, 0, -0.1],
        upperLegL: [-0.50, 0.05, -0.03], lowerLegL: [0.14, 0, 0], footL: [0.20, 0, 0],
        upperLegR: [0.36, -0.05, 0.04], lowerLegR: [0.34, 0, 0], footR: [-0.18, 0, 0],
        tailA: [0.05, -0.12, 0], tailB: [0.02, 0.14, 0],
        earL: [-0.14, 0, -0.16], earR: [-0.14, 0, 0.16],
        pos: [-0.018, -0.034, 0.01], sq: [1.026, 0.964],
      } },
      { t: 0.26, pose: {
        hips: [0.11, -0.04, 0.04], spine: [0.10, 0.03, -0.02], chest: [0.09, 0.06, -0.03],
        neck: [-0.10, 0.02, 0], head: [-0.08, 0.04, 0],
        upperArmL: [0.02, 0.05, 0.28], lowerArmL: [-0.58, 0.18, 0.28],
        upperArmR: [-0.60, -0.10, -0.28], lowerArmR: [-0.82, -0.30, -0.22], handR: [0.1, 0, -0.1],
        upperLegL: [-0.08, 0.04, -0.02], lowerLegL: [0.08, 0, 0],
        upperLegR: [-0.02, -0.04, 0.03], lowerLegR: [0.56, 0, 0], footR: [-0.30, 0, 0],
        pos: [-0.010, 0.026, 0.01], sq: [0.980, 1.030],
      } },
      { t: 0.51, e: 'p', pose: {
        hips: [0.10, 0.13, -0.09], spine: [0.10, -0.09, 0.06], chest: [0.09, -0.15, 0.07],
        neck: [-0.10, 0.15, -0.02], head: [-0.08, 0.22, -0.03],
        upperArmL: [-0.34, 0.06, 0.26], lowerArmL: [-0.62, 0.22, 0.24],
        upperArmR: [-0.48, -0.10, -0.34], lowerArmR: [-0.72, -0.30, -0.28], handR: [0.1, 0, -0.1],
        upperLegR: [-0.52, -0.05, 0.03], lowerLegR: [0.14, 0, 0], footR: [0.22, 0, 0],
        upperLegL: [0.38, 0.05, -0.04], lowerLegL: [0.36, 0, 0], footL: [-0.18, 0, 0],
        tailA: [0.05, 0.14, 0], tailB: [0.02, -0.16, 0],
        earL: [-0.14, 0, -0.16], earR: [-0.14, 0, 0.16],
        pos: [0.020, -0.036, 0.01], sq: [1.028, 0.960],
      } },
      { t: 0.77, pose: {
        hips: [0.11, 0.04, -0.04], spine: [0.10, -0.03, 0.02], chest: [0.09, -0.06, 0.03],
        neck: [-0.10, -0.02, 0], head: [-0.08, -0.04, 0],
        upperArmL: [-0.02, 0.05, 0.26], lowerArmL: [-0.60, 0.20, 0.26],
        upperArmR: [-0.58, -0.10, -0.30], lowerArmR: [-0.80, -0.30, -0.24], handR: [0.1, 0, -0.1],
        upperLegR: [-0.08, -0.04, 0.02], lowerLegR: [0.08, 0, 0],
        upperLegL: [-0.02, 0.04, -0.03], lowerLegL: [0.56, 0, 0], footL: [-0.30, 0, 0],
        pos: [0.010, 0.026, 0.01], sq: [0.980, 1.030],
      } },
      { t: TUNE.alertCycle, e: 'p', pose: {
        hips: [0.10, -0.12, 0.08], spine: [0.10, 0.08, -0.05], chest: [0.09, 0.14, -0.06],
        neck: [-0.10, -0.14, 0.02], head: [-0.08, -0.20, 0.03],
        upperArmL: [0.22, 0.06, 0.30], lowerArmL: [-0.55, 0.20, 0.30],
        upperArmR: [-0.62, -0.10, -0.30], lowerArmR: [-0.80, -0.30, -0.24], handR: [0.1, 0, -0.1],
        upperLegL: [-0.50, 0.05, -0.03], lowerLegL: [0.14, 0, 0], footL: [0.20, 0, 0],
        upperLegR: [0.36, -0.05, 0.04], lowerLegR: [0.34, 0, 0], footR: [-0.18, 0, 0],
        tailA: [0.05, -0.12, 0], tailB: [0.02, 0.14, 0],
        pos: [-0.018, -0.034, 0.01], sq: [1.026, 0.964],
      } },
    ],
  },

  /* All-out lumber. Deep forward lean, arms pumping across the chest, and a genuine airborne
     frame with the root stretched — a heavy character running has to leave the ground. */
  run_chase: {
    loop: true, dur: TUNE.runCycle,
    keys: [
      { t: 0.00, e: 'p', pose: {
        hips: [0.20, -0.14, 0.10], spine: [0.16, 0.10, -0.07], chest: [0.14, 0.20, -0.09],
        neck: [-0.24, -0.10, 0.03], head: [-0.20, -0.14, 0.04],
        upperArmL: [0.72, 0.10, 0.24], lowerArmL: [-1.05, 0.30, 0.42],
        upperArmR: [-0.72, -0.10, -0.26], lowerArmR: [-1.25, -0.34, -0.36],
        upperLegL: [-0.76, 0.06, -0.05], lowerLegL: [0.22, 0, 0], footL: [0.30, 0, 0],
        upperLegR: [0.60, -0.06, 0.06], lowerLegR: [0.86, 0, 0], footR: [-0.24, 0, 0],
        tailA: [-0.10, -0.16, 0], tailB: [-0.14, 0.20, 0],
        earL: [-0.30, 0, -0.30], earR: [-0.30, 0, 0.30],
        pos: [-0.026, -0.070, 0.02], sq: [1.062, 0.918],
      } },
      /* push-off / airborne: stretched, both feet gathered, the whole body a long diagonal */
      { t: 0.16, e: 'l', pose: {
        hips: [0.24, -0.06, 0.04], spine: [0.18, 0.04, -0.03], chest: [0.16, 0.09, -0.04],
        neck: [-0.26, -0.04, 0.01], head: [-0.22, -0.06, 0.02],
        upperArmL: [0.24, 0.08, 0.22], lowerArmL: [-1.15, 0.28, 0.40],
        upperArmR: [-0.26, -0.08, -0.24], lowerArmR: [-1.30, -0.32, -0.34],
        upperLegL: [-0.20, 0.05, -0.04], lowerLegL: [0.55, 0, 0], footL: [0.10, 0, 0],
        upperLegR: [-0.20, -0.05, 0.05], lowerLegR: [1.10, 0, 0], footR: [-0.30, 0, 0],
        pos: [-0.012, 0.085, 0.02], sq: [0.945, 1.080],
      } },
      { t: 0.31, e: 'p', pose: {
        hips: [0.20, 0.15, -0.11], spine: [0.16, -0.11, 0.08], chest: [0.14, -0.21, 0.10],
        neck: [-0.24, 0.11, -0.03], head: [-0.20, 0.15, -0.04],
        upperArmL: [-0.74, 0.10, 0.22], lowerArmL: [-1.28, 0.34, 0.36],
        upperArmR: [0.74, -0.10, -0.28], lowerArmR: [-1.02, -0.30, -0.44],
        upperLegR: [-0.78, -0.06, 0.05], lowerLegR: [0.22, 0, 0], footR: [0.30, 0, 0],
        upperLegL: [0.62, 0.06, -0.06], lowerLegL: [0.88, 0, 0], footL: [-0.24, 0, 0],
        tailA: [-0.10, 0.18, 0], tailB: [-0.14, -0.22, 0],
        pos: [0.028, -0.074, 0.02], sq: [1.066, 0.914],
      } },
      { t: 0.47, e: 'l', pose: {
        hips: [0.24, 0.06, -0.04], spine: [0.18, -0.04, 0.03], chest: [0.16, -0.09, 0.04],
        neck: [-0.26, 0.04, -0.01], head: [-0.22, 0.06, -0.02],
        upperArmL: [-0.26, 0.08, 0.20], lowerArmL: [-1.30, 0.32, 0.34],
        upperArmR: [0.24, -0.08, -0.26], lowerArmR: [-1.15, -0.28, -0.42],
        upperLegR: [-0.20, -0.05, 0.04], lowerLegR: [0.55, 0, 0], footR: [0.10, 0, 0],
        upperLegL: [-0.20, 0.05, -0.05], lowerLegL: [1.10, 0, 0], footL: [-0.30, 0, 0],
        pos: [0.012, 0.085, 0.02], sq: [0.945, 1.080],
      } },
      { t: TUNE.runCycle, e: 'p', pose: {
        hips: [0.20, -0.14, 0.10], spine: [0.16, 0.10, -0.07], chest: [0.14, 0.20, -0.09],
        neck: [-0.24, -0.10, 0.03], head: [-0.20, -0.14, 0.04],
        upperArmL: [0.72, 0.10, 0.24], lowerArmL: [-1.05, 0.30, 0.42],
        upperArmR: [-0.72, -0.10, -0.26], lowerArmR: [-1.25, -0.34, -0.36],
        upperLegL: [-0.76, 0.06, -0.05], lowerLegL: [0.22, 0, 0], footL: [0.30, 0, 0],
        upperLegR: [0.60, -0.06, 0.06], lowerLegR: [0.86, 0, 0], footR: [-0.24, 0, 0],
        tailA: [-0.10, -0.16, 0], tailB: [-0.14, 0.20, 0],
        pos: [-0.026, -0.070, 0.02], sq: [1.062, 0.918],
      } },
    ],
  },

  /* Scanning at a waypoint. The head leads, the shoulders follow two beats late, and each
     end of the sweep holds long enough for the player to time a move around him. */
  look_around: {
    loop: true, dur: 4.4,
    keys: [
      { t: 0.0, pose: {
        hips: [0.02, 0, 0.02], spine: [0.02, 0, -0.02], chest: [0, 0, 0],
        neck: [-0.04, 0, 0], head: [-0.03, 0, 0],
        upperArmL: [-0.05, 0, 0.24], lowerArmL: [-0.12, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 0.85, e: 's', pose: {
        hips: [0.02, 0.06, 0.02], spine: [0.02, 0.10, -0.02], chest: [0, 0.18, 0],
        neck: [-0.04, 0.32, 0.02], head: [-0.05, 0.52, 0.06],
        upperArmL: [-0.05, 0, 0.26], lowerArmL: [-0.12, 0.10, 0.14],
        upperArmR: [-0.04, 0, -0.24], lowerArmR: [-0.26, -0.14, -0.10],
        earL: [-0.10, 0, -0.22], earR: [0.02, 0, 0.04],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 1.5, pose: {
        chest: [0, 0.22, 0], neck: [-0.03, 0.34, 0.02], head: [-0.02, 0.50, 0.05],
        hips: [0.02, 0.07, 0.02], spine: [0.02, 0.12, -0.02],
        upperArmL: [-0.05, 0, 0.26], lowerArmL: [-0.12, 0.10, 0.14],
        upperArmR: [-0.04, 0, -0.24], lowerArmR: [-0.26, -0.14, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 2.5, e: 's', pose: {
        hips: [0.02, -0.07, 0.02], spine: [0.02, -0.11, -0.02], chest: [0, -0.20, 0],
        neck: [-0.04, -0.34, -0.02], head: [-0.05, -0.56, -0.06],
        upperArmL: [-0.05, 0, 0.22], lowerArmL: [-0.12, 0.06, 0.14],
        upperArmR: [-0.04, 0, -0.20], lowerArmR: [-0.26, -0.10, -0.10],
        earL: [0.02, 0, -0.04], earR: [-0.10, 0, 0.22],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 3.3, pose: {
        chest: [0, -0.22, 0], neck: [-0.03, -0.34, -0.02], head: [-0.02, -0.52, -0.05],
        hips: [0.02, -0.07, 0.02], spine: [0.02, -0.12, -0.02],
        upperArmL: [-0.05, 0, 0.22], lowerArmL: [-0.12, 0.06, 0.14],
        upperArmR: [-0.04, 0, -0.20], lowerArmR: [-0.26, -0.10, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 4.4, pose: {
        hips: [0.02, 0, 0.02], spine: [0.02, 0, -0.02], chest: [0, 0, 0],
        neck: [-0.04, 0, 0], head: [-0.03, 0, 0],
        upperArmL: [-0.05, 0, 0.24], lowerArmL: [-0.12, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
    ],
  },

  /* "…did something move?" He freezes mid-stride, then leans in, then the spear comes up.
     The hold at t=0.35 is the anticipation: nothing happens for a third of a second. */
  suspicious: {
    loop: true, dur: 3.0,
    keys: [
      { t: 0.0, e: 'p', pose: {
        hips: [-0.03, 0, 0.02], spine: [-0.04, 0, -0.02], chest: [-0.06, 0, 0],
        neck: [0.02, 0, 0], head: [0.04, 0, 0],
        upperArmL: [-0.12, 0, 0.30], lowerArmL: [-0.30, 0.10, 0.22],
        upperArmR: [-0.14, 0, -0.28], lowerArmR: [-0.40, -0.16, -0.18],
        earL: [-0.24, 0, -0.28], earR: [-0.24, 0, 0.28],
        pos: [0, 0.012, -0.02], sq: [0.986, 1.018],
      } },
      { t: 0.35, pose: {
        hips: [-0.03, 0, 0.02], spine: [-0.04, 0, -0.02], chest: [-0.06, 0, 0],
        neck: [0.02, 0, 0], head: [0.04, 0, 0],
        upperArmL: [-0.12, 0, 0.30], lowerArmL: [-0.30, 0.10, 0.22],
        upperArmR: [-0.14, 0, -0.28], lowerArmR: [-0.40, -0.16, -0.18],
        earL: [-0.24, 0, -0.28], earR: [-0.24, 0, 0.28],
        pos: [0, 0.012, -0.02], sq: [0.986, 1.018],
      } },
      /* lean in, chin forward — the whole body becomes one leaning line */
      { t: 0.9, e: 's', pose: {
        hips: [0.12, 0.02, 0.01], spine: [0.12, 0.02, -0.01], chest: [0.14, 0.03, 0],
        neck: [0.10, 0.02, 0], head: [0.06, 0.04, 0], jaw: [0.10, 0, 0],
        upperArmL: [-0.30, 0.04, 0.34], lowerArmL: [-0.62, 0.16, 0.28],
        upperArmR: [-0.46, -0.06, -0.34], lowerArmR: [-0.72, -0.26, -0.24], handR: [0.1, 0, -0.1],
        upperLegL: [-0.10, 0.04, -0.02], lowerLegL: [0.16, 0, 0],
        upperLegR: [0.06, -0.04, 0.03], lowerLegR: [0.20, 0, 0],
        pos: [0, -0.022, 0.045], sq: [1.020, 0.974],
      } },
      { t: 1.7, pose: {
        hips: [0.11, -0.05, 0.01], spine: [0.11, -0.06, -0.01], chest: [0.13, -0.09, 0],
        neck: [0.09, -0.08, 0], head: [0.05, -0.14, -0.02], jaw: [0.08, 0, 0],
        upperArmL: [-0.28, 0.04, 0.32], lowerArmL: [-0.60, 0.16, 0.26],
        upperArmR: [-0.44, -0.06, -0.32], lowerArmR: [-0.70, -0.26, -0.22], handR: [0.1, 0, -0.1],
        upperLegL: [-0.10, 0.04, -0.02], lowerLegL: [0.16, 0, 0],
        upperLegR: [0.06, -0.04, 0.03], lowerLegR: [0.20, 0, 0],
        pos: [0, -0.020, 0.042], sq: [1.018, 0.976],
      } },
      { t: 2.5, pose: {
        hips: [0.12, 0.06, 0.01], spine: [0.12, 0.07, -0.01], chest: [0.14, 0.11, 0],
        neck: [0.10, 0.09, 0], head: [0.06, 0.16, 0.02], jaw: [0.10, 0, 0],
        upperArmL: [-0.30, 0.04, 0.34], lowerArmL: [-0.62, 0.16, 0.28],
        upperArmR: [-0.46, -0.06, -0.34], lowerArmR: [-0.72, -0.26, -0.24], handR: [0.1, 0, -0.1],
        upperLegL: [-0.10, 0.04, -0.02], lowerLegL: [0.16, 0, 0],
        upperLegR: [0.06, -0.04, 0.03], lowerLegR: [0.20, 0, 0],
        pos: [0, -0.022, 0.045], sq: [1.020, 0.974],
      } },
      { t: 3.0, e: 'p', pose: {
        hips: [-0.03, 0, 0.02], spine: [-0.04, 0, -0.02], chest: [-0.06, 0, 0],
        neck: [0.02, 0, 0], head: [0.04, 0, 0],
        upperArmL: [-0.12, 0, 0.30], lowerArmL: [-0.30, 0.10, 0.22],
        upperArmR: [-0.14, 0, -0.28], lowerArmR: [-0.40, -0.16, -0.18],
        pos: [0, 0.012, -0.02], sq: [0.986, 1.018],
      } },
    ],
  },

  /* The "!". Squat hard (anticipation), pop straight up with a stretch, land and settle.
     One-shot: Guard.js hands over to run_chase when it finishes. */
  alert: {
    loop: false, dur: 1.15,
    keys: [
      { t: 0.0, pose: {
        hips: [0.06, 0, 0.02], spine: [0.06, 0, -0.02], chest: [0.06, 0, 0],
        neck: [0.02, 0, 0], head: [0.02, 0, 0],
        upperArmL: [-0.14, 0, 0.30], lowerArmL: [-0.34, 0.10, 0.22],
        upperArmR: [-0.16, 0, -0.28], lowerArmR: [-0.44, -0.16, -0.18],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      { t: 0.16, e: 'l', pose: {
        hips: [0.26, 0, 0.02], spine: [0.22, 0, -0.02], chest: [0.24, 0, 0],
        neck: [0.20, 0, 0], head: [0.24, 0, 0],
        upperArmL: [0.20, 0, 0.16], lowerArmL: [-0.20, 0.06, 0.10],
        upperArmR: [0.20, 0, -0.14], lowerArmR: [-0.28, -0.10, -0.08],
        upperLegL: [0.10, 0.06, -0.02], lowerLegL: [0.42, 0, 0],
        upperLegR: [0.10, -0.06, 0.02], lowerLegR: [0.42, 0, 0],
        pos: [0, -0.115, 0.02], sq: [1.090, 0.860],
      } },
      /* the pop — everything flies open, ears up, jaw drops, root stretched tall */
      { t: 0.38, e: 'l', pose: {
        hips: [-0.16, 0, 0], spine: [-0.18, 0, 0], chest: [-0.22, 0, 0],
        neck: [-0.26, 0, 0], head: [-0.34, 0, 0], jaw: [0.40, 0, 0],
        upperArmL: [-0.90, 0.20, 0.95], lowerArmL: [-0.30, 0.30, 0.70],
        upperArmR: [-0.86, -0.20, -0.92], lowerArmR: [-0.40, -0.34, -0.64],
        upperLegL: [-0.10, 0.06, -0.02], lowerLegL: [0.06, 0, 0],
        upperLegR: [-0.10, -0.06, 0.02], lowerLegR: [0.06, 0, 0],
        earL: [-0.40, 0, -0.40], earR: [-0.40, 0, 0.40],
        tailA: [-0.32, 0, 0], tailB: [-0.30, 0, 0],
        pos: [0, 0.120, -0.03], sq: [0.905, 1.115],
      } },
      { t: 0.62, e: 'p', pose: {
        hips: [0.14, 0, 0.02], spine: [0.12, 0, -0.02], chest: [0.14, 0, 0],
        neck: [0.10, 0, 0], head: [0.14, 0, 0], jaw: [0.14, 0, 0],
        upperArmL: [-0.40, 0.10, 0.50], lowerArmL: [-0.50, 0.18, 0.38],
        upperArmR: [-0.44, -0.10, -0.48], lowerArmR: [-0.62, -0.22, -0.34],
        upperLegL: [0.04, 0.06, -0.02], lowerLegL: [0.24, 0, 0],
        upperLegR: [0.04, -0.06, 0.02], lowerLegR: [0.24, 0, 0],
        pos: [0, -0.050, 0.02], sq: [1.040, 0.945],
      } },
      { t: 1.15, pose: {
        hips: [0.13, 0.02, 0.01], spine: [0.12, 0.02, -0.01], chest: [0.14, 0.03, 0],
        neck: [-0.06, 0.02, 0], head: [-0.06, 0.04, 0],
        upperArmL: [-0.32, 0.06, 0.36], lowerArmL: [-0.66, 0.18, 0.30],
        upperArmR: [-0.50, -0.08, -0.36], lowerArmR: [-0.78, -0.28, -0.26], handR: [0.1, 0, -0.1],
        upperLegL: [-0.08, 0.04, -0.02], lowerLegL: [0.14, 0, 0],
        upperLegR: [0.06, -0.04, 0.03], lowerLegR: [0.18, 0, 0],
        pos: [0, -0.014, 0.03], sq: [1.012, 0.984],
      } },
    ],
  },

  /* Spear thrust. A quarter-second of coiling, four frames of thrust, and a long slow
     recovery he can be punished during — the whole point of a telegraphed attack. */
  attack: {
    loop: false, dur: 1.05,
    keys: [
      { t: 0.0, pose: {
        hips: [0.10, 0.02, 0.01], spine: [0.10, 0.02, -0.01], chest: [0.12, 0.03, 0],
        neck: [-0.05, 0.02, 0], head: [-0.05, 0.03, 0],
        upperArmL: [-0.30, 0.05, 0.34], lowerArmL: [-0.62, 0.16, 0.28],
        upperArmR: [-0.48, -0.06, -0.34], lowerArmR: [-0.76, -0.26, -0.24],
        pos: [0, -0.012, 0.03], sq: [1.010, 0.986],
      } },
      /* wind-up: everything travels backward, weight onto the back foot */
      { t: 0.28, e: 's', pose: {
        hips: [-0.10, 0.34, 0.06], spine: [-0.06, 0.22, -0.04], chest: [-0.04, 0.30, -0.05],
        neck: [0.04, -0.22, 0], head: [0.06, -0.30, 0], jaw: [0.16, 0, 0],
        upperArmL: [0.30, 0.10, 0.46], lowerArmL: [-0.34, 0.24, 0.44],
        upperArmR: [0.52, -0.16, -0.30], lowerArmR: [-1.10, -0.42, -0.20], handR: [0.2, 0, -0.2],
        upperLegL: [0.22, 0.10, -0.04], lowerLegL: [0.34, 0, 0],
        upperLegR: [-0.20, -0.10, 0.05], lowerLegR: [0.30, 0, 0],
        pos: [-0.02, -0.055, -0.08], sq: [1.036, 0.952],
      } },
      /* thrust: linear ease so it snaps, with a genuine overshoot past the target */
      { t: 0.40, e: 'l', pose: {
        hips: [0.26, -0.34, -0.04], spine: [0.18, -0.24, 0.03], chest: [0.14, -0.32, 0.04],
        neck: [-0.16, 0.24, 0], head: [-0.12, 0.32, 0], jaw: [0.24, 0, 0],
        upperArmL: [-0.70, 0.08, 0.30], lowerArmL: [-0.90, 0.20, 0.26],
        upperArmR: [-1.30, 0.10, -0.24], lowerArmR: [-0.20, -0.20, -0.12], handR: [-0.1, 0, 0],
        upperLegL: [-0.42, 0.08, -0.04], lowerLegL: [0.10, 0, 0],
        upperLegR: [0.40, -0.08, 0.05], lowerLegR: [0.46, 0, 0],
        pos: [0.02, -0.020, 0.150], sq: [0.968, 1.038],
      } },
      { t: 0.56, e: 'p', pose: {
        hips: [0.20, -0.22, -0.02], spine: [0.16, -0.16, 0.02], chest: [0.14, -0.22, 0.02],
        neck: [-0.10, 0.16, 0], head: [-0.06, 0.20, 0], jaw: [0.10, 0, 0],
        upperArmL: [-0.50, 0.08, 0.32], lowerArmL: [-0.80, 0.20, 0.28],
        upperArmR: [-1.05, 0.06, -0.26], lowerArmR: [-0.40, -0.22, -0.16],
        upperLegL: [-0.32, 0.08, -0.04], lowerLegL: [0.14, 0, 0],
        upperLegR: [0.30, -0.08, 0.05], lowerLegR: [0.42, 0, 0],
        pos: [0.02, -0.030, 0.115], sq: [1.010, 0.986],
      } },
      { t: 1.05, pose: {
        hips: [0.10, 0.02, 0.01], spine: [0.10, 0.02, -0.01], chest: [0.12, 0.03, 0],
        neck: [-0.05, 0.02, 0], head: [-0.05, 0.03, 0],
        upperArmL: [-0.30, 0.05, 0.34], lowerArmL: [-0.62, 0.16, 0.28],
        upperArmR: [-0.48, -0.06, -0.34], lowerArmR: [-0.76, -0.26, -0.24],
        pos: [0, -0.012, 0.03], sq: [1.010, 0.986],
      } },
    ],
  },

  /* Bounced on. Knees gone, arms dangling, head lolling in a slow figure-of-eight. */
  stunned: {
    loop: true, dur: 1.5,
    keys: [
      { t: 0.0, pose: {
        hips: [0.16, 0.16, 0.12], spine: [0.14, -0.10, -0.16], chest: [0.20, -0.14, -0.12],
        neck: [0.22, 0.10, 0.16], head: [0.26, 0.22, 0.24], jaw: [0.22, 0, 0],
        upperArmL: [0.24, 0.10, 0.36], lowerArmL: [0.20, 0.14, 0.26],
        upperArmR: [0.26, -0.10, -0.34], lowerArmR: [0.16, -0.14, -0.24],
        upperLegL: [0.20, 0.14, -0.10], lowerLegL: [0.48, 0, 0],
        upperLegR: [0.18, -0.12, 0.14], lowerLegR: [0.44, 0, 0],
        earL: [0.34, 0, -0.34], earR: [0.30, 0, 0.36], tailA: [0.30, 0.14, 0],
        pos: [0.02, -0.115, 0.03], sq: [1.055, 0.905],
      } },
      { t: 0.75, pose: {
        hips: [0.16, -0.16, -0.12], spine: [0.14, 0.10, 0.16], chest: [0.20, 0.14, 0.12],
        neck: [0.22, -0.10, -0.16], head: [0.26, -0.24, -0.26], jaw: [0.22, 0, 0],
        upperArmL: [0.28, 0.10, 0.32], lowerArmL: [0.16, 0.14, 0.22],
        upperArmR: [0.22, -0.10, -0.38], lowerArmR: [0.20, -0.14, -0.28],
        upperLegL: [0.18, 0.12, -0.14], lowerLegL: [0.44, 0, 0],
        upperLegR: [0.20, -0.14, 0.10], lowerLegR: [0.48, 0, 0],
        earL: [0.30, 0, -0.36], earR: [0.34, 0, 0.34], tailA: [0.30, -0.14, 0],
        pos: [-0.02, -0.125, 0.03], sq: [1.060, 0.898],
      } },
      { t: 1.5, pose: {
        hips: [0.16, 0.16, 0.12], spine: [0.14, -0.10, -0.16], chest: [0.20, -0.14, -0.12],
        neck: [0.22, 0.10, 0.16], head: [0.26, 0.22, 0.24], jaw: [0.22, 0, 0],
        upperArmL: [0.24, 0.10, 0.36], lowerArmL: [0.20, 0.14, 0.26],
        upperArmR: [0.26, -0.10, -0.34], lowerArmR: [0.16, -0.14, -0.24],
        upperLegL: [0.20, 0.14, -0.10], lowerLegL: [0.48, 0, 0],
        upperLegR: [0.18, -0.12, 0.14], lowerLegR: [0.44, 0, 0],
        pos: [0.02, -0.115, 0.03], sq: [1.055, 0.905],
      } },
    ],
  },

  /* Out cold. Goes over backward with a big squash on impact and one twitching foot. */
  ko: {
    loop: false, dur: 2.0,
    keys: [
      { t: 0.0, pose: {
        hips: [0.10, 0, 0.04], spine: [0.10, 0, -0.04], chest: [0.12, 0, 0],
        neck: [0, 0, 0], head: [0, 0, 0], pos: [0, 0, 0], sq: [1, 1],
      } },
      /* the buckle */
      { t: 0.20, e: 'l', pose: {
        hips: [0.32, 0.06, 0.10], spine: [0.20, 0, -0.08], chest: [0.16, -0.04, -0.04],
        neck: [0.24, 0, 0.04], head: [0.34, 0.06, 0.08], jaw: [0.26, 0, 0],
        upperArmL: [0.50, 0.10, 0.44], lowerArmL: [0.30, 0.12, 0.30],
        upperArmR: [0.52, -0.10, -0.42], lowerArmR: [0.26, -0.12, -0.28],
        upperLegL: [0.44, 0.14, -0.10], lowerLegL: [0.80, 0, 0],
        upperLegR: [0.40, -0.14, 0.12], lowerLegR: [0.76, 0, 0],
        pos: [0, -0.26, 0.02], sq: [1.10, 0.80],
      } },
      /* over he goes — the root pitches back and flattens */
      { t: 0.44, e: 'p', pose: {
        hips: [-0.95, 0.10, 0.16], spine: [-0.28, 0.04, -0.10], chest: [-0.16, -0.06, -0.06],
        neck: [0.32, 0.02, 0.06], head: [0.46, 0.10, 0.12], jaw: [0.32, 0, 0],
        upperArmL: [-0.30, 0.20, 0.80], lowerArmL: [0.10, 0.24, 0.52],
        upperArmR: [-0.26, -0.20, -0.78], lowerArmR: [0.06, -0.24, -0.48],
        upperLegL: [-0.30, 0.20, -0.16], lowerLegL: [1.05, 0, 0],
        upperLegR: [-0.24, -0.20, 0.18], lowerLegR: [1.00, 0, 0],
        earL: [0.44, 0, -0.44], earR: [0.42, 0, 0.46], tailA: [-0.40, 0.20, 0],
        pos: [0, -0.44, -0.30], sq: [1.16, 0.66],
      } },
      { t: 0.75, e: 'p', pose: {
        hips: [-1.10, 0.10, 0.16], spine: [-0.22, 0.04, -0.10], chest: [-0.12, -0.06, -0.06],
        neck: [0.36, 0.02, 0.06], head: [0.50, 0.10, 0.12], jaw: [0.28, 0, 0],
        upperArmL: [-0.34, 0.20, 0.86], lowerArmL: [0.14, 0.24, 0.56],
        upperArmR: [-0.30, -0.20, -0.84], lowerArmR: [0.10, -0.24, -0.52],
        upperLegL: [-0.34, 0.20, -0.16], lowerLegL: [1.10, 0, 0],
        upperLegR: [-0.20, -0.20, 0.18], lowerLegR: [0.92, 0, 0],
        pos: [0, -0.50, -0.36], sq: [1.14, 0.62],
      } },
      /* one last twitch, then still */
      { t: 1.15, pose: {
        hips: [-1.10, 0.10, 0.16], spine: [-0.22, 0.04, -0.10], chest: [-0.12, -0.06, -0.06],
        neck: [0.36, 0.02, 0.06], head: [0.50, 0.10, 0.12], jaw: [0.22, 0, 0],
        upperArmL: [-0.34, 0.20, 0.86], lowerArmL: [0.14, 0.24, 0.56],
        upperArmR: [-0.30, -0.20, -0.84], lowerArmR: [0.10, -0.24, -0.52],
        upperLegL: [-0.34, 0.20, -0.16], lowerLegL: [0.86, 0, 0], footL: [0.30, 0, 0],
        upperLegR: [-0.20, -0.20, 0.18], lowerLegR: [0.92, 0, 0],
        pos: [0, -0.50, -0.36], sq: [1.14, 0.62],
      } },
      { t: 2.0, pose: {
        hips: [-1.10, 0.10, 0.16], spine: [-0.22, 0.04, -0.10], chest: [-0.12, -0.06, -0.06],
        neck: [0.36, 0.02, 0.06], head: [0.50, 0.10, 0.12], jaw: [0.18, 0, 0],
        upperArmL: [-0.34, 0.20, 0.86], lowerArmL: [0.14, 0.24, 0.56],
        upperArmR: [-0.30, -0.20, -0.84], lowerArmR: [0.10, -0.24, -0.52],
        upperLegL: [-0.34, 0.20, -0.16], lowerLegL: [1.10, 0, 0],
        upperLegR: [-0.20, -0.20, 0.18], lowerLegR: [0.92, 0, 0],
        pos: [0, -0.50, -0.36], sq: [1.14, 0.62],
      } },
    ],
  },

  /* Robbed and none the wiser. A beat of nothing, a pat at the empty hip, a double-take over
     the wrong shoulder, then a shrug. The whole joke is in the delay. */
  pickpocketed_reaction: {
    loop: false, dur: 2.9,
    keys: [
      { t: 0.0, pose: {
        hips: [0.02, 0.06, 0.03], spine: [0.02, -0.02, -0.02], chest: [-0.01, -0.05, -0.02],
        neck: [-0.03, 0.04, 0], head: [-0.02, 0.08, -0.02],
        upperArmL: [-0.05, 0, 0.24], lowerArmL: [-0.10, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      /* the beat: he has no idea yet */
      { t: 0.55, pose: {
        hips: [0.02, 0.06, 0.03], spine: [0.02, -0.02, -0.02], chest: [-0.01, -0.05, -0.02],
        neck: [-0.03, 0.04, 0], head: [-0.02, 0.08, -0.02],
        upperArmL: [-0.05, 0, 0.24], lowerArmL: [-0.10, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
      /* pat the hip */
      { t: 0.85, e: 'l', pose: {
        hips: [0.04, 0.04, 0.06], spine: [0.04, -0.02, -0.05], chest: [0.02, -0.04, -0.04],
        neck: [0.06, 0.02, -0.02], head: [0.16, 0.06, -0.04],
        upperArmL: [-0.34, 0.16, 0.10], lowerArmL: [-0.62, 0.40, 0.16], handL: [0.2, 0.2, 0],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, -0.008, 0.01], sq: [1.006, 0.992],
      } },
      { t: 1.05, e: 'l', pose: {
        hips: [0.04, 0.04, 0.06], spine: [0.04, -0.02, -0.05], chest: [0.02, -0.04, -0.04],
        neck: [0.07, 0.02, -0.02], head: [0.20, 0.06, -0.04],
        upperArmL: [-0.28, 0.16, 0.06], lowerArmL: [-0.70, 0.42, 0.12], handL: [0.3, 0.2, 0],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, -0.010, 0.01], sq: [1.008, 0.990],
      } },
      /* the double-take: head whips the WRONG way first, with overshoot */
      { t: 1.35, e: 'l', pose: {
        hips: [0.02, 0.10, 0.04], spine: [0.02, 0.14, -0.03], chest: [0, 0.22, -0.02],
        neck: [-0.06, 0.42, 0.02], head: [-0.12, 0.72, 0.06], jaw: [0.20, 0, 0],
        upperArmL: [-0.20, 0.12, 0.20], lowerArmL: [-0.48, 0.30, 0.24],
        upperArmR: [-0.10, 0, -0.28], lowerArmR: [-0.34, -0.16, -0.14],
        earL: [-0.34, 0, -0.36], earR: [-0.34, 0, 0.36],
        pos: [0, 0.014, -0.02], sq: [0.986, 1.020],
      } },
      { t: 1.75, e: 'p', pose: {
        hips: [0.02, -0.12, 0.02], spine: [0.02, -0.16, -0.01], chest: [0, -0.26, 0],
        neck: [-0.06, -0.46, -0.02], head: [-0.12, -0.80, -0.06], jaw: [0.20, 0, 0],
        upperArmL: [-0.22, -0.10, 0.24], lowerArmL: [-0.50, 0.10, 0.26],
        upperArmR: [-0.12, 0, -0.30], lowerArmR: [-0.36, -0.18, -0.16],
        pos: [0, 0.014, -0.02], sq: [0.986, 1.020],
      } },
      /* the shrug */
      { t: 2.25, e: 's', pose: {
        hips: [0.02, 0, 0.02], spine: [0.02, 0, -0.02], chest: [0.02, 0, 0],
        neck: [0.10, 0, 0], head: [0.14, 0, 0],
        shoulderL: [0, 0, 0.26], shoulderR: [0, 0, -0.26],
        upperArmL: [0.10, 0.16, 0.44], lowerArmL: [-0.20, 0.44, 0.62], handL: [0, 0.4, 0],
        upperArmR: [0.10, -0.16, -0.42], lowerArmR: [-0.26, -0.46, -0.58], handR: [0, -0.4, 0],
        pos: [0, 0.020, 0], sq: [0.988, 1.014],
      } },
      { t: 2.9, pose: {
        hips: [0.02, 0.06, 0.03], spine: [0.02, -0.02, -0.02], chest: [-0.01, -0.05, -0.02],
        neck: [-0.03, 0.04, 0], head: [-0.02, 0.08, -0.02],
        upperArmL: [-0.05, 0, 0.24], lowerArmL: [-0.10, 0.08, 0.14],
        upperArmR: [-0.04, 0, -0.22], lowerArmR: [-0.26, -0.12, -0.10],
        pos: [0, 0, 0], sq: [1, 1],
      } },
    ],
  },
};

/* ============================ scarab clips ================================ */
/* Same clip names so the state machine never has to special-case a type. The scarab's
   personality is all in the leg phase offsets: a tripod gait, plus a nervous antenna. */

function scarabLegs(phase, amp, lift) {
  // Alternating tripod: L0/R1/L2 swing together, R0/L1/R2 the other half-cycle.
  const p = (k) => Math.sin(phase + k * Math.PI);
  return {
    legL0: [p(0) * amp, 0, lift * Math.max(0, p(0))],
    legR1: [p(0) * amp, 0, -lift * Math.max(0, p(0))],
    legL2: [p(0) * amp, 0, lift * Math.max(0, p(0))],
    legR0: [p(1) * amp, 0, -lift * Math.max(0, p(1))],
    legL1: [p(1) * amp, 0, lift * Math.max(0, p(1))],
    legR2: [p(1) * amp, 0, -lift * Math.max(0, p(1))],
  };
}

function scarabCycle(dur, amp, lift, bodyAmp, steps = 4) {
  const keys = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * dur;
    const ph = (i / steps) * Math.PI * 2;
    keys.push({
      t, e: 'l',
      pose: {
        ...scarabLegs(ph, amp, lift),
        body: [Math.sin(ph * 2) * bodyAmp * 0.5, Math.sin(ph) * bodyAmp, Math.cos(ph) * bodyAmp],
        headS: [Math.sin(ph + 1) * bodyAmp * 0.8, Math.sin(ph * 0.5) * bodyAmp * 1.5, 0],
        antL: [Math.sin(ph * 1.7) * 0.35, 0.2, 0.25],
        antR: [Math.sin(ph * 1.7 + 2) * 0.35, -0.2, -0.25],
        pos: [0, Math.abs(Math.sin(ph)) * 0.012, 0],
        sq: [1 + Math.sin(ph * 2) * 0.02, 1 - Math.sin(ph * 2) * 0.02],
      },
    });
  }
  return keys;
}

const SCARAB_CLIPS = {
  idle: {
    loop: true, dur: 3.0,
    keys: [
      { t: 0, pose: { body: [0, 0, 0], headS: [0, 0.10, 0], antL: [0.15, 0.2, 0.25], antR: [-0.15, -0.2, -0.25], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 1.5, pose: { body: [0.03, 0, 0.02], headS: [0.05, -0.14, 0], antL: [-0.10, 0.2, 0.30], antR: [0.20, -0.2, -0.20], pos: [0, 0.006, 0], sq: [0.995, 1.008] } },
      { t: 3.0, pose: { body: [0, 0, 0], headS: [0, 0.10, 0], antL: [0.15, 0.2, 0.25], antR: [-0.15, -0.2, -0.25], pos: [0, 0, 0], sq: [1, 1] } },
    ],
  },
  idle_bored: { loop: true, dur: 3.4, keys: scarabCycle(3.4, 0.10, 0.05, 0.03, 4) },
  walk_patrol: { loop: true, dur: 0.66, keys: scarabCycle(0.66, 0.34, 0.18, 0.05, 4) },
  walk_alert: { loop: true, dur: 0.52, keys: scarabCycle(0.52, 0.42, 0.22, 0.07, 4) },
  run_chase: { loop: true, dur: 0.34, keys: scarabCycle(0.34, 0.55, 0.30, 0.10, 4) },
  look_around: {
    loop: true, dur: 2.6,
    keys: [
      { t: 0, pose: { body: [0, 0, 0], headS: [0, 0, 0], antL: [0.2, 0.2, 0.25], antR: [-0.2, -0.2, -0.25], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 0.8, pose: { body: [0, 0.30, 0.05], headS: [0, 0.45, 0], antL: [0.4, 0.3, 0.35], antR: [0.1, -0.1, -0.15], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 1.7, pose: { body: [0, -0.30, -0.05], headS: [0, -0.45, 0], antL: [0.1, 0.1, 0.15], antR: [-0.4, -0.3, -0.35], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 2.6, pose: { body: [0, 0, 0], headS: [0, 0, 0], antL: [0.2, 0.2, 0.25], antR: [-0.2, -0.2, -0.25], pos: [0, 0, 0], sq: [1, 1] } },
    ],
  },
  suspicious: {
    loop: true, dur: 1.4,
    keys: [
      { t: 0, pose: { body: [-0.14, 0, 0], headS: [-0.22, 0, 0], antL: [-0.35, 0.35, 0.4], antR: [-0.35, -0.35, -0.4], pos: [0, 0.020, 0], sq: [0.97, 1.05] } },
      { t: 0.7, pose: { body: [-0.10, 0.12, 0.03], headS: [-0.18, 0.20, 0], antL: [-0.20, 0.30, 0.4], antR: [-0.45, -0.30, -0.4], pos: [0, 0.024, 0], sq: [0.97, 1.05] } },
      { t: 1.4, pose: { body: [-0.14, 0, 0], headS: [-0.22, 0, 0], antL: [-0.35, 0.35, 0.4], antR: [-0.35, -0.35, -0.4], pos: [0, 0.020, 0], sq: [0.97, 1.05] } },
    ],
  },
  alert: {
    loop: false, dur: 0.6,
    keys: [
      { t: 0, pose: { body: [0, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 0.10, e: 'l', pose: { body: [0.18, 0, 0], headS: [0.20, 0, 0], pos: [0, -0.030, 0], sq: [1.10, 0.84] } },
      { t: 0.26, e: 'l', pose: { body: [-0.30, 0, 0], headS: [-0.36, 0, 0], antL: [-0.6, 0.5, 0.6], antR: [-0.6, -0.5, -0.6], pos: [0, 0.070, 0], sq: [0.86, 1.20] } },
      { t: 0.6, pose: { body: [-0.10, 0, 0], headS: [-0.14, 0, 0], pos: [0, 0.006, 0], sq: [0.99, 1.02] } },
    ],
  },
  attack: {
    loop: false, dur: 0.55,
    keys: [
      { t: 0, pose: { body: [-0.10, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 0.18, e: 's', pose: { body: [0.24, 0, 0], headS: [0.20, 0, 0], pos: [0, -0.020, -0.05], sq: [1.06, 0.92] } },
      { t: 0.26, e: 'l', pose: { body: [-0.34, 0, 0], headS: [-0.40, 0, 0], pos: [0, 0.020, 0.14], sq: [0.94, 1.10] } },
      { t: 0.55, pose: { body: [-0.10, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
    ],
  },
  stunned: {
    loop: true, dur: 0.9,
    keys: [
      { t: 0, pose: { body: [0.30, 0.40, 0.55], headS: [0.2, 0.2, 0], legL0: [0.6, 0, 0.5], legR0: [0.5, 0, -0.6], legL1: [0.55, 0, 0.4], legR1: [0.6, 0, -0.5], legL2: [0.5, 0, 0.6], legR2: [0.55, 0, -0.4], pos: [0, -0.055, 0], sq: [1.08, 0.86] } },
      { t: 0.45, pose: { body: [0.34, -0.40, -0.55], headS: [0.2, -0.2, 0], legL0: [0.5, 0, 0.6], legR0: [0.6, 0, -0.5], legL1: [0.6, 0, 0.5], legR1: [0.55, 0, -0.4], legL2: [0.55, 0, 0.4], legR2: [0.5, 0, -0.6], pos: [0, -0.060, 0], sq: [1.09, 0.85] } },
      { t: 0.9, pose: { body: [0.30, 0.40, 0.55], headS: [0.2, 0.2, 0], legL0: [0.6, 0, 0.5], legR0: [0.5, 0, -0.6], legL1: [0.55, 0, 0.4], legR1: [0.6, 0, -0.5], legL2: [0.5, 0, 0.6], legR2: [0.55, 0, -0.4], pos: [0, -0.055, 0], sq: [1.08, 0.86] } },
    ],
  },
  ko: {
    loop: false, dur: 1.2,
    keys: [
      { t: 0, pose: { body: [0, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 0.14, e: 'l', pose: { body: [0, 0, 1.35], legL0: [0.9, 0, 0.8], legR0: [0.9, 0, -0.8], legL1: [0.9, 0, 0.8], legR1: [0.9, 0, -0.8], legL2: [0.9, 0, 0.8], legR2: [0.9, 0, -0.8], pos: [0, -0.055, 0], sq: [1.15, 0.72] } },
      { t: 0.5, e: 'p', pose: { body: [0, 0, 2.95], legL0: [1.1, 0, 0.6], legR0: [1.0, 0, -0.7], legL1: [1.0, 0, 0.7], legR1: [1.1, 0, -0.6], legL2: [1.1, 0, 0.6], legR2: [1.0, 0, -0.7], pos: [0, -0.075, -0.02], sq: [1.18, 0.66] } },
      { t: 1.2, pose: { body: [0, 0, 3.05], legL0: [0.8, 0, 0.5], legR0: [0.9, 0, -0.6], legL1: [0.9, 0, 0.6], legR1: [0.8, 0, -0.5], legL2: [0.9, 0, 0.5], legR2: [0.8, 0, -0.6], pos: [0, -0.075, -0.02], sq: [1.18, 0.66] } },
    ],
  },
  pickpocketed_reaction: {
    loop: false, dur: 1.6,
    keys: [
      { t: 0, pose: { body: [0, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 0.4, pose: { body: [0, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
      { t: 0.62, e: 'l', pose: { body: [0, 0.9, 0.1], headS: [0, 0.6, 0], antL: [-0.5, 0.4, 0.5], antR: [-0.5, -0.4, -0.5], pos: [0, 0.010, 0], sq: [0.97, 1.05] } },
      { t: 0.95, e: 'p', pose: { body: [0, -0.9, -0.1], headS: [0, -0.6, 0], pos: [0, 0.010, 0], sq: [0.97, 1.05] } },
      { t: 1.6, pose: { body: [0, 0, 0], pos: [0, 0, 0], sq: [1, 1] } },
    ],
  },
};

export const CLIP_NAMES = Object.keys(CLIPS);

/* ========================================================================== */
/*  Compiler                                                                  */
/* ========================================================================== */

/**
 * Bake the authored pose tables into flat typed arrays once per type. Runtime sampling then
 * touches nothing but Float32Arrays — no object churn inside update().
 */
function compile(clips) {
  const out = {};
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (const name in clips) {
    const src = clips[name];
    const bones = new Set();
    for (const k of src.keys) for (const b in k.pose) if (b !== 'pos' && b !== 'sq') bones.add(b);
    const boneList = [...bones];
    const n = src.keys.length;

    const times = new Float32Array(n);
    const ease = new Uint8Array(n);          // 0 smooth · 1 linear · 2 punch
    for (let i = 0; i < n; i++) {
      times[i] = src.keys[i].t;
      const c = src.keys[i].e;
      ease[i] = c === 'l' ? 1 : c === 'p' ? 2 : 0;
    }

    const quats = new Float32Array(n * boneList.length * 4);
    for (let i = 0; i < n; i++) {
      const pose = src.keys[i].pose;
      for (let b = 0; b < boneList.length; b++) {
        const r = pose[boneList[b]];
        if (r) { e.set(r[0], r[1], r[2], 'XYZ'); q.setFromEuler(e); }
        else q.identity();
        const o = (i * boneList.length + b) * 4;
        quats[o] = q.x; quats[o + 1] = q.y; quats[o + 2] = q.z; quats[o + 3] = q.w;
      }
    }

    const pos = new Float32Array(n * 3);
    const sq = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = src.keys[i].pose.pos || [0, 0, 0];
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      const s = src.keys[i].pose.sq || [1, 1];
      sq[i * 2] = s[0]; sq[i * 2 + 1] = s[1];
    }

    out[name] = { name, loop: !!src.loop, dur: src.dur, bones: boneList, times, ease, quats, pos, sq };
  }
  return out;
}

let _humanoid = null, _scarab = null;
function clipsFor(type) {
  if (type === 'scarab') return (_scarab ||= compile(SCARAB_CLIPS));
  return (_humanoid ||= compile(CLIPS));
}

const easeFn = [
  (t) => t * t * (3 - 2 * t),                 // smooth
  (t) => t,                                   // linear
  (t) => 1 - (1 - t) * (1 - t) * (1 - t),     // punch: fast out, long settle
];

/* ========================================================================== */
/*  Playback                                                                  */
/* ========================================================================== */

const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _eul = new THREE.Euler();

export class GuardAnim {
  /**
   * @param {Record<string, THREE.Bone>} bones  name → bone
   * @param {string} type  'temple' | 'heavy' | 'scarab'
   * @param {number} seed  per-guard phase offset so a line of guards never marches in step
   */
  constructor(bones, type, seed = 0) {
    this.bones = bones;
    this.type = type;
    this.clips = clipsFor(type);
    this.names = Object.keys(this.clips);

    // Fixed bone order, so every buffer below indexes the same way.
    this.order = Object.keys(bones).filter((n) => n !== 'root');
    this.index = {};
    this.order.forEach((n, i) => { this.index[n] = i; });
    this.boneList = this.order.map((n) => bones[n]);
    this.bindPos = this.boneList.map((b) => b.position.clone());

    const N = this.order.length;
    this._cur = new Float32Array(N * 4);
    this._from = new Float32Array(N * 4);
    this._sample = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) this._cur[i * 4 + 3] = this._from[i * 4 + 3] = this._sample[i * 4 + 3] = 1;

    this.clip = this.clips.idle || this.clips[this.names[0]];
    this.time = seed % (this.clip?.dur || 1);
    this.speed = 1;
    this.loop = true;
    this.finished = false;

    this._fade = 0; this._fadeDur = 0;
    this._fromPos = new THREE.Vector3();
    this._fromSq = new THREE.Vector2(1, 1);

    this.hipsOffset = new THREE.Vector3();
    this.rootScale = new THREE.Vector3(1, 1, 1);

    this._lookYaw = 0; this._lookPitch = 0;
    this._lookTargetYaw = 0; this._lookTargetPitch = 0;
    this._lookWeight = 0; this._lookWant = 0;

    /* secondary motion springs: [angle, velocity] per axis for tail and headcloth */
    this._lagY = 0; this._lagYv = 0;
    this._lagX = 0; this._lagXv = 0;
    this._turnRate = 0; this._accel = 0;

    this._breath = seed * 1.7;
    this._seed = seed;
    this._frozen = false;
  }

  clipNames() { return this.names.slice(); }
  isPlaying(name) { return this.clip?.name === name; }
  get current() { return this.clip?.name || ''; }

  /** Cross-fade to a clip. Re-playing the current clip is a no-op unless `restart`. */
  play(name, { fade = TUNE.fade, loop = null, speed = 1, restart = false } = {}) {
    const clip = this.clips[name] || this.clips.idle;
    if (!clip) return;
    if (this.clip === clip && !restart) { this.speed = speed; return; }
    this._from.set(this._cur);
    this._fromPos.copy(this.hipsOffset);
    this._fromSq.set(this.rootScale.x, this.rootScale.y);
    this._fade = fade > 0 ? fade : 0;
    this._fadeDur = this._fade;
    this.clip = clip;
    this.time = 0;
    this.speed = speed;
    this.loop = loop === null ? clip.loop : loop;
    this.finished = false;
  }

  /** Hold one frame of a clip — the screenshot harness needs a deterministic pose. */
  freeze(name, t = 0) {
    const clip = this.clips[name];
    if (!clip) return false;
    this.clip = clip;
    this.time = THREE.MathUtils.clamp(t, 0, clip.dur);
    this._fade = 0;
    this.loop = clip.loop;
    this._frozen = true;
    this.update(0);
    return true;
  }

  unfreeze() { this._frozen = false; }

  /** Continuous state from Guard.js: drives cycle speed and the secondary-motion springs. */
  setLocomotion(speed, turnRate, accel) {
    this._speed = speed;
    this._turnRate = turnRate;
    this._accel = accel;
  }

  /** Additive head/neck aim, in the guard's own local frame. Pass weight 0 to release. */
  setLook(yaw, pitch, weight = 1) {
    this._lookTargetYaw = THREE.MathUtils.clamp(yaw, -TUNE.lookMaxYaw, TUNE.lookMaxYaw);
    this._lookTargetPitch = THREE.MathUtils.clamp(pitch, -TUNE.lookMaxPitch, TUNE.lookMaxPitch);
    this._lookWant = weight;
  }

  /* -------------------------------------------------------------------- */

  update(dt) {
    const clip = this.clip;
    if (!clip) return;

    if (!this._frozen) {
      this.time += dt * this.speed;
      if (this.time >= clip.dur) {
        if (this.loop) this.time %= clip.dur;
        else { this.time = clip.dur; this.finished = true; }
      }
    }

    this._sampleClip(clip, this.time);

    // cross-fade
    if (this._fade > 0) {
      this._fade = Math.max(0, this._fade - dt);
      const w = this._fadeDur > 0 ? 1 - this._fade / this._fadeDur : 1;
      const k = w * w * (3 - 2 * w);
      const N = this.order.length;
      for (let i = 0; i < N; i++) {
        const o = i * 4;
        _q0.set(this._from[o], this._from[o + 1], this._from[o + 2], this._from[o + 3]);
        _q1.set(this._sample[o], this._sample[o + 1], this._sample[o + 2], this._sample[o + 3]);
        _q0.slerp(_q1, k);
        this._cur[o] = _q0.x; this._cur[o + 1] = _q0.y; this._cur[o + 2] = _q0.z; this._cur[o + 3] = _q0.w;
      }
      this.hipsOffset.lerpVectors(this._fromPos, this._pos, k);
      this.rootScale.x = THREE.MathUtils.lerp(this._fromSq.x, this._sq.x, k);
      this.rootScale.z = this.rootScale.x;
      this.rootScale.y = THREE.MathUtils.lerp(this._fromSq.y, this._sq.y, k);
    } else {
      this._cur.set(this._sample);
      this.hipsOffset.copy(this._pos);
      this.rootScale.set(this._sq.x, this._sq.y, this._sq.x);
    }

    this._applyOverlays(dt);
    this._write();
  }

  /* --- sampling --------------------------------------------------------- */

  _sampleClip(clip, time) {
    const n = clip.times.length;
    let i = 0;
    while (i < n - 2 && time > clip.times[i + 1]) i++;
    const t0 = clip.times[i], t1 = clip.times[Math.min(i + 1, n - 1)];
    let f = t1 > t0 ? (time - t0) / (t1 - t0) : 0;
    f = easeFn[clip.ease[Math.min(i + 1, n - 1)]](THREE.MathUtils.clamp(f, 0, 1));

    const B = clip.bones.length;
    const outN = this.order.length;
    // default: identity for every bone this clip does not author
    for (let b = 0; b < outN; b++) {
      const o = b * 4;
      this._sample[o] = 0; this._sample[o + 1] = 0; this._sample[o + 2] = 0; this._sample[o + 3] = 1;
    }
    for (let b = 0; b < B; b++) {
      const dst = this.index[clip.bones[b]];
      if (dst === undefined) continue;
      const oa = (i * B + b) * 4, ob = (Math.min(i + 1, n - 1) * B + b) * 4;
      _q0.set(clip.quats[oa], clip.quats[oa + 1], clip.quats[oa + 2], clip.quats[oa + 3]);
      _q1.set(clip.quats[ob], clip.quats[ob + 1], clip.quats[ob + 2], clip.quats[ob + 3]);
      _q0.slerp(_q1, f);
      const o = dst * 4;
      this._sample[o] = _q0.x; this._sample[o + 1] = _q0.y; this._sample[o + 2] = _q0.z; this._sample[o + 3] = _q0.w;
    }

    const j = Math.min(i + 1, n - 1);
    this._pos = this._pos || new THREE.Vector3();
    this._sq = this._sq || new THREE.Vector2(1, 1);
    this._pos.set(
      THREE.MathUtils.lerp(clip.pos[i * 3], clip.pos[j * 3], f),
      THREE.MathUtils.lerp(clip.pos[i * 3 + 1], clip.pos[j * 3 + 1], f),
      THREE.MathUtils.lerp(clip.pos[i * 3 + 2], clip.pos[j * 3 + 2], f));
    this._sq.set(
      THREE.MathUtils.lerp(clip.sq[i * 2], clip.sq[j * 2], f),
      THREE.MathUtils.lerp(clip.sq[i * 2 + 1], clip.sq[j * 2 + 1], f));
  }

  /* --- additive layers -------------------------------------------------- */

  _applyOverlays(dt) {
    /* breath — a slow chest expansion that never stops, even in the freeze frames */
    this._breath += dt * TUNE.breathRate;
    const br = Math.sin(this._breath * Math.PI * 2) * TUNE.breathAmp;
    this._addEuler('chest', -br * 0.7, 0, 0);
    this._addEuler('spine', -br * 0.3, 0, 0);
    this._addEuler('body', -br * 1.4, 0, 0);       // scarab

    /* look-at — split across neck and head so it reads as a neck and not a turret */
    this._lookWeight += (this._lookWant - this._lookWeight) * Math.min(1, dt * 5.0);
    const k = Math.min(1, dt * TUNE.lookRate);
    this._lookYaw += (this._lookTargetYaw - this._lookYaw) * k;
    this._lookPitch += (this._lookTargetPitch - this._lookPitch) * k;
    if (this._lookWeight > 0.005) {
      const w = this._lookWeight;
      const ny = this._lookYaw * TUNE.neckShare * w, hy = this._lookYaw * (1 - TUNE.neckShare) * w;
      const np = this._lookPitch * TUNE.neckShare * w, hp = this._lookPitch * (1 - TUNE.neckShare) * w;
      this._addEuler('neck', np, ny, 0);
      this._addEuler('head', hp, hy, this._lookYaw * 0.10 * w);   // a little counter-tilt
      this._addEuler('headS', hp, hy, 0);                          // scarab
    }

    /* secondary motion: the tail and the headcloth lag the turn and then overshoot it.
       This is a spring, not a delay — the overshoot is the whole point. */
    const target = -this._turnRate * TUNE.lagGain;
    this._lagYv += (target - this._lagY) * TUNE.lagStiffness * dt - this._lagYv * TUNE.lagDamping * dt;
    this._lagY += this._lagYv * dt;
    this._lagY = THREE.MathUtils.clamp(this._lagY, -0.55, 0.55);

    const targetX = -(this._accel || 0) * 0.030;
    this._lagXv += (targetX - this._lagX) * TUNE.lagStiffness * dt - this._lagXv * TUNE.lagDamping * dt;
    this._lagX += this._lagXv * dt;
    this._lagX = THREE.MathUtils.clamp(this._lagX, -0.40, 0.40);

    this._addEuler('tailA', this._lagX * 0.6, this._lagY * 0.9, 0);
    this._addEuler('tailB', this._lagX * 0.9, this._lagY * 1.4, 0);
    this._addEuler('nemesL', this._lagX * 0.5, this._lagY * 0.7, -this._lagY * 0.5);
    this._addEuler('nemesR', this._lagX * 0.5, this._lagY * 0.7, -this._lagY * 0.5);
    this._addEuler('nemesB', this._lagX * 0.8, this._lagY * 1.1, 0);
    this._addEuler('antL', this._lagX * 1.4, this._lagY * 1.8, 0);
    this._addEuler('antR', this._lagX * 1.4, this._lagY * 1.8, 0);
  }

  _addEuler(name, rx, ry, rz) {
    const i = this.index[name];
    if (i === undefined) return;
    if (rx === 0 && ry === 0 && rz === 0) return;
    const o = i * 4;
    _q0.set(this._cur[o], this._cur[o + 1], this._cur[o + 2], this._cur[o + 3]);
    _eul.set(rx, ry, rz, 'XYZ');
    _qt.setFromEuler(_eul);
    _q0.multiply(_qt);
    this._cur[o] = _q0.x; this._cur[o + 1] = _q0.y; this._cur[o + 2] = _q0.z; this._cur[o + 3] = _q0.w;
  }

  _write() {
    const N = this.order.length;
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const b = this.boneList[i];
      b.quaternion.set(this._cur[o], this._cur[o + 1], this._cur[o + 2], this._cur[o + 3]);
    }
    const hips = this.bones.hips || this.bones.body;
    if (hips) {
      const i = this.index[hips.name];
      const bind = this.bindPos[i];
      if (bind) hips.position.set(bind.x + this.hipsOffset.x, bind.y + this.hipsOffset.y, bind.z + this.hipsOffset.z);
    }
  }
}

export { CLIPS as GUARD_CLIPS, SCARAB_CLIPS as GUARD_SCARAB_CLIPS };
