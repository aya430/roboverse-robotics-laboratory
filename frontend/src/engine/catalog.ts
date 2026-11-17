// ROBOVERSE component catalog.
//
// Every component is a ROBOVERSE *procedural reference part*: geometry is built from primitives
// defined here, so the same data drives rendering, mass properties, collision proxies and URDF export.
//
// IMPORTANT – specification provenance:
// The motor / gearbox / driver / battery figures below are GENERIC EDUCATIONAL REFERENCE VALUES that are
// representative of their product class (e.g. "400 W, 48 V BLDC servo"). They are NOT copied from, and do
// not represent, any manufacturer's datasheet. They are internally consistent (Kt = Ke in SI, rated torque
// = Kt·I_rated, no-load speed = V/Ke …), which the unit tests check. Students replace them with a real
// datasheet through the Properties panel (parameter overrides) when sizing a real robot.

import type { V3 } from './math';
import type { ShapeKind } from './geometry';
import { CATALOG_EXT } from './catalog_ext';

export type Category = 'Structure' | 'Actuators' | 'Transmissions' | 'Links' | 'End-effectors' | 'Sensors' | 'Electronics';

export interface Shape {
  kind: ShapeKind;
  /** see geometry.ts for the meaning of dims per kind (SI units; profile size in mm) */
  dims: number[];
  /** surface finish used by the renderer */
  finish?: 'metal' | 'anodised' | 'plastic' | 'rubber' | 'pcb' | 'glass' | 'carbon';
  /** gripper finger travel axis/sign handled via `finger` */
  pos: V3;
  rot?: V3; // XYZ euler, degrees
  color?: string;
  /** Shape rotates with the joint output (gearbox output flange) – belongs to the child body. */
  onOutput?: boolean;
  /** Gripper finger: translates along ±x with the gripper opening. */
  finger?: -1 | 1;
  /** Radial direction (deg about z) of a finger for multi-finger grippers; default ±x by `finger`. */
  fingerAngle?: number;
  /** Imported CAD tessellation (kind 'mesh'): base64 Float32 positions (m, bbox-centred) and optional Uint32 indices. */
  mesh?: { id: string; positions: string; indices?: string };
}

export interface Port {
  id: string;
  name: string;
  /** Mechanical/electrical interface code. Only identical codes can mate. */
  iface: string;
  dir: 'in' | 'out';
  pos: V3;
  rot?: V3; // XYZ euler degrees; port z-axis points downstream (parent → child)
  /** Alternative to rot: explicit [z-axis, x-axis] directions of the port frame in part coordinates. */
  zx?: [V3, V3];
  /** Port belongs to the rotating side of a joint (gearbox output). */
  rotary?: boolean;
  /** Human-readable installation hint shown by the assembly assistant. */
  hint?: string;
}

export interface MotorSpec {
  type: 'BLDC servo' | 'Hybrid stepper (DC-equivalent model)';
  V_nom: number; Kt: number; Ke: number; R: number; L: number; Jm: number;
  I_rated: number; I_peak: number; T_rated: number; T_peak: number;
  rpm_rated: number; rpm_max: number; efficiency: number; encoder_bits: number;
}
export interface GearboxSpec {
  type: 'Harmonic drive' | 'Planetary' | 'Cycloidal' | 'Strain-wave (integrated)' | 'Ball screw' | 'Lead screw' | 'Belt drive' | 'Spur gear train' | 'Rack and pinion';
  /** Joint produced at the output: revolute (default) or prismatic (linear axis). For prismatic joints
   *  ratio = 2π/lead [rad of motor per metre], torques are forces [N], limits are in mm, vmax in mm/s,
   *  viscous in N·s/m and coulomb in N. */
  joint?: 'revolute' | 'prismatic';
  lead?: number; // m per motor revolution (screw / belt / rack)
  ratio: number; efficiency: number; T_rated: number; T_peak: number; backlash_arcmin: number;
  /** joint defaults */
  limit_deg: [number, number]; viscous: number; coulomb: number; vmax_dps: number;
}
export interface ElecSpec {
  kind: 'controller' | 'driver' | 'battery' | 'psu';
  channels?: number; rate_hz?: number; I_cont?: number; I_peak?: number; V_max?: number;
  V_nom?: number; capacity_Ah?: number; R_int?: number; I_max?: number;
}
export interface GripperSpec { kind: 'parallel' | 'vacuum' | 'adaptive' | 'hand' | 'magnetic' | 'tool'; stroke: number; force: number; tcp: number }
export interface SensorSpec {
  kind: 'imu' | 'accelerometer' | 'gyroscope' | 'magnetometer' | 'range' | 'lidar' | 'camera' | 'encoder' | 'force' | 'torque' | 'pressure' | 'tactile' | 'proximity';
  /** measurement range (m for range sensors, g / dps for inertial) */
  range?: number; minRange?: number; rate_hz?: number; noise?: number; note?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: Category;
  sub: string;
  description: string;
  material: string;
  /** Total mass in kg (distributed over shapes by volume). */
  mass: number;
  shapes: Shape[];
  ports: Port[];
  motor?: MotorSpec;
  gearbox?: GearboxSpec;
  elec?: ElecSpec;
  gripper?: GripperSpec;
  ft?: { range_N: number; range_Nm: number };
  sensor?: SensorSpec;
  /** Component is part of the library and can be assembled, but its physics is not simulated in this build. */
  libraryOnly?: string;
  role?: string;
  root?: boolean;
  source: { origin: string; licence: string; note: string };
}

