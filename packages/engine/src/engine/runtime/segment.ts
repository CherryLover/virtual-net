/**
 * 网段发现与二层走图（CP2 关键设计 2.1）。
 * 从一个「三层接口 + 它所属的 VLAN」出发沿连线走，遇到二层透明设备穿过去继续走，
 * 每过一个口按 access / trunk / plain 三类规则决定打标签、去标签还是丢弃。
 * 引擎里所有二层判断都必须经过这里。
 */

import type { Device, Port, Topology } from "../../model/topology";
import { isTransparent, peerEnd } from "../../model/topology";
import { portSupportsVlan, trunkAllows, untaggedVlanOf, vlanOf } from "../../model/vlan";
import type { L3Interface, Segment } from "./types";

export type L2DropCause = "access-pvid" | "trunk-not-allowed" | "tagged-drop";

export interface L2Drop {
  deviceId: string;
  portId: string;
  cause: L2DropCause;
}

export interface L2Loop {
  deviceId: string;
  linkIds: string[];
}

/** 二层路径上的一跳透明设备 */
export interface L2Step {
  deviceId: string;
  portIn: string;
  portOut: string;
  /** 帧在这台设备里所属的 VLAN */
  vlan: number | null;
  /** 进来那根线上的标签（没有标签是 null） */
  wireVlanIn: number | null;
  /** 出去那根线上的标签 */
  wireVlanOut: number | null;
  /** portOut 上的连线 */
  linkId: string | null;
}

/** 从起点接口到某个目标接口的完整二层路径 */
export interface L2Path {
  /** 起点设备从哪个口发出 */
  egressPortId: string;
  egressLinkId: string | null;
  /** 起点这根线上的标签 */
  egressWireVlan: number | null;
  steps: L2Step[];
  arriveDeviceId: string;
  arrivePortId: string;
  /** 到达对端那根线上的标签 */
  arriveWireVlan: number | null;
  /** 到达时帧所属的 VLAN */
  vlan: number | null;
  /** 这条路径上记到的丢弃点（ignoreVlan 时才可能非空） */
  drops: L2Drop[];
}

export interface L2Target {
  key: string;
  iface: L3Interface;
  path: L2Path;
}

export interface L2Reach {
  /** 能到达的三层接口（不含起点自己） */
  targets: L2Target[];
  /** 走图中记到的全部丢弃点，按发现顺序 */
  drops: L2Drop[];
  dropAt: L2Drop | null;
  loop: L2Loop | null;
  /** 帧离开起点后第一次被归入的 VLAN */
  vlanSeen: number | null;
}

export interface L2Start {
  portId: string;
  vlan: number | null;
}

export interface L2Options {
  /** 只记丢弃点、不真的丢弃，用于解释失败原因 */
  ignoreVlan?: boolean;
}

interface Branch {
  egressPortId: string;
  egressLinkId: string | null;
  egressWireVlan: number | null;
  steps: L2Step[];
  drops: L2Drop[];
}

/** 走图用的索引：端口 → 设备 / 端口对象 / 三层接口 */
export interface L2Graph {
  topology: Topology;
  interfaces: L3Interface[];
  deviceOfPort(portId: string): Device | null;
  portById(portId: string): Port | null;
  /** 从一组挂接点出发能到哪 */
  reach(starts: L2Start[], excludeKeys: Set<string>, opts?: L2Options): L2Reach;
  /** 三层接口的挂接点：每个端口配上该接口所属的 VLAN */
  anchorsOf(iface: L3Interface): L2Start[];
  reachFromInterface(iface: L3Interface, opts?: L2Options): L2Reach;
}

/** 这台设备在这个口上做二层转发时，网桥里有哪些口；不做二层转发返回 null */
export function bridgePortsOf(device: Device, portId: string): Port[] | null {
  if (isTransparent(device)) return device.ports;
  if (device.type === "router") {
    const port = device.ports.find((p) => p.id === portId);
    if (!port?.name.startsWith("lan")) return null;
    return device.ports.filter((p) => p.name.startsWith("lan"));
  }
  return null;
}

