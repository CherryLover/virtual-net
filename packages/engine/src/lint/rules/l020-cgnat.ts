/** L020 WAN 拿到的是运营商内网地址 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l020Cgnat: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const lease of ctx.runtime.wanLeases) {
    if (lease.addressClass !== "cgnat") continue;
    out.push(
      issue(
        "L020",
        "warning",
        `WAN 地址 ${lease.ip} 是运营商内网地址，不是公网 IP，从外面无法直接访问`,
        [{ deviceId: lease.deviceId, field: "wan" }],
      ),
    );
  }
  return out;
};
