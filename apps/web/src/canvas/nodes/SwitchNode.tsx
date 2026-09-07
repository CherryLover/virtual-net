import { type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect } from "react";
import { NodeShell } from "./NodeShell";
import { PortHandles } from "./PortHandles";
import { PORT_SIDES, switchLayout } from "./switchLayout";
import type { DeviceNodeType } from "./types";

export function SwitchNode({ data }: NodeProps<DeviceNodeType>) {
  const device = data.device;
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (device.ports.length) updateNodeInternals(device.id);
  }, [device.id, device.ports, updateNodeInternals]);
  if (device.type !== "switch") return null;
  const ports = device.ports;
  const { groups, width, height } = switchLayout(ports);
  return (
    <NodeShell
      kind="switch"
      name={device.name}
      address={data.address}
      errorCount={data.errorCount}
      width={width}
      height={height}
    >
      {PORT_SIDES.map((side) => (
        <PortHandles
          key={side}
          deviceId={device.id}
          ports={groups[side]}
          side={side}
          showVlan
          compact={ports.length > 16}
        />
      ))}
    </NodeShell>
  );
}
