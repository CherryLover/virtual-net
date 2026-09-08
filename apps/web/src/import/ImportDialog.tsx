import { Download, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStorageStatus } from "../storage";
import { loadImportBackup } from "../storage/db";
import { exportTopology } from "../storage/files";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";
import { checkImport, IMPORT_LIMIT_LABEL, initialCheck } from "./check";
import { createImportCommit } from "./commit";
import "./import.css";

export function ImportDialog({
  onClose,
  initialFile,
}: {
  onClose: () => void;
  initialFile?: File;
}) {
  const [check, setCheck] = useState(initialCheck);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const expected = useRef(useTopologyStore.getState().topology);
  const generation = useRef(0);
  const active = useRef(true);
  const commit = useRef(createImportCommit());
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const storage = useStorageStatus();
  const choose = async (file: File) => {
    const ticket = ++generation.current;
    setFileName(file.name);
    setError("");
    setChanged(false);
    setReading(true);
    expected.current = useTopologyStore.getState().topology;
    const valid = () => active.current && ticket === generation.current;
    try {
      await checkImport(file, (result) => {
        if (valid()) setCheck(result);
      });
    } catch {
      if (valid()) {
        setCheck(initialCheck());
        setError("文件无法安全检查，请重新选择有效的网络图文件。");
      }
    } finally {
      if (valid()) setReading(false);
    }
  };
  // The initial file belongs to this dialog instance; subsequent selections get a new generation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only initialize once per mounted dialog
  useEffect(() => {
    active.current = true;
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>("button")?.focus();
    if (initialFile) void choose(initialFile);
    return () => {
      active.current = false;
      generation.current++;
      before?.focus();
    };
  }, []);
  const close = () => {
    if (!busy) {
      generation.current++;
      onClose();
    }
  };
  const submit = async () => {
    if (!check.topology || reading || busy) return;
    if (useTopologyStore.getState().topology !== expected.current) {
      expected.current = useTopologyStore.getState().topology;
      setChanged(true);
      return;
    }
    setBusy(true);
    setError("");
    const ticket = generation.current;
    try {
      const result = await commit.current(
        check.topology,
        expected.current,
        () => active.current && ticket === generation.current,
      );
      if (!active.current) return;
      if (result === "imported") onClose();
      else if (result === "changed") {
        expected.current = useTopologyStore.getState().topology;
        setChanged(true);
      }
    } catch {
      if (active.current)
        setError(
          "原图备份或替换失败，当前画布未替换。请检查浏览器存储空间后重试，也可先导出原图。",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const issues = check.steps.flatMap((step) => step.issues);
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const blocks = issues.filter((issue) => issue.severity === "block").length;
  return (
    <div className="import-backdrop ui-backdrop">
      <div
        ref={root}
        className="import-dialog ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导入网络图"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") close();
          if (event.key !== "Tab") return;
          const controls = Array.from(
            root.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled):not([hidden]), [tabindex="0"]',
            ) ?? [],
          );
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className="ui-dialog-heading">
          <h2>导入网络图</h2>
          <IconButton
            icon={X}
            label="关闭导入"
            disabled={busy}
            title="关闭"
            aria-label="关闭导入"
            onClick={close}
          />
        </header>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll long inspection results */}
        <div className="import-body ui-dialog-body" tabIndex={0}>
          <div className="import-file">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} />
              {fileName ? "重新选择" : "选择文件"}
            </button>
            <span>{fileName}</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void choose(file);
            }}
          />
          <p className="import-limits">{IMPORT_LIMIT_LABEL}</p>
          {fileName && !reading && blocks > 0 && (
            <p role="status">
              {blocks} 项阻止 · {warnings} 项提醒
            </p>
          )}
          <ol className="import-steps" aria-live="polite">
            {check.steps.map((step, index) => (
              <li key={step.name}>
                <div className="import-step-title">
                  <strong>
                    {index + 1}. {step.name}
                  </strong>
                  <span data-status={step.status}>{step.status}</span>
                </div>
                {step.issues.length > 0 && (
                  <ul>
                    {step.issues.map((issue) => (
                      <li key={`${issue.path}-${issue.message}`}>
                        <strong>
                          {issue.severity === "block" ? "阻止" : "提醒"} · {issue.path}
                        </strong>
                        <p>{issue.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {check.topology && (
            <section className="import-summary">
              <h3>{check.topology.name || "未命名网络"}</h3>
              <p>
                {check.topology.devices.length} 台设备 · {check.topology.links.length} 条连线 ·{" "}
                {blocks} 项阻止 · {warnings} 项提醒
              </p>
              {check.compatibility.map((message) => (
                <p key={message}>{message}</p>
              ))}
              <p>
                将替换「{expected.current.name || "未命名网络"}
                」的全部设备、连线、分组、配色和视口。导入前保留原图备份，成功后可撤销。
              </p>
            </section>
          )}
          {changed && (
            <p role="alert" className="import-error">
              当前画布已改变。将备份并替换最新的「{expected.current.name}」（
              {expected.current.devices.length} 台设备、{expected.current.links.length}{" "}
              条连线），请再次确认。
            </p>
          )}
          {error && (
            <p role="alert" className="import-error">
              {error}
            </p>
          )}
          {storage.phase === "load-error" && (
            <p role="alert" className="import-error">
              本地原图尚未成功读取，请关闭并重试读取后再导入。
            </p>
          )}
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              try {
                const backup = await loadImportBackup();
                if (backup) exportTopology(backup.topology);
                else setError("还没有导入前备份。");
              } catch {
                setError("备份读取失败，原始数据已保留，请重试。");
              }
            }}
          >
            <Download size={15} />
            下载上次导入前原图
          </button>
        </div>
        <footer className="ui-dialog-footer">
          <button type="button" className="btn" disabled={busy} onClick={close}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              !check.topology ||
              blocks > 0 ||
              reading ||
              busy ||
              storage.phase === "loading" ||
              storage.phase === "load-error"
            }
            onClick={() => void submit()}
          >
            {busy
              ? "备份并导入中"
              : changed
                ? "确认替换最新原图"
                : warnings
                  ? "仍然导入"
                  : "确认导入"}
          </button>
        </footer>
      </div>
    </div>
  );
}
