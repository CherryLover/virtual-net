# CP4 分区与边界

> 总纲对应章节：[ROADMAP.md](../../ROADMAP.md) 的「CP4 分区与边界」
> 前置：CP1 局域网基础（拓扑模型、decision、ProbeResult、DNS 与访问网站）、CP2 交换机与多设备（透明设备、`segmentOf`、运营商内网）、CP3 路径追踪与动画（逐跳动画、解释文案、短标签）
> 状态：未开始

## 目标

做完这个检查点，沙盘里第一次出现「墙」。画布分成内网、运营商、边界、互联网四条区带，互联网节点内部再分国内与境外两栏，一眼能看出哪台设备在墙内、哪个网站在墙外。拖一台「长城防火墙」串在上行链路上，默认带一份接近现实的规则：Google、YouTube、Telegram 的地址在黑名单里，这三个域名的 DNS 查询会被抢答成污染地址，ChatGPT 靠 HTTPS 握手域名拦截。不加代理访问 Google 会失败，失败原因说得清是 DNS 污染、IP 封锁还是 SNI 拦截；把防火墙的开关一关，同一张图立刻能通。目标网站库从 CP1 的三条内置扩到十条预设并且可以增删改，多一种验证类型「DNS 查询」，直接对比解析结果和真实地址。

## 范围

### 做
- 分区模型：画布四条区带 + 互联网节点内部国内 / 境外两栏；区带归属由拓扑推导，不是可编辑属性
- 新设备类型 `gfw`（长城防火墙）：两个端口、二层透明、一份规则集、一键开关
- 目标网站库：十条预设站点，字段可增删改，国内 DNS 与境外 DNS 各一条
- 边界判定：IP 黑名单、域名黑名单、DNS 污染、HTTPS 握手域名（SNI）拦截；协议识别等级只定义字段与含义
- DNS 模型扩展：查询穿过边界被抢答；国内 DNS 递归时同样被污染；`ProbeResult.dns` 能表达「被污染」
- 新验证类型 `dnsQuery`（起点 + 域名，返回污染 IP 与真实 IP 对比）
- 新 reasonCode 三条、lint L025–L028、界面与文案

### 不做
- 代理、隧道、分流、VPS（CP5）。CP4 里「被封」就是失败，没有绕行手段
- 协议识别的判定逻辑。本检查点只定义 `protocolDetection` 字段与四档含义，谁被识别出来由 CP5 判
- 多台防火墙同时生效。拓扑里可以放多台，只有第一台启用的生效，其余报 lint
- 按运营商区分出境线路、丢包、延迟（总纲第二期）
- 电脑 DNS 改成多个服务器（CP1 待定 4 仍挂着，见待定问题 2）
- 改动 CP1–CP3 已有的引擎流程。边界是路径上多出来的一跳，其余判断顺序不动

## 关键设计

### 1 分区模型

#### 1.1 三种做法

| | A. 设备属性 `zone` | B. 位置决定区域 | C. 视觉区带 + 边界节点 |
| --- | --- | --- | --- |
| 做法 | 每台设备加一个可编辑的 `zone` 字段 | 画布按 y 坐标分带，设备落在哪条带就算在哪一侧 | 区带只是背景参考；出境判定看包有没有经过边界节点 |
| 用户负担 | 每台设备都要选一次，选错就模拟错 | 零负担 | 零负担，只需把防火墙串进上行链路 |
| 风险 | 与拓扑结构可能自相矛盾（设备连在内网却标成境外） | 随手拖一下就改了语义；与 CP3「位置变化不算拓扑改动」直接冲突 | 区带与模拟解耦，拖动只影响好不好看 |
| CP5 兼容 | 代理要额外声明自己在哪区 | 同上，且 VPS 拖错位置就换阵营 | 隧道外层包经过边界那一跳，天然只看外层 |

**决定：C。** 分区是**看的**，不是**配的**。设备归哪条带由 `zonesOf(topology)` 从拓扑推导，只用来配色和「按分区排布」按钮；判定一律看包的实际路径。总纲原文「设备落在哪个区决定它在哪一侧」按此调整，记入待定问题 1。

#### 1.2 四条区带

自上而下：**互联网**（内部左国内、右境外）、**边界**、**运营商**、**内网**。总纲列的五个分区里，「国内互联网」「境外互联网」是互联网带内部的两栏。

`zonesOf(topology)` 返回 `Record<deviceId, 'lan' | 'isp' | 'border' | 'internet'>`：

| 设备 | 区带 |
| --- | --- |
| `internet` | `internet` |
| `gfw` | `border` |
| `modem` | `isp` |
| `router` | `lan`（它是内网的上沿；旁路由、多级路由同样算内网） |
| `pc` / `switch` / `ap` | `lan` |

目标不是设备，不进这张表：`InternetTarget.region` 决定它画在互联网节点的左栏还是右栏。没有光猫时运营商带压成一条细带，仍然画出来。

### 2 目标网站库

#### 2.1 字段

`InternetTarget` 字段不变（CP1 已预留 `region` / `reachable`），CP4 把它从只读变成可编辑：

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定 id，新增时生成 |
| `domain` | 域名，库内唯一 |
| `ip` | IP，库内唯一。**都是示意值**，不保证与真实解析一致 |
| `region` | `cn` / `overseas`。决定画在哪栏，也决定包要不要过边界判定 |
| `dnsServer` | 是不是 DNS 服务器 |
| `reachable` | 默认可达状态。`false` 表示网站自己挂了（`TARGET_UNREACHABLE`），与「被封」是两件事 |

#### 2.2 预设站点

`defaultInternetConfig()` 的 `targets` 换成这十条；互联网 `access.dns` 默认由 `8.8.8.8` 改为 `223.5.5.5`（运营商 DNS 应该是国内的）。

