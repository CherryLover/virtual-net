/** L006 DHCP 地址池与同网段的手动地址重叠 */

import { inRange } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l006PoolOverlapsStatic: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const router of ctx.routers) {
    if (!router.config.dhcp.enabled) continue;
    const lanIface = ctx.runtime.ifaceOf(router.id, "br-lan");
    const port = lanIface?.portIds[0];
    if (!port) continue;
    const segment = ctx.runtime.segmentOf(port);
    if (!segment) continue;
    const { rangeStart, rangeEnd } = router.config.dhcp;
    for (const item of ctx.addressedIn(segment)) {
      if (item.device.type !== "pc" || item.device.config.addressMode !== "static") continue;
      if (!inRange(item.ip, rangeStart, rangeEnd)) continue;
      out.push(
        issue(
          "L006",
          "warning",
          `${item.device.name} 的地址 ${item.ip} 在 ${router.name} 的 DHCP 地址池 ${rangeStart}–${rangeEnd} 内，可能被分给别的设备`,
          [
            { deviceId: item.device.id, field: "ip" },
            { deviceId: router.id, field: "dhcp" },
          ],
        ),
      );
    }
  }
  return out;
};
