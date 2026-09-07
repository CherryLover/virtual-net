/**
 * 三层接口枚举：pc 的 eth0、router 的 br-lan / br-lan.<id> / wan、
 * 路由模式光猫的 br-lan / wan、internet 的每个 portN。
 * 交换机、AP、桥接模式光猫没有三层接口。
 */

import type { Device, Topology } from "../../model/topology";
import { isHost, isL3Router } from "../../model/topology";
import { vlanMembership, vlanOf } from "../../model/vlan";
import type { L3Interface } from "./types";

export const BRIDGE_LAN = "br-lan";

/** VLAN 子接口名：`br-lan.10` */
export function subInterfaceName(vlanId: number): string {
  return `${BRIDGE_LAN}.${vlanId}`;
}

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
  if (isHost(device)) {
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
        vlan: null,
      },
    ];
  }
  if (device.type === "switch" || device.type === "ap" || device.type === "access-control")
    return [];
  if (device.type === "modem") {
    if (device.config.mode !== "route") return [];
    const out: L3Interface[] = [];
    const wan = device.ports.find((p) => p.name === "wan");
    const lan1 = device.ports.find((p) => p.name === "lan1");
    if (wan) {
      out.push({
        key: ifaceKey(device.id, "wan"),
        deviceId: device.id,
        name: "wan",
        portIds: [wan.id],
        mac: wan.mac,
        ip: "",
        mask: "",
        vlan: null,
      });
    }
    if (lan1) {
      out.push({
        key: ifaceKey(device.id, BRIDGE_LAN),
        deviceId: device.id,
        name: BRIDGE_LAN,
        portIds: [lan1.id],
        mac: lan1.mac,
        ip: "",
        mask: "",
        vlan: null,
      });
    }
    return out;
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
        vlan: null,
      });
    }
    const first = lans[0];
    if (!first) return out;
    // 所有 LAN 子接口共用 lan1 的 MAC；每个子接口挂在放行了该 VLAN 的 lanN 上
    const portsOf = (vlanId: number): string[] =>
      lans.filter((p) => vlanMembership(vlanOf(p)).includes(vlanId)).map((p) => p.id);
    out.push({
      key: ifaceKey(device.id, BRIDGE_LAN),
      deviceId: device.id,
      name: BRIDGE_LAN,
      portIds: portsOf(1),
      mac: first.mac,
      ip: "",
      mask: "",
      vlan: 1,
    });
    for (const vlan of device.config.vlans ?? []) {
      const name = subInterfaceName(vlan.id);
      out.push({
        key: ifaceKey(device.id, name),
        deviceId: device.id,
        name,
        portIds: portsOf(vlan.id),
        mac: first.mac,
        ip: "",
        mask: "",
        vlan: vlan.id,
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
    vlan: null,
  }));
}

/** 静态配置里写死的地址（DHCP 之前就已知的占用） */
export function staticAddressOf(
  device: Device,
  iface: L3Interface,
): { ip: string; mask: string } | null {
  if (isHost(device)) {
    if (device.config.addressMode !== "static") return null;
    if (!device.config.ip) return null;
    return { ip: device.config.ip, mask: device.config.mask };
  }
  if (device.type === "router") {
    if (iface.name === BRIDGE_LAN)
      return { ip: device.config.lan.ip, mask: device.config.lan.mask };
    const vlan = (device.config.vlans ?? []).find((v) => subInterfaceName(v.id) === iface.name);
    if (vlan) return { ip: vlan.ip, mask: vlan.mask };
    if (iface.name === "wan" && device.config.wan.mode === "static" && device.config.wan.static) {
      const value = device.config.wan.static;
      return { ip: value.ip, mask: value.mask };
    }
    return null;
  }
  if (device.type === "modem") {
    if (!isL3Router(device)) return null;
    if (iface.name !== BRIDGE_LAN) return null;
    return { ip: device.config.lan.ip, mask: device.config.lan.mask };
  }
  if (device.type === "internet") {
    return { ip: device.config.access.ip, mask: device.config.access.mask };
  }
  return null;
}

/** 一台三层设备的所有 LAN 侧子接口（br-lan 与 br-lan.<id>） */
export function lanInterfacesOf(interfaces: L3Interface[], deviceId: string): L3Interface[] {
  return interfaces.filter(
    (i) =>
      i.deviceId === deviceId && (i.name === BRIDGE_LAN || i.name.startsWith(`${BRIDGE_LAN}.`)),
  );
}
