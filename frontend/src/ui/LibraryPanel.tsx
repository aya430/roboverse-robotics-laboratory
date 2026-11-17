import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES, getItem } from '../engine/catalog';
import { suggestedPorts, findInst, childrenOf, type Assembly } from '../engine/assembly';
import { useStore } from '../store';
import { CAT_STYLE } from './common';
import { CadImportDialog } from './CadImportDialog';

export let dragItem: string | null = null;

export function LibraryList({ recommended }: { recommended?: Set<string> }) {
  const { armed, arm, asm } = useStore();
  const [q, setQ] = useState('');
  const [imp, setImp] = useState(false);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CATALOG.filter((c) => !s || `${c.name} ${c.sub} ${c.category} ${c.description}`.toLowerCase().includes(s));
  }, [q]);
  return (
    <>
      <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 8 }}>
        <input className="lib-search" style={{ marginBottom: 0 }} placeholder={`Search ${CATALOG.length} components…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm" title="Import STEP / IGES / STL / OBJ / GLB" onClick={() => setImp(true)}>⇪ CAD</button>
      </div>
      {imp && <CadImportDialog onClose={() => setImp(false)} />}
      {CATEGORIES.map((cat) => {
        const list = items.filter((i) => i.category === cat);
        if (!list.length) return null;
        return (
          <div key={cat}>
            <div className="lib-cat">{cat}</div>
            {list.map((it) => {
              const n = suggestedPorts(asm, it.id).length;
              const canRoot = it.root && !asm.instances.some((i) => getItem(i.item).root);
              return (
                <div
                  key={it.id}
                  className={`lib-item ${armed === it.id ? 'on' : ''} ${recommended?.has(it.id) ? 'rec' : ''}`}
                  draggable
                  onDragStart={(e) => { dragItem = it.id; e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'copy'; arm(it.id); }}
                  onDragEnd={() => { dragItem = null; }}
                  onClick={() => arm(armed === it.id ? null : it.id)}
                  title={it.description}
                >
                  <div className="lib-ico" style={{ background: CAT_STYLE[it.category].c }}>{CAT_STYLE[it.category].t}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{it.name}</div>
                    <div className="sb">
                      {it.sub} · {it.mass} kg
                      {n > 0 && <span style={{ color: '#6aa3ff' }}> · {n} mount{n > 1 ? 's' : ''} available</span>}
                      {canRoot && <span style={{ color: '#6aa3ff' }}> · start here</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function TreeNode({ asm, uid, depth }: { asm: Assembly; uid: string; depth: number }) {
  const { selected, select, toggleHidden } = useStore();
  const inst = findInst(asm, uid)!;
  const it = getItem(inst.item);
  const port = inst.parent ? getItem(findInst(asm, inst.parent)!.item).ports.find((p) => p.id === inst.parentPort) : undefined;
  return (
    <>
      <div
        className={`lib-item ${selected === uid ? 'on' : ''}`}
        style={{ paddingLeft: 6 + depth * 12, cursor: 'pointer', opacity: inst.hidden ? 0.5 : 1 }}
        onClick={() => select(uid)}
      >
        <div className="lib-ico" style={{ background: CAT_STYLE[it.category].c, width: 20, height: 20, fontSize: 9 }}>{CAT_STYLE[it.category].t}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nm" style={{ fontSize: 12 }}>{it.name}</div>
          {port && <div className="sb">on {port.name}</div>}
        </div>
        <button className="btn sm" title={inst.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); toggleHidden(uid); }}>{inst.hidden ? '◌' : '●'}</button>
      </div>
      {childrenOf(asm, uid).map((c) => <TreeNode key={c.uid} asm={asm} uid={c.uid} depth={depth + 1} />)}
    </>
  );
}

export function AssemblyTree() {
  const asm = useStore((s) => s.asm);
  const roots = asm.instances.filter((i) => !i.parent || !findInst(asm, i.parent));
  if (!roots.length) return <div className="muted small">The assembly is empty. Start with a robot base.</div>;
  return <>{roots.map((r) => <TreeNode key={r.uid} asm={asm} uid={r.uid} depth={0} />)}</>;
}
