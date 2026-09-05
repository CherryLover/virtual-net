/**
 * CP3-S3 / S8 动画状态（T-CP3-021、T-CP3-054）。
 * 只测 store 的联动，不测组件。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { minimalTopology, PC1, R1 } from "../trace/testProbes";
import { useTopologyStore } from "./topology";
import { useTraceStore } from "./trace";
import "./index";

function reload(): void {
  useTraceStore.getState().reset();
  useTopologyStore.getState().replaceTopology(minimalTopology());
}

function pingInternet(): void {
  useTopologyStore.getState().runProbe({ kind: "ping", sourceDeviceId: PC1, targetIp: "8.8.8.8" });
}

/** 关掉路由器 DHCP：属于 config 改动，算拓扑变化 */
function turnOffDhcp(): void {
  useTopologyStore.getState().updateDevice(R1, (device) => {
    if (device.type !== "router") return device;
    return { ...device, config: { ...device.config, dhcp: { ...device.config.dhcp, on: false } } };
  });
}

describe("CP3-S3 trace slice", () => {
  beforeEach(reload);

  it("T-CP3-021 收到 lastProbe 后建好时间线并从头自动播", () => {
    pingInternet();
    const trace = useTraceStore.getState();
    expect(trace.timeline).not.toBeNull();
    expect(trace.timeline?.segments.length).toBeGreaterThan(0);
    expect(trace.cursorMs).toBe(0);
    expect(trace.playing).toBe(true);
    expect(trace.stale).toBe(false);
  });

  it("结果清空后时间线跟着清空", () => {
    pingInternet();
    useTopologyStore.getState().setProbe(null);
    expect(useTraceStore.getState().timeline).toBeNull();
    expect(useTraceStore.getState().playing).toBe(false);
  });
});

describe("CP3-S8 作废", () => {
  beforeEach(reload);

  it("T-CP3-054 ① 拓扑结构一变就作废并停播", () => {
    pingInternet();
    const before = useTopologyStore.getState().topologyRevision;
    turnOffDhcp();
    expect(useTopologyStore.getState().topologyRevision).toBe(before + 1);
    expect(useTraceStore.getState().stale).toBe(true);
    expect(useTraceStore.getState().playing).toBe(false);
  });

  it("T-CP3-054 ② 只改位置不算拓扑改动", () => {
    pingInternet();
    const before = useTopologyStore.getState().topologyRevision;
    useTopologyStore.getState().moveDevice(PC1, { x: 640, y: 480 });
    expect(useTopologyStore.getState().topologyRevision).toBe(before);
    expect(useTraceStore.getState().stale).toBe(false);
    expect(useTraceStore.getState().playing).toBe(true);
  });

  it("改拓扑名称、改设备名都不算拓扑改动", () => {
    pingInternet();
    const before = useTopologyStore.getState().topologyRevision;
    useTopologyStore.getState().rename("另一个名字");
    useTopologyStore.getState().updateDevice(PC1, (device) => ({ ...device, name: "工作机" }));
    expect(useTopologyStore.getState().topologyRevision).toBe(before);
    expect(useTraceStore.getState().stale).toBe(false);
  });

  it("「重新验证」用同一份参数重跑，作废标记消掉", () => {
    pingInternet();
    turnOffDhcp();
    const request = useTopologyStore.getState().lastProbeRequest;
    expect(request).toEqual({ kind: "ping", sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    if (request) useTopologyStore.getState().runProbe(request);
    expect(useTraceStore.getState().stale).toBe(false);
    expect(useTraceStore.getState().playing).toBe(true);
    expect(useTraceStore.getState().cursorMs).toBe(0);
  });

  it("起点设备被删掉时结果还在，只是作废", () => {
    pingInternet();
    useTopologyStore.getState().removeDevice(PC1);
    expect(useTopologyStore.getState().lastProbe).not.toBeNull();
    expect(useTraceStore.getState().stale).toBe(true);
    // 名字快照还在，列表不会退化成一串 id
    expect(useTraceStore.getState().snapshot?.devices[PC1]).toBe("电脑1");
  });
});

describe("CP3-S4 播放控件的状态", () => {
  beforeEach(reload);

  it("单步在刻度之间走，✕ 清掉画面但保留作废判定", () => {
    pingInternet();
    const trace = useTraceStore.getState();
    const marks = trace.timeline?.marks ?? [];
    expect(marks.length).toBeGreaterThan(2);

    trace.seekMs(0);
    expect(useTraceStore.getState().playing).toBe(false);
    trace.step(1);
    expect(useTraceStore.getState().cursorMs).toBe(marks[1]?.atMs);
    trace.step(1);
    expect(useTraceStore.getState().cursorMs).toBe(marks[2]?.atMs);
    trace.step(-1);
    expect(useTraceStore.getState().cursorMs).toBe(marks[1]?.atMs);

    trace.clear();
    expect(useTraceStore.getState().timeline).toBeNull();
    turnOffDhcp();
    expect(useTraceStore.getState().stale).toBe(true);
  });

  it("推进到末尾就停下；单帧间隔封顶 1 s，异常的大间隔不会一下跳到结尾", () => {
    pingInternet();
    const total = useTraceStore.getState().timeline?.totalMs ?? 0;
    useTraceStore.getState().tick(60_000);
    expect(useTraceStore.getState().cursorMs).toBe(1000);
    for (let i = 0; i < 200; i += 1) useTraceStore.getState().tick(250);
    expect(useTraceStore.getState().cursorMs).toBe(total);
    expect(useTraceStore.getState().playing).toBe(false);
  });
});
