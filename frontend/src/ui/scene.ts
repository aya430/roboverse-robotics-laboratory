// three.js scene manager. Pure visualisation: it never computes physics. It renders the shared
// assembly at joint angles supplied by the store (posing sliders) or by recorded simulation samples.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getItem, type Shape, type Port } from '../engine/catalog';
import { shapeGeometry, finishOf, meshGeometry } from './shapeMesh';
import { computeFrames, isConnected, portTf, type Assembly } from '../engine/assembly';
import { eulerDeg, tf, tmul, type Tf, type V3 } from '../engine/math';

export const tfToMatrix = (T: Tf, m = new THREE.Matrix4()) =>
  m.set(T.R[0], T.R[1], T.R[2], T.p[0], T.R[3], T.R[4], T.R[5], T.p[1], T.R[6], T.R[7], T.R[8], T.p[2], 0, 0, 0, 1);

export type PortState = 'recommended' | 'incomplete' | 'free' | 'invalid' | 'target' | 'connected';
export const PORT_COLORS: Record<PortState, number> = {
  recommended: 0x2f7bff, incomplete: 0xf2b705, free: 0x8a96a8, invalid: 0xe5484d, target: 0x2f7bff, connected: 0x2fb67c,
};

interface PartObj {
  uid: string;
  group: THREE.Group; // instance frame
  outGroup?: THREE.Group; // rotating output (gearbox)
  fingers: { mesh: THREE.Mesh; side: number; base: THREE.Vector3; width: number; angle?: number }[];
  meshes: THREE.Mesh[];
}

