import { Trash2 } from "lucide-react";
import { DEVICE_LABELS, type Device } from "../engine";
import { DeviceIcon } from "../icons";
import { useDisplayText } from "../privacy/display";
import { useTopologyStore } from "../store";
import { GroupActions } from "./GroupActions";

export function PrivateDevicePanel({ device }: { device: Device }) {
  const display = useDisplayText();
  return (
    <div className="panel-section">
      <h3 className="panel-title panel-title-device">
        <DeviceIcon type={device.type} className="device-icon" />
        {display(device.name)}
      </h3>
      <div className="device-meta">
        <span>{DEVICE_LABELS[device.type]}</span>
        <span>配置已隐藏</span>
      </div>
      <GroupActions ids={[device.id]} />
      <div className="panel-danger-zone">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => useTopologyStore.getState().removeDevice(device.id)}
        >
          <Trash2 size={14} />
          删除设备
        </button>
      </div>
    </div>
  );
}
