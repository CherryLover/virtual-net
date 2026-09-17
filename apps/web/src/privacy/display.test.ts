import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { createAddressRedactor, createPrivacyStore, usePrivacyStore } from "./display";

describe("address privacy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("restores hidden state on reload and remembers explicitly showing addresses", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const first = createPrivacyStore();
    expect(first.getState().hidden).toBe(false);
    first.getState().toggle();
    const reloaded = createPrivacyStore();
    expect(reloaded.getState().hidden).toBe(true);
    reloaded.getState().toggle();
    expect(createPrivacyStore().getState().hidden).toBe(false);
  });

  it("continues toggling when browser storage throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const store = createPrivacyStore();
    expect(store.getState().hidden).toBe(false);
    store.getState().toggle();
    expect(store.getState().hidden).toBe(true);
    store.getState().toggle();
    expect(store.getState().hidden).toBe(false);
  });
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
