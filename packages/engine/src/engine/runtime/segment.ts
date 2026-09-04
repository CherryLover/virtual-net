/**
 * 网段发现：从一个端口出发沿连线走，遇到二层透明设备穿过去继续走，
 * 收集到的所有三层接口构成一个网段。
 * 引擎里所有二层判断都必须经过这里（CP2 在此加 VLAN 过滤）。
 */

import type { Topology } from "../../model/topology";
import { peerEnd } from "../../model/topology";
import type { L3Interface, Segment } from "./types";

export interface SegmentIndex {
  segments: Segment[];
  ifaceOfPort(portId: string): L3Interface | null;
  segmentOf(portId: string): Segment | null;
  interfacesInSegment(segment: Segment): L3Interface[];
  reachFromPort(portId: string): L3Interface[];
}

export function buildSegmentIndex(topology: Topology, interfaces: L3Interface[]): SegmentIndex {
  const byKey = new Map<string, L3Interface>();
  const byPort = new Map<string, L3Interface>();
  for (const iface of interfaces) {
    byKey.set(iface.key, iface);
    for (const portId of iface.portIds) byPort.set(portId, iface);
  }

  /** 从一组起始接口出发扩散，返回按发现顺序排列的接口 key */
  function spread(seedKeys: string[], visited: Set<string>): string[] {
    const found: string[] = [];
    const queue: string[] = [];
    for (const key of seedKeys) {
      if (visited.has(key)) continue;
      visited.add(key);
      found.push(key);
      queue.push(key);
    }
    while (queue.length > 0) {
      const key = queue.shift();
      if (key === undefined) break;
      const iface = byKey.get(key);
      if (!iface) continue;
      for (const portId of iface.portIds) {
        const peer = peerEnd(topology, portId);
        if (!peer) continue;
        const peerIface = byPort.get(peer.portId);
        if (!peerIface || visited.has(peerIface.key)) continue;
        visited.add(peerIface.key);
        found.push(peerIface.key);
        queue.push(peerIface.key);
      }
    }
    return found;
  }

  const segments: Segment[] = [];
  const segmentOfIface = new Map<string, Segment>();
  const assigned = new Set<string>();
  for (const iface of interfaces) {
    if (assigned.has(iface.key)) continue;
    const keys = spread([iface.key], assigned);
    const segment: Segment = { id: `seg_${segments.length + 1}`, ifaceKeys: keys };
    segments.push(segment);
    for (const key of keys) segmentOfIface.set(key, segment);
  }

  return {
    segments,
    ifaceOfPort: (portId) => byPort.get(portId) ?? null,
    segmentOf: (portId) => {
      const iface = byPort.get(portId);
      if (!iface) return null;
      return segmentOfIface.get(iface.key) ?? null;
    },
    interfacesInSegment: (segment) =>
      segment.ifaceKeys.map((k) => byKey.get(k)).filter((i): i is L3Interface => i !== undefined),
    reachFromPort: (portId) => {
      const own = byPort.get(portId);
      if (!own) return [];
      const peer = peerEnd(topology, portId);
      if (!peer) return [];
      const peerIface = byPort.get(peer.portId);
      if (!peerIface) return [];
      // 本接口自身不算「从这个口出去能到的」
      const visited = new Set<string>([own.key]);
      const keys = spread([peerIface.key], visited);
      return keys.map((k) => byKey.get(k)).filter((i): i is L3Interface => i !== undefined);
    },
  };
}
