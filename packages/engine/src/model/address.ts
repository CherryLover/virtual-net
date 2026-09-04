/** IP / 掩码解析与网段判断。字符串一律点分十进制，引擎内部转前缀长度 */

export type AddressScope = "private" | "carrier" | "public";

export const SCOPE_LABELS: Record<AddressScope, string> = {
  private: "私网",
  carrier: "运营商内网",
  public: "公网",
};

/** 点分十进制转 32 位整数；非法返回 null */
export function parseIp(value: string): number | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    acc = acc * 256 + octet;
  }
  return acc >>> 0;
}

export function isValidIp(value: string): boolean {
  return parseIp(value) !== null;
}

export function formatIp(value: number): string {
  const n = value >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** 掩码转前缀长度；非连续 1 或格式错误返回 null */
export function parseMask(value: string): number | null {
  const n = parseIp(value);
  if (n === null) return null;
  const inverted = ~n >>> 0;
  // 连续 1 的掩码取反后必然是 2^k - 1
  if (((inverted + 1) & inverted) !== 0) return null;
  let prefix = 0;
  let probe = n;
  while (probe & 0x80000000) {
    prefix += 1;
    probe = (probe << 1) >>> 0;
  }
  return prefix;
}

export function isValidMask(value: string): boolean {
  return parseMask(value) !== null;
}

export function maskFromPrefix(prefix: number): string {
  if (prefix <= 0) return "0.0.0.0";
  return formatIp((0xffffffff << (32 - prefix)) >>> 0);
}

export function networkInt(ipInt: number, prefix: number): number {
  if (prefix <= 0) return 0;
  return (ipInt & ((0xffffffff << (32 - prefix)) >>> 0)) >>> 0;
}

export function broadcastInt(ipInt: number, prefix: number): number {
  return (networkInt(ipInt, prefix) | (~((0xffffffff << (32 - prefix)) >>> 0) >>> 0)) >>> 0;
}

/** 两个地址是否在同一个 prefix 长度的网段内 */
export function sameSubnet(a: string, b: string, prefix: number): boolean {
  const ia = parseIp(a);
  const ib = parseIp(b);
  if (ia === null || ib === null) return false;
  return networkInt(ia, prefix) === networkInt(ib, prefix);
}

/** `ip` 是否落在 `ip2/mask` 网段内 */
export function inSubnet(ip: string, subnetIp: string, mask: string): boolean {
  const prefix = parseMask(mask);
  if (prefix === null) return false;
  return sameSubnet(ip, subnetIp, prefix);
}

/** 「192.168.1.0/24」这样的网段文字 */
export function subnetLabel(ip: string, mask: string): string {
  const ipInt = parseIp(ip);
  const prefix = parseMask(mask);
  if (ipInt === null || prefix === null) return `${ip}/${mask}`;
  return `${formatIp(networkInt(ipInt, prefix))}/${prefix}`;
}

/** 是否可用作主机地址（不是网络地址、不是广播地址） */
export function isHostAddress(ip: string, mask: string): boolean {
  const ipInt = parseIp(ip);
  const prefix = parseMask(mask);
  if (ipInt === null || prefix === null) return false;
  if (prefix >= 31) return true;
  return ipInt !== networkInt(ipInt, prefix) && ipInt !== broadcastInt(ipInt, prefix);
}

/** 私网判定：10/8、172.16/12、192.168/16 是私网；100.64/10 是运营商内网 */
export function isPrivate(ip: string): AddressScope {
  const n = parseIp(ip);
  if (n === null) return "public";
  if (networkInt(n, 8) === networkInt(parseIp("10.0.0.0") as number, 8)) return "private";
  if (networkInt(n, 12) === networkInt(parseIp("172.16.0.0") as number, 12)) return "private";
  if (networkInt(n, 16) === networkInt(parseIp("192.168.0.0") as number, 16)) return "private";
  if (networkInt(n, 10) === networkInt(parseIp("100.64.0.0") as number, 10)) return "carrier";
  return "public";
}

export function compareIp(a: string, b: string): number {
  const ia = parseIp(a) ?? 0;
  const ib = parseIp(b) ?? 0;
  return ia - ib;
}

/** 闭区间地址列表，升序；起止非法或起 > 止返回空数组 */
export function ipRange(start: string, end: string, limit = 4096): string[] {
  const s = parseIp(start);
  const e = parseIp(end);
  if (s === null || e === null || s > e) return [];
  const out: string[] = [];
  for (let i = s; i <= e && out.length < limit; i += 1) out.push(formatIp(i));
  return out;
}

export function inRange(ip: string, start: string, end: string): boolean {
  const n = parseIp(ip);
  const s = parseIp(start);
  const e = parseIp(end);
  if (n === null || s === null || e === null) return false;
  return n >= s && n <= e;
}
