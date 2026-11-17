// ROBOVERSE extended CAD component library.
// Procedural, original geometry built from the CAD primitives in geometry.ts. Every part carries mounting
// interfaces (ports) so it can be assembled, and engineering parameters where it takes part in simulation.
// Parameters are GENERIC CLASS-REPRESENTATIVE VALUES (consistent, unit-tested), not manufacturer datasheets.
// Product-family names (Arduino Uno, ESP32, Raspberry Pi, Jetson, NEMA …) describe form factor / class only.

import type { CatalogItem, Shape, Port, MotorSpec, GearboxSpec, Category } from './catalog';
import type { V3 } from './math';

const SRC = {
  origin: 'ROBOVERSE procedural CAD model',
  licence: 'CC BY 4.0 (ROBOVERSE project)',
  note: 'Original educational geometry with real-world interface dimensions. Generic class-representative parameters, not a manufacturer datasheet.',
};
const LIB_ONLY = 'Assemblable and included in mass properties; its own physics (fluid power) is not simulated in this build.';

const C = {
  alu: '#c3cad3', black: '#2b3038', steel: '#9aa3ad', dark: '#3a4250', orange: '#e8833a', blue: '#3c6fd1', brass: '#c9a14a',
  pcb: '#1d6b47', pcbBlue: '#1f4f9a', pcbBlack: '#22252b', chip: '#15171b', rubber: '#1c1c1c', white: '#e8eaee', red: '#c8383c',
  yellow: '#e2b52b', carbon: '#26272b', copper: '#b8733f', green: '#2f8f6b', glass: '#7fb3e6', silver: '#d6dbe1',
};

// ---------------- small builders ----------------
type SX = Partial<Shape>;
const cyl = (r: number, h: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'cyl', dims: [r, h], pos, color, finish: 'metal', ...x });
const box = (d: V3, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'box', dims: [...d], pos, color, ...x });
const rbox = (d: V3, r: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'rbox', dims: [...d, r], pos, color, ...x });
const tube = (ro: number, ri: number, h: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'tube', dims: [ro, ri, h], pos, color, finish: 'metal', ...x });
const cone = (r1: number, r2: number, h: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'cone', dims: [r1, r2, h], pos, color, finish: 'metal', ...x });
const torus = (R: number, r: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'torus', dims: [R, r], pos, color, finish: 'metal', ...x });
const hex = (af: number, h: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'hex', dims: [af, h], pos, color, finish: 'metal', ...x });
const sphere = (r: number, pos: V3, color: string, x: SX = {}): Shape => ({ kind: 'sphere', dims: [r], pos, color, ...x });
const bolts = (pcd: number, n: number, hd: number, hh: number, pos: V3, x: SX = {}): Shape => ({ kind: 'bolts', dims: [pcd, n, hd, hh], pos, color: C.steel, finish: 'metal', ...x });
const port = (id: string, name: string, iface: string, dir: 'in' | 'out', pos: V3, x: Partial<Port> = {}): Port => ({ id, name, iface, dir, pos, ...x });
const IN = (iface: string, name = 'Mounting face') => port('in', name, iface, 'in', [0, 0, 0]);

function item(id: string, name: string, category: Category, sub: string, mass: number, material: string, description: string, shapes: Shape[], ports: Port[], x: Partial<CatalogItem> = {}): CatalogItem {
  return { id, name, category, sub, mass, material, description, shapes, ports, source: SRC, ...x };
}

/** Bare PCB with components – used by all boards. */
function board(w: number, l: number, color: string, parts: Shape[] = [], standoff = 0.006): Shape[] {
  return [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => hex(0.005, standoff, [sx * (w / 2 - 0.004), sy * (l / 2 - 0.004), standoff / 2], C.brass)),
    rbox([w, l, 0.0016], 0.0015, [0, 0, standoff + 0.0008], color, { finish: 'pcb' }),
    ...parts.map((p) => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] + standoff + 0.0016] as V3 })),
  ];
}
const chip = (w: number, l: number, h: number, x: number, y: number, c = C.chip): Shape => box([w, l, h], [x, y, h / 2], c, { finish: 'plastic' });
const header = (n: number, x: number, y: number, along: 'x' | 'y' = 'y'): Shape =>
  box(along === 'y' ? [0.0025, 0.00254 * n, 0.0085] : [0.00254 * n, 0.0025, 0.0085], [x, y, 0.00425], C.chip, { finish: 'plastic' });
const usb = (x: number, y: number, rot = 0): Shape => box([0.009, 0.0075, 0.0035], [x, y, 0.00175], C.silver, { finish: 'metal', rot: [0, 0, rot] });

// ---------------- motor / gearbox parameter sets ----------------
const motorSpec = (m: Partial<MotorSpec> & Pick<MotorSpec, 'V_nom' | 'Kt' | 'R' | 'L' | 'Jm' | 'I_rated' | 'I_peak' | 'rpm_rated' | 'rpm_max'>): MotorSpec => ({
  type: 'BLDC servo', Ke: m.Kt, T_rated: +(m.Kt * m.I_rated).toFixed(4), T_peak: +(m.Kt * m.I_peak).toFixed(4), efficiency: 0.86, encoder_bits: 17, ...m,
} as MotorSpec);

const S750 = motorSpec({ V_nom: 48, Kt: 0.135, R: 0.12, L: 0.3e-3, Jm: 1.2e-4, I_rated: 17.7, I_peak: 53, rpm_rated: 3000, rpm_max: 3300 });
const G200i = motorSpec({ V_nom: 48, Kt: 0.09, R: 0.5, L: 0.6e-3, Jm: 0.18e-4, I_rated: 7.1, I_peak: 21.3, rpm_rated: 3000, rpm_max: 4500 });
const G400i = motorSpec({ V_nom: 48, Kt: 0.11, R: 0.25, L: 0.4e-3, Jm: 0.34e-4, I_rated: 11.5, I_peak: 34.5, rpm_rated: 3000, rpm_max: 4000 });
const G100i = motorSpec({ V_nom: 48, Kt: 0.06, R: 0.9, L: 0.8e-3, Jm: 0.05e-4, I_rated: 5.3, I_peak: 15.9, rpm_rated: 3000, rpm_max: 6000 });
const N17 = motorSpec({ type: 'Hybrid stepper (DC-equivalent model)', V_nom: 24, Kt: 0.265, R: 1.5, L: 2.8e-3, Jm: 0.068e-4, I_rated: 1.7, I_peak: 1.7, rpm_rated: 600, rpm_max: 860, efficiency: 0.7, encoder_bits: 12 });
const N34 = motorSpec({ type: 'Hybrid stepper (DC-equivalent model)', V_nom: 48, Kt: 0.75, R: 0.6, L: 4e-3, Jm: 1.4e-4, I_rated: 6, I_peak: 6, rpm_rated: 500, rpm_max: 610, efficiency: 0.7, encoder_bits: 12 });
const DC37 = motorSpec({ type: 'BLDC servo', V_nom: 12, Kt: 0.012, R: 2.0, L: 0.5e-3, Jm: 5e-6, I_rated: 1.2, I_peak: 6, rpm_rated: 7500, rpm_max: 9500, efficiency: 0.7, encoder_bits: 11 });
const SRV35 = motorSpec({ V_nom: 6, Kt: 0.0069, R: 2.0, L: 0.2e-3, Jm: 3e-7, I_rated: 1.0, I_peak: 3.0, rpm_rated: 6000, rpm_max: 8300, efficiency: 0.6, encoder_bits: 10 });
const SRV20 = motorSpec({ V_nom: 6, Kt: 0.005, R: 2.4, L: 0.2e-3, Jm: 2.5e-7, I_rated: 0.8, I_peak: 2.5, rpm_rated: 7000, rpm_max: 11000, efficiency: 0.6, encoder_bits: 10 });

const gear = (g: Partial<GearboxSpec> & Pick<GearboxSpec, 'type' | 'ratio' | 'efficiency' | 'T_rated' | 'T_peak'>): GearboxSpec => ({
  backlash_arcmin: 1, limit_deg: [-170, 170], viscous: 1, coulomb: 0.8, vmax_dps: 180, ...g,
});
const linear = (lead: number, T_rated: number, T_peak: number, stroke_mm: number, vmax: number, type: GearboxSpec['type'] = 'Ball screw', eff = 0.9): GearboxSpec => ({
  type, joint: 'prismatic', lead, ratio: (2 * Math.PI) / lead, efficiency: eff, T_rated, T_peak, backlash_arcmin: 0,
  limit_deg: [0, stroke_mm], viscous: 60, coulomb: 12, vmax_dps: vmax,
});

// ---------------- reusable geometry ----------------
function servoBody(): Shape[] {
  return [
    rbox([0.040, 0.020, 0.036], 0.002, [0, 0, 0.018], C.black, { finish: 'plastic' }),
    box([0.054, 0.018, 0.0025], [0, 0, 0.028], C.black, { finish: 'plastic' }),
    rbox([0.022, 0.020, 0.006], 0.002, [0.009, 0, 0.039], C.black, { finish: 'plastic' }),
    cyl(0.003, 0.004, [0.01, 0, 0.044], C.brass),
    cyl(0.0125, 0.003, [0.01, 0, 0.0475], C.white, { onOutput: true, finish: 'plastic' }),
    box([0.03, 0.006, 0.003], [0.01, 0, 0.0475], C.white, { onOutput: true, finish: 'plastic' }),
    box([0.004, 0.003, 0.012], [-0.02, 0.006, 0.006], C.red, { finish: 'rubber' }),
  ];
}
function jointActuator(r: number, h: number): Shape[] {
  return [
    cyl(r, h * 0.62, [0, 0, h * 0.31], C.silver, { finish: 'anodised' }),
    cyl(r * 1.02, 0.004, [0, 0, h * 0.62], C.dark),
    cyl(r * 0.96, h * 0.22, [0, 0, h * 0.73], C.steel),
    bolts(r * 1.5, 8, r * 0.12, 0.004, [0, 0, h * 0.86]),
    cyl(r * 0.8, h * 0.14, [0, 0, h * 0.93], C.blue, { onOutput: true }),
    bolts(r * 1.15, 6, r * 0.1, 0.003, [0, 0, h + 0.0015], { onOutput: true }),
    box([0.03, 0.022, 0.018], [r + 0.008, 0, h * 0.3], C.dark, { finish: 'plastic' }),
  ];
}
function linearModule(L: number, w = 0.08, carriageX = 0.06, h = 0.07): Shape[] {
  return [
    rbox([L + 0.12, w, 0.05], 0.004, [L / 2, 0, 0.025], C.alu, { finish: 'anodised' }),
    box([L, w * 0.5, 0.012], [L / 2, 0, 0.056], C.steel, { finish: 'metal' }),
    { kind: 'spring', dims: [0.006, 0.0025, L, L / 0.01], pos: [L / 2, 0, 0.04], rot: [0, 90, 0], color: C.steel, finish: 'metal' },
    rbox([0.06, w + 0.01, 0.06], 0.004, [-0.03, 0, 0.03], C.dark),
    cyl(0.032, 0.11, [-0.115, 0, 0.032], C.black, { rot: [0, 90, 0] }),
    rbox([0.025, w + 0.01, 0.06], 0.003, [L + 0.0125, 0, 0.03], C.dark),
    rbox([0.1, w + 0.016, 0.02], 0.003, [carriageX, 0, h - 0.01], C.orange, { onOutput: true }),
    bolts(0.06, 4, 0.008, 0.003, [carriageX, 0, h + 0.0015], { onOutput: true }),
  ];
}

// =============================================================================================
export const CATALOG_EXT: CatalogItem[] = [];
const add = (...xs: CatalogItem[]) => CATALOG_EXT.push(...xs);

