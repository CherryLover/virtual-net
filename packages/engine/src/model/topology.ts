/** 拓扑数据模型：设备、端口、连线（CP1 定稿，后续检查点只允许扩展） */

import type { TopologyAppearance } from "./appearance";
import type { PortVlan } from "./vlan";

/** 当前支持的拓扑格式版本 */
export const TOPOLOGY_VERSION = 1;

export type DeviceType =
  | "pc"
  | "router"
  | "internet"
  | "switch"
  | "ap"
  | "modem"
  | "access-control"
  | "server"
  | "proxy";

export interface AccessRule {
  id: string;
  name: string;
  enabled: boolean;
  action: "allow" | "deny";
  direction: "any" | "in" | "out" | "forward";
  protocol: "any" | "icmp" | "tcp" | "udp";
  source: string;
  destination: string;
  domain: string;
  port: number | null;
}

export interface AccessPolicy {
  enabled: boolean;
  defaultAction: "allow" | "deny";
  stateful: boolean;
  rules: AccessRule[];
}

export interface DnsRecord {
  domain: string;
  ip: string;
}

export interface DnsService {
  enabled: boolean;
  records: DnsRecord[];
  upstream: string;
}

export interface ServerConfig extends PcConfig {
  services: {
    id: string;
    name: string;
    port: number;
    enabled: boolean;
    protocol?: "tcp" | "udp";
  }[];
  dnsService: DnsService;
}

export type ProxyProtocol = "http" | "connect" | "socks5";
export interface ApplicationProxy {
  deviceId: string;
  protocol: ProxyProtocol;
  dnsMode: "client" | "proxy";
  username?: string;
  password?: string;
}
export interface TrafficRule {
  id: string;
  name: string;
  enabled: boolean;
  match: "domain" | "ip";
  target: string;
  port: number | null;
  proxy: ApplicationProxy | null;
}
export interface TrafficRouting {
  enabled: boolean;
  rules: TrafficRule[];
}
export interface ProxyConfig extends PcConfig {
  proxy: {
    enabled: boolean;
    protocol: ProxyProtocol;
    port: number;
    auth: "none" | "password";
    username: string;
    password: string;
    /** 缺省关闭；仅 SOCKS5 使用，TCP 控制端口与 UDP 中继端口独立。 */
    udp?: { enabled: boolean; port: number };
  };
}

export interface AccessControlConfig {
  dnsRewrite: { enabled: boolean; records: DnsRecord[] };
}

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
  /** 仅影响画布显示，不参与网络模拟。 */
  displaySide?: "top" | "bottom" | "left" | "right";
  id: string;
  name: string;
  mac: string;
  linkId: string | null;
  /** CP2 定义（access / trunk、PVID、放行列表）；只允许出现在交换机 portN 与路由器 lanN */
  vlan?: PortVlan;
}

export interface PcConfig {
  trafficRouting?: TrafficRouting;
  addressMode: "static" | "dhcp";
  ip: string;
  mask: string;
  gateway: string;
  dns: string;
}

/** DHCP 池配置，路由器 LAN、路由器 VLAN 子接口、路由模式光猫共用 */
export interface DhcpConfig {
  enabled: boolean;
  rangeStart: string;
  rangeEnd: string;
  leaseHours: number;
}

export interface PppoeConfig {
  username: string;
  password: string;
}

export interface StaticWanConfig {
  ip: string;
  mask: string;
  gateway: string;
  dns: string;
}

export type RouterWanMode = "dhcp" | "pppoe" | "static";

export interface RouterWanConfig {
  mode: RouterWanMode;
  pppoe?: PppoeConfig;
  static?: StaticWanConfig;
}

/** 路由器的 VLAN 子接口 `br-lan.<id>` */
export interface RouterVlan {
  id: number;
  ip: string;
  mask: string;
  dhcp: DhcpConfig;
}

export interface RouterConfig {
  lan: { ip: string; mask: string };
  dhcp: DhcpConfig;
  wan: RouterWanConfig;
  nat: boolean;
  /** 额外的 VLAN 子接口；CP1 文件里没有这个字段 */
  vlans?: RouterVlan[];
}

export interface SwitchConfig {
  /** 端口数，4–48，必须等于 ports.length */
  portCount: number;
}

export interface ApConfig {
  /** 只是标签，不参与模拟 */
  ssid: string;
}

export type ModemWanMode = "auto" | "dhcp" | "pppoe";

export interface ModemConfig {
  mode: "bridge" | "route";
  wan: { mode: ModemWanMode; pppoe?: PppoeConfig };
  lan: { ip: string; mask: string };
  dhcp: DhcpConfig;
}

export interface InternetTarget {
  id: string;
  domain: string;
  ip: string;
  region: "cn" | "overseas";
  dnsServer: boolean;
  reachable: boolean;
}

export type InternetAccessMode = "dhcp" | "pppoe";

export interface InternetAccess {
  ip: string;
  mask: string;
  poolStart: string;
  poolEnd: string;
  dns: string;
  /** 上游接入方式，缺省 dhcp；CP1 文件里没有这个字段 */
  mode?: InternetAccessMode;
}

export interface InternetConfig {
  access: InternetAccess;
  targets: InternetTarget[];
}

interface DeviceBase {
  id: string;
  name: string;
  position: Position;
  ports: Port[];
  accessPolicy?: AccessPolicy;
  zone?: string;
}

export interface ServerDevice extends DeviceBase {
  type: "server";
  config: ServerConfig;
}
export interface ProxyDevice extends DeviceBase {
  type: "proxy";
  config: ProxyConfig;
}
export interface AccessControlDevice extends DeviceBase {
  type: "access-control";
  config: AccessControlConfig;
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

export interface SwitchDevice extends DeviceBase {
  type: "switch";
  config: SwitchConfig;
}

export interface ApDevice extends DeviceBase {
  type: "ap";
  config: ApConfig;
}

export interface ModemDevice extends DeviceBase {
  type: "modem";
  config: ModemConfig;
}

export type Device =
  | ServerDevice
  | ProxyDevice
  | AccessControlDevice
  | PcDevice
  | RouterDevice
  | InternetDevice
  | SwitchDevice
  | ApDevice
  | ModemDevice;

export function isHost(device: Device): device is PcDevice | ServerDevice | ProxyDevice {
  return device.type === "pc" || device.type === "server" || device.type === "proxy";
}

/** 三层设备（有地址、有路由表、会做 NAT）：路由器与路由模式的光猫 */
export function isL3Router(device: Device): device is RouterDevice | ModemDevice {
  if (device.type === "router") return true;
  return device.type === "modem" && device.config.mode === "route";
}

/** 二层透明设备：交换机、AP、桥接模式光猫。路由器的 LAN 网桥另算 */
export function isTransparent(device: Device): boolean {
  if (device.type === "access-control") return true;
  if (device.type === "switch" || device.type === "ap") return true;
  return device.type === "modem" && device.config.mode === "bridge";
}

export interface LinkEnd {
  deviceId: string;
  portId: string;
}

export interface Link {
  /** 两个控制点分别相对 a、b 端点保存。缺省自动布线。 */
  curve?: { source: Position; target: Position };
  id: string;
  a: LinkEnd;
  b: LinkEnd;
}

export interface TopologyGroup {
  id: string;
  name: string;
  deviceIds: string[];
}

export interface Topology {
  groups?: TopologyGroup[];
  appearance?: TopologyAppearance;
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