| 域名 | IP（示意） | region | dnsServer | reachable | 默认被封方式 |
| --- | --- | --- | --- | --- | --- |
| `www.baidu.com` | `110.242.68.66` | cn | 否 | 是 | — |
| `www.taobao.com` | `203.119.128.98` | cn | 否 | 是 | — |
| `www.qq.com` | `109.244.194.51` | cn | 否 | 是 | — |
| `dns.alidns.com` | `223.5.5.5` | cn | **是** | 是 | — |
| `github.com` | `20.205.243.166` | overseas | 否 | 是 | 不封（境外但能通的对照） |
| `www.google.com` | `142.250.72.14` | overseas | 否 | 是 | DNS 污染 + IP 黑名单 |
| `www.youtube.com` | `142.250.72.206` | overseas | 否 | 是 | DNS 污染 + IP 黑名单 |
| `t.me` | `149.154.167.99` | overseas | 否 | 是 | DNS 污染 + IP 黑名单 |
| `chatgpt.com` | `104.18.32.47` | overseas | 否 | 是 | 只有 SNI 拦截（DNS 正常） |
| `dns.google` | `8.8.8.8` | overseas | **是** | 是 | 不封 IP，但查询被抢答 |

三种拦截各有一个默认能演的目标：Google 演 DNS 污染，ChatGPT 演 SNI 拦截，手填 Google 的真 IP 去 ping 演 IP 黑名单。GitHub 是「境外但不封」的对照。

### 3 长城防火墙

#### 3.1 设备与端口

新设备类型 `gfw`，端口两个：`inside`（朝内网，连路由器 `wan` 或光猫 `wan`）、`outside`（朝互联网，连 `internet` 的 `portN`）。

它**没有 IP、不做 NAT、不减 TTL**，行为等同 CP2 的透明设备：到访产生一条 `action: 'forward'` 的 decision，`basis.route = null`，`packetIn.ttl === packetOut.ttl`。这样 CP3 的 traceroute 不会把它算成一跳（真实 traceroute 也看不见它），动画照常在它上面停一下。判定失败时它是唯一一条 `verdict: 'stop'`，此时按 CP3 规则成为最后一跳。

`runtime.border` 由 `buildRuntime` 推导：拓扑里第一台 `enabled: true` 的 gfw，`{ deviceId, config }`；没有则为 `null`。互联网设备回答 DNS 时要读它（见 4.2）。

#### 3.2 规则集

```jsonc
{
  "enabled": true,
  "ipBlacklist": ["142.250.72.14", "142.250.72.206", "149.154.167.99"],
  "domainBlacklist": ["www.google.com", "www.youtube.com", "t.me", "chatgpt.com"],
  "dnsPoison": {
    "enabled": true,
    "poisonIp": "243.185.187.39",
    "domains": ["www.google.com", "www.youtube.com", "t.me"]
  },
  "sniBlock": true,
  "protocolDetection": "standard"
}
```

`dnsPoison.domains` 留空数组表示跟随 `domainBlacklist`。`poisonIp` 是一个不在目标库里的地址，所以连它必然连不上。

#### 3.3 判定顺序

包每次到访 gfw 走一遍。`direction` 由入口端口定：从 `inside` 进是 `out`（出境），从 `outside` 进是 `in`（入境）。

1. `enabled === false` → 放行，note「防火墙已关闭，直接放行」
2. 目的 IP 等于 `dnsPoison.poisonIp` → **停**，`DNS_POISONED`。这一步必须排在区域判断前面：污染地址不在目标库里，`regionOfIp` 查不到它
3. `regionOfIp(runtime, 对端地址) === 'cn'` 或查不到区域 → 放行，note「国内目标，不过滤」
4. 目的 IP（`direction: 'in'` 时取源 IP）在 `ipBlacklist` → **停**，`GFW_IP_BLOCKED`
5. `phase === 'tcp'` 且 `sniBlock` 且 `packetIn.sni` 在 `domainBlacklist` → **停**，`GFW_SNI_BLOCKED`
6. `phase === 'dns'`、`direction: 'out'`、`dnsPoison.enabled` 且查询域名命中污染名单 → **抢答**：本跳 `action: 'answer'`，`verdict: 'pass'`，源 IP 伪装成被查的 DNS 地址，答案是 `poisonIp`
7. 其余放行。协议识别（`protocolDetection`）在 CP4 只记进 `basis.border.level`，不参与判定

`basis.border`（`DecisionBasis` 新增可选键）：

```jsonc
{
  "enabled": true,
  "direction": "out",
  "targetRegion": "overseas",
  "matched": "sni",
  "rule": "www.google.com",
  "poisonIp": "243.185.187.39",
  "level": "standard"
}
```

`matched` 取值 `none` / `ip` / `sni` / `poison`（第 6 步抢答）/ `poisoned-answer`（国内 DNS 返回污染结果，见 4.2）/ `blackhole`（第 2 步，撞上污染地址）。

**SNI 从哪来**：`PacketSummary` 新增可选字段 `sni?: string`，只在 `proto: 'tcp'` 且 `dstPort: 443` 时写入本次访问的域名。这是外层包的一部分，CP5 的隧道封装后外层包的 `sni` 是伪装域名，边界只看得到它。

#### 3.4 协议识别等级

CP4 只定义字段与含义，判定逻辑 CP5 用。

| 等级 | 含义 | CP5 对照 |
| --- | --- | --- |
| `off` | 不看协议，只看 IP、域名、DNS | 任何协议都过 |
| `basic` | 只认明文特征 | 明文类协议被拦 |
| `standard`（默认） | 认已知协议指纹 | 明文类被拦，老协议标「有识别风险」 |
| `strict` | 主动探测 + TLS 指纹比对 | 只有 TLS 伪装类能过 |

### 4 DNS 模型扩展

#### 4.1 谁问谁

链条不变，只是每一环都要判断在墙的哪一侧：

