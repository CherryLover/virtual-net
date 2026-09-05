/** L019 同一网段里两个 DHCP 服务 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l019DhcpConflict: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const conflict of ctx.runtime.dhcpConflicts) {
    const names = conflict.deviceIds.map((id) => ctx.name(id));
    out.push(
      issue(
        "L019",
        "warning",
        `${conflict.subnet} 内 ${names.join(" 和 ")} 都开着 DHCP，实际由 ${names[0]} 分配`,
        conflict.deviceIds.map((deviceId) => ({ deviceId, field: "dhcp" })),
      ),
    );
  }
  return out;
};