const SRC = {
  origin: 'ROBOVERSE procedural reference model',
  licence: 'CC BY 4.0 (ROBOVERSE project)',
  note: 'Original educational geometry. Generic class-representative parameters, not a manufacturer datasheet.',
};

const C = {
  alu: '#b9c2cc', dark: '#3a4250', steel: '#8a939e', orange: '#e8833a', motor: '#2d3540', blue: '#3c6fd1',
  carbon: '#2a2a2e', green: '#2f8f6b', pcb: '#1f6b4a', yellow: '#d9b234',
};

// ---- helper to build an "actuator stack" motor / gearbox ----
function motor(id: string, name: string, size: 'L' | 'M' | 'S', spec: MotorSpec, mass: number, r: number, h: number, shaft: number): CatalogItem {
  return {
    id, name, category: 'Actuators', sub: spec.type, material: 'Aluminium housing, NdFeB rotor', mass,
    description: `${spec.type}, ${spec.V_nom} V, rated ${spec.T_rated} N·m @ ${spec.rpm_rated} rpm, integrated ${spec.encoder_bits}-bit absolute encoder. Rear-face mounted on an AM-${size} actuator mount; ${shaft} mm output shaft drives a matching gearbox.`,
    role: `Joint actuator (size ${size})`,
    shapes: [
      { kind: 'box', dims: [r * 2.05, r * 2.05, 0.012], pos: [0, 0, 0.006], color: C.dark },
      { kind: 'cyl', dims: [r, h - 0.024], pos: [0, 0, h / 2], color: C.motor },
      { kind: 'box', dims: [r * 2.05, r * 2.05, 0.012], pos: [0, 0, h - 0.006], color: C.dark },
      { kind: 'box', dims: [0.03, 0.018, 0.03], pos: [r + 0.006, 0, h * 0.45], color: C.orange },
    ],
    ports: [
      { id: 'mount', name: 'Rear mounting face', iface: `AM-${size}`, dir: 'in', pos: [0, 0, 0], hint: `Mount on an AM-${size} actuator mount` },
      { id: 'shaft', name: `Output shaft Ø${shaft} mm`, iface: `SH-${shaft}`, dir: 'out', pos: [0, 0, h], hint: `Accepts a gearbox with Ø${shaft} mm input` },
    ],
    motor: spec, source: SRC,
  };
}

