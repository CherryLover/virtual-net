/** 测试专用：CP2 里反复用到的几张小拓扑 */

import type { RouterDevice, Topology } from "../model/topology";
import { access, addDevice, connect, emptyTopology, setStatic, setVlan, trunk } from "./fixtures";

/** 交换机 port1/2/3 分别接 A、B、C，VLAN 10 / 10 / 20，三台同网段地址 */
export function vlanThreePcs(): {
  topology: Topology;
  sw: string;
  a: string;
  b: string;
  c: string;
} {
  const topology = emptyTopology();
  const sw = addDevice(topology, "switch");
  const a = addDevice(topology, "pc");
  const b = addDevice(topology, "pc");
  const c = addDevice(topology, "pc");
  connect(topology, sw.id, "port1", a.id, "eth0");
  connect(topology, sw.id, "port2", b.id, "eth0");
  connect(topology, sw.id, "port3", c.id, "eth0");
  setVlan(topology, sw.id, "port1", access(10));
  setVlan(topology, sw.id, "port2", access(10));
  setVlan(topology, sw.id, "port3", access(20));
  setStatic(topology, a.id, "192.168.1.10", "255.255.255.0");
  setStatic(topology, b.id, "192.168.1.11", "255.255.255.0");
  setStatic(topology, c.id, "192.168.1.20", "255.255.255.0");
  return { topology, sw: sw.id, a: a.id, b: b.id, c: c.id };
}

/** 两台交换机 port8–port8 相连，A 在交换机1 VLAN 20、E 在交换机2 VLAN 20 */
export function twoSwitches(
  allowed1: number[] = [10],
  allowed2: number[] = [10],
): { topology: Topology; sw1: string; sw2: string; a: string; e: string } {
  const topology = emptyTopology();
  const sw1 = addDevice(topology, "switch");
  const sw2 = addDevice(topology, "switch");
  const a = addDevice(topology, "pc");
  const e = addDevice(topology, "pc");
  connect(topology, sw1.id, "port8", sw2.id, "port8");
  connect(topology, sw1.id, "port1", a.id, "eth0");
  connect(topology, sw2.id, "port1", e.id, "eth0");
  setVlan(topology, sw1.id, "port8", trunk(allowed1, 1));
  setVlan(topology, sw2.id, "port8", trunk(allowed2, 1));
  setVlan(topology, sw1.id, "port1", access(20));
  setVlan(topology, sw2.id, "port1", access(20));
  setStatic(topology, a.id, "192.168.1.10", "255.255.255.0");
  setStatic(topology, e.id, "192.168.1.30", "255.255.255.0");
  return { topology, sw1: sw1.id, sw2: sw2.id, a: a.id, e: e.id };
}

/** 交换机1 port7、port8 分别连交换机2 的 port7、port8：二层成环 */
export function loopTopology(): {
  topology: Topology;
  sw1: string;
  sw2: string;
  a: string;
  b: string;
  link7: string;
  link8: string;
} {
  const topology = emptyTopology();
  const sw1 = addDevice(topology, "switch");
  const sw2 = addDevice(topology, "switch");
  const a = addDevice(topology, "pc");
  const b = addDevice(topology, "pc");
  const link7 = connect(topology, sw1.id, "port7", sw2.id, "port7");
  const link8 = connect(topology, sw1.id, "port8", sw2.id, "port8");
  connect(topology, sw1.id, "port1", a.id, "eth0");
  connect(topology, sw2.id, "port1", b.id, "eth0");
  setStatic(topology, a.id, "192.168.1.10", "255.255.255.0");
  setStatic(topology, b.id, "192.168.1.11", "255.255.255.0");
  return {
    topology,
    sw1: sw1.id,
    sw2: sw2.id,
    a: a.id,
    b: b.id,
    link7: link7.id,
    link8: link8.id,
  };
}

/**
 * 单臂路由：路由器 lan1 trunk 放行 10、20，交换机 port1 也是 trunk，
 * port2 access 10 接 A，port3 access 20 接 C。
 */
export function oneArmRouter(options: { switchAllowed?: number[]; dhcp?: boolean } = {}): {
  topology: Topology;
  router: RouterDevice;
  routerId: string;
  sw: string;
  a: string;
  c: string;
  internet: string;
} {
  const dhcp = options.dhcp ?? false;
  const topology = emptyTopology();
  const router = addDevice(topology, "router");
  const sw = addDevice(topology, "switch");
  const internet = addDevice(topology, "internet");
  const a = addDevice(topology, "pc");
  const c = addDevice(topology, "pc");
  if (router.type !== "router") throw new Error("类型不对");
  router.config.vlans = [
    {
      id: 10,
      ip: "192.168.10.1",
      mask: "255.255.255.0",
      dhcp: {
        enabled: dhcp,
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
        enabled: dhcp,
        rangeStart: "192.168.20.100",
        rangeEnd: "192.168.20.199",
        leaseHours: 24,
      },
    },
  ];
  connect(topology, router.id, "lan1", sw.id, "port1");
  connect(topology, router.id, "wan", internet.id, "port1");
  connect(topology, sw.id, "port2", a.id, "eth0");
  connect(topology, sw.id, "port3", c.id, "eth0");
  setVlan(topology, router.id, "lan1", trunk([10, 20], 1));
  setVlan(topology, sw.id, "port1", trunk(options.switchAllowed ?? [10, 20], 1));
  setVlan(topology, sw.id, "port2", access(10));
  setVlan(topology, sw.id, "port3", access(20));
  if (!dhcp) {
    setStatic(topology, a.id, "192.168.10.10", "255.255.255.0", "192.168.10.1", "8.8.8.8");
    setStatic(topology, c.id, "192.168.20.10", "255.255.255.0", "192.168.20.1", "8.8.8.8");
  }
  return {
    topology,
    router,
    routerId: router.id,
    sw: sw.id,
    a: a.id,
    c: c.id,
    internet: internet.id,
  };
}

/** 互联网 — 光猫 — 路由器 — 电脑 */
export function modemChain(options: { mode?: "bridge" | "route" } = {}): {
  topology: Topology;
  internet: string;
  modem: string;
  router: string;
  pc: string;
} {
  const topology = emptyTopology();
  const internet = addDevice(topology, "internet");
  const modem = addDevice(topology, "modem");
  const router = addDevice(topology, "router");
  const pc = addDevice(topology, "pc");
  if (modem.type !== "modem") throw new Error("类型不对");
  modem.config.mode = options.mode ?? "bridge";
  connect(topology, internet.id, "port1", modem.id, "wan");
  connect(topology, modem.id, "lan1", router.id, "wan");
  connect(topology, router.id, "lan1", pc.id, "eth0");
  return { topology, internet: internet.id, modem: modem.id, router: router.id, pc: pc.id };
}
