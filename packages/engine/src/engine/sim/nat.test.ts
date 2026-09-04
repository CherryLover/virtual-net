import { describe, expect, it } from "vitest";
import {
  addDevice,
  connect,
  device,
  emptyTopology,
  INET,
  minimalTopology,
  PC1,
  R1,
  setStatic,
} from "../../test-support/fixtures";
import { buildRuntime } from "../runtime";
import { ping } from "./ping";
import { visitSite } from "./visitSite";

describe("CP1-S5 NAT 与外网回程", () => {
  it("T-CP1-020 fixture ping 8.8.8.8 → 通，五条决策，去程回程都有 NAT", () => {
    const result = ping(minimalTopology(), { sourceDeviceId: PC1, targetIp: "8.8.8.8" });

    expect(result.verdict).toBe("ok");
    expect(result.decisions).toHaveLength(5);
    expect(result.path).toEqual([PC1, R1, INET, R1, PC1]);

    const out = result.decisions[1];
    expect(out?.basis.nat).toMatchObject({
      direction: "out",
      before: { ip: "192.168.1.100" },
      after: { ip: "203.0.113.2" },
    });
    expect(out?.packetOut?.srcIp).toBe("203.0.113.2");
    expect(out?.note).toContain("192.168.1.100 → 203.0.113.2");

    const back = result.decisions[3];
    expect(back?.basis.nat?.direction).toBe("in");
    expect(back?.packetIn?.dstIp).toBe("203.0.113.2");
    expect(back?.packetOut?.dstIp).toBe("192.168.1.100");
    expect(back?.note).toContain("NAT");

    expect(result.decisions[4]?.action).toBe("receive");
  });

  it("T-CP1-021 NAT 关闭 → 停在互联网，定位到路由器的 nat 字段", () => {
    const topology = minimalTopology();
    const router = device(topology, R1);
    if (router.type !== "router") throw new Error("类型不对");
    router.config.nat = false;

    const result = ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("fail");
    expect(result.stoppedAt).toBe(INET);
    expect(result.reasonCode).toBe("NO_RETURN_ROUTE");
    expect(result.fixAt).toEqual({ deviceId: R1, field: "nat" });
    expect(result.reason).toContain("私网地址");
    expect(result.reason).toContain("无法把应答送回");
    expect(result.reason).toContain("NAT 已关闭");
  });

  it("T-CP1-022 收到发给 WAN 地址、无对应会话的应答 → NAT_NO_SESSION", () => {
    // 路由器 LAN 与互联网接入用同一网段，且关掉 NAT：
    // 电脑用的源地址正好等于路由器 WAN 地址，应答会回到 WAN 口但表里没有会话
    const topology = emptyTopology();
    const pc = addDevice(topology, "pc");
    const router = addDevice(topology, "router");
    const internet = addDevice(topology, "internet");
    connect(topology, pc.id, "eth0", router.id, "lan1");
    connect(topology, router.id, "wan", internet.id, "port1");
    if (router.type !== "router") throw new Error("类型不对");
    router.config.lan = { ip: "203.0.113.1", mask: "255.255.255.0" };
    router.config.dhcp = {
      enabled: false,
      rangeStart: "203.0.113.100",
      rangeEnd: "203.0.113.199",
      leaseHours: 24,
    };
    router.config.nat = false;
    setStatic(topology, pc.id, "203.0.113.2", "255.255.255.0", "203.0.113.1");

    const runtime = buildRuntime(topology);
    expect(runtime.ifaceOf(router.id, "wan")?.ip).toBe("203.0.113.2");

    const result = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("fail");
    expect(result.stoppedAt).toBe(router.id);
    expect(result.reasonCode).toBe("NAT_NO_SESSION");
    expect(result.reason).toContain("203.0.113.2");
  });

  it("T-CP1-023 同一次 visitSite 里 DNS 与 TCP 两个会话外部端口不同", () => {
    const topology = minimalTopology();
    // 电脑直接用外网 DNS，DNS 查询也要经过 NAT
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "8.8.8.8");

    const result = visitSite(topology, { sourceDeviceId: PC1, domain: "www.google.com" });
    expect(result.verdict).toBe("ok");

    const outbound = result.decisions.filter(
      (d) => d.deviceId === R1 && d.basis.nat?.direction === "out",
    );
    expect(outbound).toHaveLength(2);
    const udp = outbound.find((d) => d.packetOut?.proto === "udp");
    const tcp = outbound.find((d) => d.packetOut?.proto === "tcp");
    expect(udp?.basis.nat?.after.port).not.toBe(tcp?.basis.nat?.after.port);
    // 两个会话都还在表里，没有互相覆盖
    expect(udp?.basis.nat?.before.ip).toBe("192.168.1.10");
    expect(tcp?.basis.nat?.before.ip).toBe("192.168.1.10");
  });
});