function gearbox(id: string, name: string, shaft: number, flange: string, spec: GearboxSpec, mass: number, r: number, h: number): CatalogItem {
  return {
    id, name, category: 'Transmissions', sub: spec.type, material: spec.type === 'Harmonic drive' ? 'Steel flexspline, aluminium housing' : 'Hardened steel gears',
    mass,
    description: `${spec.type} ratio ${spec.ratio}:1, η = ${Math.round(spec.efficiency * 100)} %, rated output ${spec.T_rated} N·m (peak ${spec.T_peak} N·m), backlash ${spec.backlash_arcmin} arcmin. Input Ø${shaft} mm; output ${flange} flange with integrated crossed-roller bearing. The output flange is the revolute joint.`,
    role: 'Joint transmission + bearing (defines the joint axis)',
    shapes: [
      { kind: 'cyl', dims: [r, h - 0.013], pos: [0, 0, (h - 0.013) / 2], color: C.steel },
      { kind: 'cyl', dims: [r * 1.03, 0.006], pos: [0, 0, h - 0.016], color: C.dark },
      { kind: 'cyl', dims: [r * 0.75, 0.013], pos: [0, 0, h - 0.0065], color: C.blue, onOutput: true },
    ],
    ports: [
      { id: 'input', name: `Input bore Ø${shaft} mm`, iface: `SH-${shaft}`, dir: 'in', pos: [0, 0, 0], hint: `Couple to a motor with Ø${shaft} mm shaft` },
      { id: 'output', name: `Output flange ${flange}`, iface: flange, dir: 'out', pos: [0, 0, h], rotary: true, hint: `Revolute joint output – attach a link with a ${flange} input` },
    ],
    gearbox: spec, source: SRC,
  };
}

// ---------- Motor parameter sets (generic, consistent) ----------
const G400: MotorSpec = { type: 'BLDC servo', V_nom: 48, Kt: 0.11, Ke: 0.11, R: 0.25, L: 0.4e-3, Jm: 0.34e-4, I_rated: 11.5, I_peak: 34.5, T_rated: 1.265, T_peak: 3.795, rpm_rated: 3000, rpm_max: 4000, efficiency: 0.88, encoder_bits: 17 };
const G200: MotorSpec = { type: 'BLDC servo', V_nom: 48, Kt: 0.09, Ke: 0.09, R: 0.5, L: 0.6e-3, Jm: 0.18e-4, I_rated: 7.1, I_peak: 21.3, T_rated: 0.639, T_peak: 1.917, rpm_rated: 3000, rpm_max: 4500, efficiency: 0.86, encoder_bits: 17 };
const G100: MotorSpec = { type: 'BLDC servo', V_nom: 48, Kt: 0.06, Ke: 0.06, R: 0.9, L: 0.8e-3, Jm: 0.05e-4, I_rated: 5.3, I_peak: 15.9, T_rated: 0.318, T_peak: 0.954, rpm_rated: 3000, rpm_max: 6000, efficiency: 0.84, encoder_bits: 17 };
const N23: MotorSpec = { type: 'Hybrid stepper (DC-equivalent model)', V_nom: 48, Kt: 0.45, Ke: 0.45, R: 0.9, L: 3.0e-3, Jm: 0.48e-4, I_rated: 4.2, I_peak: 4.2, T_rated: 1.89, T_peak: 1.89, rpm_rated: 300, rpm_max: 1000, efficiency: 0.7, encoder_bits: 12 };

const HD_L: GearboxSpec = { type: 'Harmonic drive', ratio: 100, efficiency: 0.78, T_rated: 98, T_peak: 280, backlash_arcmin: 1, limit_deg: [-170, 170], viscous: 2.0, coulomb: 1.5, vmax_dps: 180 };
const PG_L: GearboxSpec = { type: 'Planetary', ratio: 20, efficiency: 0.92, T_rated: 40, T_peak: 75, backlash_arcmin: 8, limit_deg: [-170, 170], viscous: 0.6, coulomb: 0.5, vmax_dps: 360 };
const HD_M: GearboxSpec = { type: 'Harmonic drive', ratio: 100, efficiency: 0.75, T_rated: 44, T_peak: 120, backlash_arcmin: 1, limit_deg: [-165, 165], viscous: 1.0, coulomb: 0.8, vmax_dps: 180 };
const HD_S: GearboxSpec = { type: 'Harmonic drive', ratio: 80, efficiency: 0.72, T_rated: 16, T_peak: 40, backlash_arcmin: 1, limit_deg: [-175, 175], viscous: 0.25, coulomb: 0.2, vmax_dps: 225 };

