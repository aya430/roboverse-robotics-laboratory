export function DocsPage() {
  return (
    <div className="page"><div className="page-in doc" style={{ maxWidth: 920 }}>
      <h2 style={{ marginTop: 0 }}>ROBOVERSE documentation</h2>
      <p>This build implements Phases 1–5 of the ROBOVERSE roadmap and the serial industrial families of Phase 8: a 176-part CAD component library with in-browser CAD import, the pick-and-place assembly engine, arm / SCARA / Cartesian / desktop-arm designers, robotics simulation with revolute and prismatic joints, and engineering analysis. The full architecture, database schema and roadmap are in <code>documentation/</code> of the repository.</p>

      <h2>1. One model, many views</h2>
      <p>The <b>assembly</b> (component instances connected port-to-port, with parameter overrides) is the single source of truth. From it ROBOVERSE derives the <b>robot model</b> – joint frames, link mass properties, motors, gearboxes, sensors, electronics and TCP – which feeds rendering, kinematics, dynamics, control, the simulator, URDF export and reports. Component IDs are preserved through the whole pipeline and in saved projects.</p>
      <span className="eq">Assembly (JSON) → RobotModel → {'{'} 3D scene · FK/IK/Jacobian/DH · RNEA dynamics · motor & control simulation · waveforms · URDF · report {'}'}</span>

      <h2>2. Assembly rules</h2>
      <ul>
        <li>Every port has an <b>interface code</b> (e.g. <code>AM-L</code> actuator mount, <code>SH-14</code> Ø14 mm shaft, <code>FL-M</code> output flange, <code>TF-40</code> ISO 9409 tool flange). Parts mate only when codes match exactly; touching geometry is never a connection.</li>
        <li>Port frames point downstream (parent → child). Mating aligns the child’s input frame with the parent’s output frame; the part can be clocked in 90° steps about the mating axis.</li>
        <li>A gearbox output flange defines a revolute joint (its z-axis). Its motor is the part on the gearbox input. Housing shapes belong to the parent body, the output flange to the child body.</li>
        <li>Mass is distributed over each part’s primitives by volume; inertia tensors use solid cylinder/box formulas and the parallel-axis theorem.</li>
      </ul>

      <h2>3. Kinematics</h2>
      <span className="eq">Bᵢ = Bᵢ₋₁ · Xᵢ · Rz(qᵢ),   T_tcp = Bₙ · T_tool</span>
      <span className="eq">J = [ zᵢ × (p_tcp − oᵢ) ; zᵢ ]  (geometric Jacobian),   w = √det(J Jᵀ)</span>
      <span className="eq">IK (damped least squares): Δq = Jᵀ (J Jᵀ + λ² I)⁻¹ [e_p ; w_R e_R], adaptive λ, joint-limit clamping</span>
      <p>Standard DH parameters are extracted from the joint axes at the zero pose (common normals); the unit tests verify that the DH product reproduces the transform chain to machine precision.</p>

      <h2>4. Dynamics</h2>
      <span className="eq">M(q) q̈ + C(q,q̇) q̇ + G(q) + F(q̇) = τ</span>
      <p>Inverse dynamics by the recursive Newton–Euler algorithm (Craig). M(q) is assembled from n RNEA calls with unit accelerations plus the reflected rotor inertia N²J<sub>m</sub> on the diagonal; forward dynamics solves M q̈ = τ − h by Cholesky. Friction F = b q̇ + F<sub>c</sub> tanh(q̇/0.01). Tests check symmetry/positive-definiteness of M, gravity torque against the numerical gradient of potential energy, and energy conservation without friction and torque.</p>

      <h2>5. Actuators, electronics and control</h2>
      <span className="eq">L di/dt = V − R i − K_e N q̇ ,   τ_m = K_t i ,   τ_joint = N η τ_m (motoring) / N τ_m / η (back-driven)</span>
      <ul>
        <li>The FOC current loop is modelled as a first-order closed loop of selectable bandwidth, limited by the bus voltage; when the voltage saturates the exact R–L–back-EMF solution is used.</li>
        <li>Current commands are limited by min(motor I<sub>peak</sub>, driver I<sub>peak</sub>). Encoders quantise the joint angle (17-bit at the motor ⇒ /N at the joint). Velocity is estimated by filtered differentiation.</li>
        <li>Controllers run at the sampling period Ts with zero-order hold: PID, PID + gravity compensation, computed-torque. Conditional-integration anti-windup.</li>
        <li>Battery: V = V<sub>nom</sub>(0.9 + 0.1 SOC) − R<sub>int</sub> I, no regeneration (brake resistor assumed), 12 W controller/driver logic power.</li>
      </ul>

      <h2>6. Numerical method and time</h2>
      <p>Fixed physics step (default 0.5 ms, semi-implicit Euler for the mechanics, exact exponential for the motor current). The simulation runs in a Web Worker and is <b>decoupled from rendering</b>: the 3D view replays recorded samples. Simulation time and wall-clock time are reported separately.</p>

      <h2>7. Assumptions and limitations (current build)</h2>
      <ul>
        <li>Serial chains of revolute and prismatic joints; branched or closed-loop mechanisms (delta, dual-arm) can be assembled but are not simulated yet.</li>
        <li>Pneumatic/hydraulic actuators, cameras, magnetometers and pressure sensors are assemblable library parts (mass and geometry); their own physics is not simulated. IMUs, range sensors, encoders and the F/T sensor are simulated.</li>
        <li>Imported CAD parts are rigid; their inertia uses the bounding-box approximation with the exact (watertight) or estimated volume.</li>
        <li>Rigid links and joints; gearbox backlash and flexibility are listed but not simulated; efficiency is a constant.</li>
        <li>Collision checks: ground plane for TCP and joint housings. Self-collision and environment contact (except the payload grasp, modelled as a rigid attachment) are not yet simulated.</li>
        <li>Part parameters are generic class-representative values, not manufacturer datasheets. Override them in the Properties panel with real data when sizing a real robot.</li>
        <li>Geometry is ROBOVERSE procedural (original, CC BY 4.0). No commercial CAD models are bundled; reference architectures are educational, not reproductions of commercial robots.</li>
      </ul>

      <h2>8. Exports</h2>
      <ul>
        <li><b>CSV</b>: actual simulation samples, one column per signal with units in the header.</li>
        <li><b>JSON</b>: robot configuration, settings, metrics, events and all samples. <b>Project files</b> (<code>.roboverse.json</code>) reopen the full project.</li>
        <li><b>URDF</b>: links with inertials, visual and collision primitives; revolute joints with limits, damping and friction; transmissions and a <code>ros2_control</code> block.</li>
        <li><b>Report</b>: HTML generated from the data (equations, tables, SVG graphs, editable observations), printable to PDF.</li>
        <li><b>PNG</b>: workspace and waveform snapshots.</li>
      </ul>

      <h2>9. Roadmap</h2>
      <table className="t"><thead><tr><th>Phase</th><th>Scope</th><th>Status</th></tr></thead><tbody>
        <tr><td>1–2</td><td>Platform, library, pick-and-place assembly engine, assistant, validation</td><td><span className="tag ok">in this build</span></td></tr>
        <tr><td>3–5</td><td>Arm designer, FK/IK/DH, dynamics, motors, PID/CTC, waveforms, CSV/JSON/report</td><td><span className="tag ok">in this build</span></td></tr>
        <tr><td>6</td><td>Humanoid lab: floating base, contact, balance (ZMP/COM) – needs MuJoCo backend</td><td><span className="tag">planned</span></td></tr>
        <tr><td>7</td><td>Quadruped lab: gaits, foot contact forces</td><td><span className="tag">planned</span></td></tr>
        <tr><td>8</td><td>SCARA ✔, Cartesian ✔, modular and desktop arms ✔; delta (closed chains), dual-arm, welding paths</td><td><span className="tag info">partly in this build</span></td></tr>
        <tr><td>9</td><td>FastAPI backend, PostgreSQL, server CAD pipeline for large assemblies, ROS 2 bridge (rosbridge), MoveIt 2, Gazebo/Webots, sandboxed Python/C++ (in-browser STEP/IGES/STL/OBJ/GLB import is already in this build)</td><td><span className="tag">planned</span></td></tr>
      </tbody></table>

      <h2>10. Keyboard shortcuts (Build)</h2>
      <p><span className="kbd">Ctrl Z</span> undo · <span className="kbd">Ctrl Y</span> redo · <span className="kbd">Del</span> delete selection · <span className="kbd">R</span> rotate 90° · <span className="kbd">E</span> exploded view · <span className="kbd">F</span> frame all · <span className="kbd">Esc</span> cancel</p>
    </div></div>
  );
}