// ---------------------------------------------------------------- STRUCTURE (roots and frames)
add(
  item('base-scara', 'SCARA base column SC-500', 'Structure', 'Robot base', 22, 'Cast iron foot, aluminium column',
    'Floor-mounted column for SCARA robots. AM-L vertical actuator mount on top (J1 at 500 mm), three electronics bays and two accessory mounts.',
    [rbox([0.32, 0.32, 0.03], 0.01, [0, 0, 0.015], C.dark), cyl(0.085, 0.44, [0, 0, 0.25], C.white, { finish: 'plastic' }), cyl(0.09, 0.03, [0, 0, 0.485], C.alu), bolts(0.24, 4, 0.014, 0.008, [0, 0, 0.034])],
    [port('j1', 'J1 actuator mount (vertical)', 'AM-L', 'out', [0, 0, 0.5], { hint: 'SCARA J1' }),
      port('bay1', 'Electronics bay 1', 'EBAY', 'out', [-0.12, -0.1, 0.03]), port('bay2', 'Electronics bay 2', 'EBAY', 'out', [-0.12, 0, 0.03]), port('bay3', 'Electronics bay 3', 'EBAY', 'out', [-0.12, 0.1, 0.03]),
      port('acc1', 'Accessory mount (front)', 'ACC', 'out', [0.12, 0.1, 0.03]), port('acc2', 'Accessory mount (column)', 'ACC', 'out', [0.085, 0, 0.3], { zx: [[1, 0, 0], [0, 0, 1]] })],
    { root: true, role: 'Fixed root of a SCARA robot' }),
  item('base-gantry', 'Cartesian gantry frame GF-900', 'Structure', 'Robot base', 28, 'Aluminium 4040 T-slot extrusion frame',
    'Bridge frame made of 40×40 T-slot profiles: two uprights and a 900 mm cross-beam at 650 mm. The LM-80 mount on the beam carries the X linear axis.',
    [{ kind: 'profile', dims: [40, 0.63], pos: [-0.45, 0.25, 0.315], color: C.alu, finish: 'anodised' }, { kind: 'profile', dims: [40, 0.63], pos: [0.45, 0.25, 0.315], color: C.alu, finish: 'anodised' },
      { kind: 'profile', dims: [40, 0.94], pos: [0, 0.25, 0.65], rot: [0, 90, 0], color: C.alu, finish: 'anodised' },
      { kind: 'profile', dims: [40, 0.9], pos: [0, -0.25, 0.02], rot: [0, 90, 0], color: C.alu, finish: 'anodised' }, { kind: 'profile', dims: [40, 0.9], pos: [0, 0.25, 0.02], rot: [0, 90, 0], color: C.alu, finish: 'anodised' },
      { kind: 'profile', dims: [40, 0.46], pos: [-0.45, 0, 0.02], rot: [90, 0, 0], color: C.alu, finish: 'anodised' }, { kind: 'profile', dims: [40, 0.46], pos: [0.45, 0, 0.02], rot: [90, 0, 0], color: C.alu, finish: 'anodised' },
      rbox([0.1, 0.1, 0.012], 0.003, [-0.45, 0.25, 0.006], C.dark), rbox([0.1, 0.1, 0.012], 0.003, [0.45, 0.25, 0.006], C.dark)],
    [port('x', 'X-axis linear module mount', 'LM-80', 'out', [-0.3, 0.25, 0.67], { zx: [[0, 0, 1], [1, 0, 0]], hint: 'X axis (travel +X)' }),
      port('bay1', 'Electronics bay 1', 'EBAY', 'out', [-0.3, -0.25, 0.04]), port('bay2', 'Electronics bay 2', 'EBAY', 'out', [-0.15, -0.25, 0.04]), port('bay3', 'Electronics bay 3', 'EBAY', 'out', [0, -0.25, 0.04]),
      port('acc1', 'Accessory mount (upright)', 'ACC', 'out', [0.47, 0.25, 0.4], { zx: [[1, 0, 0], [0, 0, 1]] })],
    { root: true, role: 'Fixed root of a Cartesian (gantry) robot' }),
  item('base-desktop', 'Desktop robot base DB-1', 'Structure', 'Robot base', 0.9, 'ABS housing, steel ballast',
    'Base for educational desktop arms driven by hobby servos. Standard servo pocket (SRV-STD) for the waist joint, three electronics bays and an accessory mount.',
    [rbox([0.22, 0.18, 0.03], 0.008, [0, 0, 0.015], C.black, { finish: 'plastic' }), cyl(0.05, 0.006, [0, 0, 0.033], C.white, { finish: 'plastic' }), rbox([0.03, 0.18, 0.01], 0.003, [-0.095, 0, 0.035], C.orange, { finish: 'plastic' })],
    [port('j1', 'Waist servo pocket (vertical)', 'SRV-STD', 'out', [0, 0, 0.03], { hint: 'Waist servo' }),
      port('bay1', 'Electronics bay 1', 'EBAY', 'out', [-0.07, -0.055, 0.03]), port('bay2', 'Electronics bay 2', 'EBAY', 'out', [-0.07, 0.0, 0.03]), port('bay3', 'Electronics bay 3', 'EBAY', 'out', [-0.07, 0.055, 0.03]),
      port('acc1', 'Accessory mount', 'ACC', 'out', [0.08, 0.06, 0.03])],
    { root: true, role: 'Fixed root of a desktop servo arm' }),
  item('base-workbench', 'Aluminium breadboard workbench 600×450', 'Structure', 'Workbench', 16, 'Aluminium tooling plate, M6 grid',
    'Free-build root: an optical-breadboard-style plate with actuator mounts (L and M), T-slot sockets for extrusion frames, electronics bays and accessory mounts.',
    [rbox([0.6, 0.45, 0.02], 0.005, [0, 0, 0.01], C.alu, { finish: 'anodised' }), bolts(0.5, 24, 0.008, 0.002, [0, 0, 0.021]), bolts(0.3, 16, 0.008, 0.002, [0, 0, 0.021])],
    [port('aml', 'Actuator mount L', 'AM-L', 'out', [0.1, 0, 0.02]), port('amm', 'Actuator mount M', 'AM-M', 'out', [-0.1, 0.1, 0.02]), port('ams', 'Actuator mount S', 'AM-S', 'out', [-0.1, -0.1, 0.02]),
      port('lm', 'Linear module mount', 'LM-80', 'out', [-0.25, -0.17, 0.02], { zx: [[0, 0, 1], [1, 0, 0]] }),
      port('ext1', 'Extrusion socket 20', 'EXT-20', 'out', [0.25, 0.18, 0.02]), port('ext2', 'Extrusion socket 20', 'EXT-20', 'out', [0.25, -0.18, 0.02]), port('ext3', 'Extrusion socket 40', 'EXT-40', 'out', [-0.25, 0.17, 0.02]),
      port('bay1', 'Electronics bay 1', 'EBAY', 'out', [-0.27, 0.0, 0.02]), port('bay2', 'Electronics bay 2', 'EBAY', 'out', [0.27, 0.0, 0.02]), port('bay3', 'Electronics bay 3', 'EBAY', 'out', [0.0, 0.2, 0.02]),
      port('acc1', 'Accessory mount 1', 'ACC', 'out', [0.2, 0.1, 0.02]), port('acc2', 'Accessory mount 2', 'ACC', 'out', [0.2, -0.1, 0.02]), port('acc3', 'Accessory mount 3', 'ACC', 'out', [0.0, -0.18, 0.02])],
    { root: true, role: 'Free-build root' }),
);

// T-slot extrusions
for (const [s, L] of [[20, 0.2], [20, 0.4], [40, 0.5], [40, 1.0]] as const) {
  const a = s / 1000;
  add(item(`ext-${s}${s}-${L * 1000}`, `Aluminium T-slot extrusion ${s}${s} × ${L * 1000} mm`, 'Structure', 'T-slot extrusion', +(0.42 * a * a * L * 2700).toFixed(3), 'Aluminium 6063-T5, clear anodised',
    `${s}×${s} mm T-slot profile, ${L * 1000} mm long. End sockets (EXT-${s}) for stacking, side slots (SLOT-${s}) for brackets and accessories.`,
    [{ kind: 'profile', dims: [s, L], pos: [0, 0, L / 2], color: C.alu, finish: 'anodised' }],
    [IN(`EXT-${s}`, 'End face (tapped core)'), port('top', 'Top end', `EXT-${s}`, 'out', [0, 0, L]),
      port('slotA', 'Side slot A', `SLOT-${s}`, 'out', [a / 2, 0, L / 2], { zx: [[1, 0, 0], [0, 0, 1]] }),
      port('slotB', 'Side slot B', `SLOT-${s}`, 'out', [-a / 2, 0, L / 2], { zx: [[-1, 0, 0], [0, 0, 1]] }),
      port('slotC', 'Side slot C', `SLOT-${s}`, 'out', [0, a / 2, L * 0.8], { zx: [[0, 1, 0], [0, 0, 1]] })]));
}
add(
  item('brk-corner-20', 'Corner bracket 20 (90°)', 'Structure', 'Bracket', 0.025, 'Die-cast zinc',
    'Joins a 20-series extrusion at 90° to the slot of another.',
    [box([0.004, 0.02, 0.02], [0.002, 0, 0.01], C.silver, { finish: 'metal' }), box([0.02, 0.02, 0.004], [0.012, 0, 0.002], C.silver, { finish: 'metal' }), box([0.002, 0.016, 0.02], [0.011, 0, 0.011], C.silver, { rot: [0, 45, 0], finish: 'metal' })],
    [IN('SLOT-20', 'Slot face'), port('ext', 'Extrusion socket 20', 'EXT-20', 'out', [0.012, 0, 0.004])]),
  item('brk-corner-40', 'Corner bracket 40 (90°)', 'Structure', 'Bracket', 0.09, 'Die-cast aluminium',
    'Joins a 40-series extrusion at 90° to the slot of another.',
    [box([0.006, 0.04, 0.04], [0.003, 0, 0.02], C.silver, { finish: 'metal' }), box([0.04, 0.04, 0.006], [0.023, 0, 0.003], C.silver, { finish: 'metal' })],
    [IN('SLOT-40', 'Slot face'), port('ext', 'Extrusion socket 40', 'EXT-40', 'out', [0.023, 0, 0.006])]),
  item('plate-tslot-acc', 'T-slot accessory plate 60×60', 'Structure', 'Mounting plate', 0.05, 'Aluminium 5083',
    'Converts a T-slot (20 or 40 series via drop-in nuts) to the ROBOVERSE accessory pattern (ACC: 4×M4 on 30 mm square).',
    [rbox([0.06, 0.06, 0.005], 0.003, [0, 0, 0.0025], C.alu, { finish: 'anodised' }), bolts(0.042, 4, 0.006, 0.003, [0, 0, 0.0065])],
    [IN('SLOT-20', 'Slot face (T-nuts)'), port('acc', 'Accessory mount', 'ACC', 'out', [0, 0, 0.005])]),
  item('plate-tslot40-acc', 'T-slot 40 accessory plate 80×80', 'Structure', 'Mounting plate', 0.08, 'Aluminium 5083',
    'Accessory pattern on a 40-series slot.',
    [rbox([0.08, 0.08, 0.006], 0.003, [0, 0, 0.003], C.alu, { finish: 'anodised' }), bolts(0.06, 4, 0.007, 0.003, [0, 0, 0.0075])],
    [IN('SLOT-40', 'Slot face (T-nuts)'), port('acc', 'Accessory mount', 'ACC', 'out', [0, 0, 0.006])]),
  item('plate-motor-m-2020', 'Motor plate AM-M on 2020 slot', 'Structure', 'Motor mount', 0.11, 'Aluminium 6061',
    'L-plate that carries an AM-M actuator on the side of a 20-series profile.',
    [box([0.005, 0.07, 0.07], [0.0025, 0, 0.035], C.black, { finish: 'anodised' }), box([0.07, 0.07, 0.005], [0.04, 0, 0.0025], C.black, { finish: 'anodised' })],
    [IN('SLOT-20'), port('am', 'Actuator mount M', 'AM-M', 'out', [0.04, 0, 0.005])]),
  item('plate-motor-n17', 'NEMA 17 motor bracket (L)', 'Structure', 'Motor mount', 0.06, 'Steel, zinc plated',
    'Standard L bracket for NEMA 17 steppers on a 20-series slot.',
    [box([0.004, 0.045, 0.045], [0.002, 0, 0.0225], C.silver, { finish: 'metal' }), box([0.045, 0.045, 0.004], [0.026, 0, 0.002], C.silver, { finish: 'metal' })],
    [IN('SLOT-20'), port('am', 'NEMA 17 face', 'AM-N17', 'out', [0.026, 0, 0.004])]),
  item('adapter-n34-l', 'NEMA 34 → AM-L adapter plate', 'Transmissions', 'Adapter plate', 0.25, 'Aluminium 6061',
    'Mounts a NEMA 34 stepper on an AM-L actuator mount.',
    [rbox([0.09, 0.09, 0.01], 0.004, [0, 0, 0.005], C.alu, { finish: 'anodised' }), bolts(0.098, 4, 0.008, 0.004, [0, 0, 0.012])],
    [IN('AM-L'), port('out', 'NEMA 34 face', 'AM-N34', 'out', [0, 0, 0.01])]),
  item('plate-carbon-200', 'Carbon-fibre frame plate 200×150', 'Structure', 'Frame plate', 0.12, '3 mm carbon-fibre laminate',
    'Lightweight plate with two accessory patterns, e.g. for a sensor head or electronics deck.',
    [rbox([0.2, 0.15, 0.003], 0.006, [0, 0, 0.0015], C.carbon, { finish: 'carbon' }), bolts(0.17, 8, 0.005, 0.002, [0, 0, 0.004])],
    [IN('ACC'), port('acc1', 'Accessory mount 1', 'ACC', 'out', [0.05, 0, 0.003]), port('acc2', 'Accessory mount 2', 'ACC', 'out', [-0.05, 0, 0.003])]),
  item('rack-din-4', 'DIN-rail extension rail (4 bays)', 'Structure', 'Electronics rail', 0.25, 'Steel DIN rail on aluminium bracket',
    'Adds four electronics bays (EBAY) to any bay – for larger controller, driver and power stacks.',
    [box([0.04, 0.32, 0.008], [0, 0, 0.004], C.silver, { finish: 'metal' }), box([0.035, 0.32, 0.002], [0, 0, 0.009], C.steel, { finish: 'metal' })],
    [IN('EBAY'), ...[0, 1, 2, 3].map((k) => port(`bay${k + 1}`, `Rail bay ${k + 1}`, 'EBAY', 'out', [0, -0.12 + k * 0.08, 0.01]))]),
  item('enc-ip54', 'Electronics enclosure IP54 250×200', 'Structure', 'Enclosure', 1.8, 'Powder-coated steel, polycarbonate window',
    'Protective enclosure with two internal DIN bays and cable glands.',
    [rbox([0.2, 0.25, 0.12], 0.006, [0, 0, 0.06], C.dark), rbox([0.16, 0.2, 0.004], 0.004, [0, 0, 0.122], C.glass, { finish: 'glass' }), ...[-1, 0, 1].map((k) => cyl(0.006, 0.012, [0.1, k * 0.05, 0.03], C.chip, { rot: [0, 90, 0], finish: 'plastic' } as SX))],
    [IN('EBAY'), port('bay1', 'Internal bay 1', 'EBAY', 'out', [0, -0.05, 0.01]), port('bay2', 'Internal bay 2', 'EBAY', 'out', [0, 0.05, 0.01])]),
  item('cover-bellows', 'Protective bellows cover Ø80', 'Structure', 'Cover', 0.15, 'PU-coated polyester',
    'Folding bellows protecting a screw axis or cylinder rod from dust and chips.',
    [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => cone(0.04, 0.032, 0.012, [0, 0, 0.006 + k * 0.012], C.rubber, { finish: 'rubber' }))],
    [IN('ACC')]),
  item('heatsink-60', 'Finned heat sink 60×60', 'Structure', 'Heat sink', 0.09, 'Extruded aluminium',
    'Passive heat sink for drivers and power stages (≈1.2 K/W natural convection).',
    [{ kind: 'fins', dims: [0.06, 0.06, 0.005, 0.025, 10], pos: [0, 0, 0.015], color: C.black, finish: 'anodised' }],
    [IN('ACC')]),
  item('cover-joint-l', 'Joint cover L (cosmetic shell)', 'Structure', 'Cover', 0.12, 'ABS',
    'Snap-on shell for an actuator mount – a cosmetic cover that keeps dust out of the joint.',
    [cone(0.075, 0.068, 0.03, [0, 0, 0.015], C.white, { finish: 'plastic' })],
    [IN('ACC')]),
);

