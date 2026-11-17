// Joint-space trajectory generation: quintic (minimum-jerk boundary conditions) segments
// with zero velocity/acceleration at every waypoint, plus task-level pick-and-place planning via IK.

import type { RobotModel } from './robotModel';
import { fk, ik } from './kinematics';
import type { M3, V3 } from './math';

export interface Segment {
  t0: number; T: number; q0: number[]; q1: number[];
  label: string;
  gripper: 'open' | 'closed';
  payload: boolean; // payload attached to the gripper during this segment
}
export interface Trajectory { segments: Segment[]; duration: number; waypoints: { label: string; q: number[]; p: V3 }[] }

/** Quintic blend s(τ) = 10τ³ − 15τ⁴ + 6τ⁵ and its derivatives. */
export function quintic(tau: number) {
  const t = Math.max(0, Math.min(1, tau));
  const t2 = t * t, t3 = t2 * t;
  return { s: t3 * (10 - 15 * t + 6 * t2), ds: 30 * t2 * (1 - 2 * t + t2), dds: 60 * t * (1 - 3 * t + 2 * t2) };
}

export function evalTrajectory(tr: Trajectory, t: number, n: number) {
  const segs = tr.segments;
  let seg = segs[segs.length - 1];
  for (const s of segs) if (t < s.t0 + s.T) { seg = s; break; }
  const tau = seg.T > 0 ? (t - seg.t0) / seg.T : 1;
  const { s, ds, dds } = quintic(tau);
  const q = new Float64Array(n), qd = new Float64Array(n), qdd = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = seg.q1[i] - seg.q0[i];
    q[i] = seg.q0[i] + d * s;
    qd[i] = t > seg.t0 + seg.T ? 0 : (d * ds) / seg.T;
    qdd[i] = t > seg.t0 + seg.T ? 0 : (d * dds) / (seg.T * seg.T);
  }
  return { q, qd, qdd, seg };
}

/** Segment duration so that no joint exceeds speedFactor·vmax (quintic peak velocity = 1.875·Δq/T). */
export function segmentTime(model: RobotModel, q0: number[], q1: number[], speedFactor: number, minT = 0.4) {
  let T = minT;
  model.joints.forEach((J, i) => { T = Math.max(T, (1.875 * Math.abs(q1[i] - q0[i])) / (J.vmax * speedFactor)); });
  return Math.ceil(T * 20) / 20;
}

export interface PickPlaceCfg {
  home: number[];
  pick: V3; place: V3;
  approach: number; // m above pick/place
  speed: number; // fraction of joint max speed
  dwell: number; // s for gripper close/open
  toolR?: M3; // desired tool orientation (default: the home orientation)
}

export function planPickPlace(model: RobotModel, cfg: PickPlaceCfg): { traj?: Trajectory; error?: string } {
  const R = cfg.toolR ?? fk(model, cfg.home).tcp.R;
  const up = (p: V3, h: number): V3 => [p[0], p[1], p[2] + h];
  const targets: { label: string; p: V3; grip: 'open' | 'closed'; payload: boolean }[] = [
    { label: 'Approach pick', p: up(cfg.pick, cfg.approach), grip: 'open', payload: false },
    { label: 'Descend to pick', p: cfg.pick, grip: 'open', payload: false },
    { label: 'Grasp', p: cfg.pick, grip: 'closed', payload: false },
    { label: 'Lift', p: up(cfg.pick, cfg.approach), grip: 'closed', payload: true },
    { label: 'Transfer', p: up(cfg.place, cfg.approach), grip: 'closed', payload: true },
    { label: 'Descend to place', p: cfg.place, grip: 'closed', payload: true },
    { label: 'Release', p: cfg.place, grip: 'open', payload: false },
    { label: 'Retract', p: up(cfg.place, cfg.approach), grip: 'open', payload: false },
  ];
  const wps: Trajectory['waypoints'] = [{ label: 'Home', q: cfg.home.slice(), p: fk(model, cfg.home).tcp.p }];
  let qPrev = cfg.home.slice();
  const segs: Segment[] = [];
  let t = 0;
  for (const tg of targets) {
    let qT: number[];
    if (tg.label === 'Grasp' || tg.label === 'Release') qT = qPrev.slice();
    else {
      const r = ik(model, { p: tg.p, R }, qPrev);
      if (!r.ok) return { error: `IK failed at “${tg.label}” (${tg.p.map((v) => v.toFixed(3)).join(', ')} m): ${r.message}. Position error ${(r.posErr * 1000).toFixed(1)} mm.` };
      qT = r.q;
    }
    const T = tg.label === 'Grasp' || tg.label === 'Release' ? cfg.dwell : segmentTime(model, qPrev, qT, cfg.speed);
    // payload is attached from the end of “Grasp” and detached at the end of “Release”
    segs.push({ t0: t, T, q0: qPrev, q1: qT, label: tg.label, gripper: tg.grip, payload: tg.payload });
    wps.push({ label: tg.label, q: qT, p: fk(model, qT).tcp.p });
    t += T;
    qPrev = qT;
  }
  const Th = segmentTime(model, qPrev, cfg.home, cfg.speed);
  segs.push({ t0: t, T: Th, q0: qPrev, q1: cfg.home.slice(), label: 'Return home', gripper: 'open', payload: false });
  t += Th;
  segs.push({ t0: t, T: 1.0, q0: cfg.home.slice(), q1: cfg.home.slice(), label: 'Settle', gripper: 'open', payload: false });
  t += 1.0;
  wps.push({ label: 'Home', q: cfg.home.slice(), p: fk(model, cfg.home).tcp.p });
  return { traj: { segments: segs, duration: t, waypoints: wps } };
}

/** Step input on one joint (for controller tuning). */
export function planStep(model: RobotModel, home: number[], joint: number, amp: number, tStep: number, hold: number): Trajectory {
  const q1 = home.slice();
  q1[joint] += amp;
  return {
    segments: [
      { t0: 0, T: tStep, q0: home, q1: home, label: 'Hold', gripper: 'open', payload: false },
      { t0: tStep, T: 0, q0: q1, q1, label: 'Step', gripper: 'open', payload: false },
      { t0: tStep, T: hold, q0: q1, q1, label: 'Response', gripper: 'open', payload: false },
    ],
    duration: tStep + hold,
    waypoints: [{ label: 'Start', q: home, p: fk(model, home).tcp.p }, { label: 'Step target', q: q1, p: fk(model, q1).tcp.p }],
  };
}

/** Point-to-point joint move (e.g. to an IK solution). */
export function planMove(model: RobotModel, q0: number[], q1: number[], speed: number): Trajectory {
  const T = segmentTime(model, q0, q1, speed);
  return {
    segments: [
      { t0: 0, T, q0, q1, label: 'Move', gripper: 'open', payload: false },
      { t0: T, T: 1, q0: q1, q1, label: 'Settle', gripper: 'open', payload: false },
    ],
    duration: T + 1,
    waypoints: [{ label: 'Start', q: q0, p: fk(model, q0).tcp.p }, { label: 'Target', q: q1, p: fk(model, q1).tcp.p }],
  };
}
