/** L022 WAN 地址与自己的 LAN 网段重叠 */

import { lanInterfacesOf } from "../../engine/runtime/interfaces";
import { inSubnet } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l022WanLanOverlap: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const device of ctx.l3Routers) {
    const overlapping = (ctx.runtime.routes[device.id] ?? []).some((r) => r.wanLanOverlap);
    if (!overlapping) continue;
    const wan = ctx.runtime.ifaceOf(device.id, "wan");
    if (!wan?.ip) continue;
    const lan = lanInterfacesOf(ctx.runtime.interfaces, device.id).find(
      (i) => i.ip && i.mask && inSubnet(wan.ip, i.ip, i.mask),
    );
    if (!lan) continue;
    out.push(
      issue(
        "L022",
        "error",
        `WAN 地址 ${wan.ip} 与 LAN 网段 ${ctx.subnet(lan.ip, lan.mask)} 重叠`,
        [{ deviceId: device.id, field: "lan.ip" }],
      ),
    );
  }
  return out;
};
