/** L021 接入方式与上游不匹配 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l021AccessMismatch: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const lease of ctx.runtime.wanLeases) {
    if (lease.status !== "pppoe-required" && lease.status !== "pppoe-rejected") continue;
    const name = ctx.name(lease.deviceId);
    const wanIface = ctx.runtime.ifaceOf(lease.deviceId, "wan");
    const upstream = wanIface
      ? ctx.runtime
          .reachFrom(wanIface)
          .targets.map((t) => ctx.deviceOf(t.iface.deviceId))
          .find((d) => d.type === "internet" || d.type === "modem" || d.type === "router")
      : undefined;
    const message =
      lease.status === "pppoe-required"
        ? `上游要求拨号，${name} WAN 是自动获取`
        : `${name} 在拨号，但 ${upstream?.name ?? "上游"} 不接受拨号`;
    out.push(issue("L021", "error", message, [{ deviceId: lease.deviceId, field: "wan.mode" }]));
  }
  return out;
};
