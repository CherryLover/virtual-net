/** 只给 trace 下的 *.test.ts 用：拿 CP1 fixture 跑真引擎，得到真实的 ProbeResult */

import type { PcDevice, ProbeResult, RouterDevice, Topology } from "@virtual-net/engine";
import { ping, traceroute, visitSite } from "@virtual-net/engine";
import minimal from "../../../../packages/engine/fixtures/minimal.json";

export function minimalTopology(): Topology {
  return structuredClone(minimal) as unknown as Topology;
}

export const PC1 = "d_pc1";
export const R1 = "d_r1";
export const INET = "d_inet";

function pcOf(topology: Topology): PcDevice {
  const device = topology.devices.find((d) => d.id === PC1);
  if (device?.type !== "pc") throw new Error("fixture 里没有电脑1");
  return device;
}

function routerOf(topology: Topology): RouterDevice {
  const device = topology.devices.find((d) => d.id === R1);
  if (device?.type !== "router") throw new Error("fixture 里没有路由器1");
  return device;
}

/** 拆掉一根线 */
export function unplug(topology: Topology, linkId: string): void {
  topology.links = topology.links.filter((l) => l.id !== linkId);
  for (const device of topology.devices) {
    for (const port of device.ports) if (port.linkId === linkId) port.linkId = null;
  }
}

/** CP1 场景 1：ping 8.8.8.8 通 */
export function pingInternet(): ProbeResult {
  return ping(minimalTopology(), { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
}

/** CP1 场景 1：访问网站，DNS + 连接两个阶段 */
export function visitGoogle(): ProbeResult {
  return visitSite(minimalTopology(), { sourceDeviceId: PC1, domain: "www.google.com" });
}

/** traceroute 8.8.8.8 */
export function traceInternet(): ProbeResult {
  return traceroute(minimalTopology(), { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
}

/** CP1 场景 2：网关配错，停在电脑1 */
export function pingBadGateway(): ProbeResult {
  const topology = minimalTopology();
  pcOf(topology).config = {
    addressMode: "static",
    ip: "192.168.1.10",
    mask: "255.255.255.0",
    gateway: "10.0.0.1",
    dns: "192.168.1.1",
  };
  return ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
}

/** CP1 场景 3：NAT 关闭，停在互联网 */
export function pingNatOff(): ProbeResult {
  const topology = minimalTopology();
  routerOf(topology).config.nat = false;
  return ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
}

/** 断开 wan 连线，停在路由器1 */
export function pingNoWan(): ProbeResult {
  const topology = minimalTopology();
  unplug(topology, "l_2");
  return ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
}
