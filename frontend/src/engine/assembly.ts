// Universal assembly engine: component instances connected port-to-port in a tree.
// The assembly is the single source of truth from which the robot model (kinematics,
// dynamics, actuators), the 3D scene and the URDF are all derived.

import { CAT, getItem, type CatalogItem, type Port, type MotorSpec, type GearboxSpec } from './catalog';
import { eulerDeg, jointTf, rotZ, tf, tinv, tmul, type Tf, type V3 } from './math';

export interface Instance {
  uid: string;
  item: string;
  parent?: string;
  parentPort?: string;
  /** Clocking of the part about the mating axis in 90° steps (alignment). */
  clock: number;
  /** World position for parts that are placed but not connected. */
  loose?: V3;
  /** Engineering parameter overrides (e.g. motor Kt, gearbox ratio, joint limits, mass). */
  params?: Record<string, number>;
  hidden?: boolean;
}

export interface Assembly {
  name: string;
  instances: Instance[];
}

export const emptyAssembly = (name = 'Untitled robot'): Assembly => ({ name, instances: [] });

let uidCounter = 0;
export const newUid = (item: string) => `${item.split('-')[0]}_${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const inPortOf = (item: CatalogItem): Port | undefined => item.ports.find((p) => p.dir === 'in');
export const portTf = (p: Port): Tf => {
  if (p.zx) {
    const n = (v: V3) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] as V3; };
    const z = n(p.zx[0]), x = n(p.zx[1]);
    const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return tf([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], p.pos);
  }
  return tf(eulerDeg(p.rot), p.pos);
};

export const findInst = (a: Assembly, uid?: string) => a.instances.find((i) => i.uid === uid);
export const childrenOf = (a: Assembly, uid: string) => a.instances.filter((i) => i.parent === uid);
export const rootOf = (a: Assembly) => a.instances.find((i) => getItem(i.item).root);

export function isPortOccupied(a: Assembly, uid: string, portId: string) {
  return a.instances.some((i) => i.parent === uid && i.parentPort === portId);
}

export interface FreePort { uid: string; port: Port }
export function freeOutPorts(a: Assembly): FreePort[] {
  const res: FreePort[] = [];
  for (const inst of a.instances) {
    if (!isConnected(a, inst)) continue;
    for (const p of getItem(inst.item).ports)
      if (p.dir === 'out' && !isPortOccupied(a, inst.uid, p.id)) res.push({ uid: inst.uid, port: p });
  }
  return res;
}

/** Instance is connected to the root through a chain of connections. */
export function isConnected(a: Assembly, inst: Instance): boolean {
  let cur: Instance | undefined = inst;
  let guard = 0;
  while (cur && guard++ < 500) {
    if (getItem(cur.item).root) return true;
    if (!cur.parent) return false;
    cur = findInst(a, cur.parent);
  }
  return false;
}

// ---------------- interface dictionary (used for explanations) ----------------
const IFACE: Record<string, string> = {
  'AM-L': 'Actuator mount size L – 4×M6 on Ø90 mm PCD, Ø70 mm spigot',
  'AM-M': 'Actuator mount size M – 4×M5 on Ø70 mm PCD, Ø56 mm spigot',
  'AM-S': 'Actuator mount size S – 4×M4 on Ø56 mm PCD, Ø44 mm spigot',
  'AM-N23': 'NEMA 23 face – 4×Ø5 mm on 47.14 mm square, Ø38.1 mm pilot',
  'SH-14': 'Ø14 mm keyed shaft (h6)',
  'SH-11': 'Ø11 mm keyed shaft (h6)',
  'SH-8': 'Ø8 mm D-cut shaft (h6)',
  'FL-L': 'Output flange L – 8×M6 on Ø64 mm PCD',
  'FL-M': 'Output flange M – 8×M5 on Ø50 mm PCD',
  'FL-S': 'Output flange S – 8×M4 on Ø36 mm PCD',
  'TF-40': 'ISO 9409-1-40-4-M6 tool flange',
  EBAY: 'Electronics bay (35 mm DIN rail + power/CAN connector)',
  'AM-N17': 'NEMA 17 face – 4×M3 on 31 mm square, Ø22 mm pilot',
  'AM-N34': 'NEMA 34 face – 4×Ø5.5 on 69.6 mm square, Ø73 mm pilot',
  'SH-5': 'Ø5 mm D-cut shaft (h6)',
  'SH-15': 'Ø15 mm shaft (h6)',
  'SRV-STD': 'Standard servo pocket – 40×20 mm body, ears on 48×10 mm',
  'HORN-25T': '25-tooth servo spline horn, 4×M2.5',
  'LM-80': 'Linear module base – 4×M6 on 60×60 mm',
  'LMC-80': 'Linear module carriage plate – 4×M5 on 60 mm square',
  LZ: 'SCARA Z-axis mount – Ø80 mm spigot, 4×M6',
  'EXT-20': '20-series T-slot extrusion end (M5 core)',
  'EXT-40': '40-series T-slot extrusion end (M8 core)',
  'SLOT-20': '20-series T-slot (6 mm slot, M5 T-nuts)',
  'SLOT-40': '40-series T-slot (8 mm slot, M8 T-nuts)',
  ACC: 'Accessory pattern – 4×M4 on 30 mm square',
  'BELT-GT2': 'GT2 belt track (6 mm)',
  'BELT-HTD5': 'HTD 5M belt track (15 mm)',
};
export const describeIface = (code: string) => IFACE[code] ?? code;

export interface CheckResult { ok: boolean; reason: string }

export function checkAttach(a: Assembly, itemId: string, parentUid: string, portId: string): CheckResult {
  const item = getItem(itemId);
  const parent = findInst(a, parentUid);
  if (!parent) return { ok: false, reason: 'Target component not found.' };
  const pItem = getItem(parent.item);
  const port = pItem.ports.find((p) => p.id === portId);
  if (!port) return { ok: false, reason: 'Unknown mounting interface.' };
  if (port.dir !== 'out') return { ok: false, reason: `${port.name} is an input interface and is already used to mount ${pItem.name}.` };
  if (!isConnected(a, parent)) return { ok: false, reason: `${pItem.name} is not yet connected to the robot base. Connect it first.` };
  if (isPortOccupied(a, parentUid, portId)) return { ok: false, reason: `${port.name} on ${pItem.name} is already occupied.` };
  if (item.root) return { ok: false, reason: `${item.name} is a root component (robot base) and cannot be mounted on another part.` };
  const ip = inPortOf(item);
  if (!ip) return { ok: false, reason: `${item.name} has no mounting interface.` };
  if (ip.iface !== port.iface) {
    return {
      ok: false,
      reason: `Interface mismatch: ${item.name} needs “${describeIface(ip.iface)}” but ${port.name} provides “${describeIface(port.iface)}”.`,
    };
  }
  return { ok: true, reason: `${item.name} → ${pItem.name} / ${port.name}: ${describeIface(port.iface)} ✓` };
}

/** All free ports in the assembly where the given catalog item could be installed. */
export function suggestedPorts(a: Assembly, itemId: string): FreePort[] {
  const item = getItem(itemId);
  const ip = inPortOf(item);
  if (!ip) return [];
  return freeOutPorts(a).filter((fp) => fp.port.iface === ip.iface);
}

/** Components whose input mates with the given free port (assistant suggestions). */
export function itemsForPort(port: Port): CatalogItem[] {
  return [...CAT.values()].filter((c) => inPortOf(c)?.iface === port.iface);
}

// ---------------- effective (override-aware) parameters ----------------
export function motorOf(inst: Instance): MotorSpec | undefined {
  const m = getItem(inst.item).motor;
  if (!m) return undefined;
  const o = inst.params ?? {};
  const r: any = { ...m };
  for (const k of Object.keys(m)) if (typeof o['motor.' + k] === 'number') r[k] = o['motor.' + k];
  return r;
}
export const isPrismatic = (inst: Instance) => getItem(inst.item).gearbox?.joint === 'prismatic';
export function gearOf(inst: Instance): GearboxSpec | undefined {
  const g = getItem(inst.item).gearbox;
  if (!g) return undefined;
  const o = inst.params ?? {};
  const r: any = { ...g, limit_deg: [...g.limit_deg] };
  for (const k of ['ratio', 'efficiency', 'T_rated', 'T_peak', 'viscous', 'coulomb', 'vmax_dps', 'backlash_arcmin'])
    if (typeof o['gear.' + k] === 'number') r[k] = o['gear.' + k];
  if (typeof o['gear.limit_lo'] === 'number') r.limit_deg[0] = o['gear.limit_lo'];
  if (typeof o['gear.limit_hi'] === 'number') r.limit_deg[1] = o['gear.limit_hi'];
  if (typeof o['gear.lead'] === 'number') r.lead = o['gear.lead'];
  if (r.joint === 'prismatic' && r.lead) r.ratio = (2 * Math.PI) / r.lead;
  return r;
}
export const massOf = (inst: Instance) => inst.params?.mass ?? getItem(inst.item).mass;

// ---------------- world transforms ----------------
export interface InstFrame {
  T: Tf; // instance frame in world
  Tout?: Tf; // gearbox: frame used for shapes that rotate with the output
}

/**
 * Compute world frames for all connected instances.
 * @param q joint angle per gearbox uid (rad)
 * @param explode exploded-view spacing in metres along each mating axis
 */
export function computeFrames(a: Assembly, q: Record<string, number> = {}, explode = 0): Map<string, InstFrame> {
  const out = new Map<string, InstFrame>();
  const visit = (inst: Instance, T: Tf) => {
    const item = getItem(inst.item);
    const f: InstFrame = { T };
    if (item.gearbox) {
      const po = item.ports.find((p) => p.rotary)!;
      const P = portTf(po);
      f.Tout = tmul(tmul(tmul(T, P), jointTf(isPrismatic(inst), q[inst.uid] ?? 0)), tinv(P));
    }
    out.set(inst.uid, f);
    for (const ch of childrenOf(a, inst.uid)) {
      const port = item.ports.find((p) => p.id === ch.parentPort);
      if (!port) continue;
      let Tp = tmul(T, portTf(port));
      if (port.rotary) Tp = tmul(Tp, jointTf(isPrismatic(inst), q[inst.uid] ?? 0));
      const cItem = getItem(ch.item);
      const ip = inPortOf(cItem);
      const Tc = tmul(tmul(tmul(Tp, tf(undefined, [0, 0, explode])), tf(rotZ((ch.clock * Math.PI) / 2))), tinv(ip ? portTf(ip) : tf()));
      visit(ch, Tc);
    }
  };
  for (const inst of a.instances) {
    const item = getItem(inst.item);
    if (item.root) visit(inst, tf());
    else if (!inst.parent || !findInst(a, inst.parent)) visit(inst, tf(undefined, inst.loose ?? [0.6, 0.6, 0]));
  }
  return out;
}

// ---------------- mutations (pure) ----------------
export function addRoot(a: Assembly, itemId: string): Assembly {
  if (rootOf(a)) throw new Error('The assembly already has a robot base.');
  return { ...a, instances: [...a.instances, { uid: newUid(itemId), item: itemId, clock: 0 }] };
}
export function addLoose(a: Assembly, itemId: string, pos: V3): { asm: Assembly; uid: string } {
  const uid = newUid(itemId);
  return { asm: { ...a, instances: [...a.instances, { uid, item: itemId, clock: 0, loose: pos }] }, uid };
}
export function attachNew(a: Assembly, itemId: string, parentUid: string, portId: string, clock = 0): { asm: Assembly; uid: string } {
  const chk = checkAttach(a, itemId, parentUid, portId);
  if (!chk.ok) throw new Error(chk.reason);
  const uid = newUid(itemId);
  return { asm: { ...a, instances: [...a.instances, { uid, item: itemId, parent: parentUid, parentPort: portId, clock }] }, uid };
}
/** Move an existing (loose or connected) instance with its subtree to a new port. */
export function moveTo(a: Assembly, uid: string, parentUid: string, portId: string): Assembly {
  const inst = findInst(a, uid)!;
  // forbid attaching into own subtree
  let cur = findInst(a, parentUid);
  while (cur) {
    if (cur.uid === uid) throw new Error('Cannot mount a component onto its own sub-assembly.');
    cur = findInst(a, cur.parent);
  }
  const tmp: Assembly = { ...a, instances: a.instances.filter((i) => i.uid !== uid) };
  const chk = checkAttach(tmp, inst.item, parentUid, portId);
  if (!chk.ok) throw new Error(chk.reason);
  return {
    ...a,
    instances: a.instances.map((i) => (i.uid === uid ? { ...i, parent: parentUid, parentPort: portId, loose: undefined } : i)),
  };
}
export function detach(a: Assembly, uid: string, pos: V3): Assembly {
  return { ...a, instances: a.instances.map((i) => (i.uid === uid ? { ...i, parent: undefined, parentPort: undefined, loose: pos } : i)) };
}
export function subtree(a: Assembly, uid: string): string[] {
  const res = [uid];
  for (const c of childrenOf(a, uid)) res.push(...subtree(a, c.uid));
  return res;
}
export function removeWithSubtree(a: Assembly, uid: string): Assembly {
  const del = new Set(subtree(a, uid));
  return { ...a, instances: a.instances.filter((i) => !del.has(i.uid)) };
}
export function updateInst(a: Assembly, uid: string, patch: Partial<Instance>): Assembly {
  return { ...a, instances: a.instances.map((i) => (i.uid === uid ? { ...i, ...patch } : i)) };
}

// ---------------- guided assembly (6-DOF arm reference build) ----------------
export interface GuidedStep {
  title: string;
  items: string[]; // acceptable catalog ids (first = recommended)
  parent: number | null; // index of the step whose instance carries the port (null = root)
  port?: string;
  explain: string;
}

export const ARM6_STEPS: GuidedStep[] = [
  { title: 'Place the robot base', items: ['base-pedestal'], parent: null, explain: 'The base is the fixed root of the kinematic tree. All loads finally flow into it, so it is anchored to the ground.' },
  { title: 'Install the motion controller', items: ['elec-controller'], parent: 0, port: 'bay1', explain: 'The controller runs the joint position/velocity/torque loops. Without it the joints have no closed-loop control.' },
  { title: 'Install the six-axis motor driver', items: ['elec-driver6', 'elec-driver4'], parent: 0, port: 'bay2', explain: 'The driver converts controller current commands into motor phase voltages. It needs one channel per joint and enough peak current.' },
  { title: 'Install the power source', items: ['elec-battery', 'elec-psu'], parent: 0, port: 'bay3', explain: 'A 48 V battery lets you study energy and state of charge; a power supply gives unlimited energy.' },
  { title: 'J1 motor (waist)', items: ['motor-g400'], parent: 0, port: 'j1', explain: 'The waist joint carries the whole arm about a vertical axis, so a size-L (400 W) motor is used.' },
  { title: 'J1 gearbox', items: ['hd-l100', 'pg-l20'], parent: 4, port: 'shaft', explain: 'The gearbox multiplies motor torque by the ratio (×η) and divides speed. Its output flange is the revolute joint J1 – its z-axis is the joint axis.' },
  { title: 'Link 1 – shoulder turret', items: ['link-turret'], parent: 5, port: 'output', explain: 'The turret rotates with J1 and turns the next joint axis by 90° so that J2 is horizontal.' },
  { title: 'J2 motor (shoulder)', items: ['motor-g400'], parent: 6, port: 'j2', explain: 'J2 lifts the upper arm, forearm, wrist and payload against gravity – it carries the highest static torque.' },
  { title: 'J2 gearbox', items: ['hd-l100', 'pg-l20'], parent: 7, port: 'shaft', explain: 'Check the rated output torque against the gravity torque shown in the validation report.' },
  { title: 'Link 2 – upper arm', items: ['link-upper-al', 'link-upper-cf'], parent: 8, port: 'output', explain: '400 mm between J2 and J3 axes. Compare aluminium and carbon fibre in the energy experiment.' },
  { title: 'J3 motor (elbow)', items: ['motor-g200'], parent: 9, port: 'j3', explain: 'The elbow uses a smaller size-M motor because it carries less mass.' },
  { title: 'J3 gearbox', items: ['hd-m100'], parent: 10, port: 'shaft', explain: 'J3 is parallel to J2 – together they form a planar 2-link arm in the vertical plane.' },
  { title: 'Link 3 – forearm', items: ['link-forearm'], parent: 11, port: 'output', explain: 'The forearm carries the wrist roll actuator with its axis along the forearm.' },
  { title: 'J4 motor (wrist roll)', items: ['motor-g100'], parent: 12, port: 'j4', explain: 'Wrist motors are small and light: their mass is lifted by all the proximal joints.' },
  { title: 'J4 gearbox', items: ['hd-s80'], parent: 13, port: 'shaft', explain: 'J4 rotates about the forearm axis.' },
  { title: 'Link 4 – wrist pitch bracket', items: ['link-wrist-pitch'], parent: 14, port: 'output', explain: 'Turns the axis 90° for J5.' },
  { title: 'J5 motor (wrist pitch)', items: ['motor-g100'], parent: 15, port: 'j5', explain: 'J5 tilts the tool.' },
  { title: 'J5 gearbox', items: ['hd-s80'], parent: 16, port: 'shaft', explain: 'J4, J5 and J6 form the wrist that sets tool orientation.' },
  { title: 'Link 5 – wrist roll bracket', items: ['link-wrist-roll'], parent: 17, port: 'output', explain: 'Turns the axis for J6 so the tool points down at the zero pose.' },
  { title: 'J6 motor (tool roll)', items: ['motor-g100'], parent: 18, port: 'j6', explain: 'Last joint – rotates the tool about its own axis.' },
  { title: 'J6 gearbox', items: ['hd-s80'], parent: 19, port: 'shaft', explain: 'Its output is the robot flange.' },
  { title: 'Wrist adapter (tool flange)', items: ['ee-adapter'], parent: 20, port: 'output', explain: 'Adapts the joint flange to the ISO 9409-1-40 tool interface.' },
  { title: 'Two-finger gripper', items: ['ee-gripper2', 'ee-vacuum'], parent: 21, port: 'tool', explain: 'The end effector. Its tool centre point (TCP) is the point that IK and trajectories control.' },
];

/** Map each guided step to the instance satisfying it (or undefined). */
export function guidedProgress(a: Assembly, steps = ARM6_STEPS): (string | undefined)[] {
  const res: (string | undefined)[] = [];
  steps.forEach((s, k) => {
    let uid: string | undefined;
    if (s.parent === null) uid = a.instances.find((i) => s.items.includes(i.item) && getItem(i.item).root)?.uid;
    else {
      const pu = res[s.parent];
      if (pu) uid = a.instances.find((i) => i.parent === pu && i.parentPort === s.port && s.items.includes(i.item))?.uid;
    }
    res[k] = uid;
  });
  return res;
}

/** Build the complete reference arm programmatically (used by templates and tests). */
export function buildReferenceArm(name = '6-DOF reference arm'): Assembly {
  let a = emptyAssembly(name);
  const uids: string[] = [];
  for (const s of ARM6_STEPS) {
    if (s.parent === null) {
      a = addRoot(a, s.items[0]);
      uids.push(a.instances[a.instances.length - 1].uid);
    } else {
      const r = attachNew(a, s.items[0], uids[s.parent], s.port!);
      a = r.asm;
      uids.push(r.uid);
    }
  }
  return a;
}

/** Catalog items that can replace an instance in place (same input interface, all used outputs present). */
export function swapCandidates(a: Assembly, uid: string): CatalogItem[] {
  const inst = findInst(a, uid);
  if (!inst) return [];
  const cur = getItem(inst.item);
  const used = childrenOf(a, uid).map((c) => cur.ports.find((p) => p.id === c.parentPort)!);
  const ip = inPortOf(cur);
  return [...CAT.values()].filter((c) => {
    if (c.id === cur.id || !!c.root !== !!cur.root) return false;
    if (inPortOf(c)?.iface !== ip?.iface) return false;
    return used.every((u) => c.ports.some((p) => p.id === u.id && p.iface === u.iface && p.dir === 'out'));
  });
}
export function swapItem(a: Assembly, uid: string, itemId: string): Assembly {
  if (!swapCandidates(a, uid).some((c) => c.id === itemId)) throw new Error('Not an interface-compatible replacement.');
  return updateInst(a, uid, { item: itemId, params: undefined });
}
