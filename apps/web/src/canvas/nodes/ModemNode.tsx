import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import type { DeviceNodeType } from "./types";

export function ModemNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  if (device.type !== "modem") return null;
  const wan = device.ports.filter((p) => p.name === "wan");
  const lan = device.ports.filter((p) => p.name.startsWith("lan"));
  return (
    <NodeShell kind="modem" name={device.name} address={data.address} errorCount={data.errorCount}>
      <PortHandles ports={wan} side="top" />
      <PortHandles ports={lan} side="bottom" />
    </NodeShell>
  );
}
