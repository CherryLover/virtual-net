/** L004 一根线两端不在同一网段 */

import type { LintIssue } from "../../model/lint";
import { inPeerSubnet, issue, type LintRule } from "../context";

export const l004LinkSubnetMismatch: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const link of ctx.topology.links) {
    const aIface = ctx.runtime.ifaceOfPort(link.a.portId);
    const bIface = ctx.runtime.ifaceOfPort(link.b.portId);
    if (!aIface || !bIface) continue;
    const segment = ctx.runtime.segmentOf(link.a.portId);
    if (!segment) continue;
    const addressed = ctx.addressedIn(segment);
    const a = addressed.find((x) => x.iface.key === aIface.key);
    const b = addressed.find((x) => x.iface.key === bIface.key);
    if (!a || !b) continue;
    // wan – 互联网这根线由运营商决定，不做同网段检查
    const wanUplink =
      (a.device.type === "router" && a.iface.name === "wan" && b.device.type === "internet") ||
      (b.device.type === "router" && b.iface.name === "wan" && a.device.type === "internet");
    if (wanUplink) continue;
    if (inPeerSubnet(a, b) && inPeerSubnet(b, a)) continue;
    out.push(
      issue(
        "L004",
        "error",
        `${a.device.name}（${a.ip}/${a.prefix}）和 ${b.device.name}（${b.ip}/${b.prefix}）直连但不在同一网段`,
        [{ deviceId: a.device.id }, { deviceId: b.device.id }],
        link.id,
      ),
    );
  }
  return out;
};
