import { useState } from "react";
import type { Device, Port, PortVlan } from "../../engine";
import {
  formatAllowedList,
  parseAllowedList,
  peerLabel,
  portSupportsVlan,
  setPortVlan,
  vlanOf,
} from "../../engine";
import { useTopologyStore } from "../../store";

interface Props {
  device: Device;
  /** 定位到端口时高亮这一行 */
  highlightPortId: string | null;
}

/** 端口 VLAN 变了就换 key 重建行，草稿状态跟着刷新 */
function vlanKey(port: Port): string {
  const vlan = vlanOf(port);
  return vlan.mode === "access"
    ? `a${vlan.pvid}`
    : `t${formatAllowedList(vlan.allowed)}n${vlan.native}`;
}

function vlanIdError(text: string): string | null {
  const value = text.trim();
  if (!value) return "必填";
  if (!/^\d+$/.test(value)) return "只能填数字";
  const id = Number(value);
  if (id < 1 || id > 4094) return "只能是 1–4094";
  return null;
}

/** 所有「每口 VLAN」编辑共用这一张表：交换机 portN、路由器 lanN */
export function PortVlanTable({ device, highlightPortId }: Props) {
  const topology = useTopologyStore((s) => s.topology);
  const runOp = useTopologyStore((s) => s.runOp);
  const ports = device.ports.filter((p) => portSupportsVlan(device.type, p.name));

  const [checked, setChecked] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<"access" | "trunk">("access");
  const [bulkValue, setBulkValue] = useState("10");
  const [bulkError, setBulkError] = useState<string | null>(null);

  // 端口可能被删掉（改小口数），渲染时过滤，不留脏选中
  const selected = checked.filter((id) => ports.some((p) => p.id === id));

  const apply = (portIds: string[], vlan: PortVlan) => {
    runOp((draft) => setPortVlan(draft, portIds, vlan));
  };

  const applyBulk = () => {
    if (selected.length === 0) return;
    if (bulkMode === "access") {
      const message = vlanIdError(bulkValue);
      if (message) {
        setBulkError(message);
        return;
      }
      setBulkError(null);
      apply(selected, { mode: "access", pvid: Number(bulkValue.trim()) });
      return;
    }
    const parsed = parseAllowedList(bulkValue);
    if (!parsed.ok) {
      setBulkError(parsed.message);
      return;
    }
    setBulkError(null);
    apply(selected, { mode: "trunk", allowed: parsed.ids, native: 1 });
  };

  return (
    <div className="field" data-field="ports">
      <div className="port-table-head">
        <div className="field-label">端口</div>
        {selected.length > 0 ? (
          <div className="port-bulk">
            <select
              className="field-input port-bulk-mode"
              aria-label="批量模式"
              value={bulkMode}
              onChange={(event) => setBulkMode(event.target.value as "access" | "trunk")}
            >
              <option value="access">access</option>
              <option value="trunk">trunk</option>
            </select>
            <input
              className="field-input port-bulk-value"
              aria-label="批量 VLAN"
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
            />
            <button type="button" className="btn" onClick={applyBulk}>
              批量设置
            </button>
          </div>
        ) : null}
      </div>
      {bulkError ? <div className="field-error">{bulkError}</div> : null}
      <table className="port-table">
        <thead>
          <tr>
            <th />
            <th>端口</th>
            <th>对端</th>
            <th>模式</th>
            <th>VLAN</th>
          </tr>
        </thead>
        <tbody>
          {ports.map((port) => (
            <PortRow
              key={`${port.id}-${vlanKey(port)}`}
              port={port}
              peer={peerLabel(topology, port.id)}
              checked={selected.includes(port.id)}
              highlight={highlightPortId === port.id}
              onCheck={(on) =>
                setChecked((prev) =>
                  on ? [...prev, port.id] : prev.filter((id) => id !== port.id),
                )
              }
              onChange={(vlan) => apply([port.id], vlan)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  port: Port;
  peer: string;
  checked: boolean;
  highlight: boolean;
  onCheck: (checked: boolean) => void;
  onChange: (vlan: PortVlan) => void;
}

function PortRow({ port, peer, checked, highlight, onCheck, onChange }: RowProps) {
  const vlan = vlanOf(port);
  const [pvid, setPvid] = useState(String(vlan.mode === "access" ? vlan.pvid : 1));
  const [allowed, setAllowed] = useState(
    vlan.mode === "trunk" ? formatAllowedList(vlan.allowed) : "",
  );
  const [native, setNative] = useState(String(vlan.mode === "trunk" ? vlan.native : 1));
  const [error, setError] = useState<string | null>(null);

  const commitTrunk = (allowedText: string, nativeText: string) => {
    const nativeError = vlanIdError(nativeText);
    if (nativeError) {
      setError(`native ${nativeError}`);
      return;
    }
    const parsed = parseAllowedList(allowedText);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    onChange({ mode: "trunk", allowed: parsed.ids, native: Number(nativeText.trim()) });
  };

  return (
    <tr
      className={highlight ? "port-row port-row-highlight" : "port-row"}
      data-port-row={port.name}
    >
      <td>
        <input
          type="checkbox"
          aria-label={`选择 ${port.name}`}
          checked={checked}
          onChange={(event) => onCheck(event.target.checked)}
        />
      </td>
      <td className="port-cell-name">{port.name}</td>
      <td className="port-cell-peer" title={peer}>
        {peer || "—"}
      </td>
      <td>
        <select
          className="field-input port-cell-mode"
          aria-label={`${port.name} 模式`}
          value={vlan.mode}
          onChange={(event) =>
            event.target.value === "trunk"
              ? onChange({ mode: "trunk", allowed: [], native: 1 })
              : onChange({ mode: "access", pvid: 1 })
          }
        >
          <option value="access">access</option>
          <option value="trunk">trunk</option>
        </select>
      </td>
      <td>
        {vlan.mode === "access" ? (
          <input
            className="field-input port-cell-vlan"
            aria-label={`${port.name} PVID`}
            value={pvid}
            onChange={(event) => setPvid(event.target.value)}
            onBlur={() => {
              const message = vlanIdError(pvid);
              if (message) {
                setError(message);
                return;
              }
              setError(null);
              onChange({ mode: "access", pvid: Number(pvid.trim()) });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        ) : (
          <div className="port-cell-trunk">
            <input
              className="field-input port-cell-vlan"
              aria-label={`${port.name} 放行`}
              placeholder="10,20"
              value={allowed}
              onChange={(event) => setAllowed(event.target.value)}
              onBlur={() => commitTrunk(allowed, native)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <input
              className="field-input port-cell-native"
              aria-label={`${port.name} native`}
              value={native}
              onChange={(event) => setNative(event.target.value)}
              onBlur={() => commitTrunk(allowed, native)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>
        )}
        {error ? <div className="field-error">{error}</div> : null}
      </td>
    </tr>
  );
}
