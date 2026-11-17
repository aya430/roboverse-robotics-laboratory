import { useStore } from '../store';
import { getItem, type CatalogItem } from '../engine/catalog';
import {
  describeIface, findInst, gearOf, isConnected, isPortOccupied, itemsForPort, massOf, motorOf, suggestedPorts, childrenOf, swapCandidates,
} from '../engine/assembly';
import { CAT_STYLE, fmt } from './common';
import { halfExtents } from '../engine/geometry';

function bbox(it: CatalogItem) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of it.shapes) {
    const h = halfExtents(s);
    // rotated shapes use the max half-extent (conservative)
    const r = s.rot && s.rot.some((v) => v) ? Math.max(...h) : undefined;
    for (let k = 0; k < 3; k++) {
      const e = r ?? h[k];
      lo[k] = Math.min(lo[k], s.pos[k] - e);
      hi[k] = Math.max(hi[k], s.pos[k] + e);
    }
  }
  return hi.map((v, k) => (v - lo[k]) * 1000);
}

function Param({ uid, k, label, value, unit, step = 'any' }: { uid: string; k: string; label: string; value: number; unit: string; step?: string }) {
  const setParam = useStore((s) => s.setParam);
  const inst = findInst(useStore.getState().asm, uid);
  const overridden = inst?.params && typeof inst.params[k] === 'number';
  return (
    <tr className="kv-edit">
      <td>{label}{overridden && <span title="Overridden – differs from catalog" style={{ color: 'var(--warn)' }}> ●</span>}</td>
      <td className="n">
        <input type="number" step={step} defaultValue={value} key={`${uid}${k}${value}`}
          onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== value) setParam(uid, k, v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /> <span className="dim">{unit}</span>
      </td>
    </tr>
  );
}

