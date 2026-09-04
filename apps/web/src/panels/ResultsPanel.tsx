import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import type { Decision, LintIssue, ProbeResult } from "../engine";
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

export function ResultsPanel() {
  const issues = useTopologyStore((s) => s.issues);
  const probe = useTopologyStore((s) => s.lastProbe);
  const devices = useTopologyStore((s) => s.topology.devices);
  const select = useTopologyStore((s) => s.select);
  const { setCenter, getNode } = useReactFlow();

  const focus = useCallback(
    (deviceId: string, field?: string) => {
      select({ kind: "device", id: deviceId }, field ?? null);
      const node = getNode(deviceId);
      if (node) {
        void setCenter(node.position.x + 70, node.position.y + 28, { zoom: 1, duration: 200 });
      }
    },
    [select, setCenter, getNode],
  );

  const nameOf = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="panel-section">
      <h3 className="panel-title">静态检查</h3>
      {issues.length === 0 ? (
        <p className="panel-empty">没有问题</p>
      ) : (
        <ul className="issue-list">
          {issues.map((issue: LintIssue) => {
            const target = issue.targets[0];
            return (
              <li
                key={`${issue.ruleId}-${issue.targets.map((t) => t.deviceId).join("-")}-${issue.message}`}
              >
                <button
                  type="button"
                  className={`issue issue-${issue.severity}`}
                  onClick={() => target && focus(target.deviceId, target.field)}
                >
                  <span className="issue-icon">{issue.severity === "error" ? "✕" : "!"}</span>
                  <span className="issue-device">{target ? nameOf(target.deviceId) : ""}</span>
                  <span className="issue-message">{issue.message}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="panel-title">最近验证</h3>
      {probe ? (
        <ProbeView probe={probe} nameOf={nameOf} focus={focus} />
      ) : (
        <p className="panel-empty">还没有验证</p>
      )}
    </div>
  );
}

interface ProbeViewProps {
  probe: ProbeResult;
  nameOf: (id: string) => string;
  focus: (deviceId: string, field?: string) => void;
}

function ProbeView({ probe, nameOf, focus }: ProbeViewProps) {
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
