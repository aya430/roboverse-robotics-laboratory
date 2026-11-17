// Data export (CSV/JSON) and the auto-generated experiment report (HTML → print to PDF).

import type { SimResult } from './simulate';
import type { RobotModel } from './robotModel';
import { getItem } from './catalog';
import { findInst, type Assembly } from './assembly';

export function toCSV(r: SimResult, keys?: string[]): string {
  const cols = (keys ?? r.meta.map((m) => m.key)).filter((k) => r.signals[k]);
  const metaOf = new Map(r.meta.map((m) => [m.key, m]));
  const head = ['Time_s', ...cols.map((k) => `${k.replace(/\./g, '_')}_${(metaOf.get(k)?.unit ?? '').replace(/[^A-Za-z0-9%/²]/g, '')}`)];
  const lines = [head.join(',')];
  for (let i = 0; i < r.t.length; i++) {
    const row = [r.t[i].toFixed(4)];
    for (const k of cols) row.push(Number(r.signals[k][i].toPrecision(7)).toString());
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const f = (v: number, d = 2) => (isFinite(v) ? v.toFixed(d) : '—');

export function svgPlot(t: Float32Array, series: { y: Float32Array; label: string; color: string; dash?: boolean }[], title: string, unit: string, w = 680, h = 210): string {
  const pad = { l: 52, r: 12, t: 22, b: 30 };
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const v of s.y) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const m = (hi - lo) * 0.06; lo -= m; hi += m;
  const T = t.length ? t[t.length - 1] : 1;
  const X = (x: number) => pad.l + (x / T) * (w - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const step = Math.max(1, Math.floor(t.length / 700));
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica,Arial" font-size="10">`;
  out += `<text x="${pad.l}" y="13" font-size="11" font-weight="bold">${esc(title)}</text>`;
  for (let k = 0; k <= 4; k++) {
    const yv = lo + ((hi - lo) * k) / 4, y = Y(yv);
    out += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}" stroke="#ddd"/><text x="${pad.l - 4}" y="${y + 3}" text-anchor="end" fill="#555">${yv.toPrecision(3)}</text>`;
  }
  for (let k = 0; k <= 5; k++) {
    const xv = (T * k) / 5, x = X(xv);
    out += `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${h - pad.b}" stroke="#eee"/><text x="${x}" y="${h - pad.b + 13}" text-anchor="middle" fill="#555">${xv.toFixed(1)}</text>`;
  }
  out += `<text x="${w - pad.r}" y="${h - 4}" text-anchor="end" fill="#555">simulation time (s)</text><text x="12" y="${pad.t + 10}" fill="#555" transform="rotate(-90 12 ${pad.t + 60})">${esc(unit)}</text>`;
  series.forEach((s, si) => {
    let d = '';
    for (let i = 0; i < t.length; i += step) d += `${i ? 'L' : 'M'}${X(t[i]).toFixed(1)},${Y(s.y[i]).toFixed(1)}`;
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.4" ${s.dash ? 'stroke-dasharray="5 3"' : ''}/>`;
    out += `<rect x="${pad.l + 8 + si * 120}" y="${pad.t + 4}" width="10" height="3" fill="${s.color}"/><text x="${pad.l + 22 + si * 120}" y="${pad.t + 8}">${esc(s.label)}</text>`;
  });
  return out + '</svg>';
}

const PAL = ['#1f6fd1', '#d9601a', '#2f9b5f', '#9b3fb5', '#c2a400', '#c43c3c', '#3fa7b5'];

export interface ReportInput {
  asm: Assembly; model: RobotModel; result: SimResult;
  sim: { dt: number; recordHz: number; payload: number; friction: boolean; scenario: any; control: any };
  title: string; author?: string;
}

export function reportHTML(x: ReportInput): string {
  const { asm, model, result: r, sim } = x;
  const S = r.signals, t = r.t;
  const n = model.n;
  const plots: string[] = [];
  const jser = (suffix: string) => model.joints.map((J, i) => ({ y: S[`J${i + 1}.${suffix}`], label: J.name, color: PAL[i % PAL.length] }));
  plots.push(svgPlot(t, jser('q'), 'Joint angle vs time', 'deg'));
  plots.push(svgPlot(t, jser('err'), 'Joint tracking error vs time', 'deg'));
  plots.push(svgPlot(t, jser('tau'), 'Joint torque vs time', 'N·m'));
  plots.push(svgPlot(t, jser('i'), 'Motor current vs time', 'A'));
  plots.push(svgPlot(t, [{ y: S['ee.x'], label: 'X', color: PAL[0] }, { y: S['ee.xref'], label: 'X ref', color: PAL[0], dash: true }, { y: S['ee.y'], label: 'Y', color: PAL[1] }, { y: S['ee.yref'], label: 'Y ref', color: PAL[1], dash: true }, { y: S['ee.z'], label: 'Z', color: PAL[2] }, { y: S['ee.zref'], label: 'Z ref', color: PAL[2], dash: true }], 'End-effector position vs time', 'm'));
  plots.push(svgPlot(t, [{ y: S['pwr.bus'], label: 'Bus power', color: PAL[3] }], 'Electrical bus power vs time', 'W'));
  if (model.power?.kind === 'battery') plots.push(svgPlot(t, [{ y: S['bat.soc'], label: 'SOC', color: PAL[2] }], 'Battery state of charge vs time', '%'));

  const comps = asm.instances.map((i) => {
    const it = getItem(i.item);
    const par = i.parent ? findInst(asm, i.parent) : undefined;
    const port = par ? getItem(par.item).ports.find((p) => p.id === i.parentPort)?.name : '—';
    return `<tr><td>${esc(it.name)}</td><td>${it.category}</td><td>${(i.params?.mass ?? it.mass).toFixed(2)}</td><td>${par ? esc(getItem(par.item).name) + ' › ' + esc(port ?? '') : 'ground'}</td></tr>`;
  }).join('');
  const motors = model.joints.map((J) => `<tr><td>${J.name}</td><td>${J.motor.type}</td><td>${J.motor.T_rated}/${J.motor.T_peak}</td><td>${J.motor.Kt}</td><td>${J.motor.R}</td><td>${(J.motor.L * 1e3).toFixed(2)}</td><td>${J.gear.type} ${J.gear.ratio}:1, η=${J.gear.efficiency}</td><td>${(J.lo * 180 / Math.PI).toFixed(0)}…${(J.hi * 180 / Math.PI).toFixed(0)}</td></tr>`).join('');
  const gains = model.joints.map((J, i) => `<tr><td>${J.name}</td><td>${sim.control.kp[i]}</td><td>${sim.control.ki[i]}</td><td>${sim.control.kd[i]}</td></tr>`).join('');
  const met = r.metrics.joints.map((m) => `<tr><td>${m.joint}</td><td>${f(m.rmseDeg, 3)}</td><td>${f(m.maeDeg, 3)}</td><td>${f(m.maxErrDeg, 3)}</td><td>${f(m.peakTorque, 1)}</td><td>${f(m.rmsCurrent, 2)}</td><td>${f(m.peakCurrent, 2)}</td><td>${f(m.peakSpeedRpm, 0)}</td><td>${f(m.energy, 1)}</td></tr>`).join('');
  const hiT = r.metrics.joints.reduce((a, b) => (b.peakTorque > a.peakTorque ? b : a));
  const hiE = r.metrics.joints.reduce((a, b) => (b.energy > a.energy ? b : a));
  const errs = r.events.filter((e) => e.level !== 'info');
  const sc = sim.scenario;
  const scText = sc.kind === 'pickplace' ? `Pick-and-place: pick (${sc.pick.join(', ')}) m → place (${sc.place.join(', ')}) m, approach ${sc.approach} m, speed ${(sc.speed * 100).toFixed(0)} % of joint limits, dwell ${sc.dwell} s.`
    : sc.kind === 'step' ? `Step response: J${sc.joint + 1} step of ${sc.ampDeg}° at t = ${sc.tStep} s, observed for ${sc.hold} s.` : `Point-to-point joint move at ${(sc.speed * 100).toFixed(0)} % speed.`;
  const obs = [
    `The highest peak joint torque was ${f(hiT.peakTorque, 1)} N·m at ${hiT.joint}; the largest electrical energy share was drawn by ${hiE.joint} (${f(hiE.energy, 1)} J).`,
    `TCP tracking RMSE was ${f(r.metrics.eeRmseMm, 2)} mm (maximum ${f(r.metrics.eeMaxMm, 2)} mm) with the ${sim.control.mode} controller sampled at ${(1 / r.metrics.Ts).toFixed(0)} Hz.`,
    `Total electrical energy ${f(r.metrics.energyJ, 1)} J over a ${f(r.metrics.cycleTime, 2)} s cycle (average ${f(r.metrics.avgPowerW, 1)} W, peak ${f(r.metrics.peakPowerW, 1)} W).`,
    errs.length ? `${errs.length} warning/error event(s) were raised: ${errs.slice(0, 4).map((e) => esc(e.text)).join('; ')}${errs.length > 4 ? '…' : ''}.` : 'No overload, joint-limit or collision events were raised.',
  ];
  if (r.metrics.step) obs.push(`Step response of ${r.metrics.step.joint}: rise time ${f(r.metrics.step.riseTime * 1000, 0)} ms, settling time ${isFinite(r.metrics.step.settlingTime) ? f(r.metrics.step.settlingTime * 1000, 0) + ' ms' : 'not reached (±2 %)'}, overshoot ${f(r.metrics.step.overshootPct, 1)} %, steady-state error ${f(r.metrics.step.steadyStateError, 3)}°.`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(x.title)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;color:#1d2330;max-width:820px;margin:28px auto;padding:0 20px;font-size:12.5px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;border-bottom:2px solid #e8833a;padding-bottom:3px;margin:22px 0 8px}
table{border-collapse:collapse;width:100%;margin:6px 0;font-size:11.5px}th,td{border:1px solid #ccd3dc;padding:3px 6px;text-align:left}th{background:#f1f4f8}
.eq{font-family:Menlo,Consolas,monospace;background:#f6f8fa;border:1px solid #dde3ea;padding:6px 9px;margin:4px 0;white-space:pre-wrap}
.meta{color:#5a6577}.ed{border:1px dashed #b9c4d2;padding:6px 8px;border-radius:4px}svg{display:block;margin:8px 0;max-width:100%}
.noprint{background:#fff6e6;border:1px solid #f0c27a;padding:8px;border-radius:5px;margin-bottom:14px}@media print{.noprint{display:none}.ed{border:0}h2{break-after:avoid}svg{break-inside:avoid}}</style></head><body>
<div class="noprint">This report was generated from the simulation data. Observations and conclusion are editable – click to edit, then use <b>Print → Save as PDF</b>. <button onclick="print()">Print / Save as PDF</button></div>
<h1>${esc(x.title)}</h1><div class="meta">ROBOVERSE Virtual Robotics Laboratory · generated ${new Date().toLocaleString()}${x.author ? ' · ' + esc(x.author) : ''}</div>
<h2>1. Experiment</h2><p><b>Robot:</b> ${esc(asm.name)} — ${n}-DOF serial manipulator${model.gripper ? ' with ' + model.gripper.kind + ' gripper' : ''}, total mass ${model.totalMass.toFixed(2)} kg.</p>
<h2>2. Robot type and assembly structure</h2><table><tr><th>Component</th><th>Category</th><th>Mass kg</th><th>Mounted on</th></tr>${comps}</table>
<h2>3. Motor and transmission specifications</h2><table><tr><th>Joint</th><th>Motor</th><th>T rated/peak N·m</th><th>Kt N·m/A</th><th>R Ω</th><th>L mH</th><th>Gearbox</th><th>Limits °</th></tr>${motors}</table>
<p class="meta">Parameters are ROBOVERSE generic class-representative values (not manufacturer datasheets) unless overridden by the student.</p>
<h2>4. Simulation conditions</h2><p>${esc(scText)} Payload ${sim.payload} kg. Physics step ${sim.dt * 1000} ms (semi-implicit Euler), recording ${sim.recordHz} Hz, friction ${sim.friction ? 'on' : 'off'}. Simulated ${r.metrics.simTime.toFixed(2)} s in ${r.metrics.wallTime.toFixed(2)} s wall-clock (${(r.metrics.simTime / Math.max(1e-6, r.metrics.wallTime)).toFixed(1)}× real time).</p>
<h2>5. Mathematical models</h2>
<div class="eq">Rigid body:  M(q) q̈ + C(q,q̇) q̇ + G(q) + F(q̇) = τ      (RNEA inverse dynamics; M from unit-acceleration RNEA calls + N²·Jm)</div>
<div class="eq">Friction:  F(q̇) = b·q̇ + Fc·tanh(q̇ / 0.01)</div>
<div class="eq">Motor:  L di/dt = V − R i − Ke·N·q̇ ,  τ_m = Kt·i ,  τ_joint = N·η·τ_m (motoring) or N·τ_m/η (back-driven)</div>
<div class="eq">Battery:  SOC(t) = 1 − ∫ P_bus / (V_bus · 3600 · C_Ah) dt ,  P_bus = Σ max(0, V_j i_j) + 12 W logic</div>
<div class="eq">Trajectory (quintic):  q(t) = q0 + (q1 − q0)(10τ³ − 15τ⁴ + 6τ⁵), τ = t/T ;  IK: damped least squares Δq = Jᵀ(JJᵀ + λ²I)⁻¹e</div>
<h2>6. Control parameters</h2><p>Mode <b>${sim.control.mode}</b>, sampling ${(1 / r.metrics.Ts).toFixed(0)} Hz, current-loop bandwidth ${sim.control.currentBw} Hz${sim.control.mode === 'CTC' ? `, ωn = ${sim.control.ctcWn} rad/s, ζ = ${sim.control.ctcZeta}` : ''}.</p>
<table><tr><th>Joint</th><th>Kp N·m/rad</th><th>Ki N·m/(rad·s)</th><th>Kd N·m·s/rad</th></tr>${gains}</table>
<h2>7. Graphs</h2>${plots.join('')}
<h2>8. Performance metrics</h2><table><tr><th>Joint</th><th>RMSE °</th><th>MAE °</th><th>Max err °</th><th>Peak τ N·m</th><th>RMS I A</th><th>Peak I A</th><th>Peak rpm</th><th>Energy J</th></tr>${met}</table>
<p>TCP RMSE ${f(r.metrics.eeRmseMm)} mm · max ${f(r.metrics.eeMaxMm)} mm · energy ${f(r.metrics.energyJ, 1)} J · peak power ${f(r.metrics.peakPowerW, 1)} W${model.power?.kind === 'battery' ? ` · final SOC ${(r.metrics.socEnd * 100).toFixed(3)} %` : ''}.</p>
<h2>9. Observations</h2><div class="ed" contenteditable="true"><ul>${obs.map((o) => `<li>${o}</li>`).join('')}</ul></div>
<h2>10. Conclusion</h2><div class="ed" contenteditable="true"><p>${r.events.some((e) => e.level === 'error') ? 'The design did not complete the task within its ratings; see the error events above and revise motor/gearbox sizing or the trajectory.' : `The assembled ${n}-DOF robot completed the ${sc.kind === 'pickplace' ? 'pick-and-place task' : 'experiment'} within its actuator ratings.`} (Edit this conclusion before submitting.)</p></div>
</body></html>`;
}
