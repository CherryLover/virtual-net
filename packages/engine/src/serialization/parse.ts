/** 拓扑 JSON 的结构校验与版本检查 */

import type {
  ApConfig,
  Device,
  DeviceType,
  DhcpConfig,
  InternetAccess,
  InternetConfig,
  InternetTarget,
  Link,
  LinkEnd,
  ModemConfig,
  PcConfig,
  Port,
  Position,
  PppoeConfig,
  RouterConfig,
  RouterVlan,
  StaticWanConfig,
  SwitchConfig,
  Topology,
  Viewport,
} from "../model/topology";
import { TOPOLOGY_VERSION } from "../model/topology";
import { isVlanId, MAX_VLAN_ID, MIN_VLAN_ID, type PortVlan, portSupportsVlan } from "../model/vlan";
import {
  readPolicy,
  readProxy,
  readRewrite,
  readRouting,
  readServer,
  validDomain,
} from "./services";

export interface ParseError {
  /** 出错的字段路径，如 `devices[1].ports[0].mac` */
  path: string;
  /** 给人看的一句话 */
  message: string;
  /** 与该错误相关的连线（L003 类错误定位用） */
  linkId?: string;
  /** 与该错误相关的设备 */
  deviceId?: string;
}

export type ParseResult =
  | { ok: true; topology: Topology; errors: []; warnings: ParseError[] }
  | { ok: false; topology: null; errors: ParseError[] };

/** 每种设备类型的端口名规范 */
const PORT_NAME_RULES: Record<DeviceType, (names: string[]) => string | null> = {
  server: (names) =>
    names.length === 1 && names[0] === "eth0" ? null : "服务器需要一个 eth0 端口",
  proxy: (names) => (names.length === 1 && names[0] === "eth0" ? null : "代理需要一个 eth0 端口"),
  "access-control": (names) =>
    names.length === 2 && names[0] === "port1" && names[1] === "port2"
      ? null
      : "访问控制需要 port1、port2",
  pc: (names) => (names.length === 1 && names[0] === "eth0" ? null : "电脑只能有一个 eth0 端口"),
  router: (names) => {
    const want = ["wan", "lan1", "lan2", "lan3", "lan4"];
    return names.length === want.length && want.every((n, i) => names[i] === n)
      ? null
      : "路由器端口必须是 wan、lan1–lan4";
  },
  internet: (names) => {
    if (names.length < 1) return "互联网至少要有一个端口";
    const bad = names.some((n, i) => n !== `port${i + 1}`);
    return bad ? "互联网端口必须依次命名 port1、port2…" : null;
  },
  switch: (names) => {
    if (names.length < SWITCH_MIN_PORTS || names.length > SWITCH_MAX_PORTS) {
      return `交换机端口数只能是 ${SWITCH_MIN_PORTS}–${SWITCH_MAX_PORTS}`;
    }
    const bad = names.some((n, i) => n !== `port${i + 1}`);
    return bad ? "交换机端口必须依次命名 port1、port2…" : null;
  },
  ap: (names) => {
    if (names.length < 2) return "无线 AP 至少要有 uplink 和 wlan1";
    if (names[0] !== "uplink") return "无线 AP 的第一个端口必须是 uplink";
    const bad = names.slice(1).some((n, i) => n !== `wlan${i + 1}`);
    return bad ? "无线 AP 的客户端口必须依次命名 wlan1、wlan2…" : null;
  },
  modem: (names) => {
    const want = ["wan", "lan1"];
    return names.length === want.length && want.every((n, i) => names[i] === n)
      ? null
      : "光猫端口必须是 wan、lan1";
  },
};

const SWITCH_MIN_PORTS = 4;
const SWITCH_MAX_PORTS = 48;
const DEVICE_TYPES: DeviceType[] = [
  "pc",
  "router",
  "internet",
  "switch",
  "ap",
  "modem",
  "server",
  "proxy",
  "access-control",
];

