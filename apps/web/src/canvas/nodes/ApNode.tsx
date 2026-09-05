import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import type { DeviceNodeType } from "./types";

export function ApNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  if (device.type !== "ap") return null;
  const uplink = device.ports.filter((p) => p.name === "uplink");
  const wlan = device.ports.filter((p) => p.name.startsWith("wlan"));
  return (
    <NodeShell kind="ap" name={device.name} address={data.address} errorCount={data.errorCount}>
      <PortHandles ports={uplink} side="top" />
      <PortHandles ports={wlan} side="bottom" />
    </NodeShell>
  );
}
