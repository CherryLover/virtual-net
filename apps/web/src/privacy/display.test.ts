import { describe, expect, it } from "vitest";
import { sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { createAddressRedactor, usePrivacyStore } from "./display";

describe("address privacy", () => {
  it("uses consistent aliases for public, private, embedded and CIDR addresses", () => {
    const display = createAddressRedactor();
    expect(display("192.168.1.1 -> 8.8.8.8")).toBe("地址 1 -> 地址 2");
    expect(display("http://8.8.8.8:8080/ 192.168.1.1/24")).toBe("http://地址 2:8080/ 地址 1/24");
    expect(display("主机192.168.1.1，网关8.8.8.8")).toBe("主机地址 1，网关地址 2");
    expect(display("0.0.0.0 255.255.255.255")).toBe("地址 3 地址 4");
  });
  it("does not replace invalid addresses or ordinary numeric labels", () => {
    const display = createAddressRedactor();
    expect(display("VLAN 100 999.1.1.1 1.2.3.4.5 1234.1.1.1")).toBe(
      "VLAN 100 999.1.1.1 1.2.3.4.5 1234.1.1.1",
    );
  });
  it("does not change the network, runtime, validation or undo history", () => {
    useTopologyStore.getState().replaceTopology(sampleTopology());
    const before = useTopologyStore.getState();
    usePrivacyStore.getState().toggle();
    expect(usePrivacyStore.getState().hidden).toBe(true);
    expect(useTopologyStore.getState()).toBe(before);
    usePrivacyStore.getState().toggle();
    expect(usePrivacyStore.getState().hidden).toBe(false);
    expect(useTopologyStore.getState()).toBe(before);
  });
});
