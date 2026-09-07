/**
 * 终止原因的短标签（CP3 文档 2.4）：气泡标题与逐跳行的 title 用它，
 * CP1 / CP2 的长文案（decision.reason）作正文。
 * CP4 起新增 reasonCode 请在这里补一行，否则显示「验证终止」。
 */

/** 表里没有的 code 用这个 */
export const UNKNOWN_REASON_LABEL = "验证终止";

export const REASON_LABELS: Record<string, string> = {
  ACCESS_DENIED: "规则拒绝",
  SERVICE_CLOSED: "服务端口未开放",
  PROXY_UNAVAILABLE: "代理不可用",
  PROXY_PROTOCOL_MISMATCH: "代理协议不匹配",
  PROXY_AUTH_FAILED: "代理认证失败",
  PROXY_DNS_MODE: "解析方式不支持",
  // CP1
  NO_IP: "没有地址",
  PORT_UNLINKED: "端口未连线",
  NO_GATEWAY: "没有网关",
  GATEWAY_OFF_SUBNET: "网关不可达",
  ARP_MISS: "ARP 无应答",
  NO_ROUTE: "没有路由",
  NO_RETURN_ROUTE: "无法回程",
  UNKNOWN_DEST: "目标不存在",
  NAT_NO_SESSION: "没有 NAT 会话",
  NOT_FOR_ME: "不是发给本机",
  L2_REJECT: "二层丢弃",
  TTL_EXCEEDED: "跳数超限",
  NO_DNS: "没有 DNS",
  DNS_NOT_SERVER: "不是 DNS 服务器",
  DNS_NXDOMAIN: "域名不存在",
  DNS_NO_UPSTREAM: "没有上游 DNS",
  TARGET_UNREACHABLE: "目标不可达",
  // CP2
  VLAN_ISOLATED: "VLAN 隔离",
  TRUNK_NOT_ALLOWED: "trunk 未放行",
  VLAN_TAG_DROPPED: "标签被丢弃",
  L2_LOOP: "二层成环",
  PPPOE_REQUIRED: "需要拨号",
  PPPOE_REJECTED: "拨号被拒",
  WAN_LAN_OVERLAP: "WAN 与 LAN 重叠",
};

export function reasonLabel(reasonCode: string | null | undefined): string {
  if (!reasonCode) return UNKNOWN_REASON_LABEL;
  return REASON_LABELS[reasonCode] ?? UNKNOWN_REASON_LABEL;
}
