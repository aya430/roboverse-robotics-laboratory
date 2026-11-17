// Performance metrics computed from recorded simulation samples.

export function rmse(a: ArrayLike<number>, b: ArrayLike<number>, from = 0, to = a.length) {
  let s = 0, n = 0;
  for (let i = from; i < to; i++) { const d = a[i] - b[i]; s += d * d; n++; }
  return n ? Math.sqrt(s / n) : 0;
}
export function mae(a: ArrayLike<number>, b: ArrayLike<number>, from = 0, to = a.length) {
  let s = 0, n = 0;
  for (let i = from; i < to; i++) { s += Math.abs(a[i] - b[i]); n++; }
  return n ? s / n : 0;
}
export function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

export interface StepMetrics { riseTime: number; settlingTime: number; overshootPct: number; steadyStateError: number; peakTime: number }

/**
 * Classical step-response metrics for y(t) responding to a step from y0 to yf applied at tStep.
 * Rise time 10–90 %, settling time to a ±2 % band (of |yf − y0|), overshoot relative to the step size.
 */
export function stepMetrics(t: ArrayLike<number>, y: ArrayLike<number>, y0: number, yf: number, tStep: number, band = 0.02): StepMetrics {
  const A = yf - y0;
  const sgn = Math.sign(A) || 1;
  let t10 = NaN, t90 = NaN, peak = -Infinity, tPeak = NaN;
  let start = 0;
  while (start < t.length && t[start] < tStep) start++;
  for (let i = start; i < t.length; i++) {
    const r = ((y[i] - y0) / A);
    if (isNaN(t10) && r >= 0.1) t10 = t[i];
    if (isNaN(t90) && r >= 0.9) t90 = t[i];
    const v = sgn * (y[i] - y0);
    if (v > peak) { peak = v; tPeak = t[i]; }
  }
  let settle = NaN;
  for (let i = t.length - 1; i >= start; i--) {
    if (Math.abs(y[i] - yf) > band * Math.abs(A)) { settle = i + 1 < t.length ? t[i + 1] - tStep : NaN; break; }
    if (i === start) settle = 0;
  }
  const tail = Math.max(start, Math.floor(t.length * 0.9));
  let sse = 0;
  for (let i = tail; i < t.length; i++) sse += yf - y[i];
  sse /= Math.max(1, t.length - tail);
  return {
    riseTime: t90 - t10,
    settlingTime: settle,
    overshootPct: Math.max(0, ((peak - Math.abs(A)) / Math.abs(A)) * 100),
    steadyStateError: sse,
    peakTime: tPeak - tStep,
  };
}
