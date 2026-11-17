// Forward / inverse kinematics, geometric Jacobian, manipulability, workspace and DH extraction.

import type { RobotModel } from './robotModel';
import {
  add, cross, det, dot, luSolve, mm, mv, norm, normalize, rotError, rotZ, scale, sub, tf, tinv, tmul, transpose, jointTf,
  type M3, type Tf, type V3, clamp, rotX,
} from './math';

/** Body frames B_1..B_n (world) and TCP frame for joint vector q. */
export function fk(model: RobotModel, q: ArrayLike<number>): { frames: Tf[]; tcp: Tf } {
  const frames: Tf[] = [];
  let T: Tf = tf();
  for (let i = 0; i < model.n; i++) {
    T = tmul(tmul(T, model.joints[i].X), jointTf(model.joints[i].type === 'prismatic', q[i] ?? 0));
    frames.push(T);
  }
  return { frames, tcp: tmul(T, model.tool) };
}

/** 6×n geometric Jacobian (rows: vx vy vz wx wy wz) at the TCP, world frame. */
export function jacobian(model: RobotModel, q: ArrayLike<number>): number[][] {
  const { frames, tcp } = fk(model, q);
  const J: number[][] = Array.from({ length: 6 }, () => new Array(model.n).fill(0));
  for (let i = 0; i < model.n; i++) {
    const z: V3 = [frames[i].R[2], frames[i].R[5], frames[i].R[8]];
    if (model.joints[i].type === 'prismatic') { for (let r = 0; r < 3; r++) { J[r][i] = z[r]; J[r + 3][i] = 0; } continue; }
    const v = cross(z, sub(tcp.p, frames[i].p));
    for (let r = 0; r < 3; r++) { J[r][i] = v[r]; J[r + 3][i] = z[r]; }
  }
  return J;
}

/** Yoshikawa manipulability √det(J Jᵀ) (6-row) – 0 at singularities. */
export function manipulability(model: RobotModel, q: ArrayLike<number>): number {
  const J = jacobian(model, q);
  const m = J.length;
  const JJt = Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, c) => J[r].reduce((s, v, k) => s + v * J[c][k], 0)));
  if (model.n < 6) {
    // use JᵀJ for under-actuated arms
    const JtJ = Array.from({ length: model.n }, (_, r) => Array.from({ length: model.n }, (_, c) => J.reduce((s, row) => s + row[r] * row[c], 0)));
    return Math.sqrt(Math.max(0, det(JtJ)));
  }
  return Math.sqrt(Math.max(0, det(JJt)));
}

export interface IKTarget { p: V3; R?: M3 }
export interface IKResult { q: number[]; ok: boolean; iterations: number; posErr: number; rotErr: number; message: string }

/**
 * Damped-least-squares IK with joint-limit clamping.
 * Position error weighted in metres, orientation error in radians (weight wR).
 */
export function ik(model: RobotModel, target: IKTarget, q0: ArrayLike<number>, opts: { maxIter?: number; tolP?: number; tolR?: number; wR?: number } = {}): IKResult {
  const n = model.n;
  const maxIter = opts.maxIter ?? 300, tolP = opts.tolP ?? 1e-4, tolR = opts.tolR ?? 1e-3, wR = opts.wR ?? 0.3;
  let q = Array.from(q0);
  let lambda = 0.05;
  let ep = Infinity, er = 0;
  const useRot = !!target.R && n >= 6;
  const errOf = (qq: number[]) => {
    const { tcp } = fk(model, qq);
    const e = sub(target.p, tcp.p);
    const r: V3 = useRot ? rotError(tcp.R, target.R!) : [0, 0, 0];
    return { e, r, cost: dot(e, e) + wR * wR * dot(r, r) };
  };
  let cur = errOf(q);
  for (let it = 0; it < maxIter; it++) {
    ep = norm(cur.e); er = norm(cur.r);
    if (ep < tolP && (!useRot || er < tolR)) return { q, ok: true, iterations: it, posErr: ep, rotErr: er, message: 'Converged' };
    const J = jacobian(model, q);
    const rows = useRot ? 6 : 3;
    const Jr = J.slice(0, rows).map((row, r) => (r >= 3 ? row.map((v) => v * wR) : row));
    const err = useRot ? [...cur.e, ...scale(cur.r, wR)] : [...cur.e];
    // dq = Jᵀ (J Jᵀ + λ² I)⁻¹ e
    const A = Array.from({ length: rows }, (_, r) => Array.from({ length: rows }, (_, c) => Jr[r].reduce((s, v, k) => s + v * Jr[c][k], 0) + (r === c ? lambda * lambda : 0)));
    const y = luSolve(A, err);
    const dq = Array.from({ length: n }, (_, k) => Jr.reduce((s, row, r) => s + row[k] * y[r], 0));
    const step = Math.max(...dq.map(Math.abs));
    const sc = step > 0.3 ? 0.3 / step : 1;
    const qn = q.map((v, k) => clamp(v + dq[k] * sc, model.joints[k].lo, model.joints[k].hi));
    const nx = errOf(qn);
    if (nx.cost < cur.cost) { q = qn; cur = nx; lambda = Math.max(1e-3, lambda * 0.7); }
    else lambda = Math.min(1, lambda * 2.5);
  }
  ep = norm(cur.e); er = norm(cur.r);
  const ok = ep < 1e-3 && (!useRot || er < 1e-2);
  return { q, ok, iterations: maxIter, posErr: ep, rotErr: er, message: ok ? 'Converged (relaxed tolerance)' : 'Target not reached – outside workspace, joint limits active or near a singularity' };
}

