/** L024 手动配置的 WAN 网关不在 WAN 网段内 */

import { inSubnet, parseIp, parseMask } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l024StaticGateway: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const router of ctx.routers) {
    if (router.config.wan.mode !== "static") continue;
    const value = router.config.wan.static;
    if (!value) continue;
    if (parseIp(value.ip) === null || parseMask(value.mask) === null) continue;
    if (parseIp(value.gateway) === null) continue;
    if (inSubnet(value.gateway, value.ip, value.mask)) continue;
    out.push(
      issue(
        "L024",
        "error",
        `WAN 网关 ${value.gateway} 不在 ${ctx.subnet(value.ip, value.mask)} 内`,
        [{ deviceId: router.id, field: "wan.static.gateway" }],
      ),
    );
  }
  return out;
};
