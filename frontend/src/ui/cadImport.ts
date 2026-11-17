// In-browser CAD import: STEP / IGES / BREP (OpenCascade via occt-import-js WASM, LGPL-2.1), STL, OBJ, GLB/GLTF.
// Produces a single tessellated, indexed mesh in metres, Z-up, centred on its bounding box.
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Unit = 'mm' | 'cm' | 'm' | 'in';
export const UNIT_SCALE: Record<Unit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254 };
export const CAD_EXTENSIONS = ['.step', '.stp', '.iges', '.igs', '.brep', '.stl', '.obj', '.glb', '.gltf'];

export interface RawMesh { geometry: THREE.BufferGeometry; format: string; defaultUnit: Unit; yUp: boolean; parts: number; color?: string }

let occtPromise: Promise<any> | null = null;
async function occt() {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: factory }, { default: wasmUrl }] = await Promise.all([
        import('occt-import-js') as Promise<any>,
        import('occt-import-js/dist/occt-import-js.wasm?url') as Promise<any>,
      ]);
      return factory({ locateFile: () => wasmUrl });
    })();
  }
  return occtPromise;
}

function collect(obj: THREE.Object3D): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  obj.updateMatrixWorld(true);
  obj.traverse((o: any) => {
    if (o.isMesh && o.geometry?.attributes?.position) {
      let g: THREE.BufferGeometry = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      out.push(g);
    }
  });
  return out;
}

export async function parseCad(file: File): Promise<RawMesh> {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  const buf = await file.arrayBuffer();
  if (['.step', '.stp', '.iges', '.igs', '.brep'].includes(ext)) {
    const o = await occt();
    const data = new Uint8Array(buf);
    const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.002, angularDeflection: 0.5 };
    const r = ext === '.brep' ? o.ReadBrepFile(data, null) : ext === '.iges' || ext === '.igs' ? o.ReadIgesFile(data, params) : o.ReadStepFile(data, params);
    if (!r?.success || !r.meshes?.length) throw new Error('OpenCascade could not tessellate this file (unsupported entities or a corrupted file).');
    const geos = r.meshes.map((m: any) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      g.setIndex(m.index.array);
      return g.toNonIndexed();
    });
    const c = r.meshes[0].color;
    return { geometry: mergeGeometries(geos)!, format: ext.slice(1).toUpperCase(), defaultUnit: 'mm', yUp: false, parts: geos.length, color: c ? '#' + new THREE.Color(c[0], c[1], c[2]).getHexString() : undefined };
  }
  if (ext === '.stl') {
    const g = new STLLoader().parse(buf);
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    return { geometry: g, format: 'STL', defaultUnit: 'mm', yUp: false, parts: 1 };
  }
  if (ext === '.obj') {
    const grp = new OBJLoader().parse(new TextDecoder().decode(buf));
    const geos = collect(grp);
    if (!geos.length) throw new Error('No mesh found in the OBJ file.');
    return { geometry: mergeGeometries(geos)!, format: 'OBJ', defaultUnit: 'mm', yUp: true, parts: geos.length };
  }
  if (ext === '.glb' || ext === '.gltf') {
    const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(ext === '.gltf' ? new TextDecoder().decode(buf) : buf, '', res, rej));
    const geos = collect(gltf.scene);
    if (!geos.length) throw new Error('No mesh found in the glTF file (external .bin buffers are not supported – use .glb).');
    return { geometry: mergeGeometries(geos)!, format: ext === '.glb' ? 'GLB' : 'GLTF', defaultUnit: 'm', yUp: true, parts: geos.length };
  }
  throw new Error(`Unsupported format ${ext}. Supported: ${CAD_EXTENSIONS.join(', ')}`);
}

export interface Prepared { positions: Float32Array; indices: Uint32Array; size: [number, number, number]; volume: number; triangles: number; closed: boolean }

/** Scale to metres, convert Y-up to Z-up, weld vertices and centre on the bounding box. */
export function prepare(raw: RawMesh, unit: Unit, yUp: boolean): Prepared {
  let g = raw.geometry.clone();
  g.scale(UNIT_SCALE[unit], UNIT_SCALE[unit], UNIT_SCALE[unit]);
  if (yUp) g.rotateX(Math.PI / 2);
  g = mergeVertices(g.index ? g.toNonIndexed() : g, 1e-7);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const c = bb.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  const size = bb.getSize(new THREE.Vector3());
  const pos = g.attributes.position.array as Float32Array;
  const idx = g.index!.array;
  // signed-tetrahedron volume (exact for closed, consistently oriented meshes)
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, d = idx[i + 2] * 3;
    vol += (pos[a] * (pos[b + 1] * pos[d + 2] - pos[b + 2] * pos[d + 1]) - pos[a + 1] * (pos[b] * pos[d + 2] - pos[b + 2] * pos[d]) + pos[a + 2] * (pos[b] * pos[d + 1] - pos[b + 1] * pos[d])) / 6;
  }
  // closed-ness: every edge shared by exactly two triangles
  const edges = new Map<string, number>();
  for (let i = 0; i < idx.length; i += 3) for (const [u, v] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
    const k = u < v ? `${u}_${v}` : `${v}_${u}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  let closed = edges.size > 0;
  for (const n of edges.values()) if (n !== 2) { closed = false; break; }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), size: [size.x, size.y, size.z], volume: Math.abs(vol), triangles: idx.length / 3, closed };
}
