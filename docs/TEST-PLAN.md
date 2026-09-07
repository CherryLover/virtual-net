# 测试表

> 建档 2026-09-04。这是独立的检查清单：功能做完后，从上到下逐条核对。
> 每条用例都来自某个检查点文档里某一步的验收标准，两边通过编号互相引用。规范见 [checkpoints/README.md](checkpoints/README.md)。

> 2026-09-07：CP0–CP3 保留既有验收记录；原 CP4 53 条用例仅供历史参考，不能据此验收新 CP4。本轮通用模型与 UX 验收结果、证据及剩余限制见下节。

## 方向调整与页面优化验收候选

来源：[方向与页面优化](design/network-model-and-ui.md)。方案已确定，保留 `R-20260907-*` 作为历史需求映射；正式编号为 R01–04 对应 T-CP4-054–057、R05–08 对应 T-CP5-001–004、R09–19 对应 T-UX-001–011。下面记录本轮实际执行结果，不回写旧 CP4 用例。

| 候选编号 | 方式 | 操作与预期 | 来源 | 状态 |
| --- | --- | --- | --- | --- |
| R-20260907-01 | 页面 / 网页测试 | 默认实体命名中性；位置和区域不改变模拟结果 | 第 2–3 节 | 通过：设备库与示例页面；display.test.ts |
| R-20260907-02 | 引擎测试 | 串联控制逐台生效，无关第三台不影响结果 | 第 3 节 | 通过：services.test.ts 双透明控制场景 |
| R-20260907-03 | 引擎测试 | 首条匹配、默认动作、精确返回连接判定 | 第 3 节 | 通过：services.test.ts；规则名快照与精确定位 |
| R-20260907-04 | 引擎 / 页面 | 服务自身答案和路径改写分别记录，改写后仍检查真实服务 | 第 3 节 | 通过：app.example 原 198.51.100.80 改为 192.168.1.30 后 TCP 443 成功；80 未开放失败 |
| R-20260907-05 | 页面 | 拖入代理、连线、配置、选择、保存重开 | 第 4 节 | 通过：新代理自动取得 192.168.1.100，转发成功；冷启动保留 |
| R-20260907-06 | 引擎 / 页面 | 首批协议和完整多段路径 | 第 4 节 | 通过：HTTP、CONNECT 客户端解析、SOCKS5 代理端解析均成功 |
| R-20260907-07 | 引擎 / 页面 | 停服、错误认证、解析和出口失败分别定位 | 第 4 节 | 通过：services.test.ts 全分支；页面错误密码及出口规则拒绝，定位到展开的命中规则 |
| R-20260907-08 | 引擎测试 | 两种解析路径、普通 ping 不改道、未用代理不影响直连 | 第 4 节 | 通过：services.test.ts、serviceSample.test.ts；本地 DNS 先于代理连接 |
| R-20260907-09 | 页面 | 分组搜索、收起、点击和拖放添加、长名称 | 第 5 节 | 通过：搜索 proxy、桌面/手机宽度拖放各新增一次；超长名称在 390px 下省略，工具栏最右 384px，无横向溢出 |
| R-20260907-10 | 页面 / 组件 | 分组切换、错误自动展开定位 | 第 5 节 | 通过：命中规则名称和独立高亮；ServiceForms.test.ts |
| R-20260907-11 | 页面 / 组件 | 失焦校验，不保存无效值；节点切换不串草稿 | 第 5 节 | 通过：半填网关显示错误，切换回来仍为 192.168.1.1；DnsRecords.interaction.test.ts |
| R-20260907-12 | 页面 | 曲线拖动、标签、恢复自动、手势隔离 | 第 6 节 | 通过：两种缩放拖动，画布 transform 不变，恢复按钮移除手动线形 |
| R-20260907-13 | 网页 / 页面 | 控制点相对端点跟随，往返动画沿实际曲线 | 第 6 节 | 通过：单/双节点移动测试；5 帧实际动画距手动曲线小于 0.01 画布单位；返回动画截图贴线 |
| R-20260907-14 | 网页 / 组件 / 页面 | 一次拖动一次历史，刷新和文件往返保留，新程序兼容旧图 | 第 6–7 节 | 通过：实际文件选择、确认导入、再次导出内容一致；撤销恢复旧曲线，重做与冷刷新保留，导入后代理访问成功；旧图兼容测试通过 |
| R-20260907-15 | 网页 / 页面 | 展示改动不作废验证，连接或真实配置变化会作废 | 第 6–7 节 | 通过：连线控制柄和 port5 换侧后动画保留；添加节点及 VLAN 改动作废；display.test.ts |
| R-20260907-16 | 网页 / 页面 | 上下及左右接线可用，物理端口身份和占用不变 | 第 6 节 | 通过：上侧 port2 接新代理、port5 左/下换侧；已接代理再拖到空闲 port3 后仍为 7 条线，port3 仍空闲 |
| R-20260907-17 | 网页 / 页面 | 旧端口/VLAN/连线保留，高端口数不无限变宽 | 第 6–7 节 | 通过：48 口 96 个方向柄仍代表 48 个物理口，6 条原连接保留；switchLayout/display 测试 |
| R-20260907-18 | 页面 | 三种指定尺寸布局和单面板手机操作 | 第 5、8 节 | 三尺寸截图与手机表单、规则定位、拖放通过；未做真手机硬件验证 |
| R-20260907-19 | 命令 / 页面 / 组件 | 全量检查及 CP1–CP3 回归 | 第 7–8 节 | 页面网关错误/恢复、VLAN 隔离、动画通过；全量命令最终结果见下文；旧图导入覆盖同 R14 |

### 本轮证据与限制

- 最终命令：`pnpm lint` 通过（220 文件），`pnpm test` 通过（引擎 145 项、网页 103 项，共 248 项），`pnpm build` 通过且包含两包 `typecheck`。构建仍提示单个 JS 包超过 500 kB，不影响运行；未为消除提示扩大本轮拆包范围。
- 页面使用本地 `http://127.0.0.1:5175/`，未部署或连接真实代理；所有账号密码均为虚构测试数据。
- 浏览器冷启动、七条连线（原六条加新代理）、代理协议/解析方式切换、DNS 查询、规则开关、字段错误和返回路径均实际操作。页面控制台无应用错误。
- 导出文件经结构化检查，包含手动曲线、端口显示侧、代理配置、模拟凭据和 DNS 改写。`Toolbar.interaction.test.ts` 通过实际 file input change、File.text、确认、替换 store、撤销验证导入；坏文件、读取错误、取消均不覆盖原图。
- 用户开启 Chrome 扩展本地文件权限后，已补完真实文件选择与确认替换。导入 `服务与代理示例.json` 后再次导出，经结构化比较，除画布视角外内容完全一致（8 节点、7 连线，含曲线、端口侧、代理与模拟凭据、DNS 改写）。一次撤销恢复导入前曲线，重做精确恢复导入曲线；冷刷新后 SOCKS5 代理访问成功，DNS 改写与内部 TCP 443 服务仍按配置生效。R14 的权限阻碍已解除。
- 本轮试用调整：名称框桌面上限 168px，手机上限 112px；顶部验证改为“选择起点验证”图标，不表示全网扫描。步骤序号移至节点上方 36 画布单位，避开端口标签；独立叠加层高于选中节点，序号按节点宽度换行。1440×900、1024×768、390×844 下检查按钮命中和详情点击；30 个步骤在完整画布中均可点击。播放条与缩放控件分开，播放期间适配画布增加留白。补充 `VisitBadges.interaction.test.ts` 和工具栏快捷入口测试。
- `DnsRecords.interaction.test.ts` 覆盖连续编辑域名/IP 的焦点保持，以及删除中间行后的草稿隔离；修复了以可编辑域名作行标识导致的地址丢失问题。
- 自动保存有串行写入、读取失败阻写、保存失败重试、未保存离页提示及开发热更新保留编辑图测试，不以成功状态文本替代真实保存。

## 怎么用

- 一个检查点一节，一节一张表，按步骤顺序排
- 每条用例一行：编号、验证方式、前提、操作、预期、来源步骤、结果
- **验证方式**：【引擎测试】引擎包自动测试，列里写测试文件与用例名要点；【网页测试】网页包纯函数自动测试（CP3 起）；【页面操作】手动在页面上做；【命令】终端跑命令
- **结果**列开发前留空。核对时填：`✅ 通过` / `❌ 失败（一句话现象）` / `⏭ 跳过（原因）`
- 一个检查点的所有用例都 `✅`，对应检查点文档的「阶段完成标准」也走完，ROADMAP 里那个大 checkbox 才能打勾
- 改了验收标准要同步改这里；新增用例编号往后追加，不复用已删除的编号

## 编号

`T-CPx-nnn`。`x` 是检查点，`nnn` 从 001 起在该检查点内连续。引用写法：`[T-CP1-004](TEST-PLAN.md)`。

## 用例来源

| 检查点 | 文档 | 用例数 | 编号范围 |
| --- | --- | --- | --- |
| CP0 | [CP0-project-skeleton.md](checkpoints/CP0-project-skeleton.md) | 27 | T-CP0-001 – T-CP0-027 |
| CP1 | [CP1-lan-basics.md](checkpoints/CP1-lan-basics.md) | 68 | T-CP1-001 – T-CP1-068 |
| CP2 | [CP2-switching-and-devices.md](checkpoints/CP2-switching-and-devices.md) | 66 | T-CP2-001 – T-CP2-066 |
| CP3 | [CP3-trace-and-animation.md](checkpoints/CP3-trace-and-animation.md) | 58 | T-CP3-001 – T-CP3-058 |
| CP4（历史待修订） | [CP4-zones-and-border.md](checkpoints/CP4-zones-and-border.md) | 53 | T-CP4-001 – T-CP4-053 |

---

## CP0 项目骨架

来源：[CP0-project-skeleton.md](checkpoints/CP0-project-skeleton.md)

