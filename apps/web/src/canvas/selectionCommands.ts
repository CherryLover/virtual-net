import { useTopologyStore } from "../store";

export function selectedDevices() {
  const { selection, topology } = useTopologyStore.getState();
  return selection.kind === "devices"
    ? selection.ids
    : selection.kind === "device"
      ? [selection.id]
      : selection.kind === "group"
        ? (topology.groups?.find((group) => group.id === selection.id)?.deviceIds ?? [])
        : [];
}

export function groupSelection() {
  const store = useTopologyStore.getState();
  if (store.selection.kind !== "group") store.createGroup(selectedDevices());
}

export function ungroupSelection() {
  const store = useTopologyStore.getState();
  const ids = selectedDevices();
  const groupIds = new Set(
    store.topology.groups
      ?.filter((group) =>
        store.selection.kind === "group"
          ? group.id === store.selection.id
          : group.deviceIds.some((id) => ids.includes(id)),
      )
      .map((group) => group.id),
  );
  if (!groupIds.size) return;
  store.runOp((graph) => {
    graph.groups = graph.groups?.filter((group) => !groupIds.has(group.id));
    return { ok: true };
  });
  store.select(
    ids.length > 1
      ? { kind: "devices", ids }
      : ids[0]
        ? { kind: "device", id: ids[0] }
        : { kind: "none" },
  );
}
