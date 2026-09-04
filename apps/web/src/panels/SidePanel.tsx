import { useTopologyStore } from "../store";
import { DevicePanel } from "./DevicePanel";
import { ResultsPanel } from "./ResultsPanel";
import "./panels.css";

export function SidePanel() {
  const selection = useTopologyStore((s) => s.selection);
  const devices = useTopologyStore((s) => s.topology.devices);
  const runtime = useTopologyStore((s) => s.runtime);
  const highlight = useTopologyStore((s) => s.highlightField);
  const device = selection.kind === "device" ? devices.find((d) => d.id === selection.id) : null;

  return (
    <aside className="side-panel">
      <div className="side-panel-body">
        {device ? (
          <DevicePanel device={device} runtime={runtime} highlight={highlight} />
        ) : (
          <ResultsPanel />
        )}
      </div>
    </aside>
  );
}
