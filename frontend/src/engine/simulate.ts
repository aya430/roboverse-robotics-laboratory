// Time-domain simulation of the assembled robot:
//   trajectory → joint controller (sampled, ZOH) → current loop → DC/BLDC motor electrical model
//   → gearbox (ratio, efficiency) → rigid-body forward dynamics (RNEA / mass matrix) + friction
//   → encoders, F/T sensor, power, battery SOC.
// Integration: exact first-order solution for the motor current, semi-implicit Euler for the mechanics.
// Every recorded signal comes from this loop – nothing is synthesised.

import type { RobotModel } from './robotModel';
import { withPayload, jointUnit } from './robotModel';
import { forwardDynamics, gravityTorque, massMatrix, rnea, frictionTorque } from './dynamics';
import { fk } from './kinematics';
import { evalTrajectory, planMove, planPickPlace, planStep, type Trajectory } from './trajectory';
import { add, cross, mtv, mv, tmul, type V3 } from './math';
import { mae, rmse, stepMetrics, type StepMetrics } from './metrics';

export type ControlMode = 'PID' | 'PID+G' | 'CTC';

export interface ControlConfig {
  mode: ControlMode;
  kp: number[]; ki: number[]; kd: number[]; // N·m/rad, N·m/(rad·s), N·m·s/rad
  ctcWn: number; ctcZeta: number; // computed-torque error dynamics
  Ts: number; // controller sampling period (s)
  currentBw: number; // current-loop bandwidth (Hz)
  velFilterHz: number;
}

export type Scenario =
  | { kind: 'pickplace'; pick: V3; place: V3; approach: number; speed: number; dwell: number }
  | { kind: 'step'; joint: number; ampDeg: number; tStep: number; hold: number }
  | { kind: 'move'; target: number[]; speed: number };

export interface SimConfig {
  dt: number; recordHz: number; payload: number; friction: boolean;
  home: number[];
  scenario: Scenario;
  control: ControlConfig;
}

export interface SignalMeta { key: string; label: string; unit: string; group: string }
export interface SimEvent { t: number; level: 'warn' | 'error' | 'info'; text: string }
export interface JointMetric { joint: string; rmseDeg: number; maeDeg: number; maxErrDeg: number; peakTorque: number; rmsCurrent: number; peakCurrent: number; energy: number; peakSpeedRpm: number }
export interface SimResult {
  ok: boolean;
  error?: string;
  t: Float32Array;
  signals: Record<string, Float32Array>;
  meta: SignalMeta[];
  events: SimEvent[];
  traj?: Trajectory;
  metrics: {
    simTime: number; wallTime: number; steps: number; dt: number; Ts: number;
    joints: JointMetric[];
    eeRmseMm: number; eeMaxMm: number; energyJ: number; peakPowerW: number; socEnd: number; avgPowerW: number;
    step?: StepMetrics & { joint: string; ampDeg: number };
    cycleTime: number;
  };
}

/**
 * Model-based default gains: for each joint, Kp = J_eff·ωn², Kd = 2ζ·J_eff·ωn, Ki = Kp·ωn/8, with J_eff the
 * diagonal of M(q₀) (incl. reflected rotor inertia). Works for revolute (N·m/rad) and prismatic (N/m) joints.
 */
export function autoTuneControl(model: RobotModel, q0?: number[], wn = 32, zeta = 0.85): ControlConfig {
  const n = model.n;
  const M = massMatrix(model, q0 ?? new Array(n).fill(0));
  const r = (v: number) => Number(v.toPrecision(3));
  const kp: number[] = [], ki: number[] = [], kd: number[] = [];
  for (let i = 0; i < n; i++) {
    const J = Math.max(M[i * n + i], 1e-4);
    kp.push(r(J * wn * wn)); kd.push(r(2 * zeta * J * wn)); ki.push(r((J * wn * wn * wn) / 8));
  }
  return { mode: 'PID+G', kp, ki, kd, ctcWn: 30, ctcZeta: 1, Ts: 0.001, currentBw: 1000, velFilterHz: 150 };
}

