import type { Device, Runtime } from "../../engine";
import { isCgnat, leaseOf, prefixOf, vlansOfDevice } from "../../engine";

/** 节点第二行文字（CP2 第 5 节的节点表） */
export function nodeSubtitle(device: Device, runtime: Runtime): string | undefined {
  if (device.type === "pc") {
    if (device.config.addressMode === "dhcp") {
      const lease = leaseOf(runtime, device.id, "eth0");
      return lease?.status === "ok" && lease.ip ? lease.ip : "未获取到地址";
    }
    return device.config.ip || "未获取到地址";
  }
  if (device.type === "router") {
    const extra = (device.config.vlans ?? []).length;
    return `LAN ${device.config.lan.ip}${extra > 0 ? ` +${extra} VLAN` : ""}`;
  }
  if (device.type === "internet") {
    const access = device.config.access;
    let line = `${access.ip}/${prefixOf(access.mask)}`;
    if (access.mode === "pppoe") line += " · 拨号";
    if (isCgnat(access.ip)) line += " · 内网";
    return line;
  }
  if (device.type === "switch") {
    return `${device.ports.length} 口 · VLAN ${vlansOfDevice(device).join(",")}`;
  }
  if (device.type === "ap") return device.config.ssid;
  if (device.type === "modem") {
    return device.config.mode === "bridge" ? "桥接" : `路由 ${device.config.lan.ip}`;
  }
  return undefined;
}
