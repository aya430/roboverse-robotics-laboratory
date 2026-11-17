import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { SceneManager, makeTable, tfToMatrix } from './scene';
import { fk, ik, jacobian, manipulability, sampleWorkspace } from '../engine/kinematics';
import { type ControlMode, type SimConfig, type SimResult } from '../engine/simulate';
import { defaultSim } from '../store';
import { jointUnit } from '../engine/robotModel';
import { getItem } from '../engine/catalog';
import { getTemplate } from '../engine/templates';
import { planPickPlace } from '../engine/trajectory';
import { exportURDF } from '../engine/urdf';
import { reportHTML, toCSV } from '../engine/report';
import { download, fmt, slug, Tag } from './common';
import type { V3 } from '../engine/math';

const D = 180 / Math.PI;

/** Interpolated sample of a recorded signal at simulation time t. */
export function sampleAt(r: SimResult, key: string, t: number) {
  const s = r.signals[key];
  if (!s || !r.t.length) return 0;
  const dt = r.t.length > 1 ? r.t[1] - r.t[0] : 1;
  const x = Math.max(0, Math.min(r.t.length - 1, t / dt));
  const i = Math.floor(x), f = x - i;
  return i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[i];
}

function SimViewport({ ikTarget, showWs }: { ikTarget: V3 | null; showWs: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const sm = useRef<SceneManager | null>(null);
  const extra = useRef(new THREE.Group());
  const box = useRef<THREE.Mesh | null>(null);
  const tcpAxes = useRef<THREE.AxesHelper | null>(null);
  const { asm, model, q, result, playT, sim } = useStore();

  useEffect(() => {
    const m = new SceneManager(host.current!);
    sm.current = m;
    m.scene.add(extra.current);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x2f7bff, roughness: 0.4 }));
    b.castShadow = true;
    box.current = b;
    m.scene.add(b);
    const ax = new THREE.AxesHelper(0.08);
    (ax.material as THREE.Material).depthTest = false;
    ax.renderOrder = 4;
    ax.matrixAutoUpdate = false;
    tcpAxes.current = ax;
    m.scene.add(ax);
    return () => m.dispose();
  }, []);
  useEffect(() => { sm.current?.setAssembly(asm); }, [asm]);
  const pid = useStore((st) => st.projectId);
  useEffect(() => { const m = sm.current; if (!m) return; m.pose({}); m.root.updateMatrixWorld(true); m.frameAll(); }, [pid]);

  // static environment: tables, paths, waypoints, workspace, IK target
  useEffect(() => {
    const g = extra.current;
    g.clear();
    const sc = sim.scenario;
    if (sc.kind === 'pickplace') {
      const top = sc.pick[2] - 0.025;
      g.add(makeTable(sc.pick, top));
      g.add(makeTable(sc.place, sc.place[2] - 0.025, 0.32, 0x3c4a5b));
    }
    if (result?.ok) {
      const mk = (kx: string, ky: string, kz: string, color: number, dashed: boolean) => {
        const pts: THREE.Vector3[] = [];
        const S = result.signals, n = result.t.length, st = Math.max(1, Math.floor(n / 800));
        for (let i = 0; i < n; i += st) pts.push(new THREE.Vector3(S[kx][i], S[ky][i], S[kz][i]));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = dashed ? new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.01, gapSize: 0.008 })) : new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
        if (dashed) line.computeLineDistances();
        g.add(line);
      };
      mk('ee.xref', 'ee.yref', 'ee.zref', 0x8a96a8, true);
      mk('ee.x', 'ee.y', 'ee.z', 0xf2b705, false);
      for (const w of result.traj?.waypoints ?? []) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.008), new THREE.MeshBasicMaterial({ color: 0x2f7bff }));
        s.position.set(...w.p);
        g.add(s);
      }
    }
    if (ikTarget) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.8 }));
      s.position.set(...ikTarget);
      g.add(s);
    }
    if (showWs && model && model.n) {
      const pts = sampleWorkspace(model, 6000, 7);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x4a8dff, size: 0.008, transparent: true, opacity: 0.45 })));
    }
  }, [result, sim.scenario, ikTarget, showWs, model]);

  // pose every change
  useEffect(() => {
    const m = sm.current;
    if (!m || !model) return;
    let qq = q;
    let open: number | undefined;
    if (result?.ok) {
      qq = model.joints.map((J, i) => sampleAt(result, `J${i + 1}.q`, playT) / jointUnit(J).k);
      open = sampleAt(result, 'grip.open', playT) / 1000;
    }
    const qMap: Record<string, number> = {};
    model.joints.forEach((J, i) => { qMap[J.gbUid] = qq[i] ?? 0; });
    m.pose(qMap, 0, open);
    const tcp = fk(model, qq).tcp;
    if (tcpAxes.current) tfToMatrix(tcp, tcpAxes.current.matrix);
    const b = box.current!;
    const sc = sim.scenario;
    b.visible = sc.kind === 'pickplace' && sim.payload > 0;
    if (b.visible && sc.kind === 'pickplace') {
      let p: V3 = sc.pick;
      if (result?.ok) {
        const pl = result.signals['grip.payload'];
        const idx = Math.min(result.t.length - 1, Math.round(playT / (result.t[1] - result.t[0] || 1)));
        let first = -1, last = -1;
        for (let i = 0; i < pl.length; i++) if (pl[i] > 0.5) { if (first < 0) first = i; last = i; }
        if (first >= 0 && idx >= first && idx <= last) p = tcp.p;
        else if (last >= 0 && idx > last) p = [result.signals['ee.x'][last], result.signals['ee.y'][last], result.signals['ee.z'][last]];
      }
      b.position.set(...p);
    }
  }, [q, result, playT, model, sim]);

  return <div className="viewport" ref={host} />;
}

