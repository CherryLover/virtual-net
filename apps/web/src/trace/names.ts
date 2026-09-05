/** 解释文案要的名字表：deviceId → 设备名、portId → 端口名 */

import type { Topology } from "@virtual-net/engine";
import { deviceName, portName } from "@virtual-net/engine";

export interface TraceNames {
  device(deviceId: string): string;
  port(portId: string): string;
}

/** 从拓扑现造一份；找不到时返回原 id，不抛错 */
export function createNames(topology: Topology): TraceNames {
  return {
    device: (deviceId) => deviceName(topology, deviceId),
    port: (portId) => portName(topology, portId),
  };
}

/** 什么都不知道时的兜底，直接回 id */
export const RAW_NAMES: TraceNames = {
  device: (deviceId) => deviceId,
  port: (portId) => portId,
};

/** store 里存的名字快照：设备被删掉之后逐跳列表还要显示得出名字（CP3 4.2） */
export interface NameSnapshot {
  devices: Record<string, string>;
  ports: Record<string, string>;
}

/** 把快照包成函数式名字表；查不到时返回 id 本身 */
export function namesFromSnapshot(snapshot: NameSnapshot): TraceNames {
  return {
    device: (deviceId) => snapshot.devices[deviceId] ?? deviceId,
    port: (portId) => snapshot.ports[portId] ?? portId,
  };
}

/** 从拓扑现拍一份快照 */
export function snapshotNames(topology: Topology): NameSnapshot {
  const devices: Record<string, string> = {};
  const ports: Record<string, string> = {};
  for (const device of topology.devices) {
    devices[device.id] = device.name;
    for (const port of device.ports) ports[port.id] = port.name;
  }
  return { devices, ports };
}
