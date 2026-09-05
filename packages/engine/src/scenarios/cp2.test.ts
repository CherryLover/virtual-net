/**
 * CP2 阶段完成标准的三个场景。
 * 页面上怎么点，这里就怎么拼拓扑、怎么调引擎。
 */

import { describe, expect, it } from "vitest";
import { buildRuntime } from "../engine/runtime";
import { ping } from "../engine/sim/ping";
import { visitSite } from "../engine/sim/visitSite";
import { lint } from "../lint";
import { createDevice, createEmptyTopology } from "../model/defaults";
import { ensureSparePort, setPortVlan } from "../model/ops";
import type { Device, ModemDevice, RouterDevice, Topology } from "../model/topology";
import { parseTopology } from "../serialization/parse";
import {
  access,
  clone,
  connect,
  HOME_OFFICE_RAW,
  portIdOf,
  setStatic,
  trunk,
} from "../test-support/fixtures";

function add(topology: Topology, type: Device["type"], x: number, y: number): Device {
  const created = createDevice(type, { x, y }, topology);
  topology.devices.push(created);
  return created;
}

/** 场景 1 第 1–3 步：拖入八台设备、连七根线、改三处配置 */
function buildScene1() {
  const topology = createEmptyTopology("家庭办公网络");
  const internet = add(topology, "internet", 360, 40);
  const modem = add(topology, "modem", 360, 150);
  const router = add(topology, "router", 360, 260);
  const sw = add(topology, "switch", 360, 370);
  const ap = add(topology, "ap", 600, 470);
  const pc1 = add(topology, "pc", 120, 560);
  const pc2 = add(topology, "pc", 300, 560);
  const pc3 = add(topology, "pc", 600, 560);

  connect(topology, internet.id, "port1", modem.id, "wan");
  ensureSparePort(topology, internet.id);
  connect(topology, modem.id, "lan1", router.id, "wan");
  connect(topology, router.id, "lan1", sw.id, "port1");
  connect(topology, sw.id, "port2", pc1.id, "eth0");
  connect(topology, sw.id, "port3", pc2.id, "eth0");
  connect(topology, sw.id, "port4", ap.id, "uplink");
  connect(topology, ap.id, "wlan1", pc3.id, "eth0");
  ensureSparePort(topology, ap.id);

  if (internet.type !== "internet" || modem.type !== "modem" || router.type !== "router") {
    throw new Error("设备类型不对");
  }
  internet.config.access.mode = "pppoe";
  router.config.wan = { mode: "pppoe", pppoe: { username: "test", password: "test" } };

  return { topology, internet, modem, router, sw, ap, pc1, pc2, pc3 };
}

/** 只比结构：设备类型、名称、端口名、连线拓扑 */
function shapeOf(topology: Topology) {
  const portName = (portId: string): string => {
    for (const device of topology.devices) {
      const port = device.ports.find((p) => p.id === portId);
      if (port) return `${device.name}/${port.name}`;
    }
    return portId;
  };
  return {
    devices: topology.devices.map((d) => ({
      type: d.type,
      name: d.name,
      ports: d.ports.map((p) => p.name),
      config: d.config,
    })),
    links: topology.links.map((l) => [portName(l.a.portId), portName(l.b.portId)].sort()).sort(),
  };
}

