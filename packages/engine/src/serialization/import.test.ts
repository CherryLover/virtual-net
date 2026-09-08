import { describe, expect, it } from "vitest";
import { createDevice, createEmptyTopology as emptyTopology } from "../model/defaults";
import { parseTopology } from "./parse";

function fixture() {
  const topology = emptyTopology();
  const device = createDevice("pc", { x: 0, y: 0 }, topology);
  topology.devices.push(device);
  return { topology, device };
}
describe("import preservation and presentation", () => {
  it("round-trips groups and graph colors without inventing fields for old files", () => {
    const { topology, device } = fixture();
    expect(parseTopology(topology)).toMatchObject({ ok: true, topology });
    topology.groups = [{ id: "g", name: "分组", deviceIds: [device.id] }];
    topology.appearance = {
      accent: "#2463a8",
      background: "#abcdef",
      devices: { [device.id]: "#123456" },
      nodeTypes: { pc: "#ABCDEF" },
    };
    const parsed = parseTopology(topology);
    expect(parsed).toMatchObject({ ok: true, topology });
  });
  it.each([
    "invalid-color",
    "invalid-accent",
    "missing-device",
    "duplicate-member",
    "empty-group",
    "blank-id",
    "blank-port",
  ])("blocks corrupt %s", (kind) => {
    const { topology, device } = fixture();
    if (kind === "invalid-color") topology.appearance = { background: "red" };
    if (kind === "invalid-accent") topology.appearance = { accent: "red" };
    if (kind === "missing-device") topology.appearance = { devices: { missing: "#abcdef" } };
    if (kind === "duplicate-member")
      topology.groups = [{ id: "g", name: "g", deviceIds: [device.id, device.id] }];
    if (kind === "empty-group") topology.groups = [{ id: "g", name: "g", deviceIds: [] }];
    if (kind === "blank-id") device.id = "";
    if (kind === "blank-port" && device.ports[0]) device.ports[0].id = "";
    expect(parseTopology(topology).ok).toBe(false);
  });
  it("keeps invalid service config in editable mode but not broken field types", () => {
    const topology = emptyTopology();
    const device = createDevice("server", { x: 0, y: 0 }, topology);
    if (device.type !== "server") throw Error();
    topology.devices.push(device);
    device.config.dnsService.upstream = "invalid-address";
    expect(parseTopology(topology).ok).toBe(false);
    expect(parseTopology(topology, { allowInvalidConfig: true })).toMatchObject({
      ok: true,
      topology,
      warnings: [{ path: "devices[0].config.dnsService.upstream" }],
    });
    device.config.dnsService.upstream = 42 as unknown as string;
    expect(parseTopology(topology, { allowInvalidConfig: true }).ok).toBe(false);
  });
});
