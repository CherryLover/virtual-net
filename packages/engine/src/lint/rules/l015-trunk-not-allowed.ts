/** L015 某个 VLAN 两侧都有设备，但一端的 trunk 没放行 */

import type { LintIssue } from "../../model/lint";
import { portSupportsVlan, trunkAllows, vlanOf } from "../../model/vlan";
import { issue, type LintRule, sideOf, vlanMembersOf } from "../context";

export const l015TrunkNotAllowed: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const link of ctx.topology.links) {
    const a = ctx.portOf(link.a.portId);
    const b = ctx.portOf(link.b.portId);
    if (!a || !b) continue;
    if (!portSupportsVlan(a.device.type, a.port.name)) continue;
    if (!portSupportsVlan(b.device.type, b.port.name)) continue;
    const configA = vlanOf(a.port);
    const configB = vlanOf(b.port);
    if (configA.mode !== "trunk" && configB.mode !== "trunk") continue;

    const membersA = vlanMembersOf(sideOf(ctx.topology, a.device.id, link.id), link.id);
    const membersB = vlanMembersOf(sideOf(ctx.topology, b.device.id, link.id), link.id);
    const shared = [...membersA].filter((v) => membersB.has(v)).sort((x, y) => x - y);

    for (const vlanId of shared) {
      for (const side of [a, b]) {
        const config = vlanOf(side.port);
        if (config.mode !== "trunk") continue;
        if (trunkAllows(config, vlanId)) continue;
        out.push(
          issue(
            "L015",
            "error",
            `VLAN ${vlanId} 两侧都有设备，但 ${side.device.name} ${side.port.name} 未放行`,
            [{ deviceId: side.device.id, portId: side.port.id }],
            link.id,
          ),
        );
      }
    }
  }
  return out;
};