describe("CP2 阶段完成标准", () => {
  it("T-CP2-063 场景 1：光猫桥接 + 路由器拨号 + 交换机 + 3 台电脑 + 1 个 AP", () => {
    const { topology, internet, modem, router, sw, ap, pc1, pc2, pc3 } = buildScene1();

    // 第 1 步：八台设备的名字
    expect(topology.devices.map((d) => d.name)).toEqual([
      "互联网",
      "光猫1",
      "路由器1",
      "交换机1",
      "AP1",
      "电脑1",
      "电脑2",
      "电脑3",
    ]);

    // 第 3 步：路由器拨号成功
    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(router.id, "wan")).toMatchObject({
      status: "ok",
      via: "pppoe",
      ip: "203.0.113.2",
    });

    // 第 4 步：三台电脑自动获取
    expect(runtime.leaseOf(pc1.id, "eth0")).toMatchObject({
      status: "ok",
      ip: "192.168.1.100",
      serverDeviceId: router.id,
    });
    expect(runtime.leaseOf(pc2.id, "eth0")?.ip).toBe("192.168.1.101");
    expect(runtime.leaseOf(pc3.id, "eth0")?.ip).toBe("192.168.1.102");

    // 第 5 步：静态检查没有问题
    expect(lint(topology)).toEqual([]);

    // 第 6 步：无线客户端 ping 有线客户端
    const lan = ping(topology, { sourceDeviceId: pc3.id, targetIp: "192.168.1.100" });
    expect(lan.verdict).toBe("ok");
    expect(lan.path).toEqual([pc3.id, ap.id, sw.id, pc1.id, sw.id, ap.id, pc3.id]);
    for (const decision of lan.decisions.filter(
      (d) => d.deviceId === ap.id || d.deviceId === sw.id,
    )) {
      expect(decision.note).toContain("学习");
      expect(decision.note).toMatch(/泛洪|命中/);
    }

    // 第 7 步：有线客户端上外网
    const wan = ping(topology, { sourceDeviceId: pc1.id, targetIp: "8.8.8.8" });
    expect(wan.verdict).toBe("ok");
    expect(wan.path).toEqual([
      pc1.id,
      sw.id,
      router.id,
      modem.id,
      internet.id,
      modem.id,
      router.id,
      sw.id,
      pc1.id,
    ]);
    expect(wan.decisions[2]?.note).toContain("192.168.1.100 → 203.0.113.2");
    const modemNotes = wan.decisions.filter((d) => d.deviceId === modem.id);
    expect(modemNotes).toHaveLength(2);
    for (const decision of modemNotes) expect(decision.note).toContain("二层转发");

    // 第 8 步：访问网站
    expect(visitSite(topology, { sourceDeviceId: pc3.id, domain: "www.google.com" }).verdict).toBe(
      "ok",
    );

    // 第 9 步：导出的结构与 fixture 一致
    const parsed = parseTopology(clone(HOME_OFFICE_RAW));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.parse(JSON.stringify(parsed.topology))).toEqual(HOME_OFFICE_RAW);
    expect(shapeOf(topology)).toEqual(shapeOf(parsed.topology));
  });

  it("T-CP2-064 场景 2：光猫改路由模式，提示双层 NAT", () => {
    const { topology, internet, modem, router, sw, pc1 } = buildScene1();
    const modemDevice = modem as ModemDevice;
    const routerDevice = router as RouterDevice;

    // 第 1 步：光猫切路由，自己拨号成功
    modemDevice.config.mode = "route";
    expect(buildRuntime(topology).leaseOf(modem.id, "wan")).toMatchObject({
      status: "ok",
      via: "pppoe",
      ip: "203.0.113.2",
    });

    // 第 2 步：路由器还在拨号 → 一条 error，ping 断在路由器
    const rejected = lint(topology);
    const errors = rejected.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe("L021");
    expect(errors[0]?.message).toBe("路由器1 在拨号，但 光猫1 不接受拨号");
    const blocked = ping(topology, { sourceDeviceId: pc1.id, targetIp: "8.8.8.8" });
    expect(blocked.verdict).toBe("fail");
    expect(blocked.stoppedAt).toBe(router.id);
    expect(blocked.reasonCode).toBe("PPPOE_REJECTED");
    expect(blocked.reason).toContain("不接受拨号");
    expect(blocked.fixAt).toEqual({ deviceId: router.id, field: "wan.mode" });

    // 第 3 步：路由器改自动获取
    routerDevice.config.wan = { mode: "dhcp" };
    expect(buildRuntime(topology).leaseOf(router.id, "wan")?.ip).toBe("192.168.100.100");

    // 第 4 步：一条 warning，双层 NAT
    const issues = lint(topology);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.ruleId).toBe("L018");
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.targets).toEqual([{ deviceId: router.id, field: "nat" }]);

    // 第 5 步：两层 NAT 都能上网
    const result = ping(topology, { sourceDeviceId: pc1.id, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("ok");
    expect(result.path).toEqual([
      pc1.id,
      sw.id,
      router.id,
      modem.id,
      internet.id,
      modem.id,
      router.id,
      sw.id,
      pc1.id,
    ]);
    expect(result.decisions[2]?.note).toContain("192.168.1.100 → 192.168.100.100");
    expect(result.decisions[3]?.note).toContain("192.168.100.100 → 203.0.113.2");

    // 第 6 步：切回桥接、路由器改回拨号 → 没有问题
    modemDevice.config.mode = "bridge";
    routerDevice.config.wan = { mode: "pppoe", pppoe: { username: "test", password: "test" } };
    expect(lint(topology)).toEqual([]);
  });

  it("T-CP2-065 场景 3：两个 VLAN，同 VLAN 通、跨 VLAN 不通，单臂路由后通", () => {
    // 第 1 步：交换机 + 三台电脑
    const topology = createEmptyTopology("两个 VLAN");
    const sw = add(topology, "switch", 360, 200);
    const pc1 = add(topology, "pc", 120, 400);
    const pc2 = add(topology, "pc", 300, 400);
    const pc3 = add(topology, "pc", 480, 400);
    connect(topology, sw.id, "port2", pc1.id, "eth0");
    connect(topology, sw.id, "port3", pc2.id, "eth0");
    connect(topology, sw.id, "port4", pc3.id, "eth0");

    // 第 2 步：port2 / port3 批量设 VLAN 10，port4 设 VLAN 20
    setPortVlan(
      topology,
      [portIdOf(topology, sw.id, "port2"), portIdOf(topology, sw.id, "port3")],
      access(10),
    );
    setPortVlan(topology, [portIdOf(topology, sw.id, "port4")], access(20));

    // 第 3 步：三台电脑改手动
    setStatic(topology, pc1.id, "192.168.1.10", "255.255.255.0");
    setStatic(topology, pc2.id, "192.168.1.11", "255.255.255.0");
    setStatic(topology, pc3.id, "192.168.1.20", "255.255.255.0");

    // 第 4 步：同 VLAN 通
    const sameVlan = ping(topology, { sourceDeviceId: pc1.id, targetIp: "192.168.1.11" });
    expect(sameVlan.verdict).toBe("ok");
    expect(sameVlan.path).toEqual([pc1.id, sw.id, pc2.id, sw.id, pc1.id]);

    // 第 5 步：跨 VLAN 不通
    const isolated = ping(topology, { sourceDeviceId: pc1.id, targetIp: "192.168.1.20" });
    expect(isolated.verdict).toBe("fail");
    expect(isolated.stoppedAt).toBe(pc1.id);
    expect(isolated.reasonCode).toBe("VLAN_ISOLATED");
    expect(isolated.reason).toBe(
      "192.168.1.20（电脑3）在 VLAN 20，本机发出的包在 VLAN 10，二层隔离，需要路由器转发",
    );
    expect(isolated.fixAt).toEqual({
      deviceId: sw.id,
      portId: portIdOf(topology, sw.id, "port4"),
    });

    // 第 6 步：加单臂路由
    const router = add(topology, "router", 360, 60) as RouterDevice;
    const internet = add(topology, "internet", 600, 60);
    connect(topology, router.id, "lan1", sw.id, "port1");
    connect(topology, router.id, "wan", internet.id, "port1");
    ensureSparePort(topology, internet.id);
    router.config.vlans = [
      {
        id: 10,
        ip: "192.168.10.1",
        mask: "255.255.255.0",
        dhcp: {
          enabled: true,
          rangeStart: "192.168.10.100",
          rangeEnd: "192.168.10.199",
          leaseHours: 24,
        },
      },
      {
        id: 20,
        ip: "192.168.20.1",
        mask: "255.255.255.0",
        dhcp: {
          enabled: true,
          rangeStart: "192.168.20.100",
          rangeEnd: "192.168.20.199",
          leaseHours: 24,
        },
      },
    ];
    setPortVlan(topology, [portIdOf(topology, router.id, "lan1")], trunk([10, 20], 1));
    setPortVlan(topology, [portIdOf(topology, sw.id, "port1")], trunk([10, 20], 1));

    // 第 7 步：三台电脑改回自动获取
    for (const pc of [pc1, pc2, pc3]) {
      if (pc.type !== "pc") throw new Error("类型不对");
      pc.config = { addressMode: "dhcp", ip: "", mask: "", gateway: "", dns: "" };
    }
    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(pc1.id, "eth0")?.ip).toBe("192.168.10.100");
    expect(runtime.leaseOf(pc2.id, "eth0")?.ip).toBe("192.168.10.101");
    expect(runtime.leaseOf(pc3.id, "eth0")?.ip).toBe("192.168.20.100");

    // 第 8 步：静态检查没有问题
    expect(lint(topology)).toEqual([]);

    // 第 9 步：跨 VLAN 经路由器通
    const routed = ping(topology, { sourceDeviceId: pc1.id, targetIp: "192.168.20.100" });
    expect(routed.verdict).toBe("ok");
    expect(routed.path).toEqual([
      pc1.id,
      sw.id,
      router.id,
      sw.id,
      pc3.id,
      sw.id,
      router.id,
      sw.id,
      pc1.id,
    ]);
    expect(routed.decisions[2]?.note).toContain("VLAN 10");
    expect(routed.decisions[2]?.note).toContain("VLAN 20");

    // 第 10 步：同 VLAN 不经路由器
    const direct = ping(topology, { sourceDeviceId: pc1.id, targetIp: "192.168.10.101" });
    expect(direct.verdict).toBe("ok");
    expect(direct.path).not.toContain(router.id);

    // 第 11 步：交换机漏放行 VLAN 20
    setPortVlan(topology, [portIdOf(topology, sw.id, "port1")], trunk([10], 1));
    const l015 = lint(topology).filter((i) => i.ruleId === "L015");
    expect(l015).toHaveLength(1);
    expect(l015[0]?.message).toBe("VLAN 20 两侧都有设备，但 交换机1 port1 未放行");
    const blocked = ping(topology, { sourceDeviceId: pc1.id, targetIp: "192.168.20.100" });
    expect(blocked.verdict).toBe("fail");
    expect(blocked.stoppedAt).toBe(router.id);
    expect(blocked.reasonCode).toBe("TRUNK_NOT_ALLOWED");
    expect(blocked.reason).toContain("未放行 VLAN 20");
    expect(blocked.fixAt).toEqual({
      deviceId: sw.id,
      portId: portIdOf(topology, sw.id, "port1"),
    });

    // 第 12 步：放行改回来，能上外网
    setPortVlan(topology, [portIdOf(topology, sw.id, "port1")], trunk([10, 20], 1));
    expect(ping(topology, { sourceDeviceId: pc1.id, targetIp: "8.8.8.8" }).verdict).toBe("ok");
  });
});
