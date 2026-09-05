import { describe, expect, it } from "vitest";
import { buildRuntime, leaseOf, lint, ping, sampleTopology } from "./index";

describe("示例拓扑", () => {
  it("互联网 + 路由器 + 两台电脑，三根线", () => {
    const topology = sampleTopology();
    expect(topology.name).toBe("示例网络");
    expect(topology.devices.map((d) => d.name)).toEqual(["互联网", "路由器1", "电脑1", "电脑2"]);
    expect(topology.links).toHaveLength(3);
    // 三根线两端的端口都记上了 linkId
    const linked = topology.devices.flatMap((d) => d.ports).filter((p) => p.linkId !== null);
    expect(linked).toHaveLength(6);
  });

  it("端口 MAC 各不相同", () => {
    const macs = sampleTopology()
      .devices.flatMap((d) => d.ports)
      .map((p) => p.mac);
    expect(new Set(macs).size).toBe(macs.length);
  });

  it("两台电脑都拿到地址，没有错误", () => {
    const topology = sampleTopology();
    const runtime = buildRuntime(topology);
    for (const name of ["电脑1", "电脑2"]) {
      const pc = topology.devices.find((d) => d.name === name);
      if (!pc) throw new Error(`示例里没有 ${name}`);
      const lease = leaseOf(runtime, pc.id, "eth0");
      expect(lease?.status).toBe("ok");
      expect(lease?.ip).toMatch(/^192\.168\.1\./);
    }
    expect(lint(topology).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("电脑1 ping 外网通，路径五跳", () => {
    const topology = sampleTopology();
    const pc = topology.devices.find((d) => d.name === "电脑1");
    if (!pc) throw new Error("示例里没有电脑1");
    const result = ping(topology, { sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    expect(result.verdict).toBe("ok");
    expect(result.path).toHaveLength(5);
  });
});
