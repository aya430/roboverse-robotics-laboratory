import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/engine/catalog';
import {
  attachNew, buildReferenceArm, checkAttach, emptyAssembly, addRoot, guidedProgress, ARM6_STEPS, rootOf, swapCandidates, swapItem, findInst,
} from '../src/engine/assembly';
import { buildRobotModel, withPayload } from '../src/engine/robotModel';
import { extractDH, fk, fkDH, ik, jacobian } from '../src/engine/kinematics';
import { forwardDynamics, gravityTorque, kineticEnergy, massMatrix, potentialEnergy, rnea, sizingCheck } from '../src/engine/dynamics';
import { runSimulation, defaultControl } from '../src/engine/simulate';
import { exportURDF } from '../src/engine/urdf';
import { toCSV } from '../src/engine/report';
import { stepMetrics } from '../src/engine/metrics';
import { quintic } from '../src/engine/trajectory';

const arm = buildReferenceArm();
const { model: M0, issues } = buildRobotModel(arm);
const model = M0!;
const rnd = (seed: number) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const randomQ = (r: () => number) => model.joints.map((J) => J.lo * 0.8 + r() * (J.hi - J.lo) * 0.8);

describe('component catalog', () => {
  it('has unique ids and consistent motor constants (SI: Kt = Ke, T = Kt·I)', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG.filter((x) => x.motor)) {
      const m = c.motor!;
      expect(m.Kt).toBeCloseTo(m.Ke, 9);
      expect(Math.abs(m.T_rated - m.Kt * m.I_rated) / m.T_rated).toBeLessThan(0.02);
      expect(Math.abs(m.T_peak - m.Kt * m.I_peak) / m.T_peak).toBeLessThan(0.02);
      const noLoadRpm = (m.V_nom / m.Ke) * 60 / (2 * Math.PI);
      expect(noLoadRpm).toBeGreaterThanOrEqual(m.rpm_rated);
    }
  });
  it('every gearbox has exactly one rotary output', () => {
    for (const c of CATALOG.filter((x) => x.gearbox)) expect(c.ports.filter((p) => p.rotary).length).toBe(1);
  });
});

describe('assembly engine', () => {
  it('builds the guided reference arm without issues', () => {
    expect(issues.filter((i) => i.level === 'error' || i.level === 'warn')).toEqual([]);
    expect(model.n).toBe(6);
    expect(guidedProgress(arm).every(Boolean)).toBe(true);
    expect(ARM6_STEPS.length).toBe(23);
  });
  it('rejects incompatible and occupied interfaces', () => {
    let a = addRoot(emptyAssembly(), 'base-pedestal');
    const base = rootOf(a)!.uid;
    expect(checkAttach(a, 'motor-g200', base, 'j1').ok).toBe(false); // AM-M on AM-L
    expect(checkAttach(a, 'link-turret', base, 'j1').ok).toBe(false); // flange on actuator mount
    a = attachNew(a, 'motor-g400', base, 'j1').asm;
    expect(checkAttach(a, 'motor-g400', base, 'j1').ok).toBe(false); // occupied
    const motor = a.instances[1].uid;
    expect(checkAttach(a, 'hd-m100', motor, 'shaft').ok).toBe(false); // Ø11 bore on Ø14 shaft
    expect(checkAttach(a, 'hd-l100', motor, 'shaft').ok).toBe(true);
  });
  it('swaps interface-compatible parts and keeps the sub-assembly', () => {
    const j2gb = model.joints[1].gbUid;
    const cands = swapCandidates(arm, j2gb).map((c) => c.id);
    expect(cands).toContain('pg-l20');
    const a2 = swapItem(arm, j2gb, 'pg-l20');
    const m2 = buildRobotModel(a2).model!;
    expect(m2.n).toBe(6);
    expect(m2.joints[1].gear.ratio).toBe(20);
    expect(findInst(a2, j2gb)!.item).toBe('pg-l20');
    expect(sizingCheck(m2)[1].status).not.toBe('ok');
  });
});

