/** 静态检查的共享上下文：拓扑 + 运行时 + 几个常用查询 */

import { BRIDGE_LAN, subInterfaceName } from "../engine/runtime/interfaces";
import type { L3Interface, Runtime, Segment } from "../engine/runtime/types";
import { inSubnet, parseIp, parseMask, subnetLabel } from "../model/address";
import type { LintIssue } from "../model/lint";
import type {
  ApDevice,
  Device,
  DhcpConfig,
  ModemDevice,
  PcDevice,
  Port,
  ProxyDevice,
  RouterDevice,
  ServerDevice,
  SwitchDevice,
  Topology,
} from "../model/topology";
import { isHost, isL3Router, isTransparent } from "../model/topology";
import { portSupportsVlan, untaggedVlanOf, vlanMembership, vlanOf } from "../model/vlan";

export interface Addressed {
  iface: L3Interface;
  device: Device;
  ip: string;
  mask: string;
  prefix: number;
}

/** 一个 DHCP 池：路由器 LAN、路由器 VLAN 子接口、路由模式光猫 */
export interface PoolRef {
  device: Device;
  /** 子接口名，如 br-lan / br-lan.10 */
  ifaceName: string;
  vlanId: number | null;
  dhcp: DhcpConfig;
  /** 该子接口的地址与掩码 */
  ip: string;
  mask: string;
  /** LintTarget 里用的字段名 */
  field: string;
}

export interface LintContext {
  topology: Topology;
  runtime: Runtime;
  devices: Device[];
  pcs: (PcDevice | ServerDevice | ProxyDevice)[];
  routers: RouterDevice[];
  switches: SwitchDevice[];
  aps: ApDevice[];
  modems: ModemDevice[];
  /** 路由器 + 路由模式光猫 */
  l3Routers: (RouterDevice | ModemDevice)[];
  /** 所有 DHCP 池 */
  pools: PoolRef[];
  portOf(portId: string): { device: Device; port: Port } | null;
  portLabel(portId: string): string;
  /** 每个网段里地址合法的接口 */
  addressedIn(segment: Segment): Addressed[];
  deviceOf(deviceId: string): Device;
  name(deviceId: string): string;
  subnet(ip: string, mask: string): string;
}

export type LintRule = (ctx: LintContext) => LintIssue[];

export function listPools(topology: Topology): PoolRef[] {
  const out: PoolRef[] = [];
  for (const device of topology.devices) {
    if (!isL3Router(device)) continue;
    out.push({
      device,
      ifaceName: BRIDGE_LAN,
      vlanId: device.type === "router" ? 1 : null,
      dhcp: device.config.dhcp,
      ip: device.config.lan.ip,
      mask: device.config.lan.mask,
      field: "dhcp",
    });
    if (device.type !== "router") continue;
    for (const vlan of device.config.vlans ?? []) {
      out.push({
        device,
        ifaceName: subInterfaceName(vlan.id),
        vlanId: vlan.id,
        dhcp: vlan.dhcp,
        ip: vlan.ip,
        mask: vlan.mask,
        field: `vlans.${vlan.id}.dhcp`,
      });
    }
  }
  return out;
}

/**
 * 从一台设备出发，穿过透明设备与路由器 LAN 网桥能摸到的所有设备（不过 `excludeLinkId` 那根线）。
 * L015 判断「VLAN 在这一侧有没有成员」用。
 */
export function sideOf(topology: Topology, startDeviceId: string, excludeLinkId: string): Device[] {
  const byId = new Map(topology.devices.map((d) => [d.id, d]));
  const seen = new Set<string>([startDeviceId]);
  const queue = [startDeviceId];
  const out: Device[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    const device = id ? byId.get(id) : undefined;
    if (!device) continue;
    out.push(device);
    // 只从透明设备与路由器（LAN 网桥）继续往外扩
    const canRelay = isTransparent(device) || device.type === "router";
    if (!canRelay && device.id !== startDeviceId) continue;
    for (const port of device.ports) {
      if (!port.linkId || port.linkId === excludeLinkId) continue;
      if (device.type === "router" && !port.name.startsWith("lan")) continue;
      const link = topology.links.find((l) => l.id === port.linkId);
      if (!link) continue;
      const peer = link.a.portId === port.id ? link.b : link.a;
      if (seen.has(peer.deviceId)) continue;
      seen.add(peer.deviceId);
      queue.push(peer.deviceId);
    }
  }
  return out;
}

