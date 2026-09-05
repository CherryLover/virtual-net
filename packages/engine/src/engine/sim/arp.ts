/** ARP：在出接口所在网段（已按 VLAN 过滤）里找持有某个 IP 的接口，命中后写 ARP 表 */

import type { L2Drop, L2Loop, L2Path } from "../runtime/segment";
import type { L3Interface, Runtime } from "../runtime/types";

export interface ArpHit {
  kind: "hit";
  /** 从本设备哪个端口发出 */
  portId: string;
  mac: string;
  /** 持有该 IP 的接口所在设备 */
  peerDeviceId: string;
  peerIface: L3Interface;
  /** 网段里有多台设备用同一个地址 */
  conflict: boolean;
  /** 到对端的二层路径 */
  path: L2Path;
}

/** VLAN 把目标隔开了：忽略 VLAN 能找到，按第一处丢弃点解释 */
export interface ArpVlanBlocked {
  kind: "vlan";
  drop: L2Drop;
  /** 忽略 VLAN 时找到的持有者；只知道帧被丢在哪时为 null */
  targetIface: L3Interface | null;
  /** 目标所在 VLAN */
  targetVlan: number | null;
  /** 本机发出的帧所在 VLAN */
  ownVlan: number | null;
}

export interface ArpLoop {
  kind: "loop";
  loop: L2Loop;
}

export type ArpOutcome =
  | ArpHit
  | ArpVlanBlocked
  | ArpLoop
  | { kind: "unlinked"; portId: string }
  | { kind: "miss" };

/**
 * 在 `ifaceName` 的各个端口后面找 `targetIp` 的持有者。
 * 走图、选出口、判断 VLAN 全部经过 `segmentOf`。
 */
export function resolveArp(
  runtime: Runtime,
  deviceId: string,
  ifaceName: string,
  targetIp: string,
): ArpOutcome {
  const iface = runtime.ifaceOf(deviceId, ifaceName);
  if (!iface) return { kind: "miss" };
  const ports = runtime.topology.devices.flatMap((d) => d.ports);
  const linked = iface.portIds.filter((portId) => ports.find((p) => p.id === portId)?.linkId);
  if (linked.length === 0) {
    return { kind: "unlinked", portId: iface.portIds[0] ?? "" };
  }

  const reach = runtime.reachFrom(iface);
  if (reach.loop) return { kind: "loop", loop: reach.loop };

  const holders = reach.targets.filter((t) => t.iface.ip && t.iface.ip === targetIp);
  const first = holders[0];
  if (first) {
    const table = runtime.arp[deviceId];
    if (table) table[targetIp] = first.iface.mac;
    return {
      kind: "hit",
      portId: first.path.egressPortId,
      mac: first.iface.mac,
      peerDeviceId: first.iface.deviceId,
      peerIface: first.iface,
      conflict: holders.length > 1,
      path: first.path,
    };
  }

  // 网段里没找到，忽略 VLAN 再走一次，看是不是被 VLAN 隔开了
  const loose = runtime.reachFrom(iface, { ignoreVlan: true });
  const target = loose.targets.find((t) => t.iface.ip && t.iface.ip === targetIp);
  const drop = target?.path.drops[0];
  if (target && drop) {
    return {
      kind: "vlan",
      drop,
      targetIface: target.iface,
      targetVlan: target.path.vlan,
      ownVlan: iface.vlan ?? loose.vlanSeen,
    };
  }
  // 网段里连目标都不存在，但这个 VLAN 的帧确实在某处被丢掉了：先报 VLAN 问题
  const blocked = reach.drops.find(
    (d) => d.cause === "trunk-not-allowed" || d.cause === "tagged-drop",
  );
  if (blocked) {
    return {
      kind: "vlan",
      drop: blocked,
      targetIface: null,
      targetVlan: null,
      ownVlan: iface.vlan ?? reach.vlanSeen,
    };
  }
  return { kind: "miss" };
}