export const defaultControl = (n: number): ControlConfig => ({
  mode: 'PID+G',
  kp: [1800, 2200, 1200, 220, 220, 120].slice(0, n).concat(new Array(Math.max(0, n - 6)).fill(200)),
  ki: [300, 400, 200, 30, 30, 20].slice(0, n).concat(new Array(Math.max(0, n - 6)).fill(20)),
  kd: [70, 90, 45, 6, 6, 3].slice(0, n).concat(new Array(Math.max(0, n - 6)).fill(5)),
  ctcWn: 30, ctcZeta: 1.0,
  Ts: 0.001, currentBw: 1000, velFilterHz: 150,
});


export function runSimulation(baseModel: RobotModel, cfg: SimConfig, onProgress?: (f: number) => void, labels: Record<string, string> = {}): SimResult {
  const getLabel = (uid: string) => labels[uid] ?? uid.split('_')[0];
  const wall0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const n = baseModel.n;
  const empty = (error: string): SimResult => ({ ok: false, error, t: new Float32Array(), signals: {}, meta: [], events: [], metrics: { simTime: 0, wallTime: 0, steps: 0, dt: cfg.dt, Ts: cfg.control.Ts, joints: [], eeRmseMm: 0, eeMaxMm: 0, energyJ: 0, peakPowerW: 0, socEnd: 1, avgPowerW: 0, cycleTime: 0 } });
  if (n === 0) return empty('The robot has no actuated joints.');
  if (!baseModel.controller) return empty('No motion controller installed – the joints cannot be closed-loop controlled.');
  if (!baseModel.driver) return empty('No motor driver installed – the motors cannot be powered.');
  if (!baseModel.power) return empty('No power source (battery or power supply) installed.');
  if ((baseModel.power.V_nom ?? 0) > (baseModel.driver.V_max ?? Infinity) + 1e-9) return empty(`Bus voltage ${baseModel.power.V_nom} V exceeds the motor driver maximum of ${baseModel.driver.V_max} V – the driver would be destroyed.`);
  if ((baseModel.driver.channels ?? 0) < n) return empty(`The motor driver has ${baseModel.driver.channels} channels but the robot has ${n} joints.`);
  if (1 / cfg.control.Ts > (baseModel.controller.rate_hz ?? 1000) + 1e-6) return empty(`Controller rate ${(1 / cfg.control.Ts).toFixed(0)} Hz exceeds the controller limit of ${baseModel.controller.rate_hz} Hz.`);

  // ---------- trajectory ----------
  let traj: Trajectory;
  const sc = cfg.scenario;
  if (sc.kind === 'pickplace') {
    const r = planPickPlace(baseModel, { home: cfg.home, pick: sc.pick, place: sc.place, approach: sc.approach, speed: sc.speed, dwell: sc.dwell });
    if (!r.traj) return empty(r.error!);
    traj = r.traj;
  } else if (sc.kind === 'step') traj = planStep(baseModel, cfg.home, sc.joint, sc.ampDeg / jointUnit(baseModel.joints[sc.joint]).k, sc.tStep, sc.hold);
  else traj = planMove(baseModel, cfg.home, sc.target, sc.speed);

  const modelFree = baseModel;
  const modelLoaded = withPayload(baseModel, cfg.payload);
  const events: SimEvent[] = [];
  const once = new Set<string>();
  const event = (t: number, level: SimEvent['level'], text: string, key = text) => {
    if (once.has(key)) return;
    once.add(key);
    events.push({ t, level, text });
  };

  // ---------- states ----------
  const q = Float64Array.from(cfg.home), qd = new Float64Array(n), qdd = new Float64Array(n);
  const cur = new Float64Array(n); // motor currents
  const volt = new Float64Array(n);
  const tauJ = new Float64Array(n);
  const tauCmd = new Float64Array(n);
  const integ = new Float64Array(n);
  const qMeas = Float64Array.from(cfg.home), qMeasPrev = Float64Array.from(cfg.home), qdEst = new Float64Array(n);
  const iRef = new Float64Array(n);
  const drv = baseModel.driver!, pwr = baseModel.power!;
  const isBattery = pwr.kind === 'battery';
  const Vnom = pwr.V_nom ?? 48;
  const capacityC = (pwr.capacity_Ah ?? 1e9) * 3600;
  let soc = 1, energy = 0, Ibus = 0, peakP = 0;
  const Pquiescent = 12; // controller + driver logic (W), stated assumption

  const dt = cfg.dt;
  const ctrlEvery = Math.max(1, Math.round(cfg.control.Ts / dt));
  const Ts = ctrlEvery * dt;
  const steps = Math.ceil(traj.duration / dt);
  const recEvery = Math.max(1, Math.round(1 / cfg.recordHz / dt));
  const nRec = Math.floor(steps / recEvery) + 1;
  const alpha = 1 - Math.exp(-2 * Math.PI * cfg.control.velFilterHz * Ts);
  const encRes = baseModel.joints.map((J) => (2 * Math.PI) / (2 ** J.motor.encoder_bits * J.gear.ratio));
  const U = baseModel.joints.map((J) => jointUnit(J));

  // ---------- recording buffers ----------
  const meta: SignalMeta[] = [];
  const S: Record<string, Float32Array> = {};
  const sig = (key: string, label: string, unit: string, group: string) => { meta.push({ key, label, unit, group }); S[key] = new Float32Array(nRec); };
  for (let i = 0; i < n; i++) {
    const j = `J${i + 1}`, u = U[i], lin = u.unit === 'mm';
    sig(`${j}.q`, `${j} ${lin ? 'position' : 'angle'}`, u.unit, lin ? 'Joint position (linear)' : 'Joint angle');
    sig(`${j}.qref`, `${j} reference ${lin ? 'position' : 'angle'}`, u.unit, lin ? 'Joint position (linear)' : 'Joint angle');
    sig(`${j}.err`, `${j} tracking error`, u.unit, 'Tracking error');
    sig(`${j}.qd`, `${j} velocity`, u.vel, 'Joint velocity');
    sig(`${j}.qdref`, `${j} reference velocity`, u.vel, 'Joint velocity');
    sig(`${j}.qdd`, `${j} acceleration`, lin ? 'mm/s²' : 'deg/s²', 'Joint acceleration');
    sig(`${j}.tau`, `${j} joint ${lin ? 'force' : 'torque'}`, u.force, lin ? 'Joint force' : 'Joint torque');
    sig(`${j}.tauCmd`, `${j} controller output`, u.force, 'Controller output');
    sig(`${j}.i`, `${j} motor current`, 'A', 'Motor current');
    sig(`${j}.v`, `${j} motor voltage`, 'V', 'Motor voltage');
    sig(`${j}.rpm`, `${j} motor speed`, 'rpm', 'Motor speed');
    sig(`${j}.tm`, `${j} motor torque`, 'N·m', 'Motor torque');
    sig(`${j}.pe`, `${j} electrical power`, 'W', 'Electrical power');
    sig(`${j}.pm`, `${j} mechanical power`, 'W', 'Mechanical power');
  }
  for (const ax of ['x', 'y', 'z']) {
    sig(`ee.${ax}`, `TCP ${ax.toUpperCase()}`, 'm', `End-effector ${ax.toUpperCase()}`);
    sig(`ee.${ax}ref`, `TCP ${ax.toUpperCase()} reference`, 'm', `End-effector ${ax.toUpperCase()}`);
  }
  sig('ee.err', 'TCP position error', 'mm', 'Tracking error');
  sig('pwr.bus', 'Bus electrical power', 'W', 'Electrical power');
  sig('pwr.ibus', 'Bus current', 'A', 'Motor current');
  sig('pwr.vbus', 'Bus voltage', 'V', 'Motor voltage');
  sig('pwr.energy', 'Cumulative energy', 'J', 'Energy');
  sig('bat.soc', 'Battery SOC', '%', 'Battery SOC');
  sig('grip.open', 'Gripper opening', 'mm', 'Gripper');
  sig('grip.payload', 'Payload attached', '0/1', 'Gripper');
  if (baseModel.ft) for (const k of ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz']) sig(`ft.${k}`, `F/T ${k}`, k[0] === 'F' ? 'N' : 'N·m', 'Force/torque sensor');
  sig('enc.J1', 'J1 encoder (quantised)', U[0]?.unit ?? 'deg', 'Encoder');
  for (const s of baseModel.sensors) {
    const label = getLabel(s.uid);
    if (s.kind === 'imu' || s.kind === 'accelerometer') for (const a of ['x', 'y', 'z']) sig(`${s.name}.a${a}`, `${label} a${a}`, 'm/s²', 'IMU / accelerometer');
    if (s.kind === 'imu' || s.kind === 'gyroscope') for (const a of ['x', 'y', 'z']) sig(`${s.name}.g${a}`, `${label} ω${a}`, 'deg/s', 'Gyroscope');
    if (s.kind === 'range' || s.kind === 'lidar') sig(`${s.name}.d`, `${label} distance`, 'm', 'Range sensors');
  }

  const tRec = new Float32Array(nRec);
  let r = 0;
  const sqI = new Float64Array(n), peakI = new Float64Array(n), peakT = new Float64Array(n), eJ = new Float64Array(n), peakRpm = new Float64Array(n);
  let refNow = evalTrajectory(traj, 0, n);
  let payloadOn = false;
  let gripOpen = baseModel.gripper ? baseModel.gripper.stroke : 0;

  try {
    for (let k = 0; k <= steps; k++) {
      const t = k * dt;
      const model = payloadOn ? modelLoaded : modelFree;
      refNow = evalTrajectory(traj, t, n);
      const seg = refNow.seg;
      // payload attach/detach and gripper motion
      const wantPayload = seg.payload && cfg.payload > 0;
      if (wantPayload !== payloadOn) {
        payloadOn = wantPayload;
        event(t, 'info', payloadOn ? `Payload ${cfg.payload} kg grasped` : 'Payload released', `pl${t.toFixed(2)}`);
        if (payloadOn && baseModel.gripper) {
          const need = cfg.payload * 9.81 * 2.0; // friction grip μ = 0.5 → F_grip ≥ 2·m·g (static)
          if (baseModel.gripper.kind === 'parallel' && need > baseModel.gripper.force) event(t, 'warn', `Gripper force ${baseModel.gripper.force} N is below the ${need.toFixed(0)} N needed to hold ${cfg.payload} kg with μ = 0.5`);
          if (baseModel.gripper.kind === 'vacuum' && cfg.payload * 9.81 * 1.5 > baseModel.gripper.force) event(t, 'warn', `Vacuum holding force ${baseModel.gripper.force} N is below 1.5×weight of the payload`);
        }
      }
      if (baseModel.gripper?.kind === 'parallel') {
        const target = seg.gripper === 'closed' ? Math.min(0.05, baseModel.gripper.stroke) : baseModel.gripper.stroke;
        const rate = 0.1; // m/s finger stroke speed
        gripOpen += Math.max(-rate * dt, Math.min(rate * dt, target - gripOpen));
      }

      // ---------- controller (sampled at Ts, ZOH) ----------
      if (k % ctrlEvery === 0) {
        for (let i = 0; i < n; i++) {
          qMeas[i] = Math.round(q[i] / encRes[i]) * encRes[i];
          const raw = (qMeas[i] - qMeasPrev[i]) / Ts;
          qdEst[i] += alpha * (raw - qdEst[i]);
          qMeasPrev[i] = qMeas[i];
        }
        const c = cfg.control;
        let ff: Float64Array | null = null;
        if (c.mode === 'PID+G') ff = gravityTorque(model, qMeas);
        if (c.mode === 'CTC') {
          const v = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            const e = refNow.q[i] - qMeas[i], ed = refNow.qd[i] - qdEst[i];
            v[i] = refNow.qdd[i] + c.ctcWn * c.ctcWn * e + 2 * c.ctcZeta * c.ctcWn * ed + (c.ki[i] / Math.max(1e-9, c.kp[i])) * c.ctcWn * c.ctcWn * integ[i];
          }
          const M = massMatrix(model, qMeas);
          const h = rnea(model, qMeas, qdEst, new Float64Array(n)).tau;
          const fr = cfg.friction ? frictionTorque(model, qdEst) : new Float64Array(n);
          for (let i = 0; i < n; i++) {
            let s = h[i] + fr[i];
            for (let j = 0; j < n; j++) s += M[i * n + j] * v[j];
            tauCmd[i] = s;
          }
        } else {
          for (let i = 0; i < n; i++) {
            const e = refNow.q[i] - qMeas[i], ed = refNow.qd[i] - qdEst[i];
            tauCmd[i] = c.kp[i] * e + c.ki[i] * integ[i] + c.kd[i] * ed + (ff ? ff[i] : 0);
          }
        }
        for (let i = 0; i < n; i++) {
          const J = model.joints[i];
          const kTau = J.gear.ratio * J.motor.Kt * J.gear.efficiency;
          const iMax = Math.min(J.motor.I_peak, drv.I_peak ?? Infinity);
          const raw = tauCmd[i] / kTau;
          iRef[i] = Math.max(-iMax, Math.min(iMax, raw));
          const saturated = Math.abs(raw) > iMax;
          if (saturated) event(t, 'warn', `${J.name}: current command saturated at ${iMax.toFixed(1)} A (${iMax === drv.I_peak ? 'driver' : 'motor'} peak limit)`, `sat${i}`);
          if (!saturated) integ[i] += (refNow.q[i] - qMeas[i]) * Ts; // conditional-integration anti-windup
        }
      }

      // ---------- current loop + motor electrical dynamics ----------
      const Vbus = Math.min(drv.V_max ?? Infinity, isBattery ? Vnom * (0.9 + 0.1 * soc) - (pwr.R_int ?? 0) * Ibus : Vnom);
      let Pbus = Pquiescent;
      for (let i = 0; i < n; i++) {
        const J = model.joints[i], m = J.motor, N = J.gear.ratio;
        const wm = N * qd[i];
        // Field-oriented current loop (runs at tens of kHz in a real driver) modelled as a first-order
        // closed loop of bandwidth ωc, limited by the available bus voltage. If the voltage needed to
        // follow the closed-loop response exceeds the bus, the winding is driven at ±Vbus and the
        // current follows the exact R–L–back-EMF solution instead.
        const aC = Math.exp(-2 * Math.PI * cfg.control.currentBw * dt);
        const iTarget = iRef[i] + (cur[i] - iRef[i]) * aC;
        const aRL = Math.exp((-m.R * dt) / m.L);
        // voltage that produces iTarget after dt under the exact R–L solution
        let V = m.Ke * wm + (m.R * (iTarget - cur[i] * aRL)) / (1 - aRL);
        if (Math.abs(V) <= Vbus) cur[i] = iTarget;
        else {
          V = Math.sign(V) * Vbus;
          const iss = (V - m.Ke * wm) / m.R;
          cur[i] = iss + (cur[i] - iss) * aRL;
        }
        volt[i] = V;
        const tm = m.Kt * cur[i];
        // gearbox efficiency: η when the motor drives the load, 1/η when the load back-drives the motor
        // (smoothly blended through zero power to avoid chattering at standstill)
        const fw = 0.5 * (1 + Math.tanh((tm * wm) / 0.5));
        tauJ[i] = N * tm * (fw * J.gear.efficiency + (1 - fw) / J.gear.efficiency);
        const pe = V * cur[i];
        Pbus += Math.max(0, pe); // no regeneration into the bus (brake resistor assumed)
      }
      if (pwr.kind === 'psu' && Pbus / Vbus > (pwr.I_max ?? Infinity)) event(t, 'warn', `Power supply current limit ${pwr.I_max} A exceeded (${(Pbus / Vbus).toFixed(1)} A)`, 'psu');
      Ibus = Pbus / Math.max(1, Vbus);
      energy += Pbus * dt;
      peakP = Math.max(peakP, Pbus);
      if (isBattery) soc -= (Ibus * dt) / capacityC;

      // ---------- mechanics ----------
      const acc = forwardDynamics(model, q, qd, tauJ, cfg.friction);
      for (let i = 0; i < n; i++) {
        qdd[i] = acc[i];
        qd[i] += acc[i] * dt;
        q[i] += qd[i] * dt;
        const J = model.joints[i];
        if (q[i] < J.lo || q[i] > J.hi) {
          q[i] = Math.max(J.lo, Math.min(J.hi, q[i]));
          qd[i] = 0;
          event(t, 'error', `${J.name} hit its mechanical joint limit`, `lim${i}`);
        }
        if (!isFinite(q[i])) throw new Error('Numerical instability – reduce controller gains or the physics time step.');
        const rpm = (Math.abs(qd[i] * J.gear.ratio) * 60) / (2 * Math.PI);
        if (rpm > J.motor.rpm_max) event(t, 'warn', `${J.name}: motor speed ${rpm.toFixed(0)} rpm exceeds the ${J.motor.rpm_max} rpm limit`, `rpm${i}`);
        const fu = U[i].force, what = U[i].unit === 'mm' ? 'axis output force' : 'gearbox output torque';
        if (Math.abs(tauJ[i]) > J.gear.T_peak) event(t, 'error', `${J.name}: ${what} ${Math.abs(tauJ[i]).toFixed(1)} ${fu} exceeds the peak rating ${J.gear.T_peak} ${fu}`, `gp${i}`);
        else if (Math.abs(tauJ[i]) > J.gear.T_rated) event(t, 'warn', `${J.name}: ${what} ${Math.abs(tauJ[i]).toFixed(1)} ${fu} exceeds the rated ${J.gear.T_rated} ${fu}`, `gr${i}`);
        sqI[i] += cur[i] * cur[i] * dt;
        peakI[i] = Math.max(peakI[i], Math.abs(cur[i]));
        peakT[i] = Math.max(peakT[i], Math.abs(tauJ[i]));
        peakRpm[i] = Math.max(peakRpm[i], rpm);
        eJ[i] += Math.max(0, volt[i] * cur[i]) * dt;
      }

      // ---------- record ----------
      if (k % recEvery === 0 && r < nRec) {
        tRec[r] = t;
        const { tcp, frames } = fk(model, q);
        const ref = fk(model, refNow.q).tcp.p;
        for (let i = 0; i < n; i++) {
          const j = `J${i + 1}`, J = model.joints[i], K = U[i].k;
          S[`${j}.q`][r] = q[i] * K;
          S[`${j}.qref`][r] = refNow.q[i] * K;
          S[`${j}.err`][r] = (refNow.q[i] - q[i]) * K;
          S[`${j}.qd`][r] = qd[i] * K;
          S[`${j}.qdref`][r] = refNow.qd[i] * K;
          S[`${j}.qdd`][r] = qdd[i] * K;
          S[`${j}.tau`][r] = tauJ[i];
          S[`${j}.tauCmd`][r] = tauCmd[i];
          S[`${j}.i`][r] = cur[i];
          S[`${j}.v`][r] = volt[i];
          S[`${j}.rpm`][r] = (qd[i] * J.gear.ratio * 60) / (2 * Math.PI);
          S[`${j}.tm`][r] = J.motor.Kt * cur[i];
          S[`${j}.pe`][r] = volt[i] * cur[i];
          S[`${j}.pm`][r] = tauJ[i] * qd[i];
        }
        S['ee.x'][r] = tcp.p[0]; S['ee.y'][r] = tcp.p[1]; S['ee.z'][r] = tcp.p[2];
        S['ee.xref'][r] = ref[0]; S['ee.yref'][r] = ref[1]; S['ee.zref'][r] = ref[2];
        S['ee.err'][r] = Math.hypot(tcp.p[0] - ref[0], tcp.p[1] - ref[1], tcp.p[2] - ref[2]) * 1000;
        S['pwr.bus'][r] = Pbus;
        S['pwr.ibus'][r] = Ibus;
        S['pwr.vbus'][r] = Vbus;
        S['pwr.energy'][r] = energy;
        S['bat.soc'][r] = soc * 100;
        S['grip.open'][r] = gripOpen * 1000;
        S['grip.payload'][r] = payloadOn ? 1 : 0;
        S['enc.J1'][r] = qMeas[0] * U[0].k;
        if (model.ft) {
          // wrench transmitted by the F/T sensor to the distal tool (sensor frame), from RNEA body kinematics
          const out = rnea(model, q, qd, qdd);
          const L = n - 1, Fs = model.ft.frame, d = model.ft.distal;
          const w = out.w[L], wd = out.wd[L];
          const aS = add(add(out.vd[L], cross(wd, Fs.p)), cross(w, cross(w, Fs.p)));
          const wS = mtv(Fs.R, w), wdS = mtv(Fs.R, wd), aSS = mtv(Fs.R, aS);
          const ac = add(add(cross(wdS, d.c), cross(wS, cross(wS, d.c))), aSS);
          const F: V3 = [d.m * ac[0], d.m * ac[1], d.m * ac[2]];
          const Mo = add(add(mv(d.I, wdS), cross(wS, mv(d.I, wS))), cross(d.c, F));
          S['ft.Fx'][r] = F[0]; S['ft.Fy'][r] = F[1]; S['ft.Fz'][r] = F[2];
          S['ft.Mx'][r] = Mo[0]; S['ft.My'][r] = Mo[1]; S['ft.Mz'][r] = Mo[2];
        }
        if (model.sensors.length) {
          const out = model.ft ? null : rnea(model, q, qd, qdd);
          const kin = out ?? rnea(model, q, qd, qdd);
          for (const s of model.sensors) {
            const F = s.frame;
            let w: V3 = [0, 0, 0], wd: V3 = [0, 0, 0], vd: V3 = [0, 0, 9.81];
            if (s.body > 0) { w = kin.w[s.body - 1]; wd = kin.wd[s.body - 1]; vd = kin.vd[s.body - 1]; }
            const a = add(add(vd, cross(wd, F.p)), cross(w, cross(w, F.p)));
            const aS = mtv(F.R, a), wS = mtv(F.R, w);
            if (S[`${s.name}.ax`]) { S[`${s.name}.ax`][r] = aS[0]; S[`${s.name}.ay`][r] = aS[1]; S[`${s.name}.az`][r] = aS[2]; }
            if (S[`${s.name}.gx`]) { const k = 180 / Math.PI; S[`${s.name}.gx`][r] = wS[0] * k; S[`${s.name}.gy`][r] = wS[1] * k; S[`${s.name}.gz`][r] = wS[2] * k; }
            if (S[`${s.name}.d`]) {
              const W = s.body > 0 ? tmul(frames[s.body - 1], F) : F;
              const dz = W.R[8], pz = W.p[2];
              let d = dz < -1e-6 ? -pz / dz : Infinity;
              if (!(d >= (s.minRange ?? 0) && d <= (s.range ?? Infinity))) d = s.range ?? 0; // out of range → reports max range
              S[`${s.name}.d`][r] = d;
            }
          }
        }
        if (tcp.p[2] < 0.01) event(t, 'error', 'TCP collided with the ground plane', 'ground');
        frames.forEach((F, i) => { if (F.p[2] < 0.0) event(t, 'error', `Joint J${i + 1} housing below the ground plane`, `gnd${i}`); });
        r++;
        if (onProgress && r % 200 === 0) onProgress(k / steps);
      }
    }
  } catch (e: any) {
    return { ...empty(e.message ?? String(e)), traj };
  }

  const nr = r;
  const trim = (a: Float32Array) => a.subarray(0, nr);
  for (const k of Object.keys(S)) S[k] = trim(S[k]);
  const T = tRec.subarray(0, nr);
  const simTime = steps * dt;
  // RMS current / thermal check
  const joints: JointMetric[] = baseModel.joints.map((J, i) => {
    const j = `J${i + 1}`;
    const rmsI = Math.sqrt(sqI[i] / simTime);
    if (rmsI > J.motor.I_rated) events.push({ t: simTime, level: 'warn', text: `${j}: RMS current ${rmsI.toFixed(1)} A exceeds the rated ${J.motor.I_rated} A – motor overload (thermal) over this cycle` });
    return {
      joint: j,
      rmseDeg: rmse(S[`${j}.q`], S[`${j}.qref`]),
      maeDeg: mae(S[`${j}.q`], S[`${j}.qref`]),
      maxErrDeg: S[`${j}.err`].reduce((m, v) => Math.max(m, Math.abs(v)), 0),
      peakTorque: peakT[i], rmsCurrent: rmsI, peakCurrent: peakI[i], energy: eJ[i], peakSpeedRpm: peakRpm[i],
    };
  });
  let stepM: SimResult['metrics']['step'];
  if (sc.kind === 'step') {
    const key = `J${sc.joint + 1}.q`;
    const y0 = cfg.home[sc.joint] * U[sc.joint].k;
    stepM = { ...stepMetrics(T, S[key], y0, y0 + sc.ampDeg, sc.tStep), joint: `J${sc.joint + 1}`, ampDeg: sc.ampDeg };
  }
  const eeErr = S['ee.err'];
  events.sort((a, b) => a.t - b.t);
  return {
    ok: true, t: T, signals: S, meta, events, traj,
    metrics: {
      simTime, wallTime: ((typeof performance !== 'undefined' ? performance : Date).now() - wall0) / 1000, steps, dt, Ts,
      joints,
      eeRmseMm: Math.sqrt(eeErr.reduce((s, v) => s + v * v, 0) / Math.max(1, eeErr.length)),
      eeMaxMm: eeErr.reduce((m, v) => Math.max(m, v), 0),
      energyJ: energy, peakPowerW: peakP, socEnd: soc, avgPowerW: energy / simTime,
      step: stepM,
      cycleTime: traj.duration,
    },
  };
}
