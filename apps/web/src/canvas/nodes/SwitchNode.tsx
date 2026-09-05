import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import type { DeviceNodeType } from "./types";

/** 口数 > 16 时前一半顶边、后一半底边 */
const TWO_ROW_FROM = 17;

export function SwitchNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  if (device.type !== "switch") return null;
  const ports = device.ports;
  const width = Math.max(200, ports.length * 28);
  const twoRows = ports.length >= TWO_ROW_FROM;
  const half = Math.ceil(ports.length / 2);
  const top = twoRows ? ports.slice(0, half) : [];
  const bottom = twoRows ? ports.slice(half) : ports;
  return (
    <NodeShell
      kind="switch"
      name={device.name}
      address={data.address}
      errorCount={data.errorCount}
      width={width}
    >
      {top.length > 0 ? <PortHandles ports={top} side="top" showVlan compact={twoRows} /> : null}
      <PortHandles ports={bottom} side="bottom" showVlan compact={twoRows} />
    </NodeShell>
  );
}
