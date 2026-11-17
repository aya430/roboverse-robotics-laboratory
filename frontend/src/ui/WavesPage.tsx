import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../store';
import { toCSV } from '../engine/report';
import { download, slug } from './common';
import type { SimResult } from '../engine/simulate';

const PAL = ['#4a8dff', '#f08a3c', '#35c48a', '#c77dff', '#e6c229', '#ff6b6b', '#3fc6d6', '#a0b3c9', '#ff9fd0', '#9be564'];

interface Panel { id: number; keys: string[]; yMin?: number; yMax?: number }

function wheelZoomPlugin(): uPlot.Plugin {
  return {
    hooks: {
      ready: (u) => {
        const over = u.over;
        over.addEventListener('wheel', (e) => {
          e.preventDefault();
          const { left } = u.cursor;
          const xVal = u.posToVal(left ?? 0, 'x');
          const min = u.scales.x.min!, max = u.scales.x.max!;
          const f = e.deltaY < 0 ? 0.8 : 1.25;
          const nmin = xVal - (xVal - min) * f, nmax = xVal + (max - xVal) * f;
          u.setScale('x', { min: Math.max(u.data[0][0], nmin), max: Math.min(u.data[0][u.data[0].length - 1], nmax) });
        }, { passive: false });
        // shift + drag pans the time axis
        let drag: { x: number; min: number; max: number } | null = null;
        over.addEventListener('mousedown', (e) => { if (e.shiftKey) { drag = { x: e.clientX, min: u.scales.x.min!, max: u.scales.x.max! }; e.stopPropagation(); e.preventDefault(); } }, true);
        window.addEventListener('mousemove', (e) => {
          if (!drag) return;
          const dx = ((e.clientX - drag.x) / over.clientWidth) * (drag.max - drag.min);
          u.setScale('x', { min: drag.min - dx, max: drag.max - dx });
        });
        window.addEventListener('mouseup', () => { drag = null; });
      },
    },
  };
}

function Chart({ r, panel, sync, onRemove, active, onActivate, setLimits }: { r: SimResult; panel: Panel; sync: uPlot.SyncPubSub; onRemove: () => void; active: boolean; onActivate: () => void; setLimits: (lo?: number, hi?: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const metaOf = useMemo(() => new Map(r.meta.map((m) => [m.key, m])), [r]);
  const units = [...new Set(panel.keys.map((k) => metaOf.get(k)?.unit ?? ''))];
  useEffect(() => {
    if (!host.current) return;
    const w = host.current.clientWidth;
    const series: uPlot.Series[] = [{ label: 't (s)', value: (_u, v) => (v == null ? '—' : v.toFixed(3)) }];
    panel.keys.forEach((k, i) => {
      const m = metaOf.get(k)!;
      series.push({ label: `${m.label} [${m.unit}]`, stroke: PAL[i % PAL.length], width: 1.5, scale: m.unit, dash: /ref/.test(k) ? [6, 4] : undefined, value: (_u, v) => (v == null ? '—' : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4)) });
    });
    const axes: uPlot.Axis[] = [
      { stroke: '#8d99a8', grid: { stroke: '#232a33' }, ticks: { stroke: '#2a323d' }, label: 'simulation time (s)', labelSize: 18, font: '11px IBM Plex Sans' },
    ];
    const scales: uPlot.Scales = { x: { time: false } };
    units.forEach((u, i) => {
      scales[u] = panel.yMin !== undefined && panel.yMax !== undefined && i === 0 ? { auto: false, range: [panel.yMin, panel.yMax] } : { auto: true };
      if (i < 2) axes.push({ scale: u, side: i === 0 ? 3 : 1, label: u, labelSize: 16, stroke: '#8d99a8', grid: { show: i === 0, stroke: '#232a33' }, ticks: { stroke: '#2a323d' }, font: '11px IBM Plex Mono', size: 58 });
    });
    const data: uPlot.AlignedData = [Array.from(r.t), ...panel.keys.map((k) => Array.from(r.signals[k]))];
    const u = new uPlot({
      width: w, height: 240, series, axes, scales, plugins: [wheelZoomPlugin()],
      cursor: { sync: { key: sync.key }, drag: { x: true, y: false } },
      legend: { live: true },
    }, data, host.current);
    plot.current = u;
    const ro = new ResizeObserver(() => u.setSize({ width: host.current!.clientWidth, height: 240 }));
    ro.observe(host.current);
    return () => { ro.disconnect(); u.destroy(); };
  }, [r, panel.keys.join('|'), panel.yMin, panel.yMax]);

  const png = () => {
    const u = plot.current;
    if (!u) return;
    const c = document.createElement('canvas');
    const src = u.ctx.canvas;
    c.width = src.width; c.height = src.height + 30;
    const g = c.getContext('2d')!;
    g.fillStyle = '#151a21'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 30);
    g.fillStyle = '#dfe5ec'; g.font = `${14 * devicePixelRatio}px sans-serif`;
    g.fillText(panel.keys.map((k) => metaOf.get(k)?.label).join(', '), 10, 20);
    c.toBlob((b) => b && download('waveform.png', b));
  };
  return (
    <div className="wave-card" style={{ borderColor: active ? 'var(--accent)' : undefined }} onClick={onActivate}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="small"><b>{[...new Set(panel.keys.map((k) => metaOf.get(k)?.group))].join(' · ') || 'Empty plot'}</b>{units.length > 2 && <span className="tag warn" style={{ marginLeft: 6 }}>more than two units – extra series share hidden axes</span>}</div>
        <div className="row">
          <span className="dim small">y:</span>
          <input type="number" placeholder="auto" style={{ width: 62 }} defaultValue={panel.yMin} onBlur={(e) => setLimits(e.target.value === '' ? undefined : +e.target.value, panel.yMax)} />
          <input type="number" placeholder="auto" style={{ width: 62 }} defaultValue={panel.yMax} onBlur={(e) => setLimits(panel.yMin, e.target.value === '' ? undefined : +e.target.value)} />
          <button className="btn sm" onClick={() => { const u = plot.current!; u.setScale('x', { min: u.data[0][0], max: u.data[0][u.data[0].length - 1] }); setLimits(undefined, undefined); }}>Autoscale</button>
          <button className="btn sm" onClick={png}>PNG</button>
          <button className="btn sm" onClick={() => download('waveform_selection.csv', toCSV(r, panel.keys), 'text/csv')}>CSV</button>
          <button className="btn sm danger" onClick={onRemove}>✕</button>
        </div>
      </div>
      {panel.keys.length ? <div ref={host} /> : <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>Select signals in the left panel to add them to this plot.</div>}
    </div>
  );
}

