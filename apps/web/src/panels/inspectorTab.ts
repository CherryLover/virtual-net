export type InspectorTab = "config" | "ports" | "verify";

export function diagnosticTab(field: string | null, portId: string | null): InspectorTab | null {
  if (portId || field === "lanPorts" || field?.startsWith("ports.")) return "ports";
  if (field) return "config";
  return null;
}
