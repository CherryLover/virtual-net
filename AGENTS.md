# Virtual Net 项目说明

## 基本信息

- 项目：virtual-net，浏览器中的虚拟配网沙盘，面向家庭、工作室和小公司的网络规划。
- 功能：拖放设备、连接端口、配置 IP、模拟网络连通性、查看逐跳动画及失败原因；支持框选、成组、撤销重做、隐私显示和图片分享。
- 网络验证在本地模拟，不连接或配置真实网络设备。网络图通过浏览器 IndexedDB 保存，支持 JSON 导入导出。
- 线上地址：https://vnet.flyooo.uk/ 。托管于 Cloudflare Workers 静态资源服务。
- 默认中文沟通；沿用现有界面、组件及代码风格，不混入无关改动。

## 环境与目录

- Node.js 22，版本参考 `.nvmrc`；pnpm 11，准确版本以根 `package.json` 的 `packageManager` 为准。
- pnpm 工作区：`apps/web/` 为 React + TypeScript + Vite 网页，使用 React Flow、Zustand；`packages/engine/` 为纯 TypeScript 模拟引擎。
- 依赖方向：网页引用引擎，引擎不依赖网页或浏览器界面。
- `apps/web/src/canvas/`：画布、设备节点、连线和动画。
- `apps/web/src/store/`：网络图、选择、撤销及播放状态；`privacy/`：IP 显示保护。
- `apps/web/src/panels/`、`toolbar/`：配置面板和顶部操作；`storage/`、`import/`、`export/`：保存与文件操作。
- `docs/checkpoints/`：分阶段需求与验收；`docs/design/`：设计约定；`docs/TEST-PLAN.md`：验证记录；`ROADMAP.md`：路线图。
- `scripts/`：真实浏览器检查脚本；构建输出为 `apps/web/dist/`。

## 启动与端口

**本项目唯一默认本地端口为 5180，访问地址固定为 http://127.0.0.1:5180/ 。**

```bash
pnpm install
pnpm dev
```

- 根目录 `pnpm dev` 转到网页包的启动命令，命令显式指定 `127.0.0.1:5180` 和 `--strictPort`；Vite 配置保持一致。
- 启动前检查 5180。如果已经是本项目的服务，直接复用，不另开服务。
- 如果被其他程序占用，先确认占用来源并报告，不擅自结束未知进程，不改用 5181、5173 或其他端口。
- 禁止通过额外 `--port` 参数绕过端口约定。端口占用时启动应失败，不能自动换号。
- 构建预览 `pnpm --filter @virtual-net/web preview` 同样使用 5180，不能和开发服务同时启动。
- 浏览器检查脚本默认访问 5180；本地验证时不要指定其他端口。

## 验证与提交

```bash
pnpm test       # 引擎和网页测试
pnpm lint       # 代码和格式检查
pnpm typecheck  # 类型检查
pnpm build      # 类型检查并构建网页
```

- 界面改动需要真实打开页面操作，检查桌面和手机布局，不以构建成功代替交互验证。
- 框选与分组回归：`scripts/selection-smoke.mjs`；快捷键与隐私回归：`scripts/shortcuts-privacy-smoke.mjs`。通过 `PLAYWRIGHT_MODULE` 指定已安装的 Playwright 模块，使用本地 Chrome。
- 空格临时平移；Command/Ctrl + G 成组，Command/Ctrl + Shift + G 拆组。输入与弹窗不能误触发画布操作。
- 隐私开关只改变显示，不改真实配置；原始 JSON 文件仍含真实 IP，不能视作已脱敏的分享文件。
- 提交前检查变更范围，保留已有未提交改动，只提交本任务内容；不要擅自推送或发布线上。
- 仅用户明确要求部署时运行 `pnpm run deploy`。GitHub Actions 负责检查，不负责部署。
