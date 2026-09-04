import { Canvas } from "../canvas/Canvas";
import { DeviceBar } from "../panels/DeviceBar";
import { SidePanel } from "../panels/SidePanel";
import { useAutoSave } from "../storage";
import { Toolbar } from "../toolbar/Toolbar";

export function AppShell() {
  useAutoSave();
  return (
    <div className="app-shell">
      <Toolbar />
      <DeviceBar />
      <Canvas />
      <SidePanel />
    </div>
  );
}