/** 这一侧有成员的 VLAN：有连线的 access 口的 PVID，以及路由器的子接口 VLAN */
export function vlanMembersOf(devices: Device[], excludeLinkId: string): Set<number> {
  const out = new Set<number>();
  for (const device of devices) {
    for (const port of device.ports) {
      if (!portSupportsVlan(device.type, port.name)) continue;
      if (!port.linkId || port.linkId === excludeLinkId) continue;
      const config = vlanOf(port);
      if (config.mode === "access") out.add(config.pvid);
    }
    if (device.type !== "router") continue;
    for (const vlan of device.config.vlans ?? []) out.add(vlan.id);
    if (device.config.lan.ip) out.add(1);
  }
  return out;
}

export function makeContext(topology: Topology, runtime: Runtime): LintContext {
  const deviceOf = (deviceId: string): Device => {
    const found = topology.devices.find((d) => d.id === deviceId);
    if (!found) throw new Error(`拓扑里没有设备 ${deviceId}`);
    return found;
  };
  const portOf = (portId: string): { device: Device; port: Port } | null => {
    for (const device of topology.devices) {
      const port = device.ports.find((p) => p.id === portId);
      if (port) return { device, port };
    }
    return null;
  };
  return {
    topology,
    runtime,
    devices: topology.devices,
    pcs: topology.devices.filter(isHost),
    routers: topology.devices.filter((d): d is RouterDevice => d.type === "router"),
    switches: topology.devices.filter((d): d is SwitchDevice => d.type === "switch"),
    aps: topology.devices.filter((d): d is ApDevice => d.type === "ap"),
    modems: topology.devices.filter((d): d is ModemDevice => d.type === "modem"),
    l3Routers: topology.devices.filter((d): d is RouterDevice | ModemDevice => isL3Router(d)),
    pools: listPools(topology),
    portOf,
    portLabel: (portId) => {
      const found = portOf(portId);
      return found ? `${found.device.name} ${found.port.name}` : portId;
    },
    deviceOf,
    name: (deviceId) => deviceOf(deviceId).name,
    subnet: (ip, mask) => subnetLabel(ip, mask),
    addressedIn: (segment) => {
      const out: Addressed[] = [];
      for (const iface of runtime.interfacesInSegment(segment)) {
        const prefix = parseMask(iface.mask);
        if (!iface.ip || parseIp(iface.ip) === null || prefix === null) continue;
        out.push({
          iface,
          device: deviceOf(iface.deviceId),
          ip: iface.ip,
          mask: iface.mask,
          prefix,
        });
      }
      return out;
    },
  };
}

/** 端口不打标签时归入哪个 VLAN */
export function untaggedVlanOfPort(device: Device, port: Port): number | null {
  if (!portSupportsVlan(device.type, port.name)) return null;
  return untaggedVlanOf(vlanOf(port));
}

/** 端口上有成员的 VLAN 列表 */
export function membershipOfPort(device: Device, port: Port): number[] {
  if (!portSupportsVlan(device.type, port.name)) return [];
  return vlanMembership(vlanOf(port));
}

/** a 的地址是否落在 b 的网段里 */
export function inPeerSubnet(a: Addressed, b: Addressed): boolean {
  return inSubnet(a.ip, b.ip, b.mask);
}

export function issue(
  ruleId: string,
  severity: LintIssue["severity"],
  message: string,
  targets: LintIssue["targets"],
  linkId?: string,
): LintIssue {
  return linkId
    ? { ruleId, severity, message, targets, linkId }
    : { ruleId, severity, message, targets };
}