function NumIn({ v, on, step = 0.01, w = '100%' }: { v: number; on: (x: number) => void; step?: number; w?: number | string }) {
  return <input type="number" step={step} defaultValue={v} key={v} style={{ width: w }} onBlur={(e) => { const x = parseFloat(e.target.value); if (!isNaN(x)) on(x); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

export function SimPage() {
  const s = useStore();
  const { model, sim, setSim, result, playT, playing, q, setQ, simBusy, asm, issues } = s;
  const [tab, setTab] = useState<'setup' | 'control' | 'kin'>('setup');
  const [ikT, setIkT] = useState<V3>([0.45, 0.2, 0.4]);
  const [ikMsg, setIkMsg] = useState('');
  const [showWs, setShowWs] = useState(false);
  const [speed, setSpeed] = useState(1);
  const worker = useRef<Worker | null>(null);
  const n = model?.n ?? 0;
  const ctrl = sim.control.kp.length === n ? sim.control : { ...(model ? defaultSim(model, s.template).control : sim.control), mode: sim.control.mode };

  // playback clock
  useEffect(() => {
    if (!playing || !result?.ok) return;
    let raf = 0, last = performance.now();
    const tick = () => {
      const now = performance.now();
      const st = useStore.getState();
      let t = st.playT + ((now - last) / 1000) * speed;
      last = now;
      const T = result.t[result.t.length - 1];
      if (t >= T) { st.setPlay(T, false); return; }
      st.setPlay(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, result, speed]);

  const run = () => {
    if (!model) return;
    const home = Array.from({ length: n }, (_, i) => q[i] ?? 0);
    let scenario = sim.scenario;
    if (scenario.kind === 'move') {
      const tcp = fk(model, home).tcp;
      const r = ik(model, { p: ikT, R: n >= 6 ? tcp.R : undefined }, home);
      if (!r.ok) { s.logMsg('error', `IK target (${ikT.join(', ')}) not reachable: ${r.message}`); setIkMsg(r.message); return; }
      scenario = { ...scenario, target: r.q };
    }
    const cfg: SimConfig = { dt: sim.dt, recordHz: sim.recordHz, payload: sim.payload, friction: sim.friction, home, scenario, control: ctrl };
    worker.current?.terminate();
    const w = new Worker(new URL('../sim.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    s.setSimBusy(0);
    s.logMsg('info', `Simulation started: ${scenario.kind}, ${ctrl.mode} control, dt = ${sim.dt * 1000} ms.`);
    w.onmessage = (e) => {
      if (e.data.type === 'progress') s.setSimBusy(e.data.value);
      else {
        const r: SimResult = e.data.result;
        s.setSimBusy(null);
        s.setResult(r);
        if (r.ok) {
          s.logMsg('ok', `Simulation finished: ${r.metrics.simTime.toFixed(2)} s simulated in ${r.metrics.wallTime.toFixed(2)} s, ${r.metrics.steps} steps. TCP RMSE ${r.metrics.eeRmseMm.toFixed(2)} mm, energy ${r.metrics.energyJ.toFixed(1)} J.`);
          for (const ev of r.events.filter((x) => x.level !== 'info')) s.logMsg(ev.level, `t=${ev.t.toFixed(2)} s · ${ev.text}`);
          s.setPlay(0, true);
        } else s.logMsg('error', `Simulation not started: ${r.error}`);
        w.terminate();
      }
    };
    const labels = Object.fromEntries(asm.instances.map((i) => [i.uid, getItem(i.item).name]));
    w.postMessage({ model, cfg, labels });
  };

  const tcpNow = useMemo(() => (model && n ? fk(model, result?.ok ? model.joints.map((J, i) => sampleAt(result, `J${i + 1}.q`, playT) / jointUnit(J).k) : q) : null), [model, q, result, playT, n]);
  const manip = useMemo(() => (model && n ? manipulability(model, q) : 0), [model, q, n]);
  const J = useMemo(() => (model && n ? jacobian(model, q) : []), [model, q, n]);
  const preview = useMemo(() => {
    if (!model || sim.scenario.kind !== 'pickplace' || n < 3) return null;
    return planPickPlace(model, { home: Array.from({ length: n }, (_, i) => q[i] ?? 0), pick: sim.scenario.pick, place: sim.scenario.place, approach: sim.scenario.approach, speed: sim.scenario.speed, dwell: sim.scenario.dwell });
  }, [model, sim.scenario, q, n]);

  if (!model || n === 0) {
    return (
      <div className="page"><div className="page-in"><div className="card" style={{ maxWidth: 560 }}>
        <h3>No executable robot yet</h3>
        <p className="muted">The simulation runs the robot you assembled. Build a robot with at least one motor + gearbox joint first (or open the 6-DOF template).</p>
        <div className="row"><button className="btn primary" onClick={() => s.setPage('build')}>Go to Build a Robot</button><button className="btn" onClick={() => { s.newProject('arm6'); s.setPage('sim'); }}>Open 6-DOF template</button></div>
        {issues.length > 0 && <div style={{ marginTop: 10 }}>{issues.map((i, k) => <div key={k} className="small"><Tag level={i.level}>{i.level}</Tag> {i.text}</div>)}</div>}
      </div></div></div>
    );
  }

  const sc = sim.scenario;
  const T = result?.ok ? result.t[result.t.length - 1] : 0;
  const errors = issues.filter((i) => i.level === 'error');
  const setScen = (p: any) => setSim({ scenario: { ...sc, ...p } as any });
  const setCtrl = (p: Partial<typeof ctrl>) => setSim({ control: { ...ctrl, ...p } });
  const setGain = (k: 'kp' | 'ki' | 'kd', i: number, v: number) => { const a = ctrl[k].slice(); a[i] = v; setCtrl({ [k]: a } as any); };

  return (
    <div className="sim-layout">
      <div className="panel">
        <div className="tabs">
          <button className={tab === 'setup' ? 'on' : ''} onClick={() => setTab('setup')}>Experiment</button>
          <button className={tab === 'control' ? 'on' : ''} onClick={() => setTab('control')}>Controller</button>
          <button className={tab === 'kin' ? 'on' : ''} onClick={() => setTab('kin')}>Kinematics</button>
        </div>
        <div className="panel-b">
          {tab === 'setup' && <>
            <div className="field"><label>Scenario</label>
              <select value={sc.kind} onChange={(e) => {
                const k = e.target.value;
                if (k === 'pickplace') { const t = getTemplate(s.template).task; setSim({ scenario: { kind: 'pickplace', pick: t.pick, place: t.place, approach: t.approach, speed: 0.6, dwell: 0.5 }, payload: t.payload }); }
                if (k === 'step') setSim({ scenario: { kind: 'step', joint: Math.min(1, n - 1), ampDeg: 5, tStep: 0.2, hold: 1.5 }, payload: 0 });
                if (k === 'move') setSim({ scenario: { kind: 'move', target: [], speed: 0.5 } });
              }}>
                <option value="pickplace" disabled={n < 3}>Pick-and-place (IK){n < 3 ? ' – needs ≥ 3 DOF' : n < 6 ? ' – position only' : ''}</option>
                <option value="step">Joint step response</option>
                <option value="move">Move to IK target</option>
              </select>
            </div>
            {sc.kind === 'pickplace' && <>
              <div className="sect">Task (world frame, m)</div>
              {(['pick', 'place'] as const).map((k) => (
                <div key={k} className="field"><label>{k === 'pick' ? 'Pick position' : 'Place position'}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>{[0, 1, 2].map((a) => <NumIn key={a} v={sc[k][a]} on={(x) => { const p = sc[k].slice() as V3; p[a] = x; setScen({ [k]: p }); }} />)}</div>
                </div>
              ))}
              <div className="field"><label>Approach height (m)</label><NumIn v={sc.approach} on={(x) => setScen({ approach: x })} /></div>
              <div className="field"><label>Speed (fraction of joint v<sub>max</sub>)</label><NumIn v={sc.speed} step={0.05} on={(x) => setScen({ speed: Math.max(0.05, Math.min(1, x)) })} /></div>
              <div className="field"><label>Gripper dwell (s)</label><NumIn v={sc.dwell} step={0.1} on={(x) => setScen({ dwell: x })} /></div>
              {preview?.error && <div className="notice">{preview.error}</div>}
              {preview?.traj && <div className="dim small">Planned: {preview.traj.segments.length} quintic segments, cycle {preview.traj.duration.toFixed(2)} s, all IK targets reachable{n >= 6 ? ' with the start-pose tool orientation' : ' (position-only IK)'}.</div>}
            </>}
            {sc.kind === 'step' && <>
              <div className="field"><label>Joint</label><select value={sc.joint} onChange={(e) => setScen({ joint: +e.target.value })}>{model.joints.map((J, i) => <option key={i} value={i}>{J.name}</option>)}</select></div>
              <div className="field"><label>Step amplitude ({jointUnit(model.joints[sc.joint] ?? model.joints[0]).unit})</label><NumIn v={sc.ampDeg} step={1} on={(x) => setScen({ ampDeg: x })} /></div>
              <div className="field"><label>Step time (s)</label><NumIn v={sc.tStep} on={(x) => setScen({ tStep: x })} /></div>
              <div className="field"><label>Observation window (s)</label><NumIn v={sc.hold} step={0.1} on={(x) => setScen({ hold: x })} /></div>
            </>}
            {sc.kind === 'move' && <>
              <div className="field"><label>IK target (m)</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>{[0, 1, 2].map((a) => <NumIn key={a} v={ikT[a]} on={(x) => { const p = ikT.slice() as V3; p[a] = x; setIkT(p); }} />)}</div></div>
              <div className="field"><label>Speed (fraction)</label><NumIn v={sc.speed} step={0.05} on={(x) => setScen({ speed: x })} /></div>
              <div className="dim small">Start pose = posing sliders (Kinematics tab). {n >= 6 ? 'Tool orientation is kept.' : 'Position-only IK (fewer than 6 DOF).'}</div>
            </>}
            <div className="sect">Load & physics</div>
            <div className="field"><label>Payload mass (kg)</label><NumIn v={sim.payload} step={0.1} on={(x) => setSim({ payload: Math.max(0, x) })} /></div>
            <div className="field"><label>Physics step dt (s)</label><NumIn v={sim.dt} step={0.0001} on={(x) => setSim({ dt: Math.max(0.0001, Math.min(0.002, x)) })} /></div>
            <div className="field"><label>Recording rate (Hz)</label><NumIn v={sim.recordHz} step={10} on={(x) => setSim({ recordHz: Math.max(10, Math.min(2000, x)) })} /></div>
            <div className="field"><label>Joint friction</label><input type="checkbox" checked={sim.friction} onChange={(e) => setSim({ friction: e.target.checked })} /></div>
          </>}
          {tab === 'control' && <>
            <div className="field"><label>Control law</label>
              <select value={ctrl.mode} onChange={(e) => setCtrl({ mode: e.target.value as ControlMode })}>
                <option value="PID">Independent-joint PID</option>
                <option value="PID+G">PID + gravity compensation</option>
                <option value="CTC">Computed-torque control</option>
              </select>
            </div>
            <div className="dim small" style={{ lineHeight: 1.5, margin: '4px 0 8px' }}>
              {ctrl.mode === 'PID' && 'τ = Kp·e + Ki∫e + Kd·ė (derivative on measured velocity, ZOH at Ts).'}
              {ctrl.mode === 'PID+G' && 'τ = Kp·e + Ki∫e + Kd·ė + G(q) — gravity torque from the robot model.'}
              {ctrl.mode === 'CTC' && 'τ = M(q)(q̈_ref + Kd·ė + Kp·e) + C q̇ + G + F — Kp = ωn², Kd = 2ζωn (model-based linearisation).'}
            </div>
            {ctrl.mode === 'CTC' && <>
              <div className="field"><label>ωn (rad/s)</label><NumIn v={ctrl.ctcWn} step={1} on={(x) => setCtrl({ ctcWn: x })} /></div>
              <div className="field"><label>ζ</label><NumIn v={ctrl.ctcZeta} step={0.05} on={(x) => setCtrl({ ctcZeta: x })} /></div>
            </>}
            <div className="sect">{ctrl.mode === 'CTC' ? 'Integral action (Ki/Kp ratio used)' : 'Joint gains'}</div>
            <div className="gains">
              <span /><span className="dim">Kp</span><span className="dim">Ki</span><span className="dim">Kd</span>
              {model.joints.map((Jm, i) => (
                <FragmentRow key={i} name={Jm.name} kp={ctrl.kp[i]} ki={ctrl.ki[i]} kd={ctrl.kd[i]} on={(k, v) => setGain(k, i, v)} />
              ))}
            </div>
            <div className="dim small" style={{ marginTop: 4 }}>Units (joint side): revolute N·m/rad, N·m/(rad·s), N·m·s/rad; prismatic N/m, N/(m·s), N·s/m.</div>
            <div className="sect">Sampling & loops</div>
            <div className="field"><label>Controller period Ts (s)</label><NumIn v={ctrl.Ts} step={0.0005} on={(x) => setCtrl({ Ts: x })} /></div>
            <div className="field"><label>Current-loop bandwidth (Hz)</label><NumIn v={ctrl.currentBw} step={100} on={(x) => setCtrl({ currentBw: x })} /></div>
            <div className="field"><label>Velocity filter (Hz)</label><NumIn v={ctrl.velFilterHz} step={10} on={(x) => setCtrl({ velFilterHz: x })} /></div>
            <button className="btn sm" onClick={() => setSim({ control: defaultSim(model, s.template).control })}>Auto-tune gains from M(q)</button>
            <div className="dim small" style={{ marginTop: 4 }}>Auto-tune: Kp = J_eff·ωn², Kd = 2ζ·J_eff·ωn, Ki = J_eff·ωn³/8 with ωn = 32 rad/s, ζ = 0.85 and J_eff the diagonal of M(q) incl. N²·Jm. Ts is limited by the installed controller ({model.controller?.rate_hz ?? '—'} Hz).</div>
          </>}
          {tab === 'kin' && <>
            <div className="sect" style={{ marginTop: 0 }}>Forward kinematics (posing)</div>
            {model.joints.map((Jm, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <span style={{ width: 22 }}>{Jm.name}</span>
                <input type="range" style={{ flex: 1 }} min={Jm.lo} max={Jm.hi} step={0.005} value={q[i] ?? 0} onChange={(e) => { const nq = q.slice(); nq[i] = +e.target.value; setQ(nq); s.setResult(null); }} />
                <span className="mono small" style={{ width: 58, textAlign: 'right' }}>{fmt((q[i] ?? 0) * jointUnit(Jm).k, 1)} {Jm.type === 'prismatic' ? 'mm' : '°'}</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 4 }}><button className="btn sm" onClick={() => { setQ(new Array(n).fill(0)); s.setResult(null); }}>Zero pose</button></div>
            {tcpNow && <>
              <div className="sect">TCP pose (world)</div>
              <div className="mono small">p = ({tcpNow.tcp.p.map((v) => fmt(v, 4)).join(', ')}) m</div>
              <div className="mono small dim" style={{ whiteSpace: 'pre' }}>{[0, 1, 2].map((r) => 'R ' + [0, 1, 2].map((c) => fmt(tcpNow.tcp.R[r * 3 + c], 3).padStart(7)).join('')).join('\n')}</div>
              <div className="metric small"><span>Manipulability √det(JJᵀ)</span><b>{manip.toExponential(3)}</b></div>
              {manip < 1e-3 && <div className="notice">Near a singularity – small TCP motions need very large joint velocities.</div>}
            </>}
            <div className="sect">Geometric Jacobian J(q) (6×{n})</div>
            <div className="mono" style={{ fontSize: 10.5, whiteSpace: 'pre', overflowX: 'auto' }}>
              {J.map((row, r) => ['vx', 'vy', 'vz', 'ωx', 'ωy', 'ωz'][r].padEnd(3) + row.map((v) => fmt(v, 3).padStart(8)).join('')).join('\n')}
            </div>
            <div className="sect">Inverse kinematics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 3, alignItems: 'center' }}>{[0, 1, 2].map((a) => <NumIn key={a} v={ikT[a]} on={(x) => { const p = ikT.slice() as V3; p[a] = x; setIkT(p); }} />)}<span className="dim small">m</span></div>
            <div className="row" style={{ marginTop: 5 }}>
              <button className="btn sm primary" onClick={() => {
                const tcp = fk(model, q).tcp;
                const r = ik(model, { p: ikT, R: n >= 6 ? tcp.R : undefined }, q);
                setIkMsg(`${r.message} · ${r.iterations} it · |e_p| = ${(r.posErr * 1000).toFixed(3)} mm${n >= 6 ? ` · |e_R| = ${(r.rotErr * D).toFixed(3)}°` : ''}`);
                if (r.ok) { setQ(r.q); s.setResult(null); }
              }}>Solve IK</button>
              <button className="btn sm" onClick={() => { setSim({ scenario: { kind: 'move', target: [], speed: 0.5 } }); setTab('setup'); }}>Use as move target</button>
            </div>
            {ikMsg && <div className="small muted" style={{ marginTop: 4 }}>{ikMsg}</div>}
            <div className="sect">Workspace</div>
            <label className="row small"><input type="checkbox" checked={showWs} onChange={(e) => setShowWs(e.target.checked)} /> Show reachable TCP points (6000 Monte-Carlo samples within joint limits)</label>
          </>}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line)' }}>
          {errors.length > 0 && <div className="notice" style={{ marginBottom: 6 }}>{errors[0].text}</div>}
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 8 }} disabled={simBusy !== null || errors.length > 0} onClick={run}>
            {simBusy !== null ? `Simulating… ${Math.round(simBusy * 100)} %` : '▶ Run simulation'}
          </button>
        </div>
      </div>

      <div className="center" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <SimViewport ikTarget={sc.kind === 'move' || tab === 'kin' ? ikT : null} showWs={showWs} />
          <div className="overlay-tl"><div className="card small" style={{ maxWidth: 380 }}>
            <b>{asm.name}</b> · {n} DOF · {model.totalMass.toFixed(1)} kg
            <div className="dim">{result?.ok ? 'Showing recorded simulation states (physics computed in a Web Worker; this view only replays samples).' : 'Showing the posing sliders. Run the simulation to replay physics results.'}</div>
            {result?.ok && <div className="legend" style={{ marginTop: 4 }}><span><i style={{ background: '#f2b705' }} />actual TCP path</span><span><i style={{ background: '#8a96a8' }} />reference path</span><span><i style={{ background: '#2f7bff' }} />waypoints</span></div>}
          </div></div>
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)', background: 'var(--panel)' }}>
          <div className="playbar">
            <button className="btn sm" disabled={!result?.ok} onClick={() => { if (playT >= T) s.setPlay(0, true); else s.setPlay(playT, !playing); }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="btn sm" disabled={!result?.ok} onClick={() => s.setPlay(0, false)}>⏮</button>
            <input type="range" min={0} max={T || 1} step={0.001} value={playT} disabled={!result?.ok} onChange={(e) => s.setPlay(+e.target.value, false)} />
            <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>{[0.1, 0.25, 0.5, 1, 2].map((v) => <option key={v} value={v}>{v}×</option>)}</select>
            <span className="mono small" style={{ minWidth: 150, textAlign: 'right' }}>t<sub>sim</sub> = {playT.toFixed(3)} / {T.toFixed(2)} s</span>
          </div>
          {result?.ok && <div className="dim small" style={{ marginTop: 3 }}>Simulation time ≠ wall-clock: {result.metrics.simTime.toFixed(2)} s simulated in {result.metrics.wallTime.toFixed(2)} s ({(result.metrics.simTime / Math.max(1e-6, result.metrics.wallTime)).toFixed(1)}× real time), {result.metrics.steps.toLocaleString()} physics steps of {sim.dt * 1000} ms. Playback speed {speed}×.</div>}
        </div>
      </div>

      <div className="panel right">
        <div className="panel-h">Live engineering readout {result?.ok && <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>@ {playT.toFixed(2)} s</span>}</div>
        <div className="panel-b">
          {!result?.ok && <div className="muted small">{result?.error ? <div className="notice">{result.error}</div> : 'Run a simulation to observe joint, motor, power and sensor signals.'}</div>}
          {result?.ok && <>
            <table className="t"><thead><tr><th>Joint</th><th>q °|mm</th><th>τ N·m|N</th><th>I A</th><th>rpm</th><th>P W</th></tr></thead><tbody>
              {model.joints.map((Jm, i) => {
                const j = `J${i + 1}`;
                const I = sampleAt(result, `${j}.i`, playT);
                return <tr key={j}><td>{j}</td><td className="n">{fmt(sampleAt(result, `${j}.q`, playT), 1)}</td><td className="n">{fmt(sampleAt(result, `${j}.tau`, playT), 1)}</td>
                  <td className="n" style={{ color: Math.abs(I) > Jm.motor.I_rated ? 'var(--warn)' : undefined }}>{fmt(I, 2)}</td><td className="n">{fmt(sampleAt(result, `${j}.rpm`, playT), 0)}</td><td className="n">{fmt(sampleAt(result, `${j}.pe`, playT), 1)}</td></tr>;
              })}
            </tbody></table>
            <div className="metric small"><span>TCP (m)</span><b>{['x', 'y', 'z'].map((a) => fmt(sampleAt(result, `ee.${a}`, playT), 3)).join(', ')}</b></div>
            <div className="metric small"><span>TCP error</span><b>{fmt(sampleAt(result, 'ee.err', playT), 2)} mm</b></div>
            <div className="metric small"><span>Bus power / energy</span><b>{fmt(sampleAt(result, 'pwr.bus', playT), 1)} W / {fmt(sampleAt(result, 'pwr.energy', playT), 1)} J</b></div>
            {model.power?.kind === 'battery' && <div className="metric small"><span>Battery SOC</span><b>{fmt(sampleAt(result, 'bat.soc', playT), 4)} %</b></div>}
            {model.ft && <div className="metric small"><span>F/T Fz, Mz</span><b>{fmt(sampleAt(result, 'ft.Fz', playT), 2)} N, {fmt(sampleAt(result, 'ft.Mz', playT), 3)} N·m</b></div>}
            {model.gripper && <div className="metric small"><span>Gripper opening</span><b>{fmt(sampleAt(result, 'grip.open', playT), 1)} mm {sampleAt(result, 'grip.payload', playT) > 0.5 ? '· holding' : ''}</b></div>}

            <div className="sect">Performance metrics</div>
            <div className="metric small"><span>TCP RMSE / max</span><b>{fmt(result.metrics.eeRmseMm, 2)} / {fmt(result.metrics.eeMaxMm, 2)} mm</b></div>
            <div className="metric small"><span>Energy · avg · peak power</span><b>{fmt(result.metrics.energyJ, 1)} J · {fmt(result.metrics.avgPowerW, 1)} · {fmt(result.metrics.peakPowerW, 0)} W</b></div>
            <div className="metric small"><span>Cycle time</span><b>{fmt(result.metrics.cycleTime, 2)} s</b></div>
            {result.metrics.step && <>
              <div className="metric small"><span>{result.metrics.step.joint} rise time (10–90 %)</span><b>{fmt(result.metrics.step.riseTime * 1000, 0)} ms</b></div>
              <div className="metric small"><span>Settling time (±2 %)</span><b>{isFinite(result.metrics.step.settlingTime) ? fmt(result.metrics.step.settlingTime * 1000, 0) + ' ms' : 'not settled'}</b></div>
              <div className="metric small"><span>Overshoot</span><b>{fmt(result.metrics.step.overshootPct, 2)} %</b></div>
              <div className="metric small"><span>Steady-state error</span><b>{fmt(result.metrics.step.steadyStateError, 4)}°</b></div>
            </>}
            <table className="t" style={{ marginTop: 6 }}><thead><tr><th>Joint</th><th>RMSE °|mm</th><th>MAE</th><th>τ̂ N·m|N</th><th>I_rms A</th></tr></thead><tbody>
              {result.metrics.joints.map((m) => <tr key={m.joint}><td>{m.joint}</td><td className="n">{fmt(m.rmseDeg, 3)}</td><td className="n">{fmt(m.maeDeg, 3)}</td><td className="n">{fmt(m.peakTorque, 1)}</td><td className="n">{fmt(m.rmsCurrent, 2)}</td></tr>)}
            </tbody></table>

            <div className="sect">Events ({result.events.length})</div>
            {result.events.length === 0 && <div className="small" style={{ color: 'var(--ok)' }}>No overloads, limit hits or collisions.</div>}
            {result.events.map((e, i) => <div key={i} className="small" style={{ padding: '2px 0', cursor: 'pointer' }} onClick={() => s.setPlay(e.t, false)}><Tag level={e.level}>{e.t.toFixed(2)} s</Tag> {e.text}</div>)}

            <div className="sect">Export</div>
            <div className="row">
              <button className="btn sm" onClick={() => download(`${slug(asm.name)}_simulation.csv`, toCSV(result), 'text/csv')}>CSV (all signals)</button>
              <button className="btn sm" onClick={() => download(`${slug(asm.name)}_experiment.json`, JSON.stringify({ robot: asm, settings: sim, metrics: result.metrics, events: result.events, signals: Object.fromEntries(Object.entries(result.signals).map(([k, v]) => [k, Array.from(v)])), t: Array.from(result.t) }), 'application/json')}>JSON</button>
              <button className="btn sm" onClick={() => {
                const html = reportHTML({ asm, model, result, sim: { ...sim, control: ctrl }, title: `${asm.name} – ${sc.kind === 'pickplace' ? 'Pick-and-place' : sc.kind === 'step' ? 'Step response' : 'Point-to-point'} experiment` });
                const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                const w = window.open(url, '_blank');
                if (!w) download(`${slug(asm.name)}_report.html`, html, 'text/html');
              }}>Report (print → PDF)</button>
              <button className="btn sm" onClick={() => s.setPage('waves')}>Waveforms →</button>
            </div>
          </>}
          <div className="sect">Robot description</div>
          <div className="row">
            <button className="btn sm" onClick={() => download(`${slug(asm.name)}.urdf`, exportURDF(asm, model), 'application/xml')}>Export URDF (ROS 2)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ name, kp, ki, kd, on }: { name: string; kp: number; ki: number; kd: number; on: (k: 'kp' | 'ki' | 'kd', v: number) => void }) {
  return (
    <>
      <span>{name}</span>
      {(['kp', 'ki', 'kd'] as const).map((k) => {
        const val = k === 'kp' ? kp : k === 'ki' ? ki : kd;
        return <input key={k + String(val)} type="number" defaultValue={val}
          onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== val) on(k, v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
      })}
    </>
  );
}
