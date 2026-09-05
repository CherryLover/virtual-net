import type { Device, LeaseStatus, Runtime } from "../../engine";

const FAIL_TEXT: Record<Exclude<LeaseStatus, "ok">, string> = {
  "no-link": "WAN 口没有连线",
  "no-server": "上游没有 DHCP 服务器",
  "pool-exhausted": "地址池已用完",
  "pppoe-required": "上游要求拨号，本机是自动获取，没有拿到地址",
  "pppoe-rejected": "本机在拨号，但上游不接受拨号",
};

/** 只读 WAN 状态，路由器与路由模式光猫共用 */
export function wanStatusText(runtime: Runtime, device: Device): string {
  const lease = runtime.wanLeases.find((l) => l.deviceId === device.id);
  if (!lease) return "还没有取到地址";
  if (lease.status !== "ok") return FAIL_TEXT[lease.status];
  const prefix =
    lease.via === "pppoe" ? "拨号成功" : lease.via === "static" ? "手动设置" : "已获取";
  return `${prefix} ${lease.ip}`;
}
