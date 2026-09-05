/** 默认值工厂：空拓扑、创建设备、创建连线、互联网补空闲口 */

import type {
  ApConfig,
  Device,
  DeviceType,
  InternetConfig,
  Link,
  LinkEnd,
  ModemConfig,
  PcConfig,
  Port,
  Position,
  RouterConfig,
  SwitchConfig,
  Topology,
} from "./topology";
import { TOPOLOGY_VERSION } from "./topology";
import { defaultPortVlan } from "./vlan";

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
    vlans: [],
  };
}

export const SWITCH_DEFAULT_PORTS = 8;
export const SWITCH_MIN_PORTS = 4;
export const SWITCH_MAX_PORTS = 48;

export function defaultSwitchConfig(): SwitchConfig {
  return { portCount: SWITCH_DEFAULT_PORTS };
}

export function defaultApConfig(): ApConfig {
  return { ssid: "Home-WiFi" };
}

export function defaultModemConfig(): ModemConfig {
  return {
    mode: "bridge",
    wan: { mode: "auto" },
    lan: { ip: "192.168.100.1", mask: "255.255.255.0" },
    dhcp: {
      enabled: true,
      rangeStart: "192.168.100.100",
      rangeEnd: "192.168.100.199",
      leaseHours: 24,
    },
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
      mode: "dhcp",
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
  switch: Array.from({ length: SWITCH_DEFAULT_PORTS }, (_, i) => `port${i + 1}`),
  ap: ["uplink", "wlan1"],
  modem: ["wan", "lan1"],
};

const DEVICE_LABELS: Record<DeviceType, string> = {
  pc: "电脑",
  router: "路由器",
  internet: "互联网",
  switch: "交换机",
  ap: "AP",
  modem: "光猫",
};

function nextName(topology: Topology, type: DeviceType): string {
  const count = topology.devices.filter((d) => d.type === type).length;
  if (type === "internet") return count === 0 ? "互联网" : `互联网${count + 1}`;
  return `${DEVICE_LABELS[type]}${count + 1}`;
}

function makePorts(topology: Topology, type: DeviceType, names: string[]): Port[] {
  const ports: Port[] = [];
  let next = macValue(nextMac(topology));
  for (const name of names) {
    const port: Port = { id: makeId("p_"), name, mac: formatMac(next), linkId: null };
    if (type === "switch") port.vlan = defaultPortVlan();
    ports.push(port);
    next += 1;
  }
  return ports;
}

/** 在 `topology` 语境下创建一台设备（不修改 topology） */
export function createDevice(type: DeviceType, position: Position, topology: Topology): Device {
  const ports = makePorts(topology, type, PORT_NAMES[type]);
  const base = { id: makeId("d_"), name: nextName(topology, type), position, ports };
  if (type === "pc") return { ...base, type: "pc", config: defaultPcConfig() };
  if (type === "router") return { ...base, type: "router", config: defaultRouterConfig() };
  if (type === "switch") return { ...base, type: "switch", config: defaultSwitchConfig() };
  if (type === "ap") return { ...base, type: "ap", config: defaultApConfig() };
  if (type === "modem") return { ...base, type: "modem", config: defaultModemConfig() };
  return { ...base, type: "internet", config: defaultInternetConfig() };
}

/** 追加一个端口（互联网 portN、AP wlanN、交换机 portN） */
export function createPort(topology: Topology, name: string, withVlan = false): Port {
  const port: Port = { id: makeId("p_"), name, mac: nextMac(topology), linkId: null };
  if (withVlan) port.vlan = defaultPortVlan();
  return port;
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
