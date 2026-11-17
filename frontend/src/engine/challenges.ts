// Challenge-based assembly: target specifications with automatic assessment.

import type { Issue, RobotModel } from './robotModel';
import type { SimResult } from './simulate';
import { ik } from './kinematics';
import { sizingCheck } from './dynamics';
import type { V3 } from './math';

export interface Criterion { text: string; pass: boolean; detail: string }
export interface Challenge {
  id: string;
  title: string;
  brief: string;
  targets: string[];
  hint: string;
  assess: (model: RobotModel | undefined, issues: Issue[], result: SimResult | null, payload: number, scenarioKind: string) => Criterion[];
}

const common = (model: RobotModel | undefined, issues: Issue[], dof: number): Criterion[] => [
  { text: `Serial arm with exactly ${dof} actuated joints`, pass: model?.n === dof, detail: `${model?.n ?? 0} DOF` },
  { text: 'No assembly errors, no unconnected parts', pass: !issues.some((i) => i.level === 'error' || i.level === 'warn'), detail: `${issues.filter((i) => i.level !== 'ok' && i.level !== 'info').length} open issue(s)` },
  { text: 'Controller, driver and power source installed', pass: !!(model?.controller && model?.driver && model?.power), detail: [model?.controller ? 'controller' : '', model?.driver ? 'driver' : '', model?.power ? 'power' : ''].filter(Boolean).join(', ') || 'none' },
];

const simErrors = (r: SimResult | null) => (r ? r.events.filter((e) => e.level === 'error').length : -1);

export const CHALLENGES: Challenge[] = [
  {
    id: 'arm6-payload',
    title: 'Challenge 1 – 6-DOF arm, 2 kg pick-and-place',
    brief: 'Build a six-axis industrial arm with a gripper that moves a 2 kg part through the standard pick-and-place cycle accurately.',
    targets: ['6 DOF, gripper installed', 'Payload ≥ 2 kg', 'TCP tracking RMSE < 5 mm', 'No error events (limits, overload, collisions)'],
    hint: 'Check the gripper force against the payload and use gravity compensation or computed-torque control.',
    assess: (m, issues, r, payload, kind) => [
      ...common(m, issues, 6),
      { text: 'Gripper installed', pass: !!m?.gripper, detail: m?.gripper ? m.gripper.kind : 'none' },
      { text: 'Pick-and-place simulated with payload ≥ 2 kg', pass: !!r?.ok && kind === 'pickplace' && payload >= 2, detail: r?.ok ? `${payload} kg, ${kind}` : 'not simulated yet' },
      { text: 'TCP tracking RMSE < 5 mm', pass: !!r?.ok && r.metrics.eeRmseMm < 5, detail: r?.ok ? `${r.metrics.eeRmseMm.toFixed(2)} mm` : '—' },
      { text: 'No error events and no gripper warnings', pass: !!r?.ok && simErrors(r) === 0 && !r.events.some((e) => /Gripper|Vacuum/.test(e.text)), detail: r?.ok ? `${simErrors(r)} error(s)` : '—' },
    ],
  },
  {
    id: 'arm6-energy',
    title: 'Challenge 2 – Energy-efficient arm',
    brief: 'Complete the 1 kg pick-and-place cycle on battery power with less than 170 J of electrical energy and a cycle time under 8 s.',
    targets: ['6 DOF on battery power', 'Payload ≥ 1 kg', 'Energy < 170 J', 'Cycle time < 8 s', 'TCP RMSE < 10 mm'],
    hint: 'Energy here is dominated by holding torque and 12 W logic power integrated over the cycle: shorten the gripper dwell and approach height, choose a speed that shortens the cycle without gearbox overload, and use lighter links.',
    assess: (m, issues, r, payload, kind) => [
      ...common(m, issues, 6),
      { text: 'Powered by the battery', pass: m?.power?.kind === 'battery', detail: m?.power?.kind ?? 'none' },
      { text: 'Pick-and-place with payload ≥ 1 kg', pass: !!r?.ok && kind === 'pickplace' && payload >= 1, detail: r?.ok ? `${payload} kg` : 'not simulated yet' },
      { text: 'Electrical energy < 170 J', pass: !!r?.ok && r.metrics.energyJ < 170, detail: r?.ok ? `${r.metrics.energyJ.toFixed(1)} J` : '—' },
      { text: 'Cycle time < 8 s', pass: !!r?.ok && r.metrics.cycleTime < 8, detail: r?.ok ? `${r.metrics.cycleTime.toFixed(2)} s` : '—' },
      { text: 'TCP RMSE < 10 mm, no error events', pass: !!r?.ok && r.metrics.eeRmseMm < 10 && simErrors(r) === 0, detail: r?.ok ? `${r.metrics.eeRmseMm.toFixed(2)} mm` : '—' },
    ],
  },
  {
    id: 'arm3-reach',
    title: 'Challenge 3 – 3-DOF positioning arm',
    brief: 'Build a three-axis positioning arm (waist, shoulder, elbow) whose tool point can reach P = (0.45, 0.20, 0.55) m, with every joint correctly sized.',
    targets: ['Exactly 3 DOF', 'P reachable (IK, position)', 'All joints pass the static sizing check', 'Point-to-point move simulated without errors'],
    hint: 'Stop after the forearm – its free wrist mount becomes the tool point. Use the “Move to IK target” scenario.',
    assess: (m, issues, r, _p, kind) => {
      const P: V3 = [0.45, 0.2, 0.55];
      const reach = m && m.n === 3 ? ik(m, { p: P }, [0, 0.3, -0.3]) : undefined;
      const sizing = m && m.n ? sizingCheck(m) : [];
      return [
        ...common(m, issues, 3),
        { text: 'P = (0.45, 0.20, 0.55) m reachable', pass: !!reach?.ok, detail: reach ? `error ${(reach.posErr * 1000).toFixed(1)} mm` : '—' },
        { text: 'All joints pass the sizing check', pass: sizing.length > 0 && sizing.every((s) => s.status !== 'error'), detail: sizing.map((s) => `${s.joint}:${s.status}`).join(' ') || '—' },
        { text: 'Point-to-point move simulated without errors', pass: !!r?.ok && kind === 'move' && simErrors(r) === 0, detail: r?.ok ? `${kind}, ${simErrors(r)} error(s)` : 'not simulated yet' },
      ];
    },
  },
];
