// 引擎适配层：网页只从这里 import 引擎能力，另加几个界面用的小工具。
export * from "@virtual-net/engine";
export * from "./cp2";
export * from "./sample";

import {
  createEmptyTopology,
  ensureSparePort,
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

/**
 * 引擎的拓扑操作（`model/ops.ts`）是就地改的，store 里的拓扑是不可变的，
 * 所以统一先深拷贝再改，返回新对象。
 */
export function mutateTopology(topology: Topology, run: (draft: Topology) => boolean): Topology {
  const draft = structuredClone(topology);
  return run(draft) ? draft : topology;
}

/** 互联网 `portN` 与 AP `wlanN` 始终恰好留一个空闲口 */
export function ensureSparePorts(topology: Topology): Topology {
  return mutateTopology(topology, (draft) => {
    let changed = false;
    for (const device of draft.devices) {
      if (device.type !== "internet" && device.type !== "ap") continue;
      if (ensureSparePort(draft, device.id)) changed = true;
    }
    return changed;
  });
}
