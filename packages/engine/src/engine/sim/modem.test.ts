import { describe, expect, it } from "vitest";
import type { Topology } from "../../model/topology";
import { device } from "../../test-support/fixtures";
import { modemChain } from "../../test-support/topologies";
import { buildRuntime } from "../runtime";
import { ping } from "./ping";
import { visitSite } from "./visitSite";

function setAccessMode(topology: Topology, internetId: string, mode: "dhcp" | "pppoe"): void {
  const internet = device(topology, internetId);
  if (internet.type !== "internet") throw new Error("类型不对");
  internet.config.access.mode = mode;
}

function setRouterWan(topology: Topology, routerId: string, mode: "dhcp" | "pppoe"): void {
  const router = device(topology, routerId);
  if (router.type !== "router") throw new Error("类型不对");
  router.config.wan =
    mode === "pppoe" ? { mode, pppoe: { username: "t", password: "t" } } : { mode };
}

describe("CP2-S5 光猫：桥接与路由模式", () => {
  it("T-CP2-022 桥接光猫透明转发，路由器直接从互联网拿地址", () => {
    const { topology, internet, modem, router, pc } = modemChain();
    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(router, "wan")).toMatchObject({
      status: "ok",
      ip: "203.0.113.2",
      serverDeviceId: internet,
      via: "dhcp",
      addressClass: "public",
    });

    const result = ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("ok");
    expect(result.decisions).toHaveLength(7);
    const modemDecisions = result.decisions.filter((d) => d.deviceId === modem);
    expect(modemDecisions).toHaveLength(2);
    for (const decision of modemDecisions) {
      expect(decision.action).toBe("forward");
      expect(decision.basis.nat ?? null).toBeNull();
      expect(decision.basis.mac).not.toBeNull();
      expect(decision.note).toContain("二层转发");
    }
  });

  it("T-CP2-023 上游要求拨号但路由器是自动获取 → PPPOE_REQUIRED", () => {
    const { topology, internet, router, pc } = modemChain();
    setAccessMode(topology, internet, "pppoe");

    expect(buildRuntime(topology).leaseOf(router, "wan")?.status).toBe("pppoe-required");
    const result = ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" });
    expect(result.stoppedAt).toBe(router);
    expect(result.reasonCode).toBe("PPPOE_REQUIRED");
    expect(result.fixAt).toEqual({ deviceId: router, field: "wan.mode" });
    expect(result.reason).toContain("要求拨号");
    expect(result.reason).toContain("自动获取");
  });

  it("T-CP2-024 路由模式光猫自己拨号，形成双层 NAT", () => {
    const { topology, internet, modem, router, pc } = modemChain({ mode: "route" });
    setAccessMode(topology, internet, "pppoe");

    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(modem, "wan")).toMatchObject({
      status: "ok",
      via: "pppoe",
      ip: "203.0.113.2",
    });
    expect(runtime.leaseOf(router, "wan")).toMatchObject({
      status: "ok",
      ip: "192.168.100.100",
      serverDeviceId: modem,
    });

    const result = ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("ok");
    expect(result.path).toEqual([pc, router, modem, internet, modem, router, pc]);
    const outbound = result.decisions.filter((d) => d.basis.nat?.direction === "out");
    expect(outbound.map((d) => d.deviceId)).toEqual([router, modem]);
    const atInternet = result.decisions.find((d) => d.deviceId === internet);
    expect(atInternet?.packetIn?.srcIp).toBe("203.0.113.2");
  });

  it("T-CP2-025 光猫路由模式下路由器还在拨号 → PPPOE_REJECTED", () => {
    const { topology, modem, router, pc } = modemChain({ mode: "route" });
    setRouterWan(topology, router, "pppoe");

    expect(buildRuntime(topology).leaseOf(router, "wan")?.status).toBe("pppoe-rejected");
    const result = ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" });
    expect(result.stoppedAt).toBe(router);
    expect(result.reasonCode).toBe("PPPOE_REJECTED");
    expect(result.reason).toContain(`${device(topology, modem).name}（路由模式）`);
  });

  it("T-CP2-026 运营商内网接入 → addressClass 是 cgnat，仍然能上网", () => {
    const { topology, internet, router, pc } = modemChain();
    const inet = device(topology, internet);
    if (inet.type !== "internet") throw new Error("类型不对");
    inet.config.access = {
      ip: "100.64.0.1",
      mask: "255.192.0.0",
      poolStart: "100.64.0.2",
      poolEnd: "100.64.0.254",
      dns: "8.8.8.8",
      mode: "dhcp",
    };

    const lease = buildRuntime(topology).leaseOf(router, "wan");
    expect(lease?.ip).toBe("100.64.0.2");
    expect(lease?.addressClass).toBe("cgnat");
    expect(ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" }).verdict).toBe("ok");
  });

  it("T-CP2-027 光猫路由模式下访问网站：两级 DNS 转发", () => {
    const { topology, internet, modem, router, pc } = modemChain({ mode: "route" });
    const result = visitSite(topology, { sourceDeviceId: pc, domain: "www.google.com" });

    expect(result.verdict).toBe("ok");
    expect(result.dns).toEqual({
      server: "192.168.1.1",
      domain: "www.google.com",
      ip: "142.250.72.14",
    });
    const dnsPhase = result.decisions.filter((d) => d.phase === "dns");
    expect(dnsPhase.map((d) => d.deviceId)).toEqual([
      pc,
      router,
      modem,
      internet,
      modem,
      router,
      pc,
    ]);
    expect(dnsPhase[1]?.action).toBe("originate");
    expect(dnsPhase[1]?.basis.dns?.upstream).toBe("192.168.100.1");
    expect(dnsPhase[2]?.action).toBe("originate");
    expect(dnsPhase[2]?.basis.dns?.upstream).toBe("8.8.8.8");
  });
});
