import * as THREE from 'three';

/**
 * Canonical camera setups (AGENTS.md §7.2).
 *
 * These are the frames the harsh-critic loop judges, so they are FIXED. World coordinates
 * here are a contract: the ARCHITECTURE / TERRAIN / PROPS agents must build the level so
 * that these camera positions frame the thing each shot is named for. See §8.1 of AGENTS.md
 * for the level's coordinate layout.
 *
 * Each shot may specify:
 *   pos, target   camera placement (metres)
 *   fov           vertical FOV in degrees — long lenses compress and read more cinematic
 *   tod           time of day 0..1 (0.5 noon, 0.78 golden hour, 0.02 night)
 *   player        { pos, yaw, pose } — pose is an animation clip name to freeze on
 *   hidePlayer    keep Sly out of a pure-environment frame
 *   roll          camera roll in degrees; a couple of degrees of dutch reads as authored
 */
export const SHOTS = {
  /* The money shot. Sly perched on the courtyard architrave, golden hour raking across
     the complex, Great Pyramid hazed in the distance. If one frame has to sell the game,
     this is it. */
  hero: {
    pos: [15.5, 12.2, 26.0], target: [-1.0, 7.4, 4.0], fov: 46, tod: 0.79, roll: -1.5,
    player: { pos: [2.2, 9.0, 8.4], yaw: -2.35, pose: 'perch_idle' },
  },

  /* Hypostyle hall — the column forest, clerestory light shafts, hieroglyph walls. */
  temple: {
    pos: [9.0, 3.4, -22.0], target: [-4.0, 8.5, -44.0], fov: 55, tod: 0.72,
    player: { pos: [6.0, 0.0, -26.0], yaw: -1.1, pose: 'sneak_idle' },
  },

  /* Character sheet. Tight on Sly: cel bands, ink lines, fur, cloth, cane, face. */
  'sly-closeup': {
    pos: [1.9, 1.72, 3.35], target: [0.0, 1.35, 0.0], fov: 34, tod: 0.80,
    player: { pos: [0, 0, 0], yaw: 0.55, pose: 'idle_confident' },
  },

  /* Composition + props: obelisk, colossi, braziers, palms, banners. */
  courtyard: {
    pos: [-19.0, 5.6, 30.0], target: [1.0, 9.0, 12.0], fov: 50, tod: 0.76, roll: 1.0,
    player: { pos: [-9.5, 0.0, 20.0], yaw: 0.8, pose: 'run' },
  },

  /* Terrain + sky + aerial perspective. The approach ridge looking back at the complex. */
  dunes: {
    pos: [26.0, 19.5, 84.0], target: [-2.0, 9.0, 18.0], fov: 42, tod: 0.83,
    hidePlayer: false,
    player: { pos: [22.0, 16.4, 76.0], yaw: -2.9, pose: 'idle_confident' },
  },

  /* Interior lighting: torch-lit tomb, warm key against cold fill, heavy volumetrics. */
  interior: {
    pos: [3.2, -9.2, -60.0], target: [-1.5, -11.5, -74.0], fov: 52, tod: 0.5,
    player: { pos: [1.4, -12.0, -66.0], yaw: -2.9, pose: 'sneak_idle' },
  },

  /* Palette flip. Moonlit stealth: cool key, warm brazier accents, blue sparkles. */
  night: {
    pos: [-11.0, 8.4, 22.0], target: [2.0, 6.0, 2.0], fov: 48, tod: 0.02,
    player: { pos: [-4.0, 5.2, 12.5], yaw: 1.15, pose: 'sneak_walk' },
  },

  /* Motion tech, caught mid-arc: Sly swinging on a cane hook over the courtyard gap. */
  traversal: {
    pos: [12.0, 14.0, 6.0], target: [-3.0, 11.0, -12.0], fov: 44, tod: 0.77, roll: -3.0,
    player: { pos: [1.0, 12.4, -3.0], yaw: -1.9, pose: 'hook_swing' },
  },

  /* Impact frame: third hit of the cane combo landing on a guard, full FX. */
  combat: {
    pos: [4.6, 2.35, 5.4], target: [-0.6, 1.5, 1.0], fov: 40, tod: 0.74,
    player: { pos: [0, 0, 2.0], yaw: 0.15, pose: 'cane_combo_3' },
  },

  /* Guard sheet: silhouette, uniform, patrol light cone. */
  guard: {
    pos: [3.0, 2.0, 4.2], target: [-0.8, 1.5, 0.0], fov: 38, tod: 0.06,
    player: { pos: [-6, 0, 6], yaw: 0.0, pose: 'sneak_idle' },
  },
};

export const SHOT_NAMES = Object.keys(SHOTS);

const _v = new THREE.Vector3();

/** Apply a shot to the camera. Returns the resolved shot definition. */
export function applyShot(engine, name) {
  const shot = SHOTS[name];
  if (!shot) return null;
  const cam = engine.camera;

  cam.position.fromArray(shot.pos);
  cam.fov = shot.fov ?? 50;
  cam.up.set(0, 1, 0);
  cam.lookAt(_v.fromArray(shot.target));
  if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  engine.debug.timeOfDay = shot.tod ?? 0.78;
  engine.debug.hidePlayer = !!shot.hidePlayer;
  engine.emit('timeOfDay', engine.debug.timeOfDay);
  engine.emit('shot', { name, shot });
  return shot;
}
