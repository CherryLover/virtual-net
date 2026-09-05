import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import type { DeviceNodeType } from "./types";

export function InternetNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  if (device.type !== "internet") return null;
  return (
    <NodeShell
      kind="internet"
      name={device.name}
      address={data.address}
      errorCount={data.errorCount}
    >
      <PortHandles ports={device.ports} side="bottom" />
    </NodeShell>
  );
}
