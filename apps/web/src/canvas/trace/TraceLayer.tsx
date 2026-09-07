/** 画布叠加层（CP3 3.1）：角标、包、失败气泡都在画布坐标系里，跟着平移缩放走 */
import { ViewportPortal } from "@xyflow/react";
import { PacketMarker } from "./PacketMarker";
import { StopBubble } from "./StopBubble";
import type { TraceView } from "./traceView";
import { VisitBadges } from "./VisitBadges";

interface Props {
  view: TraceView;
  live: boolean;
}

export function TraceLayer({ view, live }: Props) {
  if (!live) return null;
  return (
    <ViewportPortal>
      <div className="trace-overlay">
        <VisitBadges view={view} />
        {view.stoppedDeviceId ? <StopBubble deviceId={view.stoppedDeviceId} /> : null}
        <PacketMarker />
      </div>
    </ViewportPortal>
  );
}
