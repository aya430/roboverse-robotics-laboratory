// Derives the engineering robot model (serial kinematic chain, rigid-body mass properties,
// actuators, sensors, electronics) from the assembly. This is the shared representation used
// by kinematics, dynamics, control, simulation, URDF export and reports.

import { shapeVolume as gVolume, shapeInertia as gInertia } from './geometry';
import { getItem, type ElecSpec, type GearboxSpec, type GripperSpec, type MotorSpec, type Shape } from './catalog';
import {
  computeFrames, findInst, gearOf, inPortOf, isConnected, massOf, motorOf, portTf, rootOf, type Assembly, type Instance,
} from './assembly';
import {
  add, eulerDeg, mm, mtv, mv, scale, sub, tinv, tmul, transpose, tf, type M3, type Tf, type V3, I3, madd, mscale, dot,
} from './math';

export interface Inertial { m: number; c: V3; I: M3 } // I about COM, in the body frame

export interface JointModel {
  index: number;
  name: string;
  type: 'revolute' | 'prismatic';
  gbUid: string;
  motorUid: string;
  /** Transform from the previous body frame (or world for J1) to this joint frame at q = 0. */
  X: Tf;
  /** Zero-configuration world frame of the joint (z = axis). */
  F0: Tf;
  lo: number; hi: number; vmax: number;
  motor: MotorSpec;
  gear: GearboxSpec;
  /** Reflected rotor inertia N²·Jm (kg·m²). */
  armature: number;
  viscous: number; coulomb: number;
  body: Inertial;
  bodyUids: string[];
}

export interface RobotModel {
  name: string;
  n: number;
  joints: JointModel[];
  /** TCP frame relative to the last body frame. */
  tool: Tf;
  base: Inertial & { uids: string[] };
  totalMass: number;
  gripper?: GripperSpec & { uid: string };
  ft?: { uid: string; frame: Tf; distal: Inertial };
  /** Body-mounted sensors simulated from rigid-body kinematics (IMU family, range finders). */
  sensors: { uid: string; name: string; kind: string; body: number; frame: Tf; range?: number; minRange?: number }[];
  controller?: ElecSpec & { uid: string };
  driver?: ElecSpec & { uid: string };
  power?: ElecSpec & { uid: string };
}

export interface Issue { level: 'error' | 'warn' | 'info' | 'ok'; text: string; uid?: string }

const shapeVolume = (s: Shape) => gVolume(s);
const shapeInertiaLocal = (s: Shape, m: number): M3 => gInertia(s, m);

interface PointMass { m: number; c: V3; I: M3 } // world frame, I about own COM

/** Combine rigid pieces (world frame) into one inertial about the combined COM (world axes). */
export function combine(parts: PointMass[]): PointMass {
  const m = parts.reduce((s, p) => s + p.m, 0);
  if (m <= 0) return { m: 0, c: [0, 0, 0], I: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  let c: V3 = [0, 0, 0];
  for (const p of parts) c = add(c, scale(p.c, p.m / m));
  let I: M3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of parts) {
    const d = sub(p.c, c);
    const dd = dot(d, d);
    // parallel axis: I + m (|d|² E − d dᵀ)
    const pa: M3 = [dd - d[0] * d[0], -d[0] * d[1], -d[0] * d[2], -d[1] * d[0], dd - d[1] * d[1], -d[1] * d[2], -d[2] * d[0], -d[2] * d[1], dd - d[2] * d[2]];
    I = madd(I, madd(p.I, mscale(pa, p.m)));
  }
  return { m, c, I };
}

/** World-frame mass pieces of one instance (optionally only output-side or housing-side shapes). */
export function instancePieces(inst: Instance, T: Tf, which: 'housing' | 'output' | 'all' = 'all'): PointMass[] {
  const item = getItem(inst.item);
  const total = item.shapes.reduce((s, sh) => s + shapeVolume(sh), 0);
  const M = massOf(inst);
  const res: PointMass[] = [];
  for (const sh of item.shapes) {
    if (which === 'housing' && sh.onOutput) continue;
    if (which === 'output' && !sh.onOutput) continue;
    const m = (M * shapeVolume(sh)) / total;
    const Rw = mm(T.R, eulerDeg(sh.rot));
    const Il = shapeInertiaLocal(sh, m);
    res.push({ m, c: add(mv(T.R, sh.pos), T.p), I: mm(mm(Rw, Il), transpose(Rw)) });
  }
  return res;
}

/** Express a world-frame inertial in frame F. */
export const toFrame = (pm: PointMass, F: Tf): Inertial => ({
  m: pm.m,
  c: mtv(F.R, sub(pm.c, F.p)),
  I: mm(mm(transpose(F.R), pm.I), F.R),
});

