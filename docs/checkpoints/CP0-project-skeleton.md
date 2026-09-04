# CP0 项目骨架

> 总纲对应章节：[ROADMAP.md](../../ROADMAP.md) 的「CP0 项目骨架」
> 前置：无
> 状态：已完成（2026-09-04，commit 77c177f，仓库 https://github.com/CherryLover/virtual-net）

## 目标

把地基打好。装完依赖后，`pnpm dev` 打开网页能看到顶部工具栏加三栏布局：左侧设备栏、中间画布、右侧面板，四块都已就位但内容为空；`pnpm test` 能跑通引擎里的一条占位测试。CP1 起所有功能都往这个骨架里填，不再动结构。

## 范围

### 做
- pnpm workspace，两个包：`packages/engine`（纯逻辑）和 `apps/web`（网页）
- 引擎：TypeScript + vitest，一条占位测试
- 网页：React + Vite + React Flow + Zustand，顶部工具栏 + 三栏布局与空画布
- 统一的 TypeScript、代码检查、格式化配置
- Node / pnpm 版本锁定、`.gitignore`、README 的启动与测试说明
- 为 CP1–CP3 预留目录

### 不做
- 任何设备、节点、连线、拖拽、配置表单
- Zustand store 的具体状态、IndexedDB / JSON 存取（只留目录）
- UI 组件库、Tailwind、暗色模式、移动端适配
- 部署配置（Cloudflare Pages）、CI、git hooks
- 网页侧自动测试

## 关键设计

### 1. 目录结构（CP0 完成时）

```
virtual-net/
  package.json            根包 virtual-net，只放统一脚本和 Biome
  pnpm-workspace.yaml     包位置 + catalog
  tsconfig.base.json      所有包继承的 TS 基础配置
  biome.json              检查与格式化规则
  .nvmrc  .npmrc  .gitignore
  README.md  ROADMAP.md  CLAUDE.md
  docs/checkpoints/  docs/design/
  packages/engine/
    package.json  tsconfig.json
    src/
      index.ts            唯一公开出口，web 只从这里 import
      index.test.ts       占位测试
      model/index.ts      数据模型：设备、端口、连线、IP 配置、拓扑（CP1 填）
      engine/index.ts     模拟：ARP、转发、路由、NAT、DHCP、决策记录、probe 入口（CP1 填）
      lint/index.ts       静态检查（CP1 填）
      serialization/index.ts  拓扑 JSON 的结构、校验、版本迁移（CP1 填）
  apps/web/
    package.json  tsconfig.json  vite.config.ts  index.html
    src/
      main.tsx            挂载入口
      app/App.tsx         组装三栏，包 ReactFlowProvider
      app/AppShell.tsx    顶部工具栏 + 三栏栅格
      app/app.css         全局样式与布局尺寸变量
      canvas/Canvas.tsx   React Flow 容器（CP0 空；CP1 节点连线，CP3 动画）
      toolbar/Toolbar.tsx 顶部工具栏（CP0 只显示项目名；CP1 新建、导入、导出、验证）
      panels/DeviceBar.tsx   左侧设备栏（CP0 只有标题；CP1 设备列表）
      panels/SidePanel.tsx   右侧面板（CP0 空；CP1 配置面板与结果面板）
      store/index.ts      Zustand（CP1 建 store：拓扑、选中项、验证结果）
      storage/index.ts    IndexedDB 自动保存、JSON 导入导出（CP1 填）
```

预留目录先只放一个 `index.ts`，内容是一行注释说明用途，不导出任何东西。

### 2. 包、脚本与依赖

包名：根 `virtual-net`（private），引擎 `@virtual-net/engine`，网页 `@virtual-net/web`。三个包都 `"type": "module"`、`"private": true`。

`pnpm-workspace.yaml`：

```yaml
packages:
  - packages/*
  - apps/*
catalog:
  typescript: ^7.0.2
```

根 `package.json` 统一脚本：

| 脚本 | 内容 | 说明 |
| --- | --- | --- |
| `dev` | `pnpm --filter @virtual-net/web dev` | 启动网页 |
| `test` | `pnpm -r test` | 跑所有有 `test` 脚本的包，目前只有引擎 |
| `typecheck` | `pnpm -r typecheck` | 每个包各自 `tsc --noEmit` |
| `lint` | `biome check .` | 检查 + 格式校验，不改文件 |
| `lint:fix` | `biome check --write .` | 自动修可修的问题 |
| `format` | `biome format --write .` | 只格式化 |
| `build` | `pnpm typecheck && pnpm --filter @virtual-net/web build` | 产出 `apps/web/dist` |

