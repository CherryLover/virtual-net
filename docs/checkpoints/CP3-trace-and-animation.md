# CP3 路径追踪与动画

> 总纲对应章节：[ROADMAP.md](../../ROADMAP.md) 的「CP3 路径追踪与动画」
> 前置：CP1 局域网基础（决策记录 decision、ProbeResult、结果面板的逐跳列表）。CP2 的透明二层设备不是前置，但本检查点的动画要能容纳它们
> 状态：进行中（2026-09-05 开工，逻辑层与界面层两个 agent 并行）

## 目标

做完这个检查点，用户点「验证」之后不再只看到一行结论和一张静态列表：数据包会沿着网线一跳一跳地走，停在每台设备上；哪一跳失败，包就停在哪，设备变红，旁边说明原因。可以暂停、单步、调速、拖进度条到任意一跳。点任何一跳能看这个包的二层 / 三层 / 四层头，NAT 前后左右对照；每一跳都有一句人能读懂的解释：查了哪条路由、ARP 问到谁、NAT 映射成什么。另外多一种验证类型 traceroute，给出逐跳列表。

本检查点**不改引擎的模拟逻辑**。所有动画、包头、解释只读 CP1 定义的 `decision`，引擎侧唯一新增是 `traceroute` 入口。

## 范围

### 做
- 引擎：`traceroute(topology, { sourceDeviceId, targetIp })`，返回 `kind: 'traceroute'` 的 `ProbeResult`，附逐跳列表
- 网页：时间线模型（纯函数）、画布上的包标记与路径高亮、播放控件、逐跳列表升级为可交互时间线、包头查看、每跳解释文案、失败呈现、拓扑改动后的作废处理
- 网页侧引入 vitest，给纯函数写单元测试
- 容纳 CP2：交换机 / AP / 桥接光猫的到访各是一条 decision，动画照常停留、移动；VLAN 标签在包头里显示

### 不做
- 引擎模拟逻辑的任何改动：不加新 action、新 reasonCode，不模拟 ICMP time exceeded，不改 decision 字段
- ARP 请求 / 应答展开成独立往返（决定见关键设计 2.3）
- 同时播放多次验证、验证历史、动画录制导出
- 带宽 / 延迟 / 丢包的视觉化。移动速度只是节奏，不代表时延
- 网页侧组件级测试（testing-library）。本检查点只测纯函数
- 画布布局改动。CP0 的三栏结构不动，播放条是画布内悬浮层

## 关键设计

目录沿用 [CP0](CP0-project-skeleton.md)：引擎 `packages/engine/src/`，网页 `apps/web/src/`。本检查点在网页新增一个目录 `trace/`，只放**不依赖 React 的纯函数**（时间线、解释文案、包头对照），组件仍按 CP0 归属进 `canvas/` 与 `panels/`。理由见 2.5。

### 1 traceroute

#### 1.1 两种做法

| | A. 真模拟 TTL 递增 | B. 从一次 ping 的 decision 推出 |
| --- | --- | --- |
| 做法 | TTL 从 1 起逐轮发包，路由器减到 0 时回 ICMP time exceeded，收齐 n 轮得到 n 跳 | 跑一次 `ping`，把去程里每台**让 TTL 减 1 的设备**当作一跳 |
| 引擎改动 | 新增 initialTtl 参数、time exceeded 应答动作、回程的 NAT 会话匹配、多轮 decision 合并；轻易突破 32 条上限 | 零改动，只加一个派生函数 |
| 现实一致性 | 机制一致 | **输出一致**：真实 traceroute 打印的就是每跳入口接口的 IP。它多轮发包是为了在不知道路径时探测路径；本项目路径是确定的，多轮只会得到同一份结果 |
| 教学价值 | 能看到 TTL 减到 0 的过程 | TTL 在每跳的解释文案和包头里都能看到（64 → 63），只是不单独演 |
| 与动画的关系 | 多轮往返，动画很长且重复 | 与 ping 同一条时间线 |

**决定：B。** 本项目不模拟时延与丢包，A 多做的那些事在结果里看不出区别，却要碰 CP1 定死的引擎流程。真 TTL 模式记为待定问题 3。

#### 1.2 派生规则

`traceroute` 内部调用 `ping`，拿到同一份 `decisions`，然后：

1. 取去程：从 `seq = 1` 到第一条 `action = 'answer'`（含）或最后一条 `stop`（含）
2. 去程里除起点外，`packetIn.ttl > packetOut.ttl` 的设备记一跳（三层设备）；`action = 'answer'` 的设备记最后一跳（目标）；`verdict = 'stop'` 的设备无论类型都记最后一跳并标失败
3. TTL 不变的中间到访（CP2 的交换机 / AP / 桥接光猫，以及 CP1 B.4 路由器在网桥内做的二层转发）不成跳，归入下一跳的 `through`
4. 起点自己不算跳；停在起点时 `hops` 为空，原因在 `ProbeResult.reason`

**每跳字段 `Hop`**

| 字段 | 说明 |
| --- | --- |
| `hop` | 从 1 连续编号 |
| `deviceId` | 设备 |
| `ip` | 该跳应答用的地址：三层设备取 `portIn` 所属接口的地址（从 `buildRuntime` 接口表查），目标取 `targetIp`，停在二层设备时为 `null` |
| `ttlIn` | 包到达时的 TTL（`packetIn.ttl`） |
| `through` | 上一跳到本跳之间穿过的透明设备 `deviceId[]`，CP1 恒为空 |
| `seq` | 对应 decision 的 `seq`，点列表行跳到时间线用 |
| `status` | `'ok' \| 'stop'` |

结果：`kind: 'traceroute'`，`summary` 为「电脑1 → 8.8.8.8 共 2 跳」或「电脑1 → 8.8.8.8 第 1 跳失败」，`decisions` 与 ping 完全相同（动画照常播完整往返），新增 `hops: Hop[]`。`hops` 只有 traceroute 有，其他 kind 为 `null`，与 CP1 `dns` 字段只在 `visitSite` 有的做法一致。这是对 CP1 `ProbeResult` 的一处追加，见待定问题 1。`phase` 沿用 `'icmp'`，不使用 CP1 预留的 `'traceroute'` 值。

#### 1.3 结果面板显示

