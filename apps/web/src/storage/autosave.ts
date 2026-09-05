import { useEffect, useState } from "react";
import { sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { load, save } from "./db";

const DEBOUNCE_MS = 500;

/**
 * 这台浏览器是不是第一次来：
 * - `loading` 还没读完 IndexedDB
 * - `fresh` 从没保存过，画布铺的是示例拓扑
 * - `returning` 读到了用户自己的图（哪怕是张空图）
 */
export type FirstRun = "loading" | "fresh" | "returning";

/** 启动时读 current，之后拓扑变化 500ms 防抖写入 */
export function useAutoSave(): FirstRun {
  const [firstRun, setFirstRun] = useState<FirstRun>("loading");

  useEffect(() => {
    let cancelled = false;
    void load().then((saved) => {
      if (cancelled) return;
      const store = useTopologyStore.getState();
      if (saved?.topology) {
        store.replaceTopology(saved.topology);
        store.setSaveState("saved");
        store.setLoaded();
        setFirstRun("returning");
        return;
      }
      // 从没保存过：铺一张示例拓扑。先 setLoaded 再换拓扑，
      // 下面的自动保存才会把它当成一次正常改动存下来
      store.setLoaded();
      store.replaceTopology(sampleTopology());
      setFirstRun("fresh");
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

  return firstRun;
}
