import { describe, expect, it } from "vitest";
import type { Topology } from "../../model/topology";
import {
  access,
  addDevice,
  connect,
  emptyTopology,
  portIdOf,
  setStatic,
  setVlan,
  trunk,
} from "../../test-support/fixtures";
import { loopTopology, twoSwitches, vlanThreePcs } from "../../test-support/topologies";
import { buildRuntime } from "./index";
import type { L2Reach } from "./segment";

function reachOf(topology: Topology, deviceId: string, ifaceName: string, ignoreVlan = false) {
  const runtime = buildRuntime(topology);
  const iface = runtime.ifaceOf(deviceId, ifaceName);
  if (!iface) throw new Error(`没有接口 ${ifaceName}`);
  return runtime.reachFrom(iface, ignoreVlan ? { ignoreVlan: true } : undefined);
}

function reachedDevices(reach: L2Reach): string[] {
  return reach.targets.map((t) => t.iface.deviceId);
}

describe("CP2-S2 segmentOf 加 VLAN 过滤", () => {
  it("T-CP2-005 access 口按 PVID 隔离，ignoreVlan 记下丢弃点", () => {
    const { topology, sw, a, b, c } = vlanThreePcs();

    const strict = reachOf(topology, a, "eth0");
    expect(reachedDevices(strict)).toContain(b);
    expect(reachedDevices(strict)).not.toContain(c);

    const loose = reachOf(topology, a, "eth0", true);
    expect(reachedDevices(loose)).toContain(c);
    expect(loose.dropAt).toEqual({
      deviceId: sw,
      portId: portIdOf(topology, sw, "port3"),
      cause: "access-pvid",
    });
  });

  it("T-CP2-006 trunk 漏放行：丢弃点停在发送侧交换机", () => {
    const one = twoSwitches([10], [10]);
    const first = reachOf(one.topology, one.a, "eth0");
    expect(reachedDevices(first)).not.toContain(one.e);
    expect(reachedDevices(first)).not.toContain(one.sw2);
    expect(first.dropAt).toEqual({
      deviceId: one.sw1,
      portId: portIdOf(one.topology, one.sw1, "port8"),
      cause: "trunk-not-allowed",
    });

    const half = twoSwitches([10], [10, 20]);
    const second = reachOf(half.topology, half.a, "eth0");
    expect(second.dropAt?.deviceId).toBe(half.sw1);
    expect(reachedDevices(second)).not.toContain(half.e);

    const both = twoSwitches([10, 20], [10, 20]);
    const third = reachOf(both.topology, both.a, "eth0");
    expect(reachedDevices(third)).toContain(both.e);
    const path = third.targets.find((t) => t.iface.deviceId === both.e)?.path;
    expect(path?.steps[0]).toMatchObject({
      deviceId: both.sw1,
      portOut: portIdOf(both.topology, both.sw1, "port8"),
      vlan: 20,
      wireVlanOut: 20,
    });
  });

  it("T-CP2-007 trunk 直连电脑：只有 native VLAN 能过去", () => {
    const topology = emptyTopology();
    const sw = addDevice(topology, "switch");
    const a = addDevice(topology, "pc");
    const b = addDevice(topology, "pc");
    const d = addDevice(topology, "pc");
    connect(topology, sw.id, "port1", a.id, "eth0");
    connect(topology, sw.id, "port2", b.id, "eth0");
    connect(topology, sw.id, "port8", d.id, "eth0");
    setVlan(topology, sw.id, "port2", access(10));
    setVlan(topology, sw.id, "port8", trunk([10], 1));
    for (const pc of [a, b, d]) setStatic(topology, pc.id, "192.168.1.10", "255.255.255.0");

    expect(reachedDevices(reachOf(topology, a.id, "eth0"))).toContain(d.id);

    const vlan10 = reachOf(topology, b.id, "eth0");
    expect(reachedDevices(vlan10)).not.toContain(d.id);
    expect(vlan10.drops).toContainEqual({
      deviceId: d.id,
      portId: portIdOf(topology, d.id, "eth0"),
      cause: "tagged-drop",
    });
  });

  it("T-CP2-008 路由器 LAN 网桥按 VLAN 拆成子接口", () => {
    const topology = emptyTopology();
    const router = addDevice(topology, "router");
    if (router.type !== "router") throw new Error("类型不对");
    router.config.vlans = [
      { id: 10, ip: "192.168.10.1", mask: "255.255.255.0", dhcp: dhcpOff() },
      { id: 20, ip: "192.168.20.1", mask: "255.255.255.0", dhcp: dhcpOff() },
    ];
    setVlan(topology, router.id, "lan1", trunk([10, 20], 1));

    const runtime = buildRuntime(topology);
    const lan = runtime.ifaceOf(router.id, "br-lan");
    const v10 = runtime.ifaceOf(router.id, "br-lan.10");
    const v20 = runtime.ifaceOf(router.id, "br-lan.20");
    const lan1 = portIdOf(topology, router.id, "lan1");
    expect(lan?.mac).toBe(v10?.mac);
    expect(v10?.mac).toBe(v20?.mac);
    for (const iface of [lan, v10, v20]) expect(iface?.portIds).toContain(lan1);
    expect(v10?.ip).toBe("192.168.10.1");

    setVlan(topology, router.id, "lan2", access(20));
    const after = buildRuntime(topology);
    expect(after.ifaceOf(router.id, "br-lan.20")?.portIds).toContain(
      portIdOf(topology, router.id, "lan2"),
    );
    expect(after.ifaceOf(router.id, "br-lan")?.portIds).not.toContain(
      portIdOf(topology, router.id, "lan2"),
    );
  });

  it("T-CP2-009 两条二层路径 → loop 非空，含两根连线", () => {
    const { topology, a, link7, link8 } = loopTopology();
    const reach = reachOf(topology, a, "eth0");
    expect(reach.loop).not.toBeNull();
    expect(reach.loop?.linkIds.slice().sort()).toEqual([link7, link8].sort());
  });
});

function dhcpOff() {
  return { enabled: false, rangeStart: "", rangeEnd: "", leaseHours: 24 };
}