/** Monte-Carlo workspace sampling of the TCP position. */
export function sampleWorkspace(model: RobotModel, samples = 4000, seed = 1): Float32Array {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = new Float32Array(samples * 3);
  const q = new Array(model.n).fill(0);
  for (let k = 0; k < samples; k++) {
    for (let i = 0; i < model.n; i++) q[i] = model.joints[i].lo + rnd() * (model.joints[i].hi - model.joints[i].lo);
    const p = fk(model, q).tcp.p;
    out[k * 3] = p[0]; out[k * 3 + 1] = p[1]; out[k * 3 + 2] = p[2];
  }
  return out;
}

// ---------------- Standard Denavit–Hartenberg extraction ----------------
export interface DHRow { joint: string; theta0: number; d: number; a: number; alpha: number }
export interface DHResult { rows: DHRow[]; base: Tf; tool: Tf }

const fromAxes = (x: V3, z: V3, o: V3): Tf => {
  const y = cross(z, x);
  return { R: [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], p: o };
};

/**
 * Derive standard DH parameters from the joint axes at the zero configuration.
 * Frame i−1 has z along axis i; x_i lies on the common normal between axes i and i+1.
 * Returns base (world → frame 0) and tool (frame n → TCP) transforms so that
 * T_tcp(q) = base · Π A_i(θ_i = q_i + θ0_i) · tool exactly.
 */
export function extractDH(model: RobotModel): DHResult | null {
  if (model.joints.some((J) => J.type === 'prismatic')) return null; // revolute chains only (prismatic: d is the variable)
  const n = model.n;
  const zero = new Array(n).fill(0);
  const { frames, tcp } = fk(model, zero);
  const axes = frames.map((F) => ({ o: F.p, z: [F.R[2], F.R[5], F.R[8]] as V3 }));
  // frame list: Z_0..Z_{n-1} = joint axes, Z_n = last joint axis through TCP
  const Z: { o: V3; z: V3 }[] = [...axes, { o: tcp.p, z: axes[n - 1].z }];
  const frm: { o: V3; x: V3; z: V3 }[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0) frm.push({ o: Z[0].o, x: [0, 0, 0], z: Z[0].z });
    else {
      const A = Z[i - 1], B = Z[i];
      const c = cross(A.z, B.z);
      let x: V3, o: V3;
      if (norm(c) > 1e-6) {
        // skew or intersecting axes: common normal
        const w0 = sub(A.o, B.o);
        const a = dot(A.z, A.z), b = dot(A.z, B.z), cc = dot(B.z, B.z), d = dot(A.z, w0), e = dot(B.z, w0);
        const den = a * cc - b * b;
        const sA = (b * e - cc * d) / den, sB = (a * e - b * d) / den;
        const pA = add(A.o, scale(A.z, sA)), pB = add(B.o, scale(B.z, sB));
        o = pB;
        x = norm(sub(pB, pA)) > 1e-6 ? normalize(sub(pB, pA)) : normalize(c);
      } else {
        // parallel axes: normal through the origin of the previous frame
        const prevO = frm[i - 1].o;
        const t = dot(sub(prevO, B.o), B.z);
        const foot = add(B.o, scale(B.z, t));
        const v = sub(foot, prevO);
        if (norm(v) > 1e-6) { x = normalize(v); o = foot; }
        else { x = i > 1 ? frm[i - 1].x : normalize(cross(A.z, Math.abs(A.z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); o = foot; }
        if (i === n) o = B.o; // tool frame sits at the TCP
      }
      frm.push({ o, x, z: B.z });
    }
  }
  // frame 0 x-axis: choose = x_1 (gives θ0_1 = 0) projected onto the plane ⟂ z0
  {
    const z0 = frm[0].z, x1 = frm[1].x;
    let x0 = sub(x1, scale(z0, dot(x1, z0)));
    if (norm(x0) < 1e-6) x0 = cross(z0, Math.abs(z0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    frm[0].x = normalize(x0);
  }
  const rows: DHRow[] = [];
  for (let i = 1; i <= n; i++) {
    const P = frm[i - 1], C = frm[i];
    const d = dot(sub(C.o, P.o), P.z);
    const a = dot(sub(C.o, P.o), C.x);
    const alpha = Math.atan2(dot(cross(P.z, C.z), C.x), dot(P.z, C.z));
    const theta0 = Math.atan2(dot(cross(P.x, C.x), P.z), dot(P.x, C.x));
    rows.push({ joint: `J${i}`, theta0, d, a, alpha });
  }
  const base = fromAxes(frm[0].x, frm[0].z, frm[0].o);
  const Fn = fromAxes(frm[n].x, frm[n].z, frm[n].o);
  return { rows, base, tool: tmul(tinv(Fn), tcp) };
}

export const dhA = (theta: number, d: number, a: number, alpha: number): Tf => tmul(tmul(tf(rotZ(theta), [0, 0, d]), tf(undefined, [a, 0, 0])), tf(rotX(alpha)));

export function fkDH(dh: DHResult, q: ArrayLike<number>): Tf {
  let T = dh.base;
  dh.rows.forEach((r, i) => { T = tmul(T, dhA((q[i] ?? 0) + r.theta0, r.d, r.a, r.alpha)); });
  return tmul(T, dh.tool);
}

export { mm, mv, transpose };