`packages/engine/package.json` 要点：`exports` 的 `"."` 指向 `./src/index.ts`（源码直引，不需要构建）；`dependencies` 为空；devDependencies 只有 `typescript`（`catalog:`）和 `vitest`；脚本 `test: vitest run`、`test:watch: vitest`、`typecheck: tsc --noEmit`。

`apps/web/package.json` 要点：`dependencies` 有 `react`、`react-dom`、`@xyflow/react`、`zustand`、`@virtual-net/engine`（`workspace:*`）；devDependencies 有 `vite`、`@vitejs/plugin-react`、`@types/react`、`@types/react-dom`、`typescript`（`catalog:`）；脚本 `dev: vite`、`build: vite build`、`preview: vite preview`、`typecheck: tsc --noEmit`。

依赖大版本（2026-09-04 npm 最新）：

| 依赖 | 大版本 | 放在 |
| --- | --- | --- |
| Node | 22 LTS | `.nvmrc` / `engines` |
| pnpm | 11 | 根 `packageManager` |
| typescript | 7 | catalog，两个包 |
| vitest | 5 | engine |
| react / react-dom / @types/react* | 19 | web |
| vite / @vitejs/plugin-react | 8 / 6 | web |
| @xyflow/react | 12 | web |
| zustand | 5 | web |
| @biomejs/biome | 2 | 根 |

### 3. TypeScript

根 `tsconfig.base.json` 只放 `compilerOptions`，不含 `include`：`strict`、`noUncheckedIndexedAccess`、`noFallthroughCasesInSwitch`、`noImplicitOverride`、`verbatimModuleSyntax`、`isolatedModules`、`skipLibCheck`、`noEmit`，`target: ES2022`，`module: ESNext`，`moduleResolution: bundler`。

各包 `tsconfig.json` 只写 `extends: "../../tsconfig.base.json"`、`include: ["src"]` 和差异项：

- engine：`lib: ["ES2022"]`，`types: []`。没有 DOM、没有 Node 类型，写 `document`、`window`、`process` 直接编不过。测试文件显式 `import { describe, it, expect } from 'vitest'`，不用全局
- web：`lib: ["ES2022", "DOM", "DOM.Iterable"]`，`jsx: react-jsx`，`types: ["vite/client"]`，`include` 加上 `vite.config.ts`

typescript 版本通过 catalog 统一，两个包都写 `"typescript": "catalog:"`。

### 4. 引擎与网页的边界

- web 只从 `@virtual-net/engine` 包根 import，不允许 `@virtual-net/engine/src/...` 深层路径
- engine 的 `dependencies` 保持为空。tsconfig 挡住浏览器 API，Biome 的 `noRestrictedImports` 在 `packages/engine/**` 上禁止 `react`、`react-dom`、`@xyflow/react`、`zustand`
- CP0 引擎唯一导出：`ENGINE_VERSION`（字符串 `'0.0.0'`，与 engine 的 `package.json` 版本一致）。web 在右侧面板底部显示 `引擎 0.0.0`，用它证明 workspace 引用、TS 解析、Vite 打包三条链全通
- 占位测试 `src/index.test.ts`：断言 `ENGINE_VERSION` 匹配 `^\d+\.\d+\.\d+$`。CP1 加真测试后可以删

### 5. 代码检查与格式化：Biome

选 Biome，不选 ESLint + Prettier。理由：一个依赖、一个配置文件、一条命令同时做检查和格式化；项目从零开始没有历史 ESLint 配置要迁移；速度快到可以每次提交前全量跑。不足是没有类型感知的检查，由 `pnpm typecheck` 补。

根 `biome.json` 要点：

