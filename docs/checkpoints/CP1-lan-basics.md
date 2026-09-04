# CP1 局域网基础

> 总纲对应章节：[ROADMAP.md](../../ROADMAP.md) 的「CP1 局域网基础」
> 前置：CP0 项目骨架（`packages/engine` 与 `apps/web` 两个包、vitest 跑通、空画布能打开）
> 状态：已完成（2026-09-04）

## 目标

做完这个检查点，用户打开页面就能从左侧拖出一台电脑、一台路由器、一个互联网，连两根线，让电脑自动获取地址，然后发起验证：ping 路由器通、ping 8.8.8.8 通、打开国外网站成功。配错了（网关填错网段、关掉 NAT、IP 冲突……）静态检查会列出来并定位到设备，验证结果会说断在哪、为什么。刷新页面不丢，能导出 JSON 再导回来。

本检查点同时定下整个项目的**拓扑 JSON 结构**、**引擎接口**和**决策记录结构**，CP2、CP3 在此基础上扩展而不推翻。

## 范围

### 做
- 三种设备：电脑 `pc`、路由器 `router`、互联网 `internet`；端口、连线；整图可序列化为一份 JSON
- 引擎：网段发现、ARP、直连二层送达、路由表（直连 + 默认路由）、NAT 源地址转换、DHCP 分配（电脑 LAN 侧、路由器 WAN 侧）、DNS 查询与转发
- 验证：ping、访问网站；每一跳一条决策记录；结果带 通/不通、断在哪、原因、该去改哪
- 静态检查：ROADMAP 列出的六条，加上几条不做就说不清失败原因的基础规则
- 界面：左侧设备栏、中间画布、右侧面板（配置 / 结果切换）、顶部工具栏
- 保存：IndexedDB 自动保存、导出 / 导入 JSON、新建

### 不做
- 交换机、VLAN、光猫、无线 AP、多 DHCP 池（CP2）。但数据结构给它们留位置
- 逐跳动画、traceroute、点某一跳看包头的界面（CP3）。但决策记录字段按 CP3 的需要备齐
- 国内 / 境外分区、防火墙、DNS 污染（CP4）。互联网目标本阶段一律可达
- 路由器 WAN 静态地址 / PPPoE、路由器多个 LAN 网段、端口转发、从互联网一侧发起访问
- 撤销 / 重做、多份拓扑管理、框选与批量移动、快捷键之外的右键菜单
- 带宽、延迟、丢包；命令行

## 关键设计

目录与组件命名沿用 [CP0](CP0-project-skeleton.md) 的约定：引擎 `packages/engine/src/{model,engine,lint,serialization}/`，网页 `apps/web/src/{canvas,panels,toolbar,store,storage}/`。下文步骤里的路径都相对这两个 `src/`。

### 1 拓扑数据模型

一份拓扑就是一个 JSON 对象，网页里的 Zustand 状态原样持有它，导出即序列化、导入即替换。**运行时状态（租约、ARP 表、NAT 会话）不进拓扑文件**，每次由引擎从拓扑推导。

**顶层**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | number | 拓扑格式版本，本检查点为 `1`。导入时高于当前支持版本则拒绝 |
| `name` | string | 拓扑名称，默认「未命名拓扑」，导出文件名用它 |
| `devices` | Device[] | 设备列表，数组顺序即创建顺序（DHCP 分配、冲突取舍都按这个顺序，保证结果确定） |
| `links` | Link[] | 连线列表 |
| `viewport` | `{ x, y, zoom }` | 画布视口，恢复时用 |

**设备通用字段 Device**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 全局唯一，前缀 `d_` + 随机串，创建后不变 |
| `type` | `'pc' \| 'router' \| 'internet'` | CP2 追加 `switch` `ap` `modem` |
| `name` | string | 显示名，默认「电脑1」「路由器1」「互联网」，同类按序号递增，可改 |
| `position` | `{ x, y }` | 画布坐标 |
| `ports` | Port[] | 端口列表。pc 固定 1 个，router 固定 5 个，internet 至少 1 个、始终多留一个空闲口 |
| `config` | 按 `type` 不同 | 见下 |

**端口 Port**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 全局唯一，前缀 `p_` |
| `name` | string | 按规范：`eth0` / `wan` `lan1`–`lan4` / `port1`…`portN` |
| `mac` | string | 创建设备时自动生成，`02:00:00:00:00:01` 起顺延（取拓扑内最大值 + 1），拓扑内唯一，不可编辑 |
| `linkId` | string \| null | 连到哪根线。一个端口最多一根线 |
| `vlan` | 预留 | CP1 不写、引擎忽略。CP2 定义内容（access / trunk、PVID、放行列表） |

**连线 Link**：`{ id: 'l_…', a: { deviceId, portId }, b: { deviceId, portId } }`。永远两端，无方向，同一设备两个端口不能互连。

**电脑 `config`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `addressMode` | `'static' \| 'dhcp'` | 手动 / 自动获取。默认 `dhcp` |
| `ip` `mask` `gateway` `dns` | string | 点分十进制，空串表示未填。`dhcp` 模式下保留但不生效，面板置灰，实际地址看运行时租约 |

**路由器 `config`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `lan.ip` `lan.mask` | string | LAN 侧地址。默认 `192.168.1.1` / `255.255.255.0`。`lan1`–`lan4` 属同一网桥，共用这个地址，网桥 MAC 取 `lan1` 的 MAC |
| `dhcp.enabled` | boolean | 默认开 |
| `dhcp.rangeStart` `dhcp.rangeEnd` | string | 默认 `192.168.1.100`–`192.168.1.199` |
| `dhcp.leaseHours` | number | 默认 24。本阶段只展示，不参与模拟 |
| `wan.mode` | `'dhcp'` | 本阶段唯一取值「自动获取公网地址」。CP2 追加 `pppoe` / `static` |
| `nat` | boolean | 默认开 |

**互联网 `config`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `access` | `{ ip, mask, poolStart, poolEnd, dns }` | 接入网段，模拟运营商。默认 `203.0.113.1/24`，地址池 `.2`–`.254`，下发 DNS `8.8.8.8`。CP1 面板只读 |
| `targets[]` | Target[] | 内置目标：`{ id, domain, ip, region: 'cn' \| 'overseas', dnsServer, reachable }`。默认三条：`dns.google` 8.8.8.8（`dnsServer: true`）、`www.baidu.com` 110.242.68.66、`www.google.com` 142.250.72.14。CP1 全部 `reachable: true`，面板只读 |

互联网设备对每个连上来的端口扮演上游：给对端 WAN 口发地址，回答 DNS，代表目标库里所有地址应答。

**最小拓扑示例**（一电脑一路由器一互联网，电脑自动获取）

