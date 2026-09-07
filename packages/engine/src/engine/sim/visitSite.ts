/** 显式应用代理：入口连接、验证、解析、独立出口连接与响应。 */
import { parseIp } from "../../model/address";
import type { ProbeResult, ReasonCode } from "../../model/probe";
import type { ProxyProtocol, Topology } from "../../model/topology";
import { findDevice, isHost } from "../../model/topology";
import { buildRuntime } from "../runtime";
import { stopText } from "./messages";
import { toProbeResult } from "./result";
import { Walk } from "./walk";

export interface VisitSiteOptions {
  sourceDeviceId: string;
  domain: string;
  port?: number;
  proxy?: {
    deviceId: string;
    protocol: ProxyProtocol;
    dnsMode: "client" | "proxy";
    username?: string;
    password?: string;
  };
}

export function visitSite(topology: Topology, options: VisitSiteOptions): ProbeResult {
  const source = findDevice(topology, options.sourceDeviceId);
  if (!source || !isHost(source)) throw new Error("访问网站的起点需要是电脑、服务器或代理");
  const runtime = buildRuntime(topology);
  const walk = new Walk(runtime);
  const connections: NonNullable<ProbeResult["connections"]> = [];
  let dns: ProbeResult["dns"] = null;
  const finish = (): ProbeResult => ({
    ...toProbeResult({
      kind: "visitSite",
      topology,
      sourceDeviceId: source.id,
      decisions: walk.decisions,
      stopped: walk.stopped,
      label: options.domain,
      dns,
    }),
    connections,
  });
  const segment = (
    role: NonNullable<ProbeResult["connections"]>[number]["role"],
    sourceDeviceId: string,
    target: string,
    run: () => boolean,
  ): boolean => {
    const startSeq = walk.decisions.length + 1;
    const ok = run();
    connections.push({
      id: `connection-${connections.length + 1}`,
      role,
      sourceDeviceId,
      target,
      startSeq,
      endSeq: walk.decisions.length,
      verdict: ok ? "ok" : "fail",
    });
    return ok;
  };
  const fail = (deviceId: string, reasonCode: ReasonCode, reason: string, field = "proxy") => {
    walk.failAtOrigin("tcp", deviceId, { reasonCode, reason }, reason, { deviceId, field });
  };
  const resolve = (deviceId: string, role: "client-dns" | "proxy-dns"): string | null => {
    if (parseIp(options.domain) !== null) return options.domain;
    const device = findDevice(topology, deviceId);
    if (!device || !isHost(device)) return null;
    const server =
      device.config.addressMode === "static"
        ? device.config.dns
        : (runtime.leaseOf(deviceId, "eth0")?.dns ?? "");
    let answer: string | null = null;
    segment(role, deviceId, server, () => {
      if (!server) {
        walk.failAtOrigin(
          "dns",
          deviceId,
          stopText.noDns(device.name, options.domain),
          "没有 DNS 服务器地址，域名解析发不出去",
          { deviceId, field: "dns" },
        );
        return false;
      }
      const result = walk.run({
        phase: "dns",
        originDeviceId: deviceId,
        dstIp: server,
        proto: "udp",
        domain: options.domain,
      });
      if (!result.ok || !result.answerIp) return false;
      answer = result.answerIp;
      dns = {
        server,
        domain: options.domain,
        ip: answer,
        ...(result.rewrittenBy?.length
          ? { originalIp: result.originalIp, rewritten: true, rewrittenBy: result.rewrittenBy }
          : {}),
      };
      return true;
    });
    return answer;
  };
  const port = options.port ?? (options.proxy?.protocol === "http" ? 80 : 443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(source.id, "SERVICE_CLOSED", "目标端口需要是 1–65535 的整数", "port");
    return finish();
  }
  const selected = options.proxy;
  if (!selected) {
    const target = resolve(source.id, "client-dns");
    if (!target) return finish();
    segment(
      "direct",
      source.id,
      target,
      () =>
        walk.run({
          phase: "tcp",
          originDeviceId: source.id,
          dstIp: target,
          proto: "tcp",
          l4: { srcPort: 49160, dstPort: port },
          observableDomain: port === 80 ? options.domain : "",
        }).ok,
    );
    return finish();
  }
  const proxy = findDevice(topology, selected.deviceId);
  if (proxy?.type !== "proxy" || proxy.id === source.id) {
    fail(source.id, "PROXY_UNAVAILABLE", "所选代理不存在，或不能作为自身的代理");
    return finish();
  }
  let clientTarget: string | null = null;
  if (selected.dnsMode === "client" && selected.protocol !== "http") {
    clientTarget = resolve(source.id, "client-dns");
    if (!clientTarget) return finish();
  }
  const ip = runtime.ifaceOf(proxy.id, "eth0")?.ip;
  if (!ip) {
    fail(proxy.id, "PROXY_UNAVAILABLE", "代理还没有可连接的地址", "ip");
    return finish();
  }
  const cfg = proxy.config.proxy;
  if (
    !segment(
      "client-proxy",
      source.id,
      ip,
      () =>
        walk.run({
          phase: "tcp",
          originDeviceId: source.id,
          dstIp: ip,
          proto: "tcp",
          l4: { srcPort: 49161, dstPort: cfg.port },
          observableDomain: selected.dnsMode === "proxy" ? options.domain : "",
        }).ok,
    )
  )
    return finish();
  if (
    !segment("proxy-auth", source.id, proxy.id, () => {
      if (cfg.protocol !== selected.protocol) {
        fail(proxy.id, "PROXY_PROTOCOL_MISMATCH", "代理入口使用的协议与本次请求不一致");
        return false;
      }
      if (
        cfg.auth === "password" &&
        (cfg.username !== selected.username || cfg.password !== selected.password)
      ) {
        fail(proxy.id, "PROXY_AUTH_FAILED", "代理身份验证失败，测试账号或密码不一致");
        return false;
      }
      if (selected.protocol === "http" && selected.dnsMode !== "proxy") {
        fail(
          proxy.id,
          "PROXY_DNS_MODE",
          "HTTP 正向代理由代理解析目标域名；客户端解析可使用 CONNECT 或 SOCKS5",
        );
        return false;
      }
      walk.log.pass({
        phase: "tcp",
        deviceId: proxy.id,
        action: "receive",
        basis: {
          proxy: { deviceId: proxy.id, stage: "authentication", protocol: selected.protocol },
        },
        note: cfg.auth === "none" ? "代理入口无需身份验证" : "代理身份验证通过",
      });
      return true;
    })
  )
    return finish();
  const target = selected.dnsMode === "proxy" ? resolve(proxy.id, "proxy-dns") : clientTarget;
  if (!target) return finish();
  if (
    !segment(
      "proxy-target",
      proxy.id,
      target,
      () =>
        walk.run({
          phase: "tcp",
          originDeviceId: proxy.id,
          dstIp: target,
          proto: "tcp",
          l4: { srcPort: 49162, dstPort: port },
          observableDomain: selected.protocol === "http" || port === 80 ? options.domain : "",
        }).ok,
    )
  )
    return finish();
  segment("proxy-response", proxy.id, source.id, () => walk.returnResponse(proxy.id).ok);
  return finish();
}
