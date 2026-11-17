import { useState } from 'react';
import { useStore } from '../store';
import { LibraryList, AssemblyTree } from './LibraryPanel';
import { BuildViewport } from './BuildViewport';
import { PropertiesPanel } from './Properties';
import { BottomPanel } from './BottomPanel';
import { GuidedCard, useGuided } from './GuidedCard';

export function BuildPage() {
  const [tab, setTab] = useState<'lib' | 'tree'>('lib');
  const { mode, asm } = useStore();
  const g = useGuided();
  const rec = new Set<string>(mode === 'guided' && g.step ? g.step.items : []);
  return (
    <div className="workspace">
      <div className="panel">
        <div className="tabs">
          <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>Component library</button>
          <button className={tab === 'tree' ? 'on' : ''} onClick={() => setTab('tree')}>Assembly tree ({asm.instances.length})</button>
        </div>
        <div className="panel-b">{tab === 'lib' ? <LibraryList recommended={rec} /> : <AssemblyTree />}</div>
      </div>
      <div style={{ position: 'relative' }}>
        <BuildViewport />
        <div className="overlay-tl"><GuidedCard /></div>
      </div>
      <div className="panel right">
        <div className="panel-h">Component properties</div>
        <PropertiesPanel />
      </div>
      <BottomPanel />
    </div>
  );
}
