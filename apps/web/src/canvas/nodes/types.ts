import type { Node } from "@xyflow/react";
import type { Device } from "../../engine";

export interface DeviceNodeData extends Record<string, unknown> {
  device: Device;
  address?: string;
  errorCount: number;
}

export type DeviceNodeType = Node<DeviceNodeData, string>;
