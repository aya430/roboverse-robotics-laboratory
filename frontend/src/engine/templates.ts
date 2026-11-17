// Robot reference architectures (templates). Each template is an ordered list of assembly steps, so the same
// data drives "open template", the guided assembly mode and automated tests.
// These are original educational reference designs, not reproductions of commercial robots.

import { ARM6_STEPS, addRoot, attachNew, emptyAssembly, type Assembly, type GuidedStep } from './assembly';
import type { V3 } from './math';

export interface RobotTemplate {
  id: string;
  name: string;
  family: string;
  description: string;
  steps: GuidedStep[];
  /** default task for the simulation lab */
  task: { pick: V3; place: V3; approach: number; payload: number; home?: number[] };
}

const ELEC = (ctrl: string[], drv: string[], pwr: string[]): GuidedStep[] => [
  { title: 'Install the controller', items: ctrl, parent: 0, port: 'bay1', explain: 'The controller closes the joint loops at its sampling rate.' },
  { title: 'Install the motor driver', items: drv, parent: 0, port: 'bay2', explain: 'One driver channel per joint, with enough current and voltage for the motors.' },
  { title: 'Install the power source', items: pwr, parent: 0, port: 'bay3', explain: 'Bus voltage must match the motors and be within the driver rating.' },
];