// ---------------------------------------------------------------- LINKS (custom manipulators, SCARA, servo arms)
const lateralLink = (id: string, name: string, inI: string, outI: string, L: number, r: number, mass: number, color: string, mat: string, extra = '') =>
  item(id, name, 'Links', 'Parallel-axis link', mass, mat,
    `Link that offsets the next joint by ${L * 1000} mm perpendicular to the axis; the next joint axis is parallel (planar / SCARA chains). ${extra}`,
    [cyl(r, 0.04, [0, 0, 0.02], color), rbox([L, r * 1.4, 0.035], 0.006, [L / 2, 0, 0.0225], color, { finish: color === C.carbon ? 'carbon' : 'anodised' }), cyl(r * 0.9, 0.04, [L, 0, 0.02], color), bolts(r * 1.4, 6, r * 0.12, 0.003, [0, 0, 0.0415])],
    [IN(inI, `Input flange ${inI}`), port('out', `Next joint mount ${outI}`, outI, 'out', [L, 0, 0.04], { hint: 'Parallel axis' }), port('acc', 'Accessory mount', 'ACC', 'out', [L / 2, 0, 0.04])]);
add(
  lateralLink('link-par-m-200', 'Parallel-axis link 200 mm (M)', 'FL-M', 'AM-M', 0.2, 0.045, 1.1, C.alu, 'Aluminium 6082-T6'),
  lateralLink('link-par-s-150', 'Parallel-axis link 150 mm (S)', 'FL-S', 'AM-S', 0.15, 0.035, 0.55, C.alu, 'Aluminium 6082-T6'),
  lateralLink('link-par-cf-300', 'Parallel-axis link 300 mm (carbon, M)', 'FL-M', 'AM-M', 0.3, 0.045, 0.75, C.carbon, 'Carbon-fibre sandwich'),
  lateralLink('scara-arm-inner', 'SCARA inner arm 250 mm', 'FL-L', 'AM-M', 0.25, 0.06, 2.4, C.white, 'Cast aluminium, white paint', 'J2 of a SCARA.'),
  item('scara-arm-outer', 'SCARA outer arm 200 mm with Z mount', 'Links', 'SCARA arm', 1.9, 'Cast aluminium, white paint',
    'Outer SCARA arm. At its tip a vertical LZ mount carries the ball-screw/spline Z axis pointing down.',
    [cyl(0.048, 0.045, [0, 0, 0.0225], C.white, { finish: 'plastic' }), rbox([0.2, 0.08, 0.045], 0.01, [0.1, 0, 0.0225], C.white, { finish: 'plastic' }), rbox([0.09, 0.09, 0.12], 0.01, [0.2, 0, 0.03], C.white, { finish: 'plastic' })],
    [IN('FL-M'), port('z', 'Z-axis mount (down)', 'LZ', 'out', [0.2, 0, -0.03], { rot: [180, 0, 0], hint: 'SCARA Z axis' }), port('acc', 'Accessory mount (top)', 'ACC', 'out', [0.2, 0, 0.09])]),
  item('link-perp-m', 'Perpendicular bracket M (90°)', 'Links', 'Elbow bracket', 0.6, 'Aluminium 7075',
    'Turns the joint axis by 90° (like a shoulder or wrist bracket) for custom manipulators.',
    [cyl(0.045, 0.02, [0, 0, 0.01], C.alu), rbox([0.07, 0.07, 0.09], 0.008, [0, 0, 0.065], C.alu, { finish: 'anodised' })],
    [IN('FL-M'), port('out', 'Next joint mount (90°)', 'AM-M', 'out', [0.035, 0, 0.07], { zx: [[1, 0, 0], [0, 0, 1]] })]),
  item('link-perp-s', 'Perpendicular bracket S (90°)', 'Links', 'Elbow bracket', 0.3, 'Aluminium 7075',
    'Turns the joint axis by 90° for size-S wrists.',
    [cyl(0.035, 0.015, [0, 0, 0.0075], C.alu), rbox([0.055, 0.055, 0.07], 0.006, [0, 0, 0.05], C.alu, { finish: 'anodised' })],
    [IN('FL-S'), port('out', 'Next joint mount (90°)', 'AM-S', 'out', [0.0275, 0, 0.055], { zx: [[1, 0, 0], [0, 0, 1]] })]),
  item('link-tube-cf-300', 'Carbon tube link 300 mm (axial, M)', 'Links', 'Tube link', 0.45, 'Carbon-fibre tube Ø50, aluminium ends',
    'Axial extension along the joint axis – combine with a perpendicular bracket to make long arms.',
    [cyl(0.045, 0.02, [0, 0, 0.01], C.alu), tube(0.025, 0.022, 0.26, [0, 0, 0.15], C.carbon, { finish: 'carbon' }), cyl(0.045, 0.02, [0, 0, 0.29], C.alu)],
    [IN('FL-M'), port('out', 'End mount', 'AM-M', 'out', [0, 0, 0.3])]),
  item('link-reducer-l-m', 'Size adapter FL-L → AM-M', 'Links', 'Size adapter', 0.3, 'Aluminium 6061', 'Steps down from an L output flange to an M actuator.',
    [cone(0.065, 0.05, 0.03, [0, 0, 0.015], C.alu, { finish: 'anodised' })], [IN('FL-L'), port('out', 'Actuator mount M', 'AM-M', 'out', [0, 0, 0.03])]),
  item('link-reducer-m-s', 'Size adapter FL-M → AM-S', 'Links', 'Size adapter', 0.18, 'Aluminium 6061', 'Steps down from an M output flange to an S actuator.',
    [cone(0.05, 0.038, 0.025, [0, 0, 0.0125], C.alu, { finish: 'anodised' })], [IN('FL-M'), port('out', 'Actuator mount S', 'AM-S', 'out', [0, 0, 0.025])]),
  // servo-arm brackets
  item('srv-u-bracket', 'Servo U-bracket (axis turn 90°)', 'Links', 'Servo bracket', 0.025, '2 mm aluminium sheet',
    'Bolts to a servo horn and holds the next servo with its axis turned 90°.',
    [box([0.03, 0.03, 0.002], [0, 0, 0.001], C.silver, { finish: 'metal' }), box([0.03, 0.002, 0.05], [0, -0.016, 0.025], C.silver, { finish: 'metal' }), box([0.03, 0.002, 0.05], [0, 0.016, 0.025], C.silver, { finish: 'metal' })],
    [IN('HORN-25T', 'Horn screws (25T spline)'), port('out', 'Servo pocket (90°)', 'SRV-STD', 'out', [-0.01, -0.017, 0.035], { zx: [[0, 1, 0], [1, 0, 0]] })]),
  ...[0.1, 0.08].map((L) => item(`srv-long-u-${L * 1000}`, `Servo long U-bracket ${L * 1000} mm`, 'Links', 'Servo bracket', 0.035 + L * 0.2, '2 mm aluminium sheet',
    `Arm segment for servo arms: ${L * 1000} mm between servo axes, next axis parallel.`,
    [box([0.03, 0.002, 0.03], [0, 0, 0.001], C.silver, { finish: 'metal' }), box([0.028, L, 0.002], [0, -L / 2, 0.012], C.silver, { finish: 'metal', rot: [0, 0, 0] }), box([0.028, L, 0.002], [0, -L / 2, -0.012], C.silver, { finish: 'metal' })],
    [IN('HORN-25T', 'Horn screws (25T spline)'), port('out', 'Servo pocket (parallel axis)', 'SRV-STD', 'out', [-0.01, -L, 0.002], { zx: [[0, 0, 1], [1, 0, 0]] })])),
);

// ---------------------------------------------------------------- ACTUATORS
const integrated = (id: string, name: string, inI: string, outI: string, r: number, h: number, motor: MotorSpec, g: GearboxSpec, mass: number, desc: string) =>
  item(id, name, 'Actuators', 'Integrated joint actuator', mass, 'Aluminium housing, strain-wave gear, cross-roller bearing', desc, jointActuator(r, h),
    [IN(inI, `Mounting face ${inI}`), port('output', `Output flange ${outI}`, outI, 'out', [0, 0, h], { rotary: true, hint: 'Revolute joint output' })], { motor, gearbox: g, role: 'Joint actuator (motor + gear + encoder + driver interface in one)' });
