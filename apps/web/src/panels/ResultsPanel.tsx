import type { LintIssue } from "../engine";
import { useTopologyStore } from "../store";
import { ProbeView, useDeviceFocus, useDeviceName } from "./ProbeView";

export function ResultsPanel() {
  const issues = useTopologyStore((s) => s.issues);
  const probe = useTopologyStore((s) => s.lastProbe);
  const focus = useDeviceFocus();
  const nameOf = useDeviceName();

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
                key={`${issue.ruleId}-${issue.targets.map((t) => `${t.deviceId}${t.portId ?? ""}`).join("-")}-${issue.message}`}
              >
                <button
                  type="button"
                  className={`issue issue-${issue.severity}`}
                  onClick={() => target && focus(target.deviceId, target.field, target.portId)}
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
        <ProbeView probe={probe} focus={focus} />
      ) : (
        <p className="panel-empty">还没有验证</p>
      )}
    </div>
  );
}
