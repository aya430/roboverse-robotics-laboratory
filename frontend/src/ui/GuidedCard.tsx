import { findInst, guidedProgress } from '../engine/assembly';
import { TEMPLATES, getTemplate } from '../engine/templates';
import { getItem } from '../engine/catalog';
import { CHALLENGES } from '../engine/challenges';
import { useStore } from '../store';

export function useGuided() {
  const asm = useStore((s) => s.asm);
  const tid = useStore((s) => s.template);
  const steps = getTemplate(tid).steps;
  const prog = guidedProgress(asm, steps);
  const cur = prog.findIndex((u) => !u);
  const done = prog.filter(Boolean).length;
  const step = cur >= 0 ? steps[cur] : undefined;
  const parentUid = step && step.parent !== null ? prog[step.parent] : undefined;
  return { prog, cur, done, total: steps.length, step, parentUid, pct: Math.round((done / steps.length) * 100), name: getTemplate(tid).name };
}

export function GuidedCard() {
  const { mode, setMode, arm, armed, challenge, model, issues, result, sim, setPage, asm, template, setTemplate } = useStore();
  const g = useGuided();
  return (
    <div className="card" style={{ width: 420 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="row" style={{ gap: 2 }}>
          {(['guided', 'free', 'challenge'] as const).map((m) => (
            <button key={m} className={`btn sm ${mode === m ? 'primary' : ''}`} onClick={() => setMode(m, m === 'challenge' ? challenge ?? CHALLENGES[0].id : undefined)}>
              {m === 'guided' ? 'A · Guided' : m === 'free' ? 'B · Free' : 'C · Challenge'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'guided' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <select value={template} onChange={(e) => setTemplate(e.target.value)} style={{ flex: 1, fontWeight: 600 }} title="Robot to build in guided mode">
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>Build: {t.name}</option>)}
            </select>
            <span className="mono small muted">{g.done}/{g.total} · {g.pct}%</span>
          </div>
          <div className="progress" style={{ margin: '6px 0 8px' }}><div style={{ width: `${g.pct}%` }} /></div>
          {g.step ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>Step {g.cur + 1}: {g.step.title}</div>
              <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 6 }}>{g.step.explain}</div>
              <div className="small" style={{ marginBottom: 6 }}>
                Install <b>{getItem(g.step.items[0]).name}</b>
                {g.step.items.length > 1 && <span className="muted"> (alternative: {g.step.items.slice(1).map((i) => getItem(i).name).join(', ')})</span>}
                {g.parentUid && g.step.port && (
                  <> on <b style={{ color: '#6aa3ff' }}>{getItem(findInst(asm, g.parentUid)!.item).ports.find((p) => p.id === g.step!.port)?.name}</b> (blue ring)</>
                )}
                {g.step.parent === null && <> anywhere on the floor grid.</>}
              </div>
              <div className="row">
                <button className={`btn sm ${armed === g.step.items[0] ? 'primary' : ''}`} onClick={() => arm(g.step!.items[0])}>Pick recommended part</button>
                <span className="dim small">then click the blue ring, or drag the part onto it</span>
              </div>
            </>
          ) : (
            <div className="col">
              <div style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ Assembly complete – {model?.n} DOF, {model?.totalMass.toFixed(1)} kg</div>
              <div className="muted small">Check the Validation tab, then configure motors and the controller and run the simulation.</div>
              <div className="row"><button className="btn primary sm" onClick={() => setPage('sim')}>Open Simulation Lab →</button></div>
            </div>
          )}
        </>
      )}
      {mode === 'free' && (
        <div className="muted small" style={{ lineHeight: 1.55 }}>
          Pick any component. Compatible mounting points light up <b style={{ color: '#6aa3ff' }}>blue</b>; open interfaces that still need a part are <b style={{ color: 'var(--warn)' }}>yellow</b>.
          Select a part to see suggested next components for its free interfaces. Branched and custom-DOF chains (2–7 joints) are allowed.
        </div>
      )}
      {mode === 'challenge' && (() => {
        const ch = CHALLENGES.find((c) => c.id === challenge) ?? CHALLENGES[0];
        const crit = ch.assess(model, issues, result, sim.payload, sim.scenario.kind);
        const score = crit.filter((c) => c.pass).length;
        return (
          <>
            <select value={ch.id} onChange={(e) => setMode('challenge', e.target.value)} style={{ width: '100%', marginBottom: 6 }}>
              {CHALLENGES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 6 }}>{ch.brief}</div>
            <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Automatic assessment</b><span className="mono small">{score}/{crit.length}</span></div>
            <div className="progress" style={{ margin: '4px 0 6px' }}><div style={{ width: `${(score / crit.length) * 100}%`, background: score === crit.length ? 'var(--ok)' : undefined }} /></div>
            <div style={{ maxHeight: 170, overflow: 'auto' }}>
              {crit.map((c, i) => (
                <div key={i} className="small" style={{ display: 'flex', gap: 6, padding: '2px 0' }}>
                  <span style={{ color: c.pass ? 'var(--ok)' : 'var(--dim)' }}>{c.pass ? '✓' : '○'}</span>
                  <span style={{ flex: 1 }}>{c.text}</span>
                  <span className="mono dim">{c.detail}</span>
                </div>
              ))}
            </div>
            <div className="dim small" style={{ marginTop: 4 }}>Hint: {ch.hint}</div>
          </>
        );
      })()}
    </div>
  );
}