```json
{
  "version": 1,
  "name": "家庭最小网络",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "devices": [
    {
      "id": "d_pc1", "type": "pc", "name": "电脑1", "position": { "x": 120, "y": 420 },
      "ports": [{ "id": "p_pc1_eth0", "name": "eth0", "mac": "02:00:00:00:00:01", "linkId": "l_1" }],
      "config": { "addressMode": "dhcp", "ip": "", "mask": "", "gateway": "", "dns": "" }
    },
    {
      "id": "d_r1", "type": "router", "name": "路由器1", "position": { "x": 120, "y": 240 },
      "ports": [
        { "id": "p_r1_wan",  "name": "wan",  "mac": "02:00:00:00:00:02", "linkId": "l_2" },
        { "id": "p_r1_lan1", "name": "lan1", "mac": "02:00:00:00:00:03", "linkId": "l_1" },
        { "id": "p_r1_lan2", "name": "lan2", "mac": "02:00:00:00:00:04", "linkId": null },
        { "id": "p_r1_lan3", "name": "lan3", "mac": "02:00:00:00:00:05", "linkId": null },
        { "id": "p_r1_lan4", "name": "lan4", "mac": "02:00:00:00:00:06", "linkId": null }
      ],
      "config": {
        "lan":  { "ip": "192.168.1.1", "mask": "255.255.255.0" },
        "dhcp": { "enabled": true, "rangeStart": "192.168.1.100", "rangeEnd": "192.168.1.199", "leaseHours": 24 },
        "wan":  { "mode": "dhcp" },
        "nat":  true
      }
    },
    {
      "id": "d_inet", "type": "internet", "name": "互联网", "position": { "x": 120, "y": 60 },
      "ports": [
        { "id": "p_inet_1", "name": "port1", "mac": "02:00:00:00:00:07", "linkId": "l_2" },
        { "id": "p_inet_2", "name": "port2", "mac": "02:00:00:00:00:08", "linkId": null }
      ],
      "config": {
        "access": { "ip": "203.0.113.1", "mask": "255.255.255.0", "poolStart": "203.0.113.2", "poolEnd": "203.0.113.254", "dns": "8.8.8.8" },
        "targets": [
          { "id": "t_gdns",   "domain": "dns.google",     "ip": "8.8.8.8",       "region": "overseas", "dnsServer": true,  "reachable": true },
          { "id": "t_baidu",  "domain": "www.baidu.com",  "ip": "110.242.68.66", "region": "cn",       "dnsServer": false, "reachable": true },
          { "id": "t_google", "domain": "www.google.com", "ip": "142.250.72.14", "region": "overseas", "dnsServer": false, "reachable": true }
        ]
      }
    }
  ],
  "links": [
    { "id": "l_1", "a": { "deviceId": "d_pc1", "portId": "p_pc1_eth0" }, "b": { "deviceId": "d_r1",   "portId": "p_r1_lan1" } },
    { "id": "l_2", "a": { "deviceId": "d_r1",  "portId": "p_r1_wan"  }, "b": { "deviceId": "d_inet", "portId": "p_inet_1" } }
  ]
}
```

### 2 引擎运行时与算法

引擎对外只有五个入口，全部是纯函数、不依赖浏览器：`parseTopology(json)`、`buildRuntime(topology)`、`lint(topology)`、`ping(topology, { sourceDeviceId, targetIp })`、`visitSite(topology, { sourceDeviceId, domain })`。每次验证都从一份全新的运行时开始（ARP 表、NAT 会话表为空），结果只取决于拓扑，测试才能确定。

#### 2.1 运行时构建 buildRuntime

按顺序推导，每一步的产物都挂在 `runtime` 上供界面展示和后续算法使用。

1. **网段发现** `segmentOf(portId)`：从一个端口出发沿连线走，遇到二层透明设备就穿过去继续走（CP1 只有路由器的 `lan1`–`lan4` 网桥：进 `lan1` 等于同时到达 `lan2`–`lan4`），收集到的所有**三层接口**构成一个网段。三层接口：pc 的 `eth0`；router 的 `br-lan`（对应 `lan1`–`lan4`，MAC = `lan1` 的 MAC）和 `wan`；internet 的每个 `portN`（地址都是 `access.ip`）
2. **WAN 自动获取**：每台 `wan.mode = 'dhcp'` 且 `wan` 口连到 internet 端口的路由器，按 internet 端口顺序从 `access` 地址池取第一个空闲地址；掩码、网关（= `access.ip`）、DNS（= `access.dns`）一并下发。`wan` 未连线 → 状态 `no-link`；`wan` 所在网段里没有上游（CP1 里上游只有 internet 端口；CP2 起还可以是路由模式的光猫，桥接光猫是透明的、直接穿过）→ 状态 `no-server`
3. **LAN 自动获取**：按 `devices` 顺序处理每台 `addressMode = 'dhcp'` 的电脑。取 `eth0` 所在网段内 `dhcp.enabled` 的路由器为服务器（多台时取先出现的，CP2 加 lint）。没有 → `no-server`；`eth0` 没连线 → `no-link`。地址池按升序取第一个可用地址，跳过：路由器自己的 LAN 地址、同网段已被静态占用的地址、已发出的租约。取不到 → `pool-exhausted`。租约 = `{ ip, mask: lan.mask, gateway: lan.ip, dns: lan.ip, serverDeviceId }`
4. **接口表**：每个三层接口最终拿到 `{ deviceId, name, portIds[], mac, ip, mask }`，静态配置与租约在这一步合并，后面的算法只看接口表
5. **路由表**（每台 pc / router / internet 一张，最长前缀匹配）：
   - pc：直连 `eth0` 网段；`gateway` 非空则加默认路由 `0.0.0.0/0 via gateway`。网关不在直连网段时路由仍在，但标 `viaOffSubnet`，发包时据此终止
   - router：直连 LAN 网段；WAN 有地址时加直连 WAN 网段 + 默认路由 via WAN 网关
   - internet：每个端口的接入网段直连；`targets` 里每个 IP 一条主机路由指向自己；其余没有路由
6. **NAT 会话表**（每台 router 一张，初始为空）：`{ proto, inner: { ip, port }, outer: { ip, port }, peer: { ip, port } }`。ICMP 用 echo id 当端口
7. **ARP 表**（每台三层设备一张，初始为空）：`ip → mac`，验证过程中填充

私网判定 `isPrivate(ip)`：`10/8`、`172.16/12`、`192.168/16` 为私网；`100.64/10` 单独标为「运营商内网」（CP2 光猫、CP7 公网判断要用）。

#### 2.2 一个 ping 包的处理顺序

包摘要 `PacketSummary = { srcMac, dstMac, srcIp, dstIp, proto: 'icmp' | 'udp' | 'tcp', l4: { srcPort?, dstPort?, icmpId?, icmpType? }, ttl, vlan: null }`。起点发出时 TTL 64，ICMP id 固定 1，UDP/TCP 源端口从 40000 起。

**A. 起点发出（pc 或 router，action `originate`）**
1. 起点是 pc 且 `eth0` 没有地址（未填写或租约失败）→ 停 `NO_IP`，原因里带租约状态。没有地址就没有路由表，所以这一步最先
2. 查本机路由表（最长前缀）。无匹配 → 停 `NO_ROUTE`（pc 上文案用 `NO_GATEWAY`）
3. 命中默认路由且 `viaOffSubnet` → 停 `GATEWAY_OFF_SUBNET`
4. 出接口对应端口没有连线 → 停 `PORT_UNLINKED`
5. ARP 下一跳（直连路由下一跳 = 目标 IP，默认路由下一跳 = 网关）：在出接口所在网段找持有该 IP 的接口。没有 → 停 `ARP_MISS`；多个 → 取先出现的，`note` 记「地址冲突」；命中 → 写 ARP 表
6. 组包：源 MAC / IP 取出接口，目的 MAC 取 ARP 结果，目的 IP 取目标，从端口发出。decision 记 `basis.route`、`basis.arp`、`portOut`、`linkId`，`verdict: 'pass'`

**B. 任一设备收到帧**
1. 二层过滤：目的 MAC 不是收到帧的接口 MAC 且不是广播 → 停 `L2_REJECT`（CP1 里不该出现，留给 CP2 网桥 / 交换机放行）
2. 目的 IP 是本设备某个接口地址，或本设备是 internet 且目的 IP 在 `targets` 里 → 走 **D 本机处理**
3. 否则本设备是 router → 走 **C 转发**；是 pc → 停 `NOT_FOR_ME`；是 internet → 停 `UNKNOWN_DEST`
4. 补充：帧从路由器某个 `lanN` 进、目的 MAC 不是网桥自己、而是同网桥另一个 `lanN` 后面的设备（两台电脑分别接 `lan1`、`lan2` 互 ping）→ 路由器只做二层转发，也记一条 decision：`action: 'forward'`、`basis.route = null`、`note` 写「二层转发，未路由」。透明设备到访的完整规则在 CP2 定义

