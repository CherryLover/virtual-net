import { useEffect, useState } from "react";
import { Canvas } from "../canvas/Canvas";
import { GuideDialog } from "../onboarding/GuideDialog";
import { hasSeenGuide, markGuideSeen } from "../onboarding/seen";
import { DeviceBar } from "../panels/DeviceBar";
import { SidePanel } from "../panels/SidePanel";
import { PacketInspector } from "../panels/trace/PacketInspector";
import { useAutoSave } from "../storage";
import { Toolbar } from "../toolbar/Toolbar";

export function AppShell() {
  const firstRun = useAutoSave();
  const [guideOpen, setGuideOpen] = useState(false);

  // 只在真正第一次来的时候自动弹一次。IndexedDB 里已经有图的老用户算看过，直接记上标记
  useEffect(() => {
    if (firstRun === "loading" || hasSeenGuide()) return;
    markGuideSeen();
    if (firstRun === "fresh") setGuideOpen(true);
  }, [firstRun]);

  return (
    <div className="app-shell">
      <Toolbar onHelp={() => setGuideOpen(true)} />
      <DeviceBar />
      <Canvas />
      <SidePanel />
      <PacketInspector />
      {guideOpen ? <GuideDialog onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}
