import { describe, expect, it } from "vitest";
import {
  addDevice,
  connect,
  device,
  emptyTopology,
  minimalTopology,
  PC1,
  R1,
  setStatic,
  unplug,
} from "../test-support/fixtures";
import { lint } from "./index";

function ids(issues: { ruleId: string }[]): string[] {
  return issues.map((i) => i.ruleId);
}

function routerOf(topology: ReturnType<typeof minimalTopology>, deviceId: string) {
  const found = device(topology, deviceId);
  if (found.type !== "router") throw new Error("类型不对");
  return found;
}

describe("CP1-S7 静态检查", () => {
  it("T-CP1-030 fixture 拓扑没有任何问题", () => {
    expect(lint(minimalTopology())).toEqual([]);
  });

  it("T-CP1-031 网关不在本网段 → 恰好一条 L002", () => {
    const topology = minimalTopology();
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "10.0.0.1", "192.168.1.1");
    const issues = lint(topology);

    expect(issues).toHaveLength(1);
    const first = issues[0];
    expect(first?.ruleId).toBe("L002");
    expect(first?.severity).toBe("error");
    expect(first?.targets[0]).toEqual({ deviceId: PC1, field: "gateway" });
    expect(first?.message).toContain("10.0.0.1");
    expect(first?.message).toContain("192.168.1.0/24");
  });

  it("T-CP1-032 两台电脑同一个地址 → L001，targets 两台电脑", () => {
    const topology = emptyTopology();
    const a = addDevice(topology, "pc");
    const b = addDevice(topology, "pc");
    const router = addDevice(topology, "router");
    connect(topology, a.id, "eth0", router.id, "lan1");
    connect(topology, b.id, "eth0", router.id, "lan2");
    setStatic(topology, a.id, "192.168.1.10", "255.255.255.0", "192.168.1.1", "192.168.1.1");
    setStatic(topology, b.id, "192.168.1.10", "255.255.255.0", "192.168.1.1", "192.168.1.1");

    const conflicts = lint(topology).filter((i) => i.ruleId === "L001");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.targets.map((t) => t.deviceId)).toEqual([a.id, b.id]);
    expect(conflicts[0]?.message).toContain("192.168.1.10");
    expect(conflicts[0]?.message).toContain("电脑1 和 电脑2");
  });

  it("T-CP1-033 直连两端不同网段 → L004 带 linkId；掩码不同但互相包含 → 只报 L005", () => {
    const topology = emptyTopology();
    const pc = addDevice(topology, "pc");
    const router = addDevice(topology, "router");
    const link = connect(topology, pc.id, "eth0", router.id, "lan1");
    setStatic(topology, pc.id, "192.168.2.10", "255.255.255.0", "192.168.2.1", "192.168.2.1");

    const first = lint(topology).filter((i) => i.ruleId === "L004");
    expect(first).toHaveLength(1);
    expect(first[0]?.linkId).toBe(link.id);
    expect(first[0]?.targets.map((t) => t.deviceId)).toEqual([pc.id, router.id]);

    setStatic(topology, pc.id, "192.168.1.10", "255.255.0.0", "192.168.1.1", "192.168.1.1");
    const second = ids(lint(topology));
    expect(second).toContain("L005");
    expect(second).not.toContain("L004");
  });

  it("T-CP1-034 地址池相关：L006 / L007 / L008", () => {
    const overlap = minimalTopology();
    setStatic(overlap, PC1, "192.168.1.150", "255.255.255.0", "192.168.1.1", "192.168.1.1");
    const l006 = lint(overlap).filter((i) => i.ruleId === "L006");
    expect(l006).toHaveLength(1);
    expect(l006[0]?.message).toContain("192.168.1.100–192.168.1.199");
    expect(l006[0]?.targets.map((t) => t.deviceId)).toEqual([PC1, R1]);

    const selfInPool = minimalTopology();
    routerOf(selfInPool, R1).config.lan.ip = "192.168.1.100";
    expect(ids(lint(selfInPool))).toContain("L007");

    const offSubnet = minimalTopology();
    const router = routerOf(offSubnet, R1);
    router.config.dhcp.rangeStart = "192.168.2.100";
    router.config.dhcp.rangeEnd = "192.168.2.199";
    const l008 = lint(offSubnet).filter((i) => i.ruleId === "L008");
    expect(l008).toHaveLength(1);
    expect(l008[0]?.message).toContain("192.168.1.0/24");

    const reversed = minimalTopology();
    const r2 = routerOf(reversed, R1);
    r2.config.dhcp.rangeStart = "192.168.1.199";
    r2.config.dhcp.rangeEnd = "192.168.1.100";
    expect(lint(reversed).find((i) => i.ruleId === "L008")?.message).toContain(
      "起始地址大于结束地址",
    );
  });

  it("T-CP1-035 L013 / L009 / L011", () => {
    const natOff = minimalTopology();
    routerOf(natOff, R1).config.nat = false;
    const l013 = lint(natOff).filter((i) => i.ruleId === "L013");
    expect(l013).toHaveLength(1);
    expect(l013[0]?.targets[0]).toEqual({ deviceId: R1, field: "nat" });

    const noWan = minimalTopology();
    unplug(noWan, "l_2");
    const l009 = lint(noWan).filter((i) => i.ruleId === "L009");
    expect(l009).toHaveLength(1);
    expect(l009[0]?.message).toContain("WAN 口没有连线");

    const badIp = minimalTopology();
    setStatic(badIp, PC1, "300.1.1.1", "255.255.255.0", "192.168.1.1", "192.168.1.1");
    const l011 = lint(badIp).filter((i) => i.ruleId === "L011");
    expect(l011).toHaveLength(1);
    expect(l011[0]?.message).toBe('IP "300.1.1.1" 不是合法的 IP 地址');
    expect(l011[0]?.targets[0]).toEqual({ deviceId: PC1, field: "ip" });
  });

  it("L003 / L010 / L012 也能报出来，输出按 error 在前排序", () => {
    const topology = minimalTopology();
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "", "");
    const issues = lint(topology);
    expect(ids(issues)).toEqual(["L003", "L012"]);

    const noServer = minimalTopology();
    routerOf(noServer, R1).config.dhcp.enabled = false;
    const l010 = lint(noServer).filter((i) => i.ruleId === "L010");
    expect(l010).toHaveLength(1);
    expect(l010[0]?.message).toBe("自动获取地址失败：所在网段没有 DHCP 服务器");

    const mixed = minimalTopology();
    routerOf(mixed, R1).config.nat = false;
    routerOf(mixed, R1).config.lan.ip = "192.168.1.100";
    const order = lint(mixed);
    expect(order[0]?.severity).toBe("error");
    expect(order[order.length - 1]?.severity).toBe("warning");
  });

  it("非法地址不会让检查抛异常", () => {
    const topology = minimalTopology();
    setStatic(topology, PC1, "300.1.1.1", "255.255.0.255", "abc", "!!!");
    const router = routerOf(topology, R1);
    router.config.lan = { ip: "", mask: "" };
    router.config.dhcp.rangeStart = "不是地址";
    expect(() => lint(topology)).not.toThrow();
  });
});