export function buildRobotModel(a: Assembly): { model?: RobotModel; issues: Issue[] } {
  const issues: Issue[] = [];
  const root = rootOf(a);
  if (!root) return { issues: [{ level: 'error', text: 'No robot base in the assembly. Start by placing a base.' }] };

  const frames = computeFrames(a, {});
  // body bookkeeping
  const bodyPieces: PointMass[][] = [[]];
  const bodyUids: string[][] = [[root.uid]];
  interface J { gb: Instance; parentBody: number; body: number }
  const joints: J[] = [];

  const visit = (inst: Instance, body: number) => {
    const item = getItem(inst.item);
    const T = frames.get(inst.uid)!.T;
    let outBody = -1;
    if (item.gearbox) {
      bodyPieces[body].push(...instancePieces(inst, T, 'housing'));
      outBody = bodyPieces.length;
      bodyPieces.push(instancePieces(inst, T, 'output'));
      bodyUids.push([]);
      joints.push({ gb: inst, parentBody: body, body: outBody });
    } else bodyPieces[body].push(...instancePieces(inst, T));
    if (!bodyUids[body].includes(inst.uid)) bodyUids[body].push(inst.uid);
    for (const ch of a.instances.filter((i) => i.parent === inst.uid)) {
      const port = item.ports.find((p) => p.id === ch.parentPort);
      if (port?.rotary) {
        bodyUids[outBody].push(ch.uid);
        visit(ch, outBody);
      } else visit(ch, body);
    }
  };
  visit(root, 0);

  // serial-chain check
  const perBody = new Map<number, J[]>();
  for (const j of joints) perBody.set(j.parentBody, [...(perBody.get(j.parentBody) ?? []), j]);
  for (const [b, js] of perBody)
    if (js.length > 1)
      issues.push({ level: 'error', text: `Body ${b} carries ${js.length} joints (branched mechanism). The Phase-1 simulator supports serial chains; branched robots can be assembled but not simulated yet.` });

  const chain: J[] = [];
  let cur = 0;
  for (;;) {
    const nx = perBody.get(cur)?.[0];
    if (!nx) break;
    chain.push(nx);
    cur = nx.body;
  }

  // loose / unconnected parts
  for (const inst of a.instances)
    if (!isConnected(a, inst)) issues.push({ level: 'warn', text: `${getItem(inst.item).name} is placed but not connected (grey).`, uid: inst.uid });

  // motors without gearbox
  for (const inst of a.instances) {
    if (!getItem(inst.item).motor || !isConnected(a, inst)) continue;
    if (!a.instances.some((i) => i.parent === inst.uid))
      issues.push({ level: 'warn', text: `${getItem(inst.item).name} has no gearbox on its shaft – it does not drive a joint yet (yellow).`, uid: inst.uid });
  }

  const jm: JointModel[] = [];
  let prevF: Tf = tf();
  chain.forEach((j, k) => {
    const gb = j.gb;
    const gItem = getItem(gb.item);
    const outPort = gItem.ports.find((p) => p.rotary)!;
    const F0 = tmul(frames.get(gb.uid)!.T, portTf(outPort));
    // integrated actuators carry their own motor; otherwise the motor is the part on the gearbox input
    const ownMotor = motorOf(gb);
    const mInst = ownMotor ? gb : findInst(a, gb.parent);
    const motor = ownMotor ?? (mInst ? motorOf(mInst) : undefined);
    const gear = gearOf(gb)!;
    if (!motor || !mInst) {
      issues.push({ level: 'error', text: `Joint J${k + 1}: transmission has no motor on its input.`, uid: gb.uid });
      return;
    }
    const pieces = bodyPieces[j.body];
    if (pieces.length <= 1 && !a.instances.some((i) => i.parent === gb.uid))
      issues.push({ level: 'warn', text: `Joint J${k + 1}: nothing is attached to the output flange yet (yellow).`, uid: gb.uid });
    const body = toFrame(combine(pieces), F0);
    const N = gear.ratio;
    const pris = gear.joint === 'prismatic';
    const lim = pris ? 1e-3 : Math.PI / 180;
    jm.push({
      index: k,
      name: `J${k + 1}`,
      type: pris ? 'prismatic' : 'revolute',
      gbUid: gb.uid,
      motorUid: mInst.uid,
      X: tmul(tinv(prevF), F0),
      F0,
      lo: gear.limit_deg[0] * lim,
      hi: gear.limit_deg[1] * lim,
      vmax: gear.vmax_dps * lim,
      motor, gear,
      armature: N * N * motor.Jm,
      viscous: gear.viscous,
      coulomb: gear.coulomb,
      body,
      bodyUids: bodyUids[j.body],
    });
    prevF = F0;
  });

  // tool / TCP
  const lastBodyUids = jm.length ? jm[jm.length - 1].bodyUids : [root.uid];
  const Fn = jm.length ? jm[jm.length - 1].F0 : tf();
  let tool: Tf = tf();
  let gripper: RobotModel['gripper'];
  const gInst = a.instances.find((i) => lastBodyUids.includes(i.uid) && getItem(i.item).gripper);
  if (gInst) {
    const gs = getItem(gInst.item).gripper!;
    gripper = { ...gs, uid: gInst.uid };
    tool = tmul(tinv(Fn), tmul(frames.get(gInst.uid)!.T, tf(I3(), [0, 0, gs.tcp])));
  } else if (jm.length) {
    // farthest free output port in the last body, else the flange
    let best: Tf | undefined, bd = -1;
    for (const uid of lastBodyUids) {
      const inst = findInst(a, uid)!;
      for (const p of getItem(inst.item).ports) {
        if (p.dir !== 'out' || a.instances.some((i) => i.parent === uid && i.parentPort === p.id)) continue;
        const W = tmul(frames.get(uid)!.T, portTf(p));
        const T = tmul(tinv(Fn), W);
        const d = Math.hypot(...T.p);
        if (d > bd) { bd = d; best = T; }
      }
    }
    tool = best ?? tf();
  }

  // F/T sensor
  let ft: RobotModel['ft'];
  const ftInst = a.instances.find((i) => lastBodyUids.includes(i.uid) && getItem(i.item).ft);
  if (ftInst && jm.length) {
    const sItem = getItem(ftInst.item);
    const outP = sItem.ports.find((p) => p.dir === 'out')!;
    const Sw = tmul(frames.get(ftInst.uid)!.T, portTf(outP));
    const distal: PointMass[] = [];
    const rec = (uid: string) => {
      for (const ch of a.instances.filter((i) => i.parent === uid)) {
        distal.push(...instancePieces(ch, frames.get(ch.uid)!.T));
        rec(ch.uid);
      }
    };
    rec(ftInst.uid);
    ft = { uid: ftInst.uid, frame: tmul(tinv(Fn), Sw), distal: toFrame(combine(distal), Sw) };
  }

  // electronics
  const elec = (kind: ElecSpec['kind'][]) => {
    const inst = a.instances.find((i) => isConnected(a, i) && getItem(i.item).elec && kind.includes(getItem(i.item).elec!.kind));
    return inst ? { ...getItem(inst.item).elec!, uid: inst.uid } : undefined;
  };

  // body-mounted sensors (IMU, accelerometer, gyroscope, range finders)
  const sensors: RobotModel['sensors'] = [];
  const bodyOfUid = new Map<string, number>();
  bodyUids[0].forEach((u) => bodyOfUid.set(u, 0));
  chain.forEach((j, k) => bodyUids[j.body].forEach((u) => bodyOfUid.set(u, k + 1)));
  for (const inst of a.instances) {
    const sp = getItem(inst.item).sensor;
    if (!sp || !['imu', 'accelerometer', 'gyroscope', 'range', 'lidar'].includes(sp.kind)) continue;
    const b = bodyOfUid.get(inst.uid);
    if (b === undefined || (b > 0 && !jm[b - 1])) continue;
    const Fb = b === 0 ? tf() : jm[b - 1].F0;
    sensors.push({ uid: inst.uid, name: `${sp.kind === 'lidar' ? 'lidar' : sp.kind}${sensors.length + 1}`, kind: sp.kind, body: b, frame: tmul(tinv(Fb), frames.get(inst.uid)!.T), range: sp.range, minRange: sp.minRange });
  }

  const baseIn = toFrame(combine(bodyPieces[0]), tf());
  const totalMass = a.instances.filter((i) => isConnected(a, i)).reduce((s, i) => s + massOf(i), 0);

  const model: RobotModel = {
    name: a.name,
    n: jm.length,
    joints: jm,
    tool,
    base: { ...baseIn, uids: bodyUids[0] },
    totalMass,
    gripper, ft, sensors,
    controller: elec(['controller']),
    driver: elec(['driver']),
    power: elec(['battery', 'psu']),
  };
  return { model, issues };
}

