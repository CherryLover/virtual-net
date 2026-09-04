/** L009 关键端口没有连线 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l009PortUnlinked: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const pc of ctx.pcs) {
    const eth0 = pc.ports[0];
    if (!eth0 || eth0.linkId) continue;
    out.push(issue("L009", "warning", "eth0 没有连线", [{ deviceId: pc.id, portId: eth0.id }]));
  }
  for (const router of ctx.routers) {
    const wan = router.ports.find((p) => p.name === "wan");
    if (!wan || wan.linkId) continue;
    out.push(
      issue("L009", "warning", "WAN 口没有连线，无法上外网", [
        { deviceId: router.id, portId: wan.id },
      ]),
    );
  }
  return out;
};
