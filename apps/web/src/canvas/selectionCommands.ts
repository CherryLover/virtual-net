import { useTopologyStore } from "../store";
import { showDeletionNotice } from "../store/deletionNotice";

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

export function deleteSelection(): boolean {
  const store = useTopologyStore.getState();
  const { selection } = store;
  const deviceIds = selectedDevices().filter((id) =>
    store.topology.devices.some((device) => device.id === id),
  );
  const linkIds =
    selection.kind === "link" && store.topology.links.some((link) => link.id === selection.id)
      ? [selection.id]
      : [];
  if (!deviceIds.length && !linkIds.length) return false;
  store.removeElements(deviceIds, linkIds);
  showDeletionNotice(
    deviceIds.length,
    store.topology.links.length - useTopologyStore.getState().topology.links.length,
  );
  return true;
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
