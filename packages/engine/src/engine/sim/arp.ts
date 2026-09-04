/** ARP：在出接口所在网段里找持有某个 IP 的接口，命中后写 ARP 表 */

import type { Runtime } from "../runtime/types";

export interface ArpHit {
  kind: "hit";
  /** 从本设备哪个端口发出 */
  portId: string;
  mac: string;
  /** 持有该 IP 的接口所在设备 */
  peerDeviceId: string;
  /** 网段里有多台设备用同一个地址 */
  conflict: boolean;
}

export type ArpOutcome = ArpHit | { kind: "unlinked"; portId: string } | { kind: "miss" };

/**
 * 在 `ifaceName` 的各个端口后面找 `targetIp` 的持有者。
 * 网桥接口按 lan1…lan4 顺序试，先找到的口就是出口。
 */
export function resolveArp(
  runtime: Runtime,
  deviceId: string,
  ifaceName: string,
  targetIp: string,
): ArpOutcome {
  const iface = runtime.ifaceOf(deviceId, ifaceName);
  if (!iface) return { kind: "miss" };
  const linked = iface.portIds.filter((portId) => {
    const found = runtime.topology.devices
      .flatMap((d) => d.ports)
      .find((p) => p.id === portId)?.linkId;
    return Boolean(found);
  });
  if (linked.length === 0) {
    return { kind: "unlinked", portId: iface.portIds[0] ?? "" };
  }

  const holders: { portId: string; mac: string; deviceId: string }[] = [];
  for (const portId of linked) {
    for (const candidate of runtime.reachFromPort(portId)) {
      if (candidate.ip && candidate.ip === targetIp) {
        holders.push({ portId, mac: candidate.mac, deviceId: candidate.deviceId });
      }
    }
  }
  const first = holders[0];
  if (!first) return { kind: "miss" };

  const table = runtime.arp[deviceId];
  if (table) table[targetIp] = first.mac;
  return {
    kind: "hit",
    portId: first.portId,
    mac: first.mac,
    peerDeviceId: first.deviceId,
    conflict: holders.length > 1,
  };
}
