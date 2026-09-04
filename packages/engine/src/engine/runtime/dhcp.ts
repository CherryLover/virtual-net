/** DHCP 分配：路由器 WAN 侧向互联网取地址、电脑 LAN 侧向路由器取地址 */

import { ipRange } from "../../model/address";
import type { Device, Topology } from "../../model/topology";
import { BRIDGE_LAN, staticAddressOf } from "./interfaces";
import type { SegmentIndex } from "./segment";
import type { L3Interface, Lease } from "./types";

function failed(
  deviceId: string,
  ifaceName: string,
  scope: "lan" | "wan",
  status: Lease["status"],
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
  };
}

/** 已被静态配置占用的地址（含互联网接入地址、路由器 LAN 地址） */
function staticIpsIn(topology: Topology, ifaces: L3Interface[]): Set<string> {
  const out = new Set<string>();
  for (const iface of ifaces) {
    const device = topology.devices.find((d) => d.id === iface.deviceId);
    if (!device) continue;
    const addr = staticAddressOf(device, iface);
    if (addr?.ip) out.add(addr.ip);
  }
  return out;
}

/** WAN 与 LAN 两轮分配，按 devices 顺序，结果确定 */
export function allocateLeases(topology: Topology, index: SegmentIndex): Lease[] {
  const leases: Lease[] = [];
  const takenBySegment = new Map<string, Set<string>>();
  /** 同一台互联网设备的地址池跨端口共享，不重复发同一个地址 */
  const takenByInternet = new Map<string, Set<string>>();

  const usedIn = (segmentId: string, ifaces: L3Interface[]): Set<string> => {
    let set = takenBySegment.get(segmentId);
    if (!set) {
      set = staticIpsIn(topology, ifaces);
      takenBySegment.set(segmentId, set);
    }
    return set;
  };

  // 1 WAN 自动获取
  for (const device of topology.devices) {
    if (device.type !== "router") continue;
    if (device.config.wan.mode !== "dhcp") continue;
    const wanPort = device.ports.find((p) => p.name === "wan");
    if (!wanPort) continue;
    if (!wanPort.linkId) {
      leases.push(failed(device.id, "wan", "wan", "no-link"));
      continue;
    }
    const segment = index.segmentOf(wanPort.id);
    if (!segment) {
      leases.push(failed(device.id, "wan", "wan", "no-server"));
      continue;
    }
    const ifaces = index.interfacesInSegment(segment);
    const upstream = findUpstreamInternet(topology, ifaces);
    if (!upstream) {
      leases.push(failed(device.id, "wan", "wan", "no-server"));
      continue;
    }
    const access = upstream.config.access;
    const used = usedIn(segment.id, ifaces);
    let issued = takenByInternet.get(upstream.id);
    if (!issued) {
      issued = new Set<string>();
      takenByInternet.set(upstream.id, issued);
    }
    const pool = ipRange(access.poolStart, access.poolEnd);
    const ip = pool.find((candidate) => !used.has(candidate) && !issued.has(candidate));
    if (ip === undefined) {
      leases.push(failed(device.id, "wan", "wan", "pool-exhausted"));
      continue;
    }
    used.add(ip);
    issued.add(ip);
    leases.push({
      deviceId: device.id,
      ifaceName: "wan",
      scope: "wan",
      status: "ok",
      ip,
      mask: access.mask,
      gateway: access.ip,
      dns: access.dns,
      serverDeviceId: upstream.id,
    });
  }

  // 2 LAN 自动获取
  for (const device of topology.devices) {
    if (device.type !== "pc") continue;
    if (device.config.addressMode !== "dhcp") continue;
    const eth0 = device.ports[0];
    if (!eth0) continue;
    if (!eth0.linkId) {
      leases.push(failed(device.id, "eth0", "lan", "no-link"));
      continue;
    }
    const segment = index.segmentOf(eth0.id);
    if (!segment) {
      leases.push(failed(device.id, "eth0", "lan", "no-server"));
      continue;
    }
    const ifaces = index.interfacesInSegment(segment);
    const server = findDhcpRouter(topology, ifaces);
    if (!server) {
      leases.push(failed(device.id, "eth0", "lan", "no-server"));
      continue;
    }
    const used = usedIn(segment.id, ifaces);
    const pool = ipRange(server.config.dhcp.rangeStart, server.config.dhcp.rangeEnd);
    const ip = pool.find((candidate) => !used.has(candidate));
    if (ip === undefined) {
      leases.push(failed(device.id, "eth0", "lan", "pool-exhausted"));
      continue;
    }
    used.add(ip);
    leases.push({
      deviceId: device.id,
      ifaceName: "eth0",
      scope: "lan",
      status: "ok",
      ip,
      mask: server.config.lan.mask,
      gateway: server.config.lan.ip,
      dns: server.config.lan.ip,
      serverDeviceId: server.id,
    });
  }

  return leases;
}

function findUpstreamInternet(
  topology: Topology,
  ifaces: L3Interface[],
): (Device & { type: "internet" }) | null {
  for (const iface of ifaces) {
    const device = topology.devices.find((d) => d.id === iface.deviceId);
    if (device?.type === "internet") return device;
  }
  return null;
}

function findDhcpRouter(
  topology: Topology,
  ifaces: L3Interface[],
): (Device & { type: "router" }) | null {
  // 同网段多台开着 DHCP 的路由器时取先出现的
  for (const device of topology.devices) {
    if (device.type !== "router") continue;
    if (!device.config.dhcp.enabled) continue;
    const inSegment = ifaces.some((i) => i.deviceId === device.id && i.name === BRIDGE_LAN);
    if (inSegment) return device;
  }
  return null;
}
