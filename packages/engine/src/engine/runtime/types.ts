/** 运行时结构：接口表、网段、租约、路由表、NAT 会话表、ARP 表 */

import type { Topology } from "../../model/topology";

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
}

/** 一个二层网段：一组互相直达的三层接口 */
export interface Segment {
  id: string;
  ifaceKeys: string[];
}

export type LeaseStatus = "ok" | "no-link" | "no-server" | "pool-exhausted";

export interface Lease {
  deviceId: string;
  /** `eth0`（电脑 LAN 侧）或 `wan`（路由器 WAN 侧） */
  ifaceName: string;
  scope: "lan" | "wan";
  status: LeaseStatus;
  ip: string;
  mask: string;
  gateway: string;
  dns: string;
  serverDeviceId: string | null;
}

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

  /** 端口所属的三层接口 */
  ifaceOfPort(portId: string): L3Interface | null;
  ifaceOf(deviceId: string, name: string): L3Interface | null;
  /** 端口所在网段 */
  segmentOf(portId: string): Segment | null;
  /** 网段里的三层接口 */
  interfacesInSegment(segment: Segment): L3Interface[];
  /** 从这个端口出去能到达的三层接口（不含本接口） */
  reachFromPort(portId: string): L3Interface[];
  leaseOf(deviceId: string, ifaceName: string): Lease | null;
}
