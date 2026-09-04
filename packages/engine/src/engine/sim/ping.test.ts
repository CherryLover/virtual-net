import { describe, expect, it } from "vitest";
import type { Topology } from "../../model/topology";
import {
  addDevice,
  connect,
  device,
  emptyTopology,
  INET,
  macOf,
  minimalTopology,
  PC1,
  R1,
  setStatic,
  unplug,
} from "../../test-support/fixtures";
import { ping } from "./ping";

/** 电脑A 直连 路由器 lan1 的小拓扑 */
function directPair(
  pcIp = "192.168.1.10",
  gateway = "",
): { topology: Topology; pc: string; router: string } {
  const topology = emptyTopology();
  const pc = addDevice(topology, "pc");
  const router = addDevice(topology, "router");
  connect(topology, pc.id, "eth0", router.id, "lan1");
  setStatic(topology, pc.id, pcIp, "255.255.255.0", gateway, "");
  return { topology, pc: pc.id, router: router.id };
}

describe("CP1-S3 同网段 ping", () => {
  it("T-CP1-010 电脑A ping 路由器 LAN 地址 → 通，三条决策", () => {
    const { topology, pc, router } = directPair();
    const result = ping(topology, { sourceDeviceId: pc, targetIp: "192.168.1.1" });

    expect(result.verdict).toBe("ok");
    expect(result.summary).toBe("电脑1 → 192.168.1.1 通");
    expect(result.decisions).toHaveLength(3);
    expect(result.decisions.map((d) => d.action)).toEqual(["originate", "answer", "receive"]);
    expect(result.decisions[0]?.deviceId).toBe(pc);
    expect(result.decisions[0]?.basis.arp?.mac).toBe(macOf(topology, router, "lan1"));
    expect(result.decisions[0]?.packetOut?.ttl).toBe(64);
    expect(result.decisions[1]?.deviceId).toBe(router);
    expect(result.path).toEqual([pc, router, pc]);
    expect(result.hops).toBeNull();
  });

  it("T-CP1-011 ping 网段里没人用的地址 → ARP_MISS", () => {
    const { topology, pc } = directPair();
    const result = ping(topology, { sourceDeviceId: pc, targetIp: "192.168.1.2" });

    expect(result.verdict).toBe("fail");
    expect(result.decisions).toHaveLength(1);
    expect(result.reasonCode).toBe("ARP_MISS");
    expect(result.reason).toContain("192.168.1.2");
    expect(result.reason).toContain("ARP 无应答");
  });

  it("T-CP1-012 eth0 不连线 → PORT_UNLINKED", () => {
    const topology = emptyTopology();
    const pc = addDevice(topology, "pc");
    setStatic(topology, pc.id, "192.168.1.10", "255.255.255.0", "");
    const result = ping(topology, { sourceDeviceId: pc.id, targetIp: "192.168.1.1" });

    expect(result.reasonCode).toBe("PORT_UNLINKED");
    expect(result.reason).toContain("eth0");
  });

  it("T-CP1-013 自动获取失败 → NO_IP", () => {
    const noServer = emptyTopology();
    const pcA = addDevice(noServer, "pc");
    const pcB = addDevice(noServer, "pc");
    connect(noServer, pcA.id, "eth0", pcB.id, "eth0");
    const first = ping(noServer, { sourceDeviceId: pcA.id, targetIp: "192.168.1.1" });
    expect(first.reasonCode).toBe("NO_IP");
    expect(first.reason).toContain("没有 DHCP 服务器");

    const noLink = emptyTopology();
    const lonely = addDevice(noLink, "pc");
    const second = ping(noLink, { sourceDeviceId: lonely.id, targetIp: "192.168.1.1" });
    expect(second.reasonCode).toBe("NO_IP");
    expect(second.reason).toContain("没有连线");
  });

  it("T-CP1-014 两台电脑直连：同网段通，跨网段起点 NO_GATEWAY", () => {
    const topology = emptyTopology();
    const a = addDevice(topology, "pc");
    const b = addDevice(topology, "pc");
    connect(topology, a.id, "eth0", b.id, "eth0");
    setStatic(topology, a.id, "192.168.1.10", "255.255.255.0");
    setStatic(topology, b.id, "192.168.1.11", "255.255.255.0");

    const ok = ping(topology, { sourceDeviceId: a.id, targetIp: "192.168.1.11" });
    expect(ok.verdict).toBe("ok");
    expect(ok.path).toEqual([a.id, b.id, a.id]);

    setStatic(topology, b.id, "192.168.2.11", "255.255.255.0");
    const fail = ping(topology, { sourceDeviceId: a.id, targetIp: "192.168.2.11" });
    expect(fail.verdict).toBe("fail");
    expect(fail.stoppedAt).toBe(a.id);
    expect(fail.reasonCode).toBe("NO_GATEWAY");
  });

  it("T-CP1-010 两台电脑分接 lan1 / lan2：路由器做二层转发", () => {
    const topology = emptyTopology();
    const a = addDevice(topology, "pc");
    const b = addDevice(topology, "pc");
    const router = addDevice(topology, "router");
    connect(topology, a.id, "eth0", router.id, "lan1");
    connect(topology, b.id, "eth0", router.id, "lan2");
    setStatic(topology, a.id, "192.168.1.10", "255.255.255.0", "192.168.1.1");
    setStatic(topology, b.id, "192.168.1.11", "255.255.255.0", "192.168.1.1");

    const result = ping(topology, { sourceDeviceId: a.id, targetIp: "192.168.1.11" });
    expect(result.verdict).toBe("ok");
    expect(result.path).toEqual([a.id, router.id, b.id, router.id, a.id]);
    const bridged = result.decisions[1];
    expect(bridged?.action).toBe("forward");
    expect(bridged?.basis.route).toBeNull();
    expect(bridged?.note).toContain("二层转发");
  });
});

