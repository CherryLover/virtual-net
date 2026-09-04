# CP2 交换机与多设备

> 总纲对应章节：[ROADMAP.md](../../ROADMAP.md) 的「CP2 交换机与多设备」
> 前置：CP1 局域网基础（拓扑 JSON、引擎五个入口、决策记录、L001–L013、三栏界面与保存）
> 状态：进行中（2026-09-04 开工，引擎与网页两个 agent 并行）

## 目标

做完这个检查点，用户能搭出一张真实的家庭或小办公室网络：互联网 → 光猫（桥接或路由）→ 路由器（拨号或自动获取）→ 交换机 → 多台电脑和一个无线 AP。交换机上能划 VLAN，路由器能给每个 VLAN 一个网段和一个 DHCP 池，用一根 trunk 线做单臂路由。同 VLAN 直接通，跨 VLAN 要经过路由器；配错了（trunk 漏放行、两端 VLAN 不一致、光猫桥接但路由器没拨号、双层 NAT）静态检查和验证结果都能指出来。设备多了以后可以框选、对齐、批量移动，删错了能撤销。

CP1 定下的数据模型、引擎流程、决策记录、lint 结构在本检查点只**扩展**：新增设备类型、填上 `Port.vlan` 预留位、在 `segmentOf` 里加 VLAN 过滤、往 reasonCode 表和 lint 表追加条目。CP1 全部测试不改一行继续通过。

## 范围

### 做
- 三种新设备：交换机 `switch`、无线 AP `ap`、光猫 `modem`
- VLAN：`Port.vlan` 定义 access / trunk；`segmentOf` 按 VLAN 划分网段；帧的打标签、去标签、放行判断
- 交换机 MAC 学习与泛洪；AP、桥接光猫、路由器 LAN 网桥作为透明二层设备各记一条决策
- 光猫桥接 / 路由两种模式；PPPoE 拨号在光猫或路由器；互联网接入方式（自动获取 / 拨号）与接入网段可编辑，能模拟运营商内网 `100.64/10`
- 路由器 WAN 三种模式（自动获取 / 拨号 / 手动）；LAN 侧 VLAN 子接口，每个 VLAN 一个网段一个 DHCP 池
- 新 lint L014–L024
- 界面：三种新节点与表单；路由器、互联网表单扩展；框选、对齐、批量移动、撤销 / 重做
- 引擎场景测试 `scenarios/cp2.test.ts`

### 不做
- 生成树协议：成环只报错不收敛
- 交换机三层功能、端口聚合；AP 的多 SSID、SSID 绑 VLAN、无线加密、信号强弱
- 光猫的 IPTV 口、多个 LAN 口、光功率
- PPPoE 账号密码校验（只作配置项）；IPv6
- 端口转发、公网判断的验证动作（CP7，本检查点只留 lint 提示）
- 逐跳动画、包头查看（CP3）；分区、防火墙（CP4）
- 多份拓扑管理、场景模板

## 关键设计

路径约定同 CP1：引擎 `packages/engine/src/{model,engine,lint,serialization}/`，网页 `apps/web/src/{canvas,panels,toolbar,store,storage}/`。

### 1 数据模型扩展

只扩 `Device.type` 联合类型和各类型的 `config`；`Device` 通用字段、`Port`、`Link` 不改。所有新增字段**可选且有回退值**，`parseTopology` 不补默认值（保证 CP1「解析后再序列化与原文件深比较相等」的测试仍通过），引擎读取时用回退；只有新建的设备由 `createDevice` 写全字段。

**`Device.type`**：`'pc' | 'router' | 'internet' | 'switch' | 'ap' | 'modem'`

**端口 `Port.vlan`**（填 CP1 预留位）

```json
{ "mode": "access", "pvid": 1 }
{ "mode": "trunk", "allowed": [10, 20], "native": 1 }
```

| 规则 | 说明 |
| --- | --- |
| 允许出现在 | `switch` 的 `portN`、`router` 的 `lan1`–`lan4`。其他设备的端口不允许有此字段，parse 报「{端口} 不支持 VLAN 设置」 |
| 缺省 | 字段不存在 = `{ mode: 'access', pvid: 1 }` |
| VLAN id | 1–4094 整数；`allowed` 去重升序；`native` 不必在 `allowed` 里，native 总是放行 |
| 无 VLAN 口 | pc `eth0`、router `wan`、internet `portN`、ap 全部口、modem 全部口。引擎称为「plain 口」：三层设备的 plain 口只收发不带标签的帧；透明设备的 plain 口原样透传 |

**交换机 `config`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `portCount` | number | 默认 8，范围 4–48。`ports.length` 必须等于它，parse 校验。改大时追加 `portN`（MAC 顺延），改小时删末尾未连线的口，末尾有连线则拒绝 |

端口 `port1`…`portN`，默认全部 `access` VLAN 1。交换机本身无地址、无路由表，`ping` 起点不能选它。

