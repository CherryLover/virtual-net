import type { SwitchDevice } from "../../engine";
import { SWITCH_MAX_PORTS, SWITCH_MIN_PORTS, setPortCount } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field } from "../Field";
import { PortVlanTable } from "./PortVlanTable";

interface Props {
  device: SwitchDevice;
  highlight: string | null;
  highlightPortId: string | null;
}

/** 口数校验：范围之外，或改小时末尾要删的口有连线 */
function portCountError(device: SwitchDevice, text: string): string | null {
  const value = text.trim();
  if (!value) return "必填";
  if (!/^\d+$/.test(value)) return "只能填数字";
  const count = Number(value);
  if (count < SWITCH_MIN_PORTS || count > SWITCH_MAX_PORTS) {
    return `只能是 ${SWITCH_MIN_PORTS}–${SWITCH_MAX_PORTS}`;
  }
  const linked = device.ports.slice(count).find((p) => p.linkId);
  return linked ? `${linked.name} 有连线` : null;
}

export function SwitchForm({ device, highlight, highlightPortId }: Props) {
  const runOp = useTopologyStore((s) => s.runOp);
  return (
    <div className="form">
      <Field
        label="口数"
        field="portCount"
        value={String(device.ports.length)}
        highlight={highlight === "portCount"}
        validate={(value) => portCountError(device, value)}
        onCommit={(value) => runOp((draft) => setPortCount(draft, device.id, Number(value.trim())))}
      />
      <PortVlanTable device={device} highlightPortId={highlightPortId} />
    </div>
  );
}