describe("CP1-S4 跨网段转发", () => {
  it("T-CP1-015 NAT 关闭时去程能走到互联网", () => {
    const topology = minimalTopology();
    const router = device(topology, R1);
    if (router.type !== "router") throw new Error("类型不对");
    router.config.nat = false;

    const result = ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    const [first, second, third] = result.decisions;

    expect(first?.deviceId).toBe(PC1);
    expect(first?.action).toBe("originate");
    expect(first?.basis.route?.via).toBe("192.168.1.1");

    expect(second?.deviceId).toBe(R1);
    expect(second?.action).toBe("forward");
    expect(second?.portIn).toBe("p_r1_lan1");
    expect(second?.portOut).toBe("p_r1_wan");
    expect(second?.packetOut?.ttl).toBe(63);
    expect(second?.packetOut?.srcIp).toBe("192.168.1.100");
    expect(second?.note).toContain("NAT 关闭");

    expect(third?.deviceId).toBe(INET);
    expect(third?.action).toBe("answer");
    expect(third?.verdict).toBe("stop");
    expect(third?.reasonCode).toBe("NO_RETURN_ROUTE");
  });

  it("T-CP1-016 网关不在本机网段 → GATEWAY_OFF_SUBNET", () => {
    const topology = minimalTopology();
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "10.0.0.1", "192.168.1.1");
    const result = ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });

    expect(result.decisions).toHaveLength(1);
    expect(result.reasonCode).toBe("GATEWAY_OFF_SUBNET");
    expect(result.reason).toBe("网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关");
    expect(result.fixAt).toEqual({ deviceId: PC1, field: "gateway" });
  });

  it("T-CP1-017 网关地址没人用 → ARP_MISS，文案含「网关」", () => {
    const topology = minimalTopology();
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.254", "192.168.1.1");
    const result = ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });

    expect(result.reasonCode).toBe("ARP_MISS");
    expect(result.reason).toContain("网关");
    expect(result.reason).toContain("192.168.1.254");
  });

  it("T-CP1-018 断开 wan → 停在路由器，NO_ROUTE", () => {
    const topology = minimalTopology();
    unplug(topology, "l_2");
    const result = ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });

    expect(result.stoppedAt).toBe(R1);
    expect(result.reasonCode).toBe("NO_ROUTE");
    expect(result.reason).toContain("WAN 口未获取到地址");
    expect(result.fixAt?.portId).toBe("p_r1_wan");
  });

  it("T-CP1-019 ping 目标库以外的地址 → 停在互联网，UNKNOWN_DEST", () => {
    const result = ping(minimalTopology(), { sourceDeviceId: PC1, targetIp: "1.1.1.1" });

    expect(result.stoppedAt).toBe(INET);
    expect(result.reasonCode).toBe("UNKNOWN_DEST");
    expect(result.reason).toContain("1.1.1.1");
  });
});
