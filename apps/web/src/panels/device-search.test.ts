import { describe, expect, it } from "vitest";
import { buildRuntime, createDevice, createEmptyTopology } from "../engine";
import { createAddressRedactor } from "../privacy/display";
import { searchDevices } from "./device-search";

const identity = (text: string) => text;
function fixture() {
  const topology = createEmptyTopology();
  const router = createDevice("router", { x: 0, y: 0 }, topology);
  if (router.type !== "router") throw new Error("Expected router");
  router.name = "Office 10.25.30.1";
  router.config.lan.ip = "10.25.30.1";
  router.config.wan = {
    mode: "pppoe",
    pppoe: { username: "private-user", password: "private-password" },
  };
  topology.devices.push(router);
  topology.groups = [{ id: "office", name: "办公区 10.25.30.2", deviceIds: [router.id] }];
  return { topology, router, runtime: buildRuntime(topology) };
}

describe("canvas device search", () => {
  it("finds by trimmed case-insensitive name, configured IP and group", () => {
    const { topology, runtime, router } = fixture();
    for (const query of [" office ", "10.25.30.1", "办公区"]) {
      expect(searchDevices(topology, runtime, query, identity).map((result) => result.id)).toEqual([
        router.id,
      ]);
    }
  });

  it("includes runtime assigned addresses and does not index passwords or usernames", () => {
    const { topology, runtime, router } = fixture();
    const iface = runtime.interfaces[0];
    if (!iface) throw new Error("Expected router interface");
    iface.ip = "203.0.113.8";
    expect(searchDevices(topology, runtime, "203.0.113.8", identity)[0]?.id).toBe(router.id);
    expect(searchDevices(topology, runtime, "private-password", identity)).toEqual([]);
    expect(searchDevices(topology, runtime, "private-user", identity)).toEqual([]);
  });

  it("indexes only redacted visible fields in privacy mode, including names and groups", () => {
    const { topology, runtime, router } = fixture();
    const redact = createAddressRedactor();
    const results = searchDevices(topology, runtime, "", redact);
    expect(results[0]?.name).toContain("地址");
    expect(JSON.stringify(results)).not.toContain("10.25.30.");
    for (const query of ["10.25.30.1", "10.25.30.2", "10.25"]) {
      expect(searchDevices(topology, runtime, query, redact)).toEqual([]);
    }
    expect(searchDevices(topology, runtime, "地址 1", redact)[0]?.id).toBe(router.id);
    expect(searchDevices(topology, runtime, "办公区", redact)[0]?.id).toBe(router.id);
  });

  it("returns all devices on empty query and no matches for unknown query or empty topology", () => {
    const { topology, runtime } = fixture();
    expect(searchDevices(topology, runtime, "  ", identity)).toHaveLength(1);
    expect(searchDevices(topology, runtime, "missing", identity)).toEqual([]);
    topology.devices = [];
    expect(searchDevices(topology, runtime, "", identity)).toEqual([]);
  });
});
