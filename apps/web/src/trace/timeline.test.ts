/**
 * CP3-S2 时间线模型（T-CP3-008 – T-CP3-015）。
 * 片段表见 docs/checkpoints/CP3-trace-and-animation.md 第 2.1 节。
 */

import type { Decision, Link, PacketSummary, ProbeResult } from "@virtual-net/engine";
import { describe, expect, it } from "vitest";
import { BASE_MS, MAX_TOTAL_MS } from "./durations";
import { phaseLabel } from "./phaseLabel";
import {
  INET,
  minimalTopology,
  PC1,
  pingBadGateway,
  pingInternet,
  pingNatOff,
  R1,
  traceInternet,
  visitGoogle,
} from "./testProbes";
import { buildTimeline, progressAt, seekToSeq, segmentAt, seqsByDevice } from "./timeline";

const LINKS = minimalTopology().links;

function kinds(timeline: ReturnType<typeof buildTimeline>, kind: string): number {
  return timeline.segments.filter((s) => s.kind === kind).length;
}

describe("CP3-S2 buildTimeline", () => {
  it("T-CP3-008 fixture ping 8.8.8.8：5 dwell / 4 travel / 0 gap，片段首尾相接，marks 对齐 dwell 起点", () => {
    const probe = pingInternet();
    const timeline = buildTimeline(probe, 1, LINKS);

    expect(kinds(timeline, "dwell")).toBe(5);
    expect(kinds(timeline, "travel")).toBe(4);
    expect(kinds(timeline, "gap")).toBe(0);
    expect(timeline.warnings).toEqual([]);
    expect(timeline.revision).toBe(1);

    expect(timeline.segments[0]?.startMs).toBe(0);
    for (const [i, segment] of timeline.segments.entries()) {
      expect(segment.index).toBe(i);
      if (i > 0) expect(segment.startMs).toBe(timeline.segments[i - 1]?.endMs);
    }
    expect(timeline.segments.at(-1)?.endMs).toBe(timeline.totalMs);
    // 5 × 停留 + 4 × 移动，末尾那条是 receive
    expect(timeline.totalMs).toBe(BASE_MS.dwell * 4 + BASE_MS.receive + BASE_MS.travel * 4);

    expect(timeline.marks).toHaveLength(5);
    for (const mark of timeline.marks) {
      const dwell = timeline.segments.find((s) => s.kind === "dwell" && s.seq === mark.seq);
      expect(mark.atMs).toBe(dwell?.startMs);
    }
  });

  it("T-CP3-009 每个 travel 的 toDeviceId 是下一条 decision 的设备，linkId 是该 decision 的 linkId", () => {
    const probe = pingInternet();
    const timeline = buildTimeline(probe, 1, LINKS);

    for (const segment of timeline.segments) {
      if (segment.kind !== "travel") continue;
      const decision = probe.decisions.find((d) => d.seq === segment.seq);
      const next = probe.decisions.find((d) => d.seq === segment.seq + 1);
      expect(segment.linkId).toBe(decision?.linkId);
      expect(segment.toDeviceId).toBe(next?.deviceId);
    }
    // 去程 电脑1 → 路由器1 → 互联网，回程原路返回
    expect(timeline.segments.filter((s) => s.kind === "travel").map((s) => s.toDeviceId)).toEqual([
      R1,
      INET,
      R1,
      PC1,
    ]);
  });

  it("T-CP3-010 visitSite：恰好 1 个 gap，卡在 dns 与 tcp 之间，停在电脑1", () => {
    const probe = visitGoogle();
    const timeline = buildTimeline(probe, 1, LINKS);

    const gaps = timeline.segments.filter((s) => s.kind === "gap");
    expect(gaps).toHaveLength(1);
    const gap = gaps[0];
    if (!gap) throw new Error("没有 gap");
    expect(gap.deviceId).toBe(PC1);

    const before = timeline.segments[gap.index - 1];
    const after = timeline.segments[gap.index + 1];
    expect(before?.kind).toBe("dwell");
    expect(before?.phase).toBe("dns");
    expect(after?.kind).toBe("dwell");
    expect(after?.phase).toBe("tcp");
  });

  it("T-CP3-011 路由器 DNS 转发那条 originate 是 renew，起点 originate 是 normal", () => {
    const probe = visitGoogle();
    const timeline = buildTimeline(probe, 1, LINKS);

    const renew = probe.decisions.find((d) => d.action === "originate" && d.packetIn !== null);
    const plain = probe.decisions.find((d) => d.action === "originate" && d.packetIn === null);
    if (!renew || !plain) throw new Error("fixture 里没有这两条 decision");
    expect(renew.deviceId).toBe(R1);

    const renewDwell = timeline.segments.find((s) => s.kind === "dwell" && s.seq === renew.seq);
    const plainDwell = timeline.segments.find((s) => s.kind === "dwell" && s.seq === plain.seq);
    expect(renewDwell?.style).toBe("renew");
    expect(renewDwell?.endMs).toBe((renewDwell?.startMs ?? 0) + BASE_MS.renew);
    expect(plainDwell?.style).toBe("normal");
  });

  it("T-CP3-012 失败结果：网关配错只有 1 个 stop dwell；NAT 关闭是 3 dwell / 2 travel，末段 stop", () => {
    const bad = buildTimeline(pingBadGateway(), 1, LINKS);
    expect(bad.segments).toHaveLength(1);
    expect(bad.segments[0]).toMatchObject({ kind: "dwell", style: "stop", deviceId: PC1 });
    expect(bad.totalMs).toBe(BASE_MS.stop);
    expect(bad.marks).toHaveLength(1);

    const natOff = buildTimeline(pingNatOff(), 1, LINKS);
    expect(kinds(natOff, "dwell")).toBe(3);
    expect(kinds(natOff, "travel")).toBe(2);
    expect(natOff.segments.at(-1)).toMatchObject({
      kind: "dwell",
      style: "stop",
      deviceId: INET,
    });
  });

  it("T-CP3-013 32 条 decision：totalMs 压到 30000，各片段按同一比例缩短", () => {
    const timeline = buildTimeline(longProbe(32), 1, LINKS);

    expect(timeline.marks).toHaveLength(32);
    expect(kinds(timeline, "dwell")).toBe(32);
    expect(kinds(timeline, "travel")).toBe(31);
    expect(timeline.totalMs).toBe(MAX_TOTAL_MS);

    const raw = BASE_MS.dwell * 31 + BASE_MS.receive + BASE_MS.travel * 31;
    const factor = MAX_TOTAL_MS / raw;
    for (const segment of timeline.segments) {
      const base =
        segment.kind === "travel"
          ? BASE_MS.travel
          : segment.style === "receive"
            ? BASE_MS.receive
            : BASE_MS.dwell;
      expect(Math.abs(segment.endMs - segment.startMs - base * factor)).toBeLessThanOrEqual(1);
    }
  });

  it("T-CP3-014 segmentAt 取首段 / 末段，seekToSeq 回到该 seq 的 dwell 起点", () => {
    const timeline = buildTimeline(pingInternet(), 1, LINKS);

    expect(segmentAt(timeline, 0)).toBe(timeline.segments[0]);
    expect(segmentAt(timeline, -100)).toBe(timeline.segments[0]);
    expect(segmentAt(timeline, timeline.totalMs)).toBe(timeline.segments.at(-1));
    expect(segmentAt(timeline, timeline.totalMs + 5000)).toBe(timeline.segments.at(-1));

    const third = timeline.segments.find((s) => s.kind === "dwell" && s.seq === 3);
    expect(seekToSeq(timeline, 3)).toBe(third?.startMs);
    expect(segmentAt(timeline, seekToSeq(timeline, 3))).toBe(third);
    // 没有这条 seq 时回到开头，不抛错
    expect(seekToSeq(timeline, 99)).toBe(0);
  });

  it("T-CP3-015 travel 对端与下一条 decision 不一致：以连线为准并记 warning，不抛错", () => {
    const links: Link[] = [
      { id: "l_x", a: { deviceId: "a", portId: "a/p1" }, b: { deviceId: "b", portId: "b/p1" } },
    ];
    const probe = probeOf([
      decision({ seq: 1, deviceId: "a", action: "originate", linkId: "l_x", out: 64 }),
      decision({ seq: 2, deviceId: "c", action: "receive", linkId: null, in: 64 }),
    ]);

    const timeline = buildTimeline(probe, 1, links);
    const travel = timeline.segments.find((s) => s.kind === "travel");
    expect(travel?.toDeviceId).toBe("b");
    expect(timeline.warnings).toHaveLength(1);
    expect(timeline.warnings[0]).toContain("以连线为准");

    // 不传 links 时退回下一条 decision 的设备，也不报错
    const fallback = buildTimeline(probe, 1);
    expect(fallback.segments.find((s) => s.kind === "travel")?.toDeviceId).toBe("c");
    expect(fallback.warnings).toEqual([]);
  });
});

