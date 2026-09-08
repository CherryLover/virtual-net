import { Check, Monitor, Network, RotateCcw, Settings2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";
import { accentColor, accentStyle, COLOR_PRESETS, DEFAULT_ACCENT } from "./colors";
import "./appearance.css";

export function AppearanceDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState(() =>
    accentColor(useTopologyStore.getState().topology.appearance),
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => before?.focus();
  }, []);
  const apply = () => {
    const current = useTopologyStore.getState().topology.appearance;
    const accent = accentColor({ accent: draft });
    if (accent !== accentColor(current)) {
      useTopologyStore.getState().runOp((graph) => {
        graph.appearance = { ...graph.appearance, accent };
        return { ok: true };
      });
    }
    onClose();
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="appearance-dialog ui-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="appearance-heading ui-dialog-heading">
        <h2 id={`${id}-title`}>配色</h2>
        <IconButton icon={X} label="关闭配色" onClick={onClose} />
      </div>
      <div className="appearance-body ui-dialog-body">
        {["马卡龙", "柔雾"].map((family) => (
          <fieldset key={family} className="appearance-presets" aria-label={`${family}配色`}>
            <legend>{family}</legend>
            <div className="appearance-preset-grid">
              {COLOR_PRESETS.filter((preset) => preset.family === family).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  title={`${family} · ${preset.name}`}
                  aria-label={`${preset.name}配色`}
                  aria-pressed={draft === preset.accent}
                  onClick={() => setDraft(preset.accent)}
                >
                  <span
                    className="appearance-preset-swatches"
                    style={{ background: preset.fill, color: preset.ink }}
                  >
                    <span style={{ background: preset.soft }} />
                    <span style={{ background: preset.accent }} />
                    {draft === preset.accent ? <Check size={16} /> : null}
                  </span>
                  <span className="appearance-preset-name">{preset.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <div
          className="appearance-preview"
          role="img"
          aria-label="整体强调色预览"
          style={accentStyle({ accent: draft })}
        >
          <div className="appearance-preview-nav">
            <Network size={17} />
            <span>vnet</span>
            <span className="appearance-preview-action">
              <Check size={14} />
            </span>
          </div>
          <div className="appearance-preview-workspace">
            <div className="appearance-preview-library">
              <Monitor size={18} />
              <Network size={18} />
            </div>
            <div className="appearance-preview-canvas">
              <span className="appearance-preview-device">
                <Monitor size={20} />
                电脑
              </span>
            </div>
            <div className="appearance-preview-inspector">
              <Settings2 size={17} />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className="appearance-color-row">
          <label htmlFor={`${id}-accent`}>自定义强调色</label>
          <input
            id={`${id}-accent`}
            type="color"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      </div>
      <div className="appearance-footer ui-dialog-footer">
        <IconButton
          icon={RotateCcw}
          label="恢复默认配色"
          onClick={() => setDraft(DEFAULT_ACCENT)}
        />
        <button className="btn" type="button" onClick={onClose}>
          取消
        </button>
        <button className="btn btn-primary" type="button" onClick={apply}>
          <Check size={15} />
          应用配色
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
