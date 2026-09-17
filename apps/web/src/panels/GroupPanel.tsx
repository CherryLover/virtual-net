import { Copy, Trash2, Ungroup } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteSelection, ungroupSelection } from "../canvas/selectionCommands";
import { DEVICE_LABELS, type TopologyGroup } from "../engine";
import { DeviceIcon } from "../icons";
import { useDisplayText, usePrivacyStore } from "../privacy/display";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";

export function GroupPanel({ group }: { group: TopologyGroup }) {
  const devices = useTopologyStore((s) => s.topology.devices);
  const display = useDisplayText();
  const hidden = usePrivacyStore((s) => s.hidden);
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.name]);
  return (
    <div className="panel-section">
      <h3 className="panel-title">分组</h3>
      {hidden ? (
        <p className="group-name">{display(group.name)}</p>
      ) : (
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
      )}
      <div className="align-actions group-actions">
        <IconButton
          icon={Copy}
          label="复制分组"
          onClick={() => useTopologyStore.getState().copyDevices(group.deviceIds)}
        />
        <IconButton
          icon={Ungroup}
          label="取消成组"
          onClick={() => {
            useTopologyStore.getState().select({ kind: "group", id: group.id });
            ungroupSelection();
          }}
        />
        <IconButton
          icon={Trash2}
          label="删除组内设备"
          onClick={() => {
            useTopologyStore.getState().select({ kind: "group", id: group.id });
            deleteSelection();
          }}
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
              aria-label={display(device.name)}
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
              <span>{display(device.name)}</span>
              <small>{DEVICE_LABELS[device.type]}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
