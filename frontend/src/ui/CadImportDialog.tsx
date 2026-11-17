import { useEffect, useMemo, useState } from 'react';
import { CAD_EXTENSIONS, parseCad, prepare, type RawMesh, type Unit } from './cadImport';
import { bufToB64 } from './shapeMesh';
import { CATALOG, CATEGORIES, registerItem, type CatalogItem, type Category, type Port } from '../engine/catalog';
import { describeIface } from '../engine/assembly';
import { PartPreview } from './PartPreview';
import { useStore } from '../store';
import { fmt } from './common';
import type { V3 } from '../engine/math';

const DENSITY: Record<string, number> = { 'Aluminium (2700 kg/m³)': 2700, 'Steel (7850 kg/m³)': 7850, 'Stainless steel (8000)': 8000, 'ABS (1050)': 1050, 'PLA (1240)': 1240, 'Nylon PA12 (1010)': 1010, 'Carbon-fibre composite (1600)': 1600, 'Brass (8500)': 8500 };
const DIRS: Record<string, [V3, V3]> = {
  '+Z (up)': [[0, 0, 1], [1, 0, 0]], '−Z (down)': [[0, 0, -1], [1, 0, 0]], '+X': [[1, 0, 0], [0, 0, 1]], '−X': [[-1, 0, 0], [0, 0, 1]], '+Y': [[0, 1, 0], [0, 0, 1]], '−Y': [[0, -1, 0], [0, 0, 1]],
};
const PLACES = ['top centre', 'bottom centre', '+X face', '−X face', '+Y face', '−Y face', 'custom'] as const;
type Place = (typeof PLACES)[number];

interface OutPortDraft { name: string; iface: string; place: Place; xyz: V3; dir: string }

