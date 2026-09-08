import { Download, RefreshCw, Scan, X, ZoomIn } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { IconButton } from "../ui/IconButton";
import { Select } from "../ui/Select";
import type { Capture } from "./capture";
import { captureCanvas, downloadBlob, pdfBlob, pngBlob, rasterize } from "./capture";
import "./export.css";

export function ExportDialog({ mode, onClose }: { mode: "export" | "share"; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [format, setFormat] = useState<"png" | "svg" | "pdf">("png");
  const [scale, setScale] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    capture: Capture;
    canvas: HTMLCanvasElement;
    url: string;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [current, setCurrent] = useState(false);
  const share = mode === "share";

  useEffect(() => {
    const url = result?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result?.url]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    void revision;
    let cancelled = false;
    setBusy(true);
    setError("");
    setCurrent(false);
    void (async () => {
      try {
        const capture = await captureCanvas(!share && format !== "pdf" && transparent);
        const canvas = await rasterize(capture, format === "svg" && !share ? 1 : scale, share);
        const blob = await pngBlob(canvas);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setResult({ capture, canvas, url });
        setCurrent(true);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "生成失败，请重试。");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [share, scale, transparent, revision, format]);

  const save = async () => {
    if (!result || !current || busy || saving) return;
    setSaving(true);
    try {
      const kind = share ? "png" : format;
      const blob =
        kind === "svg"
          ? new Blob([result.capture.svg], { type: "image/svg+xml;charset=utf-8" })
          : kind === "pdf"
            ? await pdfBlob(result.canvas)
            : await pngBlob(result.canvas);
      downloadBlob(blob, `vnet${share ? "-share" : ""}.${kind}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="export-dialog ui-dialog"
      aria-label={share ? "分享图片" : "导出画布"}
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="export-heading ui-dialog-heading">
        <h2>{share ? "分享图片" : "导出画布"}</h2>
        <IconButton className="export-icon" icon={X} label="关闭" onClick={onClose} />
      </header>
      <div className="export-options">
        {!share && (
          <label htmlFor={`${id}-format`}>
            格式
            <Select
              id={`${id}-format`}
              aria-label="格式"
              value={format}
              onChange={(event) => setFormat(event.target.value as typeof format)}
            >
              <option value="png">PNG 图片</option>
              <option value="svg">SVG 矢量图</option>
              <option value="pdf">PDF 文档</option>
            </Select>
          </label>
        )}
        {(share || format !== "svg") && (
          <label htmlFor={`${id}-scale`}>
            清晰度
            <Select
              id={`${id}-scale`}
              aria-label="清晰度"
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
            >
              <option value={1}>标准 · 1 倍</option>
              <option value={2}>高清 · 2 倍</option>
            </Select>
          </label>
        )}
        {!share && format !== "pdf" && (
          <label className="export-check">
            <input
              className="ui-checkbox"
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            透明背景
          </label>
        )}
        <IconButton
          icon={RefreshCw}
          label="重新生成"
          className="export-icon"
          title="重新生成"
          aria-label="重新生成"
          disabled={busy || saving}
          onClick={() => setRevision((value) => value + 1)}
        />
      </div>
      {!share && (
        <fieldset className="export-preview-tools" aria-label="预览大小">
          <IconButton
            icon={Scan}
            label="适应窗口"
            className="export-icon"
            title="适应窗口"
            aria-label="适应窗口"
            aria-pressed={!actualSize}
            onClick={() => setActualSize(false)}
          />
          <IconButton
            icon={ZoomIn}
            label="原始大小"
            className="export-icon"
            title="原始大小"
            aria-label="原始大小"
            aria-pressed={actualSize}
            onClick={() => setActualSize(true)}
          />
        </fieldset>
      )}
      <div
        className={`export-preview${!share && actualSize ? " export-preview-actual" : ""}`}
        aria-busy={busy}
      >
        {result ? <img src={result.url} alt={share ? "分享图片预览" : "完整画布预览"} /> : null}
        {busy && (
          <div className="export-preview-busy" role="status">
            正在生成…
          </div>
        )}
      </div>
      {error && (
        <p className="export-error" role="alert">
          {error}
        </p>
      )}
      <footer className="export-footer ui-dialog-footer">
        <span>{result ? `${result.canvas.width} × ${result.canvas.height}` : ""}</span>
        <button type="button" className="btn" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || saving || !result || !current}
          onClick={() => void save()}
        >
          <Download size={16} />
          {saving ? "正在保存…" : share ? "保存 PNG" : "保存文件"}
        </button>
      </footer>
    </dialog>
  );
}
