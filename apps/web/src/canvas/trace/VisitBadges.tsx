/** 到访角标（CP3 2.4）：设备被走过几次就列几个序号，正播到的那个实心 */
import { useNodes } from "@xyflow/react";
import { useTraceStore } from "../../store";
import type { TraceView } from "./traceView";

interface Props {
  view: TraceView;
}

export function VisitBadges({ view }: Props) {
  const nodes = useNodes();
  if (view.visits.size === 0) return null;

  return (
    <>
      {[...view.visits.entries()].map(([deviceId, visits]) => {
        const node = nodes.find((n) => n.id === deviceId);
        if (!node) return null;
        return (
          <div
            key={deviceId}
            className="trace-badge nopan nodrag"
            data-device={deviceId}
            style={{ left: node.position.x, top: node.position.y }}
          >
            {visits.map((visit, i) => (
              <button
                key={visit.seq}
                type="button"
                className={`trace-badge-seq${visit.active ? " trace-badge-seq-on" : ""}`}
                title={`第 ${visit.seq} 跳 · 查看包头`}
                onClick={() => useTraceStore.getState().openInspector(visit.seq)}
              >
                {i > 0 ? <span className="trace-badge-dot">·</span> : null}
                {visit.seq}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}
