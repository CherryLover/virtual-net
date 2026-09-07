/** DHCP 分配：WAN 侧向上游取地址、电脑 LAN 侧向所在网段里的子接口取地址 */

import { ipRange, subnetLabel } from "../../model/address";
import type { Device, DhcpConfig, Topology } from "../../model/topology";
import { isHost, isL3Router } from "../../model/topology";
import { BRIDGE_LAN, staticAddressOf, subInterfaceName } from "./interfaces";
import type { SegmentIndex } from "./segment";
import type { DhcpConflict, L3Interface, Lease } from "./types";
import { wanLeaseOf } from "./wan";

function failed(
  deviceId: string,
  ifaceName: string,
  scope: "lan" | "wan",
  status: Lease["status"],
  vlan: number | null = null,
): Lease {
  return {
    deviceId,
    ifaceName,
    scope,
    status,
    ip: "",
    mask: "",
    gateway: "",
    dns: "",
    serverDeviceId: null,
    vlan,
  };
}

/** 一个可用的 DHCP 服务：某台三层设备的某个 LAN 子接口 */
export interface DhcpService {
  device: Device;
  iface: L3Interface;
  dhcp: DhcpConfig;
  mask: string;
}

/** 一台设备上所有 LAN 子接口的 DHCP 配置（不管开没开） */
export function dhcpServicesOf(device: Device, interfaces: L3Interface[]): DhcpService[] {
  if (!isL3Router(device)) return [];
  const own = interfaces.filter((i) => i.deviceId === device.id);
  const out: DhcpService[] = [];
  const lan = own.find((i) => i.name === BRIDGE_LAN);
  if (lan) {
    const mask = device.type === "router" ? device.config.lan.mask : device.config.lan.mask;
    out.push({ device, iface: lan, dhcp: device.config.dhcp, mask });
  }
  if (device.type === "router") {
    for (const vlan of device.config.vlans ?? []) {
      const iface = own.find((i) => i.name === subInterfaceName(vlan.id));
      if (iface) out.push({ device, iface, dhcp: vlan.dhcp, mask: vlan.mask });
    }
  }
  return out;
}

/** 地址占用登记：网段内已用地址 + 每个发地址的设备已发出去的地址 */
class Allocator {
  private readonly bySegment = new Map<string, Set<string>>();
  private readonly byIssuer = new Map<string, Set<string>>();

  constructor(private readonly topology: Topology) {}

  private usedIn(segmentId: string, ifaces: L3Interface[]): Set<string> {
    let set = this.bySegment.get(segmentId);
    if (!set) {
      set = new Set<string>();
      for (const iface of ifaces) {
        const device = this.topology.devices.find((d) => d.id === iface.deviceId);
        if (!device) continue;
        const addr = staticAddressOf(device, iface);
        if (addr?.ip) set.add(addr.ip);
      }
      this.bySegment.set(segmentId, set);
    }
    return set;
  }

  take(
    segmentId: string,
    ifaces: L3Interface[],
    issuerId: string,
    range: string[],
  ): string | undefined {
    const used = this.usedIn(segmentId, ifaces);
    let issued = this.byIssuer.get(issuerId);
    if (!issued) {
      issued = new Set<string>();
      this.byIssuer.set(issuerId, issued);
    }
    const [start, end] = range;
    const pool = ipRange(start ?? "", end ?? "");
    const ip = pool.find((candidate) => !used.has(candidate) && !issued.has(candidate));
    if (ip === undefined) return undefined;
    used.add(ip);
    issued.add(ip);
    return ip;
  }
}

export interface AllocationResult {
  leases: Lease[];
  conflicts: DhcpConflict[];
}

