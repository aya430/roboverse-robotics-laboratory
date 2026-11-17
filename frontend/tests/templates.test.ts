import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/engine/catalog';
import { TEMPLATES, buildTemplate } from '../src/engine/templates';
import { buildRobotModel } from '../src/engine/robotModel';
import { fk, jacobian } from '../src/engine/kinematics';
import { forwardDynamics, gravityTorque, kineticEnergy, potentialEnergy, rnea, massMatrix } from '../src/engine/dynamics';
import { runSimulation, autoTuneControl } from '../src/engine/simulate';
import { exportURDF } from '../src/engine/urdf';
import { shapeVolume, shapeInertia } from '../src/engine/geometry';

describe('extended catalog', () => {
  it('has 150+ parts with valid ports and parameters', () => {
    expect(CATALOG.length).toBeGreaterThan(150);
    for (const c of CATALOG) {
      const ids = c.ports.map((p) => p.id);
      expect(new Set(ids).size, c.id).toBe(ids.length);
      expect(c.ports.filter((p) => p.dir === 'in').length, c.id).toBeLessThanOrEqual(1);
      if (!c.root) expect(c.ports.some((p) => p.dir === 'in'), c.id).toBe(true);
      if (c.gearbox) expect(c.ports.filter((p) => p.rotary).length, c.id).toBe(1);
      if (c.motor) {
        expect(Math.abs(c.motor.T_rated - c.motor.Kt * c.motor.I_rated) / c.motor.T_rated, c.id).toBeLessThan(0.02);
        expect((c.motor.V_nom / c.motor.Ke) * 60 / (2 * Math.PI), c.id).toBeGreaterThanOrEqual(c.motor.rpm_rated);
      }
      expect(c.mass, c.id).toBeGreaterThan(0);
      if (c.gearbox && c.motor) {
        // joint speed limit must be reachable within the motor speed limit
        const g = c.gearbox, k = g.joint === 'prismatic' ? 1e-3 : Math.PI / 180;
        expect((g.vmax_dps * k * g.ratio * 60) / (2 * Math.PI), c.id).toBeLessThanOrEqual(c.motor.rpm_max);
      }
      for (const s of c.shapes) {
        expect(shapeVolume(s), `${c.id} ${s.kind}`).toBeGreaterThan(0);
        const I = shapeInertia(s, 1);
        expect(I[0] > 0 && I[4] > 0 && I[8] > 0, `${c.id} ${s.kind}`).toBe(true);
      }
    }
  });
});

describe('robot templates', () => {
  const expected: Record<string, string> = { arm6: 'rrrrrr', cobot5: 'rrrrr', scara: 'rrpr', gantry: 'ppp', desktop4: 'rrrr' };
  for (const t of TEMPLATES) {
    it(`${t.id}: builds, validates and has consistent kinematics`, () => {
      const { model, issues } = buildRobotModel(buildTemplate(t.id));
      expect(issues.filter((i) => i.level === 'error' || i.level === 'warn')).toEqual([]);
      const m = model!;
      expect(m.joints.map((j) => j.type[0]).join('')).toBe(expected[t.id]);
      // Jacobian vs finite differences (handles prismatic columns)
      const q = m.joints.map((J) => (J.lo + J.hi) / 2 + (J.hi - J.lo) * 0.1);
      const Jg = jacobian(m, q);
      for (let j = 0; j < m.n; j++) {
        const h = 1e-6, qp = q.slice(), qm = q.slice();
        qp[j] += h; qm[j] -= h;
        const a = fk(m, qp).tcp.p, b = fk(m, qm).tcp.p;
        for (let r = 0; r < 3; r++) expect(Jg[r][j]).toBeCloseTo((a[r] - b[r]) / (2 * h), 5);
      }
    });
    it(`${t.id}: dynamics are consistent (gravity = ∇PE, energy conserved)`, () => {
      const m = buildRobotModel(buildTemplate(t.id)).model!;
      let q = m.joints.map((J) => (J.lo + J.hi) / 2 + (J.hi - J.lo) * 0.05);
      const G = gravityTorque(m, q);
      for (let j = 0; j < m.n; j++) {
        const h = 1e-6, qp = q.slice(), qm = q.slice();
        qp[j] += h; qm[j] -= h;
        expect(G[j]).toBeCloseTo((potentialEnergy(m, qp) - potentialEnergy(m, qm)) / (2 * h), 4);
      }
      let qd = m.joints.map((J, i) => (J.type === 'prismatic' ? 0.05 : 0.4) * (i % 2 ? -1 : 1));
      const E = () => kineticEnergy(m, q, qd) + potentialEnergy(m, q);
      const E0 = E();
      const zero = new Array(m.n).fill(0);
      const f = (qq: number[], vv: number[]) => Array.from(forwardDynamics(m, qq, vv, zero, false));
      const dt = 0.0005;
      for (let k = 0; k < 400; k++) {
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
      expect(Math.abs(E() - E0) / Math.max(1, Math.abs(E0))).toBeLessThan(1e-6);
      // RNEA = M q̈ + h
      const qdd = m.joints.map((_, i) => 0.3 - 0.1 * i);
      const tau = rnea(m, q, qd, qdd).tau, h = rnea(m, q, qd, zero).tau, M = massMatrix(m, q);
      for (let i = 0; i < m.n; i++) {
        let s = h[i];
        for (let j = 0; j < m.n; j++) s += M[i * m.n + j] * qdd[j];
        expect(tau[i] + m.joints[i].armature * qdd[i]).toBeCloseTo(s, 7);
      }
    });
    it(`${t.id}: pick-and-place simulation succeeds without error events`, () => {
      const m = buildRobotModel(buildTemplate(t.id)).model!;
      const home = t.task.home ?? new Array(m.n).fill(0);
      const ctl = autoTuneControl(m, home);
      ctl.Ts = Math.max(ctl.Ts, 1 / (m.controller!.rate_hz ?? 1000));
      const r = runSimulation(m, { dt: 0.0005, recordHz: 100, payload: t.task.payload, friction: true, home, scenario: { kind: 'pickplace', pick: t.task.pick, place: t.task.place, approach: t.task.approach, speed: 0.6, dwell: 0.5 }, control: ctl });
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.events.filter((e) => e.level === 'error')).toEqual([]);
      expect(r.metrics.eeRmseMm).toBeLessThan(15);
      const urdf = exportURDF(buildTemplate(t.id), m);
      expect((urdf.match(/type="(revolute|prismatic)"/g) ?? []).length).toBe(m.n);
    });
  }
});
