import type { Edge, EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";

export interface DeviceEdgeData extends Record<string, unknown> {
  label: string;
  hasError: boolean;
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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
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
      <EdgeLabelRenderer>
        <span
          className="device-edge-label"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
