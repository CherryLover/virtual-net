/** 拓扑数据模型：设备、端口、连线（CP1 定稿，后续检查点只允许扩展） */

/** 当前支持的拓扑格式版本 */
export const TOPOLOGY_VERSION = 1;

export type DeviceType = "pc" | "router" | "internet";

export interface Position {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Port {
  id: string;
  name: string;
  mac: string;
  linkId: string | null;
  /** CP2 定义（access / trunk、PVID、放行列表）；CP1 不写、引擎忽略 */
  vlan?: unknown;
}

export interface PcConfig {
  addressMode: "static" | "dhcp";
  ip: string;
  mask: string;
  gateway: string;
  dns: string;
}

export interface RouterConfig {
  lan: { ip: string; mask: string };
  dhcp: {
    enabled: boolean;
    rangeStart: string;
    rangeEnd: string;
    leaseHours: number;
  };
  wan: { mode: "dhcp" };
  nat: boolean;
}

export interface InternetTarget {
  id: string;
  domain: string;
  ip: string;
  region: "cn" | "overseas";
  dnsServer: boolean;
  reachable: boolean;
}

export interface InternetConfig {
  access: {
    ip: string;
    mask: string;
    poolStart: string;
    poolEnd: string;
    dns: string;
  };
  targets: InternetTarget[];
}

interface DeviceBase {
  id: string;
  name: string;
  position: Position;
  ports: Port[];
}

export interface PcDevice extends DeviceBase {
  type: "pc";
  config: PcConfig;
}

export interface RouterDevice extends DeviceBase {
  type: "router";
  config: RouterConfig;
}

export interface InternetDevice extends DeviceBase {
  type: "internet";
  config: InternetConfig;
}

export type Device = PcDevice | RouterDevice | InternetDevice;

export interface LinkEnd {
  deviceId: string;
  portId: string;
}

export interface Link {
  id: string;
  a: LinkEnd;
  b: LinkEnd;
}

export interface Topology {
  version: number;
  name: string;
  viewport: Viewport;
  devices: Device[];
  links: Link[];
}

/** 广播 MAC */
export const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";

export function findDevice(topology: Topology, deviceId: string): Device | null {
  return topology.devices.find((d) => d.id === deviceId) ?? null;
}

export function findPort(
  topology: Topology,
  portId: string,
): { device: Device; port: Port } | null {
  for (const device of topology.devices) {
    const port = device.ports.find((p) => p.id === portId);
    if (port) return { device, port };
  }
  return null;
}

export function findLink(topology: Topology, linkId: string): Link | null {
  return topology.links.find((l) => l.id === linkId) ?? null;
}

/** 连线另一端；端口没连线或连线残缺时返回 null */
export function peerEnd(topology: Topology, portId: string): LinkEnd | null {
  const found = findPort(topology, portId);
  if (!found?.port.linkId) return null;
  const link = findLink(topology, found.port.linkId);
  if (!link) return null;
  if (link.a.portId === portId) return link.b;
  if (link.b.portId === portId) return link.a;
  return null;
}

export function deviceName(topology: Topology, deviceId: string): string {
  return findDevice(topology, deviceId)?.name ?? deviceId;
}

export function portName(topology: Topology, portId: string): string {
  return findPort(topology, portId)?.port.name ?? portId;
}
