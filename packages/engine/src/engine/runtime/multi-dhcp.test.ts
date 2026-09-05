import { describe, expect, it } from "vitest";
import {
  access,
  addDevice,
  connect,
  device,
  emptyTopology,
  setVlan,
} from "../../test-support/fixtures";
import { modemChain, oneArmRouter } from "../../test-support/topologies";
import { leaseFailureText } from "../sim/messages";
import { buildRuntime } from "./index";

/** 单臂路由 + 三台自动获取的电脑（A、B 在 VLAN 10，C 在 VLAN 20） */
function threeClients() {
  const built = oneArmRouter({ dhcp: true });
  const b = addDevice(built.topology, "pc");
  connect(built.topology, built.sw, "port4", b.id, "eth0");
  setVlan(built.topology, built.sw, "port4", access(10));
  return { ...built, b: b.id };
}

describe("CP2-S7 多 DHCP 池", () => {
  it("T-CP2-035 每个 VLAN 一个池，网关与 DNS 是所在 VLAN 的子接口", () => {
    const { topology, a, b, c } = threeClients();
    const runtime = buildRuntime(topology);

    expect(runtime.leaseOf(a, "eth0")).toMatchObject({
      status: "ok",
      ip: "192.168.10.100",
      gateway: "192.168.10.1",
      dns: "192.168.10.1",
      serverIface: "br-lan.10",
    });
    expect(runtime.leaseOf(b, "eth0")?.ip).toBe("192.168.10.101");
    expect(runtime.leaseOf(c, "eth0")).toMatchObject({
      status: "ok",
      ip: "192.168.20.100",
      gateway: "192.168.20.1",
      serverIface: "br-lan.20",
    });
  });

  it("T-CP2-036 关掉 VLAN 20 的 DHCP → 只有 C 拿不到，文案带 VLAN 20", () => {
    const { topology, router, a, b, c } = threeClients();
    const vlan20 = router.config.vlans?.find((v) => v.id === 20);
    if (!vlan20) throw new Error("少了 VLAN 20");
    vlan20.dhcp.enabled = false;

    const runtime = buildRuntime(topology);
    const lease = runtime.leaseOf(c, "eth0");
    expect(lease?.status).toBe("no-server");
    expect(leaseFailureText(lease?.status ?? "", "eth0", lease?.vlan ?? null)).toContain("VLAN 20");
    expect(runtime.leaseOf(a, "eth0")?.ip).toBe("192.168.10.100");
    expect(runtime.leaseOf(b, "eth0")?.ip).toBe("192.168.10.101");
  });

  it("T-CP2-037 光猫路由模式：电脑走路由器的池，路由器 WAN 走光猫的池", () => {
    const { topology, modem, router, pc } = modemChain({ mode: "route" });
    const runtime = buildRuntime(topology);

    expect(runtime.leaseOf(pc, "eth0")).toMatchObject({
      status: "ok",
      ip: "192.168.1.100",
      serverDeviceId: router,
    });
    expect(runtime.leaseOf(router, "wan")).toMatchObject({
      status: "ok",
      ip: "192.168.100.100",
      serverDeviceId: modem,
    });
  });

  it("T-CP2-038 同一网段两台开着 DHCP 的路由器 → 先出现的分配，记进 dhcpConflicts", () => {
    const topology = emptyTopology();
    const r1 = addDevice(topology, "router");
    const r2 = addDevice(topology, "router");
    const pc = addDevice(topology, "pc");
    if (r2.type !== "router") throw new Error("类型不对");
    r2.config.lan = { ip: "192.168.1.2", mask: "255.255.255.0" };
    connect(topology, r1.id, "lan2", r2.id, "lan1");
    connect(topology, r1.id, "lan1", pc.id, "eth0");

    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(pc.id, "eth0")?.serverDeviceId).toBe(r1.id);
    expect(runtime.dhcpConflicts).toHaveLength(1);
    expect(runtime.dhcpConflicts[0]?.deviceIds).toEqual([r1.id, r2.id]);
    expect(runtime.dhcpConflicts[0]?.subnet).toBe("192.168.1.0/24");
  });

  it("T-CP2-039 VLAN 10 池只有一个地址 → 第二台 pool-exhausted", () => {
    const { topology, router, a, b } = threeClients();
    const vlan10 = router.config.vlans?.find((v) => v.id === 10);
    if (!vlan10) throw new Error("少了 VLAN 10");
    vlan10.dhcp.rangeEnd = "192.168.10.100";

    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(a, "eth0")?.ip).toBe("192.168.10.100");
    expect(runtime.leaseOf(b, "eth0")?.status).toBe("pool-exhausted");
    expect(device(topology, b).type).toBe("pc");
  });
});
