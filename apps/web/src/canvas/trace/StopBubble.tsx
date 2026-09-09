/** 停在哪、为什么（CP3 2.4）：短标签 + CP1 的原因全文 + 定位 */
import { useNodes } from "@xyflow/react";
import { useDeviceFocus } from "../../panels/ProbeView";
import { useDisplayText } from "../../privacy/display";
import { useTopologyStore } from "../../store";
import { reasonLabel } from "../../trace/reasonLabel";

interface Props {
  deviceId: string;
}

export function StopBubble({ deviceId }: Props) {
  const display = useDisplayText();
  const probe = useTopologyStore((s) => s.lastProbe);
  const nodes = useNodes();
  const focus = useDeviceFocus();
  if (!probe) return null;
  const node = nodes.find((n) => n.id === deviceId);
  if (!node) return null;

  const width = node.measured?.width ?? 140;
  const height = node.measured?.height ?? 56;
  const fix = probe.fixAt;

  return (
    <div
      className="trace-bubble nopan nodrag nowheel"
      style={{ left: node.position.x + width + 12, top: node.position.y + height / 2 }}
    >
      <div className="trace-bubble-title">{reasonLabel(probe.reasonCode)}</div>
      {probe.reason ? <div className="trace-bubble-body">{display(probe.reason)}</div> : null}
      <button
        type="button"
        className="trace-bubble-locate"
        onClick={() => (fix ? focus(fix.deviceId, fix.field, fix.portId) : focus(deviceId))}
      >
        定位
      </button>
    </div>
  );
}