「最近验证」在 `kind = 'traceroute'` 时，逐跳时间线上方多一张表：`跳数 · 设备 · 地址 · TTL`，`through` 非空时该行下方灰字「经 交换机1」，失败行红。点某行 → 时间线跳到该 `seq`。

### 2 时间线模型

#### 2.1 从 decision 到片段

`buildTimeline(probe, revision): Timeline` 把 `probe.decisions` 按 `seq` 顺序摊成首尾相接的片段。

```ts
Timeline = { revision, totalMs, segments: Segment[], marks: Mark[] }
Segment = {
  index, seq, phase, kind: 'dwell' | 'travel' | 'gap',
  deviceId,                 // dwell / gap：停在哪；travel：从哪出发
  linkId?, toDeviceId?,     // travel 专用
  style: 'normal' | 'renew' | 'stop' | 'receive',
  startMs, endMs
}
Mark = { seq, atMs }        // 每条 decision 一个刻度，指向它的 dwell 起点
```

一条 decision 产生的片段，按 `action` 与 `verdict`：

| 情况 | 片段 | 说明 |
| --- | --- | --- |
| `originate`，`packetIn` 为空（起点发出） | dwell(normal) → travel | 包从设备中心出现，停留后沿 `linkId` 移到对端 |
| `originate`，`packetIn` 非空（路由器转发 DNS，包在中间设备重新出发） | dwell(renew) → travel | 停留时标记闪一次「新包」样式：原包被吃掉，新包从这里出发。包头查看里左右两列几乎全变 |
| `forward`，`verdict: 'pass'` | dwell(normal) → travel | 含 NAT 入向后继续转发的情况：同一条 decision 既进又出，只画一次停留一次移动，停留标签「NAT 还原」 |
| `answer` | dwell(normal) → travel | 目标应答，包掉头 |
| `receive` | dwell(receive) | 起点收到，无 travel。若后面还有另一个 `phase` → 追加 gap |
| 任何 `verdict: 'stop'` | dwell(stop) | 无 travel，时间线到此为止 |

travel 的 `toDeviceId` 取连线另一端的设备。正常情况下它等于下一条 decision 的 `deviceId`，不等时以连线为准并记控制台警告（说明引擎数据与拓扑不符，测试要覆盖这条断言）。

**基准时长（1×）**：dwell 700 ms，renew 900 ms，receive 500 ms，stop 1200 ms，travel 900 ms，gap 600 ms。CP1 场景 1 的 ping 8.8.8.8 共 5 条 decision，约 7 s；访问网站两阶段约 15 s。**上限**：CP1 已定一次验证最多 32 条 decision，按基准最长约 50 s；`totalMs` 超过 30 000 时所有片段等比例缩短到恰好 30 s。速度 0.5× / 2× 只改播放时钟，不改 `Timeline`。

#### 2.2 phase 切换

`dns → tcp`：DNS 阶段最后一条是起点 `receive`，其后插入一个 gap 片段停在起点，标记从「DNS」换成「连接」颜色与文字。进度条在 gap 处画一道分隔线并写阶段名；逐跳列表沿用 CP1 的分组标题「DNS」「连接」。`phase` 到中文的映射：`icmp → ping`、`dns → DNS`、`tcp → 连接`，未知值原样显示，CP4 起新增阶段不需要改这里。

#### 2.3 ARP 不展开

回答 CP1 待定问题 5：**不把 ARP 请求 / 应答画成独立往返。** 理由：每次验证从空 ARP 表开始，展开的话每一跳前都多一对来回，5 条 decision 的 ping 变成十几段，主线被淹没；现实里 ping / traceroute 的输出也不显示 ARP；`basis.arp` 已经记了查谁、结果是什么，信息没丢。

ARP 结果在三处可见：该跳的解释文案（「ARP：192.168.1.1 → 02:00:00:00:00:03」）、包头查看的二层区（目的 MAC 就是 ARP 结果）、`ARP_MISS` 失败时的原因气泡。是否加一个「显示 ARP」开关列为待定问题 2。

#### 2.4 失败与重复到访

- **失败**：时间线以 `stop` 的 dwell 结束，包标记变红停在该设备不再移动；设备节点加红色描边；节点旁气泡显示短标签 + CP1 的 `reason` 全文 + 「定位」按钮（按 `fixAt`）。走过的连线加高亮色、到访过的节点带序号角标；没走到的连线与节点保持默认样式
- **短标签**：`reasonCode → 短标签` 映射放 `trace/reasonLabel.ts`，如 `GATEWAY_OFF_SUBNET → 网关不可达`、`ARP_MISS → ARP 无应答`、`NO_RETURN_ROUTE → 无法回程`、`NO_ROUTE → 没有路由`、`NO_IP → 没有地址`、`DNS_NXDOMAIN → 域名不存在`。表里没有的 code 显示「验证终止」。总纲场景 2 要的「网关不可达」由此而来，CP1 的长文案作正文
- **重复到访**（去程和回程都经过路由器）：节点角标列出该设备所有 decision 的 `seq`，如 `2 · 4`，当前播到的那个实心；包标记本身也带当前 `seq`。逐跳列表里两次到访是两行，不合并

#### 2.5 放在网页，不放引擎

时间线是**表现层**的东西：片段时长、样式、阶段分隔都是为动画服务的，CP4–CP7 的引擎工作不需要它。CP1 约定第 5 条也说「CP3 只读 decision，不需要引擎再吐别的东西」。所以 `buildTimeline`、解释文案、包头对照都放 `apps/web/src/trace/`，写成不 import React 的纯 TypeScript，用 vitest 测。网页侧目前没有测试框架，本检查点补上（见 4.4）。

引擎侧只加 `traceroute`：它是验证入口，要查接口表拿每跳地址，属于引擎职责。

### 3 界面

#### 3.1 画布上的包

**载体**：不用 React Flow 自定义 edge 里的 `<animateMotion>`，用 `@xyflow/react` 的 `<ViewportPortal>` 在画布坐标系里放**一个**叠加层 `canvas/trace/PacketMarker.tsx`。理由：
- 只有一个包标记，位置由 store 里的一个时钟值决定，暂停 / 单步 / 拖进度条都是改这个值，不用去控制多条 edge 各自的 SVG 动画
- 包停在设备上时不属于任何 edge，叠加层能画，edge 里画不了
- `ViewportPortal` 跟随画布变换，平移、缩放时不用自己算屏幕坐标