describe("CP3-S2 画布高亮要的派生量", () => {
  it("progressAt 给出当前 seq、到访过的设备与走过的连线", () => {
    const timeline = buildTimeline(pingInternet(), 1, LINKS);

    const start = progressAt(timeline, 0);
    expect(start.seq).toBe(1);
    expect(start.visitedDeviceIds).toEqual([PC1]);
    expect(start.walkedLinkIds).toEqual([]);

    // 停在互联网那一跳
    const atInternet = progressAt(timeline, seekToSeq(timeline, 3));
    expect(atInternet.seq).toBe(3);
    expect(atInternet.visitedSeqs).toEqual([1, 2, 3]);
    expect(atInternet.visitedDeviceIds).toEqual([PC1, R1, INET]);
    expect(atInternet.walkedLinkIds).toEqual(["l_1", "l_2"]);

    const end = progressAt(timeline, timeline.totalMs);
    expect(end.seq).toBe(5);
    expect(end.visitedSeqs).toEqual([1, 2, 3, 4, 5]);
    expect(end.walkedLinkIds).toEqual(["l_1", "l_2"]);
  });

  it("seqsByDevice 给节点角标：路由器1 是 2 · 4，电脑1 是 1 · 5", () => {
    const timeline = buildTimeline(pingInternet(), 1, LINKS);
    expect(seqsByDevice(timeline)).toEqual({ [PC1]: [1, 5], [R1]: [2, 4], [INET]: [3] });
  });

  it("phaseLabel 把阶段名换成中文，不认识的原样返回", () => {
    expect(phaseLabel("icmp")).toBe("ping");
    expect(phaseLabel("dns")).toBe("DNS");
    expect(phaseLabel("tcp")).toBe("连接");
    expect(phaseLabel("vpn")).toBe("vpn");
  });

  it("traceroute 的时间线与同参数 ping 一模一样", () => {
    const fromPing = buildTimeline(pingInternet(), 1, LINKS);
    const fromTrace = buildTimeline(traceInternet(), 1, LINKS);
    expect(fromTrace.segments).toEqual(fromPing.segments);
    expect(fromTrace.marks).toEqual(fromPing.marks);
    expect(fromTrace.totalMs).toBe(fromPing.totalMs);
  });
});

