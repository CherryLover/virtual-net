import { parseIp } from "../../model/address";
import { utf8ByteLength } from "../../model/payload";
import type { ProbeResult } from "../../model/probe";
import { findDevice, isHost, type Topology } from "../../model/topology";
import { buildRuntime } from "../runtime";
import { toProbeResult } from "./result";
import { socksUdp, type UdpProxySelection } from "./socksUdp";
import { Walk } from "./walk";

export interface UdpEchoOptions {
  sourceDeviceId: string;
  targetIp: string;
  port: number;
  payload: string;
  proxy?: UdpProxySelection | null;
}

export function udpEchoInputError(targetIp: string, port: number, payload: string): string | null {
  if (parseIp(targetIp) === null) return "请填写有效的目标 IPv4 地址";
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "端口须为 1–65535 的整数";
  if (port === 53) return "UDP 53 用于 DNS，请使用 DNS 查询";
  const size = utf8ByteLength(payload);
  if (size < 1 || size > 1024) return "测试内容须为 1–1024 字节";
  return null;
}

export function udpEcho(topology: Topology, options: UdpEchoOptions): ProbeResult {
  const source = findDevice(topology, options.sourceDeviceId);
  if (!source || !isHost(source)) throw new Error("UDP 回显起点需要是电脑、服务器或代理");
  const runtime = buildRuntime(topology);
  const walk = new Walk(runtime);
  const error =
    udpEchoInputError(options.targetIp, options.port, options.payload) ??
    (!options.proxy && runtime.ifaceOf(source.id, "eth0")?.ip === options.targetIp
      ? "本批验证设备间的 UDP 路径，请选择另一台设备；暂不模拟本机回环"
      : null);
  if (error)
    walk.failAtOrigin(
      "udp",
      source.id,
      { reasonCode: "INVALID_PROBE_INPUT", reason: error },
      error,
      null,
    );
  else if (options.proxy)
    return socksUdp(topology, runtime, { ...options, proxy: options.proxy, kind: "udpEcho" });
  const result = error
    ? null
    : walk.run({
        phase: "udp",
        originDeviceId: source.id,
        dstIp: options.targetIp,
        proto: "udp",
        l4: { srcPort: 49164, dstPort: options.port },
        echoPayload: options.payload,
      });
  return {
    ...toProbeResult({
      kind: "udpEcho",
      topology,
      sourceDeviceId: source.id,
      decisions: walk.decisions,
      stopped: walk.stopped,
      label: `${options.targetIp}:${options.port}`,
    }),
    udpEcho: {
      targetIp: options.targetIp,
      port: options.port,
      sent: options.payload,
      received: result?.ok ? (result.echo ?? null) : null,
    },
  };
}
