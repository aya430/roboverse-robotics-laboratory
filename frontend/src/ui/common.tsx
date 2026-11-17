import type { Category } from '../engine/catalog';

export const CAT_STYLE: Record<Category, { c: string; t: string }> = {
  Structure: { c: '#b4541a', t: 'ST' },
  Actuators: { c: '#3a4352', t: 'M' },
  Transmissions: { c: '#5b6676', t: 'G' },
  Links: { c: '#d0742c', t: 'L' },
  'End-effectors': { c: '#8a7a14', t: 'EE' },
  Sensors: { c: '#2f8f6b', t: 'S' },
  Electronics: { c: '#2457b8', t: 'E' },
};

export function download(name: string, content: string | Blob, type = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fmt = (v: number | undefined, d = 2) => (v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
export const slug = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'roboverse';

export function Tag({ level, children }: { level: string; children: React.ReactNode }) {
  return <span className={`tag ${level}`}>{children}</span>;
}
