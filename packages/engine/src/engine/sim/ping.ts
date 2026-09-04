/** ping：起点可以是电脑或路由器，目标只接受 IP */

import type { ProbeResult } from "../../model/probe";
import type { Topology } from "../../model/topology";
import { findDevice } from "../../model/topology";
import { buildRuntime } from "../runtime";
import { toProbeResult } from "./result";
import { Walk } from "./walk";

export interface PingOptions {
  sourceDeviceId: string;
  targetIp: string;
}

export function ping(topology: Topology, options: PingOptions): ProbeResult {
  const source = findDevice(topology, options.sourceDeviceId);
  if (!source) throw new Error(`拓扑里没有设备 ${options.sourceDeviceId}`);
  if (source.type === "internet") throw new Error("ping 的起点只能是电脑或路由器");

  const runtime = buildRuntime(topology);
  const walk = new Walk(runtime);
  walk.run({
    phase: "icmp",
    originDeviceId: options.sourceDeviceId,
    dstIp: options.targetIp,
    proto: "icmp",
  });

  return toProbeResult({
    kind: "ping",
    topology,
    sourceDeviceId: options.sourceDeviceId,
    decisions: walk.decisions,
    stopped: walk.stopped,
    label: options.targetIp,
  });
}
