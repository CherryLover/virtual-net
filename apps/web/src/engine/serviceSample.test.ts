import { lint, parseTopology, ping, visitSite } from "@virtual-net/engine";
import { describe, expect, it } from "vitest";
import { SERVICES_SAMPLE_DOMAIN, SERVICES_SAMPLE_NAME, servicesTopology } from "./serviceSample";

function sample() {
  const topology = servicesTopology();
  const pc = topology.devices.find((d) => d.type === "pc");
  const proxy = topology.devices.find((d) => d.type === "proxy");
  const server = topology.devices.find((d) => d.type === "server");
  if (!pc || !proxy || !server) throw new Error("示例缺少设备");
  return { topology, pc, proxy, server };
}

describe("服务与代理示例", () => {
  it("包含七类设备、六条有效连线和中性区域", () => {
    const { topology } = sample();
    expect(topology.name).toBe(SERVICES_SAMPLE_NAME);
    expect(topology.devices.map((d) => d.type).sort()).toEqual([
      "access-control",
      "internet",
      "pc",
      "proxy",
      "router",
      "server",
      "switch",
    ]);
    expect(topology.links).toHaveLength(6);
    expect(topology.devices.flatMap((d) => d.ports).filter((p) => p.linkId)).toHaveLength(12);
    expect(new Set(topology.devices.map((d) => d.zone))).toEqual(
      new Set(["办公网", "服务区", "外部网络"]),
    );
    expect(lint(topology).filter((issue) => issue.severity === "error")).toEqual([]);
  });
  it("导入导出完整保留示例且每次创建独立标识", () => {
    const { topology } = sample();
    const parsed = parseTopology(JSON.stringify(topology));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    expect(parsed.topology).toEqual(topology);
    const other = servicesTopology();
    expect(other.devices.some((d) => topology.devices.some((before) => before.id === d.id))).toBe(
      false,
    );
  });
  it("电脑直连外部目标成功并经过出口控制", () => {
    const { topology, pc } = sample();
    const result = visitSite(topology, { sourceDeviceId: pc.id, domain: SERVICES_SAMPLE_DOMAIN });
    expect(result.verdict, result.reason ?? "").toBe("ok");
    expect(result.dns?.ip).toBe("198.51.100.80");
    expect(result.connections?.some((c) => c.role === "direct")).toBe(true);
    expect(result.path).toContain(topology.devices.find((d) => d.type === "access-control")?.id);
  });
  it.each(["proxy", "client"] as const)("SOCKS5 通过 %s 解析并完整返回", (dnsMode) => {
    const { topology, pc, proxy } = sample();
    const result = visitSite(topology, {
      sourceDeviceId: pc.id,
      domain: SERVICES_SAMPLE_DOMAIN,
      proxy: { deviceId: proxy.id, protocol: "socks5", dnsMode },
    });
    expect(result.verdict, result.reason ?? "").toBe("ok");
    expect(result.connections?.map((c) => c.role)).toContain("proxy-target");
    expect(result.connections?.at(-1)?.role).toBe("proxy-response");
    expect(result.decisions.at(-1)?.deviceId).toBe(pc.id);
  });
  it("内部服务可直连及代理访问，关闭监听后失败但 ping 仍可达", () => {
    const { topology, pc, proxy, server } = sample();
    const request = { sourceDeviceId: pc.id, domain: "service.example", port: 443 };
    expect(visitSite(topology, request).verdict).toBe("ok");
    expect(
      visitSite(topology, {
        ...request,
        proxy: { deviceId: proxy.id, protocol: "socks5", dnsMode: "proxy" },
      }).verdict,
    ).toBe("ok");
    server.config.services = [];
    expect(visitSite(topology, request).reasonCode).toBe("SERVICE_CLOSED");
    expect(ping(topology, { sourceDeviceId: pc.id, targetIp: server.config.ip }).verdict).toBe(
      "ok",
    );
  });
  it("示例访问规则确实拒绝外部 TCP 25", () => {
    const { topology, pc } = sample();
    const result = visitSite(topology, {
      sourceDeviceId: pc.id,
      domain: SERVICES_SAMPLE_DOMAIN,
      port: 25,
    });
    expect(result.reasonCode).toBe("ACCESS_DENIED");
    expect(result.stoppedAt).toBe(topology.devices.find((d) => d.type === "access-control")?.id);
  });
});
