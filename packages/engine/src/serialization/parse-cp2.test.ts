import { describe, expect, it } from "vitest";
import { clone, HOME_OFFICE_RAW, homeOfficeTopology } from "../test-support/fixtures";
import { parseTopology } from "./parse";

describe("CP2-S1 新设备与 VLAN 的解析", () => {
  it("T-CP2-003 home-office.json 往返相等；口数、VLAN 位置、VLAN 重复都被挡住", () => {
    const ok = parseTopology(clone(HOME_OFFICE_RAW));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const roundTrip: unknown = JSON.parse(JSON.stringify(ok.topology));
    expect(roundTrip).toEqual(HOME_OFFICE_RAW);

    const badCount = homeOfficeTopology();
    const sw = badCount.devices.find((d) => d.type === "switch");
    if (sw?.type !== "switch") throw new Error("fixture 少了交换机");
    sw.config.portCount = 7;
    const countResult = parseTopology(badCount);
    expect(countResult.ok).toBe(false);
    if (countResult.ok) return;
    expect(countResult.errors.some((e) => e.message.includes("端口数"))).toBe(true);

    const badVlan = homeOfficeTopology();
    const pc = badVlan.devices.find((d) => d.type === "pc");
    const eth0 = pc?.ports[0];
    if (!eth0) throw new Error("fixture 少了电脑");
    eth0.vlan = { mode: "access", pvid: 10 };
    const vlanResult = parseTopology(badVlan);
    expect(vlanResult.ok).toBe(false);
    if (vlanResult.ok) return;
    expect(vlanResult.errors.some((e) => e.message.includes("不支持 VLAN"))).toBe(true);

    const dupVlan = homeOfficeTopology();
    const router = dupVlan.devices.find((d) => d.type === "router");
    if (router?.type !== "router") throw new Error("fixture 少了路由器");
    router.config.vlans = [
      { id: 10, ip: "192.168.10.1", mask: "255.255.255.0", dhcp: dhcpOf() },
      { id: 10, ip: "192.168.11.1", mask: "255.255.255.0", dhcp: dhcpOf() },
    ];
    expect(parseTopology(dupVlan).ok).toBe(false);
  });
});

function dhcpOf() {
  return {
    enabled: true,
    rangeStart: "192.168.10.100",
    rangeEnd: "192.168.10.199",
    leaseHours: 24,
  };
}
