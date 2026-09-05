/** traceroute 的跳数表（CP3 1.3）：跳数 · 设备 · 地址 · TTL，点一行跳到那一跳 */
import type { Hop } from "../../engine";
import { useTraceStore } from "../../store";
import type { TraceNames } from "../../trace/names";

interface Props {
  hops: Hop[];
  names: TraceNames;
  stale: boolean;
}

export function HopTable({ hops, names, stale }: Props) {
  if (hops.length === 0) return null;
  return (
    <div className="hoptable">
      <div className="hoptable-head">
        <span>跳</span>
        <span>设备</span>
        <span>地址</span>
        <span>TTL</span>
      </div>
      {hops.map((hop) => (
        <div key={hop.hop}>
          <button
            type="button"
            className={`hoptable-row${hop.status === "stop" ? " hoptable-stop" : ""}`}
            disabled={stale}
            onClick={() => useTraceStore.getState().seekSeq(hop.seq)}
          >
            <span>{hop.hop}</span>
            <span className="hoptable-device">{names.device(hop.deviceId)}</span>
            <span>{hop.ip ?? "—"}</span>
            <span>{hop.ttlIn}</span>
          </button>
          {hop.through.length > 0 ? (
            <div className="hoptable-through">
              经 {hop.through.map((id) => names.device(id)).join("、")}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
