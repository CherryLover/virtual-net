export * from "./topology";
export * from "./trace";

import { snapshotNames } from "../trace/names";
import { buildTimeline } from "../trace/timeline";
import { useTopologyStore } from "./topology";
import { useTraceStore } from "./trace";

/**
 * 两个 store 的联动。写在这里而不是各自文件里，是为了不让它们互相 import 成环。
 * - 有了新结果就建时间线并自动播一遍（CP3 3.2）
 * - 拓扑结构一变就作废（CP3 4.2）
 */
let lastProbe = useTopologyStore.getState().lastProbe;
let lastRevision = useTopologyStore.getState().topologyRevision;

useTopologyStore.subscribe((state) => {
  const trace = useTraceStore.getState();
  if (state.lastProbe !== lastProbe) {
    lastProbe = state.lastProbe;
    lastRevision = state.topologyRevision;
    if (state.lastProbe) {
      const timeline = buildTimeline(state.lastProbe, state.topologyRevision, state.topology.links);
      trace.load(timeline, state.topologyRevision, snapshotNames(state.topology));
    } else {
      trace.reset();
    }
    return;
  }
  if (state.topologyRevision !== lastRevision) {
    lastRevision = state.topologyRevision;
    trace.markStale();
  }
});
