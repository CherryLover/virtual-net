import type { DeviceType } from "../engine";
import { DeviceIcon } from "../icons";
import "./device-bar.css";

const ITEMS: { type: DeviceType; label: string }[] = [
  { type: "pc", label: "电脑" },
  { type: "router", label: "路由器" },
  { type: "internet", label: "互联网" },
];

export function DeviceBar() {
  return (
    <aside className="device-bar">
      <h2 className="device-bar-title">设备</h2>
      <div className="device-bar-list">
        {ITEMS.map((item) => (
          <button
            type="button"
            key={item.type}
            className="device-card"
            draggable
            data-device-type={item.type}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/virtual-net-device", item.type);
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <DeviceIcon type={item.type} className="device-icon" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
