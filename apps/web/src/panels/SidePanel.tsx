import { ClipboardCheck, X } from "lucide-react";
import { useEffect } from "react";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { IconButton } from "../ui/IconButton";
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
  const open = useLayoutStore((s) => s.inspectorOpen);
  const close = useLayoutStore((s) => s.closeInspector);
  const links = useTopologyStore((s) => s.topology.links);
  const link = selection.kind === "link" ? links.find((l) => l.id === selection.id) : null;
  useEffect(() => {
    if (selection.kind !== "none") useLayoutStore.getState().openInspector();
  }, [selection]);

  return (
    <aside className="side-panel" aria-label="操作面板" hidden={!open}>
      <div className="inspector-heading">
        <span>检查器</span>
        <div>
          <IconButton
            icon={ClipboardCheck}
            label="查看全部验证结果"
            onClick={() => useTopologyStore.getState().select({ kind: "none" })}
          />
          <IconButton icon={X} label="关闭操作面板" onClick={close} />
        </div>
      </div>
      <div className="side-panel-body">
        {selection.kind === "devices" ? (
          <SelectionPanel ids={selection.ids} />
        ) : device ? (
          <DevicePanel
            key={device.id}
            device={device}
            runtime={runtime}
            highlight={highlight}
            highlightPortId={highlightPortId}
          />
        ) : link ? (
          <div className="panel-section">
            <h3 className="panel-title">网络连线</h3>
            <div className="connection-endpoints">
              {[link.a, link.b].map((end) => {
                const node = devices.find((d) => d.id === end.deviceId);
                return (
                  <button
                    className="btn"
                    type="button"
                    key={end.portId}
                    onClick={() =>
                      useTopologyStore
                        .getState()
                        .select({ kind: "device", id: end.deviceId }, null, end.portId)
                    }
                  >
                    {node?.name} · {node?.ports.find((p) => p.id === end.portId)?.name}
                  </button>
                );
              })}
            </div>
            <div className="panel-danger-zone">
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => useTopologyStore.getState().removeLink(link.id)}
              >
                删除连线
              </button>
            </div>
          </div>
        ) : (
          <ResultsPanel />
        )}
      </div>
    </aside>
  );
}
