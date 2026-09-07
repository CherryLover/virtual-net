/** 包摘要、决策记录、验证结果（CP1 定稿，CP2 / CP3 只扩展不改） */

export type Protocol = "icmp" | "udp" | "tcp";

export type IcmpType = "echo-request" | "echo-reply";

export interface L4Summary {
  srcPort?: number;
  dstPort?: number;
  icmpId?: number;
  icmpType?: IcmpType;
}

export interface PacketSummary {
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
  proto: Protocol;
  l4: L4Summary;
  ttl: number;
  /** CP1 恒 null，CP2 写 VLAN id */
  vlan: number | null;
}

export type DecisionPhase = "icmp" | "dns" | "tcp" | "udp";

export type DecisionAction = "originate" | "forward" | "answer" | "receive";

export interface RouteBasis {
  dest: string;
  mask: string;
  via: string | null;
  iface: string;
}

export interface ArpBasis {
  ip: string;
  mac: string | null;
  hit: boolean;
}

export interface NatBasis {
  direction: "out" | "in";
  before: { ip: string; port: number };
  after: { ip: string; port: number };
}

export interface DnsBasis {
  domain: string;
  upstream?: string;
  answer?: string;
}

/** 透明设备到访时的 MAC 学习与查表结果 */
export interface MacBasis {
  learned: { mac: string; portId: string };
  lookup: "hit" | "flood";
  /** 未命中时同 VLAN 内除入口外所有有连线的口 */
  floodPorts?: string[];
}

export type PortVlanMode = "access" | "trunk" | "plain";

/** VLAN 相关的判断依据；`dropAt` 是二层路径上第一处丢弃点 */
export interface VlanBasis {
  id: number | null;
  in?: PortVlanMode;
  out?: PortVlanMode;
  dropAt?: { deviceId: string; portId: string; cause: string };
}

/** 开放对象：CP2 加 mac / vlan，CP5 加 tunnel */
export interface DecisionBasis {
  policy?: {
    action: "allow" | "deny";
    ruleId: string | null;
    ruleName?: string;
    stateful: boolean;
    direction: "in" | "out" | "forward";
  };
  proxy?: {
    deviceId: string;
    stage: "authentication" | "response" | "udp-associate" | "udp-relay";
    protocol: string;
  };
  route?: RouteBasis | null;
  arp?: ArpBasis | null;
  nat?: NatBasis | null;
  dns?: DnsBasis | null;
  mac?: MacBasis | null;
  vlan?: VlanBasis | null;
}

export interface Decision {
  seq: number;
  phase: DecisionPhase;
  deviceId: string;
  portIn: string | null;
  portOut: string | null;
  linkId: string | null;
  action: DecisionAction;
  packetIn: PacketSummary | null;
  packetOut: PacketSummary | null;
  basis: DecisionBasis;
  verdict: "pass" | "stop";
  reasonCode: string | null;
  reason: string | null;
  note: string;
}

/** traceroute 的一跳（CP3 1.2） */
export interface Hop {
  /** 从 1 连续编号 */
  hop: number;
  deviceId: string;
  /**
   * 该跳应答用的地址：三层设备取 `portIn` 所属接口的地址，
   * 目标取 `targetIp`，停在没有三层地址的设备上时为 null
   */
  ip: string | null;
  /** 包到达时的 TTL */
  ttlIn: number;
  /** 上一跳到本跳之间穿过的透明设备，CP1 恒为空 */
  through: string[];
  /** 对应 decision 的 seq，点列表行跳到时间线用 */
  seq: number;
  status: "ok" | "stop";
}

export interface FixAt {
  deviceId: string;
  field?: string;
  portId?: string;
}

export interface ProbeResult {
  routingNote?: string;
  connections?: {
    id: string;
    role:
      | "direct"
      | "client-proxy"
      | "client-dns"
      | "proxy-dns"
      | "proxy-target"
      | "proxy-response"
      | "proxy-auth"
      | "proxy-associate"
      | "client-relay"
      | "relay-dns"
      | "relay-response";
    sourceDeviceId: string;
    target: string;
    startSeq: number;
    endSeq: number;
    verdict: "ok" | "fail";
  }[];
  kind: "ping" | "visitSite" | "traceroute" | "dnsQuery";
  verdict: "ok" | "fail";
  summary: string;
  stoppedAt: string | null;
  reasonCode: string | null;
  reason: string | null;
  fixAt: FixAt | null;
  dns: {
    server: string;
    domain: string;
    ip: string;
    originalIp?: string;
    rewritten?: boolean;
    rewrittenBy?: string[];
  } | null;
  hops: Hop[] | null;
  decisions: Decision[];
  path: string[];
}

/** 终止原因编码（2.3 节） */
export const REASON_CODES = [
  "ACCESS_DENIED",
  "SERVICE_CLOSED",
  "PROXY_UNAVAILABLE",
  "PROXY_PROTOCOL_MISMATCH",
  "PROXY_AUTH_FAILED",
  "PROXY_DNS_MODE",
  "PROXY_UDP_UNAVAILABLE",
  "NO_IP",
  "PORT_UNLINKED",
  "NO_GATEWAY",
  "GATEWAY_OFF_SUBNET",
  "ARP_MISS",
  "NO_ROUTE",
  "NO_RETURN_ROUTE",
  "UNKNOWN_DEST",
  "NAT_NO_SESSION",
  "NOT_FOR_ME",
  "L2_REJECT",
  "TTL_EXCEEDED",
  "NO_DNS",
  "DNS_NOT_SERVER",
  "DNS_NXDOMAIN",
  "DNS_NO_UPSTREAM",
  "TARGET_UNREACHABLE",
  "VLAN_ISOLATED",
  "TRUNK_NOT_ALLOWED",
  "VLAN_TAG_DROPPED",
  "L2_LOOP",
  "PPPOE_REQUIRED",
  "PPPOE_REJECTED",
  "WAN_LAN_OVERLAP",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