add(
  item('motor-s750', 'Servo motor S-750 (750 W, 48 V)', 'Actuators', 'AC/BLDC servo', 2.3, 'Aluminium housing with cooling fins',
    'High-power servo, 2.39 N·m rated / 7.2 N·m peak, 3000 rpm, 17-bit absolute encoder, holding brake. Rear-face mounted on AM-L, Ø14 mm shaft.',
    [box([0.09, 0.09, 0.014], [0, 0, 0.007], C.dark), { kind: 'fins', dims: [0.08, 0.08, 0.1, 0.008, 12], pos: [0, 0, 0.068], color: C.black, finish: 'anodised' }, box([0.09, 0.09, 0.014], [0, 0, 0.13], C.dark), rbox([0.035, 0.03, 0.03], 0.004, [0.05, 0, 0.06], C.orange)],
    [port('mount', 'Rear mounting face', 'AM-L', 'in', [0, 0, 0]), port('shaft', 'Output shaft Ø14 mm', 'SH-14', 'out', [0, 0, 0.137])], { motor: S750, role: 'Joint actuator (size L, heavy duty)' }),
  item('motor-n17', 'Hybrid stepper motor NEMA 17 (0.45 N·m)', 'Actuators', 'Stepper', 0.35, 'Steel laminations, aluminium end caps',
    'NEMA 17 two-phase stepper, 0.45 N·m holding torque, 1.7 A/phase, Ø5 mm shaft (use a 5→8 mm coupling). DC-equivalent torque model.',
    [box([0.042, 0.042, 0.008], [0, 0, 0.004], C.dark), box([0.042, 0.042, 0.032], [0, 0, 0.024], C.black), box([0.042, 0.042, 0.008], [0, 0, 0.044], C.dark), cyl(0.011, 0.002, [0, 0, 0.049], C.silver)],
    [port('mount', 'NEMA 17 face', 'AM-N17', 'in', [0, 0, 0]), port('shaft', 'Output shaft Ø5 mm', 'SH-5', 'out', [0, 0, 0.05])], { motor: N17, role: 'Stepper (open-loop class)' }),
  item('motor-n34', 'Hybrid stepper motor NEMA 34 (4.5 N·m)', 'Actuators', 'Stepper', 2.9, 'Steel laminations',
    'NEMA 34 stepper, 4.5 N·m holding torque, 6 A/phase, Ø14 mm shaft. Mount with the NEMA 34 → AM-L adapter.',
    [box([0.086, 0.086, 0.012], [0, 0, 0.006], C.dark), box([0.086, 0.086, 0.07], [0, 0, 0.047], C.black), box([0.086, 0.086, 0.012], [0, 0, 0.088], C.dark)],
    [port('mount', 'NEMA 34 face', 'AM-N34', 'in', [0, 0, 0]), port('shaft', 'Output shaft Ø14 mm', 'SH-14', 'out', [0, 0, 0.094])], { motor: N34, role: 'Stepper (high torque)' }),
  integrated('rj-90', 'Integrated joint actuator RJ-90 (400 W, 100:1)', 'AM-L', 'FL-L', 0.06, 0.11, G400i, gear({ type: 'Strain-wave (integrated)', ratio: 100, efficiency: 0.78, T_rated: 98, T_peak: 280, viscous: 2, coulomb: 1.5 }), 2.8,
    'Robot joint module: 400 W BLDC + 100:1 strain-wave gear + cross-roller bearing + dual absolute encoders. Replaces motor + gearbox in one part.'),
  integrated('rj-70', 'Integrated joint actuator RJ-70 (200 W, 100:1)', 'AM-M', 'FL-M', 0.048, 0.09, G200i, gear({ type: 'Strain-wave (integrated)', ratio: 100, efficiency: 0.75, T_rated: 44, T_peak: 120, viscous: 1, coulomb: 0.8, limit_deg: [-165, 165] }), 1.6,
    'Robot joint module: 200 W BLDC + 100:1 strain-wave gear, hollow shaft for cables.'),
  integrated('rj-50', 'Integrated joint actuator RJ-50 (100 W, 80:1)', 'AM-S', 'FL-S', 0.036, 0.075, G100i, gear({ type: 'Strain-wave (integrated)', ratio: 80, efficiency: 0.72, T_rated: 16, T_peak: 40, viscous: 0.25, coulomb: 0.2, limit_deg: [-175, 175], vmax_dps: 225 }), 0.8,
    'Compact wrist joint module: 100 W BLDC + 80:1 strain-wave gear.'),
  integrated('rj-cyc-110', 'Integrated cycloidal actuator RC-110 (750 W, 81:1)', 'AM-L', 'FL-L', 0.07, 0.13, S750, gear({ type: 'Cycloidal', ratio: 81, efficiency: 0.85, T_rated: 160, T_peak: 400, viscous: 3, coulomb: 2.5, vmax_dps: 200 }), 4.2,
    'Heavy-duty joint for shoulders of large arms and quadruped hips: 750 W servo + 81:1 cycloidal reducer.'),
  item('motor-dc37', 'Brushed DC gearmotor 37 mm (12 V, 50:1)', 'Actuators', 'DC gearmotor', 0.3, 'Steel can, metal spur gears',
    '12 V brushed DC motor with 50:1 spur gear head and 11-bit Hall encoder; output hub with FL-S flange. Low-cost joint for educational arms.',
    [cyl(0.0185, 0.05, [0, 0, 0.025], C.silver), cyl(0.0185, 0.025, [0, 0, 0.0625], C.brass), cyl(0.012, 0.008, [0, 0, 0.079], C.blue, { onOutput: true })],
    [IN('AM-S'), port('output', 'Output hub FL-S', 'FL-S', 'out', [0, 0, 0.083], { rotary: true })],
    { motor: DC37, gearbox: gear({ type: 'Spur gear train', ratio: 50, efficiency: 0.65, T_rated: 0.47, T_peak: 2.0, backlash_arcmin: 60, viscous: 0.01, coulomb: 0.02, vmax_dps: 900 }), role: 'Low-cost joint actuator' }),
  item('servo-35kg', 'High-torque digital servo (35 kg·cm, 6 V)', 'Actuators', 'Hobby servo', 0.066, 'Plastic case, metal gears',
    'Standard-size digital servo, ~3.4 N·m stall at 6 V, 0.17 s/60°. Modelled as DC motor + 300:1 gear train closed through the platform controller (internal servo loop not emulated).',
    servoBody(), [IN('SRV-STD', 'Servo ears (40×20 mm body)'), port('horn', 'Output horn 25T', 'HORN-25T', 'out', [0.01, 0, 0.049], { rotary: true, hint: 'Servo output' })],
    { motor: SRV35, gearbox: gear({ type: 'Spur gear train', ratio: 300, efficiency: 0.55, T_rated: 1.2, T_peak: 3.5, backlash_arcmin: 30, limit_deg: [-135, 135], viscous: 0.02, coulomb: 0.05, vmax_dps: 150 }), role: 'Desktop-arm joint' }),
  item('servo-20kg', 'Standard digital servo (20 kg·cm, 6 V)', 'Actuators', 'Hobby servo', 0.055, 'Plastic case, metal gears',
    'Standard-size servo, ~1.7 N·m stall at 6 V. Same mounting as the 35 kg·cm servo.',
    servoBody(), [IN('SRV-STD', 'Servo ears (40×20 mm body)'), port('horn', 'Output horn 25T', 'HORN-25T', 'out', [0.01, 0, 0.049], { rotary: true })],
    { motor: SRV20, gearbox: gear({ type: 'Spur gear train', ratio: 250, efficiency: 0.55, T_rated: 0.8, T_peak: 1.7, backlash_arcmin: 40, limit_deg: [-135, 135], viscous: 0.02, coulomb: 0.04, vmax_dps: 240 }), role: 'Desktop-arm joint' }),
  item('act-linear-er100', 'Electric linear actuator ER-100 (lead screw)', 'Actuators', 'Linear actuator', 1.3, 'Aluminium tube, stainless rod',
    'Rod actuator, 100 mm stroke, 5 mm lead screw, integrated 100 W servo. Output FL-S on the rod end – a prismatic (linear) joint for telescopic arms.',
    [rbox([0.05, 0.05, 0.2], 0.006, [0, 0, 0.1], C.alu, { finish: 'anodised' }), cyl(0.028, 0.08, [0.055, 0, 0.06], C.black, { rot: [0, 0, 0] }), cyl(0.011, 0.12, [0, 0, 0.16], C.silver, { onOutput: true }), cyl(0.03, 0.01, [0, 0, 0.215], C.blue, { onOutput: true })],
    [IN('AM-S'), port('output', 'Rod-end flange FL-S', 'FL-S', 'out', [0, 0, 0.22], { rotary: true, hint: 'Prismatic joint output' })],
    { motor: G100i, gearbox: linear(0.005, 500, 1200, 100, 200, 'Lead screw', 0.45), role: 'Prismatic joint actuator' }),
  item('act-pneu-cyl-32', 'Pneumatic cylinder Ø32 × 100', 'Actuators', 'Pneumatic actuator', 0.62, 'Aluminium barrel, chrome-plated rod',
    'ISO 6432-style double-acting cylinder, 6 bar → 480 N extend force.',
    [tube(0.02, 0.016, 0.14, [0, 0, 0.07], C.silver), cyl(0.022, 0.015, [0, 0, 0.0075], C.alu), cyl(0.022, 0.015, [0, 0, 0.1325], C.alu), cyl(0.006, 0.12, [0, 0, 0.2], C.silver), hex(0.017, 0.01, [0, 0, 0.26], C.steel), cyl(0.004, 0.012, [0.024, 0, 0.02], C.brass, { rot: [0, 90, 0] }), cyl(0.004, 0.012, [0.024, 0, 0.12], C.brass, { rot: [0, 90, 0] })],
    [IN('ACC')], { libraryOnly: LIB_ONLY }),
  item('act-hyd-cyl-40', 'Hydraulic cylinder Ø40 × 150', 'Actuators', 'Hydraulic actuator', 2.4, 'Steel barrel, hard-chrome rod',
    'Double-acting hydraulic cylinder, 160 bar → 20 kN extend force.',
    [tube(0.03, 0.02, 0.2, [0, 0, 0.1], C.yellow, { finish: 'anodised' }), cyl(0.034, 0.02, [0, 0, 0.01], C.dark), cyl(0.034, 0.02, [0, 0, 0.19], C.dark), cyl(0.011, 0.17, [0, 0, 0.285], C.silver), cyl(0.018, 0.02, [0, 0, 0.37], C.dark, { rot: [90, 0, 0] })],
    [IN('ACC')], { libraryOnly: LIB_ONLY }),
  item('act-pneu-rotary', 'Pneumatic rotary actuator 90°', 'Actuators', 'Pneumatic actuator', 0.45, 'Aluminium',
    'Rack-and-pinion rotary actuator, 90° swing, 2.5 N·m at 6 bar.',
    [rbox([0.08, 0.04, 0.04], 0.004, [0, 0, 0.02], C.alu, { finish: 'anodised' }), cyl(0.012, 0.012, [0, 0, 0.046], C.steel)],
    [IN('ACC')], { libraryOnly: LIB_ONLY }),
);

// ---------------------------------------------------------------- TRANSMISSIONS (gearboxes, linear axes, drive parts)
const gbox = (id: string, name: string, shaft: number, flange: string, spec: GearboxSpec, mass: number, r: number, h: number, color: string, desc: string) =>
  item(id, name, 'Transmissions', spec.type, mass, 'Hardened steel gears, aluminium housing', desc,
    [cyl(r, h - 0.013, [0, 0, (h - 0.013) / 2], color), bolts(r * 1.6, 6, r * 0.14, 0.004, [0, 0, h - 0.015]), cyl(r * 0.75, 0.013, [0, 0, h - 0.0065], C.blue, { onOutput: true })],
    [port('input', `Input bore Ø${shaft} mm`, `SH-${shaft}`, 'in', [0, 0, 0]), port('output', `Output flange ${flange}`, flange, 'out', [0, 0, h], { rotary: true })], { gearbox: spec });
