import type { Device, Runtime } from "../engine";
import { DeviceIcon } from "../icons";
import { useTopologyStore } from "../store";
import { DeviceProbe } from "./DeviceProbe";
import { Field } from "./Field";
import { ApForm } from "./forms/ApForm";
import { InternetForm } from "./forms/InternetForm";
import { ModemForm } from "./forms/ModemForm";
import { PcForm } from "./forms/PcForm";
import { RouterForm } from "./forms/RouterForm";
import { SwitchForm } from "./forms/SwitchForm";

interface Props {
  device: Device;
  runtime: Runtime;
  highlight: string | null;
  highlightPortId: string | null;
}

export function DevicePanel({ device, runtime, highlight, highlightPortId }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  return (
    <div className="panel-section">
      <h3 className="panel-title panel-title-device">
        <DeviceIcon type={device.type} className="device-icon" />
        {device.name}
      </h3>
      {/* 交换机、AP、光猫不是 ping 起点，不显示发起验证的块 */}
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
        <RouterForm
          device={device}
          runtime={runtime}
          highlight={highlight}
          highlightPortId={highlightPortId}
        />
      ) : null}
      {device.type === "switch" ? (
        <SwitchForm device={device} highlight={highlight} highlightPortId={highlightPortId} />
      ) : null}
      {device.type === "ap" ? <ApForm device={device} highlight={highlight} /> : null}
      {device.type === "modem" ? (
        <ModemForm device={device} runtime={runtime} highlight={highlight} />
      ) : null}
      {device.type === "internet" ? <InternetForm device={device} highlight={highlight} /> : null}
    </div>
  );
}