export function buildL2Graph(topology: Topology, interfaces: L3Interface[]): L2Graph {
  const deviceByPort = new Map<string, Device>();
  const portMap = new Map<string, Port>();
  const ifacesByPort = new Map<string, L3Interface[]>();
  for (const device of topology.devices) {
    for (const port of device.ports) {
      deviceByPort.set(port.id, device);
      portMap.set(port.id, port);
    }
  }
  for (const iface of interfaces) {
    for (const portId of iface.portIds) {
      const list = ifacesByPort.get(portId) ?? [];
      list.push(iface);
      ifacesByPort.set(portId, list);
    }
  }

  function reach(starts: L2Start[], excludeKeys: Set<string>, opts: L2Options = {}): L2Reach {
    const ignoreVlan = opts.ignoreVlan === true;
    const targets: L2Target[] = [];
    const found = new Set<string>();
    const drops: L2Drop[] = [];
    /** 透明设备（含路由器 LAN 网桥）在某个 VLAN 内是从哪根线被到达的 */
    const visited = new Map<string, string>();
    let loop: L2Loop | null = null;
    let vlanSeen: number | null = null;

    const note = (drop: L2Drop, branch: Branch): void => {
      drops.push(drop);
      branch.drops.push(drop);
    };

    /** 从 device 的 portOut 把帧发出去 */
    function emit(
      device: Device,
      portOut: Port,
      vlanIn: number | null,
      tagged: boolean,
      branch: Branch,
      step: { portIn: string; wireVlanIn: number | null } | null,
    ): void {
      if (loop) return;
      let taggedOut = tagged;
      let vlan = vlanIn;
      if (portSupportsVlan(device.type, portOut.name)) {
        const config = vlanOf(portOut);
        if (vlan === null) {
          taggedOut = false;
        } else if (config.mode === "access") {
          if (config.pvid === vlan) taggedOut = false;
          else {
            note({ deviceId: device.id, portId: portOut.id, cause: "access-pvid" }, branch);
            if (!ignoreVlan) return;
            // 忽略 VLAN 时按「帧不带标签发出去，对端按自己的 PVID 归类」继续走
            vlan = config.pvid;
            taggedOut = false;
          }
        } else if (config.native === vlan) {
          taggedOut = false;
        } else if (trunkAllows(config, vlan)) {
          taggedOut = true;
        } else {
          note({ deviceId: device.id, portId: portOut.id, cause: "trunk-not-allowed" }, branch);
          if (!ignoreVlan) return;
          taggedOut = true;
        }
      } else if (!isTransparent(device)) {
        // 三层设备的 plain 口只发不带标签的帧
        taggedOut = false;
      }

      const wireVlanOut = taggedOut ? vlan : null;
      const next: Branch = step
        ? {
            ...branch,
            steps: [
              ...branch.steps,
              {
                deviceId: device.id,
                portIn: step.portIn,
                portOut: portOut.id,
                vlan,
                wireVlanIn: step.wireVlanIn,
                wireVlanOut,
                linkId: portOut.linkId,
              },
            ],
          }
        : {
            ...branch,
            egressPortId: portOut.id,
            egressLinkId: portOut.linkId,
            egressWireVlan: wireVlanOut,
          };

      const peer = peerEnd(topology, portOut.id);
      if (!peer) return;
      const peerDevice = deviceByPort.get(peer.portId);
      const peerPort = portMap.get(peer.portId);
      if (!peerDevice || !peerPort) return;
      arrive(peerDevice, peerPort, vlan, taggedOut, wireVlanOut, next, portOut.linkId);
    }

    /** 帧到达 device 的 portIn */
    function arrive(
      device: Device,
      portIn: Port,
      vlanIn: number | null,
      tagged: boolean,
      wireVlanIn: number | null,
      branch: Branch,
      linkId: string | null,
    ): void {
      if (loop) return;
      let vlan = vlanIn;
      let carried = tagged;
      if (portSupportsVlan(device.type, portIn.name)) {
        const config = vlanOf(portIn);
        if (!tagged) {
          vlan = untaggedVlanOf(config);
        } else if (config.mode === "access") {
          note({ deviceId: device.id, portId: portIn.id, cause: "tagged-drop" }, branch);
          if (!ignoreVlan) return;
          vlan = config.pvid;
        } else if (trunkAllows(config, vlanIn ?? config.native)) {
          vlan = vlanIn;
        } else {
          note({ deviceId: device.id, portId: portIn.id, cause: "trunk-not-allowed" }, branch);
          if (!ignoreVlan) return;
        }
        carried = false;
        if (vlanSeen === null && vlan !== null) vlanSeen = vlan;
      } else if (isTransparent(device)) {
        // 透明设备的 plain 口不看标签：帧属于「线上标签」那个 VLAN，没标签就是无 VLAN
        vlan = tagged ? vlanIn : null;
      } else {
        if (tagged) {
          note({ deviceId: device.id, portId: portIn.id, cause: "tagged-drop" }, branch);
          if (!ignoreVlan) return;
        }
        carried = false;
      }

      // 三层接口收下
      for (const iface of ifacesByPort.get(portIn.id) ?? []) {
        if (iface.vlan !== null && iface.vlan !== vlan) continue;
        if (excludeKeys.has(iface.key) || found.has(iface.key)) continue;
        found.add(iface.key);
        targets.push({
          key: iface.key,
          iface,
          path: {
            egressPortId: branch.egressPortId,
            egressLinkId: branch.egressLinkId,
            egressWireVlan: branch.egressWireVlan,
            steps: branch.steps,
            arriveDeviceId: device.id,
            arrivePortId: portIn.id,
            arriveWireVlan: wireVlanIn,
            vlan,
            drops: branch.drops,
          },
        });
      }

      // 网桥内继续泛洪
      const bridge = bridgePortsOf(device, portIn.id);
      if (!bridge) return;
      const key = `${device.id}|${vlan ?? "-"}`;
      const seen = visited.get(key);
      if (seen !== undefined) {
        if (linkId && seen !== linkId) {
          // 优先报「这条路径上真正成环的两根线」：本分支里上一次经过这台设备时是从哪根线走的
          const onPath = branch.steps.find((st) => st.deviceId === device.id && st.vlan === vlan);
          const first = onPath?.linkId ?? seen;
          if (first !== linkId) loop = { deviceId: device.id, linkIds: [first, linkId] };
        }
        return;
      }
      visited.set(key, linkId ?? "");
      for (const out of bridge) {
        if (out.id === portIn.id || !out.linkId) continue;
        emit(device, out, vlan, carried, branch, { portIn: portIn.id, wireVlanIn });
        if (loop) return;
      }
    }

    for (const start of starts) {
      if (loop) break;
      const port = portMap.get(start.portId);
      const device = port ? deviceByPort.get(start.portId) : null;
      if (!port || !device || !port.linkId) continue;
      emit(
        device,
        port,
        start.vlan,
        false,
        {
          egressPortId: port.id,
          egressLinkId: port.linkId,
          egressWireVlan: null,
          steps: [],
          drops: [],
        },
        null,
      );
    }

    return { targets, drops, dropAt: drops[0] ?? null, loop, vlanSeen };
  }

  const anchorsOf = (iface: L3Interface): L2Start[] =>
    iface.portIds.map((portId) => ({ portId, vlan: iface.vlan }));

  return {
    topology,
    interfaces,
    deviceOfPort: (portId) => deviceByPort.get(portId) ?? null,
    portById: (portId) => portMap.get(portId) ?? null,
    reach,
    anchorsOf,
    reachFromInterface: (iface, opts) => reach(anchorsOf(iface), new Set([iface.key]), opts),
  };
}

