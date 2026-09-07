import { create } from "zustand";
import type {
  Device,
  DeviceType,
  Link,
  LintIssue,
  OpResult,
  Port,
  Position,
  ProbeResult,
  Runtime,
  Topology,
  Viewport,
  VisitSiteOptions,
} from "../engine";
import {
  buildRuntime,
  createDevice,
  createLink,
  dnsQuery,
  emptyTopology,
  ensureSparePorts,
  lint,
  ping,
  traceroute,
  visitSite,
} from "../engine";
import { keepViewport, pushHistory } from "./history";

/** 发起过的验证，「重新验证」按它重跑（CP3 4.1） */
export interface ProbeRequest {
  kind: ProbeResult["kind"];
  sourceDeviceId: string;
  targetIp?: string;
  domain?: string;
  port?: number;
  server?: string;
  proxy?: VisitSiteOptions["proxy"];
}

/**
 * 拓扑里会影响验证结果的那部分。位置、视口、名称改了结果照样成立，
 * 所以不进这个指纹，`topologyRevision` 也就不会变（CP3 4.2）。
 */
function structuralKey(topology: Topology): string {
  return JSON.stringify({
    devices: topology.devices.map((d) => ({
      id: d.id,
      type: d.type,
      ports: d.ports.map(({ displaySide: _displaySide, ...port }) => port),
      config: d.config,
      accessPolicy: d.accessPolicy,
    })),
    links: topology.links.map(({ curve: _curve, ...link }) => link),
  });
}

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
  lastProbeRequest: ProbeRequest | null;
  /** 设备、连线、配置任一变化 +1；位置、视口、名称不算 */
  topologyRevision: number;
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
  setLinkCurve: (id: string, curve?: Link["curve"]) => void;
  setPortSide: (deviceId: string, portId: string, side?: Port["displaySide"]) => void;

  select: (selection: Selection, field?: string | null, portId?: string | null) => void;
  setProbe: (result: ProbeResult | null) => void;
  /** 跑一次验证并记下参数，「重新验证」用同一份参数重跑 */
  runProbe: (request: ProbeRequest) => ProbeResult | null;

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
    const changed = structuralKey(previous) !== structuralKey(next);
    set({
      topology: next,
      ...derive(next),
      saveState: "saving",
      ...(changed ? { topologyRevision: get().topologyRevision + 1 } : {}),
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
    lastProbeRequest: null,
    topologyRevision: 0,
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
          ...(options?.keepProbe ? {} : { lastProbeRequest: null }),
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
      // CP3 起结果不再随删除设备一起丢：拓扑版本变了，结果面板出「拓扑已改动」横幅，
      // 列表仍可读（设备名走 trace 里的快照）
      commit(next, {
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
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

    setLinkCurve: (id, curve) => {
      const topology = get().topology;
      const link = topology.links.find((item) => item.id === id);
      if (!link || JSON.stringify(link.curve) === JSON.stringify(curve)) return;
      commit({
        ...topology,
        links: topology.links.map((item) => {
          if (item.id !== id) return item;
          const { curve: _old, ...rest } = item;
          return curve ? { ...rest, curve } : rest;
        }),
      });
    },

    setPortSide: (deviceId, portId, side) => {
      const device = get().topology.devices.find((item) => item.id === deviceId);
      const port = device?.ports.find((item) => item.id === portId);
      if (!port || port.displaySide === side) return;
      get().updateDevice(deviceId, (item) => ({
        ...item,
        ports: item.ports.map((p) => {
          if (p.id !== portId) return p;
          const { displaySide: _old, ...rest } = p;
          return side ? { ...rest, displaySide: side } : rest;
        }),
      }));
    },

    select: (selection, field = null, portId = null) =>
      set({ selection, highlightField: field, highlightPortId: portId }),
    setProbe: (result) => set({ lastProbe: result, ...(result ? {} : { lastProbeRequest: null }) }),

    runProbe: (request) => {
      const topology = get().topology;
      if (!topology.devices.some((d) => d.id === request.sourceDeviceId)) return null;
      const source = request.sourceDeviceId;
      let result: ProbeResult;
      if (request.kind === "visitSite" || request.kind === "dnsQuery") {
        if (!request.domain) return null;
        result =
          request.kind === "dnsQuery"
            ? dnsQuery(topology, {
                sourceDeviceId: source,
                domain: request.domain,
                server: request.server,
                proxy: request.proxy,
              })
            : visitSite(topology, {
                sourceDeviceId: source,
                domain: request.domain,
                port: request.port,
                proxy: request.proxy,
              });
      } else {
        const targetIp = (request.targetIp ?? "").trim();
        if (!targetIp) return null;
        result =
          request.kind === "traceroute"
            ? traceroute(topology, { sourceDeviceId: source, targetIp })
            : ping(topology, { sourceDeviceId: source, targetIp });
      }
      set({ lastProbe: result, lastProbeRequest: request });
      return result;
    },

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
        topologyRevision:
          get().topologyRevision + (structuralKey(restored) !== structuralKey(topology) ? 1 : 0),
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
        ...(structuralKey(restored) !== structuralKey(topology)
          ? { lastProbe: null, lastProbeRequest: null }
          : {}),
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
        topologyRevision:
          get().topologyRevision + (structuralKey(restored) !== structuralKey(topology) ? 1 : 0),
        selection: { kind: "none" },
        highlightField: null,
        highlightPortId: null,
        ...(structuralKey(restored) !== structuralKey(topology)
          ? { lastProbe: null, lastProbeRequest: null }
          : {}),
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

// 调试用：开发模式下把 store 挂到 window，方便在浏览器里查状态（vitest 跑在 node 里，没有 window）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__store = useTopologyStore;
}
