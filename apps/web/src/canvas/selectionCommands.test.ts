import { beforeEach, describe, expect, it } from "vitest";
import { useTopologyStore } from "../store";
import { useDeletionNotice } from "../store/deletionNotice";
import { minimalTopology } from "../trace/testProbes";
import { deleteSelection, groupSelection, ungroupSelection } from "./selectionCommands";

beforeEach(() => {
  useTopologyStore.getState().replaceTopology(minimalTopology());
  useTopologyStore.setState({ past: [], future: [] });
  useDeletionNotice.getState().dismiss();
});

function selectGroup() {
  const store = useTopologyStore.getState();
  const ids = store.topology.devices.slice(0, 2).map((device) => device.id);
  store.createGroup(ids);
  useTopologyStore.setState({ past: [], future: [] });
  return ids;
}

describe("selection commands", () => {
  it("ungroups without deleting devices or links and keeps members selected", () => {
    const ids = selectGroup();
    const before = useTopologyStore.getState().topology;
    ungroupSelection();
    const after = useTopologyStore.getState();
    expect(after.topology.groups).toHaveLength(0);
    expect(after.topology.devices).toEqual(before.devices);
    expect(after.topology.links).toEqual(before.links);
    expect(after.selection).toEqual({ kind: "devices", ids });
    expect(after.past).toHaveLength(1);
    after.undo();
    expect(useTopologyStore.getState().topology).toEqual(before);
  });

  it("deletes group members and all attached links in one reversible operation", () => {
    const ids = selectGroup();
    const before = useTopologyStore.getState().topology;
    expect(deleteSelection()).toBe(true);
    const after = useTopologyStore.getState();
    expect(after.topology.devices.every((device) => !ids.includes(device.id))).toBe(true);
    expect(after.topology.groups).toHaveLength(0);
    expect(after.topology.links).toHaveLength(0);
    expect(
      after.topology.devices.every((device) => device.ports.every((port) => port.linkId === null)),
    ).toBe(true);
    expect(after.selection).toEqual({ kind: "none" });
    expect(after.past).toHaveLength(1);
    expect(useDeletionNotice.getState().notice?.deviceCount).toBe(2);
    useDeletionNotice.getState().undo();
    expect(useTopologyStore.getState().topology).toEqual(before);
    after.redo();
    expect(useTopologyStore.getState().topology).toEqual(after.topology);
  });

  it("invalidates deletion feedback after a newer edit", () => {
    selectGroup();
    deleteSelection();
    const store = useTopologyStore.getState();
    const device = store.topology.devices[0];
    if (!device) throw new Error("Missing remaining device");
    store.moveDevice(device.id, { x: 40, y: 40 });
    const topology = useTopologyStore.getState().topology;
    expect(useDeletionNotice.getState().notice).toBeNull();
    useDeletionNotice.getState().undo();
    expect(useTopologyStore.getState().topology).toBe(topology);
  });

  it("keeps deletion feedback when only selection or viewport changes", () => {
    selectGroup();
    deleteSelection();
    const notice = useDeletionNotice.getState().notice;
    useTopologyStore.getState().select({ kind: "none" });
    useTopologyStore.getState().setViewport({ x: 120, y: 60, zoom: 0.5 });
    expect(useDeletionNotice.getState().notice).toBe(notice);
  });

  it("invalidates deletion feedback when replacing without recording history", () => {
    selectGroup();
    deleteSelection();
    useTopologyStore.getState().replaceTopology(minimalTopology());
    const topology = useTopologyStore.getState().topology;
    expect(useDeletionNotice.getState().notice).toBeNull();
    useDeletionNotice.getState().undo();
    expect(useTopologyStore.getState().topology).toBe(topology);
  });

  it("deletes links independently", () => {
    const store = useTopologyStore.getState();
    const link = store.topology.links[0];
    if (!link) throw new Error("Missing link");
    store.select({ kind: "link", id: link.id });
    expect(deleteSelection()).toBe(true);
    expect(useTopologyStore.getState().topology.devices).toHaveLength(
      store.topology.devices.length,
    );
    expect(useTopologyStore.getState().topology.links).toHaveLength(
      store.topology.links.length - 1,
    );
    expect(useDeletionNotice.getState().notice?.linkCount).toBe(1);
  });

  it("ignores empty or stale selections without adding history", () => {
    groupSelection();
    ungroupSelection();
    expect(deleteSelection()).toBe(false);
    for (const kind of ["group", "device", "link"] as const) {
      useTopologyStore.getState().select({ kind, id: "missing" });
      expect(deleteSelection()).toBe(false);
    }
    expect(useTopologyStore.getState().past).toHaveLength(0);
    expect(useDeletionNotice.getState().notice).toBeNull();
  });
});
