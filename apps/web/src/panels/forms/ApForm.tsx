import type { ApDevice } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field } from "../Field";

interface Props {
  device: ApDevice;
  highlight: string | null;
}

export function ApForm({ device, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  return (
    <div className="form">
      <Field
        label="SSID"
        field="ssid"
        value={device.config.ssid}
        highlight={highlight === "ssid"}
        validate={(value) => (value.trim() ? null : "必填")}
        onCommit={(value) =>
          updateDevice(device.id, (d) =>
            d.type === "ap" ? { ...d, config: { ...d.config, ssid: value.trim() } } : d,
          )
        }
      />
    </div>
  );
}
