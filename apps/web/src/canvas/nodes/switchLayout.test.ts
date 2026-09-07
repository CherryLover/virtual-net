import { describe, expect, it } from "vitest";
import type { Port } from "../../engine";
import { switchLayout } from "./switchLayout";

function ports(count: number): Port[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `port${i + 1}`,
    mac: "",
    linkId: null,
  }));
}

describe("switch port layout", () => {
  it("splits ordinary switches across top and bottom without duplicating any port", () => {
    const input = ports(4);
    const layout = switchLayout(input);
    expect(layout.groups.top).toEqual(input.slice(0, 2));
    expect(layout.groups.bottom).toEqual(input.slice(2));
    expect(Object.values(layout.groups).flat()).toHaveLength(4);
  });
  it("bounds 48-port width and keeps every port unique and identifiable", () => {
    const input = ports(48);
    const layout = switchLayout(input);
    expect(layout.width).toBeLessThanOrEqual(640);
    expect(layout.groups.top).toHaveLength(24);
    expect(
      new Set(
        Object.values(layout.groups)
          .flat()
          .map((port) => port.id),
      ).size,
    ).toBe(48);
    for (const port of input) port.displaySide = "top";
    const oneSide = switchLayout(input);
    expect(oneSide.width).toBe(640);
    expect(oneSide.width / oneSide.groups.top.length).toBeGreaterThan(12);
  });
  it("moving a logical port preserves its identity, occupancy and VLAN", () => {
    const input = ports(48);
    for (const port of input) port.displaySide = "left";
    const first = input[0];
    if (!first) throw new Error("fixture empty");
    first.linkId = "link1";
    first.vlan = { mode: "access", pvid: 20 };
    const layout = switchLayout(input);
    expect(layout.groups.left[0]).toBe(first);
    expect(layout.height / layout.groups.left.length).toBeGreaterThanOrEqual(26);
    expect(layout.width).toBe(200);
  });
});