function packet(ttl: number): PacketSummary {
  return {
    srcMac: "02:00:00:00:00:01",
    dstMac: "02:00:00:00:00:02",
    srcIp: "192.168.1.10",
    dstIp: "8.8.8.8",
    proto: "icmp",
    l4: { icmpId: 1, icmpType: "echo-request" },
    ttl,
    vlan: null,
  };
}

function decision(opts: {
  seq: number;
  deviceId: string;
  action: Decision["action"];
  linkId: string | null;
  in?: number;
  out?: number;
}): Decision {
  return {
    seq: opts.seq,
    phase: "icmp",
    deviceId: opts.deviceId,
    portIn: opts.in === undefined ? null : `${opts.deviceId}/in`,
    portOut: opts.out === undefined ? null : `${opts.deviceId}/out`,
    linkId: opts.linkId,
    action: opts.action,
    packetIn: opts.in === undefined ? null : packet(opts.in),
    packetOut: opts.out === undefined ? null : packet(opts.out),
    basis: {},
    verdict: "pass",
    reasonCode: null,
    reason: null,
    note: "手工拼的",
  };
}

function probeOf(decisions: Decision[]): ProbeResult {
  return {
    kind: "ping",
    verdict: "ok",
    summary: "手工拼的",
    stoppedAt: null,
    reasonCode: null,
    reason: null,
    fixAt: null,
    dns: null,
    hops: null,
    decisions,
    path: [],
  };
}

/** n 条 decision 的长验证：1 条 originate + (n - 2) 条 forward + 1 条 receive */
function longProbe(n: number): ProbeResult {
  const decisions: Decision[] = [
    decision({ seq: 1, deviceId: "d0", action: "originate", linkId: "l0", out: 64 }),
  ];
  for (let i = 1; i <= n - 2; i += 1) {
    decisions.push(
      decision({
        seq: i + 1,
        deviceId: `d${i}`,
        action: "forward",
        linkId: `l${i}`,
        in: 64 - i + 1,
        out: 64 - i,
      }),
    );
  }
  decisions.push(
    decision({ seq: n, deviceId: `d${n - 1}`, action: "receive", linkId: null, in: 32 }),
  );
  return probeOf(decisions);
}
