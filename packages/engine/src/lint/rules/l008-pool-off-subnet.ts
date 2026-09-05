/** L008 DHCP 地址池不在所属子接口的网段内，或起止顺序反了 */

import { compareIp, inSubnet, parseIp, parseMask } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l008PoolOffSubnet: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pool of ctx.pools) {
    const { rangeStart, rangeEnd } = pool.dhcp;
    const { ip, mask } = pool;
    if (parseIp(rangeStart) === null || parseIp(rangeEnd) === null) continue;
    if (compareIp(rangeStart, rangeEnd) > 0) {
      out.push(
        issue("L008", "error", `DHCP 地址池起始地址大于结束地址：${rangeStart}–${rangeEnd}`, [
          { deviceId: pool.device.id, field: pool.field },
        ]),
      );
      continue;
    }
    if (parseIp(ip) === null || parseMask(mask) === null) continue;
    if (inSubnet(rangeStart, ip, mask) && inSubnet(rangeEnd, ip, mask)) continue;
    out.push(
      issue(
        "L008",
        "error",
        `DHCP 地址池 ${rangeStart}–${rangeEnd} 不在 LAN 网段 ${ctx.subnet(ip, mask)} 内`,
        [{ deviceId: pool.device.id, field: pool.field }],
      ),
    );
  }
  return out;
};
