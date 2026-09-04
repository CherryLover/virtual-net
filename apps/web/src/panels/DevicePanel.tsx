import type { Device, Runtime } from "../engine";
import { DeviceIcon } from "../icons";
import { useTopologyStore } from "../store";
import { DeviceProbe } from "./DeviceProbe";
import { Field } from "./Field";
import { InternetForm } from "./InternetForm";
import { PcForm } from "./PcForm";
import { RouterForm } from "./RouterForm";

interface Props {
  device: Device;
  runtime: Runtime;
  highlight: string | null;
}

export function DevicePanel({ device, runtime, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  return (
    <div className="panel-section">
      <h3 className="panel-title panel-title-device">
        <DeviceIcon type={device.type} className="device-icon" />
        {device.name}
      </h3>
      {device.type === "pc" || device.type === "router" ? (
        <DeviceProbe device={device} runtime={runtime} />
      ) : null}
      <Field
        label="名称"
        field="name"
        value={device.name}
        highlight={highlight === "name"}
        validate={(value) => (value.trim() ? null : "必填")}
        onCommit={(value) => updateDevice(device.id, (d) => ({ ...d, name: value.trim() }))}
      />
      {device.type === "pc" ? (
        <PcForm device={device} runtime={runtime} highlight={highlight} />
      ) : null}
      {device.type === "router" ? (
        <RouterForm device={device} runtime={runtime} highlight={highlight} />
      ) : null}
      {device.type === "internet" ? <InternetForm device={device} /> : null}
    </div>
  );
}