- 电脑的 DNS = 静态 `dns` 或租约 `dns`（CP1 2.4，不改）
- 路由器作 DNS 转发器，上游 = WAN 租约的 `dns` = 互联网 `access.dns`（默认 `223.5.5.5`，国内）
- 电脑也可以直接填境外 DNS（`8.8.8.8`），查询就要穿过边界

#### 4.2 两条污染路径

| 路径 | 谁动的手 | decision 落在哪 | `basis.border.matched` | 逐跳文案 |
| --- | --- | --- | --- | --- |
| 查询发往境外 DNS | 边界抢答 | gfw | `poison` | 「边界抢答，返回污染地址 243.185.187.39」 |
| 查询发往国内 DNS | 国内 DNS 递归时穿过边界 | internet | `poisoned-answer` | 「国内 DNS 向境外权威服务器递归时同样穿过边界，返回被污染的地址」 |

第二条的判断写在互联网设备回答 DNS 的分支里：`runtime.border` 非空、`enabled`、`dnsPoison.enabled`、域名命中污染名单，就把答案换成 `poisonIp`。两条路径的最终结果一样（拿到假地址），原因文案不同，正好构成总纲场景 1 与场景 3 的对照。

拿到污染地址之后，`tcp` 阶段的包到边界撞上判定顺序第 3 步，停 `DNS_POISONED`。用户看到的因果链完整：解析被污染 → 连不上假地址。

#### 4.3 `ProbeResult.dns` 与新验证类型

`ProbeResult.dns` 追加两个可选字段（CP1 已有 `server` / `domain` / `ip` 不动）：

| 字段 | 说明 |
| --- | --- |
| `realIp?` | 目标库里这个域名的真实 IP；域名不在库里为空 |
| `poisoned?` | `ip !== realIp` 且由边界规则造成时为 `true` |

新入口 `dnsQuery(topology, { sourceDeviceId, domain })`，返回 `kind: 'dnsQuery'` 的 `ProbeResult`：只跑 `visitSite` 的 dns 阶段，`hops` 为 `null`，`summary` 形如「电脑1 解析 www.google.com → 243.185.187.39（被污染，真实 142.250.72.14）」。成功解析时 `verdict: 'ok'`，被污染也算 `ok`（解析确实成功了，只是答案是假的），污染事实靠 `dns.poisoned` 表达；解析失败（`NO_DNS` / `DNS_NXDOMAIN` 等）才是 `fail`。

### 5 引擎变化汇总

#### 5.1 新增 reasonCode（追加到 CP1 2.3 表）

| reasonCode | 出现在 | 文案模板 | fixAt |
| --- | --- | --- | --- |
| `GFW_IP_BLOCKED` | gfw | `目标地址 {IP}（{域名}）在边界的 IP 黑名单里，包被丢弃` | gfw，字段 `ipBlacklist` |
| `GFW_SNI_BLOCKED` | gfw | `HTTPS 握手里的域名 {域名} 在边界的域名黑名单里，连接被重置` | gfw，字段 `domainBlacklist` |
| `DNS_POISONED` | gfw | `域名 {域名} 的解析结果 {污染IP} 是边界返回的污染地址，连不上` | gfw，字段 `dnsPoison` |

`TARGET_UNREACHABLE`（CP1 已有）继续表示「网站自己挂了」，不复用来表达被封。

模板里的 `{域名}` 取 `packetIn.sni`；直接 ping 一个地址时没有 SNI，`GFW_IP_BLOCKED` 改用目标库里该 IP 对应的域名，`DNS_POISONED` 则省掉括号里那截。

#### 5.2 数据结构增量

| 位置 | 增量 |
| --- | --- |
| `DeviceType` | 追加 `'gfw'` |
| `GfwDevice.config` | `BorderConfig`（3.2） |
| `PacketSummary` | 追加可选 `sni?: string` |
| `DecisionBasis` | 追加可选 `border?: BorderBasis` |
| `ProbeResult.kind` | 追加 `'dnsQuery'` |
| `ProbeResult.dns` | 追加可选 `realIp?` / `poisoned?` |
| `Runtime` | 追加 `border: { deviceId, config } \| null` |
| 引擎入口 | 第七个入口 `dnsQuery`；新增导出 `regionOfIp(runtime, ip)` |

**拓扑 `version` 保持 1**。新增的全是可选字段与新设备类型，CP1–CP3 导出的任何文件不经迁移直接可读、行为不变（没有 gfw 就没有边界，`runtime.border` 为 `null`）。`parseTopology` 只加校验：`gfw` 的端口名必须是 `inside` / `outside`，黑名单元素是合法 IP / 非空域名，`protocolDetection` 是四档之一。

### 6 静态检查 L025–L028

| 编号 | 检查什么 | 触发条件 | 级别 | 定位 | 文案要点 |
| --- | --- | --- | --- | --- | --- |
| L025 | DNS 指向境外明文 DNS | 电脑静态 `dns` 或互联网 `access.dns` 命中目标库里 `region: 'overseas'` 且 `dnsServer` 的条目，且 `runtime.border` 启用且 `dnsPoison.enabled` | warning | 该设备，字段 dns | `DNS 服务器 {IP} 在境外，明文查询会在边界被污染` |
| L026 | 目标被封且没有绕行手段 | 目标库里某条 `region: 'overseas'` 的目标命中 IP 黑名单或域名黑名单，且拓扑里没有代理（CP4 恒成立） | warning | gfw，字段对应黑名单 | `{域名} 被边界拦截（{IP 黑名单 / 域名黑名单 / DNS 污染}），当前拓扑里没有代理` |
| L027 | 目标库条目不合法 | 域名重复、IP 重复、IP 格式非法、域名为空 | error | 互联网，字段 targets 对应行 | `目标库里 {域名} 出现两次` / `{IP} 不是合法的 IP 地址` |
| L028 | 边界没串对 | ①互联网某个已连线端口沿上行链路走到路由器 `wan` 全程不经过 gfw；②拓扑里有多台 `enabled` 的 gfw | warning | ①互联网 + 该端口；②每台 gfw | ①`{互联网} 的 {端口} 这条上行链路不经过长城防火墙，出境流量不会被拦截`；②`拓扑里有 {n} 台长城防火墙，只有 {设备} 生效` |

