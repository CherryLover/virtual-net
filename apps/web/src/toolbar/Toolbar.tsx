import { useRef, useState } from "react";
import { emptyTopology, parseTopology } from "../engine";
import { exportTopology } from "../storage";
import { useTopologyStore } from "../store";
import { ProbeDialog } from "./ProbeDialog";

export function Toolbar() {
  const name = useTopologyStore((s) => s.topology.name);
  const saveState = useTopologyStore((s) => s.saveState);
  const rename = useTopologyStore((s) => s.rename);
  const replaceTopology = useTopologyStore((s) => s.replaceTopology);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onNew = () => {
    const topology = useTopologyStore.getState().topology;
    const empty = topology.devices.length === 0 && topology.links.length === 0;
    if (!empty && !window.confirm("清空当前画布？未导出的内容会丢失")) return;
    replaceTopology(emptyTopology());
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const result = parseTopology(text);
    if (!result.ok) {
      window.alert(`文件格式不对：${result.errors[0]?.message ?? "无法解析"}`);
      return;
    }
    const topology = useTopologyStore.getState().topology;
    const empty = topology.devices.length === 0 && topology.links.length === 0;
    if (!empty && !window.confirm("替换当前画布？")) return;
    replaceTopology(result.topology);
  };

  return (
    <header className="toolbar">
      <input
        className="toolbar-name"
        value={editing ? draft : name}
        onFocus={() => {
          setDraft(name);
          setEditing(true);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          const value = draft.trim();
          if (value && value !== name) rename(value);
        }}
      />
      <div className="toolbar-actions">
        <button type="button" className="btn" onClick={onNew}>
          新建
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          导入
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onImport(file);
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => exportTopology(useTopologyStore.getState().topology)}
        >
          导出
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setDialogOpen(true)}>
          验证
        </button>
      </div>
      <span className="toolbar-save">{saveState === "saving" ? "保存中" : "已保存"}</span>
      {dialogOpen ? <ProbeDialog onClose={() => setDialogOpen(false)} /> : null}
    </header>
  );
}
