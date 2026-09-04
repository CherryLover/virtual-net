/** 三层接口枚举：pc 的 eth0、router 的 br-lan / wan、internet 的每个 portN */

import type { Device, Topology } from "../../model/topology";
import type { L3Interface } from "./types";

export const BRIDGE_LAN = "br-lan";

function ifaceKey(deviceId: string, name: string): string {
  return `${deviceId}/${name}`;
}

/** 建接口骨架（地址留空，DHCP 之后再填） */
export function listInterfaces(topology: Topology): L3Interface[] {
  const out: L3Interface[] = [];
  for (const device of topology.devices) {
    for (const iface of interfacesOfDevice(device)) out.push(iface);
  }
  return out;
}

function interfacesOfDevice(device: Device): L3Interface[] {
  if (device.type === "pc") {
    const eth0 = device.ports[0];
    if (!eth0) return [];
    return [
      {
        key: ifaceKey(device.id, "eth0"),
        deviceId: device.id,
        name: "eth0",
        portIds: [eth0.id],
        mac: eth0.mac,
        ip: "",
        mask: "",
      },
    ];
  }
  if (device.type === "router") {
    const wan = device.ports.find((p) => p.name === "wan");
    const lans = device.ports.filter((p) => p.name.startsWith("lan"));
    const out: L3Interface[] = [];
    if (wan) {
      out.push({
        key: ifaceKey(device.id, "wan"),
        deviceId: device.id,
        name: "wan",
        portIds: [wan.id],
        mac: wan.mac,
        ip: "",
        mask: "",
      });
    }
    const first = lans[0];
    if (first) {
      out.push({
        key: ifaceKey(device.id, BRIDGE_LAN),
        deviceId: device.id,
        name: BRIDGE_LAN,
        portIds: lans.map((p) => p.id),
        // 网桥 MAC 取 lan1
        mac: first.mac,
        ip: "",
        mask: "",
      });
    }
    return out;
  }
  return device.ports.map((port) => ({
    key: ifaceKey(device.id, port.name),
    deviceId: device.id,
    name: port.name,
    portIds: [port.id],
    mac: port.mac,
    ip: "",
    mask: "",
  }));
}

/** 静态配置里写死的地址（DHCP 之前就已知的占用） */
export function staticAddressOf(
  device: Device,
  iface: L3Interface,
): { ip: string; mask: string } | null {
  if (device.type === "pc") {
    if (device.config.addressMode !== "static") return null;
    if (!device.config.ip) return null;
    return { ip: device.config.ip, mask: device.config.mask };
  }
  if (device.type === "router") {
    if (iface.name !== BRIDGE_LAN) return null;
    return { ip: device.config.lan.ip, mask: device.config.lan.mask };
  }
  return { ip: device.config.access.ip, mask: device.config.access.mask };
}