describe('kinematics', () => {
  it('DH parameters reproduce the transform chain', () => {
    const dh = extractDH(model)!;
    const r = rnd(3);
    for (let k = 0; k < 50; k++) {
      const q = randomQ(r);
      const a = fk(model, q).tcp, b = fkDH(dh, q);
      for (let i = 0; i < 3; i++) expect(b.p[i]).toBeCloseTo(a.p[i], 9);
      for (let i = 0; i < 9; i++) expect(b.R[i]).toBeCloseTo(a.R[i], 9);
    }
  });
  it('geometric Jacobian matches finite differences', () => {
    const q = randomQ(rnd(5));
    const J = jacobian(model, q);
    const h = 1e-6;
    for (let j = 0; j < 6; j++) {
      const qp = q.slice(); qp[j] += h;
      const qm = q.slice(); qm[j] -= h;
      const pp = fk(model, qp).tcp.p, pm = fk(model, qm).tcp.p;
      for (let r = 0; r < 3; r++) expect(J[r][j]).toBeCloseTo((pp[r] - pm[r]) / (2 * h), 6);
    }
  });
  it('IK recovers reachable poses', () => {
    const r = rnd(11);
    let ok = 0;
    for (let k = 0; k < 20; k++) {
      const q = model.joints.map((J) => (r() - 0.5) * 1.2);
      const T = fk(model, q).tcp;
      const res = ik(model, { p: T.p, R: T.R }, q.map((v) => v + (r() - 0.5) * 0.3));
      if (res.ok) ok++;
      if (res.ok) expect(res.posErr).toBeLessThan(1e-3);
    }
    expect(ok).toBeGreaterThanOrEqual(18);
  });
});

describe('dynamics', () => {
  it('mass matrix is symmetric positive definite', () => {
    const q = randomQ(rnd(7));
    const M = massMatrix(model, q);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) expect(M[i * 6 + j]).toBeCloseTo(M[j * 6 + i], 10);
    const x = [0.3, -1, 0.5, 2, -0.7, 1.1];
    let s = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) s += x[i] * M[i * 6 + j] * x[j];
    expect(s).toBeGreaterThan(0);
  });
  it('gravity torque equals the gradient of potential energy', () => {
    const q = randomQ(rnd(9));
    const G = gravityTorque(model, q);
    for (let j = 0; j < 6; j++) {
      const h = 1e-6, qp = q.slice(), qm = q.slice();
      qp[j] += h; qm[j] -= h;
      expect(G[j]).toBeCloseTo((potentialEnergy(model, qp) - potentialEnergy(model, qm)) / (2 * h), 5);
    }
  });
  it('RNEA is consistent with M(q) q̈ + h(q, q̇)', () => {
    const r = rnd(13);
    const q = randomQ(r), qd = q.map(() => r() - 0.5), qdd = q.map(() => r() - 0.5);
    const tau = rnea(model, q, qd, qdd).tau;
    const h = rnea(model, q, qd, [0, 0, 0, 0, 0, 0]).tau;
    const Mm = massMatrix(model, q);
    for (let i = 0; i < 6; i++) {
      let s = h[i];
      for (let j = 0; j < 6; j++) s += Mm[i * 6 + j] * qdd[j];
      // rnea() excludes armature; massMatrix() includes it
      expect(tau[i] + model.joints[i].armature * qdd[i]).toBeCloseTo(s, 8);
    }
  });
  it('conserves energy without friction and torque (RK4)', () => {
    let q = [0.2, -0.4, 0.6, 0.3, 0.5, -0.2], qd = [0.5, -0.3, 0.4, 1.0, -0.8, 0.6];
    const E = () => kineticEnergy(model, q, qd) + potentialEnergy(model, q);
    const E0 = E();
    const f = (qq: number[], vv: number[]) => Array.from(forwardDynamics(model, qq, vv, [0, 0, 0, 0, 0, 0], false));
    const dt = 0.001;
    for (let k = 0; k < 500; k++) {
      const a1 = f(q, qd);
      const q2 = q.map((v, i) => v + 0.5 * dt * qd[i]), v2 = qd.map((v, i) => v + 0.5 * dt * a1[i]);
      const a2 = f(q2, v2);
      const q3 = q.map((v, i) => v + 0.5 * dt * v2[i]), v3 = qd.map((v, i) => v + 0.5 * dt * a2[i]);
      const a3 = f(q3, v3);
      const q4 = q.map((v, i) => v + dt * v3[i]), v4 = qd.map((v, i) => v + dt * a3[i]);
      const a4 = f(q4, v4);
      q = q.map((v, i) => v + (dt / 6) * (qd[i] + 2 * v2[i] + 2 * v3[i] + v4[i]));
      qd = qd.map((v, i) => v + (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]));
    }
    expect(Math.abs(E() - E0) / Math.abs(E0)).toBeLessThan(1e-6);
  });
  it('payload increases the shoulder gravity torque by m·g·lever', () => {
    const q = [0, 0, 0, 0, 0, 0];
    const d = gravityTorque(withPayload(model, 2), q)[1] - gravityTorque(model, q)[1];
    const tcp = fk(model, q).tcp.p;
    const J2 = fk(model, q).frames[1];
    const z = [J2.R[2], J2.R[5], J2.R[8]];
    const r = [tcp[0] - J2.p[0], tcp[1] - J2.p[1], tcp[2] - J2.p[2]];
    // τ = z · (r × m g)
    const F = [0, 0, -2 * 9.81];
    const c = [r[1] * F[2] - r[2] * F[1], r[2] * F[0] - r[0] * F[2], r[0] * F[1] - r[1] * F[0]];
    expect(-d).toBeCloseTo(z[0] * c[0] + z[1] * c[1] + z[2] * c[2], 8);
  });
});

