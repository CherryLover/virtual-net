/** L001 同一网段内两个接口地址相同 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l001IpConflict: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const segment of ctx.runtime.segments) {
    const byIp = new Map<string, string[]>();
    for (const item of ctx.addressedIn(segment)) {
      const list = byIp.get(item.ip) ?? [];
      list.push(item.device.id);
      byIp.set(item.ip, list);
    }
    for (const [ip, deviceIds] of byIp) {
      if (deviceIds.length < 2) continue;
      const names = deviceIds.map((id) => ctx.name(id)).join(" 和 ");
      out.push(
        issue(
          "L001",
          "error",
          `${ip} 被 ${names} 同时使用`,
          deviceIds.map((deviceId) => ({ deviceId, field: "ip" })),
        ),
      );
    }
  }
  return out;
};
