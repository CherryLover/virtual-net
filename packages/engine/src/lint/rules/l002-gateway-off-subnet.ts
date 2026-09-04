/** L002 电脑手动配置时网关不在本机网段 */

import { inSubnet, parseIp, parseMask } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l002GatewayOffSubnet: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pc of ctx.pcs) {
    const { addressMode, ip, mask, gateway } = pc.config;
    if (addressMode !== "static" || !gateway) continue;
    if (parseIp(ip) === null || parseMask(mask) === null || parseIp(gateway) === null) continue;
    if (inSubnet(gateway, ip, mask)) continue;
    out.push(
      issue("L002", "error", `网关 ${gateway} 不在 ${ctx.subnet(ip, mask)} 网段内`, [
        { deviceId: pc.id, field: "gateway" },
      ]),
    );
  }
  return out;
};