- `files.includes` 排除 `node_modules`、`dist`、`pnpm-lock.yaml`
- formatter：2 空格缩进，行宽 100，其余用默认（双引号、分号、尾逗号）
- linter：`recommended` 开；`domains.react: "recommended"`（hooks 依赖、hook 位置等 React 规则）；额外设为 error：`noUnusedImports`、`noUnusedVariables`、`noExplicitAny`、`useImportType`
- `overrides`：对 `packages/engine/**` 启用 `noRestrictedImports`，名单见第 4 节
- `organizeImports` 开，import 顺序交给工具

### 6. 顶部工具栏、三栏布局与空画布

- `AppShell`：CSS grid，两行三列。第一行是顶部工具栏，横跨三列，高度 `auto`；第二行列宽 `240px 1fr 320px`，占满剩余高度。`html/body/#root` 高度 100% 且无外边距，页面本身不出滚动条。宽度写成 CSS 变量 `--devicebar-w`、`--sidepanel-w`，放 `app.css`
- `Toolbar`：只显示项目名 `virtual-net`，右端留空（CP1 放保存状态）
- `DeviceBar`：只有标题「设备」
- `Canvas`：`<ReactFlow nodes={[]} edges={[]}>` 加 `<Background>`（点阵）和 `<Controls>`（缩放按钮）。父容器必须有明确高度，否则 React Flow 渲染成 0 高，这是最常见的坑。引入 `@xyflow/react/dist/style.css`
- `SidePanel`：空，底部一行小字 `引擎 0.0.0`
- `App`：用 `ReactFlowProvider` 包住整个 `AppShell`。CP1 从设备栏拖入画布要在画布外调用 React Flow 的坐标换算，Provider 必须在三栏共同的祖先上
- 样式用普通 CSS 文件，不引组件库。`index.html` 标题 `virtual-net`，`lang="zh-CN"`，`React.StrictMode` 开

### 7. 版本锁定、.gitignore、README

- Node：`.nvmrc` 写 `22`；根 `engines.node` 写 `>=22`；`.npmrc` 写 `engine-strict=true`，版本不对时 `pnpm install` 直接失败
- pnpm：根 `packageManager` 写精确版本 `pnpm@11.x.y`。pnpm 10+ 默认会按这个字段自动切版本；Node 22 自带的 corepack 也认它
- `.gitignore`：`node_modules/`、`dist/`、`coverage/`、`.vite/`、`*.local`、`*.log`、`.DS_Store`、`.idea/`、`.vscode/*` 但保留 `.vscode/extensions.json`
- README 保留现有开头，把「代码骨架尚未建立」一行换成：环境要求（Node 22、pnpm 11 及安装方式）、`pnpm install`、`pnpm dev`、`pnpm test`、`pnpm lint` / `pnpm format` / `pnpm typecheck`、`pnpm build`、目录结构一句话、链接到 ROADMAP 与 `docs/`

## 步骤

### CP0-S1 仓库与 workspace 初始化
- **做什么**：建 git 仓库和 pnpm workspace 骨架，锁定 Node / pnpm 版本。
- **怎么做**：
  - `git init`；写 `.gitignore`（第 7 节清单）
  - 安装 pnpm 11（`corepack enable` 或 `npm i -g pnpm`）
  - 根 `package.json`：`name`、`private`、`packageManager`、`engines`，脚本先留空，S6 补
  - `pnpm-workspace.yaml`（第 2 节）、`.nvmrc`、`.npmrc`、`tsconfig.base.json`（第 3 节）
  - 建空目录 `packages/`、`apps/`
  - 若 `pnpm install` 提示有依赖的构建脚本被忽略，在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 里放行需要的包
- **产出物**：`.git/`、`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.nvmrc`、`.npmrc`、`.gitignore`、`pnpm-lock.yaml`
- **验收标准**：
  - 【命令】`node -v` → `v22.x`；`pnpm -v` → 与 `packageManager` 一致
  - 【命令】`pnpm install` → 成功，生成 `pnpm-lock.yaml`
  - 【命令】切到 Node 20（如 `nvm use 20`）再 `pnpm install` → 报错提示不满足 `engines.node`，切回 22 后正常
  - 【命令】`git status` → 不出现 `node_modules/`
- **测试用例**：[T-CP0-001](../TEST-PLAN.md) – [T-CP0-004](../TEST-PLAN.md)

