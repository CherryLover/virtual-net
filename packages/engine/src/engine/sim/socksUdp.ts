import { parseIp } from "../../model/address";
import type { DecisionPhase, ProbeResult, ReasonCode } from "../../model/probe";
import { findDevice, type Topology } from "../../model/topology";
import type { Runtime } from "../runtime/types";
import { toProbeResult } from "./result";
import { Walk } from "./walk";

export interface UdpProxySelection {
  deviceId: string;
  username?: string;
  password?: string;
}

/** DNS and echo share the association and outer path, but keep distinct target exchanges. */
export function socksUdp(
  topology: Topology,
  runtime: Runtime,
  options: { sourceDeviceId: string; proxy: UdpProxySelection } & (
    | { kind: "dnsQuery"; domain: string; server: string }
    | { kind: "udpEcho"; targetIp: string; port: number; payload: string }
  ),
): ProbeResult {
  const walk = new Walk(runtime);
  const connections: NonNullable<ProbeResult["connections"]> = [];
  let dns: ProbeResult["dns"] = null;
  let received: string | null = null;
  const finish = (): ProbeResult => ({
    ...toProbeResult({
      kind: options.kind,
      topology,
      sourceDeviceId: options.sourceDeviceId,
      decisions: walk.decisions,
      stopped: walk.stopped,
      label: options.kind === "dnsQuery" ? options.domain : `${options.targetIp}:${options.port}`,
      dns,
    }),
    connections,
    ...(options.kind === "udpEcho"
      ? {
          udpEcho: {
            targetIp: options.targetIp,
            port: options.port,
            sent: options.payload,
            received,
          },
        }
      : {}),
  });
  const fail = (
    deviceId: string,
    code: ReasonCode,
    reason: string,
    field = "proxy",
    phase: DecisionPhase = "tcp",
  ) => {
    walk.failAtOrigin(phase, deviceId, { reasonCode: code, reason }, reason, { deviceId, field });
    return false;
  };
  const segment = (
    role: NonNullable<ProbeResult["connections"]>[number]["role"],
    sourceDeviceId: string,
    target: string,
    run: () => boolean,
  ) => {
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
  if (options.kind === "dnsQuery" && parseIp(options.server) === null) {
    fail(options.sourceDeviceId, "NO_DNS", "请填写有效的 DNS 服务器 IPv4 地址", "dns", "dns");
    return finish();
  }
  const proxy = findDevice(topology, options.proxy.deviceId);
  if (proxy?.type !== "proxy" || proxy.id === options.sourceDeviceId) {
    fail(options.sourceDeviceId, "PROXY_UNAVAILABLE", "所选代理不存在，或不能作为自身的代理");
    return finish();
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
      options.sourceDeviceId,
      `${ip}:${cfg.port}`,
      () =>
        walk.run({
          phase: "tcp",
          originDeviceId: options.sourceDeviceId,
          dstIp: ip,
          proto: "tcp",
          l4: { srcPort: 49161, dstPort: cfg.port },
        }).ok,
    )
  )
    return finish();

  if (
    !segment("proxy-auth", options.sourceDeviceId, proxy.id, () => {
      if (cfg.protocol !== "socks5")
        return fail(proxy.id, "PROXY_PROTOCOL_MISMATCH", "UDP 转发需要 SOCKS5 代理");
      if (
        cfg.auth === "password" &&
        (cfg.username !== options.proxy.username || cfg.password !== options.proxy.password)
      )
        return fail(proxy.id, "PROXY_AUTH_FAILED", "代理身份验证失败，测试账号或密码不一致");
      walk.log.pass({
        phase: "tcp",
        deviceId: proxy.id,
        action: "receive",
        basis: { proxy: { deviceId: proxy.id, stage: "authentication", protocol: "socks5" } },
        note: cfg.auth === "none" ? "代理入口无需身份验证" : "代理身份验证通过",
      });
      return true;
    })
  )
    return finish();

  const relayPort = cfg.udp?.port;
  if (
    !segment("proxy-associate", options.sourceDeviceId, ip, () => {
      if (
        !cfg.udp?.enabled ||
        !Number.isInteger(relayPort) ||
        !relayPort ||
        relayPort < 1 ||
        relayPort > 65535
      )
        return fail(
          proxy.id,
          "PROXY_UDP_UNAVAILABLE",
          "代理未启用有效的 SOCKS5 UDP 中继",
          "proxy.udp",
        );
      walk.log.pass({
        phase: "tcp",
        deviceId: proxy.id,
        action: "receive",
        basis: { proxy: { deviceId: proxy.id, stage: "udp-associate", protocol: "socks5" } },
        note: `UDP ASSOCIATE：中继地址 ${ip}:${relayPort}，关联仅用于本次验证`,
      });
      return walk.returnResponse(proxy.id, "tcp", `SOCKS5 返回 UDP 中继地址 ${ip}:${relayPort}`).ok;
    })
  )
    return finish();

  if (
    !segment(
      "client-relay",
      options.sourceDeviceId,
      `${ip}:${relayPort}`,
      () =>
        walk.run({
          phase: "udp",
          originDeviceId: options.sourceDeviceId,
          dstIp: ip,
          proto: "udp",
          l4: { srcPort: 49163, dstPort: relayPort },
          udpRelayDeviceId: proxy.id,
        }).ok,
    )
  )
    return finish();

  let answer: ProbeResult["dns"] = null;
  let echo: string | null = null;
  if (options.kind === "udpEcho") {
    if (
      !segment("relay-target", proxy.id, `${options.targetIp}:${options.port}`, () => {
        const result = walk.run({
          phase: "udp",
          originDeviceId: proxy.id,
          dstIp: options.targetIp,
          proto: "udp",
          l4: { srcPort: 49164, dstPort: options.port },
          echoPayload: options.payload,
        });
        if (!result.ok) return false;
        if (result.echo === undefined)
          return fail(proxy.id, "SERVICE_CLOSED", "目标未返回 UDP 回显", "services", "udp");
        echo = result.echo;
        return true;
      })
    )
      return finish();
  } else if (
    !segment("relay-dns", proxy.id, `${options.server}:53`, () => {
      const result = walk.run({
        phase: "dns",
        originDeviceId: proxy.id,
        dstIp: options.server,
        proto: "udp",
        domain: options.domain,
      });
      if (!result.ok) return false;
      if (!result.answerIp)
        return fail(proxy.id, "DNS_NXDOMAIN", "DNS 服务未返回有效地址", "dns", "dns");
      answer = {
        server: options.server,
        domain: options.domain,
        ip: result.answerIp,
        ...(result.rewrittenBy?.length
          ? {
              originalIp: result.originalIp,
              rewritten: true,
              rewrittenBy: result.rewrittenBy,
            }
          : {}),
      };
      return true;
    })
  )
    return finish();

  if (
    !segment(
      "relay-response",
      proxy.id,
      options.sourceDeviceId,
      () =>
        walk.returnResponse(
          proxy.id,
          "udp",
          options.kind === "udpEcho" ? "SOCKS5 中继通过 UDP 关联返回回显内容" : undefined,
        ).ok,
    )
  )
    return finish();
  dns = answer;
  received = echo;
  return finish();
}
