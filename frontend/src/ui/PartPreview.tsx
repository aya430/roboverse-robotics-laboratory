import { useEffect, useRef } from 'react';
import { SceneManager } from './scene';
import type { Assembly } from '../engine/assembly';

/** Small auto-rotating 3D preview of a single catalog part or of a whole assembly. */
export function PartPreview({ itemId, asm, height = 220, rotate = true }: { itemId?: string; asm?: Assembly; height?: number | string; rotate?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const sm = useRef<SceneManager | null>(null);
  useEffect(() => {
    const m = new SceneManager(host.current!, { grid: !!asm, preview: true });
    m.autoRotate = rotate;
    sm.current = m;
    return () => m.dispose();
  }, []);
  useEffect(() => {
    const m = sm.current!;
    const a: Assembly = asm ?? { name: 'preview', instances: itemId ? [{ uid: 'p', item: itemId, clock: 0, loose: [0, 0, 0] }] : [] };
    m.setAssembly(a);
    m.pose({});
    m.root.rotation.z = 0;
    m.root.updateMatrixWorld(true);
    m.frameAll();
  }, [itemId, asm]);
  return <div ref={host} style={{ position: 'relative', height, width: '100%' }} />;
}
