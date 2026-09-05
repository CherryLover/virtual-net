/** L016 trunk 口的对端不识别 VLAN 标签，只能收到 native VLAN */

import type { LintIssue } from "../../model/lint";
import { portSupportsVlan, vlanOf } from "../../model/vlan";
import { issue, type LintRule } from "../context";

export const l016TrunkPeerPlain: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const link of ctx.topology.links) {
    for (const [self, peer] of [
      [link.a, link.b],
      [link.b, link.a],
    ] as const) {
      const own = ctx.portOf(self.portId);
      const other = ctx.portOf(peer.portId);
      if (!own || !other) continue;
      if (!portSupportsVlan(own.device.type, own.port.name)) continue;
      const config = vlanOf(own.port);
      if (config.mode !== "trunk") continue;
      if (portSupportsVlan(other.device.type, other.port.name)) continue;
      out.push(
        issue(
          "L016",
          "warning",
          `${own.port.name} 是 trunk，对端 ${other.device.name} 不识别 VLAN 标签，只能收到 VLAN ${config.native}`,
          [{ deviceId: own.device.id, portId: own.port.id }],
          link.id,
        ),
      );
    }
  }
  return out;
};