**C. 路由器转发（action `forward`）**
1. TTL 减 1，为 0 → 停 `TTL_EXCEEDED`；整条验证超过 32 条 decision 也按此终止
2. 查路由表。无匹配 → 停 `NO_ROUTE`（文案点明 WAN 口没拿到地址所以没有默认路由）
3. 出接口是 `wan` 且 `nat = true` 且源 IP 在 LAN 网段：查会话表，无则新建（外部端口 / echo id 从原值起，占用则递增），改写源 IP、源端口。`basis.nat = { direction: 'out', before, after }`。`nat = false`：不改写，`note` 记「NAT 关闭，源地址保持 192.168.x.x 出网」
4. ARP 下一跳，失败 → 停 `ARP_MISS`
5. 从出接口对应端口发出。目的在 LAN 侧时 `portOut` 取网段发现里到达目标接口所经的那个 `lanN`

**D. 本机处理**
- router 从 `wan` 收到目的为 WAN 地址的包，先查 NAT 会话：命中 → 改写目的为内网原地址，`basis.nat.direction = 'in'`，转 **C** 继续（这一跳 action 仍是 `forward`）；未命中且不是给路由器自己的应答 → 停 `NAT_NO_SESSION`
- ICMP echo request → action `answer`：生成应答（源目互换、echo id 不变），按 **A** 的 1–6 步路由发出，路由与 ARP 结果记在同一条 decision 的 `basis` 里
- internet 收到目的为 target 的包：`reachable = false` → 停 `TARGET_UNREACHABLE`（CP4 才会出现）；否则 action `answer`，应答路由：原源 IP 在接入网段 → ARP 找到对应端口发出；`isPrivate` → 停 `NO_RETURN_ROUTE`，`fixAt` 指向路径上最后一台 `nat = false` 且从 `wan` 发出的路由器的 `nat` 字段；其他 → 停 `UNKNOWN_DEST`
- 起点收到应答（ICMP echo reply、DNS 应答、TCP 应答）→ action `receive`，`verdict: 'pass'`，本阶段结束

#### 2.3 终止原因一览

`reasonCode` 供测试断言，文案是给人看的最终文字，`{}` 里是填充值。`fixAt` 为空表示就在终止设备上改。

| reasonCode | 出现在 | 文案模板 | fixAt |
| --- | --- | --- | --- |
| `NO_IP` | 起点 | `{设备} 没有 IP 地址：{自动获取失败原因 / 未填写地址}` | — |
| `PORT_UNLINKED` | 任意 | `{设备} 的 {端口} 没有连线` | — |
| `NO_GATEWAY` | pc 起点 | `{目标} 不在本机网段 {网段}，且没有配置网关` | 网关字段 |
| `GATEWAY_OFF_SUBNET` | pc 起点 | `网关 {网关} 不在本机网段 {网段}，无法把包交给网关` | 网关字段 |
| `ARP_MISS` | 任意 | `网段里没有设备使用 {IP}（{网关 / 目标}），ARP 无应答` | — |
| `NO_ROUTE` | router | `{路由器} 没有到 {目标} 的路由：WAN 口未获取到地址，没有默认路由` | WAN 口 |
| `NO_RETURN_ROUTE` | internet | `回程失败：源地址 {IP} 是私网地址，互联网无法把应答送回。{路由器} 的 NAT 已关闭` | 路由器 nat |
| `UNKNOWN_DEST` | internet | `互联网上没有 {IP} 这个地址` | — |
| `NAT_NO_SESSION` | router | `{路由器} 收到发给 {WAN 地址} 的包，但没有对应的 NAT 会话` | — |
| `NOT_FOR_ME` | pc | `{电脑} 收到不属于自己的包，不转发` | — |
| `L2_REJECT` | 任意 | `目的 MAC {MAC} 不是本设备，丢弃` | — |
| `TTL_EXCEEDED` | 任意 | `超过 {n} 跳仍未到达，可能存在环路` | — |
| `NO_DNS` | pc 起点 | `{电脑} 没有配置 DNS 服务器，无法解析 {域名}` | DNS 字段 |
| `DNS_NOT_SERVER` | 任意 | `{IP} 不提供 DNS 服务` | DNS 字段 |
| `DNS_NXDOMAIN` | internet | `域名 {域名} 不存在（不在目标库里）` | — |
| `DNS_NO_UPSTREAM` | router | `{路由器} 没有上游 DNS：WAN 口未获取到地址` | WAN 口 |
| `TARGET_UNREACHABLE` | internet | `目标 {域名} 当前不可达` | — |

#### 2.4 DNS 与访问网站

`visitSite` 分两个阶段，decision 上用 `phase` 区分，失败在哪个阶段就停在哪。

**阶段 `dns`**：起点的 DNS 服务器地址 = 静态 `dns` 或租约 `dns`。为空 → 停 `NO_DNS`。向它发 UDP 53 查询，走 A/B/C 同样的转发流程。谁收到谁回答：
- router（目的是它的 LAN 地址）：作为转发器。没有上游 DNS（WAN 无租约）→ 停 `DNS_NO_UPSTREAM`。否则 action `originate` 一个新查询，源 = WAN 地址，目的 = 上游 DNS，`basis.dns = { domain, upstream }`。这条 decision 的 `packetIn` 是收到的查询（非空），`packetOut` 是新查询；CP3 靠「`originate` 且 `packetIn` 非空」识别「包在中间设备重新出发」。上游应答回来后再 action `answer` 回给电脑
- internet（目的是 `dnsServer: true` 的 target）：在 `targets` 里找域名。找到 → `answer`，`basis.dns = { domain, answer: ip }`；找不到 → 停 `DNS_NXDOMAIN`。目的是 `dnsServer: false` 的 target 或任何 pc → 停 `DNS_NOT_SERVER`

**阶段 `tcp`**：向解析出的 IP 发 TCP 443，流程与 ping 相同，target 端 `answer` 视为连接成功。结果里带 `dns: { server, domain, ip }`。

### 3 决策记录 decision

一次设备到访一条，包在一台设备上做的所有事（路由、ARP、NAT、应答）都写进这一条；每条最多跨一根连线。CP3 的逐跳动画按 `seq` 顺序沿 `linkId` 移动，停在 `deviceId`，点开看 `packetIn` / `packetOut` / `basis`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `seq` | number | 从 1 连续编号 |
| `phase` | `'icmp' \| 'dns' \| 'tcp'` | 所属阶段 |
| `deviceId` | string | 所在设备 |
| `portIn` `portOut` | string \| null | 从哪个口进、从哪个口出。起点无 `portIn`，终点无 `portOut` |
| `linkId` | string \| null | `portOut` 对应的连线，动画用 |
| `action` | `'originate' \| 'forward' \| 'answer' \| 'receive'` | 发出新包 / 转发 / 本机应答 / 起点收到，流程结束 |
| `packetIn` `packetOut` | PacketSummary \| null | 进出包摘要（见 2.2），NAT 前后地址靠这两个字段对照。`vlan` 位 CP1 恒 `null` |
| `basis.route` | `{ dest, mask, via, iface } \| null` | 命中哪条路由 |
| `basis.arp` | `{ ip, mac \| null, hit }` | 查了谁、结果 |
| `basis.nat` | `{ direction: 'out' \| 'in', before: {ip,port}, after: {ip,port} } \| null` | 做了什么映射 |
| `basis.dns` | `{ domain, upstream?, answer? } \| null` | DNS 转发 / 应答 |
| `verdict` | `'pass' \| 'stop'` | 通过 / 终止 |
| `reasonCode` `reason` | string \| null | 终止时必填，见 2.3 |
| `note` | string | 一句话解释，通过时也写（如「命中默认路由，交给网关 192.168.1.1」） |

### 4 验证 probe 接口

| 入口 | 参数 | 说明 |
| --- | --- | --- |
| `ping` | `{ sourceDeviceId, targetIp }` | 起点可以是 pc 或 router，目标是 IP |
| `visitSite` | `{ sourceDeviceId, domain }` | 起点是 pc，先 DNS 再 TCP 443 |

