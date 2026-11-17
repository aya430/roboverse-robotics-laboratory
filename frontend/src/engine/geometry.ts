// Procedural CAD primitives: volumes, inertia tensors, bounding extents and URDF mapping.
// Pure functions (no three.js) shared by the engine (mass properties, URDF) and the renderer.
//
// All primitives are expressed in the shape's own frame; "axis" primitives run along local +z,
// centred on `pos` (so a cylinder of height h spans z ∈ [−h/2, h/2] around its position).

import type { M3 } from './math';

export type ShapeKind =
  | 'cyl'      // [r, h]
  | 'box'      // [x, y, z]
  | 'rbox'     // [x, y, z, edgeRadius]
  | 'tube'     // [rOuter, rInner, h]
  | 'cone'     // [rBottom, rTop, h]          (frustum)
  | 'sphere'   // [r]
  | 'torus'    // [R, r]                      (ring in the xy plane)
  | 'hex'      // [acrossFlats, h]            (hex nut / bolt head / standoff)
  | 'gear'     // [module, teeth, width, bore, helixDeg?]   (involute-like spur/helical gear)
  | 'profile'  // [size, length, slotCount?]  (aluminium T-slot extrusion, e.g. 20 → 2020)
  | 'spring'   // [coilRadius, wireRadius, length, turns]
  | 'bolts'    // [pcd, count, headDia, headH] (ring of socket-head cap screws)
  | 'fins'     // [x, y, baseH, finH, finCount]  (heat-sink)
  | 'mesh';    // [bboxX, bboxY, bboxZ, volume]  (imported CAD tessellation, centred on its bbox)

export interface ShapeGeom { kind: ShapeKind; dims: number[] }

const PI = Math.PI;
const PROFILE_FILL = 0.42; // cross-section area of a T-slot profile ≈ 42 % of its square envelope

export function shapeVolume(s: ShapeGeom): number {
  const d = s.dims;
  switch (s.kind) {
    case 'cyl': return PI * d[0] ** 2 * d[1];
    case 'box': case 'rbox': return d[0] * d[1] * d[2];
    case 'tube': return PI * (d[0] ** 2 - d[1] ** 2) * d[2];
    case 'cone': return (PI * d[2] * (d[0] ** 2 + d[0] * d[1] + d[1] ** 2)) / 3;
    case 'sphere': return (4 / 3) * PI * d[0] ** 3;
    case 'torus': return 2 * PI * PI * d[0] * d[1] ** 2;
    case 'hex': return (Math.sqrt(3) / 2) * d[0] ** 2 * d[1];
    case 'gear': { const rp = (d[0] * d[1]) / 2; return PI * (rp ** 2 - (d[3] / 2) ** 2) * d[2]; }
    case 'profile': return PROFILE_FILL * profileSide(d[0]) ** 2 * d[1];
    case 'spring': return PI * d[1] ** 2 * Math.hypot(2 * PI * d[0] * d[3], d[2]);
    case 'bolts': return d[1] * PI * (d[2] / 2) ** 2 * d[3];
    case 'fins': return d[0] * d[1] * d[2] + d[4] * d[0] * 0.0015 * d[3];
    case 'mesh': return d[3] > 0 ? d[3] : d[0] * d[1] * d[2] * 0.5;
  }
}

/** Profile size is given in mm (20, 30, 40, 80) and length in metres. */
export const profileSide = (size: number) => size / 1000;

