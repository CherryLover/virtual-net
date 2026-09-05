/**
 * CP3-S7 解释文案与短标签（T-CP3-042 – T-CP3-046）。
 * 模板见 docs/checkpoints/CP3-trace-and-animation.md 第 2.4、3.5 节。
 */

import type { Decision } from "@virtual-net/engine";
import { describe, expect, it } from "vitest";
import { actionLabel, explain } from "./explain";
import { createNames } from "./names";
import { reasonLabel } from "./reasonLabel";
import { minimalTopology, pingBadGateway, pingInternet, R1, visitGoogle } from "./testProbes";

const names = createNames(minimalTopology());

describe("CP3-S7 explain", () => {
  it("T-CP3-042 fixture ping 8.8.8.8 的 5 条 decision 依次给出五句 title", () => {
    const probe = pingInternet();
    expect(probe.decisions.map((d) => explain(d, names).title)).toEqual([
      "从 eth0 发出",
      "转发并做 NAT，从 wan 发出",
      "收到 ping 请求，应答",
      "NAT 还原后转发，从 lan1 发出",
      "收到应答，结束",
    ]);
    expect(probe.decisions.map((d) => actionLabel(d))).toEqual([
      "发出",
      "转发",
      "应答",
      "转发",
      "收到",
    ]);
  });

  it("T-CP3-043 第 1 条给出路由与 ARP 依据，第 2 条给出 NAT 与 TTL 变化", () => {
    const probe = pingInternet();
    const first = probe.decisions[0];
    const second = probe.decisions[1];
    if (!first || !second) throw new Error("fixture 里没有前两条 decision");

    expect(explain(first, names).lines).toContain(
      "查路由表：命中默认路由 0.0.0.0/0，下一跳 192.168.1.1，从 eth0 发出",
    );
    expect(explain(first, names).lines).toContain("ARP：192.168.1.1 → 02:00:00:00:00:03");

    expect(explain(second, names).lines).toContain("NAT：192.168.1.100:1 → 203.0.113.2:1");
    expect(explain(second, names).lines).toContain("TTL 64 → 63");
    // 引擎 note 里的「VLAN 1 → VLAN -」不进 lines
    expect(explain(second, names).lines.join("\n")).not.toContain("VLAN -");
  });

  it("T-CP3-043 直连路由写「直连」，回程那一跳写「NAT 还原」", () => {
    const probe = pingInternet();
    const back = probe.decisions[3];
    if (!back) throw new Error("fixture 里没有回程那一跳");

    expect(explain(back, names).lines).toContain(
      "查路由表：命中 192.168.1.0/24，直连，从 br-lan 发出",
    );
    expect(explain(back, names).lines).toContain("NAT 还原：203.0.113.2:1 → 192.168.1.100:1");
  });

  it("T-CP3-044 stop 用短标签当 title，reason 全文当首行；未知 reasonCode 显示「验证终止」", () => {
    const probe = pingBadGateway();
    const stop = probe.decisions.find((d) => d.verdict === "stop");
    if (!stop) throw new Error("fixture 里没有 stop decision");

    const result = explain(stop, names);
    expect(result.title).toBe("网关不可达");
    expect(result.lines[0]).toBe(stop.reason);
    expect(stop.reason).toBe("网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关");

    const unknown: Decision = { ...stop, reasonCode: "X" };
    expect(explain(unknown, names).title).toBe("验证终止");
    expect(reasonLabel("X")).toBe("验证终止");
    expect(reasonLabel(null)).toBe("验证终止");
  });

  it("T-CP3-044 CP2 的 7 个新 reasonCode 都有短标签", () => {
    expect(reasonLabel("VLAN_ISOLATED")).toBe("VLAN 隔离");
    expect(reasonLabel("TRUNK_NOT_ALLOWED")).toBe("trunk 未放行");
    expect(reasonLabel("VLAN_TAG_DROPPED")).toBe("标签被丢弃");
    expect(reasonLabel("L2_LOOP")).toBe("二层成环");
    expect(reasonLabel("PPPOE_REQUIRED")).toBe("需要拨号");
    expect(reasonLabel("PPPOE_REJECTED")).toBe("拨号被拒");
    expect(reasonLabel("WAN_LAN_OVERLAP")).toBe("WAN 与 LAN 重叠");
    // CP1 的几个
    expect(reasonLabel("NO_ROUTE")).toBe("没有路由");
    expect(reasonLabel("NO_RETURN_ROUTE")).toBe("无法回程");
    expect(reasonLabel("ARP_MISS")).toBe("ARP 无应答");
    expect(reasonLabel("NO_IP")).toBe("没有地址");
    expect(reasonLabel("DNS_NXDOMAIN")).toBe("域名不存在");
  });

  it("T-CP3-045 DNS 阶段路由器的 originate 是「作为 DNS 转发器」，lines 里有转发依据", () => {
    const probe = visitGoogle();
    const relay = probe.decisions.find(
      (d) => d.deviceId === R1 && d.action === "originate" && d.packetIn !== null,
    );
    if (!relay) throw new Error("fixture 里没有 DNS 转发那一跳");

    const result = explain(relay, names);
    expect(result.title).toBe("作为 DNS 转发器，向上游 8.8.8.8 重新发起查询");
    expect(result.lines).toContain("DNS 转发：www.google.com → 上游 8.8.8.8");
    expect(actionLabel(relay)).toBe("重新发出");
  });

  it("T-CP3-045 DNS 应答与「收到 DNS 应答」两句", () => {
    const probe = visitGoogle();
    const answer = probe.decisions.find((d) => d.action === "answer" && d.phase === "dns");
    const received = probe.decisions.find((d) => d.action === "receive" && d.phase === "dns");
    const tcp = probe.decisions.find((d) => d.action === "answer" && d.phase === "tcp");
    if (!answer || !received || !tcp) throw new Error("fixture 里缺 DNS 阶段的 decision");

    expect(explain(answer, names).title).toBe("DNS 应答：www.google.com = 142.250.72.14");
    expect(explain(tcp, names).title).toBe("接受 TCP 443 连接");
    // 这条 decision 自己没有 basis，不传 dns 只说收到
    expect(explain(received, names).title).toBe("收到 DNS 应答");
    expect(explain(received, names, { dns: probe.dns }).title).toBe(
      "收到 DNS 应答，www.google.com = 142.250.72.14",
    );
  });

  it("T-CP3-046 basis 里有不认识的键：不抛错，title 回落为 note", () => {
    const probe = pingInternet();
    const base = probe.decisions[1];
    if (!base) throw new Error("fixture 里没有第 2 条 decision");

    const weird = {
      ...base,
      note: "隧道封装后转发",
      basis: {
        route: null,
        arp: { ip: "10.0.0.1", mac: "02:00:00:00:00:09", hit: true },
        tunnel: { kind: "wireguard", peer: "10.8.0.1" },
      },
    } as unknown as Decision;

    const result = explain(weird, names);
    expect(result.title).toBe("隧道封装后转发");
    expect(result.lines).toContain("ARP：10.0.0.1 → 02:00:00:00:00:09");
    expect(result.lines).toContain("隧道封装后转发");
  });

  it("VLAN 变化：两侧都有标签写「VLAN a → b」，一侧为空写打标签 / 去标签", () => {
    const probe = pingInternet();
    const base = probe.decisions[1];
    if (!base?.packetIn || !base.packetOut) throw new Error("fixture 里没有第 2 条 decision");

    const tag = (id: number | null, packet: NonNullable<Decision["packetIn"]>) => ({
      ...packet,
      vlan: id,
    });
    const withVlan = (from: number | null, to: number | null): Decision => ({
      ...base,
      packetIn: tag(from, base.packetIn as NonNullable<Decision["packetIn"]>),
      packetOut: tag(to, base.packetOut as NonNullable<Decision["packetOut"]>),
    });

    expect(explain(withVlan(10, 20), names).lines).toContain("VLAN 10 → 20");
    expect(explain(withVlan(null, 20), names).lines).toContain("打标签 VLAN 20");
    expect(explain(withVlan(10, null), names).lines).toContain("去标签 VLAN 10");
    expect(explain(withVlan(10, 10), names).lines.join("\n")).not.toContain("VLAN");
  });

  it("CP2 透明设备：basis.route 为空、有 basis.mac 时按 MAC 表说话", () => {
    const probe = pingInternet();
    const base = probe.decisions[1];
    if (!base) throw new Error("fixture 里没有第 2 条 decision");

    const hit = {
      ...base,
      portOut: "p_r1_lan2",
      basis: {
        route: null,
        mac: { learned: { mac: "02:00:00:00:00:01", portId: "p_r1_lan1" }, lookup: "hit" },
      },
      note: "二层转发，未路由",
    } as unknown as Decision;
    expect(explain(hit, names).title).toBe(
      "目的 MAC 02:00:00:00:00:03 已学习在 lan2，从 lan2 转发",
    );
    expect(explain(hit, names).lines).toContain("学习：02:00:00:00:00:01 在 lan1");

    const flood = {
      ...hit,
      basis: {
        route: null,
        mac: {
          learned: { mac: "02:00:00:00:00:01", portId: "p_r1_lan1" },
          lookup: "flood",
          floodPorts: ["p_r1_lan2", "p_r1_lan3"],
        },
      },
    } as unknown as Decision;
    expect(explain(flood, names).title).toBe(
      "目的 MAC 02:00:00:00:00:03 未学习，向 lan2、lan3 泛洪，从 lan2 发出",
    );
  });
});
