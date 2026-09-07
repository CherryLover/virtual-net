import { DEVICE_LABELS, type DeviceType } from "../engine";

export interface LibraryGroup {
  id: string;
  name: string;
  roles: { name: string; types: DeviceType[] }[];
}

// Library placement describes the default entry, not every capability of a node.
export const LIBRARY_GROUPS: LibraryGroup[] = [
  {
    id: "devices",
    name: "设备与主机",
    roles: [
      { name: "接入连接", types: ["modem", "ap"] },
      { name: "交换隔离", types: ["switch"] },
      { name: "路由转发", types: ["router"] },
      { name: "终端与服务器", types: ["pc", "server"] },
    ],
  },
  {
    id: "services",
    name: "软件与服务",
    roles: [
      { name: "代理转发", types: ["proxy"] },
      { name: "访问策略", types: ["access-control"] },
    ],
  },
  {
    id: "networks",
    name: "网络环境",
    roles: [{ name: "外部网络", types: ["internet"] }],
  },
];

const SEARCH_TERMS: Record<DeviceType, string> = {
  pc: "电脑 计算机 客户端 主机 computer client host",
  server: "服务器 主机 应用 服务 网站 DNS 域名 名称解析 application service host",
  modem: "光猫 接入 桥接 modem bridge",
  ap: "无线 AP 接入 wifi wireless access point",
  switch: "交换机 二层 L2 VLAN 隔离 switching",
  router: "路由器 网关 三层 L3 NAT gateway routing",
  proxy: "代理 HTTP CONNECT SOCKS SOCKS5 IP代理 转发",
  "access-control": "访问控制 允许 拒绝 规则 策略 policy filter",
  internet: "互联网 外网 外部网络 internet external network",
};

export function filterLibrary(query: string): LibraryGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return LIBRARY_GROUPS.map((group) => ({
    ...group,
    roles: group.roles
      .map((role) => ({
        ...role,
        types: role.types.filter((type) => {
          const text =
            `${group.name} ${role.name} ${DEVICE_LABELS[type]} ${type} ${SEARCH_TERMS[type]}`.toLowerCase();
          return terms.every((term) => text.includes(term));
        }),
      }))
      .filter((role) => role.types.length > 0),
  })).filter((group) => group.roles.length > 0);
}

export function libraryGroupCount(group: LibraryGroup): number {
  return group.roles.reduce((count, role) => count + role.types.length, 0);
}
