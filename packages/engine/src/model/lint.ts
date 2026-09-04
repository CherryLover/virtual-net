/** 静态检查结果结构（CP1 定稿，CP2 起编号从 L014 续） */

export interface LintTarget {
  deviceId: string;
  portId?: string;
  field?: string;
}

export interface LintIssue {
  ruleId: string;
  severity: "error" | "warning";
  message: string;
  targets: LintTarget[];
  linkId?: string;
}
