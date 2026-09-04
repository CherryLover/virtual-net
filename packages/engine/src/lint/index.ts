/** 静态检查：先 buildRuntime，再逐条跑规则，输出按 error 在前、编号在后排序 */

import { buildRuntime } from "../engine/runtime";
import type { LintIssue } from "../model/lint";
import type { Topology } from "../model/topology";
import { makeContext } from "./context";
import { LINT_RULES } from "./rules";

export * from "./context";

export function lint(topology: Topology): LintIssue[] {
  const runtime = buildRuntime(topology);
  const ctx = makeContext(topology, runtime);
  const issues: LintIssue[] = [];
  for (const rule of LINT_RULES) {
    for (const found of rule(ctx)) issues.push(found);
  }
  return issues
    .map((value, i) => ({ value, i }))
    .sort((a, b) => {
      const severity = rank(a.value.severity) - rank(b.value.severity);
      if (severity !== 0) return severity;
      if (a.value.ruleId !== b.value.ruleId) return a.value.ruleId < b.value.ruleId ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.value);
}

function rank(severity: LintIssue["severity"]): number {
  return severity === "error" ? 0 : 1;
}
