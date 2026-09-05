/**
 * 每一跳的解释文案（CP3 文档 3.5）：title 给逐跳行，lines 给行展开与气泡。
 * 只读 decision，不改引擎数据。basis 里出现不认识的键不报错，只落回 note。
 */

import type { Decision, ProbeResult } from "@virtual-net/engine";
import { parseMask } from "@virtual-net/engine";
import type { TraceNames } from "./names";
import { reasonLabel } from "./reasonLabel";

export interface Explanation {
  title: string;
  lines: string[];
}

/** 可选的补充信息：DNS 阶段的 receive 自己不带 basis，靠这里拿域名与结果 */
export interface ExplainContext {
  dns?: ProbeResult["dns"];
}

/** 逐跳行的动作中文 */
export function actionLabel(decision: Decision): string {
  switch (decision.action) {
    case "originate":
      return decision.packetIn ? "重新发出" : "发出";
    case "forward":
      return "转发";
    case "answer":
      return "应答";
    case "receive":
      return "收到";
    default:
      return decision.action;
  }
}

/** `命中默认路由 0.0.0.0/0` 或 `命中 192.168.1.0/24` */
function routeHit(dest: string, mask: string): string {
  const prefix = parseMask(mask) ?? 0;
  if (prefix === 0 && dest === "0.0.0.0") return "命中默认路由 0.0.0.0/0";
  return `命中 ${dest}/${prefix}`;
}

/** `{前缀}，从 {端口} 发出`；没有出口时只留前缀 */
function outOfPort(prefix: string, names: TraceNames, portId: string | null): string {
  if (!portId) return prefix;
  return `${prefix}，从 ${names.port(portId)} 发出`;
}

/** 二层到访（CP2 交换机 / AP / 桥接光猫、CP1 路由器网桥内转发）的 title */
function macTitle(decision: Decision, names: TraceNames): string | null {
  const mac = decision.basis.mac;
  if (!mac) return null;
  const dstMac = decision.packetIn?.dstMac ?? "";
  const out = decision.portOut ? names.port(decision.portOut) : "";
  if (mac.lookup === "flood") {
    const ports = (mac.floodPorts ?? []).map((id) => names.port(id)).join("、");
    const flood = ports ? `向 ${ports} 泛洪` : "泛洪";
    return out
      ? `目的 MAC ${dstMac} 未学习，${flood}，从 ${out} 发出`
      : `目的 MAC ${dstMac} 未学习，${flood}`;
  }
  return out ? `目的 MAC ${dstMac} 已学习在 ${out}，从 ${out} 转发` : `目的 MAC ${dstMac} 已学习`;
}

function titleOf(decision: Decision, names: TraceNames, context: ExplainContext): string {
  if (decision.verdict === "stop") return reasonLabel(decision.reasonCode);

  const dns = decision.basis.dns;
  switch (decision.action) {
    case "originate": {
      if (!decision.packetIn) {
        return decision.portOut ? `从 ${names.port(decision.portOut)} 发出` : "发出";
      }
      if (dns) {
        return dns.upstream
          ? `作为 DNS 转发器，向上游 ${dns.upstream} 重新发起查询`
          : "作为 DNS 转发器，重新发起查询";
      }
      return decision.portOut ? `从 ${names.port(decision.portOut)} 重新发出` : "重新发出";
    }
    case "forward": {
      const nat = decision.basis.nat;
      if (nat?.direction === "out") return outOfPort("转发并做 NAT", names, decision.portOut);
      if (nat?.direction === "in") return outOfPort("NAT 还原后转发", names, decision.portOut);
      if (decision.basis.route) return outOfPort("按路由转发", names, decision.portOut);
      return macTitle(decision, names) ?? decision.note;
    }
    case "answer": {
      if (decision.phase === "icmp") return "收到 ping 请求，应答";
      if (dns) {
        return dns.answer ? `DNS 应答：${dns.domain} = ${dns.answer}` : `DNS 应答：${dns.domain}`;
      }
      if (decision.phase === "tcp") return "接受 TCP 443 连接";
      return decision.note;
    }
    case "receive": {
      if (decision.phase !== "dns") return "收到应答，结束";
      const domain = dns?.domain ?? context.dns?.domain;
      const ip = dns?.answer ?? context.dns?.ip;
      return domain && ip ? `收到 DNS 应答，${domain} = ${ip}` : "收到 DNS 应答";
    }
    default:
      return decision.note;
  }
}

/** 把 note 里已经被上面各行说过的片段去掉，剩下的合成一行 */
function noteLine(decision: Decision, lines: string[]): string | null {
  const parts = decision.note
    .split("；")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    // 引擎的「VLAN 1 → VLAN -」读起来怪，VLAN 变化由下面自己的一行负责
    .filter((part) => !part.startsWith("VLAN "))
    .filter((part) => !lines.includes(part));
  if (parts.length === 0) return null;
  const merged = parts.join("；");
  return lines.includes(merged) ? null : merged;
}

/** VLAN 变化那一行；没有变化返回 null */
function vlanLine(decision: Decision): string | null {
  if (!decision.packetIn || !decision.packetOut) return null;
  const from = decision.packetIn.vlan;
  const to = decision.packetOut.vlan;
  if (from !== null && to !== null) return from === to ? null : `VLAN ${from} → ${to}`;
  if (from === null && to !== null) return `打标签 VLAN ${to}`;
  if (from !== null && to === null) return `去标签 VLAN ${from}`;
  return null;
}

export function explain(
  decision: Decision,
  names: TraceNames,
  context: ExplainContext = {},
): Explanation {
  const title = titleOf(decision, names, context);
  const lines: string[] = [];

  if (decision.verdict === "stop" && decision.reason) lines.push(decision.reason);

  const { route, arp, mac, nat, dns } = decision.basis;

  if (route) {
    const via = route.via ? `下一跳 ${route.via}` : "直连";
    lines.push(`查路由表：${routeHit(route.dest, route.mask)}，${via}，从 ${route.iface} 发出`);
  }

  if (arp) {
    lines.push(arp.hit && arp.mac ? `ARP：${arp.ip} → ${arp.mac}` : `ARP：${arp.ip} 无应答`);
  }

  if (mac) lines.push(`学习：${mac.learned.mac} 在 ${names.port(mac.learned.portId)}`);

  if (nat) {
    const head = nat.direction === "in" ? "NAT 还原" : "NAT";
    lines.push(`${head}：${nat.before.ip}:${nat.before.port} → ${nat.after.ip}:${nat.after.port}`);
  }

  if (dns) {
    if (dns.answer) lines.push(`DNS 应答：${dns.domain} = ${dns.answer}`);
    else if (dns.upstream) lines.push(`DNS 转发：${dns.domain} → 上游 ${dns.upstream}`);
    else lines.push(`DNS 查询：${dns.domain}`);
  }

  const vlan = vlanLine(decision);
  if (vlan) lines.push(vlan);

  if (decision.packetIn && decision.packetOut && decision.packetIn.ttl !== decision.packetOut.ttl) {
    lines.push(`TTL ${decision.packetIn.ttl} → ${decision.packetOut.ttl}`);
  }

  const note = noteLine(decision, lines);
  if (note) lines.push(note);

  return { title, lines };
}
