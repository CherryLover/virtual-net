import { DEVICE_LABELS, DEVICE_TYPES } from "../engine";
import { DeviceIcon } from "../icons";
import "./device-bar.css";

export function DeviceBar() {
  return (
    <aside className="device-bar">
      <h2 className="device-bar-title">设备</h2>
      <div className="device-bar-list">
        {DEVICE_TYPES.map((type) => (
          <button
            type="button"
            key={type}
            className="device-card"
            draggable
            data-device-type={type}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/virtual-net-device", type);
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <DeviceIcon type={type} className="device-icon" />
            <span>{DEVICE_LABELS[type]}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
