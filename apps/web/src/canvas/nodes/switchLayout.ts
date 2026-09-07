import type { Port } from "../../engine";

export const PORT_SIDES = ["top", "bottom", "left", "right"] as const;

export function switchLayout(ports: Port[]) {
  const half = Math.ceil(ports.length / 2);
  const groups = Object.fromEntries(
    PORT_SIDES.map((side) => [
      side,
      ports.filter((port, i) => (port.displaySide ?? (i < half ? "top" : "bottom")) === side),
    ]),
  ) as Record<(typeof PORT_SIDES)[number], Port[]>;
  return {
    groups,
    width: Math.min(640, Math.max(200, Math.max(groups.top.length, groups.bottom.length) * 28)),
    height: Math.max(64, Math.max(groups.left.length, groups.right.length) * 26),
  };
}