L009 的触发条件补一条：gfw 的 `inside` 或 `outside` 没有连线 → warning `{端口} 没有连线`。后续检查点从 L029 起。

### 7 界面

#### 7.1 画布分区

四条水平背景带铺在画布最底层（React Flow 的 `<Background>` 之上、节点之下），自上而下 互联网 / 边界 / 运营商 / 内网，各带左上角一个浅色标签。带高固定，随视口缩放一起变换，不随节点位置自适应。互联网带内部再画一条竖直虚线，左侧标「国内」、右侧标「境外」。

互联网节点内部的目标列表按 `region` 分左右两栏，栏头「国内 {n}」「境外 {n}」；境外栏里被黑名单命中的目标行带一个小锁标。

工具栏加一个「按分区排布」按钮：按 `zonesOf` 把设备摆回各自带的垂直区间，同带内按现有 x 排序等距铺开。它是一次普通的拓扑改动，进撤销栈，但不改 `topologyRevision`（只动位置，CP3 4.2）。

#### 7.2 防火墙节点与表单

左侧设备栏第七张卡「长城防火墙」，图标是一段砖墙。拖进画布时若落点距某根连线中心 24px 以内，自动断开那根线并把 gfw 串进去（`inside` 接原来靠内的一端，`outside` 接靠外的一端）；否则只放节点，由用户自己连。

**节点**：横向长条，宽 200px，红棕描边。第二行 `IP 3 · 域名 4 · 污染 3` 或 `已关闭`（灰）。`inside` 端口柄在底边，`outside` 在顶边。

**表单**：

| 区块 | 内容 |
| --- | --- |
| 启用 | 一个开关。关掉后下面所有区块置灰但保留内容 |
| IP 黑名单 | 每行一个 IP 的多行输入，失焦逐行校验，非法行红字提示；右侧显示命中的目标域名 |
| 域名黑名单 | 每行一个域名的多行输入 |
| DNS 污染 | 开关；污染地址（IP 输入，默认 `243.185.187.39`）；域名列表（多行，留空显示占位「留空则跟随域名黑名单」） |
| HTTPS 握手域名拦截 | 一个开关 |
| 协议识别等级 | 四选一下拉，选中项下方一行灰字说明（3.4 的「含义」列） |
| 恢复默认规则 | 一个按钮，确认后写回 3.2 的默认值 |

#### 7.3 目标库编辑

互联网表单的目标表从只读改成可编辑表格：域名 / IP / 区域下拉 / DNS 服务器复选 / 可达复选 / 删除。表尾「添加目标」新增一行（域名 `example.com`、IP 空、region `overseas`）。表头右侧「恢复预设」写回 2.2 的十条。表格下方一行灰字：「IP 为示意值，不保证与真实解析一致」。

#### 7.4 验证与结果

- 验证弹窗类型加第四个「DNS 查询」：起点（pc）+ 域名（目标库下拉，也可手填）
- 选中电脑时的验证块加一个「DNS 查询」按钮，域名跟随「打开网站」的下拉选择
- 结果面板与设备验证块共用的结果组件新增 **DNS 块**：`服务器 223.5.5.5 · 解析到 243.185.187.39 · 真实 142.250.72.14`，`poisoned` 时「解析到」红字并带「已污染」小标；`dnsQuery` 类型时这块置顶
- `trace/reasonLabel.ts` 补三条短标签：`GFW_IP_BLOCKED` →「IP 被封」、`GFW_SNI_BLOCKED` →「域名被拦」、`DNS_POISONED` →「DNS 被污染」
- `trace/explain.ts` 补 `border` 模板，优先级高于 `mac`（gfw 两者都写）。title 按 `matched` 分支：`none` → `边界放行`（`enabled: false` 时 `防火墙已关闭，直接放行`）；`poison` → `边界抢答，返回污染地址 {poisonIp}`；`ip` / `sni` / `blackhole` → 用 `reasonLabel`。lines 追加 `边界：{方向中文}，目标区域 {国内/境外}` 与命中规则原文

## 步骤

### CP4-S1 分区模型与 gfw 设备类型
- **做什么**：新设备类型、规则集默认值、区带推导、序列化校验
- **怎么做**：`model/topology.ts` 加 `GfwDevice` / `BorderConfig` 与 `DeviceType` 追加；`model/defaults.ts` 加 `defaultBorderConfig()` 与端口名表；`model/zones.ts` 放 `zonesOf`；`serialization/parse.ts` 加校验；`test-support/` 加 `fixtures/gfw-home.json`（电脑1 + 路由器1 + 长城防火墙1 + 互联网，三根线，默认规则集）
- **产出物**：`gfw` 类型、默认规则集、`zonesOf`、CP4 fixture
- **验收标准**：
  - 【引擎测试】`createDevice(topology, 'gfw', pos)` → 端口两个，名 `inside`、`outside`；`config` 深等于 3.2 的默认规则集
  - 【引擎测试】`parseTopology` 读 `fixtures/gfw-home.json` → 成功，设备 4 台、连线 3 根
  - 【引擎测试】把 gfw 的端口名改成 `wan` 再 `parseTopology` → 失败，错误信息含「端口名」
  - 【引擎测试】`protocolDetection` 写成 `'max'`、`ipBlacklist` 写成 `['1.2.3']` 分别 `parseTopology` → 都失败，错误信息分别含「协议识别等级」「不是合法的 IP」
  - 【引擎测试】`zonesOf(gfw-home)` → 电脑1 `lan`、路由器1 `lan`、长城防火墙1 `border`、互联网 `internet`；CP2 的 `home-office` 里光猫1 为 `isp`
  - 【引擎测试】`parseTopology(MINIMAL_RAW)`（CP1 fixture，无 gfw）→ 成功且 `buildRuntime().border === null`
