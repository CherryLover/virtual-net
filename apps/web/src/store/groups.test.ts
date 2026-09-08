import { beforeEach, describe, expect, it } from "vitest";
import { minimalTopology } from "../trace/testProbes";
import { useTopologyStore } from "./topology";

describe("group editing history", () => {
  beforeEach(() => {
    useTopologyStore.getState().replaceTopology(minimalTopology());
    useTopologyStore.setState({ past: [], future: [] });
  });
  it("groups, renames, moves and ungroups as independent undo steps without invalidating networking", () => {
    const s = useTopologyStore.getState();
    const ids = s.topology.devices.slice(0, 2).map((d) => d.id);
    s.createGroup(ids);
    const g = useTopologyStore.getState().topology.groups?.[0];
    if (!g) throw new Error("Missing group");
    s.renameGroup(g.id, "Office");
    s.moveDevices(ids.map((id) => ({ id, position: { x: 160, y: 320 } })));
    s.ungroup(g.id);
    expect(useTopologyStore.getState().past).toHaveLength(4);
    expect(useTopologyStore.getState().topologyRevision).toBe(s.topologyRevision);
    s.undo();
    expect(useTopologyStore.getState().topology.groups?.[0]?.name).toBe("Office");
    s.undo();
    s.undo();
    s.undo();
    expect(useTopologyStore.getState().topology.groups).toBeUndefined();
    s.redo();
    expect(useTopologyStore.getState().topology.groups?.[0]?.deviceIds).toEqual(ids);
  });
  it("copies in one step and deletion cleans groups and color overrides", () => {
    const s = useTopologyStore.getState();
    const ids = s.topology.devices.slice(0, 2).map((d) => d.id);
    s.createGroup(ids);
    s.copyDevices(ids);
    expect(useTopologyStore.getState().past).toHaveLength(2);
    expect(useTopologyStore.getState().topology.groups).toHaveLength(2);
    s.undo();
    expect(useTopologyStore.getState().topology.devices).toHaveLength(s.topology.devices.length);
    s.removeElements(ids, []);
    expect(useTopologyStore.getState().topology.groups).toHaveLength(0);
    s.undo();
    expect(useTopologyStore.getState().topology.groups).toHaveLength(1);
  });
  it("moving members to another group does not create nested or duplicate membership", () => {
    const s = useTopologyStore.getState();
    const ids = s.topology.devices.map((d) => d.id);
    s.createGroup(ids.slice(0, 2));
    s.createGroup(ids.slice(1, 3));
    const groups = useTopologyStore.getState().topology.groups ?? [];
    expect(groups[0]?.deviceIds).toEqual([ids[0]]);
    const second = groups[1];
    if (!second) throw new Error("Missing second group");
    s.updateGroupMembers(second.id, ids);
    expect(useTopologyStore.getState().topology.groups).toHaveLength(1);
    s.undo();
    expect(useTopologyStore.getState().topology.groups).toHaveLength(2);
  });
});
