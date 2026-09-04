/** 测试专用：加载 fixture、拼小拓扑。不从包根导出 */

import minimalJson from "../../fixtures/minimal.json";
import { createDevice, createEmptyTopology } from "../model/defaults";
import type { Device, DeviceType, Link, Position, Topology } from "../model/topology";

/** fixture 原文（只读，测试里不要改） */
export const MINIMAL_RAW: unknown = minimalJson;

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 第 1 节示例拓扑的一份可修改副本 */
export function minimalTopology(): Topology {
  return clone(minimalJson) as unknown as Topology;
}

export const PC1 = "d_pc1";
export const R1 = "d_r1";
export const INET = "d_inet";

export function device(topology: Topology, deviceId: string): Device {
  const found = topology.devices.find((d) => d.id === deviceId);
  if (!found) throw new Error(`拓扑里没有设备 ${deviceId}`);
  return found;
}

export function portIdOf(topology: Topology, deviceId: string, portName: string): string {
  const port = device(topology, deviceId).ports.find((p) => p.name === portName);
  if (!port) throw new Error(`设备 ${deviceId} 没有端口 ${portName}`);
  return port.id;
}

export function macOf(topology: Topology, deviceId: string, portName: string): string {
  const port = device(topology, deviceId).ports.find((p) => p.name === portName);
  if (!port) throw new Error(`设备 ${deviceId} 没有端口 ${portName}`);
  return port.mac;
}

/** 拆掉一根线（两端 linkId 置空） */
export function unplug(topology: Topology, linkId: string): void {
  topology.links = topology.links.filter((l) => l.id !== linkId);
  for (const d of topology.devices) {
    for (const p of d.ports) if (p.linkId === linkId) p.linkId = null;
  }
}

/** 便于搭小拓扑：加设备并返回它 */
export function addDevice(
  topology: Topology,
  type: DeviceType,
  position: Position = { x: 0, y: 0 },
): Device {
  const created = createDevice(type, position, topology);
  topology.devices.push(created);
  return created;
}

let linkSeq = 0;

/** 便于搭小拓扑：按端口名连线 */
export function connect(
  topology: Topology,
  aDeviceId: string,
  aPortName: string,
  bDeviceId: string,
  bPortName: string,
): Link {
  linkSeq += 1;
  const id = `l_t${linkSeq}`;
  const aPortId = portIdOf(topology, aDeviceId, aPortName);
  const bPortId = portIdOf(topology, bDeviceId, bPortName);
  const link: Link = {
    id,
    a: { deviceId: aDeviceId, portId: aPortId },
    b: { deviceId: bDeviceId, portId: bPortId },
  };
  topology.links.push(link);
  for (const d of topology.devices) {
    for (const p of d.ports) {
      if (p.id === aPortId || p.id === bPortId) p.linkId = id;
    }
  }
  return link;
}

export function emptyTopology(name = "测试拓扑"): Topology {
  return createEmptyTopology(name);
}

/** 电脑手动配置 */
export function setStatic(
  topology: Topology,
  deviceId: string,
  ip: string,
  mask: string,
  gateway = "",
  dns = "",
): void {
  const d = device(topology, deviceId);
  if (d.type !== "pc") throw new Error("不是电脑");
  d.config = { addressMode: "static", ip, mask, gateway, dns };
}