- **测试用例**：[T-CP4-001](../TEST-PLAN.md) – [T-CP4-006](../TEST-PLAN.md)

### CP4-S2 目标网站库扩充与可编辑
- **做什么**：十条预设、`regionOfIp`、目标库校验
- **怎么做**：`model/defaults.ts` 换 `targets` 并把 `access.dns` 改 `223.5.5.5`；`engine/runtime/` 加 `regionOfIp(runtime, ip)`；`lint/rules/l027-target-library.ts`
- **产出物**：预设目标库、`regionOfIp`、L027
- **验收标准**：
  - 【引擎测试】`defaultInternetConfig().targets` → 10 条，域名与 IP 与 2.2 表逐行一致；`region: 'cn'` 4 条、`overseas` 6 条；`dnsServer` 恰好 `dns.alidns.com` 与 `dns.google` 两条
  - 【引擎测试】`defaultInternetConfig().access.dns` → `'223.5.5.5'`
  - 【引擎测试】`regionOfIp` 对 `142.250.72.14` → `'overseas'`；对 `110.242.68.66` → `'cn'`；对 `192.168.1.1` → `null`
  - 【引擎测试】gfw-home 里把 `www.baidu.com` 的 IP 改成 `142.250.72.14` → L027 error，文案含「出现两次」定位互联网
  - 【引擎测试】新增一条 `domain: ''` 的目标 → L027 error；`ip: '999.1.1.1'` → L027 error 含「不是合法的 IP 地址」
  - 【引擎测试】未改动的 gfw-home → L027 不报
- **测试用例**：[T-CP4-007](../TEST-PLAN.md) – [T-CP4-012](../TEST-PLAN.md)

### CP4-S3 边界一跳与拦截判定
- **做什么**：包经过 gfw 时的 decision 与 3.3 的判定顺序（第 1–5、7 步）
- **怎么做**：`engine/sim/border.ts` 放 `checkBorder(packet, config, region, direction)` 纯函数；`engine/sim/walk.ts` 在设备到访分支里加 gfw 分支（透明转发 + 判定）；`PacketSummary.sni` 在 `visitSite` 的 tcp 阶段写入；`messages.ts` 加三条文案；`buildRuntime` 推导 `runtime.border`
- **产出物**：边界一跳、三条 reasonCode、`sni` 字段
- **验收标准**：
  - 【引擎测试】gfw-home 里 `ping(电脑1, '110.242.68.66')` → `ok`；decisions 里长城防火墙1 出现两次（去 + 回），两条都 `action: 'forward'`、`basis.route === null`、`packetIn.ttl === packetOut.ttl`、`basis.border.matched === 'none'` 且 `targetRegion === 'cn'`
  - 【引擎测试】`ping(电脑1, '142.250.72.14')` → `fail`，`reasonCode: 'GFW_IP_BLOCKED'`，`stoppedAt` 是长城防火墙1，`reason` 含「IP 黑名单」，`fixAt.field === 'ipBlacklist'`
  - 【引擎测试】`ping(电脑1, '20.205.243.166')`（GitHub）→ `ok`，边界那跳 `matched: 'none'`、`targetRegion: 'overseas'`
  - 【引擎测试】`visitSite(电脑1, 'chatgpt.com')` → `fail`，`reasonCode: 'GFW_SNI_BLOCKED'`，停在长城防火墙1；该跳 `packetIn.sni === 'chatgpt.com'`，`basis.border.rule === 'chatgpt.com'`；`dns` 字段的 `ip` 是真实 `104.18.32.47` 且 `poisoned` 非真
  - 【引擎测试】把 gfw 的 `sniBlock` 关掉再 `visitSite(电脑1, 'chatgpt.com')` → `ok`
  - 【引擎测试】把 gfw 的 `enabled` 关掉再 `ping(电脑1, '142.250.72.14')` → `ok`，边界那跳 `basis.border.enabled === false`，`note` 含「防火墙已关闭」
  - 【引擎测试】`traceroute(电脑1, '110.242.68.66')` → 两跳（路由器1、互联网），长城防火墙1 出现在第 2 跳的 `through` 里
- **测试用例**：[T-CP4-013](../TEST-PLAN.md) – [T-CP4-019](../TEST-PLAN.md)

### CP4-S4 DNS 污染与 dnsQuery 入口
- **做什么**：4.2 的两条污染路径、`ProbeResult.dns` 扩展、第七个引擎入口
- **怎么做**：`walk.ts` 的 gfw 分支加判定顺序第 6 步（抢答）；互联网回答 DNS 的分支读 `runtime.border` 决定是否换答案；`engine/sim/dnsQuery.ts` 复用 `Walk` 只跑 dns 阶段；`result.ts` 填 `realIp` / `poisoned`；`index.ts` 导出
- **产出物**：DNS 污染、`dnsQuery` 入口
- **验收标准**：
  - 【引擎测试】gfw-home（电脑自动获取，上游 `223.5.5.5`）`visitSite(电脑1, 'www.google.com')` → `fail`，`reasonCode: 'DNS_POISONED'`，停在长城防火墙1；`dns` 为 `{ server: '192.168.1.1', domain: 'www.google.com', ip: '243.185.187.39', realIp: '142.250.72.14', poisoned: true }`；互联网那条 DNS 应答 decision 的 `basis.border.matched === 'poisoned-answer'`
  - 【引擎测试】电脑1 改静态、DNS 填 `8.8.8.8`，再 `visitSite(电脑1, 'www.google.com')` → 同样 `DNS_POISONED`；污染发生在长城防火墙1 那条 decision，`action: 'answer'`、`verdict: 'pass'`、`basis.border.matched === 'poison'`
  - 【引擎测试】`dnsQuery(电脑1, 'www.google.com')` → `kind: 'dnsQuery'`、`verdict: 'ok'`、`hops === null`，`summary` 含「243.185.187.39」与「真实 142.250.72.14」
  - 【引擎测试】`dnsQuery(电脑1, 'github.com')` → `dns.ip === '20.205.243.166'`，`poisoned` 非真，`summary` 不含「污染」
  - 【引擎测试】`dnsQuery(电脑1, 'chatgpt.com')` → `poisoned` 非真（不在污染名单）；`dnsQuery(电脑1, 'nowhere.com')` → `fail`，`reasonCode: 'DNS_NXDOMAIN'`
  - 【引擎测试】关掉 `dnsPoison.enabled` 再 `visitSite(电脑1, 'www.google.com')` → `fail` 但 `reasonCode: 'GFW_IP_BLOCKED'`（DNS 正常，改由 IP 黑名单拦），`dns.poisoned` 非真
  - 【引擎测试】gfw 的 `enabled` 关掉 → `visitSite(电脑1, 'www.google.com')` `ok`，`dns.ip === '142.250.72.14'`、`poisoned` 非真
