# Numerical validation report

All results below are produced by the engine in this repository (`frontend/src/engine`) for the
6-DOF reference arm built by the guided assembly (40.9 kg total, 6 revolute joints).
Automated checks live in `frontend/tests/engine.test.ts` and run with `npm test` (19 tests).

## Kinematics

| Check | Method | Result |
|---|---|---|
| DH extraction | 1 000 random configurations, TCP position from DH product vs transform chain | max error 6.8 × 10⁻¹⁶ m (machine precision) |
| Geometric Jacobian | central finite differences, h = 10⁻⁶ rad | agreement to 10⁻⁶ |
| Inverse kinematics | 20 random reachable poses (position + orientation), perturbed start | ≥ 18/20 converge, position error < 1 mm (typ. < 0.01 mm) |

## Dynamics

| Check | Method | Result |
|---|---|---|
| Mass matrix | symmetry and positive definiteness at random q | symmetric to 10⁻¹⁰, PD |
| Gravity vector | G(q) vs numerical gradient of potential energy | agreement to 10⁻⁵ N·m |
| RNEA consistency | τ = M(q) q̈ + h(q, q̇) at random states | agreement to 10⁻⁸ N·m |
| Energy conservation | no friction, zero torque, RK4, dt = 1 ms, 2 s | relative drift 2.9 × 10⁻⁸ (E₀ = 131.6 J) |
| Payload | Δτ₂ of a 2 kg TCP payload vs analytic z·(r × m g) | agreement to 10⁻⁸ N·m |

## All robot templates (revolute and prismatic chains)

`frontend/tests/templates.test.ts` repeats the checks for every template – 6R arm, 5R modular arm,
SCARA (RRPR), Cartesian gantry (PPP) and desktop servo arm (4R):

| Check | Criterion | Result |
|---|---|---|
| Joint structure | expected R/P sequence, no assembly errors or warnings | pass (5/5) |
| Jacobian (incl. prismatic columns) | finite differences | agreement to 10⁻⁵ |
| Gravity vector | G(q) = ∇PE | agreement to 10⁻⁴ |
| Energy conservation | RK4, 0.5 ms, 0.2 s, no friction/torque | relative drift < 10⁻⁶ |
| RNEA vs M q̈ + h | random state | agreement to 10⁻⁷ |
| Pick-and-place simulation | no error events, TCP RMSE < 15 mm | pass (5/5): 6R 3.9 mm, 5R 3.9 mm, SCARA 1.9 mm, gantry 1.3 mm, desktop 2.6 mm |
| Catalog consistency (176 parts) | unique ports, ≤ 1 input, positive volumes/inertias, Kt = Ke, T = Kt·I, joint speed limit reachable within motor speed limit | pass |

## Simulation convergence (pick-and-place, 1 kg, PID + gravity compensation)

| Physics step | TCP RMSE (mm) | Energy (J) | Peak J2 torque (N·m) | Wall time (s) |
|---|---|---|---|---|
| 1.0 ms | 5.44 | 181.69 | 53.05 | 0.41 |
| 0.5 ms (default) | 5.51 | 181.73 | 53.09 | 0.57 |
| 0.25 ms | 5.54 | 181.75 | 53.10 | 0.98 |

Results change by < 0.1 % between 0.5 ms and 0.25 ms, so the default step is converged.

## Controller comparison (J2 step of 5°, no payload)

| Control law | Rise time | Settling (±2 %) | Overshoot | Steady-state error |
|---|---|---|---|---|
| PID | 70 ms | not reached in 1.5 s | 10.9 % | −0.44° |
| PID + gravity compensation | 82 ms | 1.12 s | 0 % | 0.09° |
| Computed torque (ωn = 30 rad/s, ζ = 1) | 143 ms | 0.34 s | 0.6 % | −0.03° |

Pick-and-place TCP RMSE / max: PID 9.86 / 28.1 mm, PID + G 5.51 / 14.5 mm, CTC 2.06 / 5.45 mm.
These are the expected qualitative trends (model-based feed-forward removes the gravity disturbance).

## Assumptions and solver limitations

* Rigid links; constant gearbox efficiency; backlash not simulated; no joint elasticity.
* Current loop modelled as a first-order closed loop limited by bus voltage (real FOC runs at 10–40 kHz).
* No regenerative braking into the battery; 12 W logic power; battery voltage linear in SOC.
* Collision checking limited to the ground plane for the TCP and joint housings.
* Serial chains only; branched / closed-loop / floating-base robots require the planned MuJoCo backend.
* Component parameters are generic class-representative values, internally consistent (unit-tested:
  Kt = Ke in SI, T = Kt·I, no-load speed ≥ rated speed) but not manufacturer data.
