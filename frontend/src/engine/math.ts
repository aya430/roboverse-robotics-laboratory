// Minimal, dependency-free linear algebra used by the robotics engine.
// All quantities are SI (m, kg, s, rad, N, N·m, A, V, W, J).
// The engine never imports three.js so it can run unchanged in a Web Worker,
// in unit tests (Node) and, later, be ported 1:1 to the Python/C++ backend.

export type V3 = [number, number, number];
export type M3 = number[]; // row-major 3x3, length 9

/** Rigid transform: rotation R (row-major 3x3) and translation p. */
export interface Tf { R: M3; p: V3 }

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: V3): V3 => {
  const n = norm(a);
  return n < 1e-15 ? [0, 0, 0] : scale(a, 1 / n);
};

export const I3 = (): M3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const mm = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
};
export const mv = (A: M3, v: V3): V3 => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
];
export const mtv = (A: M3, v: V3): V3 => [
  A[0] * v[0] + A[3] * v[1] + A[6] * v[2],
  A[1] * v[0] + A[4] * v[1] + A[7] * v[2],
  A[2] * v[0] + A[5] * v[1] + A[8] * v[2],
];
export const transpose = (A: M3): M3 => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
export const madd = (A: M3, B: M3): M3 => A.map((a, i) => a + B[i]);
export const mscale = (A: M3, s: number): M3 => A.map((a) => a * s);

export const rotX = (t: number): M3 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const rotY = (t: number): M3 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rotZ = (t: number): M3 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
/** Intrinsic X-Y-Z Euler angles in degrees (R = Rx·Ry·Rz), matching three.js 'XYZ'. */
export const eulerDeg = (e: V3 | undefined): M3 => {
  if (!e) return I3();
  const d = Math.PI / 180;
  return mm(mm(rotX(e[0] * d), rotY(e[1] * d)), rotZ(e[2] * d));
};
/** Rodrigues rotation about a unit axis. */
export const rotAxis = (k: V3, t: number): M3 => {
  const [x, y, z] = k, c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
};
export const skew = (a: V3): M3 => [0, -a[2], a[1], a[2], 0, -a[0], -a[1], a[0], 0];

export const tf = (R: M3 = I3(), p: V3 = [0, 0, 0]): Tf => ({ R, p });
export const tmul = (A: Tf, B: Tf): Tf => ({ R: mm(A.R, B.R), p: add(mv(A.R, B.p), A.p) });
export const tinv = (A: Tf): Tf => {
  const Rt = transpose(A.R);
  return { R: Rt, p: scale(mv(Rt, A.p), -1) };
};
export const tapply = (A: Tf, v: V3): V3 => add(mv(A.R, v), A.p);

/** Rotation matrix → (roll, pitch, yaw) as used by URDF (R = Rz(y)·Ry(p)·Rx(r)). */
export const rpyFromR = (R: M3): V3 => {
  const sp = -R[6];
  const pitch = Math.asin(Math.max(-1, Math.min(1, sp)));
  let roll: number, yaw: number;
  if (Math.abs(Math.cos(pitch)) > 1e-9) {
    roll = Math.atan2(R[7], R[8]);
    yaw = Math.atan2(R[3], R[0]);
  } else {
    roll = Math.atan2(-R[5], R[4]);
    yaw = 0;
  }
  return [roll, pitch, yaw];
};

/** Rotation error vector (axis·angle) taking Ra to Rb, expressed in the base frame. */
export const rotError = (Ra: M3, Rb: M3): V3 => {
  const Re = mm(Rb, transpose(Ra));
  const tr = Re[0] + Re[4] + Re[8];
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  const v: V3 = [Re[7] - Re[5], Re[2] - Re[6], Re[3] - Re[1]];
  if (ang < 1e-9) return scale(v, 0.5);
  const s = Math.sin(ang);
  if (Math.abs(s) < 1e-6) {
    // ~180°: extract axis from the symmetric part
    const x = Math.sqrt(Math.max(0, (Re[0] + 1) / 2));
    const y = Math.sqrt(Math.max(0, (Re[4] + 1) / 2)) * (Re[1] >= 0 ? 1 : -1);
    const z = Math.sqrt(Math.max(0, (Re[8] + 1) / 2)) * (Re[2] >= 0 ? 1 : -1);
    return scale(normalize([x, y, z]), ang);
  }
  return scale(v, ang / (2 * s));
};

// ---------- dense n×n helpers (row-major Float64Array) ----------
export function choleskySolve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error('Mass matrix is not positive definite');
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Solve a general small square system with partial pivoting (in place copies). */
export function luSolve(Ain: number[][], bin: number[]): number[] {
  const n = bin.length;
  const A = Ain.map((r) => r.slice());
  const b = bin.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / (A[r][r] || 1e-12);
  }
  return x;
}

export function det(Ain: number[][]): number {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return 0;
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; d = -d; }
    d *= A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return d;
}

/** Joint motion transform: rotation about z (revolute) or translation along z (prismatic). */
export const jointTf = (prismatic: boolean | undefined, q: number): Tf => (prismatic ? tf(I3(), [0, 0, q]) : tf(rotZ(q)));
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