- **测试用例**：[T-CP4-020](../TEST-PLAN.md) – [T-CP4-026](../TEST-PLAN.md)

### CP4-S5 静态检查 L025–L028
- **做什么**：四条新规则与 L009 的补充触发条件
- **怎么做**：`lint/rules/` 下 `l025-overseas-plain-dns.ts`、`l026-blocked-no-proxy.ts`、`l028-border-bypassed.ts`（L027 在 S2 已做）；`l009-port-unlinked.ts` 补 gfw 分支；`lint/rules/index.ts` 注册
- **产出物**：L025、L026、L028、L009 扩展
- **验收标准**：
  - 【引擎测试】gfw-home 电脑1 改静态 DNS `8.8.8.8` → L025 warning，文案含「在境外」「会在边界被污染」，定位电脑1 字段 dns
  - 【引擎测试】同上但把 gfw 的 `dnsPoison.enabled` 关掉 → L025 不报
  - 【引擎测试】gfw-home 原样 → L026 报 4 条 warning（Google、YouTube、Telegram、ChatGPT），文案分别含「IP 黑名单」「域名黑名单」；GitHub 不在其中
  - 【引擎测试】把 gfw 从 gfw-home 里删掉、路由器 `wan` 直连互联网 → L028 warning 含「不经过长城防火墙」；再加第二台启用的 gfw → L028 另报「只有 长城防火墙1 生效」
  - 【引擎测试】断开 gfw 的 `outside` 连线 → L009 warning 含「outside 没有连线」
- **测试用例**：[T-CP4-027](../TEST-PLAN.md) – [T-CP4-031](../TEST-PLAN.md)

### CP4-S6 画布分区与防火墙节点
- **做什么**：7.1 的区带、7.2 的节点与落线串入、「按分区排布」
- **怎么做**：`canvas/zones/ZoneBands.tsx` 放进 `<ViewportPortal>` 最底层；`canvas/nodes/GfwNode.tsx` 与设备栏卡片、图标；`canvas/dropInsert.ts` 纯函数算落点最近的连线；`store/topology.ts` 加 `arrangeByZone()`；`InternetNode.tsx` 目标列表改双栏
- **产出物**：看得见的分区与防火墙节点
- **验收标准**：
  - 【页面操作】打开 gfw-home → 画布自上而下四条背景带，标签「互联网」「边界」「运营商」「内网」；互联网带里一条竖虚线，左「国内」右「境外」；缩放平移时带跟着一起变换
  - 【页面操作】互联网节点里目标分两栏，栏头「国内 4」「境外 6」；境外栏的 Google、YouTube、Telegram、ChatGPT 四行带锁标，GitHub 不带
  - 【页面操作】从设备栏把「长城防火墙」拖到画布空白处 → 新节点红棕描边，第二行 `IP 3 · 域名 4 · 污染 3`，`inside` 柄在底边、`outside` 在顶边
  - 【页面操作】先删掉 gfw，再把新的「长城防火墙」拖到 `wan – port1` 那根线上放下 → 原线消失，变成 `wan – inside`、`outside – port1` 两根线；撤销一次回到拖入前
  - 【页面操作】点工具栏「按分区排布」→ 四台设备分别落到互联网 / 边界 / 内网带里，运营商带留空；结果面板不出「拓扑已改动」横幅
  - 【网页测试】`nearestLinkAt(点, 连线几何)`：点在连线中点 → 返回该 linkId；距离 24px 外 → 返回 `null`；画布上没有连线 → `null`
- **测试用例**：[T-CP4-032](../TEST-PLAN.md) – [T-CP4-037](../TEST-PLAN.md)

### CP4-S7 防火墙表单与目标库编辑
- **做什么**：7.2 的表单、7.3 的目标表格
- **怎么做**：`panels/forms/GfwForm.tsx`、`panels/forms/TargetTable.tsx`；多行输入逐行校验复用 `validators.ts`；改动都走 `updateDevice` 进撤销栈
- **产出物**：规则集与目标库都能改
- **验收标准**：
  - 【页面操作】选中长城防火墙1 → 表单六个区块（启用 / IP 黑名单 / 域名黑名单 / DNS 污染 / HTTPS 握手域名拦截 / 协议识别等级）+「恢复默认规则」；协议识别等级默认「standard」，下方一行灰字说明
  - 【页面操作】关掉「启用」→ 下面区块置灰但内容还在；节点第二行变「已关闭」并转灰；再打开恢复
  - 【页面操作】IP 黑名单里加一行 `1.2.3` 后失焦 → 该行红字「不是合法的 IP 地址」，不写入；改成 `20.205.243.166` → 写入，右侧显示 `github.com`
  - 【页面操作】DNS 污染的域名列表清空 → 占位显示「留空则跟随域名黑名单」；此时验证 `chatgpt.com` → 失败原因由 SNI 拦截变成 DNS 污染
  - 【页面操作】点「恢复默认规则」并确认 → 三个列表回到默认；`Ctrl/Cmd + Z` 撤销回改动前
  - 【页面操作】互联网表单目标表：改 `github.com` 的区域为「国内」→ 节点左栏变 5 条；点「添加目标」新增一行填 `example.com` / `1.1.1.1` / 境外 → 验证弹窗域名下拉里出现它；点「恢复预设」回到 10 条
