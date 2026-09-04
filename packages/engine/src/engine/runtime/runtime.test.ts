import { describe, expect, it } from "vitest";
import {
  addDevice,
  connect,
  device,
  emptyTopology,
  INET,
  minimalTopology,
  PC1,
  R1,
  setStatic,
  unplug,
} from "../../test-support/fixtures";
import { buildRuntime } from "./index";

describe("CP1-S2 buildRuntime", () => {
  it("T-CP1-005 fixture 拓扑的 LAN 与 WAN 租约", () => {
    const runtime = buildRuntime(minimalTopology());

    const pcLease = runtime.leaseOf(PC1, "eth0");
    expect(pcLease).toMatchObject({
      status: "ok",
      ip: "192.168.1.100",
      mask: "255.255.255.0",
      gateway: "192.168.1.1",
      dns: "192.168.1.1",
      serverDeviceId: R1,
    });

    const wanLease = runtime.leaseOf(R1, "wan");
    expect(wanLease).toMatchObject({
      status: "ok",
      ip: "203.0.113.2",
      mask: "255.255.255.0",
      gateway: "203.0.113.1",
      dns: "8.8.8.8",
      serverDeviceId: INET,
    });

    expect(runtime.ifaceOf(PC1, "eth0")?.ip).toBe("192.168.1.100");
    expect(runtime.ifaceOf(R1, "br-lan")?.ip).toBe("192.168.1.1");
    expect(runtime.ifaceOf(R1, "wan")?.ip).toBe("203.0.113.2");
  });

  it("T-CP1-005 网段发现把 lan1–lan4 当成一个网桥", () => {
    const topology = minimalTopology();
    const runtime = buildRuntime(topology);
    const lan2 = device(topology, R1).ports.find((p) => p.name === "lan2");
    if (!lan2) throw new Error("少了 lan2");
    const segment = runtime.segmentOf(lan2.id);
    expect(segment?.ifaceKeys).toContain(`${PC1}/eth0`);
    expect(segment?.ifaceKeys).toContain(`${R1}/br-lan`);
    expect(segment?.ifaceKeys).not.toContain(`${R1}/wan`);
  });

  it("T-CP1-006 静态占用的地址会被跳过", () => {
    const topology = minimalTopology();
    const pc2 = addDevice(topology, "pc");
    connect(topology, pc2.id, "eth0", R1, "lan2");
    setStatic(topology, pc2.id, "192.168.1.100", "255.255.255.0", "192.168.1.1");

    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(PC1, "eth0")?.ip).toBe("192.168.1.101");
  });

  it("T-CP1-007 DHCP 关掉 → no-server；地址池用完 → pool-exhausted", () => {
    const off = minimalTopology();
    const router = device(off, R1);
    if (router.type !== "router") throw new Error("类型不对");
    router.config.dhcp.enabled = false;
    expect(buildRuntime(off).leaseOf(PC1, "eth0")?.status).toBe("no-server");

    const tight = minimalTopology();
    const r = device(tight, R1);
    if (r.type !== "router") throw new Error("类型不对");
    r.config.dhcp.rangeStart = "192.168.1.100";
    r.config.dhcp.rangeEnd = "192.168.1.100";
    const pc2 = addDevice(tight, "pc");
    connect(tight, pc2.id, "eth0", R1, "lan2");
    const runtime = buildRuntime(tight);
    expect(runtime.leaseOf(PC1, "eth0")?.ip).toBe("192.168.1.100");
    expect(runtime.leaseOf(pc2.id, "eth0")?.status).toBe("pool-exhausted");
  });

  it("T-CP1-007 eth0 不连线 → no-link", () => {
    const topology = minimalTopology();
    unplug(topology, "l_1");
    expect(buildRuntime(topology).leaseOf(PC1, "eth0")?.status).toBe("no-link");
  });

  it("T-CP1-008 断开 wan → 路由器只剩 LAN 直连，没有默认路由", () => {
    const topology = minimalTopology();
    unplug(topology, "l_2");
    const runtime = buildRuntime(topology);
    expect(runtime.leaseOf(R1, "wan")?.status).toBe("no-link");
    const routes = runtime.routes[R1] ?? [];
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ dest: "192.168.1.0", iface: "br-lan", kind: "direct" });
    expect(routes.some((r) => r.kind === "default")).toBe(false);
  });

  it("T-CP1-009 网关不在本机网段 → 默认路由仍在，viaOffSubnet 为 true", () => {
    const topology = emptyTopology();
    const pc = addDevice(topology, "pc");
    const router = addDevice(topology, "router");
    connect(topology, pc.id, "eth0", router.id, "lan1");
    setStatic(topology, pc.id, "192.168.1.10", "255.255.255.0", "10.0.0.1");

    const runtime = buildRuntime(topology);
    const routes = runtime.routes[pc.id] ?? [];
    const fallback = routes.find((r) => r.kind === "default");
    expect(fallback).toMatchObject({ dest: "0.0.0.0", via: "10.0.0.1", viaOffSubnet: true });

    setStatic(topology, pc.id, "192.168.1.10", "255.255.255.0", "192.168.1.1");
    const ok = buildRuntime(topology).routes[pc.id]?.find((r) => r.kind === "default");
    expect(ok?.viaOffSubnet).toBe(false);
  });

  it("T-CP1-008 互联网路由表：接入网段直连 + 每个目标一条主机路由", () => {
    const runtime = buildRuntime(minimalTopology());
    const routes = runtime.routes[INET] ?? [];
    expect(routes.filter((r) => r.kind === "self").map((r) => r.dest)).toEqual([
      "8.8.8.8",
      "110.242.68.66",
      "142.250.72.14",
    ]);
    expect(routes.some((r) => r.kind === "direct" && r.dest === "203.0.113.0")).toBe(true);
  });
});
