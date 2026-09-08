import { Copy, Ungroup } from "lucide-react";
import { useEffect, useState } from "react";
import { DEVICE_LABELS, type TopologyGroup } from "../engine";
import { DeviceIcon } from "../icons";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";

export function GroupPanel({ group }: { group: TopologyGroup }) {
  const devices = useTopologyStore((s) => s.topology.devices);
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.name]);
  return (
    <div className="panel-section">
      <h3 className="panel-title">分组</h3>
      <form
        className="form group-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          useTopologyStore.getState().renameGroup(group.id, name);
        }}
      >
        <label className="field">
          <span className="field-label">组名</span>
          <input
            className="field-input"
            aria-label="组名"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              useTopologyStore.getState().renameGroup(group.id, name);
              if (!name.trim()) setName(group.name);
            }}
          />
        </label>
      </form>
      <div className="align-actions group-actions">
        <IconButton
          icon={Copy}
          label="复制分组"
          onClick={() => useTopologyStore.getState().copyDevices(group.deviceIds)}
        />
        <IconButton
          icon={Ungroup}
          label="解组"
          onClick={() => useTopologyStore.getState().ungroup(group.id)}
        />
      </div>
      <h4 className="group-members-title">
        成员{" "}
        <span>
          {group.deviceIds.length} / {devices.length}
        </span>
      </h4>
      <div className="group-members">
        {devices.map((device) => (
          <label className="ui-device-choice" key={device.id}>
            <input
              className="ui-checkbox"
              aria-label={device.name}
              type="checkbox"
              checked={group.deviceIds.includes(device.id)}
              onChange={(e) =>
                useTopologyStore
                  .getState()
                  .updateGroupMembers(
                    group.id,
                    e.target.checked
                      ? [...group.deviceIds, device.id]
                      : group.deviceIds.filter((id) => id !== device.id),
                  )
              }
            />
            <DeviceIcon type={device.type} className="device-icon" />
            <span className="ui-device-choice-text">
              <span>{device.name}</span>
              <small>{DEVICE_LABELS[device.type]}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
