import { describe, expect, it } from "vitest";
import {
  addDevice,
  connect,
  device,
  emptyTopology,
  macOf,
  minimalTopology,
  PC1,
  portIdOf,
  R1,
  setStatic,
  unplug,
} from "../../test-support/fixtures";
import { loopTopology, twoSwitches, vlanThreePcs } from "../../test-support/topologies";
import { ping } from "./ping";

describe("CP2-S3 交换机：MAC 学习、泛洪、环路", () => {
  it("T-CP2-011 两台电脑经交换机互 ping：五条决策，一次泛洪一次命中", () => {
    const topology = emptyTopology();
    const sw = addDevice(topology, "switch");
    const a = addDevice(topology, "pc");
    const b = addDevice(topology, "pc");
    connect(topology, sw.id, "port1", a.id, "eth0");
    connect(topology, sw.id, "port2", b.id, "eth0");
    setStatic(topology, a.id, "192.168.1.10", "255.255.255.0");
    setStatic(topology, b.id, "192.168.1.11", "255.255.255.0");

    const result = ping(topology, { sourceDeviceId: a.id, targetIp: "192.168.1.11" });
    expect(result.verdict).toBe("ok");
    expect(result.decisions).toHaveLength(5);
    expect(result.decisions.map((d) => d.action)).toEqual([
      "originate",
      "forward",
      "answer",
      "forward",
      "receive",
    ]);
    expect(result.path).toEqual([a.id, sw.id, b.id, sw.id, a.id]);

    const port1 = portIdOf(topology, sw.id, "port1");
    const port2 = portIdOf(topology, sw.id, "port2");
    const out = result.decisions[1];
    expect(out?.deviceId).toBe(sw.id);
    expect(out?.portOut).toBe(port2);
    expect(out?.basis.mac).toEqual({
      learned: { mac: macOf(topology, a.id, "eth0"), portId: port1 },
      lookup: "flood",
      floodPorts: [port2],
    });
    expect(out?.basis.route).toBeNull();
    expect(out?.note).toContain("学习");
    expect(out?.note).toContain("泛洪");

    const back = result.decisions[3];
    expect(back?.basis.mac).toMatchObject({
      learned: { mac: macOf(topology, b.id, "eth0"), portId: port2 },
      lookup: "hit",
    });

    for (const decision of result.decisions) {
      expect(decision.packetIn?.vlan ?? null).toBeNull();
      expect(decision.packetOut?.vlan ?? null).toBeNull();
    }
  });

  it("T-CP2-012 交换机接在路由器与电脑之间：外网通，同网段不经路由器", () => {
    const topology = minimalTopology();
    const sw = addDevice(topology, "switch");
    unplug(topology, "l_1");
    connect(topology, R1, "lan1", sw.id, "port1");
    connect(topology, sw.id, "port2", PC1, "eth0");

    const out = ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" });
    expect(out.verdict).toBe("ok");
    expect(out.decisions).toHaveLength(7);
    expect(out.decisions.filter((d) => d.deviceId === sw.id)).toHaveLength(2);

    const pc2 = addDevice(topology, "pc");
    connect(topology, sw.id, "port3", pc2.id, "eth0");
    const lan = ping(topology, { sourceDeviceId: PC1, targetIp: "192.168.1.101" });
    expect(lan.verdict).toBe("ok");
    expect(lan.path).toEqual([PC1, sw.id, pc2.id, sw.id, PC1]);
    expect(lan.path).not.toContain(R1);
  });

  it("T-CP2-013 跨 VLAN 同网段 → VLAN_ISOLATED，定位到对端 access 口", () => {
    const { topology, sw, a, c } = vlanThreePcs();
    const result = ping(topology, { sourceDeviceId: a, targetIp: "192.168.1.20" });

    expect(result.verdict).toBe("fail");
    expect(result.decisions).toHaveLength(1);
    expect(result.reasonCode).toBe("VLAN_ISOLATED");
    expect(result.fixAt).toEqual({ deviceId: sw, portId: portIdOf(topology, sw, "port3") });
    expect(result.decisions[0]?.basis.vlan?.dropAt?.cause).toBe("access-pvid");
    expect(result.reason).toContain("VLAN 20");
    expect(result.reason).toContain("VLAN 10");
    expect(result.reason).toContain("二层隔离");
    expect(device(topology, c).name).toBe("电脑3");
  });

  it("T-CP2-014 trunk 漏放行 → TRUNK_NOT_ALLOWED，定位到发送侧 trunk 口", () => {
    const { topology, sw1, a } = twoSwitches([10], [10]);
    const result = ping(topology, { sourceDeviceId: a, targetIp: "192.168.1.30" });

    expect(result.verdict).toBe("fail");
    expect(result.reasonCode).toBe("TRUNK_NOT_ALLOWED");
    expect(result.fixAt).toEqual({ deviceId: sw1, portId: portIdOf(topology, sw1, "port8") });
    expect(result.reason).toContain("未放行 VLAN 20");
  });

  it("T-CP2-015 二层成环 → 停在第一台交换机，L2_LOOP", () => {
    const { topology, sw1, a } = loopTopology();
    const result = ping(topology, { sourceDeviceId: a, targetIp: "192.168.1.11" });

    expect(result.verdict).toBe("fail");
    expect(result.stoppedAt).toBe(sw1);
    expect(result.reasonCode).toBe("L2_LOOP");
    expect(result.reason).toContain("port7");
    expect(result.reason).toContain("port8");
    expect(result.reason).toContain("两条二层路径");
  });

  it("T-CP2-016 路由器 lan1 / lan2 之间只做二层转发", () => {
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
    for (const decision of result.decisions.filter((d) => d.deviceId === router.id)) {
      expect(decision.action).toBe("forward");
      expect(decision.basis.route).toBeNull();
      expect(decision.basis.mac).not.toBeNull();
      expect(decision.note).toContain("二层转发");
    }
  });
});
