# ROBOVERSE – Architecture and Development Plan

This document answers Part 31 of the specification: system architecture, technology selection,
database design, component schema, assembly architecture, 3D model import strategy, simulation
architecture, UI/UX design and roadmap. Sections marked **[built]** describe code in this repository;
**[planned]** describes the agreed design for later phases.

---

## 1. System architecture

```
                         ┌───────────────────────── Browser (React + TypeScript) ─────────────────────────┐
                         │                                                                               │
  Component catalog ───► │  Assembly engine ──► RobotModel ──┬──► 3D scene (three.js, replay only)        │
  (JSON, CAD assets)     │  (instances, ports,   (joints,     ├──► Kinematics (FK, IK, J, DH, workspace)  │
                         │   overrides, undo)     bodies,     ├──► Dynamics (RNEA, M(q))                  │
                         │                        motors,     ├──► Simulation (Web Worker) ──► Signals ──┐│
                         │                        electronics)├──► URDF / report / CSV / JSON export     ││
                         │                                    └──► Validation & sizing                   ││
                         │  Waveform lab ◄────────────────────────────────────────────────────────────────┘│
                         └───────────────▲───────────────────────────────────────────────────────────────┘
                                         │ HTTPS / WebSocket (planned)
          ┌──────────────────────────────┴──────────────────────────────────────────────┐
          │ FastAPI gateway: auth, projects, catalog, results, exports        [planned]  │
          │  ├─ PostgreSQL (schema in backend/schema.sql)                                │
          │  ├─ Redis + workers: CAD conversion (OCCT), long simulations, reports         │
          │  ├─ Simulation orchestrator → MuJoCo / Gazebo / Webots containers             │
          │  └─ ROS 2 bridge (rosbridge_suite / Foxglove WS) → ros2_control, MoveIt 2      │
          └──────────────────────────────────────────────────────────────────────────────┘
```

Design rules (all enforced in the built code):

* **One engineering model.** The assembly is the only source of truth. `buildRobotModel()` derives joint
  frames, link inertials, actuators, sensors and electronics; every other module consumes that model.
  Component instance IDs are preserved from assembly to URDF, results and saved projects.
* **Physics ≠ rendering.** The simulator runs in a Web Worker on its own fixed time step and records
  samples. The 3D view only replays recorded states (or posing sliders). The same engine runs unchanged in
  Node (unit tests) and is a direct port target for the Python/C++ backend.
* **No fake data.** Waveforms, metrics and reports are computed from recorded simulation samples only.
* **SI units internally**; degrees, mm and rpm only at the UI boundary.

## 2. Technology selection and justification

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript + Vite | Typed, component-based, fast builds; static output deployable to any CDN |
| 3D | three.js (direct, not React-Three-Fiber) | The scene is rebuilt from the assembly and posed every frame from engine data; an imperative scene manager is simpler and faster than reconciling a declarative tree. R3F can be adopted later for UI-heavy overlays without touching the engine |
| State | Zustand | Minimal global store with undo/redo stacks and derived robot model |
| Plots | uPlot | Handles 10⁵ points per series at 60 fps; synchronised cursors; small (≈45 kB) |
| Engine | Dependency-free TypeScript | Runs in browser, Worker and Node; portable to Python/C++ |
| Tests | Vitest | Same TS toolchain, fast |
| Backend [planned] | Python FastAPI + PostgreSQL + Redis | Python is the lingua franca of robotics/ML (PyTorch, OpenCV, MuJoCo bindings, rclpy) |
| Robotics [planned] | ROS 2 Humble/Jazzy, MoveIt 2, ros2_control | Industry standard; URDF exported here is the hand-off point |
| Physics [planned] | MuJoCo (contact-rich: humanoid, quadruped), Gazebo (ROS 2), Webots (education) | Contact, closed chains and floating bases need a full physics engine; the in-browser RNEA simulator remains for fast serial-arm labs |
| CAD [planned] | Open CASCADE (via pythonOCC / FreeCAD) | STEP/IGES tessellation to GLB with units and hierarchy |
| Java | Not used | No requirement justifies a JVM service yet (spec Part 17/25) |
| Hosting | GitHub + Cloudflare Pages (static) + container host for simulation | Static front end is free and global; heavy compute stays server-side |

