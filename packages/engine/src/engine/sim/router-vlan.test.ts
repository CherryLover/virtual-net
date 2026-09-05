import { describe, expect, it } from "vitest";
import {
  access,
  addDevice,
  connect,
  device,
  emptyTopology,
  portIdOf,
  setStatic,
  setVlan,
} from "../../test-support/fixtures";
import { modemChain, oneArmRouter } from "../../test-support/topologies";
import { buildRuntime } from "../runtime";
import { ping } from "./ping";

/** 路由器 lan1 access 10、lan2 access 20，A、C 分别直连 */
function multiLanPorts() {
  const topology = emptyTopology();
  const router = addDevice(topology, "router");
  const a = addDevice(topology, "pc");
  const c = addDevice(topology, "pc");
  if (router.type !== "router") throw new Error("类型不对");
  router.config.vlans = [
    { id: 10, ip: "192.168.10.1", mask: "255.255.255.0", dhcp: off() },
    { id: 20, ip: "192.168.20.1", mask: "255.255.255.0", dhcp: off() },
  ];
  connect(topology, router.id, "lan1", a.id, "eth0");
  connect(topology, router.id, "lan2", c.id, "eth0");
  setVlan(topology, router.id, "lan1", access(10));
  setVlan(topology, router.id, "lan2", access(20));
  setStatic(topology, a.id, "192.168.10.10", "255.255.255.0", "192.168.10.1");
  setStatic(topology, c.id, "192.168.20.10", "255.255.255.0", "192.168.20.1");
  return { topology, router: router.id, a: a.id, c: c.id };
}

function off() {
  return { enabled: false, rangeStart: "", rangeEnd: "", leaseHours: 24 };
}

