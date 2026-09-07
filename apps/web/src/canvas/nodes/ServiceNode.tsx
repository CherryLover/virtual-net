import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import type { DeviceNodeType } from "./types";

export function ServiceNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  return (
    <NodeShell
      kind={device.type}
      name={device.name}
      address={data.address}
      errorCount={data.errorCount}
      width={180}
    >
      {device.type === "access-control" ? (
        <>
          <PortHandles ports={device.ports.slice(1)} side="top" />
          <PortHandles ports={device.ports.slice(0, 1)} side="bottom" />
        </>
      ) : (
        <PortHandles ports={device.ports} side="top" />
      )}
    </NodeShell>
  );
}