export function ItemSpecs({ it }: { it: CatalogItem }) {
  const d = bbox(it);
  return (
    <>
      <table className="t kv"><tbody>
        <tr><td>Category</td><td>{it.category} · {it.sub}</td></tr>
        <tr><td>Envelope</td><td className="mono">{d.map((v) => v.toFixed(0)).join(' × ')} mm</td></tr>
        <tr><td>Mass</td><td className="mono">{it.mass} kg</td></tr>
        <tr><td>Material</td><td>{it.material}</td></tr>
        {it.motor && <>
          <tr><td>Type</td><td>{it.motor.type}</td></tr>
          <tr><td>Rated / peak torque</td><td className="mono">{it.motor.T_rated} / {it.motor.T_peak} N·m</td></tr>
          <tr><td>Rated / max speed</td><td className="mono">{it.motor.rpm_rated} / {it.motor.rpm_max} rpm</td></tr>
          <tr><td>Kt = Ke</td><td className="mono">{it.motor.Kt} N·m/A</td></tr>
          <tr><td>R, L</td><td className="mono">{it.motor.R} Ω, {(it.motor.L * 1000).toFixed(2)} mH</td></tr>
          <tr><td>Rotor inertia</td><td className="mono">{(it.motor.Jm * 1e4).toFixed(2)}×10⁻⁴ kg·m²</td></tr>
          <tr><td>Rated / peak current</td><td className="mono">{it.motor.I_rated} / {it.motor.I_peak} A</td></tr>
        </>}
        {it.gearbox && it.gearbox.joint !== 'prismatic' && <>
          <tr><td>Joint</td><td>revolute</td></tr>
          <tr><td>Ratio / efficiency</td><td className="mono">{it.gearbox.ratio}:1 / {(it.gearbox.efficiency * 100).toFixed(0)} %</td></tr>
          <tr><td>Rated / peak output</td><td className="mono">{it.gearbox.T_rated} / {it.gearbox.T_peak} N·m</td></tr>
          <tr><td>Backlash</td><td className="mono">{it.gearbox.backlash_arcmin} arcmin</td></tr>
        </>}
        {it.gearbox?.joint === 'prismatic' && <>
          <tr><td>Joint</td><td>prismatic (linear)</td></tr>
          <tr><td>Stroke</td><td className="mono">{it.gearbox.limit_deg[1] - it.gearbox.limit_deg[0]} mm</td></tr>
          <tr><td>Lead / efficiency</td><td className="mono">{(it.gearbox.lead ?? 0) * 1000} mm/rev / {(it.gearbox.efficiency * 100).toFixed(0)} %</td></tr>
          <tr><td>Rated / peak force</td><td className="mono">{it.gearbox.T_rated} / {it.gearbox.T_peak} N</td></tr>
          <tr><td>Max speed</td><td className="mono">{it.gearbox.vmax_dps} mm/s</td></tr>
        </>}
        {it.sensor && <>
          <tr><td>Sensor type</td><td>{it.sensor.kind}</td></tr>
          {it.sensor.range !== undefined && <tr><td>Range</td><td className="mono">{it.sensor.minRange !== undefined ? `${it.sensor.minRange} – ` : '±'}{it.sensor.range} {['range', 'lidar', 'proximity', 'camera'].includes(it.sensor.kind) ? 'm' : it.sensor.kind === 'gyroscope' ? '°/s' : it.sensor.kind === 'force' ? 'N' : it.sensor.kind === 'torque' ? 'N·m' : it.sensor.kind === 'pressure' ? 'Pa' : 'g'}</td></tr>}
          {it.sensor.rate_hz && <tr><td>Update rate</td><td className="mono">{it.sensor.rate_hz} Hz</td></tr>}
          <tr><td>In simulation</td><td>{['imu', 'accelerometer', 'gyroscope'].includes(it.sensor.kind) ? 'Specific force / angular rate of its body (RNEA)' : ['range', 'lidar'].includes(it.sensor.kind) ? 'Distance along its axis to the ground plane' : it.sensor.kind === 'encoder' ? 'Joint encoders are simulated per motor' : it.sensor.note ?? 'Library part (mass and geometry only)'}</td></tr>
        </>}
        {it.libraryOnly && <tr><td>Simulation</td><td><span className="tag warn">library part</span> {it.libraryOnly}</td></tr>}
        {it.elec && Object.entries(it.elec).filter(([k]) => k !== 'kind').map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono">{String(v)}</td></tr>)}
        {it.gripper && <tr><td>Stroke / force / TCP</td><td className="mono">{it.gripper.stroke * 1000} mm / {it.gripper.force} N / {it.gripper.tcp * 1000} mm</td></tr>}
        {it.ft && <tr><td>Range</td><td className="mono">±{it.ft.range_N} N, ±{it.ft.range_Nm} N·m</td></tr>}
      </tbody></table>
      <div className="sect">Mounting interfaces</div>
      <table className="t"><tbody>
        {it.ports.map((p) => <tr key={p.id}><td><b>{p.dir === 'in' ? '⇥ in' : 'out ⇤'}</b> {p.name}<div className="dim small">{describeIface(p.iface)}</div></td></tr>)}
      </tbody></table>
      <div className="sect">Asset record</div>
      <div className="dim small" style={{ lineHeight: 1.5 }}>
        ID <span className="mono">{it.id}</span> · {it.source.origin} · Licence: {it.source.licence} · Units: SI (m, kg) · Format: procedural primitives → glTF scene graph<br />{it.source.note}
      </div>
    </>
  );
}

export function PropertiesPanel() {
  const s = useStore();
  const { selected, armed, asm, arm } = s;
  if (armed) {
    const it = getItem(armed);
    const ports = suggestedPorts(asm, armed);
    return (
      <div className="panel-b">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="lib-ico" style={{ background: CAT_STYLE[it.category].c }}>{CAT_STYLE[it.category].t}</div>
          <div style={{ flex: 1 }}><b>{it.name}</b><div className="dim small">picked – ready to place</div></div>
          <button className="btn sm" onClick={() => arm(null)}>Cancel</button>
        </div>
        <div className="muted small" style={{ lineHeight: 1.5 }}>{it.description}</div>
        <div className="sect">Suggested installation location</div>
        {it.root ? (
          <div className="small">Click anywhere on the floor grid to anchor the base.</div>
        ) : ports.length ? (
          ports.map((fp) => {
            const owner = getItem(findInst(asm, fp.uid)!.item);
            return (
              <div key={fp.uid + fp.port.id} className="lib-item rec" style={{ cursor: 'pointer' }} onClick={() => s.placeArmedAt(fp.uid, fp.port.id)}>
                <div style={{ flex: 1 }}>
                  <div className="nm" style={{ color: '#8fb6ff' }}>{fp.port.hint ?? fp.port.name}</div>
                  <div className="sb">{owner.name} › {fp.port.name}</div>
                </div>
                <span className="btn sm primary">Install</span>
              </div>
            );
          })
        ) : (
          <div className="notice">No compatible free interface in the current assembly. This part needs <b>{describeIface(it.ports.find((p) => p.dir === 'in')?.iface ?? '')}</b>. It can be placed loose on the floor and connected later.</div>
        )}
        <div className="sect">Specifications</div>
        <ItemSpecs it={it} />
      </div>
    );
  }
  const inst = findInst(asm, selected ?? undefined);
  if (!inst) {
    return (
      <div className="panel-b muted small" style={{ lineHeight: 1.6 }}>
        Select a component in the 3D view or the assembly tree to inspect and edit its engineering parameters.
        <div className="sect">Shortcuts</div>
        <div><span className="kbd">Ctrl Z</span> undo · <span className="kbd">Ctrl Y</span> redo · <span className="kbd">Del</span> delete · <span className="kbd">R</span> rotate 90° · <span className="kbd">E</span> explode · <span className="kbd">F</span> fit · <span className="kbd">Esc</span> cancel</div>
      </div>
    );
  }
  const it = getItem(inst.item);
  const m = motorOf(inst), g = gearOf(inst);
  const connected = isConnected(asm, inst);
  const jIdx = s.model?.joints.findIndex((J) => J.gbUid === inst.uid || J.motorUid === inst.uid) ?? -1;
  const freePorts = it.ports.filter((p) => p.dir === 'out' && !isPortOccupied(asm, inst.uid, p.id));
  return (
    <div className="panel-b">
      <div className="row" style={{ marginBottom: 6 }}>
        <div className="lib-ico" style={{ background: CAT_STYLE[it.category].c }}>{CAT_STYLE[it.category].t}</div>
        <div style={{ flex: 1 }}>
          <b>{it.name}</b>
          <div className="small">
            {connected ? <span style={{ color: 'var(--ok)' }}>● connected</span> : <span style={{ color: 'var(--grey)' }}>● not connected</span>}
            {jIdx >= 0 && <span className="muted"> · drives joint J{jIdx + 1}</span>}
          </div>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn sm" disabled={!inst.parent} onClick={s.rotateSelected} title="Clock the part about the mating axis (R)">⟳ Rotate 90°</button>
        <button className="btn sm" disabled={!inst.parent} onClick={s.detachSelected}>Detach</button>
        <button className="btn sm" onClick={() => s.toggleHidden(inst.uid)}>{inst.hidden ? 'Show' : 'Hide'}</button>
        <button className="btn sm danger" onClick={s.removeSelected}>Delete</button>
      </div>
      {swapCandidates(asm, inst.uid).length > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="small muted">Replace with:</span>
          <select value="" onChange={(e) => e.target.value && s.swapSelected(e.target.value)} style={{ flex: 1 }}>
            <option value="">interface-compatible alternative…</option>
            {swapCandidates(asm, inst.uid).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {!connected && <div className="notice info" style={{ marginBottom: 8 }}>This part is loose. Compatible mounting points are highlighted blue – click one to connect it.</div>}
      <div className="muted small" style={{ lineHeight: 1.5 }}>{it.description}</div>
      <div className="sect">Engineering parameters (editable)</div>
      <table className="t kv"><tbody>
        <Param uid={inst.uid} k="mass" label="Mass" value={massOf(inst)} unit="kg" />
        {m && <>
          <Param uid={inst.uid} k="motor.Kt" label="Torque constant Kt" value={m.Kt} unit="N·m/A" />
          <Param uid={inst.uid} k="motor.Ke" label="Back-EMF constant Ke" value={m.Ke} unit="V·s/rad" />
          <Param uid={inst.uid} k="motor.R" label="Winding resistance" value={m.R} unit="Ω" />
          <Param uid={inst.uid} k="motor.L" label="Winding inductance" value={m.L} unit="H" />
          <Param uid={inst.uid} k="motor.Jm" label="Rotor inertia" value={m.Jm} unit="kg·m²" />
          <Param uid={inst.uid} k="motor.I_rated" label="Rated current" value={m.I_rated} unit="A" />
          <Param uid={inst.uid} k="motor.I_peak" label="Peak current" value={m.I_peak} unit="A" />
          <Param uid={inst.uid} k="motor.T_rated" label="Rated torque" value={m.T_rated} unit="N·m" />
          <Param uid={inst.uid} k="motor.T_peak" label="Peak torque" value={m.T_peak} unit="N·m" />
          <Param uid={inst.uid} k="motor.rpm_max" label="Max speed" value={m.rpm_max} unit="rpm" />
          <tr><td>Rated power (derived)</td><td className="n">{fmt((m.T_rated * m.rpm_rated * 2 * Math.PI) / 60, 0)} W</td></tr>
          <tr><td>No-load speed V/Ke</td><td className="n">{fmt(((m.V_nom / m.Ke) * 60) / (2 * Math.PI), 0)} rpm</td></tr>
          {Math.abs(m.Kt - m.Ke) > 1e-9 && <tr><td colSpan={2}><span className="tag warn">Kt ≠ Ke – inconsistent in SI units</span></td></tr>}
        </>}
        {g && <>
          {g.joint === 'prismatic' ? <>
            <tr><td>Joint type</td><td className="n">prismatic (linear)</td></tr>
            <Param uid={inst.uid} k="gear.lead" label="Lead (travel per motor rev.)" value={g.lead ?? 0} unit="m" />
            <tr><td>Equivalent ratio 2π/lead</td><td className="n">{fmt(g.ratio, 1)} rad/m</td></tr>
          </> : <Param uid={inst.uid} k="gear.ratio" label="Gear ratio N" value={g.ratio} unit=":1" />}
          <Param uid={inst.uid} k="gear.efficiency" label="Efficiency η" value={g.efficiency} unit="" />
          <Param uid={inst.uid} k="gear.T_rated" label={g.joint === 'prismatic' ? 'Rated axis force' : 'Rated output torque'} value={g.T_rated} unit={g.joint === 'prismatic' ? 'N' : 'N·m'} />
          <Param uid={inst.uid} k="gear.T_peak" label={g.joint === 'prismatic' ? 'Peak axis force' : 'Peak output torque'} value={g.T_peak} unit={g.joint === 'prismatic' ? 'N' : 'N·m'} />
          <Param uid={inst.uid} k="gear.limit_lo" label="Joint lower limit" value={g.limit_deg[0]} unit={g.joint === 'prismatic' ? 'mm' : 'deg'} />
          <Param uid={inst.uid} k="gear.limit_hi" label="Joint upper limit" value={g.limit_deg[1]} unit={g.joint === 'prismatic' ? 'mm' : 'deg'} />
          <Param uid={inst.uid} k="gear.vmax_dps" label="Joint max velocity" value={g.vmax_dps} unit={g.joint === 'prismatic' ? 'mm/s' : 'deg/s'} />
          <Param uid={inst.uid} k="gear.viscous" label="Viscous friction" value={g.viscous} unit={g.joint === 'prismatic' ? 'N·s/m' : 'N·m·s/rad'} />
          <Param uid={inst.uid} k="gear.coulomb" label="Coulomb friction" value={g.coulomb} unit={g.joint === 'prismatic' ? 'N' : 'N·m'} />
        </>}
      </tbody></table>
      {inst.params && Object.keys(inst.params).length > 0 && (
        <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { for (const k of Object.keys(inst.params!)) s.setParam(inst.uid, k, undefined); }}>Reset to catalog values</button>
      )}
      {freePorts.length > 0 && connected && <>
        <div className="sect">Assembly assistant – next components</div>
        {freePorts.map((p) => (
          <div key={p.id} style={{ marginBottom: 6 }}>
            <div className="small"><b>{p.name}</b> <span className="dim">({p.iface})</span></div>
            <div className="row" style={{ marginTop: 3 }}>
              {itemsForPort(p).map((c) => <button key={c.id} className="btn sm" onClick={() => arm(c.id)}>{c.name}</button>)}
            </div>
          </div>
        ))}
      </>}
      {childrenOf(asm, inst.uid).length > 0 && <div className="dim small" style={{ marginTop: 6 }}>{childrenOf(asm, inst.uid).length} component(s) mounted on this part.</div>}
      <div className="sect">Catalog specification</div>
      <ItemSpecs it={it} />
    </div>
  );
}
