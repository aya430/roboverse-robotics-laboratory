// Rigid-body dynamics of the serial chain:  M(q) q̈ + C(q,q̇) q̇ + G(q) + F(q̇) = τ
// Inverse dynamics: recursive Newton–Euler algorithm (RNEA, Craig's formulation).
// Mass matrix: n RNEA calls with unit accelerations (+ reflected rotor inertia on the diagonal).

import type { RobotModel } from './robotModel';
import { add, cross, mtv, mv, choleskySolve, rotZ, mm, type V3, tapply } from './math';
import { fk } from './kinematics';

export const GRAVITY: V3 = [0, 0, -9.81];

export interface RneaOut { tau: Float64Array; w: V3[]; wd: V3[]; vd: V3[]; f: V3[]; nm: V3[] }

export function rnea(model: RobotModel, q: ArrayLike<number>, qd: ArrayLike<number>, qdd: ArrayLike<number>, g: V3 = GRAVITY, fExt?: { f: V3; n: V3 }): RneaOut {
  const n = model.n;
  const w: V3[] = [], wd: V3[] = [], vd: V3[] = [], F: V3[] = [], N: V3[] = [];
  const Rs = [] as number[][];
  const Ps = [] as V3[];
  let wp: V3 = [0, 0, 0], wdp: V3 = [0, 0, 0], vdp: V3 = [-g[0], -g[1], -g[2]];
  for (let i = 0; i < n; i++) {
    const J = model.joints[i];
    const pris = J.type === 'prismatic';
    const R = pris ? J.X.R : mm(J.X.R, rotZ(q[i]));
    const p: V3 = pris ? [J.X.p[0] + J.X.R[2] * q[i], J.X.p[1] + J.X.R[5] * q[i], J.X.p[2] + J.X.R[8] * q[i]] : J.X.p;
    Rs.push(R);
    Ps.push(p);
    const wl = mtv(R, wp);
    const wdl = mtv(R, wdp);
    let wi: V3, wdi: V3, vdi: V3;
    const vbase = mtv(R, add(add(cross(wdp, p), cross(wp, cross(wp, p))), vdp));
    if (pris) {
      wi = wl; wdi = wdl;
      const cor = cross(wi, [0, 0, 2 * qd[i]]);
      vdi = [vbase[0] + cor[0], vbase[1] + cor[1], vbase[2] + cor[2] + qdd[i]];
    } else {
      wi = [wl[0], wl[1], wl[2] + qd[i]];
      const c1 = cross(wl, [0, 0, qd[i]]);
      wdi = [wdl[0] + c1[0], wdl[1] + c1[1], wdl[2] + c1[2] + qdd[i]];
      vdi = vbase;
    }
    const b = J.body;
    const vc = add(add(cross(wdi, b.c), cross(wi, cross(wi, b.c))), vdi);
    F.push([b.m * vc[0], b.m * vc[1], b.m * vc[2]]);
    const Iw = mv(b.I, wi);
    N.push(add(mv(b.I, wdi), cross(wi, Iw)));
    w.push(wi); wd.push(wdi); vd.push(vdi);
    wp = wi; wdp = wdi; vdp = vdi;
  }
  const tau = new Float64Array(n);
  const f: V3[] = new Array(n), nm: V3[] = new Array(n);
  // external wrench applied at the TCP (expressed in the last body frame)
  let fn: V3 = [0, 0, 0], nn: V3 = [0, 0, 0];
  if (fExt && n) {
    fn = fExt.f;
    nn = add(fExt.n, cross(model.tool.p, fExt.f));
  }
  for (let i = n - 1; i >= 0; i--) {
    const b = model.joints[i].body;
    let fi: V3, ni: V3;
    if (i === n - 1) {
      fi = add(fn, F[i]);
      ni = add(add(N[i], nn), cross(b.c, F[i]));
    } else {
      const R = Rs[i + 1], p = Ps[i + 1];
      const Rf = mv(R, f[i + 1]);
      fi = add(Rf, F[i]);
      ni = add(add(add(N[i], mv(R, nm[i + 1])), cross(b.c, F[i])), cross(p, Rf));
    }
    f[i] = fi; nm[i] = ni;
    tau[i] = model.joints[i].type === 'prismatic' ? fi[2] : ni[2];
  }
  return { tau, w, wd, vd, f, nm };
}

export function massMatrix(model: RobotModel, q: ArrayLike<number>): Float64Array {
  const n = model.n;
  const M = new Float64Array(n * n);
  const z = new Float64Array(n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0); e[j] = 1;
    const t = rnea(model, q, z, e, [0, 0, 0]).tau;
    for (let i = 0; i < n; i++) M[i * n + j] = t[i];
  }
  for (let i = 0; i < n; i++) {
    M[i * n + i] += model.joints[i].armature;
    // symmetrise round-off
    for (let j = 0; j < i; j++) { const s = 0.5 * (M[i * n + j] + M[j * n + i]); M[i * n + j] = s; M[j * n + i] = s; }
  }
  return M;
}

