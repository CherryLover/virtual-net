import { useEffect, useState } from "react";
import { create } from "zustand";
import { sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { load, save } from "./db";
import { createPersistence, type StoragePhase } from "./persistence";

const DEBOUNCE_MS = 500;
export type FirstRun = "loading" | "fresh" | "returning";

// Keep editing data across development module replacement, not store actions or
// derived runtime objects: those must come from the newly loaded engine.
type EditorSnapshot = Pick<
  ReturnType<typeof useTopologyStore.getState>,
  | "topology"
  | "selection"
  | "highlightField"
  | "highlightPortId"
  | "lastProbe"
  | "lastProbeRequest"
  | "topologyRevision"
  | "saveState"
  | "past"
  | "future"
  | "loaded"
>;
if (import.meta.hot?.data) {
  const store = useTopologyStore;
  const snapshot = import.meta.hot.data.editorSnapshot as EditorSnapshot | undefined;
  if (snapshot?.loaded) {
    store.getState().replaceTopology(snapshot.topology);
    store.setState(snapshot);
  }
  import.meta.hot.dispose((data) => {
    const {
      topology,
      selection,
      highlightField,
      highlightPortId,
      lastProbe,
      lastProbeRequest,
      topologyRevision,
      saveState,
      past,
      future,
      loaded,
    } = store.getState();
    data.editorSnapshot = {
      topology,
      selection,
      highlightField,
      highlightPortId,
      lastProbe,
      lastProbeRequest,
      topologyRevision,
      saveState,
      past,
      future,
      loaded,
    } satisfies EditorSnapshot;
  });
}

export const useStorageStatus = create<{
  phase: StoragePhase;
  message: string | null;
  retry: () => void;
}>(() => ({ phase: "loading", message: null, retry: () => {} }));

export function useAutoSave(): FirstRun {
  const [firstRun, setFirstRun] = useState<FirstRun>("loading");
  const topologyStore = useTopologyStore;
  const statusStore = useStorageStatus;

  // biome-ignore lint/correctness/useExhaustiveDependencies: HMR replaces module-level store instances without unmounting React.
  useEffect(() => {
    setFirstRun("loading");
    // HMR can replace either store while retaining the mounted hook. Bind this
    // lifecycle to those exact instances so old reads never update a new store.
    const persistence = createPersistence({
      load,
      save,
      current: () => topologyStore.getState().topology,
      restore: (saved) => {
        const store = topologyStore.getState();
        if (store.loaded) {
          setFirstRun("returning");
          return;
        }
        store.replaceTopology(saved ?? sampleTopology());
        store.setLoaded();
        if (saved) store.setSaveState("saved");
        setFirstRun(saved ? "returning" : "fresh");
      },
      status: (phase) =>
        statusStore.setState({
          phase,
          message:
            phase === "load-error"
              ? "读取失败，原有内容未覆盖。请重试。"
              : phase === "save-error"
                ? "保存失败，当前修改尚未保存。请重试或导出备份。"
                : null,
        }),
      saved: () => topologyStore.getState().setSaveState("saved"),
    });
    statusStore.setState({
      retry: () => {
        void persistence.retry();
      },
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = topologyStore.subscribe((state, prev) => {
      if (!state.loaded || state.topology === prev.topology) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(persistence.changed, DEBOUNCE_MS);
    });
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      const state = topologyStore.getState();
      if (state.loaded && state.saveState === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnUnsaved);
    void persistence.start().then(() => {
      if (topologyStore.getState().saveState === "saving") persistence.changed();
    });
    return () => {
      if (timer) clearTimeout(timer);
      persistence.stop();
      unsubscribe();
      window.removeEventListener("beforeunload", warnUnsaved);
    };
  }, [topologyStore, statusStore]);

  return firstRun;
}
