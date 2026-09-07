/** L009 关键端口没有连线 */

import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

export const l009PortUnlinked: LintRule = (ctx) => {
  const out: LintIssue[] = [];
  for (const device of ctx.devices.filter((d) => d.type === "access-control")) {
    for (const port of device.ports) {
      if (!port.linkId)
        out.push(
          issue("L009", "warning", `${port.name} 没有连线，透明访问控制路径不完整`, [
            { deviceId: device.id, portId: port.id },
          ]),
        );
    }
  }
  for (const pc of ctx.pcs) {
    const eth0 = pc.ports[0];
    if (!eth0 || eth0.linkId) continue;
    out.push(issue("L009", "warning", "eth0 没有连线", [{ deviceId: pc.id, portId: eth0.id }]));
  }
  for (const device of [...ctx.switches, ...ctx.aps]) {
    if (device.ports.some((p) => p.linkId)) continue;
    const label = device.type === "switch" ? "交换机" : "无线 AP";
    out.push(issue("L009", "warning", `${label}没有任何连线`, [{ deviceId: device.id }]));
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
