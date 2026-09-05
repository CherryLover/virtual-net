/** L007 DHCP 地址池包含子接口自己的地址 */

import { inRange } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l007PoolContainsRouter: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pool of ctx.pools) {
    const { rangeStart, rangeEnd } = pool.dhcp;
    if (!inRange(pool.ip, rangeStart, rangeEnd)) continue;
    out.push(
      issue("L007", "error", `DHCP 地址池包含路由器自己的地址 ${pool.ip}`, [
        { deviceId: pool.device.id, field: pool.field },
      ]),
    );
  }
  return out;
};
