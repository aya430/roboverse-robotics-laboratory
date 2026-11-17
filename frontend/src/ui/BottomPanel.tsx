import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { sizingCheck } from '../engine/dynamics';
import { extractDH, sampleWorkspace } from '../engine/kinematics';
import { withPayload, type RobotModel } from '../engine/robotModel';
import { add, scale, tapply } from '../engine/math';
import { fk } from '../engine/kinematics';
import { fmt, Tag } from './common';
import { getItem } from '../engine/catalog';

export function summarize(model: RobotModel) {
  const { frames } = fk(model, new Array(model.n).fill(0));
  let m = model.base.m;
  let c = scale(model.base.c, model.base.m);
  model.joints.forEach((J, i) => { m += J.body.m; c = add(c, scale(tapply(frames[i], J.body.c), J.body.m)); });
  const com = scale(c, 1 / Math.max(m, 1e-9));
  const ws = sampleWorkspace(model, 1500);
  let reach = 0;
  for (let k = 0; k < ws.length; k += 3) reach = Math.max(reach, Math.hypot(ws[k], ws[k + 1]));
  // estimated payload: largest mass for which no joint fails the static sizing check
  let lo = 0, hi = 50;
  if (sizingCheck(model).some((r) => r.status === 'error')) hi = 0;
  for (let it = 0; it < 14 && hi > 0; it++) {
    const mid = (lo + hi) / 2;
    if (sizingCheck(withPayload(model, mid)).some((r) => r.status === 'error')) hi = mid; else lo = mid;
  }
  let contLo = 0, contHi = hi;
  for (let it = 0; it < 14 && contHi > 0; it++) {
    const mid = (contLo + contHi) / 2;
    if (sizingCheck(withPayload(model, mid)).some((r) => r.status !== 'ok')) contHi = mid; else contLo = mid;
  }
  const ratedPower = model.joints.reduce((s, J) => s + (J.motor.T_rated * J.motor.rpm_rated * 2 * Math.PI) / 60, 0);
  return { mass: m, com, reach, payloadPeak: lo, payloadCont: contLo, ratedPower };
}

