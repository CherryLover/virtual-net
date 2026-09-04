/** L010 电脑自动获取地址失败 */

import { leaseFailureText } from "../../engine/sim/messages";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l010LeaseFailed: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pc of ctx.pcs) {
    if (pc.config.addressMode !== "dhcp") continue;
    const lease = ctx.runtime.leaseOf(pc.id, "eth0");
    if (lease && lease.status === "ok") continue;
    out.push(
      issue(
        "L010",
        "error",
        `自动获取地址失败：${leaseFailureText(lease?.status ?? "no-server")}`,
        [{ deviceId: pc.id, field: "addressMode" }],
      ),
    );
  }
  return out;
};