### CP0-S1 仓库与 workspace 初始化
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-001 | 命令 | — | `node -v`；`pnpm -v` | `node -v` 输出 `v22.x`；`pnpm -v` 与 `packageManager` 一致 | [CP0-S1](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-002 | 命令 | — | `pnpm install` | 成功，生成 `pnpm-lock.yaml` | [CP0-S1](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-003 | 命令 | — | 切到 Node 20（如 `nvm use 20`）再 `pnpm install`；然后切回 Node 22 再 `pnpm install` | Node 20 下报错提示不满足 `engines.node`；切回 22 后正常 | [CP0-S1](checkpoints/CP0-project-skeleton.md) | ✅ 通过（拦截由 pnpm 自身 Node 版本要求 + workspace 的 engineStrict 共同实现，见 CP0 实施记录） |
| T-CP0-004 | 命令 | — | `git status` | 不出现 `node_modules/` | [CP0-S1](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

### CP0-S2 引擎包与占位测试
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-005 | 引擎测试 | — | `pnpm --filter @virtual-net/engine test` | 输出 `Test Files 1 passed`、`Tests 1 passed`，退出码 0 | [CP0-S2](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-006 | 命令 | — | `pnpm --filter @virtual-net/engine typecheck` | 无输出，退出码 0 | [CP0-S2](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-007 | 命令 | — | 临时在 `src/index.ts` 加一行 `document.title = 'x'` 再 typecheck；删掉后再 typecheck | 报 `Cannot find name 'document'`；删掉后通过 | [CP0-S2](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-008 | 命令 | — | `ls packages/engine/src` | 看到 `model engine lint serialization index.ts index.test.ts` | [CP0-S2](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

### CP0-S3 网页包脚手架与引擎引用
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-009 | 命令 | — | `pnpm --filter @virtual-net/web dev` | 终端打印 `Local: http://localhost:5173/` | [CP0-S3](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-010 | 页面操作 | `pnpm --filter @virtual-net/web dev` 已启动 | 浏览器打开终端打印的地址 | 空白页，标签标题 `virtual-net`，控制台无报错 | [CP0-S3](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-011 | 命令 | — | `pnpm --filter @virtual-net/web typecheck` | 退出码 0 | [CP0-S3](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-012 | 命令 | — | 把 import 改成 `@virtual-net/engine/src/index` 再 typecheck；改回后再 typecheck | 报模块找不到；改回后通过 | [CP0-S3](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

### CP0-S4 三栏布局与空画布
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-013 | 页面操作 | — | `pnpm dev` 打开页面 | 顶部一条工具栏显示 `virtual-net`，下方左中右三栏，左栏顶部显示「设备」，右栏底部显示 `引擎 0.0.0`，中间是点阵背景和左下角缩放按钮，画布上没有任何节点 | [CP0-S4](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-014 | 页面操作 | 页面已打开 | ①在画布上滚轮 ②按住拖动 ③点缩放按钮 | ①点阵缩放 ②点阵平移 ③有响应 | [CP0-S4](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-015 | 页面操作 | 页面已打开 | 把浏览器窗口拉宽拉窄 | 工具栏横跨全宽，左右两栏宽度不变，中间随窗口伸缩；页面没有整体滚动条 | [CP0-S4](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-016 | 页面操作 | 页面已打开 | 刷新页面 | 控制台无报错和 React 警告 | [CP0-S4](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

### CP0-S5 代码检查与格式化
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-017 | 命令 | — | `pnpm exec biome check .` | 输出 `Checked N files`，无 error / warning，退出码 0 | [CP0-S5](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-018 | 命令 | — | 把任一 `.ts` 文件改成 4 空格缩进再 check；然后跑 `biome format --write .` 再 check | 改缩进后非零退出，提示 format 差异；`biome format --write .` 后恢复通过 | [CP0-S5](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-019 | 命令 | — | 在 `apps/web/src/main.tsx` 加一行未使用的 import 再 check | 报 `noUnusedImports` | [CP0-S5](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-020 | 命令 | — | ①在 `packages/engine/src/index.ts` 加 `import 'react'` 再 check ②在 web 里同样 import 再 check | ①报 `noRestrictedImports` ②不报 | [CP0-S5](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

### CP0-S6 根脚本、README 与整体验收
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-021 | 命令 | — | 根目录依次 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` | 全部退出码 0；`apps/web/dist/index.html` 存在 | [CP0-S6](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-022 | 命令 | — | `pnpm dev` | 打印本地地址，页面同 CP0-S4 | [CP0-S6](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-023 | 命令 | — | 把仓库克隆到临时目录，只看 README 操作：依次 `pnpm install`、`pnpm dev`、`pnpm test` | 三步都成功，不需要看其他文档 | [CP0-S6](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-024 | 命令 | — | `git status` | 工作区干净 | [CP0-S6](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

### 阶段完成标准
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP0-025 | 页面操作 | 全新克隆的目录 | 按 CP0『阶段完成标准』场景 1 操作：`nvm use`（读 `.nvmrc`）、`pnpm install`、`pnpm dev`，在浏览器打开终端打印的地址；滚轮缩放、拖动平移、改窗口宽度 | 看到顶部工具栏 `virtual-net`、左栏「设备」、中间点阵画布与缩放按钮、右栏空且底部 `引擎 0.0.0`；画布无节点；控制台无报错；滚轮缩放、拖动平移有效；改窗口宽度中间栏伸缩、无页面滚动条 | [CP0 阶段完成标准](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-026 | 命令 | — | 按 CP0『阶段完成标准』场景 2 操作：根目录 `pnpm test`；顺带 `pnpm lint`、`pnpm typecheck` | `pnpm test` 输出 `1 passed`，退出码 0；`pnpm lint`、`pnpm typecheck` 也退出码 0 | [CP0 阶段完成标准](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |
| T-CP0-027 | 命令 | — | 按 CP0『阶段完成标准』场景 3 操作：`ls` 根目录；`ls packages apps`；对照 CP0 关键设计第 1 节检查 `packages/engine/src` 与 `apps/web/src` 的子目录 | 根目录只有 `ROADMAP.md`、`README.md`、`CLAUDE.md`、`docs/`、`packages/`、`apps/` 和第 1 节列出的配置文件，没有多余顶层目录；`packages`、`apps` 下各只有 `engine`、`web`；两个 `src` 的子目录与第 1 节逐一对得上 | [CP0 阶段完成标准](checkpoints/CP0-project-skeleton.md) | ✅ 通过 |

---

## CP1 局域网基础

来源：[CP1-lan-basics.md](checkpoints/CP1-lan-basics.md)

### CP1-S1 拓扑数据模型与序列化
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-001 | 引擎测试 | 空拓扑 | 连续创建 电脑、路由器、互联网 | 名称为「电脑1」「路由器1」「互联网」，端口名分别为 `eth0`、`wan lan1–lan4`、`port1`，MAC 从 `02:00:00:00:00:01` 起连续 | [CP1-S1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-002 | 引擎测试 | fixture `minimal.json` | `parseTopology(minimal.json)`，再 `JSON.stringify` | 解析成功；序列化结果与原文件深比较相等 | [CP1-S1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-003 | 引擎测试 | fixture `minimal.json` | ①把某根线的 `portId` 改成不存在的 id 后解析 ②改成 `version: 2` 后解析 | ①解析失败，错误里带该 `linkId` ②失败，错误提示「版本高于支持」 | [CP1-S1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-004 | 引擎测试 | — | `parseMask('255.255.0.255')`、`parseMask('255.255.255.0')`、`isPrivate('100.64.1.1')` | `'255.255.0.255'` 非法；`'255.255.255.0'` 合法且前缀 24；`isPrivate('100.64.1.1')` 返回「运营商内网」标记 | [CP1-S1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S2 运行时构建与 DHCP 分配
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-005 | 引擎测试 | fixture 拓扑 | `buildRuntime` | 电脑1 租约 `192.168.1.100/24`，网关与 DNS `192.168.1.1`，来自 路由器1；路由器1 WAN 租约 `203.0.113.2/24`，网关 `203.0.113.1`，DNS `8.8.8.8` | [CP1-S2](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-006 | 引擎测试 | fixture 拓扑 | 再加一台手动电脑 `192.168.1.100/24` 接 `lan2`，电脑1 仍自动获取，`buildRuntime` | 电脑1 拿到 `192.168.1.101`（跳过已占用） | [CP1-S2](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-007 | 引擎测试 | fixture 拓扑 | ①路由器 DHCP 关 ②池改为 `.100`–`.100` 且加第二台自动获取电脑 | ①电脑1 租约状态 `no-server` ②第二台 `pool-exhausted` | [CP1-S2](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-008 | 引擎测试 | fixture 拓扑 | 断开 `wan` 连线，`buildRuntime` | 路由器路由表只有 LAN 直连，没有默认路由 | [CP1-S2](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-009 | 引擎测试 | — | 电脑手动 `192.168.1.10/24` 网关 `10.0.0.1`，`buildRuntime` | 路由表默认路由存在且 `viaOffSubnet = true` | [CP1-S2](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S3 二层送达：ARP 与直连 ping
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-010 | 引擎测试 | 电脑A `192.168.1.10/24` 直连 路由器 `lan1`（LAN `192.168.1.1/24`） | 电脑A ping `192.168.1.1` | `verdict: 'ok'`，decisions 三条：电脑A `originate`（`basis.arp.mac` = lan1 的 MAC）、路由器 `answer`、电脑A `receive`；`path` = [A, 路由器, A] | [CP1-S3](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-011 | 引擎测试 | 同 T-CP1-010 拓扑 | 电脑A ping `192.168.1.2`（网段里没人） | `fail`，一条 decision，`reasonCode: ARP_MISS`，文案含「192.168.1.2」和「ARP 无应答」 | [CP1-S3](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-012 | 引擎测试 | 手动地址的电脑A，`eth0` 不连线 | 电脑A ping 任何地址 | `PORT_UNLINKED` | [CP1-S3](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-013 | 引擎测试 | 电脑A 自动获取 | ①无 DHCP 服务器时 ping ②`eth0` 不连线时 ping | ①`NO_IP`，文案含「没有 DHCP 服务器」②`NO_IP`，文案含「没有连线」 | [CP1-S3](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-014 | 引擎测试 | 两台电脑 `eth0`–`eth0` 直连 | ①同网段互 ping ②一台改成 `192.168.2.x/24` 再 ping | ①通 ②起点 `NO_GATEWAY` | [CP1-S3](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S4 三层转发：路由表、默认路由与网关失败
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-015 | 引擎测试 | fixture 拓扑，路由器 `nat: false` | 电脑1 ping `8.8.8.8` | 去程 decisions：电脑1 `originate`（`basis.route.via = 192.168.1.1`）、路由器1 `forward`（`portIn = lan1`，`portOut = wan`，TTL 63，源 IP 仍 `192.168.1.100`）、互联网 `answer` 时 `stop`，`reasonCode: NO_RETURN_ROUTE` | [CP1-S4](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-016 | 引擎测试 | 电脑1 手动 `192.168.1.10/24` 网关 `10.0.0.1` | 电脑1 ping `8.8.8.8` | 一条 decision，`GATEWAY_OFF_SUBNET`，`fixAt = { 电脑1, 'gateway' }` | [CP1-S4](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-017 | 引擎测试 | 接 T-CP1-016（电脑1 手动地址） | 网关填 `192.168.1.254`（无人使用），再 ping `8.8.8.8` | `ARP_MISS`，文案含「网关」 | [CP1-S4](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-018 | 引擎测试 | fixture 拓扑 | 断开 `wan` 连线，电脑1 ping `8.8.8.8` | 停在路由器1，`NO_ROUTE`，文案含「WAN 口未获取到地址」 | [CP1-S4](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-019 | 引擎测试 | fixture 拓扑 | 电脑1 ping `1.1.1.1`（不在目标库） | 停在互联网，`UNKNOWN_DEST` | [CP1-S4](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S5 NAT 与外网回程
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-020 | 引擎测试 | fixture 拓扑 | 电脑1 ping `8.8.8.8` | `ok`，五条 decisions；路由器1 去程 `basis.nat = { out, before 192.168.1.100, after 203.0.113.2 }`，`packetOut.srcIp = 203.0.113.2`；回程 `basis.nat.direction = 'in'`，`packetOut.dstIp = 192.168.1.100`；`path` = [电脑1, 路由器1, 互联网, 路由器1, 电脑1] | [CP1-S5](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-021 | 引擎测试 | fixture 拓扑，路由器 `nat: false` | 电脑1 ping `8.8.8.8` | `fail`，`stoppedAt` = 互联网，`fixAt = { 路由器1, 'nat' }`，文案含「私网地址」「无法把应答送回」「NAT 已关闭」 | [CP1-S5](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-022 | 引擎测试 | — | 让路由器从 `wan` 收到目的为 WAN 地址、无对应会话的 ICMP 应答 | `NAT_NO_SESSION` | [CP1-S5](checkpoints/CP1-lan-basics.md) | ✅ 通过（构造方式：LAN 与接入同网段 + NAT 关 + 电脑地址等于 WAN 地址，见 CP1 实施记录） |
| T-CP1-023 | 引擎测试 | — | 同一次 `visitSite` 里检查 DNS 和 TCP 两个 NAT 会话 | 两个会话外部端口不同，互不覆盖 | [CP1-S5](checkpoints/CP1-lan-basics.md) | ✅ 通过（电脑 DNS 直指 8.8.8.8 才会产生两个会话，见 CP1 实施记录） |

### CP1-S6 决策记录与 probe 接口收口
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-024 | 引擎测试 | fixture 拓扑 | `visitSite(电脑1, 'www.google.com')` | `ok`，`dns = { 192.168.1.1, www.google.com, 142.250.72.14 }`；`dns` 阶段 decisions 含 路由器1 `originate`（`basis.dns.upstream = 8.8.8.8`）与 互联网 `answer`（`basis.dns.answer`）；`tcp` 阶段路径同 ping 8.8.8.8 | [CP1-S6](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-025 | 引擎测试 | fixture 拓扑 | ①电脑1 手动配置且 DNS 为空，`visitSite` ②DNS 填 `110.242.68.66`，`visitSite` ③`visitSite` 域名 `www.nonexistent.test` | ①`NO_DNS`，`fixAt` 字段 `dns` ②`DNS_NOT_SERVER` ③`DNS_NXDOMAIN`，停在互联网 | [CP1-S6](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-026 | 引擎测试 | fixture 拓扑，DNS 指向路由器 | 断开 `wan`，`visitSite` | `DNS_NO_UPSTREAM`，停在路由器1 | [CP1-S6](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-027 | 引擎测试 | fixture 拓扑 | `ping(路由器1, '8.8.8.8')` | `ok`，源 IP 为 WAN 地址，无 NAT 记录 | [CP1-S6](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-028 | 引擎测试 | — | 检查任何 probe 结果的 decisions | `decisions[i].seq === i + 1`；最后一条 `verdict` 与结果一致；`stop` 条目 `reasonCode` 非空且 `reason` 非空 | [CP1-S6](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-029 | 命令 | — | `pnpm test` | 通过；`scenarios/cp1.test.ts` 包含 4 个 `it`，名字与 ROADMAP 场景 1–4 对应 | [CP1-S6](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S7 静态检查 lint
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-030 | 引擎测试 | fixture 拓扑 | `lint(topology)` | 空数组 | [CP1-S7](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-031 | 引擎测试 | fixture 拓扑 | 电脑1 手动 `192.168.1.10/24` 网关 `10.0.0.1`，`lint` | 恰好一条 L002，`targets[0] = { 电脑1, field: 'gateway' }`，文案含「10.0.0.1」「192.168.1.0/24」 | [CP1-S7](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-032 | 引擎测试 | — | 两台手动电脑同为 `192.168.1.10` 接同一路由器，`lint` | L001 一条，`targets` 两台电脑 | [CP1-S7](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-033 | 引擎测试 | — | ①电脑 `192.168.2.10/24` 直连路由器 `lan1`（`192.168.1.1/24`），`lint` ②电脑改 `192.168.1.10/16`（网关 `192.168.1.1`），`lint` | ①L004 带 `linkId` ②只报 L005 不报 L004 | [CP1-S7](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-034 | 引擎测试 | fixture 拓扑 | ①手动电脑 `192.168.1.150` + 路由器默认池 ②LAN IP 改 `192.168.1.100` ③池改 `192.168.2.100–199` | ①L006 ②L007 ③L008 | [CP1-S7](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-035 | 引擎测试 | fixture 拓扑 | ①`nat: false` ②`wan` 未连线 ③电脑 IP 填 `300.1.1.1` | ①L013 ②L009 ③L011 且不抛异常 | [CP1-S7](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S8 画布：设备栏、拖入、连线、选中与删除
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-036 | 页面操作 | — | 从设备栏拖「电脑」到画布；再拖一次 | 出现「电脑1」节点，顶部一个 `eth0` 柄；第二次出现「电脑2」 | [CP1-S8](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-037 | 页面操作 | — | 拖「路由器」；拖「互联网」 | 路由器节点顶部 `wan`，底部 `lan1`–`lan4`；互联网节点底部 `port1` | [CP1-S8](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-038 | 页面操作 | 接 T-CP1-037 | 从 `eth0` 拖到 `lan1`；再从 `eth0` 拖到 `lan2` | 第一次连线出现，标签 `eth0 – lan1`；第二次不产生新线 | [CP1-S8](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-039 | 页面操作 | 接 T-CP1-038 | 从 `wan` 拖到 `port1` | 连线出现，互联网节点长出 `port2` | [CP1-S8](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-040 | 页面操作 | 接 T-CP1-039（两根线已连） | ①选中连线按 `Delete` ②选中路由器按 `Delete` | ①线消失，两端柄恢复可连 ②节点和它的两根线一起消失 | [CP1-S8](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-041 | 页面操作 | — | 拖动节点松手；缩放、平移画布 | 节点停在新位置；缩放、平移后各节点相对位置和连线不变 | [CP1-S8](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S9 配置面板
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-042 | 页面操作 | 搭好 fixture 图 | 点电脑1 | 面板显示地址模式「自动获取」，四个字段置灰，下方「已获取 192.168.1.100 / 255.255.255.0，网关 192.168.1.1，DNS 192.168.1.1（来自 路由器1）」 | [CP1-S9](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-043 | 页面操作 | 接 T-CP1-042 | ①切「手动」②IP 填 `300.1.1.1` 失焦 ③改回 `192.168.1.10` | ①四字段可编辑 ②字段下红字「不是合法的 IP 地址」，节点上地址行不变 ③节点地址行更新 | [CP1-S9](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-044 | 页面操作 | fixture 图 | 点路由器1；再关闭 DHCP | LAN `192.168.1.1` / `255.255.255.0`，DHCP 开 `.100`–`.199` 租期 24，WAN「自动获取公网地址 · 已获取 203.0.113.2」，NAT 开；关闭 DHCP 后电脑1 节点地址行变「未获取到地址」 | [CP1-S9](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-045 | 页面操作 | fixture 图 | 点互联网；改名称为「外网」 | 只读接入地址与三行目标表；改名后节点标题同步 | [CP1-S9](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S10 结果面板与发起验证
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-046 | 页面操作 | fixture 图 | 点空白处 | 面板「静态检查：没有问题」「最近验证：还没有验证」 | [CP1-S10](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-047 | 页面操作 | fixture 图 | 电脑1 改手动、网关 `10.0.0.1`；点静态检查该行 | 静态检查出现一行「电脑1 · 网关 10.0.0.1 不在 192.168.1.0/24 网段内」，电脑1 节点红点 1；点该行后电脑1 选中，网关字段高亮 | [CP1-S10](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-048 | 页面操作 | 接 T-CP1-047 | 工具栏「验证」，类型 ping、起点 电脑1、目标 `192.168.1.1`、运行 | 弹窗关闭，面板显示「电脑1 → 192.168.1.1 通」，路径「电脑1 → 路由器1 → 电脑1」，逐跳三行 | [CP1-S10](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-049 | 页面操作 | 接 T-CP1-048 | 电脑1 改回自动获取，验证 ping `8.8.8.8` | 通，逐跳五行，路由器1 两行的 note 分别含「NAT」 | [CP1-S10](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-050 | 页面操作 | 接 T-CP1-049 | 关路由器 NAT 再验证；点「定位」 | 「不通」，原因含「私网地址」「NAT 已关闭」；点「定位」后路由器1 选中、NAT 开关高亮 | [CP1-S10](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-051 | 页面操作 | fixture 图 | 验证「访问网站」起点 电脑1 域名 `www.google.com` | 「成功」，显示 DNS 解析结果 `142.250.72.14`，逐跳列表分「DNS」「连接」两组 | [CP1-S10](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### CP1-S11 保存：自动保存、导入导出、新建
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-052 | 页面操作 | 搭 fixture 图 | 等工具栏显示「已保存」，刷新 | 图、配置、视口一致 | [CP1-S11](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-053 | 页面操作 | fixture 图 | 点「导出」 | 下载 `家庭最小网络.json`，内容与 CP1 关键设计第 1 节示例结构一致（id、MAC 可不同） | [CP1-S11](checkpoints/CP1-lan-basics.md) | ✅ 通过（自动化浏览器无法落盘下载，已核对文件名与内容；真人点击落盘待你顺手确认） |
| T-CP1-054 | 页面操作 | fixture 图 | 点「新建」；确认；刷新 | 出现确认框；确认后空画布，刷新仍为空 | [CP1-S11](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-055 | 页面操作 | 接 T-CP1-054（空画布），已有 T-CP1-053 导出的文件 | 点「导入」选刚导出的文件；验证 ping `8.8.8.8` | 三设备两连线回来，位置与配置一致；ping 结果与导出前相同 | [CP1-S11](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-056 | 页面操作 | — | 导入一个 `version: 2` 的文件 | 提示「文件格式不对：版本高于支持」，画布不变 | [CP1-S11](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-057 | 页面操作 | 画布非空 | 导入 | 先弹「替换当前画布？」 | [CP1-S11](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### 阶段完成标准
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-058 | 页面操作 | 「新建」得到空画布 | 按 CP1『阶段完成标准』场景 1 的 7 步操作：依次拖入 电脑、路由器、互联网；连 电脑1 `eth0` – 路由器1 `lan1`、路由器1 `wan` – 互联网 `port1`；点电脑1、点路由器1 查看不改；点空白；「验证」ping 起点 电脑1 目标 `192.168.1.1`；ping 目标 `8.8.8.8`；「验证」访问网站 域名 `www.google.com` | 出现「电脑1」「路由器1」「互联网」；两根线标签 `eth0 – lan1`、`wan – port1`；电脑1 地址模式已是「自动获取」，下方「已获取 192.168.1.100 / 255.255.255.0，网关 192.168.1.1，DNS 192.168.1.1（来自 路由器1）」；路由器1 DHCP 开、NAT 开、WAN 已获取 `203.0.113.2`；静态检查「没有问题」；ping `192.168.1.1` →「电脑1 → 192.168.1.1 通」，路径 电脑1 → 路由器1 → 电脑1；ping `8.8.8.8` 通，路径 电脑1 → 路由器1 → 互联网 → 路由器1 → 电脑1，路由器1 去程一行 note 含「192.168.1.100 → 203.0.113.2」；访问网站「成功」，DNS `192.168.1.1` 解析到 `142.250.72.14` | [CP1 阶段完成标准](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-059 | 页面操作 | 接场景 1（T-CP1-058） | 按 CP1『阶段完成标准』场景 2 的 3 步操作：点电脑1，地址模式切「手动」，IP `192.168.1.10`，掩码 `255.255.255.0`，网关 `10.0.0.1`，DNS `192.168.1.1`；点空白并点静态检查那一行；「验证」ping `8.8.8.8` | 静态检查一行「电脑1 · 网关 10.0.0.1 不在 192.168.1.0/24 网段内」，点它 → 电脑1 选中且网关字段高亮；ping「不通」，断在 电脑1，原因「网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关」，逐跳仅一行 | [CP1 阶段完成标准](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-060 | 页面操作 | 接场景 2（T-CP1-059） | 按 CP1『阶段完成标准』场景 3 的 3 步操作：电脑1 网关改回 `192.168.1.1`，保持手动 `192.168.1.10`；点路由器1，关闭 NAT；「验证」ping `8.8.8.8`，点「定位」；打开 NAT 再验证 | 关 NAT 后静态检查出现「路由器1 · NAT 已关闭…」；ping「不通」，断在 互联网，原因「回程失败：源地址 192.168.1.10 是私网地址，互联网无法把应答送回。路由器1 的 NAT 已关闭」，逐跳三行，最后一行红；「定位」→ 路由器1 选中，NAT 开关高亮；打开 NAT 再验证 → 通 | [CP1 阶段完成标准](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-061 | 页面操作 | 接场景 3（T-CP1-060，NAT 已打开） | 按 CP1『阶段完成标准』场景 4 的 4 步操作：「导出」；「新建」并确认，刷新页面；「导入」选刚才的文件；「验证」ping `8.8.8.8` | 导出得到 `家庭最小网络.json`；新建后空画布，刷新仍为空；导入后三设备两连线，位置、电脑1 手动配置、路由器配置全部一致；ping 通，逐跳与场景 3 第 3 步一致 | [CP1 阶段完成标准](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-062 | 命令 | — | 按 CP1『阶段完成标准』场景 5 操作：`pnpm test` | 通过；`scenarios/cp1.test.ts` 中场景 1–4 各一条 `it`，断言 `verdict`、`stoppedAt`、`reasonCode`、`fixAt` 与场景文字一致；场景 4 断言 `parseTopology(JSON.stringify(t))` 深等于 `t` 且两次 `ping` 结果深等于 | [CP1 阶段完成标准](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

### 试用调整（2026-09-04）
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP1-063 | 页面操作 | fixture 图 | 点电脑1 | 表单顶部出现「验证」块：`ping 网关` `ping 外网` `打开网站` 三个按钮，目标输入框 + `ping` | [CP1 6.1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-064 | 页面操作 | 选中电脑1 | 点 `ping 外网` | 块下方显示「电脑1 → 8.8.8.8 通」、路径、逐跳五行；电脑1 保持选中 | [CP1 6.1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-065 | 页面操作 | 电脑1 网关 `10.0.0.1` | 点 `ping 网关` | 「不通」，原因含「网关 10.0.0.1 不在本机网段」，点「定位」网关字段高亮 | [CP1 6.1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-066 | 页面操作 | 选中路由器1 | 验证块只有 `ping 网关` `ping 外网` 与输入框；点 `ping 外网` | 通，源为 WAN 地址 | [CP1 6.1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-067 | 页面操作 | 选中电脑1 | `打开网站` 选 `www.google.com` | 「成功」，显示 DNS 解析结果 | [CP1 6.1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |
| T-CP1-068 | 页面操作 | 任意图 | 看节点与设备栏 | 电脑、路由器、互联网各有图标在名称左侧，设备栏卡片同样带图标 | [CP1 6.1](checkpoints/CP1-lan-basics.md) | ✅ 通过 |

---

## CP2 交换机与多设备

来源：[CP2-switching-and-devices.md](checkpoints/CP2-switching-and-devices.md)

### CP2-S1 模型扩展：类型、默认值、解析
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-001 | 引擎测试 | 空拓扑 | 连续创建 交换机、AP、光猫 | 名称「交换机1」「AP1」「光猫1」；端口分别为 `port1`–`port8`（每个 `vlan = access 1`）、`uplink wlan1`、`wan lan1`；MAC 接着已有最大值顺延 | [CP2-S1](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-002 | 引擎测试 | CP1 fixture `minimal.json` | 解析后再序列化 | 解析成功且序列化后深等于原文件（CP1-S1 测试不改一行通过） | [CP2-S1](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-003 | 引擎测试 | fixture `home-office.json` | ①原样解析并序列化 ②把交换机 `portCount` 改成 7 后解析 ③给某电脑 `eth0` 加 `vlan` 后解析 ④`vlans` 里放两项 `id: 10` 后解析 | ①解析成功并往返相等 ②失败，错误含「端口数」③失败，错误含「不支持 VLAN」④失败 | [CP2-S1](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-004 | 引擎测试 | — | `vlanOf(无 vlan 字段的 lan1)`；解析放行列表 `"10, 20,20"`、`"0"`、`"4095"` | `vlanOf` 返回 `{ mode: 'access', pvid: 1 }`；`"10, 20,20"` → `[10, 20]`；`"0"` / `"4095"` → 非法 | [CP2-S1](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S2 segmentOf 加 VLAN 过滤与二层路径
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-005 | 引擎测试 | 交换机 `port1` access 10 接电脑A、`port2` access 10 接电脑B、`port3` access 20 接电脑C | ①算 A 的网段 ②带 `ignoreVlan` 再算 | ①A 的网段含 B 不含 C ②含 C，且 `dropAt = { 交换机, port3, 'access-pvid' }` | [CP2-S2](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-006 | 引擎测试 | 两台交换机 `port8`–`port8` 相连，两端都 trunk 放行 `[10]` native 1；A 在交换机1 access 20 | ①算 A 的网段 ②只把交换机2 侧改成放行 `[10,20]` 再算 ③两边都放行 20 再算 | ①A 的网段不含交换机2 上任何设备，`dropAt.cause = 'trunk-not-allowed'`，`portId` = 交换机1 `port8` ②丢弃点仍在交换机1 ③网段含交换机2 上 access 20 的设备，路径里交换机1→2 那段 `tagged = true, vlan = 20` | [CP2-S2](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-007 | 引擎测试 | 交换机 `port8` trunk（native 1，放行 10）直连电脑D | 算 VLAN 1 与 VLAN 10 的网段 | D 只出现在 VLAN 1 的网段里；VLAN 10 的走图到 D 时 `dropAt.cause = 'tagged-drop'` | [CP2-S2](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-008 | 引擎测试 | 路由器 `lan1` trunk 放行 `[10,20]`，`vlans` 有 10、20 | ①生成接口表 ②`lan2` 设 access 20 再生成 | ①接口表出现 `br-lan`、`br-lan.10`、`br-lan.20`，三者 MAC 相同、`portIds` 都含 `lan1` ②`br-lan.20.portIds` 含 `lan2` | [CP2-S2](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-009 | 引擎测试 | 交换机1 `port7`、`port8` 分别连交换机2 `port7`、`port8`（都 access 1） | `segmentOf` | `loop` 非空，含两根连线 | [CP2-S2](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-010 | 命令 | — | `pnpm test` | CP1 所有测试通过，无改动 | [CP2-S2](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S3 交换机：MAC 学习、泛洪、环路
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-011 | 引擎测试 | 电脑A、B 接交换机 `port1`、`port2`（默认 VLAN 1），A `192.168.1.10/24` | A ping B `192.168.1.11` | `ok`，五条 decisions：A `originate`、交换机 `forward`（`basis.mac = { learned: {A 的 MAC, port1}, lookup: 'flood', floodPorts: [port2] }`，`portOut = port2`）、B `answer`、交换机 `forward`（`learned: {B 的 MAC, port2}, lookup: 'hit'`）、A `receive`；`path` = [A, 交换机, B, 交换机, A]；所有 `packetIn/Out.vlan = null` | [CP2-S3](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-012 | 引擎测试 | CP1 fixture 中路由器 `lan1` 改接交换机 `port1`，电脑1 接 `port2` | ①电脑1 ping `8.8.8.8` ②再加电脑2 接 `port3`，电脑1 ping 电脑2 | ①`ok`，七条 decisions，交换机两条 ②通，路径不经过路由器 | [CP2-S3](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-013 | 引擎测试 | A 接 access 10 口、C 接 access 20 口（如 T-CP2-005 拓扑），两者同网段地址 | A ping C | `fail`，一条 decision，`VLAN_ISOLATED`，`fixAt = { 交换机, port3 }`，`basis.vlan.dropAt.cause = 'access-pvid'`，文案含「VLAN 20」「VLAN 10」「二层隔离」 | [CP2-S3](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-014 | 引擎测试 | S2 第二条的 trunk 漏放行拓扑（T-CP2-006） | A ping 交换机2 上的 E（同 VLAN 20 同网段） | `TRUNK_NOT_ALLOWED`，`fixAt` = 交换机1 `port8`，文案含「未放行 VLAN 20」 | [CP2-S3](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-015 | 引擎测试 | 成环拓扑（S2 第五条，T-CP2-009） | A ping B（跨两台交换机） | `fail`，`stoppedAt` = 交换机1，`L2_LOOP`，文案含两根连线两端端口名 | [CP2-S3](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-016 | 引擎测试 | 电脑1 接路由器 `lan1`、电脑2 接 `lan2` | 互 ping | 通，路径 [电脑1, 路由器, 电脑2, 路由器, 电脑1]，路由器两条 decision 都是 `forward` 且 `basis.route = null`、`basis.mac` 非空、`note` 含「二层转发」 | [CP2-S3](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S4 无线 AP
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-017 | 引擎测试 | 交换机 `port4` 接 AP `uplink`，电脑3 接 AP `wlan1`，电脑1 接交换机 `port2` | 电脑3 ping 电脑1 | `ok`，路径 [电脑3, AP, 交换机, 电脑1, 交换机, AP, 电脑3]，AP 两条 decision 的 `basis.mac.lookup` 分别 `flood` 与 `hit` | [CP2-S4](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-018 | 引擎测试 | AP `uplink` 接交换机 access 10 口 | ①`wlan1` 电脑 ping 交换机 access 10 的同网段电脑 ②ping 交换机 access 20 的电脑 | ①通 ②`VLAN_ISOLATED` | [CP2-S4](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-019 | 引擎测试 | AP `uplink` 接交换机 trunk 口（native 1，放行 10） | 算 `wlan1` 电脑所在网段 | `wlan1` 电脑只在 VLAN 1 网段里，VLAN 10 对它 `tagged-drop`（AP 透传标签，电脑丢弃） | [CP2-S4](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-020 | 引擎测试 | — | 给 AP `wlan1` 连线；再断开 | 连线后自动出现 `wlan2`；断开后若 `wlan2` 空闲则收回，始终恰好一个空闲 `wlanN` | [CP2-S4](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-021 | 引擎测试 | 电脑3 自动获取，AP 上游是开 DHCP 的路由器 | `buildRuntime` | 电脑3 拿到租约，`serverDeviceId` = 路由器 | [CP2-S4](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S5 光猫：桥接与路由模式、上游接入方式
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-022 | 引擎测试 | 互联网（`dhcp`）`port1` — 光猫（桥接）`wan`，光猫 `lan1` — 路由器 `wan`（`dhcp`），电脑接 `lan1` | 电脑 ping `8.8.8.8` | `ok`，七条 decisions，光猫两条 `forward` 且 `basis.nat = null`、`basis.mac` 非空；路由器 WAN 租约 `203.0.113.2`，`serverDeviceId` = 互联网 | [CP2-S5](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-023 | 引擎测试 | 同 T-CP2-022 拓扑 | 互联网改 `access.mode = pppoe`；电脑 ping `8.8.8.8` | 路由器 `wanLeases.status = 'pppoe-required'`；ping 停在路由器，`PPPOE_REQUIRED`，`fixAt = { 路由器, 'wan.mode' }`，文案含「要求拨号」「自动获取」 | [CP2-S5](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-024 | 引擎测试 | 同 T-CP2-022 拓扑 | 光猫改 `route`（`wan.mode = auto`），互联网 `pppoe`；电脑 ping `8.8.8.8` | 光猫 WAN 租约 `via: 'pppoe'` `203.0.113.2`；路由器 WAN 租约 `192.168.100.100`，`serverDeviceId` = 光猫；ping `ok`，路径 [电脑, 路由器, 光猫, 互联网, 光猫, 路由器, 电脑]，路由器与光猫去程 `basis.nat.direction = 'out'` 各一次，互联网收到的 `srcIp = 203.0.113.2` | [CP2-S5](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-025 | 引擎测试 | 光猫 `route` | 路由器 `wan.mode = pppoe`；电脑 ping `8.8.8.8` | 路由器 `pppoe-rejected`，ping 停在路由器 `PPPOE_REJECTED`，文案含「光猫（路由模式）」 | [CP2-S5](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-026 | 引擎测试 | 光猫桥接，路由器 `dhcp` | 互联网改运营商内网预设（`100.64.0.1/255.192.0.0`）；电脑 ping `8.8.8.8` | 路由器 WAN `100.64.0.2`，`addressClass = 'cgnat'`；ping 仍 `ok`（源在接入网段内，互联网能回程） | [CP2-S5](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-027 | 引擎测试 | 光猫路由模式 | `visitSite(电脑, www.google.com)` | `ok`，DNS 阶段路径 电脑 → 路由器（`originate`，上游 `192.168.100.1`）→ 光猫（`originate`，上游 `8.8.8.8`）→ 互联网 → 光猫 → 路由器 → 电脑 | [CP2-S5](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S6 路由器 WAN 模式与 VLAN 子接口
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-028 | 引擎测试 | 互联网 `pppoe`、光猫桥接、路由器 `wan.mode = pppoe`（账号任意） | `buildRuntime`；电脑 ping `8.8.8.8` | 路由器 WAN 租约 `via: 'pppoe'` `203.0.113.2`，网关 `203.0.113.1`；ping `ok` | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-029 | 引擎测试 | 路由器 `static` `{ 203.0.113.50/24, 网关 203.0.113.1, DNS 8.8.8.8 }` 直连互联网 | ①ping `8.8.8.8` ②网关改 `203.0.113.99` 再 ping | ①无租约、接口地址即静态值，ping 通 ②`ARP_MISS`，文案含「网关」 | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-030 | 引擎测试 | 单臂路由：路由器 `lan1` trunk 放行 `[10,20]`，`vlans` = 10（`192.168.10.1/24`）、20（`192.168.20.1/24`）；交换机 `port1` trunk 放行 `[10,20]` 接 `lan1`，`port2` access 10 接 A（`192.168.10.10/24` 网关 `.1`），`port3` access 20 接 C（`192.168.20.10/24` 网关 `.1`） | A ping C | `ok`，九条 decisions，路径 [A, 交换机, 路由器, 交换机, C, 交换机, 路由器, 交换机, A]；交换机→路由器那条 `packetOut.vlan = 10`，路由器 `portIn = portOut = lan1`、`packetIn.vlan = 10`、`packetOut.vlan = 20`、`basis.route.iface = 'br-lan.20'` | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-031 | 引擎测试 | 同 T-CP2-030 拓扑 | 把交换机 `port1` 放行改成 `[10]`，A ping C | 停在路由器，`TRUNK_NOT_ALLOWED`，`fixAt` = 交换机 `port1` | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-032 | 引擎测试 | 多 LAN 口接法：`lan1` access 10、`lan2` access 20（无 trunk），A 接 `lan1`、C 接 `lan2` | A ping C | 通，路径 [A, 路由器, C, 路由器, A]，路由器 `portIn = lan1, portOut = lan2`，两端 `vlan = null` | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-033 | 引擎测试 | 单臂路由拓扑（T-CP2-030） | A（VLAN 10）ping `8.8.8.8` | 通，路由器出向 NAT `before 192.168.10.10`、`after` 为 WAN 地址 | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-034 | 引擎测试 | 光猫路由模式 + 路由器 | 光猫 LAN 改 `192.168.1.1/24`（与路由器 LAN 同段）；电脑 ping `8.8.8.8` | 路由器 WAN 租约 `192.168.1.100`，路由表 `wanLanOverlap = true`；ping 停在路由器 `WAN_LAN_OVERLAP` | [CP2-S6](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S7 多 DHCP 池
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-035 | 引擎测试 | S6 单臂路由拓扑（T-CP2-030），加 B 接 `port4` access 10 | A、B、C 全改自动获取，`buildRuntime` | A `192.168.10.100`、B `192.168.10.101`（来自 `br-lan.10`），C `192.168.20.100`（来自 `br-lan.20`），网关、DNS 各为所在 VLAN 的子接口地址 | [CP2-S7](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-036 | 引擎测试 | 接 T-CP2-035 | VLAN 20 的 `dhcp.enabled = false` | C 租约 `no-server`，文案含「VLAN 20」；A、B 不受影响 | [CP2-S7](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-037 | 引擎测试 | 路由模式光猫 + 路由器（LAN `192.168.1.1`）+ 电脑自动获取 | `buildRuntime` | 电脑租约来自路由器而不是光猫（不同网段），路由器 WAN 租约来自光猫 | [CP2-S7](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-038 | 引擎测试 | 路由器 DHCP 开 | `lan2` 再接一台开 DHCP 的第二路由器 `lan1`（同 `192.168.1.0/24`，LAN IP `.2`），`buildRuntime` | 电脑租约来自 `devices` 顺序先出现者，`runtime.dhcpConflicts` 含该网段与两台设备 | [CP2-S7](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-039 | 引擎测试 | 接 T-CP2-035 | VLAN 10 池改 `.100`–`.100`，两台自动获取 | 第二台 `pool-exhausted` | [CP2-S7](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S8 新 lint 与场景测试
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-040 | 引擎测试 | fixture `home-office.json`（场景 1 的图） | `lint` | 空数组 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-041 | 引擎测试 | — | ①交换机1 `port8` access 10 — 交换机2 `port8` access 20，`lint` ②改成 trunk（native 1）— access 10，`lint` | ①恰一条 L014，`targets` 两端端口，带 `linkId` ②仍 L014，文案含「VLAN 1」「VLAN 10」 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-042 | 引擎测试 | S2 第二条 trunk 漏放行拓扑（T-CP2-006） | `lint`；两边放行后再 `lint` | L015 error，`targets[0]` = 交换机1 `port8`；两边放行后消失 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-043 | 引擎测试 | — | ①交换机 trunk 口直连电脑，`lint` ②成环拓扑，`lint` | ①L016 ②L017 error 且 `targets` 含两根连线 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-044 | 引擎测试 | 光猫路由模式 + 路由器 | ①路由器 NAT 开，`lint` ②路由器 NAT 关，`lint` ③光猫改桥接，`lint` | ①L018，`targets = [{ 路由器, field: 'nat' }]` ②无 L018 ③无 L018 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-045 | 引擎测试 | — | ①S7 双 DHCP 拓扑（T-CP2-038），`lint` ②互联网运营商内网预设，`lint` ③互联网 `pppoe` + 路由器 `dhcp`，`lint` | ①L019 一条，`targets` 两台设备 ②L020 定位路由器 `wan` ③L021 error 文案含「要求拨号」 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-046 | 引擎测试 | — | ①光猫 LAN 与路由器 LAN 同段 ②`vlans` 里 VLAN 10 `192.168.1.1/24` 与 LAN 重叠 ③`static` 网关不在段内 ④VLAN 20 池填 `192.168.10.100–199`，各自 `lint` | ①L022 ②L023 ③L024 ④L008 定位到 VLAN 20 行 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-047 | 命令 | — | `pnpm test` | 通过；`scenarios/cp2.test.ts` 三个 `it` 与阶段完成标准场景 1–3 同名，断言 `verdict`、`path`、`reasonCode`、lint 编号 | [CP2-S8](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S9 新节点与表单
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-048 | 页面操作 | — | ①拖「交换机」②表单口数改 16 ③改 4 但 `port6` 有连线 | ①横向节点，底边 `port1`–`port8`，第二行 `8 口 · VLAN 1` ②节点变宽、`port16` 出现 ③红字 `port6 有连线`，不改 | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-049 | 页面操作 | 接 T-CP2-048 | ①交换机表单勾选 `port2`、`port3`，批量设置 access VLAN 10 ②`port1` 设 trunk 放行 `10,20` | ①两行 PVID 变 10，节点两个柄下出现 `10` ②柄下 `T`，第二行 `8 口 · VLAN 1,10,20` | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-050 | 页面操作 | — | 拖「无线 AP」；连一台电脑到 `wlan1` | 顶边 `uplink`、底边 `wlan1`，第二行 `Home-WiFi`；连线后出现 `wlan2` | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-051 | 页面操作 | — | 拖「光猫」；切「路由」 | 顶 `wan` 底 `lan1`，第二行「桥接」，表单只有名称与模式；切「路由」后展开 WAN 接入、LAN、DHCP，第二行变「路由 192.168.100.1」 | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-052 | 页面操作 | — | ①路由器表单 WAN 模式选「拨号」，账号留空失焦 ②VLAN 表点「添加 VLAN」③LAN 口表把 `lan1` 设 trunk 放行 `2` | ①出现账号、密码，账号空红字「必填」②新行 VLAN 2 `192.168.2.1/24`，节点第二行 `+1 VLAN` ③柄下 `T` | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-053 | 页面操作 | — | ①互联网表单点「运营商内网」②方式选「拨号」 | ①接入四项变 `100.64.0.1 / 255.192.0.0 / 100.64.0.2–100.64.0.254`，节点第二行 `100.64.0.1/10 · 内网` ②追加 `· 拨号` | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-054 | 页面操作 | 静态检查里存在定位到端口的问题（如 L015） | 点该条 | 设备选中，端口表对应行高亮 | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-055 | 页面操作 | 完成以上改动 | 刷新页面；导出再导入 | 刷新后全部保留；导入后一致 | [CP2-S9](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### CP2-S10 画布批量操作与撤销
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-056 | 页面操作 | — | ①`Shift` + 空白处拖矩形框住 3 个节点 ②不按 `Shift` 拖空白 | ①三个都高亮，右侧面板「已选 3 项」②平移画布，不选中 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-057 | 页面操作 | 接 T-CP2-056（已选 3 个节点） | 拖其中一个节点 | 三个一起移动，连线跟随；松手位置对齐 16px 网格 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-058 | 页面操作 | 已选 3 个节点 | 点「顶」；点「横向等距」 | 「顶」后三个节点上边缘对齐到最上者；「横向等距」后三者水平间距相等，最左最右不动 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-059 | 页面操作 | 已选 3 个节点 | ①按 `Delete` ②`Ctrl/Cmd + Z` ③`Ctrl/Cmd + Shift + Z` | ①三个节点及其全部连线消失 ②全部回来，位置与连线一致 ③再次删除 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-060 | 页面操作 | — | 连续做 5 次操作（拖、改字段、连线、删线、对齐），期间移动视口、点选节点，然后连按 5 次撤销 | 逐步回到起点；移动视口、点选节点不消耗撤销步数 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-061 | 页面操作 | 接 T-CP2-060（已撤销） | 刷新页面 | 保持撤销后的状态；重做栈丢失可接受 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-062 | 页面操作 | — | ①`Ctrl/Cmd + A` ②「新建」后 `Ctrl/Cmd + Z` | ①所有节点选中 ②图回来 | [CP2-S10](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

### 阶段完成标准
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP2-063 | 页面操作 | 「新建」空画布 | 按 CP2『阶段完成标准』场景 1 的 9 步操作：拖入 互联网、光猫、路由器、交换机、无线 AP、电脑 ×3；连线 互联网 `port1` – 光猫1 `wan`、光猫1 `lan1` – 路由器1 `wan`、路由器1 `lan1` – 交换机1 `port1`、交换机1 `port2` – 电脑1 `eth0`、`port3` – 电脑2 `eth0`、`port4` – AP1 `uplink`、AP1 `wlan1` – 电脑3 `eth0`；互联网接入方式选「拨号」，光猫1 保持「桥接」，路由器1 WAN 模式选「拨号」账号 `test` 密码 `test`；点电脑1 / 2 / 3；点空白；「验证」ping 起点 电脑3 目标 `192.168.1.100`；ping 起点 电脑1 目标 `8.8.8.8`；访问网站 起点 电脑3 域名 `www.google.com`；「导出」 | 出现「互联网」「光猫1」「路由器1」「交换机1」「AP1」「电脑1」「电脑2」「电脑3」；路由器1 WAN 状态「拨号成功 203.0.113.2」；电脑1 / 2 / 3 都是自动获取，分别「已获取 192.168.1.100 / .101 / .102 … 来自 路由器1」；静态检查「没有问题」；ping `192.168.1.100` 通，路径 电脑3 → AP1 → 交换机1 → 电脑1 → 交换机1 → AP1 → 电脑3，AP1 与交换机1 的 note 含「学习」和「泛洪」或「命中」；ping `8.8.8.8` 通，路径 电脑1 → 交换机1 → 路由器1 → 光猫1 → 互联网 → 光猫1 → 路由器1 → 交换机1 → 电脑1，路由器1 去程 note 含「192.168.1.100 → 203.0.113.2」，光猫1 两行 note 含「二层转发」；访问网站成功；导出 JSON 与引擎 fixture `home-office.json` 结构一致 | [CP2 阶段完成标准](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-064 | 页面操作 | 接场景 1（T-CP2-063） | 按 CP2『阶段完成标准』场景 2 的 6 步操作：点光猫1，模式切「路由」（WAN 接入保持「跟随上游」）；点空白看静态检查，ping 电脑1 → `8.8.8.8` 并点「定位」；点路由器1，WAN 模式改「自动获取」；点空白看静态检查并点该条；ping 电脑1 → `8.8.8.8`；光猫1 切回「桥接」，路由器1 WAN 改回「拨号」 | 光猫1 WAN 状态「拨号成功 203.0.113.2」，节点第二行「路由 192.168.100.1」；静态检查一条 error「路由器1 · 路由器1 在拨号，但 光猫1 不接受拨号」；ping 不通，断在路由器1，原因含「不接受拨号」，「定位」→ 路由器1 WAN 模式高亮；改自动获取后 WAN 状态「已获取 192.168.100.100」；静态检查一条 warning「路由器1 · 路由器1 与 光猫1 都在做 NAT（双层 NAT）…」，点它 → 路由器1 选中，NAT 开关高亮；再 ping 通，路径 电脑1 → 交换机1 → 路由器1 → 光猫1 → 互联网 → 光猫1 → 路由器1 → 交换机1 → 电脑1，路由器1 去程 note 含「192.168.1.100 → 192.168.100.100」，光猫1 去程 note 含「192.168.100.100 → 203.0.113.2」；切回后静态检查「没有问题」 | [CP2 阶段完成标准](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-065 | 页面操作 | 「新建」空画布 | 按 CP2『阶段完成标准』场景 3 的 12 步操作：拖入 交换机、电脑 ×3，连 交换机1 `port2` – 电脑1、`port3` – 电脑2、`port4` – 电脑3；交换机1 表单 `port2`、`port3` 批量设 access VLAN 10，`port4` 设 access VLAN 20；三台电脑改手动 电脑1 `192.168.1.10/24`、电脑2 `192.168.1.11/24`、电脑3 `192.168.1.20/24`，网关、DNS 留空；ping 电脑1 → `192.168.1.11`；ping 电脑1 → `192.168.1.20` 并点「定位」；拖入 路由器、互联网，连 路由器1 `lan1` – 交换机1 `port1`、路由器1 `wan` – 互联网 `port1`，路由器1 VLAN 表添加 VLAN 10（`192.168.10.1/24`，DHCP 开）、VLAN 20（`192.168.20.1/24`，DHCP 开），LAN 口表 `lan1` 设 trunk 放行 `10,20`，交换机1 `port1` 设 trunk 放行 `10,20`；三台电脑改回自动获取；点空白；ping 电脑1 → `192.168.20.100`；ping 电脑1 → `192.168.10.101`；交换机1 `port1` 放行改为 `10`，再 ping 电脑1 → `192.168.20.100` 并点「定位」；放行改回 `10,20`，ping 电脑1 → `8.8.8.8` | 柄下出现 `10` `10` `20`；ping `192.168.1.11` 通，路径 电脑1 → 交换机1 → 电脑2 → 交换机1 → 电脑1；ping `192.168.1.20` 不通，断在电脑1，原因「192.168.1.20（电脑3）在 VLAN 20，本机发出的包在 VLAN 10，二层隔离，需要路由器转发」，「定位」→ 交换机1 选中、端口表 `port4` 行高亮；改回自动获取后 电脑1 `192.168.10.100`、电脑2 `192.168.10.101`（来自 路由器1），电脑3 `192.168.20.100`；静态检查「没有问题」；ping `192.168.20.100` 通，路径 电脑1 → 交换机1 → 路由器1 → 交换机1 → 电脑3 → 交换机1 → 路由器1 → 交换机1 → 电脑1，路由器1 去程 note 含「VLAN 10」「VLAN 20」；ping `192.168.10.101` 通，路径不经过路由器1；放行改 `10` 后静态检查 error「VLAN 20 两侧都有设备，但 交换机1 port1 未放行」，ping `192.168.20.100` 不通，断在路由器1，原因含「未放行 VLAN 20」，「定位」→ 交换机1 `port1` 行高亮；放行改回后 ping `8.8.8.8` 通 | [CP2 阶段完成标准](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |
| T-CP2-066 | 命令 | — | 按 CP2『阶段完成标准』场景 4 操作：`pnpm test` | 通过；`scenarios/cp2.test.ts` 场景 1–3 各一条 `it`，断言路径、`reasonCode`、`fixAt`、lint 编号与场景文字一致；场景 1 断言 `home-office.json` 往返相等 | [CP2 阶段完成标准](checkpoints/CP2-switching-and-devices.md) | ✅ 通过 |

---

## CP3 路径追踪与动画

来源：[CP3-trace-and-animation.md](checkpoints/CP3-trace-and-animation.md)

### CP3-S1 traceroute 引擎入口
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-001 | 引擎测试 | CP1 fixture 拓扑 | `traceroute(电脑1, '8.8.8.8')` | `verdict: 'ok'`，`hops` 两条：`{ hop: 1, 路由器1, ip: '192.168.1.1', ttlIn: 64, through: [] }`、`{ hop: 2, 互联网, ip: '8.8.8.8', ttlIn: 63 }`；`decisions` 与 `ping` 同参数结果深等于；`summary` 为「电脑1 → 8.8.8.8 共 2 跳」 | [CP3-S1](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-002 | 引擎测试 | CP1 fixture 拓扑 | `traceroute(电脑1, '192.168.1.1')` | 一跳，`ip: '192.168.1.1'`，`ttlIn: 64` | [CP3-S1](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-003 | 引擎测试 | CP1 fixture 拓扑 | 断开 `wan` 连线再 traceroute `8.8.8.8` | `fail`，`hops` 一条 `{ hop: 1, 路由器1, status: 'stop' }`，`reasonCode: NO_ROUTE`，`summary` 含「第 1 跳失败」 | [CP3-S1](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-004 | 引擎测试 | CP1 fixture 拓扑 | 电脑1 手动网关 `10.0.0.1`，traceroute | `fail`，`hops` 为空数组，`reasonCode: GATEWAY_OFF_SUBNET` | [CP3-S1](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-005 | 引擎测试 | — | 构造一条去程里含 TTL 不变的中间 decision（模拟 CP2 交换机，手工拼 decisions 传给派生函数） | 该设备不成跳，出现在下一跳的 `through` | [CP3-S1](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-006 | 引擎测试 | — | 检查 `ping` / `visitSite` 的结果 | `hops` 为 `null` | [CP3-S1](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S2 网页测试框架与时间线模型
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-007 | 命令 | — | 根目录 `pnpm test` | 引擎与网页两个包的测试都跑，退出码 0 | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-008 | 网页测试 | fixture ping `8.8.8.8` 的结果 | `buildTimeline` | 5 个 dwell、4 个 travel、0 个 gap；片段首尾相接（每段 `startMs` 等于上一段 `endMs`），首段 0 起，末段 `endMs === totalMs`；`marks` 长 5 且每个 `atMs` 等于对应 dwell 的 `startMs` | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-009 | 网页测试 | 接 T-CP3-008 | 检查每个 travel | `toDeviceId` 等于下一条 decision 的 `deviceId`；`linkId` 等于该 decision 的 `linkId` | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-010 | 网页测试 | fixture `visitSite('www.google.com')` 的结果 | `buildTimeline` | 恰好 1 个 gap，位于 `phase` 从 `dns` 变 `tcp` 的两个 dwell 之间，`deviceId` 为电脑1 | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-011 | 网页测试 | 接 T-CP3-010 | 检查路由器 DNS 转发那条 `originate`（`packetIn` 非空）与起点 `originate` 的 dwell | 前者 `style: 'renew'`；后者 `style: 'normal'` | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-012 | 网页测试 | — | ①网关配错的失败结果 `buildTimeline` ②NAT 关闭的失败结果 `buildTimeline` | ①仅 1 个 dwell，`style: 'stop'`，无 travel ②3 个 dwell、2 个 travel，末段 `stop` | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-013 | 网页测试 | — | 手工拼 32 条 decision 的结果 `buildTimeline` | `totalMs === 30000`，各片段比例与基准一致 | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-014 | 网页测试 | — | 对时间线 `t`：`segmentAt(t, 0)`、`segmentAt(t, totalMs)`、`seekToSeq(t, 3)` | `segmentAt(t, 0)` 是首段；`segmentAt(t, totalMs)` 是末段；`seekToSeq(t, 3)` 返回第 3 条的 dwell 起点 | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-015 | 网页测试 | — | 用 travel 对端与下一条 `deviceId` 不一致的手工数据 `buildTimeline` | 以连线为准，返回结果带 `warnings[]`，不抛错 | [CP3-S2](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S3 动画状态与画布包标记
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-016 | 页面操作 | fixture 图 | 验证 ping `8.8.8.8` | 弹窗关闭后蓝色圆点从电脑1 出现，停一下，沿 `eth0 – lan1` 线移到路由器1，停，沿 `wan – port1` 到互联网，停，再原路返回电脑1，最后停住不动；全程约 7 s | [CP3-S3](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-017 | 页面操作 | ping `8.8.8.8` 播放中 | 拖动路由器1 节点 | 圆点跟着新的线走，不跳到旧位置 | [CP3-S3](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-018 | 页面操作 | ping `8.8.8.8` 播放中 | 滚轮缩放、拖空白平移 | 圆点始终贴在线上或节点中心 | [CP3-S3](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-019 | 页面操作 | ping `8.8.8.8` 播完 | 查看节点角标与连线 | 路由器1 角标显示 `2 · 4`，电脑1 `1 · 5`，互联网 `3`；两根线都是高亮色 | [CP3-S3](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-020 | 页面操作 | 接 T-CP3-019 | 验证 ping `192.168.1.1` | 只走一根线来回；上一次的角标和高亮先清掉 | [CP3-S3](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-021 | 网页测试 | — | `store` 收到 `lastProbe` | `trace.timeline` 非空、`cursorMs === 0`、`playing === true` | [CP3-S3](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S4 播放控件
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-022 | 页面操作 | fixture 图 | 验证 ping `8.8.8.8` | 画布底部出现播放条，进度条上 5 个刻度，播放中滑块前进；播完按钮变回 ▶ | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-023 | 页面操作 | ping `8.8.8.8` 播放中 | 点 ⏸；再点 ▶ | 圆点停住；再点 ▶ 后从停的位置继续 | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-024 | 页面操作 | ping `8.8.8.8` 结果已加载 | 滑块拖到最左并暂停，点 ⏭ 三次；再点 ⏮ 一次 | 圆点依次停在路由器1、互联网、路由器1（回程）的中心；⏮ 后回到互联网 | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-025 | 页面操作 | ping `8.8.8.8` 结果已加载 | 速度切 2× 播放；切 0.5× 播放 | 2× 整趟约 3.5 s；0.5× 约 14 s | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-026 | 页面操作 | ping `8.8.8.8` 结果已加载 | 把滑块拖到进度条中段松手；再拖到最右 | 中段：圆点停在对应位置，不自动播放；最右：圆点停在电脑1，与播完状态一致 | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-027 | 页面操作 | ping `8.8.8.8` 结果已加载 | ①点画布空白后按空格 ②按 `→` `←` ③在配置面板输入框里按空格 | ①播放 / 暂停切换 ②单步 ③只输入空格 | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-028 | 页面操作 | ping `8.8.8.8` 结果已加载 | 点 ✕ | 圆点、角标、高亮消失，播放条隐藏，结果面板的结论与列表仍在 | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-029 | 页面操作 | fixture 图 | 访问网站 `www.google.com` | 进度条中间一道分隔线，左段紫色、右段绿色；圆点过分隔线时在电脑1 上停一下并换色 | [CP3-S4](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S5 逐跳列表与同步
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-030 | 页面操作 | fixture 图 | 验证 ping `8.8.8.8`，播放中观察逐跳列表 | 高亮行随圆点推进：圆点在路由器1 时第 2 行亮，回程到路由器1 时第 4 行亮 | [CP3-S5](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-031 | 页面操作 | 接 T-CP3-030，已暂停 | 点第 3 行；点该行行尾的定位图标 | 圆点跳到互联网中心，第 3 行亮，设备未被选中、面板仍是结果面板；点定位图标后互联网选中并居中 | [CP3-S5](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-032 | 页面操作 | 把浏览器窗口压矮到列表出滚动条 | 从头播放 | 高亮行始终在可视区内 | [CP3-S5](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-033 | 页面操作 | ping `8.8.8.8` 播放中 | 点路由器1 节点；再点空白回到结果面板 | 面板切到配置表单，圆点继续走；回到结果面板后高亮行与圆点位置一致 | [CP3-S5](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-034 | 页面操作 | fixture 图 | 验证类型选 traceroute，起点 电脑1，目标 `8.8.8.8`；点跳数表第 1 行 | 结论「电脑1 → 8.8.8.8 共 2 跳」，跳数表两行 `1 路由器1 192.168.1.1 64`、`2 互联网 8.8.8.8 63`，下方逐跳列表与 ping 相同 5 行；点第 1 行后圆点到路由器1 | [CP3-S5](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-035 | 页面操作 | fixture 图 | 断开 `wan` 线再 traceroute | 跳数表一行红 `1 路由器1`，结论含「第 1 跳失败」 | [CP3-S5](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S6 包头查看
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-036 | 网页测试 | — | ①`diffPacket` 对 fixture NAT 出向那一跳的 `packetIn` / `packetOut` ②对两侧相同的包 ③对一侧为 `null` 的包 | ①返回 `['srcMac', 'dstMac', 'srcIp', 'ttl']`，不含 `dstIp`、`l4.icmpId`（echo id 未被占用时不变）②空数组 ③空数组 | [CP3-S6](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-037 | 页面操作 | fixture 图，ping `8.8.8.8` | 点第 2 行「包头」 | 模态框标题「第 2 跳 · 路由器1 · 转发」；三层区左列源 IP `192.168.1.100`、右列 `203.0.113.2` 高亮；TTL 左 64 右 63 高亮；四层区协议 ICMP、类型 请求、id 左右都是 1（未被占用时不变）；VLAN 区不显示 | [CP3-S6](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-038 | 页面操作 | 接 T-CP3-037 | 点「下一跳」；再点「下一跳」 | 第 3 跳 互联网 · 应答，左列目的 IP `8.8.8.8`、右列源 IP `8.8.8.8`，类型 请求 → 应答；再下一跳为第 4 跳 NAT 还原，右列目的 IP `192.168.1.100` 高亮 | [CP3-S6](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-039 | 页面操作 | fixture 图，ping `8.8.8.8` | 点第 1 行「包头」；点第 5 行「包头」 | 第 1 行只有「出」一列；第 5 行只有「进」一列 | [CP3-S6](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-040 | 页面操作 | fixture 图 | 访问网站，打开 DNS 阶段路由器1 的「重新发出」那一跳的包头 | 顶部一行「路由器以自己的地址重新发起查询」，源 IP、目的 IP、源端口、MAC 全部高亮 | [CP3-S6](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-041 | 页面操作 | 播放中 | 打开模态框；按 `Esc`；点画布上的圆点 | 打开时圆点停住；`Esc` 关闭；点圆点打开当前 `seq` 的包头 | [CP3-S6](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S7 解释文案
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-042 | 网页测试 | fixture ping `8.8.8.8` 的 5 条 decision | 依次 `explain` | title 依次：`从 eth0 发出`、`转发并做 NAT，从 wan 发出`、`收到 ping 请求，应答`、`NAT 还原后转发，从 lan1 发出`、`收到应答，结束` | [CP3-S7](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-043 | 网页测试 | 接 T-CP3-042 | 检查第 1 条、第 2 条的 lines | 第 1 条 lines 含 `查路由表：命中默认路由 0.0.0.0/0，下一跳 192.168.1.1，从 eth0 发出` 与 `ARP：192.168.1.1 → 02:00:00:00:00:03`；第 2 条 lines 含 `NAT：192.168.1.100:1 → 203.0.113.2:1` 与 `TTL 64 → 63` | [CP3-S7](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-044 | 网页测试 | — | ①`explain` 网关配错的 stop decision ②`explain` 未知 `reasonCode: 'X'` 的 decision | ①title `网关不可达`，lines 首行等于 decision.reason ②title `验证终止` | [CP3-S7](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-045 | 网页测试 | — | `explain` DNS 阶段路由器 `originate` | title `作为 DNS 转发器，向上游 8.8.8.8 重新发起查询`，lines 含 `DNS 转发：www.google.com → 上游 8.8.8.8` | [CP3-S7](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-046 | 网页测试 | — | `explain` 手工拼 `basis: { route: null, arp: …, tunnel: {…} }` 的 forward | 不抛错，title 回落为 `note` | [CP3-S7](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-047 | 页面操作 | 已有验证结果 | 查看结果面板逐跳列表；点行首 ▸ | 每行显示上述 title；展开看到 lines | [CP3-S7](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### CP3-S8 失败呈现与作废处理
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-048 | 页面操作 | CP1 场景 2（电脑1 网关 `10.0.0.1`） | ping `8.8.8.8` | 圆点在电脑1 上变红不动；电脑1 红描边；气泡标题「网关不可达」，正文「网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关」，按钮「定位」；两根线都是默认样式；进度条只有 1 个刻度 | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-049 | 页面操作 | 接 T-CP3-048 | 点气泡「定位」 | 电脑1 选中，网关字段高亮 | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-050 | 页面操作 | CP1 场景 3（NAT 关） | ping `8.8.8.8`；点「定位」 | 圆点走到互联网变红；互联网红描边；`eth0 – lan1`、`wan – port1` 高亮；气泡标题「无法回程」；「定位」跳到路由器1 的 NAT 开关 | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-051 | 页面操作 | 播放中 | 把路由器1 的 DHCP 关掉；点「重新验证」 | 圆点、角标、高亮立即消失，播放条隐藏；结果面板顶部横幅「拓扑已改动，结果可能失效」+「重新验证」；点「重新验证」后重跑同一 ping，新结果播放 | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-052 | 页面操作 | 播放中 | 拖动电脑1 位置 | 不出横幅，动画继续 | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-053 | 页面操作 | 播放中 | 删除互联网节点；再删电脑1 | 横幅出现，无控制台报错；再删电脑1 后「重新验证」禁用，横幅「起点设备已删除」 | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-054 | 网页测试 | — | ①改变 `topologyRevision` ②只改变 `position` | ①`trace.stale === true`、`playing === false` ②不改 `stale` | [CP3-S8](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

### 阶段完成标准
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP3-055 | 页面操作 | 按 CP1 场景 1 搭好图（电脑1 自动获取、路由器1 DHCP 与 NAT 开、两根线） | 按 CP3『阶段完成标准』场景 1 的 6 步操作：「验证」ping 起点 电脑1 目标 `8.8.8.8`；观察逐跳列表；点 ⏸，点 ⏭ 到第 2 跳，点该行「包头」并展开该行；「下一跳」两次到第 4 跳；关闭模态框，速度 2×，▶ | 弹窗关闭，画布底部出现播放条，蓝色圆点从电脑1 出发依次停 路由器1 → 互联网 → 路由器1 → 电脑1，两根线变高亮，约 7 s 播完；逐跳 5 行 title 依次「从 eth0 发出」「转发并做 NAT，从 wan 发出」「收到 ping 请求，应答」「NAT 还原后转发，从 lan1 发出」「收到应答，结束」，播放中高亮行跟着圆点走；第 2 跳模态框左列源 IP `192.168.1.100`、右列 `203.0.113.2` 两格高亮，TTL `64` → `63` 高亮，展开该行看到「NAT：192.168.1.100:1 → 203.0.113.2:1」；第 4 跳右列目的 IP `192.168.1.100` 高亮，title「NAT 还原后转发」；2× 约 3.5 s 播完，路由器1 角标 `2 · 4` | [CP3 阶段完成标准](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-056 | 页面操作 | 接场景 1（T-CP3-055） | 按 CP3『阶段完成标准』场景 2 的 4 步操作：电脑1 改手动 IP `192.168.1.10`，掩码 `255.255.255.0`，网关 `10.0.0.1`，DNS `192.168.1.1`；「验证」ping `8.8.8.8`；查看逐跳列表并展开首行；点气泡「定位」；网关改回 `192.168.1.1`，点「重新验证」 | 圆点在电脑1 上直接变红不移动，电脑1 红描边，气泡标题「网关不可达」，正文「网关 10.0.0.1 不在本机网段 192.168.1.0/24，无法把包交给网关」，两根线保持默认样式，进度条 1 个刻度；逐跳列表 1 行红底，title「网关不可达」，展开首行为同一段正文；「定位」→ 电脑1 选中，网关字段高亮；改回网关后横幅「拓扑已改动，结果可能失效」，「重新验证」→ 通，重新播放 | [CP3 阶段完成标准](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-057 | 页面操作 | 接场景 2 末（T-CP3-056，已改回网关） | 按 CP3『阶段完成标准』场景 3 的 3 步操作：「验证」类型 traceroute，起点 电脑1，目标 `8.8.8.8`；点跳数表第 2 行；删掉 `wan – port1` 连线，点「重新验证」 | 结论「电脑1 → 8.8.8.8 共 2 跳」，跳数表 `1 路由器1 192.168.1.1 64`、`2 互联网 8.8.8.8 63`，下方逐跳与 ping 相同 5 行，动画照常播完整往返；点第 2 行 → 圆点跳到互联网并暂停；删线后横幅出现，「重新验证」→ 结论「电脑1 → 8.8.8.8 第 1 跳失败」，跳数表一行红 `1 路由器1`，圆点在路由器1 变红，气泡「没有路由」+ CP1 的 `NO_ROUTE` 文案 | [CP3 阶段完成标准](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |
| T-CP3-058 | 命令 | — | 按 CP3『阶段完成标准』「引擎与网页自动测试」操作：`pnpm test` | 引擎、网页两个包都通过；`scenarios/cp3.test.ts` 含场景 1、3 的 traceroute 断言；`trace/timeline.test.ts` 与 `trace/explain.test.ts` 含场景 1、2 的时间线形状与 title 断言 | [CP3 阶段完成标准](checkpoints/CP3-trace-and-animation.md) | ✅ 通过 |

---

## CP4 分区与边界

> 历史方案：以下 53 条用例待按 2026-09-07 新方向修订，不作为当前 CP4 完成依据。替换时保留编号历史与迁移对应关系。

来源：[CP4-zones-and-border.md](checkpoints/CP4-zones-and-border.md)

### CP4-S1 分区模型与 gfw 设备类型
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-001 | 引擎测试 | 空拓扑 | `createDevice(topology, 'gfw', pos)` | 端口两个，名 `inside`、`outside`；`config` 深等于 CP4 关键设计 3.2 的默认规则集 | [CP4-S1](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-002 | 引擎测试 | — | `parseTopology` 读 `fixtures/gfw-home.json` | 成功，设备 4 台、连线 3 根 | [CP4-S1](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-003 | 引擎测试 | gfw-home | 把 gfw 的端口名改成 `wan` 再 `parseTopology` | 失败，错误信息含「端口名」 | [CP4-S1](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-004 | 引擎测试 | gfw-home | `protocolDetection` 写成 `'max'`、`ipBlacklist` 写成 `['1.2.3']`，分别 `parseTopology` | 都失败，错误信息分别含「协议识别等级」「不是合法的 IP」 | [CP4-S1](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-005 | 引擎测试 | gfw-home 与 CP2 的 home-office | `zonesOf(topology)` | gfw-home：电脑1 `lan`、路由器1 `lan`、长城防火墙1 `border`、互联网 `internet`；home-office：光猫1 `isp` | [CP4-S1](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-006 | 引擎测试 | CP1 fixture（没有 gfw） | `parseTopology(MINIMAL_RAW)` 后 `buildRuntime` | 解析成功，`runtime.border === null` | [CP4-S1](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S2 目标网站库扩充与可编辑
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-007 | 引擎测试 | — | 检查 `defaultInternetConfig().targets` | 10 条，域名与 IP 与 CP4 关键设计 2.2 表逐行一致；`region: 'cn'` 4 条、`overseas` 6 条；`dnsServer` 恰好 `dns.alidns.com` 与 `dns.google` 两条 | [CP4-S2](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-008 | 引擎测试 | — | 检查 `defaultInternetConfig().access.dns` | 等于 `'223.5.5.5'` | [CP4-S2](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-009 | 引擎测试 | gfw-home | `regionOfIp` 依次查 `142.250.72.14`、`110.242.68.66`、`192.168.1.1` | 依次得 `'overseas'`、`'cn'`、`null` | [CP4-S2](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-010 | 引擎测试 | gfw-home | 把 `www.baidu.com` 的 IP 改成 `142.250.72.14`，跑 `lint` | L027 error，文案含「出现两次」，定位互联网 | [CP4-S2](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-011 | 引擎测试 | gfw-home | ①新增一条 `domain: ''` 的目标 ②新增一条 `ip: '999.1.1.1'` 的目标，各跑 `lint` | 都报 L027 error；②的文案含「不是合法的 IP 地址」 | [CP4-S2](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-012 | 引擎测试 | gfw-home 未改动 | 跑 `lint` | 不报 L027 | [CP4-S2](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S3 边界一跳与拦截判定
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-013 | 引擎测试 | gfw-home | `ping(电脑1, '110.242.68.66')` | `ok`；decisions 里长城防火墙1 出现两次（去 + 回），两条都 `action: 'forward'`、`basis.route === null`、`packetIn.ttl === packetOut.ttl`、`basis.border.matched === 'none'`、`targetRegion === 'cn'` | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-014 | 引擎测试 | gfw-home | `ping(电脑1, '142.250.72.14')` | `fail`，`reasonCode: 'GFW_IP_BLOCKED'`，`stoppedAt` 是长城防火墙1，`reason` 含「IP 黑名单」，`fixAt.field === 'ipBlacklist'` | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-015 | 引擎测试 | gfw-home | `ping(电脑1, '20.205.243.166')`（GitHub） | `ok`；边界那跳 `basis.border.matched === 'none'`、`targetRegion === 'overseas'` | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-016 | 引擎测试 | gfw-home | `visitSite(电脑1, 'chatgpt.com')` | `fail`，`reasonCode: 'GFW_SNI_BLOCKED'`，停在长城防火墙1；该跳 `packetIn.sni === 'chatgpt.com'`、`basis.border.rule === 'chatgpt.com'`；`dns.ip === '104.18.32.47'` 且 `poisoned` 非真 | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-017 | 引擎测试 | gfw-home | 把 gfw 的 `sniBlock` 关掉，再 `visitSite(电脑1, 'chatgpt.com')` | `ok` | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-018 | 引擎测试 | gfw-home | 把 gfw 的 `enabled` 关掉，再 `ping(电脑1, '142.250.72.14')` | `ok`；边界那跳 `basis.border.enabled === false`，`note` 含「防火墙已关闭」 | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-019 | 引擎测试 | gfw-home | `traceroute(电脑1, '110.242.68.66')` | 两跳（路由器1、互联网）；长城防火墙1 出现在第 2 跳的 `through` 里 | [CP4-S3](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S4 DNS 污染与 dnsQuery 入口
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-020 | 引擎测试 | gfw-home，电脑1 自动获取（上游 `223.5.5.5`） | `visitSite(电脑1, 'www.google.com')` | `fail`，`reasonCode: 'DNS_POISONED'`，停在长城防火墙1；`dns` 为 `{ server: '192.168.1.1', domain: 'www.google.com', ip: '243.185.187.39', realIp: '142.250.72.14', poisoned: true }`；互联网那条 DNS 应答 decision 的 `basis.border.matched === 'poisoned-answer'` | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-021 | 引擎测试 | gfw-home，电脑1 改静态、DNS 填 `8.8.8.8` | `visitSite(电脑1, 'www.google.com')` | `fail`，`reasonCode: 'DNS_POISONED'`；污染发生在长城防火墙1 那条 decision，`action: 'answer'`、`verdict: 'pass'`、`basis.border.matched === 'poison'` | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-022 | 引擎测试 | gfw-home | `dnsQuery(电脑1, 'www.google.com')` | `kind: 'dnsQuery'`、`verdict: 'ok'`、`hops === null`；`summary` 含「243.185.187.39」与「真实 142.250.72.14」 | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-023 | 引擎测试 | gfw-home | `dnsQuery(电脑1, 'github.com')` | `dns.ip === '20.205.243.166'`，`poisoned` 非真，`summary` 不含「污染」 | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-024 | 引擎测试 | gfw-home | ①`dnsQuery(电脑1, 'chatgpt.com')` ②`dnsQuery(电脑1, 'nowhere.com')` | ①`poisoned` 非真（不在污染名单） ②`fail`，`reasonCode: 'DNS_NXDOMAIN'` | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-025 | 引擎测试 | gfw-home，关掉 `dnsPoison.enabled` | `visitSite(电脑1, 'www.google.com')` | `fail` 但 `reasonCode: 'GFW_IP_BLOCKED'`（DNS 正常，改由 IP 黑名单拦），`dns.poisoned` 非真 | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-026 | 引擎测试 | gfw-home，关掉 gfw 的 `enabled` | `visitSite(电脑1, 'www.google.com')` | `ok`，`dns.ip === '142.250.72.14'`，`poisoned` 非真 | [CP4-S4](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S5 静态检查 L025–L028
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-027 | 引擎测试 | gfw-home，电脑1 改静态 DNS `8.8.8.8` | 跑 `lint` | L025 warning，文案含「在境外」「会在边界被污染」，定位电脑1 字段 dns | [CP4-S5](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-028 | 引擎测试 | 接 T-CP4-027，再把 gfw 的 `dnsPoison.enabled` 关掉 | 跑 `lint` | 不报 L025 | [CP4-S5](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-029 | 引擎测试 | gfw-home 原样 | 跑 `lint` | L026 报 4 条 warning（Google、YouTube、Telegram、ChatGPT），文案分别含「IP 黑名单」「域名黑名单」；GitHub 不在其中 | [CP4-S5](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-030 | 引擎测试 | gfw-home | ①删掉 gfw，路由器 `wan` 直连互联网 ②在①基础上再加一台启用的 gfw 串进去、另一台放在旁边也启用，各跑 `lint` | ①L028 warning 含「不经过长城防火墙」 ②L028 另报一条含「只有 长城防火墙1 生效」 | [CP4-S5](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-031 | 引擎测试 | gfw-home | 断开 gfw 的 `outside` 连线，跑 `lint` | L009 warning 含「outside 没有连线」 | [CP4-S5](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S6 画布分区与防火墙节点
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-032 | 页面操作 | 导入 gfw-home | 打开画布，滚轮缩放并拖动平移 | 自上而下四条背景带，标签「互联网」「边界」「运营商」「内网」；互联网带里一条竖虚线，左「国内」右「境外」；缩放平移时带跟着一起变换 | [CP4-S6](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-033 | 页面操作 | 接 T-CP4-032 | 查看互联网节点 | 目标分两栏，栏头「国内 4」「境外 6」；境外栏的 Google、YouTube、Telegram、ChatGPT 四行带锁标，GitHub 不带 | [CP4-S6](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-034 | 页面操作 | 接 T-CP4-032 | 从设备栏把「长城防火墙」拖到画布空白处 | 新节点红棕描边，第二行 `IP 3 · 域名 4 · 污染 3`，`inside` 柄在底边、`outside` 在顶边 | [CP4-S6](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-035 | 页面操作 | 接 T-CP4-034 | 删掉画布上原有的 gfw，把新的「长城防火墙」拖到 `wan – port1` 那根线上放下；再按 `Ctrl/Cmd + Z` 一次 | 原线消失，变成 `wan – inside`、`outside – port1` 两根线；撤销后回到拖入前 | [CP4-S6](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-036 | 页面操作 | 导入 gfw-home | 点工具栏「按分区排布」 | 四台设备分别落到互联网 / 边界 / 内网带里，运营商带留空；结果面板不出「拓扑已改动」横幅 | [CP4-S6](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-037 | 网页测试 | — | `nearestLinkAt(点, 连线几何)`：①点在某连线中点 ②点距任何连线 24px 以外 ③画布上没有连线 | ①返回该 linkId ②返回 `null` ③返回 `null` | [CP4-S6](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S7 防火墙表单与目标库编辑
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-038 | 页面操作 | 导入 gfw-home | 选中长城防火墙1 | 表单六个区块（启用 / IP 黑名单 / 域名黑名单 / DNS 污染 / HTTPS 握手域名拦截 / 协议识别等级）+「恢复默认规则」；协议识别等级默认 `standard`，下方一行灰字说明 | [CP4-S7](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-039 | 页面操作 | 接 T-CP4-038 | 关掉「启用」，再打开 | 关掉后下面区块置灰但内容还在，节点第二行变「已关闭」并转灰；打开后恢复 | [CP4-S7](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-040 | 页面操作 | 接 T-CP4-038 | IP 黑名单里加一行 `1.2.3` 后失焦；改成 `20.205.243.166` 再失焦 | 先红字「不是合法的 IP 地址」且不写入；改后写入，右侧显示 `github.com` | [CP4-S7](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-041 | 页面操作 | 接 T-CP4-038 | 把 DNS 污染的域名列表清空，然后验证 `chatgpt.com` | 输入框占位显示「留空则跟随域名黑名单」；验证失败原因由 SNI 拦截变成 DNS 污染 | [CP4-S7](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-042 | 页面操作 | 接 T-CP4-041 | 点「恢复默认规则」并确认；再按 `Ctrl/Cmd + Z` | 三个列表回到默认；撤销后回到改动前 | [CP4-S7](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-043 | 页面操作 | 导入 gfw-home，选中互联网 | 目标表里把 `github.com` 的区域改成「国内」；点「添加目标」填 `example.com` / `1.1.1.1` / 境外；点「恢复预设」 | 节点左栏变 5 条；验证弹窗的域名下拉里出现 `example.com`；「恢复预设」后回到 10 条 | [CP4-S7](checkpoints/CP4-zones-and-border.md) |  |

### CP4-S8 DNS 查询验证、文案与结果展示
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-044 | 网页测试 | — | `reasonLabel` 依次传 `GFW_IP_BLOCKED`、`GFW_SNI_BLOCKED`、`DNS_POISONED`、`'X'` | 依次得「IP 被封」「域名被拦」「DNS 被污染」「验证终止」 | [CP4-S8](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-045 | 网页测试 | — | `explain` 传 ①`basis.border.matched: 'poison'` 的 gfw decision ②`basis.border.enabled: false` 的 decision | ①title `边界抢答，返回污染地址 243.185.187.39`，lines 含 `边界：出境，目标区域 境外` 与命中的域名 ②title `防火墙已关闭，直接放行` | [CP4-S8](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-046 | 网页测试 | — | `explain` 传 `matched: 'sni'` 且 `verdict: 'stop'` 的 decision，其中一份同时带 `basis.mac` | title `域名被拦`，lines 首行等于 `decision.reason`；带 `basis.mac` 的那份仍走 border 模板 | [CP4-S8](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-047 | 页面操作 | 导入 gfw-home | 工具栏「验证」→ 类型选「DNS 查询」，起点 电脑1，域名 `www.google.com`，运行 | 类型多出「DNS 查询」，选它后只剩起点与域名两项；结果面板 DNS 块置顶：服务器 `192.168.1.1`、解析到 `243.185.187.39`（红字 +「已污染」）、真实 `142.250.72.14` | [CP4-S8](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-048 | 页面操作 | 导入 gfw-home | 选中电脑1，点验证块的「DNS 查询」按钮 | 按钮存在，跑的域名与旁边「打开网站」下拉当前选中的域名一致 | [CP4-S8](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-049 | 页面操作 | 导入 gfw-home | 访问 `www.google.com`，看逐跳列表与画布，点气泡「定位」 | 边界那两行 title 分别是「边界抢答，返回污染地址 243.185.187.39」与「DNS 被污染」；包停在长城防火墙1 变红，气泡标题「DNS 被污染」；「定位」跳到该设备的 DNS 污染区块 | [CP4-S8](checkpoints/CP4-zones-and-border.md) |  |

### 阶段完成标准
| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-CP4-050 | 页面操作 | 空画布 | 按 CP4『阶段完成标准』场景 1 的 8 步操作：拖入 电脑 / 路由器 / 长城防火墙 / 互联网，连 `eth0 – lan1`、`wan – inside`、`outside – port1`，电脑自动获取；点「按分区排布」；「打开网站」`www.google.com`；改开 `github.com`、`chatgpt.com`；目标框填 `142.250.72.14` 点 ping；点静态检查里的 L026 一条 | 四台设备各自落进内网 / 边界 / 互联网带；Google 失败，原因「域名 www.google.com 的解析结果 243.185.187.39 是边界返回的污染地址，连不上」，DNS 块显示 服务器 `192.168.1.1`、解析到 `243.185.187.39`（红字 +「已污染」）、真实 `142.250.72.14`，逐跳里两行 title 为「边界抢答，返回污染地址 243.185.187.39」与「DNS 被污染」；GitHub 通；ChatGPT 失败，原因「HTTPS 握手里的域名 chatgpt.com 在边界的域名黑名单里，连接被重置」；ping 失败，原因「目标地址 142.250.72.14（www.google.com）在边界的 IP 黑名单里，包被丢弃」；静态检查 4 条 L026 warning，点一条选中长城防火墙1 并高亮对应黑名单 | [CP4 阶段完成标准](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-051 | 页面操作 | 接场景 1（T-CP4-050） | 按 CP4『阶段完成标准』场景 2 的 5 步操作：选中长城防火墙1 关掉「启用」；再开 `www.google.com`；看逐跳列表与静态检查；把「启用」打开后重新验证 | 节点转灰、第二行「已关闭」；Google 通，DNS 块显示解析到 `142.250.72.14` 且无「已污染」标；逐跳里长城防火墙1 两行 title 都是「防火墙已关闭，直接放行」；L026 的 4 条 warning 消失；重新打开开关后回到场景 1 的失败结果 | [CP4 阶段完成标准](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-052 | 页面操作 | 接场景 2 末（T-CP4-051，防火墙已开） | 按 CP4『阶段完成标准』场景 3 的 5 步操作：电脑1 改手动 IP `192.168.1.10`、掩码 `255.255.255.0`、网关 `192.168.1.1`、DNS `8.8.8.8`；看静态检查并点 L025；「验证」类型「DNS 查询」域名 `www.google.com`；再「打开网站」`www.google.com`；DNS 改回 `192.168.1.1` 再做一次 DNS 查询 | L025 warning「DNS 服务器 8.8.8.8 在境外，明文查询会在边界被污染」，点它定位到电脑1 的 DNS 字段；DNS 查询结论「电脑1 解析 www.google.com → 243.185.187.39（被污染，真实 142.250.72.14）」，污染那跳在长城防火墙1，title「边界抢答，返回污染地址 243.185.187.39」；打开网站仍失败且原因仍是 DNS 被污染；改回 `192.168.1.1` 后结果同样是 `243.185.187.39`，但污染那跳落在互联网上，title「国内 DNS 向境外权威服务器递归时同样穿过边界，返回被污染的地址」 | [CP4 阶段完成标准](checkpoints/CP4-zones-and-border.md) |  |
| T-CP4-053 | 命令 | — | 按 CP4『阶段完成标准』「引擎与网页自动测试」操作：`pnpm test` | 引擎、网页两个包都通过；`scenarios/cp4.test.ts` 含三个场景的断言；`apps/web/src/trace/explain.test.ts` 含 border 模板断言 | [CP4 阶段完成标准](checkpoints/CP4-zones-and-border.md) |  |

---

## 公开体验版（2026-09-05）

来源：[ROADMAP.md](../ROADMAP.md) 变更记录「公开体验版」。上线到 https://vnet.flyooo.uk 前的三项调整：首次打开的示例拓扑、新手引导弹窗、网站图标。

| 编号 | 方式 | 前提 | 操作 | 预期 | 来源 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| T-PUB-001 | 页面操作 | 清空浏览器数据 | 打开页面 | 画布有 互联网、路由器1、电脑1、电脑2 四个节点三根线，两台电脑显示已获取地址，拓扑名「示例网络」；引导弹窗自动出现 | 公开体验版 | ✅ 通过 |
| T-PUB-002 | 页面操作 | 弹窗打开 | 点「开始」；刷新；点「帮助」；按 Esc | 弹窗关；刷新不再弹；「帮助」再弹；Esc 关 | 公开体验版 | ✅ 通过 |
| T-PUB-003 | 页面操作 | 示例拓扑 | 点电脑1 → `ping 外网` | 「电脑1 → 8.8.8.8 通」，五跳动画正常 | 公开体验版 | ✅ 通过 |
| T-PUB-004 | 页面操作 | 示例拓扑 | 删一台电脑，刷新；点「示例」确认；Ctrl/Cmd+Z | 刷新后仍三个节点；「示例」后回到四个；撤销回到三个 | 公开体验版 | ✅ 通过 |
| T-PUB-005 | 页面操作 | 任意 | 「新建」，刷新 | 空画布，刷新仍为空 | 公开体验版 | ✅ 通过 |
| T-PUB-006 | 页面操作 | 任意 | 看标签页与控制台 | 有网站图标，无 favicon 404 | 公开体验版 | ✅ 通过 |
| T-PUB-007 | 网页测试 | — | `pnpm test` | 示例拓扑的 4 条单测通过：设备与连线数、MAC 不重复、两台电脑拿到 192.168.1.x 且 lint 为空、ping 8.8.8.8 通且五跳 | 公开体验版 | ✅ 通过 |
| T-PUB-008 | 命令 | 已登录 wrangler | `pnpm deploy`；curl 主域名、深层路径、favicon | 部署成功；`https://vnet.flyooo.uk/` 与 `/x/y` 均 200 text/html；`/favicon.svg` 200 | 公开体验版 | ✅ 通过 |
