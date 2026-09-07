import type { Edge, EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";
import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { Link } from "../engine";
import { useTopologyStore } from "../store";
import { automaticControl, curveGeometry } from "./curve";

export interface DeviceEdgeData extends Record<string, unknown> {
  label: string;
  hasError: boolean;
  curve?: Link["curve"];
}

export type DeviceEdgeType = Edge<DeviceEdgeData, "device">;

export function DeviceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<DeviceEdgeType>) {
  const { screenToFlowPosition } = useReactFlow();
  const [draft, setDraft] = useState<Link["curve"]>();
  const drag = useRef<{
    side: "source" | "target";
    curve: NonNullable<Link["curve"]>;
    moved: boolean;
  } | null>(null);
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const curve = draft ??
    data?.curve ?? {
      source: automaticControl(source, target, sourcePosition),
      target: automaticControl(target, source, targetPosition),
    };
  const { path, label, a, b } = curveGeometry(source, target, curve);
  const className = [
    "device-edge",
    data?.hasError ? "device-edge-error" : "",
    selected ? "device-edge-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <BaseEdge id={id} path={path} className={className} />
      {selected ? (
        <g className="edge-control-guides">
          <line x1={sourceX} y1={sourceY} x2={a.x} y2={a.y} />
          <line x1={targetX} y1={targetY} x2={b.x} y2={b.y} />
        </g>
      ) : null}
      <EdgeLabelRenderer>
        <span
          className="device-edge-label"
          style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
        >
          {data?.label}
        </span>
        {selected
          ? (["source", "target"] as const).map((side) => {
              const point = side === "source" ? a : b;
              return (
                <button
                  key={side}
                  type="button"
                  className="edge-control nodrag nopan"
                  aria-label={side === "source" ? "调整起点曲线" : "调整终点曲线"}
                  title={side === "source" ? "调整起点曲线" : "调整终点曲线"}
                  style={{
                    transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { side, curve, moved: false };
                  }}
                  onPointerMove={(event) => {
                    if (!drag.current) return;
                    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                    const endpoint = side === "source" ? source : target;
                    const next = {
                      ...drag.current.curve,
                      [side]: { x: point.x - endpoint.x, y: point.y - endpoint.y },
                    };
                    drag.current = { side, curve: next, moved: true };
                    setDraft(next);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    if (drag.current?.moved)
                      useTopologyStore.getState().setLinkCurve(id, drag.current.curve);
                    drag.current = null;
                    setDraft(undefined);
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDraft(undefined);
                  }}
                  onKeyDown={(event) => {
                    const deltas: Record<string, readonly [number, number]> = {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    };
                    const delta = deltas[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const step = event.shiftKey ? 20 : 5;
                    useTopologyStore.getState().setLinkCurve(id, {
                      ...curve,
                      [side]: {
                        x: curve[side].x + delta[0] * step,
                        y: curve[side].y + delta[1] * step,
                      },
                    });
                  }}
                />
              );
            })
          : null}
        {selected && data?.curve ? (
          <button
            type="button"
            className="edge-reset nodrag nopan"
            title="恢复自动线形"
            aria-label="恢复自动线形"
            style={{
              transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y + 27}px)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              useTopologyStore.getState().setLinkCurve(id);
            }}
          >
            <RotateCcw size={15} />
          </button>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}
