import { ENGINE_VERSION } from "@virtual-net/engine";

export function SidePanel() {
  return (
    <aside className="side-panel">
      <div className="side-panel-body" />
      <div className="side-panel-footer">引擎 {ENGINE_VERSION}</div>
    </aside>
  );
}
