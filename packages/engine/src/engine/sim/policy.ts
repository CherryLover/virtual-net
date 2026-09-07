import { networkInt, parseIp } from "../../model/address";
import type { PacketSummary } from "../../model/probe";
import type { AccessPolicy, AccessRule } from "../../model/topology";

export function domainMatches(pattern: string, domain: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/\.$/, "");
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!p || p === "*") return true;
  if (!d) return false;
  return p.startsWith("*.") ? d.endsWith(p.slice(1)) && d !== p.slice(2) : p === d;
}

export function addressMatches(pattern: string, ip: string): boolean {
  if (!pattern || pattern === "*") return true;
  const [address, bits] = pattern.split("/");
  const a = parseIp(address ?? "");
  const b = parseIp(ip);
  if (a === null || b === null) return false;
  const prefix = bits === undefined ? 32 : Number(bits);
  return (
    Number.isInteger(prefix) &&
    prefix >= 0 &&
    prefix <= 32 &&
    networkInt(a, prefix) === networkInt(b, prefix)
  );
}

function key(deviceId: string, packet: PacketSummary, reverse = false): string {
  const a = `${packet.srcIp}:${packet.l4.srcPort ?? packet.l4.icmpId ?? 0}`;
  const b = `${packet.dstIp}:${packet.l4.dstPort ?? packet.l4.icmpId ?? 0}`;
  return `${deviceId}|${packet.proto}|${reverse ? b : a}|${reverse ? a : b}`;
}

export class PolicySessions {
  private readonly established = new Set<string>();
  evaluate(
    deviceId: string,
    policy: AccessPolicy | undefined,
    packet: PacketSummary,
    direction: Exclude<AccessRule["direction"], "any">,
    domain: string,
    reply: boolean,
  ): {
    action: "allow" | "deny";
    ruleId: string | null;
    ruleName?: string;
    stateful: boolean;
  } | null {
    if (!policy?.enabled) return null;
    if (reply && policy.stateful && this.established.has(key(deviceId, packet, true))) {
      return { action: "allow", ruleId: null, stateful: true };
    }
    const rule = policy.rules.find(
      (r) =>
        r.enabled &&
        (r.direction === "any" || r.direction === direction) &&
        (r.protocol === "any" || r.protocol === packet.proto) &&
        addressMatches(r.source, packet.srcIp) &&
        addressMatches(r.destination, packet.dstIp) &&
        (!r.domain || r.domain === "*" || (Boolean(domain) && domainMatches(r.domain, domain))) &&
        (r.port === null || r.port === packet.l4.dstPort),
    );
    const action = rule?.action ?? policy.defaultAction;
    if (action === "allow" && !reply) this.established.add(key(deviceId, packet));
    return {
      action,
      ruleId: rule?.id ?? null,
      ...(rule
        ? { ruleName: rule.name.trim() || `第 ${policy.rules.indexOf(rule) + 1} 条规则` }
        : {}),
      stateful: false,
    };
  }
}
