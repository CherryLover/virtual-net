/** L005 同一网段两个接口互在对方网段内但掩码不同 */

import type { LintIssue } from "../../model/lint";
import { inPeerSubnet, issue, type LintRule } from "../context";

const MASK_FIELD: Record<string, string> = { pc: "mask", router: "lan.mask" };

export const l005MaskMismatch: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const segment of ctx.runtime.segments) {
    const addressed = ctx.addressedIn(segment);
    for (let i = 0; i < addressed.length; i += 1) {
      for (let j = i + 1; j < addressed.length; j += 1) {
        const a = addressed[i];
        const b = addressed[j];
        if (!a || !b) continue;
        if (a.mask === b.mask) continue;
        if (!inPeerSubnet(a, b) || !inPeerSubnet(b, a)) continue;
        out.push(
          issue(
            "L005",
            "warning",
            `${a.device.name} 掩码 ${a.mask} 与 ${b.device.name} 掩码 ${b.mask} 不一致`,
            [
              { deviceId: a.device.id, field: MASK_FIELD[a.device.type] },
              { deviceId: b.device.id, field: MASK_FIELD[b.device.type] },
            ],
          ),
        );
      }
    }
  }
  return out;
};