## 3. Database design [planned – schema ready]

`backend/schema.sql` defines the PostgreSQL schema: `users`, `projects`, `project_versions`
(immutable JSON snapshots → version history), `components`, `component_assets`, `component_ports`,
`materials`, `robot_templates`, `assemblies`, `assembly_instances`, `simulation_settings`,
`simulation_runs`, `simulation_signals` (columnar float arrays per signal), `experiments`,
`exercises`, `exported_reports`. The browser build stores projects in `localStorage` using the same
`ProjectFile` JSON (format `roboverse-project`, version 1) that the API will accept, so migration is a
straight upload.

## 4. Component data schema [built]

```ts
CatalogItem {
  id, name, category, sub, description, material, mass,          // kg
  shapes: Shape[]          // primitives: cyl [r,h] | box [x,y,z], pos, rot (XYZ deg), onOutput?, finger?
  ports: Port[]            // { id, name, iface, dir: 'in'|'out', pos, rot, rotary?, hint }
  motor?: MotorSpec        // V_nom, Kt, Ke, R, L, Jm, I_rated, I_peak, T_rated, T_peak, rpm_rated, rpm_max, η, encoder_bits
  gearbox?: GearboxSpec    // ratio, η, T_rated, T_peak, backlash, limit_deg, viscous, coulomb, vmax_dps
  elec?: ElecSpec          // controller | driver | battery | psu ratings
  gripper?, ft?, role?, root?
  source: { origin, licence, note }                              // provenance for every asset
}
Instance { uid, item, parent?, parentPort?, clock (×90°), loose?, params? (overrides), hidden? }
```

Interface codes (`AM-L/M/S`, `AM-N23`, `SH-14/11/8`, `FL-L/M/S`, `TF-40`, `EBAY`) encode bolt pattern,
spigot, shaft diameter and flange PCD. A connection is legal only when codes match exactly.

## 5. Robot assembly architecture [built]

* **Port frames point downstream.** Mounting a child aligns its input frame with the parent's output frame:
  `T_child = T_parentPort · Rz(q if rotary) · Rz(clock·90°) · P_in⁻¹`.
* **Joints come from transmissions.** A gearbox's rotary output port is a revolute joint; its housing belongs
  to the parent body and its output flange to the child body. The motor on its input drives it.
* **Bodies** are the rigid groups between joints; mass properties are integrated from primitives
  (volume-weighted mass, solid cylinder/box inertia, parallel-axis theorem) and expressed in joint frames.
* **Validation** runs on every change: interface compatibility, connectivity to the base, motor/gearbox
  pairing, serial-chain check (branches assemble but are flagged as not simulatable), electronics presence,
  channel count and current capability, static torque sizing across a pose grid with payload.
* **Assistant**: `suggestedPorts(item)` (where can this go?) and `itemsForPort(port)` (what can go here?),
  `swapCandidates()` (interface-identical replacements that keep the sub-assembly).
* **Guided mode** is data (`ARM6_STEPS`): each step lists acceptable parts and the parent step/port; progress
  is computed by matching the live assembly, so students may deviate and come back.

## 6. 3D model import strategy [built in the browser; server pipeline planned]

**Built:** `src/ui/cadImport.ts` + `CadImportDialog.tsx`. STEP/IGES/BREP are tessellated client-side by
Open CASCADE compiled to WASM (occt-import-js, loaded only when needed); STL/OBJ/GLB/GLTF use three.js
loaders. The mesh is scaled to metres, converted to Z-up, welded, centred, checked for watertightness and
its exact volume computed (signed tetrahedra) → mass from material density. The user records licence,
author and source, chooses the input interface and any output interfaces (position + direction), and may
attach an actuator model copied from a catalog part. The component is stored (base64 geometry) inside the
project file, so it reopens anywhere. Nothing is uploaded.

