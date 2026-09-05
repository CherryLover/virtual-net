import { describe, expect, it } from "vitest";
import {
  access,
  addDevice,
  connect,
  device,
  emptyTopology,
  homeOfficeTopology,
  portIdOf,
  setStatic,
  setVlan,
  trunk,
} from "../test-support/fixtures";
import { loopTopology, modemChain, oneArmRouter, twoSwitches } from "../test-support/topologies";
import { lint } from "./index";

function only(topology: Parameters<typeof lint>[0], ruleId: string) {
  return lint(topology).filter((i) => i.ruleId === ruleId);
}

describe("CP2-S8 新增静态检查", () => {
  it("T-CP2-040 home-office.json 没有任何问题", () => {
    expect(lint(homeOfficeTopology())).toEqual([]);
  });

  it("T-CP2-041 L014 两端 VLAN 不一致", () => {
    const first = twoSwitches();
    setVlan(first.topology, first.sw1, "port8", access(10));
    setVlan(first.topology, first.sw2, "port8", access(20));
    const issues = only(first.topology, "L014");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.targets.map((t) => t.portId)).toEqual([
      portIdOf(first.topology, first.sw1, "port8"),
      portIdOf(first.topology, first.sw2, "port8"),
    ]);
    expect(issues[0]?.linkId).toBeTruthy();

    const second = twoSwitches();
    setVlan(second.topology, second.sw1, "port8", trunk([10], 1));
    setVlan(second.topology, second.sw2, "port8", access(10));
    const trunkIssues = only(second.topology, "L014");
    expect(trunkIssues).toHaveLength(1);
    expect(trunkIssues[0]?.message).toContain("VLAN 1");
    expect(trunkIssues[0]?.message).toContain("VLAN 10");
  });

  it("T-CP2-042 L015 trunk 漏放行，两边放行后消失", () => {
    const missing = twoSwitches([10], [10]);
    const issues = only(missing.topology, "L015");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.targets[0]).toEqual({
      deviceId: missing.sw1,
      portId: portIdOf(missing.topology, missing.sw1, "port8"),
    });
    expect(issues[0]?.message).toContain("VLAN 20 两侧都有设备");

    const fixed = twoSwitches([10, 20], [10, 20]);
    expect(only(fixed.topology, "L015")).toHaveLength(0);
  });

  it("T-CP2-043 L016 trunk 直连电脑；L017 二层成环", () => {
    const topology = emptyTopology();
    const sw = addDevice(topology, "switch");
    const pc = addDevice(topology, "pc");
    connect(topology, sw.id, "port8", pc.id, "eth0");
    setVlan(topology, sw.id, "port8", trunk([10], 1));
    setStatic(topology, pc.id, "192.168.1.10", "255.255.255.0", "192.168.1.1", "8.8.8.8");
    const l016 = only(topology, "L016");
    expect(l016).toHaveLength(1);
    expect(l016[0]?.message).toContain("不识别 VLAN 标签");

    const looped = loopTopology();
    const l017 = only(looped.topology, "L017");
    expect(l017).toHaveLength(1);
    expect(l017[0]?.severity).toBe("error");
    const ports = l017[0]?.targets.map((t) => t.portId) ?? [];
    for (const name of ["port7", "port8"]) {
      expect(ports).toContain(portIdOf(looped.topology, looped.sw1, name));
      expect(ports).toContain(portIdOf(looped.topology, looped.sw2, name));
    }
  });

  it("T-CP2-044 L018 双层 NAT，只在光猫路由模式且路由器开着 NAT 时报", () => {
    const routed = modemChain({ mode: "route" });
    const l018 = only(routed.topology, "L018");
    expect(l018).toHaveLength(1);
    expect(l018[0]?.targets).toEqual([{ deviceId: routed.router, field: "nat" }]);
    expect(l018[0]?.message).toContain("双层 NAT");

    const natOff = modemChain({ mode: "route" });
    const router = device(natOff.topology, natOff.router);
    if (router.type !== "router") throw new Error("类型不对");
    router.config.nat = false;
    expect(only(natOff.topology, "L018")).toHaveLength(0);

    const bridged = modemChain();
    expect(only(bridged.topology, "L018")).toHaveLength(0);
  });

  it("T-CP2-045 L019 双 DHCP、L020 运营商内网、L021 接入方式不匹配", () => {
    const topology = emptyTopology();
    const r1 = addDevice(topology, "router");
    const r2 = addDevice(topology, "router");
    const pc = addDevice(topology, "pc");
    if (r2.type !== "router") throw new Error("类型不对");
    r2.config.lan = { ip: "192.168.1.2", mask: "255.255.255.0" };
    connect(topology, r1.id, "lan2", r2.id, "lan1");
    connect(topology, r1.id, "lan1", pc.id, "eth0");
    const l019 = only(topology, "L019");
    expect(l019).toHaveLength(1);
    expect(l019[0]?.targets.map((t) => t.deviceId)).toEqual([r1.id, r2.id]);

    const cgnat = modemChain();
    const inet = device(cgnat.topology, cgnat.internet);
    if (inet.type !== "internet") throw new Error("类型不对");
    inet.config.access = {
      ip: "100.64.0.1",
      mask: "255.192.0.0",
      poolStart: "100.64.0.2",
      poolEnd: "100.64.0.254",
      dns: "8.8.8.8",
      mode: "dhcp",
    };
    const l020 = only(cgnat.topology, "L020");
    expect(l020).toHaveLength(1);
    expect(l020[0]?.targets).toEqual([{ deviceId: cgnat.router, field: "wan" }]);

    const pppoe = modemChain();
    const inet2 = device(pppoe.topology, pppoe.internet);
    if (inet2.type !== "internet") throw new Error("类型不对");
    inet2.config.access.mode = "pppoe";
    const l021 = only(pppoe.topology, "L021");
    expect(l021).toHaveLength(1);
    expect(l021[0]?.severity).toBe("error");
    expect(l021[0]?.message).toContain("要求拨号");
  });

  it("T-CP2-046 L022 / L023 / L024 与 VLAN 池的 L008", () => {
    const overlap = modemChain({ mode: "route" });
    const modem = device(overlap.topology, overlap.modem);
    if (modem.type !== "modem") throw new Error("类型不对");
    modem.config.lan = { ip: "192.168.1.1", mask: "255.255.255.0" };
    modem.config.dhcp = {
      enabled: true,
      rangeStart: "192.168.1.100",
      rangeEnd: "192.168.1.199",
      leaseHours: 24,
    };
    const l022 = only(overlap.topology, "L022");
    expect(l022).toHaveLength(1);
    expect(l022[0]?.targets).toEqual([{ deviceId: overlap.router, field: "lan.ip" }]);

    const arm = oneArmRouter();
    const vlan10 = arm.router.config.vlans?.find((v) => v.id === 10);
    if (!vlan10) throw new Error("少了 VLAN 10");
    vlan10.ip = "192.168.1.1";
    const l023 = only(arm.topology, "L023");
    expect(l023).toHaveLength(1);
    expect(l023[0]?.message).toContain("重叠");
    expect(l023[0]?.targets[0]?.field).toBe("vlans.10.ip");

    const staticWan = emptyTopology();
    const router = addDevice(staticWan, "router");
    const internet = addDevice(staticWan, "internet");
    connect(staticWan, router.id, "wan", internet.id, "port1");
    if (router.type !== "router") throw new Error("类型不对");
    router.config.wan = {
      mode: "static",
      static: {
        ip: "203.0.113.50",
        mask: "255.255.255.0",
        gateway: "10.0.0.1",
        dns: "8.8.8.8",
      },
    };
    const l024 = only(staticWan, "L024");
    expect(l024).toHaveLength(1);
    expect(l024[0]?.targets[0]?.field).toBe("wan.static.gateway");

    const badPool = oneArmRouter();
    const vlan20 = badPool.router.config.vlans?.find((v) => v.id === 20);
    if (!vlan20) throw new Error("少了 VLAN 20");
    vlan20.dhcp = {
      enabled: true,
      rangeStart: "192.168.10.100",
      rangeEnd: "192.168.10.199",
      leaseHours: 24,
    };
    const l008 = only(badPool.topology, "L008");
    expect(l008).toHaveLength(1);
    expect(l008[0]?.targets[0]?.field).toBe("vlans.20.dhcp");
  });
});