**位置计算**（每帧一次，`requestAnimationFrame`）：
- dwell / gap：设备节点中心（节点 `position` + 节点宽高 / 2，从 React Flow `useNodes` 拿测量后的尺寸）
- travel：找到 `linkId` 对应的 edge 元素 `.react-flow__edge[data-id="<linkId>"] path.react-flow__edge-path`，用 `getPointAtLength(t × getTotalLength())` 取点。方向：edge 的 `source` 等于本片段 `deviceId` 时 `t` 从 0 到 1，否则从 1 到 0。以 edge 对象的 `source` 字段为准，不假设 `link.a` 一定是 source
- 取的是**实际画出来的那条线**，所以 CP2 交换机 8 口线再多也不会串：每根 link 是独立 edge，id 就是 `linkId`
- 不缓存路径长度，每帧一次 DOM 查询一次取点，一个包的开销可以忽略

**样式**：圆点 + 阶段色（ping 蓝、DNS 紫、连接绿），点上写 `seq`；renew 时外圈闪一次；stop 时变红并停住。到访过的节点角标与走过的 edge 高亮通过 store 派生的 `className`（`trace-visited`、`trace-walked`、`trace-active`、`trace-stopped`）挂到 nodes / edges 上，`Canvas` 组装 nodes / edges 时读 `trace` slice 合成。

#### 3.2 播放条

放在**画布底部悬浮**（React Flow `<Panel position="bottom-center">`，`canvas/trace/PlaybackBar.tsx`），不放工具栏下方也不放结果面板顶部。理由：结果面板会在用户点设备时切成配置表单，控件跟着消失；工具栏是全局操作区，与某次验证无关；画布底部离包最近，且不动 CP0 的栅格。

内容一行：`⏮ 上一跳` `▶ / ⏸` `⏭ 下一跳` · 进度条（宽度占满剩余，每条 decision 一个刻度，阶段分隔处一道竖线，可点、可拖到任意位置） · 速度 `0.5× 1× 2×` · `✕`（清除动画，保留结果）。只在 `trace.timeline` 存在且未作废时显示。
- 单步：跳到上一 / 下一个 `Mark.atMs` 并暂停
- 拖进度条：按住时暂停，松手停在该位置不自动续播
- 快捷键（焦点不在输入框时）：空格 播放 / 暂停，`←` `→` 单步
- 验证运行完自动从头播放一次；播完停在末尾

#### 3.3 逐跳列表与同步

CP1 的「最近验证」逐跳列表在本检查点升级为时间线列表（`panels/ResultsPanel.tsx` 内部的 `HopList` 拆成独立组件 `panels/trace/HopList.tsx`）。**改动范围**：列表行结构、点击行为、与 store `trace` slice 的双向绑定；「静态检查」段、`summary` / `reason` / `path` 头部、「定位」按钮不变。

每行：`seq` · 设备名 · 动作中文（发出 / 转发 / 应答 / 收到 / 重新发出）· 一句解释（3.5 生成）· 右侧 `包头` 小按钮。`stop` 行红底。分组标题沿用 CP1 的阶段分组。

同步规则：
- 当前 `seq` 行高亮（背景色），随播放推进；行不在可视区时 `scrollIntoView({ block: 'nearest' })`
- 点某行 → 时间线跳到该 `seq` 的 dwell 起点并暂停，画布包标记立即移到该设备。**不再选中设备**（CP1 点行会选中，会把面板切走）；行尾有 `定位` 图标，点它才选中设备并居中
- 播放中用户点画布节点 → 面板切到配置表单，播放继续、包标记不消失；点空白回到结果面板时高亮行与进度一致

#### 3.4 包头查看

入口：逐跳行的 `包头` 按钮、画布上点包标记、点节点角标里的某个 `seq`。打开居中模态框 `panels/trace/PacketInspector.tsx`（右侧面板 320 px 放不下左右两列）。标题「第 n 跳 · 设备名 · 动作」，上一跳 / 下一跳按钮切换，`Esc` 关闭，打开时播放暂停。

正文两列 **进** / **出**（`packetIn` / `packetOut`），一侧为空时只显示另一列：

| 分区 | 字段 | 来源 |
| --- | --- | --- |
| 二层 | 源 MAC、目的 MAC | `srcMac` `dstMac` |
| 三层 | 源 IP、目的 IP、TTL | `srcIp` `dstIp` `ttl` |
| 四层 | 协议；ICMP 时 类型 + id，TCP / UDP 时 源端口 + 目的端口 | `proto` `l4.*` |
| VLAN | 标签 id；两侧都是 `null` 时整区不显示 | `vlan`（CP2 起非空） |

两列都存在时逐字段比较，值不同的单元格加高亮底色。NAT 出向那一跳看到源 IP、源端口变；NAT 入向看到目的 IP、目的端口变；每个转发跳 TTL 都变；MAC 每跳都变。renew 那一跳几乎全变，顶部一行说明「路由器以自己的地址重新发起查询」。

对照逻辑 `diffPacket(packetIn, packetOut): ChangedField[]` 是纯函数，放 `trace/packetDiff.ts`，可测。

#### 3.5 每一跳的解释文案

`explain(decision, names): { title: string; lines: string[] }` 放 `trace/explain.ts`。`names` 提供 `deviceId → 名称`、`portId → 端口名`。`title` 用在逐跳行，`lines` 用在行展开与气泡。规则：

**title 按 action**

| action | title |
| --- | --- |
| `originate`，无 `packetIn` | `从 {portOut} 发出` |
| `originate`，有 `packetIn`，`basis.dns` 非空 | `作为 DNS 转发器，向上游 {upstream} 重新发起查询` |
| `forward`，`basis.nat.direction = 'out'` | `转发并做 NAT，从 {portOut} 发出` |
| `forward`，`basis.nat.direction = 'in'` | `NAT 还原后转发，从 {portOut} 发出` |
| `forward`，`basis.route` 非空、无 NAT | `按路由转发，从 {portOut} 发出` |
| `forward`，`basis.route` 为空（CP2 二层设备、CP1 路由器网桥内二层转发） | 取 `basis.mac` 生成（见约定）；没有 `basis.mac` 则用 `note`（CP1 为「二层转发，未路由」） |
| `answer`，`phase = 'icmp'` | `收到 ping 请求，应答` |
| `answer`，`basis.dns` 非空 | `DNS 应答：{domain} = {answer}` |
| `answer`，`phase = 'tcp'` | `接受 TCP 443 连接` |
| `receive` | `收到应答，结束`；DNS 阶段为 `收到 DNS 应答，{domain} = {ip}` |
| 任何 `stop` | 短标签（2.4），`lines` 首行放 `reason` 全文 |