export function BottomPanel() {
  const { log, issues, model, asm } = useStore();
  const [tab, setTab] = useState<'console' | 'validation' | 'calc'>('console');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, tab]);
  const nErr = issues.filter((i) => i.level === 'error').length, nWarn = issues.filter((i) => i.level === 'warn').length;
  const sum = useMemo(() => (model && model.n ? summarize(model) : null), [model]);
  const sizing = useMemo(() => (model && model.n ? sizingCheck(model) : []), [model]);
  const dh = useMemo(() => (model && model.n ? extractDH(model) : null), [model]);
  const checks = useMemo(() => {
    if (!model) return [];
    const L: { level: string; text: string }[] = [];
    L.push({ level: model.n > 0 ? 'ok' : 'warn', text: `${model.n} actuated revolute joint(s) in a serial chain → ${model.n} DOF${model.gripper ? ' + 1 gripper DOF' : ''}` });
    L.push({ level: model.controller ? 'ok' : 'error', text: model.controller ? `Motion controller installed (${model.controller.rate_hz} Hz max)` : 'Missing motion controller' });
    L.push({ level: model.driver ? ((model.driver.channels ?? 0) >= model.n ? 'ok' : 'error') : 'error', text: model.driver ? `Motor driver: ${model.driver.channels} channels for ${model.n} joints` : 'Missing motor driver' });
    if (model.driver) for (const J of model.joints) if ((model.driver.I_peak ?? 0) < J.motor.I_peak) L.push({ level: 'warn', text: `${J.name}: driver peak current ${model.driver.I_peak} A < motor peak ${J.motor.I_peak} A – available torque limited to ${fmt((model.driver.I_peak! / J.motor.I_peak) * 100, 0)} %` });
    L.push({ level: model.power ? 'ok' : 'error', text: model.power ? `Power source: ${model.power.kind === 'battery' ? `battery ${model.power.V_nom} V ${model.power.capacity_Ah} Ah (${fmt((model.power.V_nom ?? 0) * (model.power.capacity_Ah ?? 0), 0)} Wh)` : `PSU ${model.power.V_nom} V ${model.power.I_max} A`}` : 'Missing power source' });
    for (const J of model.joints) if (model.power && (model.power.V_nom ?? 48) > J.motor.V_nom * 1.1) L.push({ level: 'warn', text: `${J.name}: bus voltage exceeds motor rating` });
    L.push({ level: model.gripper ? 'ok' : 'info', text: model.gripper ? `End effector: ${getItem(asm.instances.find((i) => i.uid === model.gripper!.uid)!.item).name}` : 'No end effector – TCP is the outermost free interface' });
    for (const r of sizing) if (r.status !== 'ok') L.push({ level: r.status, text: `${r.joint}: static gravity torque ${fmt(r.maxGravity, 1)} N·m vs gearbox rated ${r.gearRated} N·m / motor-limited ${fmt(r.motorLimited, 0)} N·m – ${r.note}` });
    return L;
  }, [model, sizing, asm]);

  return (
    <div className="bottom">
      <div className="tabs">
        <button className={tab === 'console' ? 'on' : ''} onClick={() => setTab('console')}>Engineering console</button>
        <button className={tab === 'validation' ? 'on' : ''} onClick={() => setTab('validation')}>
          Validation {nErr > 0 && <Tag level="error">{nErr}</Tag>} {nWarn > 0 && <Tag level="warn">{nWarn}</Tag>} {nErr + nWarn === 0 && model?.n ? <Tag level="ok">✓</Tag> : null}
        </button>
        <button className={tab === 'calc' ? 'on' : ''} onClick={() => setTab('calc')}>Engineering calculations</button>
        <div style={{ flex: 1 }} />
        {sum && <div className="small muted mono" style={{ alignSelf: 'center', paddingRight: 12 }}>
          {model!.n} DOF · {fmt(sum.mass, 2)} kg · COM ({sum.com.map((v) => fmt(v, 3)).join(', ')}) m · reach {fmt(sum.reach, 2)} m · payload ≈ {fmt(sum.payloadCont, 1)} kg (20 % margin) / {fmt(sum.payloadPeak, 1)} kg static max
        </div>}
      </div>
      <div className="panel-b" ref={logRef} style={{ padding: '6px 12px' }}>
        {tab === 'console' && (
          <div className="log">
            {log.map((l, i) => <div key={i} className="l"><span className="tm">{l.t}</span><span className={`lv-${l.level}`}>{l.level.toUpperCase().padEnd(5)}</span><span>{l.text}</span></div>)}
          </div>
        )}
        {tab === 'validation' && (
          <div className="grid2" style={{ gap: 18 }}>
            <div>
              <div className="sect" style={{ marginTop: 2 }}>Assembly checks</div>
              {checks.map((c, i) => <div key={i} className="small" style={{ padding: '2px 0' }}><Tag level={c.level}>{c.level}</Tag> {c.text}</div>)}
              {issues.map((c, i) => <div key={'i' + i} className="small" style={{ padding: '2px 0', cursor: c.uid ? 'pointer' : 'default' }} onClick={() => c.uid && useStore.getState().select(c.uid)}><Tag level={c.level}>{c.level}</Tag> {c.text}</div>)}
              {!model && <div className="small">{issues[0]?.text}</div>}
            </div>
            <div className="muted small" style={{ lineHeight: 1.6 }}>
              <div className="sect" style={{ marginTop: 2 }}>What is checked</div>
              Connections are accepted only when the mating interface codes match exactly (bolt pattern, spigot, shaft diameter, flange PCD) – two parts touching visually is never enough.
              The chain from the base is traced to build the kinematic tree; each gearbox output defines a revolute joint and must be driven by a motor.
              Electronics are checked for presence, channel count and current capability. Gravity torques are evaluated over a grid of shoulder/elbow/wrist poses
              (recursive Newton–Euler) and compared with gearbox ratings and motor-limited torque T<sub>peak</sub>·N·η. Collision clearance is checked during simulation (ground plane, joint housings).
            </div>
          </div>
        )}
        {tab === 'calc' && model && model.n > 0 && (
          <div className="grid3" style={{ gap: 16, alignItems: 'start' }}>
            <div>
              <div className="sect" style={{ marginTop: 2 }}>Static sizing (worst-case gravity)</div>
              <table className="t"><thead><tr><th>Joint</th><th>|τ_g| max</th><th>Gear rated</th><th>Motor-lim.</th><th /></tr></thead><tbody>
                {sizing.map((r) => <tr key={r.joint}><td>{r.joint}</td><td className="n">{fmt(r.maxGravity, 1)}</td><td className="n">{r.gearRated}</td><td className="n">{fmt(r.motorLimited, 0)}</td><td><Tag level={r.status}>{r.status}</Tag></td></tr>)}
              </tbody></table>
              <div className="dim small">N·m (revolute) or N (prismatic) at the joint output; payload 0 kg.</div>
            </div>
            <div>
              <div className="sect" style={{ marginTop: 2 }}>Link mass properties (body frames)</div>
              <table className="t"><thead><tr><th>Body</th><th>m kg</th><th>COM (m)</th><th>Izz kg·m²</th><th>N²Jm</th></tr></thead><tbody>
                <tr><td>base</td><td className="n">{fmt(model.base.m, 2)}</td><td className="n">{model.base.c.map((v) => fmt(v, 3)).join(' ')}</td><td className="n">{fmt(model.base.I[8], 4)}</td><td /></tr>
                {model.joints.map((J) => <tr key={J.name}><td>link {J.index + 1}</td><td className="n">{fmt(J.body.m, 2)}</td><td className="n">{J.body.c.map((v) => fmt(v, 3)).join(' ')}</td><td className="n">{fmt(J.body.I[8], 4)}</td><td className="n">{fmt(J.armature, 3)}</td></tr>)}
              </tbody></table>
            </div>
            <div>
              <div className="sect" style={{ marginTop: 2 }}>Standard DH parameters (derived)</div>
              <table className="t"><thead><tr><th>i</th><th>θ₀ °</th><th>d m</th><th>a m</th><th>α °</th></tr></thead><tbody>
                {dh?.rows.map((r) => <tr key={r.joint}><td>{r.joint}</td><td className="n">{fmt((r.theta0 * 180) / Math.PI, 1)}</td><td className="n">{fmt(r.d, 4)}</td><td className="n">{fmt(r.a, 4)}</td><td className="n">{fmt((r.alpha * 180) / Math.PI, 1)}</td></tr>)}
              </tbody></table>
              {dh ? <div className="dim small">θᵢ = qᵢ + θ₀. Verified against the transform chain in the unit tests.</div> : <div className="dim small">This robot has prismatic joints (dᵢ is the variable); the transform chain is shown in the Kinematics tab instead.</div>}
            </div>
          </div>
        )}
        {tab === 'calc' && (!model || !model.n) && <div className="muted small">Calculations appear once the robot has at least one actuated joint.</div>}
      </div>
    </div>
  );
}
