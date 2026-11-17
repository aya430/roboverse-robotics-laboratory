# ROBOVERSE backend (Phase 9 – planned)

The current release runs entirely in the browser: the robotics engine, simulator, exports and project
storage need no server. This folder holds the agreed backend design so that later phases plug in
without changing the front end or the project file format.

* `schema.sql` – PostgreSQL schema (users, projects + immutable versions, components, assets with
  licence/provenance, ports, templates, simulation runs and columnar signals, exercises, reports).

Planned services (see `documentation/ARCHITECTURE.md`):

| Service | Stack | Responsibility |
|---|---|---|
| api | Python 3.12, FastAPI, SQLAlchemy | auth, projects/versions, catalog, results, exports |
| cad-conversion worker | pythonOCC / FreeCAD, trimesh, gltf-transform | STEP/STL/OBJ → GLB, units, hierarchy, mass properties |
| simulation orchestrator | Redis queue, Docker | MuJoCo / Gazebo / Webots runs from exported URDF/MJCF |
| ros2-bridge | ROS 2 Jazzy, rosbridge_suite, ros2_control, MoveIt 2 | joint states, TF, commands over WSS |
| code-runner | gVisor / Firecracker sandbox | student Python/C++ with CPU, memory and time limits |