**lines 按 basis 逐项追加**，为空的项跳过：
- `basis.route`：`查路由表：命中 {dest}/{prefix}，{via ? "下一跳 " + via : "直连"}，从 {iface} 发出`。默认路由写作 `命中默认路由 0.0.0.0/0，下一跳 192.168.1.1，从 eth0 发出`
- `basis.arp`：命中 `ARP：{ip} → {mac}`；未命中 `ARP：{ip} 无应答`
- `basis.nat`：出向 `NAT：{before.ip}:{before.port} → {after.ip}:{after.port}`；入向 `NAT 还原：{before.ip}:{before.port} → {after.ip}:{after.port}`
- `basis.dns`：`DNS 转发：{domain} → 上游 {upstream}` 或 `DNS 应答：{domain} = {answer}`
- TTL 变化（`packetIn` 与 `packetOut` 都有且不同）：`TTL {in} → {out}`
- 最后追加 `note`（若与以上任何一行重复则省略）

`basis` 里出现未知键（CP5 的 `tunnel` 等）时不报错，只输出 `note`。CP1 结果面板原来直接显示 `note` 的地方，本检查点全部改为 `explain().title`。

### 4 数据流

#### 4.1 store 新增 `trace` slice（`store/trace.ts`）

```ts
trace: {
  timeline: Timeline | null,   // buildTimeline(lastProbe, topologyRevision)
  cursorMs: number,            // 时间线上的位置，1× 时钟
  playing: boolean,
  speed: 0.5 | 1 | 2,
  stale: boolean,              // 拓扑改动后为 true
  inspectorSeq: number | null  // 包头查看打开的是哪一跳
}
lastProbeRequest: { kind, sourceDeviceId, targetIp?, domain? } | null   // 「重新验证」用
topologyRevision: number       // 设备、连线、config 任一变化 +1；position、viewport、name 变化不加
```

- `lastProbe` 写入的同时调用 `buildTimeline`，重置 `cursorMs = 0`、`playing = true`、`stale = false`
- 播放时钟：`canvas/trace/usePlayback.ts` 用 `requestAnimationFrame` 每帧 `cursorMs += dt × speed`，到 `totalMs` 停。只有 `cursorMs` 一个数字每帧变化，组件用 selector 订阅，列表行只在派生的当前 `seq` 变化时重渲染
- 派生：`currentSegment = segmentAt(timeline, cursorMs)`，`currentSeq = currentSegment.seq`，`visitedSeqs`、`walkedLinkIds` 由 `cursorMs` 之前的片段算出

#### 4.2 拓扑一变

`topologyRevision` 变化且 `trace.timeline.revision` 不等 → `stale = true`、`playing = false`。画布上包标记、节点角标、连线高亮全部撤掉；播放条隐藏；结果面板「最近验证」段顶部出一条横幅「拓扑已改动，结果可能失效」+ 按钮 `重新验证`。列表仍可读但变灰，点行不再驱动画布。`重新验证` 用 `lastProbeRequest` 重跑；起点设备已被删除时按钮禁用，横幅改为「起点设备已删除」。

改设备位置不算拓扑改动，包标记跟着节点走。

#### 4.3 decision 里的设备在画布上找不到

删除设备必然使 `topologyRevision` 变化，正常路径被 4.2 覆盖。作为兜底，`PacketMarker` 每帧找不到 `deviceId` 对应的节点或 `linkId` 对应的 edge 时：不画标记、把 `stale` 置 true、控制台一条警告。不抛异常，不白屏。

#### 4.4 网页侧测试

`apps/web` 加 devDependency `vitest`（版本随引擎走 catalog），`vite.config.ts` 里 `test.environment: 'node'`、`test.include: ['src/**/*.test.ts']`，脚本 `test: vitest run`。CP0 约定「有测试就叫 test」，根 `pnpm test` 自动带上。只测 `trace/` 与 `store/trace.ts` 的纯逻辑，不测组件，不引 jsdom / testing-library（CP0 待定问题 4 的后半部分留给以后）。文档里这类用例标【网页测试】。

### 5 性能与边界

- decision 上限 32（CP1 TTL 上限）；时间线 1× 上限 30 s（2.1）；片段数最多 32 dwell + 31 travel + 2 gap
- 每帧工作量：一次 `segmentAt`（二分或线性，65 个片段以内线性即可）、一次 DOM 查询、一次 `getPointAtLength`
- 画布平移、缩放：标记在 `ViewportPortal` 内，跟随变换，不做任何事；窗口缩放：画布坐标不变，同样不做事；拖动节点：edge 路径重画，下一帧取点自然更新
- 播放中切到配置表单再切回：`cursorMs` 一直在走，回来时列表按当前位置高亮
- 多次连续点「验证」：新结果直接替换旧时间线，旧标记消失
- 页面刷新：CP1 不保存验证结果，`trace` 随之为空，不做持久化

## 步骤

