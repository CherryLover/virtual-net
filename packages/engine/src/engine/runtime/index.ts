/** buildRuntime：从拓扑推导网段、租约、接口表、路由表；运行时状态不落盘 */

import type { Topology } from "../../model/topology";
import { allocateLeases } from "./dhcp";
import { listInterfaces, staticAddressOf } from "./interfaces";
import { buildRoutes } from "./routes";
import { buildSegmentIndex } from "./segment";
import type { Lease, Runtime } from "./types";

export * from "./dhcp";
export * from "./interfaces";
export * from "./routes";
export * from "./segment";
export * from "./types";
export * from "./wan";

export function buildRuntime(topology: Topology): Runtime {
  // 1 接口骨架 + 网段发现
  const interfaces = listInterfaces(topology);
  const index = buildSegmentIndex(topology, interfaces);

  // 2 / 3 WAN 与 LAN 自动获取
  const { leases, conflicts } = allocateLeases(topology, index, interfaces);

  // 4 接口表：静态配置与租约合并
  for (const iface of interfaces) {
    const device = topology.devices.find((d) => d.id === iface.deviceId);
    if (!device) continue;
    const stat = staticAddressOf(device, iface);
    if (stat) {
      iface.ip = stat.ip;
      iface.mask = stat.mask;
      continue;
    }
    const lease = leases.find(
      (l) => l.deviceId === iface.deviceId && l.ifaceName === iface.name && l.status === "ok",
    );
    if (lease) {
      iface.ip = lease.ip;
      iface.mask = lease.mask;
    }
  }

  // 5 路由表
  const routes = buildRoutes(topology, interfaces, leases);

  // 6 / 7 NAT 会话表与 ARP 表，初始为空
  const arp: Record<string, Record<string, string>> = {};
  const nat: Runtime["nat"] = {};
  const mac: Runtime["mac"] = {};
  for (const device of topology.devices) {
    arp[device.id] = {};
    nat[device.id] = [];
    mac[device.id] = {};
  }

  return {
    topology,
    interfaces,
    segments: index.segments,
    leases,
    routes,
    arp,
    nat,
    mac,
    wanLeases: leases.filter((l) => l.scope === "wan"),
    dhcpConflicts: conflicts,
    index,
    ifaceOfPort: index.ifaceOfPort,
    ifaceOf: (deviceId, name) =>
      interfaces.find((i) => i.deviceId === deviceId && i.name === name) ?? null,
    segmentOf: index.segmentOf,
    segmentOfIface: index.segmentOfIface,
    interfacesInSegment: index.interfacesInSegment,
    reachFromPort: index.reachFromPort,
    reachFrom: index.reachFrom,
    ifaceForFrame: index.ifaceForFrame,
    leaseOf: (deviceId, ifaceName): Lease | null =>
      leases.find((l) => l.deviceId === deviceId && l.ifaceName === ifaceName) ?? null,
  };
}