/** Copy of the model with a payload point-mass (box of side s) rigidly attached at the TCP. */
export function withPayload(model: RobotModel, m: number, side = 0.05): RobotModel {
  if (m <= 0 || model.n === 0) return model;
  const last = model.joints[model.n - 1];
  const Ib = (m * side * side) / 6;
  const pay: PointMass = { m, c: model.tool.p, I: [Ib, 0, 0, 0, Ib, 0, 0, 0, Ib] };
  const body = combine([{ m: last.body.m, c: last.body.c, I: last.body.I }, pay]);
  const joints = model.joints.slice();
  joints[model.n - 1] = { ...last, body };
  let ft = model.ft;
  if (ft) {
    // payload expressed in the sensor frame
    const pS = mtv(ft.frame.R, sub(model.tool.p, ft.frame.p));
    const d = combine([{ m: ft.distal.m, c: ft.distal.c, I: ft.distal.I }, { m, c: pS, I: [Ib, 0, 0, 0, Ib, 0, 0, 0, Ib] }]);
    ft = { ...ft, distal: d };
  }
  return { ...model, joints, ft };
}

export { inPortOf };

/** Display scaling of a joint coordinate: degrees for revolute, millimetres for prismatic. */
export const jointUnit = (J: { type: 'revolute' | 'prismatic' }) =>
  J.type === 'prismatic' ? { k: 1000, unit: 'mm', force: 'N', vel: 'mm/s' } : { k: 180 / Math.PI, unit: 'deg', force: 'N·m', vel: 'deg/s' };
