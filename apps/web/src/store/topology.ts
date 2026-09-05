import { create } from "zustand";
import type {
  Device,
  DeviceType,
  LintIssue,
  OpResult,
  Position,
  ProbeResult,
  Runtime,
  Topology,
  Viewport,
} from "../engine";
import {
  buildRuntime,
  createDevice,
  createLink,
  emptyTopology,
  ensureSparePorts,
  lint,
} from "../engine";
import { keepViewport, pushHistory } from "./history";

export type Selection =
  | { kind: "device"; id: string }
  | { kind: "devices"; ids: string[] }
  | { kind: "link"; id: string }
  | { kind: "none" };

export type SaveState = "saved" | "saving";

interface Derived {
  runtime: Runtime;
  issues: LintIssue[];
}

function derive(topology: Topology): Derived {
  return { runtime: buildRuntime(topology), issues: lint(topology) };
}

interface TopologyState extends Derived {
  topology: Topology;
  selection: Selection;
  highlightField: string | null;
  highlightPortId: string | null;
  lastProbe: ProbeResult | null;
  saveState: SaveState;
  loaded: boolean;
  past: Topology[];
  future: Topology[];

  replaceTopology: (
    topology: Topology,
    options?: { keepProbe?: boolean; record?: boolean },
  ) => void;
  setLoaded: () => void;
  setSaveState: (state: SaveState) => void;
  rename: (name: string) => void;
  setViewport: (viewport: Viewport) => void;

  addDevice: (type: DeviceType, position: Position) => void;
  moveDevice: (id: string, position: Position) => void;
  moveDevices: (moves: { id: string; position: Position }[]) => void;
  updateDevice: (id: string, updater: (device: Device) => Device) => void;
  /** 引擎的拓扑操作（就地改）：深拷贝一份跑一遍，成功才落库，失败原样返回给表单显示 */
  runOp: (run: (draft: Topology) => OpResult) => OpResult;
  removeDevice: (id: string) => void;
  removeElements: (deviceIds: string[], linkIds: string[]) => void;

  connect: (
    a: { deviceId: string; portId: string },
    b: { deviceId: string; portId: string },
  ) => void;
  removeLink: (id: string) => void;

  select: (selection: Selection, field?: string | null, portId?: string | null) => void;
  setProbe: (result: ProbeResult | null) => void;

  undo: () => void;
  redo: () => void;
}

function withLinkId(topology: Topology, portId: string, linkId: string | null): Topology {
  return {
    ...topology,
    devices: topology.devices.map((device) =>
      device.ports.some((p) => p.id === portId)
        ? {
            ...device,
            ports: device.ports.map((p) => (p.id === portId ? { ...p, linkId } : p)),
          }
        : device,
    ) as Device[],
  };
}

function normalize(topology: Topology): Topology {
  return ensureSparePorts(topology);
}

/** 删掉一批设备与连线：连带删掉挂在这些设备上的连线，并把对端端口的 linkId 清空 */
function dropElements(topology: Topology, deviceIds: string[], linkIds: string[]): Topology {
  const devices = new Set(deviceIds);
  const doomed = topology.links.filter(
    (l) => devices.has(l.a.deviceId) || devices.has(l.b.deviceId) || linkIds.includes(l.id),
  );
  let next: Topology = {
    ...topology,
    devices: topology.devices.filter((d) => !devices.has(d.id)),
    links: topology.links.filter((l) => !doomed.some((x) => x.id === l.id)),
  };
  for (const link of doomed) {
    next = withLinkId(next, link.a.portId, null);
    next = withLinkId(next, link.b.portId, null);
  }
  return next;
}