add(
  gbox('cyc-l81', 'Cycloidal reducer RV-L 81:1', 14, 'FL-L', gear({ type: 'Cycloidal', ratio: 81, efficiency: 0.85, T_rated: 160, T_peak: 400, viscous: 3, coulomb: 2.5 }), 2.2, 0.07, 0.08, C.dark, 'Stiff, shock-tolerant cycloidal reducer for heavy shoulders.'),
  gbox('hd-m50', 'Harmonic drive HD-M 50:1', 11, 'FL-M', gear({ type: 'Harmonic drive', ratio: 50, efficiency: 0.78, T_rated: 34, T_peak: 90, limit_deg: [-165, 165], vmax_dps: 360 }), 0.62, 0.048, 0.057, C.steel, 'Faster, lower-torque strain-wave gear.'),
  gbox('pg-m10', 'Planetary gearbox PG-M 10:1', 11, 'FL-M', gear({ type: 'Planetary', ratio: 10, efficiency: 0.94, T_rated: 20, T_peak: 40, backlash_arcmin: 10, viscous: 0.3, coulomb: 0.3, vmax_dps: 900 }), 0.55, 0.045, 0.06, C.steel, 'Single-stage planetary, back-drivable.'),
  gbox('pg-s16', 'Planetary gearbox PG-S 16:1', 8, 'FL-S', gear({ type: 'Planetary', ratio: 16, efficiency: 0.9, T_rated: 8, T_peak: 18, backlash_arcmin: 12, viscous: 0.1, coulomb: 0.1, vmax_dps: 900 }), 0.3, 0.032, 0.05, C.steel, 'Compact planetary for small joints.'),
  gbox('pg-n17-5', 'Planetary gearbox for NEMA 17, 5:1', 5, 'FL-S', gear({ type: 'Planetary', ratio: 5, efficiency: 0.9, T_rated: 2, T_peak: 3, backlash_arcmin: 20, viscous: 0.05, coulomb: 0.05, vmax_dps: 900 }), 0.25, 0.021, 0.04, C.black, 'Inline planetary head for NEMA 17 steppers.'),
  item('belt-red-m3', 'Belt reduction module 3:1 (HTD 5M)', 'Transmissions', 'Belt drive', 0.7, 'Aluminium pulleys, PU belt',
    'Compact belt reduction, 3:1, HTD 5M belt. Input Ø11 mm, output FL-M on a supported shaft.',
    [rbox([0.08, 0.16, 0.03], 0.006, [0, 0.04, 0.015], C.alu, { finish: 'anodised' }), { kind: 'gear', dims: [0.0016, 20, 0.02, 0.011], pos: [0, 0, 0.04], color: C.silver, finish: 'metal' }, { kind: 'gear', dims: [0.0016, 60, 0.02, 0.014], pos: [0, 0.08, 0.04], color: C.silver, finish: 'metal' }, rbox([0.11, 0.18, 0.004], 0.04, [0, 0.04, 0.052], C.rubber, { finish: 'rubber' }), cyl(0.045, 0.012, [0, 0.08, 0.066], C.blue, { onOutput: true })],
    [port('input', 'Input bore Ø11 mm', 'SH-11', 'in', [0, 0, 0]), port('output', 'Output flange FL-M', 'FL-M', 'out', [0, 0.08, 0.072], { rotary: true })],
    { gearbox: gear({ type: 'Belt drive', ratio: 3, efficiency: 0.95, T_rated: 6, T_peak: 12, backlash_arcmin: 15, viscous: 0.05, coulomb: 0.05, vmax_dps: 1500 }) }),
  item('lm-bs-600', 'Linear axis module LM-80, ball screw, 600 mm', 'Transmissions', 'Linear module', 7.2, 'Aluminium body, C7 ball screw, profile rail',
    'Linear axis with 600 mm stroke, 10 mm lead ball screw and integrated 200 W servo. Carriage output LMC-80 is a prismatic joint (travel along the module +x).',
    linearModule(0.6), [IN('LM-80', 'Base mounting face'), port('carriage', 'Carriage plate LMC-80', 'LMC-80', 'out', [0.06, 0, 0.07], { rotary: true, zx: [[1, 0, 0], [0, 0, 1]], hint: 'Prismatic joint output' })],
    { motor: G200i, gearbox: linear(0.01, 800, 2000, 600, 500), role: 'Prismatic axis (Cartesian robots)' }),
  item('lm-bs-400', 'Linear axis module LM-80, ball screw, 400 mm', 'Transmissions', 'Linear module', 5.4, 'Aluminium body, C7 ball screw, profile rail',
    'Linear axis with 400 mm stroke, 10 mm lead, integrated 200 W servo.',
    linearModule(0.4), [IN('LM-80', 'Base mounting face'), port('carriage', 'Carriage plate LMC-80', 'LMC-80', 'out', [0.06, 0, 0.07], { rotary: true, zx: [[1, 0, 0], [0, 0, 1]] })],
    { motor: G200i, gearbox: linear(0.01, 800, 2000, 400, 500), role: 'Prismatic axis (Cartesian robots)' }),
  item('lm-bs-250', 'Linear axis module LM-80, ball screw, 250 mm (Z)', 'Transmissions', 'Linear module', 3.9, 'Aluminium body, C7 ball screw, brake',
    'Short stroke axis for Z, 5 mm lead, 100 W servo with holding brake.',
    linearModule(0.25), [IN('LM-80', 'Base mounting face'), port('carriage', 'Carriage plate LMC-80', 'LMC-80', 'out', [0.06, 0, 0.07], { rotary: true, zx: [[1, 0, 0], [0, 0, 1]] })],
    { motor: G100i, gearbox: linear(0.005, 600, 1500, 250, 250), role: 'Prismatic axis (Z)' }),
  item('lm-belt-1000', 'Linear axis module LM-80, belt, 1000 mm', 'Transmissions', 'Linear module', 7.8, 'Aluminium body, steel-cord belt',
    'Fast belt-driven axis, 1000 mm stroke, 100 mm per motor revolution, integrated 400 W servo.',
    linearModule(1.0), [IN('LM-80', 'Base mounting face'), port('carriage', 'Carriage plate LMC-80', 'LMC-80', 'out', [0.06, 0, 0.07], { rotary: true, zx: [[1, 0, 0], [0, 0, 1]] })],
    { motor: G400i, gearbox: { ...linear(0.1, 300, 600, 1000, 2000, 'Belt drive', 0.95), viscous: 25, coulomb: 8 }, role: 'Prismatic axis (fast, long)' }),
  item('lz-spline-150', 'SCARA Z-axis ball-screw spline 150 mm', 'Transmissions', 'Ball-screw spline', 2.6, 'Ground ball screw-spline shaft',
    'Vertical axis for SCARA robots: 150 mm stroke, 10 mm lead, integrated 100 W servo; the hollow quill carries an AM-S mount for the tool-roll actuator.',
    [rbox([0.08, 0.08, 0.12], 0.008, [0, 0, 0.06], C.white, { finish: 'plastic' }), cyl(0.025, 0.06, [0.0, 0.055, 0.03], C.black), cyl(0.01, 0.2, [0, 0, 0.17], C.silver, { onOutput: true }), cyl(0.03, 0.012, [0, 0, 0.264], C.blue, { onOutput: true })],
    [IN('LZ', 'Z mount'), port('quill', 'Quill end AM-S', 'AM-S', 'out', [0, 0, 0.27], { rotary: true, hint: 'Prismatic joint (down)' })],
    { motor: G100i, gearbox: linear(0.01, 300, 800, 150, 800), role: 'Prismatic axis (SCARA Z)' }),
  item('rack-pinion-500', 'Rack-and-pinion axis 500 mm (module 2)', 'Transmissions', 'Rack and pinion', 6.0, 'Hardened rack, steel pinion z20',
    'Heavy-duty axis: module-2 rack, 20-tooth pinion (125.7 mm per revolution) with integrated 400 W servo and 10:1 planetary.',
    [...linearModule(0.5).slice(0, 2), { kind: 'gear', dims: [0.002, 20, 0.02, 0.014], pos: [0.06, -0.05, 0.05], rot: [90, 0, 0], color: C.steel, finish: 'metal', onOutput: true }, ...linearModule(0.5).slice(3)],
    [IN('LM-80', 'Base mounting face'), port('carriage', 'Carriage plate LMC-80', 'LMC-80', 'out', [0.06, 0, 0.07], { rotary: true, zx: [[1, 0, 0], [0, 0, 1]] })],
    { motor: G400i, gearbox: { ...linear(0.012566, 600, 1500, 500, 800, 'Rack and pinion', 0.9) }, role: 'Prismatic axis (heavy)' }),
  item('lm-cross-xy', 'Axis cross-plate XY', 'Transmissions', 'Axis adapter', 0.4, 'Aluminium 6061',
    'Bolts on an LMC-80 carriage and carries the next linear module at 90° in the horizontal plane (X → Y).',
    [rbox([0.012, 0.14, 0.14], 0.003, [0.006, 0, 0], C.black, { finish: 'anodised' })],
    [IN('LMC-80', 'Carriage face'), port('out', 'Linear module mount (Y)', 'LM-80', 'out', [0.012, 0, 0], { zx: [[1, 0, 0], [0, 1, 0]] })]),
  item('lm-z-adapter', 'Axis Z-adapter (vertical)', 'Transmissions', 'Axis adapter', 0.6, 'Aluminium 6061',
    'Angle plate that carries a vertical Z module on a horizontal carriage (travel downwards).',
    [rbox([0.012, 0.14, 0.14], 0.003, [0.006, 0, 0], C.black, { finish: 'anodised' }), rbox([0.14, 0.012, 0.14], 0.003, [-0.05, -0.076, 0], C.black, { finish: 'anodised' })],
    [IN('LMC-80', 'Carriage face'), port('out', 'Linear module mount (Z, down)', 'LM-80', 'out', [-0.05, -0.082, 0], { zx: [[0, -1, 0], [-1, 0, 0]] })]),
  item('lm-tool-plate', 'Carriage tool plate → ISO 9409-1-40', 'Transmissions', 'Axis adapter', 0.3, 'Aluminium 6061',
    'Tool plate on an LMC-80 carriage with an ISO 9409-1-40 flange pointing along the direction of travel (downwards on a Z axis).',
    [rbox([0.012, 0.1, 0.1], 0.003, [0.006, 0, 0], C.black, { finish: 'anodised' }), rbox([0.04, 0.06, 0.07], 0.004, [0.03, 0, 0.035], C.black, { finish: 'anodised' }), cyl(0.032, 0.012, [0.03, 0, 0.076], C.dark)],
    [IN('LMC-80', 'Carriage face'), port('tool', 'Tool flange ISO 9409-1-40 (pointing along travel)', 'TF-40', 'out', [0.03, 0, 0.082], { zx: [[0, 0, 1], [1, 0, 0]] })]),
  // shaft-mounted drive parts (pass-through on the shaft)
  ...[['coupling-8-8', 'Flexible jaw coupling 8–8 mm', 8, 8, 0.025, 0.04, 'Aluminium hubs, TPU spider'], ['coupling-14-14', 'Flexible jaw coupling 14–14 mm', 14, 14, 0.035, 0.055, 'Aluminium hubs, TPU spider'], ['coupling-5-8', 'Flexible beam coupling 5–8 mm', 5, 8, 0.0125, 0.025, 'Aluminium 7075 (helical beam)'], ['coupling-14-15', 'Rigid coupling 14–15 mm', 14, 15, 0.02, 0.04, 'Steel']].map(([id, name, a, b, r, h, mat]) =>
    item(id as string, name as string, 'Transmissions', 'Coupling', +(Math.PI * (r as number) ** 2 * (h as number) * 2700).toFixed(3), mat as string, `Connects a Ø${a} mm shaft to a Ø${b} mm shaft and absorbs misalignment.`,
      [cyl(r as number, (h as number) * 0.4, [0, 0, (h as number) * 0.2], C.alu), cyl((r as number) * 0.95, (h as number) * 0.2, [0, 0, (h as number) * 0.5], id === 'coupling-5-8' ? C.alu : C.red, { finish: 'rubber' }), cyl(r as number, (h as number) * 0.4, [0, 0, (h as number) * 0.8], C.alu), hex(0.004, 0.004, [r as number, 0, (h as number) * 0.2], C.chip, { rot: [0, 90, 0] })],
      [port('in', `Bore Ø${a} mm`, `SH-${a}`, 'in', [0, 0, 0]), port('out', `Bore Ø${b} mm`, `SH-${b}`, 'out', [0, 0, h as number])])),
  ...[[8, 0.15], [14, 0.2], [15, 0.25]].map(([d, L]) => item(`shaft-${d}-${L * 1000}`, `Precision shaft Ø${d} × ${L * 1000} mm`, 'Transmissions', 'Shaft', +(Math.PI * (d / 2000) ** 2 * L * 7850).toFixed(3), 'Induction-hardened steel, h6',
    `Ground shaft Ø${d} h6 for gears, pulleys, bearings and couplings.`, [cyl(d / 2000, L, [0, 0, L / 2], C.silver)],
    [port('in', `End Ø${d}`, `SH-${d}`, 'in', [0, 0, 0]), port('out', `Far end Ø${d}`, `SH-${d}`, 'out', [0, 0, L])])),
  ...([[1, 20, 8, 0.01], [1, 40, 8, 0.01], [1, 60, 8, 0.01], [2, 30, 14, 0.02]] as const).map(([m, z, b, w]) => item(`gear-spur-m${m}-z${z}`, `Spur gear m${m} z${z} (bore ${b})`, 'Transmissions', 'Spur gear', +(Math.PI * ((m * z) / 2000) ** 2 * w * 7850 * 0.85).toFixed(3), 'Steel C45, 20° pressure angle',
    `Involute spur gear, module ${m}, ${z} teeth, pitch Ø${m * z} mm, face ${w * 1000} mm.`, [{ kind: 'gear', dims: [m / 1000, z, w, b / 1000], pos: [0, 0, w / 2], color: C.steel, finish: 'metal' }, cyl(b / 1000 + 0.005, w + 0.006, [0, 0, w / 2], C.steel)],
    [port('in', `Bore Ø${b}`, `SH-${b}`, 'in', [0, 0, 0]), port('out', 'Shaft continues', `SH-${b}`, 'out', [0, 0, w])])),
  item('gear-helical-m1-z30', 'Helical gear m1 z30 β = 20° (bore 8)', 'Transmissions', 'Helical gear', 0.045, 'Steel 42CrMo4', 'Helical gear for quieter, smoother meshing; axial thrust must be supported by the bearings.',
    [{ kind: 'gear', dims: [0.001, 30, 0.012, 0.008, 20], pos: [0, 0, 0.006], color: C.steel, finish: 'metal' }], [IN('SH-8', 'Bore Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.012])]),
  item('gear-bevel-m15-z20', 'Bevel gear m1.5 z20 (bore 8)', 'Transmissions', 'Bevel gear', 0.06, 'Steel', '90° bevel gear for right-angle drives (wrist differentials).',
    [cone(0.016, 0.009, 0.012, [0, 0, 0.006], C.steel), cyl(0.009, 0.01, [0, 0, -0.004], C.steel)], [IN('SH-8', 'Bore Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.012])]),
  item('gear-worm-set', 'Worm gear set 30:1 (bore 8)', 'Transmissions', 'Worm gear', 0.12, 'Bronze wheel, steel worm', 'Self-locking 30:1 worm set (efficiency ≈ 45 %).',
    [{ kind: 'gear', dims: [0.0015, 30, 0.012, 0.008], pos: [0, 0, 0.006], color: C.brass, finish: 'metal' }, { kind: 'spring', dims: [0.006, 0.002, 0.03, 4], pos: [0.028, 0, 0.006], rot: [90, 0, 0], color: C.steel, finish: 'metal' }],
    [IN('SH-8', 'Bore Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.012])]),
  ...([['pulley-gt2-20', 'Timing pulley GT2 20T (bore 8)', 0.001, 20, 8], ['pulley-gt2-60', 'Timing pulley GT2 60T (bore 8)', 0.001, 60, 8], ['pulley-htd5-30', 'Timing pulley HTD 5M 30T (bore 14)', 0.0016, 30, 14]] as const).map(([id, name, m, z, b]) =>
    item(id, name, 'Transmissions', 'Timing pulley', +(Math.PI * ((m * z) / 2) ** 2 * 0.012 * 2700).toFixed(3), 'Aluminium 6061', `Timing pulley, ${z} teeth, flanged; mounts on a Ø${b} shaft and drives a matching belt.`,
      [cyl((m * z) / 2 + 0.002, 0.0015, [0, 0, 0.00075], C.silver), { kind: 'gear', dims: [m, z, 0.008, b / 1000], pos: [0, 0, 0.0055], color: C.silver, finish: 'metal' }, cyl((m * z) / 2 + 0.002, 0.0015, [0, 0, 0.01025], C.silver), cyl(b / 2000 + 0.004, 0.008, [0, 0, 0.015], C.silver)],
      [IN(`SH-${b}`, `Bore Ø${b}`), port('out', 'Shaft continues', `SH-${b}`, 'out', [0, 0, 0.019]), port('belt', 'Belt track', id.includes('htd') ? 'BELT-HTD5' : 'BELT-GT2', 'out', [0, 0, 0.0055])])),
  item('belt-gt2-400', 'Timing belt GT2 6 mm, closed loop 400 mm', 'Transmissions', 'Timing belt', 0.012, 'Neoprene with glass-fibre cords', 'Closed GT2 belt between two pulleys (shown at 140 mm centre distance).',
    [rbox([0.16, 0.024, 0.006], 0.011, [0.07, 0, 0], C.rubber, { finish: 'rubber' })], [IN('BELT-GT2', 'On pulley')]),
  item('belt-htd5-600', 'Timing belt HTD 5M 15 mm, loop 600 mm', 'Transmissions', 'Timing belt', 0.045, 'Neoprene with glass-fibre cords', 'HTD 5M belt for power transmission (shown at 220 mm centre distance).',
    [rbox([0.27, 0.05, 0.015], 0.024, [0.11, 0, 0], C.rubber, { finish: 'rubber' })], [IN('BELT-HTD5', 'On pulley')]),
  ...([['brg-608zz', 'Deep-groove ball bearing 608-ZZ (8×22×7)', 8, 0.011, 0.007, 0.012], ['brg-6202', 'Deep-groove ball bearing 6202-2RS (15×35×11)', 15, 0.0175, 0.011, 0.045], ['brg-nu202', 'Cylindrical roller bearing NU202 (15×35×11)', 15, 0.0175, 0.011, 0.05], ['brg-lm8uu', 'Linear ball bearing LM8UU (8×15×24)', 8, 0.0075, 0.024, 0.016]] as const).map(([id, name, b, ro, w, m]) =>
    item(id, name, 'Transmissions', id.includes('lm8') ? 'Linear bearing' : id.includes('nu') ? 'Roller bearing' : 'Ball bearing', m, 'Bearing steel 100Cr6', `${name}. Mounts on a Ø${b} mm shaft.`,
      [tube(ro, ro * 0.8, w, [0, 0, w / 2], C.silver), tube(b / 2000 + (ro - b / 2000) * 0.3, b / 2000, w, [0, 0, w / 2], C.silver), id.includes('nu') || id.includes('lm8') ? tube(ro * 0.8, b / 2000 + (ro - b / 2000) * 0.3, w * 0.9, [0, 0, w / 2], C.steel) : torus((ro + b / 2000) / 2, (ro - b / 2000) * 0.22, [0, 0, w / 2], C.steel), torus((ro + b / 2000) / 2, 0.0006, [0, 0, w - 0.0005], id.includes('zz') ? C.silver : C.rubber)],
      [IN(`SH-${b}`, `Bore Ø${b}`), port('out', 'Shaft continues', `SH-${b}`, 'out', [0, 0, w])])),
  item('brg-kp08', 'Pillow-block bearing KP08 (Ø8)', 'Transmissions', 'Bearing unit', 0.06, 'Zinc alloy housing, ball bearing insert', 'Self-aligning pillow block for Ø8 shafts.',
    [rbox([0.055, 0.013, 0.015], 0.003, [0, 0, -0.008], C.silver), cyl(0.012, 0.013, [0, 0, 0], C.silver, { rot: [90, 0, 0] }), tube(0.008, 0.004, 0.013, [0, 0, 0], C.steel, { rot: [90, 0, 0] })],
    [IN('SH-8', 'Bore Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.0065])]),
  item('collar-8', 'Shaft collar Ø8 (clamping)', 'Transmissions', 'Shaft collar', 0.01, 'Steel, black oxide', 'Axial location of bearings and gears.',
    [tube(0.009, 0.004, 0.009, [0, 0, 0.0045], C.chip), hex(0.003, 0.004, [0.009, 0, 0.0045], C.chip, { rot: [0, 90, 0] })], [IN('SH-8', 'Bore Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.009])]),
  item('leadscrew-t8-300', 'Lead screw T8×8 × 300 mm with brass nut', 'Transmissions', 'Lead screw', 0.13, 'Stainless steel, brass nut', '8 mm lead trapezoidal screw (4 starts) – efficiency ≈ 40 %, back-drivable.',
    [{ kind: 'spring', dims: [0.0035, 0.0012, 0.3, 37], pos: [0, 0, 0.15], color: C.silver, finish: 'metal' }, cyl(0.0032, 0.3, [0, 0, 0.15], C.silver), cyl(0.011, 0.0035, [0, 0, 0.15], C.brass), cyl(0.0052, 0.015, [0, 0, 0.16], C.brass)],
    [IN('SH-8', 'End journal Ø8')]),
  item('ballscrew-1204-400', 'Ball screw SFU1204 × 400 mm with nut', 'Transmissions', 'Ball screw', 0.65, 'Rolled C7 ball screw', '12 mm screw, 4 mm lead, efficiency ≈ 90 %, with end machining for Ø8 coupling.',
    [{ kind: 'spring', dims: [0.0055, 0.0011, 0.4, 100], pos: [0, 0, 0.2], color: C.silver, finish: 'metal' }, cyl(0.0052, 0.4, [0, 0, 0.2], C.silver), cyl(0.024, 0.01, [0, 0, 0.2], C.steel), cyl(0.012, 0.04, [0, 0, 0.215], C.steel)],
    [IN('SH-8', 'End journal Ø8')]),
  item('spring-comp-8', 'Compression spring Ø16 × 40 (for Ø8 shaft)', 'Transmissions', 'Spring', 0.008, 'Spring steel EN 10270-1', 'Compression spring, rate ≈ 2.5 N/mm, for preload and compliance.',
    [{ kind: 'spring', dims: [0.007, 0.0009, 0.04, 7], pos: [0, 0, 0.02], color: C.silver, finish: 'metal' }], [IN('SH-8', 'Over shaft Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.04])]),
  item('damper-gas-150', 'Gas spring / damper 150 mm stroke', 'Transmissions', 'Damper', 0.25, 'Steel tube, chrome rod', 'Gas spring with oil damping (200 N) for gravity balancing of arms and lids.',
    [cyl(0.011, 0.2, [0, 0, 0.1], C.black), cyl(0.004, 0.15, [0, 0, 0.275], C.silver), sphere(0.006, [0, 0, 0.355], C.silver)], [IN('ACC')]),
  item('fastener-tnut-kit-20', 'T-slot nut + M5 SHCS kit (20 series)', 'Structure', 'Fasteners', 0.01, 'Steel 8.8, zinc plated', 'Drop-in T-nut and M5×10 socket-head cap screw (ISO 4762).',
    [box([0.006, 0.01, 0.004], [0, 0, 0.002], C.silver, { finish: 'metal' }), cyl(0.0042, 0.005, [0, 0, 0.0065], C.chip), hex(0.004, 0.002, [0, 0, 0.0095], C.chip)], [IN('SLOT-20', 'T-slot')]),
  item('fastener-shcs-m6', 'Socket-head cap screws M6×20, set of 4 (ISO 4762)', 'Structure', 'Fasteners', 0.024, 'Steel 12.9, black oxide', 'Four M6×20 cap screws on the accessory pattern.',
    [bolts(0.042, 4, 0.01, 0.006, [0, 0, 0.003], { color: C.chip })], [IN('ACC', 'Accessory pattern')]),
  item('fastener-nut-m8', 'Hex nuts M8 + washers, set (ISO 4032)', 'Structure', 'Fasteners', 0.02, 'Steel 8, zinc plated', 'Hex nut and washer for shaft ends.',
    [cyl(0.008, 0.0016, [0, 0, 0.0008], C.silver), hex(0.013, 0.0065, [0, 0, 0.005], C.silver)], [IN('SH-8', 'Thread M8')]),
);

// ---------------------------------------------------------------- SENSORS
const accSensor = (id: string, name: string, sub: string, mass: number, mat: string, desc: string, shapes: Shape[], sensor: CatalogItem['sensor']) =>
  item(id, name, 'Sensors', sub, mass, mat, desc, shapes, [IN('ACC', 'Accessory mount (4×M4)')], { sensor });
add(
  accSensor('sens-imu9', '9-axis IMU module (accel + gyro + mag)', 'IMU', 0.008, 'PCB',
    'MEMS IMU: ±16 g accelerometer, ±2000 °/s gyroscope, magnetometer, 1 kHz. In simulation it reports the specific force and angular rate of the body it is mounted on (from the RNEA body kinematics).',
    board(0.025, 0.02, C.pcbBlue, [chip(0.004, 0.004, 0.001, 0, 0), header(6, -0.011, 0)]), { kind: 'imu', range: 16, rate_hz: 1000, noise: 0.002 }),
  accSensor('sens-accel', '3-axis accelerometer module (±8 g)', 'Accelerometer', 0.005, 'PCB', 'Low-noise 3-axis MEMS accelerometer – reports body specific force in simulation.',
    board(0.02, 0.016, C.pcbBlue, [chip(0.003, 0.003, 0.001, 0, 0), header(5, -0.008, 0)]), { kind: 'accelerometer', range: 8, rate_hz: 1000 }),
  accSensor('sens-gyro', '3-axis gyroscope module (±2000 °/s)', 'Gyroscope', 0.005, 'PCB', 'MEMS rate gyroscope – reports body angular velocity in simulation.',
    board(0.02, 0.016, C.pcbBlue, [chip(0.003, 0.003, 0.001, 0, 0), header(5, -0.008, 0)]), { kind: 'gyroscope', range: 2000, rate_hz: 1000 }),
  accSensor('sens-mag', '3-axis magnetometer module', 'Magnetometer', 0.004, 'PCB', 'Hall-effect magnetometer for heading (orientation reference). Library part; magnetic field not simulated.',
    board(0.018, 0.014, C.pcbBlack, [chip(0.003, 0.003, 0.001, 0, 0)]), { kind: 'magnetometer', note: 'Magnetic field not simulated' }),
  accSensor('sens-ultrasonic', 'Ultrasonic distance sensor (2–400 cm)', 'Ultrasonic', 0.009, 'PCB, piezo transducers',
    'Time-of-flight ultrasonic ranger, 15° cone. In simulation it measures the distance along its axis to the ground plane.',
    board(0.045, 0.02, C.pcbBlue, [cyl(0.008, 0.012, [-0.013, 0, 0.006], C.silver), cyl(0.008, 0.012, [0.013, 0, 0.006], C.silver), chip(0.006, 0.004, 0.003, 0, 0.007)]), { kind: 'range', range: 4, minRange: 0.02, rate_hz: 40 }),
  accSensor('sens-tof', 'Laser ToF distance sensor (0.03–2 m)', 'Infrared / ToF', 0.003, 'PCB', 'Time-of-flight laser ranging sensor, 940 nm, 25° FoV.',
    board(0.018, 0.013, C.pcbBlack, [chip(0.0049, 0.0025, 0.0016, 0, 0.002, C.chip)]), { kind: 'range', range: 2, minRange: 0.03, rate_hz: 50 }),
  accSensor('sens-ir-tri', 'Infrared triangulation distance sensor (10–80 cm)', 'Infrared', 0.005, 'ABS housing', 'Analogue IR distance sensor.',
    [rbox([0.03, 0.013, 0.014], 0.002, [0, 0, 0.007], C.chip, { finish: 'plastic' }), cyl(0.004, 0.003, [-0.007, 0, 0.0155], C.glass, { finish: 'glass' }), cyl(0.004, 0.003, [0.007, 0, 0.0155], C.glass, { finish: 'glass' })], { kind: 'range', range: 0.8, minRange: 0.1, rate_hz: 25 }),
  accSensor('sens-prox-m12', 'Inductive proximity sensor M12 (4 mm)', 'Proximity', 0.03, 'Nickel-plated brass', 'PNP inductive sensor, 4 mm sensing distance to steel.',
    [{ kind: 'spring', dims: [0.0058, 0.0006, 0.04, 40], pos: [0, 0, 0.02], color: C.silver, finish: 'metal' }, cyl(0.0057, 0.045, [0, 0, 0.0225], C.silver), cyl(0.0055, 0.004, [0, 0, 0.047], C.orange, { finish: 'plastic' }), hex(0.017, 0.004, [0, 0, 0.006], C.silver)], { kind: 'proximity', range: 0.004, minRange: 0 }),
  accSensor('sens-lidar2d', '2D LiDAR scanner (12 m, 360°)', 'LiDAR', 0.19, 'Polycarbonate dome, spinning optics', 'Triangulation 2D LiDAR, 360°, 10 Hz, 12 m range. In simulation its beam axis distance to ground is reported; full scans are a roadmap item.',
    [cyl(0.035, 0.025, [0, 0, 0.0125], C.chip, { finish: 'plastic' }), cyl(0.033, 0.02, [0, 0, 0.035], C.chip, { finish: 'glass' }), cyl(0.03, 0.004, [0, 0, 0.047], C.dark)], { kind: 'lidar', range: 12, minRange: 0.12, rate_hz: 10 }),
  accSensor('sens-cam-rgb', 'RGB camera module (1080p, M12 lens)', 'Camera', 0.03, 'Aluminium housing, glass lens', 'Global-shutter colour camera, 1920×1080 @ 60 fps. Images are not rendered in this build (roadmap: virtual camera).',
    [rbox([0.03, 0.03, 0.02], 0.003, [0, 0, 0.01], C.dark), cyl(0.008, 0.012, [0, 0, 0.026], C.chip), cyl(0.006, 0.001, [0, 0, 0.0325], C.glass, { finish: 'glass' })], { kind: 'camera', rate_hz: 60, note: 'Image synthesis not simulated' }),
  accSensor('sens-cam-rgbd', 'RGB-D depth camera (stereo IR + RGB)', 'Depth camera', 0.09, 'Aluminium housing', 'Active-stereo depth camera, 0.2–10 m, 1280×720 depth @ 30 fps.',
    [rbox([0.09, 0.025, 0.025], 0.008, [0, 0, 0.0125], C.dark), ...[-0.03, -0.01, 0.015, 0.032].map((x) => cyl(0.0045, 0.002, [x, 0, 0.026], C.glass, { finish: 'glass' } as SX))], { kind: 'camera', range: 10, rate_hz: 30, note: 'Depth synthesis not simulated' }),
  accSensor('sens-cam-stereo', 'Stereo camera (120 mm baseline)', 'Stereo camera', 0.16, 'Aluminium housing', 'Passive stereo pair with IMU, 120 mm baseline.',
    [rbox([0.175, 0.03, 0.03], 0.012, [0, 0, 0.015], C.silver, { finish: 'anodised' }), cyl(0.009, 0.003, [-0.06, 0, 0.031], C.glass, { finish: 'glass' }), cyl(0.009, 0.003, [0.06, 0, 0.031], C.glass, { finish: 'glass' })], { kind: 'camera', range: 20, rate_hz: 30, note: 'Image synthesis not simulated' }),
  accSensor('sens-loadcell', 'Load cell bar 20 kg (strain gauge)', 'Force sensor', 0.03, 'Aluminium alloy', 'Single-point bending-beam load cell, 20 kg, 1 mV/V, with 24-bit ADC board.',
    [box([0.08, 0.0127, 0.0127], [0, 0, 0.0064], C.silver, { finish: 'metal' }), box([0.02, 0.0129, 0.006], [0, 0, 0.0127], C.blue, { finish: 'rubber' })], { kind: 'force', range: 196 }),
  accSensor('sens-pressure', 'Pressure transducer 0–10 bar (G1/4)', 'Pressure sensor', 0.05, 'Stainless steel', 'Piezo-resistive pressure transducer, 0.5–4.5 V output. Library part for the pneumatic kit.',
    [cyl(0.011, 0.04, [0, 0, 0.02], C.silver), hex(0.022, 0.01, [0, 0, 0.005], C.silver), cyl(0.008, 0.012, [0, 0, 0.046], C.chip, { finish: 'plastic' })], { kind: 'pressure', range: 1e6, note: 'Pneumatics not simulated' }),
  accSensor('sens-tactile', 'Tactile sensor pad 4×4 (FSR array)', 'Tactile sensor', 0.004, 'Polyimide, silicone skin', '16-taxel force-sensing pad for gripper fingers.',
    [rbox([0.03, 0.02, 0.002], 0.002, [0, 0, 0.001], C.chip, { finish: 'rubber' }), ...[-1, -0.33, 0.33, 1].flatMap((i) => [-1, -0.33, 0.33, 1].map((j) => cyl(0.0018, 0.0006, [i * 0.011, j * 0.007, 0.0023], C.copper)))], { kind: 'tactile', range: 10 }),
  item('sens-enc-inc', 'Incremental rotary encoder 1024 PPR (Ø8 shaft)', 'Sensors', 'Rotary encoder', 0.08, 'Aluminium housing, optical disc', 'Hollow-shaft optical encoder, 1024 PPR quadrature (4096 counts/rev).',
    [cyl(0.019, 0.025, [0, 0, 0.0125], C.dark), cyl(0.005, 0.004, [0.019, 0, 0.012], C.chip, { rot: [0, 90, 0] })], [IN('SH-8', 'Hollow shaft Ø8'), port('out', 'Shaft continues', 'SH-8', 'out', [0, 0, 0.025])], { sensor: { kind: 'encoder', note: '4096 counts/rev' } }),
  item('sens-enc-abs', 'Absolute magnetic encoder ring 17-bit (Ø14)', 'Sensors', 'Absolute encoder', 0.05, 'Magnetic ring + read head', 'Off-axis absolute encoder, 17-bit single-turn, BiSS-C.',
    [tube(0.024, 0.008, 0.006, [0, 0, 0.003], C.chip), box([0.012, 0.01, 0.008], [0.028, 0, 0.004], C.green, { finish: 'plastic' })], [IN('SH-14', 'Ring on Ø14 shaft'), port('out', 'Shaft continues', 'SH-14', 'out', [0, 0, 0.006])], { sensor: { kind: 'encoder', note: '131072 counts/rev' } }),
  item('sens-torque-m', 'Inline joint torque sensor FL-M (±100 N·m)', 'Sensors', 'Torque sensor', 0.35, 'Stainless steel spoke flexure', 'Strain-gauge torque flange between a joint output and its link; reports the transmitted joint torque.',
    [cyl(0.047, 0.018, [0, 0, 0.009], C.silver), ...[0, 60, 120].map((a) => box([0.07, 0.006, 0.012], [0, 0, 0.009], C.steel, { rot: [0, 0, a], finish: 'metal' } as SX))],
    [IN('FL-M', 'Joint side'), port('out', 'Link side FL-M', 'FL-M', 'out', [0, 0, 0.018])], { sensor: { kind: 'torque', range: 100 } }),
  item('sens-torque-l', 'Inline joint torque sensor FL-L (±300 N·m)', 'Sensors', 'Torque sensor', 0.6, 'Stainless steel spoke flexure', 'Strain-gauge torque flange for size-L joints.',
    [cyl(0.062, 0.022, [0, 0, 0.011], C.silver), ...[0, 60, 120].map((a) => box([0.1, 0.008, 0.016], [0, 0, 0.011], C.steel, { rot: [0, 0, a], finish: 'metal' } as SX))],
    [IN('FL-L', 'Joint side'), port('out', 'Link side FL-L', 'FL-L', 'out', [0, 0, 0.022])], { sensor: { kind: 'torque', range: 300 } }),
);

// ---------------------------------------------------------------- END-EFFECTORS
const ee = (id: string, name: string, sub: string, mass: number, mat: string, desc: string, shapes: Shape[], gripper: CatalogItem['gripper'], extraPorts: Port[] = []) =>
  item(id, name, 'End-effectors', sub, mass, mat, desc, shapes, [IN('TF-40', 'ISO 9409-1-40 mounting'), ...extraPorts], { gripper, role: 'End effector' });
add(
  ee('ee-gripper3', 'Three-finger adaptive gripper AG-3', 'Three-finger gripper', 1.4, 'Aluminium palm, POM fingers',
    'Three underactuated fingers at 120°, 100 mm opening, 100 N grip; encloses cylindrical and spherical parts.',
    [cyl(0.05, 0.06, [0, 0, 0.03], C.dark), cyl(0.04, 0.01, [0, 0, 0.065], C.silver),
      ...[90, 210, 330].map((a) => box([0.018, 0.02, 0.08], [0, 0, 0.11], C.yellow, { finger: 1, fingerAngle: a, rot: [0, 0, a], finish: 'plastic' } as SX))],
    { kind: 'adaptive', stroke: 0.1, force: 100, tcp: 0.14 }, [port('acc', 'Accessory mount (side)', 'ACC', 'out', [0, 0.05, 0.03], { zx: [[0, 1, 0], [0, 0, 1]] })]),
  ee('ee-hand5', 'Five-finger robotic hand H-5', 'Robotic hand', 0.9, 'Aluminium palm, 3D-printed phalanges, tendon drive',
    'Anthropomorphic hand: 5 fingers, 15 joints, 6 tendon actuators in the palm. Grasp forces are not resolved per finger in this build (whole-hand grasp model).',
    [rbox([0.085, 0.03, 0.1], 0.012, [0, 0, 0.06], C.silver, { finish: 'anodised' }),
      ...[-0.03, -0.01, 0.01, 0.03].flatMap((x, k) => [0, 1, 2].map((s) => rbox([0.016, 0.018, 0.028 - s * 0.004], 0.006, [x, 0, 0.125 + s * 0.028 + (k === 1 || k === 2 ? 0.006 : 0)], C.white, { finish: 'plastic' }))),
      ...[0, 1].map((s) => rbox([0.018, 0.018, 0.026], 0.006, [0.05 + s * 0.012, -0.012, 0.05 + s * 0.022], C.white, { finish: 'plastic', rot: [0, 35, 0] }))],
    { kind: 'hand', stroke: 0, force: 50, tcp: 0.15 }, [port('acc', 'Back-of-hand mount', 'ACC', 'out', [0, -0.015, 0.06], { zx: [[0, -1, 0], [0, 0, 1]] })]),
  ee('ee-gripper-l', 'Parallel gripper PG-140 (heavy)', 'Parallel gripper', 1.6, 'Aluminium body, steel jaws', '140 mm stroke, 300 N grip force, for boxes and machine tending.',
    [rbox([0.16, 0.06, 0.07], 0.006, [0, 0, 0.035], C.dark), box([0.02, 0.04, 0.08], [0, 0, 0.11], C.silver, { finger: -1, finish: 'metal' }), box([0.02, 0.04, 0.08], [0, 0, 0.11], C.silver, { finger: 1, finish: 'metal' })],
    { kind: 'parallel', stroke: 0.14, force: 300, tcp: 0.16 }, [port('acc', 'Accessory mount (side)', 'ACC', 'out', [0, 0.03, 0.035], { zx: [[0, 1, 0], [0, 0, 1]] })]),
  ee('ee-adaptive2', 'Adaptive two-finger gripper AF-85', 'Adaptive gripper', 0.95, 'Aluminium, silicone pads', '85 mm stroke, linkage fingers that wrap around the part, 120 N.',
    [rbox([0.09, 0.05, 0.07], 0.012, [0, 0, 0.035], C.black), box([0.016, 0.03, 0.07], [0, 0, 0.1], C.dark, { finger: -1, rot: [0, -8, 0] }), box([0.016, 0.03, 0.07], [0, 0, 0.1], C.dark, { finger: 1, rot: [0, 8, 0] })],
    { kind: 'parallel', stroke: 0.085, force: 120, tcp: 0.13 }),
  ee('ee-vacuum4', 'Vacuum gripper array VG-4 (4 cups)', 'Vacuum gripper', 0.6, 'Aluminium frame, silicone bellows cups', 'Four Ø30 bellows cups on a 120 mm frame with venturi, 160 N holding at −0.6 bar.',
    [rbox([0.14, 0.14, 0.012], 0.006, [0, 0, 0.03], C.alu, { finish: 'anodised' }), cyl(0.02, 0.025, [0, 0, 0.0125], C.dark), ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([sx, sy]) => [cyl(0.004, 0.02, [sx * 0.06, sy * 0.06, 0.046], C.silver), cone(0.008, 0.015, 0.012, [sx * 0.06, sy * 0.06, 0.062], C.blue, { finish: 'rubber' })])],
    { kind: 'vacuum', stroke: 0, force: 160, tcp: 0.068 }),
  ee('ee-magnet', 'Electromagnetic gripper EM-50', 'Magnetic gripper', 0.5, 'Steel pole, copper coil', 'Ø50 mm holding magnet, 250 N on steel, 24 V.',
    [cyl(0.025, 0.04, [0, 0, 0.02], C.red, { finish: 'anodised' }), cyl(0.025, 0.006, [0, 0, 0.043], C.silver)], { kind: 'magnetic', stroke: 0, force: 250, tcp: 0.046 }),
  ee('ee-weld', 'MIG welding torch WT-1 (air-cooled, 22°)', 'Welding tool', 1.1, 'Copper neck, brass nozzle', 'Robotic MIG/MAG torch with 22° neck, 350 A. TCP at the wire stick-out (15 mm).',
    [cyl(0.03, 0.05, [0, 0, 0.025], C.dark), cyl(0.012, 0.12, [0, 0.012, 0.11], C.copper, { rot: [-11, 0, 0] }), cone(0.011, 0.008, 0.04, [0, 0.03, 0.18], C.brass, { rot: [-22, 0, 0] }), cyl(0.0006, 0.015, [0, 0.036, 0.205], C.silver)],
    { kind: 'tool', stroke: 0, force: 0, tcp: 0.21 }),
  ee('ee-spindle', 'Milling / cutting spindle SP-500 (500 W)', 'Cutting tool', 1.3, 'Aluminium housing, ER11 collet', '500 W, 24 000 rpm spindle with Ø6 end mill; TCP at the cutter tip.',
    [cyl(0.026, 0.1, [0, 0, 0.05], C.silver, { finish: 'anodised' }), cyl(0.015, 0.02, [0, 0, 0.11], C.dark), cyl(0.003, 0.03, [0, 0, 0.135], C.silver)], { kind: 'tool', stroke: 0, force: 0, tcp: 0.15 }),
  ee('ee-dispenser', 'Glue dispensing valve DV-1', 'Dispensing tool', 0.4, 'Stainless steel', 'Pneumatic dispensing valve with 22 G needle.',
    [cyl(0.016, 0.07, [0, 0, 0.035], C.silver), cone(0.006, 0.0006, 0.03, [0, 0, 0.085], C.silver)], { kind: 'tool', stroke: 0, force: 0, tcp: 0.1 }),
  item('ee-toolchanger', 'Automatic tool changer TC-40', 'End-effectors', 'Tool changer', 0.35, 'Hardened steel, pneumatic piston', 'Pneumatic quick-change coupling (robot side + tool side) with 6 pass-through signals.',
    [cyl(0.032, 0.012, [0, 0, 0.006], C.silver), cyl(0.03, 0.012, [0, 0, 0.018], C.dark)], [IN('TF-40', 'Robot side'), port('tool', 'Tool side ISO 9409-1-40', 'TF-40', 'out', [0, 0, 0.024])]),
  item('ee-compliance', 'Compliance unit CU-40', 'End-effectors', 'Compliance device', 0.28, 'Aluminium, springs', 'Spring-loaded X-Y-Z compliance for insertion tasks (±3 mm).',
    [cyl(0.032, 0.008, [0, 0, 0.004], C.silver), { kind: 'spring', dims: [0.022, 0.0012, 0.015, 4], pos: [0, 0, 0.0155], color: C.silver, finish: 'metal' }, cyl(0.032, 0.008, [0, 0, 0.027], C.silver)],
    [IN('TF-40', 'Robot side'), port('tool', 'Tool side ISO 9409-1-40', 'TF-40', 'out', [0, 0, 0.031])]),
  item('ee-adapter-m', 'Tool adapter FL-M → ISO 9409-1-40', 'End-effectors', 'Tool adapter', 0.15, 'Aluminium 7075', 'Tool flange on an M-size joint output (5-DOF arms, SCARA).',
    [cone(0.045, 0.032, 0.02, [0, 0, 0.01], C.dark)], [IN('FL-M'), port('tool', 'Tool flange ISO 9409-1-40', 'TF-40', 'out', [0, 0, 0.02])]),
  item('ee-adapter-l', 'Tool adapter FL-L → ISO 9409-1-40', 'End-effectors', 'Tool adapter', 0.25, 'Aluminium 7075', 'Tool flange on an L-size joint output.',
    [cone(0.06, 0.032, 0.025, [0, 0, 0.0125], C.dark)], [IN('FL-L'), port('tool', 'Tool flange ISO 9409-1-40', 'TF-40', 'out', [0, 0, 0.025])]),
  item('ee-servo-gripper', 'Servo claw gripper (desktop)', 'End-effectors', 'Parallel gripper', 0.08, 'Aluminium sheet, micro servo',
    'Claw for desktop servo arms: 50 mm opening, 15 N, mounted on a servo horn (25T).',
    [rbox([0.04, 0.025, 0.02], 0.003, [0, 0, 0.01], C.black, { finish: 'plastic' }), box([0.006, 0.02, 0.05], [0, 0, 0.045], C.silver, { finger: -1, finish: 'metal' }), box([0.006, 0.02, 0.05], [0, 0, 0.045], C.silver, { finger: 1, finish: 'metal' })],
    [IN('HORN-25T', 'Horn screws (25T spline)')], { gripper: { kind: 'parallel', stroke: 0.05, force: 15, tcp: 0.06 }, role: 'End effector' }),
);

// ---------------------------------------------------------------- ELECTRONICS
const elecItem = (id: string, name: string, sub: string, mass: number, desc: string, shapes: Shape[], elec?: CatalogItem['elec'], x: Partial<CatalogItem> = {}) =>
  item(id, name, 'Electronics', sub, mass, 'Electronic assembly', desc, shapes, [IN('EBAY', 'Bay / DIN mount')], { elec, ...x });
add(
  elecItem('elec-uno', 'Arduino Uno–class board (ATmega328P)', 'Microcontroller', 0.025, '8-bit AVR, 16 MHz, 14 digital I/O (6 PWM), 6 analogue inputs. Adequate for hobby-servo arms with control loops up to ~200 Hz.',
    board(0.0686, 0.0534, C.pcbBlue, [chip(0.035, 0.0075, 0.004, 0.005, -0.012), header(10, 0.03, 0.02, 'x'), header(8, -0.005, 0.024, 'x'), header(6, 0.015, -0.024, 'x'), box([0.016, 0.012, 0.011], [-0.03, 0.012, 0.0055], C.silver, { finish: 'metal' }), box([0.013, 0.009, 0.011], [-0.03, -0.017, 0.0055], C.chip, { finish: 'plastic' })]),
    { kind: 'controller', rate_hz: 200, channels: 6 }),
  elecItem('elec-esp32', 'ESP32 DevKit–class board (dual-core, Wi-Fi/BLE)', 'Microcontroller', 0.01, '240 MHz dual-core, Wi-Fi + Bluetooth, 16 PWM channels; control loops up to ~1 kHz.',
    board(0.052, 0.028, C.pcbBlack, [box([0.018, 0.025, 0.003], [0.012, 0, 0.0015], C.silver, { finish: 'metal' }), header(15, -0.002, 0.012, 'x'), header(15, -0.002, -0.012, 'x'), usb(-0.024, 0)]),
    { kind: 'controller', rate_hz: 1000, channels: 16 }),
  elecItem('elec-stm32', 'STM32 Nucleo–class board (Cortex-M4/M7)', 'Microcontroller', 0.04, 'Arm Cortex-M7 at 480 MHz, FPU, CAN-FD, timers for encoders; deterministic loops up to 4 kHz.',
    board(0.07, 0.133, C.pcbBlack, [chip(0.014, 0.014, 0.0015, 0, 0.01), header(19, -0.03, 0, 'y'), header(19, 0.03, 0, 'y'), usb(0, 0.06), box([0.012, 0.012, 0.004], [0, -0.045, 0.002], C.chip)]),
    { kind: 'controller', rate_hz: 4000, channels: 8 }),
  elecItem('elec-rpi', 'Raspberry Pi 5–class single-board computer', 'Single-board computer', 0.05, 'Quad-core Arm Cortex-A76 Linux SBC for ROS 2 nodes and vision; soft real-time joint loops ≈500 Hz.',
    board(0.085, 0.056, C.pcbBlack ? '#1b7a49' : C.pcb, [box([0.014, 0.014, 0.0016], [-0.01, 0, 0.0008], C.silver, { finish: 'metal' }), box([0.017, 0.013, 0.016], [0.034, 0.018, 0.008], C.silver, { finish: 'metal' }), box([0.017, 0.013, 0.016], [0.034, -0.002, 0.008], C.silver, { finish: 'metal' }), box([0.021, 0.016, 0.0135], [0.034, -0.02, 0.007], C.silver, { finish: 'metal' }), header(20, -0.01, 0.024, 'x'), { kind: 'fins', dims: [0.03, 0.03, 0.002, 0.006, 8], pos: [-0.015, -0.005, 0.004], color: C.silver, finish: 'anodised' }]),
    { kind: 'controller', rate_hz: 500, channels: 8 }),
  elecItem('elec-jetson', 'Jetson Orin Nano–class AI computer', 'Embedded AI computer', 0.18, 'GPU-accelerated module for perception and learning policies (CUDA, TensorRT); joint loops ≈1 kHz via its MCU co-processor.',
    board(0.1, 0.079, C.pcbBlack, [{ kind: 'fins', dims: [0.07, 0.06, 0.004, 0.018, 14], pos: [0, 0, 0.012], color: C.black, finish: 'anodised' }, cyl(0.018, 0.01, [0, 0, 0.026], C.chip, { finish: 'plastic' }), box([0.016, 0.014, 0.014], [0.042, 0.02, 0.007], C.silver, { finish: 'metal' }), box([0.016, 0.014, 0.014], [0.042, -0.01, 0.007], C.silver, { finish: 'metal' })]),
    { kind: 'controller', rate_hz: 1000, channels: 8 }),
  elecItem('elec-pwm16', '16-channel PWM servo driver (12-bit, I²C)', 'Servo driver', 0.01, '16 servo outputs, 5–6 V servo rail, 3 A per bank. For hobby servos only (6 V).',
    board(0.062, 0.025, C.pcbBlue, [chip(0.009, 0.006, 0.0015, 0, 0), ...[0, 1, 2, 3].map((k) => header(3, -0.025 + k * 0.006, -0.008, 'y')), box([0.008, 0.008, 0.008], [0.026, 0.006, 0.004], C.blue, { finish: 'plastic' })]),
    { kind: 'driver', channels: 16, I_cont: 1.5, I_peak: 3, V_max: 6.5 }),
  elecItem('elec-servo-bus', 'Servo controller 6-ch (serial bus, 8.4 V)', 'Servo controller', 0.02, 'Six servo channels with current monitoring, 7.4–8.4 V, 4 A per channel peak.',
    board(0.05, 0.04, C.pcbBlack, [chip(0.007, 0.007, 0.001, 0, 0), header(6, 0.02, 0, 'y'), header(6, -0.02, 0, 'y')]),
    { kind: 'driver', channels: 6, I_cont: 2, I_peak: 4, V_max: 8.4 }),
  elecItem('elec-hbridge2', 'Dual H-bridge motor driver (2 A, 35 V)', 'DC motor driver', 0.03, 'Two brushed-DC channels, 2 A continuous / 3 A peak, 5–35 V.',
    board(0.043, 0.043, C.red, [{ kind: 'fins', dims: [0.024, 0.016, 0.003, 0.02, 7], pos: [0, 0.008, 0.011], color: C.black, finish: 'anodised' }, ...[-0.015, 0.015].map((x) => box([0.008, 0.008, 0.01], [x, -0.015, 0.005], C.blue, { finish: 'plastic' } as SX))]),
    { kind: 'driver', channels: 2, I_cont: 2, I_peak: 3, V_max: 35 }),
  elecItem('elec-stepdrv', 'Stepper driver (2-phase, 4.5 A, 50 V)', 'Stepper driver', 0.3, 'Microstepping driver for NEMA 17/23/34 steppers; one axis.',
    [rbox([0.03, 0.118, 0.076], 0.003, [0, 0, 0.038], C.black, { finish: 'anodised' }), { kind: 'fins', dims: [0.03, 0.118, 0.002, 0.012, 6], pos: [0.021, 0, 0.038], rot: [0, 90, 0], color: C.black, finish: 'anodised' }, box([0.005, 0.06, 0.008], [-0.017, 0, 0.06], C.green, { finish: 'plastic' })],
    { kind: 'driver', channels: 1, I_cont: 4.5, I_peak: 4.5, V_max: 50 }),
  elecItem('elec-driver6-hp', 'Six-axis servo drive DRV-6H (60 A peak)', 'Servo drive', 2.4, 'High-power six-axis FOC drive for 750 W servos: 30 A continuous / 60 A peak per axis, 60 V.',
    [rbox([0.09, 0.11, 0.06], 0.004, [0, 0, 0.03], C.blue), { kind: 'fins', dims: [0.09, 0.11, 0.004, 0.03, 14], pos: [0, 0, 0.077], color: C.silver, finish: 'anodised' }],
    { kind: 'driver', channels: 6, I_cont: 30, I_peak: 60, V_max: 60 }),
  elecItem('elec-psu-6v', 'DC power supply 6 V 10 A (servo rail)', 'Power supply', 0.4, 'Switched-mode 6 V, 10 A supply for hobby-servo robots.',
    [rbox([0.06, 0.11, 0.035], 0.003, [0, 0, 0.0175], C.silver, { finish: 'metal' }), box([0.01, 0.05, 0.01], [0.028, 0, 0.03], C.chip, { finish: 'plastic' })], { kind: 'psu', V_nom: 6, I_max: 10 }),
  elecItem('elec-psu-24', 'DC power supply 24 V 15 A', 'Power supply', 0.9, 'Switched-mode 24 V, 15 A (360 W) for stepper and 24 V systems.',
    [rbox([0.07, 0.12, 0.05], 0.003, [0, 0, 0.025], C.silver, { finish: 'metal' })], { kind: 'psu', V_nom: 24, I_max: 15 }),
  elecItem('elec-battery-24', 'LiFePO₄ battery pack 25.6 V 20 Ah', 'Battery', 4.2, '8S LiFePO₄, 25.6 V, 20 Ah, 40 mΩ, BMS included – long cycle life for mobile robots.',
    [rbox([0.09, 0.15, 0.1], 0.006, [0, 0, 0.05], C.blue, { finish: 'plastic' }), cyl(0.006, 0.01, [0.02, 0.05, 0.105], C.red), cyl(0.006, 0.01, [-0.02, 0.05, 0.105], C.chip)], { kind: 'battery', V_nom: 25.6, capacity_Ah: 20, R_int: 0.04 }),
  elecItem('elec-can', 'CAN-FD transceiver module', 'Communication', 0.006, 'Isolated CAN-FD transceiver (5 Mbit/s) for joint drives.', board(0.03, 0.02, C.pcbBlue, [chip(0.005, 0.004, 0.0015, 0, 0), box([0.01, 0.008, 0.008], [0.01, 0, 0.004], C.green, { finish: 'plastic' })])),
  elecItem('elec-rs485', 'RS-485 / Modbus module', 'Communication', 0.006, 'Half-duplex RS-485 transceiver for sensors and grippers.', board(0.03, 0.02, C.pcbBlue, [chip(0.005, 0.004, 0.0015, 0, 0)])),
  elecItem('elec-wifi', 'Wi-Fi / BLE communication module', 'Communication', 0.004, '2.4 GHz Wi-Fi + BLE 5 module with PCB antenna.', board(0.025, 0.018, C.pcbBlack, [box([0.016, 0.012, 0.0025], [0, 0.002, 0.00125], C.silver, { finish: 'metal' })])),
  elecItem('elec-ethsw', 'Industrial Ethernet switch (5-port)', 'Communication', 0.25, 'Unmanaged 5-port switch for EtherCAT/ROS 2 networks.', [rbox([0.03, 0.1, 0.08], 0.003, [0, 0, 0.04], C.dark), ...[0, 1, 2, 3, 4].map((k) => box([0.004, 0.014, 0.012], [0.016, -0.035 + k * 0.0175, 0.05], C.silver, { finish: 'metal' } as SX))]),
  elecItem('elec-dcdc', 'DC-DC converter 48 → 12 V 10 A', 'Power conversion', 0.18, 'Isolated buck converter for logic, sensors and fans.', [rbox([0.05, 0.08, 0.025], 0.003, [0, 0, 0.0125], C.silver, { finish: 'metal' }), { kind: 'fins', dims: [0.05, 0.08, 0.002, 0.01, 8], pos: [0, 0, 0.031], color: C.silver, finish: 'anodised' }]),
  elecItem('elec-bms13', 'Battery management system 13S (60 A)', 'Battery management', 0.08, 'Cell balancing, over/under-voltage, over-current and temperature protection for 13S Li-ion packs.', board(0.07, 0.05, C.pcbBlue, [...[0, 1, 2, 3].map((k) => box([0.006, 0.01, 0.008], [-0.02 + k * 0.012, 0.012, 0.004], C.chip)), { kind: 'fins', dims: [0.04, 0.02, 0.002, 0.008, 6], pos: [0, -0.012, 0.005], color: C.silver, finish: 'anodised' }])),
  elecItem('elec-pdb', 'Power distribution board (48 V, 8 outputs)', 'Power distribution', 0.12, 'Fused distribution of the 48 V bus to drives, controller and accessories.', board(0.08, 0.06, C.pcbBlack, [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => box([0.006, 0.01, 0.008], [-0.03 + (k % 4) * 0.02, k < 4 ? 0.015 : -0.015, 0.004], k % 2 ? C.red : C.yellow, { finish: 'plastic' } as SX))])),
  elecItem('elec-relay', 'Relay module 4-channel', 'I/O', 0.06, 'Four 10 A relays for grippers, valves and lamps.', board(0.075, 0.055, C.pcbBlue, [...[0, 1, 2, 3].map((k) => rbox([0.015, 0.019, 0.015], 0.001, [-0.026 + k * 0.0175, 0.008, 0.0075], C.blue, { finish: 'plastic' } as SX))])),
  elecItem('elec-valve-island', 'Pneumatic valve island (4 × 5/2)', 'Pneumatics', 0.7, 'Four solenoid valves for grippers and cylinders.', [rbox([0.04, 0.12, 0.05], 0.003, [0, 0, 0.025], C.silver, { finish: 'anodised' }), ...[0, 1, 2, 3].map((k) => rbox([0.03, 0.022, 0.03], 0.003, [0, -0.04 + k * 0.027, 0.065], C.chip, { finish: 'plastic' } as SX))], undefined, { libraryOnly: LIB_ONLY }),
  item('elec-estop', 'Emergency-stop push button (Ø40, latching)', 'Electronics', 'Safety', 0.12, 'Polyamide, NC contacts', 'Red mushroom E-stop with two NC contacts on a yellow housing (ISO 13850).',
    [rbox([0.07, 0.07, 0.06], 0.006, [0, 0, 0.03], C.yellow, { finish: 'plastic' }), cyl(0.012, 0.012, [0, 0, 0.066], C.red, { finish: 'plastic' }), cyl(0.02, 0.012, [0, 0, 0.078], C.red, { finish: 'plastic' })], [IN('ACC')]),
);

// fix colour of the Pi board above (kept simple: green PCB)
for (const it of CATALOG_EXT) if (it.id === 'elec-rpi') for (const s of it.shapes) if (s.kind === 'rbox' && s.finish === 'pcb') s.color = '#1b7a49';
