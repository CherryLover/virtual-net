import { create } from "zustand";
import { useTopologyStore } from "./topology";

type DeletionNotice = {
  deviceCount: number;
  linkCount: number;
  history: ReturnType<typeof useTopologyStore.getState>["past"];
  devices: ReturnType<typeof useTopologyStore.getState>["topology"]["devices"];
  links: ReturnType<typeof useTopologyStore.getState>["topology"]["links"];
  groups: ReturnType<typeof useTopologyStore.getState>["topology"]["groups"];
};

function isCurrent(notice: DeletionNotice) {
  const state = useTopologyStore.getState();
  return (
    state.past === notice.history &&
    state.topology.devices === notice.devices &&
    state.topology.links === notice.links &&
    state.topology.groups === notice.groups
  );
}

export const useDeletionNotice = create<{
  notice: DeletionNotice | null;
  dismiss: () => void;
  undo: () => void;
}>((set, get) => ({
  notice: null,
  dismiss: () => set({ notice: null }),
  undo: () => {
    const notice = get().notice;
    set({ notice: null });
    if (notice && isCurrent(notice)) {
      useTopologyStore.getState().undo();
    }
  },
}));

// Selection and viewport changes keep the notice; a new history step invalidates its undo.
useTopologyStore.subscribe(() => {
  const notice = useDeletionNotice.getState().notice;
  if (notice && !isCurrent(notice)) useDeletionNotice.getState().dismiss();
});

export function showDeletionNotice(deviceCount: number, linkCount: number) {
  const { topology, past } = useTopologyStore.getState();
  useDeletionNotice.setState({
    notice: {
      deviceCount,
      linkCount,
      history: past,
      devices: topology.devices,
      links: topology.links,
      groups: topology.groups,
    },
  });
}