两者都返回 `ProbeResult`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | `'ping' \| 'visitSite' \| 'traceroute'` | `traceroute` 由 CP3 加入 |
| `verdict` | `'ok' \| 'fail'` | 通 / 不通 |
| `summary` | string | 一句话：「电脑1 → 8.8.8.8 通」「电脑1 打开 www.google.com 失败」 |
| `stoppedAt` | deviceId \| null | 断在哪个设备（最后一条 `stop` 的设备） |
| `reasonCode` `reason` | string \| null | 同最后一条 decision |
| `fixAt` | `{ deviceId, field?, portId? } \| null` | 建议去哪改。结果面板「定位」优先用它，没有则用 `stoppedAt`。CP1 只用 `field`；`portId` 留给 CP2 定位到具体端口（VLAN 配错） |
| `dns` | `{ server, domain, ip } \| null` | 仅 `visitSite`，解析成功时有 |
| `hops` | `Hop[] \| null` | 仅 `traceroute`（CP3 定义 `Hop`），其他类型为 `null` |
| `decisions` | Decision[] | 全部决策记录，按 `seq` 排好 |
| `path` | deviceId[] | 去重后的到访顺序，供结果面板显示「电脑1 → 路由器1 → 互联网 → 路由器1 → 电脑1」 |

### 5 静态检查 lint 规则表

`lint(topology)` 返回 `LintIssue[]`：`{ ruleId, severity: 'error' | 'warning', message, targets: [{ deviceId, portId?, field? }], linkId? }`。`error` = 一定通不了，`warning` = 可疑。所有涉及地址比较的规则，自动获取的一方用租约里的值；没拿到租约的一方跳过比较（由 L010 单独报）。

| 编号 | 检查什么 | 触发条件 | 级别 | 定位 | 文案要点 |
| --- | --- | --- | --- | --- | --- |
| L001 | IP 冲突 | 同一网段内两个接口地址相同 | error | 两台设备 | `{IP} 被 {设备A} 和 {设备B} 同时使用` |
| L002 | 网关不在本网段 | pc 手动，网关非空且不在 `ip/mask` 网段 | error | pc，字段 gateway | `网关 {网关} 不在 {网段} 网段内` |
| L003 | 没配网关 | pc 手动，网关为空 | warning | pc，字段 gateway | `没有配置网关，只能访问 {网段} 内的设备` |
| L004 | 一根线两端不在同一网段 | 连线两端都是三层接口且都有地址，至少一端地址不在另一端网段内。跳过 wan–internet | error | 两台设备 + 连线 | `{设备A}（{IP/掩码}）和 {设备B}（{IP/掩码}）直连但不在同一网段` |
| L005 | 掩码不一致 | 同一网段两个接口互在对方网段内但掩码不同 | warning | 两台设备，字段 mask | `{设备A} 掩码 {掩码} 与 {设备B} 掩码 {掩码} 不一致` |
| L006 | DHCP 地址池与静态地址重叠 | 路由器 DHCP 开，同网段某手动电脑地址落在池内 | warning | pc + router，字段 dhcp | `{电脑} 的地址 {IP} 在 {路由器} 的 DHCP 地址池 {起}–{止} 内，可能被分给别的设备` |
| L007 | 地址池包含路由器自己 | `lan.ip` 落在池内 | error | router，字段 dhcp | `DHCP 地址池包含路由器自己的地址 {IP}` |
| L008 | 地址池不在 LAN 网段 | 起止任一不在 `lan` 网段，或起 > 止 | error | router，字段 dhcp | `DHCP 地址池 {起}–{止} 不在 LAN 网段 {网段} 内` / `起始地址大于结束地址` |
| L009 | 端口未连线 | pc `eth0` 无连线；router `wan` 无连线（CP2 追加：交换机 / AP 没有任何连线） | warning | 设备 + 端口 | `eth0 没有连线` / `WAN 口没有连线，无法上外网` |
| L010 | 自动获取失败 | pc `dhcp` 模式，租约状态非 `ok` | error | pc，字段 addressMode | `自动获取地址失败：所在网段没有 DHCP 服务器` / `地址池已用完` |
| L011 | 地址格式不合法 | 任一 IP / 掩码字段非空但解析失败；主机地址为网络地址或广播地址；掩码非连续 1 | error | 设备 + 字段 | `{字段} "{原值}" 不是合法的 {IP 地址 / 子网掩码}` |
| L012 | 没配 DNS | pc 手动，DNS 为空 | warning | pc，字段 dns | `没有配置 DNS，无法用域名访问网站` |
| L013 | NAT 关闭 | router `nat = false` | warning | router，字段 nat | `NAT 已关闭，局域网设备访问外网时无法回程` |

编号全项目连续，CP2 从 L014 起。

### 6 界面

样式：手写 CSS。`app.css` 放 CSS 变量（颜色、间距、字号）与全局样式，每个组件一个同名 `.css` 文件，不引 Tailwind 或组件库（CP0 待定问题 3 已定）。

沿用 CP0 的布局：**顶部工具栏** 横跨（CP0 的 `Toolbar` 组件，本阶段填入按钮）、**左侧设备栏** 240px、**中间画布** 自适应、**右侧面板** 320px。

**左侧设备栏**：三张卡片「电脑」「路由器」「互联网」，拖到画布放下即创建，落点为设备位置。文案只有名字。

**中间画布**（`@xyflow/react`）。React Flow 的 node id 就是 `device.id`，edge id 就是 `link.id`，不另起一套（CP3 的动画取点与高亮依赖这一点）。
- 每种设备一个自定义节点：顶部显示名称，第二行显示关键地址（pc：`192.168.1.100` 或「未获取到地址」；router：`LAN 192.168.1.1`；internet：无）；右上角红点显示该设备 lint error 数
- 端口即连接柄，柄旁写端口名：pc `eth0` 在顶边；router `wan` 顶边、`lan1`–`lan4` 底边；internet `port1`…`portN` 底边，始终留一个空闲口
- 连线：从一个柄拖到另一个柄。拒绝：任一端口已有连线、同一设备内互连。连线中点标签 `eth0 – lan1`
- 选中：点节点 / 连线；`Delete` / `Backspace` 删除选中项，删设备时连带删它的连线；拖动移动；滚轮缩放、空白处拖动平移
- 存在 lint error 的连线（L004）标红

**右侧面板** 随选中状态切换：

选中设备 → **配置表单**。名称字段所有设备都有。字段失焦校验，非法值红字提示且不写入，离开设备丢弃非法草稿。

| 设备 | 字段 | 校验 |
| --- | --- | --- |
| 电脑 | 地址模式（手动 / 自动获取）；IP、掩码、网关、DNS | 自动获取时四项置灰，下方只读显示租约：`已获取 192.168.1.100 / 255.255.255.0，网关 192.168.1.1，DNS 192.168.1.1（来自 路由器1）` 或失败原因。手动时 IP、掩码必填，网关、DNS 可空；格式按 L011 |
| 路由器 | LAN IP、LAN 掩码；DHCP 开关、起始、结束、租期；WAN 模式（只读「自动获取公网地址」）+ 只读显示 WAN 租约；NAT 开关 | LAN IP、掩码必填；DHCP 开时起止必填且格式合法（网段归属交给 L008 报，不阻止输入） |
| 互联网 | 接入地址（只读）、目标列表（只读表格：域名、IP、位置） | 无 |

未选中 → **结果面板**，两段：
- 「静态检查」：按 error 在前列出所有 `LintIssue`，每行 级别图标 + 设备名 + 文案。无问题显示「没有问题」。点一行 → 选中该设备并居中，若有 `field` 则表单对应字段高亮
- 「最近验证」：没有验证过显示「还没有验证」。有则显示 `summary`、`reason`（失败时）、`path`，下方逐跳列表：每行 `seq` + 设备名 + action 中文 + `note`，终止行标红。点一行 → 选中该设备；顶部「定位」按 `fixAt` 跳到设备与字段

