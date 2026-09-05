/** 端口 VLAN 配置（CP2 关键设计 1）：access / trunk、PVID、放行列表 */

import type { Device, DeviceType, Port } from "./topology";

export interface AccessVlan {
  mode: "access";
  pvid: number;
}

export interface TrunkVlan {
  mode: "trunk";
  allowed: number[];
  native: number;
}

export type PortVlan = AccessVlan | TrunkVlan;

export const MIN_VLAN_ID = 1;
export const MAX_VLAN_ID = 4094;
export const DEFAULT_VLAN = 1;

/** 缺省的端口 VLAN 配置：access VLAN 1 */
export function defaultPortVlan(): AccessVlan {
  return { mode: "access", pvid: DEFAULT_VLAN };
}

export function isVlanId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_VLAN_ID &&
    value <= MAX_VLAN_ID
  );
}

/** 这个端口允许写 `vlan` 字段吗：交换机 portN 与路由器 lanN */
export function portSupportsVlan(type: DeviceType, portName: string): boolean {
  if (type === "switch") return /^port\d+$/.test(portName);
  if (type === "router") return /^lan\d+$/.test(portName);
  return false;
}

/** 端口的 VLAN 配置，字段不存在时回退到 access 1 */
export function vlanOf(port: Port): PortVlan {
  const raw = port.vlan;
  if (!raw || typeof raw !== "object") return defaultPortVlan();
  const value = raw as Partial<AccessVlan> & Partial<TrunkVlan>;
  if (value.mode === "trunk") {
    const allowed = Array.isArray(value.allowed) ? value.allowed.filter(isVlanId) : [];
    const native = isVlanId(value.native) ? value.native : DEFAULT_VLAN;
    return { mode: "trunk", allowed: normalizeAllowed(allowed), native };
  }
  return { mode: "access", pvid: isVlanId(value.pvid) ? value.pvid : DEFAULT_VLAN };
}

/** 不带标签的帧进这个口时归入哪个 VLAN */
export function untaggedVlanOf(vlan: PortVlan): number {
  return vlan.mode === "access" ? vlan.pvid : vlan.native;
}

/** 这个口上「有成员」的 VLAN 列表（access 是 PVID；trunk 是 native + 放行列表） */
export function vlanMembership(vlan: PortVlan): number[] {
  if (vlan.mode === "access") return [vlan.pvid];
  return normalizeAllowed([vlan.native, ...vlan.allowed]);
}

/** trunk 是否放行某个 VLAN（native 总是放行） */
export function trunkAllows(vlan: TrunkVlan, id: number): boolean {
  return id === vlan.native || vlan.allowed.includes(id);
}

/** 去重升序 */
export function normalizeAllowed(ids: number[]): number[] {
  return [...new Set(ids.filter(isVlanId))].sort((a, b) => a - b);
}

export type AllowedListResult =
  | { ok: true; ids: number[] }
  | { ok: false; ids: never[]; message: string };

/** 解析表单里的放行列表文本，如 `"10, 20,20"` → `[10, 20]` */
export function parseAllowedList(text: string): AllowedListResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, ids: [] };
  const parts = trimmed.split(/[,，\s]+/).filter((p) => p.length > 0);
  const ids: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { ok: false, ids: [], message: `"${part}" 不是 VLAN 号` };
    }
    const id = Number(part);
    if (!isVlanId(id)) {
      return {
        ok: false,
        ids: [],
        message: `VLAN ${id} 超出范围，只能是 ${MIN_VLAN_ID}–${MAX_VLAN_ID}`,
      };
    }
    ids.push(id);
  }
  return { ok: true, ids: normalizeAllowed(ids) };
}

export function formatAllowedList(ids: number[]): string {
  return normalizeAllowed(ids).join(",");
}

/** 一台设备上出现过的 VLAN（节点第二行 `8 口 · VLAN 1,10,20` 用） */
export function vlansOfDevice(device: Device): number[] {
  const ids: number[] = [];
  for (const port of device.ports) {
    if (!portSupportsVlan(device.type, port.name)) continue;
    ids.push(...vlanMembership(vlanOf(port)));
  }
  return normalizeAllowed(ids);
}