describe('simulation pipeline', () => {
  const cfg = (mode: 'PID' | 'PID+G' | 'CTC') => ({
    dt: 0.0005, recordHz: 200, payload: 1, friction: true, home: [0, 0, 0, 0, 0, 0],
    scenario: { kind: 'pickplace' as const, pick: [0.45, 0.25, 0.25] as [number, number, number], place: [0.3, -0.35, 0.25] as [number, number, number], approach: 0.12, speed: 0.6, dwell: 0.6 },
    control: { ...defaultControl(6), mode },
  });
  it('runs the pick-and-place demo with accurate tracking and no error events', () => {
    for (const mode of ['PID+G', 'CTC'] as const) {
      const r = runSimulation(model, cfg(mode));
      expect(r.ok).toBe(true);
      expect(r.metrics.eeRmseMm).toBeLessThan(8);
      expect(r.events.filter((e) => e.level === 'error')).toEqual([]);
      expect(r.signals['grip.payload'].some((v) => v > 0.5)).toBe(true);
      expect(r.metrics.energyJ).toBeGreaterThan(0);
    }
  });
  it('refuses to simulate without electronics', () => {
    const a = buildReferenceArm();
    const noCtrl = { ...a, instances: a.instances.filter((i) => i.item !== 'elec-controller') };
    const m = buildRobotModel(noCtrl).model!;
    const r = runSimulation(m, cfg('PID'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/controller/);
  });
  it('step response metrics are physically sensible', () => {
    const r = runSimulation(model, { ...cfg('PID+G'), payload: 0, scenario: { kind: 'step', joint: 1, ampDeg: 5, tStep: 0.2, hold: 1.5 } });
    expect(r.ok).toBe(true);
    const s = r.metrics.step!;
    expect(s.riseTime).toBeGreaterThan(0.005);
    expect(s.riseTime).toBeLessThan(0.5);
    expect(Math.abs(s.steadyStateError)).toBeLessThan(0.25);
  });
  it('exports CSV, URDF consistent with the model', () => {
    const r = runSimulation(model, { ...cfg('PID+G'), scenario: { kind: 'step', joint: 0, ampDeg: 2, tStep: 0.1, hold: 0.3 } });
    const csv = toCSV(r, ['J1.q', 'J1.tau']).split('\n');
    expect(csv[0]).toBe('Time_s,J1_q_deg,J1_tau_Nm');
    expect(csv.length).toBe(r.t.length + 1);
    const urdf = exportURDF(arm, model);
    expect((urdf.match(/type="revolute"/g) ?? []).length).toBe(6);
    expect((urdf.match(/<link name=/g) ?? []).length).toBe(6 + 3);
    expect(urdf).toContain('<ros2_control');
  });
});

describe('metrics and trajectories', () => {
  it('quintic has zero boundary velocity and acceleration', () => {
    expect(quintic(0)).toEqual({ s: 0, ds: 0, dds: 0 });
    const e = quintic(1);
    expect(e.s).toBeCloseTo(1, 12); expect(e.ds).toBeCloseTo(0, 12); expect(e.dds).toBeCloseTo(0, 12);
  });
  it('step metrics of a first-order response', () => {
    const t = Float32Array.from({ length: 2001 }, (_, i) => i * 0.001);
    const y = t.map((v) => 1 - Math.exp(-v / 0.1));
    const m = stepMetrics(t, y, 0, 1, 0);
    expect(m.riseTime).toBeCloseTo(0.1 * Math.log(9), 2); // 2.197 τ
    expect(m.settlingTime).toBeCloseTo(0.1 * Math.log(50), 2); // 3.91 τ
    expect(m.overshootPct).toBe(0);
  });
});
