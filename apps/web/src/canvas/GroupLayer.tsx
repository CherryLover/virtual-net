import { useReactFlow, ViewportPortal } from "@xyflow/react";
import { useRef } from "react";
import type { Position } from "../engine";
import { useDisplayText } from "../privacy/display";
import { useTopologyStore } from "../store";
import type { DeviceNodeType } from "./nodes/types";
import "./groups.css";

export function GroupLayer({
  nodes,
  preview,
  onContextMenu,
}: {
  nodes: DeviceNodeType[];
  preview: (moves: { id: string; position: Position }[]) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
}) {
  const display = useDisplayText();
  const groups = useTopologyStore((s) => s.topology.groups);
  const selection = useTopologyStore((s) => s.selection);
  const { screenToFlowPosition } = useReactFlow();
  const drag = useRef<{
    start: Position;
    nodes: { id: string; position: Position }[];
    moves: { id: string; position: Position }[];
  } | null>(null);
  return (
    <ViewportPortal>
      {groups?.map((group) => {
        const members = nodes.filter((n) => group.deviceIds.includes(n.id));
        if (!members.length) return null;
        const x = Math.min(...members.map((n) => n.position.x)) - 24;
        const y = Math.min(...members.map((n) => n.position.y)) - 40;
        const right =
          Math.max(...members.map((n) => n.position.x + (n.measured?.width ?? 140))) + 24;
        const bottom =
          Math.max(...members.map((n) => n.position.y + (n.measured?.height ?? 72))) + 24;
        const events = {
          onContextMenu: (event: React.MouseEvent<HTMLElement>) => onContextMenu(event, group.id),
          onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            useTopologyStore.getState().select({ kind: "group", id: group.id });
            drag.current = {
              start: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              nodes: members.map((n) => ({ id: n.id, position: n.position })),
              moves: [],
            };
          },
          onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            if (!drag.current) return;
            const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = Math.round((point.x - drag.current.start.x) / 16) * 16;
            const dy = Math.round((point.y - drag.current.start.y) / 16) * 16;
            drag.current.moves = drag.current.nodes.map((n) => ({
              id: n.id,
              position: { x: n.position.x + dx, y: n.position.y + dy },
            }));
            preview(drag.current.moves);
          },
          onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
            e.stopPropagation();
            if (drag.current) useTopologyStore.getState().moveDevices(drag.current.moves);
            drag.current = null;
          },
          onPointerCancel: () => {
            if (drag.current) preview(drag.current.nodes);
            drag.current = null;
          },
          onLostPointerCapture: () => {
            if (drag.current) preview(drag.current.nodes);
            drag.current = null;
          },
          onClick: (e: React.MouseEvent<HTMLElement>) => {
            e.stopPropagation();
            useTopologyStore.getState().select({ kind: "group", id: group.id });
          },
        };
        return (
          <div
            key={group.id}
            className={`topology-group ${selection.kind === "group" && selection.id === group.id ? "is-selected" : ""}`}
            data-group-id={group.id}
            style={{ left: x, top: y, width: right - x, height: bottom - y }}
          >
            <button
              type="button"
              className="topology-group-name nodrag nopan"
              aria-label={`选择分组 ${display(group.name)}`}
              title={display(group.name)}
              {...events}
            >
              {display(group.name)}
            </button>
            {["top", "right", "bottom", "left"].map((side) => (
              <div
                key={side}
                className={`topology-group-edge topology-group-edge-${side} nodrag nopan`}
                {...events}
              />
            ))}
          </div>
        );
      })}
    </ViewportPortal>
  );
}
