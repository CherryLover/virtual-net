import {
  Check,
  ChevronDown,
  Download,
  FilePlus2,
  FolderOpen,
  HelpCircle,
  Network,
  PanelLeft,
  PanelRight,
  Play,
  Redo2,
  Undo2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { emptyTopology, parseTopology, sampleTopology } from "../engine";
import { servicesTopology } from "../engine/serviceSample";
import { exportTopology, useStorageStatus } from "../storage";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { IconButton } from "../ui/IconButton";
import { ProbeDialog } from "./ProbeDialog";

interface Props {
  onHelp: () => void;
}

export function Toolbar({ onHelp }: Props) {
  const name = useTopologyStore((s) => s.topology.name);
  const saveState = useTopologyStore((s) => s.saveState);
  const rename = useTopologyStore((s) => s.rename);
  const replaceTopology = useTopologyStore((s) => s.replaceTopology);
  const undo = useTopologyStore((s) => s.undo);
  const redo = useTopologyStore((s) => s.redo);
  const canUndo = useTopologyStore((s) => s.past.length > 0);
  const canRedo = useTopologyStore((s) => s.future.length > 0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const layout = useLayoutStore();
  const storage = useStorageStatus();
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current) menu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);
  const command = (action: () => void) => {
    if (menu.current) menu.current.open = false;
    action();
  };

  const onNew = () => {
    const topology = useTopologyStore.getState().topology;
    const empty = topology.devices.length === 0 && topology.links.length === 0;
    if (!empty && !window.confirm("清空当前画布？未导出的内容会丢失")) return;
    replaceTopology(emptyTopology(), { record: true });
  };

  const onSample = () => {
    const topology = useTopologyStore.getState().topology;
    const empty = topology.devices.length === 0 && topology.links.length === 0;
    if (!empty && !window.confirm("替换当前画布？")) return;
    replaceTopology(sampleTopology(), { record: true });
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const result = parseTopology(text);
      if (!result.ok) {
        window.alert(`文件格式不对：${result.errors[0]?.message ?? "无法解析"}`);
        return;
      }
      const topology = useTopologyStore.getState().topology;
      const empty = topology.devices.length === 0 && topology.links.length === 0;
      if (!empty && !window.confirm("替换当前画布？")) return;
      replaceTopology(result.topology, { record: true });
    } catch {
      window.alert("无法读取文件，请重新选择。");
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-brand" title="Virtual Net">
        <Network size={23} />
        <span>Virtual Net</span>
      </div>
      <IconButton
        icon={PanelLeft}
        label={layout.libraryOpen ? "收起设备库" : "展开设备库"}
        aria-expanded={layout.libraryOpen}
        onClick={layout.toggleLibrary}
      />
      <div className="toolbar-actions">
        <details ref={menu} className="file-menu">
          <summary className="btn" title="文件操作">
            <FolderOpen size={16} />
            <span>文件</span>
            <ChevronDown size={12} />
          </summary>
          <div className="file-menu-items">
            <button type="button" onClick={() => command(onNew)}>
              <FilePlus2 size={16} />
              新建网络
            </button>
            <button type="button" onClick={() => command(onSample)}>
              <Network size={16} />
              载入示例
            </button>
            <button
              type="button"
              onClick={() =>
                command(() => {
                  if (
                    useTopologyStore.getState().topology.devices.length &&
                    !window.confirm("替换当前画布？")
                  )
                    return;
                  replaceTopology(servicesTopology(), { record: true });
                })
              }
            >
              <Network size={16} />
              服务与代理示例
            </button>
            <button type="button" onClick={() => command(() => fileInput.current?.click())}>
              <Upload size={16} />
              导入文件
            </button>
            <button
              type="button"
              onClick={() => command(() => exportTopology(useTopologyStore.getState().topology))}
            >
              <Download size={16} />
              导出文件
            </button>
          </div>
        </details>
        <div className="toolbar-edit">
          <IconButton icon={Undo2} label="撤销" disabled={!canUndo} onClick={undo} />
          <IconButton icon={Redo2} label="重做" disabled={!canRedo} onClick={redo} />
        </div>
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
        <IconButton icon={Play} label="选择起点验证" onClick={() => setDialogOpen(true)} />
      </div>
      <input
        className="toolbar-name"
        aria-label="网络名称"
        title={name}
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
      <span className="toolbar-save" role="status">
        <Check size={13} />
        {storage.phase === "save-error"
          ? "保存失败"
          : storage.phase === "load-error"
            ? "读取失败"
            : storage.phase === "loading"
              ? "读取中"
              : saveState === "saving"
                ? "保存中"
                : "已保存"}
      </span>
      {storage.phase === "save-error" ? (
        <button
          type="button"
          className="btn"
          title={storage.message ?? "重试保存"}
          onClick={storage.retry}
        >
          重试保存
        </button>
      ) : null}
      <IconButton icon={HelpCircle} label="帮助" onClick={onHelp} />
      <IconButton
        icon={PanelRight}
        label={layout.inspectorOpen ? "收起操作面板" : "展开操作面板"}
        aria-expanded={layout.inspectorOpen}
        onClick={layout.toggleInspector}
      />
      {dialogOpen ? <ProbeDialog onClose={() => setDialogOpen(false)} /> : null}
    </header>
  );
}