**无线 AP `config`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ssid` | string | 默认 `Home-WiFi`，只是标签，不参与模拟 |

端口 `uplink` + `wlan1`…`wlanN`：无线客户端就是连到 `wlanN` 的电脑；同互联网一样始终多留一个空闲 `wlanN`。AP 所有口是同一个透明网桥，不看不改 VLAN 标签。

**光猫 `config`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `'bridge' \| 'route'` | 默认 `bridge` |
| `wan.mode` | `'auto' \| 'dhcp' \| 'pppoe'` | 仅路由模式生效。默认 `auto` = 按上游要求（运营商预配置好的光猫） |
| `wan.pppoe` | `{ username, password }` | `pppoe` 时展示，模拟不校验 |
| `lan.ip` `lan.mask` | string | 仅路由模式。默认 `192.168.100.1` / `255.255.255.0` |
| `dhcp` | 同路由器 `dhcp` | 仅路由模式。默认开，`192.168.100.100`–`.199` |

端口 `wan`（上行，连互联网 `portN`）+ `lan1`（连路由器 `wan`）。**桥接**：`wan` ↔ `lan1` 透明网桥，上游直接透给路由器 WAN，由路由器拨号或自动获取；`wan`、`lan`、`dhcp` 三组配置不生效，表单隐藏。**路由**：光猫自己是一台「只有一个 LAN 口、NAT 固定开、没有 VLAN 的路由器」，WAN 按 `wan.mode` 向上游取地址，LAN 侧 DHCP 给路由器 WAN 发私网地址，形成双层 NAT。

拨号放在哪：桥接 → 路由器；路由 → 光猫。由 `mode` 一个字段决定，不会同时拨。

**路由器 `config` 扩展**（CP1 字段全部保留、含义不变）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `wan.mode` | `'dhcp' \| 'pppoe' \| 'static'` | 新增两个取值 |
| `wan.pppoe` | `{ username, password }` | `pppoe` 时展示。`username` 表单必填，引擎不校验 |
| `wan.static` | `{ ip, mask, gateway, dns }` | `static` 时展示，四项必填 |
| `vlans` | `RouterVlan[]`，可选 | 额外的 VLAN 子接口：`{ id, ip, mask, dhcp: { enabled, rangeStart, rangeEnd, leaseHours } }`。`id` 在 2–4094 且不重复 |

LAN 侧选的是 **VLAN 子接口 + 每个 LAN 口可设 access / trunk**，而不是在「多 LAN 口各自网段」和「单臂路由」里二选一。理由：`lan1`–`lan4` 在 CP1 已定为一个网桥（约定 9），把网桥按 VLAN 拆分并挂子接口（OpenWrt 的 `br-lan.10` 正是这样），一套模型同时表达两种接法：把 `lan2` 设为 access VLAN 20 就是「多 LAN 口各自网段」；把 `lan1` 设为 trunk 放行 10、20 就是「单臂路由」。CP1 的 `lan` + `dhcp` 就是 VLAN 1 的子接口（接口名仍叫 `br-lan`），`vlans[]` 里每一项是 `br-lan.<id>`；所有子接口共用 `lan1` 的 MAC。

**互联网 `config` 扩展**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `access.mode` | `'dhcp' \| 'pppoe'`，可选 | 缺省 `dhcp`。`pppoe` = 上游要求拨号，任何拨号都接受 |
| `access.ip` `mask` `poolStart` `poolEnd` `dns` | string | 由只读改为可编辑。表单提供两组预设：公网 `203.0.113.1/24`（CP1 默认）、运营商内网 `100.64.0.1/255.192.0.0`，池 `100.64.0.2`–`100.64.0.254` |

`targets[]` 仍只读，留给 CP4。

### 2 引擎扩展

五个入口签名不变。下面按 CP1 2.1 / 2.2 的编号说明改在哪。

#### 2.1 segmentOf 加 VLAN 过滤

网段的定义从「沿连线穿过透明设备能到达的三层接口集合」变为「**在同一 VLAN 内**能到达的三层接口集合」。`segmentOf(start, opts?)`：`start = { portId, vlan: number | null }`（三层接口的挂接点：pc 是 `eth0` + `null`，`br-lan.10` 是它的每个 `lanN` + `10`），`opts.ignoreVlan = true` 时退化为 CP1 行为，只用于解释失败原因。

走图时带两个状态：**当前 VLAN**、**帧上有没有标签**。每过一个口按下表处理；「不发 / 丢弃」就是这条路走不通，记下第一处丢弃点 `{ deviceId, portId, cause }`。

| | access（PVID = P） | trunk（放行 A，native N） | plain 口 |
| --- | --- | --- | --- |
| **出口**，帧属 VLAN V | V = P → 去标签发出；否则不发（`access-pvid`） | V = N → 去标签；V ∈ A → 打标签 V；否则不发（`trunk-not-allowed`） | 三层设备：不带标签发出。透明设备：原样发出 |
| **入口**，无标签 | 归入 P | 归入 N | 三层设备：接收。透明设备：原样继续 |
| **入口**，带标签 V | 丢弃（`tagged-drop`） | V ∈ A 或 V = N → 归入 V；否则丢弃（`trunk-not-allowed`） | 三层设备：丢弃（`tagged-drop`）。透明设备：原样继续 |

由此得到的行为，也是失败原因怎么解释的依据：
- **access 对 access 但 PVID 不同**：帧不带标签过去，被对端按自己的 PVID 归类。两边 VLAN 实际被这根线接通了，验证会通，lint L014 报 warning
- **trunk 漏放行**：帧在发送端出口不发，或在接收端入口丢弃。丢弃点是哪个口就定位到哪个口
- **带标签帧到了不识别标签的口**（trunk 对电脑、trunk 对默认的 access 口、trunk 对路由器 `wan`）：只有 native VLAN 能过去，其他 VLAN 的帧丢弃
- **透明设备（AP、桥接光猫）** 不看不改标签，两边怎么配它就怎么传

同一透明设备在同一 VLAN 内被第二次从不同连线到达 → 记 `loop = { deviceId, linkIds }`，走图停止。

`segmentOf` 顺带产出每个到达接口的**二层路径**（经过的 `{ deviceId, portIn, portOut, vlan, tagged }` 序列），后面送帧、选 `portOut`、写 `PacketSummary.vlan` 都用它，不另算。

**路由器 LAN 网桥**按 VLAN 拆分：`lanN` 各有 `Port.vlan`，网桥内按 VLAN 泛洪；子接口 `br-lan.<id>` 挂在对应 VLAN 上。`lanN` 是 access VLAN 20 但 `vlans[]` 里没有 20 → 该口只做二层，包到不了三层。

#### 2.2 buildRuntime 的变化

1. **网段发现**：改用上面的 VLAN 版 `segmentOf`。三层接口新增：router 的 `br-lan.<id>`（每个 `vlans[]` 项）、route 模式 modem 的 `br-lan`（`lan1`，地址 `lan.ip`）与 `wan`。bridge 模式 modem、ap、switch 没有三层接口
2. **WAN 地址获取**（原「WAN 自动获取」，现在覆盖 router `wan` 与 route 模式 modem `wan`）：从 `wan` 口 `segmentOf` 找**上游**——网段里的 internet `portN`，或 route 模式 modem 的 `br-lan`。按 `devices` 顺序处理，结果进 `runtime.wanLeases[]`：`{ deviceId, status, via, ip, mask, gateway, dns, serverDeviceId, addressClass }`

   | 本机 `wan.mode` | 上游 | 结果 |
   | --- | --- | --- |
   | `dhcp` | internet `access.mode = dhcp` | 从池取地址，`via: 'dhcp'`，同 CP1 |
   | `dhcp` | internet `access.mode = pppoe` | `status: 'pppoe-required'` |
   | `pppoe` | internet `access.mode = pppoe` | 从池取地址，`via: 'pppoe'`。掩码、网关（`access.ip`）、DNS 与 dhcp 一样，不建 PPP 会话与 /32 |
   | `pppoe` | internet `access.mode = dhcp`，或 route 模式 modem | `status: 'pppoe-rejected'` |
   | `dhcp` | route 模式 modem | 从光猫 `dhcp` 池取地址，网关与 DNS = 光猫 `lan.ip` |
   | `static` | 任意 | 直接用 `wan.static`，`via: 'static'`，不看上游 |
   | `auto`（仅 modem） | 任意 | 按上游要求取 dhcp / pppoe，其余同上 |
   | 任意 | `wan` 无连线 / 网段里没有上游 | `no-link` / `no-server` |

   池用完 → `pool-exhausted`。桥接光猫是透明设备，路由器 `wan` 穿过它直接看到 internet。`addressClass` 由 `isPrivate` 得出：`'public' | 'private' | 'cgnat'`
3. **LAN 自动获取**（多 DHCP 池）：每台 `dhcp` 电脑取 `eth0` 所在网段（已按 VLAN 隔开）内启用的 DHCP 服务：router 的 `br-lan`（`dhcp`）、`br-lan.<id>`（`vlans[].dhcp`）、route 模式 modem 的 `br-lan`。多个 → 取 `devices` 顺序先出现的，记进 `runtime.dhcpConflicts[]` 供 L019 读。租约的网关、DNS = 该子接口地址。无线客户端穿过 AP，与有线一致。失败原因文案里带 VLAN：`VLAN 20 内没有 DHCP 服务器`
4. **接口表**：子接口 `{ deviceId, name: 'br-lan.10', portIds: 放行 10 的 lanN, mac: lan1 的 MAC, ip, mask, vlan: 10 }`；其余接口 `vlan: null`
5. **路由表**：router 每个子接口一条直连；route 模式 modem 同 router（LAN 直连 + WAN 直连 + 默认）；WAN 地址落在任一 LAN 子网内 → 路由表标 `wanLanOverlap`
6. **MAC 表**（每台 switch、ap、桥接 modem、router 网桥一张，按 VLAN 分表，初始为空）：`(vlan, mac) → portId`。与 ARP 表同寿命：一次 probe 内累计，跨 probe 清空

#### 2.3 一个包的处理顺序变化

**A 起点发出 / C 路由器转发 的 ARP 步**：网段内没找到目标 IP 时，再用 `ignoreVlan` 走一次。找到了 → 按二层路径上第一处丢弃点的 `cause` 定原因：`access-pvid` → `VLAN_ISOLATED`；`trunk-not-allowed` → `TRUNK_NOT_ALLOWED`；`tagged-drop` → `VLAN_TAG_DROPPED`。`fixAt` 指向丢弃点端口。没找到 → 仍是 `ARP_MISS`。丢弃点写进这条 decision 的 `basis.vlan.dropAt`

**C 路由器转发 第 2 步**：无路由时先看 `wanLeases` 状态：`pppoe-required` → `PPPOE_REQUIRED`，`pppoe-rejected` → `PPPOE_REJECTED`，其余仍 `NO_ROUTE`。路由表有 `wanLanOverlap` 且下一跳走 WAN → `WAN_LAN_OVERLAP`

**新增 E 透明设备到访**（switch、ap、bridge 模式 modem、router 只做二层转发时）：一次到访一条 decision，`action: 'forward'`，不改包内容，只可能改标签：
1. 按二层路径确定 `portIn` → `portOut`；所在 VLAN 有 `loop` → 停 `L2_LOOP`（停在路径上第一台透明设备）
2. 学习：`(vlan, srcMac) → portIn` 写 MAC 表
3. 查表：`dstMac` 命中 → `lookup: 'hit'`；未命中 → `lookup: 'flood'`，`floodPorts` = 同 VLAN 内除 `portIn` 外所有有连线的口。**decision 的 `portOut` 永远是路径上通往目标的那个口**（每条至多一根连线），泛洪的其他口只列在 `floodPorts` 里
4. `packetIn.vlan` / `packetOut.vlan` 按进出口的标签情况写；`basis.vlan = { id, in, out }`
5. `note`：`学习 02:…:01 在 port2，查表未命中，泛洪到 port1 port3 port4，从 port4 发出（VLAN 10 带标签）`；路由器只做二层转发时 `note` 写「二层转发，未路由」，`basis.route = null`

route 模式 modem 的转发、NAT、DHCP、DNS 转发全部复用 router 的 C / D 逻辑；它在路径上是一跳三层设备，`basis.nat` 照常记录，双层 NAT 就是路径上出现两次 `direction: 'out'`。

**PacketSummary.vlan 何时非空**：只表示线上这一帧有没有 802.1Q 标签——从 trunk 口以非 native VLAN 发出时 `packetOut.vlan` = id，对端 `packetIn.vlan` 同值；其他情况都是 `null`。电脑发的包、access 口出的包、透明设备原样透传的无标签帧都是 `null`。

#### 2.4 新增 reasonCode（追加到 CP1 2.3 表）

| reasonCode | 出现在 | 文案模板 | fixAt |
| --- | --- | --- | --- |
| `VLAN_ISOLATED` | 起点 / router | `{IP}（{设备}）在 VLAN {V2}，本机发出的包在 VLAN {V1}，二层隔离，需要路由器转发` | 目标侧 access 口 |
| `TRUNK_NOT_ALLOWED` | 起点 / router | `{设备} 的 {端口} 是 trunk 但未放行 VLAN {V}，帧被丢弃` | 该 trunk 口 |
| `VLAN_TAG_DROPPED` | 起点 / router | `帧带 VLAN {V} 标签到达 {设备} 的 {端口}，该口不识别标签，丢弃` | 该口 |
| `L2_LOOP` | 透明设备 | `{设备A} 与 {设备B} 之间有两条二层路径（{连线}），没有生成树协议，广播风暴` | — |
| `PPPOE_REQUIRED` | router / modem | `上游要求拨号，{设备} 的 WAN 是自动获取，没有拿到地址` | WAN 模式 |
| `PPPOE_REJECTED` | router / modem | `{设备} 在拨号，但上游（{互联网 / 光猫（路由模式）}）不接受拨号` | WAN 模式 |
| `WAN_LAN_OVERLAP` | router | `WAN 地址 {IP} 落在 LAN 网段 {网段} 内，路由器不知道往哪边发` | LAN IP |

既有 reasonCode 不改码不改模板；`NO_IP`、`ARP_MISS` 的填充值在 VLAN ≠ 1 时带上 VLAN 号。`fixAt` 指向端口时形如 `{ deviceId, portId }`（见待定问题 2）。

### 3 决策记录扩展

`Decision` 字段不增删。`basis` 追加两个可选对象：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `basis.mac` | `{ learned: { mac, portId }, lookup: 'hit' \| 'flood', floodPorts?: string[] } \| null` | 透明设备到访必填 |
| `basis.vlan` | `{ id: number \| null, in?: 'access' \| 'trunk' \| 'plain', out?: 同左, dropAt?: { deviceId, portId, cause } } \| null` | 有 VLAN 口的设备到访时写 `id / in / out`；VLAN 相关终止时写 `dropAt` |

### 4 静态检查新规则

`LintIssue` 结构不改。L001–L013 对新对象同样生效：L007 / L008 对每个 VLAN 池和路由模式光猫的池逐一检查；L001 / L004 / L005 在 VLAN 版网段上比较；L009 补一条「交换机 / AP 没有任何连线」的 warning 触发条件；L010 文案带 VLAN。

| 编号 | 检查什么 | 触发条件 | 级别 | 定位 | 文案要点 |
| --- | --- | --- | --- | --- | --- |
| L014 | VLAN 两端不一致 | 一根线两端都有 VLAN 配置：access–access PVID 不同；trunk–access 且 native ≠ PVID；trunk–trunk native 不同 | warning | 两端端口 + 连线 | `{设备A} {端口} VLAN {P1} 与 {设备B} {端口} VLAN {P2} 不一致，两个 VLAN 被这根线接通` |
| L015 | trunk 漏放行 | 某 VLAN 在连线两侧都有成员（access 口、子接口、透明设备后面的设备），但任一端 trunk 未放行 | error | 未放行的 trunk 口 + 连线 | `VLAN {V} 两侧都有设备，但 {设备} {端口} 未放行` |
| L016 | trunk 对端不识别标签 | trunk 口对端是 plain 口（电脑、路由器 `wan`、互联网、光猫、AP） | warning | trunk 口 | `{端口} 是 trunk，对端 {设备} 不识别 VLAN 标签，只能收到 VLAN {N}` |
| L017 | 二层成环 | 任一 VLAN 的 `segmentOf` 记到 `loop` | error | 环上设备 + 连线 | `{设备A} 与 {设备B} 之间有两条二层路径，没有生成树协议` |
| L018 | 双层 NAT | router `nat = true` 且 WAN 租约 `serverDeviceId` 是路由模式 modem 或另一台 router | warning | router，字段 nat | `{路由器} 与 {光猫} 都在做 NAT（双层 NAT），从外面进来要在两台设备上都做端口转发` |
| L019 | 同一网段两个 DHCP | `runtime.dhcpConflicts` 非空 | warning | 每个服务所在设备，字段 dhcp | `{网段} 内 {设备A} 和 {设备B} 都开着 DHCP，实际由 {设备A} 分配` |
| L020 | 运营商内网地址 | 任一 WAN 租约 `addressClass = 'cgnat'` | warning | 该设备，字段 wan | `WAN 地址 {IP} 是运营商内网地址，不是公网 IP，从外面无法直接访问` |
| L021 | 接入方式不匹配 | WAN 租约 `pppoe-required` 或 `pppoe-rejected` | error | 设备，字段 wan.mode | `上游要求拨号，{设备} WAN 是自动获取` / `{设备} 在拨号，但 {上游} 不接受拨号` |
| L022 | WAN 与 LAN 网段重叠 | router / 路由模式 modem 的 WAN 地址落在自己任一 LAN 子网 | error | 设备，字段 lan.ip | `WAN 地址 {IP} 与 LAN 网段 {网段} 重叠` |
| L023 | VLAN 子接口网段重叠 | 同一 router 的 `br-lan` 与各 `br-lan.<id>` 两两网段重叠 | error | router，对应 VLAN 行 | `VLAN {a} 网段 {网段} 与 VLAN {b} 网段 {网段} 重叠` |
| L024 | WAN 静态网关不在网段 | `wan.mode = static` 且 `gateway` 不在 `ip/mask` 内 | error | router，字段 wan.static.gateway | `WAN 网关 {网关} 不在 {网段} 内` |

后续检查点从 L025 起。

### 5 界面

布局、右侧面板切换规则、结果面板均不变（CP1 约定 11）。

**左侧设备栏**：六张卡片，顺序 电脑、交换机、无线 AP、路由器、光猫、互联网。

**节点**

| 设备 | 外观 | 端口柄 |
| --- | --- | --- |
| 交换机 | 横向长条，宽度 = max(200px, 口数 × 28px)；第二行 `8 口 · VLAN 1,10,20` | 全部底边等距 `port1`…`portN`；口数 > 16 时前一半顶边、后一半底边。非 VLAN 1 的 access 口柄下方小字 PVID，trunk 口小字 `T` |
| 无线 AP | 方形，第二行 SSID | `uplink` 顶边；`wlan1`…`wlanN` 底边，始终留一个空闲 |
| 光猫 | 方形，第二行 `桥接` 或 `路由 192.168.100.1` | `wan` 顶边，`lan1` 底边 |
| 路由器（改） | 第二行 `LAN 192.168.1.1`，有 `vlans` 时追加 ` +2 VLAN` | `lan1`–`lan4` 柄加 PVID / `T` 小字，同交换机 |
| 互联网（改） | 第二行 `203.0.113.1/24`，`pppoe` 时追加 `· 拨号`，地址在 `100.64/10` 时追加 `· 内网` | 不变 |

**表单**（右侧面板，字段失焦校验规则同 CP1）

| 设备 | 内容 |
| --- | --- |
| 交换机 | 名称；口数（数字，4–48，改小时末尾有连线报 `{端口} 有连线`）；端口表：每行 端口名 · 对端（`电脑1 eth0` / 空）· 模式（access / trunk 下拉）· access 显示 PVID 输入框，trunk 显示放行列表输入框（`10,20`）和 native 输入框。行首复选框多选，表头出现「批量设置」：选模式与 VLAN 后应用到所选行 |
| 无线 AP | 名称；SSID |
| 光猫 | 名称；模式（桥接 / 路由 两段开关）。路由时展开：WAN 接入（跟随上游 / 自动获取 / 拨号，拨号时账号、密码）、只读 WAN 状态（`已获取 203.0.113.2` / `拨号成功 203.0.113.2` / 失败原因）、LAN IP、掩码、DHCP 开关与起止 |
| 路由器（改） | WAN 模式下拉（自动获取 / 拨号 / 手动）；拨号展开账号（必填）、密码；手动展开 IP、掩码、网关、DNS；只读 WAN 状态同光猫。LAN 段改为 VLAN 表：第一行固定 VLAN 1（就是 CP1 的 LAN IP、掩码、DHCP 字段），其后每行 VLAN id、IP、掩码、DHCP 开关、起止、删除；「添加 VLAN」新增一行，`id` 取最小未用值、网段 `192.168.{id}.1/24`、池 `.100`–`.199`。下方「LAN 口」表：`lan1`–`lan4` 的模式 / VLAN，与交换机端口表同一组件 `PortVlanTable`。NAT 开关不变 |
| 互联网（改） | 接入段可编辑：方式（自动获取 / 拨号）、IP、掩码、池起止、DNS；两个按钮「公网」「运营商内网」一键填预设。目标表仍只读 |

lint 或验证结果定位到端口时（`portId`），对应设备选中并让端口表的那一行高亮。

**画布批量能力**
- 框选：按住 `Shift` 在空白处拖出矩形；`Ctrl/Cmd + A` 全选。单独拖动空白处仍是平移（CP1 行为不变）
- 批量移动：拖任一已选节点，所有已选一起动；`Delete` 删掉所有已选节点及其连线
- 对齐：选中 ≥ 2 个节点时右侧面板显示「已选 {n} 项」和六个按钮：左、右、顶、底、横向等距、纵向等距。以所选节点的外接框为基准
- 吸附：拖动时按 16px 网格吸附
- **撤销 / 重做**（回答 CP1 待定问题 7）：**做**。工具栏加「撤销」「重做」，快捷键 `Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`。理由：批量删除和批量移动让一次误操作的代价变大，而拓扑是一个可序列化的 JSON 对象，整份快照进栈的成本很低；比给删除加确认框更顺手，也不违背 CP1「删除不确认」。记录粒度：每个改动拓扑的 store action 一步（一次拖动结束、一次字段提交、一次连线、一次删除、一次批量对齐、导入、新建）；视口、选中状态、名称输入过程不记。栈深 50，自动保存只存当前态

### 6 拓扑 version

**保持 `1`，不升**。理由：新增字段全部可选且有回退（`Port.vlan` 缺省 access 1、`wan.mode` 旧值 `dhcp` 仍合法、`vlans` / `access.mode` 缺省），新设备类型在旧文件里不存在，CP1 导出的任何文件不经迁移直接可读且行为不变。`parseTopology` 只加校验（新类型的端口名与口数、`vlan` 字段出现位置、VLAN id 范围），不改写内容。什么时候必须升：删改 CP1 已有字段、改字段缺省含义——本检查点没有。

## 步骤

### CP2-S1 模型扩展：类型、默认值、解析
- **做什么**：落实第 1 节：三种新设备类型、`Port.vlan`、路由器与互联网的字段扩展、`createDevice` 与 `parseTopology` 的对应支持
- **怎么做**：`model/topology.ts` 扩联合类型与 config 类型；`model/vlan.ts` 放 `PortVlan` 类型、`vlanOf(port)` 回退、放行列表解析；`model/defaults.ts` 新增三种设备的默认名（「交换机1」「AP1」「光猫1」）、端口生成（8 口 / `uplink`+`wlan1` / `wan`+`lan1`）、默认 config，`ensureSparePort` 从 internet 抽出来给 ap 复用；`serialization/parse.ts` 加校验：`portCount` 与 `ports.length` 一致、`vlan` 只在允许的端口出现、VLAN id 范围、`vlans[].id` 唯一、`wan.mode` 取值。fixture 新增 `packages/engine/fixtures/home-office.json`（阶段完成标准场景 1 的图）
- **产出物**：`model/`、`serialization/` 的扩展与测试；新 fixture
- **验收标准**：
  - 【引擎测试】空拓扑连续创建 交换机、AP、光猫 → 名称「交换机1」「AP1」「光猫1」；端口分别为 `port1`–`port8`（每个 `vlan = access 1`）、`uplink wlan1`、`wan lan1`；MAC 接着已有最大值顺延
  - 【引擎测试】CP1 的 `minimal.json` 解析成功且序列化后深等于原文件（CP1-S1 测试不改一行通过）
  - 【引擎测试】`home-office.json` 解析成功并往返相等；把交换机 `portCount` 改成 7 → 失败，错误含「端口数」；给某电脑 `eth0` 加 `vlan` → 失败，错误含「不支持 VLAN」；`vlans` 里两项 `id: 10` → 失败
  - 【引擎测试】`vlanOf(无 vlan 字段的 lan1)` → `{ mode: 'access', pvid: 1 }`；解析放行列表 `"10, 20,20"` → `[10, 20]`；`"0"` / `"4095"` → 非法
- **测试用例**：[T-CP2-001](../TEST-PLAN.md) – [T-CP2-004](../TEST-PLAN.md)

### CP2-S2 segmentOf 加 VLAN 过滤与二层路径
- **做什么**：实现 2.1 节走图规则、丢弃点记录、环路记录、二层路径产出；路由器网桥按 VLAN 拆分
- **怎么做**：改 `engine/runtime/segment.ts`：状态机 `(vlan, tagged)`，端口出入口三类处理，`ignoreVlan` 选项，返回 `{ interfaces, paths, dropAt, loop }`；`interfaces.ts` 生成 `br-lan.<id>` 子接口；switch / ap / modem 此时已能作为透明设备被走图穿过（不含 MAC 学习）
- **产出物**：VLAN 版 `segmentOf`；CP1 全部测试仍通过
- **验收标准**：
  - 【引擎测试】交换机 `port1` access 10 接电脑A、`port2` access 10 接电脑B、`port3` access 20 接电脑C → A 的网段含 B 不含 C；`ignoreVlan` 时含 C，且 `dropAt = { 交换机, port3, 'access-pvid' }`
  - 【引擎测试】两台交换机 `port8`–`port8` 相连，两端都 trunk 放行 `[10]` native 1；A 在交换机1 access 20 → A 的网段不含交换机2 上任何设备，`dropAt.cause = 'trunk-not-allowed'`，`portId` = 交换机1 `port8`；只把交换机2 侧改成放行 `[10,20]` → 丢弃点仍在交换机1；两边都放行 20 → 网段含交换机2 上 access 20 的设备，路径里交换机1→2 那段 `tagged = true, vlan = 20`
  - 【引擎测试】交换机 `port8` trunk（native 1，放行 10）直连电脑D → D 只出现在 VLAN 1 的网段里；VLAN 10 的走图到 D 时 `dropAt.cause = 'tagged-drop'`
  - 【引擎测试】路由器 `lan1` trunk 放行 `[10,20]`，`vlans` 有 10、20 → 接口表出现 `br-lan`、`br-lan.10`、`br-lan.20`，三者 MAC 相同、`portIds` 都含 `lan1`；`lan2` access 20 → `br-lan.20.portIds` 含 `lan2`
  - 【引擎测试】交换机1 `port7`、`port8` 分别连交换机2 `port7`、`port8`（都 access 1）→ `loop` 非空，含两根连线
  - 【命令】`pnpm test` 中 CP1 所有测试通过，无改动
- **测试用例**：[T-CP2-005](../TEST-PLAN.md) – [T-CP2-010](../TEST-PLAN.md)

### CP2-S3 交换机：MAC 学习、泛洪、环路
- **做什么**：实现 2.3 节 E：透明设备到访 decision、MAC 表、`L2_LOOP`；VLAN 相关的 ARP 失败原因
- **怎么做**：`engine/sim/l2.ts`：`deliverFrame(frame, path)` 沿二层路径逐设备产出 decision，学习与查表，写 `basis.mac` / `basis.vlan`、`packetIn/Out.vlan`；`arp.ts` 加 `ignoreVlan` 二次查找与 `dropAt → reasonCode` 映射；`ping.ts` / `forward.ts` 在发帧处接入 `deliverFrame`；路由器只做二层转发时也走这里
- **产出物**：经过交换机的 ping 完整往返，每台交换机一条 decision
- **验收标准**：
  - 【引擎测试】电脑A、B 接交换机 `port1`、`port2`（默认 VLAN 1），A `192.168.1.10/24` ping B `192.168.1.11` → `ok`，五条 decisions：A `originate`、交换机 `forward`（`basis.mac = { learned: {A 的 MAC, port1}, lookup: 'flood', floodPorts: [port2] }`，`portOut = port2`）、B `answer`、交换机 `forward`（`learned: {B 的 MAC, port2}, lookup: 'hit'`）、A `receive`；`path` = [A, 交换机, B, 交换机, A]；所有 `packetIn/Out.vlan = null`
  - 【引擎测试】CP1 fixture 中路由器 `lan1` 改接交换机 `port1`，电脑1 接 `port2`，ping `8.8.8.8` → `ok`，七条 decisions，交换机两条；再加电脑2 接 `port3`，电脑1 ping 电脑2 → 通，路径不经过路由器
  - 【引擎测试】A（access 10）ping C（access 20），同网段地址 → `fail`，一条 decision，`VLAN_ISOLATED`，`fixAt = { 交换机, port3 }`，`basis.vlan.dropAt.cause = 'access-pvid'`，文案含「VLAN 20」「VLAN 10」「二层隔离」
  - 【引擎测试】S2 第二条的 trunk 漏放行拓扑，A ping 交换机2 上的 E（同 VLAN 20 同网段）→ `TRUNK_NOT_ALLOWED`，`fixAt` = 交换机1 `port8`，文案含「未放行 VLAN 20」
  - 【引擎测试】成环拓扑（S2 第五条）A ping B（跨两台交换机）→ `fail`，`stoppedAt` = 交换机1，`L2_LOOP`，文案含两根连线两端端口名
  - 【引擎测试】电脑1 接路由器 `lan1`、电脑2 接 `lan2`，互 ping → 通，路径 [电脑1, 路由器, 电脑2, 路由器, 电脑1]，路由器两条 decision 都是 `forward` 且 `basis.route = null`、`basis.mac` 非空、`note` 含「二层转发」
- **测试用例**：[T-CP2-011](../TEST-PLAN.md) – [T-CP2-016](../TEST-PLAN.md)

### CP2-S4 无线 AP
- **做什么**：AP 作为透明网桥接入，`uplink` 与 `wlanN` 同一 MAC 表，空闲口维护
- **怎么做**：`segment.ts` / `l2.ts` 把 `ap` 归入透明设备（与 switch 同一分支，全部 plain 口）；store 连线变化后对 ap 调用 `ensureSparePort`
- **产出物**：无线客户端与有线客户端行为一致
- **验收标准**：
  - 【引擎测试】交换机 `port4` 接 AP `uplink`，电脑3 接 AP `wlan1`，电脑1 接交换机 `port2`，电脑3 ping 电脑1 → `ok`，路径 [电脑3, AP, 交换机, 电脑1, 交换机, AP, 电脑3]，AP 两条 decision 的 `basis.mac.lookup` 分别 `flood` 与 `hit`
  - 【引擎测试】AP `uplink` 接交换机 access 10 口，`wlan1` 电脑与交换机 access 10 的电脑同网段 → 通；与 access 20 的电脑 → `VLAN_ISOLATED`
  - 【引擎测试】AP `uplink` 接交换机 trunk 口（native 1，放行 10）→ `wlan1` 电脑只在 VLAN 1 网段里，VLAN 10 对它 `tagged-drop`（AP 透传标签，电脑丢弃）
  - 【引擎测试】给 AP `wlan1` 连线后 → 自动出现 `wlan2`；断开后若 `wlan2` 空闲则收回，始终恰好一个空闲 `wlanN`
  - 【引擎测试】电脑3 自动获取、AP 上游是开 DHCP 的路由器 → 拿到租约，`serverDeviceId` = 路由器
- **测试用例**：[T-CP2-017](../TEST-PLAN.md) – [T-CP2-021](../TEST-PLAN.md)

### CP2-S5 光猫：桥接与路由模式、上游接入方式
- **做什么**：实现 2.2 节第 2 步的上游查找与接入方式匹配、`PPPOE_REQUIRED` / `PPPOE_REJECTED`；桥接光猫透明、路由光猫复用路由器逻辑；互联网 `access` 可编辑与 `pppoe` 方式
- **怎么做**：`engine/runtime/wan.ts`（原 WAN 自动获取抽出）：`findUpstream(wanPortId)` 走 `segmentOf`，按表决定 `wanLeases`；`interfaces.ts` / `routes.ts` / `forward.ts` / `nat.ts` / `dns.ts` 把「router」判断统一换成谓词 `isL3Router(device)`（router 或 route 模式 modem）；bridge 模式 modem 走 S3 的透明分支
- **产出物**：光猫两种模式都能上外网；接入方式不匹配能报出来
- **验收标准**：
  - 【引擎测试】互联网（`dhcp`）`port1` — 光猫（桥接）`wan`，光猫 `lan1` — 路由器 `wan`（`dhcp`），电脑接 `lan1`，ping `8.8.8.8` → `ok`，七条 decisions，光猫两条 `forward` 且 `basis.nat = null`、`basis.mac` 非空；路由器 WAN 租约 `203.0.113.2`，`serverDeviceId` = 互联网
  - 【引擎测试】同上互联网改 `access.mode = pppoe` → 路由器 `wanLeases.status = 'pppoe-required'`；ping `8.8.8.8` 停在路由器，`PPPOE_REQUIRED`，`fixAt = { 路由器, 'wan.mode' }`，文案含「要求拨号」「自动获取」
  - 【引擎测试】光猫改 `route`（`wan.mode = auto`），互联网 `pppoe` → 光猫 WAN 租约 `via: 'pppoe'` `203.0.113.2`；路由器 WAN 租约 `192.168.100.100`，`serverDeviceId` = 光猫；电脑 ping `8.8.8.8` → `ok`，路径 [电脑, 路由器, 光猫, 互联网, 光猫, 路由器, 电脑]，路由器与光猫去程 `basis.nat.direction = 'out'` 各一次，互联网收到的 `srcIp = 203.0.113.2`
  - 【引擎测试】光猫 `route` + 路由器 `wan.mode = pppoe` → 路由器 `pppoe-rejected`，ping 停在路由器 `PPPOE_REJECTED`，文案含「光猫（路由模式）」
  - 【引擎测试】互联网改运营商内网预设（`100.64.0.1/255.192.0.0`）、光猫桥接、路由器 `dhcp` → 路由器 WAN `100.64.0.2`，`addressClass = 'cgnat'`；ping `8.8.8.8` 仍 `ok`（源在接入网段内，互联网能回程）
  - 【引擎测试】`visitSite(电脑, www.google.com)` 在光猫路由模式下 → `ok`，DNS 阶段路径 电脑 → 路由器（`originate`，上游 `192.168.100.1`）→ 光猫（`originate`，上游 `8.8.8.8`）→ 互联网 → 光猫 → 路由器 → 电脑
- **测试用例**：[T-CP2-022](../TEST-PLAN.md) – [T-CP2-027](../TEST-PLAN.md)

### CP2-S6 路由器 WAN 模式与 VLAN 子接口
- **做什么**：路由器 `pppoe` / `static` 两种新 WAN 模式；`vlans[]` 子接口参与路由与 ARP；单臂路由与多 LAN 口两种接法都通
- **怎么做**：`wan.ts` 接入 router 的 `pppoe` / `static`；`routes.ts` 每个子接口一条直连、`wanLanOverlap` 标记；`forward.ts` 出接口是子接口时按二层路径选 `lanN` 与标签；`WAN_LAN_OVERLAP` 终止
- **产出物**：跨 VLAN 路由；三种 WAN 模式
- **验收标准**：
  - 【引擎测试】互联网 `pppoe`、光猫桥接、路由器 `wan.mode = pppoe`（账号任意）→ 路由器 WAN 租约 `via: 'pppoe'` `203.0.113.2`，网关 `203.0.113.1`；电脑 ping `8.8.8.8` → `ok`
  - 【引擎测试】路由器 `static` `{ 203.0.113.50/24, 网关 203.0.113.1, DNS 8.8.8.8 }` 直连互联网 → 无租约、接口地址即静态值，ping `8.8.8.8` 通；网关改 `203.0.113.99` → `ARP_MISS`，文案含「网关」
  - 【引擎测试】单臂路由：路由器 `lan1` trunk 放行 `[10,20]`，`vlans` = 10（`192.168.10.1/24`）、20（`192.168.20.1/24`）；交换机 `port1` trunk 放行 `[10,20]` 接 `lan1`，`port2` access 10 接 A（`192.168.10.10/24` 网关 `.1`），`port3` access 20 接 C（`192.168.20.10/24` 网关 `.1`）。A ping C → `ok`，九条 decisions，路径 [A, 交换机, 路由器, 交换机, C, 交换机, 路由器, 交换机, A]；交换机→路由器那条 `packetOut.vlan = 10`，路由器 `portIn = portOut = lan1`、`packetIn.vlan = 10`、`packetOut.vlan = 20`、`basis.route.iface = 'br-lan.20'`
  - 【引擎测试】同上把交换机 `port1` 放行改成 `[10]` → A ping C 停在路由器，`TRUNK_NOT_ALLOWED`，`fixAt` = 交换机 `port1`
  - 【引擎测试】多 LAN 口接法：`lan1` access 10、`lan2` access 20（无 trunk），A 接 `lan1`、C 接 `lan2` → A ping C 通，路径 [A, 路由器, C, 路由器, A]，路由器 `portIn = lan1, portOut = lan2`，两端 `vlan = null`
  - 【引擎测试】A（VLAN 10）ping `8.8.8.8` → 通，路由器出向 NAT `before 192.168.10.10`、`after` 为 WAN 地址
  - 【引擎测试】光猫路由模式 LAN 改 `192.168.1.1/24`（与路由器 LAN 同段）→ 路由器 WAN 租约 `192.168.1.100`，路由表 `wanLanOverlap = true`；电脑 ping `8.8.8.8` 停在路由器 `WAN_LAN_OVERLAP`
- **测试用例**：[T-CP2-028](../TEST-PLAN.md) – [T-CP2-034](../TEST-PLAN.md)

### CP2-S7 多 DHCP 池
- **做什么**：LAN 自动获取按网段（含 VLAN）找服务，`vlans[].dhcp` 与路由模式光猫的池参与分配
- **怎么做**：`dhcp.ts` 服务候选改为「网段内所有启用 DHCP 的子接口」，租约增加 `serverIface`；多服务取先出现者并写 `runtime.dhcpConflicts[]`
- **产出物**：每个 VLAN 一池
- **验收标准**：
  - 【引擎测试】S6 单臂路由拓扑，加 B 接 `port4` access 10，A、B、C 全改自动获取 → A `192.168.10.100`、B `192.168.10.101`（来自 `br-lan.10`），C `192.168.20.100`（来自 `br-lan.20`），网关、DNS 各为所在 VLAN 的子接口地址
  - 【引擎测试】VLAN 20 的 `dhcp.enabled = false` → C 租约 `no-server`，文案含「VLAN 20」；A、B 不受影响
  - 【引擎测试】路由模式光猫 + 路由器（LAN `192.168.1.1`）+ 电脑自动获取 → 电脑租约来自路由器而不是光猫（不同网段），路由器 WAN 租约来自光猫
  - 【引擎测试】路由器 DHCP 开，`lan2` 再接一台开 DHCP 的第二路由器 `lan1`（同 `192.168.1.0/24`，LAN IP `.2`）→ 电脑租约来自 `devices` 顺序先出现者，`runtime.dhcpConflicts` 含该网段与两台设备
  - 【引擎测试】VLAN 10 池 `.100`–`.100`，两台自动获取 → 第二台 `pool-exhausted`
- **测试用例**：[T-CP2-035](../TEST-PLAN.md) – [T-CP2-039](../TEST-PLAN.md)

### CP2-S8 新 lint 与场景测试
- **做什么**：实现 L014–L024；既有规则覆盖新对象；写 ROADMAP CP2 三个场景的引擎测试
- **怎么做**：`lint/rules/` 每条一个文件；L007 / L008 改为遍历「所有 DHCP 池」（`dhcp`、`vlans[].dhcp`、光猫 `dhcp`）；L009 加交换机 / AP 无连线；`scenarios/cp2.test.ts` 三个 `it`
- **产出物**：`lint/` 扩展及每条正反测试；场景测试
- **验收标准**：
  - 【引擎测试】`home-office.json`（场景 1 的图）→ lint 空数组
  - 【引擎测试】交换机1 `port8` access 10 — 交换机2 `port8` access 20 → 恰一条 L014，`targets` 两端端口，带 `linkId`；改成 trunk（native 1）— access 10 → 仍 L014，文案含「VLAN 1」「VLAN 10」
  - 【引擎测试】S2 第二条 trunk 漏放行拓扑 → L015 error，`targets[0]` = 交换机1 `port8`；两边放行后消失
  - 【引擎测试】交换机 trunk 口直连电脑 → L016；成环拓扑 → L017 error 且 `targets` 含两根连线
  - 【引擎测试】光猫路由模式 + 路由器 NAT 开 → L018，`targets = [{ 路由器, field: 'nat' }]`；路由器 NAT 关 → 无 L018；光猫改桥接 → 无 L018
  - 【引擎测试】S7 双 DHCP 拓扑 → L019 一条，`targets` 两台设备；互联网运营商内网预设 → L020 定位路由器 `wan`；互联网 `pppoe` + 路由器 `dhcp` → L021 error 文案含「要求拨号」
  - 【引擎测试】光猫 LAN 与路由器 LAN 同段 → L022；`vlans` 里 VLAN 10 `192.168.1.1/24` 与 LAN 重叠 → L023；`static` 网关不在段内 → L024；VLAN 20 池填 `192.168.10.100–199` → L008 定位到 VLAN 20 行
  - 【命令】`pnpm test` 通过；`scenarios/cp2.test.ts` 三个 `it` 与阶段完成标准场景 1–3 同名，断言 `verdict`、`path`、`reasonCode`、lint 编号
- **测试用例**：[T-CP2-040](../TEST-PLAN.md) – [T-CP2-047](../TEST-PLAN.md)

### CP2-S9 新节点与表单
- **做什么**：第 5 节的节点与表单；设备栏六张卡片
- **怎么做**：`canvas/nodes/{Switch,Ap,Modem}Node.tsx`，`RouterNode` / `InternetNode` 第二行与柄标注；`canvas/handles/VlanBadge.tsx`；`panels/forms/{SwitchForm,ApForm,ModemForm}.tsx`，`RouterForm` 加 WAN 模式、VLAN 表、LAN 口表，`InternetForm` 接入段可编辑；共用 `panels/forms/PortVlanTable.tsx`（支持按 `portId` 高亮一行）；store 新增 `setPortCount`、`setPortVlan(portIds[], vlan)`、`addVlan` / `removeVlan`、`setModemMode` 等 action；验证弹窗目标快选加子接口与光猫 LAN 地址
- **产出物**：六种设备都能拖入、连线、配置
- **验收标准**：
  - 【页面操作】拖「交换机」→ 横向节点，底边 `port1`–`port8`，第二行 `8 口 · VLAN 1`；表单口数改 16 → 节点变宽、`port16` 出现；改 4 但 `port6` 有连线 → 红字 `port6 有连线`，不改
  - 【页面操作】交换机表单勾选 `port2`、`port3`，批量设置 access VLAN 10 → 两行 PVID 变 10，节点两个柄下出现 `10`；`port1` 设 trunk 放行 `10,20` → 柄下 `T`，第二行 `8 口 · VLAN 1,10,20`
  - 【页面操作】拖「无线 AP」→ 顶边 `uplink`、底边 `wlan1`，第二行 `Home-WiFi`；连一台电脑到 `wlan1` → 出现 `wlan2`
  - 【页面操作】拖「光猫」→ 顶 `wan` 底 `lan1`，第二行「桥接」，表单只有名称与模式；切「路由」→ 展开 WAN 接入、LAN、DHCP，第二行变「路由 192.168.100.1」
  - 【页面操作】路由器表单 WAN 模式选「拨号」→ 出现账号、密码，账号空失焦红字「必填」；VLAN 表点「添加 VLAN」→ 新行 VLAN 2 `192.168.2.1/24`，节点第二行 `+1 VLAN`；LAN 口表把 `lan1` 设 trunk 放行 `2` → 柄下 `T`
  - 【页面操作】互联网表单点「运营商内网」→ 接入四项变 `100.64.0.1 / 255.192.0.0 / 100.64.0.2–100.64.0.254`，节点第二行 `100.64.0.1/10 · 内网`；方式选「拨号」→ 追加 `· 拨号`
  - 【页面操作】静态检查里点一条定位到端口的问题（如 L015）→ 设备选中，端口表对应行高亮
  - 【页面操作】以上改动后刷新页面 → 全部保留；导出再导入 → 一致
- **测试用例**：[T-CP2-048](../TEST-PLAN.md) – [T-CP2-055](../TEST-PLAN.md)

### CP2-S10 画布批量操作与撤销
- **做什么**：框选、全选、批量移动 / 删除、对齐、网格吸附、撤销 / 重做
- **怎么做**：`Canvas.tsx` 开 `selectionOnDrag`（`Shift`）、`snapToGrid` 16、多选拖动；`panels/SelectionPanel.tsx`（已选 n 项 + 六个对齐按钮，算外接框后批量写 `position`）；`store/history.ts`：`past[]` / `future[]` 各存拓扑快照，`commit()` 由每个改拓扑的 action 调用，栈深 50；`Toolbar` 加撤销 / 重做按钮与快捷键；自动保存订阅当前态
- **产出物**：多设备编辑效率；误操作可回退
- **验收标准**：
  - 【页面操作】`Shift` + 空白处拖矩形框住 3 个节点 → 三个都高亮，右侧面板「已选 3 项」；不按 `Shift` 拖空白 → 平移画布，不选中
  - 【页面操作】拖其中一个节点 → 三个一起移动，连线跟随；松手位置对齐 16px 网格
  - 【页面操作】点「顶」→ 三个节点上边缘对齐到最上者；点「横向等距」→ 三者水平间距相等，最左最右不动
  - 【页面操作】选中 3 个节点按 `Delete` → 三个节点及其全部连线消失；`Ctrl/Cmd + Z` → 全部回来，位置与连线一致；`Ctrl/Cmd + Shift + Z` → 再次删除
  - 【页面操作】连续做 5 次操作（拖、改字段、连线、删线、对齐）后连按 5 次撤销 → 逐步回到起点；期间移动视口、点选节点不消耗撤销步数
  - 【页面操作】撤销后刷新页面 → 保持撤销后的状态；重做栈丢失可接受
  - 【页面操作】`Ctrl/Cmd + A` → 所有节点选中；「新建」后 `Ctrl/Cmd + Z` → 图回来
- **测试用例**：[T-CP2-056](../TEST-PLAN.md) – [T-CP2-062](../TEST-PLAN.md)

## 阶段完成标准

测试用例：[T-CP2-063](../TEST-PLAN.md) – [T-CP2-066](../TEST-PLAN.md)

以下三个场景在页面上按顺序做一遍，全部符合预期才算过；每个场景在 `scenarios/cp2.test.ts` 有一条同名引擎测试。

**场景 1：光猫桥接 + 路由器拨号 + 交换机 + 3 台电脑 + 1 个 AP**
1. 「新建」。拖入 互联网、光猫、路由器、交换机、无线 AP、电脑 ×3 → 出现「互联网」「光猫1」「路由器1」「交换机1」「AP1」「电脑1」「电脑2」「电脑3」
2. 连线：互联网 `port1` – 光猫1 `wan`；光猫1 `lan1` – 路由器1 `wan`；路由器1 `lan1` – 交换机1 `port1`；交换机1 `port2` – 电脑1 `eth0`；`port3` – 电脑2 `eth0`；`port4` – AP1 `uplink`；AP1 `wlan1` – 电脑3 `eth0`
3. 点互联网，接入方式选「拨号」。点光猫1，模式保持「桥接」。点路由器1，WAN 模式选「拨号」，账号 `test`，密码 `test` → WAN 状态「拨号成功 203.0.113.2」
4. 点电脑1 / 2 / 3 → 都是自动获取，分别「已获取 192.168.1.100 / .101 / .102 … 来自 路由器1」
5. 点空白 → 静态检查「没有问题」
6. 「验证」ping 起点 电脑3 目标 `192.168.1.100` → 通，路径 电脑3 → AP1 → 交换机1 → 电脑1 → 交换机1 → AP1 → 电脑3，AP1 与交换机1 的 note 含「学习」和「泛洪」或「命中」
7. ping 起点 电脑1 目标 `8.8.8.8` → 通，路径 电脑1 → 交换机1 → 路由器1 → 光猫1 → 互联网 → 光猫1 → 路由器1 → 交换机1 → 电脑1，路由器1 去程 note 含「192.168.1.100 → 203.0.113.2」，光猫1 两行 note 含「二层转发」
8. 访问网站 起点 电脑3 域名 `www.google.com` → 成功
9. 「导出」→ JSON 与引擎 fixture `home-office.json` 结构一致

**场景 2：光猫改路由模式，提示双层 NAT**
1. 接场景 1。点光猫1，模式切「路由」（WAN 接入保持「跟随上游」）→ WAN 状态「拨号成功 203.0.113.2」，节点第二行「路由 192.168.100.1」
2. 点空白 → 静态检查一条 error「路由器1 · 路由器1 在拨号，但 光猫1 不接受拨号」。ping 电脑1 → `8.8.8.8` 不通，断在路由器1，原因含「不接受拨号」，「定位」→ 路由器1 WAN 模式高亮
3. 点路由器1，WAN 模式改「自动获取」→ WAN 状态「已获取 192.168.100.100」
4. 点空白 → 静态检查一条 warning「路由器1 · 路由器1 与 光猫1 都在做 NAT（双层 NAT）…」，点它 → 路由器1 选中，NAT 开关高亮
5. ping 电脑1 → `8.8.8.8` → 通，路径 电脑1 → 交换机1 → 路由器1 → 光猫1 → 互联网 → 光猫1 → 路由器1 → 交换机1 → 电脑1，路由器1 去程 note 含「192.168.1.100 → 192.168.100.100」，光猫1 去程 note 含「192.168.100.100 → 203.0.113.2」
6. 光猫1 切回「桥接」，路由器1 WAN 改回「拨号」→ 静态检查「没有问题」

**场景 3：两个 VLAN，同 VLAN 通、跨 VLAN 不通，单臂路由后通**
1. 「新建」。拖入 交换机、电脑 ×3。连 交换机1 `port2` – 电脑1、`port3` – 电脑2、`port4` – 电脑3
2. 交换机1 表单：`port2`、`port3` 批量设 access VLAN 10；`port4` 设 access VLAN 20 → 柄下出现 `10` `10` `20`
3. 三台电脑改手动：电脑1 `192.168.1.10/24`、电脑2 `192.168.1.11/24`、电脑3 `192.168.1.20/24`，网关、DNS 留空
4. ping 电脑1 → `192.168.1.11` → 通，路径 电脑1 → 交换机1 → 电脑2 → 交换机1 → 电脑1
5. ping 电脑1 → `192.168.1.20` → 不通，断在电脑1，原因「192.168.1.20（电脑3）在 VLAN 20，本机发出的包在 VLAN 10，二层隔离，需要路由器转发」，「定位」→ 交换机1 选中、端口表 `port4` 行高亮
6. 加单臂路由：拖入 路由器、互联网。连 路由器1 `lan1` – 交换机1 `port1`，路由器1 `wan` – 互联网 `port1`。路由器1 表单：VLAN 表添加 VLAN 10（`192.168.10.1/24`，DHCP 开）、VLAN 20（`192.168.20.1/24`，DHCP 开）；LAN 口表 `lan1` 设 trunk 放行 `10,20`。交换机1 `port1` 设 trunk 放行 `10,20`
7. 三台电脑改回自动获取 → 电脑1 `192.168.10.100`、电脑2 `192.168.10.101`（来自 路由器1），电脑3 `192.168.20.100`
8. 点空白 → 静态检查「没有问题」
9. ping 电脑1 → `192.168.20.100` → 通，路径 电脑1 → 交换机1 → 路由器1 → 交换机1 → 电脑3 → 交换机1 → 路由器1 → 交换机1 → 电脑1，路由器1 去程 note 含「VLAN 10」「VLAN 20」
10. ping 电脑1 → `192.168.10.101` → 通，路径不经过路由器1
11. 交换机1 `port1` 放行改为 `10` → 静态检查 error「VLAN 20 两侧都有设备，但 交换机1 port1 未放行」；ping 电脑1 → `192.168.20.100` 不通，断在路由器1，原因含「未放行 VLAN 20」，「定位」→ 交换机1 `port1` 行高亮
12. 放行改回 `10,20`。ping 电脑1 → `8.8.8.8` → 通

**场景 4：引擎自动测试**
- 【命令】`pnpm test` 通过；`scenarios/cp2.test.ts` 场景 1–3 各一条 `it`，断言路径、`reasonCode`、`fixAt`、lint 编号与上面文字一致；场景 1 断言 `home-office.json` 往返相等

## 对其他检查点的约定

1. **`Port.vlan` 定稿**：`access { pvid }` / `trunk { allowed, native }`，只出现在 switch `portN` 与 router `lanN`；缺省 access 1。CP6 PVE 网桥绑 VLAN 复用同一类型
2. **`segmentOf(start, opts)` 是唯一的二层判断入口**：`start = { portId, vlan }`，返回接口集合、二层路径、`dropAt`、`loop`。后续任何新设备（PVE 网桥、VPS 虚拟网卡）接进二层都在 `segmentOf` 里加分支，不另写走图
3. **透明设备名单**：switch、ap、bridge 模式 modem、router 网桥（只做二层时）。它们的到访 decision 固定 `action: 'forward'`、`basis.mac` 非空、`basis.route = null`。CP3 动画据此把它们画成「不改包只换口」的一跳
4. **`PacketSummary.vlan` = 线上标签**：只在 trunk 非 native VLAN 时非空。CP3 包头查看直接显示它
5. **`basis.mac` / `basis.vlan` 形状**（第 3 节）；`basis.vlan.dropAt` 供 CP3 把 VLAN 失败画到丢弃点而不是起点
6. **`runtime.wanLeases[]`**：`status` 六个取值（`ok` `no-link` `no-server` `pppoe-required` `pppoe-rejected` `pool-exhausted`）、`via`、`serverDeviceId`、`addressClass`。CP7 公网判断读最外层（`serverDeviceId` 是 internet 的那台）的 `addressClass`
7. **路由模式光猫 = 路由器**：引擎里所有「router」判断都写成 `isL3Router(device)`，CP6 的 OpenWrt 虚拟机、旁路由沿用这个谓词
8. **上游接入方式**由 internet `access.mode` 决定，任何 WAN 客户端与它不匹配就拿不到地址。CP5 的 VPS、CP7 的外部访问不改这条
9. **reasonCode 新增七条**（2.4）、**lint L014–L024**，后续从 L025 起
10. **多 DHCP 池**：服务候选 = 网段内所有启用 DHCP 的子接口；取先出现者并记 `dhcpConflicts`。CP6 旁路由 DHCP 冲突用同一机制报 L019
11. **界面**：`PortVlanTable` 是所有「每口 VLAN」编辑的唯一组件；`SelectionPanel` 在多选时替代配置表单；撤销栈在 `store/history.ts`，后续任何改拓扑的 action 必须走 `commit()`
12. **拓扑 `version` 仍为 1**。下次升版本时（如 CP4 DNS 改数组）顺带把 VLAN 1 从 `lan` / `dhcp` 并入 `vlans[]`

## 待定问题

✅ 2026-09-04 开工时决定：第 3–11 条全部按本文建议执行（口数上限 48、>16 口两排不交错；AP 不绑 VLAN；光猫默认 `192.168.100.1` 不加预设；PPPoE 不校验；成环按 lint error + `L2_LOOP`；撤销粒度按本文；运营商内网只做预设 + L020；ping 起点不允许光猫）。


1. **对 README 术语表的修改请求**（✅ 已采纳 2026-09-04，README 术语表已改）：(a) 光猫端口由「`lan1`（光口不建模）」改为 `wan`、`lan1`。不建上行口就没法用连线表达光猫连哪个互联网，decision 的 `linkId` 也无法对应连线（CP1 约定 5），CP3 动画会缺一段；`wan` 只是上行口的名字，仍不建模光功率等光口属性。(b) AP 客户端口命名补 `wlan1`…`wlanN`
2. **对 CP1 的修改请求**（✅ 已采纳 2026-09-04，CP1 的 2.1、B 段、L009、fixAt 已补）：(a) 2.1 第 2 步「`wan` 未连线或对端不是 internet → `no-server`」改为「网段内没有上游」，因为桥接光猫会隔在中间；(b) 路由器 `lan1`–`lan4` 之间只做二层转发时也产生一条 `forward` decision（CP1 没写明，本文按约定 5 补上）；(c) L009 增加交换机 / AP 无连线的触发条件；(d) `ProbeResult.fixAt` 增加可选 `portId`，与 `LintIssue.targets` 对齐，否则 VLAN 失败无法定位到端口
3. **交换机口数上限**取 48 是否够；口数 > 16 的两排布局要不要按真实交换机上下交错（`port1` 上 `port2` 下）
4. **AP 是否需要 VLAN**：本检查点 AP 透传标签、SSID 只是标签。SSID 绑 VLAN（访客网络）常见但不在总纲，建议第二期
5. **光猫默认 LAN `192.168.100.1`**：现实里很多光猫是 `192.168.1.1`，会和路由器撞网段。选 `.100.1` 是让场景 2 只演示双层 NAT；L022 已能报撞段。是否再加一个「光猫常见默认 `192.168.1.1`」预设
6. **PPPoE 账号密码**完全不校验。若要演示「账号错拨不上」，互联网侧需要一张账号表，建议第二期
7. **VLAN 失败停在起点**（ARP 步）而不是丢弃点，与 CP1 的瞬时 ARP 一致；CP3 若要把包画到丢弃点再消失，用 `basis.vlan.dropAt`。CP3 已回应：第一版停在起点，定位跳到丢弃端口，画到丢弃点留作增强（见 [CP3](CP3-trace-and-animation.md) 待定问题 11）
8. **成环处理**：本文选「lint error + 首个透明设备停 `L2_LOOP`」。另一选项是像有 STP 一样自动断一条线，但总纲明确不做生成树。请确认
9. **撤销范围**：拓扑名称修改算不算一步（本文不算）；导入后能否撤销回导入前（本文算一步，可以）
10. **运营商内网场景**不在 CP2 三个验收场景里，本文只做预设按钮 + L020 + 引擎测试，验证动作留给 CP7
11. **ping 起点**是否允许路由模式光猫（排查光猫拨号）。本文不允许，沿用 CP1 待定 6 的口径

## 关联文档

- 上一个检查点：[CP1-lan-basics.md](CP1-lan-basics.md)
- 下一个检查点：[CP3-trace-and-animation.md](CP3-trace-and-animation.md)（待写）
- 测试表：[../TEST-PLAN.md](../TEST-PLAN.md)
- 文档规范：[README.md](README.md)