export function WavesPage() {
  const { result, asm, setPage } = useStore();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState('');
  const sync = useMemo(() => uPlot.sync('rv'), []);
  useEffect(() => {
    if (!result?.ok) return;
    const n = Object.keys(result.signals).filter((k) => /^J\d+\.q$/.test(k)).length;
    const J = (s: string) => Array.from({ length: n }, (_, i) => `J${i + 1}.${s}`);
    setPanels([
      { id: 1, keys: J('q') },
      { id: 2, keys: ['J2.q', 'J2.qref', 'J3.q', 'J3.qref'].filter((k) => result.signals[k]) },
      { id: 3, keys: J('tau') },
      { id: 4, keys: J('i') },
      { id: 5, keys: ['ee.x', 'ee.xref', 'ee.y', 'ee.yref', 'ee.z', 'ee.zref'] },
      { id: 6, keys: ['ee.err'] },
      { id: 7, keys: J('err') },
      { id: 8, keys: ['pwr.bus', ...J('pm')] },
    ]);
    setActive(0);
  }, [result]);

  if (!result?.ok) {
    return <div className="page"><div className="page-in"><div className="card" style={{ maxWidth: 520 }}>
      <h3>No simulation data yet</h3>
      <p className="muted">Waveforms are plotted from recorded simulation samples only – nothing is generated synthetically. Run a simulation first.</p>
      <button className="btn primary" onClick={() => setPage('sim')}>Open Simulation Lab</button>
    </div></div></div>;
  }
  const groups = [...new Set(result.meta.map((m) => m.group))];
  const cur = panels[active];
  const toggle = (k: string) => {
    if (!cur) { setPanels([...panels, { id: Date.now(), keys: [k] }]); setActive(panels.length); return; }
    const keys = cur.keys.includes(k) ? cur.keys.filter((x) => x !== k) : [...cur.keys, k];
    setPanels(panels.map((p, i) => (i === active ? { ...p, keys } : p)));
  };
  return (
    <div className="waves">
      <div className="panel">
        <div className="panel-h">Signals → plot {active + 1}</div>
        <div className="panel-b">
          <input className="lib-search" placeholder="Filter signals…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {groups.map((g) => {
            const list = result.meta.filter((m) => m.group === g && `${m.label} ${m.key}`.toLowerCase().includes(filter.toLowerCase()));
            if (!list.length) return null;
            return <div key={g}>
              <div className="lib-cat">{g}</div>
              {list.map((m) => (
                <label key={m.key} className="row small" style={{ padding: '1px 0', flexWrap: 'nowrap' }}>
                  <input type="checkbox" checked={!!cur?.keys.includes(m.key)} onChange={() => toggle(m.key)} />
                  <span style={{ flex: 1 }}>{m.label}</span><span className="dim mono">{m.unit}</span>
                </label>
              ))}
            </div>;
          })}
        </div>
      </div>
      <div className="wave-panels">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="small muted">{asm.name} · {result.t.length.toLocaleString()} samples at {(1 / (result.t[1] - result.t[0])).toFixed(0)} Hz · simulation time 0–{result.t[result.t.length - 1].toFixed(2)} s · drag to zoom, wheel to zoom, Shift-drag to pan, cursor values in the legend (synchronised across plots)</div>
          <div className="row">
            <button className="btn sm" onClick={() => { setPanels([...panels, { id: Date.now(), keys: [] }]); setActive(panels.length); }}>+ Add plot</button>
            <button className="btn sm primary" onClick={() => download(`${slug(asm.name)}_all_signals.csv`, toCSV(result), 'text/csv')}>Export all (CSV)</button>
          </div>
        </div>
        {panels.map((p, i) => (
          <Chart key={p.id} r={result} panel={p} sync={sync} active={i === active} onActivate={() => setActive(i)}
            onRemove={() => { setPanels(panels.filter((x) => x.id !== p.id)); setActive(0); }}
            setLimits={(lo, hi) => setPanels(panels.map((x) => (x.id === p.id ? { ...x, yMin: lo, yMax: hi } : x)))} />
        ))}
      </div>
    </div>
  );
}
