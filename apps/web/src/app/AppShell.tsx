import { useEffect, useState } from "react";
import { Canvas } from "../canvas/Canvas";
import { GuideDialog } from "../onboarding/GuideDialog";
import { hasSeenGuide, markGuideSeen } from "../onboarding/seen";
import { DeviceBar } from "../panels/DeviceBar";
import { SidePanel } from "../panels/SidePanel";
import { PacketInspector } from "../panels/trace/PacketInspector";
import { useAutoSave, useStorageStatus } from "../storage";
import { useLayoutStore } from "../store/layout";
import { Toolbar } from "../toolbar/Toolbar";

export function AppShell() {
  const firstRun = useAutoSave();
  const storage = useStorageStatus();
  const blocked = storage.phase === "loading" || storage.phase === "load-error";
  const [guideOpen, setGuideOpen] = useState(false);
  const libraryOpen = useLayoutStore((s) => s.libraryOpen);
  const inspectorOpen = useLayoutStore((s) => s.inspectorOpen);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 759px)");
    const adapt = () => useLayoutStore.getState().adaptToCompact();
    media.addEventListener("change", adapt);
    return () => media.removeEventListener("change", adapt);
  }, []);

  // 只在真正第一次来的时候自动弹一次。IndexedDB 里已经有图的老用户算看过，直接记上标记
  useEffect(() => {
    if (firstRun === "loading" || hasSeenGuide()) return;
    markGuideSeen();
    if (firstRun === "fresh") setGuideOpen(true);
  }, [firstRun]);

  if (blocked)
    return (
      <div className="storage-blocker" role="alertdialog" aria-modal="true" aria-label="读取网络">
        <h2>{storage.phase === "loading" ? "正在读取网络" : "暂时无法读取"}</h2>
        {storage.message ? <p>{storage.message}</p> : null}
        {storage.phase === "load-error" ? (
          <button type="button" className="btn btn-primary" onClick={storage.retry}>
            重新读取
          </button>
        ) : null}
      </div>
    );

  return (
    <div
      className={`app-shell${libraryOpen ? " library-open" : ""}${inspectorOpen ? " inspector-open" : ""}`}
    >
      <Toolbar onHelp={() => setGuideOpen(true)} />
      <DeviceBar />
      <Canvas />
      <SidePanel />
      <PacketInspector />
      {guideOpen ? <GuideDialog onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}