/** WAN 与 LAN 两轮分配，按 devices 顺序，结果确定 */
export function allocateLeases(
  topology: Topology,
  index: SegmentIndex,
  interfaces: L3Interface[],
): AllocationResult {
  const leases: Lease[] = [];
  const allocator = new Allocator(topology);
  const env = {
    topology,
    index,
    interfaces,
    take: (segmentId: string, ifaces: L3Interface[], issuerId: string, range: string[]) =>
      allocator.take(segmentId, ifaces, issuerId, range),
  };

  // 1 WAN 侧：路由器与路由模式光猫
  for (const device of topology.devices) {
    const lease = wanLeaseOf(env, device);
    if (lease) leases.push(lease);
  }

  // 2 LAN 侧：电脑自动获取
  const order = new Map(topology.devices.map((d, i) => [d.id, i]));
  for (const device of topology.devices) {
    if (!isHost(device)) continue;
    if (device.config.addressMode !== "dhcp") continue;
    const eth0 = device.ports[0];
    if (!eth0) continue;
    if (!eth0.linkId) {
      leases.push(failed(device.id, "eth0", "lan", "no-link"));
      continue;
    }
    const iface = interfaces.find((i) => i.deviceId === device.id && i.name === "eth0");
    if (!iface) continue;
    const reach = index.reachFrom(iface);
    const vlan = reach.vlanSeen;
    const services: DhcpService[] = [];
    for (const target of reach.targets) {
      const owner = topology.devices.find((d) => d.id === target.iface.deviceId);
      if (!owner) continue;
      const hit = dhcpServicesOf(owner, interfaces).find(
        (s) => s.iface.key === target.iface.key && s.dhcp.enabled,
      );
      if (hit) services.push(hit);
    }
    services.sort((a, b) => (order.get(a.device.id) ?? 0) - (order.get(b.device.id) ?? 0));
    const server = services[0];
    if (!server) {
      leases.push(failed(device.id, "eth0", "lan", "no-server", vlan));
      continue;
    }
    const segment = index.segmentOfIface(iface);
    const ifaces = segment ? index.interfacesInSegment(segment) : [];
    const ip = allocator.take(segment?.id ?? `iface_${iface.key}`, ifaces, server.iface.key, [
      server.dhcp.rangeStart,
      server.dhcp.rangeEnd,
    ]);
    if (ip === undefined) {
      leases.push(failed(device.id, "eth0", "lan", "pool-exhausted", vlan));
      continue;
    }
    const gateway = staticAddressOf(server.device, server.iface)?.ip ?? "";
    leases.push({
      deviceId: device.id,
      ifaceName: "eth0",
      scope: "lan",
      status: "ok",
      ip,
      mask: server.mask,
      gateway,
      dns: gateway,
      serverDeviceId: server.device.id,
      serverIface: server.iface.name,
      vlan,
    });
  }

  return { leases, conflicts: findConflicts(topology, index, interfaces) };
}

/** 同一网段里两个及以上启用的 DHCP 服务 */
export function findConflicts(
  topology: Topology,
  index: SegmentIndex,
  interfaces: L3Interface[],
): DhcpConflict[] {
  const order = new Map(topology.devices.map((d, i) => [d.id, i]));
  const out: DhcpConflict[] = [];
  for (const segment of index.segments) {
    const inSegment = new Set(segment.ifaceKeys);
    const services: DhcpService[] = [];
    for (const device of topology.devices) {
      for (const service of dhcpServicesOf(device, interfaces)) {
        if (!service.dhcp.enabled) continue;
        if (!inSegment.has(service.iface.key)) continue;
        services.push(service);
      }
    }
    if (services.length < 2) continue;
    services.sort((a, b) => (order.get(a.device.id) ?? 0) - (order.get(b.device.id) ?? 0));
    const first = services[0];
    if (!first) continue;
    const addr = staticAddressOf(first.device, first.iface);
    out.push({
      segmentId: segment.id,
      subnet: addr?.ip ? subnetLabel(addr.ip, first.mask) : "同一网段",
      vlan: first.iface.vlan,
      deviceIds: [...new Set(services.map((s) => s.device.id))],
      ifaceKeys: services.map((s) => s.iface.key),
    });
  }
  return out;
}
