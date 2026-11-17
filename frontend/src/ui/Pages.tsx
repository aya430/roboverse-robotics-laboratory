import { useMemo, useRef, useState } from 'react';
import { useStore, listProjects, deleteStoredProject, type ProjectFile } from '../store';
import { TEMPLATES, buildTemplate } from '../engine/templates';
import { CATALOG, CATEGORIES, getItem } from '../engine/catalog';
import { PartPreview } from './PartPreview';
import { ItemSpecs } from './Properties';
import { CadImportDialog } from './CadImportDialog';
import { CAT_STYLE, download, slug } from './common';
import { CHALLENGES } from '../engine/challenges';
import { DeveloperCredit } from './DeveloperPage';

// ------------------------------------------------------------------ Dashboard
export function Dashboard() {
  const s = useStore();
  const [heroT, setHeroT] = useState('arm6');
  const ref = useMemo(() => buildTemplate(heroT, 'preview'), [heroT]);
  const recent = listProjects().slice(0, 6);
  return (
    <div className="page"><div className="page-in">
      <div className="hero">
        <div>
          <h1>ROBOVERSE</h1>
          <div className="tagline">Pick · Place · Assemble · Simulate · Analyse · Innovate</div>
          <p>A virtual robotics construction laboratory. Build a robot from individual motors, gearboxes, links, sensors and electronics; every connection is checked against its real mechanical interface. Then run it: kinematics, rigid-body dynamics, motor electrical models and closed-loop control are computed from the same model you assembled, and every waveform comes from the simulation.</p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn brand" onClick={() => { s.setTemplate(heroT); s.newProject('empty', true); s.setMode('guided'); s.setPage('build'); }}>Start guided assembly</button>
            <button className="btn" onClick={() => { s.newProject('empty'); s.setMode('free'); s.setPage('build'); }}>Create new robot (free build)</button>
            <button className="btn" onClick={() => { s.newProject('arm6'); s.setPage('sim'); }}>Open 6-DOF template in simulation</button>
          </div>
        </div>
        <div className="hero-view"><PartPreview asm={ref} height="100%" rotate /></div>
      </div>

      <div className="h2" style={{ marginTop: 0 }}>Robot reference architectures</div>
      <div className="grid3" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 14 }}>
        {TEMPLATES.map((t) => (
          <div key={t.id} className="tile" style={{ cursor: 'default', borderColor: heroT === t.id ? 'var(--accent)' : undefined }} onMouseEnter={() => setHeroT(t.id)}>
            <span className="k">{t.family}</span>
            <h3 style={{ fontSize: 14 }}>{t.name}</h3>
            <p style={{ fontSize: 12 }}>{t.description}</p>
            <div className="row" style={{ marginTop: 'auto' }}>
              <button className="btn sm primary" onClick={() => { s.setTemplate(t.id); s.newProject('empty', true); s.setMode('guided'); s.setPage('build'); }}>Guided build</button>
              <button className="btn sm" onClick={() => { s.newProject(t.id); s.setPage('build'); }}>Open</button>
              <button className="btn sm" onClick={() => { s.newProject(t.id); s.setPage('sim'); }}>Simulate</button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid3">
        <button className="tile" onClick={() => s.setPage('build')}><span className="k">Assembly workspace</span><h3>Build a Robot</h3><p>Component library, 3D workspace with snap-to-mount, assembly assistant, validation and engineering console. Guided, free and challenge modes.</p></button>
        <button className="tile" onClick={() => s.setPage('sim')}><span className="k">Simulation lab</span><h3>Run & control</h3><p>FK/IK, Jacobian, DH, workspace; quintic pick-and-place trajectories; PID, gravity-compensated PID and computed-torque control; motor and battery models.</p></button>
        <button className="tile" onClick={() => s.setPage('waves')}><span className="k">Signal analysis</span><h3>Waveform Analysis</h3><p>Scope-style synchronised plots of joint, motor, power, TCP and sensor signals with zoom, cursor, autoscale, PNG and CSV export.</p></button>
        <button className="tile" onClick={() => s.setPage('library')}><span className="k">{CATALOG.length} parts</span><h3>Component Library</h3><p>Motors, harmonic and planetary gearboxes, links, grippers, F/T sensor, controller, drivers and power sources – each with interfaces and parameters.</p></button>
        <button className="tile" onClick={() => s.setPage('handson')}><span className="k">Learning paths</span><h3>Hands-on Library</h3><p>Structured experiments with aim, theory, procedure, editable parameters, expected waveforms and viva questions.</p></button>
        <button className="tile" onClick={() => { s.setMode('challenge', CHALLENGES[0].id); s.setPage('build'); }}><span className="k">Assessment</span><h3>Engineering Challenges</h3><p>{CHALLENGES.length} design challenges with automatic assessment of assembly, DOF, accuracy and energy.</p></button>
      </div>

      <div className="h2">Recent projects</div>
      {recent.length === 0 && <div className="muted small">No saved projects yet. Projects are saved in this browser (and can be exported as JSON files).</div>}
      <div className="grid3">
        {recent.map((p) => (
          <button key={p.id} className="tile" onClick={() => s.loadProject(p)}>
            <span className="k">{new Date(p.savedAt).toLocaleString()}</span>
            <h3>{p.name}</h3>
            <p>{p.assembly.instances.length} components · {p.mode} mode</p>
          </button>
        ))}
      </div>

      <div className="h2">Platform status</div>
      <div className="grid2">
        <div className="card small" style={{ lineHeight: 1.6 }}>
          <b>Working now:</b> {CATALOG.length} CAD components with mounting interfaces · CAD import (STEP, IGES, STL, OBJ, GLB/GLTF) · revolute and prismatic joints · 6-DOF arm, 5-DOF modular arm, SCARA, Cartesian gantry and desktop servo arm templates · component library with 3D previews · pick-and-place assembly with interface validation · guided / free / challenge modes · undo/redo, explode, hide · robot model extraction (mass properties, joints, TCP) · FK, DLS-IK, Jacobian, manipulability, DH, workspace · RNEA dynamics · DC/BLDC motor, gearbox, driver, battery models · PID / PID+G / CTC control · pick-and-place, step and point-to-point experiments · waveform lab · CSV / JSON / URDF / report export · project save / reopen.
        </div>
        <div className="card small" style={{ lineHeight: 1.6 }}>
          <b>Roadmap (not yet in this build):</b> humanoid and quadruped labs (floating base, contact), delta / parallel (closed-chain) robots, mobile bases · CAD import pipeline (STEP → GLB) · ROS 2 / MoveIt 2 bridge and Gazebo/MuJoCo backends · sandboxed code execution · server-side accounts. The architecture for these is documented under <a href="#" onClick={(e) => { e.preventDefault(); s.setPage('docs'); }}>Documentation</a>; the engine and project format are designed so they plug in without rework.
        </div>
      </div>

      <div className="h2">Developer</div>
      <DeveloperCredit />
    </div></div>
  );
}

// ------------------------------------------------------------------ Component library browser
export function LibraryPage() {
  const s = useStore();
  const [sel, setSel] = useState(CATALOG[1].id);
  const [cat, setCat] = useState<string>('All');
  const [q, setQ] = useState('');
  const [imp, setImp] = useState(false);
  useStore((st) => st.customParts);
  const it = getItem(sel);
  return (
    <div className="sim-layout" style={{ gridTemplateColumns: '300px 1fr 360px' }}>
      <div className="panel">
        <div className="panel-h">3D component library</div>
        <div className="panel-b">
          <div className="row" style={{ marginBottom: 6 }}>
            {['All', ...CATEGORIES].map((c) => <button key={c} className={`btn sm ${cat === c ? 'primary' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 6 }}>
            <input className="lib-search" style={{ marginBottom: 0 }} placeholder={`Search ${CATALOG.length} components…`} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm primary" onClick={() => setImp(true)}>⇪ Import CAD</button>
          </div>
          {imp && <CadImportDialog onClose={() => setImp(false)} />}
          <div className="dim small" style={{ marginBottom: 6 }}>{CATALOG.filter((c) => (cat === 'All' || c.category === cat) && `${c.name} ${c.sub}`.toLowerCase().includes(q.toLowerCase())).length} components</div>
          {CATALOG.filter((c) => (cat === 'All' || c.category === cat) && `${c.name} ${c.sub} ${c.description}`.toLowerCase().includes(q.toLowerCase())).map((c) => (
            <div key={c.id} className={`lib-item ${sel === c.id ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSel(c.id)}>
              <div className="lib-ico" style={{ background: CAT_STYLE[c.category].c }}>{CAT_STYLE[c.category].t}</div>
              <div><div className="nm">{c.name}</div><div className="sb">{c.sub}{c.id.startsWith('cad-') ? ' · imported' : ''}{c.libraryOnly ? ' · library part' : ''}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="center" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative' }}><PartPreview itemId={sel} height="100%" /></div>
        <div className="card" style={{ margin: 10 }}>
          <h3>{it.name}</h3>
          <div className="muted small" style={{ lineHeight: 1.6, marginTop: 4 }}>{it.description}</div>
          {it.role && <div className="small" style={{ marginTop: 4 }}>Typical role: <b>{it.role}</b></div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => { s.arm(sel); s.setPage('build'); }}>Pick for assembly →</button>
            <button className="btn" onClick={() => download(`${it.id}.json`, JSON.stringify(it, null, 2), 'application/json')}>Export part record (JSON)</button>
          </div>
        </div>
      </div>
      <div className="panel right"><div className="panel-h">Specification</div><div className="panel-b"><ItemSpecs it={it} /></div></div>
    </div>
  );
}

// ------------------------------------------------------------------ Hands-on library
interface Exp { id: string; path: string; title: string; aim: string; objectives: string[]; theory: string; components: string[]; procedure: string[]; equations: string[]; params: string; expected: string; viva: string[]; launch: (s: ReturnType<typeof useStore.getState>) => void }

const EXPERIMENTS: Exp[] = [
  {
    id: 'E1', path: 'Industrial Robotics', title: 'Assemble a 6-DOF industrial arm and verify its kinematics',
    aim: 'To construct a six-axis articulated arm from individual components and verify its forward and inverse kinematics.',
    objectives: ['Identify the function of base, actuator, transmission, link and end-effector', 'Understand mechanical interfaces and why parts are (in)compatible', 'Relate the assembled geometry to DH parameters and the Jacobian'],
    theory: 'Each gearbox output flange is a revolute joint whose axis is the flange z-axis. Successive joints and the links between them define the kinematic chain; the TCP pose follows from the product of homogeneous transforms T = Π Xᵢ·Rz(qᵢ)·T_tool. Standard DH parameters (θ, d, a, α) are a compact description of the same chain.',
    components: ['Base pedestal B-400', 'Controller RC-1, driver DRV-6, battery 48 V', '2 × G-400 + HD-L 100:1', 'G-200 + HD-M 100:1', '3 × G-100 + HD-S 80:1', 'Turret, upper arm, forearm, two wrist brackets', 'Wrist adapter + two-finger gripper'],
    procedure: ['Start a new project in Guided mode.', 'Follow the 23 assembly steps; read the explanation at each step.', 'Open Validation → confirm 6 DOF and no errors.', 'Open Engineering calculations → record the DH table.', 'In Simulation › Kinematics, pose the joints and note the TCP pose and manipulability.', 'Solve IK for (0.45, 0.20, 0.40) m and check the position error.'],
    equations: ['T₀ⁿ(q) = Π Aᵢ(qᵢ),   Aᵢ = Rz(θᵢ)·Tz(dᵢ)·Tx(aᵢ)·Rx(αᵢ)', 'ẋ = J(q) q̇,   w = √det(J Jᵀ)', 'Δq = Jᵀ (J Jᵀ + λ² I)⁻¹ e'],
    params: 'Joint angles (sliders), IK target, joint limits (gearbox properties).',
    expected: 'IK converges to < 0.1 mm; manipulability drops towards 0 when J5 → 0° (wrist singularity).',
    viva: ['Why does the turret link make J2 perpendicular to J1?', 'What happens to w when the wrist axes J4 and J6 align?', 'How many IK solutions does a 6-R arm generally have?'],
    launch: (s) => { s.newProject('empty'); s.setMode('guided'); s.setPage('build'); },
  },
  {
    id: 'E2', path: 'Robotic Manipulators', title: 'PID tuning of a joint position loop (step response)',
    aim: 'To study the effect of Kp, Ki, Kd and gravity compensation on the step response of the shoulder joint J2.',
    objectives: ['Measure rise time, settling time, overshoot and steady-state error', 'Observe current saturation and integrator wind-up', 'Compare PID with PID + gravity compensation and computed-torque control'],
    theory: 'For a joint with effective inertia J_eff = M_jj + N²J_m, PD control gives ωn = √(Kp/J_eff) and ζ = Kd / (2√(Kp J_eff)). Gravity acts as a pose-dependent disturbance; without feed-forward the integral term must remove it, which slows settling.',
    components: ['6-DOF template robot'],
    procedure: ['Open the 6-DOF template in Simulation.', 'Scenario: Joint step response, J2, 5°, payload 0.', 'Run with PID; record metrics.', 'Switch to PID + gravity compensation; run again.', 'Halve and double Kd for J2 and compare overshoot.', 'Export the CSV and plot J2 angle vs reference.'],
    equations: ['τ = Kp e + Ki ∫e dt + Kd ė (+ G(q))', 'ωn = √(Kp / J_eff),  ζ = Kd / (2 √(Kp J_eff))'],
    params: 'Kp, Ki, Kd per joint, control law, Ts, step amplitude.',
    expected: 'PID + G removes the gravity offset; larger Kd reduces overshoot; large steps saturate the motor current (event list).',
    viva: ['Why is J_eff dominated by N²J_m?', 'What is conditional-integration anti-windup?', 'Why does a slower sampling rate destabilise high-gain loops?'],
    launch: (s) => { s.newProject('arm6'); s.setSim({ scenario: { kind: 'step', joint: 1, ampDeg: 5, tStep: 0.2, hold: 1.5 }, payload: 0 }); s.setPage('sim'); },
  },
  {
    id: 'E3', path: 'Robotics Electronics', title: 'Motor and gearbox sizing for the shoulder joint',
    aim: 'To size the J2 actuator by comparing a 100:1 harmonic drive with a 20:1 planetary gearbox.',
    objectives: ['Compute worst-case gravity torque', 'Relate motor torque, ratio and efficiency to output torque', 'Interpret overload and RMS-current warnings'],
    theory: 'Output torque τ = N·η·Kt·i. Continuous capability is limited by RMS current (heating) and peak capability by I_peak and the gearbox peak torque. Reflected inertia N²J_m and speed ω_m = N·q̇ trade off against the ratio.',
    components: ['6-DOF template', 'Planetary gearbox PG-L 20:1'],
    procedure: ['Open the 6-DOF template in Build.', 'Select the J2 gearbox (shoulder) and use “Replace with → Planetary gearbox PG-L 20:1”; the upper arm and everything above it stay mounted.', 'Read the Validation tab: static sizing for J2.', 'Run the pick-and-place with 1 kg and compare RMS current and events.'],
    equations: ['τ_out = N η K_t i', 'I_rms = √(1/T ∫ i² dt) ≤ I_rated', 'J_reflected = N² J_m'],
    params: 'Gear ratio, efficiency, rated/peak torque (Properties panel), payload.',
    expected: 'With 20:1 the static load exceeds the continuous rating; the simulation reports RMS-current overload on J2.',
    viva: ['Why does a higher ratio reduce motor current but increase reflected inertia?', 'What does η do when the load back-drives the motor?'],
    launch: (s) => { s.newProject('arm6'); s.setPage('build'); },
  },
  {
    id: 'E4', path: 'Industrial Robotics', title: 'Pick-and-place: payload, link material and energy',
    aim: 'To quantify how payload mass and link material change joint torque, current and battery energy in a pick-and-place cycle.',
    objectives: ['Generate a quintic joint-space pick-and-place trajectory from IK waypoints', 'Measure energy and peak power from simulation', 'Compare aluminium and carbon-fibre upper arms'],
    theory: 'Electrical energy E = ∫ Σ max(0, Vᵢ iᵢ) dt + P_logic·T. Gravity and inertial torques scale with link and payload mass; copper losses scale with i²R.',
    components: ['6-DOF template', 'Carbon-fibre upper arm'],
    procedure: ['Run the default pick-and-place (1 kg); export CSV.', 'Repeat with 0 kg and 3 kg payload.', 'Replace the aluminium upper arm with the carbon-fibre one (same interfaces) and repeat.', 'Tabulate energy, peak J2 torque and TCP RMSE.'],
    equations: ['q(t) = q₀ + Δq (10τ³ − 15τ⁴ + 6τ⁵)', 'E = ∫ P_bus dt,  SOC = 1 − ∫ I_bus dt / C'],
    params: 'Payload, pick/place points, speed factor, link variant.',
    expected: 'Energy and J2 torque grow with payload; the carbon arm lowers both.',
    viva: ['Why is the quintic profile preferred over a cubic?', 'Where does the electrical energy go when the arm lowers a load?'],
    launch: (s) => { s.newProject('arm6'); s.setPage('sim'); },
  },
  {
    id: 'E5', path: 'Industrial Robotics', title: 'SCARA vs Cartesian gantry: kinematics, prismatic axes and cycle energy',
    aim: 'To compare a SCARA (RRPR) and a Cartesian gantry (PPP) performing the same kind of pick-and-place task.',
    objectives: ['Understand prismatic joints: ratio = 2π / lead, force instead of torque', 'Compare constant (Cartesian) and configuration-dependent (SCARA) Jacobians', 'Compare which axes carry gravity load and how that affects energy'],
    theory: 'A ball screw of lead p converts motor torque τ_m into axis force F = 2π·η·τ_m / p; the reflected inertia is m_eq = J_m (2π/p)². In a Cartesian robot each joint moves the TCP along one fixed axis (J = constant); in a SCARA only the Z axis works against gravity.',
    components: ['SCARA template (integrated actuators, ball-screw spline)', 'Cartesian gantry template (three LM-80 ball-screw modules)'],
    procedure: ['Dashboard → SCARA → Simulate. Run pick-and-place and note cycle time, energy and J3 force.', 'Open Kinematics: move J1/J2 and watch the Jacobian change; move J3 (mm).', 'Dashboard → Cartesian gantry → Simulate. Run and record the same metrics.', 'In Build, select the X module and change the lead from 10 mm to 20 mm; re-run and compare motor speed and current.', 'Plot J3 force and current in Waveform Analysis for both robots.'],
    equations: ['F = 2π η τ_m / p,   ω_m = 2π v / p', 'm_eq = J_m (2π / p)²', 'Cartesian:  ẋ = q̇ (J = I);   SCARA:  [ẋ, ẏ] = J₂(q₁, q₂)[q̇₁, q̇₂]'],
    params: 'Lead, stroke, speed factor, payload, pick and place points.',
    expected: 'Only the vertical axes show a constant gravity force; doubling the lead halves motor speed requirements but doubles current for the same force.',
    viva: ['Why are SCARA robots compliant in the horizontal plane but stiff vertically?', 'What limits the speed of a long ball-screw axis (critical speed)?', 'Why is the Cartesian Jacobian constant?'],
    launch: (s) => { s.newProject('scara'); s.setPage('sim'); },
  },
  {
    id: 'E6', path: 'Robotics Electronics', title: 'Import a CAD part and integrate it into a robot',
    aim: 'To import a real CAD model (STEP/STL), give it engineering properties and mounting interfaces, and use it in an assembly.',
    objectives: ['Handle units and coordinate conventions of CAD files', 'Derive mass from volume and density', 'Define mechanical interfaces so parts can be validated'],
    theory: 'A tessellated solid has volume V = Σ (1/6) pᵢ·(pⱼ × pₖ) over its triangles if it is closed. Mass m = ρV. Interfaces (bolt pattern, spigot, shaft, flange) decide which parts can be connected; geometry alone does not.',
    components: ['Any STEP, IGES, STL, OBJ or GLB file you are licensed to use (e.g. a bracket or sensor housing from a CAD library or your own CAD)'],
    procedure: ['Build a Robot → ⇪ CAD (or Component Library → Import CAD).', 'Choose the file; check units (mm for STEP/STL) and up axis.', 'Select the material and check the computed mass; record the licence and author.', 'Choose the input interface (e.g. ACC) and add an output interface if other parts mount on it.', 'Add the part and mount it on a blue ring; check Validation and the mass properties table.', 'Save the project, reload the page and reopen it – the imported part is stored inside the project.'],
    equations: ['V = Σ (1/6) pᵢ · (pⱼ × pₖ)', 'm = ρ V'],
    params: 'Units, up axis, material density or manual mass, interfaces, actuator model.',
    expected: 'A watertight model gives an exact volume; an open mesh falls back to an envelope estimate (flagged).',
    viva: ['Why do STEP files usually use millimetres and glTF metres?', 'What does “watertight” mean and why does it matter for mass?'],
    launch: (s) => { s.newProject('empty'); s.setMode('free'); s.setPage('library'); },
  },
];

export function HandsOnPage() {
  const s = useStore();
  const [open, setOpen] = useState(EXPERIMENTS[0].id);
  const paths = [...new Set(EXPERIMENTS.map((e) => e.path))];
  const e = EXPERIMENTS.find((x) => x.id === open)!;
  return (
    <div className="sim-layout" style={{ gridTemplateColumns: '320px 1fr' }}>
      <div className="panel">
        <div className="panel-h">ROBOVERSE hands-on robotics library</div>
        <div className="panel-b">
          {paths.map((p) => <div key={p}>
            <div className="lib-cat">{p}</div>
            {EXPERIMENTS.filter((x) => x.path === p).map((x) => (
              <div key={x.id} className={`lib-item ${open === x.id ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setOpen(x.id)}>
                <div className="lib-ico" style={{ background: '#2457b8' }}>{x.id}</div><div className="nm">{x.title}</div>
              </div>
            ))}
          </div>)}
          <div className="lib-cat">Planned paths</div>
          <div className="dim small" style={{ lineHeight: 1.6 }}>Humanoid robotics · Quadruped robotics · SCARA & delta robots – these follow when their labs are released (see Documentation › Roadmap).</div>
        </div>
      </div>
      <div className="page"><div className="page-in doc" style={{ maxWidth: 900 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Experiment {e.id}: {e.title}</h2>
          <button className="btn brand" onClick={() => e.launch(useStore.getState())}>Start experiment →</button>
        </div>
        <h3>Aim</h3><p>{e.aim}</p>
        <h3>Learning objectives</h3><ul>{e.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
        <h3>Theory</h3><p>{e.theory}</p>
        <h3>Mathematical equations</h3>{e.equations.map((q) => <span key={q} className="eq">{q}</span>)}
        <h3>Component list</h3><ul>{e.components.map((o) => <li key={o}>{o}</li>)}</ul>
        <h3>3D assembly & simulation procedure</h3><ol>{e.procedure.map((o) => <li key={o}>{o}</li>)}</ol>
        <h3>Editable parameters</h3><p>{e.params}</p>
        <h3>Expected waveforms / results</h3><p>{e.expected}</p>
        <h3>Result export</h3><p>Simulation › Export: CSV of all samples, JSON experiment record, auto-generated report (print to PDF), URDF.</p>
        <h3>Viva questions</h3><ol>{e.viva.map((o) => <li key={o}>{o}</li>)}</ol>
        <h3>Assessment</h3><p>Submit the exported CSV and the edited report. Challenge-mode tasks (Build › C · Challenge) are assessed automatically.</p>
        <div className="dim small">Tip: the current project is “{s.asm.name}”. Starting an experiment opens a new project; save your current work first.</div>
      </div></div>
    </div>
  );
}

// ------------------------------------------------------------------ Projects
export function ProjectsPage() {
  const s = useStore();
  const [, force] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const list = listProjects();
  return (
    <div className="page"><div className="page-in">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>My Projects</h2>
        <div className="row">
          <button className="btn primary" onClick={() => { s.saveProject(); force((x) => x + 1); }}>Save current project</button>
          <button className="btn" onClick={() => { const p = s.saveProject(); download(`${slug(p.name)}.roboverse.json`, JSON.stringify(p, null, 2), 'application/json'); force((x) => x + 1); }}>Export current (JSON)</button>
          <button className="btn" onClick={() => file.current?.click()}>Import project file…</button>
          <input ref={file} type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { s.loadProject(JSON.parse(await f.text()) as ProjectFile); } catch (err: any) { s.logMsg('error', `Import failed: ${err.message}`); alert(`Import failed: ${err.message}`); }
            e.target.value = '';
          }} />
        </div>
      </div>
      <p className="muted small">Projects are stored in this browser’s local storage with the complete assembly (component IDs, connections, parameter overrides), controller and simulation settings. Export a JSON file to move a project to another computer or to submit it.</p>
      <table className="t" style={{ marginTop: 10 }}>
        <thead><tr><th>Name</th><th>Components</th><th>Mode</th><th>Saved</th><th /></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td><b>{p.name}</b>{p.id === s.projectId && <span className="tag info" style={{ marginLeft: 6 }}>open</span>}</td>
              <td>{p.assembly.instances.length}</td><td>{p.mode}</td><td>{new Date(p.savedAt).toLocaleString()}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn sm primary" onClick={() => s.loadProject(p)}>Open</button>
                <button className="btn sm" onClick={() => download(`${slug(p.name)}.roboverse.json`, JSON.stringify(p, null, 2), 'application/json')}>Export</button>
                <button className="btn sm danger" onClick={() => { if (confirm(`Delete “${p.name}” from this browser?`)) { deleteStoredProject(p.id); force((x) => x + 1); } }}>Delete</button>
              </td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={5} className="muted">No saved projects.</td></tr>}
        </tbody>
      </table>
    </div></div>
  );
}
