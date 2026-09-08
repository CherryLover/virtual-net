import { Copy, Group, Ungroup } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";
import "./selection-actions.css";

export function SelectionActions({
  menu,
  onClose,
}: {
  menu?: { x: number; y: number };
  onClose?: () => void;
}) {
  const selection = useTopologyStore((s) => s.selection);
  const groups = useTopologyStore((s) => s.topology.groups);
  const ids =
    selection.kind === "devices"
      ? selection.ids
      : selection.kind === "device"
        ? [selection.id]
        : selection.kind === "group"
          ? (groups?.find((g) => g.id === selection.id)?.deviceIds ?? [])
          : [];
  const selectedGroups =
    groups?.filter((group) =>
      selection.kind === "group"
        ? group.id === selection.id
        : group.deviceIds.some((id) => ids.includes(id)),
    ) ?? [];
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    (el.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? el).focus();
    const dismiss = (event: PointerEvent) => {
      if (!el.contains(event.target as Node)) onClose?.();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [menu, onClose]);
  const act = (action: () => void) => {
    action();
    onClose?.();
  };
  const split = () => {
    const groupIds = new Set(selectedGroups.map((group) => group.id));
    useTopologyStore.getState().runOp((graph) => {
      graph.groups = graph.groups?.filter((group) => !groupIds.has(group.id));
      return { ok: true };
    });
    useTopologyStore
      .getState()
      .select(
        ids.length > 1
          ? { kind: "devices", ids }
          : ids[0]
            ? { kind: "device", id: ids[0] }
            : { kind: "none" },
      );
  };
  const actions = [
    {
      icon: Group,
      label: "成组",
      disabled: ids.length < 2 || selection.kind === "group",
      action: () => useTopologyStore.getState().createGroup(ids),
    },
    { icon: Ungroup, label: "拆分成组", disabled: selectedGroups.length === 0, action: split },
    {
      icon: Copy,
      label: "复制所选设备",
      disabled: !ids.length,
      action: () => useTopologyStore.getState().copyDevices(ids),
    },
  ];
  if (!menu)
    return (
      <div className="canvas-selection-actions" role="toolbar" aria-label="分组操作">
        {ids.length > 0 && <span>已选 {ids.length} 项</span>}
        {actions.slice(0, 2).map((action) => (
          <IconButton
            key={action.label}
            icon={action.icon}
            label={action.label}
            disabled={action.disabled}
            onClick={() => act(action.action)}
          />
        ))}
      </div>
    );
  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label="画布右键菜单"
      className="canvas-context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose?.();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          ];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length
          ]?.focus();
        }
      }}
    >
      {actions.map(({ icon: Icon, ...action }) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => act(action.action)}
        >
          <Icon size={16} />
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
