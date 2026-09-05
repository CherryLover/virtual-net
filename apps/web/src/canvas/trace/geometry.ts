/**
 * 画布坐标计算（CP3 3.1）。包标记放在 `<ViewportPortal>` 里，
 * 坐标用的就是画布坐标系，平移缩放不用自己算。
 */
import type { Edge, InternalNode, Node } from "@xyflow/react";
import type { Segment } from "../../trace/timeline";

/** 节点还没量出尺寸时按默认卡片大小估，别让包跳到左上角 */
const FALLBACK_W = 140;
const FALLBACK_H = 56;

export interface FlowLookup {
  getInternalNode: (id: string) => InternalNode<Node> | undefined;
  getEdge: (id: string) => Edge | undefined;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nodeBox(flow: FlowLookup, deviceId: string): Box | null {
  const node = flow.getInternalNode(deviceId);
  if (!node) return null;
  const position = node.internals.positionAbsolute;
  return {
    x: position.x,
    y: position.y,
    w: node.measured?.width ?? FALLBACK_W,
    h: node.measured?.height ?? FALLBACK_H,
  };
}

export function nodeCenter(flow: FlowLookup, deviceId: string): { x: number; y: number } | null {
  const box = nodeBox(flow, deviceId);
  return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null;
}

/** 沿实际画出来的那条 edge 取点 */
function pointOnLink(
  flow: FlowLookup,
  linkId: string,
  fromDeviceId: string,
  t: number,
): { x: number; y: number } | null {
  const edge = flow.getEdge(linkId);
  if (!edge) return null;
  const path = document.querySelector<SVGPathElement>(
    `.react-flow__edge[data-id="${CSS.escape(linkId)}"] path.react-flow__edge-path`,
  );
  if (!path) return null;
  // 方向以 edge 的 source 为准，不假设 link.a 一定是 source
  const ratio = edge.source === fromDeviceId ? t : 1 - t;
  const point = path.getPointAtLength(ratio * path.getTotalLength());
  return { x: point.x, y: point.y };
}

/** 包这一刻在哪。取不到节点或连线返回 null，由调用方走 4.3 的兜底 */
export function packetPoint(
  flow: FlowLookup,
  segment: Segment,
  cursorMs: number,
): { x: number; y: number } | null {
  if (segment.kind !== "travel" || !segment.linkId) return nodeCenter(flow, segment.deviceId);
  const span = segment.endMs - segment.startMs;
  const t = span > 0 ? Math.min(1, Math.max(0, (cursorMs - segment.startMs) / span)) : 0;
  return pointOnLink(flow, segment.linkId, segment.deviceId, t);
}
