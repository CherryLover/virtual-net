/** L003 电脑手动配置但没填网关 */

import { parseIp, parseMask } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l003NoGateway: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pc of ctx.pcs) {
    const { addressMode, ip, mask, gateway } = pc.config;
    if (addressMode !== "static" || gateway) continue;
    if (parseIp(ip) === null || parseMask(mask) === null) continue;
    out.push(
      issue("L003", "warning", `没有配置网关，只能访问 ${ctx.subnet(ip, mask)} 内的设备`, [
        { deviceId: pc.id, field: "gateway" },
      ]),
    );
  }
  return out;
};
