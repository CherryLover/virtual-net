import { describe, expect, it } from "vitest";
import { createDevice, createEmptyTopology } from "./defaults";
import type { Topology } from "./topology";
import { parseAllowedList, vlanOf } from "./vlan";

describe("CP2-S1 新设备与 VLAN 工具", () => {
  it("T-CP2-001 空拓扑连续创建 交换机、AP、光猫", () => {
    const topology: Topology = createEmptyTopology();
    const sw = createDevice("switch", { x: 0, y: 0 }, topology);
    topology.devices.push(sw);
    const ap = createDevice("ap", { x: 0, y: 0 }, topology);
    topology.devices.push(ap);
    const modem = createDevice("modem", { x: 0, y: 0 }, topology);
    topology.devices.push(modem);

    expect(sw.name).toBe("交换机1");
    expect(ap.name).toBe("AP1");
    expect(modem.name).toBe("光猫1");

    expect(sw.ports.map((p) => p.name)).toEqual([
      "port1",
      "port2",
      "port3",
      "port4",
      "port5",
      "port6",
      "port7",
      "port8",
    ]);
    for (const port of sw.ports) expect(port.vlan).toEqual({ mode: "access", pvid: 1 });
    expect(ap.ports.map((p) => p.name)).toEqual(["uplink", "wlan1"]);
    expect(modem.ports.map((p) => p.name)).toEqual(["wan", "lan1"]);

    const macs = topology.devices.flatMap((d) => d.ports.map((p) => p.mac));
    expect(macs[0]).toBe("02:00:00:00:00:01");
    expect(macs[7]).toBe("02:00:00:00:00:08");
    // AP 接着交换机顺延，光猫再接着 AP
    expect(macs[8]).toBe("02:00:00:00:00:09");
    expect(macs[10]).toBe("02:00:00:00:00:0b");
    expect(new Set(macs).size).toBe(macs.length);

    if (sw.type !== "switch" || ap.type !== "ap" || modem.type !== "modem") {
      throw new Error("类型不对");
    }
    expect(sw.config.portCount).toBe(8);
    expect(ap.config.ssid).toBe("Home-WiFi");
    expect(modem.config.mode).toBe("bridge");
    expect(modem.config.lan).toEqual({ ip: "192.168.100.1", mask: "255.255.255.0" });
  });

  it("T-CP2-004 vlanOf 回退与放行列表解析", () => {
    expect(vlanOf({ id: "p", name: "lan1", mac: "", linkId: null })).toEqual({
      mode: "access",
      pvid: 1,
    });

    expect(parseAllowedList("10, 20,20")).toEqual({ ok: true, ids: [10, 20] });
    expect(parseAllowedList("0").ok).toBe(false);
    expect(parseAllowedList("4095").ok).toBe(false);
    expect(parseAllowedList("").ids).toEqual([]);
    expect(parseAllowedList("abc").ok).toBe(false);
  });
});