export const TEMPLATES: RobotTemplate[] = [
  {
    id: 'arm6', name: '6-DOF industrial arm', family: 'Articulated arm (6R)',
    description: 'Six revolute joints built from separate motors, harmonic drives and links – the reference build used in Guided mode.',
    steps: ARM6_STEPS,
    task: { pick: [0.45, 0.25, 0.25], place: [0.3, -0.35, 0.25], approach: 0.12, payload: 1 },
  },
  {
    id: 'cobot5', name: '5-DOF modular arm (integrated actuators)', family: 'Articulated arm (5R)',
    description: 'Collaborative-style arm made from integrated joint modules (motor + strain-wave gear in one part), carbon upper arm and a three-finger adaptive gripper.',
    steps: [
      { title: 'Place the robot base', items: ['base-pedestal'], parent: null, explain: 'Fixed root.' },
      ...ELEC(['elec-controller', 'elec-stm32'], ['elec-driver6'], ['elec-battery', 'elec-psu']),
      { title: 'J1 joint module', items: ['rj-90'], parent: 0, port: 'j1', explain: 'An integrated actuator replaces motor + gearbox: one part, one joint.' },
      { title: 'Shoulder turret', items: ['link-turret'], parent: 4, port: 'output', explain: 'Turns the next axis horizontal.' },
      { title: 'J2 joint module', items: ['rj-90', 'rj-cyc-110'], parent: 5, port: 'j2', explain: 'The shoulder carries the largest gravity torque.' },
      { title: 'Upper arm (carbon)', items: ['link-upper-cf', 'link-upper-al'], parent: 6, port: 'output', explain: 'A lighter link lowers every proximal torque.' },
      { title: 'J3 joint module', items: ['rj-70'], parent: 7, port: 'j3', explain: 'Elbow.' },
      { title: 'Forearm', items: ['link-forearm'], parent: 8, port: 'output', explain: 'Carries the wrist-roll module.' },
      { title: 'J4 joint module', items: ['rj-50'], parent: 9, port: 'j4', explain: 'Wrist roll.' },
      { title: 'Wrist pitch bracket', items: ['link-wrist-pitch'], parent: 10, port: 'output', explain: 'Turns the axis 90° for J5.' },
      { title: 'J5 joint module', items: ['rj-50'], parent: 11, port: 'j5', explain: 'Wrist pitch – a 5-DOF arm cannot set all three tool rotations.' },
      { title: 'Tool adapter', items: ['ee-adapter'], parent: 12, port: 'output', explain: 'ISO 9409-1-40 tool flange.' },
      { title: 'Three-finger adaptive gripper', items: ['ee-gripper3', 'ee-gripper2'], parent: 13, port: 'tool', explain: 'Encloses round parts.' },
    ],
    task: { pick: [0.5, 0.15, 0.25], place: [0.35, -0.35, 0.25], approach: 0.1, payload: 0.5 },
  },
  {
    id: 'scara', name: 'SCARA robot (RRPR)', family: 'SCARA',
    description: 'Selective-compliance arm: two parallel vertical revolute joints, a ball-screw spline Z axis (prismatic) and a tool-roll joint – fast planar pick-and-place.',
    steps: [
      { title: 'Place the SCARA column', items: ['base-scara'], parent: null, explain: 'J1 sits on top of the column at 500 mm.' },
      ...ELEC(['elec-controller'], ['elec-driver6'], ['elec-psu', 'elec-battery']),
      { title: 'J1 joint module (vertical axis)', items: ['rj-90'], parent: 0, port: 'j1', explain: 'All SCARA rotary axes are vertical, so gravity does not load J1, J2 or J4.' },
      { title: 'Inner arm 250 mm', items: ['scara-arm-inner'], parent: 4, port: 'output', explain: 'The next axis stays parallel (vertical).' },
      { title: 'J2 joint module', items: ['rj-70'], parent: 5, port: 'out', explain: 'Elbow of the planar 2R arm.' },
      { title: 'Outer arm 200 mm', items: ['scara-arm-outer'], parent: 6, port: 'output', explain: 'Carries the Z axis at its tip.' },
      { title: 'Z axis (ball-screw spline)', items: ['lz-spline-150'], parent: 7, port: 'z', explain: 'A prismatic joint: the quill moves down along the screw. Gravity loads only this axis.' },
      { title: 'J4 tool-roll module', items: ['rj-50'], parent: 8, port: 'quill', explain: 'Rotates the tool about the vertical axis.' },
      { title: 'Tool adapter', items: ['ee-adapter'], parent: 9, port: 'output', explain: 'ISO tool flange.' },
      { title: 'Gripper', items: ['ee-gripper2', 'ee-vacuum'], parent: 10, port: 'tool', explain: 'End effector.' },
    ],
    task: { pick: [0.38, 0.18, 0.15], place: [0.2, -0.32, 0.15], approach: 0.05, payload: 0.5, home: [0, 0, 0.02, 0] },
  },
  {
    id: 'gantry', name: 'Cartesian gantry robot (PPP)', family: 'Cartesian / gantry',
    description: 'Three orthogonal linear axes (ball-screw modules) on a T-slot bridge frame with a vacuum tool – the simplest kinematics (Jacobian = constant).',
    steps: [
      { title: 'Place the gantry frame', items: ['base-gantry'], parent: null, explain: 'Bridge frame of 40×40 T-slot profiles.' },
      ...ELEC(['elec-controller'], ['elec-driver6'], ['elec-psu']),
      { title: 'X axis module (600 mm)', items: ['lm-bs-600', 'lm-belt-1000'], parent: 0, port: 'x', explain: 'The carriage is a prismatic joint; ratio = 2π / lead converts motor torque to axis force.' },
      { title: 'XY cross-plate', items: ['lm-cross-xy'], parent: 4, port: 'carriage', explain: 'Turns the next axis 90° in the horizontal plane.' },
      { title: 'Y axis module (400 mm)', items: ['lm-bs-400'], parent: 5, port: 'out', explain: 'Second prismatic axis.' },
      { title: 'Z adapter (vertical)', items: ['lm-z-adapter'], parent: 6, port: 'carriage', explain: 'Mounts the Z module vertically, travel downwards.' },
      { title: 'Z axis module (400 mm)', items: ['lm-bs-400', 'lm-bs-250'], parent: 7, port: 'out', explain: 'Gravity acts along this axis only.' },
      { title: 'Tool plate', items: ['lm-tool-plate'], parent: 8, port: 'carriage', explain: 'ISO tool flange on the Z carriage.' },
      { title: 'Vacuum gripper', items: ['ee-vacuum', 'ee-vacuum4', 'ee-gripper2'], parent: 9, port: 'tool', explain: 'End effector.' },
    ],
    task: { pick: [0.1, 0.0, 0.25], place: [0.4, -0.1, 0.25], approach: 0.08, payload: 0.5, home: [0.1, 0.1, 0.05] },
  },
  {
    id: 'desktop4', name: 'Desktop servo arm (4-DOF)', family: 'Educational desktop arm',
    description: 'Low-cost arm with hobby servos, aluminium brackets, a microcontroller board, a 16-channel PWM driver and a 6 V supply.',
    steps: [
      { title: 'Place the desktop base', items: ['base-desktop'], parent: null, explain: 'Base with a servo pocket for the waist.' },
      ...ELEC(['elec-uno', 'elec-esp32'], ['elec-pwm16', 'elec-servo-bus'], ['elec-psu-6v']),
      { title: 'Waist servo', items: ['servo-35kg'], parent: 0, port: 'j1', explain: 'The servo horn is the joint output.' },
      { title: 'U-bracket', items: ['srv-u-bracket'], parent: 4, port: 'horn', explain: 'Turns the next servo axis horizontal.' },
      { title: 'Shoulder servo', items: ['servo-35kg'], parent: 5, port: 'out', explain: 'Highest gravity load – use the 35 kg·cm servo.' },
      { title: 'Upper arm bracket 100 mm', items: ['srv-long-u-100'], parent: 6, port: 'horn', explain: 'Parallel next axis.' },
      { title: 'Elbow servo', items: ['servo-35kg', 'servo-20kg'], parent: 7, port: 'out', explain: 'Elbow.' },
      { title: 'Forearm bracket 80 mm', items: ['srv-long-u-80'], parent: 8, port: 'horn', explain: 'Parallel next axis.' },
      { title: 'Wrist servo', items: ['servo-20kg', 'servo-35kg'], parent: 9, port: 'out', explain: 'Wrist pitch.' },
      { title: 'Servo claw gripper', items: ['ee-servo-gripper'], parent: 10, port: 'horn', explain: 'End effector.' },
    ],
    task: { pick: [0.2, 0.15, 0.08], place: [0.15, -0.2, 0.08], approach: 0.04, payload: 0.05, home: [0, 0.3, 0.3, 0.3] },
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export function buildTemplate(id: string, name?: string): Assembly {
  const t = getTemplate(id);
  let a = emptyAssembly(name ?? `${t.name} (template)`);
  const uids: string[] = [];
  for (const s of t.steps) {
    if (s.parent === null) { a = addRoot(a, s.items[0]); uids.push(a.instances[a.instances.length - 1].uid); }
    else { const r = attachNew(a, s.items[0], uids[s.parent], s.port!); a = r.asm; uids.push(r.uid); }
  }
  return a;
}