### CP3-S1 traceroute 引擎入口
- **做什么**：实现 1.2 的派生规则，导出第六个入口 `traceroute`
- **怎么做**：`engine/sim/traceroute.ts`：调 `ping` → 截去程 → 按 TTL 变化识别跳 → 用 `buildRuntime` 接口表查每跳 `ip` → 组 `hops` 与 `summary`；`model/` 里 `ProbeResult` 加 `kind: 'traceroute'` 与 `hops: Hop[] | null`；`index.ts` 导出；`scenarios/cp3.test.ts` 放场景测试
- **产出物**：`traceroute` 入口、`Hop` 类型、测试
- **验收标准**：
  - 【引擎测试】CP1 fixture 拓扑，`traceroute(电脑1, '8.8.8.8')` → `verdict: 'ok'`，`hops` 两条：`{ hop: 1, 路由器1, ip: '192.168.1.1', ttlIn: 64, through: [] }`、`{ hop: 2, 互联网, ip: '8.8.8.8', ttlIn: 63 }`；`decisions` 与 `ping` 同参数结果深等于；`summary` 为「电脑1 → 8.8.8.8 共 2 跳」
  - 【引擎测试】`traceroute(电脑1, '192.168.1.1')` → 一跳，`ip: '192.168.1.1'`，`ttlIn: 64`
  - 【引擎测试】断开 `wan` 连线再 traceroute `8.8.8.8` → `fail`，`hops` 一条 `{ hop: 1, 路由器1, status: 'stop' }`，`reasonCode: NO_ROUTE`，`summary` 含「第 1 跳失败」
  - 【引擎测试】电脑1 手动网关 `10.0.0.1` → `fail`，`hops` 为空数组，`reasonCode: GATEWAY_OFF_SUBNET`
  - 【引擎测试】构造一条去程里含 TTL 不变的中间 decision（模拟 CP2 交换机，手工拼 decisions 传给派生函数）→ 该设备不成跳，出现在下一跳的 `through`
  - 【引擎测试】`ping` / `visitSite` 结果的 `hops` 为 `null`
- **测试用例**：[T-CP3-001](../TEST-PLAN.md) – [T-CP3-006](../TEST-PLAN.md)

### CP3-S2 网页测试框架与时间线模型
- **做什么**：给 `apps/web` 装 vitest；实现 `buildTimeline`、`segmentAt`、`seekToSeq`
- **怎么做**：按 4.4 配置 vitest；`trace/timeline.ts` 按 2.1 的表生成片段，`trace/durations.ts` 放基准时长与 30 s 上限；测试用 CP1 fixture 跑引擎拿真实 `ProbeResult`（web 可 import engine），另手工拼几份边界 decisions
- **产出物**：`apps/web` 的 `test` 脚本；`trace/timeline.ts` 及测试
- **验收标准**：
  - 【命令】根目录 `pnpm test` → 引擎与网页两个包的测试都跑，退出码 0
  - 【网页测试】fixture ping `8.8.8.8` 的结果 → 5 个 dwell、4 个 travel、0 个 gap；片段首尾相接（每段 `startMs` 等于上一段 `endMs`），首段 0 起，末段 `endMs === totalMs`；`marks` 长 5 且每个 `atMs` 等于对应 dwell 的 `startMs`
  - 【网页测试】每个 travel 的 `toDeviceId` 等于下一条 decision 的 `deviceId`；`linkId` 等于该 decision 的 `linkId`
  - 【网页测试】fixture `visitSite('www.google.com')` → 恰好 1 个 gap，位于 `phase` 从 `dns` 变 `tcp` 的两个 dwell 之间，`deviceId` 为电脑1
  - 【网页测试】路由器 DNS 转发那条 `originate`（`packetIn` 非空）→ dwell `style: 'renew'`；起点 `originate` → `style: 'normal'`
  - 【网页测试】网关配错的失败结果 → 仅 1 个 dwell，`style: 'stop'`，无 travel；NAT 关闭的失败 → 3 个 dwell、2 个 travel，末段 `stop`
  - 【网页测试】手工拼 32 条 decision 的结果 → `totalMs === 30000`，各片段比例与基准一致
  - 【网页测试】`segmentAt(t, 0)` 是首段；`segmentAt(t, totalMs)` 是末段；`seekToSeq(t, 3)` 返回第 3 条的 dwell 起点
  - 【网页测试】travel 对端与下一条 `deviceId` 不一致的手工数据 → 以连线为准，返回结果带 `warnings[]`，不抛错
- **测试用例**：[T-CP3-007](../TEST-PLAN.md) – [T-CP3-015](../TEST-PLAN.md)

### CP3-S3 动画状态与画布包标记
- **做什么**：`trace` slice、播放时钟、画布上的包与路径高亮
- **怎么做**：`store/trace.ts` 按 4.1；`lastProbe` 写入时构建时间线；`canvas/trace/usePlayback.ts` 的 rAF 时钟；`canvas/trace/PacketMarker.tsx` 放进 `<ViewportPortal>`，按 3.1 取点；`Canvas.tsx` 组装 nodes / edges 时合成 `className`；节点组件加角标插槽显示 `seq` 列表；`app.css` 加 `trace-*` 样式
- **产出物**：验证后包自动沿线走一遍
- **验收标准**：
  - 【页面操作】fixture 图，验证 ping `8.8.8.8` → 弹窗关闭后蓝色圆点从电脑1 出现，停一下，沿 `eth0 – lan1` 线移到路由器1，停，沿 `wan – port1` 到互联网，停，再原路返回电脑1，最后停住不动；全程约 7 s
  - 【页面操作】播放中拖动路由器1 节点 → 圆点跟着新的线走，不跳到旧位置
  - 【页面操作】播放中滚轮缩放、拖空白平移 → 圆点始终贴在线上或节点中心
  - 【页面操作】播完后路由器1 角标显示 `2 · 4`，电脑1 `1 · 5`，互联网 `3`；两根线都是高亮色
  - 【页面操作】验证 ping `192.168.1.1` → 只走一根线来回；上一次的角标和高亮先清掉
  - 【网页测试】`store` 收到 `lastProbe` 后 `trace.timeline` 非空、`cursorMs === 0`、`playing === true`
- **测试用例**：[T-CP3-016](../TEST-PLAN.md) – [T-CP3-021](../TEST-PLAN.md)