**顶部工具栏**：拓扑名称（可编辑）、`新建`、`导入`、`导出`、`验证`、右端保存状态「已保存 / 保存中」。
`验证` 弹出小面板：类型（ping / 访问网站）、起点（下拉，列出 pc 与 router）、目标（ping 时填 IP，旁边可快速选择画布上设备的地址和互联网目标；访问网站时从目标库域名下拉选）、`运行`。运行后关闭弹窗、取消选中、右侧面板切到结果。

### 7 保存

- **IndexedDB**：库 `virtual-net`，表 `topologies`，键 `current`，值 `{ topology, savedAt }`。拓扑任何变化（设备、连线、配置、位置、视口、名称）后 500 ms 防抖写入；写入期间工具栏显示「保存中」。页面加载时读 `current`，没有则给空拓扑。运行时状态、lint 结果、验证结果不保存，加载后重新算
- **导出**：`JSON.stringify(topology, null, 2)`，文件名 `{name}.json`
- **导入**：选 `.json` 文件 → `parseTopology` 校验（`version` ≤ 1、字段类型、id 唯一、`linkId` 与 `links` 互相对应、端口名符合设备类型）→ 失败弹「文件格式不对：{第一条错误}」不改动当前图；成功且当前画布非空 → 确认「替换当前画布？」→ 替换并立即保存
- **新建**：画布非空 → 确认「清空当前画布？未导出的内容会丢失」→ 空拓扑并立即保存；画布为空直接重置
- 名称随拓扑保存，导入时取文件里的名称

## 步骤

### CP1-S1 拓扑数据模型与序列化
- **做什么**：把第 1 节的结构落成 TypeScript 类型、默认值工厂、解析校验，engine 与 web 共用
- **怎么做**：`model/` 下放 `topology.ts`（类型）、`defaults.ts`（`createDevice(type, position, topology)` 生成默认名、默认配置、5 / 1 / 2 个端口与顺延 MAC）、`address.ts`（IP / 掩码解析、网段判断、`isPrivate`）；decision、ProbeResult、LintIssue 的类型也放这里。`serialization/parse.ts` 放 `parseTopology(json)`，返回拓扑或错误列表
- **产出物**：`model/`、`serialization/` 模块及其测试；第 1 节的示例 JSON 作为 fixture 存进 `packages/engine/fixtures/minimal.json`
- **验收标准**：
  - 【引擎测试】空拓扑连续创建 电脑、路由器、互联网 → 名称为「电脑1」「路由器1」「互联网」，端口名分别为 `eth0`、`wan lan1–lan4`、`port1`，MAC 从 `02:00:00:00:00:01` 起连续
  - 【引擎测试】`parseTopology(minimal.json)` → 成功，再 `JSON.stringify` 后与原文件深比较相等
  - 【引擎测试】把 fixture 里某根线的 `portId` 改成不存在的 id → 解析失败，错误里带该 `linkId`；`version: 2` → 失败，错误提示「版本高于支持」
  - 【引擎测试】`parseMask('255.255.0.255')` 非法，`'255.255.255.0'` 合法且前缀 24；`isPrivate('100.64.1.1')` 返回「运营商内网」标记
- **测试用例**：[T-CP1-001](../TEST-PLAN.md) – [T-CP1-004](../TEST-PLAN.md)

### CP1-S2 运行时构建与 DHCP 分配
- **做什么**：实现 2.1 节 `buildRuntime`：网段发现、WAN 与 LAN 自动获取、接口表、路由表
- **怎么做**：`engine/runtime/segment.ts`（`segmentOf`，把路由器 `lan1`–`lan4` 视为一个网桥）、`dhcp.ts`、`interfaces.ts`、`routes.ts`（最长前缀匹配）；`runtime.leases[]` 带 `status` 与 `serverDeviceId`
- **产出物**：`engine/runtime/` 模块及测试
- **验收标准**：
  - 【引擎测试】fixture 拓扑 → 电脑1 租约 `192.168.1.100/24`，网关与 DNS `192.168.1.1`，来自 路由器1；路由器1 WAN 租约 `203.0.113.2/24`，网关 `203.0.113.1`，DNS `8.8.8.8`
  - 【引擎测试】fixture 基础上再加一台手动电脑 `192.168.1.100/24` 接 `lan2`，电脑1 仍自动获取 → 电脑1 拿到 `192.168.1.101`（跳过已占用）
  - 【引擎测试】路由器 DHCP 关 → 电脑1 租约状态 `no-server`；池改为 `.100`–`.100` 且加第二台自动获取电脑 → 第二台 `pool-exhausted`
  - 【引擎测试】断开 `wan` 连线 → 路由器路由表只有 LAN 直连，没有默认路由
  - 【引擎测试】电脑手动 `192.168.1.10/24` 网关 `10.0.0.1` → 路由表默认路由存在且 `viaOffSubnet = true`
- **测试用例**：[T-CP1-005](../TEST-PLAN.md) – [T-CP1-009](../TEST-PLAN.md)

### CP1-S3 二层送达：ARP 与直连 ping
- **做什么**：实现 2.2 节 A、B、D 里同网段的部分：起点发出、ARP、对端应答、起点收到；从这一步起所有输出都是第 3 节的 decision
- **怎么做**：`engine/sim/arp.ts`（在网段内找 IP 持有者，写 ARP 表）、`engine/sim/frame.ts`（PacketSummary 构造）、`engine/sim/ping.ts`（先只支持直连路由）、`engine/sim/decision.ts`（decision 构造器，保证 `seq` 连续、终止条目必有 `reasonCode`）
- **产出物**：`engine/sim/` 模块雏形；`ping` 能处理同网段
- **验收标准**：
  - 【引擎测试】电脑A `192.168.1.10/24` 直连 路由器 `lan1`（LAN `192.168.1.1/24`），ping `192.168.1.1` → `verdict: 'ok'`，decisions 三条：电脑A `originate`（`basis.arp.mac` = lan1 的 MAC）、路由器 `answer`、电脑A `receive`；`path` = [A, 路由器, A]
  - 【引擎测试】同上 ping `192.168.1.2`（网段里没人）→ `fail`，一条 decision，`reasonCode: ARP_MISS`，文案含「192.168.1.2」和「ARP 无应答」
  - 【引擎测试】手动地址的电脑A `eth0` 不连线 ping 任何地址 → `PORT_UNLINKED`
  - 【引擎测试】电脑A 自动获取但无 DHCP 服务器 → `NO_IP`，文案含「没有 DHCP 服务器」；自动获取且 `eth0` 不连线 → `NO_IP`，文案含「没有连线」
  - 【引擎测试】两台电脑 `eth0`–`eth0` 直连、同网段互 ping → 通；一台改成 `192.168.2.x/24` → 起点 `NO_GATEWAY`
- **测试用例**：[T-CP1-010](../TEST-PLAN.md) – [T-CP1-014](../TEST-PLAN.md)

### CP1-S4 三层转发：路由表、默认路由与网关失败
- **做什么**：实现 C 转发（暂不含 NAT）与 A 里默认路由相关的终止；互联网设备作为目标应答
- **怎么做**：`engine/sim/forward.ts`：TTL、查路由、ARP 下一跳、`portOut` 选择；`engine/sim/internet.ts`：目标库应答与回程路由；`ping` 接入完整流程；先用「路由器 NAT 关闭」的拓扑跑，验证转发本身
- **产出物**：跨网段 ping 能走完去程
- **验收标准**：
  - 【引擎测试】fixture 拓扑，电脑1 ping `8.8.8.8`，路由器 `nat: false` → 去程 decisions：电脑1 `originate`（`basis.route.via = 192.168.1.1`）、路由器1 `forward`（`portIn = lan1`，`portOut = wan`，TTL 63，源 IP 仍 `192.168.1.100`）、互联网 `answer` 时 `stop`，`reasonCode: NO_RETURN_ROUTE`
  - 【引擎测试】电脑1 手动 `192.168.1.10/24` 网关 `10.0.0.1`，ping `8.8.8.8` → 一条 decision，`GATEWAY_OFF_SUBNET`，`fixAt = { 电脑1, 'gateway' }`
  - 【引擎测试】网关填 `192.168.1.254`（无人使用）→ `ARP_MISS`，文案含「网关」
  - 【引擎测试】断开 `wan` 连线，ping `8.8.8.8` → 停在路由器1，`NO_ROUTE`，文案含「WAN 口未获取到地址」
  - 【引擎测试】ping `1.1.1.1`（不在目标库）→ 停在互联网，`UNKNOWN_DEST`
