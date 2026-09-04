import { useEffect } from "react";
import { useTopologyStore } from "../store";
import { load, save } from "./db";

const DEBOUNCE_MS = 500;

/** 启动时读 current，之后拓扑变化 500ms 防抖写入 */
export function useAutoSave(): void {
  useEffect(() => {
    let cancelled = false;
    void load().then((saved) => {
      if (cancelled) return;
      const store = useTopologyStore.getState();
      if (saved?.topology) {
        store.replaceTopology(saved.topology);
      }
      store.setSaveState("saved");
      store.setLoaded();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useTopologyStore.subscribe((state, prev) => {
      if (!state.loaded) return;
      if (state.topology === prev.topology) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const topology = useTopologyStore.getState().topology;
        void save(topology).then(() => {
          if (useTopologyStore.getState().topology === topology) {
            useTopologyStore.getState().setSaveState("saved");
          }
        });
      }, DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