### CP0-S2 引擎包与占位测试
- **做什么**：建 `packages/engine`，vitest 跑通一条占位测试，预留四个目录。
- **怎么做**：
  - `package.json`、`tsconfig.json` 按第 2、3 节
  - `src/index.ts` 导出 `ENGINE_VERSION`；`src/index.test.ts` 按第 4 节
  - 建 `model/`、`engine/`、`lint/`、`serialization/` 各放一个注释用途的 `index.ts`
  - 不加 `vitest.config.ts`，用默认（测试文件匹配 `*.test.ts`）
- **产出物**：`packages/engine/` 全部文件
- **验收标准**：
  - 【引擎测试】`pnpm --filter @virtual-net/engine test` → 输出 `Test Files 1 passed`、`Tests 1 passed`，退出码 0
  - 【命令】`pnpm --filter @virtual-net/engine typecheck` → 无输出，退出码 0
  - 【命令】临时在 `src/index.ts` 加一行 `document.title = 'x'` 再 typecheck → 报 `Cannot find name 'document'`；删掉后通过
  - 【命令】`ls packages/engine/src` → 看到 `model engine lint serialization index.ts index.test.ts`
- **测试用例**：[T-CP0-005](../TEST-PLAN.md) – [T-CP0-008](../TEST-PLAN.md)

### CP0-S3 网页包脚手架与引擎引用
- **做什么**：建 `apps/web`，Vite 起得来，能 import 引擎。
- **怎么做**：
  - `package.json`、`tsconfig.json` 按第 2、3 节；`vite.config.ts` 只挂 `@vitejs/plugin-react`
  - `index.html`、`src/main.tsx`、`src/app/App.tsx`（此时只渲染一个空 `div`）
  - `App.tsx` 里 `import { ENGINE_VERSION } from '@virtual-net/engine'` 并用上，证明引用可用
  - 建 `canvas/`、`panels/`、`toolbar/`、`store/`、`storage/` 目录及注释用途的 `index.ts`
- **产出物**：`apps/web/` 全部文件
- **验收标准**：
  - 【命令】`pnpm --filter @virtual-net/web dev` → 终端打印 `Local: http://localhost:5173/`
  - 【页面操作】打开该地址 → 空白页，标签标题 `virtual-net`，控制台无报错
  - 【命令】`pnpm --filter @virtual-net/web typecheck` → 退出码 0
  - 【命令】把 import 改成 `@virtual-net/engine/src/index` 再 typecheck → 报模块找不到；改回后通过
- **测试用例**：[T-CP0-009](../TEST-PLAN.md) – [T-CP0-012](../TEST-PLAN.md)

### CP0-S4 三栏布局与空画布
- **做什么**：页面出现左侧设备栏、中间画布、右侧面板三块，画布是空的 React Flow。
- **怎么做**：
  - 按第 6 节建 `AppShell`、`Toolbar`、`DeviceBar`、`Canvas`、`SidePanel`，`App` 里用 `ReactFlowProvider` 包住
  - `app.css` 放布局变量、全局高度、三栏边框
  - `SidePanel` 底部显示 `引擎 {ENGINE_VERSION}`
- **产出物**：`src/app/*`、`src/toolbar/Toolbar.tsx`、`src/canvas/Canvas.tsx`、`src/panels/DeviceBar.tsx`、`src/panels/SidePanel.tsx`
- **验收标准**：
  - 【页面操作】`pnpm dev` 打开页面 → 顶部一条工具栏显示 `virtual-net`，下方左中右三栏，左栏顶部显示「设备」，右栏底部显示 `引擎 0.0.0`，中间是点阵背景和左下角缩放按钮，画布上没有任何节点
  - 【页面操作】在画布上滚轮 → 点阵缩放；按住拖动 → 点阵平移；点缩放按钮 → 有响应
  - 【页面操作】把浏览器窗口拉宽拉窄 → 工具栏横跨全宽，左右两栏宽度不变，中间随窗口伸缩；页面没有整体滚动条
  - 【页面操作】刷新页面 → 控制台无报错和 React 警告
- **测试用例**：[T-CP0-013](../TEST-PLAN.md) – [T-CP0-016](../TEST-PLAN.md)

### CP0-S5 代码检查与格式化
- **做什么**：装 Biome，一条命令检查全仓库，一条命令格式化。
- **怎么做**：
  - 根 devDependencies 加 `@biomejs/biome`；`biome.json` 按第 5 节
  - 对已有文件跑一次 `biome check --write .`，让基线干净
  - 加 `.vscode/extensions.json` 推荐 `biomejs.biome`
