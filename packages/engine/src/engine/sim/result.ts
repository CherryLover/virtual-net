/** 从 decisions 推 ProbeResult */

import type { Decision, ProbeResult } from "../../model/probe";
import type { Topology } from "../../model/topology";
import { deviceName } from "../../model/topology";
import type { FlowStop } from "./walk";

/** 去重后的到访顺序（相邻重复只留一个） */
export function pathOf(decisions: Decision[]): string[] {
  const out: string[] = [];
  for (const decision of decisions) {
    if (out[out.length - 1] !== decision.deviceId) out.push(decision.deviceId);
  }
  return out;
}

export function toProbeResult(opts: {
  kind: ProbeResult["kind"];
  topology: Topology;
  sourceDeviceId: string;
  decisions: Decision[];
  stopped: FlowStop | null;
  /** ping 的目标地址 / visitSite 的域名 */
  label: string;
  dns?: ProbeResult["dns"];
}): ProbeResult {
  const { kind, topology, sourceDeviceId, decisions, stopped } = opts;
  const ok = stopped === null;
  const source = deviceName(topology, sourceDeviceId);
  const summary =
    kind === "dnsQuery"
      ? `${source} 查询 ${opts.label} ${ok ? "成功" : "失败"}`
      : kind === "visitSite"
        ? `${source} 打开 ${opts.label} ${ok ? "成功" : "失败"}`
        : `${source} → ${opts.label} ${ok ? "通" : "不通"}`;

  return {
    kind,
    verdict: ok ? "ok" : "fail",
    summary,
    stoppedAt: stopped?.deviceId ?? null,
    reasonCode: stopped?.stop.reasonCode ?? null,
    reason: stopped?.stop.reason ?? null,
    fixAt: stopped?.fixAt ?? null,
    dns: opts.dns ?? null,
    hops: null,
    decisions,
    path: pathOf(decisions),
  };
}
