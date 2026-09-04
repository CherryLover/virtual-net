import { create } from "zustand";
import type {
  Device,
  DeviceType,
  LintIssue,
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
  ensureInternetSparePort,
  lint,
} from "../engine";

export type Selection =
  | { kind: "device"; id: string }
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
  lastProbe: ProbeResult | null;
  saveState: SaveState;
  loaded: boolean;

  replaceTopology: (topology: Topology, options?: { keepProbe?: boolean }) => void;
  setLoaded: () => void;
  setSaveState: (state: SaveState) => void;
  rename: (name: string) => void;
  setViewport: (viewport: Viewport) => void;

  addDevice: (type: DeviceType, position: Position) => void;
  moveDevice: (id: string, position: Position) => void;
  updateDevice: (id: string, updater: (device: Device) => Device) => void;
  removeDevice: (id: string) => void;

  connect: (
    a: { deviceId: string; portId: string },
    b: { deviceId: string; portId: string },
  ) => void;
  removeLink: (id: string) => void;

  select: (selection: Selection, field?: string | null) => void;
  setProbe: (result: ProbeResult | null) => void;
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
  return ensureInternetSparePort(topology);
}

export const useTopologyStore = create<TopologyState>((set, get) => {
  const initial = emptyTopology();
  const commit = (topology: Topology, extra: Partial<TopologyState> = {}) => {
    const next = normalize(topology);
    set({ topology: next, ...derive(next), saveState: "saving", ...extra });
  };

  return {
    topology: initial,
    ...derive(initial),
    selection: { kind: "none" },
    highlightField: null,
    lastProbe: null,
    saveState: "saved",
    loaded: false,

    replaceTopology: (topology, options) => {
      const next = normalize(topology);
      set({
        topology: next,
        ...derive(next),
        selection: { kind: "none" },
        highlightField: null,
        lastProbe: options?.keepProbe ? get().lastProbe : null,
        saveState: "saving",
      });
    },
    setLoaded: () => set({ loaded: true }),
    setSaveState: (state) => set({ saveState: state }),
    rename: (name) => commit({ ...get().topology, name }),
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

    updateDevice: (id, updater) => {
      const topology = get().topology;
      commit({
        ...topology,
        devices: topology.devices.map((d) => (d.id === id ? updater(d) : d)) as Device[],
      });
    },

    removeDevice: (id) => {
      const topology = get().topology;
      const doomed = topology.links.filter((l) => l.a.deviceId === id || l.b.deviceId === id);
      let next: Topology = {
        ...topology,
        devices: topology.devices.filter((d) => d.id !== id),
        links: topology.links.filter((l) => !doomed.some((x) => x.id === l.id)),
      };
      for (const link of doomed) {
        next = withLinkId(next, link.a.portId, null);
        next = withLinkId(next, link.b.portId, null);
      }
      // 结果里提到被删设备就作废，免得逐跳列表留下没有名字的设备
      const probe = get().lastProbe;
      const stale = probe?.decisions.some((d) => d.deviceId === id) || probe?.path.includes(id);
      commit(next, {
        selection: { kind: "none" },
        highlightField: null,
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
      const link = topology.links.find((l) => l.id === id);
      if (!link) return;
      let next: Topology = { ...topology, links: topology.links.filter((l) => l.id !== id) };
      next = withLinkId(next, link.a.portId, null);
      next = withLinkId(next, link.b.portId, null);
      commit(next, { selection: { kind: "none" }, highlightField: null });
    },

    select: (selection, field = null) => set({ selection, highlightField: field }),
    setProbe: (result) => set({ lastProbe: result }),
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
