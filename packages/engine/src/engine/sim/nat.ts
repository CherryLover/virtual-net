/** NAT 会话表：出向新建 / 复用，入向按外部端口还原 */

import type { PacketSummary } from "../../model/probe";
import type { NatSession, Runtime } from "../runtime/types";
import { sessionPortOf } from "./frame";

function sessionsOf(runtime: Runtime, routerId: string): NatSession[] {
  let list = runtime.nat[routerId];
  if (!list) {
    list = [];
    runtime.nat[routerId] = list;
  }
  return list;
}

/** 出向：为一个内网包找到（或建立）会话，返回改写后的源地址与端口 */
export function natOutbound(
  runtime: Runtime,
  routerId: string,
  packet: PacketSummary,
  outerIp: string,
): NatSession {
  const sessions = sessionsOf(runtime, routerId);
  const innerPort = sessionPortOf(packet, "src");
  const peerPort = sessionPortOf(packet, "dst");
  const existing = sessions.find(
    (s) =>
      s.proto === packet.proto &&
      s.inner.ip === packet.srcIp &&
      s.inner.port === innerPort &&
      s.peer.ip === packet.dstIp,
  );
  if (existing) return existing;

  // 外部端口 / echo id 从原值起，被占用就递增
  let outerPort = innerPort;
  while (sessions.some((s) => s.outer.ip === outerIp && s.outer.port === outerPort)) {
    outerPort += 1;
  }
  const session: NatSession = {
    proto: packet.proto,
    inner: { ip: packet.srcIp, port: innerPort },
    outer: { ip: outerIp, port: outerPort },
    peer: { ip: packet.dstIp, port: peerPort },
  };
  sessions.push(session);
  return session;
}

/** 入向：按目的地址 + 外部端口找会话 */
export function natInbound(
  runtime: Runtime,
  routerId: string,
  packet: PacketSummary,
): NatSession | null {
  const sessions = sessionsOf(runtime, routerId);
  const outerPort = sessionPortOf(packet, "dst");
  return (
    sessions.find(
      (s) =>
        s.proto === packet.proto &&
        s.outer.ip === packet.dstIp &&
        s.outer.port === outerPort &&
        s.peer.ip === packet.srcIp,
    ) ?? null
  );
}