- **测试用例**：[T-CP1-015](../TEST-PLAN.md) – [T-CP1-019](../TEST-PLAN.md)

### CP1-S5 NAT 与外网回程
- **做什么**：实现 C 第 3 步的源地址转换与 D 里 WAN 侧入向的会话匹配
- **怎么做**：`engine/sim/nat.ts`：会话表、出向改写、入向还原；`NO_RETURN_ROUTE` 的 `fixAt` 回溯路径找 NAT 关闭的路由器
- **产出物**：外网 ping 完整往返
- **验收标准**：
  - 【引擎测试】fixture 拓扑 ping `8.8.8.8` → `ok`，五条 decisions；路由器1 去程 `basis.nat = { out, before 192.168.1.100, after 203.0.113.2 }`，`packetOut.srcIp = 203.0.113.2`；回程 `basis.nat.direction = 'in'`，`packetOut.dstIp = 192.168.1.100`；`path` = [电脑1, 路由器1, 互联网, 路由器1, 电脑1]
  - 【引擎测试】`nat: false` → `fail`，`stoppedAt` = 互联网，`fixAt = { 路由器1, 'nat' }`，文案含「私网地址」「无法把应答送回」「NAT 已关闭」
  - 【引擎测试】路由器从 `wan` 收到目的为 WAN 地址、无对应会话的 ICMP 应答 → `NAT_NO_SESSION`
  - 【引擎测试】同一次 `visitSite` 里 DNS 和 TCP 两个会话外部端口不同，互不覆盖
- **测试用例**：[T-CP1-020](../TEST-PLAN.md) – [T-CP1-023](../TEST-PLAN.md)

### CP1-S6 决策记录与 probe 接口收口
- **做什么**：实现 2.4 节 DNS 与 `visitSite`；`ping` 起点支持 router；补齐 ProbeResult 的 `summary`、`path`、`fixAt`；写 ROADMAP 五个验收场景的引擎测试
- **怎么做**：`engine/sim/dns.ts`（路由器转发器、互联网解析）、`engine/sim/visitSite.ts`（两阶段串联，`phase` 标记）、`engine/sim/result.ts`（从 decisions 推 ProbeResult）；`packages/engine/src/index.ts` 导出五个入口；`scenarios/cp1.test.ts` 一个场景一个 `it`（目录约定见 CP0）
- **产出物**：引擎公共 API 定稿；场景测试
- **验收标准**：
  - 【引擎测试】fixture 拓扑 `visitSite(电脑1, 'www.google.com')` → `ok`，`dns = { 192.168.1.1, www.google.com, 142.250.72.14 }`；`dns` 阶段 decisions 含 路由器1 `originate`（`basis.dns.upstream = 8.8.8.8`）与 互联网 `answer`（`basis.dns.answer`）；`tcp` 阶段路径同 ping 8.8.8.8
  - 【引擎测试】电脑1 手动配置 DNS 为空 → `NO_DNS`，`fixAt` 字段 `dns`；DNS 填 `110.242.68.66` → `DNS_NOT_SERVER`；域名 `www.nonexistent.test` → `DNS_NXDOMAIN`，停在互联网
  - 【引擎测试】断开 `wan`，DNS 指向路由器 → `DNS_NO_UPSTREAM`，停在路由器1
  - 【引擎测试】`ping(路由器1, '8.8.8.8')` → `ok`，源 IP 为 WAN 地址，无 NAT 记录
  - 【引擎测试】任何结果里 `decisions[i].seq === i + 1`；最后一条 `verdict` 与结果一致；`stop` 条目 `reasonCode` 非空且 `reason` 非空
  - 【命令】`pnpm test` 通过，`scenarios/cp1.test.ts` 包含 4 个 `it`，名字与 ROADMAP 场景 1–4 对应
- **测试用例**：[T-CP1-024](../TEST-PLAN.md) – [T-CP1-029](../TEST-PLAN.md)

### CP1-S7 静态检查 lint
- **做什么**：实现第 5 节 L001–L013
- **怎么做**：`lint/rules/` 每条规则一个文件，`lint(topology)` 内部先 `buildRuntime` 再逐条跑；输出按 `severity` 再按 `ruleId` 排序
- **产出物**：`lint/` 模块与每条规则的正反测试
- **验收标准**：
  - 【引擎测试】fixture 拓扑 → 空数组
  - 【引擎测试】电脑1 手动 `192.168.1.10/24` 网关 `10.0.0.1` → 恰好一条 L002，`targets[0] = { 电脑1, field: 'gateway' }`，文案含「10.0.0.1」「192.168.1.0/24」
  - 【引擎测试】两台手动电脑同为 `192.168.1.10` 接同一路由器 → L001 一条，`targets` 两台电脑
  - 【引擎测试】电脑 `192.168.2.10/24` 直连路由器 `lan1`（`192.168.1.1/24`）→ L004 带 `linkId`；电脑改 `192.168.1.10/16`（网关 `192.168.1.1`）→ 只报 L005 不报 L004
  - 【引擎测试】手动电脑 `192.168.1.150` + 路由器默认池 → L006；LAN IP 改 `192.168.1.100` → L007；池改 `192.168.2.100–199` → L008
  - 【引擎测试】`nat: false` → L013；`wan` 未连线 → L009；电脑 IP 填 `300.1.1.1` → L011 且不抛异常
- **测试用例**：[T-CP1-030](../TEST-PLAN.md) – [T-CP1-035](../TEST-PLAN.md)

### CP1-S8 画布：设备栏、拖入、连线、选中与删除
- **做什么**：第 6 节左侧设备栏与中间画布
- **怎么做**：`apps/web/src/store/topology.ts`（Zustand，持有拓扑与选中项，所有修改走 action）、`canvas/nodes/{Pc,Router,Internet}Node.tsx`、`canvas/DeviceEdge.tsx`、`panels/DeviceBar.tsx`（CP0 已建，此处填入三张卡片）；React Flow 的 nodes / edges 由拓扑派生，拖动结束回写 `position`，`onConnect` 校验后写 `links` 与两端 `linkId`；互联网连线变化后维持一个空闲端口
- **产出物**：能搭出 fixture 那张图的画布
- **验收标准**：
  - 【页面操作】从设备栏拖「电脑」到画布 → 出现「电脑1」节点，顶部一个 `eth0` 柄；再拖一次 → 「电脑2」
  - 【页面操作】拖「路由器」→ 节点顶部 `wan`，底部 `lan1`–`lan4`；拖「互联网」→ 底部 `port1`
  - 【页面操作】从 `eth0` 拖到 `lan1` → 连线出现，标签 `eth0 – lan1`；再从 `eth0` 拖到 `lan2` → 不产生新线
  - 【页面操作】从 `wan` 拖到 `port1` → 连线出现，互联网节点长出 `port2`
  - 【页面操作】选中连线按 `Delete` → 线消失，两端柄恢复可连；选中路由器按 `Delete` → 节点和它的两根线一起消失
  - 【页面操作】拖动节点松手 → 节点停在新位置；缩放、平移画布后各节点相对位置和连线不变