export const useTopologyStore = create<TopologyState>((set, get) => {
  const initial = emptyTopology();

  /** 改拓扑的统一出口：算派生值、进撤销栈、标记待保存 */
  const commit = (topology: Topology, extra: Partial<TopologyState> = {}, record = true) => {
    const previous = get().topology;
    const next = normalize(topology);
    set({
      topology: next,
      ...derive(next),
      saveState: "saving",
      ...(record ? { past: pushHistory(get().past, previous), future: [] } : {}),
      ...extra,
    });
  };

  return {
    topology: initial,
    ...derive(initial),
    selection: { kind: "none" },
    highlightField: null,
    highlightPortId: null,
    lastProbe: null,
    saveState: "saved",
    loaded: false,
    past: [],
    future: [],

    replaceTopology: (topology, options) => {
      commit(
        topology,
        {
          selection: { kind: "none" },
          highlightField: null,
          highlightPortId: null,
          lastProbe: options?.keepProbe ? get().lastProbe : null,
        },
        options?.record ?? false,
      );
    },
    setLoaded: () => set({ loaded: true }),
    setSaveState: (state) => set({ saveState: state }),
    // 名称不进撤销栈（CP2 决定）
    rename: (name) => commit({ ...get().topology, name }, {}, false),
    setViewport: (viewport) => {
      const topology = { ...get().topology, viewport };
      set({ topology, saveState: "saving" });
    },

    addDevice: (type, position) => {
      const topology = get().topology;
      const device = createDevice(type, position, topology);
      commit({ ...topology, devices: [...topology.devices, device] });
    },

    moveDevice: (id, position) => {
      const topology = get().topology;
      commit({
        ...topology,
        devices: topology.devices.map((d) => (d.id === id ? { ...d, position } : d)) as Device[],
      });
    },

    moveDevices: (moves) => {
      if (moves.length === 0) return;
      const topology = get().topology;
      const byId = new Map(moves.map((m) => [m.id, m.position]));
      const devices = topology.devices.map((d) => {
        const position = byId.get(d.id);
        if (!position) return d;
        if (d.position.x === position.x && d.position.y === position.y) return d;
        return { ...d, position };
      }) as Device[];
      if (devices.every((d, i) => d === topology.devices[i])) return;
      commit({ ...topology, devices });
    },

    updateDevice: (id, updater) => {
      const topology = get().topology;
      commit({
        ...topology,
        devices: topology.devices.map((d) => (d.id === id ? updater(d) : d)) as Device[],
      });
    },

    runOp: (run) => {
      const draft = structuredClone(get().topology);
      const result = run(draft);
      if (result.ok) commit(draft);
      return result;
    },

    removeDevice: (id) => get().removeElements([id], []),

    removeElements: (deviceIds, linkIds) => {
      if (deviceIds.length === 0 && linkIds.length === 0) return;
      const topology = get().topology;
      const next = dropElements(topology, deviceIds, linkIds);
      // 结果里提到被删设备就作废，免得逐跳列表留下没有名字的设备
      const probe = get().lastProbe;
      const stale = deviceIds.some(
        (id) => probe?.decisions.some((d) => d.deviceId === id) || probe?.path.includes(id),
      );
      commit(next, {
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
        ...(stale ? { lastProbe: null } : {}),
      });
    },

    connect: (a, b) => {
      const topology = get().topology;
      if (a.deviceId === b.deviceId) return;
      const portOf = (end: { deviceId: string; portId: string }) =>
        topology.devices.find((d) => d.id === end.deviceId)?.ports.find((p) => p.id === end.portId);
      const pa = portOf(a);
      const pb = portOf(b);
      if (!pa || !pb) return;
      if (pa.linkId !== null || pb.linkId !== null) return;
      const link = createLink(a, b);
      const id = link.id;
      let next: Topology = { ...topology, links: [...topology.links, link] };
      next = withLinkId(next, a.portId, id);
      next = withLinkId(next, b.portId, id);
      commit(next);
    },

    removeLink: (id) => {
      const topology = get().topology;
      if (!topology.links.some((l) => l.id === id)) return;
      commit(dropElements(topology, [], [id]), {
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
      });
    },

    select: (selection, field = null, portId = null) =>
      set({ selection, highlightField: field, highlightPortId: portId }),
    setProbe: (result) => set({ lastProbe: result }),

    undo: () => {
      const { past, topology, future } = get();
      const snapshot = past[past.length - 1];
      if (!snapshot) return;
      const restored = keepViewport(snapshot, topology);
      set({
        topology: restored,
        ...derive(restored),
        past: past.slice(0, -1),
        future: pushHistory(future, topology),
        saveState: "saving",
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
        lastProbe: null,
      });
    },

    redo: () => {
      const { past, topology, future } = get();
      const snapshot = future[future.length - 1];
      if (!snapshot) return;
      const restored = keepViewport(snapshot, topology);
      set({
        topology: restored,
        ...derive(restored),
        past: pushHistory(past, topology),
        future: future.slice(0, -1),
        saveState: "saving",
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
        lastProbe: null,
      });
    },
  };
});

export function canConnect(
  topology: Topology,
  a: { deviceId: string; portId: string },
  b: { deviceId: string; portId: string },
): boolean {
  if (a.deviceId === b.deviceId) return false;
  const portOf = (end: { deviceId: string; portId: string }) =>
    topology.devices.find((d) => d.id === end.deviceId)?.ports.find((p) => p.id === end.portId);
  const pa = portOf(a);
  const pb = portOf(b);
  return Boolean(pa && pb && pa.linkId === null && pb.linkId === null);
}

// 调试用：开发模式下把 store 挂到 window，方便在浏览器里查状态
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useTopologyStore;
}