- **产出物**：`biome.json`、`.vscode/extensions.json`、根 `package.json` 的 devDependencies
- **验收标准**：
  - 【命令】`pnpm exec biome check .` → 输出 `Checked N files`，无 error / warning，退出码 0
  - 【命令】把任一 `.ts` 文件改成 4 空格缩进再 check → 非零退出，提示 format 差异；跑 `biome format --write .` 后恢复通过
  - 【命令】在 `apps/web/src/main.tsx` 加一行未使用的 import 再 check → 报 `noUnusedImports`
  - 【命令】在 `packages/engine/src/index.ts` 加 `import 'react'` 再 check → 报 `noRestrictedImports`；在 web 里同样 import 不报
- **测试用例**：[T-CP0-017](../TEST-PLAN.md) – [T-CP0-020](../TEST-PLAN.md)

### CP0-S6 根脚本、README 与整体验收
- **做什么**：补齐根统一脚本，README 写清启动与测试，从零克隆走一遍。
- **怎么做**：
  - 根 `package.json` 脚本按第 2 节表格
  - README 按第 7 节
  - 首次提交
- **产出物**：根 `package.json`、`README.md`、第一个 commit
- **验收标准**：
  - 【命令】根目录依次 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` → 全部退出码 0；`apps/web/dist/index.html` 存在
  - 【命令】`pnpm dev` → 打印本地地址，页面同 CP0-S4
  - 【命令】把仓库克隆到临时目录，只看 README 操作：`pnpm install` → `pnpm dev` → `pnpm test` → 三步都成功，不需要看其他文档
  - 【命令】`git status` → 工作区干净
- **测试用例**：[T-CP0-021](../TEST-PLAN.md) – [T-CP0-024](../TEST-PLAN.md)

## 阶段完成标准

测试用例：[T-CP0-025](../TEST-PLAN.md) – [T-CP0-027](../TEST-PLAN.md)

对应总纲 CP0 的三条完成标准，按下面操作全部通过才能打勾。

1. **`pnpm dev` 打开浏览器看到空画布**
   - 在全新克隆的目录里 `nvm use`（读 `.nvmrc`），`pnpm install`
   - `pnpm dev`，在浏览器打开终端打印的地址
   - 看到：顶部工具栏 `virtual-net`、左栏「设备」、中间点阵画布与缩放按钮、右栏空且底部 `引擎 0.0.0`；画布无节点；控制台无报错
   - 滚轮缩放、拖动平移有效；改窗口宽度中间栏伸缩、无页面滚动条
2. **`pnpm test` 通过**
   - 根目录 `pnpm test` → `1 passed`，退出码 0
   - 顺带 `pnpm lint`、`pnpm typecheck` 也退出码 0
3. **目录结构与总纲一致**
   - `ls` 根目录 → 只有 `ROADMAP.md`、`README.md`、`CLAUDE.md`、`docs/`、`packages/`、`apps/` 和第 1 节列出的配置文件，没有多余顶层目录
   - `ls packages apps` → 各只有 `engine`、`web`
   - `packages/engine/src` 与 `apps/web/src` 的子目录与第 1 节逐一对得上

## 实施记录（2026-09-04）

27 条用例全部通过，独立复验：`pnpm lint / typecheck / test / build` 全绿，页面三栏加工具栏正常，刷新后控制台无报错。与文档的偏差：

- `pnpm-workspace.yaml` 加了 `engineStrict: true`。pnpm 11 不再认 `.npmrc` 的 `engine-strict`，只有写在这里 `engines.node` 才会真的拦截安装。`.npmrc` 按文档保留
- `pnpm-workspace.yaml` 加了 `minimumReleaseAgeExclude` 名单。pnpm 11 默认拒绝发布不足 24 小时的包，biome 2.5.12、vitest 5.0.0、@types/react-dom 19.2.7 当天都在窗口内。这段是临时的，下次动依赖时删掉
- `@types/react-dom` 是 19.2.7（npm 最新），其余版本与文档一致；TypeScript 7 全链路无兼容问题
- `canvas/`、`panels/`、`toolbar/` 没保留占位 `index.ts`，S4 后已有真实组件
- 两个 CSS 文件的引入放在 `main.tsx` 最前面而不是 `Canvas.tsx`，否则 React Flow 首次测量容器为 0 高会报警告
- `biome.json` 按 Biome 2.5 的写法（`linter.rules.preset`、`files.includes` 排除项不带 `/**`），规则内容不变
- Vite 首次启动时会因为发现新依赖自动重载一次，重载前控制台可能闪几条 React 报错，属一次性现象

## 对其他检查点的约定

- **包名与位置**：`@virtual-net/engine`、`@virtual-net/web`。新库放 `packages/`，新的可运行应用放 `apps/`
- **引用方向**：web → engine 单向，只从包根 import。engine 不 import web、React、Zustand、React Flow，`dependencies` 保持为空；要加运行时依赖必须在对应检查点文档「关键设计」里写理由
- **引擎目录归属**：数据结构进 `model/`，模拟与 probe 进 `engine/`，静态检查进 `lint/`，拓扑 JSON 的结构与迁移进 `serialization/`。IndexedDB 和文件读写属于 web 的 `storage/`，引擎只管 JSON 长什么样
- **网页目录归属**：画布相关进 `canvas/`，设备栏、配置面板、结果面板进 `panels/`，顶部工具栏及其弹窗进 `toolbar/`，Zustand 进 `store/`，持久化进 `storage/`
- **组件名**：四块固定叫 `Toolbar`、`DeviceBar`、`Canvas`、`SidePanel`，`ReactFlowProvider` 始终在 `App` 层
- **脚本名**：`dev`、`test`、`typecheck`、`lint`、`lint:fix`、`format`、`build`。新包必须有 `typecheck`，有测试就叫 `test`
- **测试文件**：单元测试 `*.test.ts` 与源码同目录；总纲的验收场景测试放 `packages/engine/src/scenarios/`（CP1 建），文件名带检查点编号，测试名带 `T-CPx-nnn` 编号
- **版本管理**：新的共享依赖走 `catalog:`；升 Node 大版本同时改 `.nvmrc` 与 `engines`
- **提交门槛**：`pnpm lint && pnpm typecheck && pnpm test` 全绿再提交
- **文案**：界面中文、极简，只说做什么；错误提示例外

## 待定问题

1. **TypeScript 7 还是 6**（✅ 已定 2026-09-04：用 7）。7.0 刚发布（Go 原生实现）。建议直接用 7：这里 `tsc` 只做类型检查，转译由 Vite / Vitest 负责，风险小；若任一工具链报不兼容，catalog 改成 `^6` 一处生效
2. **远端仓库**（✅ 已定 2026-09-04：S6 首次提交后建私有库 CherryLover/virtual-net 并推送）。是否 CP0 完成时就建 GitHub 仓库并推送、公开还是私有。建议私有起步，S6 首次提交后推送
3. **样式方案**（✅ 已定 2026-09-04：CP0 不引入任何库，CP1 开工前定）。CP1 配置面板表单量大，纯 CSS 可能吃力。建议 CP0 不引入任何库，CP1 文档里在「继续手写 CSS / Tailwind / Radix 类组件库」中定
4. **网页侧自动测试**（✅ 已定 2026-09-04：CP0 不加，CP3 引入）。目前只有引擎有 vitest。建议 CP0 不加；CP1 若面板逻辑复杂再加 `@testing-library/react`
5. **部署**。总纲选型有 Cloudflare Pages，CP0 只保证 `pnpm build` 产出 `apps/web/dist`。建议 CP1 完成后单独接，不算进任何检查点的完成标准
6. **git hooks**。是否用 lefthook 之类在提交前自动跑 lint。建议 CP0 不加，靠「提交门槛」约定；两个人以上协作时再加
7. **测试表尚未建立**（✅ 已建并回填 2026-09-04）。`docs/TEST-PLAN.md` 不存在，本文件六个步骤的「测试用例」无法回填。建议本文档定稿后立即建测试表，分配 `T-CP0-001` 起的编号

## 关联文档

- 上一个检查点：无
- 下一个检查点：[CP1-lan-basics.md](CP1-lan-basics.md)（待写）
- 测试表：[../TEST-PLAN.md](../TEST-PLAN.md)
- 文档规范：[README.md](README.md)
