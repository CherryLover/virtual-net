import { Check, ListChecks, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEVICE_LABELS } from "../engine";
import { DeviceIcon } from "../icons";
import { useDisplayText } from "../privacy/display";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { IconButton } from "../ui/IconButton";
import "./selection-dialog.css";

export function SelectionDialog({ onClose }: { onClose: () => void }) {
  const display = useDisplayText();
  const devices = useTopologyStore((s) => s.topology.devices);
  const [ids, setIds] = useState<string[]>(() => {
    const { selection, topology } = useTopologyStore.getState();
    if (selection.kind === "device") return [selection.id];
    if (selection.kind === "devices") return [...selection.ids];
    if (selection.kind === "group")
      return [...(topology.groups?.find((g) => g.id === selection.id)?.deviceIds ?? [])];
    return [];
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const liveIds = ids.filter((id) => devices.some((d) => d.id === id));
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => before?.focus();
  }, []);
  const apply = () => {
    const live = new Set(useTopologyStore.getState().topology.devices.map((d) => d.id));
    const selected = ids.filter((id) => live.has(id));
    const first = selected[0];
    if (!first) return;
    useTopologyStore
      .getState()
      .select(
        selected.length === 1 ? { kind: "device", id: first } : { kind: "devices", ids: selected },
      );
    useLayoutStore.getState().openInspector();
    onClose();
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="selection-dialog ui-dialog"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="selection-dialog-heading ui-dialog-heading">
        <h2 id={heading}>选择设备</h2>
        <IconButton icon={X} label="关闭设备选择" onClick={onClose} />
      </header>
      <div className="selection-dialog-tools">
        <span aria-live="polite">
          已选 {liveIds.length} / {devices.length}
        </span>
        <IconButton
          icon={ListChecks}
          label="全选设备"
          disabled={!devices.length}
          onClick={() => setIds(devices.map((d) => d.id))}
        />
        <IconButton
          icon={Square}
          label="清空设备选择"
          disabled={!liveIds.length}
          onClick={() => setIds([])}
        />
      </div>
      <div className="selection-dialog-list">
        {!devices.length && <p className="selection-dialog-empty">暂无设备</p>}
        {devices.map((device) => (
          <label className="selection-dialog-device ui-device-choice" key={device.id}>
            <input
              className="ui-checkbox"
              type="checkbox"
              checked={ids.includes(device.id)}
              onChange={(event) =>
                setIds((current) =>
                  event.target.checked
                    ? [...new Set([...current, device.id])]
                    : current.filter((id) => id !== device.id),
                )
              }
            />
            <DeviceIcon type={device.type} className="device-icon" />
            <span className="selection-dialog-device-text ui-device-choice-text">
              <span>{display(device.name)}</span>
              <small>{DEVICE_LABELS[device.type]}</small>
            </span>
          </label>
        ))}
      </div>
      <footer className="selection-dialog-footer ui-dialog-footer">
        <button type="button" className="btn" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!liveIds.length}
          onClick={apply}
        >
          <Check size={16} aria-hidden="true" />
          确认选择
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
