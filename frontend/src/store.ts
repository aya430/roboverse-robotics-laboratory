import { create } from 'zustand';
import {
  addLoose, addRoot, attachNew, checkAttach, detach, emptyAssembly, findInst, moveTo, removeWithSubtree, swapItem,
  updateInst, type Assembly,
} from './engine/assembly';
import { getItem } from './engine/catalog';
import { buildRobotModel, type Issue, type RobotModel } from './engine/robotModel';
import { autoTuneControl, type ControlConfig, type Scenario, type SimResult } from './engine/simulate';
import { buildTemplate, getTemplate } from './engine/templates';
import { registerItem, type CatalogItem } from './engine/catalog';
import type { V3 } from './engine/math';

export type Page = 'dashboard' | 'build' | 'sim' | 'waves' | 'library' | 'handson' | 'projects' | 'docs' | 'developer';
export type AsmMode = 'guided' | 'free' | 'challenge';
export interface LogLine { t: string; level: 'ok' | 'info' | 'warn' | 'error'; text: string }

export interface SimSettings {
  dt: number; recordHz: number; payload: number; friction: boolean;
  scenario: Scenario;
  control: ControlConfig;
}

/** Simulation defaults for a robot model: model-based gains, controller rate respected, template task. */
export function defaultSim(model?: RobotModel, templateId = 'arm6'): SimSettings {
  const t = getTemplate(templateId);
  const n = model?.n ?? 0;
  const control = model && n ? autoTuneControl(model, t.task.home?.length === n ? t.task.home : undefined) : autoTuneControlEmpty();
  if (model?.controller?.rate_hz) control.Ts = Math.max(control.Ts, 1 / model.controller.rate_hz);
  return {
    dt: 0.0005, recordHz: 200, payload: t.task.payload, friction: true,
    scenario: { kind: 'pickplace', pick: t.task.pick, place: t.task.place, approach: t.task.approach, speed: 0.6, dwell: 0.5 },
    control,
  };
}
const autoTuneControlEmpty = (): ControlConfig => ({ mode: 'PID+G', kp: [], ki: [], kd: [], ctcWn: 30, ctcZeta: 1, Ts: 0.001, currentBw: 1000, velFilterHz: 150 });

export interface ProjectFile {
  format: 'roboverse-project';
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  assembly: Assembly;
  /** user-imported CAD components used by this project */
  customParts?: CatalogItem[];
  template?: string;
  mode: AsmMode;
  challenge?: string;
  sim: SimSettings;
  q: number[];
}

interface State {
  page: Page;
  projectId: string;
  asm: Assembly;
  past: Assembly[];
  future: Assembly[];
  mode: AsmMode;
  challenge?: string;
  template: string; // reference architecture followed by guided mode / used for default tasks
  customParts: CatalogItem[];
  selected: string | null;
  armed: string | null; // catalog id picked from the library
  hover: string | null;
  explode: number;
  q: number[];
  sim: SimSettings;
  result: SimResult | null;
  simBusy: number | null; // progress 0..1
  playT: number;
  playing: boolean;
  log: LogLine[];
  model?: RobotModel;
  issues: Issue[];
  dirty: boolean;

  setPage: (p: Page) => void;
  logMsg: (level: LogLine['level'], text: string) => void;
  commit: (a: Assembly, msg?: string, level?: LogLine['level']) => void;
  undo: () => void;
  redo: () => void;
  arm: (id: string | null) => void;
  select: (uid: string | null) => void;
  placeArmedAt: (parentUid: string, portId: string) => boolean;
  placeArmedLoose: (pos: V3) => void;
  moveSelectedTo: (parentUid: string, portId: string) => void;
  removeSelected: () => void;
  detachSelected: () => void;
  rotateSelected: () => void;
  swapSelected: (itemId: string) => void;
  toggleHidden: (uid: string) => void;
  setParam: (uid: string, key: string, value: number | undefined) => void;
  setMode: (m: AsmMode, challenge?: string) => void;
  setExplode: (v: number) => void;
  setQ: (q: number[]) => void;
  setSim: (s: Partial<SimSettings>) => void;
  setResult: (r: SimResult | null) => void;
  setSimBusy: (p: number | null) => void;
  setPlay: (t: number, playing?: boolean) => void;
  newProject: (template?: string, guided?: boolean) => void;
  setTemplate: (id: string) => void;
  addCustomPart: (it: CatalogItem) => void;
  saveProject: () => ProjectFile;
  loadProject: (p: ProjectFile) => void;
  renameProject: (name: string) => void;
}

const now = () => new Date().toLocaleTimeString();
const newId = () => 'prj_' + Math.random().toString(36).slice(2, 10);

function derive(asm: Assembly) {
  const { model, issues } = buildRobotModel(asm);
  return { model, issues };
}

