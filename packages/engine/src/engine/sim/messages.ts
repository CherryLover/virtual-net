/** 终止原因文案模板（CP1 关键设计 2.3）。改这里前先改文档 */

import type { ReasonCode } from "../../model/probe";

export interface StopInfo {
  reasonCode: ReasonCode;
  reason: string;
}

export const stopText = {
  noIp: (deviceName: string, why: string): StopInfo => ({
    reasonCode: "NO_IP",
    reason: `${deviceName} 没有 IP 地址：${why}`,
  }),
  portUnlinked: (deviceName: string, portName: string): StopInfo => ({
    reasonCode: "PORT_UNLINKED",
    reason: `${deviceName} 的 ${portName} 没有连线`,
  }),
  noGateway: (targetIp: string, subnet: string): StopInfo => ({
    reasonCode: "NO_GATEWAY",
    reason: `${targetIp} 不在本机网段 ${subnet}，且没有配置网关`,
  }),
  gatewayOffSubnet: (gateway: string, subnet: string): StopInfo => ({
    reasonCode: "GATEWAY_OFF_SUBNET",
    reason: `网关 ${gateway} 不在本机网段 ${subnet}，无法把包交给网关`,
  }),
  arpMiss: (ip: string, role: "网关" | "目标"): StopInfo => ({
    reasonCode: "ARP_MISS",
    reason: `网段里没有设备使用 ${ip}（${role}），ARP 无应答`,
  }),
  noRoute: (routerName: string, targetIp: string): StopInfo => ({
    reasonCode: "NO_ROUTE",
    reason: `${routerName} 没有到 ${targetIp} 的路由：WAN 口未获取到地址，没有默认路由`,
  }),
  noReturnRoute: (srcIp: string, routerName: string | null): StopInfo => ({
    reasonCode: "NO_RETURN_ROUTE",
    reason:
      `回程失败：源地址 ${srcIp} 是私网地址，互联网无法把应答送回。` +
      (routerName ? `${routerName} 的 NAT 已关闭` : "路径上没有做地址转换的路由器"),
  }),
  unknownDest: (ip: string): StopInfo => ({
    reasonCode: "UNKNOWN_DEST",
    reason: `互联网上没有 ${ip} 这个地址`,
  }),
  natNoSession: (routerName: string, wanIp: string): StopInfo => ({
    reasonCode: "NAT_NO_SESSION",
    reason: `${routerName} 收到发给 ${wanIp} 的包，但没有对应的 NAT 会话`,
  }),
  notForMe: (pcName: string): StopInfo => ({
    reasonCode: "NOT_FOR_ME",
    reason: `${pcName} 收到不属于自己的包，不转发`,
  }),
  l2Reject: (mac: string): StopInfo => ({
    reasonCode: "L2_REJECT",
    reason: `目的 MAC ${mac} 不是本设备，丢弃`,
  }),
  ttlExceeded: (hops: number): StopInfo => ({
    reasonCode: "TTL_EXCEEDED",
    reason: `超过 ${hops} 跳仍未到达，可能存在环路`,
  }),
  noDns: (pcName: string, domain: string): StopInfo => ({
    reasonCode: "NO_DNS",
    reason: `${pcName} 没有配置 DNS 服务器，无法解析 ${domain}`,
  }),
  dnsNotServer: (ip: string): StopInfo => ({
    reasonCode: "DNS_NOT_SERVER",
    reason: `${ip} 不提供 DNS 服务`,
  }),
  dnsNxdomain: (domain: string): StopInfo => ({
    reasonCode: "DNS_NXDOMAIN",
    reason: `域名 ${domain} 不存在（不在目标库里）`,
  }),
  dnsNoUpstream: (routerName: string): StopInfo => ({
    reasonCode: "DNS_NO_UPSTREAM",
    reason: `${routerName} 没有上游 DNS：WAN 口未获取到地址`,
  }),
  targetUnreachable: (domain: string): StopInfo => ({
    reasonCode: "TARGET_UNREACHABLE",
    reason: `目标 ${domain} 当前不可达`,
  }),
  vlanIsolated: (
    targetIp: string,
    targetName: string,
    targetVlan: number | null,
    ownVlan: number | null,
  ): StopInfo => ({
    reasonCode: "VLAN_ISOLATED",
    reason:
      `${targetIp}（${targetName}）在 VLAN ${targetVlan ?? "?"}，` +
      `本机发出的包在 VLAN ${ownVlan ?? "?"}，二层隔离，需要路由器转发`,
  }),
  trunkNotAllowed: (deviceName: string, portName: string, vlan: number | null): StopInfo => ({
    reasonCode: "TRUNK_NOT_ALLOWED",
    reason: `${deviceName} 的 ${portName} 是 trunk 但未放行 VLAN ${vlan ?? "?"}，帧被丢弃`,
  }),
  vlanTagDropped: (vlan: number | null, deviceName: string, portName: string): StopInfo => ({
    reasonCode: "VLAN_TAG_DROPPED",
    reason: `帧带 VLAN ${vlan ?? "?"} 标签到达 ${deviceName} 的 ${portName}，该口不识别标签，丢弃`,
  }),
  l2Loop: (aName: string, bName: string, links: string): StopInfo => ({
    reasonCode: "L2_LOOP",
    reason: `${aName} 与 ${bName} 之间有两条二层路径（${links}），没有生成树协议，广播风暴`,
  }),
  pppoeRequired: (deviceName: string): StopInfo => ({
    reasonCode: "PPPOE_REQUIRED",
    reason: `上游要求拨号，${deviceName} 的 WAN 是自动获取，没有拿到地址`,
  }),
  pppoeRejected: (deviceName: string, upstream: string): StopInfo => ({
    reasonCode: "PPPOE_REJECTED",
    reason: `${deviceName} 在拨号，但上游（${upstream}）不接受拨号`,
  }),
  wanLanOverlap: (wanIp: string, subnet: string): StopInfo => ({
    reasonCode: "WAN_LAN_OVERLAP",
    reason: `WAN 地址 ${wanIp} 落在 LAN 网段 ${subnet} 内，路由器不知道往哪边发`,
  }),
};

/** 自动获取失败的原因短句，NO_IP 与 L010 共用 */
export function leaseFailureText(
  status: string,
  portName = "eth0",
  vlan: number | null = null,
): string {
  switch (status) {
    case "no-link":
      return `${portName} 没有连线`;
    case "pool-exhausted":
      return "地址池已用完";
    case "pppoe-required":
      return "上游要求拨号，本机是自动获取";
    case "pppoe-rejected":
      return "本机在拨号，但上游不接受拨号";
    default:
      return vlan !== null && vlan !== 1
        ? `VLAN ${vlan} 内没有 DHCP 服务器`
        : "所在网段没有 DHCP 服务器";
  }
}
