/** L023 同一台路由器的 LAN 与 VLAN 子接口网段重叠 */

import { inSubnet, parseIp, parseMask } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

interface Entry {
  vlanId: number;
  ip: string;
  mask: string;
  field: string;
}

export const l023VlanSubnetOverlap: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const router of ctx.routers) {
    const entries: Entry[] = [
      { vlanId: 1, ip: router.config.lan.ip, mask: router.config.lan.mask, field: "lan.ip" },
      ...(router.config.vlans ?? []).map((v) => ({
        vlanId: v.id,
        ip: v.ip,
        mask: v.mask,
        field: `vlans.${v.id}.ip`,
      })),
    ].filter((e) => parseIp(e.ip) !== null && parseMask(e.mask) !== null);

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (!a || !b) continue;
        if (!inSubnet(a.ip, b.ip, b.mask) && !inSubnet(b.ip, a.ip, a.mask)) continue;
        out.push(
          issue(
            "L023",
            "error",
            `VLAN ${a.vlanId} 网段 ${ctx.subnet(a.ip, a.mask)} 与 VLAN ${b.vlanId} 网段 ${ctx.subnet(b.ip, b.mask)} 重叠`,
            [{ deviceId: router.id, field: b.field }],
          ),
        );
      }
    }
  }
  return out;
};
