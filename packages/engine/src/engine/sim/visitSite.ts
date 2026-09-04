/** 访问网站：先 DNS 解析，再向解析出的地址发 TCP 443 */

import type { ProbeResult } from "../../model/probe";
import type { Topology } from "../../model/topology";
import { findDevice } from "../../model/topology";
import { buildRuntime } from "../runtime";
import { stopText } from "./messages";
import { toProbeResult } from "./result";
import { Walk } from "./walk";

export interface VisitSiteOptions {
  sourceDeviceId: string;
  domain: string;
}

export function visitSite(topology: Topology, options: VisitSiteOptions): ProbeResult {
  const source = findDevice(topology, options.sourceDeviceId);
  if (!source) throw new Error(`拓扑里没有设备 ${options.sourceDeviceId}`);
  if (source.type !== "pc") throw new Error("访问网站的起点只能是电脑");

  const runtime = buildRuntime(topology);
  const walk = new Walk(runtime);
  const finish = (dns: ProbeResult["dns"]): ProbeResult =>
    toProbeResult({
      kind: "visitSite",
      topology,
      sourceDeviceId: options.sourceDeviceId,
      decisions: walk.decisions,
      stopped: walk.stopped,
      label: options.domain,
      dns,
    });

  const server =
    source.config.addressMode === "static"
      ? source.config.dns
      : (runtime.leaseOf(options.sourceDeviceId, "eth0")?.dns ?? "");
  if (!server) {
    walk.failAtOrigin(
      "dns",
      options.sourceDeviceId,
      stopText.noDns(source.name, options.domain),
      "没有 DNS 服务器地址，域名解析发不出去",
      { deviceId: options.sourceDeviceId, field: "dns" },
    );
    return finish(null);
  }

  const resolved = walk.run({
    phase: "dns",
    originDeviceId: options.sourceDeviceId,
    dstIp: server,
    proto: "udp",
    domain: options.domain,
  });
  if (!resolved.ok || !resolved.answerIp) return finish(null);

  const dns = { server, domain: options.domain, ip: resolved.answerIp };
  walk.run({
    phase: "tcp",
    originDeviceId: options.sourceDeviceId,
    dstIp: resolved.answerIp,
    proto: "tcp",
  });
  return finish(dns);
}
