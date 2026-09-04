/** 包摘要构造与 L4 小工具 */

import type { L4Summary, PacketSummary, Protocol } from "../../model/probe";

export const INITIAL_TTL = 64;
export const FIRST_EPHEMERAL_PORT = 40000;
export const ICMP_ID = 1;
export const DNS_PORT = 53;
export const HTTPS_PORT = 443;
/** 一条验证最多这么多跳，超了按环路处理 */
export const MAX_HOPS = 32;

export function makePacket(fields: {
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
  proto: Protocol;
  l4: L4Summary;
  ttl?: number;
}): PacketSummary {
  return {
    srcMac: fields.srcMac,
    dstMac: fields.dstMac,
    srcIp: fields.srcIp,
    dstIp: fields.dstIp,
    proto: fields.proto,
    l4: { ...fields.l4 },
    ttl: fields.ttl ?? INITIAL_TTL,
    vlan: null,
  };
}

/** NAT 与会话匹配用的「端口」：ICMP 取 echo id */
export function sessionPortOf(packet: PacketSummary, side: "src" | "dst"): number {
  if (packet.proto === "icmp") return packet.l4.icmpId ?? ICMP_ID;
  return (side === "src" ? packet.l4.srcPort : packet.l4.dstPort) ?? 0;
}

export function isEchoRequest(packet: PacketSummary): boolean {
  return packet.proto === "icmp" && packet.l4.icmpType === "echo-request";
}

export function isDnsQuery(packet: PacketSummary): boolean {
  return packet.proto === "udp" && packet.l4.dstPort === DNS_PORT;
}
