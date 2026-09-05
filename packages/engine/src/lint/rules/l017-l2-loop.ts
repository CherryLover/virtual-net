/** L017 二层成环：同一个 VLAN 里有两条二层路径 */

import type { LintIssue, LintTarget } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l017L2Loop: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  const seen = new Set<string>();
  for (const iface of ctx.runtime.interfaces) {
    const loop = ctx.runtime.reachFrom(iface).loop;
    if (!loop) continue;
    const key = [...loop.linkIds].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const targets: LintTarget[] = [];
    const names: string[] = [];
    for (const linkId of loop.linkIds) {
      const link = ctx.topology.links.find((l) => l.id === linkId);
      if (!link) continue;
      for (const end of [link.a, link.b]) {
        targets.push({ deviceId: end.deviceId, portId: end.portId });
        const name = ctx.name(end.deviceId);
        if (!names.includes(name)) names.push(name);
      }
    }
    out.push(
      issue(
        "L017",
        "error",
        `${names[0] ?? "设备"} 与 ${names[1] ?? "设备"} 之间有两条二层路径，没有生成树协议`,
        targets,
        loop.linkIds[0],
      ),
    );
  }
  return out;
};
