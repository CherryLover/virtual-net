/**
 * CP1 阶段完成标准的四个场景（ROADMAP「CP1 局域网基础 · 完成标准」1–4）。
 * 页面上怎么点，这里就怎么拼拓扑、怎么调引擎。
 */

import { describe, expect, it } from "vitest";
import { buildRuntime } from "../engine/runtime";
import { ping } from "../engine/sim/ping";
import { visitSite } from "../engine/sim/visitSite";
import { lint } from "../lint";
import { createDevice, createEmptyTopology } from "../model/defaults";
import type { PcDevice, RouterDevice, Topology } from "../model/topology";
import { parseTopology } from "../serialization/parse";
import { connect } from "../test-support/fixtures";

/** 场景 1 第 1–2 步：拖三台设备、连两根线 */
function buildScene(): {
  topology: Topology;
  pc: PcDevice;
  router: RouterDevice;
  internetId: string;
} {
  const topology = createEmptyTopology("家庭最小网络");
  const pc = createDevice("pc", { x: 120, y: 420 }, topology);
  topology.devices.push(pc);
  const router = createDevice("router", { x: 120, y: 240 }, topology);
  topology.devices.push(router);
  const internet = createDevice("internet", { x: 120, y: 60 }, topology);
  topology.devices.push(internet);

  connect(topology, pc.id, "eth0", router.id, "lan1");
  connect(topology, router.id, "wan", internet.id, "port1");

  if (pc.type !== "pc" || router.type !== "router") throw new Error("设备类型不对");
  return { topology, pc, router, internetId: internet.id };
}

describe("CP1 阶段完成标准", () => {
  it("T-CP1-062 场景 1：最小闭环 — 拖三台设备连两根线，ping 路由器通、ping 8.8.8.8 通、打开国外网站成功", () => {
    const { topology, pc, router, internetId } = buildScene();

    // 第 3 步：电脑自动获取到地址，路由器 WAN 也拿到了地址
    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(pc.id, "eth0")).toMatchObject({
      status: "ok",
      ip: "192.168.1.100",
      mask: "255.255.255.0",
      gateway: "192.168.1.1",
      dns: "192.168.1.1",
      serverDeviceId: router.id,
    });
    expect(runtime.leaseOf(router.id, "wan")?.ip).toBe("203.0.113.2");

    // 第 4 步：静态检查没有问题
    expect(lint(topology)).toEqual([]);

    // 第 5 步：ping 路由器
    const lan = ping(topology, { sourceDeviceId: pc.id, targetIp: "192.168.1.1" });
    expect(lan.verdict).toBe("ok");
    expect(lan.summary).toBe("电脑1 → 192.168.1.1 通");
    expect(lan.path).toEqual([pc.id, router.id, pc.id]);
    expect(lan.stoppedAt).toBeNull();
    expect(lan.reasonCode).toBeNull();
    expect(lan.fixAt).toBeNull();

    // 第 6 步：ping 8.8.8.8
    const wan = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(wan.verdict).toBe("ok");
    expect(wan.path).toEqual([pc.id, router.id, internetId, router.id, pc.id]);
    const outbound = wan.decisions.find(
      (d) => d.deviceId === router.id && d.basis.nat?.direction === "out",
    );
    expect(outbound?.note).toContain("192.168.1.100 → 203.0.113.2");

    // 第 7 步：访问网站
    const site = visitSite(topology, { sourceDeviceId: pc.id, domain: "www.google.com" });
    expect(site.verdict).toBe("ok");
    expect(site.summary).toBe("电脑1 打开 www.google.com 成功");
    expect(site.dns).toEqual({
      server: "192.168.1.1",
      domain: "www.google.com",
      ip: "142.250.72.14",
    });
  });

  it("T-CP1-062 场景 2：网关配错 — 静态检查报网关不在本网段，ping 8.8.8.8 停在电脑上", () => {
    const { topology, pc } = buildScene();
    pc.config = {
      addressMode: "static",
      ip: "192.168.1.10",
      mask: "255.255.255.0",
      gateway: "10.0.0.1",
      dns: "192.168.1.1",
    };

    const issues = lint(topology);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.ruleId).toBe("L002");
    expect(issues[0]?.message).toBe("网关 10.0.0.1 不在 192.168.1.0/24 网段内");
    expect(issues[0]?.targets[0]).toEqual({ deviceId: pc.id, field: "gateway" });

    const result = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("fail");
    expect(result.stoppedAt).toBe(pc.id);
    expect(result.reasonCode).toBe("GATEWAY_OFF_SUBNET");
    expect(result.reason).toBe("网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关");
    expect(result.fixAt).toEqual({ deviceId: pc.id, field: "gateway" });
    expect(result.decisions).toHaveLength(1);
  });

  it("T-CP1-062 场景 3：关掉 NAT — ping 外网不通，原因说明私网地址无法回程", () => {
    const { topology, pc, router, internetId } = buildScene();
    pc.config = {
      addressMode: "static",
      ip: "192.168.1.10",
      mask: "255.255.255.0",
      gateway: "192.168.1.1",
      dns: "192.168.1.1",
    };
    router.config.nat = false;

    expect(lint(topology).some((i) => i.ruleId === "L013")).toBe(true);

    const off = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(off.verdict).toBe("fail");
    expect(off.stoppedAt).toBe(internetId);
    expect(off.reasonCode).toBe("NO_RETURN_ROUTE");
    expect(off.reason).toBe(
      "回程失败：源地址 192.168.1.10 是私网地址，互联网无法把应答送回。路由器1 的 NAT 已关闭",
    );
    expect(off.fixAt).toEqual({ deviceId: router.id, field: "nat" });
    expect(off.decisions).toHaveLength(3);
    expect(off.decisions[2]?.verdict).toBe("stop");

    router.config.nat = true;
    expect(ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" }).verdict).toBe("ok");
  });

  it("T-CP1-062 场景 4：导出、清空、导入 — 图和配置完整回来，验证结果一致", () => {
    const { topology, pc, router } = buildScene();
    pc.config = {
      addressMode: "static",
      ip: "192.168.1.10",
      mask: "255.255.255.0",
      gateway: "192.168.1.1",
      dns: "192.168.1.1",
    };
    router.config.nat = true;

    const before = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(before.verdict).toBe("ok");

    // 导出 → 导入
    const exported = JSON.stringify(topology, null, 2);
    const parsed = parseTopology(exported);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.topology).toEqual(topology);
    expect(parsed.topology.name).toBe("家庭最小网络");

    const after = ping(parsed.topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(after).toEqual(before);
    expect(lint(parsed.topology)).toEqual(lint(topology));
  });
});
