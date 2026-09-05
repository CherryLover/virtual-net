/** 拓扑改动后的作废横幅（CP3 4.2） */
import { useTopologyStore, useTraceStore } from "../../store";

export function StaleBanner() {
  const stale = useTraceStore((s) => s.stale);
  const request = useTopologyStore((s) => s.lastProbeRequest);
  const devices = useTopologyStore((s) => s.topology.devices);
  if (!stale) return null;

  const sourceGone = !request || !devices.some((d) => d.id === request.sourceDeviceId);
  return (
    <div className="probe-banner">
      <span>{sourceGone ? "起点设备已删除" : "拓扑已改动，结果可能失效"}</span>
      <button
        type="button"
        className="btn"
        disabled={sourceGone}
        onClick={() => request && useTopologyStore.getState().runProbe(request)}
      >
        重新验证
      </button>
    </div>
  );
}
