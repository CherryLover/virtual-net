/** 包头进 / 出两列的逐字段对照（CP3 文档 3.4），纯函数 */

import type { PacketSummary } from "@virtual-net/engine";

/** 可比较的字段名，顺序即包头查看里的展示顺序 */
export const PACKET_FIELDS = [
  "srcMac",
  "dstMac",
  "srcIp",
  "dstIp",
  "proto",
  "l4.srcPort",
  "l4.dstPort",
  "l4.icmpId",
  "l4.icmpType",
  "ttl",
  "vlan",
] as const;

export type PacketField = (typeof PACKET_FIELDS)[number];

export type ChangedField = PacketField;

function readField(packet: PacketSummary, field: PacketField): unknown {
  switch (field) {
    case "srcMac":
      return packet.srcMac;
    case "dstMac":
      return packet.dstMac;
    case "srcIp":
      return packet.srcIp;
    case "dstIp":
      return packet.dstIp;
    case "proto":
      return packet.proto;
    case "ttl":
      return packet.ttl;
    case "vlan":
      return packet.vlan;
    case "l4.srcPort":
      return packet.l4.srcPort;
    case "l4.dstPort":
      return packet.l4.dstPort;
    case "l4.icmpId":
      return packet.l4.icmpId;
    case "l4.icmpType":
      return packet.l4.icmpType;
    default:
      return undefined;
  }
}

/** 取某个字段的值，供模态框渲染用；一侧为空时返回 undefined */
export function fieldValue(packet: PacketSummary | null, field: PacketField): unknown {
  return packet ? readField(packet, field) : undefined;
}

/**
 * 两侧都有包时逐字段比较，返回值不同的字段名（按 PACKET_FIELDS 顺序）。
 * 任一侧为空返回空数组：只有一列可显示，谈不上变化。
 */
export function diffPacket(
  packetIn: PacketSummary | null,
  packetOut: PacketSummary | null,
): ChangedField[] {
  if (!packetIn || !packetOut) return [];
  const changed: ChangedField[] = [];
  for (const field of PACKET_FIELDS) {
    if (readField(packetIn, field) !== readField(packetOut, field)) changed.push(field);
  }
  return changed;
}
