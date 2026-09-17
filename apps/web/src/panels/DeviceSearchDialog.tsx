import { useReactFlow } from "@xyflow/react";
import { LocateFixed, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DeviceIcon } from "../icons";
import { useDisplayText, usePrivacyStore } from "../privacy/display";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { IconButton } from "../ui/IconButton";
import { searchDevices } from "./device-search";
import "./device-search-dialog.css";

export function DeviceSearchDialog({ onClose }: { onClose: () => void }) {
  const topology = useTopologyStore((state) => state.topology);
  const runtime = useTopologyStore((state) => state.runtime);
  const hidden = usePrivacyStore((state) => state.hidden);
  const display = useDisplayText();
  const [draft, setDraft] = useState({ hidden, query: "" });
  const query = draft.hidden === hidden ? draft.query : "";
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useId();
  const flow = useReactFlow();
  const results = searchDevices(topology, runtime, query, display);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
    return () => before?.focus();
  }, []);
  useEffect(() => {
    setDraft({ hidden, query: "" });
  }, [hidden]);
  const locate = (id: string) => {
    if (!useTopologyStore.getState().topology.devices.some((device) => device.id === id)) return;
    useTopologyStore.getState().select({ kind: "device", id });
    const layout = useLayoutStore.getState();
    if (window.innerWidth < 760) {
      layout.closeInspector();
      if (layout.libraryOpen) layout.toggleLibrary();
    } else layout.openInspector();
    onClose();
    // Wait for panel layout and React Flow's resize observer before centering.
    requestAnimationFrame(() => {
      // Selecting a device can open the inspector in a sibling effect.
      if (window.innerWidth < 760) useLayoutStore.getState().closeInspector();
      requestAnimationFrame(() => {
        void flow.fitView({ nodes: [{ id }], maxZoom: 1, padding: 0.5, duration: 250 });
      });
    });
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="device-search-dialog ui-dialog"
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="ui-dialog-heading">
        <h2 id={heading}>查找设备</h2>
        <IconButton icon={X} label="关闭设备查找" onClick={onClose} />
      </header>
      <form
        className="device-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) locate(results[0].id);
        }}
      >
        <Search size={17} aria-hidden="true" />
        <input
          ref={input}
          className="field-input"
          type="search"
          aria-label="查找画布设备"
          placeholder={hidden ? "名称、地址代称或分组" : "名称、IP 或分组"}
          value={query}
          autoComplete="off"
          onChange={(event) => setDraft({ hidden, query: event.target.value })}
        />
      </form>
      <div className="device-search-count" aria-live="polite">
        {results.length} 台设备
      </div>
      <div className="device-search-results">
        {!results.length && (
          <p className="device-search-empty">
            {topology.devices.length ? "未找到设备" : "暂无设备"}
          </p>
        )}
        {results.map((result) => (
          <button
            type="button"
            className="device-search-result"
            key={result.id}
            onClick={() => locate(result.id)}
            title={`定位 ${result.name}`}
          >
            <DeviceIcon type={result.type} className="device-icon" />
            <span className="device-search-text">
              <strong>{result.name}</strong>
              <small>{result.description}</small>
              {result.groups && <small>{result.groups}</small>}
            </span>
            <LocateFixed size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
    </dialog>,
    document.body,
  );
}
