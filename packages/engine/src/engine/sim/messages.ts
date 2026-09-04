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
};

/** 自动获取失败的原因短句，NO_IP 与 L010 共用 */
export function leaseFailureText(status: string, portName = "eth0"): string {
  switch (status) {
    case "no-link":
      return `${portName} 没有连线`;
    case "pool-exhausted":
      return "地址池已用完";
    default:
      return "所在网段没有 DHCP 服务器";
  }
}
