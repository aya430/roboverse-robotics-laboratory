// three.js geometry builders for the procedural CAD primitives (see engine/geometry.ts).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Shape } from '../engine/catalog';
import { profileSide } from '../engine/geometry';

const cache = new Map<string, THREE.BufferGeometry>();

const zCyl = (rTop: number, rBot: number, h: number, seg = 40) => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.rotateX(Math.PI / 2);
  return g;
};

const extrude = (shape: THREE.Shape, depth: number, bevel = 0) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 24 });
  g.translate(0, 0, -depth / 2);
  return g;
};

function tslotShape(a: number) {
  // Simplified 20-series style T-slot: square with a slot on every face and a central bore
  const h = a / 2, so = a * 0.3, sd = a * 0.3, sw = a * 0.55, lip = a * 0.1;
  const s = new THREE.Shape();
  const pts: [number, number][] = [];
  // walk around the square, cutting a T-slot into each face (generated for +x face and rotated)
  const face: [number, number][] = [
    [h, -h], [h, -so / 2], [h - lip, -so / 2], [h - lip, -sw / 2], [h - sd, -sw / 2 * 0.6], [h - sd, sw / 2 * 0.6], [h - lip, sw / 2], [h - lip, so / 2], [h, so / 2],
  ];
  for (let k = 0; k < 4; k++) {
    const c = Math.cos((k * Math.PI) / 2), sn = Math.sin((k * Math.PI) / 2);
    for (const [x, y] of face) pts.push([x * c - y * sn, x * sn + y * c]);
  }
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, a * 0.12, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

function gearShape(m: number, z: number, bore: number) {
  const rp = (m * z) / 2, ra = rp + m, rf = rp - 1.25 * m;
  const s = new THREE.Shape();
  const step = (2 * Math.PI) / z;
  for (let i = 0; i < z; i++) {
    const a = i * step;
    const pts: [number, number][] = [
      [rf, a - step * 0.27], [ra, a - step * 0.13], [ra, a + step * 0.13], [rf, a + step * 0.27], [rf, a + step * 0.5],
    ];
    pts.forEach(([r, t], k) => {
      const x = r * Math.cos(t), y = r * Math.sin(t);
      if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore / 2, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

function build(sh: Shape): THREE.BufferGeometry {
  const d = sh.dims;
  switch (sh.kind) {
    case 'cyl': return zCyl(d[0], d[0], d[1]);
    case 'box': return new THREE.BoxGeometry(d[0], d[1], d[2]);
    case 'rbox': return new RoundedBoxGeometry(d[0], d[1], d[2], 3, Math.min(d[3] ?? 0.003, Math.min(d[0], d[1], d[2]) / 2.01));
    case 'tube': {
      const s = new THREE.Shape();
      s.absarc(0, 0, d[0], 0, Math.PI * 2, false);
      const h = new THREE.Path();
      h.absarc(0, 0, d[1], 0, Math.PI * 2, true);
      s.holes.push(h);
      return extrude(s, d[2]);
    }
    case 'cone': return zCyl(d[1], d[0], d[2]);
    case 'sphere': return new THREE.SphereGeometry(d[0], 32, 18);
    case 'torus': return new THREE.TorusGeometry(d[0], d[1], 16, 48);
    case 'hex': return zCyl(d[0] / Math.sqrt(3), d[0] / Math.sqrt(3), d[1], 6);
    case 'gear': {
      const g = extrude(gearShape(d[0], Math.round(d[1]), d[3]), d[2]);
      const helix = ((d[4] ?? 0) * Math.PI) / 180;
      if (helix) {
        // twist the extrusion for a helical gear: rotation proportional to z
        const rp = (d[0] * d[1]) / 2;
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const z = pos.getZ(i), t = (z * Math.tan(helix)) / rp;
          const x = pos.getX(i), y = pos.getY(i);
          pos.setXY(i, x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
        }
        g.computeVertexNormals();
      }
      return g;
    }
    case 'profile': return extrude(tslotShape(profileSide(d[0])), d[1]);
    case 'spring': {
      const [R, r, L, turns] = d;
      const pts: THREE.Vector3[] = [];
      const N = Math.max(40, Math.round(turns * 24));
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), -L / 2 + t * L));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, r, 8, false);
    }
    case 'bolts': {
      const [pcd, n, hd, hh] = d;
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / n;
        const g = zCyl(hd / 2, hd / 2, hh, 14);
        g.translate((pcd / 2) * Math.cos(a), (pcd / 2) * Math.sin(a), 0);
        parts.push(g);
        const sock = zCyl(hd * 0.22, hd * 0.22, hh * 0.2, 6);
        sock.translate((pcd / 2) * Math.cos(a), (pcd / 2) * Math.sin(a), hh / 2);
        parts.push(sock);
      }
      return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
    }
    case 'mesh': return new THREE.BoxGeometry(d[0], d[1], d[2]);
    case 'fins': {
      const [x, y, bh, fh, n] = d;
      const parts: THREE.BufferGeometry[] = [];
      const base = new THREE.BoxGeometry(x, y, bh);
      base.translate(0, 0, -(bh + fh) / 2 + bh / 2);
      parts.push(base);
      for (let i = 0; i < n; i++) {
        const f = new THREE.BoxGeometry(Math.max(0.0012, x / (n * 3)), y, fh);
        f.translate(-x / 2 + (x / n) * (i + 0.5), 0, -(bh + fh) / 2 + bh + fh / 2);
        parts.push(f);
      }
      return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
    }
  }
}

export function shapeGeometry(sh: Shape): THREE.BufferGeometry {
  const key = sh.kind + ':' + sh.dims.join(',');
  let g = cache.get(key);
  if (!g) { g = build(sh); cache.set(key, g); }
  return g;
}

const FINISH: Record<string, { metalness: number; roughness: number }> = {
  metal: { metalness: 0.75, roughness: 0.32 },
  anodised: { metalness: 0.45, roughness: 0.45 },
  plastic: { metalness: 0.0, roughness: 0.55 },
  rubber: { metalness: 0.0, roughness: 0.9 },
  pcb: { metalness: 0.1, roughness: 0.6 },
  glass: { metalness: 0.2, roughness: 0.05 },
  carbon: { metalness: 0.3, roughness: 0.35 },
};
export const finishOf = (sh: Shape) => FINISH[sh.finish ?? 'anodised'];

const b64ToBuf = (b64: string) => {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
};
export const bufToB64 = (buf: ArrayBufferLike) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const meshCache = new Map<string, THREE.BufferGeometry>();
export function meshGeometry(m: NonNullable<Shape['mesh']>): THREE.BufferGeometry {
  let g = meshCache.get(m.id);
  if (!g) {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b64ToBuf(m.positions)), 3));
    if (m.indices) g.setIndex(new THREE.BufferAttribute(new Uint32Array(b64ToBuf(m.indices)), 1));
    g = toCreasedNormals(g, Math.PI / 6); // keep CAD edges sharp, curved faces smooth
    meshCache.set(m.id, g);
  }
  return g;
}
