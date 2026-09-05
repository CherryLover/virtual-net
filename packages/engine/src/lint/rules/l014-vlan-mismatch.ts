/** L014 一根线两端 VLAN 不一致，两个 VLAN 被这根线接通 */

import type { LintIssue } from "../../model/lint";
import { portSupportsVlan, vlanOf } from "../../model/vlan";
import { issue, type LintRule, untaggedVlanOfPort } from "../context";

export const l014VlanMismatch: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const link of ctx.topology.links) {
    const a = ctx.portOf(link.a.portId);
    const b = ctx.portOf(link.b.portId);
    if (!a || !b) continue;
    if (!portSupportsVlan(a.device.type, a.port.name)) continue;
    if (!portSupportsVlan(b.device.type, b.port.name)) continue;
    const va = untaggedVlanOfPort(a.device, a.port);
    const vb = untaggedVlanOfPort(b.device, b.port);
    if (va === null || vb === null || va === vb) continue;
    // trunk – trunk 时比的是两边的 native
    const modeA = vlanOf(a.port).mode;
    const modeB = vlanOf(b.port).mode;
    if (modeA === "trunk" && modeB === "trunk" && va === vb) continue;
    out.push(
      issue(
        "L014",
        "warning",
        `${a.device.name} ${a.port.name} VLAN ${va} 与 ${b.device.name} ${b.port.name} VLAN ${vb} 不一致，两个 VLAN 被这根线接通`,
        [
          { deviceId: a.device.id, portId: a.port.id },
          { deviceId: b.device.id, portId: b.port.id },
        ],
        link.id,
      ),
    );
  }
  return out;
};
