/**
 * 首次打开时铺的示例拓扑：互联网 —(wan) 路由器 (lan1/lan2)— 两台电脑。
 * 设备与连线全部走引擎的 createDevice / createLink，id、MAC、默认配置
 * 与从设备栏拖出来的完全一致，不手写。
 */
import type { Device, DeviceType, LinkEnd, Position, Topology } from "@virtual-net/engine";
import { createDevice, createEmptyTopology, createLink } from "@virtual-net/engine";

export const SAMPLE_NAME = "示例网络";

/** 互联网在上、路由器居中、两台电脑在下并排；坐标对齐画布 16px 网格 */
const LAYOUT = {
  internet: { x: 352, y: 64 },
  router: { x: 352, y: 272 },
  pc1: { x: 160, y: 480 },
  pc2: { x: 544, y: 480 },
} satisfies Record<string, Position>;

function add(topology: Topology, type: DeviceType, position: Position): Device {
  const device = createDevice(type, position, topology);
  topology.devices.push(device);
  return device;
}

function endOf(device: Device, portName: string): LinkEnd {
  const port = device.ports.find((p) => p.name === portName);
  if (!port) throw new Error(`示例拓扑：${device.name} 没有端口 ${portName}`);
  return { deviceId: device.id, portId: port.id };
}

function join(topology: Topology, a: LinkEnd, b: LinkEnd): void {
  const link = createLink(a, b);
  topology.links.push(link);
  for (const device of topology.devices) {
    for (const port of device.ports) {
      if (port.id === a.portId || port.id === b.portId) port.linkId = link.id;
    }
  }
}

/** 一张能直接 ping 通外网的最小家庭网络 */
export function sampleTopology(): Topology {
  const topology = createEmptyTopology(SAMPLE_NAME);
  const internet = add(topology, "internet", LAYOUT.internet);
  const router = add(topology, "router", LAYOUT.router);
  const pc1 = add(topology, "pc", LAYOUT.pc1);
  const pc2 = add(topology, "pc", LAYOUT.pc2);
  join(topology, endOf(router, "wan"), endOf(internet, "port1"));
  join(topology, endOf(router, "lan1"), endOf(pc1, "eth0"));
  join(topology, endOf(router, "lan2"), endOf(pc2, "eth0"));
  return topology;
}
