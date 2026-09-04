/** L007 DHCP 地址池包含路由器自己的地址 */

import { inRange } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l007PoolContainsRouter: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const router of ctx.routers) {
    const { rangeStart, rangeEnd } = router.config.dhcp;
    if (!inRange(router.config.lan.ip, rangeStart, rangeEnd)) continue;
    out.push(
      issue("L007", "error", `DHCP 地址池包含路由器自己的地址 ${router.config.lan.ip}`, [
        { deviceId: router.id, field: "dhcp" },
      ]),
    );
  }
  return out;
};
