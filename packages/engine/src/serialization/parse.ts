/** 拓扑 JSON 的结构校验与版本检查 */

import type {
  Device,
  DeviceType,
  InternetConfig,
  InternetTarget,
  Link,
  LinkEnd,
  PcConfig,
  Port,
  Position,
  RouterConfig,
  Topology,
  Viewport,
} from "../model/topology";
import { TOPOLOGY_VERSION } from "../model/topology";

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
  | { ok: true; topology: Topology; errors: [] }
  | { ok: false; topology: null; errors: ParseError[] };

/** 每种设备类型的端口名规范 */
const PORT_NAME_RULES: Record<DeviceType, (names: string[]) => string | null> = {
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
};

const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  readonly errors: ParseError[] = [];
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
  return {
    x: readNumber(c, value, "x", "viewport"),
    y: readNumber(c, value, "y", "viewport"),
    zoom: readNumber(c, value, "zoom", "viewport"),
  };
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
  if ("vlan" in value) port.vlan = value.vlan;
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
    ip: readString(c, value, "ip", path),
    mask: readString(c, value, "mask", path),
    gateway: readString(c, value, "gateway", path),
    dns: readString(c, value, "dns", path),
  };
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
  const lanRaw = value.lan;
  let lan = fallback.lan;
  if (isObject(lanRaw)) {
    lan = {
      ip: readString(c, lanRaw, "ip", `${path}.lan`),
      mask: readString(c, lanRaw, "mask", `${path}.lan`),
    };
  } else {
    c.add(`${path}.lan`, "lan 必须是对象");
  }
  const dhcpRaw = value.dhcp;
  let dhcp = fallback.dhcp;
  if (isObject(dhcpRaw)) {
    dhcp = {
      enabled: readBoolean(c, dhcpRaw, "enabled", `${path}.dhcp`),
      rangeStart: readString(c, dhcpRaw, "rangeStart", `${path}.dhcp`),
      rangeEnd: readString(c, dhcpRaw, "rangeEnd", `${path}.dhcp`),
      leaseHours: readNumber(c, dhcpRaw, "leaseHours", `${path}.dhcp`),
    };
  } else {
    c.add(`${path}.dhcp`, "dhcp 必须是对象");
  }
  const wanRaw = value.wan;
  if (!isObject(wanRaw) || wanRaw.mode !== "dhcp") {
    c.add(`${path}.wan`, "wan.mode 本版本只支持 dhcp");
  }
  return { lan, dhcp, wan: { mode: "dhcp" }, nat: readBoolean(c, value, "nat", path) };
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
  let access = fallbackAccess;
  if (isObject(accessRaw)) {
    access = {
      ip: readString(c, accessRaw, "ip", `${path}.access`),
      mask: readString(c, accessRaw, "mask", `${path}.access`),
      poolStart: readString(c, accessRaw, "poolStart", `${path}.access`),
      poolEnd: readString(c, accessRaw, "poolEnd", `${path}.access`),
      dns: readString(c, accessRaw, "dns", `${path}.access`),
    };
  } else {
    c.add(`${path}.access`, "access 必须是对象");
  }
  const targetsRaw = value.targets;
  if (!Array.isArray(targetsRaw)) {
    c.add(`${path}.targets`, "targets 必须是数组");
    return { access, targets: [] };
  }
  return {
    access,
    targets: targetsRaw.map((t, i) => readTarget(c, t, `${path}.targets[${i}]`)),
  };
}

function readDevice(c: Collector, value: unknown, index: number): Device | null {
  const path = `devices[${index}]`;
  if (!isObject(value)) {
    c.add(path, "设备必须是对象");
    return null;
  }
  const type = value.type;
  if (type !== "pc" && type !== "router" && type !== "internet") {
    c.add(`${path}.type`, `设备类型 "${String(type)}" 不认识`);
    return null;
  }
  const id = readString(c, value, "id", path);
  const name = readString(c, value, "name", path);
  const position = readPosition(c, value.position, `${path}.position`);
  const portsRaw = value.ports;
  if (!Array.isArray(portsRaw)) {
    c.add(`${path}.ports`, "ports 必须是数组", { deviceId: id });
    return null;
  }
  const ports = portsRaw.map((p, i) => readPort(c, p, `${path}.ports[${i}]`));
  const nameProblem = PORT_NAME_RULES[type](ports.map((p) => p.name));
  if (nameProblem) c.add(`${path}.ports`, nameProblem, { deviceId: id });
  const base = { id, name, position, ports };
  if (type === "pc") return { ...base, type, config: readPcConfig(c, value.config, path) };
  if (type === "router") return { ...base, type, config: readRouterConfig(c, value.config, path) };
  return { ...base, type, config: readInternetConfig(c, value.config, path) };
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
  };
}

function checkReferences(c: Collector, devices: Device[], links: Link[]): void {
  const deviceIds = new Set<string>();
  const portOwner = new Map<string, string>();
  const macs = new Map<string, string>();
  devices.forEach((device, i) => {
    if (deviceIds.has(device.id)) c.add(`devices[${i}].id`, `设备 id "${device.id}" 重复`);
    deviceIds.add(device.id);
    device.ports.forEach((port, j) => {
      if (portOwner.has(port.id))
        c.add(`devices[${i}].ports[${j}].id`, `端口 id "${port.id}" 重复`);
      portOwner.set(port.id, device.id);
      const seen = macs.get(port.mac.toLowerCase());
      if (seen) c.add(`devices[${i}].ports[${j}].mac`, `MAC "${port.mac}" 重复`);
      else macs.set(port.mac.toLowerCase(), port.id);
    });
  });

  const linkIds = new Set<string>();
  for (const [i, link] of links.entries()) {
    const path = `links[${i}]`;
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
    }
  }
}

/**
 * 校验并规整一份拓扑 JSON。
 * 入参可以是对象，也可以是 JSON 文本。
 */
export function parseTopology(input: unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, topology: null, errors: [{ path: "", message: "不是合法的 JSON 文本" }] };
    }
  }
  const c = new Collector();
  if (!isObject(raw)) {
    return { ok: false, topology: null, errors: [{ path: "", message: "拓扑必须是一个对象" }] };
  }

  const version = raw.version;
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

  if (!c.ok) return { ok: false, topology: null, errors: c.errors };
  return {
    ok: true,
    topology: { version: TOPOLOGY_VERSION, name, viewport, devices, links },
    errors: [],
  };
}