export const CATALOG: CatalogItem[] = [
  // ---------------- Structure ----------------
  {
    id: 'base-pedestal', name: 'Robot base pedestal B-400', category: 'Structure', sub: 'Robot base', root: true,
    material: 'Welded steel with aluminium top plate', mass: 18,
    description: 'Floor-mounted base. Provides the J1 actuator mount (AM-L, vertical axis) and three electronics bays (EBAY) on the rear deck for controller, motor driver and power source.',
    role: 'Fixed root of the kinematic tree (anchored to ground)',
    shapes: [
      { kind: 'box', dims: [0.52, 0.38, 0.03], pos: [-0.09, 0, 0.015], color: C.dark },
      { kind: 'cyl', dims: [0.1, 0.15], pos: [0, 0, 0.105], color: C.orange },
      { kind: 'cyl', dims: [0.08, 0.02], pos: [0, 0, 0.19], color: C.alu },
    ],
    ports: [
      { id: 'j1', name: 'J1 actuator mount (vertical)', iface: 'AM-L', dir: 'out', pos: [0, 0, 0.2], hint: 'Base joint (J1, waist) – vertical axis' },
      { id: 'bay1', name: 'Electronics bay 1', iface: 'EBAY', dir: 'out', pos: [-0.26, -0.115, 0.03], hint: 'Controller / driver / power' },
      { id: 'bay2', name: 'Electronics bay 2', iface: 'EBAY', dir: 'out', pos: [-0.26, 0, 0.03], hint: 'Controller / driver / power' },
      { id: 'bay3', name: 'Electronics bay 3', iface: 'EBAY', dir: 'out', pos: [-0.26, 0.115, 0.03], hint: 'Controller / driver / power' },
      { id: 'acc1', name: 'Accessory mount (deck front)', iface: 'ACC', dir: 'out', pos: [-0.15, -0.15, 0.03], hint: 'Sensors, E-stop, cameras' },
      { id: 'acc2', name: 'Accessory mount (column)', iface: 'ACC', dir: 'out', pos: [0.1, 0, 0.1], zx: [[1, 0, 0], [0, 0, 1]], hint: 'Sensors' },
    ],
    source: SRC,
  },
  // ---------------- Actuators ----------------
  motor('motor-g400', 'BLDC servo motor G-400 (400 W)', 'L', G400, 1.25, 0.045, 0.1, 14),
  motor('motor-g200', 'BLDC servo motor G-200 (200 W)', 'M', G200, 0.8, 0.035, 0.085, 11),
  motor('motor-g100', 'BLDC servo motor G-100 (100 W)', 'S', G100, 0.5, 0.028, 0.07, 8),
  {
    ...motor('motor-n23', 'Hybrid stepper motor NEMA 23 (1.9 N·m)', 'S', N23, 1.0, 0.03, 0.076, 8),
    description: 'NEMA 23 two-phase hybrid stepper, 1.9 N·m holding torque, 4.2 A/phase. Simulated with a DC-equivalent torque model (pull-out torque fall-off is approximated by the back-EMF term). Mounts on an AM-N23 interface – use the NEMA 23 adapter plate.',
    ports: [
      { id: 'mount', name: 'NEMA 23 face (47.14 mm bolt square)', iface: 'AM-N23', dir: 'in', pos: [0, 0, 0], hint: 'Needs the NEMA 23 → AM-S adapter plate' },
      { id: 'shaft', name: 'Output shaft Ø8 mm', iface: 'SH-8', dir: 'out', pos: [0, 0, 0.076], hint: 'Accepts a gearbox with Ø8 mm input' },
    ],
  },
  // ---------------- Transmissions ----------------
  gearbox('hd-l100', 'Harmonic drive HD-L 100:1', 14, 'FL-L', HD_L, 1.1, 0.06, 0.07),
  gearbox('pg-l20', 'Planetary gearbox PG-L 20:1', 14, 'FL-L', PG_L, 0.9, 0.055, 0.065),
  gearbox('hd-m100', 'Harmonic drive HD-M 100:1', 11, 'FL-M', HD_M, 0.65, 0.048, 0.057),
  gearbox('hd-s80', 'Harmonic drive HD-S 80:1', 8, 'FL-S', HD_S, 0.35, 0.036, 0.045),
  {
    id: 'adapter-n23', name: 'NEMA 23 → AM-S adapter plate', category: 'Transmissions', sub: 'Adapter plate', material: 'Aluminium 6061', mass: 0.08,
    description: 'Converts an AM-S actuator mount to the NEMA 23 bolt pattern so a stepper can drive a size-S gearbox.',
    shapes: [{ kind: 'box', dims: [0.06, 0.06, 0.008], pos: [0, 0, 0.004], color: C.alu }],
    ports: [
      { id: 'in', name: 'AM-S face', iface: 'AM-S', dir: 'in', pos: [0, 0, 0] },
      { id: 'out', name: 'NEMA 23 face', iface: 'AM-N23', dir: 'out', pos: [0, 0, 0.008], hint: 'NEMA 23 stepper' },
    ],
    source: SRC,
  },
  // ---------------- Links ----------------
  {
    id: 'link-turret', name: 'Shoulder turret link', category: 'Links', sub: 'Shoulder bracket', material: 'Cast aluminium A356', mass: 3.2,
    description: 'Rotates with J1. Carries the J2 (shoulder) actuator mount on its side so that J2 is horizontal and perpendicular to J1.',
    role: 'Link 1 (J1 → J2)',
    shapes: [
      { kind: 'cyl', dims: [0.065, 0.1], pos: [0, 0, 0.05], color: C.orange },
      { kind: 'box', dims: [0.13, 0.07, 0.13], pos: [0, 0.035, 0.16], color: C.orange },
    ],
    ports: [
      { id: 'in', name: 'Input flange FL-L', iface: 'FL-L', dir: 'in', pos: [0, 0, 0] },
      { id: 'j2', name: 'J2 actuator mount (shoulder, horizontal)', iface: 'AM-L', dir: 'out', pos: [0, 0.07, 0.16], rot: [-90, 0, 0], hint: 'Shoulder joint (J2)' },
      { id: 'acc', name: 'Accessory mount (turret front)', iface: 'ACC', dir: 'out', pos: [0.065, 0, 0.06], zx: [[1, 0, 0], [0, 0, 1]], hint: 'IMU, camera' },
    ],
    source: SRC,
  },
  {
    id: 'link-upper-al', name: 'Upper-arm link 400 mm (aluminium)', category: 'Links', sub: 'Upper arm', material: 'Aluminium 6082-T6 hollow section', mass: 2.6,
    description: '400 mm between joint axes. Input FL-L (from J2 output) and AM-M mount for the elbow actuator J3, axis parallel to J2.',
    role: 'Link 2 (J2 → J3)',
    shapes: [
      { kind: 'cyl', dims: [0.065, 0.03], pos: [0, 0, 0.015], color: C.alu },
      { kind: 'box', dims: [0.08, 0.4, 0.05], pos: [0, -0.2, 0.045], color: C.alu },
      { kind: 'cyl', dims: [0.055, 0.05], pos: [0, -0.4, 0.045], color: C.alu },
    ],
    ports: [
      { id: 'in', name: 'Input flange FL-L', iface: 'FL-L', dir: 'in', pos: [0, 0, 0] },
      { id: 'j3', name: 'J3 actuator mount (elbow, inboard)', iface: 'AM-M', dir: 'out', pos: [0, -0.4, 0.02], rot: [180, 0, 0], hint: 'Elbow joint (J3)' },
      { id: 'acc', name: 'Accessory mount (outer face)', iface: 'ACC', dir: 'out', pos: [0, -0.2, 0.07], hint: 'IMU / sensors' },
    ],
    source: SRC,
  },
  {
    id: 'link-upper-cf', name: 'Upper-arm link 400 mm (carbon fibre)', category: 'Links', sub: 'Upper arm', material: 'Carbon-fibre tube with aluminium end fittings', mass: 1.4,
    description: 'Same interfaces and geometry as the aluminium upper arm, 46 % lighter. Use it to study how link mass changes joint torque and energy.',
    role: 'Link 2 (J2 → J3)',
    shapes: [
      { kind: 'cyl', dims: [0.065, 0.03], pos: [0, 0, 0.015], color: C.alu },
      { kind: 'box', dims: [0.07, 0.4, 0.045], pos: [0, -0.2, 0.045], color: C.carbon },
      { kind: 'cyl', dims: [0.055, 0.05], pos: [0, -0.4, 0.045], color: C.alu },
    ],
    ports: [
      { id: 'in', name: 'Input flange FL-L', iface: 'FL-L', dir: 'in', pos: [0, 0, 0] },
      { id: 'j3', name: 'J3 actuator mount (elbow, inboard)', iface: 'AM-M', dir: 'out', pos: [0, -0.4, 0.02], rot: [180, 0, 0], hint: 'Elbow joint (J3)' },
      { id: 'acc', name: 'Accessory mount (outer face)', iface: 'ACC', dir: 'out', pos: [0, -0.2, 0.07], hint: 'IMU / sensors' },
    ],
    source: SRC,
  },
  {
    id: 'link-forearm', name: 'Forearm link 300 mm', category: 'Links', sub: 'Forearm', material: 'Aluminium 6082-T6', mass: 1.8,
    description: 'Input FL-M from the elbow. Carries the wrist-roll actuator mount J4 with its axis along the forearm.',
    role: 'Link 3 (J3 → J4)',
    shapes: [
      { kind: 'cyl', dims: [0.05, 0.03], pos: [0, 0, 0.015], color: C.orange },
      { kind: 'box', dims: [0.26, 0.06, 0.045], pos: [0.13, 0, 0.0425], color: C.orange },
      { kind: 'box', dims: [0.04, 0.07, 0.07], pos: [0.28, 0, 0.0425], color: C.orange },
    ],
    ports: [
      { id: 'in', name: 'Input flange FL-M', iface: 'FL-M', dir: 'in', pos: [0, 0, 0] },
      { id: 'j4', name: 'J4 actuator mount (wrist roll)', iface: 'AM-S', dir: 'out', pos: [0.3, 0, 0.0425], rot: [0, 90, 0], hint: 'Wrist roll (J4)' },
      { id: 'acc', name: 'Accessory mount (underside)', iface: 'ACC', dir: 'out', pos: [0.16, -0.03, 0.0425], zx: [[0, -1, 0], [1, 0, 0]], hint: 'Range sensor / camera looking down' },
    ],
    source: SRC,
  },
  {
    id: 'link-wrist-pitch', name: 'Wrist pitch bracket', category: 'Links', sub: 'Wrist bracket', material: 'Aluminium 7075', mass: 0.45,
    description: 'Turns the axis by 90° so that J5 (wrist pitch) is perpendicular to J4.',
    role: 'Link 4 (J4 → J5)',
    shapes: [
      { kind: 'cyl', dims: [0.035, 0.02], pos: [0, 0, 0.01], color: C.alu },
      { kind: 'box', dims: [0.05, 0.06, 0.07], pos: [0.015, 0, 0.055], color: C.alu },
    ],
    ports: [
      { id: 'in', name: 'Input flange FL-S', iface: 'FL-S', dir: 'in', pos: [0, 0, 0] },
      { id: 'j5', name: 'J5 actuator mount (wrist pitch)', iface: 'AM-S', dir: 'out', pos: [0.04, 0, 0.07], rot: [0, 90, 0], hint: 'Wrist pitch (J5)' },
    ],
    source: SRC,
  },
  {
    id: 'link-wrist-roll', name: 'Wrist roll bracket', category: 'Links', sub: 'Wrist bracket', material: 'Aluminium 7075', mass: 0.4,
    description: 'Turns the axis by 90° so that J6 (tool roll) is perpendicular to J5; at the zero pose the tool points down.',
    role: 'Link 5 (J5 → J6)',
    shapes: [
      { kind: 'cyl', dims: [0.035, 0.02], pos: [0, 0, 0.01], color: C.alu },
      { kind: 'box', dims: [0.09, 0.06, 0.1], pos: [-0.04, -0.01, -0.03], color: C.alu },
    ],
    ports: [
      { id: 'in', name: 'Input flange FL-S', iface: 'FL-S', dir: 'in', pos: [0, 0, 0] },
      { id: 'j6', name: 'J6 actuator mount (tool roll)', iface: 'AM-S', dir: 'out', pos: [-0.06, -0.04, -0.06], rot: [90, 0, 0], hint: 'Tool roll (J6)' },
    ],
    source: SRC,
  },
  // ---------------- End-effectors ----------------
  {
    id: 'ee-adapter', name: 'Wrist adapter FL-S → ISO 9409-1-40', category: 'End-effectors', sub: 'Tool adapter', material: 'Aluminium 7075', mass: 0.12,
    description: 'Converts the J6 output flange to a standard ISO 9409-1-40-4-M6 tool flange.',
    role: 'Tool flange',
    shapes: [{ kind: 'cyl', dims: [0.032, 0.02], pos: [0, 0, 0.01], color: C.dark }],
    ports: [
      { id: 'in', name: 'Input flange FL-S', iface: 'FL-S', dir: 'in', pos: [0, 0, 0] },
      { id: 'tool', name: 'Tool flange ISO 9409-1-40', iface: 'TF-40', dir: 'out', pos: [0, 0, 0.02], hint: 'Gripper, vacuum tool or F/T sensor' },
    ],
    source: SRC,
  },
  {
    id: 'ee-gripper2', name: 'Two-finger parallel gripper PG-80', category: 'End-effectors', sub: 'Parallel gripper', material: 'Aluminium body, POM fingers', mass: 0.9,
    description: 'Electric parallel gripper, 80 mm total stroke, 140 N grip force. TCP 120 mm from the tool flange.',
    role: 'End effector',
    shapes: [
      { kind: 'box', dims: [0.1, 0.05, 0.06], pos: [0, 0, 0.03], color: C.dark },
      { kind: 'box', dims: [0.014, 0.03, 0.06], pos: [0, 0, 0.09], color: C.yellow, finger: -1 },
      { kind: 'box', dims: [0.014, 0.03, 0.06], pos: [0, 0, 0.09], color: C.yellow, finger: 1 },
    ],
    ports: [{ id: 'in', name: 'ISO 9409-1-40 mounting', iface: 'TF-40', dir: 'in', pos: [0, 0, 0] },
      { id: 'acc', name: 'Wrist camera mount', iface: 'ACC', dir: 'out', pos: [0, 0.025, 0.03], zx: [[0, 1, 0], [0, 0, 1]], hint: 'Wrist camera / ToF sensor' }],
    gripper: { kind: 'parallel', stroke: 0.08, force: 140, tcp: 0.12 },
    source: SRC,
  },
  {
    id: 'ee-vacuum', name: 'Vacuum gripper VG-1', category: 'End-effectors', sub: 'Vacuum gripper', material: 'Aluminium, silicone cup', mass: 0.35,
    description: 'Single Ø40 mm suction cup with venturi generator. TCP at the cup face, 90 mm from the tool flange.',
    role: 'End effector',
    shapes: [
      { kind: 'cyl', dims: [0.03, 0.05], pos: [0, 0, 0.025], color: C.dark },
      { kind: 'cyl', dims: [0.008, 0.03], pos: [0, 0, 0.065], color: C.steel },
      { kind: 'cyl', dims: [0.02, 0.01], pos: [0, 0, 0.085], color: C.blue },
    ],
    ports: [{ id: 'in', name: 'ISO 9409-1-40 mounting', iface: 'TF-40', dir: 'in', pos: [0, 0, 0] }],
    gripper: { kind: 'vacuum', stroke: 0, force: 60, tcp: 0.09 },
    source: SRC,
  },
  // ---------------- Sensors ----------------
  {
    id: 'sens-ft', name: '6-axis force/torque sensor FT-40', category: 'Sensors', sub: 'Force/torque', material: 'Stainless steel strain-gauge body', mass: 0.25,
    description: 'Mounted between tool flange and gripper. In simulation it reports the wrench transmitted through it, computed by the recursive Newton–Euler algorithm (not a synthetic signal).',
    role: 'Wrist F/T sensing',
    shapes: [{ kind: 'cyl', dims: [0.036, 0.03], pos: [0, 0, 0.015], color: C.green }],
    ports: [
      { id: 'in', name: 'ISO 9409-1-40 (robot side)', iface: 'TF-40', dir: 'in', pos: [0, 0, 0] },
      { id: 'tool', name: 'ISO 9409-1-40 (tool side)', iface: 'TF-40', dir: 'out', pos: [0, 0, 0.03], hint: 'Gripper / tool' },
    ],
    ft: { range_N: 300, range_Nm: 15 },
    source: SRC,
  },
  // ---------------- Electronics ----------------
  {
    id: 'elec-controller', name: 'Motion controller RC-1 (STM32H7-class)', category: 'Electronics', sub: 'Robot controller', material: 'PCB in aluminium enclosure', mass: 0.6,
    description: 'Real-time joint controller. Runs the position/velocity/torque loops; maximum control rate 4 kHz; CAN-FD to the motor driver.',
    shapes: [{ kind: 'box', dims: [0.08, 0.1, 0.05], pos: [0, 0, 0.025], color: C.pcb }],
    ports: [{ id: 'in', name: 'Bay mount', iface: 'EBAY', dir: 'in', pos: [0, 0, 0] }],
    elec: { kind: 'controller', rate_hz: 4000, channels: 8 },
    source: SRC,
  },
  {
    id: 'elec-driver6', name: 'Six-axis BLDC driver DRV-6', category: 'Electronics', sub: 'Motor driver', material: 'Power PCB, heat sink', mass: 1.1,
    description: 'Six FOC current-controlled channels, 60 V max, 20 A continuous / 40 A peak per channel.',
    shapes: [
      { kind: 'box', dims: [0.08, 0.1, 0.04], pos: [0, 0, 0.02], color: C.blue },
      { kind: 'box', dims: [0.08, 0.1, 0.02], pos: [0, 0, 0.05], color: C.steel },
    ],
    ports: [{ id: 'in', name: 'Bay mount', iface: 'EBAY', dir: 'in', pos: [0, 0, 0] }],
    elec: { kind: 'driver', channels: 6, I_cont: 20, I_peak: 40, V_max: 60 },
    source: SRC,
  },
  {
    id: 'elec-driver4', name: 'Four-axis driver DRV-4 (10 A)', category: 'Electronics', sub: 'Motor driver', material: 'PCB', mass: 0.5,
    description: 'Hobby-class four-channel driver, 10 A peak. Too small for a 6-axis arm – useful for a sizing exercise.',
    shapes: [{ kind: 'box', dims: [0.08, 0.1, 0.03], pos: [0, 0, 0.015], color: C.blue }],
    ports: [{ id: 'in', name: 'Bay mount', iface: 'EBAY', dir: 'in', pos: [0, 0, 0] }],
    elec: { kind: 'driver', channels: 4, I_cont: 6, I_peak: 10, V_max: 50 },
    source: SRC,
  },
  {
    id: 'elec-battery', name: 'Li-ion battery pack 48 V 10 Ah (13S4P)', category: 'Electronics', sub: 'Battery', material: '18650 cells, BMS', mass: 3.0,
    description: '48.1 V nominal, 10 Ah, 80 mΩ pack resistance, integrated BMS. State of charge is integrated from simulated electrical power.',
    shapes: [{ kind: 'box', dims: [0.08, 0.1, 0.09], pos: [0, 0, 0.045], color: C.dark }],
    ports: [{ id: 'in', name: 'Bay mount', iface: 'EBAY', dir: 'in', pos: [0, 0, 0] }],
    elec: { kind: 'battery', V_nom: 48.1, capacity_Ah: 10, R_int: 0.08 },
    source: SRC,
  },
  {
    id: 'elec-psu', name: 'DC power supply 48 V 20 A', category: 'Electronics', sub: 'Power supply', material: 'Switched-mode PSU', mass: 1.4,
    description: 'Mains-fed 48 V, 20 A (960 W) bench supply. Unlimited energy, current-limited at 20 A.',
    shapes: [{ kind: 'box', dims: [0.08, 0.1, 0.06], pos: [0, 0, 0.03], color: C.steel }],
    ports: [{ id: 'in', name: 'Bay mount', iface: 'EBAY', dir: 'in', pos: [0, 0, 0] }],
    elec: { kind: 'psu', V_nom: 48, I_max: 20 },
    source: SRC,
  },
];

CATALOG.push(...CATALOG_EXT);

export const CAT = new Map(CATALOG.map((c) => [c.id, c]));
/** Register user-imported CAD components (kept in the project file). */
export function registerItem(it: CatalogItem, listed = true) {
  const i = CATALOG.findIndex((c) => c.id === it.id);
  if (listed) { if (i >= 0) CATALOG[i] = it; else CATALOG.push(it); }
  CAT.set(it.id, it);
}
export const getItem = (id: string) => {
  const c = CAT.get(id);
  if (!c) throw new Error(`Unknown catalog item ${id}`);
  return c;
};

export const CATEGORIES: Category[] = ['Structure', 'Actuators', 'Transmissions', 'Links', 'End-effectors', 'Sensors', 'Electronics'];
