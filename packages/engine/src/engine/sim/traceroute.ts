/**
 * traceroute：不新走一遍，直接从一次 ping 的 decisions 推逐跳列表（CP3 1.2）。
 * 不改任何模拟逻辑，`decisions` 与同参数的 ping 完全相同。
 */

import type { Decision, Hop, ProbeResult } from "../../model/probe";
import type { Topology } from "../../model/topology";
import { deviceName } from "../../model/topology";
import { buildRuntime } from "../runtime";
import { ping } from "./ping";

export interface TracerouteOptions {
  sourceDeviceId: string;
  targetIp: string;
}

export interface DeriveHopsOptions {
  sourceDeviceId: string;
  targetIp: string;
  /** 端口所属三层接口的地址；没有地址或不是三层设备返回 null */
  ipOfPort(portId: string): string | null;
}

/** 去程：从第一条到第一条 `answer`（含）或最后一条 `stop`（含） */
function outboundOf(decisions: Decision[]): Decision[] {
  const answerAt = decisions.findIndex((d) => d.action === "answer");
  if (answerAt >= 0) return decisions.slice(0, answerAt + 1);
  const stopAt = decisions.findIndex((d) => d.verdict === "stop");
  if (stopAt >= 0) return decisions.slice(0, stopAt + 1);
  return decisions.slice();
}

/**
 * 按 TTL 变化把去程摊成跳：TTL 减 1 的设备是一跳，`answer` 的是最后一跳，
 * `stop` 的是标失败的最后一跳；TTL 不变的中间到访归入下一跳的 `through`。
 * 单独导出便于用手工拼的 decisions 测试。
 */
export function deriveHops(decisions: Decision[], options: DeriveHopsOptions): Hop[] {
  const hops: Hop[] = [];
  let through: string[] = [];

  const push = (d: Decision, ip: string | null, status: Hop["status"]): void => {
    hops.push({
      hop: hops.length + 1,
      deviceId: d.deviceId,
      ip,
      ttlIn: d.packetIn?.ttl ?? 0,
      through,
      seq: d.seq,
      status,
    });
    through = [];
  };

  const ipOfPortIn = (d: Decision): string | null => {
    if (!d.portIn) return null;
    const ip = options.ipOfPort(d.portIn);
    return ip ? ip : null;
  };

  for (const d of outboundOf(decisions)) {
    // 起点自己不算跳；停在起点时 hops 为空，原因在 ProbeResult.reason
    if (d.deviceId === options.sourceDeviceId) continue;

    const status: Hop["status"] = d.verdict === "stop" ? "stop" : "ok";
    // 应答的那台就是目标，地址用目标地址；它同时 stop（比如回程失败）时算失败跳
    if (d.action === "answer") {
      push(d, options.targetIp, status);
      break;
    }
    if (d.verdict === "stop") {
      push(d, ipOfPortIn(d), "stop");
      break;
    }
    const droppedTtl =
      d.packetIn !== null && d.packetOut !== null && d.packetIn.ttl > d.packetOut.ttl;
    if (droppedTtl) {
      push(d, ipOfPortIn(d), "ok");
      continue;
    }
    // TTL 没变：交换机 / AP / 桥接光猫这类透明到访，归给下一跳
    if (!through.includes(d.deviceId)) through.push(d.deviceId);
  }

  return hops;
}

export function traceroute(topology: Topology, options: TracerouteOptions): ProbeResult {
  const probe = ping(topology, options);
  const runtime = buildRuntime(topology);
  const hops = deriveHops(probe.decisions, {
    sourceDeviceId: options.sourceDeviceId,
    targetIp: options.targetIp,
    ipOfPort: (portId) => runtime.ifaceOfPort(portId)?.ip ?? null,
  });

  const source = deviceName(topology, options.sourceDeviceId);
  const failed = hops.find((h) => h.status === "stop");
  let summary: string;
  if (probe.verdict === "ok") summary = `${source} → ${options.targetIp} 共 ${hops.length} 跳`;
  else if (failed) summary = `${source} → ${options.targetIp} 第 ${failed.hop} 跳失败`;
  // 一跳都没走到（例如停在起点）：没有「第 n 跳」可说，沿用 ping 的结论
  else summary = probe.summary;

  return { ...probe, kind: "traceroute", summary, hops };
}
