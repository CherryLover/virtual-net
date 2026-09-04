import { describe, expect, it } from "vitest";
import type { ProbeResult } from "../../model/probe";
import { INET, minimalTopology, PC1, R1, setStatic, unplug } from "../../test-support/fixtures";
import { ping } from "./ping";
import { visitSite } from "./visitSite";

function checkDecisionShape(result: ProbeResult): void {
  result.decisions.forEach((decision, i) => {
    expect(decision.seq).toBe(i + 1);
    if (decision.verdict === "stop") {
      expect(decision.reasonCode).toBeTruthy();
      expect(decision.reason).toBeTruthy();
    }
    expect(decision.packetOut?.vlan ?? null).toBeNull();
  });
  const last = result.decisions[result.decisions.length - 1];
  expect(last?.verdict).toBe(result.verdict === "ok" ? "pass" : "stop");
}

describe("CP1-S6 DNS 与访问网站", () => {
  it("T-CP1-024 fixture visitSite www.google.com → 成功", () => {
    const result = visitSite(minimalTopology(), { sourceDeviceId: PC1, domain: "www.google.com" });

    expect(result.verdict).toBe("ok");
    expect(result.summary).toBe("电脑1 打开 www.google.com 成功");
    expect(result.dns).toEqual({
      server: "192.168.1.1",
      domain: "www.google.com",
      ip: "142.250.72.14",
    });

    const dnsPhase = result.decisions.filter((d) => d.phase === "dns");
    const forwarder = dnsPhase.find((d) => d.deviceId === R1 && d.action === "originate");
    expect(forwarder?.basis.dns?.upstream).toBe("8.8.8.8");
    // 「包在中间设备重新出发」：originate 且 packetIn 非空
    expect(forwarder?.packetIn).not.toBeNull();

    const answered = dnsPhase.find((d) => d.deviceId === INET && d.action === "answer");
    expect(answered?.basis.dns?.answer).toBe("142.250.72.14");

    const tcpPhase = result.decisions.filter((d) => d.phase === "tcp");
    expect(tcpPhase.map((d) => d.deviceId)).toEqual([PC1, R1, INET, R1, PC1]);

    checkDecisionShape(result);
  });

  it("T-CP1-025 DNS 没配 / 不是 DNS 服务器 / 域名不存在", () => {
    const noDns = minimalTopology();
    setStatic(noDns, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "");
    const first = visitSite(noDns, { sourceDeviceId: PC1, domain: "www.google.com" });
    expect(first.reasonCode).toBe("NO_DNS");
    expect(first.fixAt).toEqual({ deviceId: PC1, field: "dns" });
    expect(first.summary).toBe("电脑1 打开 www.google.com 失败");

    const notServer = minimalTopology();
    setStatic(notServer, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "110.242.68.66");
    const second = visitSite(notServer, { sourceDeviceId: PC1, domain: "www.google.com" });
    expect(second.reasonCode).toBe("DNS_NOT_SERVER");
    expect(second.reason).toContain("110.242.68.66");
    expect(second.fixAt).toEqual({ deviceId: PC1, field: "dns" });

    const nx = visitSite(minimalTopology(), {
      sourceDeviceId: PC1,
      domain: "www.nonexistent.test",
    });
    expect(nx.reasonCode).toBe("DNS_NXDOMAIN");
    expect(nx.stoppedAt).toBe(INET);
    expect(nx.dns).toBeNull();
  });

  it("T-CP1-026 断开 wan → DNS_NO_UPSTREAM，停在路由器1", () => {
    const topology = minimalTopology();
    unplug(topology, "l_2");
    const result = visitSite(topology, { sourceDeviceId: PC1, domain: "www.google.com" });

    expect(result.reasonCode).toBe("DNS_NO_UPSTREAM");
    expect(result.stoppedAt).toBe(R1);
    expect(result.reason).toContain("WAN 口未获取到地址");
    expect(result.fixAt?.portId).toBe("p_r1_wan");
  });

  it("T-CP1-027 ping 起点是路由器 → 通，源地址是 WAN 地址，没有 NAT 记录", () => {
    const result = ping(minimalTopology(), { sourceDeviceId: R1, targetIp: "8.8.8.8" });

    expect(result.verdict).toBe("ok");
    expect(result.summary).toBe("路由器1 → 8.8.8.8 通");
    expect(result.decisions[0]?.packetOut?.srcIp).toBe("203.0.113.2");
    expect(result.path).toEqual([R1, INET, R1]);
    expect(result.decisions.every((d) => !d.basis.nat)).toBe(true);
  });

  it("T-CP1-028 任何结果的 decisions 都满足 seq 连续、终止条目有原因", () => {
    checkDecisionShape(ping(minimalTopology(), { sourceDeviceId: PC1, targetIp: "8.8.8.8" }));
    checkDecisionShape(ping(minimalTopology(), { sourceDeviceId: PC1, targetIp: "1.1.1.1" }));
    checkDecisionShape(
      visitSite(minimalTopology(), { sourceDeviceId: PC1, domain: "www.baidu.com" }),
    );
    const broken = minimalTopology();
    unplug(broken, "l_2");
    checkDecisionShape(ping(broken, { sourceDeviceId: PC1, targetIp: "8.8.8.8" }));
  });
});
