# ROBOVERSE quick user guide (first acceptance demo)

1. **Dashboard → Start guided assembly.** Mode A shows the 23-step 6-DOF build with a progress bar.
2. **Pick → Place.** Click *Pick recommended part* (or any part in the library, or drag it into the 3D view).
   Blue pulsing rings mark where it can be mounted; the right panel lists the suggested installation
   locations. Click a blue ring (or *Install*). Incompatible attempts flash red and the console explains why.
3. **Inspect.** Select any part to edit its engineering parameters (motor Kt, R, L, Jm, currents; gear
   ratio, efficiency, ratings, joint limits; mass) or replace it with an interface-compatible alternative.
4. **Validate.** Bottom panel → *Validation* (DOF, electronics, sizing) and *Engineering calculations*
   (torque sizing, link mass properties, DH table). The header shows mass, COM, reach and payload.
5. **Simulation & Control.** Choose pick-and-place, step response or move-to-IK-target; set payload,
   controller law and gains, sampling time and physics step; *Run simulation*. Use the play bar to replay;
   the right panel shows live joint, motor, power, battery, F/T values and metrics; click an event to jump.
6. **Kinematics tab.** Pose joints (FK), read the TCP pose, Jacobian and manipulability, solve IK,
   show the workspace cloud.
7. **Waveform Analysis.** Select signals per plot, drag/wheel to zoom, Shift-drag to pan, read values with
   the synchronised cursor, set axis limits, export PNG/CSV.
8. **Export.** CSV / JSON / report (print → PDF) / URDF. **Save** (Ctrl S), **My Projects** to reopen or
   export a `.roboverse.json` file.
