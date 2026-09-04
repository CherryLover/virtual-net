import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import type { Decision, ProbeResult } from "../engine";
import { useTopologyStore } from "../store";

const ACTION_LABEL: Record<Decision["action"], string> = {
  originate: "发出",
  forward: "转发",
  answer: "应答",
  receive: "收到",
};

const PHASE_LABEL: Record<Decision["phase"], string> = {
  icmp: "ICMP",
  dns: "DNS",
  tcp: "连接",
};

export type FocusFn = (deviceId: string, field?: string) => void;

/** 选中某台设备、居中画布、可选高亮字段 */
export function useDeviceFocus(): FocusFn {
  const select = useTopologyStore((s) => s.select);
  const { setCenter, getNode } = useReactFlow();
  return useCallback(
    (deviceId: string, field?: string) => {
      select({ kind: "device", id: deviceId }, field ?? null);
      const node = getNode(deviceId);
      if (node) {
        void setCenter(node.position.x + 70, node.position.y + 28, { zoom: 1, duration: 200 });
      }
    },
    [select, setCenter, getNode],
  );
}

/** 设备名查询：拓扑里找不到时退回 id */
export function useDeviceName(): (id: string) => string {
  const devices = useTopologyStore((s) => s.topology.devices);
  return (id: string) => devices.find((d) => d.id === id)?.name ?? id;
}

interface ProbeViewProps {
  probe: ProbeResult;
  nameOf: (id: string) => string;
  focus: FocusFn;
}

/** 一次验证的结果：结论、原因、路径、定位、逐跳 */
export function ProbeView({ probe, nameOf, focus }: ProbeViewProps) {
  const groups: { phase: Decision["phase"]; decisions: Decision[] }[] = [];
  for (const decision of probe.decisions) {
    const last = groups[groups.length - 1];
    if (last && last.phase === decision.phase) last.decisions.push(decision);
    else groups.push({ phase: decision.phase, decisions: [decision] });
  }
  const showPhase = probe.kind === "visitSite";

  return (
    <div className="probe">
      <div className={`probe-summary probe-${probe.verdict}`}>{probe.summary}</div>
      {probe.reason ? <div className="probe-reason">{probe.reason}</div> : null}
      {probe.dns ? (
        <div className="probe-dns">
          DNS {probe.dns.server} 解析 {probe.dns.domain} → {probe.dns.ip}
        </div>
      ) : null}
      <div className="probe-path">{probe.path.map(nameOf).join(" → ")}</div>
      {probe.fixAt || probe.stoppedAt ? (
        <button
          type="button"
          className="probe-locate"
          onClick={() => {
            const fix = probe.fixAt;
            if (fix) focus(fix.deviceId, fix.field);
            else if (probe.stoppedAt) focus(probe.stoppedAt);
          }}
        >
          定位
        </button>
      ) : null}
      {groups.map((group) => (
        <div key={`${group.phase}-${group.decisions[0]?.seq}`} className="hop-group">
          {showPhase ? <div className="hop-group-title">{PHASE_LABEL[group.phase]}</div> : null}
          <ul className="hop-list">
            {group.decisions.map((decision) => (
              <li key={decision.seq}>
                <button
                  type="button"
                  className={`hop${decision.verdict === "stop" ? " hop-stop" : ""}`}
                  onClick={() => focus(decision.deviceId)}
                >
                  <span className="hop-seq">{decision.seq}</span>
                  <span className="hop-device">{nameOf(decision.deviceId)}</span>
                  <span className="hop-action">{ACTION_LABEL[decision.action]}</span>
                  <span className="hop-note">{decision.note || decision.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
