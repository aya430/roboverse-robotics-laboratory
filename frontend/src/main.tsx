import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import './styles.css';

// Exposed for automated acceptance tests and power users (read-only use recommended).
(window as any).roboverse = { store: useStore };
createRoot(document.getElementById('root')!).render(<App />);