- **测试用例**：[T-CP4-038](../TEST-PLAN.md) – [T-CP4-043](../TEST-PLAN.md)

### CP4-S8 DNS 查询验证、文案与结果展示
- **做什么**：7.4 的验证入口、结果 DNS 块、短标签与解释模板
- **怎么做**：`toolbar/ProbeDialog.tsx` 加第四种类型；`panels/DeviceProbe.tsx` 加「DNS 查询」按钮；`panels/ProbeView.tsx` 加 DNS 块；`trace/reasonLabel.ts` 补三条；`trace/explain.ts` 加 `border` 分支与测试
- **产出物**：页面上能做 DNS 查询，边界那一跳有话可说
- **验收标准**：
  - 【网页测试】`reasonLabel` 对三个新 code → 「IP 被封」「域名被拦」「DNS 被污染」；对 `'X'` 仍是「验证终止」
  - 【网页测试】`explain` 对 `matched: 'poison'` 的 gfw decision → title `边界抢答，返回污染地址 243.185.187.39`，lines 含 `边界：出境，目标区域 境外` 与命中的域名；对 `enabled: false` → title `防火墙已关闭，直接放行`
  - 【网页测试】`explain` 对 `matched: 'sni'` 且 `verdict: 'stop'` 的 decision → title `域名被拦`，lines 首行等于 `decision.reason`；同时带 `basis.mac` 时仍走 border 模板
  - 【页面操作】工具栏「验证」→ 类型多出「DNS 查询」，选它后只剩起点与域名两项；起点 电脑1、域名 `www.google.com`、运行 → 结果面板 DNS 块置顶：服务器 `192.168.1.1`、解析到 `243.185.187.39`（红字 +「已污染」）、真实 `142.250.72.14`
  - 【页面操作】选中电脑1 → 验证块出现「DNS 查询」按钮，点它跑的域名与旁边「打开网站」下拉一致
  - 【页面操作】访问 `www.google.com` 失败后看逐跳列表 → 边界那两行 title 分别是「边界抢答，返回污染地址 243.185.187.39」与「DNS 被污染」；画布上包停在长城防火墙1 变红，气泡标题「DNS 被污染」，点「定位」跳到该设备的 DNS 污染区块
- **测试用例**：[T-CP4-044](../TEST-PLAN.md) – [T-CP4-049](../TEST-PLAN.md)

## 阶段完成标准

测试用例：[T-CP4-050](../TEST-PLAN.md) – [T-CP4-053](../TEST-PLAN.md)

在页面上按顺序做一遍，全部符合才算过。场景 1–3 对应总纲 CP4 的三条验收场景，每个场景在 `scenarios/cp4.test.ts` 有对应的引擎测试。

**场景 1：不加代理访问 Google 失败，原因正确**
1. 新建画布，拖入 电脑、路由器、长城防火墙、互联网。连 `eth0 – lan1`、`wan – inside`、`outside – port1`。电脑设自动获取，路由器 DHCP 与 NAT 保持默认开
2. 点「按分区排布」→ 四台设备各自落进内网 / 边界 / 互联网带
3. 选中电脑1，验证块「打开网站」选 `www.google.com`，运行 → 结论「电脑1 打开 www.google.com 失败」，原因「域名 www.google.com 的解析结果 243.185.187.39 是边界返回的污染地址，连不上」
4. DNS 块显示 服务器 `192.168.1.1`、解析到 `243.185.187.39`（红字 +「已污染」）、真实 `142.250.72.14`
5. 动画播完：DNS 阶段包走到 长城防火墙1 被抢答后原路返回，TCP 阶段包再到 长城防火墙1 变红；逐跳列表里这两行的 title 是「边界抢答，返回污染地址 243.185.187.39」与「DNS 被污染」
6. 同一台电脑改开 `github.com` → 通；改开 `chatgpt.com` → 失败，原因「HTTPS 握手里的域名 chatgpt.com 在边界的域名黑名单里，连接被重置」
7. 在验证块的目标框填 `142.250.72.14` 点 ping → 失败，原因「目标地址 142.250.72.14（www.google.com）在边界的 IP 黑名单里，包被丢弃」
8. 结果面板静态检查里有 4 条 L026 warning，点其中一条 → 选中 长城防火墙1 并高亮对应黑名单

**场景 2：关掉防火墙，同样的图访问 Google 成功**
1. 接场景 1。选中 长城防火墙1，关掉「启用」→ 节点转灰、第二行「已关闭」
2. 再开 `www.google.com` → 通。DNS 块显示 解析到 `142.250.72.14`，没有「已污染」标
3. 逐跳列表里长城防火墙1 两行 title 都是「防火墙已关闭，直接放行」
4. 静态检查里 L026 的 4 条 warning 消失
5. 把「启用」打开 → 重新验证，回到场景 1 第 3 步的结果