const STORAGE = 'roboverse.projects.v1';
export function listProjects(): ProjectFile[] {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); } catch { return []; }
}
function storeProject(p: ProjectFile) {
  const all = listProjects().filter((x) => x.id !== p.id);
  all.unshift(p);
  try { localStorage.setItem(STORAGE, JSON.stringify(all.slice(0, 40))); } catch { /* quota */ }
}
export function deleteStoredProject(id: string) {
  try { localStorage.setItem(STORAGE, JSON.stringify(listProjects().filter((x) => x.id !== id))); } catch { /* ignore */ }
}

const init = emptyAssembly('My first robot');

export const useStore = create<State>((set, get) => ({
  page: 'dashboard',
  projectId: newId(),
  asm: init,
  past: [], future: [],
  mode: 'guided',
  template: 'arm6',
  customParts: [],
  selected: null, armed: null, hover: null,
  explode: 0,
  q: [],
  sim: defaultSim(undefined),
  result: null, simBusy: null, playT: 0, playing: false,
  log: [{ t: now(), level: 'info', text: 'ROBOVERSE ready. Pick a component from the library, then click a highlighted mounting point (or drag it into the workspace).' }],
  ...derive(init),
  dirty: false,

  setPage: (page) => set({ page }),
  logMsg: (level, text) => set((s) => ({ log: [...s.log.slice(-300), { t: now(), level, text }] })),
  commit: (a, msg, level = 'ok') => {
    const d = derive(a);
    const n = d.model?.n ?? 0;
    set((s) => {
      // re-tune the controller whenever the joint structure changes (number or type of joints, actuators)
      const sig = (m?: RobotModel) => (m ? m.joints.map((J) => J.type + J.gear.ratio + J.motor.Kt).join('|') + (m.controller?.rate_hz ?? '') : '');
      const sim = sig(d.model) !== sig(s.model) ? { ...s.sim, control: defaultSim(d.model, s.template).control } : s.sim;
      return {
        asm: a, past: [...s.past.slice(-100), s.asm], future: [], ...d, dirty: true, sim,
        q: Array.from({ length: n }, (_, i) => s.q[i] ?? 0),
        result: null,
      };
    });
    if (msg) get().logMsg(level, msg);
  },
  undo: () => {
    const { past, asm, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ asm: prev, past: past.slice(0, -1), future: [asm, ...future], ...derive(prev), result: null, selected: null });
    get().logMsg('info', 'Undo');
  },
  redo: () => {
    const { past, asm, future } = get();
    if (!future.length) return;
    const nx = future[0];
    set({ asm: nx, past: [...past, asm], future: future.slice(1), ...derive(nx), result: null, selected: null });
    get().logMsg('info', 'Redo');
  },
  arm: (id) => {
    set({ armed: id, selected: null });
    if (id) {
      const it = getItem(id);
      if (it.root && get().asm.instances.some((i) => getItem(i.item).root)) get().logMsg('warn', 'The assembly already has a robot base.');
    }
  },
  select: (uid) => set({ selected: uid, armed: null }),
  placeArmedAt: (parentUid, portId) => {
    const { armed, asm } = get();
    if (!armed) return false;
    const chk = checkAttach(asm, armed, parentUid, portId);
    if (!chk.ok) { get().logMsg('error', chk.reason); return false; }
    const r = attachNew(asm, armed, parentUid, portId);
    get().commit(r.asm, `Connected: ${chk.reason}`);
    set({ selected: r.uid, armed: null });
    return true;
  },
  placeArmedLoose: (pos) => {
    const { armed, asm } = get();
    if (!armed) return;
    const it = getItem(armed);
    if (it.root) {
      if (asm.instances.some((i) => getItem(i.item).root)) { get().logMsg('error', 'Only one robot base is allowed.'); return; }
      const a = addRoot(asm, armed);
      get().commit(a, `${it.name} placed and anchored to the ground (root of the kinematic tree).`);
      set({ armed: null, selected: a.instances[a.instances.length - 1].uid });
      return;
    }
    const r = addLoose(asm, armed, pos);
    get().commit(r.asm, `${it.name} placed in the workspace but not connected (grey). Select it and click a highlighted mounting point to connect it.`, 'warn');
    set({ armed: null, selected: r.uid });
  },
  moveSelectedTo: (parentUid, portId) => {
    const { selected, asm } = get();
    if (!selected) return;
    try {
      const a = moveTo(asm, selected, parentUid, portId);
      get().commit(a, `${getItem(findInst(asm, selected)!.item).name} connected.`);
    } catch (e: any) { get().logMsg('error', e.message); }
  },
  removeSelected: () => {
    const { selected, asm } = get();
    if (!selected) return;
    const inst = findInst(asm, selected);
    if (!inst) return;
    get().commit(removeWithSubtree(asm, selected), `Removed ${getItem(inst.item).name} and everything mounted on it.`, 'info');
    set({ selected: null });
  },
  detachSelected: () => {
    const { selected, asm } = get();
    const inst = findInst(asm, selected ?? undefined);
    if (!inst || !inst.parent) return;
    get().commit(detach(asm, inst.uid, [0.7, -0.6 + Math.random() * 0.3, 0]), `Detached ${getItem(inst.item).name} (with its sub-assembly).`, 'info');
  },
  rotateSelected: () => {
    const { selected, asm } = get();
    const inst = findInst(asm, selected ?? undefined);
    if (!inst || !inst.parent) return;
    const clock = (inst.clock + 1) % 4;
    get().commit(updateInst(asm, inst.uid, { clock }), `${getItem(inst.item).name} rotated to ${clock * 90}° about the mating axis.`, 'info');
  },
  swapSelected: (itemId) => {
    const { selected, asm } = get();
    const inst = findInst(asm, selected ?? undefined);
    if (!inst) return;
    try {
      get().commit(swapItem(asm, inst.uid, itemId), `Replaced ${getItem(inst.item).name} with ${getItem(itemId).name} (interfaces identical, mounted parts kept).`);
    } catch (e: any) { get().logMsg('error', e.message); }
  },
  toggleHidden: (uid) => {
    const inst = findInst(get().asm, uid);
    if (!inst) return;
    set((s) => ({ asm: updateInst(s.asm, uid, { hidden: !inst.hidden }) }));
  },
  setParam: (uid, key, value) => {
    const inst = findInst(get().asm, uid);
    if (!inst) return;
    const params = { ...(inst.params ?? {}) };
    if (value === undefined || isNaN(value)) delete params[key];
    else params[key] = value;
    get().commit(updateInst(get().asm, uid, { params }), `${getItem(inst.item).name}: ${key} = ${value ?? 'catalog default'}`, 'info');
  },
  setMode: (mode, challenge) => set({ mode, challenge }),
  setExplode: (explode) => set({ explode }),
  setQ: (q) => set({ q }),
  setSim: (s) => set((st) => ({ sim: { ...st.sim, ...s }, dirty: true })),
  setResult: (result) => set({ result, playT: 0, playing: false }),
  setSimBusy: (simBusy) => set({ simBusy }),
  setPlay: (playT, playing) => set((s) => ({ playT, playing: playing ?? s.playing })),
  newProject: (template = 'empty', guided = false) => {
    const tid = template === 'empty' ? get().template : template;
    const a = template === 'empty' ? emptyAssembly('Untitled robot') : buildTemplate(template);
    const d = derive(a);
    const home = getTemplate(tid).task.home;
    const n = d.model?.n ?? 0;
    set({
      projectId: newId(), asm: a, past: [], future: [], ...d, selected: null, armed: null, result: null, dirty: false, template: tid,
      q: home && home.length === n ? home.slice() : new Array(n).fill(0), sim: defaultSim(d.model, tid), mode: template === 'empty' && guided ? 'guided' : template === 'empty' ? get().mode : 'free', challenge: undefined,
    });
    get().logMsg('info', template === 'empty' ? 'New empty project.' : `Opened the template “${getTemplate(template).name}”. Modify it freely.`);
  },
  setTemplate: (id) => set({ template: id }),
  addCustomPart: (it) => { registerItem(it); set((s) => ({ customParts: [...s.customParts.filter((c) => c.id !== it.id), it], dirty: true })); },
  saveProject: () => {
    const s = get();
    const used = new Set(s.asm.instances.map((i) => i.item));
    const p: ProjectFile = { format: 'roboverse-project', version: 1, id: s.projectId, name: s.asm.name, savedAt: new Date().toISOString(), assembly: s.asm, customParts: s.customParts.filter((c) => used.has(c.id)), template: s.template, mode: s.mode, challenge: s.challenge, sim: s.sim, q: s.q };
    storeProject(p);
    set({ dirty: false });
    get().logMsg('ok', `Project “${p.name}” saved (${new Date().toLocaleString()}).`);
    return p;
  },
  loadProject: (p) => {
    if (p.format !== 'roboverse-project') throw new Error('Not a ROBOVERSE project file');
    for (const c of p.customParts ?? []) registerItem(c);
    for (const i of p.assembly.instances) getItem(i.item); // validates catalog ids
    const d = derive(p.assembly);
    const sim0 = defaultSim(d.model, p.template ?? 'arm6');
    const sim = { ...sim0, ...p.sim };
    if (sim.control.kp.length !== (d.model?.n ?? 0)) sim.control = sim0.control;
    set({ projectId: p.id, asm: p.assembly, past: [], future: [], ...d, mode: p.mode, challenge: p.challenge, template: p.template ?? 'arm6', customParts: p.customParts ?? [], sim, q: p.q ?? [], selected: null, armed: null, result: null, dirty: false, page: 'build' });
    get().logMsg('ok', `Opened project “${p.name}” (saved ${new Date(p.savedAt).toLocaleString()}).`);
  },
  renameProject: (name) => set((s) => ({ asm: { ...s.asm, name }, dirty: true })),
}));
