import { describe, expect, it } from "vitest";
import { ensureSparePort } from "../../model/ops";
import {
  access,
  addDevice,
  connect,
  emptyTopology,
  portIdOf,
  setStatic,
  setVlan,
  trunk,
  unplug,
} from "../../test-support/fixtures";
import { buildRuntime } from "../runtime";
import { ping } from "./ping";

/** 交换机 port4 接 AP uplink，电脑3 接 AP wlan1，电脑1 接交换机 port2 */
function apTopology() {
  const topology = emptyTopology();
  const sw = addDevice(topology, "switch");
  const ap = addDevice(topology, "ap");
  const pc1 = addDevice(topology, "pc");
  const pc3 = addDevice(topology, "pc");
  connect(topology, sw.id, "port4", ap.id, "uplink");
  connect(topology, ap.id, "wlan1", pc3.id, "eth0");
  connect(topology, sw.id, "port2", pc1.id, "eth0");
  setStatic(topology, pc1.id, "192.168.1.10", "255.255.255.0");
  setStatic(topology, pc3.id, "192.168.1.30", "255.255.255.0");
  return { topology, sw: sw.id, ap: ap.id, pc1: pc1.id, pc3: pc3.id };
}

describe("CP2-S4 无线 AP", () => {
  it("T-CP2-017 无线客户端与有线客户端互 ping，AP 两条决策", () => {
    const { topology, sw, ap, pc1, pc3 } = apTopology();
    const result = ping(topology, { sourceDeviceId: pc3, targetIp: "192.168.1.10" });

    expect(result.verdict).toBe("ok");
    expect(result.path).toEqual([pc3, ap, sw, pc1, sw, ap, pc3]);
    const apDecisions = result.decisions.filter((d) => d.deviceId === ap);
    expect(apDecisions).toHaveLength(2);
    expect(apDecisions.map((d) => d.basis.mac?.lookup)).toEqual(["flood", "hit"]);
  });

  it("T-CP2-018 AP 上游是 access 口：同 VLAN 通、跨 VLAN 隔离", () => {
    const { topology, sw, ap, pc1, pc3 } = apTopology();
    const pc2 = addDevice(topology, "pc");
    connect(topology, sw, "port3", pc2.id, "eth0");
    setStatic(topology, pc2.id, "192.168.1.20", "255.255.255.0");
    setVlan(topology, sw, "port4", access(10));
    setVlan(topology, sw, "port2", access(10));
    setVlan(topology, sw, "port3", access(20));

    expect(ping(topology, { sourceDeviceId: pc3, targetIp: "192.168.1.10" }).verdict).toBe("ok");
    expect(ap).toBeTruthy();
    expect(pc1).toBeTruthy();

    const crossVlan = ping(topology, { sourceDeviceId: pc3, targetIp: "192.168.1.20" });
    expect(crossVlan.verdict).toBe("fail");
    expect(crossVlan.reasonCode).toBe("VLAN_ISOLATED");
  });

  it("T-CP2-019 AP 上游是 trunk 口：无线客户端只在 native VLAN 里", () => {
    const { topology, sw, pc1, pc3 } = apTopology();
    setVlan(topology, sw, "port4", trunk([10], 1));
    setVlan(topology, sw, "port2", access(10));

    const runtime = buildRuntime(topology);
    const pc3Iface = runtime.ifaceOf(pc3, "eth0");
    const pc1Iface = runtime.ifaceOf(pc1, "eth0");
    if (!pc3Iface || !pc1Iface) throw new Error("少了接口");

    // 电脑1 在 VLAN 10，走到电脑3 时标签被丢
    const fromVlan10 = runtime.reachFrom(pc1Iface);
    expect(fromVlan10.targets.map((t) => t.iface.deviceId)).not.toContain(pc3);
    expect(fromVlan10.drops.map((d) => d.cause)).toContain("tagged-drop");

    // 换成 native VLAN 1 的口就通了
    setVlan(topology, sw, "port2", access(1));
    const vlan1 = buildRuntime(topology);
    const iface = vlan1.ifaceOf(pc1, "eth0");
    if (!iface) throw new Error("少了接口");
    expect(vlan1.reachFrom(iface).targets.map((t) => t.iface.deviceId)).toContain(pc3);
  });

  it("T-CP2-020 AP 始终恰好留一个空闲 wlanN", () => {
    const topology = emptyTopology();
    const ap = addDevice(topology, "ap");
    const pc = addDevice(topology, "pc");
    expect(ap.ports.map((p) => p.name)).toEqual(["uplink", "wlan1"]);

    const link = connect(topology, ap.id, "wlan1", pc.id, "eth0");
    expect(ensureSparePort(topology, ap.id)).toBe(true);
    expect(ap.ports.map((p) => p.name)).toEqual(["uplink", "wlan1", "wlan2"]);
    expect(ensureSparePort(topology, ap.id)).toBe(false);

    unplug(topology, link.id);
    expect(ensureSparePort(topology, ap.id)).toBe(true);
    expect(ap.ports.map((p) => p.name)).toEqual(["uplink", "wlan1"]);
  });

  it("T-CP2-021 无线客户端自动获取地址，服务是上游路由器", () => {
    const topology = emptyTopology();
    const router = addDevice(topology, "router");
    const ap = addDevice(topology, "ap");
    const pc3 = addDevice(topology, "pc");
    connect(topology, router.id, "lan1", ap.id, "uplink");
    connect(topology, ap.id, "wlan1", pc3.id, "eth0");

    const runtime = buildRuntime(topology);
    const lease = runtime.leaseOf(pc3.id, "eth0");
    expect(lease).toMatchObject({
      status: "ok",
      ip: "192.168.1.100",
      gateway: "192.168.1.1",
      serverDeviceId: router.id,
    });
    expect(portIdOf(topology, ap.id, "uplink")).toBeTruthy();
  });
});