const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  readonly errors: ParseError[] = [];
  readonly warnings: ParseError[] = [];
  constructor(readonly allowInvalidConfig = false) {}
  config(path: string, message: string, severity?: "warning"): void {
    if (severity === "warning" && this.allowInvalidConfig) this.warnings.push({ path, message });
    else this.add(path, message);
  }
  add(path: string, message: string, extra?: { linkId?: string; deviceId?: string }): void {
    this.errors.push({ path, message, ...extra });
  }
  get ok(): boolean {
    return this.errors.length === 0;
  }
}

function readString(c: Collector, obj: Record<string, unknown>, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== "string") {
    c.add(`${path}.${key}`, `${key} 必须是字符串`);
    return "";
  }
  return value;
}

function readBoolean(
  c: Collector,
  obj: Record<string, unknown>,
  key: string,
  path: string,
): boolean {
  const value = obj[key];
  if (typeof value !== "boolean") {
    c.add(`${path}.${key}`, `${key} 必须是布尔值`);
    return false;
  }
  return value;
}

function readNumber(c: Collector, obj: Record<string, unknown>, key: string, path: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    c.add(`${path}.${key}`, `${key} 必须是数字`);
    return 0;
  }
  return value;
}

function readPosition(c: Collector, value: unknown, path: string): Position {
  if (!isObject(value)) {
    c.add(path, "position 必须是对象");
    return { x: 0, y: 0 };
  }
  return { x: readNumber(c, value, "x", path), y: readNumber(c, value, "y", path) };
}

