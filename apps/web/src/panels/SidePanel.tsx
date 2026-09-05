import { useTopologyStore } from "../store";
import { DevicePanel } from "./DevicePanel";
import { ResultsPanel } from "./ResultsPanel";
import { SelectionPanel } from "./SelectionPanel";
import "./panels.css";

export function SidePanel() {
  const selection = useTopologyStore((s) => s.selection);
  const devices = useTopologyStore((s) => s.topology.devices);
  const runtime = useTopologyStore((s) => s.runtime);
  const highlight = useTopologyStore((s) => s.highlightField);
  const highlightPortId = useTopologyStore((s) => s.highlightPortId);
  const device = selection.kind === "device" ? devices.find((d) => d.id === selection.id) : null;

  return (
    <aside className="side-panel">
      <div className="side-panel-body">
        {selection.kind === "devices" ? (
          <SelectionPanel ids={selection.ids} />
        ) : device ? (
          <DevicePanel
            device={device}
            runtime={runtime}
            highlight={highlight}
            highlightPortId={highlightPortId}
          />
        ) : (
          <ResultsPanel />
        )}
      </div>
    </aside>
  );
}
