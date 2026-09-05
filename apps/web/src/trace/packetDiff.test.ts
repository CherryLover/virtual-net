/** CP3-S6 包头对照（T-CP3-036） */

import { describe, expect, it } from "vitest";
import { diffPacket } from "./packetDiff";
import { pingInternet, R1 } from "./testProbes";

describe("CP3-S6 diffPacket", () => {
  it("T-CP3-036 NAT 出向那一跳只有 MAC、源 IP、TTL 变；两侧相同 / 一侧为空返回空数组", () => {
    const probe = pingInternet();
    const nat = probe.decisions.find((d) => d.deviceId === R1 && d.basis.nat?.direction === "out");
    if (!nat) throw new Error("fixture 里没有 NAT 出向那一跳");

    expect(diffPacket(nat.packetIn, nat.packetOut)).toEqual(["srcMac", "dstMac", "srcIp", "ttl"]);

    // 目的地址与 echo id 没被占用，不算变化
    expect(diffPacket(nat.packetIn, nat.packetOut)).not.toContain("dstIp");
    expect(diffPacket(nat.packetIn, nat.packetOut)).not.toContain("l4.icmpId");

    expect(diffPacket(nat.packetIn, nat.packetIn)).toEqual([]);
    expect(diffPacket(null, nat.packetOut)).toEqual([]);
    expect(diffPacket(nat.packetIn, null)).toEqual([]);
    expect(diffPacket(null, null)).toEqual([]);
  });

  it("T-CP3-036 VLAN 与四层端口的变化也能查出来", () => {
    const probe = pingInternet();
    const first = probe.decisions[0];
    if (!first?.packetOut) throw new Error("fixture 里没有第 1 条 decision");

    const tagged = { ...first.packetOut, vlan: 10 };
    expect(diffPacket(first.packetOut, tagged)).toEqual(["vlan"]);

    const reply = {
      ...first.packetOut,
      l4: { ...first.packetOut.l4, icmpType: "echo-reply" as const },
    };
    expect(diffPacket(first.packetOut, reply)).toEqual(["l4.icmpType"]);

    const ported = {
      ...first.packetOut,
      proto: "tcp" as const,
      l4: { srcPort: 40002, dstPort: 443 },
    };
    expect(diffPacket(first.packetOut, ported)).toEqual([
      "proto",
      "l4.srcPort",
      "l4.dstPort",
      "l4.icmpId",
      "l4.icmpType",
    ]);
  });
});
