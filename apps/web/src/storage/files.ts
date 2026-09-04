import type { Topology } from "../engine";

export function exportTopology(topology: Topology): void {
  const text = JSON.stringify(topology, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${topology.name || "未命名拓扑"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