export function CadImportDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [raw, setRaw] = useState<RawMesh | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [unit, setUnit] = useState<Unit>('mm');
  const [yUp, setYUp] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Structure');
  const [material, setMaterial] = useState('Aluminium (2700 kg/m³)');
  const [massMode, setMassMode] = useState<'density' | 'manual'>('density');
  const [manualMass, setManualMass] = useState(0.5);
  const [color, setColor] = useState('#b9c2cc');
  const [licence, setLicence] = useState('');
  const [author, setAuthor] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [inIface, setInIface] = useState('ACC');
  const [outs, setOuts] = useState<OutPortDraft[]>([]);
  const [actuator, setActuator] = useState('');

  const ifaces = useMemo(() => [...new Set(CATALOG.flatMap((c) => c.ports.map((p) => p.iface)))].sort(), []);
  const actuators = useMemo(() => CATALOG.filter((c) => c.gearbox), []);

  const load = async (f: File) => {
    setFile(f); setErr(''); setBusy(true); setRaw(null);
    try {
      const r = await parseCad(f);
      setRaw(r); setUnit(r.defaultUnit); setYUp(r.yUp);
      if (r.color) setColor(r.color);
      setName(f.name.replace(/\.[^.]+$/, ''));
    } catch (e: any) { setErr(e.message ?? String(e)); }
    setBusy(false);
  };

  const prep = useMemo(() => (raw ? prepare(raw, unit, yUp) : null), [raw, unit, yUp]);
  const density = DENSITY[material];
  const mass = prep ? (massMode === 'manual' ? manualMass : (prep.closed ? prep.volume : prep.size[0] * prep.size[1] * prep.size[2] * 0.3) * density) : 0;

  const placeXYZ = (p: Place, xyz: V3): V3 => {
    if (!prep) return [0, 0, 0];
    const [x, y, z] = prep.size;
    switch (p) {
      case 'top centre': return [0, 0, z];
      case 'bottom centre': return [0, 0, 0];
      case '+X face': return [x / 2, 0, z / 2];
      case '−X face': return [-x / 2, 0, z / 2];
      case '+Y face': return [0, y / 2, z / 2];
      case '−Y face': return [0, -y / 2, z / 2];
      default: return xyz.map((v) => v / 1000) as V3;
    }
  };

  const item: CatalogItem | null = useMemo(() => {
    if (!prep || !file) return null;
    const id = 'cad-' + (name || 'part').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + prep.triangles.toString(36);
    const act = actuators.find((a) => a.id === actuator);
    const ports: Port[] = [];
    if (inIface !== '(root)') ports.push({ id: 'in', name: 'Mounting face (bottom)', iface: inIface, dir: 'in', pos: [0, 0, 0] });
    outs.forEach((o, k) => ports.push({ id: `out${k + 1}`, name: o.name || `Interface ${k + 1}`, iface: o.iface, dir: 'out', pos: placeXYZ(o.place, o.xyz), zx: DIRS[o.dir], rotary: !!act && k === 0 }));
    return {
      id, name: name || file.name, category, sub: act ? 'Imported actuator' : 'Imported CAD', mass: +mass.toFixed(4),
      material: material.split(' (')[0],
      description: `Imported from ${file.name} (${raw!.format}, ${prep.triangles.toLocaleString()} triangles, ${raw!.parts} body/bodies). ${prep.closed ? 'Closed mesh – mass from exact volume.' : 'Open mesh – mass from an envelope estimate.'}${act ? ` Engineering model copied from ${act.name}.` : ''}`,
      shapes: [{ kind: 'mesh' as const, dims: [...prep.size, prep.closed ? prep.volume : 0], pos: [0, 0, prep.size[2] / 2], color, finish: 'anodised', mesh: { id: `${id}@${unit}${yUp ? 'y' : 'z'}`, positions: bufToB64(prep.positions.buffer), indices: bufToB64(prep.indices.buffer) } }],
      ports,
      root: inIface === '(root)' || undefined,
      motor: act?.motor, gearbox: act?.gearbox,
      source: { origin: `User import: ${file.name}${sourceUrl ? ' (' + sourceUrl + ')' : ''}`, licence: licence || 'not stated', note: `Author/manufacturer: ${author || 'not stated'} · format ${raw!.format} · source units ${unit} · imported ${new Date().toLocaleDateString()}` },
    };
  }, [prep, file, name, category, material, mass, color, licence, author, sourceUrl, inIface, outs, actuator]);

  // live preview (unlisted catalog id)
  const [previewId, setPreviewId] = useState<string | undefined>();
  useEffect(() => {
    if (!item) return;
    const pid = 'cad-preview-' + Math.random().toString(36).slice(2, 7);
    registerItem({ ...item, id: pid }, false);
    setPreviewId(pid);
  }, [item]);

  const sizeKB = item ? Math.round((item.shapes[0].mesh!.positions.length + (item.shapes[0].mesh!.indices?.length ?? 0)) / 1024) : 0;
  const canCreate = !!item && !!licence.trim() && (!actuator || outs.length > 0);

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h3>Import CAD component</h3>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
          <div>
            <label className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Reading & tessellating…' : file ? `Replace file (${file.name})` : 'Choose CAD file…'}
              <input type="file" accept={CAD_EXTENSIONS.join(',')} style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
            </label>
            <div className="dim small" style={{ margin: '6px 0' }}>STEP / STP, IGES / IGS and BREP are tessellated in your browser by OpenCascade (WASM); STL, OBJ, GLB and GLTF are read directly. Nothing is uploaded. Use only files you are licensed to use.</div>
            {err && <div className="notice">{err}</div>}
            <div style={{ height: 260, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', background: '#1b2129' }}>
              {previewId ? <PartPreview key={previewId} itemId={previewId} height={260} /> : <div className="muted small" style={{ padding: 20 }}>Preview appears here.</div>}
            </div>
            {prep && (
              <table className="t kv" style={{ marginTop: 6 }}><tbody>
                <tr><td>Envelope</td><td className="mono">{prep.size.map((v) => fmt(v * 1000, 1)).join(' × ')} mm</td></tr>
                <tr><td>Triangles / data</td><td className="mono">{prep.triangles.toLocaleString()} / {sizeKB} kB</td></tr>
                <tr><td>Mesh</td><td>{prep.closed ? <span style={{ color: 'var(--ok)' }}>closed (watertight)</span> : <span style={{ color: 'var(--warn)' }}>open – volume estimated</span>}</td></tr>
                <tr><td>Volume</td><td className="mono">{prep.closed ? fmt(prep.volume * 1e6, 2) + ' cm³' : '—'}</td></tr>
                <tr><td>Mass</td><td className="mono">{fmt(mass, 3)} kg</td></tr>
              </tbody></table>
            )}
            {prep && prep.triangles > 200000 && <div className="notice">More than 200 000 triangles – consider exporting a coarser tessellation; large meshes slow down the scene and bloat project files.</div>}
          </div>
          <div style={{ maxHeight: '70vh', overflow: 'auto', paddingRight: 4 }}>
            <div className="sect" style={{ marginTop: 0 }}>Geometry</div>
            <div className="field"><label>Source units</label><select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>{['mm', 'cm', 'm', 'in'].map((u) => <option key={u}>{u}</option>)}</select></div>
            <div className="field"><label>Up axis in file</label><select value={yUp ? 'Y' : 'Z'} onChange={(e) => setYUp(e.target.value === 'Y')}><option value="Z">Z up (CAD)</option><option value="Y">Y up (glTF/OBJ)</option></select></div>
            <div className="field"><label>Colour</label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
            <div className="sect">Component record</div>
            <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label>Category</label><select value={category} onChange={(e) => setCategory(e.target.value as Category)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Material</label><select value={material} onChange={(e) => setMaterial(e.target.value)}>{Object.keys(DENSITY).map((m) => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label>Mass</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <select value={massMode} onChange={(e) => setMassMode(e.target.value as any)}><option value="density">from density</option><option value="manual">manual</option></select>
                {massMode === 'manual' && <input type="number" step={0.01} value={manualMass} style={{ width: 70 }} onChange={(e) => setManualMass(+e.target.value)} />}
              </div>
            </div>
            <div className="field"><label>Licence *</label><input placeholder="e.g. CC BY 4.0, own design, vendor EULA" value={licence} onChange={(e) => setLicence(e.target.value)} /></div>
            <div className="field"><label>Author / manufacturer</label><input value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
            <div className="field"><label>Source URL</label><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></div>
            <div className="sect">Mounting interfaces</div>
            <div className="field"><label>Input (bottom face)</label>
              <select value={inIface} onChange={(e) => setInIface(e.target.value)}>
                <option value="(root)">none – fixed to ground (root)</option>
                {ifaces.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            {inIface !== '(root)' && <div className="dim small">{describeIface(inIface)}</div>}
            {outs.map((o, k) => (
              <div key={k} className="card" style={{ padding: 8, margin: '6px 0' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Output {k + 1}{actuator && k === 0 ? ' (joint output)' : ''}</b><button className="btn sm danger" onClick={() => setOuts(outs.filter((_, i) => i !== k))}>✕</button></div>
                <div className="field"><label>Name</label><input value={o.name} onChange={(e) => setOuts(outs.map((x, i) => (i === k ? { ...x, name: e.target.value } : x)))} /></div>
                <div className="field"><label>Interface</label><select value={o.iface} onChange={(e) => setOuts(outs.map((x, i) => (i === k ? { ...x, iface: e.target.value } : x)))}>{ifaces.map((i) => <option key={i}>{i}</option>)}</select></div>
                <div className="field"><label>Position</label><select value={o.place} onChange={(e) => setOuts(outs.map((x, i) => (i === k ? { ...x, place: e.target.value as Place } : x)))}>{PLACES.map((p) => <option key={p}>{p}</option>)}</select></div>
                {o.place === 'custom' && <div className="field"><label>x, y, z (mm, base centre = 0)</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>{[0, 1, 2].map((a) => <input key={a} type="number" value={o.xyz[a]} onChange={(e) => setOuts(outs.map((x, i) => (i === k ? { ...x, xyz: x.xyz.map((v, j) => (j === a ? +e.target.value : v)) as V3 } : x)))} />)}</div></div>}
                <div className="field"><label>Direction (outward)</label><select value={o.dir} onChange={(e) => setOuts(outs.map((x, i) => (i === k ? { ...x, dir: e.target.value } : x)))}>{Object.keys(DIRS).map((d) => <option key={d}>{d}</option>)}</select></div>
              </div>
            ))}
            <button className="btn sm" onClick={() => setOuts([...outs, { name: '', iface: 'ACC', place: 'top centre', xyz: [0, 0, 0], dir: '+Z (up)' }])}>+ Add output interface</button>
            <div className="sect">Engineering model (optional)</div>
            <div className="field"><label>Acts as joint actuator</label>
              <select value={actuator} onChange={(e) => setActuator(e.target.value)}>
                <option value="">no – passive part</option>
                {actuators.map((a) => <option key={a.id} value={a.id}>copy specs: {a.name}</option>)}
              </select>
            </div>
            {actuator && <div className="dim small">Output 1 becomes the {actuators.find((a) => a.id === actuator)?.gearbox?.joint === 'prismatic' ? 'prismatic' : 'revolute'} joint along its direction. {actuators.find((a) => a.id === actuator)?.motor ? 'Motor and transmission parameters' : 'Transmission parameters (a motor must be mounted on the input)'} are copied and can be edited in the Properties panel.</div>}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          {!licence.trim() && item && <span className="small" style={{ color: 'var(--warn)' }}>Enter the licence of the model to continue.</span>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!canCreate} onClick={() => {
            store.addCustomPart(item!);
            store.logMsg('ok', `Imported CAD component “${item!.name}” (${item!.mass} kg, ${item!.ports.length} interface(s)). It is now in the library and saved with the project.`);
            store.arm(item!.id);
            onClose();
          }}>Add to library & pick</button>
        </div>
      </div>
    </div>
  );
}
