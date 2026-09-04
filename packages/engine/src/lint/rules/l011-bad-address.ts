/** L011 地址格式不合法：解析失败、掩码非连续 1、主机位是网络地址或广播地址 */

import { isHostAddress, parseIp, parseMask } from "../../model/address";
import type { LintIssue } from "../../model/lint";
import { issue, type LintRule } from "../context";

type Kind = "ip" | "mask";

interface Candidate {
  deviceId: string;
  field: string;
  label: string;
  value: string;
  kind: Kind;
  /** 主机地址还要检查不是网络地址 / 广播地址 */
  hostMask?: string;
}

export const l011BadAddress: LintRule = (ctx) => {
  const candidates: Candidate[] = [];
  for (const pc of ctx.pcs) {
    const c = pc.config;
    candidates.push(
      { deviceId: pc.id, field: "ip", label: "IP", value: c.ip, kind: "ip", hostMask: c.mask },
      { deviceId: pc.id, field: "mask", label: "掩码", value: c.mask, kind: "mask" },
      { deviceId: pc.id, field: "gateway", label: "网关", value: c.gateway, kind: "ip" },
      { deviceId: pc.id, field: "dns", label: "DNS", value: c.dns, kind: "ip" },
    );
  }
  for (const router of ctx.routers) {
    const c = router.config;
    candidates.push(
      {
        deviceId: router.id,
        field: "lan.ip",
        label: "LAN IP",
        value: c.lan.ip,
        kind: "ip",
        hostMask: c.lan.mask,
      },
      {
        deviceId: router.id,
        field: "lan.mask",
        label: "LAN 掩码",
        value: c.lan.mask,
        kind: "mask",
      },
      {
        deviceId: router.id,
        field: "dhcp.rangeStart",
        label: "DHCP 起始地址",
        value: c.dhcp.rangeStart,
        kind: "ip",
      },
      {
        deviceId: router.id,
        field: "dhcp.rangeEnd",
        label: "DHCP 结束地址",
        value: c.dhcp.rangeEnd,
        kind: "ip",
      },
    );
  }

  const out: LintIssue[] = [];
  for (const item of candidates) {
    if (!item.value) continue;
    const ok = item.kind === "ip" ? parseIp(item.value) !== null : parseMask(item.value) !== null;
    if (!ok) {
      const what = item.kind === "ip" ? "IP 地址" : "子网掩码";
      out.push(
        issue("L011", "error", `${item.label} "${item.value}" 不是合法的 ${what}`, [
          { deviceId: item.deviceId, field: item.field },
        ]),
      );
      continue;
    }
    if (
      item.hostMask &&
      parseMask(item.hostMask) !== null &&
      !isHostAddress(item.value, item.hostMask)
    ) {
      out.push(
        issue(
          "L011",
          "error",
          `${item.label} "${item.value}" 是网络地址或广播地址，不能作为主机地址`,
          [{ deviceId: item.deviceId, field: item.field }],
        ),
      );
    }
  }
  return out;
};
