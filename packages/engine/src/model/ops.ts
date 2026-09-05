/** 拓扑上的模型操作：改口数、改端口 VLAN、增删 VLAN 子接口、维护空闲口 */

import { createPort, SWITCH_MAX_PORTS, SWITCH_MIN_PORTS } from "./defaults";
import type { Device, Port, RouterDevice, RouterVlan, Topology } from "./topology";
import { isVlanId, MAX_VLAN_ID, type PortVlan } from "./vlan";

export type OpResult = { ok: true } | { ok: false; message: string };

function deviceOf(topology: Topology, deviceId: string): Device | null {
  return topology.devices.find((d) => d.id === deviceId) ?? null;
}

/**
 * 改交换机口数。改大时在末尾追加 `portN`，改小时删末尾的口；
 * 末尾要删的口上有连线则整体拒绝，不做任何修改。
 */
export function setPortCount(topology: Topology, deviceId: string, count: number): OpResult {
  const device = deviceOf(topology, deviceId);
  if (device?.type !== "switch") return { ok: false, message: "只有交换机能改口数" };
  if (!Number.isInteger(count) || count < SWITCH_MIN_PORTS || count > SWITCH_MAX_PORTS) {
    return { ok: false, message: `口数只能是 ${SWITCH_MIN_PORTS}–${SWITCH_MAX_PORTS}` };
  }
  const current = device.ports.length;
  if (count === current) {
    device.config.portCount = count;
    return { ok: true };
  }
  if (count < current) {
    const removed = device.ports.slice(count);
    const linked = removed.find((p) => p.linkId);
    if (linked) return { ok: false, message: `${linked.name} 有连线` };
    device.ports = device.ports.slice(0, count);
    device.config.portCount = count;
    return { ok: true };
  }
  for (let i = current; i < count; i += 1) {
    device.ports.push(createPort(topology, `port${i + 1}`, true));
  }
  device.config.portCount = count;
  return { ok: true };
}

/** 批量设置端口 VLAN（表单「批量设置」用） */
export function setPortVlan(topology: Topology, portIds: string[], vlan: PortVlan): OpResult {
  const wanted = new Set(portIds);
  let touched = 0;
  for (const device of topology.devices) {
    for (const port of device.ports) {
      if (!wanted.has(port.id)) continue;
      port.vlan = vlan.mode === "access" ? { ...vlan } : { ...vlan, allowed: [...vlan.allowed] };
      touched += 1;
    }
  }
  return touched === wanted.size ? { ok: true } : { ok: false, message: "有端口不存在" };
}

/** 新增 VLAN 子接口用的默认值：id 取最小未用值，网段 192.168.{id}.1/24 */
export function nextRouterVlan(router: RouterDevice): RouterVlan {
  const used = new Set((router.config.vlans ?? []).map((v) => v.id));
  let id = 2;
  while (used.has(id) && id < MAX_VLAN_ID) id += 1;
  return {
    id,
    ip: `192.168.${id % 256}.1`,
    mask: "255.255.255.0",
    dhcp: {
      enabled: true,
      rangeStart: `192.168.${id % 256}.100`,
      rangeEnd: `192.168.${id % 256}.199`,
      leaseHours: 24,
    },
  };
}

export function addRouterVlan(router: RouterDevice, vlan?: RouterVlan): OpResult {
  const added = vlan ?? nextRouterVlan(router);
  if (!isVlanId(added.id) || added.id === 1) {
    return { ok: false, message: "VLAN 号只能是 2–4094" };
  }
  const list = router.config.vlans ?? [];
  if (list.some((v) => v.id === added.id)) return { ok: false, message: `VLAN ${added.id} 已存在` };
  router.config.vlans = [...list, added];
  return { ok: true };
}

export function removeRouterVlan(router: RouterDevice, id: number): OpResult {
  const list = router.config.vlans ?? [];
  if (!list.some((v) => v.id === id)) return { ok: false, message: `没有 VLAN ${id}` };
  router.config.vlans = list.filter((v) => v.id !== id);
  return { ok: true };
}

/** 互联网 portN / AP wlanN：始终恰好留一个空闲口 */
export function ensureSparePort(topology: Topology, deviceId: string): boolean {
  const device = deviceOf(topology, deviceId);
  if (!device) return false;
  const prefix = device.type === "internet" ? "port" : device.type === "ap" ? "wlan" : null;
  if (!prefix) return false;

  const isClient = (port: Port): boolean => port.name.startsWith(prefix);
  const clients = device.ports.filter(isClient);
  let changed = false;

  // 末尾多余的空闲口收回，只留一个
  while (clients.length > 1) {
    const last = clients[clients.length - 1];
    const prev = clients[clients.length - 2];
    if (!last || !prev || last.linkId || prev.linkId) break;
    device.ports = device.ports.filter((p) => p.id !== last.id);
    clients.pop();
    changed = true;
  }
  const tail = clients[clients.length - 1];
  if (!tail || tail.linkId) {
    device.ports.push(createPort(topology, `${prefix}${clients.length + 1}`));
    changed = true;
  }
  return changed;
}