function readViewport(c: Collector, value: unknown): Viewport {
  if (!isObject(value)) {
    c.add("viewport", "viewport 必须是对象");
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = readNumber(c, value, "zoom", "viewport");
  if (zoom <= 0) c.add("viewport.zoom", "视口缩放必须大于零");
  return {
    x: readNumber(c, value, "x", "viewport"),
    y: readNumber(c, value, "y", "viewport"),
    zoom,
  };
}

/** VLAN 配置：access { pvid } / trunk { allowed, native } */
function readPortVlan(c: Collector, value: unknown, path: string): PortVlan | undefined {
  if (!isObject(value)) {
    c.add(path, "vlan 必须是对象");
    return undefined;
  }
  const mode = value.mode;
  if (mode !== "access" && mode !== "trunk") {
    c.add(`${path}.mode`, "vlan.mode 只能是 access 或 trunk");
    return undefined;
  }
  if (mode === "access") {
    const pvid = value.pvid;
    if (!isVlanId(pvid)) {
      c.add(`${path}.pvid`, `PVID 只能是 ${MIN_VLAN_ID}–${MAX_VLAN_ID} 的整数`);
      return undefined;
    }
    return { mode: "access", pvid };
  }
  const allowedRaw = value.allowed;
  if (!Array.isArray(allowedRaw)) {
    c.add(`${path}.allowed`, "allowed 必须是数组");
    return undefined;
  }
  const allowed: number[] = [];
  for (const [i, id] of allowedRaw.entries()) {
    if (!isVlanId(id)) {
      c.add(`${path}.allowed[${i}]`, `VLAN 号只能是 ${MIN_VLAN_ID}–${MAX_VLAN_ID} 的整数`);
      continue;
    }
    allowed.push(id);
  }
  const native = value.native;
  if (!isVlanId(native)) {
    c.add(`${path}.native`, `native 只能是 ${MIN_VLAN_ID}–${MAX_VLAN_ID} 的整数`);
    return undefined;
  }
  return { mode: "trunk", allowed, native };
}

function readPort(c: Collector, value: unknown, path: string): Port {
  if (!isObject(value)) {
    c.add(path, "端口必须是对象");
    return { id: "", name: "", mac: "", linkId: null };
  }
  const mac = readString(c, value, "mac", path);
  if (mac && !MAC_RE.test(mac)) c.add(`${path}.mac`, `MAC "${mac}" 格式不对`);
  const linkId = value.linkId;
  if (linkId !== null && typeof linkId !== "string") {
    c.add(`${path}.linkId`, "linkId 必须是字符串或 null");
  }
  const port: Port = {
    id: readString(c, value, "id", path),
    name: readString(c, value, "name", path),
    mac,
    linkId: typeof linkId === "string" ? linkId : null,
  };
  if ("vlan" in value) {
    const vlan = readPortVlan(c, value.vlan, `${path}.vlan`);
    if (vlan) port.vlan = vlan;
  }
  if ("displaySide" in value) {
    const side = value.displaySide;
    if (side === "top" || side === "bottom" || side === "left" || side === "right") {
      port.displaySide = side;
    } else c.add(`${path}.displaySide`, "端口显示侧必须是 top、bottom、left 或 right");
  }
  return port;
}

function readPcConfig(c: Collector, value: unknown, path: string): PcConfig {
  if (!isObject(value)) {
    c.add(path, "config 必须是对象");
    return { addressMode: "dhcp", ip: "", mask: "", gateway: "", dns: "" };
  }
  const mode = value.addressMode;
  if (mode !== "static" && mode !== "dhcp") {
    c.add(`${path}.addressMode`, "addressMode 只能是 static 或 dhcp");
  }
  return {
    addressMode: mode === "static" ? "static" : "dhcp",
    ...(value.trafficRouting === undefined
      ? {}
      : {
          trafficRouting: readRouting(
            value.trafficRouting,
            `${path}.trafficRouting`,
            (p, message, severity) => c.config(p, message, severity),
          ),
        }),
    ip: readString(c, value, "ip", path),
    mask: readString(c, value, "mask", path),
    gateway: readString(c, value, "gateway", path),
    dns: readString(c, value, "dns", path),
  };
}

function readDhcp(c: Collector, value: unknown, path: string): DhcpConfig {
  if (!isObject(value)) {
    c.add(path, "dhcp 必须是对象");
    return { enabled: false, rangeStart: "", rangeEnd: "", leaseHours: 24 };
  }
  return {
    enabled: readBoolean(c, value, "enabled", path),
    rangeStart: readString(c, value, "rangeStart", path),
    rangeEnd: readString(c, value, "rangeEnd", path),
    leaseHours: readNumber(c, value, "leaseHours", path),
  };
}

function readSubnet(c: Collector, value: unknown, path: string): { ip: string; mask: string } {
  if (!isObject(value)) {
    c.add(path, `${path.split(".").pop()} 必须是对象`);
    return { ip: "", mask: "" };
  }
  return { ip: readString(c, value, "ip", path), mask: readString(c, value, "mask", path) };
}

function readPppoe(c: Collector, value: unknown, path: string): PppoeConfig {
  if (!isObject(value)) {
    c.add(path, "pppoe 必须是对象");
    return { username: "", password: "" };
  }
  return {
    username: readString(c, value, "username", path),
    password: readString(c, value, "password", path),
  };
}

function readStaticWan(c: Collector, value: unknown, path: string): StaticWanConfig {
  if (!isObject(value)) {
    c.add(path, "static 必须是对象");
    return { ip: "", mask: "", gateway: "", dns: "" };
  }
  return {
    ip: readString(c, value, "ip", path),
    mask: readString(c, value, "mask", path),
    gateway: readString(c, value, "gateway", path),
    dns: readString(c, value, "dns", path),
  };
}

function readRouterVlans(c: Collector, value: unknown, path: string): RouterVlan[] {
  if (!Array.isArray(value)) {
    c.add(path, "vlans 必须是数组");
    return [];
  }
  const out: RouterVlan[] = [];
  const seen = new Set<number>();
  value.forEach((raw, i) => {
    const item = `${path}[${i}]`;
    if (!isObject(raw)) {
      c.add(item, "VLAN 子接口必须是对象");
      return;
    }
    const id = raw.id;
    if (!isVlanId(id) || id === 1) {
      c.add(`${item}.id`, `VLAN 号只能是 2–${MAX_VLAN_ID} 的整数`);
      return;
    }
    if (seen.has(id)) {
      c.add(`${item}.id`, `VLAN ${id} 重复`);
      return;
    }
    seen.add(id);
    out.push({
      id,
      ip: readString(c, raw, "ip", item),
      mask: readString(c, raw, "mask", item),
      dhcp: readDhcp(c, raw.dhcp, `${item}.dhcp`),
    });
  });
  return out;
}

function readRouterConfig(c: Collector, value: unknown, path: string): RouterConfig {
  const fallback: RouterConfig = {
    lan: { ip: "", mask: "" },
    dhcp: { enabled: false, rangeStart: "", rangeEnd: "", leaseHours: 24 },
    wan: { mode: "dhcp" },
    nat: true,
  };
  if (!isObject(value)) {
    c.add(path, "config 必须是对象");
    return fallback;
  }
  const lan = readSubnet(c, value.lan, `${path}.lan`);
  const dhcp = readDhcp(c, value.dhcp, `${path}.dhcp`);

  const wanRaw = value.wan;
  const wan: RouterConfig["wan"] = { mode: "dhcp" };
  if (!isObject(wanRaw)) {
    c.add(`${path}.wan`, "wan 必须是对象");
  } else {
    const mode = wanRaw.mode;
    if (mode !== "dhcp" && mode !== "pppoe" && mode !== "static") {
      c.add(`${path}.wan.mode`, "wan.mode 只能是 dhcp、pppoe 或 static");
    } else {
      wan.mode = mode;
    }
    if ("pppoe" in wanRaw) wan.pppoe = readPppoe(c, wanRaw.pppoe, `${path}.wan.pppoe`);
    if ("static" in wanRaw) wan.static = readStaticWan(c, wanRaw.static, `${path}.wan.static`);
  }

  const config: RouterConfig = { lan, dhcp, wan, nat: readBoolean(c, value, "nat", path) };
  if ("vlans" in value) config.vlans = readRouterVlans(c, value.vlans, `${path}.vlans`);
  return config;
}

function readSwitchConfig(
  c: Collector,
  value: unknown,
  path: string,
  portCount: number,
): SwitchConfig {
  if (!isObject(value)) {
    c.add(path, "config 必须是对象");
    return { portCount };
  }
  const count = readNumber(c, value, "portCount", path);
  if (count !== portCount) {
    c.add(`${path}.portCount`, `端口数 ${count} 与实际端口 ${portCount} 个不一致`);
  }
  return { portCount: count };
}

function readApConfig(c: Collector, value: unknown, path: string): ApConfig {
  if (!isObject(value)) {
    c.add(path, "config 必须是对象");
    return { ssid: "" };
  }
  return { ssid: readString(c, value, "ssid", path) };
}

function readModemConfig(c: Collector, value: unknown, path: string): ModemConfig {
  const fallback: ModemConfig = {
    mode: "bridge",
    wan: { mode: "auto" },
    lan: { ip: "", mask: "" },
    dhcp: { enabled: false, rangeStart: "", rangeEnd: "", leaseHours: 24 },
  };
  if (!isObject(value)) {
    c.add(path, "config 必须是对象");
    return fallback;
  }
  const mode = value.mode;
  if (mode !== "bridge" && mode !== "route") {
    c.add(`${path}.mode`, "光猫模式只能是 bridge 或 route");
  }
  const wanRaw = value.wan;
  const wan: ModemConfig["wan"] = { mode: "auto" };
  if (!isObject(wanRaw)) {
    c.add(`${path}.wan`, "wan 必须是对象");
  } else {
    const wanMode = wanRaw.mode;
    if (wanMode !== "auto" && wanMode !== "dhcp" && wanMode !== "pppoe") {
      c.add(`${path}.wan.mode`, "wan.mode 只能是 auto、dhcp 或 pppoe");
    } else {
      wan.mode = wanMode;
    }
    if ("pppoe" in wanRaw) wan.pppoe = readPppoe(c, wanRaw.pppoe, `${path}.wan.pppoe`);
  }
  return {
    mode: mode === "route" ? "route" : "bridge",
    wan,
    lan: readSubnet(c, value.lan, `${path}.lan`),
    dhcp: readDhcp(c, value.dhcp, `${path}.dhcp`),
  };
}

function readTarget(c: Collector, value: unknown, path: string): InternetTarget {
  if (!isObject(value)) {
    c.add(path, "目标必须是对象");
    return { id: "", domain: "", ip: "", region: "overseas", dnsServer: false, reachable: true };
  }
  const region = value.region;
  if (region !== "cn" && region !== "overseas") {
    c.add(`${path}.region`, "region 只能是 cn 或 overseas");
  }
  return {
    id: readString(c, value, "id", path),
    domain: readString(c, value, "domain", path),
    ip: readString(c, value, "ip", path),
    region: region === "cn" ? "cn" : "overseas",
    dnsServer: readBoolean(c, value, "dnsServer", path),
    reachable: readBoolean(c, value, "reachable", path),
  };
}

function readInternetConfig(c: Collector, value: unknown, path: string): InternetConfig {
  const fallbackAccess = { ip: "", mask: "", poolStart: "", poolEnd: "", dns: "" };
  if (!isObject(value)) {
    c.add(path, "config 必须是对象");
    return { access: fallbackAccess, targets: [] };
  }
  const accessRaw = value.access;
  let access: InternetAccess = fallbackAccess;
  if (isObject(accessRaw)) {
    access = {
      ip: readString(c, accessRaw, "ip", `${path}.access`),
      mask: readString(c, accessRaw, "mask", `${path}.access`),
      poolStart: readString(c, accessRaw, "poolStart", `${path}.access`),
      poolEnd: readString(c, accessRaw, "poolEnd", `${path}.access`),
      dns: readString(c, accessRaw, "dns", `${path}.access`),
    };
    if ("mode" in accessRaw) {
      const mode = accessRaw.mode;
      if (mode !== "dhcp" && mode !== "pppoe") {
        c.add(`${path}.access.mode`, "接入方式只能是 dhcp 或 pppoe");
      } else {
        access.mode = mode;
      }
    }
  } else {
    c.add(`${path}.access`, "access 必须是对象");
  }
  const targetsRaw = value.targets;
  if (!Array.isArray(targetsRaw)) {
    c.add(`${path}.targets`, "targets 必须是数组");
    return { access, targets: [] };
  }
  const targets = targetsRaw.map((t, i) => readTarget(c, t, `${path}.targets[${i}]`));
  const ids = new Set<string>();
  const domains = new Set<string>();
  targets.forEach((target, i) => {
    const p = `${path}.targets[${i}]`;
    if (!target.id.trim() || ids.has(target.id)) c.add(`${p}.id`, "目标标识不能为空或重复");
    ids.add(target.id);
    const domain = target.domain.toLowerCase().replace(/\.$/, "");
    if (!validDomain(target.domain)) c.config(`${p}.domain`, "需要有效的完整域名", "warning");
    if (domains.has(domain)) c.config(`${p}.domain`, "目标域名不能重复", "warning");
    domains.add(domain);
  });
  return { access, targets };
}

function readDevice(c: Collector, value: unknown, index: number): Device | null {
  const path = `devices[${index}]`;
  if (!isObject(value)) {
    c.add(path, "设备必须是对象");
    return null;
  }
  const type = value.type;
  if (typeof type !== "string" || !DEVICE_TYPES.includes(type as DeviceType)) {
    c.add(`${path}.type`, "设备类型不受支持，请使用兼容版本导出");
    return null;
  }
  const deviceType = type as DeviceType;
  const id = readString(c, value, "id", path);
  const name = readString(c, value, "name", path);
  const position = readPosition(c, value.position, `${path}.position`);
  const portsRaw = value.ports;
  if (!Array.isArray(portsRaw)) {
    c.add(`${path}.ports`, "ports 必须是数组", { deviceId: id });
    return null;
  }
  const ports = portsRaw.map((p, i) => readPort(c, p, `${path}.ports[${i}]`));
  const nameProblem = PORT_NAME_RULES[deviceType](ports.map((p) => p.name));
  if (nameProblem) c.add(`${path}.ports`, nameProblem, { deviceId: id });
  ports.forEach((port, i) => {
    if (port.vlan && !portSupportsVlan(deviceType, port.name)) {
      c.add(`${path}.ports[${i}].vlan`, `${port.name} 不支持 VLAN 设置`, { deviceId: id });
    }
  });
  const report = (p: string, message: string, severity?: "warning") =>
    c.config(p, message, severity);
  if ("zone" in value && typeof value.zone !== "string")
    c.add(`${path}.zone`, "区域名称必须是文字");
  const base = {
    id,
    name,
    position,
    ports,
    ...(typeof value.zone === "string" ? { zone: value.zone } : {}),
    ...("accessPolicy" in value
      ? { accessPolicy: readPolicy(value.accessPolicy, `${path}.accessPolicy`, report) }
      : {}),
  };
  switch (deviceType) {
    case "server":
      return {
        ...base,
        type: "server",
        config: {
          ...readPcConfig(c, value.config, `${path}.config`),
          ...readServer(value.config, `${path}.config`, report),
        },
      };
    case "proxy":
      return {
        ...base,
        type: "proxy",
        config: {
          ...readPcConfig(c, value.config, `${path}.config`),
          proxy: readProxy(
            isObject(value.config) ? value.config.proxy : undefined,
            `${path}.config.proxy`,
            report,
          ),
        },
      };
    case "access-control":
      return {
        ...base,
        type: "access-control",
        config: {
          dnsRewrite: readRewrite(
            isObject(value.config) ? value.config.dnsRewrite : undefined,
            `${path}.config.dnsRewrite`,
            report,
          ),
        },
      };
    case "pc":
      return { ...base, type: "pc", config: readPcConfig(c, value.config, `${path}.config`) };
    case "router":
      return {
        ...base,
        type: "router",
        config: readRouterConfig(c, value.config, `${path}.config`),
      };
    case "switch":
      return {
        ...base,
        type: "switch",
        config: readSwitchConfig(c, value.config, `${path}.config`, ports.length),
      };
    case "ap":
      return { ...base, type: "ap", config: readApConfig(c, value.config, `${path}.config`) };
    case "modem":
      return { ...base, type: "modem", config: readModemConfig(c, value.config, `${path}.config`) };
    default:
      return {
        ...base,
        type: "internet",
        config: readInternetConfig(c, value.config, `${path}.config`),
      };
  }
}

function readLinkEnd(c: Collector, value: unknown, path: string): LinkEnd {
  if (!isObject(value)) {
    c.add(path, "连线端点必须是对象");
    return { deviceId: "", portId: "" };
  }
  return {
    deviceId: readString(c, value, "deviceId", path),
    portId: readString(c, value, "portId", path),
  };
}

function readLink(c: Collector, value: unknown, index: number): Link {
  const path = `links[${index}]`;
  if (!isObject(value)) {
    c.add(path, "连线必须是对象");
    return { id: "", a: { deviceId: "", portId: "" }, b: { deviceId: "", portId: "" } };
  }
  return {
    id: readString(c, value, "id", path),
    a: readLinkEnd(c, value.a, `${path}.a`),
    b: readLinkEnd(c, value.b, `${path}.b`),
    ...("curve" in value
      ? {
          curve: {
            source: readPosition(
              c,
              isObject(value.curve) ? value.curve.source : null,
              `${path}.curve.source`,
            ),
            target: readPosition(
              c,
              isObject(value.curve) ? value.curve.target : null,
              `${path}.curve.target`,
            ),
          },
        }
      : {}),
  };
}

function checkReferences(c: Collector, devices: Device[], links: Link[]): void {
  const deviceIds = new Set<string>();
  const portOwner = new Map<string, string>();
  const macs = new Map<string, string>();
  devices.forEach((device, i) => {
    if (!device.id.trim()) c.add(`devices[${i}].id`, "设备标识不能为空");
    if (deviceIds.has(device.id)) c.add(`devices[${i}].id`, `设备 id "${device.id}" 重复`);
    deviceIds.add(device.id);
    device.ports.forEach((port, j) => {
      if (!port.id.trim()) c.add(`devices[${i}].ports[${j}].id`, "端口标识不能为空");
      if (portOwner.has(port.id))
        c.add(`devices[${i}].ports[${j}].id`, `端口 id "${port.id}" 重复`);
      portOwner.set(port.id, device.id);
      const seen = macs.get(port.mac.toLowerCase());
      if (seen) c.add(`devices[${i}].ports[${j}].mac`, `MAC "${port.mac}" 重复`);
      else macs.set(port.mac.toLowerCase(), port.id);
    });
  });

  const linkIds = new Set<string>();
  devices.forEach((device, i) => {
    if (device.type !== "pc" && device.type !== "server" && device.type !== "proxy") return;
    device.config.trafficRouting?.rules.forEach((rule, j) => {
      if (!rule.proxy) return;
      const proxy = devices.find((item) => item.id === rule.proxy?.deviceId);
      if (proxy?.type !== "proxy")
        c.add(
          `devices[${i}].config.trafficRouting.rules[${j}].proxy.deviceId`,
          "转发规则必须引用存在的代理设备",
          { deviceId: device.id },
        );
    });
  });
  for (const [i, link] of links.entries()) {
    const path = `links[${i}]`;
    if (!link.id.trim()) c.add(`${path}.id`, "连线标识不能为空");
    if (linkIds.has(link.id)) c.add(`${path}.id`, `连线 id "${link.id}" 重复`, { linkId: link.id });
    linkIds.add(link.id);
    if (link.a.portId === link.b.portId) {
      c.add(path, "连线两端不能是同一个端口", { linkId: link.id });
    }
    if (link.a.deviceId === link.b.deviceId) {
      c.add(path, "同一台设备的两个端口不能互连", { linkId: link.id });
    }
    for (const [side, end] of [
      ["a", link.a],
      ["b", link.b],
    ] as const) {
      const owner = portOwner.get(end.portId);
      if (owner === undefined) {
        c.add(`${path}.${side}`, `连线指向不存在的端口 "${end.portId}"`, {
          linkId: link.id,
          deviceId: end.deviceId,
        });
        continue;
      }
      if (owner !== end.deviceId) {
        c.add(`${path}.${side}`, `端口 "${end.portId}" 不属于设备 "${end.deviceId}"`, {
          linkId: link.id,
          deviceId: end.deviceId,
        });
        continue;
      }
      const port = devices
        .find((d) => d.id === owner)
        ?.ports.find((p) => p.id === end.portId) as Port;
      if (port.linkId !== link.id) {
        c.add(`${path}.${side}`, `端口 "${end.portId}" 的 linkId 与连线对不上`, {
          linkId: link.id,
          deviceId: end.deviceId,
        });
      }
    }
  }

  for (const [i, device] of devices.entries()) {
    for (const [j, port] of device.ports.entries()) {
      if (port.linkId !== null && !linkIds.has(port.linkId)) {
        c.add(`devices[${i}].ports[${j}].linkId`, `端口指向不存在的连线 "${port.linkId}"`, {
          linkId: port.linkId,
          deviceId: device.id,
        });
      }
      if (port.linkId !== null && linkIds.has(port.linkId)) {
        const link = links.find((item) => item.id === port.linkId);
        if (
          link &&
          ![link.a, link.b].some((end) => end.deviceId === device.id && end.portId === port.id)
        )
          c.add(`devices[${i}].ports[${j}].linkId`, "端口并非所引用连线的端点", {
            deviceId: device.id,
          });
      }
    }
  }
}

function readPresentation(
  c: Collector,
  raw: Record<string, unknown>,
  devices: Device[],
  links: Link[],
): Partial<Topology> {
  const result: Partial<Topology> = {};
  const deviceIds = new Set(devices.map((device) => device.id));
  if (raw.groups !== undefined) {
    if (!Array.isArray(raw.groups)) c.add("groups", "分组必须是数组");
    else {
      const ids = new Set<string>();
      const members = new Set<string>();
      result.groups = raw.groups.flatMap((group, i) => {
        const path = `groups[${i}]`;
        if (!isObject(group)) {
          c.add(path, "分组必须是对象");
          return [];
        }
        const id = readString(c, group, "id", path);
        const name = readString(c, group, "name", path);
        if (!id.trim() || ids.has(id)) c.add(`${path}.id`, "分组标识不能为空或重复");
        ids.add(id);
        if (!name.trim()) c.add(`${path}.name`, "分组名称不能为空");
        if (!Array.isArray(group.deviceIds) || !group.deviceIds.length) {
          c.add(`${path}.deviceIds`, "分组必须至少包含一个设备");
          return [];
        }
        const memberIds: string[] = [];
        group.deviceIds.forEach((member, j) => {
          if (typeof member !== "string" || !deviceIds.has(member))
            c.add(`${path}.deviceIds[${j}]`, "分组引用不存在的设备");
          else {
            if (members.has(member)) c.add(`${path}.deviceIds[${j}]`, "同一设备不能重复分组");
            members.add(member);
            memberIds.push(member);
          }
        });
        return [{ id, name, deviceIds: memberIds }];
      });
    }
  }
  if (raw.appearance !== undefined) {
    if (!isObject(raw.appearance)) c.add("appearance", "配色必须是对象");
    else {
      const appearance: NonNullable<Topology["appearance"]> = {};
      const color = (value: unknown, path: string): value is string => {
        if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return true;
        c.add(path, "颜色必须是 #RRGGBB 格式");
        return false;
      };
      for (const key of Object.keys(raw.appearance)) {
        const value = raw.appearance[key];
        const path = `appearance.${key}`;
        if (
          key === "accent" ||
          key === "background" ||
          key === "nodeColor" ||
          key === "linkColor"
        ) {
          if (color(value, path)) appearance[key] = value;
        } else if (key === "nodeTypes" || key === "devices" || key === "links") {
          if (!isObject(value)) {
            c.add(path, "配色映射必须是对象");
            continue;
          }
          const map: Record<string, string> = {};
          for (const [id, item] of Object.entries(value)) {
            const exists =
              key === "nodeTypes"
                ? DEVICE_TYPES.includes(id as DeviceType)
                : key === "devices"
                  ? deviceIds.has(id)
                  : links.some((link) => link.id === id);
            if (!exists) c.add(`${path}.${id}`, "配色引用不存在的设备类型、设备或连线");
            if (color(item, `${path}.${id}`))
              Object.defineProperty(map, id, {
                value: item,
                enumerable: true,
                configurable: true,
                writable: true,
              });
          }
          appearance[key] = map;
        } else c.add(path, "不支持的配色字段，请使用兼容版本导出");
      }
      result.appearance = appearance;
    }
  }
  return result;
}

/**
 * 校验并规整一份拓扑 JSON。
 * 入参可以是对象，也可以是 JSON 文本。
 */
export function parseTopology(
  input: unknown,
  options?: { allowInvalidConfig?: boolean },
): ParseResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, topology: null, errors: [{ path: "", message: "不是合法的 JSON 文本" }] };
    }
  }
  const c = new Collector(options?.allowInvalidConfig);
  if (!isObject(raw)) {
    return { ok: false, topology: null, errors: [{ path: "", message: "拓扑必须是一个对象" }] };
  }

  const version = raw.version;
  if (typeof version === "number" && version < 1)
    c.add("version", "不支持该旧版本，请使用版本 1 的网络图文件");
  if (typeof version !== "number" || !Number.isInteger(version)) {
    c.add("version", "version 必须是整数");
  } else if (version > TOPOLOGY_VERSION) {
    return {
      ok: false,
      topology: null,
      errors: [
        {
          path: "version",
          message: `版本高于支持：文件是 ${version}，本版本最高支持 ${TOPOLOGY_VERSION}`,
        },
      ],
    };
  }

  let name = "";
  if (typeof raw.name === "string") name = raw.name;
  else c.add("name", "name 必须是字符串");
  const viewport = readViewport(c, raw.viewport);

  const devicesRaw = raw.devices;
  const linksRaw = raw.links;
  if (!Array.isArray(devicesRaw)) c.add("devices", "devices 必须是数组");
  if (!Array.isArray(linksRaw)) c.add("links", "links 必须是数组");
  if (!Array.isArray(devicesRaw) || !Array.isArray(linksRaw)) {
    return { ok: false, topology: null, errors: c.errors };
  }

  const devices: Device[] = [];
  devicesRaw.forEach((d, i) => {
    const device = readDevice(c, d, i);
    if (device) devices.push(device);
  });
  const links = linksRaw.map((l, i) => readLink(c, l, i));

  if (devices.length === devicesRaw.length) checkReferences(c, devices, links);
  const presentation = readPresentation(c, raw, devices, links);

  if (!c.ok) return { ok: false, topology: null, errors: c.errors };
  return {
    ok: true,
    topology: { version: TOPOLOGY_VERSION, name, viewport, devices, links, ...presentation },
    errors: [],
    warnings: c.warnings,
  };
}
