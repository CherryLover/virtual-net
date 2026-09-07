import { beforeEach, describe, expect, it } from "vitest";
import { parseTopology } from "../engine";
import { minimalTopology, PC1 } from "../trace/testProbes";
import { useTopologyStore } from "./topology";
import { useTraceStore } from "./trace";
import "./index";

describe("display-only topology edits", () => {
  beforeEach(() => {
    useTopologyStore.getState().replaceTopology(minimalTopology());
    useTopologyStore.setState({ past: [], future: [] });
    useTopologyStore
      .getState()
      .runProbe({ kind: "ping", sourceDeviceId: PC1, targetIp: "8.8.8.8" });
  });
  it("stores one curve edit, roundtrips, undoes and redoes without invalidating the probe", () => {
    const before = useTopologyStore.getState();
    const link = before.topology.links[0];
    if (!link) throw new Error("Missing fixture link");
    const curve = { source: { x: 130, y: -40 }, target: { x: -100, y: 80 } };
    before.setLinkCurve(link.id, curve);
    const changed = useTopologyStore.getState();
    expect(changed.past).toHaveLength(1);
    expect(changed.topologyRevision).toBe(before.topologyRevision);
    const restored = parseTopology(JSON.stringify(changed.topology));
    expect(restored.ok && restored.topology.links[0]?.curve).toEqual(curve);
    changed.undo();
    expect(useTopologyStore.getState().topology.links[0]?.curve).toBeUndefined();
    expect(useTopologyStore.getState().lastProbe).toBe(before.lastProbe);
    useTopologyStore.getState().redo();
    expect(useTopologyStore.getState().topology.links[0]?.curve).toEqual(curve);
    expect(useTraceStore.getState().stale).toBe(false);
    useTopologyStore.getState().setLinkCurve(link.id);
    expect(useTopologyStore.getState().topology.links[0]?.curve).toBeUndefined();
  });
  it("moves display side without changing identity, occupancy or validation", () => {
    const before = useTopologyStore.getState();
    const device = before.topology.devices[0];
    if (!device) throw new Error("Missing fixture device");
    const port = device.ports[0];
    if (!port) throw new Error("Missing fixture port");
    before.setPortSide(device.id, port.id, "left");
    const changed = useTopologyStore.getState();
    expect(changed.topology.devices[0]?.ports[0]).toEqual({ ...port, displaySide: "left" });
    expect(changed.topologyRevision).toBe(before.topologyRevision);
    expect(parseTopology(JSON.stringify(changed.topology)).ok).toBe(true);
    changed.undo();
    expect(useTopologyStore.getState().topology.devices[0]?.ports[0]).toEqual(port);
    expect(useTopologyStore.getState().lastProbe).toBe(before.lastProbe);
  });
  it("deletes curve data with its link and rejects malformed display input", () => {
    const store = useTopologyStore.getState();
    const link = store.topology.links[0];
    if (!link) throw new Error("Missing fixture link");
    store.setLinkCurve(link.id, { source: { x: 1, y: 2 }, target: { x: 3, y: 4 } });
    store.removeLink(link.id);
    expect(useTopologyStore.getState().topology.links.some((item) => item.id === link.id)).toBe(
      false,
    );
    const bad = JSON.parse(JSON.stringify(store.topology));
    bad.links[0].curve = { source: { x: "bad", y: 0 }, target: { x: 0, y: 0 } };
    expect(parseTopology(bad).ok).toBe(false);
    delete bad.links[0].curve;
    bad.devices[0].ports[0].displaySide = "diagonal";
    expect(parseTopology(bad).ok).toBe(false);
  });
  it("keeps the current probe when a display zone changes or is undone", () => {
    const before = useTopologyStore.getState();
    before.updateDevice(PC1, (device) => ({ ...device, zone: "办公网络" }));
    expect(useTopologyStore.getState().topologyRevision).toBe(before.topologyRevision);
    expect(useTopologyStore.getState().lastProbe).toBe(before.lastProbe);
    useTopologyStore.getState().undo();
    expect(useTopologyStore.getState().lastProbe).toBe(before.lastProbe);
    expect(useTraceStore.getState().stale).toBe(false);
  });
  it("opens legacy files with automatic presentation and preserves every display field on reimport", () => {
    const legacy = parseTopology(JSON.stringify(minimalTopology()));
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.topology.links.every((link) => link.curve === undefined)).toBe(true);
    expect(
      legacy.topology.devices.every((device) =>
        device.ports.every((port) => port.displaySide === undefined),
      ),
    ).toBe(true);
    const store = useTopologyStore.getState();
    const link = store.topology.links[0];
    const device = store.topology.devices[0];
    const port = device?.ports[0];
    if (!link || !device || !port) throw new Error("fixture incomplete");
    store.setLinkCurve(link.id, { source: { x: -33.5, y: 110 }, target: { x: 41, y: -28 } });
    store.setPortSide(device.id, port.id, "right");
    const serialized = JSON.stringify(useTopologyStore.getState().topology);
    const parsed = parseTopology(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    store.replaceTopology(parsed.topology);
    expect(useTopologyStore.getState().topology).toEqual(JSON.parse(serialized));
  });
  it("ignores identical curve commits and preserves offsets while moving either node", () => {
    const before = useTopologyStore.getState();
    const link = before.topology.links[0];
    if (!link) throw new Error("fixture incomplete");
    const curve = { source: { x: 30, y: 70 }, target: { x: -50, y: 90 } };
    before.setLinkCurve(link.id, curve);
    before.setLinkCurve(link.id, structuredClone(curve));
    expect(useTopologyStore.getState().past).toHaveLength(1);
    before.moveDevices([
      { id: link.a.deviceId, position: { x: 300, y: 100 } },
      { id: link.b.deviceId, position: { x: 500, y: 400 } },
    ]);
    expect(useTopologyStore.getState().topology.links[0]?.curve).toEqual(curve);
    expect(useTopologyStore.getState().topologyRevision).toBe(before.topologyRevision);
    expect(useTopologyStore.getState().lastProbe).toBe(before.lastProbe);
    before.undo();
    expect(useTopologyStore.getState().topology.links[0]?.curve).toEqual(curve);
    expect(useTraceStore.getState().stale).toBe(false);
  });
});
