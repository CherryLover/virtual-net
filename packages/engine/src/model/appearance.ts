import type { DeviceType } from "./topology";

/** Display-only colors. Values are opaque #RRGGBB; absent fields preserve legacy rendering. */
export interface TopologyAppearance {
  /** Workbench-wide icon and interaction accent. Legacy fill fields remain readable but inert. */
  accent?: string;
  background?: string;
  nodeColor?: string;
  linkColor?: string;
  nodeTypes?: Partial<Record<DeviceType, string>>;
  devices?: Record<string, string>;
  links?: Record<string, string>;
}