**场景 3：电脑 DNS 改成 8.8.8.8 明文查询，依然被污染**
1. 接场景 2 末（防火墙已开）。电脑1 改手动：IP `192.168.1.10`、掩码 `255.255.255.0`、网关 `192.168.1.1`、DNS `8.8.8.8`
2. 静态检查出现 L025 warning「DNS 服务器 8.8.8.8 在境外，明文查询会在边界被污染」，点它定位到电脑1 的 DNS 字段
3. 工具栏「验证」→ 类型「DNS 查询」，起点 电脑1，域名 `www.google.com`，运行 → 结论「电脑1 解析 www.google.com → 243.185.187.39（被污染，真实 142.250.72.14）」；逐跳里污染发生在 长城防火墙1，title「边界抢答，返回污染地址 243.185.187.39」
4. 再「打开网站」`www.google.com` → 仍然失败，原因仍是 DNS 被污染
5. 电脑1 的 DNS 改回 `192.168.1.1`，再做一次 DNS 查询 → 结果同样是 `243.185.187.39`，但污染那一跳落在 互联网 上，title「国内 DNS 向境外权威服务器递归时同样穿过边界，返回被污染的地址」。两条路径的结果一样、说法不同

**引擎与网页自动测试**
- 【命令】`pnpm test` → 引擎、网页两个包都通过；`scenarios/cp4.test.ts` 含上面三个场景的断言；`apps/web/src/trace/explain.test.ts` 含 border 模板断言

## 对其他检查点的约定

**给 CP5（VPS 与代理线路）**
1. **边界只看外层包**：判定入口是纯函数 `checkBorder(packet, config, region, direction)`，只吃一个 `PacketSummary`。CP5 做隧道封装时，交给它的必须是外层包——`dstIp` 是 VPS 的公网 IP、`sni` 是伪装域名。内层目标不经过这个函数，边界就自然「看不见」
2. **`PacketSummary.sni`** 只在 `proto: 'tcp'` 且 `dstPort: 443` 时写。CP5 的伪装域名写进同一个字段
3. **`regionOfIp(runtime, ip)`** 是判断「境内 / 境外」的唯一入口。CP5 的 VPS 设备带自己的区域字段时，在这个函数里加一个分支，不要另写一套
4. **`protocolDetection` 四档**（3.4）已定字段与含义，CP5 只补判定：命中时新增 reasonCode `GFW_PROTOCOL_BLOCKED`，短标签与 explain 模板按 CP3 约定 6、7 一起补
5. **L026 的触发条件留了「且拓扑里没有代理」这半句**，CP4 恒成立。CP5 加上代理后把这半句实现为真判断，规则编号不变
6. **`runtime.border` 唯一**：多台启用的 gfw 只有第一台生效并报 L028。CP5 的中转链路不要依赖第二台边界

**给 CP7（从外面进来）**
7. **入境方向同样过边界**：`direction: 'in'` 时 IP 黑名单比对的是源 IP。从境外设备访问家里的公网 IP，只要不在黑名单里就放行，失败原因该由端口转发或运营商内网给出
8. **`zonesOf` 只影响画布配色与排布**，任何判定都不许读它

**通用**
9. **拓扑 `version` 仍为 1**；新增字段全部可选，`gfw` 是新类型
10. **reasonCode 新增三条**（5.1）、**lint L025–L028**，后续从 L029 起
11. **`InternetTarget` 是所有外部地址的唯一来源**：任何需要「这个 IP 属于谁、在哪一侧」的判断都查目标库
12. **`ProbeResult.dns` 的 `poisoned`** 表示「答案被边界改过」，不是「解析失败」。被污染时 `verdict` 仍是 `ok`

## 待定问题

✅ 2026-09-05 统筹决定：第 1 条采纳，总纲 CP4 第一条措辞已改；第 2 条采纳（国内 DNS 的污染写在互联网设备的应答分支）；第 3 条按「放进去再报 lint」；其余按本文建议执行。


1. **对总纲的修改请求**：CP4 拆分步骤第一条写「设备落在哪个区决定它在哪一侧」。本文改为区带只做视觉参考、判定看包的实际路径（1.1）。理由：位置驱动语义与 CP3 4.2「位置变化不算拓扑改动」冲突，且拖错一下就静默改结果。请确认后改总纲
2. **电脑 DNS 仍是单个字符串**（CP1 待定 4）。演示「主备 DNS 一个境内一个境外」需要改数组并升 `version`，CP4 不做
3. **污染地址只有一个**。现实里 GFW 返回的假地址是一组轮换的，本文用单个 `poisonIp` 换取「看到这个地址就知道被污染了」的直观。是否要改成一组
4. **国内 DNS 的污染写在互联网设备上**（4.2 第二条），而不是边界设备上。好处是决策记录能说清「你问的是国内 DNS，它自己给了你假地址」，代价是互联网设备要读 `runtime.border`。是否接受这个耦合
5. **目标库 IP 是示意值**（CP1 待定 3）。本文的做法是表格下方加一行灰字说明，不加字段。是否需要一个「示意 / 真实」的标记列
6. **落线串入的判定阈值 24px** 是拍的。多设备密集时可能误串，是否要改成「拖到线上时线先高亮，松手才串入」
7. **协议识别四档的命名**（`off` / `basic` / `standard` / `strict`）与 CP5 协议风险三档的对应关系写在 3.4，CP5 定稿时可能要调整档位数量
8. **`reachable: false` 与「被封」是两件事**：前者是网站自己挂了（`TARGET_UNREACHABLE`），后者是边界拦的。界面上要不要在目标表里同时显示这两种状态
9. **多台防火墙**只有第一台生效。是否干脆在拖入第二台时直接拒绝，而不是放进去再报 lint
10. **测试用例编号**已在本文各步骤回填，测试表 `docs/TEST-PLAN.md` 的「CP4 分区与边界」一节与本文同期编写

## 关联文档

- 上一个检查点：[CP3-trace-and-animation.md](CP3-trace-and-animation.md)；数据结构依赖 [CP1-lan-basics.md](CP1-lan-basics.md)、[CP2-switching-and-devices.md](CP2-switching-and-devices.md)
- 下一个检查点：CP5 VPS 与代理线路（细化文档待写）
- 测试表：[../TEST-PLAN.md](../TEST-PLAN.md)
- 文档规范：[README.md](README.md)