export const gravityTorque = (model: RobotModel, q: ArrayLike<number>) => rnea(model, q, new Float64Array(model.n), new Float64Array(model.n)).tau;

/** Joint friction torque (output side): viscous + smoothed Coulomb. */
export function frictionTorque(model: RobotModel, qd: ArrayLike<number>): Float64Array {
  const t = new Float64Array(model.n);
  for (let i = 0; i < model.n; i++) {
    const J = model.joints[i];
    t[i] = J.viscous * qd[i] + J.coulomb * Math.tanh(qd[i] / (J.type === 'prismatic' ? 0.002 : 0.01));
  }
  return t;
}

/** q̈ = M⁻¹ (τ − C q̇ − G − F). */
export function forwardDynamics(model: RobotModel, q: ArrayLike<number>, qd: ArrayLike<number>, tau: ArrayLike<number>, friction = true): Float64Array {
  const n = model.n;
  const h = rnea(model, q, qd, new Float64Array(n)).tau;
  const Ff = friction ? frictionTorque(model, qd) : new Float64Array(n);
  const rhs = new Float64Array(n);
  for (let i = 0; i < n; i++) rhs[i] = tau[i] - h[i] - Ff[i];
  return choleskySolve(massMatrix(model, q), rhs, n);
}

export function kineticEnergy(model: RobotModel, q: ArrayLike<number>, qd: ArrayLike<number>): number {
  const n = model.n, M = massMatrix(model, q);
  let e = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) e += 0.5 * qd[i] * M[i * n + j] * qd[j];
  return e;
}
export function potentialEnergy(model: RobotModel, q: ArrayLike<number>): number {
  const { frames } = fk(model, q);
  let e = 0;
  model.joints.forEach((J, i) => { e += J.body.m * 9.81 * tapply(frames[i], J.body.c)[2]; });
  return e;
}

export interface SizingRow {
  joint: string; maxGravity: number; gearRated: number; gearPeak: number; motorLimited: number; ratio: number;
  status: 'ok' | 'warn' | 'error'; note: string;
}

/**
 * Static sizing check: worst-case gravity torque over a grid of shoulder/elbow poses
 * (with payload) against gearbox rated torque and motor-limited output torque (T_peak·N·η).
 */
export function sizingCheck(model: RobotModel): SizingRow[] {
  const n = model.n;
  const maxG = new Array(n).fill(0);
  const grid = [-90, -60, -30, 0, 30, 60, 90].map((d) => (d * Math.PI) / 180);
  const q = new Array(n).fill(0);
  const iter = (k: number) => {
    if (k >= Math.min(n, 3)) {
      const t = gravityTorque(model, q);
      for (let i = 0; i < n; i++) maxG[i] = Math.max(maxG[i], Math.abs(t[i]));
      return;
    }
    if (k === 0) { q[0] = 0; iter(1); return; }
    for (const v of grid) { q[k] = Math.max(model.joints[k].lo, Math.min(model.joints[k].hi, v)); iter(k + 1); }
  };
  iter(0);
  // wrist poses
  for (const a of grid) { const qq = new Array(n).fill(0); if (n > 4) qq[4] = a; if (n > 3) qq[3] = a; const t = gravityTorque(model, qq); for (let i = 0; i < n; i++) maxG[i] = Math.max(maxG[i], Math.abs(t[i])); }
  return model.joints.map((J, i) => {
    const motorLimited = J.motor.T_peak * J.gear.ratio * J.gear.efficiency;
    const motorCont = J.motor.T_rated * J.gear.ratio * J.gear.efficiency;
    const holding = maxG[i] + J.coulomb;
    let status: SizingRow['status'] = 'ok', note = 'Adequate margin';
    if (holding > motorLimited || holding > J.gear.T_peak) { status = 'error'; note = 'Cannot hold the arm against gravity – choose a larger motor or higher gear ratio'; }
    else if (holding > J.gear.T_rated || holding > motorCont) { status = 'warn'; note = 'Static load exceeds continuous rating – expect overload / thermal warnings'; }
    else if (holding > 0.8 * Math.min(J.gear.T_rated, motorCont)) { status = 'warn'; note = 'Less than 20 % margin for acceleration'; }
    return { joint: J.name, maxGravity: maxG[i], gearRated: J.gear.T_rated, gearPeak: J.gear.T_peak, motorLimited, ratio: J.gear.ratio, status, note };
  });
}
