/** 路由表构建与最长前缀匹配 */

import { formatIp, inSubnet, networkInt, parseIp, parseMask } from "../../model/address";
import type { Topology } from "../../model/topology";
import { isHost, isL3Router } from "../../model/topology";
import { lanInterfacesOf } from "./interfaces";
import type { L3Interface, Lease, Route } from "./types";

function directRoute(iface: L3Interface): Route | null {
  const ipInt = parseIp(iface.ip);
  const prefix = parseMask(iface.mask);
  if (ipInt === null || prefix === null) return null;
  return {
    dest: formatIp(networkInt(ipInt, prefix)),
    mask: iface.mask,
    prefix,
    via: null,
    iface: iface.name,
    kind: "direct",
  };
}

function sortRoutes(routes: Route[]): Route[] {
  // 稳定排序，前缀长的在前，方便逐条看
  return routes
    .map((route, i) => ({ route, i }))
    .sort((a, b) => b.route.prefix - a.route.prefix || a.i - b.i)
    .map((x) => x.route);
}

export function buildRoutes(
  topology: Topology,
  interfaces: L3Interface[],
  leases: Lease[],
): Record<string, Route[]> {
  const table: Record<string, Route[]> = {};
  for (const device of topology.devices) {
    const own = interfaces.filter((i) => i.deviceId === device.id);
    const routes: Route[] = [];

    if (isHost(device)) {
      const eth0 = own.find((i) => i.name === "eth0");
      if (eth0) {
        const direct = directRoute(eth0);
        if (direct) routes.push(direct);
        const gateway =
          device.config.addressMode === "static"
            ? device.config.gateway
            : (leases.find((l) => l.deviceId === device.id && l.status === "ok")?.gateway ?? "");
        if (gateway && eth0.ip && eth0.mask) {
          routes.push({
            dest: "0.0.0.0",
            mask: "0.0.0.0",
            prefix: 0,
            via: gateway,
            iface: "eth0",
            kind: "default",
            viaOffSubnet: !inSubnet(gateway, eth0.ip, eth0.mask),
          });
        }
      }
    } else if (isL3Router(device)) {
      const lans = lanInterfacesOf(interfaces, device.id);
      for (const lan of lans) {
        const direct = directRoute(lan);
        if (direct) routes.push(direct);
      }
      const wan = own.find((i) => i.name === "wan");
      const wanLease = leases.find(
        (l) => l.deviceId === device.id && l.scope === "wan" && l.status === "ok",
      );
      if (wan?.ip) {
        // WAN 地址落在自己某个 LAN 网段里，路由器分不清往哪边发。
        // 只在上游是本地三层设备（光猫 / 另一台路由器）时判定：
        // 上游直接是互联网时按 CP1 的语义照常转发。
        const upstream = topology.devices.find((d) => d.id === wanLease?.serverDeviceId);
        const localUpstream = upstream?.type === "modem" || upstream?.type === "router";
        const overlap =
          localUpstream &&
          lans.some((lan) => lan.ip && lan.mask && inSubnet(wan.ip, lan.ip, lan.mask));
        const direct = directRoute(wan);
        if (direct) routes.push(overlap ? { ...direct, wanLanOverlap: true } : direct);
        if (wanLease?.gateway) {
          routes.push({
            dest: "0.0.0.0",
            mask: "0.0.0.0",
            prefix: 0,
            via: wanLease.gateway,
            iface: "wan",
            kind: "default",
            viaOffSubnet: !inSubnet(wanLease.gateway, wan.ip, wan.mask),
            ...(overlap ? { wanLanOverlap: true } : {}),
          });
        }
      }
    } else if (device.type === "internet") {
      for (const iface of own) {
        const direct = directRoute(iface);
        if (direct) routes.push(direct);
      }
      for (const target of device.config.targets) {
        if (parseIp(target.ip) === null) continue;
        routes.push({
          dest: target.ip,
          mask: "255.255.255.255",
          prefix: 32,
          via: null,
          iface: "self",
          kind: "self",
        });
      }
    }

    table[device.id] = sortRoutes(routes);
  }
  return table;
}

/** 最长前缀匹配；前缀相同的全部返回，调用方按 ARP 结果挑一条 */
export function lookupRoutes(routes: Route[], dstIp: string): Route[] {
  const dst = parseIp(dstIp);
  if (dst === null) return [];
  let best = -1;
  const hits: Route[] = [];
  for (const route of routes) {
    const dest = parseIp(route.dest);
    if (dest === null) continue;
    if (networkInt(dst, route.prefix) !== networkInt(dest, route.prefix)) continue;
    if (route.prefix > best) {
      best = route.prefix;
      hits.length = 0;
    }
    if (route.prefix === best) hits.push(route);
  }
  return hits;
}

export function lookupRoute(routes: Route[], dstIp: string): Route | null {
  return lookupRoutes(routes, dstIp)[0] ?? null;
}