- **测试用例**：[T-CP1-036](../TEST-PLAN.md) – [T-CP1-041](../TEST-PLAN.md)

### CP1-S9 配置面板
- **做什么**：第 6 节右侧面板的表单部分
- **怎么做**：`panels/DevicePanel.tsx`（由 CP0 的 `SidePanel` 按选中状态挂载）按类型分发到 `PcForm` `RouterForm` `InternetForm`；字段用本地草稿 + 失焦提交；`address.ts` 的校验函数直接复用；租约信息从 `buildRuntime` 结果读，每次拓扑变化重算
- **产出物**：三种表单
- **验收标准**：
  - 【页面操作】搭好 fixture 图，点电脑1 → 面板显示地址模式「自动获取」，四个字段置灰，下方「已获取 192.168.1.100 / 255.255.255.0，网关 192.168.1.1，DNS 192.168.1.1（来自 路由器1）」
  - 【页面操作】切「手动」→ 四字段可编辑；IP 填 `300.1.1.1` 失焦 → 字段下红字「不是合法的 IP 地址」，节点上地址行不变；改回 `192.168.1.10` → 节点地址行更新
  - 【页面操作】点路由器1 → LAN `192.168.1.1` / `255.255.255.0`，DHCP 开 `.100`–`.199` 租期 24，WAN「自动获取公网地址 · 已获取 203.0.113.2」，NAT 开；关闭 DHCP → 电脑1 节点地址行变「未获取到地址」
  - 【页面操作】点互联网 → 只读接入地址与三行目标表；改名称为「外网」→ 节点标题同步
- **测试用例**：[T-CP1-042](../TEST-PLAN.md) – [T-CP1-045](../TEST-PLAN.md)

### CP1-S10 结果面板与发起验证
- **做什么**：第 6 节结果面板与工具栏「验证」弹窗
- **怎么做**：`panels/ResultsPanel.tsx`（lint 列表 + 最近验证）、`toolbar/ProbeDialog.tsx`；lint 在拓扑变化后重算并写入 store；验证调用引擎 `ping` / `visitSite`，结果写入 store `lastProbe`；节点右上角红点读 lint 结果
- **产出物**：完整的验证闭环
- **验收标准**：
  - 【页面操作】fixture 图，点空白处 → 面板「静态检查：没有问题」「最近验证：还没有验证」
  - 【页面操作】电脑1 改手动、网关 `10.0.0.1` → 静态检查出现一行「电脑1 · 网关 10.0.0.1 不在 192.168.1.0/24 网段内」，电脑1 节点红点 1；点该行 → 电脑1 选中，网关字段高亮
  - 【页面操作】工具栏「验证」→ 类型 ping、起点 电脑1、目标 `192.168.1.1`、运行 → 弹窗关闭，面板显示「电脑1 → 192.168.1.1 通」，路径「电脑1 → 路由器1 → 电脑1」，逐跳三行
  - 【页面操作】改回自动获取，验证 ping `8.8.8.8` → 通，逐跳五行，路由器1 两行的 note 分别含「NAT」
  - 【页面操作】关路由器 NAT 再验证 → 「不通」，原因含「私网地址」「NAT 已关闭」，点「定位」→ 路由器1 选中、NAT 开关高亮
  - 【页面操作】验证「访问网站」起点 电脑1 域名 `www.google.com` → 「成功」，显示 DNS 解析结果 `142.250.72.14`，逐跳列表分「DNS」「连接」两组
- **测试用例**：[T-CP1-046](../TEST-PLAN.md) – [T-CP1-051](../TEST-PLAN.md)

### CP1-S11 保存：自动保存、导入导出、新建
- **做什么**：第 7 节
- **怎么做**：`storage/db.ts`（`idb` 封装，`load` / `save`）、store 订阅 500 ms 防抖保存、启动时加载；`toolbar/Toolbar.tsx` 的新建 / 导入 / 导出按钮与保存状态；导入走 `parseTopology`
- **产出物**：刷新不丢；JSON 进出
- **验收标准**：
  - 【页面操作】搭 fixture 图，等工具栏显示「已保存」，刷新 → 图、配置、视口一致
  - 【页面操作】点「导出」→ 下载 `家庭最小网络.json`，内容与第 1 节示例结构一致（id、MAC 可不同）
  - 【页面操作】点「新建」→ 确认框；确认 → 空画布，刷新仍为空
  - 【页面操作】点「导入」选刚导出的文件 → 三设备两连线回来，位置与配置一致；验证 ping `8.8.8.8` 结果与导出前相同
  - 【页面操作】导入一个 `version: 2` 的文件 → 提示「文件格式不对：版本高于支持」，画布不变
  - 【页面操作】画布非空时导入 → 先弹「替换当前画布？」
- **测试用例**：[T-CP1-052](../TEST-PLAN.md) – [T-CP1-057](../TEST-PLAN.md)

## 阶段完成标准

测试用例：[T-CP1-058](../TEST-PLAN.md) – [T-CP1-062](../TEST-PLAN.md)

以下按顺序在页面上做一遍，全部符合预期才算过；每个场景在 `scenarios/cp1.test.ts` 里有一条同名引擎测试。

**场景 1：最小闭环**
1. 「新建」得到空画布。从左侧依次拖入 电脑、路由器、互联网 → 出现「电脑1」「路由器1」「互联网」
2. 从 电脑1 `eth0` 拖到 路由器1 `lan1`；从 路由器1 `wan` 拖到 互联网 `port1` → 两根线，标签 `eth0 – lan1`、`wan – port1`
3. 点 电脑1 → 地址模式已是「自动获取」，下方显示「已获取 192.168.1.100 / 255.255.255.0，网关 192.168.1.1，DNS 192.168.1.1（来自 路由器1）」。点 路由器1 → DHCP 开、NAT 开、WAN 已获取 `203.0.113.2`，不改
4. 点空白 → 静态检查「没有问题」
5. 「验证」ping，起点 电脑1，目标 `192.168.1.1` → 「电脑1 → 192.168.1.1 通」，路径 电脑1 → 路由器1 → 电脑1
6. 「验证」ping 目标 `8.8.8.8` → 通，路径 电脑1 → 路由器1 → 互联网 → 路由器1 → 电脑1，路由器1 去程一行 note 含「192.168.1.100 → 203.0.113.2」
7. 「验证」访问网站，域名 `www.google.com` → 「成功」，DNS `192.168.1.1` 解析到 `142.250.72.14`

**场景 2：网关配错**
1. 接场景 1。点 电脑1，地址模式切「手动」，IP `192.168.1.10`，掩码 `255.255.255.0`，网关 `10.0.0.1`，DNS `192.168.1.1`
2. 点空白 → 静态检查一行「电脑1 · 网关 10.0.0.1 不在 192.168.1.0/24 网段内」，点它 → 电脑1 选中且网关字段高亮
3. 「验证」ping `8.8.8.8` → 「不通」，断在 电脑1，原因「网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关」，逐跳仅一行

**场景 3：关掉 NAT**
1. 接场景 2。电脑1 网关改回 `192.168.1.1`，保持手动 `192.168.1.10`。点 路由器1，关闭 NAT → 静态检查出现「路由器1 · NAT 已关闭…」
2. 「验证」ping `8.8.8.8` → 「不通」，断在 互联网，原因「回程失败：源地址 192.168.1.10 是私网地址，互联网无法把应答送回。路由器1 的 NAT 已关闭」；逐跳三行，最后一行红；点「定位」→ 路由器1 选中，NAT 开关高亮
3. 打开 NAT 再验证 → 通

**场景 4：导出、清空、导入**
1. 接场景 3（NAT 已打开）。「导出」→ 得到 `家庭最小网络.json`
2. 「新建」→ 确认 → 空画布。刷新页面仍为空
3. 「导入」选刚才的文件 → 三设备两连线，位置、电脑1 手动配置、路由器配置全部一致
4. 「验证」ping `8.8.8.8` → 通，逐跳与场景 3 第 3 步一致