### CP3-S4 播放控件
- **做什么**：3.2 的播放条与快捷键
- **怎么做**：`canvas/trace/PlaybackBar.tsx`（React Flow `<Panel position="bottom-center">`）；进度条用 `<input type="range">` 或自绘，刻度按 `marks` 定位，gap 处画分隔线；键盘监听挂在 `Canvas` 容器，输入框有焦点时忽略
- **产出物**：播放 / 暂停 / 单步 / 调速 / 拖进度
- **验收标准**：
  - 【页面操作】验证 ping `8.8.8.8` → 画布底部出现播放条，进度条上 5 个刻度，播放中滑块前进；播完按钮变回 ▶
  - 【页面操作】点 ⏸ → 圆点停住；再点 ▶ → 从停的位置继续
  - 【页面操作】滑块拖到最左并暂停，点 ⏭ 三次 → 圆点依次停在路由器1、互联网、路由器1（回程）的中心；点 ⏮ 一次 → 回到互联网
  - 【页面操作】速度切 2× → 整趟约 3.5 s；0.5× → 约 14 s
  - 【页面操作】把滑块拖到进度条中段松手 → 圆点停在对应位置，不自动播放；拖到最右 → 圆点停在电脑1，与播完状态一致
  - 【页面操作】点画布空白后按空格 → 播放 / 暂停切换；`→` `←` 单步；在配置面板输入框里按空格 → 只输入空格
  - 【页面操作】点 ✕ → 圆点、角标、高亮消失，播放条隐藏，结果面板的结论与列表仍在
  - 【页面操作】访问网站 `www.google.com` → 进度条中间一道分隔线，左段紫色、右段绿色；圆点过分隔线时在电脑1 上停一下并换色
- **测试用例**：[T-CP3-022](../TEST-PLAN.md) – [T-CP3-029](../TEST-PLAN.md)

### CP3-S5 逐跳列表与同步
- **做什么**：3.3 的时间线列表；traceroute 的跳数表（1.3）
- **怎么做**：`panels/trace/HopList.tsx` 从 `ResultsPanel` 拆出；行 title 暂用 `note`，S7 换成 `explain().title`；`panels/trace/HopTable.tsx` 渲染 `hops`；工具栏「验证」弹窗类型下拉加 `traceroute`（目标填 IP，与 ping 同一套输入）
- **产出物**：可交互的逐跳列表；页面上能发起 traceroute
- **验收标准**：
  - 【页面操作】验证 ping `8.8.8.8` 播放中 → 列表高亮行随圆点推进：圆点在路由器1 时第 2 行亮，回程到路由器1 时第 4 行亮
  - 【页面操作】暂停后点第 3 行 → 圆点跳到互联网中心，第 3 行亮，设备未被选中、面板仍是结果面板；点该行行尾的定位图标 → 互联网选中并居中
  - 【页面操作】把浏览器窗口压矮到列表出滚动条，从头播放 → 高亮行始终在可视区内
  - 【页面操作】播放中点路由器1 节点 → 面板切到配置表单，圆点继续走；点空白回到结果面板 → 高亮行与圆点位置一致
  - 【页面操作】验证类型选 traceroute，起点 电脑1，目标 `8.8.8.8` → 结论「电脑1 → 8.8.8.8 共 2 跳」，跳数表两行 `1 路由器1 192.168.1.1 64`、`2 互联网 8.8.8.8 63`，下方逐跳列表与 ping 相同 5 行；点跳数表第 1 行 → 圆点到路由器1
  - 【页面操作】断开 `wan` 线再 traceroute → 跳数表一行红 `1 路由器1`，结论含「第 1 跳失败」
- **测试用例**：[T-CP3-030](../TEST-PLAN.md) – [T-CP3-035](../TEST-PLAN.md)

### CP3-S6 包头查看
- **做什么**：3.4 的模态框与字段对照
- **怎么做**：`trace/packetDiff.ts`（纯函数）；`panels/trace/PacketInspector.tsx`；`trace.inspectorSeq` 驱动打开与切换；入口三处（列表行按钮、包标记、节点角标）
- **产出物**：任何一跳都能看进出两列包头
- **验收标准**：
  - 【网页测试】`diffPacket` 对 fixture NAT 出向那一跳的 `packetIn` / `packetOut` → 返回 `['srcMac', 'dstMac', 'srcIp', 'ttl']`，不含 `dstIp`、`l4.icmpId`（echo id 未被占用时不变）；两侧相同的包 → 空数组；一侧为 `null` → 空数组
  - 【页面操作】fixture 图 ping `8.8.8.8`，点第 2 行「包头」→ 模态框标题「第 2 跳 · 路由器1 · 转发」；三层区左列源 IP `192.168.1.100`、右列 `203.0.113.2` 高亮；TTL 左 64 右 63 高亮；四层区协议 ICMP、类型 请求、id 左右都是 1（未被占用时不变）；VLAN 区不显示
  - 【页面操作】点「下一跳」→ 第 3 跳 互联网 · 应答，左列目的 IP `8.8.8.8`、右列源 IP `8.8.8.8`，类型 请求 → 应答；再下一跳 → 第 4 跳 NAT 还原，右列目的 IP `192.168.1.100` 高亮
  - 【页面操作】点第 1 行「包头」→ 只有「出」一列；点第 5 行 → 只有「进」一列
  - 【页面操作】访问网站，打开 DNS 阶段路由器1 的「重新发出」那一跳 → 顶部一行「路由器以自己的地址重新发起查询」，源 IP、目的 IP、源端口、MAC 全部高亮
  - 【页面操作】打开模态框时圆点停住；`Esc` 关闭；点画布上的圆点 → 打开当前 `seq` 的包头
- **测试用例**：[T-CP3-036](../TEST-PLAN.md) – [T-CP3-041](../TEST-PLAN.md)

### CP3-S7 解释文案
- **做什么**：3.5 的 `explain` 与 2.4 的 `reasonLabel`
- **怎么做**：`trace/explain.ts`、`trace/reasonLabel.ts`；`HopList` 行 title 换成 `explain().title`，行可展开显示 `lines`；`PacketInspector` 底部也显示 `lines`
- **产出物**：每一跳一句话 + 若干依据行
- **验收标准**：
  - 【网页测试】fixture ping `8.8.8.8` 的 5 条 decision 依次 → title：`从 eth0 发出`、`转发并做 NAT，从 wan 发出`、`收到 ping 请求，应答`、`NAT 还原后转发，从 lan1 发出`、`收到应答，结束`
  - 【网页测试】第 1 条 lines 含 `查路由表：命中默认路由 0.0.0.0/0，下一跳 192.168.1.1，从 eth0 发出` 与 `ARP：192.168.1.1 → 02:00:00:00:00:03`；第 2 条 lines 含 `NAT：192.168.1.100:1 → 203.0.113.2:1` 与 `TTL 64 → 63`
  - 【网页测试】网关配错的 stop decision → title `网关不可达`，lines 首行等于 decision.reason；未知 `reasonCode: 'X'` → title `验证终止`
  - 【网页测试】DNS 阶段路由器 `originate` → title `作为 DNS 转发器，向上游 8.8.8.8 重新发起查询`，lines 含 `DNS 转发：www.google.com → 上游 8.8.8.8`
  - 【网页测试】手工拼 `basis: { route: null, arp: …, tunnel: {…} }` 的 forward → 不抛错，title 回落为 `note`
  - 【页面操作】结果面板逐跳列表每行显示上述 title；点行首 ▸ 展开看到 lines
