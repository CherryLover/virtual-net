import { parseIp } from "../model/address";
import type {
  AccessPolicy,
  AccessRule,
  DnsRecord,
  ProxyConfig,
  ServerConfig,
  TrafficRouting,
} from "../model/topology";

type Report = (path: string, message: string) => void;
type Obj = Record<string, unknown>;
export function readRouting(raw: unknown, path: string, report: Report): TrafficRouting {
  const o = object(raw, path, report);
  const ids = new Set<string>();
  return {
    enabled: boolean(o.enabled, `${path}.enabled`, report),
    rules: array(o.rules, `${path}.rules`, report).map((rawRule, i) => {
      const p = `${path}.rules[${i}]`;
      const r = object(rawRule, p, report);
      const id = string(r.id, `${p}.id`, report);
      if (!id.trim() || ids.has(id)) report(`${p}.id`, "规则标识不能为空或重复");
      ids.add(id);
      const match = choice(r.match, ["domain", "ip"], `${p}.match`, report);
      const target = string(r.target, `${p}.target`, report);
      if (match === "domain" && !validDomain(target, true))
        report(`${p}.target`, "需要域名或 *. 子域名");
      if (match === "ip") {
        const [ip, bits, ...rest] = target.split("/");
        if (
          parseIp(ip ?? "") === null ||
          rest.length ||
          (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) > 32))
        )
          report(`${p}.target`, "需要有效 IP 或 CIDR 网段");
      }
      const proxy = r.proxy === null ? null : object(r.proxy, `${p}.proxy`, report);
      return {
        id,
        match,
        target,
        name: string(r.name, `${p}.name`, report),
        enabled: boolean(r.enabled, `${p}.enabled`, report),
        port: r.port === null ? null : port(r.port, `${p}.port`, report),
        proxy:
          proxy === null
            ? null
            : {
                deviceId: string(proxy.deviceId, `${p}.proxy.deviceId`, report),
                protocol: choice(
                  proxy.protocol,
                  ["http", "connect", "socks5"],
                  `${p}.proxy.protocol`,
                  report,
                ),
                dnsMode: choice(proxy.dnsMode, ["client", "proxy"], `${p}.proxy.dnsMode`, report),
                ...(proxy.username === undefined
                  ? {}
                  : { username: string(proxy.username, `${p}.proxy.username`, report) }),
                ...(proxy.password === undefined
                  ? {}
                  : { password: string(proxy.password, `${p}.proxy.password`, report) }),
              },
      };
    }),
  };
}
export function validDomain(value: string, wildcard = false): boolean {
  if (wildcard && (value === "" || value === "*")) return true;
  const domain = (wildcard && value.startsWith("*.") ? value.slice(2) : value).replace(/\.$/, "");
  return (
    domain.length > 0 &&
    domain.length <= 253 &&
    domain
      .split(".")
      .every((label) => label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
  );
}
function object(raw: unknown, path: string, report: Report): Obj {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Obj;
  report(path, "必须是对象");
  return {};
}
function string(raw: unknown, path: string, report: Report): string {
  if (typeof raw === "string") return raw;
  report(path, "必须是文字");
  return "";
}
function boolean(raw: unknown, path: string, report: Report): boolean {
  if (typeof raw === "boolean") return raw;
  report(path, "必须是开关值");
  return false;
}
function choice<T extends string>(
  raw: unknown,
  choices: readonly T[],
  path: string,
  report: Report,
): T {
  if (typeof raw === "string" && choices.includes(raw as T)) return raw as T;
  report(path, `只能是 ${choices.join("、")}`);
  return choices[0] as T;
}
function port(raw: unknown, path: string, report: Report): number {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 65535) return raw;
  report(path, "端口必须是 1–65535 的整数");
  return 443;
}
function array(raw: unknown, path: string, report: Report): unknown[] {
  if (Array.isArray(raw)) return raw;
  report(path, "必须是数组");
  return [];
}
export function readRecords(raw: unknown, path: string, report: Report): DnsRecord[] {
  const domains = new Set<string>();
  return array(raw, path, report).map((v, i) => {
    const p = `${path}[${i}]`;
    const o = object(v, p, report);
    const domain = string(o.domain, `${p}.domain`, report);
    const ip = string(o.ip, `${p}.ip`, report);
    if (!validDomain(domain)) report(`${p}.domain`, "需要有效的完整域名，不支持通配符");
    const canonical = domain.toLowerCase().replace(/\.$/, "");
    if (domains.has(canonical)) report(`${p}.domain`, "域名不能重复");
    domains.add(canonical);
    if (parseIp(ip) === null) report(`${p}.ip`, "需要有效的 IPv4 地址");
    return { domain, ip };
  });
}
export function readPolicy(raw: unknown, path: string, report: Report): AccessPolicy {
  const o = object(raw, path, report);
  const ids = new Set<string>();
  const rules = array(o.rules, `${path}.rules`, report).map((v, i): AccessRule => {
    const p = `${path}.rules[${i}]`;
    const r = object(v, p, report);
    const id = string(r.id, `${p}.id`, report);
    if (!id || ids.has(id)) report(`${p}.id`, "规则标识不能为空或重复");
    ids.add(id);
    const domain = string(r.domain, `${p}.domain`, report);
    if (!validDomain(domain, true)) report(`${p}.domain`, "需要有效的域名，可使用 *. 子域名匹配");
    const address = (key: string) => {
      const s = string(r[key], `${p}.${key}`, report);
      if (s && s !== "*") {
        const parts = s.split("/");
        if (
          parseIp(parts[0] ?? "") === null ||
          parts.length > 2 ||
          (parts.length === 2 && (!/^\d+$/.test(parts[1] ?? "") || Number(parts[1]) > 32))
        )
          report(`${p}.${key}`, "需要 IP 或 CIDR 网段");
      }
      return s;
    };
    return {
      id,
      name: string(r.name, `${p}.name`, report),
      enabled: boolean(r.enabled, `${p}.enabled`, report),
      action: choice(r.action, ["allow", "deny"], `${p}.action`, report),
      direction: choice(r.direction, ["any", "in", "out", "forward"], `${p}.direction`, report),
      protocol: choice(r.protocol, ["any", "icmp", "tcp", "udp"], `${p}.protocol`, report),
      source: address("source"),
      destination: address("destination"),
      domain,
      port: r.port === null ? null : port(r.port, `${p}.port`, report),
    };
  });
  return {
    enabled: boolean(o.enabled, `${path}.enabled`, report),
    defaultAction: choice(o.defaultAction, ["allow", "deny"], `${path}.defaultAction`, report),
    stateful: boolean(o.stateful, `${path}.stateful`, report),
    rules,
  };
}
export function readProxy(raw: unknown, path: string, report: Report): ProxyConfig["proxy"] {
  const o = object(raw, path, report);
  const udp = o.udp === undefined ? undefined : object(o.udp, `${path}.udp`, report);
  return {
    enabled: boolean(o.enabled, `${path}.enabled`, report),
    protocol: choice(o.protocol, ["http", "connect", "socks5"], `${path}.protocol`, report),
    port: port(o.port, `${path}.port`, report),
    auth: choice(o.auth, ["none", "password"], `${path}.auth`, report),
    username: string(o.username, `${path}.username`, report),
    password: string(o.password, `${path}.password`, report),
    ...(udp
      ? {
          udp: {
            enabled: boolean(udp.enabled, `${path}.udp.enabled`, report),
            port: port(udp.port, `${path}.udp.port`, report),
          },
        }
      : {}),
  };
}
export function readServer(
  raw: unknown,
  path: string,
  report: Report,
): Pick<ServerConfig, "services" | "dnsService"> {
  const o = object(raw, path, report);
  const dns = object(o.dnsService, `${path}.dnsService`, report);
  const ids = new Set<string>();
  const ports = new Set<string>();
  const services = array(o.services, `${path}.services`, report).map((v, i) => {
    const p = `${path}.services[${i}]`;
    const s = object(v, p, report);
    const id = string(s.id, `${p}.id`, report);
    const servicePort = port(s.port, `${p}.port`, report);
    const protocol =
      s.protocol === undefined
        ? "tcp"
        : choice(s.protocol, ["tcp", "udp"], `${p}.protocol`, report);
    const endpoint = `${protocol}:${servicePort}`;
    if (!id.trim() || ids.has(id)) report(`${p}.id`, "服务标识不能为空或重复");
    if (ports.has(endpoint)) report(`${p}.port`, "同协议监听端口不能重复");
    if (protocol === "udp" && servicePort === 53) report(`${p}.port`, "UDP 53 保留给 DNS 服务");
    ids.add(id);
    ports.add(endpoint);
    return {
      id,
      name: string(s.name, `${p}.name`, report),
      ...(s.protocol === undefined ? {} : { protocol }),
      port: servicePort,
      enabled: boolean(s.enabled, `${p}.enabled`, report),
    };
  });
  const upstream = string(dns.upstream, `${path}.dnsService.upstream`, report);
  if (upstream && parseIp(upstream) === null)
    report(`${path}.dnsService.upstream`, "需要有效的 IPv4 地址");
  return {
    services,
    dnsService: {
      enabled: boolean(dns.enabled, `${path}.dnsService.enabled`, report),
      records: readRecords(dns.records, `${path}.dnsService.records`, report),
      upstream,
    },
  };
}
export function readRewrite(raw: unknown, path: string, report: Report) {
  const o = object(raw, path, report);
  return {
    enabled: boolean(o.enabled, `${path}.enabled`, report),
    records: readRecords(o.records, `${path}.records`, report),
  };
}
