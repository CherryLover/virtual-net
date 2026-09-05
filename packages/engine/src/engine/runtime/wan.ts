/** WAN 地址获取（CP2 关键设计 2.2 第 2 步）：路由器与路由模式光猫向上游取地址 */

import { isPrivate } from "../../model/address";
import type { Device, Topology } from "../../model/topology";
import { isL3Router } from "../../model/topology";
import { BRIDGE_LAN } from "./interfaces";
import type { SegmentIndex } from "./segment";
import type { AddressClass, L3Interface, Lease, LeaseVia } from "./types";

export interface Upstream {
  device: Device;
  iface: L3Interface;
  kind: "internet" | "modem";
}

export interface WanEnv {
  topology: Topology;
  index: SegmentIndex;
  interfaces: L3Interface[];
  /** 从池里取一个还没被占用的地址 */
  take(
    segmentId: string,
    ifaces: L3Interface[],
    issuerId: string,
    pool: string[],
  ): string | undefined;
}

function classOf(ip: string): AddressClass {
  const scope = isPrivate(ip);
  if (scope === "carrier") return "cgnat";
  if (scope === "private") return "private";
  return "public";
}

function failed(deviceId: string, status: Lease["status"]): Lease {
  return {
    deviceId,
    ifaceName: "wan",
    scope: "wan",
    status,
    ip: "",
    mask: "",
    gateway: "",
    dns: "",
    serverDeviceId: null,
  };
}

/** WAN 口所在网段里的上游：互联网的 portN，或路由模式光猫的 br-lan */
export function findUpstream(env: WanEnv, wanIface: L3Interface): Upstream | null {
  const reach = env.index.reachFrom(wanIface);
  const order = new Map(env.topology.devices.map((d, i) => [d.id, i]));
  const found: Upstream[] = [];
  for (const target of reach.targets) {
    const device = env.topology.devices.find((d) => d.id === target.iface.deviceId);
    if (!device) continue;
    if (device.type === "internet") {
      found.push({ device, iface: target.iface, kind: "internet" });
    } else if (
      device.type === "modem" &&
      device.config.mode === "route" &&
      target.iface.name === BRIDGE_LAN
    ) {
      found.push({ device, iface: target.iface, kind: "modem" });
    }
  }
  found.sort((a, b) => (order.get(a.device.id) ?? 0) - (order.get(b.device.id) ?? 0));
  return found[0] ?? null;
}

/** 上游要求的接入方式 */
export function upstreamAccessMode(upstream: Upstream): "dhcp" | "pppoe" {
  if (upstream.kind === "internet" && upstream.device.type === "internet") {
    return upstream.device.config.access.mode ?? "dhcp";
  }
  return "dhcp";
}

/** 一台设备的 WAN 租约；不是三层路由设备返回 null */
export function wanLeaseOf(env: WanEnv, device: Device): Lease | null {
  if (!isL3Router(device)) return null;
  const wanPort = device.ports.find((p) => p.name === "wan");
  if (!wanPort) return null;
  const wanIface = env.interfaces.find((i) => i.deviceId === device.id && i.name === "wan");
  if (!wanIface) return null;

  // 手动配置不看上游
  if (device.type === "router" && device.config.wan.mode === "static") {
    const value = device.config.wan.static;
    return {
      deviceId: device.id,
      ifaceName: "wan",
      scope: "wan",
      status: "ok",
      ip: value?.ip ?? "",
      mask: value?.mask ?? "",
      gateway: value?.gateway ?? "",
      dns: value?.dns ?? "",
      serverDeviceId: null,
      via: "static",
      addressClass: classOf(value?.ip ?? ""),
    };
  }

  if (!wanPort.linkId) return failed(device.id, "no-link");
  const upstream = findUpstream(env, wanIface);
  if (!upstream) return failed(device.id, "no-server");

  const raw = device.config.wan.mode;
  const wanted: "auto" | "dhcp" | "pppoe" = raw === "static" ? "dhcp" : raw;
  const offered = upstreamAccessMode(upstream);
  const effective: LeaseVia = wanted === "auto" ? offered : wanted;
  if (effective !== offered) {
    return failed(device.id, effective === "dhcp" ? "pppoe-required" : "pppoe-rejected");
  }

  const segment = env.index.segmentOfIface(wanIface);
  const ifaces = segment ? env.index.interfacesInSegment(segment) : [];
  const segmentId = segment?.id ?? `iface_${wanIface.key}`;

  if (upstream.kind === "internet" && upstream.device.type === "internet") {
    const access = upstream.device.config.access;
    const ip = env.take(segmentId, ifaces, upstream.device.id, [access.poolStart, access.poolEnd]);
    if (ip === undefined) return failed(device.id, "pool-exhausted");
    return {
      deviceId: device.id,
      ifaceName: "wan",
      scope: "wan",
      status: "ok",
      ip,
      mask: access.mask,
      gateway: access.ip,
      dns: access.dns,
      serverDeviceId: upstream.device.id,
      serverIface: upstream.iface.name,
      via: effective,
      addressClass: classOf(ip),
    };
  }

  if (upstream.device.type !== "modem") return failed(device.id, "no-server");
  const modem = upstream.device.config;
  if (!modem.dhcp.enabled) return failed(device.id, "no-server");
  const ip = env.take(segmentId, ifaces, upstream.device.id, [
    modem.dhcp.rangeStart,
    modem.dhcp.rangeEnd,
  ]);
  if (ip === undefined) return failed(device.id, "pool-exhausted");
  return {
    deviceId: device.id,
    ifaceName: "wan",
    scope: "wan",
    status: "ok",
    ip,
    mask: modem.lan.mask,
    gateway: modem.lan.ip,
    dns: modem.lan.ip,
    serverDeviceId: upstream.device.id,
    serverIface: BRIDGE_LAN,
    via: "dhcp",
    addressClass: classOf(ip),
  };
}

/** 上游的说法，PPPOE_REJECTED 文案用 */
export function upstreamLabel(upstream: Upstream | null): string {
  if (!upstream) return "上游";
  return upstream.kind === "modem" ? `${upstream.device.name}（路由模式）` : upstream.device.name;
}