- **测试用例**：[T-CP3-042](../TEST-PLAN.md) – [T-CP3-047](../TEST-PLAN.md)

### CP3-S8 失败呈现与作废处理
- **做什么**：2.4 的失败样式与气泡；4.2 / 4.3 的作废
- **怎么做**：`canvas/trace/StopBubble.tsx` 放在 `<ViewportPortal>` 里贴近节点；节点 `trace-stopped` 样式；`topologyRevision` 计数与 `stale` 判定；`ResultsPanel` 横幅与「重新验证」；`PacketMarker` 兜底
- **产出物**：失败看得见、改图后不会误导
- **验收标准**：
  - 【页面操作】CP1 场景 2（电脑1 网关 `10.0.0.1`）ping `8.8.8.8` → 圆点在电脑1 上变红不动；电脑1 红描边；气泡标题「网关不可达」，正文「网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关」，按钮「定位」；两根线都是默认样式；进度条只有 1 个刻度
  - 【页面操作】点气泡「定位」→ 电脑1 选中，网关字段高亮
  - 【页面操作】CP1 场景 3（NAT 关）ping `8.8.8.8` → 圆点走到互联网变红；互联网红描边；`eth0 – lan1`、`wan – port1` 高亮；气泡标题「无法回程」，「定位」跳到路由器1 的 NAT 开关
  - 【页面操作】播放中把路由器1 的 DHCP 关掉 → 圆点、角标、高亮立即消失，播放条隐藏；结果面板顶部横幅「拓扑已改动，结果可能失效」+「重新验证」；点「重新验证」→ 重跑同一 ping，新结果播放
  - 【页面操作】播放中拖动电脑1 位置 → 不出横幅，动画继续
  - 【页面操作】播放中删除互联网节点 → 横幅出现，无控制台报错；再删电脑1 → 「重新验证」禁用，横幅「起点设备已删除」
  - 【网页测试】`topologyRevision` 变化后 `trace.stale === true`、`playing === false`；`position` 变化不改 `stale`
- **测试用例**：[T-CP3-048](../TEST-PLAN.md) – [T-CP3-054](../TEST-PLAN.md)

## 阶段完成标准

测试用例：[T-CP3-055](../TEST-PLAN.md) – [T-CP3-058](../TEST-PLAN.md)

以下在页面上按顺序做一遍，全部符合才算过。场景 1、2 对应总纲 CP3 的两条验收场景，场景 3 是本文补的 traceroute；每个场景在 `scenarios/cp3.test.ts` 有对应的引擎测试（traceroute 部分）与 `apps/web/src/trace/*.test.ts` 的网页测试（时间线、文案部分）。

**场景 1：ping 8.8.8.8 逐跳播放，路由器那一跳显示 NAT 前后地址**
1. 按 CP1 场景 1 搭好图（电脑1 自动获取、路由器1 DHCP 与 NAT 开、两根线）
2. 「验证」ping，起点 电脑1，目标 `8.8.8.8`，运行 → 弹窗关闭，画布底部出现播放条，蓝色圆点从电脑1 出发，依次停 路由器1 → 互联网 → 路由器1 → 电脑1，两根线变高亮，约 7 s 播完
3. 结果面板逐跳 5 行，title 依次「从 eth0 发出」「转发并做 NAT，从 wan 发出」「收到 ping 请求，应答」「NAT 还原后转发，从 lan1 发出」「收到应答，结束」；播放中高亮行跟着圆点走
4. 点 ⏸，点 ⏭ 到第 2 跳，点该行「包头」→ 模态框左列源 IP `192.168.1.100`、右列 `203.0.113.2`，两格高亮；TTL `64` → `63` 高亮；展开该行看到「NAT：192.168.1.100:1 → 203.0.113.2:1」
5. 「下一跳」两次到第 4 跳 → 右列目的 IP `192.168.1.100` 高亮，title「NAT 还原后转发」
6. 关闭模态框，速度 2×，▶ → 约 3.5 s 播完；路由器1 角标 `2 · 4`

**场景 2：失败的 ping 停在电脑上，解释「网关不可达」**
1. 接场景 1。电脑1 改手动：IP `192.168.1.10`，掩码 `255.255.255.0`，网关 `10.0.0.1`，DNS `192.168.1.1`
2. 「验证」ping `8.8.8.8` → 圆点在电脑1 上直接变红，不移动；电脑1 红描边；气泡标题「网关不可达」，正文「网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关」；两根线保持默认样式；进度条 1 个刻度
3. 逐跳列表 1 行红底，title「网关不可达」，展开首行为同一段正文
4. 点气泡「定位」→ 电脑1 选中，网关字段高亮。改回 `192.168.1.1` → 横幅「拓扑已改动，结果可能失效」；点「重新验证」→ 通，重新播放

**场景 3：traceroute**
1. 接场景 2 末（已改回网关）。「验证」类型 traceroute，起点 电脑1，目标 `8.8.8.8` → 结论「电脑1 → 8.8.8.8 共 2 跳」，跳数表 `1 路由器1 192.168.1.1 64`、`2 互联网 8.8.8.8 63`；下方逐跳与 ping 相同 5 行，动画照常播完整往返
2. 点跳数表第 2 行 → 圆点跳到互联网并暂停
3. 删掉 `wan – port1` 连线 → 横幅出现；「重新验证」→ 结论「电脑1 → 8.8.8.8 第 1 跳失败」，跳数表一行红 `1 路由器1`，圆点在路由器1 变红，气泡「没有路由」+ CP1 的 `NO_ROUTE` 文案