**Planned server pipeline (large assemblies):**

1. Accept STEP/STP/IGES/STL/OBJ/GLB/GLTF/FBX/URDF/SDF uploads or licensed API pulls (no scraping, no
   bypassing download controls, no redistribution of manufacturer CAD without permission).
2. Worker pipeline: OCCT tessellation (STEP → mesh), unit detection, hierarchy preservation, decimation for
   web, Draco/Meshopt compression → GLB; mass properties from B-rep when density is known.
3. A **port authoring** step (UI) lets an instructor place interface frames on the imported mesh and assign
   interface codes; the asset then behaves exactly like the procedural parts.
4. Every asset stores id, source, licence, author/manufacturer, format, units, dimensions, mass properties,
   ports, material and version (table `component_assets`). The procedural catalog already carries the
   same provenance fields.

## 7. Simulation architecture [built for serial arms]

```
trajectory (quintic, IK waypoints) ─► controller @ Ts (ZOH; PID | PID+G | CTC; anti-windup)
   ─► current command (≤ min(I_peak motor, I_peak driver))
   ─► current loop (1st-order, bandwidth f_c, limited by V_bus) ─► motor L di/dt = V − Ri − Ke·N·q̇
   ─► τ_joint = N·η·Kt·i  (1/η when back-driven)
   ─► forward dynamics M(q)q̈ = τ − C q̇ − G − F  (RNEA + Cholesky), semi-implicit Euler, dt = 0.5 ms
   ─► encoders (quantised), velocity filter, F/T wrench (RNEA body accelerations), battery SOC, events
   ─► recorder (configurable Hz) ─► signals, metrics, events
```

Default 7 s pick-and-place: 14 101 physics steps simulated in ≈1.2 s (≈6× real time) in a browser worker.
The `SimulationEngine` boundary (`runSimulation(model, config) → SimResult`) is the plug-in point for
MuJoCo/Gazebo adapters: same inputs (RobotModel/URDF + config), same output (signals + metrics + events).

## 8. UI/UX design [built]

* CAD-style workspace: library / assembly tree (left), viewport with guided card, toolbar and legend
  (centre), properties & assistant (right), engineering console / validation / calculations (bottom).
* Colour code: blue = recommended mounting point (pulsing), yellow = incomplete interface,
  grey = free / unconnected part, red = invalid attempt (flash + explanation), green = connected.
* Keyboard: Ctrl Z/Y, Del, R, E, F, Esc, Ctrl S.
* Pages: Dashboard, Hands-on Library, Component Library, Build a Robot, Simulation & Control, Waveform
  Analysis, My Projects, Documentation. Labs not yet built are listed as roadmap, never as dead buttons.

## 9. Development roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Platform, dashboard, 3D viewport, 176-part CAD library, CAD import, asset records | **done** |
| 2 | Pick-and-place assembly engine, assistant, validation | **done** |
| 3 | Arm designer (2–7 DOF), FK/IK/DH/Jacobian, trajectories | **done** |
| 4 | Dynamics, motors, PID/CTC, simulation timeline, 3D replay | **done** |
| 5 | Waveforms, metrics, CSV/JSON/URDF/report export | **done** |
| 6 | Humanoid lab: floating-base model, contacts, COM/ZMP balance, MuJoCo backend, humanoid parts (hip/knee/ankle actuators, feet with contact sensors, hands) | next |
| 7 | Quadruped lab: 8/12/16-DOF legs, gait generator (trot/pace/bound/gallop), foot forces | |
| 8 | Industrial families: SCARA ✔, Cartesian/gantry ✔, modular cobot arm ✔, desktop servo arm ✔; delta (closed chains via loop constraints), dual-arm, welding paths | partly done |
| 9 | FastAPI + PostgreSQL, accounts, CAD import, ROS 2 bridge, MoveIt 2 config export, Gazebo/Webots, sandboxed Python/C++ runner (gVisor/Firecracker, CPU/memory/time limits) | |

Each phase keeps the project file format backward compatible (versioned `ProjectFile`).
