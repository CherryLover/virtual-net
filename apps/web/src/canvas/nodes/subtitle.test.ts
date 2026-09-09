import { describe, expect, it } from "vitest";
import { buildRuntime, createDevice, createEmptyTopology } from "../../engine";
import { nodeSubtitle } from "./subtitle";

describe("internet node subtitle", () => {
  it.each([
    ["203.0.113.1", "255.255.255.0", "203.0.113.1/24"],
    ["203.0.113.1", "0.0.0.0", "203.0.113.1/0"],
    ["203.0.113.1", "", "203.0.113.1"],
    ["203.0.113.1", "invalid", "203.0.113.1"],
    ["", "", "地址未知"],
  ])("formats %s with mask %s without inventing a prefix", (ip, mask, expected) => {
    const topology = createEmptyTopology();
    const device = createDevice("internet", { x: 0, y: 0 }, topology);
    if (device.type !== "internet") throw new Error("Wrong fixture type");
    device.config.access.ip = ip;
    device.config.access.mask = mask;
    expect(nodeSubtitle(device, buildRuntime(topology))).toBe(expected);
  });
});