/** Solid-body inertia about the shape centre, in the shape frame, for mass m. */
export function shapeInertia(s: ShapeGeom, m: number): M3 {
  const d = s.dims;
  const cylLike = (ro: number, ri: number, h: number): M3 => {
    const z = (m * (ro * ro + ri * ri)) / 2;
    const t = (m * (3 * (ro * ro + ri * ri) + h * h)) / 12;
    return [t, 0, 0, 0, t, 0, 0, 0, z];
  };
  const boxLike = (x: number, y: number, z: number): M3 => [
    (m * (y * y + z * z)) / 12, 0, 0, 0, (m * (x * x + z * z)) / 12, 0, 0, 0, (m * (x * x + y * y)) / 12,
  ];
  switch (s.kind) {
    case 'cyl': return cylLike(d[0], 0, d[1]);
    case 'box': case 'rbox': return boxLike(d[0], d[1], d[2]);
    case 'tube': return cylLike(d[0], d[1], d[2]);
    case 'cone': return cylLike(Math.sqrt((d[0] ** 2 + d[0] * d[1] + d[1] ** 2) / 3), 0, d[2]);
    case 'sphere': { const v = 0.4 * m * d[0] ** 2; return [v, 0, 0, 0, v, 0, 0, 0, v]; }
    case 'torus': { const a = m * (0.5 * d[0] ** 2 + 0.625 * d[1] ** 2); return [a, 0, 0, 0, a, 0, 0, 0, m * (d[0] ** 2 + 0.75 * d[1] ** 2)]; }
    case 'hex': return cylLike(d[0] * 0.525, 0, d[1]);
    case 'gear': return cylLike((d[0] * d[1]) / 2, d[3] / 2, d[2]);
    case 'profile': { const a = profileSide(d[0]); return boxLike(a, a, d[1]); }
    case 'spring': return cylLike(d[0] + d[1], Math.max(0, d[0] - d[1]), d[2]);
    case 'bolts': return cylLike(d[0] / 2 + d[2] / 2, Math.max(0, d[0] / 2 - d[2] / 2), d[3]);
    case 'fins': return boxLike(d[0], d[1], d[2] + d[3]);
    case 'mesh': return boxLike(d[0], d[1], d[2]);
  }
}

/** Half extents of the axis-aligned bounding box in the shape frame. */
export function halfExtents(s: ShapeGeom): [number, number, number] {
  const d = s.dims;
  switch (s.kind) {
    case 'cyl': return [d[0], d[0], d[1] / 2];
    case 'box': case 'rbox': return [d[0] / 2, d[1] / 2, d[2] / 2];
    case 'tube': return [d[0], d[0], d[2] / 2];
    case 'cone': { const r = Math.max(d[0], d[1]); return [r, r, d[2] / 2]; }
    case 'sphere': return [d[0], d[0], d[0]];
    case 'torus': return [d[0] + d[1], d[0] + d[1], d[1]];
    case 'hex': return [d[0] / Math.sqrt(3), d[0] / 2, d[1] / 2];
    case 'gear': { const ra = (d[0] * d[1]) / 2 + d[0]; return [ra, ra, d[2] / 2]; }
    case 'profile': { const a = profileSide(d[0]) / 2; return [a, a, d[1] / 2]; }
    case 'spring': return [d[0] + d[1], d[0] + d[1], d[2] / 2];
    case 'bolts': { const r = d[0] / 2 + d[2] / 2; return [r, r, d[3] / 2]; }
    case 'fins': return [d[0] / 2, d[1] / 2, (d[2] + d[3]) / 2];
    case 'mesh': return [d[0] / 2, d[1] / 2, d[2] / 2];
  }
}

/** URDF primitive approximating the shape (URDF only knows box/cylinder/sphere/mesh). */
export function urdfGeometry(s: ShapeGeom): string {
  const d = s.dims, f = (v: number) => v.toPrecision(5).replace(/\.?0+$/, '');
  const he = halfExtents(s);
  switch (s.kind) {
    case 'sphere': return `<sphere radius="${f(d[0])}"/>`;
    case 'box': case 'rbox': case 'profile': case 'fins': case 'mesh':
      return `<box size="${f(2 * he[0])} ${f(2 * he[1])} ${f(2 * he[2])}"/>`;
    default:
      return `<cylinder radius="${f(he[0])}" length="${f(2 * he[2])}"/>`;
  }
}