export interface SegmentIndex {
  graph: L2Graph;
  segments: Segment[];
  ifaceOfPort(portId: string): L3Interface | null;
  /** 端口上带某个 VLAN 标签的帧属于哪个三层接口 */
  ifaceForFrame(portId: string, wireVlan: number | null): L3Interface | null;
  segmentOf(portId: string): Segment | null;
  segmentOfIface(iface: L3Interface): Segment | null;
  interfacesInSegment(segment: Segment): L3Interface[];
  reachFromPort(portId: string): L3Interface[];
  reachFrom(iface: L3Interface, opts?: L2Options): L2Reach;
}

export function buildSegmentIndex(topology: Topology, interfaces: L3Interface[]): SegmentIndex {
  const graph = buildL2Graph(topology, interfaces);
  const byKey = new Map<string, L3Interface>();
  const byPort = new Map<string, L3Interface[]>();
  for (const iface of interfaces) {
    byKey.set(iface.key, iface);
    for (const portId of iface.portIds) {
      const list = byPort.get(portId) ?? [];
      list.push(iface);
      byPort.set(portId, list);
    }
  }

  /** 端口的「主」接口：VLAN 与该口不打标签时归属的 VLAN 一致的那个 */
  function primaryIface(portId: string): L3Interface | null {
    const list = byPort.get(portId);
    if (!list || list.length === 0) return null;
    const device = graph.deviceOfPort(portId);
    const port = graph.portById(portId);
    if (device && port && portSupportsVlan(device.type, port.name)) {
      const untagged = untaggedVlanOf(vlanOf(port));
      const hit = list.find((i) => i.vlan === untagged);
      if (hit) return hit;
    }
    return list[0] ?? null;
  }

  const cache = new Map<string, L2Reach>();
  const reachFrom = (iface: L3Interface, opts?: L2Options): L2Reach => {
    if (opts?.ignoreVlan) return graph.reachFromInterface(iface, opts);
    const hit = cache.get(iface.key);
    if (hit) return hit;
    const value = graph.reachFromInterface(iface);
    cache.set(iface.key, value);
    return value;
  };

  const segments: Segment[] = [];
  const segmentByIface = new Map<string, Segment>();
  for (const iface of interfaces) {
    if (segmentByIface.has(iface.key)) continue;
    const keys = [iface.key, ...reachFrom(iface).targets.map((t) => t.key)].filter(
      (key) => !segmentByIface.has(key),
    );
    const segment: Segment = { id: `seg_${segments.length + 1}`, ifaceKeys: keys };
    segments.push(segment);
    for (const key of keys) segmentByIface.set(key, segment);
  }

  return {
    graph,
    segments,
    ifaceOfPort: (portId) => primaryIface(portId),
    ifaceForFrame: (portId, wireVlan) => {
      const list = byPort.get(portId);
      if (!list || list.length === 0) return null;
      const device = graph.deviceOfPort(portId);
      const port = graph.portById(portId);
      if (device && port && portSupportsVlan(device.type, port.name)) {
        const config = vlanOf(port);
        const vlan = wireVlan ?? untaggedVlanOf(config);
        return list.find((i) => i.vlan === vlan) ?? null;
      }
      return list[0] ?? null;
    },
    segmentOf: (portId) => {
      const iface = primaryIface(portId);
      if (!iface) return null;
      return segmentByIface.get(iface.key) ?? null;
    },
    segmentOfIface: (iface) => segmentByIface.get(iface.key) ?? null,
    interfacesInSegment: (segment) =>
      segment.ifaceKeys.map((k) => byKey.get(k)).filter((i): i is L3Interface => i !== undefined),
    reachFromPort: (portId) => {
      const own = primaryIface(portId);
      if (!own) return [];
      const port = graph.portById(portId);
      if (!port) return [];
      const reach = graph.reach([{ portId, vlan: own.vlan }], new Set([own.key]));
      return reach.targets.map((t) => t.iface);
    },
    reachFrom,
  };
}
