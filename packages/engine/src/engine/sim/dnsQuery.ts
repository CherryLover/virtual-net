import type { ProbeResult } from "../../model/probe";
import type { Topology } from "../../model/topology";
import { findDevice, isHost } from "../../model/topology";
import { buildRuntime } from "../runtime";
import { stopText } from "./messages";
import { toProbeResult } from "./result";
import { Walk } from "./walk";

export interface DnsQueryOptions {
  sourceDeviceId: string;
  domain: string;
  server?: string;
}
export function dnsQuery(topology: Topology, options: DnsQueryOptions): ProbeResult {
  const source = findDevice(topology, options.sourceDeviceId);
  if (!source || !isHost(source)) throw new Error("DNS 查询起点需要是电脑、服务器或代理");
  const runtime = buildRuntime(topology);
  const walk = new Walk(runtime);
  const server =
    options.server ??
    (source.config.addressMode === "static"
      ? source.config.dns
      : (runtime.leaseOf(source.id, "eth0")?.dns ?? ""));
  let dns: ProbeResult["dns"] = null;
  if (!server)
    walk.failAtOrigin(
      "dns",
      source.id,
      stopText.noDns(source.name, options.domain),
      "没有 DNS 服务器地址",
      { deviceId: source.id, field: "dns" },
    );
  else {
    const result = walk.run({
      phase: "dns",
      originDeviceId: source.id,
      dstIp: server,
      proto: "udp",
      domain: options.domain,
    });
    if (result.ok && result.answerIp)
      dns = {
        server,
        domain: options.domain,
        ip: result.answerIp,
        ...(result.rewrittenBy?.length
          ? { originalIp: result.originalIp, rewritten: true, rewrittenBy: result.rewrittenBy }
          : {}),
      };
  }
  return toProbeResult({
    kind: "dnsQuery",
    topology,
    sourceDeviceId: source.id,
    decisions: walk.decisions,
    stopped: walk.stopped,
    label: options.domain,
    dns,
  });
}
