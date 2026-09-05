/**
 * CP3-S1 traceroute 引擎入口（T-CP3-001 – T-CP3-006）。
 * 派生规则见 docs/checkpoints/CP3-trace-and-animation.md 第 1.2 节。
 */

import { describe, expect, it } from "vitest";
import { ping } from "../engine/sim/ping";
import { deriveHops, traceroute } from "../engine/sim/traceroute";
import { visitSite } from "../engine/sim/visitSite";
import type { Decision, PacketSummary } from "../model/probe";
import { INET, minimalTopology, PC1, R1, unplug } from "../test-support/fixtures";

describe("CP3-S1 traceroute", () => {
  it("T-CP3-001 CP1 fixture 拓扑 traceroute 8.8.8.8：两跳，decisions 与 ping 相同", () => {
    const topology = minimalTopology();
    const result = traceroute(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });

    expect(result.kind).toBe("traceroute");
    expect(result.verdict).toBe("ok");
    expect(result.summary).toBe("电脑1 → 8.8.8.8 共 2 跳");
    expect(result.hops).toEqual([
      { hop: 1, deviceId: R1, ip: "192.168.1.1", ttlIn: 64, through: [], seq: 2, status: "ok" },
      { hop: 2, deviceId: INET, ip: "8.8.8.8", ttlIn: 63, through: [], seq: 3, status: "ok" },
    ]);

    const same = ping(minimalTopology(), { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    expect(result.decisions).toEqual(same.decisions);
  });

  it("T-CP3-002 traceroute 192.168.1.1：一跳，地址就是目标", () => {
    const result = traceroute(minimalTopology(), {
      sourceDeviceId: PC1,
      targetIp: "192.168.1.1",
    });

    expect(result.verdict).toBe("ok");
    expect(result.summary).toBe("电脑1 → 192.168.1.1 共 1 跳");
    expect(result.hops).toEqual([
      { hop: 1, deviceId: R1, ip: "192.168.1.1", ttlIn: 64, through: [], seq: 2, status: "ok" },
    ]);
  });

  it("T-CP3-003 断开 wan 连线：第 1 跳失败，停在路由器", () => {
    const topology = minimalTopology();
    unplug(topology, "l_2");
    const result = traceroute(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });

    expect(result.verdict).toBe("fail");
    expect(result.reasonCode).toBe("NO_ROUTE");
    expect(result.summary).toContain("第 1 跳失败");
    expect(result.hops).toHaveLength(1);
    expect(result.hops?.[0]).toMatchObject({ hop: 1, deviceId: R1, status: "stop", ttlIn: 64 });
  });

  it("T-CP3-004 电脑1 手动网关 10.0.0.1：停在起点，hops 为空", () => {
    const topology = minimalTopology();
    const pc = topology.devices.find((d) => d.id === PC1);
    if (pc?.type !== "pc") throw new Error("fixture 里没有电脑1");
    pc.config = {
      addressMode: "static",
      ip: "192.168.1.10",
      mask: "255.255.255.0",
      gateway: "10.0.0.1",
      dns: "192.168.1.1",
    };

    const result = traceroute(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("fail");
    expect(result.reasonCode).toBe("GATEWAY_OFF_SUBNET");
    expect(result.hops).toEqual([]);
    expect(result.summary).toBe("电脑1 → 8.8.8.8 不通");
  });

  it("T-CP3-005 去程里 TTL 不变的中间到访不成跳，归入下一跳的 through", () => {
    const hops = deriveHops(switchedOutbound(), {
      sourceDeviceId: "pc",
      targetIp: "10.0.0.9",
      ipOfPort: (portId) => (portId === "r/lan" ? "10.0.0.1" : null),
    });

    expect(hops).toEqual([
      { hop: 1, deviceId: "r", ip: "10.0.0.1", ttlIn: 64, through: ["sw"], seq: 3, status: "ok" },
      { hop: 2, deviceId: "srv", ip: "10.0.0.9", ttlIn: 63, through: [], seq: 4, status: "ok" },
    ]);
  });

  it("T-CP3-003 NAT 关闭：目标应答了但回不来，最后一跳标失败、地址仍是目标地址", () => {
    const topology = minimalTopology();
    const router = topology.devices.find((d) => d.id === R1);
    if (router?.type !== "router") throw new Error("fixture 里没有路由器1");
    router.config.nat = false;

    const result = traceroute(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("fail");
    expect(result.reasonCode).toBe("NO_RETURN_ROUTE");
    expect(result.summary).toBe("电脑1 → 8.8.8.8 第 2 跳失败");
    expect(result.hops).toEqual([
      { hop: 1, deviceId: R1, ip: "192.168.1.1", ttlIn: 64, through: [], seq: 2, status: "ok" },
      { hop: 2, deviceId: INET, ip: "8.8.8.8", ttlIn: 63, through: [], seq: 3, status: "stop" },
    ]);
  });

  it("T-CP3-006 ping / visitSite 的 hops 为 null", () => {
    const topology = minimalTopology();
    expect(ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" }).hops).toBeNull();
    expect(visitSite(topology, { sourceDeviceId: PC1, domain: "www.google.com" }).hops).toBeNull();
  });
});

/** 手工拼的去程：电脑 → 交换机（TTL 不变）→ 路由器（TTL 减 1）→ 服务器应答 */
function switchedOutbound(): Decision[] {
  const packet = (ttl: number): PacketSummary => ({
    srcMac: "02:00:00:00:00:01",
    dstMac: "02:00:00:00:00:02",
    srcIp: "192.168.1.10",
    dstIp: "10.0.0.9",
    proto: "icmp",
    l4: { icmpId: 1, icmpType: "echo-request" },
    ttl,
    vlan: null,
  });
  const base = {
    phase: "icmp",
    basis: {},
    verdict: "pass",
    reasonCode: null,
    reason: null,
  } as const;

  return [
    {
      ...base,
      seq: 1,
      deviceId: "pc",
      portIn: null,
      portOut: "pc/eth0",
      linkId: "l1",
      action: "originate",
      packetIn: null,
      packetOut: packet(64),
      note: "发出",
    },
    {
      ...base,
      seq: 2,
      deviceId: "sw",
      portIn: "sw/p1",
      portOut: "sw/p2",
      linkId: "l2",
      action: "forward",
      packetIn: packet(64),
      packetOut: packet(64),
      note: "二层转发，未路由",
    },
    {
      ...base,
      seq: 3,
      deviceId: "r",
      portIn: "r/lan",
      portOut: "r/wan",
      linkId: "l3",
      action: "forward",
      packetIn: packet(64),
      packetOut: packet(63),
      note: "按路由转发",
    },
    {
      ...base,
      seq: 4,
      deviceId: "srv",
      portIn: "srv/eth0",
      portOut: "srv/eth0",
      linkId: "l3",
      action: "answer",
      packetIn: packet(63),
      packetOut: packet(64),
      note: "应答",
    },
  ];
}