export interface PortMarker { uid: string; port: Port; mesh: THREE.Mesh; world: THREE.Vector3 }

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root = new THREE.Group();
  env = new THREE.Group();
  overlay = new THREE.Group();
  parts = new Map<string, PartObj>();
  markers: PortMarker[] = [];
  private raf = 0;
  private asm?: Assembly;
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  onFrame?: () => void;
  autoRotate = false;
  /** Render loose parts with normal materials (library previews). */
  noLoose = false;
  private ro: ResizeObserver;

  constructor(public el: HTMLElement, opts: { grid?: boolean; preview?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = !opts.preview;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(opts.preview ? 0x1b2129 : 0x151a21);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(1.7, -1.5, 1.25);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0.15, 0, 0.45);
    this.controls.enableDamping = true;
    this.controls.update();

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a2f36, 0.7);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, -1.5, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -1.5; sc.right = 1.5; sc.top = 1.5; sc.bottom = -1.5;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.6);
    fill.position.set(-2, 2, 1);
    this.scene.add(fill);

    this.noLoose = !!opts.preview;
    if (opts.grid !== false) {
      const grid = new THREE.GridHelper(4, 40, 0x3a4554, 0x262e38);
      grid.rotation.x = Math.PI / 2;
      this.env.add(grid);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.35 }));
      floor.receiveShadow = true;
      floor.name = 'floor';
      this.env.add(floor);
      const axes = new THREE.AxesHelper(0.25);
      (axes.material as THREE.Material).depthTest = false;
      axes.renderOrder = 2;
      this.env.add(axes);
    }
    this.scene.add(this.env, this.root, this.overlay);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.autoRotate) this.root.rotation.z += 0.006;
      this.controls.update();
      this.onFrame?.();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private mat(sh: Shape, kind: 'normal' | 'loose' = 'normal') {
    const color = sh.color ?? '#999999';
    const key = color + (sh.finish ?? '') + kind;
    let m = this.mats.get(key);
    if (!m) {
      const c = new THREE.Color(color);
      if (kind === 'loose') c.lerp(new THREE.Color(0x777777), 0.7);
      const f = finishOf(sh);
      m = new THREE.MeshStandardMaterial({ color: c, metalness: f.metalness, roughness: f.roughness, transparent: kind === 'loose' || sh.finish === 'glass', opacity: kind === 'loose' ? 0.75 : sh.finish === 'glass' ? 0.55 : 1, envMapIntensity: 1 });
      this.mats.set(key, m);
    }
    return m;
  }

  private shapeMesh(sh: Shape, mat: THREE.Material) {
    const g = sh.mesh ? meshGeometry(sh.mesh) : shapeGeometry(sh);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tfToMatrix(tf(eulerDeg(sh.rot), sh.pos), mesh.matrix);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** Rebuild part meshes when the assembly structure changes. */
  setAssembly(a: Assembly) {
    this.asm = a;
    for (const p of this.parts.values()) {
      this.root.remove(p.group);
      if (p.outGroup) this.root.remove(p.outGroup);
    }
    this.parts.clear();
    for (const inst of a.instances) {
      const item = getItem(inst.item);
      const loose = !this.noLoose && !isConnected(a, inst);
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.userData.uid = inst.uid;
      const obj: PartObj = { uid: inst.uid, group, fingers: [], meshes: [] };
      if (item.gearbox) {
        obj.outGroup = new THREE.Group();
        obj.outGroup.matrixAutoUpdate = false;
        obj.outGroup.userData.uid = inst.uid;
        this.root.add(obj.outGroup);
      }
      for (const sh of item.shapes) {
        const mesh = this.shapeMesh(sh, this.mat(sh, loose ? 'loose' : 'normal'));
        mesh.userData.uid = inst.uid;
        if (sh.finger) {
          obj.fingers.push({ mesh, side: sh.finger, base: new THREE.Vector3(...sh.pos), width: sh.dims[0], angle: sh.fingerAngle });
          mesh.matrixAutoUpdate = true;
          mesh.position.set(...sh.pos);
          if (sh.rot) mesh.rotation.set(...(sh.rot.map((v) => (v * Math.PI) / 180) as [number, number, number]));
        }
        (sh.onOutput ? obj.outGroup! : group).add(mesh);
        obj.meshes.push(mesh);
      }
      group.visible = !inst.hidden;
      if (obj.outGroup) obj.outGroup.visible = !inst.hidden;
      this.root.add(group);
      this.parts.set(inst.uid, obj);
    }
  }

  /** Update all transforms. q: joint angle per gearbox uid. */
  pose(q: Record<string, number>, explode = 0, gripperOpen?: number) {
    if (!this.asm) return new Map();
    const frames = computeFrames(this.asm, q, explode);
    for (const [uid, f] of frames) {
      const p = this.parts.get(uid);
      if (!p) continue;
      tfToMatrix(f.T, p.group.matrix);
      p.group.matrixWorldNeedsUpdate = true;
      if (p.outGroup && f.Tout) { tfToMatrix(f.Tout, p.outGroup.matrix); p.outGroup.matrixWorldNeedsUpdate = true; }
      if (p.fingers.length) {
        const item = getItem(this.asm.instances.find((i) => i.uid === uid)!.item);
        const open = gripperOpen ?? item.gripper?.stroke ?? 0.08;
        for (const fg of p.fingers) {
          if (fg.angle !== undefined) {
            const a = (fg.angle * Math.PI) / 180, r = open / 2 + fg.width / 2;
            fg.mesh.position.set(r * Math.cos(a), r * Math.sin(a), fg.base.z);
          } else fg.mesh.position.set(fg.side * (open / 2 + fg.width / 2), fg.base.y, fg.base.z);
        }
      }
    }
    return frames;
  }

  setHighlight(uid: string | null) {
    for (const p of this.parts.values()) {
      for (const m of p.meshes) {
        const base = m.material as THREE.MeshStandardMaterial;
        if (p.uid === uid) {
          if (!m.userData.hl) {
            const hl = base.clone();
            hl.emissive = new THREE.Color(0x2f7bff);
            hl.emissiveIntensity = 0.45;
            m.userData.base = base;
            m.userData.hl = hl;
          }
          m.material = m.userData.hl;
        } else if (m.userData.base) m.material = m.userData.base;
      }
    }
  }

  /** Port markers at the given free ports. */
  setMarkers(list: { uid: string; port: Port; state: PortState }[], frames: Map<string, { T: Tf }>) {
    for (const m of this.markers) { this.overlay.remove(m.mesh); m.mesh.geometry.dispose(); }
    this.markers = [];
    for (const it of list) {
      const f = frames.get(it.uid);
      if (!f) continue;
      const W = tmul(f.T, portTf(it.port));
      const big = it.state === 'recommended' || it.state === 'target';
      const conn = it.state === 'connected';
      const r = big ? 0.034 : conn ? 0.012 : 0.022;
      const g = new THREE.TorusGeometry(r, big ? 0.0065 : conn ? 0.0025 : 0.004, 10, 40);
      const mat = new THREE.MeshBasicMaterial({ color: PORT_COLORS[it.state], depthTest: conn, transparent: true, opacity: big ? 0.95 : conn ? 0.55 : 0.7 });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 5;
      mesh.matrixAutoUpdate = false;
      tfToMatrix(W, mesh.matrix);
      // axis arrow for recommended ports
      if (big) {
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.07, PORT_COLORS[it.state], 0.022, 0.014);
        arrow.traverse((o: any) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 5; } });
        mesh.add(arrow);
      }
      mesh.userData = { uid: it.uid, portId: it.port.id, state: it.state };
      this.overlay.add(mesh);
      this.markers.push({ uid: it.uid, port: it.port, mesh, world: new THREE.Vector3(...W.p) });
    }
  }

  pulse(time: number) {
    for (const m of this.markers) {
      const st = m.mesh.userData.state as PortState;
      if (st === 'recommended' || st === 'target') {
        (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(time * 6));
      }
    }
  }

  screenPos(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, behind: p.z > 1 };
  }

  pick(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    // markers first (screen-space tolerance)
    let best: PortMarker | undefined, bd = 26;
    for (const m of this.markers) {
      if (m.mesh.userData.state === 'connected') continue;
      const s = this.screenPos(m.world);
      const d = Math.hypot(s.x - (clientX - r.left), s.y - (clientY - r.top));
      if (d < bd && !s.behind) { bd = d; best = m; }
    }
    const hits = ray.intersectObjects(this.root.children, true);
    const part = hits.find((h) => h.object.userData.uid)?.object.userData.uid as string | undefined;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const g = new THREE.Vector3();
    const ground = ray.ray.intersectPlane(plane, g) ? ([g.x, g.y, 0] as V3) : undefined;
    return { marker: best, part, ground };
  }

  nearestMarker(clientX: number, clientY: number, filter: (m: PortMarker) => boolean, tol = 90) {
    const r = this.renderer.domElement.getBoundingClientRect();
    let best: PortMarker | undefined, bd = tol;
    for (const m of this.markers) {
      if (m.mesh.userData.state === 'connected' || !filter(m)) continue;
      const s = this.screenPos(m.world);
      const d = Math.hypot(s.x - (clientX - r.left), s.y - (clientY - r.top));
      if (d < bd && !s.behind) { bd = d; best = m; }
    }
    return best;
  }

  frameAll() {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(c);
    const dir = new THREE.Vector3(1.1, -1, 0.75).normalize();
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(Math.max(0.35, s * 1.25))));
  }

  snapshot(): string { return this.renderer.domElement.toDataURL('image/png'); }
}

// --------- simulation environment helpers ---------
export function makeTable(center: V3, topZ: number, size = 0.32, color = 0x5b4a3c) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.03), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  top.position.set(center[0], center[1], topZ - 0.015);
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, topZ - 0.03), new THREE.MeshStandardMaterial({ color: 0x444b55 }));
    leg.position.set(center[0] + sx * (size / 2 - 0.02), center[1] + sy * (size / 2 - 0.02), (topZ - 0.03) / 2);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}
