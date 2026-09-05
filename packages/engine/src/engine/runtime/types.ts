/** 运行时结构：接口表、网段、租约、路由表、NAT 会话表、ARP 表 */

import type { Topology } from "../../model/topology";
import type { L2Options, L2Reach, SegmentIndex } from "./segment";

/** 三层接口：pc 的 eth0、router 的 br-lan / wan、internet 的每个 portN */
export interface L3Interface {
  /** `${deviceId}/${name}` */
  key: string;
  deviceId: string;
  /** `eth0` / `br-lan` / `wan` / `port1`… */
  name: string;
  /** 该接口占用的端口（br-lan 是 lan1–lan4） */
  portIds: string[];
  mac: string;
  /** 最终地址：静态配置或租约，未获取到为空串 */
  ip: string;
  mask: string;
  /** VLAN 子接口的 VLAN 号；br-lan 是 1，其余接口 null */
  vlan: number | null;
}

/** 一个二层网段：一组互相直达的三层接口 */
export interface Segment {
  id: string;
  ifaceKeys: string[];
}

export type LeaseStatus =
  | "ok"
  | "no-link"
  | "no-server"
  | "pool-exhausted"
  | "pppoe-required"
  | "pppoe-rejected";

/** WAN 地址的来源方式 */
export type LeaseVia = "dhcp" | "pppoe" | "static";

export type AddressClass = "public" | "private" | "cgnat";

export interface Lease {
  deviceId: string;
  /** `eth0`（电脑 LAN 侧）或 `wan`（路由器 / 光猫 WAN 侧） */
  ifaceName: string;
  scope: "lan" | "wan";
  status: LeaseStatus;
  ip: string;
  mask: string;
  gateway: string;
  dns: string;
  serverDeviceId: string | null;
  /** 发地址的那个子接口名，如 `br-lan.10` */
  serverIface?: string;
  /** WAN 侧才有：怎么拿到的地址 */
  via?: LeaseVia;
  /** WAN 侧才有：地址属于公网 / 私网 / 运营商内网 */
  addressClass?: AddressClass;
  /** 客户端所在 VLAN（失败文案里带上） */
  vlan?: number | null;
}

/** 同一网段里有多个启用的 DHCP 服务 */
export interface DhcpConflict {
  segmentId: string;
  subnet: string;
  vlan: number | null;
  deviceIds: string[];
  ifaceKeys: string[];
}

/** 透明设备的 MAC 表：VLAN → MAC → 端口 */
export type MacTable = Record<string, Record<string, string>>;

export type RouteKind = "direct" | "default" | "host" | "self";

export interface Route {
  dest: string;
  mask: string;
  prefix: number;
  via: string | null;
  /** 出接口名，`self` 表示本机处理 */
  iface: string;
  kind: RouteKind;
  /** 默认路由的网关不在直连网段 */
  viaOffSubnet?: boolean;
  /** WAN 地址落在自己某个 LAN 网段内 */
  wanLanOverlap?: boolean;
}

export interface NatSession {
  proto: "icmp" | "udp" | "tcp";
  inner: { ip: string; port: number };
  outer: { ip: string; port: number };
  peer: { ip: string; port: number };
}

export interface Runtime {
  topology: Topology;
  interfaces: L3Interface[];
  segments: Segment[];
  leases: Lease[];
  /** deviceId → 路由表（已按前缀降序排好） */
  routes: Record<string, Route[]>;
  /** deviceId → ARP 表（ip → mac），buildRuntime 后为空，验证过程中填充 */
  arp: Record<string, Record<string, string>>;
  /** deviceId → NAT 会话表，buildRuntime 后为空 */
  nat: Record<string, NatSession[]>;
  /** deviceId → MAC 表，buildRuntime 后为空 */
  mac: Record<string, MacTable>;
  /** WAN 侧租约（路由器与路由模式光猫） */
  wanLeases: Lease[];
  /** 同一网段内的多个 DHCP 服务 */
  dhcpConflicts: DhcpConflict[];
  /** 二层走图索引 */
  index: SegmentIndex;

  /** 端口所属的三层接口 */
  ifaceOfPort(portId: string): L3Interface | null;
  ifaceOf(deviceId: string, name: string): L3Interface | null;
  /** 端口所在网段 */
  segmentOf(portId: string): Segment | null;
  /** 三层接口所在网段 */
  segmentOfIface(iface: L3Interface): Segment | null;
  /** 网段里的三层接口 */
  interfacesInSegment(segment: Segment): L3Interface[];
  /** 从这个端口出去能到达的三层接口（不含本接口） */
  reachFromPort(portId: string): L3Interface[];
  /** 从一个三层接口出发的二层走图结果（含路径、丢弃点、环路） */
  reachFrom(iface: L3Interface, opts?: L2Options): L2Reach;
  /** 端口上带某个标签的帧属于哪个三层接口 */
  ifaceForFrame(portId: string, wireVlan: number | null): L3Interface | null;
  leaseOf(deviceId: string, ifaceName: string): Lease | null;
}