describe("CP2-S6 路由器 WAN 模式与 VLAN 子接口", () => {
  it("T-CP2-028 路由器拨号拿到地址", () => {
    const { topology, internet, router, pc } = modemChain();
    const inet = device(topology, internet);
    const r = device(topology, router);
    if (inet.type !== "internet" || r.type !== "router") throw new Error("类型不对");
    inet.config.access.mode = "pppoe";
    r.config.wan = { mode: "pppoe", pppoe: { username: "test", password: "test" } };

    const lease = buildRuntime(topology).leaseOf(router, "wan");
    expect(lease).toMatchObject({ status: "ok", via: "pppoe", ip: "203.0.113.2" });
    expect(lease?.gateway).toBe("203.0.113.1");
    expect(ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" }).verdict).toBe("ok");
  });

  it("T-CP2-029 手动配置 WAN：地址即静态值；网关没人用 → ARP_MISS", () => {
    const topology = emptyTopology();
    const router = addDevice(topology, "router");
    const internet = addDevice(topology, "internet");
    const pc = addDevice(topology, "pc");
    if (router.type !== "router") throw new Error("类型不对");
    router.config.wan = {
      mode: "static",
      static: {
        ip: "203.0.113.50",
        mask: "255.255.255.0",
        gateway: "203.0.113.1",
        dns: "8.8.8.8",
      },
    };
    connect(topology, router.id, "wan", internet.id, "port1");
    connect(topology, router.id, "lan1", pc.id, "eth0");

    const runtime = buildRuntime(topology);
    expect(runtime.ifaceOf(router.id, "wan")?.ip).toBe("203.0.113.50");
    expect(runtime.leaseOf(router.id, "wan")?.via).toBe("static");
    expect(ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" }).verdict).toBe("ok");

    if (router.config.wan.static) router.config.wan.static.gateway = "203.0.113.99";
    const broken = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(broken.reasonCode).toBe("ARP_MISS");
    expect(broken.reason).toContain("网关");
  });

  it("T-CP2-030 单臂路由：一根 trunk 线上进出，标签 10 进 20 出", () => {
    const { topology, routerId, sw, a, c } = oneArmRouter();
    const result = ping(topology, { sourceDeviceId: a, targetIp: "192.168.20.10" });

    expect(result.verdict).toBe("ok");
    expect(result.decisions).toHaveLength(9);
    expect(result.path).toEqual([a, sw, routerId, sw, c, sw, routerId, sw, a]);

    expect(result.decisions[1]?.deviceId).toBe(sw);
    expect(result.decisions[1]?.packetOut?.vlan).toBe(10);

    const lan1 = portIdOf(topology, routerId, "lan1");
    const routed = result.decisions[2];
    expect(routed?.deviceId).toBe(routerId);
    expect(routed?.portIn).toBe(lan1);
    expect(routed?.portOut).toBe(lan1);
    expect(routed?.packetIn?.vlan).toBe(10);
    expect(routed?.packetOut?.vlan).toBe(20);
    expect(routed?.basis.route?.iface).toBe("br-lan.20");
    expect(routed?.note).toContain("VLAN 10");
    expect(routed?.note).toContain("VLAN 20");
  });

  it("T-CP2-031 trunk 只放行 10 → 停在路由器，定位到交换机 port1", () => {
    const { topology, routerId, sw, a } = oneArmRouter({ switchAllowed: [10] });
    const result = ping(topology, { sourceDeviceId: a, targetIp: "192.168.20.10" });

    expect(result.verdict).toBe("fail");
    expect(result.stoppedAt).toBe(routerId);
    expect(result.reasonCode).toBe("TRUNK_NOT_ALLOWED");
    expect(result.fixAt).toEqual({ deviceId: sw, portId: portIdOf(topology, sw, "port1") });
  });

  it("T-CP2-032 多 LAN 口接法：lan1 与 lan2 分属两个 VLAN 也能路由", () => {
    const { topology, router, a, c } = multiLanPorts();
    const result = ping(topology, { sourceDeviceId: a, targetIp: "192.168.20.10" });

    expect(result.verdict).toBe("ok");
    expect(result.path).toEqual([a, router, c, router, a]);
    const routed = result.decisions[1];
    expect(routed?.portIn).toBe(portIdOf(topology, router, "lan1"));
    expect(routed?.portOut).toBe(portIdOf(topology, router, "lan2"));
    expect(routed?.packetIn?.vlan ?? null).toBeNull();
    expect(routed?.packetOut?.vlan ?? null).toBeNull();
  });

  it("T-CP2-033 VLAN 里的电脑上外网，出向 NAT 用 WAN 地址", () => {
    const { topology, routerId, a } = oneArmRouter();
    const result = ping(topology, { sourceDeviceId: a, targetIp: "8.8.8.8" });

    expect(result.verdict).toBe("ok");
    const wanIp = buildRuntime(topology).ifaceOf(routerId, "wan")?.ip;
    const nat = result.decisions.find((d) => d.basis.nat?.direction === "out")?.basis.nat;
    expect(nat?.before.ip).toBe("192.168.10.10");
    expect(nat?.after.ip).toBe(wanIp);
  });

  it("T-CP2-034 WAN 与 LAN 网段重叠 → 路由表标记并停在路由器", () => {
    const { topology, modem, router, pc } = modemChain({ mode: "route" });
    const m = device(topology, modem);
    if (m.type !== "modem") throw new Error("类型不对");
    m.config.lan = { ip: "192.168.1.1", mask: "255.255.255.0" };
    m.config.dhcp = {
      enabled: true,
      rangeStart: "192.168.1.100",
      rangeEnd: "192.168.1.199",
      leaseHours: 24,
    };

    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(router, "wan")?.ip).toBe("192.168.1.100");
    expect((runtime.routes[router] ?? []).some((r) => r.wanLanOverlap)).toBe(true);

    const result = ping(topology, { sourceDeviceId: pc, targetIp: "8.8.8.8" });
    expect(result.stoppedAt).toBe(router);
    expect(result.reasonCode).toBe("WAN_LAN_OVERLAP");
  });
});
