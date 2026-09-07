import { isValidIp } from "../../engine";

export function portValidator(value: string): string | null {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 65535
    ? null
    : "端口须为 1–65535 的整数";
}

export function addressMatcherValidator(value: string): string | null {
  const text = value.trim();
  if (!text || text === "*") return null;
  const [ip, prefix, ...rest] = text.split("/");
  if (!ip || !isValidIp(ip) || rest.length > 0) return "填写 IP 或 IP/前缀长度";
  if (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > 32))
    return "前缀长度须为 0–32";
  return null;
}

export function domainValidator(value: string, wildcard = false): string | null {
  const text = value.trim();
  const domain = wildcard && text.startsWith("*.") ? text.slice(2) : text;
  return domain.length > 0 &&
    domain.length <= 253 &&
    domain
      .split(".")
      .every((label) => label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
    ? null
    : "填写有效域名";
}
