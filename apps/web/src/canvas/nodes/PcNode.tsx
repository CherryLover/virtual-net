import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import type { DeviceNodeType } from "./types";

export function PcNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  if (device.type !== "pc") return null;
  return (
    <NodeShell kind="pc" name={device.name} address={data.address} errorCount={data.errorCount}>
      <PortHandles ports={device.ports} side="top" />
    </NodeShell>
  );
}
