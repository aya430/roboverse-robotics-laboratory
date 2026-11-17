import { useEffect, useRef, useState } from 'react';
import { SceneManager, type PortState } from './scene';
import { useStore } from '../store';
import { checkAttach, findInst, freeOutPorts, inPortOf, isConnected, rootOf } from '../engine/assembly';
import { getItem } from '../engine/catalog';
import { dragItem } from './LibraryPanel';
import { useGuided } from './GuidedCard';
import { download } from './common';

export function BuildViewport() {
  const host = useRef<HTMLDivElement>(null);
  const sm = useRef<SceneManager | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const s = useStore();
  const { asm, armed, selected, explode, q, model, mode } = s;
  const g = useGuided();

  useEffect(() => {
    const m = new SceneManager(host.current!);
    sm.current = m;
    if ((window as any).roboverse) (window as any).roboverse.buildScene = m; // automation hook (acceptance tests)
    const t0 = performance.now();
    m.onFrame = () => {
      m.pulse((performance.now() - t0) / 1000);
      // guided target label
      const lab = labelRef.current;
      if (lab) {
        const tgt = m.markers.find((mk) => mk.mesh.userData.state === 'target');
        if (tgt) {
          const p = m.screenPos(tgt.world);
          lab.style.display = p.behind ? 'none' : 'block';
          lab.style.left = `${p.x}px`;
          lab.style.top = `${p.y}px`;
          lab.textContent = tgt.port.name;
        } else lab.style.display = 'none';
      }
    };
    return () => m.dispose();
  }, []);

  // rebuild meshes on structural change
  useEffect(() => { sm.current?.setAssembly(asm); }, [asm]);
  const pid = useStore((st) => st.projectId);
  useEffect(() => { const m = sm.current; if (!m || asm.instances.length < 2) return; m.pose({}); m.root.updateMatrixWorld(true); m.frameAll(); }, [pid]);

  // pose + markers
  useEffect(() => {
    const m = sm.current;
    if (!m) return;
    const qMap: Record<string, number> = {};
    model?.joints.forEach((J, i) => { qMap[J.gbUid] = q[i] ?? 0; });
    const frames = m.pose(qMap, explode);
    const selInst = findInst(asm, selected ?? undefined);
    const candidate = armed ?? (selInst && !isConnected(asm, selInst) ? selInst.item : null);
    const cIface = candidate ? inPortOf(getItem(candidate))?.iface : undefined;
    const target = mode === 'guided' && g.step && g.parentUid ? { uid: g.parentUid, port: g.step.port } : null;
    const list: { uid: string; port: any; state: PortState }[] = [];
    for (const fp of freeOutPorts(asm)) {
      const isTarget = target && fp.uid === target.uid && fp.port.id === target.port;
      let st: PortState;
      if (isTarget) st = 'target';
      else if (cIface && fp.port.iface === cIface) st = 'recommended';
      else {
        const it = getItem(findInst(asm, fp.uid)!.item);
        st = it.motor || it.gearbox ? 'incomplete' : 'free';
      }
      list.push({ uid: fp.uid, port: fp.port, state: st });
    }
    for (const inst of asm.instances) {
      if (!inst.parent || !isConnected(asm, inst) || inst.hidden) continue;
      const ip = inPortOf(getItem(inst.item));
      if (ip) list.push({ uid: inst.uid, port: ip, state: 'connected' });
    }
    m.setMarkers(list, frames);
    m.setHighlight(selected);
  }, [asm, armed, selected, explode, q, model, mode, g.cur]);

  // click handling (distinguish from orbit drags)
  useEffect(() => {
    const el = host.current!;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) { down = null; return; }
      down = null;
      const m = sm.current!;
      const st = useStore.getState();
      const hit = m.pick(e.clientX, e.clientY);
      if (hit.marker) {
        const { uid, port } = hit.marker;
        if (st.armed) {
          const chk = checkAttach(st.asm, st.armed, uid, port.id);
          if (!chk.ok) { flash(hit.marker.mesh); st.logMsg('error', chk.reason); return; }
          st.placeArmedAt(uid, port.id);
          return;
        }
        const sel = findInst(st.asm, st.selected ?? undefined);
        if (sel && !isConnected(st.asm, sel)) { st.moveSelectedTo(uid, port.id); return; }
        const owner = getItem(findInst(st.asm, uid)!.item);
        st.logMsg('info', `${owner.name} › ${port.name}: ${port.hint ?? ''} [${port.iface}]`);
        st.select(uid);
        return;
      }
      if (hit.part) { st.select(hit.part); return; }
      if (st.armed && hit.ground) {
        const it = getItem(st.armed);
        if (!it.root && rootOf(st.asm)) st.logMsg('info', 'Tip: click a blue ring to connect the part directly. It was placed loose on the floor.');
        st.placeArmedLoose(hit.ground);
        return;
      }
      st.select(null);
    };
    const onMove = (e: PointerEvent) => {
      const m = sm.current!;
      const hv = hoverRef.current!;
      const mk = m.nearestMarker(e.clientX, e.clientY, () => true, 22);
      if (mk) {
        const p = m.screenPos(mk.world);
        hv.style.display = 'block';
        hv.style.left = `${p.x}px`;
        hv.style.top = `${p.y}px`;
        const st = useStore.getState();
        const ok = st.armed ? checkAttach(st.asm, st.armed, mk.uid, mk.port.id).ok : null;
        hv.textContent = `${mk.port.name} · ${mk.port.iface}${ok === null ? '' : ok ? ' · ✓ compatible' : ' · ✗ incompatible'}`;
        hv.style.borderColor = ok === false ? 'var(--err)' : '';
        el.style.cursor = 'pointer';
      } else { hv.style.display = 'none'; el.style.cursor = ''; }
    };
    const flash = (mesh: any) => {
      const mat = mesh.material;
      const old = mat.color.getHex();
      mat.color.setHex(0xe5484d);
      setTimeout(() => mat.color.setHex(old), 700);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const st = useStore.getState();
      if (st.page !== 'build') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') st.removeSelected();
      else if (e.key === 'Escape') { st.arm(null); st.select(null); }
      else if (e.key.toLowerCase() === 'r') st.rotateSelected();
      else if (e.key.toLowerCase() === 'f') sm.current?.frameAll();
      else if (e.key.toLowerCase() === 'e') st.setExplode(st.explode > 0 ? 0 : 0.06);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData('text/plain') || dragItem;
    if (!id) return;
    const st = useStore.getState();
    st.arm(id);
    const m = sm.current!;
    const iface = inPortOf(getItem(id))?.iface;
    // snap to the nearest compatible mounting point within ~90 px of the drop location
    const mk = m.nearestMarker(e.clientX, e.clientY, (mm) => mm.port.iface === iface, 90);
    if (mk) { useStore.getState().arm(id); useStore.getState().placeArmedAt(mk.uid, mk.port.id); return; }
    const hit = m.pick(e.clientX, e.clientY);
    if (hit.ground) useStore.getState().placeArmedLoose(hit.ground);
  };

  const empty = asm.instances.length === 0;
  return (
    <div className="center" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <div className="viewport" ref={host} />
      <div ref={labelRef} className="port-label" style={{ display: 'none' }} />
      <div ref={hoverRef} className="port-label hover" style={{ display: 'none' }} />
      {dragOver && <div className="drop-hint">Drop near a blue mounting ring to snap · elsewhere to place loose</div>}
      {empty && !armed && (
        <div className="empty-state"><div className="card">
          <h3 style={{ marginBottom: 6 }}>Empty assembly workspace</h3>
          <div className="muted small" style={{ lineHeight: 1.6 }}>Pick <b>Robot base pedestal B-400</b> from the library and click the floor, or open the 6-DOF template from the dashboard.</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn primary" onClick={() => s.arm('base-pedestal')}>Pick the robot base</button>
          </div>
        </div></div>
      )}
      <div className="overlay-tr">
        <div className="toolbar">
          <button className="btn sm" title="Undo (Ctrl+Z)" disabled={!s.past.length} onClick={s.undo}>↶ Undo</button>
          <button className="btn sm" title="Redo (Ctrl+Y)" disabled={!s.future.length} onClick={s.redo}>↷ Redo</button>
          <button className="btn sm" title="Exploded view (E)" onClick={() => s.setExplode(explode > 0 ? 0 : 0.06)}>{explode > 0 ? '◫ Collapse' : '◫ Explode'}</button>
          <button className="btn sm" title="Frame all (F)" onClick={() => sm.current?.frameAll()}>⤢ Fit</button>
          <button className="btn sm" title="Save PNG" onClick={() => fetch(sm.current!.snapshot()).then((r) => r.blob()).then((b) => download(`${asm.name}_assembly.png`, b))}>⎙ PNG</button>
        </div>
        <div className="card legend" style={{ padding: '6px 10px' }}>
          <span><i style={{ background: '#2f7bff' }} />Recommended</span>
          <span><i style={{ background: '#f2b705' }} />Incomplete</span>
          <span><i style={{ background: '#8a96a8' }} />Free / unconnected</span>
          <span><i style={{ background: '#e5484d' }} />Invalid</span>
          <span><i style={{ background: '#2fb67c' }} />Connected ✓</span>
        </div>
      </div>
      {model && model.n > 0 && (
        <div className="overlay-bl" style={{ pointerEvents: 'none' }}>
          <div className="card" style={{ display: 'inline-flex', gap: 10, alignItems: 'center', pointerEvents: 'auto', flexWrap: 'wrap', maxWidth: '100%' }}>
            <span className="small muted">Pose joints:</span>
            {model.joints.map((J, i) => (
              <label key={J.gbUid} className="small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {J.name}
                <input type="range" min={J.lo} max={J.hi} step={0.01} value={q[i] ?? 0} style={{ width: 70 }}
                  onChange={(e) => { const nq = q.slice(); nq[i] = +e.target.value; s.setQ(nq); }} />
              </label>
            ))}
            <button className="btn sm" onClick={() => s.setQ(new Array(model.n).fill(0))}>Zero</button>
          </div>
        </div>
      )}
    </div>
  );
}
