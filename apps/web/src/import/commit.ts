import type { Topology } from "../engine";
import { backupBeforeImport } from "../storage/db";
import { useTopologyStore } from "../store";

export function createImportCommit(
  options = {
    current: () => useTopologyStore.getState().topology,
    backup: backupBeforeImport,
    replace: (topology: Topology) =>
      useTopologyStore.getState().replaceTopology(topology, { record: true }),
  },
) {
  let busy = false;
  return async (
    candidate: Topology,
    expected: Topology,
    isActive: () => boolean = () => true,
  ): Promise<"imported" | "changed" | "busy" | "cancelled"> => {
    if (!isActive()) return "cancelled";
    if (busy) return "busy";
    if (options.current() !== expected) return "changed";
    busy = true;
    try {
      await options.backup(structuredClone(expected));
      if (!isActive()) return "cancelled";
      if (options.current() !== expected) return "changed";
      options.replace(candidate);
      return "imported";
    } finally {
      busy = false;
    }
  };
}
