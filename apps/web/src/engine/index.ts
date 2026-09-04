// 引擎适配层：网页只从这里 import 引擎能力，另加几个界面用的小工具。
export * from "@virtual-net/engine";

import {
  createEmptyTopology,
  createInternetPort,
  type Lease,
  type Runtime,
  type Topology,
} from "@virtual-net/engine";

export function emptyTopology(): Topology {
  return createEmptyTopology();
}

/** 某台设备某个接口的租约 */
export function leaseOf(runtime: Runtime, deviceId: string, ifaceName: string): Lease | null {
  return runtime.leases.find((l) => l.deviceId === deviceId && l.ifaceName === ifaceName) ?? null;
}

/** 互联网端口始终多留一个空闲口：不够就补一个，多了就从尾部收掉 */
export function ensureInternetSparePort(topology: Topology): Topology {
  let changed = false;
  const devices = topology.devices.map((device) => {
    if (device.type !== "internet") return device;
    const free = device.ports.filter((p) => p.linkId === null);
    if (free.length === 1) return device;
    if (free.length === 0) {
      const port = createInternetPort(topology, device.id);
      if (!port) return device;
      changed = true;
      return { ...device, ports: [...device.ports, port] };
    }
    const ports = [...device.ports];
    while (ports.length > 1 && ports.filter((p) => p.linkId === null).length > 1) {
      const last = ports[ports.length - 1];
      if (!last || last.linkId !== null) break;
      ports.pop();
      changed = true;
    }
    return { ...device, ports };
  });
  return changed ? { ...topology, devices } : topology;
}