**场景 5：引擎自动测试**
- 【命令】`pnpm test` 通过；`scenarios/cp1.test.ts` 中场景 1–4 各一条 `it`，断言 `verdict`、`stoppedAt`、`reasonCode`、`fixAt` 与上面文字一致；场景 4 断言 `parseTopology(JSON.stringify(t))` 深等于 `t` 且两次 `ping` 结果深等于

## 实施记录（2026-09-04）

引擎与网页由两个 agent 并行实施，我独立复验：`pnpm lint / typecheck / test / build` 全绿，引擎 9 个文件 51 条测试；页面上亲手走了场景 1、2 与刷新保存，结果与文档逐字一致。62 条用例全部通过，导出文件的真实落盘未在自动化浏览器里验证。

与文档的偏差与补充决定：

引擎
- 新建互联网默认只有 `port1`，「始终多留一个空闲口」由网页在连线变化后调 `createInternetPort` 维持
- `NAT_NO_SESSION` 的测试拓扑：路由器 LAN 与互联网接入同用 `203.0.113.0/24`、NAT 关、电脑静态地址等于路由器 WAN 拿到的地址，应答回到 WAN 口而会话表为空
- 「两个 NAT 会话」的测试把电脑 DNS 设为 `8.8.8.8`，否则 DNS 查询发给路由器不经 NAT
- L011 对「网络地址 / 广播地址当主机地址」另给一句文案；L010 与 `NO_IP` 共用原因短句；L004 文案用前缀写法（`192.168.2.10/24`）
- `NO_IP` 的 `fixAt` 为空，面板退回 `stoppedAt`
- 新增 `src/test-support/`（仅测试用，不导出）；引擎 `tsconfig` 加 `resolveJsonModule` 并把 `fixtures` 纳入 include
- 同一互联网设备的地址池跨端口共享，避免两台路由器拿到同一地址
- `parseTopology` 返回 `{ ok, topology, errors }`，错误是带 path 的对象；租约字段名 `ifaceName`；空拓扑工厂 `createEmptyTopology`
- `isPrivate` 返回 `'private' | 'carrier' | 'public'`，`carrier` 即「运营商内网」

网页
- 新增依赖 `idb`
- 右侧面板底部 CP0 的「引擎 0.0.0」去掉，CP1 界面规格里没有它
- 「导入」用页面内常驻的隐藏文件输入框
- 选中连线时右侧显示结果面板；第二个互联网命名「互联网2」
- 修了一个 React Flow 节点尺寸测量被覆盖导致连线时隐时现的问题；恢复了 React Flow 的署名标记（隐藏需要 Pro 订阅）
- 页面上从设备栏拖入、拉线、拖动节点时，起点要落在端口圆点或节点主体上；从端口名文字处起拖会变成平移画布，这是 React Flow 默认行为

## 对其他检查点的约定

后续检查点**必须遵守**：
1. **拓扑 JSON 结构**（第 1 节）。新增设备类型只允许扩展 `Device.type` 联合类型和对应 `config` 形状；`Device` 通用字段、`Port`、`Link` 字段不改。格式有不兼容改动必须升 `version` 并在 `parseTopology` 里写迁移
2. **端口 `vlan` 预留位**：CP1 不写，CP2 在这里定义 access / trunk、PVID、放行列表；引擎所有二层判断以后都要经过 `segmentOf`，CP2 在 `segmentOf` 里加 VLAN 过滤而不是另写一套
3. **运行时不落盘**：租约、ARP、NAT 会话永远由 `buildRuntime` 推导。光猫拨号、多 DHCP 池都进 `buildRuntime`
4. **引擎五个入口**的签名与 `ProbeResult` 结构；新增验证类型（traceroute、DNS 查询、外部访问）返回同样的 `ProbeResult`，靠 `kind` 区分
5. **decision 每设备一条、每条至多一根连线**。交换机、AP、光猫在 CP2 都是一次到访一条 decision（action `forward`，`basis` 里加 `mac` 学习结果）；`seq` 连续、`linkId` 对应 `portOut`。CP3 的动画、包头查看、逐跳解释只读 decision，不需要引擎再吐别的东西
6. **PacketSummary.vlan** 恒在，CP1 为 `null`，CP2 写 VLAN id；NAT 前后靠 `packetIn` / `packetOut` 对照，不另加字段
7. **reasonCode + 文案模板**（2.3）：新失败原因追加到同一张表；`fixAt` 语义不变
8. **lint 编号** L001–L013 已占，CP2 从 L014 起；`LintIssue` 结构不改
9. **路由器 `lan1`–`lan4` 是一个网桥**，网桥 MAC 取 `lan1`。CP2 的 VLAN 会把这个网桥按 VLAN 拆分，但仍通过 `segmentOf` 表达
10. **地址约定**：互联网接入网段 `203.0.113.0/24`；`isPrivate` 的「运营商内网」标记（`100.64/10`）留给 CP2 光猫和 CP7 公网判断
11. **界面**：三块布局与右侧面板按选中切换的规则；每种新设备补一个节点组件和一个表单组件，结果面板不为设备类型改动

为它们**预留的扩展点**：`Port.vlan`；`Target.region` / `reachable`（CP4 分区与可达性）；`wan.mode` 联合类型（CP2 `pppoe` / `static`）；`internet.config.access` 可编辑后即可模拟运营商内网地址（CP2 光猫）；`Decision.phase` 可追加新阶段值（CP3 的 traceroute 沿用 `icmp`，不新增）；`Decision.basis` 是开放对象，CP2 加 `mac`、`vlan`，CP5 加 `tunnel`。

## 待定问题

1. **掩码存储形式**：点分十进制字符串（用户熟悉）还是前缀长度数字（引擎方便）。建议存点分字符串，引擎内部转前缀；表单只接受点分
2. **互联网接入网段用 `203.0.113.0/24`**（文档专用地址，不会与真实网站撞车）还是更像真公网的地址。建议保留，CP2 引入 `100.64.x.x` 时对比清楚
3. **示例目标的 IP** 会随时间变化（`110.242.68.66`、`142.250.72.14` 只是示意）。建议目标表里加一列「示意」说明，CP4 做目标库时再定要不要贴近现实
4. **DNS 是否支持多个服务器**：CP1 单个字符串。建议 CP4 需要时改为数组并升 `version`
5. **每次验证从空 ARP / NAT 表开始**：确定性好，但 CP3 动画每次都会看到 ARP 查询。建议 CP1 按此实现，CP3 决定是否把 ARP 请求 / 应答展开成独立往返
6. **ping 起点是否允许路由器**（✅ 已定 2026-09-04：允许，目标只接受 IP）：本文允许（便于排查 WAN），目标只接受 IP，域名一律走「访问网站」。请确认
7. **删除不确认、没有撤销**：CP1 直接删。是否需要在 CP2 画布批量操作时一并做撤销
8. **只保存一份拓扑**（键 `current`）。多份管理、场景模板属第二期
9. **路由器作为 DNS 转发器时向上游发查询**用它自己的 WAN 地址、不走 NAT 会话表。与现实一致，但决策记录里路由器会出现 `originate`，CP3 动画要接受「包在中间设备重新出发」
10. **L007–L013 超出 ROADMAP 列的六条**（✅ 已定 2026-09-04：全部保留）：L007、L008、L011 是六条的前置（地址不合法、地址池本身不对，六条就没法比）；L009、L010、L012、L013 不报的话，用户只能靠验证失败才知道原因。建议全部保留，L009 / L012 / L013 为 warning；若要严格按总纲，删掉后四条不影响其他规则

## 关联文档

- 上一个检查点：[CP0-project-skeleton.md](CP0-project-skeleton.md)
- 下一个检查点：[CP2-switching-and-devices.md](CP2-switching-and-devices.md)
- 测试表：[../TEST-PLAN.md](../TEST-PLAN.md)
