// Simulation runs off the UI thread so rendering stays responsive (physics is separate from visualisation).
import { runSimulation, type SimConfig } from './engine/simulate';
import type { RobotModel } from './engine/robotModel';

self.onmessage = (e: MessageEvent<{ model: RobotModel; cfg: SimConfig; labels?: Record<string, string> }>) => {
  const { model, cfg, labels } = e.data;
  const res = runSimulation(model, cfg, (f) => (self as any).postMessage({ type: 'progress', value: f }), labels);
  // copy sub-arrays into standalone buffers so they can be transferred without copying again
  const signals: Record<string, Float32Array> = {};
  for (const [k, v] of Object.entries(res.signals)) signals[k] = v.slice();
  const t = res.t.slice();
  (self as any).postMessage({ type: 'done', result: { ...res, t, signals } }, [t.buffer, ...Object.values(signals).map((s) => s.buffer)]);
};
