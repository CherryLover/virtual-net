import { describe, expect, it } from "vitest";
import { createDevice, createEmptyTopology } from "./defaults";
import type { Topology } from "./topology";

describe("CP1-S1 默认值工厂", () => {
  it("T-CP1-001 空拓扑连续创建 电脑、路由器、互联网", () => {
    const topology: Topology = createEmptyTopology();

    const pc = createDevice("pc", { x: 0, y: 0 }, topology);
    topology.devices.push(pc);
    const router = createDevice("router", { x: 0, y: 0 }, topology);
    topology.devices.push(router);
    const internet = createDevice("internet", { x: 0, y: 0 }, topology);
    topology.devices.push(internet);

    expect(pc.name).toBe("电脑1");
    expect(router.name).toBe("路由器1");
    expect(internet.name).toBe("互联网");

    expect(pc.ports.map((p) => p.name)).toEqual(["eth0"]);
    expect(router.ports.map((p) => p.name)).toEqual(["wan", "lan1", "lan2", "lan3", "lan4"]);
    expect(internet.ports.map((p) => p.name)).toEqual(["port1"]);

    const macs = topology.devices.flatMap((d) => d.ports.map((p) => p.mac));
    expect(macs).toEqual([
      "02:00:00:00:00:01",
      "02:00:00:00:00:02",
      "02:00:00:00:00:03",
      "02:00:00:00:00:04",
      "02:00:00:00:00:05",
      "02:00:00:00:00:06",
      "02:00:00:00:00:07",
    ]);
  });

  it("T-CP1-001 同类设备序号递增", () => {
    const topology = createEmptyTopology();
    topology.devices.push(createDevice("pc", { x: 0, y: 0 }, topology));
    const pc2 = createDevice("pc", { x: 0, y: 0 }, topology);
    expect(pc2.name).toBe("电脑2");
  });

  it("T-CP1-001 默认配置符合文档", () => {
    const topology = createEmptyTopology();
    const router = createDevice("router", { x: 0, y: 0 }, topology);
    if (router.type !== "router") throw new Error("类型不对");
    expect(router.config.lan).toEqual({ ip: "192.168.1.1", mask: "255.255.255.0" });
    expect(router.config.dhcp).toEqual({
      enabled: true,
      rangeStart: "192.168.1.100",
      rangeEnd: "192.168.1.199",
      leaseHours: 24,
    });
    expect(router.config.nat).toBe(true);

    const pc = createDevice("pc", { x: 0, y: 0 }, topology);
    if (pc.type !== "pc") throw new Error("类型不对");
    expect(pc.config.addressMode).toBe("dhcp");

    const internet = createDevice("internet", { x: 0, y: 0 }, topology);
    if (internet.type !== "internet") throw new Error("类型不对");
    expect(internet.config.access.ip).toBe("203.0.113.1");
    expect(internet.config.targets.map((t) => t.domain)).toEqual([
      "dns.google",
      "www.baidu.com",
      "www.google.com",
    ]);
  });
});
