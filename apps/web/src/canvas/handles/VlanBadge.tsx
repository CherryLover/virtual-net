import type { Port } from "../../engine";
import { vlanOf } from "../../engine";

/** 端口柄下方的小字：access 非 VLAN 1 显示 PVID，trunk 显示 T */
export function vlanBadgeText(port: Port): string | null {
  const vlan = vlanOf(port);
  if (vlan.mode === "trunk") return "T";
  return vlan.pvid === 1 ? null : String(vlan.pvid);
}

interface Props {
  port: Port;
  side: "top" | "bottom";
  left: string;
}

export function VlanBadge({ port, side, left }: Props) {
  const text = vlanBadgeText(port);
  if (!text) return null;
  return (
    <span className={`vlan-badge vlan-badge-${side}`} style={{ left }} data-port-vlan={port.name}>
      {text}
    </span>
  );
}
