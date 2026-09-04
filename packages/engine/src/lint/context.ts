/** 静态检查的共享上下文：拓扑 + 运行时 + 几个常用查询 */

import type { L3Interface, Runtime, Segment } from "../engine/runtime/types";
import { inSubnet, parseIp, parseMask, subnetLabel } from "../model/address";
import type { LintIssue } from "../model/lint";
import type { Device, PcDevice, RouterDevice, Topology } from "../model/topology";

export interface Addressed {
  iface: L3Interface;
  device: Device;
  ip: string;
  mask: string;
  prefix: number;
}

export interface LintContext {
  topology: Topology;
  runtime: Runtime;
  devices: Device[];
  pcs: PcDevice[];
  routers: RouterDevice[];
  /** 每个网段里地址合法的接口 */
  addressedIn(segment: Segment): Addressed[];
  deviceOf(deviceId: string): Device;
  name(deviceId: string): string;
  subnet(ip: string, mask: string): string;
}

export type LintRule = (ctx: LintContext) => LintIssue[];

export function makeContext(topology: Topology, runtime: Runtime): LintContext {
  const deviceOf = (deviceId: string): Device => {
    const found = topology.devices.find((d) => d.id === deviceId);
    if (!found) throw new Error(`拓扑里没有设备 ${deviceId}`);
    return found;
  };
  return {
    topology,
    runtime,
    devices: topology.devices,
    pcs: topology.devices.filter((d): d is PcDevice => d.type === "pc"),
    routers: topology.devices.filter((d): d is RouterDevice => d.type === "router"),
    deviceOf,
    name: (deviceId) => deviceOf(deviceId).name,
    subnet: (ip, mask) => subnetLabel(ip, mask),
    addressedIn: (segment) => {
      const out: Addressed[] = [];
      for (const iface of runtime.interfacesInSegment(segment)) {
        const prefix = parseMask(iface.mask);
        if (!iface.ip || parseIp(iface.ip) === null || prefix === null) continue;
        out.push({
          iface,
          device: deviceOf(iface.deviceId),
          ip: iface.ip,
          mask: iface.mask,
          prefix,
        });
      }
      return out;
    },
  };
}

/** a 的地址是否落在 b 的网段里 */
export function inPeerSubnet(a: Addressed, b: Addressed): boolean {
  return inSubnet(a.ip, b.ip, b.mask);
}

export function issue(
  ruleId: string,
  severity: LintIssue["severity"],
  message: string,
  targets: LintIssue["targets"],
  linkId?: string,
): LintIssue {
  return linkId
    ? { ruleId, severity, message, targets, linkId }
    : { ruleId, severity, message, targets };
}
