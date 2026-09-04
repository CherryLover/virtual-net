/** L013 路由器 NAT 关闭 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l013NatOff: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const router of ctx.routers) {
    if (router.config.nat) continue;
    out.push(
      issue("L013", "warning", "NAT 已关闭，局域网设备访问外网时无法回程", [
        { deviceId: router.id, field: "nat" },
      ]),
    );
  }
  return out;
};
