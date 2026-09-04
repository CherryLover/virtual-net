/** L012 电脑手动配置但没填 DNS */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l012NoDns: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pc of ctx.pcs) {
    if (pc.config.addressMode !== "static" || pc.config.dns) continue;
    out.push(
      issue("L012", "warning", "没有配置 DNS，无法用域名访问网站", [
        { deviceId: pc.id, field: "dns" },
      ]),
    );
  }
  return out;
};
