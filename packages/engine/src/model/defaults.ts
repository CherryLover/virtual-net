/** 默认值工厂：空拓扑、创建设备、创建连线、互联网补空闲口 */

import type {
  Device,
  DeviceType,
  InternetConfig,
  Link,
  LinkEnd,
  PcConfig,
  Port,
  Position,
  RouterConfig,
  Topology,
} from "./topology";
import { TOPOLOGY_VERSION } from "./topology";

const MAC_PREFIX = "02:00:00:00:00:";
const FIRST_MAC_VALUE = 1;

let idCounter = 0;

function makeId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}${idCounter.toString(36)}${random}`;
}

function macValue(mac: string): number {
  const hex = mac.split(":").join("");
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? 0 : n;
}

function formatMac(value: number): string {
  const hex = value.toString(16).padStart(12, "0");
  const pairs = hex.match(/.{2}/g) ?? [];
  return pairs.join(":");
}

/** 拓扑内最大 MAC + 1；空拓扑从 02:00:00:00:00:01 起 */
export function nextMac(topology: Topology): string {
  const base = macValue(`${MAC_PREFIX}00`);
  let max = base + FIRST_MAC_VALUE - 1;
  for (const device of topology.devices) {
    for (const port of device.ports) {
      const value = macValue(port.mac);
      if (value > max) max = value;
    }
  }
  return formatMac(max + 1);
}

export function createEmptyTopology(name = "未命名拓扑"): Topology {
  return {
    version: TOPOLOGY_VERSION,
    name,
    viewport: { x: 0, y: 0, zoom: 1 },
    devices: [],
    links: [],
  };
}

export function defaultPcConfig(): PcConfig {
  return { addressMode: "dhcp", ip: "", mask: "", gateway: "", dns: "" };
}

export function defaultRouterConfig(): RouterConfig {
  return {
    lan: { ip: "192.168.1.1", mask: "255.255.255.0" },
    dhcp: {
      enabled: true,
      rangeStart: "192.168.1.100",
      rangeEnd: "192.168.1.199",
      leaseHours: 24,
    },
    wan: { mode: "dhcp" },
    nat: true,
  };
}

export function defaultInternetConfig(): InternetConfig {
  return {
    access: {
      ip: "203.0.113.1",
      mask: "255.255.255.0",
      poolStart: "203.0.113.2",
      poolEnd: "203.0.113.254",
      dns: "8.8.8.8",
    },
    targets: [
      {
        id: "t_gdns",
        domain: "dns.google",
        ip: "8.8.8.8",
        region: "overseas",
        dnsServer: true,
        reachable: true,
      },
      {
        id: "t_baidu",
        domain: "www.baidu.com",
        ip: "110.242.68.66",
        region: "cn",
        dnsServer: false,
        reachable: true,
      },
      {
        id: "t_google",
        domain: "www.google.com",
        ip: "142.250.72.14",
        region: "overseas",
        dnsServer: false,
        reachable: true,
      },
    ],
  };
}

const PORT_NAMES: Record<DeviceType, string[]> = {
  pc: ["eth0"],
  router: ["wan", "lan1", "lan2", "lan3", "lan4"],
  internet: ["port1"],
};

function nextName(topology: Topology, type: DeviceType): string {
  const count = topology.devices.filter((d) => d.type === type).length;
  if (type === "internet") return count === 0 ? "互联网" : `互联网${count + 1}`;
  const label = type === "pc" ? "电脑" : "路由器";
  return `${label}${count + 1}`;
}

function makePorts(topology: Topology, names: string[]): Port[] {
  const ports: Port[] = [];
  let next = macValue(nextMac(topology));
  for (const name of names) {
    ports.push({ id: makeId("p_"), name, mac: formatMac(next), linkId: null });
    next += 1;
  }
  return ports;
}

/** 在 `topology` 语境下创建一台设备（不修改 topology） */
export function createDevice(type: DeviceType, position: Position, topology: Topology): Device {
  const ports = makePorts(topology, PORT_NAMES[type]);
  const base = { id: makeId("d_"), name: nextName(topology, type), position, ports };
  if (type === "pc") return { ...base, type: "pc", config: defaultPcConfig() };
  if (type === "router") return { ...base, type: "router", config: defaultRouterConfig() };
  return { ...base, type: "internet", config: defaultInternetConfig() };
}

/** 互联网追加一个空闲端口（保证始终多留一个空闲口） */
export function createInternetPort(topology: Topology, deviceId: string): Port | null {
  const device = topology.devices.find((d) => d.id === deviceId);
  if (device?.type !== "internet") return null;
  const index = device.ports.length + 1;
  return { id: makeId("p_"), name: `port${index}`, mac: nextMac(topology), linkId: null };
}

export function createLink(a: LinkEnd, b: LinkEnd): Link {
  return { id: makeId("l_"), a, b };
}
