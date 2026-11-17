import { useEffect } from 'react';
import { useStore, type Page } from './store';
import { BuildPage } from './ui/BuildPage';
import { SimPage } from './ui/SimPage';
import { WavesPage } from './ui/WavesPage';
import { Dashboard, LibraryPage, HandsOnPage, ProjectsPage } from './ui/Pages';
import { DocsPage } from './ui/DocsPage';

const NAV: [Page, string][] = [
  ['dashboard', 'Dashboard'],
  ['handson', 'Hands-on Library'],
  ['library', 'Component Library'],
  ['build', 'Build a Robot'],
  ['sim', 'Simulation & Control'],
  ['waves', 'Waveform Analysis'],
  ['projects', 'My Projects'],
  ['docs', 'Documentation'],
];

export default function App() {
  const { page, setPage, asm, renameProject, saveProject, dirty } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); useStore.getState().saveProject(); }
    };
    window.addEventListener('keydown', onKey);
    const before = (e: BeforeUnloadEvent) => { if (useStore.getState().dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', before); };
  }, []);
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><div className="brand-mark">R</div><div>ROBOVERSE<br /><small>Virtual Robotics Construction, Assembly & Simulation Lab</small></div></div>
        <nav className="nav">
          {NAV.map(([p, label]) => <button key={p} className={page === p ? 'on' : ''} onClick={() => setPage(p)}>{label}</button>)}
        </nav>
        <div className="spacer" />
        <div className="proj">
          <span className="small">Project</span>
          <input value={asm.name} onChange={(e) => renameProject(e.target.value)} />
          <button className="btn sm" onClick={() => saveProject()} title="Save (Ctrl+S)">{dirty ? '● Save' : 'Saved'}</button>
        </div>
      </div>
      <div style={{ minHeight: 0 }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'build' && <BuildPage />}
        {page === 'sim' && <SimPage />}
        {page === 'waves' && <WavesPage />}
        {page === 'library' && <LibraryPage />}
        {page === 'handson' && <HandsOnPage />}
        {page === 'projects' && <ProjectsPage />}
        {page === 'docs' && <DocsPage />}
      </div>
    </div>
  );
}
