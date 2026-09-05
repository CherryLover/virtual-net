/** L018 双层 NAT：本机在做 NAT，上游又是一台在做 NAT 的设备 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l018DoubleNat: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const router of ctx.routers) {
    if (!router.config.nat) continue;
    const lease = ctx.runtime.leaseOf(router.id, "wan");
    if (!lease?.serverDeviceId || lease.status !== "ok") continue;
    const upstream = ctx.topology.devices.find((d) => d.id === lease.serverDeviceId);
    if (!upstream) continue;
    if (upstream.type !== "router" && upstream.type !== "modem") continue;
    if (upstream.type === "modem" && upstream.config.mode !== "route") continue;
    if (upstream.type === "router" && !upstream.config.nat) continue;
    out.push(
      issue(
        "L018",
        "warning",
        `${router.name} 与 ${upstream.name} 都在做 NAT（双层 NAT），从外面进来要在两台设备上都做端口转发`,
        [{ deviceId: router.id, field: "nat" }],
      ),
    );
  }
  return out;
};
