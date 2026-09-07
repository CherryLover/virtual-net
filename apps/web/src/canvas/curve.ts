import { Position as Side } from "@xyflow/react";
import type { Link, Position } from "../engine";

export function automaticControl(point: Position, other: Position, side: Side): Position {
  const horizontal = side === Side.Left || side === Side.Right;
  const sign = side === Side.Left || side === Side.Top ? -1 : 1;
  const distance = (horizontal ? other.x - point.x : other.y - point.y) * sign;
  const offset = distance >= 0 ? distance / 2 : 6.25 * Math.sqrt(-distance);
  return { x: horizontal ? sign * offset : 0, y: horizontal ? 0 : sign * offset };
}

export function curveGeometry(
  source: Position,
  target: Position,
  curve: NonNullable<Link["curve"]>,
) {
  const a = { x: source.x + curve.source.x, y: source.y + curve.source.y };
  const b = { x: target.x + curve.target.x, y: target.y + curve.target.y };
  return {
    a,
    b,
    path: `M${source.x},${source.y} C${a.x},${a.y} ${b.x},${b.y} ${target.x},${target.y}`,
    label: {
      x: (source.x + 3 * a.x + 3 * b.x + target.x) / 8,
      y: (source.y + 3 * a.y + 3 * b.y + target.y) / 8,
    },
  };
}
