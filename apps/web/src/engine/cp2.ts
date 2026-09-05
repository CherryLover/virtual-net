/**
 * CP2 界面用的小工具：设备栏顺序、互联网接入预设、几个纯展示的格式化函数。
 * 数据模型与拓扑操作都在引擎里（`model/vlan.ts`、`model/ops.ts`），这里不重复实现。
 */
import type { DeviceType, InternetAccess, Topology } from "@virtual-net/engine";

/** 设备栏卡片顺序（CP2 第 5 节） */
export const DEVICE_TYPES: DeviceType[] = ["pc", "switch", "ap", "router", "modem", "internet"];

export const DEVICE_LABELS: Record<DeviceType, string> = {
  pc: "电脑",
  switch: "交换机",
  ap: "无线 AP",
  router: "路由器",
  modem: "光猫",
  internet: "互联网",
};

/** 互联网接入段的两组预设（CP2 关键设计 1） */
export const ACCESS_PRESETS: { key: string; label: string; value: Omit<InternetAccess, "mode"> }[] =
  [
    {
      key: "public",
      label: "公网",
      value: {
        ip: "203.0.113.1",
        mask: "255.255.255.0",
        poolStart: "203.0.113.2",
        poolEnd: "203.0.113.254",
        dns: "8.8.8.8",
      },
    },
    {
      key: "cgnat",
      label: "运营商内网",
      value: {
        ip: "100.64.0.1",
        mask: "255.192.0.0",
        poolStart: "100.64.0.2",
        poolEnd: "100.64.0.254",
        dns: "8.8.8.8",
      },
    },
  ];

/** 掩码转前缀长度，节点第二行显示 `203.0.113.1/24` 用 */
export function prefixOf(mask: string): number {
  const parts = mask.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return 0;
  let bits = 0;
  for (const part of parts) bits += ((part >>> 0).toString(2).match(/1/g) ?? []).length;
  return bits;
}

/** 100.64.0.0/10 = 运营商内网 */
export function isCgnat(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return false;
  return a === 100 && b >= 64 && b <= 127;
}

/** 某端口的对端描述，例如 `电脑1 eth0`；没连线返回空串 */
export function peerLabel(topology: Topology, portId: string): string {
  const found = topology.devices
    .flatMap((d) => d.ports.map((p) => ({ device: d, port: p })))
    .find((x) => x.port.id === portId);
  if (!found?.port.linkId) return "";
  const link = topology.links.find((l) => l.id === found.port.linkId);
  if (!link) return "";
  const other = link.a.portId === portId ? link.b : link.a;
  const device = topology.devices.find((d) => d.id === other.deviceId);
  if (!device) return "";
  return `${device.name} ${device.ports.find((p) => p.id === other.portId)?.name ?? ""}`.trim();
}