**引擎与网页自动测试**
- 【命令】`pnpm test` → 引擎、网页两个包都通过；`scenarios/cp3.test.ts` 含场景 1、3 的 traceroute 断言；`trace/timeline.test.ts` 与 `trace/explain.test.ts` 含场景 1、2 的时间线形状与 title 断言

## 对其他检查点的约定

**给 CP2（透明二层设备）**
1. 交换机、AP、桥接光猫、路由器网桥内二层转发的到访：`action: 'forward'`，`basis.route = null`，**`packetIn.ttl === packetOut.ttl`**。CP3 靠「TTL 是否减 1」区分二层到访与三层跳，不看设备类型；路由模式光猫做 NAT 时和路由器一样减 TTL
2. 泛洪也只记**一条** decision，`portOut` / `linkId` 取通往最终目标的那个口；其他被泛洪的口写进 `basis.mac`，动画只沿一条线走
3. `basis.mac` 形状以 [CP2](CP2-switching-and-devices.md) 第 3 节定稿为准：`{ learned: { mac, portId }, lookup: 'hit' | 'flood', floodPorts?: string[] }`。目的 MAC 取 `packetIn.dstMac`，出口取 decision 的 `portOut`。CP3 的文案模板：命中 `目的 MAC {packetIn.dstMac} 已学习在 {portOut}，从 {portOut} 转发`；泛洪 `目的 MAC {packetIn.dstMac} 未学习，向 {floodPorts} 泛洪，从 {portOut} 发出`；再追加 `学习：{learned.mac} 在 {learned.portId}`
4. `PacketSummary.vlan`：包在 trunk 上带标签时写 VLAN id，access 口上写 `null`。CP3 包头查看只在两侧任一非空时显示 VLAN 区，并高亮变化（打标 / 去标）
5. 8 口交换机的 edge id 仍是 `linkId`，CP3 沿实际画出的 edge 路径取点，不要求连线布局

**给 CP4–CP7**
6. 新增 `reasonCode` 请同时在 `apps/web/src/trace/reasonLabel.ts` 加短标签，否则气泡标题显示「验证终止」
7. 新增 `basis` 键（CP5 `tunnel` 等）请在 `trace/explain.ts` 加模板，否则该跳只显示 `note`。新增 `phase` 值请在阶段名映射加中文，否则显示原值
8. 新增验证类型仍返回 `ProbeResult`，`decisions` 满足 CP1 第 3 节的形状即可直接获得动画、包头、解释，不用改 `trace/`

**网页侧**
9. `apps/web/src/trace/` 只放不 import React 的纯函数，配 `*.test.ts`；组件按 CP0 归属
10. `apps/web` 从本检查点起有 `test` 脚本，验收标准里的【网页测试】指它。组件测试仍不做，需要时另开检查点

## 待定问题

✅ 2026-09-05 开工时决定：第 2–9 条全部按本文建议执行（不加显示 ARP 开关；不做真 TTL 模式；验证完自动播放一遍；播放条画布底部；包头用模态框；只保留最近一次；快捷键限画布区；30 s 上限等比缩短）。


1. **对 CP1 的修改请求**（✅ 已采纳 2026-09-04，CP1 的 ProbeResult 表、2.4、第 6 节、预留扩展点已改）（都是追加，不改已有字段）：
   - `ProbeResult` 加 `kind: 'traceroute'` 与可选字段 `hops: Hop[] | null`（1.2）。理由：每跳的地址要查接口表，只有引擎能算；放 `decisions` 之外与 `dns` 字段同一做法
   - 明确 React Flow 的 node id = `device.id`、edge id = `link.id`。CP1 第 6 节没写死，CP3 的取点与高亮依赖它
   - 明确中间设备 `originate`（路由器 DNS 转发）时 `packetIn` 非空、为收到的查询。CP1 2.4 的措辞隐含此意，CP3 用它区分「起点发出」与「重新出发」
   - `Decision.phase` 预留的 `'traceroute'` 值 CP3 不用，建议从预留列表删掉，避免以后有人往里写
2. **「显示 ARP」开关**：2.3 决定不展开。若教学反馈需要，加一个开关把 `basis.arp.hit` 的跳前面插一段沿线往返的短片段，不动引擎
3. **真 TTL 模式的 traceroute**：作为教学选项逐轮演示 TTL 减到 0。要动引擎（initialTtl、time exceeded 应答），CP3 不做，看 CP4 之后有没有余力
4. **验证完是否自动播放**：本文定为自动播一遍。若用户反馈打扰，改为停在起点等 ▶
5. **播放条位置**：本文放画布底部悬浮。若和 CP2 画布多设备时的框选、对齐工具栏冲突，再议
6. **包头查看用模态框**：右侧面板放不下两列。另一选择是把面板临时加宽，需动 CP0 栅格，暂不选
7. **只保留最近一次验证**：连续验证会覆盖动画。历史与多结果对比属第二期
8. **快捷键范围**：空格、方向键只在画布区有效。是否要全局，等有更多快捷键时统一定
9. **30 s 上限的等比缩短**：32 条 decision 的极端情况下 dwell 会压到约 400 ms。若看不清，可改成只缩 travel 不缩 dwell
10. **测试表尚未建立**（✅ 已建并回填 2026-09-04）：与 CP0、CP1 相同，本文各步骤「测试用例」待 `docs/TEST-PLAN.md` 建立后回填。本文新用了验收方式标签【网页测试】（✅ 已收录进 [README.md](README.md) 与测试表说明，2026-09-04）
11. **回应 CP2 待定问题 7（VLAN 失败画到哪）**：CP2 把 VLAN 失败记在起点的 decision 上并附 `basis.vlan.dropAt`。CP3 第一版忠于 decision，包停在起点变红；气泡正文用 CP2 的 reason 文案，已含丢弃点设备与端口名，且「定位」按 `fixAt` 跳到丢弃端口。把包画到丢弃点再消失作为后续增强，不在本检查点做

## 关联文档

- 上一个检查点：[CP2-switching-and-devices.md](CP2-switching-and-devices.md)（同期编写）；数据结构依赖 [CP1-lan-basics.md](CP1-lan-basics.md)
- 下一个检查点：CP4 分区与边界（细化文档待写）
- 测试表：[../TEST-PLAN.md](../TEST-PLAN.md)
- 文档规范：[README.md](README.md)
