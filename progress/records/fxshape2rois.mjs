/**
 * fxshape2 — the registered ROIs, shared by the runner (ray-cast centres) and the scorer
 * (attribution windows). One module so the two cannot drift; the numbers are PREREG-fxshape2
 * §2's table verbatim and MUST NOT be edited after `shots/fxshape2/` exists (§141.1).
 *
 * Centres are the r10 observations (shots/r10/, commit 58e3f49), not the projections, so a
 * placement drift between trees surfaces as a SUBJECT-PRESENT failure instead of a silent
 * re-aim. `h` is the half-side of the square ROI in pixels at 1280x720.
 */
export const ROIS = [
  { id: 'T1', shot: 'traversal', x: 427, y: 66, h: 16, label: 'ring-chain blob 1' },
  { id: 'T2', shot: 'traversal', x: 443, y: 113, h: 16, label: 'ring-chain blob 2' },
  { id: 'T3', shot: 'traversal', x: 449, y: 158, h: 12, label: 'ring-chain blob 3' },
  { id: 'T4', shot: 'traversal', x: 459, y: 175, h: 11, label: 'ring-chain blob 4' },
  { id: 'H1', shot: 'hero', x: 631, y: 271, h: 22, label: 'ring above the ledge' },
  { id: 'H2', shot: 'hero', x: 770, y: 20, h: 14, label: 'top-edge disc' },
  { id: 'I1', shot: 'interior', x: 632, y: 387, h: 14, label: 'ball above Sly' },
  { id: 'I2', shot: 'interior', x: 334, y: 578, h: 16, label: 'floor-left disc' },
  { id: 'C1', shot: 'courtyard', x: 532, y: 76, h: 14, label: 'sky ring 1' },
  { id: 'C2', shot: 'courtyard', x: 790, y: 100, h: 14, label: 'sky ring 2' },
  { id: 'G1', shot: 'guard', x: 490, y: 635, h: 18, label: 'dark disc 1' },
  { id: 'G2', shot: 'guard', x: 1080, y: 445, h: 16, label: 'dark disc 2' },
];

export const SHOTS_UNDER_TEST = ['hero', 'interior', 'courtyard', 'traversal', 'guard'];
export const ARMS = ['base', 'nocoins', 'notreasure', 'noringfx', 'nopickups', 'base2'];
